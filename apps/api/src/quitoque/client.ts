import { z } from 'zod'

const apiOrigin = 'https://app.quitoque.fr'
const apiBase = `${apiOrigin}/api/v2`
const requestTimeoutMs = 45_000
const operationTimeoutMs = 120_000
const maximumAttempts = 3
const retryBaseDelayMs = 500
const pageSize = 30
const maximumPages = 20

type QuitoqueResponse = { response: Response; payload: unknown | null }

function isRetryableStatus(status: number) {
  return [408, 429, 500, 502, 503, 504].includes(status)
}

function isRetryableNetworkError(error: unknown) {
  if (error instanceof DOMException)
    return error.name === 'AbortError' || error.name === 'TimeoutError'
  if (!(error instanceof TypeError)) return false

  const code = (error as TypeError & { cause?: { code?: string } }).cause?.code
  if (!code) return true
  return [
    'ECONNREFUSED',
    'ECONNRESET',
    'EAI_AGAIN',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ETIMEDOUT',
    'UND_ERR_ABORTED',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_SOCKET',
    'UND_ERR_BODY_TIMEOUT',
  ].includes(code)
}

function retryAfterMs(value: string | null) {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000)
  const date = Date.parse(value)
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now())
}

function backoffMs(attempt: number) {
  return retryBaseDelayMs * 2 ** attempt
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

const authenticationSchema = z.object({ token: z.string().min(1) })
const ordersSchema = z.union([
  z.array(z.unknown()),
  z
    .object({
      orders: z.array(z.unknown()).optional(),
      'hydra:member': z.array(z.unknown()).optional(),
    })
    .passthrough(),
])
const deliveryOrderSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    deliveryDate: z.string().nullable().optional(),
    periodStartDate: z.string().nullable().optional(),
    periodEndDate: z.string().nullable().optional(),
    tokenValue: z.string().nullable().optional(),
  })
  .passthrough()
const orderItemsSchema = z.union([
  z.array(z.unknown()),
  z.object({ 'hydra:member': z.array(z.unknown()).optional() }).passthrough(),
])
const orderItemSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    quantity: z.coerce.number().int().min(1).max(100),
    productName: z.string().nullable().optional(),
    variant: z
      .object({
        product: z
          .object({
            id: z.union([z.string(), z.number()]),
            attributes: z
              .array(
                z.object({
                  code: z.string(),
                  value: z.unknown(),
                }),
              )
              .optional(),
            images: z.array(z.object({ path: z.string().min(1) }).passthrough()).optional(),
          })
          .passthrough()
          .nullable()
          .optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough()
const catalogSchema = z
  .object({
    products: z.array(z.unknown()),
    paginator: z
      .object({
        nbPages: z.number().int().nonnegative(),
      })
      .passthrough(),
  })
  .passthrough()
const productImageSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    path: z.string().min(1),
  })
  .passthrough()
const productDetailsSchema = z
  .object({ images: z.array(productImageSchema).optional() })
  .passthrough()
const productImageVariantSchema = z.object({ path: z.string().min(1) }).passthrough()

const ingredientSchema = z
  .object({
    name: z.string().trim().min(1),
    quantity: z.union([z.string(), z.number()]).optional().nullable(),
    unit: z.string().optional().nullable(),
  })
  .passthrough()

export type ImportedRecipe = {
  externalId: string
  productId: string
  title: string
  description: string | null
  imageUrl: string | null
  thumbnailUrl: string | null
  totalMinutes: number | null
  difficulty: null
  category: string | null
  tags: string[]
  ingredients: Array<{
    name: string
    quantity: string | null
    unit: string | null
    notes: string | null
  }>
  steps: string[]
  nutriScore: string | null
  carbonScore: string | null
}

export type QuitoqueDelivery = {
  externalOrderId: string
  deliveryDate: string | null
  periodStartDate: string | null
  periodEndDate: string | null
}

export type QuitoqueDeliverySelection = ImportedRecipe & {
  sourceItemId: string
  sourcePosition: number
  occurrence: number
  quantity: number
  isAvailable: boolean
}

