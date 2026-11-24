// @vitest-environment node
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { createAuth } from './auth.js'
import { openDatabase } from './db/connection.js'
import {
  recipe,
  recipeExternalReference,
  recipeIngredient,
} from './db/schema.js'

const testEnvironment = {
  NODE_ENV: 'test' as const,
  APP_URL: 'http://localhost:5173',
  TRUSTED_ORIGINS: ['http://localhost:5173'],
  BETTER_AUTH_SECRET: 'local-isolated-test-secret-with-at-least-32-bytes',
  SQLITE_PATH: ':memory:',
  RECIPE_UPLOAD_DIR: '',
  API_HOST: '127.0.0.1',
  API_PORT: 3000,
}
const password = 'isolated-test-password-123'

let directory = ''
let connection: ReturnType<typeof openDatabase>
let auth: ReturnType<typeof createAuth>
let app: ReturnType<typeof createApp>

async function createUser(email: string, name: string) {
  return auth.api.createUser({ body: { email, name, password, role: 'user' } })
}

async function signIn(email: string) {
  const response = await app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      origin: testEnvironment.APP_URL,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })
  expect(response.status).toBe(200)
  const cookie = response.headers
    .get('set-cookie')
    ?.match(/better-auth\.session_token=[^;,]+/)?.[0]
  expect(cookie).toBeTruthy()
  return cookie!
}

function recipeForm(
  value: Record<string, unknown>,
  image?: { name: string; type: string; bytes: number[] },
) {
  const form = new FormData()
  form.set('recipe', JSON.stringify(value))
  if (image) {
    form.set(
      'image',
      new File([new Uint8Array(image.bytes)], image.name, { type: image.type }),
    )
  }
  return form
}

async function createHouseRecipe(cookie: string, title = 'Soupe de test') {
  const response = await app.request('/api/recipes', {
    method: 'POST',
    headers: { cookie },
    body: recipeForm({
      title,
      description: 'Description de test',
      totalMinutes: 35,
      difficulty: 'easy',
      category: 'Soupes',
      tags: ['Hiver'],
      ingredients: [
        { name: 'Courge', quantity: '500', unit: 'g' },
        { name: 'Eau', quantity: null, unit: null },
      ],
      steps: [{ instructions: 'Laver et couper la courge.' }],
    }),
  })
  expect(response.status).toBe(201)
  return response.json() as Promise<{ id: string; title: string }>
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'quisera-recipes-test-'))
  connection = openDatabase(':memory:')
  migrate(connection.client, {
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
  })
  auth = createAuth(testEnvironment, connection.client)
  app = createApp({
    auth,
    database: connection,
    environment: { ...testEnvironment, RECIPE_UPLOAD_DIR: directory },
  })
})

afterEach(() => {
  if (connection.sqlite.open) connection.close()
  if (directory) rmSync(directory, { recursive: true, force: true })
})

