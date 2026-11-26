// @vitest-environment node
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ApiHonoEnvironment } from './app.js'
import { createAuth } from './auth.js'
import { openDatabase } from './db/connection.js'
import { createPlanificationRoutes } from './planification/routes.js'
import type { QuitoqueBoxClient, UpcomingBoxWeek } from './quitoque/box-client.js'

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

const sampleWeek: UpcomingBoxWeek = {
  orderId: '42001',
  periodStartDate: '2026-11-30',
  periodEndDate: '2026-12-06',
  deliveryDate: '2026-12-01',
  lockDate: '2026-11-27T23:59:59+01:00',
  isNextOrder: true,
  onBreak: false,
  edited: 'recipe',
  recipeTargetCount: 4,
  servings: 2,
  itemsTotalCents: 4800,
  shippingTotalCents: 399,
  promotionTotalCents: 0,
  walletTotalCents: 0,
  walletBalanceCents: 1000,
  useWallet: false,
  totalCents: 5199,
  shippingAddress: {
    street: '10 Rue des Fleurs',
    postcode: '31000',
    city: 'Toulouse',
    countryCode: 'FR',
    recipientName: 'Valentin',
  },
  shipment: {
    id: 'ship-1',
    method: '/api/v2/shop/shipping-methods/home_3_99',
    deliveryDate: '2026-12-01',
    startTime: '08:00',
    endTime: '13:00',
    timeSlotId: 12,
  },
  promotions: [],
  items: [
    {
      id: 'item-1',
      productId: 'prod-1',
      variantId: 'var-1',
      variantCode: 'VAR_PROD_1',
      title: 'Risotto aux champignons',
      quantity: 1,
      unitPriceCents: 1200,
      totalCents: 1200,
      imageUrl: null,
      section: 'recipes',
    },
  ],
}

