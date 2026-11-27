import { randomUUID } from 'node:crypto'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { LRUCache } from 'lru-cache'
import { z } from 'zod'
import { type ApiHonoEnvironment, requireSession } from '../app.js'
import type { AuthInstance } from '../auth.js'
import type { DatabaseClient } from '../db/connection.js'
import { fridgeItem, recipe, recipeFavorite, recipeIngredient } from '../db/schema.js'
import { type ExternalCatalogItem, searchExternalCatalog } from '../recipes/catalog-search.js'
import {
  buildWebSearchCombinations,
  foldFrench,
  matchRecipesWithFridge,
  normalizeIngredientForMatch,
  parseFridgeQuickInput,
} from './matcher.js'

const fridgeZoneSchema = z.enum(['fridge', 'pantry', 'freezer'])
const civilDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ).')

const createFridgeItemSchema = z
  .object({
    input: z.string().trim().min(1).max(160).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    quantity: z.string().trim().max(32).nullable().optional(),
    unit: z.string().trim().max(32).nullable().optional(),
    zone: fridgeZoneSchema.default('fridge'),
    expiresOn: civilDateSchema.nullable().optional(),
  })
  .refine((data) => Boolean(data.input || data.name), {
    message: 'Un ingrédient est requis.',
  })

const updateFridgeItemSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  quantity: z.string().trim().max(32).nullable().optional(),
  unit: z.string().trim().max(32).nullable().optional(),
  zone: fridgeZoneSchema.optional(),
  expiresOn: civilDateSchema.nullable().optional(),
})

export type FridgeRoutesDependencies = {
  fetchOffSuggestions?: (query: string) => Promise<string[]>
  searchCatalog?: (query: string) => Promise<{ items: ExternalCatalogItem[] }>
  now?: () => Date
}

const offSuggestionsCache = new LRUCache<string, string[]>({
  max: 200,
  ttl: 10 * 60 * 1000,
})

async function defaultFetchOffSuggestions(query: string): Promise<string[]> {
  const key = foldFrench(query)
  if (key.length < 2) return []

  const cached = offSuggestionsCache.get(key)
  if (cached) return cached

  const url = `https://fr.openfoodfacts.org/cgi/suggest.pl?tagtype=ingredients&lc=fr&string=${encodeURIComponent(query)}`
  const response = await fetch(url, {
    signal: AbortSignal.timeout(1500),
    headers: {
      accept: 'application/json',
      'user-agent': 'Quisera/1.0 (private household app)',
    },
  })
  if (!response.ok) return []

  const data = (await response.json()) as unknown
  if (!Array.isArray(data)) return []
  const cleaned = data
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .slice(0, 12)
  offSuggestionsCache.set(key, cleaned)
  return cleaned
}

function capitalizeSuggestion(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

function parseSimpleQuantity(value: string | null): number | null {
  if (!value) return null
  const normalized = value.trim().replace(',', '.')
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function formatMergedQuantity(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toFixed(2))).replace('.', ',')
}