export type QuitoqueClientOptions = {
  email: string
  password: string
  fetchImplementation?: typeof fetch
}

export class QuitoqueApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuitoqueApiError'
  }
}

function decodeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new QuitoqueApiError('Une réponse Quitoque est mal formée.')
  }
}

function parseIngredients(product: Record<string, unknown>) {
  const value = decodeJson(product['ingredients'])
  const standard =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)['standard']
      : undefined
  let ingredients: ImportedRecipe['ingredients'] = []
  if (standard !== undefined) {
    const items = z.array(ingredientSchema).safeParse(standard)
    if (!items.success) {
      throw new QuitoqueApiError('Les ingrédients Quitoque sont mal formés.')
    }
    ingredients = items.data.map((ingredient) => {
      const rawUnit = ingredient.unit?.trim() ?? null
      return {
        name: ingredient.name,
        quantity:
          ingredient.quantity === null || ingredient.quantity === undefined
            ? null
            : String(ingredient.quantity),
        unit: rawUnit && rawUnit.toLowerCase() !== 'g' ? rawUnit : null,
        notes: null,
      }
    })
  }

  const cupboard = decodeJson(product['cupboard_ingredients'])
  if (Array.isArray(cupboard)) {
    for (const candidate of cupboard) {
      const parsed = z.object({ name: z.string().trim().min(1) }).safeParse(candidate)
      if (!parsed.success) {
        throw new QuitoqueApiError('Les ingrédients de placard Quitoque sont mal formés.')
      }
      ingredients.push({
        name: parsed.data.name,
        quantity: null,
        unit: null,
        notes: 'Ingrédient de placard',
      })
    }
  }
  return ingredients
}

function parseSteps(value: unknown) {
  const decoded = decodeJson(value)
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return []
  const localized = (decoded as Record<string, unknown>)['Default']
  if (!localized || typeof localized !== 'object' || Array.isArray(localized)) return []
  const entries = Object.entries(localized as Record<string, unknown>)
    .filter(([key]) => key !== 'conclusion')
    .toSorted(([left], [right]) => Number(left) - Number(right))
  const steps: string[] = []
  for (const [, candidate] of entries) {
    const parsed = z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
      })
      .passthrough()
      .safeParse(candidate)
    if (!parsed.success) {
      throw new QuitoqueApiError('Les étapes Quitoque sont mal formées.')
    }
    const text = [parsed.data.title, parsed.data.description]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part))
      .join('\n\n')
    if (text) steps.push(text)
  }
  return steps
}

function parseMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d{1,3})\s*(?:min|minutes?)$/i)
  return match ? Number(match[1]) : null
}

function parseScoreGrade(value: unknown): string | null {
  if (typeof value === 'string') {
    const grade = value.trim().toUpperCase()
    return /^[A-E]$/.test(grade) ? grade : null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  for (const candidate of [
    Object.keys(record)[0],
    typeof record['grade'] === 'string' ? record['grade'] : undefined,
    typeof record['value'] === 'string' ? record['value'] : undefined,
    typeof record['label'] === 'string' ? record['label'] : undefined,
  ]) {
    const grade = candidate?.trim().toUpperCase()
    if (grade && /^[A-E]$/.test(grade)) return grade
  }
  return null
}

function parseLabelList(value: unknown, field: string) {
  if (value === null || value === undefined) return []
  const decoded = decodeJson(value)
  const parsed = z
    .array(z.object({ name: z.string().trim().min(1) }).passthrough())
    .safeParse(decoded)
  if (!parsed.success) {
    throw new QuitoqueApiError(`Les ${field} Quitoque sont mal formés.`)
  }
  return parsed.data.map((entry) => entry.name)
}

function toImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value, `${apiOrigin}/`)
    return url.origin === apiOrigin ? url.toString() : null
  } catch {
    return null
  }
}

