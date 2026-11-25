import {
  addCivilDays,
  civilDateSchema,
  deliveryCycleSlots,
  mealPeriodSchema,
} from '@quisera/shared'
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import type { ApiHonoEnvironment } from '../app.js'
import { requireSession } from '../app.js'
import type { AuthInstance } from '../auth.js'
import type { DatabaseClient } from '../db/connection.js'
import { deliveryCycle, deliverySelection, plannedMeal, recipe } from '../db/schema.js'
import { getHouseholdPlanningPreferences } from '../household/routes.js'
import {
  createQuitoqueClient,
  QuitoqueApiError,
  type QuitoqueDeliverySelection,
} from '../quitoque/client.js'
import { autoDistributeSelections } from './auto-distribute.js'

export type QuitoquePlanningClient = Pick<
  ReturnType<typeof createQuitoqueClient>,
  'listDeliveries' | 'listSelectedRecipes'
>

const rangeSchema = z
  .object({ from: civilDateSchema, to: civilDateSchema })
  .refine(
    ({ from, to }) => from <= to && addCivilDays(from, 62) >= to,
    'La période doit couvrir entre 1 et 63 jours.',
  )
const slotBodySchema = z.discriminatedUnion('category', [
  z.object({
    date: civilDateSchema,
    period: mealPeriodSchema,
    category: z.literal('home'),
    recipeId: z.string().uuid(),
  }),
  z.object({
    date: civilDateSchema,
    period: mealPeriodSchema,
    category: z.literal('quitoque'),
    selectionId: z.string().uuid(),
  }),
  z.object({
    date: civilDateSchema,
    period: mealPeriodSchema,
    category: z.literal('restaurant'),
    restaurantName: z.string().trim().max(120).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  }),
])
const moveBodySchema = z
  .object({
    fromDate: civilDateSchema,
    fromPeriod: mealPeriodSchema,
    toDate: civilDateSchema,
    toPeriod: mealPeriodSchema,
  })
  .refine((value) => value.fromDate !== value.toDate || value.fromPeriod !== value.toPeriod)

function dayFromApi(value: string | null | undefined) {
  if (!value) return null
  const date = value.slice(0, 10)
  return civilDateSchema.safeParse(date).success ? date : null
}

function omit<T extends object, K extends keyof T>(value: T, ...keys: K[]): Omit<T, K> {
  const result = { ...value }
  for (const key of keys) Reflect.deleteProperty(result, key)
  return result
}

