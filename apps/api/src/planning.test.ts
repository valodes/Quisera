// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { createAuth } from './auth.js'
import { openDatabase } from './db/connection.js'

const environment = {
  NODE_ENV: 'test' as const,
  APP_URL: 'http://localhost:5173',
  TRUSTED_ORIGINS: ['http://localhost:5173'],
  BETTER_AUTH_SECRET: 'local-isolated-test-secret-with-at-least-32-bytes',
  SQLITE_PATH: ':memory:',
  RECIPE_UPLOAD_DIR: '',
  API_HOST: '127.0.0.1',
  API_PORT: 3000,
}
const selections = [0, 1].map((occurrence) => ({
  externalId: 'recipe-1',
  productId: '1',
  title: `Sélection ${occurrence + 1}`,
  description: null,
  imageUrl: null,
  thumbnailUrl: null,
  totalMinutes: null,
  difficulty: null,
  category: null,
  tags: [],
  ingredients: [{ name: 'Carotte', quantity: '2', unit: 'pièces', notes: null }],
  steps: ['Laver les carottes.'],
  nutriScore: null,
  carbonScore: null,
  sourceItemId: 'item-1',
  sourcePosition: 0,
  occurrence,
  quantity: 2,
  isAvailable: true,
}))
let currentSelections = selections

let directory = ''
let connection: ReturnType<typeof openDatabase>
let auth: ReturnType<typeof createAuth>
let app: ReturnType<typeof createApp>

async function signIn() {
  await auth.api.createUser({
    body: {
      email: 'planning@quisera.invalid',
      name: 'Planning',
      password: 'isolated-test-password-123',
    },
  })
  const response = await app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      origin: environment.APP_URL,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'planning@quisera.invalid',
      password: 'isolated-test-password-123',
    }),
  })
  expect(response.status).toBe(200)
  return response.headers.get('set-cookie')!.match(/better-auth\.session_token=[^;,]+/)![0]
}

beforeEach(() => {
  currentSelections = selections
  directory = mkdtempSync(join(tmpdir(), 'quisera-planning-test-'))
  connection = openDatabase(':memory:')
  migrate(connection.client, {
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
  })
  auth = createAuth(environment, connection.client)
  app = createApp({
    auth,
    database: connection,
    environment,
    quitoquePlanningClient: {
      async listDeliveries() {
        return [
          {
            externalOrderId: 'order-1',
            deliveryDate: '2026-11-18 00:00:00',
            periodStartDate: '2026-11-16',
            periodEndDate: '2026-11-23',
          },
          {
            externalOrderId: 'order-invalid',
            deliveryDate: 'not-a-civil-date',
            periodStartDate: null,
            periodEndDate: null,
          },
        ]
      },
      async listSelectedRecipes() {
        return currentSelections
      },
    },
  })
})

afterEach(() => {
  if (connection.sqlite.open) connection.close()
  if (directory) rmSync(directory, { recursive: true, force: true })
})