describe('private recipe library', () => {
  it('requires a session for list, detail, create, favorites, and images', async () => {
    expect((await app.request('/api/recipes')).status).toBe(401)
    expect((await app.request('/api/recipes/missing')).status).toBe(401)
    expect(
      (
        await app.request('/api/recipes', {
          method: 'POST',
          body: recipeForm({ title: 'Private' }),
        })
      ).status,
    ).toBe(401)
    expect((await app.request('/api/recipes/favorites')).status).toBe(401)
  })

  it('rejects writes with an untrusted browser origin', async () => {
    const owner = await createUser('recipe-origin@quisera.invalid', 'Origin')
    const cookie = await signIn(owner.user.email)
    const response = await app.request('/api/recipes', {
      method: 'POST',
      headers: {
        cookie,
        origin: 'https://attacker.invalid',
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(403)
  })

  it('creates and reads a normalized house recipe with unavailable metrics', async () => {
    const owner = await createUser('recipe-owner@quisera.invalid', 'Owner')
    const cookie = await signIn(owner.user.email)
    const created = await createHouseRecipe(cookie)

    const response = await app.request(`/api/recipes/${created.id}`, {
      headers: { cookie },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      id: created.id,
      source: 'house',
      title: 'Soupe de test',
      totalMinutes: 35,
      difficulty: 'easy',
      category: 'Soupes',
      tags: ['Hiver'],
      ingredients: [
        { name: 'Courge', quantity: '500', unit: 'g', position: 0 },
        { name: 'Eau', quantity: null, unit: null, position: 1 },
      ],
      steps: [{ instructions: 'Laver et couper la courge.', position: 0 }],
      metrics: [],
    })
  })

  it('searches, filters, sorts, and paginates with a stable bounded page size', async () => {
    const owner = await createUser('recipe-search@quisera.invalid', 'Search')
    const cookie = await signIn(owner.user.email)
    await createHouseRecipe(cookie, 'Soupe de test')
    await createHouseRecipe(cookie, 'Tarte de test')

    const response = await app.request(
      '/api/recipes?q=soupe&category=soupes&sort=title&page=1&pageSize=1',
      { headers: { cookie } },
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 1,
      items: [{ title: 'Soupe de test' }],
    })
    const bounded = await app.request('/api/recipes?pageSize=1000', {
      headers: { cookie },
    })
    const boundedPage = (await bounded.json()) as { pageSize: number }
    expect(boundedPage.pageSize).toBeLessThanOrEqual(50)
  })

  it('keeps favorites private to each user and permits removal', async () => {
    const first = await createUser('recipe-first@quisera.invalid', 'First')
    const second = await createUser('recipe-second@quisera.invalid', 'Second')
    const firstCookie = await signIn(first.user.email)
    const secondCookie = await signIn(second.user.email)
    const created = await createHouseRecipe(firstCookie)

    const favorite = await app.request(`/api/recipes/${created.id}/favorite`, {
      method: 'POST',
      headers: { cookie: firstCookie },
    })
    expect(favorite.status).toBe(204)
    const firstFavorites = await app.request('/api/recipes/favorites', {
      headers: { cookie: firstCookie },
    })
    const secondFavorites = await app.request('/api/recipes/favorites', {
      headers: { cookie: secondCookie },
    })
    expect(
      ((await firstFavorites.json()) as { items: unknown[] }).items,
    ).toHaveLength(1)
    expect(
      ((await secondFavorites.json()) as { items: unknown[] }).items,
    ).toHaveLength(0)

    expect(
      (
        await app.request(`/api/recipes/${created.id}/favorite`, {
          method: 'DELETE',
          headers: { cookie: firstCookie },
        })
      ).status,
    ).toBe(204)
  })

  it('rejects invalid input and refuses edits to imported recipes', async () => {
    const owner = await createUser('recipe-protect@quisera.invalid', 'Protect')
    const cookie = await signIn(owner.user.email)
    const invalid = await app.request('/api/recipes', {
      method: 'POST',
      headers: { cookie },
      body: recipeForm({ title: '', ingredients: [], steps: [] }),
    })
    expect(invalid.status).toBe(400)

    const importedId = randomUUID()
    connection.client
      .insert(recipe)
      .values({
        id: importedId,
        source: 'quitoque',
        title: 'Imported record',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run()
    connection.client
      .insert(recipeExternalReference)
      .values({
        id: randomUUID(),
        recipeId: importedId,
        source: 'quitoque',
        externalId: 'verified-id-from-test',
        lastSyncedAt: null,
      })
      .run()

    expect(
      (
        await app.request(`/api/recipes/${importedId}`, {
          method: 'PUT',
          headers: { cookie },
          body: recipeForm({ title: 'Changed', ingredients: [], steps: [] }),
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await app.request(`/api/recipes/${importedId}`, {
          method: 'DELETE',
          headers: { cookie },
        })
      ).status,
    ).toBe(404)
  })

  it('updates and deletes a house recipe without leaving its content behind', async () => {
    const owner = await createUser(
      'recipe-lifecycle@quisera.invalid',
      'Lifecycle',
    )
    const cookie = await signIn(owner.user.email)
    const created = await createHouseRecipe(cookie)
    const updated = await app.request(`/api/recipes/${created.id}`, {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Soupe modifiée',
        ingredients: [{ name: 'Patate douce' }],
        steps: [{ instructions: 'Cuire doucement.' }],
      }),
    })
    expect(updated.status).toBe(200)
    expect(await updated.json()).toMatchObject({
      title: 'Soupe modifiée',
      description: null,
      totalMinutes: null,
      ingredients: [{ name: 'Patate douce', position: 0 }],
      steps: [{ instructions: 'Cuire doucement.', position: 0 }],
    })

    const deleted = await app.request(`/api/recipes/${created.id}`, {
      method: 'DELETE',
      headers: { cookie },
    })
    expect(deleted.status).toBe(204)
    expect(
      (await app.request(`/api/recipes/${created.id}`, { headers: { cookie } }))
        .status,
    ).toBe(404)
    expect(
      connection.client.select().from(recipeIngredient).all(),
    ).toHaveLength(0)
  })

  it('persists complete uploaded photos and rejects mismatched image content', async () => {
    const owner = await createUser('recipe-photo@quisera.invalid', 'Photo')
    const cookie = await signIn(owner.user.email)
    const png = [
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
      0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84,
      8, 215, 99, 248, 207, 192, 0, 0, 3, 1, 1, 0, 201, 254, 146, 239, 0, 0, 0,
      0, 73, 69, 78, 68, 174, 66, 96, 130,
    ]
    const createdResponse = await app.request('/api/recipes', {
      method: 'POST',
      headers: { cookie },
      body: recipeForm(
        {
          title: 'Photo test',
          ingredients: [{ name: 'Poivron' }],
          steps: [{ instructions: 'Cuire.' }],
        },
        { name: 'full-photo.png', type: 'image/png', bytes: png },
      ),
    })
    expect(createdResponse.status).toBe(201)
    const created = (await createdResponse.json()) as {
      id: string
      imageUrl: string
    }
    const photo = await app.request(created.imageUrl, { headers: { cookie } })
    expect(photo.status).toBe(200)
    expect(photo.headers.get('content-type')).toBe('image/png')
    const [photoKey] = readdirSync(directory)
    expect(photoKey).toBeTruthy()
    expect(Buffer.from(await photo.arrayBuffer())).toEqual(
      Buffer.from(readFileSync(join(directory, photoKey!))),
    )

    const mismatched = await app.request('/api/recipes', {
      method: 'POST',
      headers: { cookie },
      body: recipeForm(
        {
          title: 'Invalid image',
          ingredients: [{ name: 'Poivron' }],
          steps: [{ instructions: 'Cuire.' }],
        },
        { name: 'dish.png', type: 'image/png', bytes: [0, 1, 2, 3] },
      ),
    })
    expect(mismatched.status).toBe(400)
  })
})
