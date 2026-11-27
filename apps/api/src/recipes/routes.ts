import {
  recipeWriteSchema,
  type RecipeDetail,
  type RecipeListResponse,
  type RecipeMetric,
  type RecipeNutrition,
  type RecipeSummary,
  type RecipeWriteInput,
} from '@quisera/shared'
import { scaleIngredientsForServings } from '@quisera/shared/servings'
import { getHouseholdPlanningPreferences } from '../household/routes.js'
import { and, asc, count, desc, eq, exists, inArray, or, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Hono } from 'hono'
import { LRUCache } from 'lru-cache'
import sharp from 'sharp'
import { z } from 'zod'
import type { ApiHonoEnvironment } from '../app.js'
import { requireSession } from '../app.js'
import { foldFrenchSearchText, type DatabaseClient } from '../db/connection.js'
import {
  recipe,
  recipeFavorite,
  recipeIngredient,
  recipeMetric,
  plannedMeal,
  recipeStep,
  recipeTag,
  recipeTagAssignment,
} from '../db/schema.js'
import { searchExternalCatalog } from './catalog-search.js'
import { importRecipeFromUrl, RecipeImportError } from './importer.js'

const querySchema = z.object({
  q: z.string().trim().max(100).default(''),
  source: z.enum(['all', 'house', 'quitoque']).default('all'),
  category: z.string().trim().max(80).default(''),
  sort: z.enum(['recent', 'title', 'time']).default('recent'),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(10_000).default(24),
})

const photoContentTypes = {
  'image/jpeg': {
    expectedFormats: ['jpeg'],
    outputFormat: 'jpeg',
    mimeType: 'image/jpeg',
    extension: 'jpg',
  },
  'image/png': {
    expectedFormats: ['png'],
    outputFormat: 'png',
    mimeType: 'image/png',
    extension: 'png',
  },
  'image/webp': {
    expectedFormats: ['webp'],
    outputFormat: 'webp',
    mimeType: 'image/webp',
    extension: 'webp',
  },
  'image/avif': {
    expectedFormats: ['avif', 'heif'],
    outputFormat: 'avif',
    mimeType: 'image/avif',
    extension: 'avif',
  },
  'image/heic': {
    expectedFormats: ['heif'],
    outputFormat: 'webp',
    mimeType: 'image/webp',
    extension: 'webp',
  },
  'image/heif': {
    expectedFormats: ['heif'],
    outputFormat: 'webp',
    mimeType: 'image/webp',
    extension: 'webp',
  },
} as const

const thumbnailCache = new LRUCache<string, Uint8Array>({
  max: 200,
  ttl: 60 * 60 * 1000,
})

const maximumPhotoBytes = 8 * 1024 * 1024

type PhotoUpload = {
  key: string
  mimeType: string
  bytes: Uint8Array
}

type ParsedRecipeBody =
  | { error: string; fields?: string[]; status?: 413 }
  | { data: RecipeWriteInput; photo: PhotoUpload | null }

type Decorations = {
  category: string | null
  tags: string[]
  metrics: RecipeMetric[]
  isFavorite: boolean
}

function normalizeLabel(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('fr')
}

