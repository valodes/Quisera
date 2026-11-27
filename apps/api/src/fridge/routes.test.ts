// @vitest-environment node
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiHonoEnvironment } from '../app.js'
import { createAuth } from '../auth.js'
import { openDatabase } from '../db/connection.js'
import { recipe, recipeFavorite, recipeIngredient } from '../db/schema.js'
import type { ExternalCatalogItem } from '../recipes/catalog-search.js'
import { createFridgeRoutes } from './routes.js'

const testEnvironment = {
  NODE_ENV: 'test' as const,
  APP_URL: 'http://localhost:3131',
  TRUSTED_ORIGINS: ['http://localhost:3131'],
  BETTER_AUTH_SECRET: 'local-isolated-test-secret-with-at-least-32-bytes',
  SQLITE_PATH: ':memory:',
  RECIPE_UPLOAD_DIR: '../../data/recipe-photos',
  API_HOST: '127.0.0.1',
  API_PORT: 3000,
}

describe('fridge routes', () => {
  let connection: ReturnType<typeof openDatabase>
  let auth: ReturnType<typeof createAuth>
  let app: Hono<ApiHonoEnvironment>
  let ownerCookie: string
  let memberUserId: string
  let mockSuggestOff: ReturnType<typeof vi.fn<(q: string) => Promise<string[]>>>
  let mockSearchCatalog: ReturnType<
    typeof vi.fn<(query: string) => Promise<{ items: ExternalCatalogItem[]; sources: [] }>>
  >

  beforeEach(async () => {
    connection = openDatabase(':memory:')
    migrate(connection.client, {
      migrationsFolder: new URL('../../drizzle', import.meta.url).pathname,
    })
    auth = createAuth(testEnvironment, connection.client)

    await auth.api.createUser({
      body: {
        email: 'owner@quisera.invalid',
        name: 'Valentin',
        password: 'fridge-password-1234',
        role: 'admin',
      },
    })
    const secondUser = await auth.api.createUser({
      body: {
        email: 'partner@quisera.invalid',
        name: 'Camille',
        password: 'fridge-password-1234',
        role: 'user',
      },
    })
    memberUserId = secondUser.user.id

    mockSuggestOff = vi.fn(async (q: string) =>
      q.includes('tom') ? ['tomate cerise', 'tomate concassée'] : [],
    )
    mockSearchCatalog = vi.fn(async (query: string) => {
      const normalized = query.toLowerCase()
      if (normalized === 'tomate citron kiwi') {
        return {
          items: [
            {
              source: 'marmiton',
              sourceLabel: 'Marmiton',
              title: 'Salade tomate citron kiwi',
              url: 'https://marmiton.org/r/trio',
              imageUrl: null,
            },
          ],
          sources: [],
        }
      }
      if (normalized === 'tomate kiwi') {
        return {
          items: [
            {
              source: '750g',
              sourceLabel: '750g',
              title: 'Salade tomate kiwi',
              url: 'https://750g.com/r/pair',
              imageUrl: null,
            },
            {
              source: 'marmiton',
              sourceLabel: 'Marmiton',
              title: 'Salade tomate citron kiwi',
              url: 'https://marmiton.org/r/trio',
              imageUrl: null,
            },
          ],
          sources: [],
        }
      }
      return {
        items: [
          {
            source: 'jow',
            sourceLabel: 'Jow',
            title: `Recette ${query}`,
            url: `https://jow.fr/r/${encodeURIComponent(normalized)}`,
            imageUrl: null,
          },
        ],
        sources: [],
      }
    })

    app = new Hono<ApiHonoEnvironment>()
    app.all('/api/auth/*', (c) => auth.handler(c.req.raw))
    app.route(
      '/api/fridge',
      createFridgeRoutes(connection.client, auth, {
        fetchOffSuggestions: mockSuggestOff,
        searchCatalog: mockSearchCatalog,
      }),
    )

    const signInRes = await app.request('http://localhost:3131/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3131' },
      body: JSON.stringify({
        email: 'owner@quisera.invalid',
        password: 'fridge-password-1234',
      }),
    })
    expect(signInRes.status).toBe(200)
    ownerCookie = signInRes.headers
      .getSetCookie()
      .map((entry) => entry.split(';', 1)[0])
      .join('; ')
  })

  afterEach(() => {
    connection.sqlite.close()
  })

  it('requires authentication and handles CRUD with smart duplicate merging', async () => {
    expect((await app.request('http://localhost:3131/api/fridge')).status).toBe(401)

    const first = await app.request('http://localhost:3131/api/fridge', {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ input: '2 tomates', zone: 'fridge' }),
    })
    expect(first.status).toBe(201)
    const firstBody = (await first.json()) as {
      item: { id: string; name: string; quantity: string | null; unit: string | null }
      merged: boolean
    }
    expect(firstBody.item).toMatchObject({ name: 'Tomates', quantity: '2', unit: null })
    expect(firstBody.merged).toBe(false)

    // Smart merge: same normalized name, same zone, compatible unit (null), same expiry (null)
    const second = await app.request('http://localhost:3131/api/fridge', {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ input: '3 tomates', zone: 'fridge' }),
    })
    expect(second.status).toBe(200)
    const secondBody = (await second.json()) as {
      item: { id: string; quantity: string | null }
      merged: boolean
    }
    expect(secondBody.merged).toBe(true)
    expect(secondBody.item.id).toBe(firstBody.item.id)
    expect(secondBody.item.quantity).toBe('5')

    // Incompatible unit creates a separate row
    const third = await app.request('http://localhost:3131/api/fridge', {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ input: '250g de tomates', zone: 'fridge' }),
    })
    expect(third.status).toBe(201)

    // Update & delete
    const patch = await app.request(`http://localhost:3131/api/fridge/${firstBody.item.id}`, {
      method: 'PATCH',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ quantity: '4', expiresOn: '2026-11-29', zone: 'pantry' }),
    })
    expect(patch.status).toBe(200)
    expect(
      ((await patch.json()) as { item: { zone: string; expiresOn: string } }).item,
    ).toMatchObject({ zone: 'pantry', expiresOn: '2026-11-29' })

    const del = await app.request(`http://localhost:3131/api/fridge/${firstBody.item.id}`, {
      method: 'DELETE',
      headers: { cookie: ownerCookie },
    })
    expect(del.status).toBe(204)

    const list = await app.request('http://localhost:3131/api/fridge', {
      headers: { cookie: ownerCookie },
    })
    expect(((await list.json()) as { items: unknown[] }).items).toHaveLength(1)
  })

  it('merges local recipe ingredients and OpenFoodFacts suggestions with graceful fallback', async () => {
    const now = new Date()
    connection.client
      .insert(recipe)
      .values({ id: 'r1', source: 'house', title: 'Salade', createdAt: now, updatedAt: now })
      .run()
    connection.client
      .insert(recipeIngredient)
      .values({ id: 'ri1', recipeId: 'r1', position: 0, name: 'Tomates anciennes' })
      .run()

    const okRes = await app.request('http://localhost:3131/api/fridge/suggest?q=tom', {
      headers: { cookie: ownerCookie },
    })
    expect(okRes.status).toBe(200)
    const okBody = (await okRes.json()) as { suggestions: string[] }
    expect(okBody.suggestions).toContain('Tomates anciennes')
    expect(okBody.suggestions).toContain('Tomate cerise')

    // OFF failure still returns local suggestions cleanly
    mockSuggestOff.mockRejectedValueOnce(new Error('OFF timeout'))
    const fallbackRes = await app.request('http://localhost:3131/api/fridge/suggest?q=tomat', {
      headers: { cookie: ownerCookie },
    })
    expect(fallbackRes.status).toBe(200)
    expect(((await fallbackRes.json()) as { suggestions: string[] }).suggestions).toContain(
      'Tomates anciennes',
    )
  })

  it('matches house recipes and household-favorited Quitoque recipes only', async () => {
    const now = new Date()
    connection.client
      .insert(recipe)
      .values([
        {
          id: 'r-house',
          source: 'house',
          title: 'Omelette tomate',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'r-qt-fav',
          source: 'quitoque',
          title: 'Quitoque fav',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'r-qt-unfav',
          source: 'quitoque',
          title: 'Quitoque non fav',
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run()
    connection.client
      .insert(recipeIngredient)
      .values([
        { id: 'i1', recipeId: 'r-house', position: 0, name: 'Tomates' },
        { id: 'i2', recipeId: 'r-qt-fav', position: 0, name: 'Tomates' },
        { id: 'i3', recipeId: 'r-qt-unfav', position: 0, name: 'Tomates' },
      ])
      .run()
    // Favorited by partner (other household member)
    connection.client
      .insert(recipeFavorite)
      .values({ userId: memberUserId, recipeId: 'r-qt-fav', createdAt: now })
      .run()

    await app.request('http://localhost:3131/api/fridge', {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ input: '3 tomates', zone: 'fridge' }),
    })

    const matchRes = await app.request('http://localhost:3131/api/fridge/matches', {
      headers: { cookie: ownerCookie },
    })
    expect(matchRes.status).toBe(200)
    const matchBody = (await matchRes.json()) as {
      matches: Array<{ recipeId: string; bucket: string }>
    }
    const ids = matchBody.matches.map((m) => m.recipeId)
    expect(ids).toContain('r-house')
    expect(ids).toContain('r-qt-fav')
    expect(ids).not.toContain('r-qt-unfav')
  })

  it('runs combinatorial web discovery up to 3 items and deduplicates by URL', async () => {
    const add = async (input: string) => {
      const res = await app.request('http://localhost:3131/api/fridge', {
        method: 'POST',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ input, zone: 'fridge' }),
      })
      return ((await res.json()) as { item: { id: string } }).item.id
    }
    const id1 = await add('3 tomates')
    const id2 = await add('5 citrons')
    const id3 = await add('2 kiwis')

    const discoverRes = await app.request(
      `http://localhost:3131/api/fridge/discover?itemIds=${id1},${id2},${id3}`,
      { headers: { cookie: ownerCookie } },
    )
    expect(discoverRes.status).toBe(200)
    const body = (await discoverRes.json()) as {
      items: Array<{ url: string; matchedIngredients: string[] }>
      queriesRun: number
    }
    expect(body.queriesRun).toBe(7)
    expect(body.items[0]?.url).toBe('https://marmiton.org/r/trio')
    expect(body.items[0]?.matchedIngredients).toHaveLength(3)
    const urls = body.items.map((item) => item.url)
    expect(new Set(urls).size).toBe(urls.length)
  })
})