function toCivilToday(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function createFridgeRoutes(
  database: DatabaseClient,
  auth: AuthInstance,
  deps: FridgeRoutesDependencies = {},
) {
  const routes = new Hono<ApiHonoEnvironment>()
  const fetchOffSuggestions = deps.fetchOffSuggestions ?? defaultFetchOffSuggestions
  const searchCatalog =
    deps.searchCatalog ?? ((query: string) => searchExternalCatalog('all', query, 4))
  const getNow = deps.now ?? (() => new Date())

  routes.use('*', requireSession(auth))

  routes.get('/', (context) => {
    const items = database
      .select()
      .from(fridgeItem)
      .orderBy(
        sql`CASE WHEN ${fridgeItem.expiresOn} IS NULL THEN 1 ELSE 0 END`,
        asc(fridgeItem.expiresOn),
        asc(fridgeItem.name),
      )
      .all()

    return context.json({ items })
  })

  routes.post('/', async (context) => {
    const parsedBody = createFridgeItemSchema.safeParse(await context.req.json().catch(() => null))
    if (!parsedBody.success) {
      return context.json(
        { error: parsedBody.error.issues[0]?.message ?? 'Ingrédient invalide.' },
        400,
      )
    }

    const data = parsedBody.data
    const parsedInput = data.input ? parseFridgeQuickInput(data.input) : null
    const name = (data.name ?? parsedInput?.name ?? '').trim()
    if (!name) {
      return context.json({ error: 'Le nom de l’ingrédient est requis.' }, 400)
    }

    const quantity =
      data.quantity !== undefined ? data.quantity || null : (parsedInput?.quantity ?? null)
    const unit = data.unit !== undefined ? data.unit || null : (parsedInput?.unit ?? null)
    const zone = data.zone
    const expiresOn = data.expiresOn ?? null
    const normalizedName = normalizeIngredientForMatch(name) || foldFrench(name)
    const now = getNow()

    // Smart duplicate merge: same normalizedName + same zone + same/null expiresOn + compatible unit
    const candidates = database
      .select()
      .from(fridgeItem)
      .where(eq(fridgeItem.normalizedName, normalizedName))
      .all()

    const normalizedUnit = foldFrench(unit ?? '')
    const mergeTarget = candidates.find(
      (candidate) =>
        candidate.zone === zone &&
        (candidate.expiresOn ?? null) === expiresOn &&
        foldFrench(candidate.unit ?? '') === normalizedUnit,
    )

    if (mergeTarget) {
      const existingQty = parseSimpleQuantity(mergeTarget.quantity)
      const incomingQty = parseSimpleQuantity(quantity)
      const mergedQuantity =
        existingQty !== null && incomingQty !== null
          ? formatMergedQuantity(existingQty + incomingQty)
          : (quantity ?? mergeTarget.quantity)

      database
        .update(fridgeItem)
        .set({
          quantity: mergedQuantity,
          updatedAt: now,
        })
        .where(eq(fridgeItem.id, mergeTarget.id))
        .run()

      const updated = database
        .select()
        .from(fridgeItem)
        .where(eq(fridgeItem.id, mergeTarget.id))
        .get()

      return context.json({ item: updated, merged: true }, 200)
    }

    const id = randomUUID()
    database
      .insert(fridgeItem)
      .values({
        id,
        name,
        normalizedName,
        quantity,
        unit,
        zone,
        expiresOn,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    const created = database.select().from(fridgeItem).where(eq(fridgeItem.id, id)).get()
    return context.json({ item: created, merged: false }, 201)
  })

  routes.patch('/:id', async (context) => {
    const id = context.req.param('id')
    const existing = database.select().from(fridgeItem).where(eq(fridgeItem.id, id)).get()
    if (!existing) {
      return context.json({ error: 'Ingrédient introuvable.' }, 404)
    }

    const parsedBody = updateFridgeItemSchema.safeParse(await context.req.json().catch(() => null))
    if (!parsedBody.success) {
      return context.json(
        { error: parsedBody.error.issues[0]?.message ?? 'Mise à jour invalide.' },
        400,
      )
    }

    const data = parsedBody.data
    const nextName = data.name ?? existing.name
    const nextNormalized =
      data.name !== undefined
        ? normalizeIngredientForMatch(nextName) || foldFrench(nextName)
        : existing.normalizedName

    database
      .update(fridgeItem)
      .set({
        name: nextName,
        normalizedName: nextNormalized,
        quantity: data.quantity !== undefined ? data.quantity || null : existing.quantity,
        unit: data.unit !== undefined ? data.unit || null : existing.unit,
        zone: data.zone ?? existing.zone,
        expiresOn: data.expiresOn !== undefined ? data.expiresOn : existing.expiresOn,
        updatedAt: getNow(),
      })
      .where(eq(fridgeItem.id, id))
      .run()

    const updated = database.select().from(fridgeItem).where(eq(fridgeItem.id, id)).get()
    return context.json({ item: updated })
  })

  routes.delete('/:id', (context) => {
    const id = context.req.param('id')
    const existing = database.select().from(fridgeItem).where(eq(fridgeItem.id, id)).get()
    if (!existing) {
      return context.json({ error: 'Ingrédient introuvable.' }, 404)
    }
    database.delete(fridgeItem).where(eq(fridgeItem.id, id)).run()
    return context.body(null, 204)
  })

  routes.get('/suggest', async (context) => {
    const query = (context.req.query('q') ?? '').trim()
    const foldedQuery = foldFrench(query)
    if (foldedQuery.length < 2) {
      return context.json({ suggestions: [] })
    }

    const localRows = database
      .selectDistinct({ name: recipeIngredient.name })
      .from(recipeIngredient)
      .where(sql`fold_fr(${recipeIngredient.name}) LIKE ${`%${foldedQuery}%`}`)
      .limit(8)
      .all()

    let offResults: string[] = []
    try {
      offResults = await fetchOffSuggestions(query)
    } catch {
      // Progressive enhancement: silently degrade to local recipe ingredients
      offResults = []
    }

    const seen = new Set<string>()
    const suggestions: string[] = []

    for (const raw of [...localRows.map((row) => row.name), ...offResults]) {
      const display = capitalizeSuggestion(raw)
      const key = foldFrench(display)
      if (!key || seen.has(key)) continue
      seen.add(key)
      suggestions.push(display)
      if (suggestions.length >= 10) break
    }

    return context.json({ suggestions })
  })

  routes.get('/matches', (context) => {
    const includeStaples = context.req.query('includeStaples') === 'true'
    const itemIdsParam = (context.req.query('itemIds') ?? '').trim()
    const selectedIds = itemIdsParam
      ? itemIdsParam
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : null

    const items = selectedIds?.length
      ? database.select().from(fridgeItem).where(inArray(fridgeItem.id, selectedIds)).all()
      : database.select().from(fridgeItem).all()

    if (items.length === 0) {
      return context.json({ matches: [], fridgeItemCount: 0 })
    }

    // House recipes + Quitoque recipes favorited by any household member
    const householdFavIds = new Set(
      database
        .selectDistinct({ recipeId: recipeFavorite.recipeId })
        .from(recipeFavorite)
        .all()
        .map((row) => row.recipeId),
    )

    const allRecipes = database.select({ id: recipe.id, source: recipe.source }).from(recipe).all()

    const eligibleRecipeIds = allRecipes
      .filter((row) => row.source === 'house' || householdFavIds.has(row.id))
      .map((row) => row.id)

    if (eligibleRecipeIds.length === 0) {
      return context.json({ matches: [], fridgeItemCount: items.length })
    }

    const ingredientRows = database
      .select({ recipeId: recipeIngredient.recipeId, name: recipeIngredient.name })
      .from(recipeIngredient)
      .where(inArray(recipeIngredient.recipeId, eligibleRecipeIds))
      .all()

    const ingredientsByRecipe = new Map<string, string[]>()
    for (const row of ingredientRows) {
      const list = ingredientsByRecipe.get(row.recipeId) ?? []
      list.push(row.name)
      ingredientsByRecipe.set(row.recipeId, list)
    }

    const recipesForMatching = eligibleRecipeIds.map((id) => ({
      id,
      ingredients: ingredientsByRecipe.get(id) ?? [],
    }))

    const matches = matchRecipesWithFridge(items, recipesForMatching, {
      today: toCivilToday(getNow()),
      includeStaples,
    })

    return context.json({ matches, fridgeItemCount: items.length })
  })

  routes.get('/discover', async (context) => {
    const itemIdsParam = (context.req.query('itemIds') ?? '').trim()
    const rawIds = itemIdsParam
      ? itemIdsParam
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
          .slice(0, 3)
      : []

    const selectedItems = rawIds.length
      ? (() => {
          const rows = database
            .select()
            .from(fridgeItem)
            .where(inArray(fridgeItem.id, rawIds))
            .all()
          const byId = new Map(rows.map((row) => [row.id, row]))
          return rawIds
            .map((id) => byId.get(id))
            .filter((row): row is NonNullable<typeof row> => Boolean(row))
        })()
      : database
          .select()
          .from(fridgeItem)
          .orderBy(
            sql`CASE WHEN ${fridgeItem.expiresOn} IS NULL THEN 1 ELSE 0 END`,
            asc(fridgeItem.expiresOn),
          )
          .limit(3)
          .all()

    if (selectedItems.length === 0) {
      return context.json({ items: [], queriesRun: 0, selectedIngredients: [] })
    }

    const ingredientNames = selectedItems.map((item) => item.name)
    const combinations = buildWebSearchCombinations(ingredientNames)

    const settled = await Promise.allSettled(
      combinations.map(async (combo) => {
        const query = combo.map((name) => normalizeIngredientForMatch(name) || name).join(' ')
        const result = await searchCatalog(query)
        return { combo, items: result.items }
      }),
    )

    const byUrl = new Map<string, ExternalCatalogItem & { matchedIngredients: string[] }>()

    for (const outcome of settled) {
      if (outcome.status !== 'fulfilled') continue
      const { combo, items } = outcome.value
      for (const item of items) {
        const existing = byUrl.get(item.url)
        if (!existing || combo.length > existing.matchedIngredients.length) {
          byUrl.set(item.url, {
            ...item,
            matchedIngredients: combo,
          })
        }
      }
    }

    const deduped = [...byUrl.values()].toSorted((a, b) => {
      if (b.matchedIngredients.length !== a.matchedIngredients.length) {
        return b.matchedIngredients.length - a.matchedIngredients.length
      }
      return a.title.localeCompare(b.title, 'fr')
    })

    return context.json({
      items: deduped.slice(0, 30),
      queriesRun: combinations.length,
      selectedIngredients: ingredientNames,
    })
  })

  return routes
}