export function createPlanningRoutes(
  database: DatabaseClient,
  auth: AuthInstance,
  quitoque?: QuitoquePlanningClient,
) {
  const router = new Hono<ApiHonoEnvironment>()
  router.use('*', requireSession(auth))

  router.get('/', (context) => {
    const parsed = rangeSchema.safeParse(context.req.query())
    if (!parsed.success) return context.json({ error: 'Période invalide.' }, 400)
    const { from, to } = parsed.data
    const meals = database
      .select()
      .from(plannedMeal)
      .where(and(gte(plannedMeal.date, from), lte(plannedMeal.date, to)))
      .orderBy(asc(plannedMeal.date), asc(plannedMeal.period))
      .all()
    const cycles = database
      .select()
      .from(deliveryCycle)
      .where(
        and(
          gte(deliveryCycle.deliveryDate, addCivilDays(from, -7)),
          lte(deliveryCycle.deliveryDate, to),
        ),
      )
      .orderBy(asc(deliveryCycle.deliveryDate))
      .all()
    const selections = cycles.length
      ? database
          .select()
          .from(deliverySelection)
          .where(
            inArray(
              deliverySelection.deliveryCycleId,
              cycles.map((cycle) => cycle.id),
            ),
          )
          .all()
      : []
    const houses = database.select().from(recipe).where(eq(recipe.source, 'house')).all()
    const summaries = new Map<
      string,
      { title: string; imageUrl: string | null; thumbnailUrl: string | null }
    >()
    for (const selection of selections)
      summaries.set(selection.id, {
        title: selection.title,
        imageUrl: selection.photoUrl,
        thumbnailUrl: selection.photoThumbnailUrl,
      })
    for (const home of houses)
      summaries.set(home.id, {
        title: home.title,
        imageUrl: home.photoUrl,
        thumbnailUrl: home.photoThumbnailUrl,
      })
    const dateRange: string[] = []
    for (let date = from; date <= to; date = addCivilDays(date, 1)) dateRange.push(date)
    const days = dateRange.map((date) => {
      const slot = (period: 'lunch' | 'dinner') => {
        const meal = meals.find(
          (candidate) => candidate.date === date && candidate.period === period,
        )
        const reference = meal?.deliverySelectionId ?? meal?.homeRecipeId
        const summary = reference ? summaries.get(reference) : undefined
        return {
          date,
          period,
          meal: meal
            ? {
                id: meal.id,
                category: meal.category,
                origin: meal.origin,
                title: summary?.title ?? (meal.restaurantName || 'Restaurant'),
                recipeId: meal.homeRecipeId,
                selectionId: meal.deliverySelectionId,
                restaurantName: meal.restaurantName,
                notes: meal.notes,
                imageUrl: summary?.imageUrl ?? null,
                thumbnailUrl: summary?.thumbnailUrl ?? null,
              }
            : null,
        }
      }
      return {
        date,
        isDeliveryDay: cycles.some((cycle) => cycle.deliveryDate === date),
        lunch: slot('lunch'),
        dinner: slot('dinner'),
      }
    })
    return context.json({
      days,
      deliveryCycles: cycles.map((cycle) => ({
        id: cycle.id,
        deliveryDate: cycle.deliveryDate,
        periodStartDate: cycle.periodStartDate,
        periodEndDate: cycle.periodEndDate,
        lastSyncedAt: cycle.lastSyncedAt?.toISOString() ?? null,
        recipeCount: selections.filter((selection) => selection.deliveryCycleId === cycle.id)
          .length,
      })),
    })
  })

  router.get('/deliveries/:id', (context) => {
    const cycle = database
      .select()
      .from(deliveryCycle)
      .where(eq(deliveryCycle.id, context.req.param('id')))
      .get()
    if (!cycle) return context.json({ error: 'Livraison introuvable.' }, 404)
    const selections = database
      .select()
      .from(deliverySelection)
      .where(eq(deliverySelection.deliveryCycleId, cycle.id))
      .orderBy(asc(deliverySelection.sourcePosition), asc(deliverySelection.occurrence))
      .all()
    return context.json({ cycle, selections })
  })

  router.post('/quitoque/sync', async (context) => {
    if (!quitoque)
      return context.json({ error: 'La connexion Quitoque n’est pas configurée.' }, 503)
    try {
      const deliveries = await quitoque.listDeliveries()
      const now = new Date()
      let added = 0
      let updated = 0
      let invalidDeliveryDates = 0
      database.transaction((tx) => {
        for (const delivery of deliveries) {
          const deliveryDate = dayFromApi(delivery.deliveryDate)
          if (!deliveryDate) {
            invalidDeliveryDates += 1
            continue
          }
          const old = tx
            .select({ id: deliveryCycle.id })
            .from(deliveryCycle)
            .where(eq(deliveryCycle.externalOrderId, delivery.externalOrderId))
            .get()
          if (old) updated += 1
          else added += 1
          tx.insert(deliveryCycle)
            .values({
              id: old?.id ?? randomUUID(),
              externalOrderId: delivery.externalOrderId,
              deliveryDate,
              periodStartDate: dayFromApi(delivery.periodStartDate),
              periodEndDate: dayFromApi(delivery.periodEndDate),
              lastSyncedAt: now,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: deliveryCycle.externalOrderId,
              set: {
                deliveryDate,
                periodStartDate: dayFromApi(delivery.periodStartDate),
                periodEndDate: dayFromApi(delivery.periodEndDate),
                lastSyncedAt: now,
                updatedAt: now,
              },
            })
            .run()
        }
      })
      return context.json({
        added,
        updated,
        invalidDeliveryDates,
        completedAt: now.toISOString(),
      })
    } catch (error) {
      return context.json(
        {
          error:
            error instanceof QuitoqueApiError
              ? error.message
              : 'La synchronisation Quitoque a échoué.',
        },
        502,
      )
    }
  })

  router.post('/deliveries/:id/recipes/sync', async (context) => {
    if (!quitoque)
      return context.json({ error: 'La connexion Quitoque n’est pas configurée.' }, 503)
    const cycle = database
      .select()
      .from(deliveryCycle)
      .where(eq(deliveryCycle.id, context.req.param('id')))
      .get()
    if (!cycle) return context.json({ error: 'Livraison introuvable.' }, 404)
    try {
      const imported = await quitoque.listSelectedRecipes(cycle.externalOrderId)
      const now = new Date()
      let added = 0
      let updated = 0
      database.transaction((tx) => {
        const seen = new Set<string>()
        for (const item of imported) {
          const unique = `${item.sourceItemId}:${item.occurrence}`
          seen.add(unique)
          const existing = tx
            .select({ id: deliverySelection.id })
            .from(deliverySelection)
            .where(
              and(
                eq(deliverySelection.deliveryCycleId, cycle.id),
                eq(deliverySelection.sourceItemId, item.sourceItemId),
                eq(deliverySelection.occurrence, item.occurrence),
              ),
            )
            .get()
          if (existing) updated += 1
          else added += 1
          const values = selectionValues(cycle.id, item, now, existing?.id ?? randomUUID())
          tx.insert(deliverySelection)
            .values(values)
            .onConflictDoUpdate({
              target: [
                deliverySelection.deliveryCycleId,
                deliverySelection.sourceItemId,
                deliverySelection.occurrence,
              ],
              set: omit(values, 'id', 'createdAt'),
            })
            .run()
        }
        const old = tx
          .select()
          .from(deliverySelection)
          .where(eq(deliverySelection.deliveryCycleId, cycle.id))
          .all()
        for (const item of old)
          if (!seen.has(`${item.sourceItemId}:${item.occurrence}`))
            tx.update(deliverySelection)
              .set({ isAvailable: false, updatedAt: now })
              .where(eq(deliverySelection.id, item.id))
              .run()
        tx.update(deliveryCycle)
          .set({ recipesSyncedAt: now, updatedAt: now })
          .where(eq(deliveryCycle.id, cycle.id))
          .run()
      })
      return context.json({
        added,
        updated,
        unavailable: imported.filter((item) => !item.isAvailable).length,
        completedAt: now.toISOString(),
      })
    } catch (error) {
      return context.json(
        {
          error:
            error instanceof QuitoqueApiError
              ? error.message
              : 'La sélection Quitoque n’a pas pu être synchronisée.',
        },
        502,
      )
    }
  })

  router.post('/deliveries/:id/distribute', async (context) => {
    const cycle = database
      .select()
      .from(deliveryCycle)
      .where(eq(deliveryCycle.id, context.req.param('id')))
      .get()
    if (!cycle) return context.json({ error: 'Livraison introuvable.' }, 404)
    const body = z
      .object({
        confirmed: z.boolean().default(false),
        replaceManual: z.boolean().default(false),
      })
      .safeParse(await context.req.json().catch(() => ({})))
    if (!body.success) return context.json({ error: 'Confirmation invalide.' }, 400)
    const currentSession = context.get('session')
    const preferences = getHouseholdPlanningPreferences(database, currentSession.user.id)
    const shouldPreserveManual = preferences.preserveManualMeals && !body.data.replaceManual

    const slots = deliveryCycleSlots(cycle.deliveryDate)
    const selected = database
      .select()
      .from(deliverySelection)
      .where(
        and(
          eq(deliverySelection.deliveryCycleId, cycle.id),
          eq(deliverySelection.isAvailable, true),
        ),
      )
      .orderBy(asc(deliverySelection.sourcePosition), asc(deliverySelection.occurrence))
      .all()
    const existing = database
      .select()
      .from(plannedMeal)
      .where(eq(plannedMeal.deliveryCycleId, cycle.id))
      .all()
    const automatic = existing.filter((meal) => meal.origin === 'automatic')
    const occupied = database
      .select()
      .from(plannedMeal)
      .where(and(gte(plannedMeal.date, slots[0]!.date), lte(plannedMeal.date, slots.at(-1)!.date)))
      .all()
    const preservedMeals = shouldPreserveManual
      ? occupied.filter(
          (meal) => !(meal.origin === 'automatic' && meal.deliveryCycleId === cycle.id),
        )
      : []
    const manuallyUsedSelections = new Set(
      preservedMeals
        .filter((meal) => meal.origin === 'manual' && meal.deliverySelectionId)
        .map((meal) => meal.deliverySelectionId!),
    )
    const remainingSelections = selected.filter(
      (selection) => !manuallyUsedSelections.has(selection.id),
    )
    const preservedManual = slots.filter((slot) =>
      preservedMeals.some(
        (meal) =>
          meal.date === slot.date && meal.period === slot.period && meal.origin === 'manual',
      ),
    )
    const mealsToReplace = shouldPreserveManual ? automatic : occupied
    const availableSlots = slots.filter(
      (slot) =>
        !preservedMeals.some((meal) => meal.date === slot.date && meal.period === slot.period),
    ).length
    if (mealsToReplace.length && !body.data.confirmed)
      return context.json(
        {
          error: 'Confirmez le remplacement de la répartition existante.',
          preview: {
            toReplace: mealsToReplace.length,
            availableSlots,
            recipeCount: selected.length,
          },
        },
        409,
      )

    const selectionCalories = new Map(selected.map((item) => [item.id, item.caloriesKcal]))
    const occupiedForSolver = preservedMeals.map((meal) => ({
      date: meal.date,
      period: meal.period,
      caloriesKcal: meal.deliverySelectionId
        ? (selectionCalories.get(meal.deliverySelectionId) ?? null)
        : null,
    }))

    const plan = autoDistributeSelections(
      cycle.deliveryDate,
      remainingSelections.map((item) => ({
        id: item.id,
        title: item.title,
        totalMinutes: item.totalMinutes,
        caloriesKcal: item.caloriesKcal,
        ingredientsJson: item.ingredientsJson,
      })),
      occupiedForSolver,
      preferences,
    )

    const now = new Date()
    let assigned = 0
    const preserved = preservedManual.length
    database.transaction((tx) => {
      for (const meal of mealsToReplace) {
        tx.delete(plannedMeal).where(eq(plannedMeal.id, meal.id)).run()
      }
      for (const item of plan) {
        const any = tx
          .select()
          .from(plannedMeal)
          .where(and(eq(plannedMeal.date, item.date), eq(plannedMeal.period, item.period)))
          .get()
        if (any) continue
        tx.insert(plannedMeal)
          .values({
            id: randomUUID(),
            date: item.date,
            period: item.period,
            category: 'quitoque',
            origin: 'automatic',
            deliveryCycleId: cycle.id,
            deliverySelectionId: item.selectionId,
            homeRecipeId: null,
            restaurantName: null,
            notes: null,
            createdAt: now,
            updatedAt: now,
          })
          .run()
        assigned += 1
      }
    })
    const occupiedAfter = database
      .select()
      .from(plannedMeal)
      .where(and(gte(plannedMeal.date, slots[0]!.date), lte(plannedMeal.date, slots.at(-1)!.date)))
      .all()
    const filled = slots.filter((slot) =>
      occupiedAfter.some((meal) => meal.date === slot.date && meal.period === slot.period),
    ).length
    return context.json({
      assigned,
      leftEmpty: slots.length - filled,
      preserved,
      unassigned: Math.max(0, selected.length - assigned - manuallyUsedSelections.size),
      slots: slots.length,
    })
  })

  router.put('/slots', async (context) => {
    const body = slotBodySchema.safeParse(await context.req.json().catch(() => null))
    if (!body.success) return context.json({ error: 'Repas invalide.' }, 400)
    const value = body.data
    let deliveryCycleId: string | null = null
    if (value.category === 'home') {
      const found = database
        .select({ id: recipe.id })
        .from(recipe)
        .where(and(eq(recipe.id, value.recipeId), eq(recipe.source, 'house')))
        .get()
      if (!found) return context.json({ error: 'Recette maison introuvable.' }, 404)
    }
    if (value.category === 'quitoque') {
      const selection = database
        .select()
        .from(deliverySelection)
        .where(eq(deliverySelection.id, value.selectionId))
        .get()
      if (!selection?.isAvailable)
        return context.json({ error: 'Sélection Quitoque indisponible.' }, 404)
      const existingUse = database
        .select()
        .from(plannedMeal)
        .where(eq(plannedMeal.deliverySelectionId, selection.id))
        .get()
      if (existingUse && (existingUse.date !== value.date || existingUse.period !== value.period))
        return context.json(
          {
            error: 'Cette occurrence Quitoque est déjà affectée à un autre créneau.',
          },
          409,
        )
      const cycle = database
        .select()
        .from(deliveryCycle)
        .where(eq(deliveryCycle.id, selection.deliveryCycleId))
        .get()
      if (
        !cycle ||
        !deliveryCycleSlots(cycle.deliveryDate).some(
          (slot) => slot.date === value.date && slot.period === value.period,
        )
      )
        return context.json(
          { error: 'Cette recette ne correspond pas au créneau de livraison.' },
          400,
        )
      deliveryCycleId = cycle.id
    }
    const now = new Date()
    const values = {
      id: randomUUID(),
      date: value.date,
      period: value.period,
      category: value.category,
      origin: 'manual' as const,
      deliveryCycleId,
      deliverySelectionId: value.category === 'quitoque' ? value.selectionId : null,
      homeRecipeId: value.category === 'home' ? value.recipeId : null,
      restaurantName: value.category === 'restaurant' ? (value.restaurantName ?? null) : null,
      notes: value.category === 'restaurant' ? (value.notes ?? null) : null,
      createdAt: now,
      updatedAt: now,
    }
    database
      .insert(plannedMeal)
      .values(values)
      .onConflictDoUpdate({
        target: [plannedMeal.date, plannedMeal.period],
        set: { ...omit(values, 'id', 'createdAt'), updatedAt: now },
      })
      .run()
    return context.json({ saved: true })
  })

  router.delete('/slots/:date/:period', (context) => {
    const date = civilDateSchema.safeParse(context.req.param('date'))
    const period = mealPeriodSchema.safeParse(context.req.param('period'))
    if (!date.success || !period.success) return context.json({ error: 'Créneau invalide.' }, 400)
    database
      .delete(plannedMeal)
      .where(and(eq(plannedMeal.date, date.data), eq(plannedMeal.period, period.data)))
      .run()
    return context.json({ cleared: true })
  })

  router.post('/slots/move', async (context) => {
    const body = moveBodySchema.safeParse(await context.req.json().catch(() => null))
    if (!body.success) return context.json({ error: 'Déplacement invalide.' }, 400)
    const value = body.data
    const meal = database
      .select()
      .from(plannedMeal)
      .where(and(eq(plannedMeal.date, value.fromDate), eq(plannedMeal.period, value.fromPeriod)))
      .get()
    if (!meal) return context.json({ error: 'Aucun repas à déplacer.' }, 404)
    if (value.fromDate === value.toDate && value.fromPeriod === value.toPeriod)
      return context.json({ moved: true, swapped: false })
    const occupied = database
      .select()
      .from(plannedMeal)
      .where(and(eq(plannedMeal.date, value.toDate), eq(plannedMeal.period, value.toPeriod)))
      .get()
    const checkQuitoqueTarget = (
      item: typeof meal,
      targetDate: string,
      targetPeriod: 'lunch' | 'dinner',
    ) => {
      if (item.category !== 'quitoque' || !item.deliveryCycleId) return true
      const cycle = database
        .select()
        .from(deliveryCycle)
        .where(eq(deliveryCycle.id, item.deliveryCycleId))
        .get()
      return Boolean(
        cycle &&
        deliveryCycleSlots(cycle.deliveryDate).some(
          (slot) => slot.date === targetDate && slot.period === targetPeriod,
        ),
      )
    }
    if (!checkQuitoqueTarget(meal, value.toDate, value.toPeriod))
      return context.json(
        {
          error: 'Une recette Quitoque doit rester dans les créneaux de sa livraison.',
        },
        400,
      )
    if (occupied && !checkQuitoqueTarget(occupied, value.fromDate, value.fromPeriod))
      return context.json(
        {
          error: 'Une recette Quitoque doit rester dans les créneaux de sa livraison.',
        },
        400,
      )
    const now = new Date()
    if (occupied) {
      database.transaction((tx) => {
        tx.update(plannedMeal)
          .set({ date: '__swap__', updatedAt: now })
          .where(eq(plannedMeal.id, occupied.id))
          .run()
        tx.update(plannedMeal)
          .set({
            date: value.toDate,
            period: value.toPeriod,
            origin: 'manual',
            updatedAt: now,
          })
          .where(eq(plannedMeal.id, meal.id))
          .run()
        tx.update(plannedMeal)
          .set({
            date: value.fromDate,
            period: value.fromPeriod,
            origin: 'manual',
            updatedAt: now,
          })
          .where(eq(plannedMeal.id, occupied.id))
          .run()
      })
      return context.json({ moved: true, swapped: true })
    }
    database
      .update(plannedMeal)
      .set({
        date: value.toDate,
        period: value.toPeriod,
        origin: 'manual',
        updatedAt: now,
      })
      .where(eq(plannedMeal.id, meal.id))
      .run()
    return context.json({ moved: true, swapped: false })
  })

  return router
}

function selectionValues(cycleId: string, item: QuitoqueDeliverySelection, now: Date, id: string) {
  return {
    id,
    deliveryCycleId: cycleId,
    sourceItemId: item.sourceItemId,
    sourceProductId: item.productId,
    sourcePosition: item.sourcePosition,
    occurrence: item.occurrence,
    quantity: item.quantity,
    isAvailable: item.isAvailable,
    title: item.title,
    description: item.description,
    photoUrl: item.imageUrl,
    photoThumbnailUrl: item.thumbnailUrl,
    totalMinutes: item.totalMinutes,
    nutriScore: item.nutriScore,
    carbonScore: item.carbonScore,
    ingredientsJson: JSON.stringify(item.ingredients),
    stepsJson: JSON.stringify(item.steps),
    updatedAt: now,
    createdAt: now,
  }
}
