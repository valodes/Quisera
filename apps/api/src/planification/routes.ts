import { civilDateSchema } from '@quisera/shared'
import { Hono } from 'hono'
import { z } from 'zod'
import type { ApiHonoEnvironment } from '../app.js'
import { requireSession } from '../app.js'
import type { AuthInstance } from '../auth.js'
import { QuitoqueApiError } from '../quitoque/client.js'
import type { QuitoqueBoxClient } from '../quitoque/box-client.js'

const sectionSchema = z.enum(['recipes', 'ready-meals', 'market'])

const catalogQuerySchema = z.object({
  start: civilDateSchema,
  end: civilDateSchema,
  section: sectionSchema.default('recipes'),
})

const addItemSchema = z.object({
  variantCode: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(20).default(1),
})

const updateQuantitySchema = z.object({
  quantity: z.number().int().min(1).max(20),
})

const timeSlotsQuerySchema = z.object({
  postalCode: z.string().trim().min(3).max(16),
  startDate: civilDateSchema,
})

const servingsSchema = z.object({
  size: z.number().int().min(2).max(6),
})

const deliverySlotSchema = z.object({
  shipmentId: z.string().trim().min(1),
  shippingMethodCode: z.string().trim().min(1),
  deliveryDate: civilDateSchema,
  begin: z
    .string()
    .trim()
    .regex(/^\d{1,2}:\d{2}$/),
  end: z
    .string()
    .trim()
    .regex(/^\d{1,2}:\d{2}$/),
  timeSlotId: z.number().int().positive(),
})

const couponSchema = z.object({
  couponCode: z
    .string()
    .trim()
    .max(64)
    .transform((v) => (v === '' ? null : v))
    .nullable(),
})

const walletSchema = z.object({
  useWallet: z.boolean(),
})

const geocodeCache = new Map<string, { lat: number; lon: number } | null>()