describe('planification routes', () => {
  let connection: ReturnType<typeof openDatabase>
  let auth: ReturnType<typeof createAuth>
  let app: Hono<ApiHonoEnvironment>
  let cookie: string

  beforeEach(async () => {
    connection = openDatabase(':memory:')
    migrate(connection.client, {
      migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
    })
    auth = createAuth(testEnvironment, connection.client)
    await auth.api.createUser({
      body: {
        email: 'planif@quisera.invalid',
        name: 'Valentin',
        password: 'planif-password-1234',
        role: 'admin',
      },
    })

    const mockBoxClient: QuitoqueBoxClient = {
      listUpcomingBoxes: async () => [sampleWeek],
      getWeekCatalog: async (_start, _end, section) => ({
        items: [
          {
            id: 'prod-1',
            code: 'risotto-champignons',
            variantId: 'var-1',
            variantCode: 'VAR_PROD_1',
            title: 'Risotto aux champignons',
            description: 'Crémeux au parmesan.',
            imageUrl: null,
            totalMinutes: 25,
            servings: 2,
            nutriScore: 'B',
            carbonScore: 'A',
            nutrition: {
              caloriesKcal: 580,
              proteinGrams: 18,
              carbsGrams: 68,
              fatGrams: 22,
              fiberGrams: 4,
              sugarGrams: 3,
              saltGrams: 1.4,
            },
            priceCents: 1200,
            additionalCostCents: 0,
            section,
            categories: ['À cuisiner'],
            highlights: ['Veggie'],
            tags: ['automne'],
            allergens: ['Lait'],
            ingredients: [{ name: 'Riz arborio', quantity: '150 g', unit: null, notes: null }],
            steps: ['Faire nacrer le riz puis mouiller au bouillon.'],
            filterValues: { carbon_score: ['a'] },
          },
        ],
        filterGroups: [],
        seasonalCategories: ['Veggie'],
      }),
      getDeliveryTimeSlots: async () => ({
        deliveryDates: ['2026-12-01'],
        timeSlots: [
          {
            id: 12,
            shippingMethodCode: 'home_3_99',
            label: '08:00 - 13:00',
            begin: '08:00',
            end: '13:00',
            priceCents: 399,
            recommended: true,
            deliveryDates: ['2026-12-01'],
          },
        ],
      }),
      addItem: async (_orderId, variantCode, quantity = 1) => ({
        ...sampleWeek,
        items: [
          ...sampleWeek.items,
          {
            id: 'item-2',
            productId: 'prod-2',
            variantId: 'var-2',
            variantCode,
            title: 'Nouvelle recette',
            quantity,
            unitPriceCents: 1200,
            totalCents: 1200 * quantity,
            imageUrl: null,
            section: 'recipes',
          },
        ],
      }),
      updateItemQuantity: async (_orderId, itemId, quantity) => ({
        ...sampleWeek,
        items: sampleWeek.items.map((item) =>
          item.id === itemId
            ? { ...item, quantity, totalCents: item.unitPriceCents * quantity }
            : item,
        ),
      }),
      removeItem: async (_orderId, itemId) => ({
        ...sampleWeek,
        items: sampleWeek.items.filter((item) => item.id !== itemId),
      }),
      updateServings: async (_orderId, servings) => ({ ...sampleWeek, servings }),
      updateDeliverySlot: async (_orderId, _shipmentId, payload) => ({
        ...sampleWeek,
        deliveryDate: payload.deliveryDate,
      }),
      applyCoupon: async (_orderId, couponCode) => ({
        ...sampleWeek,
        promotionTotalCents: couponCode ? -1000 : 0,
      }),
      toggleWallet: async (_orderId, useWallet) => ({
        ...sampleWeek,
        useWallet,
        walletTotalCents: useWallet ? -1000 : 0,
      }),
    }

    app = new Hono<ApiHonoEnvironment>()
    app.all('/api/auth/*', (c) => auth.handler(c.req.raw))
    app.route('/api/planification', createPlanificationRoutes(auth, mockBoxClient))

    const signInRes = await app.request('http://localhost:3131/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3131' },
      body: JSON.stringify({
        email: 'planif@quisera.invalid',
        password: 'planif-password-1234',
      }),
    })
    expect(signInRes.status).toBe(200)
    cookie = signInRes.headers
      .getSetCookie()
      .map((entry) => entry.split(';', 1)[0])
      .join('; ')
  })

  afterEach(() => {
    connection.sqlite.close()
  })

  it('enforces authentication and serves weeks, catalog, cart mutations, slots, coupons and wallet', async () => {
    expect((await app.request('http://localhost:3131/api/planification/weeks')).status).toBe(401)

    const weeksRes = await app.request('http://localhost:3131/api/planification/weeks', {
      headers: { cookie },
    })
    expect(weeksRes.status).toBe(200)
    expect(await weeksRes.json()).toMatchObject({
      weeks: [{ orderId: '42001', servings: 2 }],
    })

    const invalidCatalog = await app.request(
      'http://localhost:3131/api/planification/catalog?start=bad&end=2026-12-06',
      { headers: { cookie } },
    )
    expect(invalidCatalog.status).toBe(400)

    const catalogRes = await app.request(
      'http://localhost:3131/api/planification/catalog?start=2026-11-30&end=2026-12-06&section=recipes',
      { headers: { cookie } },
    )
    expect(catalogRes.status).toBe(200)
    expect(await catalogRes.json()).toMatchObject({
      items: [{ code: 'risotto-champignons', nutriScore: 'B', carbonScore: 'A' }],
      seasonalCategories: ['Veggie'],
    })

    const addRes = await app.request('http://localhost:3131/api/planification/weeks/42001/items', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ variantCode: 'VAR_PROD_2', quantity: 2 }),
    })
    expect(addRes.status).toBe(201)
    expect(((await addRes.json()) as { week: UpcomingBoxWeek }).week.items).toHaveLength(2)

    const patchQtyRes = await app.request(
      'http://localhost:3131/api/planification/weeks/42001/items/item-1',
      {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ quantity: 3 }),
      },
    )
    expect(patchQtyRes.status).toBe(200)
    expect(((await patchQtyRes.json()) as { week: UpcomingBoxWeek }).week.items[0]?.quantity).toBe(
      3,
    )

    const servingsRes = await app.request(
      'http://localhost:3131/api/planification/weeks/42001/servings',
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ size: 4 }),
      },
    )
    expect(servingsRes.status).toBe(200)
    expect(((await servingsRes.json()) as { week: UpcomingBoxWeek }).week.servings).toBe(4)

    const couponRes = await app.request(
      'http://localhost:3131/api/planification/weeks/42001/coupon',
      {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ couponCode: 'FIDELITE10' }),
      },
    )
    expect(couponRes.status).toBe(200)
    expect(((await couponRes.json()) as { week: UpcomingBoxWeek }).week.promotionTotalCents).toBe(
      -1000,
    )

    const walletRes = await app.request(
      'http://localhost:3131/api/planification/weeks/42001/wallet',
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ useWallet: true }),
      },
    )
    expect(walletRes.status).toBe(200)
    expect(((await walletRes.json()) as { week: UpcomingBoxWeek }).week.useWallet).toBe(true)

    const slotsRes = await app.request(
      'http://localhost:3131/api/planification/time-slots?postalCode=31000&startDate=2026-11-30',
      { headers: { cookie } },
    )
    expect(slotsRes.status).toBe(200)
    expect(await slotsRes.json()).toMatchObject({
      deliveryDates: ['2026-12-01'],
      timeSlots: [{ id: 12 }],
    })
  })
})