function parseProduct(
  value: unknown,
  imageUrl: string | null,
  thumbnailUrl: string | null,
): ImportedRecipe {
  const product = z.record(z.string(), z.unknown()).parse(value)
  const identity = z
    .object({
      id: z.union([z.string(), z.number()]),
      code: z.string().min(1),
      name: z.string().trim().min(1),
      family: z.record(z.string(), z.unknown()),
    })
    .safeParse(product)
  if (!identity.success || !Object.hasOwn(identity.data.family, 'recipe')) {
    throw new QuitoqueApiError('Une recette Quitoque ne respecte pas le contrat observé.')
  }

  return {
    externalId: identity.data.code || String(identity.data.id),
    productId: String(identity.data.id),
    title: identity.data.name,
    description:
      typeof product['description'] === 'string' && product['description'].trim()
        ? product['description'].trim()
        : null,
    imageUrl,
    thumbnailUrl,
    totalMinutes: parseMinutes(product['total_time']),
    difficulty: null,
    category: parseLabelList(product['categories'], 'catégories')[0] ?? null,
    tags: parseLabelList(product['tags'], 'tags'),
    ingredients: parseIngredients(product),
    steps: parseSteps(product['preparation_steps']),
    nutriScore: parseScoreGrade(product['nutri_score']),
    carbonScore: parseScoreGrade(product['carbon_score']),
  }
}

const tokenTtlMs = 10 * 60_000
const ordersPageSize = 15
const recipeConcurrency = 6
const catalogPageConcurrency = 4

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = Array.from<R>({ length: items.length })
  let nextIndex = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(items[index] as T, index)
    }
  })
  await Promise.all(runners)
  return results
}