export function createPlanificationRoutes(
  auth: AuthInstance,
  trustedOrigins: readonly string[],
  boxClient?: QuitoqueBoxClient,
) {
  const routes = new Hono<ApiHonoEnvironment>()

  routes.use('*', async (context, next) => {
    if (
      context.req.method !== 'GET' &&
      context.req.method !== 'HEAD' &&
      context.req.method !== 'OPTIONS'
    ) {
      const origin = context.req.header('origin')
      if (origin) {
        let requestOrigin: string
        try {
          requestOrigin = new URL(origin).origin
        } catch {
          return context.json({ error: 'Origine non autorisée.' }, 403)
        }
        if (
          requestOrigin !== origin ||
          !trustedOrigins.includes(requestOrigin)
        ) {
          return context.json({ error: 'Origine non autorisée.' }, 403)
        }
      }
    }
    await next()
  })

  routes.use('*', requireSession(auth))

  routes.get('/weeks', async (context) => {
    if (!boxClient) {
      return context.json(
        { error: 'La connexion Quitoque n’est pas configurée.' },
        503,
      )
    }
    try {
      const weeks = await boxClient.listUpcomingBoxes()
      return context.json({ weeks })
    } catch (error) {
      const message =
        error instanceof QuitoqueApiError
          ? error.message
          : 'Impossible de charger les prochaines box Quitoque.'
      return context.json({ error: message }, 502)
    }
  })

  routes.get('/catalog', async (context) => {
    if (!boxClient) {
      return context.json(
        { error: 'La connexion Quitoque n’est pas configurée.' },
        503,
      )
    }
    const parsed = catalogQuerySchema.safeParse({
      start: context.req.query('start'),
      end: context.req.query('end'),
      section: context.req.query('section') ?? 'recipes',
    })
    if (!parsed.success) {
      return context.json({ error: 'Paramètres de catalogue invalides.' }, 400)
    }
    try {
      const catalog = await boxClient.getWeekCatalog(
        parsed.data.start,
        parsed.data.end,
        parsed.data.section,
      )
      return context.json(catalog)
    } catch (error) {
      const message =
        error instanceof QuitoqueApiError
          ? error.message
          : 'Impossible de charger le catalogue de cette semaine.'
      return context.json({ error: message }, 502)
    }
  })

  routes.post('/weeks/:orderId/items', async (context) => {
    if (!boxClient) {
      return context.json(
        { error: 'La connexion Quitoque n’est pas configurée.' },
        503,
      )
    }
    const parsed = addItemSchema.safeParse(
      await context.req.json().catch(() => null),
    )
    if (!parsed.success) {
      return context.json({ error: 'Article invalide.' }, 400)
    }
    try {
      const week = await boxClient.addItem(
        context.req.param('orderId'),
        parsed.data.variantCode,
        parsed.data.quantity,
      )
      return context.json({ week }, 201)
    } catch (error) {
      const message =
        error instanceof QuitoqueApiError
          ? error.message
          : 'Impossible d’ajouter cet article à la box.'
      return context.json({ error: message }, 502)
    }
  })

  routes.patch('/weeks/:orderId/items/:itemId', async (context) => {
    if (!boxClient) {
      return context.json(
        { error: 'La connexion Quitoque n’est pas configurée.' },
        503,
      )
    }
    const parsed = updateQuantitySchema.safeParse(
      await context.req.json().catch(() => null),
    )
    if (!parsed.success) {
      return context.json({ error: 'Quantité invalide.' }, 400)
    }
    try {
      const week = await boxClient.updateItemQuantity(
        context.req.param('orderId'),
        context.req.param('itemId'),
        parsed.data.quantity,
      )
      return context.json({ week })
    } catch (error) {
      const message =
        error instanceof QuitoqueApiError
          ? error.message
          : 'Impossible de modifier la quantité.'
      return context.json({ error: message }, 502)
    }
  })

  routes.delete('/weeks/:orderId/items/:itemId', async (context) => {
    if (!boxClient) {
      return context.json(
        { error: 'La connexion Quitoque n’est pas configurée.' },
        503,
      )
    }
    try {
      const week = await boxClient.removeItem(
        context.req.param('orderId'),
        context.req.param('itemId'),
      )
      return context.json({ week })
    } catch (error) {
      const message =
        error instanceof QuitoqueApiError
          ? error.message
          : 'Impossible de retirer cet article de la box.'
      return context.json({ error: message }, 502)
    }
  })

  routes.get('/time-slots', async (context) => {
    if (!boxClient) {
      return context.json(
        { error: 'La connexion Quitoque n’est pas configurée.' },
        503,
      )
    }
    const parsed = timeSlotsQuerySchema.safeParse({
      postalCode: context.req.query('postalCode'),
      startDate: context.req.query('startDate'),
    })
    if (!parsed.success) {
      return context.json({ error: 'Paramètres de créneau invalides.' }, 400)
    }
    try {
      const result = await boxClient.getDeliveryTimeSlots(
        parsed.data.postalCode,
        parsed.data.startDate,
      )
      return context.json(result)
    } catch (error) {
      const message =
        error instanceof QuitoqueApiError
          ? error.message
          : 'Impossible de charger les créneaux horaires.'
      return context.json({ error: message }, 502)
    }
  })

  routes.post('/weeks/:orderId/servings', async (context) => {
    if (!boxClient) {
      return context.json(
        { error: 'La connexion Quitoque n’est pas configurée.' },
        503,
      )
    }
    const parsed = servingsSchema.safeParse(
      await context.req.json().catch(() => null),
    )
    if (!parsed.success) {
      return context.json({ error: 'Nombre de personnes invalide.' }, 400)
    }
    try {
      const week = await boxClient.updateServings(
        context.req.param('orderId'),
        parsed.data.size,
      )
      return context.json({ week })
    } catch (error) {
      const message =
        error instanceof QuitoqueApiError
          ? error.message
          : 'Impossible de modifier le nombre de personnes.'
      return context.json({ error: message }, 502)
    }
  })

  routes.patch('/weeks/:orderId/delivery', async (context) => {
    if (!boxClient) {
      return context.json(
        { error: 'La connexion Quitoque n’est pas configurée.' },
        503,
      )
    }
    const parsed = deliverySlotSchema.safeParse(
      await context.req.json().catch(() => null),
    )
    if (!parsed.success) {
      return context.json({ error: 'Créneau de livraison invalide.' }, 400)
    }
    try {
      const week = await boxClient.updateDeliverySlot(
        context.req.param('orderId'),
        parsed.data.shipmentId,
        parsed.data,
      )
      return context.json({ week })
    } catch (error) {
      const message =
        error instanceof QuitoqueApiError
          ? error.message
          : 'Impossible de modifier le créneau de livraison.'
      return context.json({ error: message }, 502)
    }
  })

  routes.put('/weeks/:orderId/coupon', async (context) => {
    if (!boxClient) {
      return context.json(
        { error: 'La connexion Quitoque n’est pas configurée.' },
        503,
      )
    }
    const parsed = couponSchema.safeParse(
      await context.req.json().catch(() => null),
    )
    if (!parsed.success) {
      return context.json({ error: 'Code promo invalide.' }, 400)
    }
    try {
      const week = await boxClient.applyCoupon(
        context.req.param('orderId'),
        parsed.data.couponCode,
      )
      return context.json({ week })
    } catch (error) {
      const message =
        error instanceof QuitoqueApiError
          ? error.message
          : 'Impossible d’appliquer ce code promo.'
      return context.json({ error: message }, 502)
    }
  })

  routes.post('/weeks/:orderId/wallet', async (context) => {
    if (!boxClient) {
      return context.json(
        { error: 'La connexion Quitoque n’est pas configurée.' },
        503,
      )
    }
    const parsed = walletSchema.safeParse(
      await context.req.json().catch(() => null),
    )
    if (!parsed.success) {
      return context.json({ error: 'Paramètre cagnotte invalide.' }, 400)
    }
    try {
      const week = await boxClient.toggleWallet(
        context.req.param('orderId'),
        parsed.data.useWallet,
      )
      return context.json({ week })
    } catch (error) {
      const message =
        error instanceof QuitoqueApiError
          ? error.message
          : 'Impossible de modifier la cagnotte.'
      return context.json({ error: message }, 502)
    }
  })

  routes.get('/geocode', async (context) => {
    const query = (context.req.query('q') ?? '').trim()
    if (query.length < 3 || query.length > 200) {
      return context.json({ coords: null })
    }
    if (geocodeCache.has(query)) {
      return context.json({ coords: geocodeCache.get(query) })
    }
    try {
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        limit: '1',
      })
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params}`,
        {
          headers: {
            accept: 'application/json',
            'user-agent': 'Quisera/1.0 (private household app)',
          },
          signal: AbortSignal.timeout(6000),
        },
      )
      if (!response.ok) {
        geocodeCache.set(query, null)
        return context.json({ coords: null })
      }
      const rows = (await response.json()) as Array<{
        lat?: string
        lon?: string
      }>
      const first = rows[0]
      const coords =
        first?.lat && first?.lon
          ? { lat: Number(first.lat), lon: Number(first.lon) }
          : null
      geocodeCache.set(query, coords)
      return context.json({ coords })
    } catch {
      return context.json({ coords: null })
    }
  })

  return routes
}