function escapeLike(value: string) {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`
}

async function parseRecipeBody(request: Request): Promise<ParsedRecipeBody> {
  let payload: unknown
  let file: File | null = null

  try {
    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      const form = await request.formData()
      payload = JSON.parse(String(form.get('recipe') ?? ''))
      const candidate = form.get('image')
      if (candidate instanceof File) file = candidate
      else if (candidate !== null) return { error: 'Fichier photo invalide.' as const }
    } else {
      payload = await request.json()
    }
  } catch {
    return { error: 'Corps de requête invalide.' as const }
  }

  const result = recipeWriteSchema.safeParse(payload)
  if (!result.success) {
    return {
      error: 'Vérifiez les champs de la recette.' as const,
      fields: [
        ...new Set(
          result.error.issues
            .map((issue) => issue.path[0])
            .filter((part): part is string => typeof part === 'string'),
        ),
      ],
    }
  }

  if (file) {
    if (file.size === 0 || file.size > maximumPhotoBytes) {
      return {
        error: 'La photo doit peser au maximum 8 Mo.' as const,
        status: 413,
      }
    }
    const rule = photoContentTypes[file.type as keyof typeof photoContentTypes]
    if (!rule) {
      return { error: 'Format photo accepté : JPEG, PNG, WebP, AVIF ou HEIC.' as const }
    }
    const rawBytes = new Uint8Array(await file.arrayBuffer())
    try {
      const processor = sharp(rawBytes, { limitInputPixels: 40_000_000 })
      const metadata = await processor.metadata()
      if (
        !metadata.format ||
        !(rule.expectedFormats as readonly string[]).includes(metadata.format)
      ) {
        return {
          error: 'Le contenu du fichier ne correspond pas à son format.' as const,
        }
      }
      const pipeline = processor
        .rotate()
        .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      const encoded =
        rule.outputFormat === 'jpeg'
          ? await pipeline.jpeg({ quality: 86, mozjpeg: true }).toBuffer()
          : rule.outputFormat === 'png'
            ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
            : rule.outputFormat === 'avif'
              ? await pipeline.avif({ quality: 72 }).toBuffer()
              : await pipeline.webp({ quality: 84 }).toBuffer()

      return {
        data: result.data,
        photo: {
          key: `${randomUUID()}.${rule.extension}`,
          mimeType: rule.mimeType,
          bytes: new Uint8Array(encoded),
        },
      }
    } catch {
      return {
        error: 'Le contenu du fichier ne correspond pas à son format.' as const,
      }
    }
  }

  return { data: result.data, photo: null }
}

async function storePhoto(directory: string, photo: PhotoUpload) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const filePath = join(directory, photo.key)
  await writeFile(filePath, photo.bytes, { flag: 'wx', mode: 0o600 })
  return filePath
}

async function removePhoto(directory: string, key: string | null | undefined) {
  if (key) await rm(join(directory, key), { force: true })
}

function withRecipeFilters(
  database: DatabaseClient,
  userId: string,
  filters: z.infer<typeof querySchema>,
  favoritesOnly: boolean,
) {
  const conditions = []
  if (filters.source !== 'all') {
    conditions.push(eq(recipe.source, filters.source))
  }
  if (filters.category) {
    const categoryName = normalizeLabel(filters.category)
    conditions.push(
      exists(
        database
          .select({ value: sql`1` })
          .from(recipeTagAssignment)
          .innerJoin(recipeTag, eq(recipeTagAssignment.tagId, recipeTag.id))
          .where(
            and(
              eq(recipeTagAssignment.recipeId, recipe.id),
              eq(recipeTag.kind, 'category'),
              eq(recipeTag.normalizedName, categoryName),
            ),
          ),
      ),
    )
  }
  if (favoritesOnly) {
    conditions.push(
      exists(
        database
          .select({ value: sql`1` })
          .from(recipeFavorite)
          .where(and(eq(recipeFavorite.recipeId, recipe.id), eq(recipeFavorite.userId, userId))),
      ),
    )
  }
  if (filters.q) {
    const pattern = escapeLike(foldFrenchSearchText(filters.q))
    conditions.push(
      or(
        sql`fold_fr(${recipe.title}) LIKE ${pattern} ESCAPE ${'\\'}`,
        sql`fold_fr(coalesce(${recipe.description}, '')) LIKE ${pattern} ESCAPE ${'\\'}`,
      ),
    )
  }
  return conditions.length ? and(...conditions) : undefined
}

function listOrder(sort: z.infer<typeof querySchema>['sort']) {
  if (sort === 'title') return [asc(sql`lower(${recipe.title})`), asc(recipe.id)]
  if (sort === 'time') {
    return [asc(sql`${recipe.totalMinutes} IS NULL`), asc(recipe.totalMinutes), asc(recipe.id)]
  }
  return [desc(recipe.createdAt), desc(recipe.id)]
}

function readDecorations(database: DatabaseClient, recipeIds: string[], userId: string) {
  const result = new Map<string, Decorations>()
  for (const id of recipeIds) {
    result.set(id, { category: null, tags: [], metrics: [], isFavorite: false })
  }
  if (!recipeIds.length) return result

  const tagRows = database
    .select({
      recipeId: recipeTagAssignment.recipeId,
      kind: recipeTag.kind,
      name: recipeTag.name,
    })
    .from(recipeTagAssignment)
    .innerJoin(recipeTag, eq(recipeTag.id, recipeTagAssignment.tagId))
    .where(inArray(recipeTagAssignment.recipeId, recipeIds))
    .all()
  for (const row of tagRows) {
    const value = result.get(row.recipeId)
    if (!value) continue
    if (row.kind === 'category') value.category = row.name
    else value.tags.push(row.name)
  }

  const metrics = database
    .select()
    .from(recipeMetric)
    .where(inArray(recipeMetric.recipeId, recipeIds))
    .all()
  for (const metric of metrics) {
    result.get(metric.recipeId)?.metrics.push({
      key: metric.key,
      value: metric.value,
      unit: metric.unit,
      provenance: metric.provenance,
      method: metric.method,
      recordedAt: metric.recordedAt?.toISOString() ?? null,
    })
  }

  const favoriteRows = database
    .select({ recipeId: recipeFavorite.recipeId })
    .from(recipeFavorite)
    .where(and(eq(recipeFavorite.userId, userId), inArray(recipeFavorite.recipeId, recipeIds)))
    .all()
  for (const favorite of favoriteRows) {
    const value = result.get(favorite.recipeId)
    if (value) value.isFavorite = true
  }

  return result
}

function metricNumber(metrics: readonly RecipeMetric[], key: string): number | null {
  const found = metrics.find((item) => item.key === key)
  if (!found) return null
  const num = Number(found.value)
  return Number.isFinite(num) ? num : null
}

function nutritionFromMetrics(metrics: readonly RecipeMetric[]): RecipeNutrition | null {
  const caloriesKcal = metricNumber(metrics, 'calories')
  const proteinGrams = metricNumber(metrics, 'protein')
  const carbsGrams = metricNumber(metrics, 'carbs')
  const fatGrams = metricNumber(metrics, 'fat')
  const fiberGrams = metricNumber(metrics, 'fiber')
  const sugarGrams = metricNumber(metrics, 'sugar')
  const saltGrams = metricNumber(metrics, 'salt')
  if (
    caloriesKcal === null &&
    proteinGrams === null &&
    carbsGrams === null &&
    fatGrams === null &&
    fiberGrams === null &&
    sugarGrams === null &&
    saltGrams === null
  ) {
    return null
  }
  return {
    caloriesKcal: caloriesKcal !== null ? Math.round(caloriesKcal) : null,
    proteinGrams,
    carbsGrams,
    fatGrams,
    fiberGrams,
    sugarGrams,
    saltGrams,
  }
}

function toSummary(row: typeof recipe.$inferSelect, decorations: Decorations): RecipeSummary {
  return {
    id: row.id,
    source: row.source,
    title: row.title,
    description: row.description,
    imageUrl: row.photoKey ? `/api/recipes/${row.id}/photo` : row.photoUrl,
    thumbnailUrl:
      row.photoThumbnailUrl ??
      (row.photoKey ? `/api/recipes/${row.id}/photo?variant=thumb` : row.photoUrl),
    totalMinutes: row.totalMinutes,
    servings: row.servings,
    difficulty: row.difficulty,
    category: decorations.category,
    tags: decorations.tags,
    metrics: decorations.metrics,
    nutrition: nutritionFromMetrics(decorations.metrics),
    isFavorite: decorations.isFavorite,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function readRecipeSummaries(
  database: DatabaseClient,
  rows: (typeof recipe.$inferSelect)[],
  userId: string,
) {
  const decorations = readDecorations(
    database,
    rows.map((row) => row.id),
    userId,
  )
  return rows.map((row) => toSummary(row, decorations.get(row.id)!))
}

function listRecipes(
  database: DatabaseClient,
  userId: string,
  filters: z.infer<typeof querySchema>,
  favoritesOnly = false,
): RecipeListResponse {
  const where = withRecipeFilters(database, userId, filters, favoritesOnly)
  const total = where
    ? (database.select({ total: count() }).from(recipe).where(where).get()?.total ?? 0)
    : (database.select({ total: count() }).from(recipe).get()?.total ?? 0)
  const pageSize = Math.min(filters.pageSize, 50)
  const offset = (filters.page - 1) * pageSize
  const query = where ? database.select().from(recipe).where(where) : database.select().from(recipe)
  const rows = query
    .orderBy(...listOrder(filters.sort))
    .limit(pageSize)
    .offset(offset)
    .all()
  return {
    items: readRecipeSummaries(database, rows, userId),
    total,
    page: filters.page,
    pageSize,
  }
}

function readRecipeDetail(
  database: DatabaseClient,
  recipeId: string,
  userId: string,
): RecipeDetail | undefined {
  const row = database.select().from(recipe).where(eq(recipe.id, recipeId)).get()
  if (!row) return undefined
  const summary = readRecipeSummaries(database, [row], userId)[0]!
  const ingredients = database
    .select({
      name: recipeIngredient.name,
      quantity: recipeIngredient.quantity,
      unit: recipeIngredient.unit,
      notes: recipeIngredient.notes,
      position: recipeIngredient.position,
    })
    .from(recipeIngredient)
    .where(eq(recipeIngredient.recipeId, recipeId))
    .orderBy(asc(recipeIngredient.position))
    .all()
  const steps = database
    .select({
      instructions: recipeStep.instructions,
      position: recipeStep.position,
    })
    .from(recipeStep)
    .where(eq(recipeStep.recipeId, recipeId))
    .orderBy(asc(recipeStep.position))
    .all()
  return { ...summary, ingredients, steps }
}

function addRecipeContent(
  transaction: Parameters<Parameters<DatabaseClient['transaction']>[0]>[0],
  recipeId: string,
  input: z.infer<typeof recipeWriteSchema>,
) {
  for (const [position, ingredient] of input.ingredients.entries()) {
    transaction
      .insert(recipeIngredient)
      .values({ id: randomUUID(), recipeId, position, ...ingredient })
      .run()
  }
  for (const [position, step] of input.steps.entries()) {
    transaction
      .insert(recipeStep)
      .values({ id: randomUUID(), recipeId, position, ...step })
      .run()
  }

  const labels = [
    ...(input.category ? [{ kind: 'category' as const, name: input.category }] : []),
    ...input.tags.map((name) => ({ kind: 'tag' as const, name })),
  ]
  const seen = new Set<string>()
  for (const label of labels) {
    const normalizedName = normalizeLabel(label.name)
    const key = `${label.kind}:${normalizedName}`
    if (seen.has(key)) continue
    seen.add(key)
    transaction
      .insert(recipeTag)
      .values({ id: randomUUID(), ...label, normalizedName })
      .onConflictDoNothing()
      .run()
    const stored = transaction
      .select({ id: recipeTag.id })
      .from(recipeTag)
      .where(and(eq(recipeTag.kind, label.kind), eq(recipeTag.normalizedName, normalizedName)))
      .get()
    if (stored) {
      transaction
        .insert(recipeTagAssignment)
        .values({ recipeId, tagId: stored.id })
        .onConflictDoNothing()
        .run()
    }
  }
}

function errorResponse(
  context: import('hono').Context<ApiHonoEnvironment>,
  message: string,
  status: 400 | 404 | 413 | 500,
) {
  return context.json({ error: message }, status)
}

export function createRecipeRoutes(
  database: DatabaseClient,
  auth: Parameters<typeof requireSession>[0],
  photoDirectory: string,
) {
  const router = new Hono<ApiHonoEnvironment>()
  router.use('*', requireSession(auth))

  const list =
    (favoritesOnly: boolean) => async (context: import('hono').Context<ApiHonoEnvironment>) => {
      const parsed = querySchema.safeParse(context.req.query())
      if (!parsed.success) {
        return errorResponse(context, 'Paramètres de recherche invalides.', 400)
      }
      return context.json(
        listRecipes(database, context.get('session').user.id, parsed.data, favoritesOnly),
      )
    }

  router.get('/favorites', list(true))
  router.get('/', list(false))

  router.get('/:recipeId/photo', async (context) => {
    const row = database
      .select({ key: recipe.photoKey, mimeType: recipe.photoMimeType })
      .from(recipe)
      .where(eq(recipe.id, context.req.param('recipeId')))
      .get()
    if (!row?.key || !row.mimeType) return context.notFound()
    const isThumb = context.req.query('variant') === 'thumb'
    const etag = `"${row.key}${isThumb ? ':thumb' : ''}"`
    if (context.req.header('if-none-match') === etag) {
      context.header('ETag', etag)
      context.header('Cache-Control', 'private, max-age=86400')
      return context.body(null, 304)
    }
    try {
      const sourceBytes = await readFile(join(photoDirectory, row.key))
      if (isThumb) {
        let thumb = thumbnailCache.get(row.key)
        if (!thumb) {
          const buf = await sharp(sourceBytes)
            .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer()
          thumb = new Uint8Array(buf)
          thumbnailCache.set(row.key, thumb)
        }
        context.header('Content-Type', 'image/webp')
        context.header('ETag', etag)
        context.header('Cache-Control', 'private, max-age=86400')
        context.header('X-Content-Type-Options', 'nosniff')
        return context.body(thumb as Uint8Array<ArrayBuffer>)
      }
      context.header('Content-Type', row.mimeType)
      context.header('ETag', etag)
      context.header('Cache-Control', 'private, max-age=86400')
      context.header('X-Content-Type-Options', 'nosniff')
      return context.body(sourceBytes)
    } catch {
      return context.notFound()
    }
  })

  router.post('/', async (context) => {
    const body = await parseRecipeBody(context.req.raw)
    if ('error' in body) {
      return errorResponse(context, body.error, 'status' in body && body.status === 413 ? 413 : 400)
    }
    const id = randomUUID()
    let storedFile = false
    if (body.photo) {
      try {
        await storePhoto(photoDirectory, body.photo)
        storedFile = true
      } catch {
        return errorResponse(context, 'Impossible d’enregistrer la photo.', 500)
      }
    }
    const now = new Date()
    try {
      database.transaction((transaction) => {
        transaction
          .insert(recipe)
          .values({
            id,
            source: 'house',
            title: body.data.title,
            description: body.data.description,
            photoKey: body.photo?.key ?? null,
            photoMimeType: body.photo?.mimeType ?? null,
            totalMinutes: body.data.totalMinutes,
            servings: body.data.servings ?? null,
            difficulty: body.data.difficulty,
            createdAt: now,
            updatedAt: now,
          })
          .run()
        addRecipeContent(transaction, id, body.data)
      })
    } catch {
      if (storedFile) await removePhoto(photoDirectory, body.photo?.key)
      return errorResponse(context, 'Impossible d’enregistrer la recette.', 500)
    }
    return context.json(readRecipeDetail(database, id, context.get('session').user.id), 201)
  })

  router.get('/external/search', async (context) => {
    const parsed = z
      .object({
        q: z.string().trim().min(2, 'Saisissez au moins 2 caractères.').max(100),
        source: z
          .enum(['all', 'jow', 'marmiton', '750g', 'cuisineaz', 'hervecuisine'])
          .default('all'),
      })
      .safeParse(context.req.query())
    if (!parsed.success) {
      return errorResponse(context, parsed.error.issues[0]?.message ?? 'Recherche invalide.', 400)
    }
    const results = await searchExternalCatalog(
      parsed.data.source,
      parsed.data.q,
      parsed.data.source === 'all' ? 6 : 16,
    )
    return context.json(results)
  })

  router.post('/import-url', async (context) => {
    const parsed = z
      .object({
        url: z.string().trim().min(1, 'Saisissez un lien de recette.'),
        save: z.boolean().default(false),
        keepOriginalServings: z.boolean().default(false),
      })
      .safeParse(await context.req.json().catch(() => null))
    if (!parsed.success) {
      return errorResponse(context, parsed.error.issues[0]?.message ?? 'Requête invalide.', 400)
    }

    let draft
    try {
      draft = await importRecipeFromUrl(parsed.data.url)
    } catch (error) {
      if (error instanceof RecipeImportError) {
        return context.json({ error: error.message }, error.status as 400 | 413 | 422 | 502)
      }
      return context.json({ error: 'Impossible d’importer cette recette.' }, 502)
    }

    if (!parsed.data.save) {
      return context.json({ draft })
    }

    const householdServings = getHouseholdPlanningPreferences(
      database,
      context.get('session').user.id,
    ).defaultServings
    const finalServings = parsed.data.keepOriginalServings ? draft.servings : householdServings
    const finalIngredients =
      !parsed.data.keepOriginalServings && draft.servings && draft.servings !== householdServings
        ? scaleIngredientsForServings(draft.ingredients, draft.servings, householdServings)
        : draft.ingredients

    const id = randomUUID()
    const now = new Date()
    const writeData: RecipeWriteInput = {
      title: draft.title,
      description: draft.description,
      totalMinutes: draft.totalMinutes,
      servings: finalServings,
      difficulty: null,
      category: draft.category,
      tags: draft.tags,
      ingredients: finalIngredients,
      steps: draft.steps.map((instructions) => ({ instructions })),
    }

    try {
      database.transaction((transaction) => {
        transaction
          .insert(recipe)
          .values({
            id,
            source: 'house',
            title: writeData.title,
            description: writeData.description,
            photoUrl: draft.imageUrl,
            photoThumbnailUrl: draft.imageUrl,
            totalMinutes: writeData.totalMinutes,
            servings: finalServings,
            difficulty: writeData.difficulty,
            createdAt: now,
            updatedAt: now,
          })
          .run()
        addRecipeContent(transaction, id, writeData)
        transaction
          .insert(recipeMetric)
          .values({
            id: randomUUID(),
            recipeId: id,
            key: 'sourceHost',
            value: draft.sourceHost,
            unit: null,
            provenance: draft.sourceHost,
            method: draft.strategy,
            recordedAt: now,
          })
          .onConflictDoNothing()
          .run()
        if (draft.nutrition) {
          const metricEntries: ReadonlyArray<[string, number | null, string]> = [
            ['calories', draft.nutrition.caloriesKcal, 'kcal'],
            ['protein', draft.nutrition.proteinGrams, 'g'],
            ['carbs', draft.nutrition.carbsGrams, 'g'],
            ['fat', draft.nutrition.fatGrams, 'g'],
            ['fiber', draft.nutrition.fiberGrams, 'g'],
            ['sugar', draft.nutrition.sugarGrams, 'g'],
            ['salt', draft.nutrition.saltGrams, 'g'],
          ]
          for (const [key, value, unit] of metricEntries) {
            if (value === null) continue
            transaction
              .insert(recipeMetric)
              .values({
                id: randomUUID(),
                recipeId: id,
                key,
                value: String(value),
                unit,
                provenance: draft.sourceHost,
                method: draft.strategy,
                recordedAt: now,
              })
              .onConflictDoNothing()
              .run()
          }
        }
      })
    } catch {
      return errorResponse(context, 'Impossible d’enregistrer la recette importée.', 500)
    }

    return context.json(readRecipeDetail(database, id, context.get('session').user.id), 201)
  })

  router.post('/:recipeId/favorite', (context) => {
    const recipeId = context.req.param('recipeId')
    const existingRecipe = database
      .select({ id: recipe.id })
      .from(recipe)
      .where(eq(recipe.id, recipeId))
      .get()
    if (!existingRecipe) return context.notFound()
    database
      .insert(recipeFavorite)
      .values({
        userId: context.get('session').user.id,
        recipeId,
        createdAt: new Date(),
      })
      .onConflictDoNothing()
      .run()
    return context.body(null, 204)
  })

  router.delete('/:recipeId/favorite', (context) => {
    database
      .delete(recipeFavorite)
      .where(
        and(
          eq(recipeFavorite.userId, context.get('session').user.id),
          eq(recipeFavorite.recipeId, context.req.param('recipeId')),
        ),
      )
      .run()
    return context.body(null, 204)
  })

  router.get('/:recipeId', (context) => {
    const detail = readRecipeDetail(
      database,
      context.req.param('recipeId'),
      context.get('session').user.id,
    )
    return detail ? context.json(detail) : context.notFound()
  })

  router.put('/:recipeId', async (context) => {
    const id = context.req.param('recipeId')
    const existing = database.select().from(recipe).where(eq(recipe.id, id)).get()
    if (!existing || existing.source !== 'house') return context.notFound()

    const body = await parseRecipeBody(context.req.raw)
    if ('error' in body) {
      return errorResponse(context, body.error, 'status' in body && body.status === 413 ? 413 : 400)
    }
    const oldPhotoKey = existing.photoKey
    let storedFile = false
    if (body.photo) {
      try {
        await storePhoto(photoDirectory, body.photo)
        storedFile = true
      } catch {
        return errorResponse(context, 'Impossible d’enregistrer la photo.', 500)
      }
    }
    try {
      database.transaction((transaction) => {
        transaction
          .update(recipe)
          .set({
            title: body.data.title,
            description: body.data.description,
            totalMinutes: body.data.totalMinutes,
            servings: body.data.servings !== undefined ? body.data.servings : existing.servings,
            difficulty: body.data.difficulty,
            photoKey: body.photo?.key ?? existing.photoKey,
            photoMimeType: body.photo?.mimeType ?? existing.photoMimeType,
            updatedAt: new Date(),
          })
          .where(and(eq(recipe.id, id), eq(recipe.source, 'house')))
          .run()
        transaction.delete(recipeIngredient).where(eq(recipeIngredient.recipeId, id)).run()
        transaction.delete(recipeStep).where(eq(recipeStep.recipeId, id)).run()
        transaction.delete(recipeTagAssignment).where(eq(recipeTagAssignment.recipeId, id)).run()
        addRecipeContent(transaction, id, body.data)
      })
    } catch {
      if (storedFile) await removePhoto(photoDirectory, body.photo?.key)
      return errorResponse(context, 'Impossible de modifier la recette.', 500)
    }
    if (body.photo && oldPhotoKey) await removePhoto(photoDirectory, oldPhotoKey)
    return context.json(readRecipeDetail(database, id, context.get('session').user.id))
  })

  router.delete('/:recipeId', async (context) => {
    const id = context.req.param('recipeId')
    const existing = database
      .select({ source: recipe.source, photoKey: recipe.photoKey })
      .from(recipe)
      .where(eq(recipe.id, id))
      .get()
    if (!existing || existing.source !== 'house') return context.notFound()
    const plannedUse = database
      .select({ id: plannedMeal.id })
      .from(plannedMeal)
      .where(eq(plannedMeal.homeRecipeId, id))
      .get()
    if (plannedUse) {
      return context.json({ error: 'Cette recette est utilisée dans le planning.' }, 409)
    }
    database.delete(recipe).where(eq(recipe.id, id)).run()
    await removePhoto(photoDirectory, existing.photoKey)
    return context.body(null, 204)
  })

  return router
}