describe('private delivery planning', () => {
  it('requires a session, anchors cycles on delivery dates and distributes selected occurrences around manual meals', async () => {
    expect((await app.request('/api/planning?from=2026-11-01&to=2026-11-30')).status).toBe(401)
    const cookie = await signIn()
    const rejectedOrigin = await app.request('/api/planning/quitoque/sync', {
      method: 'POST',
      headers: { cookie, origin: 'https://attacker.invalid' },
    })
    expect(rejectedOrigin.status).toBe(403)
    const sync = await app.request('/api/planning/quitoque/sync', {
      method: 'POST',
      headers: { cookie, origin: environment.APP_URL },
    })
    expect(await sync.json()).toMatchObject({
      added: 1,
      invalidDeliveryDates: 1,
    })
    const repeatedSync = await app.request('/api/planning/quitoque/sync', {
      method: 'POST',
      headers: { cookie, origin: environment.APP_URL },
    })
    expect(await repeatedSync.json()).toMatchObject({
      added: 0,
      updated: 1,
      invalidDeliveryDates: 1,
    })
    const cyclesResponse = await app.request('/api/planning?from=2026-11-01&to=2026-11-30', {
      headers: { cookie },
    })
    const cycles = (await cyclesResponse.json()) as {
      deliveryCycles: Array<{ id: string; deliveryDate: string }>
    }
    expect(cycles.deliveryCycles).toEqual([expect.objectContaining({ deliveryDate: '2026-11-18' })])
    const cycleId = cycles.deliveryCycles[0]!.id
    await app.request(`/api/planning/deliveries/${cycleId}/recipes/sync`, {
      method: 'POST',
      headers: { cookie, origin: environment.APP_URL },
    })
    await app.request(`/api/planning/deliveries/${cycleId}/recipes/sync`, {
      method: 'POST',
      headers: { cookie, origin: environment.APP_URL },
    })
    const deliveryResponse = await app.request(`/api/planning/deliveries/${cycleId}`, {
      headers: { cookie },
    })
    const delivery = (await deliveryResponse.json()) as {
      selections: unknown[]
    }
    expect(delivery.selections).toHaveLength(2)
    const manual = await app.request('/api/planning/slots', {
      method: 'PUT',
      headers: {
        cookie,
        origin: environment.APP_URL,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        date: '2026-11-18',
        period: 'dinner',
        category: 'restaurant',
        restaurantName: 'Repas au restaurant',
      }),
    })
    expect(manual.status).toBe(200)
    const distributed = await app.request(`/api/planning/deliveries/${cycleId}/distribute`, {
      method: 'POST',
      headers: {
        cookie,
        origin: environment.APP_URL,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ confirmed: false }),
    })
    expect(distributed.status).toBe(200)
    expect(await distributed.json()).toMatchObject({
      assigned: 2,
      leftEmpty: 11,
      preserved: 1,
      unassigned: 0,
    })
    const moved = await app.request('/api/planning/slots/move', {
      method: 'POST',
      headers: {
        cookie,
        origin: environment.APP_URL,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        fromDate: '2026-11-19',
        fromPeriod: 'lunch',
        toDate: '2026-11-20',
        toPeriod: 'lunch',
      }),
    })
    expect(moved.status).toBe(200)
    // Swapping two occupied slots exchanges them instead of failing with 409
    const swapped = await app.request('/api/planning/slots/move', {
      method: 'POST',
      headers: {
        cookie,
        origin: environment.APP_URL,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        fromDate: '2026-11-20',
        fromPeriod: 'lunch',
        toDate: '2026-11-18',
        toPeriod: 'dinner',
      }),
    })
    expect(swapped.status).toBe(200)
    await expect(swapped.json()).resolves.toMatchObject({
      moved: true,
      swapped: true,
    })
    // Swap back to preserve subsequent test assertions
    const swappedBack = await app.request('/api/planning/slots/move', {
      method: 'POST',
      headers: {
        cookie,
        origin: environment.APP_URL,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        fromDate: '2026-11-18',
        fromPeriod: 'dinner',
        toDate: '2026-11-20',
        toPeriod: 'lunch',
      }),
    })
    expect(swappedBack.status).toBe(200)
    const needsConfirmation = await app.request(`/api/planning/deliveries/${cycleId}/distribute`, {
      method: 'POST',
      headers: {
        cookie,
        origin: environment.APP_URL,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ confirmed: false }),
    })
    expect(needsConfirmation.status).toBe(409)
    const redistributed = await app.request(`/api/planning/deliveries/${cycleId}/distribute`, {
      method: 'POST',
      headers: {
        cookie,
        origin: environment.APP_URL,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ confirmed: true }),
    })
    expect(await redistributed.json()).toMatchObject({
      assigned: 1,
      preserved: 2,
      unassigned: 0,
    })
    const rangeResponse = await app.request('/api/planning?from=2026-11-18&to=2026-11-25', {
      headers: { cookie },
    })
    const range = (await rangeResponse.json()) as {
      days: Array<{
        date: string
        dinner: { meal: { category: string; title: string } | null }
        lunch: { meal: { title: string } | null }
      }>
    }
    expect(range.days.find((day) => day.date === '2026-11-18')?.dinner.meal).toMatchObject({
      category: 'restaurant',
      title: 'Repas au restaurant',
    })
    expect(range.days.find((day) => day.date === '2026-11-19')?.lunch.meal?.title).toBe(
      'Sélection 2',
    )
    expect(range.days.find((day) => day.date === '2026-11-20')?.lunch.meal?.title).toBe(
      'Sélection 1',
    )
    expect(range.days).toHaveLength(8)
  })

  it('reports selected occurrences beyond the fourteen delivery slots without dropping their snapshots', async () => {
    currentSelections = Array.from({ length: 16 }, (_, sourcePosition) => ({
      ...selections[0]!,
      externalId: `recipe-${sourcePosition}`,
      productId: String(sourcePosition),
      sourceItemId: `item-${sourcePosition}`,
      sourcePosition,
      occurrence: 0,
      quantity: 1,
      title: `Sélection ${sourcePosition + 1}`,
    }))
    const cookie = await signIn()
    await app.request('/api/planning/quitoque/sync', {
      method: 'POST',
      headers: { cookie, origin: environment.APP_URL },
    })
    const listResponse = await app.request('/api/planning?from=2026-11-18&to=2026-11-25', {
      headers: { cookie },
    })
    const list = (await listResponse.json()) as {
      deliveryCycles: Array<{ id: string }>
    }
    const cycleId = list.deliveryCycles[0]!.id
    await app.request(`/api/planning/deliveries/${cycleId}/recipes/sync`, {
      method: 'POST',
      headers: { cookie, origin: environment.APP_URL },
    })
    const response = await app.request(`/api/planning/deliveries/${cycleId}/distribute`, {
      method: 'POST',
      headers: {
        cookie,
        origin: environment.APP_URL,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ confirmed: false }),
    })
    expect(await response.json()).toMatchObject({
      assigned: 14,
      leftEmpty: 0,
      unassigned: 2,
      slots: 14,
    })
    const delivery = await app.request(`/api/planning/deliveries/${cycleId}`, {
      headers: { cookie },
    })
    const snapshot = (await delivery.json()) as {
      selections: Array<{ ingredientsJson: string; stepsJson: string }>
    }
    expect(snapshot.selections).toHaveLength(16)
    expect(JSON.parse(snapshot.selections[0]!.ingredientsJson)).toEqual(selections[0]!.ingredients)
    expect(JSON.parse(snapshot.selections[0]!.stepsJson)).toEqual(selections[0]!.steps)
  })
})