export function createQuitoqueClient({
  email,
  password,
  fetchImplementation = fetch,
}: QuitoqueClientOptions) {
  if (process.env['NODE_TLS_REJECT_UNAUTHORIZED'] === '0') {
    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1'
  }

  async function fetchJson(
    url: string,
    init: RequestInit,
    deadline: number,
  ): Promise<QuitoqueResponse> {
    let lastError: unknown
    for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) break

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), Math.min(requestTimeoutMs, remaining))
      let response: Response | undefined
      let retryDelay: number | null = null
      let networkError: unknown
      try {
        response = await fetchImplementation(url, {
          ...init,
          signal: controller.signal,
        })
        if (isRetryableStatus(response.status) && attempt < maximumAttempts - 1) {
          retryDelay = retryAfterMs(response.headers.get('retry-after'))
          void response.body?.cancel().catch(() => {})
        } else if (!response.ok || response.status === 204) {
          return { response, payload: null }
        } else {
          return { response, payload: await response.json() }
        }
      } catch (error) {
        if (!isRetryableNetworkError(error)) throw error
        networkError = error
      } finally {
        clearTimeout(timeout)
      }

      if (networkError) lastError = networkError
      if (attempt === maximumAttempts - 1) {
        if (response) return { response, payload: null }
        break
      }

      const delay = retryDelay ?? backoffMs(attempt)
      if (delay >= deadline - Date.now()) {
        if (response) return { response, payload: null }
        break
      }
      await wait(delay)
    }
    throw lastError ?? new Error('Quitoque operation deadline exceeded.')
  }

  let cachedToken: string | null = null
  let cachedTokenExpiresAt = 0

  async function getToken(deadline: number, forceRefresh = false) {
    if (!forceRefresh && cachedToken && Date.now() < cachedTokenExpiresAt) {
      return { token: cachedToken, fromCache: true }
    }
    const token = await login(deadline)
    cachedToken = token
    cachedTokenExpiresAt = Date.now() + tokenTtlMs
    return { token, fromCache: false }
  }

  async function request(path: string, token: string, deadline: number, allowAuthRetry = false) {
    try {
      const { response, payload } = await fetchJson(
        `${apiBase}${path}`,
        {
          redirect: 'error',
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${token}`,
          },
        },
        deadline,
      )
      if (response.status === 401) {
        if (cachedToken === token) {
          cachedToken = null
          cachedTokenExpiresAt = 0
        }
        if (allowAuthRetry) {
          const refreshed = await getToken(deadline, true)
          const retried = await fetchJson(
            `${apiBase}${path}`,
            {
              redirect: 'error',
              headers: {
                accept: 'application/json',
                authorization: `Bearer ${refreshed.token}`,
              },
            },
            deadline,
          )
          if (!retried.response.ok) {
            throw new QuitoqueApiError(
              `La lecture du catalogue Quitoque a échoué (HTTP ${retried.response.status}).`,
            )
          }
          return retried.payload
        }
      }
      if (!response.ok) {
        throw new QuitoqueApiError(
          `La lecture du catalogue Quitoque a échoué (HTTP ${response.status}).`,
        )
      }
      return payload
    } catch (error) {
      if (error instanceof QuitoqueApiError) throw error
      throw new QuitoqueApiError('Quitoque est momentanément indisponible.')
    }
  }

  async function login(deadline: number) {
    try {
      const { response, payload: raw } = await fetchJson(
        `${apiBase}/shop/authentication-token`,
        {
          method: 'POST',
          redirect: 'error',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ email, password }),
        },
        deadline,
      )
      if (!response.ok) throw new QuitoqueApiError('La connexion Quitoque a échoué.')
      const payload = authenticationSchema.safeParse(raw)
      if (!payload.success)
        throw new QuitoqueApiError('La réponse d’authentification Quitoque est invalide.')
      return payload.data.token
    } catch (error) {
      if (error instanceof QuitoqueApiError) throw error
      throw new QuitoqueApiError('Quitoque est momentanément indisponible.')
    }
  }

  const ordersById = new Map<string, z.infer<typeof deliveryOrderSchema>>()

  async function fetchOrders(
    token: string,
    deadline: number,
    options: {
      targetOrderId?: string
      maxPages?: number
      allowAuthRetry?: boolean
    } = {},
  ) {
    const { targetOrderId, maxPages = maximumPages, allowAuthRetry = false } = options
    const orders: Array<z.infer<typeof deliveryOrderSchema>> = []
    for (let page = 1; page <= maxPages; page += 1) {
      const query = new URLSearchParams({
        page: String(page),
        itemsPerPage: String(ordersPageSize),
      })
      const payload = ordersSchema.safeParse(
        await request(`/shop/orders?${query}`, token, deadline, allowAuthRetry && page === 1),
      )
      if (!payload.success) {
        throw new QuitoqueApiError('La liste des livraisons Quitoque est mal formée.')
      }
      const entries = Array.isArray(payload.data)
        ? payload.data
        : (payload.data.orders ?? payload.data['hydra:member'] ?? [])
      const parsed = z.array(deliveryOrderSchema).safeParse(entries)
      if (!parsed.success) {
        throw new QuitoqueApiError('Une commande Quitoque ne respecte pas le contrat observé.')
      }
      orders.push(...parsed.data)
      if (
        targetOrderId &&
        parsed.data.some((candidate) => String(candidate.id) === targetOrderId)
      ) {
        return orders
      }
      if (entries.length < ordersPageSize) return orders
    }
    if (maxPages < maximumPages) return orders
    throw new QuitoqueApiError(
      'La pagination Quitoque dépasse la limite prévue pour une synchronisation.',
    )
  }

  async function listDeliveries() {
    const deadline = Date.now() + operationTimeoutMs
    const { token, fromCache } = await getToken(deadline)
    const orders = await fetchOrders(token, deadline, {
      maxPages: 1,
      allowAuthRetry: fromCache,
    })
    ordersById.clear()
    for (const order of orders) {
      ordersById.set(String(order.id), order)
    }
    return orders.map((order) => ({
      externalOrderId: String(order.id),
      deliveryDate: order.deliveryDate ?? null,
      periodStartDate: order.periodStartDate ?? null,
      periodEndDate: order.periodEndDate ?? null,
    })) satisfies QuitoqueDelivery[]
  }

  async function loadRecipe(value: unknown, token: string, deadline: number) {
    const raw = z.record(z.string(), z.unknown()).parse(value)
    const code = z.string().min(1).parse(raw['code'])
    const details = productDetailsSchema.safeParse(
      await request(`/shop/products/${encodeURIComponent(code)}`, token, deadline),
    )
    if (!details.success) {
      throw new QuitoqueApiError('Les images de recette Quitoque sont mal formées.')
    }
    const image = details.data.images?.[0]
    const imageUrl = image ? toImageUrl(image.path) : null
    let thumbnailUrl: string | null = null
    if (image && imageUrl) {
      const query = new URLSearchParams({
        filter: 'sylius_shop_product_thumbnail',
      })
      try {
        const variant = productImageVariantSchema.safeParse(
          await request(
            `/shop/product-images/${encodeURIComponent(String(image.id))}?${query}`,
            token,
            deadline,
          ),
        )
        if (variant.success) thumbnailUrl = toImageUrl(variant.data.path)
      } catch {
        // Keep the original photograph available when a thumbnail is missing.
      }
    }
    return parseProduct(raw, imageUrl, thumbnailUrl)
  }

  async function fetchCatalogPage(
    start: string,
    end: string,
    page: number,
    token: string,
    deadline: number,
  ) {
    const query = new URLSearchParams({
      page: String(page),
      itemsPerPage: String(pageSize),
      format: 'api',
    })
    query.set('attributes[family][1]', 'recipe')
    const response = await request(`/shop/products/${start}/${end}?${query}`, token, deadline)
    const collection = catalogSchema.safeParse(response)
    if (!collection.success) {
      throw new QuitoqueApiError('Le catalogue Quitoque ne respecte pas le contrat observé.')
    }
    if (collection.data.paginator.nbPages > maximumPages) {
      throw new QuitoqueApiError(
        'Le catalogue Quitoque dépasse la limite prévue pour une synchronisation.',
      )
    }
    return collection.data
  }

  async function listSelectedRecipesForPeriod(
    start: string,
    end: string,
    token: string,
    selectedProductIds: Set<string>,
    deadline: number,
  ) {
    const matchedProducts = new Map<string, Record<string, unknown>>()
    const collectMatches = (products: unknown[]) => {
      for (const product of products) {
        const raw = z.record(z.string(), z.unknown()).parse(product)
        const productId = String(z.union([z.string(), z.number()]).parse(raw['id']))
        if (selectedProductIds.has(productId)) {
          matchedProducts.set(productId, raw)
        }
      }
    }

    const firstPage = await fetchCatalogPage(start, end, 1, token, deadline)
    collectMatches(firstPage.products)

    const pageCount = Math.min(firstPage.paginator.nbPages, maximumPages)
    if (matchedProducts.size < selectedProductIds.size && pageCount > 1) {
      const remainingPages = Array.from({ length: pageCount - 1 }, (_, index) => index + 2)
      const pages = await mapWithConcurrency(remainingPages, catalogPageConcurrency, (page) =>
        fetchCatalogPage(start, end, page, token, deadline),
      )
      for (const page of pages) {
        collectMatches(page.products)
      }
    }

    const matchedEntries = [...matchedProducts.entries()]
    const loaded = await mapWithConcurrency(
      matchedEntries,
      recipeConcurrency,
      async ([productId, raw]) => [productId, await loadRecipe(raw, token, deadline)] as const,
    )
    return new Map<string, ImportedRecipe>(loaded)
  }

  async function listSelectedRecipes(externalOrderId: string) {
    const deadline = Date.now() + operationTimeoutMs
    const { token, fromCache } = await getToken(deadline)
    let order = ordersById.get(externalOrderId)
    if (!order?.tokenValue) {
      for (const candidate of await fetchOrders(token, deadline, {
        targetOrderId: externalOrderId,
        allowAuthRetry: fromCache,
      })) {
        ordersById.set(String(candidate.id), candidate)
      }
      order = ordersById.get(externalOrderId)
    }
    if (!order?.tokenValue) {
      throw new QuitoqueApiError('La livraison Quitoque sélectionnée n’est plus accessible.')
    }
    const tokenValue = order.tokenValue

    if (!order?.periodStartDate || !order.periodEndDate) {
      throw new QuitoqueApiError('La période du catalogue Quitoque est indisponible.')
    }
    const start = order.periodStartDate.slice(0, 10)
    const end = order.periodEndDate.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      throw new QuitoqueApiError('La période Quitoque est invalide.')
    }

    const items: Array<z.infer<typeof orderItemSchema>> = []
    for (let page = 1; page <= maximumPages; page += 1) {
      const query = new URLSearchParams({
        page: String(page),
        itemsPerPage: '100',
      })
      const payload = orderItemsSchema.safeParse(
        await request(
          `/shop/orders/${encodeURIComponent(tokenValue)}/items?${query}`,
          token,
          deadline,
          fromCache && page === 1,
        ),
      )
      if (!payload.success) {
        throw new QuitoqueApiError('La sélection de recettes Quitoque est mal formée.')
      }
      const entries = Array.isArray(payload.data)
        ? payload.data
        : (payload.data['hydra:member'] ?? [])
      const parsed = z.array(orderItemSchema).safeParse(entries)
      if (!parsed.success) {
        throw new QuitoqueApiError('Une recette sélectionnée Quitoque est mal formée.')
      }
      items.push(...parsed.data)
      if (entries.length < 100) break
      if (page === maximumPages) {
        throw new QuitoqueApiError('La sélection Quitoque dépasse la limite de pagination.')
      }
    }

    const selectedProductIds = new Set<string>()
    const productIdByPosition = new Map<number, string>()
    for (const [position, item] of items.entries()) {
      const productId = item.variant?.product?.id
      if (productId === undefined || productId === null) continue
      const externalId = String(productId)
      if (isRecipeFamily(item.variant?.product?.attributes)) {
        selectedProductIds.add(externalId)
        productIdByPosition.set(position, externalId)
      }
    }
    if (selectedProductIds.size === 0) return []

    const catalog = await listSelectedRecipesForPeriod(
      start,
      end,
      token,
      selectedProductIds,
      deadline,
    )
    const result: QuitoqueDeliverySelection[] = []
    for (const [position, item] of items.entries()) {
      const productId = productIdByPosition.get(position)
      if (!productId) continue
      const recipe = catalog.get(productId)
      const product = item.variant?.product
      const fallbackImage = product?.images?.[0]?.path
      const title = recipe?.title ?? item.productName?.trim()
      if (!title) {
        throw new QuitoqueApiError('Une recette Quitoque sélectionnée ne possède pas de titre.')
      }
      const quantity = item.quantity
      for (let occurrence = 0; occurrence < quantity; occurrence += 1) {
        result.push({
          externalId: recipe?.externalId ?? productId,
          productId,
          sourceItemId: String(item.id),
          sourcePosition: position,
          occurrence,
          quantity,
          isAvailable: Boolean(recipe),
          title,
          description: recipe?.description ?? null,
          imageUrl: recipe?.imageUrl ?? toImageUrl(fallbackImage),
          thumbnailUrl: recipe?.thumbnailUrl ?? null,
          totalMinutes: recipe?.totalMinutes ?? null,
          difficulty: null,
          category: recipe?.category ?? null,
          tags: recipe?.tags ?? [],
          ingredients: recipe?.ingredients ?? [],
          steps: recipe?.steps ?? [],
          nutriScore: recipe?.nutriScore ?? null,
          carbonScore: recipe?.carbonScore ?? null,
        })
      }
    }
    return result
  }

  return { listDeliveries, listSelectedRecipes }
}

function isRecipeFamily(attributes: Array<{ code: string; value: unknown }> | undefined): boolean {
  const family = attributes?.find((attribute) => attribute.code === 'family')
  const values = Array.isArray(family?.value) ? family.value : [family?.value]
  return values.some(
    (value) =>
      typeof value === 'string' &&
      ['recipe', 'recette'].includes(value.trim().toLocaleLowerCase('fr')),
  )
}
