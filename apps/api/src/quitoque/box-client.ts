import type { RecipeNutrition } from '@quisera/shared'
import { z } from 'zod'
import { parseQuitoqueNutrition, parseQuitoqueServings } from './nutrition.js'
import { QuitoqueApiError } from './client.js'

const apiOrigin = 'https://app.quitoque.fr'
const apiBase = `${apiOrigin}/api/v2`
const requestTimeoutMs = 35_000
const tokenTtlMs = 10 * 60_000

export type PlanificationSection = 'recipes' | 'ready-meals' | 'market'

export type BoxCartItem = {
  id: string
  productId: string
  variantId: string | null
  variantCode: string | null
  title: string
  quantity: number
  unitPriceCents: number
  totalCents: number
  imageUrl: string | null
  section: PlanificationSection
}

export type BoxPromotion = {
  id: string
  name: string
  description: string | null
  couponCode: string | null
  amountCents: number
  isOnOrder: boolean
  isLoyalty: boolean
  endsAt: string | null
}

export type BoxDeliveryAddress = {
  street: string | null
  postcode: string | null
  city: string | null
  countryCode: string | null
  recipientName: string | null
}

export type BoxShipment = {
  id: string
  method: string | null
  deliveryDate: string | null
  startTime: string | null
  endTime: string | null
  timeSlotId: number | null
}

export type DeliveryTimeSlotOption = {
  id: number
  shippingMethodCode: string
  label: string
  begin: string
  end: string
  priceCents: number
  recommended: boolean
  deliveryDates: string[]
}

export type UpcomingBoxWeek = {
  orderId: string
  periodStartDate: string
  periodEndDate: string
  deliveryDate: string | null
  lockDate: string | null
  isNextOrder: boolean
  onBreak: boolean
  edited: string | null
  recipeTargetCount: number | null
  servings: number | null
  itemsTotalCents: number
  shippingTotalCents: number
  promotionTotalCents: number
  walletTotalCents: number
  walletBalanceCents: number
  useWallet: boolean
  totalCents: number
  shippingAddress: BoxDeliveryAddress | null
  shipment: BoxShipment | null
  promotions: BoxPromotion[]
  items: BoxCartItem[]
}

export type DynamicFilterOption = {
  value: string
  label: string
}

export type DynamicFilterGroup = {
  code: string
  name: string
  type: 'multichoice' | 'checkbox'
  options: DynamicFilterOption[]
}

export type CatalogIngredient = {
  name: string
  quantity: string | null
  unit: string | null
  notes: string | null
}

export type CatalogProduct = {
  id: string
  code: string
  variantId: string | null
  variantCode: string | null
  title: string
  description: string | null
  imageUrl: string | null
  totalMinutes: number | null
  servings: number | null
  nutriScore: string | null
  carbonScore: string | null
  nutrition: RecipeNutrition | null
  priceCents: number | null
  additionalCostCents: number
  section: PlanificationSection
  categories: string[]
  highlights: string[]
  tags: string[]
  allergens: string[]
  ingredients: CatalogIngredient[]
  steps: string[]
  filterValues: Record<string, string[]>
}

const authResponseSchema = z.object({
  token: z.string().min(1),
  customer: z.string().optional(),
})

const pauseableWeekSchema = z
  .object({
    start: z.string().min(10),
    end: z.string().min(10),
    lock: z.string().nullable().optional(),
    on_break: z.boolean().optional(),
  })
  .passthrough()

const filterEndpointSchema = z
  .object({
    filters: z
      .array(
        z
          .object({
            code: z.string().min(1),
            name: z.string().min(1),
            type: z.string().optional(),
            values: z
              .array(
                z
                  .object({
                    value: z.union([z.string(), z.number()]),
                    label: z.union([z.string(), z.number()]),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough()

function decodeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
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
  ]) {
    const grade = candidate?.trim().toUpperCase()
    if (grade && /^[A-E]$/.test(grade)) return grade
  }
  return null
}

function parseMinutes(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value)
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d{1,3})\s*(?:min|minutes?)$/i)
  return match ? Number(match[1]) : null
}

function toThumbnailUrl(imagePath: unknown): string | null {
  if (typeof imagePath !== 'string' || !imagePath.trim()) return null
  const trimmed = imagePath.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed)
      return url.origin === apiOrigin ? url.toString() : null
    } catch {
      return null
    }
  }
  if (trimmed.startsWith('/media/')) return `${apiOrigin}${trimmed}`
  return `${apiOrigin}/media/cache/resolve/sylius_shop_product_thumbnail/${trimmed.replace(/^\/+/, '')}`
}

function parseNameList(value: unknown): string[] {
  const decoded = decodeJson(value)
  if (!Array.isArray(decoded)) return []
  const names: string[] = []
  for (const entry of decoded) {
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as Record<string, unknown>)['name'] === 'string'
    ) {
      const name = ((entry as Record<string, unknown>)['name'] as string).trim()
      if (name && !names.includes(name)) names.push(name)
    }
  }
  return names
}

function parseHighlightLabels(value: unknown): string[] {
  const decoded = decodeJson(value)
  if (!Array.isArray(decoded)) return []
  const labels: string[] = []
  for (const entry of decoded) {
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as Record<string, unknown>)['label'] === 'string'
    ) {
      const label = ((entry as Record<string, unknown>)['label'] as string).trim()
      if (label && !labels.includes(label)) labels.push(label)
    }
  }
  return labels
}

function parseCatalogIngredients(product: Record<string, unknown>): CatalogIngredient[] {
  const result: CatalogIngredient[] = []
  const raw = decodeJson(product['ingredients'])
  const standard =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)['standard']
      : undefined
  if (Array.isArray(standard)) {
    for (const entry of standard) {
      if (!entry || typeof entry !== 'object') continue
      const item = entry as Record<string, unknown>
      if (typeof item['name'] !== 'string' || !item['name'].trim()) continue
      const rawUnit = typeof item['unit'] === 'string' ? item['unit'].trim() : null
      result.push({
        name: item['name'].trim(),
        quantity:
          item['quantity'] === null || item['quantity'] === undefined
            ? null
            : String(item['quantity']),
        unit: rawUnit && rawUnit.toLowerCase() !== 'g' ? rawUnit : null,
        notes: null,
      })
    }
  }
  const cupboard = decodeJson(product['cupboard_ingredients'])
  if (Array.isArray(cupboard)) {
    for (const entry of cupboard) {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof (entry as Record<string, unknown>)['name'] === 'string'
      ) {
        const name = ((entry as Record<string, unknown>)['name'] as string).trim()
        if (name) {
          result.push({
            name,
            quantity: null,
            unit: null,
            notes: 'Ingrédient de placard',
          })
        }
      }
    }
  }
  return result
}

function parseCatalogSteps(value: unknown): string[] {
  const decoded = decodeJson(value)
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return []
  const root =
    ((decoded as Record<string, unknown>)['Default'] as Record<string, unknown>) ??
    (decoded as Record<string, unknown>)
  const steps: string[] = []
  for (const [key, entry] of Object.entries(root)) {
    if (key === 'conclusion' || !entry || typeof entry !== 'object') continue
    const step = entry as Record<string, unknown>
    const title = typeof step['title'] === 'string' ? step['title'].trim() : ''
    const desc = typeof step['description'] === 'string' ? step['description'].trim() : ''
    const combined = [title, desc].filter(Boolean).join('\n\n')
    if (combined) steps.push(combined)
  }
  return steps
}

function parseAllergens(value: unknown): string[] {
  const decoded = decodeJson(value)
  if (Array.isArray(decoded)) {
    return decoded
      .map((entry) =>
        typeof entry === 'string'
          ? entry.trim()
          : entry &&
              typeof entry === 'object' &&
              typeof (entry as Record<string, unknown>)['name'] === 'string'
            ? ((entry as Record<string, unknown>)['name'] as string).trim()
            : '',
      )
      .filter(Boolean)
  }
  if (decoded && typeof decoded === 'object') {
    return Object.values(decoded as Record<string, unknown>)
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim())
  }
  return []
}

function isReadyMealCategory(categories: readonly string[]) {
  return categories.some((category) =>
    category
      .toLocaleLowerCase('fr')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .includes('plats cuisines'),
  )
}

function extractFilterKeys(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (typeof value === 'boolean') return [value ? '1' : '0']
  if (typeof value === 'number') return [String(value)]
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (Array.isArray(value)) return value.flatMap(extractFilterKeys)
  if (typeof value === 'object') return Object.keys(value)
  return []
}

function detectItemSection(rawItem: Record<string, unknown>): PlanificationSection {
  const variant = rawItem['variant'] as Record<string, unknown> | undefined
  const product = variant?.['product'] as Record<string, unknown> | undefined
  const attributes = Array.isArray(product?.['attributes'])
    ? (product['attributes'] as Array<Record<string, unknown>>)
    : []

  const familyAttr = attributes.find((attr) => attr['code'] === 'family')
  const familyKeys = extractFilterKeys(familyAttr?.['key'] ?? familyAttr?.['value']).map((entry) =>
    entry.toLocaleLowerCase('fr'),
  )
  if (familyKeys.includes('recipe') || familyKeys.includes('recette')) {
    return 'recipes'
  }

  const categoryAttr = attributes.find((attr) => attr['code'] === 'categories')
  const categoryNames = parseNameList(categoryAttr?.['key'] ?? categoryAttr?.['value'])
  if (isReadyMealCategory(categoryNames)) return 'ready-meals'

  return 'market'
}

function extractHourMinute(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.match(/(\d{2}:\d{2})/)
  return match?.[1] ?? null
}

function padTime(value: string): string {
  const [h = '00', m = '00'] = value.split(':')
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`
}

function parseCart(
  rawCart: Record<string, unknown>,
  lockByStart: Map<string, { lock: string | null; onBreak: boolean }>,
): UpcomingBoxWeek | null {
  const id = rawCart['id']
  const startRaw =
    typeof rawCart['periodStartDate'] === 'string' ? rawCart['periodStartDate'].slice(0, 10) : null
  const endRaw =
    typeof rawCart['periodEndDate'] === 'string' ? rawCart['periodEndDate'].slice(0, 10) : null
  if (!id || !startRaw || !endRaw) return null

  const deliveryDate =
    typeof rawCart['deliveryDate'] === 'string' ? rawCart['deliveryDate'].slice(0, 10) : null

  const prefs = Array.isArray(rawCart['orderPreferences'])
    ? (rawCart['orderPreferences'] as Array<Record<string, unknown>>)
    : []
  const recipeCountPref = prefs.find((p) => p['attribute'] === 'recipe_count')
  const servingsPref = prefs.find((p) => p['attribute'] === 'default_variant_size')

  const rawItems = Array.isArray(rawCart['items'])
    ? (rawCart['items'] as Array<Record<string, unknown>>)
    : []

  const items: BoxCartItem[] = rawItems.map((item) => {
    const variant = item['variant'] as Record<string, unknown> | undefined
    const product = variant?.['product'] as Record<string, unknown> | undefined
    const images = Array.isArray(product?.['images'])
      ? (product['images'] as Array<Record<string, unknown>>)
      : []
    return {
      id: String(item['id'] ?? ''),
      productId: String(product?.['id'] ?? item['id'] ?? ''),
      variantId:
        variant?.['id'] !== undefined && variant?.['id'] !== null ? String(variant['id']) : null,
      variantCode: typeof variant?.['code'] === 'string' ? variant['code'] : null,
      title:
        typeof item['productName'] === 'string' && item['productName'].trim()
          ? item['productName'].trim()
          : 'Produit Quitoque',
      quantity: typeof item['quantity'] === 'number' && item['quantity'] > 0 ? item['quantity'] : 1,
      unitPriceCents: typeof item['unitPrice'] === 'number' ? item['unitPrice'] : 0,
      totalCents: typeof item['total'] === 'number' ? item['total'] : 0,
      imageUrl: toThumbnailUrl(images[0]?.['path']),
      section: detectItemSection(item),
    }
  })

  const lockInfo = lockByStart.get(startRaw)

  const rawAddress = rawCart['shippingAddress'] as Record<string, unknown> | undefined
  const shippingAddress: BoxDeliveryAddress | null =
    rawAddress && typeof rawAddress === 'object'
      ? {
          street:
            typeof rawAddress['street'] === 'string' && rawAddress['street'].trim()
              ? rawAddress['street'].trim()
              : null,
          postcode:
            typeof rawAddress['postcode'] === 'string' && rawAddress['postcode'].trim()
              ? rawAddress['postcode'].trim()
              : null,
          city:
            typeof rawAddress['city'] === 'string' && rawAddress['city'].trim()
              ? rawAddress['city'].trim()
              : null,
          countryCode:
            typeof rawAddress['countryCode'] === 'string' ? rawAddress['countryCode'] : null,
          recipientName:
            [rawAddress['firstName'], rawAddress['lastName']]
              .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
              .join(' ') || null,
        }
      : null

  const rawShipments = Array.isArray(rawCart['shipments'])
    ? (rawCart['shipments'] as Array<Record<string, unknown>>)
    : []
  const firstShipment = rawShipments[0]
  const shipment: BoxShipment | null = firstShipment
    ? {
        id: String(firstShipment['id'] ?? ''),
        method: typeof firstShipment['method'] === 'string' ? firstShipment['method'] : null,
        deliveryDate:
          typeof firstShipment['deliveryDate'] === 'string'
            ? firstShipment['deliveryDate'].slice(0, 10)
            : deliveryDate,
        startTime: extractHourMinute(firstShipment['deliveryTimeSlotStartAt']),
        endTime: extractHourMinute(firstShipment['deliveryTimeSlotEndAt']),
        timeSlotId:
          typeof firstShipment['deliveryTimeSlotId'] === 'number'
            ? firstShipment['deliveryTimeSlotId']
            : null,
      }
    : null

  const rawPromos = Array.isArray(rawCart['promotionsAndPromotionCoupons'])
    ? (rawCart['promotionsAndPromotionCoupons'] as Array<Record<string, unknown>>)
    : []
  const promotions: BoxPromotion[] = rawPromos
    .filter((promo) => promo['visible'] !== false && promo['disabled'] !== true)
    .map((promo) => {
      const endsAtObj = promo['endsAt'] as Record<string, unknown> | string | null
      const endsAt =
        typeof endsAtObj === 'string'
          ? endsAtObj
          : endsAtObj && typeof endsAtObj['date'] === 'string'
            ? endsAtObj['date'].slice(0, 10)
            : null
      return {
        id: String(promo['promotionId'] ?? promo['couponCode'] ?? promo['name'] ?? ''),
        name:
          typeof promo['name'] === 'string' && promo['name'].trim()
            ? promo['name'].trim()
            : 'Code promo',
        description:
          typeof promo['description'] === 'string' && promo['description'].trim()
            ? promo['description'].trim()
            : null,
        couponCode:
          typeof promo['couponCode'] === 'string' && promo['couponCode'].trim()
            ? promo['couponCode'].trim()
            : null,
        amountCents: typeof promo['amountValue'] === 'number' ? promo['amountValue'] : 0,
        isOnOrder: Boolean(promo['isOnOrder']),
        isLoyalty: Boolean(promo['isLoyalty']),
        endsAt,
      }
    })

  return {
    orderId: String(id),
    periodStartDate: startRaw,
    periodEndDate: endRaw,
    deliveryDate,
    lockDate: lockInfo?.lock ?? null,
    isNextOrder: Boolean(rawCart['is_next_order']),
    onBreak: Boolean(rawCart['onBreak'] ?? lockInfo?.onBreak ?? false),
    edited: typeof rawCart['edited'] === 'string' ? rawCart['edited'] : null,
    recipeTargetCount: recipeCountPref?.['value'] ? Number(recipeCountPref['value']) || null : null,
    servings: servingsPref?.['value'] ? Number(servingsPref['value']) || null : null,
    itemsTotalCents: typeof rawCart['itemsTotal'] === 'number' ? rawCart['itemsTotal'] : 0,
    shippingTotalCents: typeof rawCart['shippingTotal'] === 'number' ? rawCart['shippingTotal'] : 0,
    promotionTotalCents:
      typeof rawCart['orderPromotionTotal'] === 'number' ? rawCart['orderPromotionTotal'] : 0,
    walletTotalCents:
      typeof rawCart['orderWalletTotal'] === 'number' ? rawCart['orderWalletTotal'] : 0,
    walletBalanceCents: typeof rawCart['walletBalance'] === 'number' ? rawCart['walletBalance'] : 0,
    useWallet: Boolean(rawCart['useWallet']),
    totalCents: typeof rawCart['total'] === 'number' ? rawCart['total'] : 0,
    shippingAddress,
    shipment,
    promotions,
    items,
  }
}

export function createQuitoqueBoxClient({
  email,
  password,
  fetchImplementation = fetch,
}: {
  email: string
  password: string
  fetchImplementation?: typeof fetch
}) {
  let cachedToken: string | null = null
  let cachedCustomerPath: string | null = null
  let cachedSubscriptionId: string | null = null
  let cachedTokenExpiresAt = 0
  let cachedLockMap: Map<string, { lock: string | null; onBreak: boolean }> | null = null
  let cachedLockExpiresAt = 0
  const cartTokensByOrderId = new Map<string, string>()
  const catalogCache = new Map<
    string,
    {
      expiresAt: number
      value: {
        items: CatalogProduct[]
        filterGroups: DynamicFilterGroup[]
        seasonalCategories: string[]
      }
    }
  >()

  async function fetchWithTimeout(url: string, init: RequestInit) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
    try {
      return await fetchImplementation(url, {
        ...init,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  }

  async function ensureAuth(force = false) {
    if (!force && cachedToken && Date.now() < cachedTokenExpiresAt) {
      return cachedToken
    }
    const response = await fetchWithTimeout(`${apiBase}/shop/authentication-token`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })
    if (!response.ok) {
      throw new QuitoqueApiError('La connexion Quitoque a échoué.')
    }
    const parsed = authResponseSchema.safeParse(await response.json())
    if (!parsed.success) {
      throw new QuitoqueApiError('Réponse d’authentification Quitoque invalide.')
    }
    cachedToken = parsed.data.token
    cachedCustomerPath = parsed.data.customer ?? cachedCustomerPath
    cachedTokenExpiresAt = Date.now() + tokenTtlMs
    return cachedToken
  }

  async function apiRequest(
    path: string,
    init: RequestInit = {},
    allowRetry = true,
  ): Promise<{ status: number; data: unknown }> {
    const token = await ensureAuth()
    const url = path.startsWith('/api/v2') ? `${apiOrigin}${path}` : `${apiBase}${path}`
    const headers = new Headers(init.headers)
    headers.set('accept', 'application/json')
    headers.set('authorization', `Bearer ${token}`)
    const response = await fetchWithTimeout(url, {
      ...init,
      headers,
      redirect: 'error',
    })
    if (response.status === 401 && allowRetry) {
      cachedToken = null
      cachedTokenExpiresAt = 0
      return apiRequest(path, init, false)
    }
    if (response.status === 204) return { status: 204, data: null }
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      throw new QuitoqueApiError(`Requête Quitoque refusée (HTTP ${response.status}).`)
    }
    return { status: response.status, data }
  }

  async function getLockMap(force = false) {
    if (!force && cachedLockMap && Date.now() < cachedLockExpiresAt) {
      return cachedLockMap
    }
    const lockByStart = new Map<string, { lock: string | null; onBreak: boolean }>()
    try {
      if (!cachedSubscriptionId && cachedCustomerPath) {
        const custRes = await apiRequest(cachedCustomerPath)
        const cust = custRes.data as Record<string, unknown> | null
        const sub = cust?.['subscription'] as Record<string, unknown> | string | undefined
        if (typeof sub === 'string') {
          cachedSubscriptionId = sub.split('/').pop() ?? null
        } else if (sub && typeof sub === 'object' && sub['id'] !== undefined) {
          cachedSubscriptionId = String(sub['id'])
        }
      }
      if (!cachedSubscriptionId) return lockByStart
      const weeksRes = await apiRequest(
        `/shop/account/subscription/${encodeURIComponent(cachedSubscriptionId)}/pauseable-weeks`,
      )
      const parsed = z.array(pauseableWeekSchema).safeParse(weeksRes.data)
      if (parsed.success) {
        for (const week of parsed.data) {
          lockByStart.set(week.start.slice(0, 10), {
            lock: week.lock ?? null,
            onBreak: Boolean(week.on_break),
          })
        }
      }
      cachedLockMap = lockByStart
      cachedLockExpiresAt = Date.now() + tokenTtlMs
    } catch {
      // Lock dates remain null if subscription endpoint is unavailable.
    }
    return lockByStart
  }

  async function listUpcomingBoxes(): Promise<UpcomingBoxWeek[]> {
    await ensureAuth()
    const [cartsRes, lockByStart] = await Promise.all([
      apiRequest('/shop/carts?page=1&itemsPerPage=10'),
      getLockMap(),
    ])
    const rawList = Array.isArray(cartsRes.data)
      ? cartsRes.data
      : ((cartsRes.data as Record<string, unknown> | null)?.['hydra:member'] ?? [])
    if (!Array.isArray(rawList)) return []

    const weeks: UpcomingBoxWeek[] = []
    for (const entry of rawList) {
      if (!entry || typeof entry !== 'object') continue
      const record = entry as Record<string, unknown>
      const parsed = parseCart(record, lockByStart)
      if (!parsed) continue
      if (typeof record['tokenValue'] === 'string' && record['tokenValue']) {
        cartTokensByOrderId.set(parsed.orderId, record['tokenValue'])
      }
      weeks.push(parsed)
    }
    return weeks.toSorted((a, b) => a.periodStartDate.localeCompare(b.periodStartDate))
  }

  async function getWeekCatalog(
    start: string,
    end: string,
    section: PlanificationSection,
  ): Promise<{
    items: CatalogProduct[]
    filterGroups: DynamicFilterGroup[]
    seasonalCategories: string[]
  }> {
    const cacheKey = `${start}:${end}:${section}`
    const cached = catalogCache.get(cacheKey)
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value
    }
    const familyParam = section === 'recipes' ? 'recipe' : 'market'
    const productsQuery = new URLSearchParams({
      format: 'api',
      page: '1',
      itemsPerPage: '100',
    })
    productsQuery.set('attributes[family][1]', familyParam)

    const [productsRes, filtersRes] = await Promise.all([
      apiRequest(`/shop/products/${start}/${end}?${productsQuery}`),
      section === 'recipes'
        ? (() => {
            const filtersQuery = new URLSearchParams({ format: 'api' })
            filtersQuery.set('attributes[family][1]', 'recipe')
            return apiRequest(`/shop/products/${start}/${end}/filters?${filtersQuery}`).catch(
              () => ({ status: 200, data: { filters: [] } }),
            )
          })()
        : Promise.resolve(undefined),
    ])
    const rawEnvelope = productsRes.data as {
      products?: unknown[]
      paginator?: { nbPages?: number }
    } | null
    const rawProducts: unknown[] = Array.isArray(rawEnvelope?.products)
      ? [...rawEnvelope.products]
      : []

    // Fetch remaining pages in parallel if market has > 100 products (capped at 3 pages = 300 items)
    const nbPages = Math.min(rawEnvelope?.paginator?.nbPages ?? 1, 3)
    if (nbPages > 1) {
      const extraPages = await Promise.all(
        Array.from({ length: nbPages - 1 }, (_, i) => {
          const q = new URLSearchParams(productsQuery)
          q.set('page', String(i + 2))
          return apiRequest(`/shop/products/${start}/${end}?${q}`).catch(() => ({
            status: 200,
            data: { products: [] },
          }))
        }),
      )
      for (const page of extraPages) {
        const list = (page.data as { products?: unknown[] } | null)?.products
        if (Array.isArray(list)) rawProducts.push(...list)
      }
    }

    const filterGroups: DynamicFilterGroup[] = []
    if (filtersRes) {
      const parsedFilters = filterEndpointSchema.safeParse(filtersRes.data)
      if (parsedFilters.success && parsedFilters.data.filters) {
        for (const group of parsedFilters.data.filters) {
          const options = (group.values ?? [])
            .map((opt) => ({
              value: String(opt.value),
              label: String(opt.label),
            }))
            .filter((opt) => !(group.type === 'checkbox' && opt.value === '0'))
          if (options.length === 0) continue
          filterGroups.push({
            code: group.code,
            name: group.name,
            type: group.type === 'checkbox' ? 'checkbox' : 'multichoice',
            options: group.type === 'checkbox' ? [{ value: '1', label: group.name }] : options,
          })
        }
      }
    }

    const categoryCounts = new Map<string, number>()
    const items: CatalogProduct[] = []

    for (const candidate of rawProducts) {
      if (!candidate || typeof candidate !== 'object') continue
      const p = candidate as Record<string, unknown>
      const id = p['id'] !== undefined && p['id'] !== null ? String(p['id']) : null
      const code = typeof p['code'] === 'string' ? p['code'] : null
      const title = typeof p['name'] === 'string' ? p['name'].trim() : null
      if (!id || !code || !title) continue

      const categories = parseNameList(p['categories'])
      const highlights = parseHighlightLabels(p['recipe_highlight'])
      const isReadyMeal = isReadyMealCategory(categories)
      if (section === 'ready-meals' && !isReadyMeal) continue
      if (section === 'market' && isReadyMeal) continue

      const tags = parseNameList(p['tags'])
      const nutriScore = parseScoreGrade(p['nutri_score'])
      const carbonScore = parseScoreGrade(p['carbon_score'])
      const filterValues: Record<string, string[]> = {}
      for (const group of filterGroups) {
        const vals = extractFilterKeys(p[group.code]).map((v) => v.toLowerCase())
        if (vals.length) filterValues[group.code] = vals
      }
      if (carbonScore) {
        filterValues['carbon_score'] = [carbonScore.toLowerCase()]
      }

      for (const highlight of highlights) {
        categoryCounts.set(highlight, (categoryCounts.get(highlight) ?? 0) + 1)
      }
      for (const cat of categories) {
        const lower = cat.toLocaleLowerCase('fr')
        if (lower === 'plats cuisinés' || lower === 'à cuisiner') continue
        categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1)
      }

      items.push({
        id,
        code,
        variantId:
          p['variant_id'] !== undefined && p['variant_id'] !== null
            ? String(p['variant_id'])
            : null,
        variantCode: typeof p['variant_code'] === 'string' ? p['variant_code'] : null,
        title,
        description:
          typeof p['short_description'] === 'string' && p['short_description'].trim()
            ? p['short_description'].trim()
            : typeof p['description'] === 'string' && p['description'].trim()
              ? p['description'].trim()
              : null,
        imageUrl: toThumbnailUrl(p['image']),
        totalMinutes: parseMinutes(p['total_time']),
        servings: parseQuitoqueServings(p),
        nutriScore,
        carbonScore,
        nutrition: parseQuitoqueNutrition(p),
        priceCents: typeof p['price'] === 'number' ? p['price'] : null,
        additionalCostCents: typeof p['additional_cost'] === 'number' ? p['additional_cost'] : 0,
        section,
        categories,
        highlights,
        tags,
        allergens: parseAllergens(p['allergens']),
        ingredients: parseCatalogIngredients(p),
        steps: parseCatalogSteps(p['preparation_steps']),
        filterValues,
      })
    }

    if (section === 'recipes') {
      const carbonGrades = [
        ...new Set(items.map((item) => item.carbonScore).filter(Boolean)),
      ].toSorted() as string[]
      if (carbonGrades.length) {
        filterGroups.push({
          code: 'carbon_score',
          name: 'Score carbone',
          type: 'multichoice',
          options: carbonGrades.map((grade) => ({
            value: grade.toLowerCase(),
            label: grade === 'A' ? 'A · Bon pour la planète' : grade,
          })),
        })
      }
    }

    const seasonalCategories = [...categoryCounts.entries()]
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([name]) => name)

    const result = { items, filterGroups, seasonalCategories }
    catalogCache.set(cacheKey, {
      expiresAt: Date.now() + 5 * 60_000,
      value: result,
    })
    return result
  }

  async function resolveOrderToken(orderId: string) {
    let tokenValue = cartTokensByOrderId.get(orderId)
    if (!tokenValue) {
      await listUpcomingBoxes()
      tokenValue = cartTokensByOrderId.get(orderId)
    }
    if (!tokenValue) {
      throw new QuitoqueApiError('Cette box Quitoque n’est plus modifiable ou est introuvable.')
    }
    return tokenValue
  }

  async function addItem(
    orderId: string,
    variantCode: string,
    quantity = 1,
  ): Promise<UpcomingBoxWeek> {
    const tokenValue = await resolveOrderToken(orderId)
    const [res, lockByStart] = await Promise.all([
      apiRequest(`/shop/orders/${encodeURIComponent(tokenValue)}/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          productVariant: variantCode,
          quantity,
        }),
      }),
      getLockMap(),
    ])
    const updated = parseCart((res.data ?? {}) as Record<string, unknown>, lockByStart)
    if (updated) return updated
    const weeks = await listUpcomingBoxes()
    const match = weeks.find((week) => week.orderId === orderId)
    if (!match) throw new QuitoqueApiError('Box introuvable après modification.')
    return match
  }

  async function updateItemQuantity(
    orderId: string,
    itemId: string,
    quantity: number,
  ): Promise<UpcomingBoxWeek> {
    const tokenValue = await resolveOrderToken(orderId)
    const [res, lockByStart] = await Promise.all([
      apiRequest(
        `/shop/orders/${encodeURIComponent(tokenValue)}/items/${encodeURIComponent(itemId)}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ quantity }),
        },
      ),
      getLockMap(),
    ])
    const updated = parseCart((res.data ?? {}) as Record<string, unknown>, lockByStart)
    if (updated) return updated
    const weeks = await listUpcomingBoxes()
    const match = weeks.find((week) => week.orderId === orderId)
    if (!match) throw new QuitoqueApiError('Box introuvable après modification.')
    return match
  }

  async function removeItem(orderId: string, itemId: string): Promise<UpcomingBoxWeek> {
    const tokenValue = await resolveOrderToken(orderId)
    await apiRequest(
      `/shop/orders/${encodeURIComponent(tokenValue)}/items/${encodeURIComponent(itemId)}`,
      { method: 'DELETE' },
    )
    const [orderRes, lockByStart] = await Promise.all([
      apiRequest(`/shop/orders/${encodeURIComponent(tokenValue)}`),
      getLockMap(),
    ])
    const updated = parseCart((orderRes.data ?? {}) as Record<string, unknown>, lockByStart)
    if (updated) return updated
    const weeks = await listUpcomingBoxes()
    const match = weeks.find((week) => week.orderId === orderId)
    if (!match) throw new QuitoqueApiError('Box introuvable après suppression.')
    return match
  }

  async function getDeliveryTimeSlots(
    postalCode: string,
    startDate: string,
  ): Promise<{
    deliveryDates: string[]
    timeSlots: DeliveryTimeSlotOption[]
  }> {
    const query = new URLSearchParams({ postalCode, startDate })
    const res = await apiRequest(`/shop/delivery/home-time-slots?${query}`)
    const data = (res.data ?? {}) as {
      deliveryDates?: unknown[]
      timeSlots?: Array<Record<string, unknown>>
    }
    const deliveryDates = Array.isArray(data.deliveryDates)
      ? data.deliveryDates.filter((d): d is string => typeof d === 'string')
      : []

    const bySlotId = new Map<number, DeliveryTimeSlotOption>()
    for (const raw of Array.isArray(data.timeSlots) ? data.timeSlots : []) {
      const id = typeof raw['id'] === 'number' ? raw['id'] : null
      const code = typeof raw['shippingMethodCode'] === 'string' ? raw['shippingMethodCode'] : null
      const begin = typeof raw['begin'] === 'string' ? raw['begin'] : null
      const end = typeof raw['end'] === 'string' ? raw['end'] : null
      if (id === null || !code || !begin || !end) continue
      const dates = Array.isArray(raw['nextDeliveryDates'])
        ? raw['nextDeliveryDates'].filter((d): d is string => typeof d === 'string')
        : []
      const existing = bySlotId.get(id)
      if (existing) {
        for (const d of dates) {
          if (!existing.deliveryDates.includes(d)) existing.deliveryDates.push(d)
        }
      } else {
        bySlotId.set(id, {
          id,
          shippingMethodCode: code,
          label: typeof raw['label'] === 'string' ? raw['label'] : `${begin} - ${end}`,
          begin,
          end,
          priceCents: typeof raw['price'] === 'number' ? raw['price'] : 0,
          recommended: raw['tag'] === 'recommended',
          deliveryDates: [...dates],
        })
      }
    }
    return { deliveryDates, timeSlots: [...bySlotId.values()] }
  }

  async function refreshSingleCart(orderId: string, tokenValue: string) {
    const [orderRes, lockByStart] = await Promise.all([
      apiRequest(`/shop/orders/${encodeURIComponent(tokenValue)}`),
      getLockMap(),
    ])
    const updated = parseCart((orderRes.data ?? {}) as Record<string, unknown>, lockByStart)
    if (updated) return updated
    const weeks = await listUpcomingBoxes()
    const match = weeks.find((week) => week.orderId === orderId)
    if (!match) throw new QuitoqueApiError('Box introuvable.')
    return match
  }

  async function updateServings(orderId: string, size: number): Promise<UpcomingBoxWeek> {
    const tokenValue = await resolveOrderToken(orderId)
    await apiRequest(`/shop/orders/${encodeURIComponent(tokenValue)}/default-variant-size`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ size }),
    })
    return refreshSingleCart(orderId, tokenValue)
  }

  async function updateDeliverySlot(
    orderId: string,
    shipmentId: string,
    payload: {
      shippingMethodCode: string
      deliveryDate: string
      begin: string
      end: string
      timeSlotId: number
    },
  ): Promise<UpcomingBoxWeek> {
    const tokenValue = await resolveOrderToken(orderId)
    await apiRequest(
      `/shop/orders/${encodeURIComponent(tokenValue)}/shipments/${encodeURIComponent(shipmentId)}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/merge-patch+json' },
        body: JSON.stringify({
          shippingMethod: `/api/v2/shop/shipping-methods/${payload.shippingMethodCode}`,
          deliveryDate: payload.deliveryDate,
          deliveryTimeSlotStartAt: padTime(payload.begin),
          deliveryTimeSlotEndAt: padTime(payload.end),
          deliveryTimeSlotId: payload.timeSlotId,
        }),
      },
    )
    return refreshSingleCart(orderId, tokenValue)
  }

  async function applyCoupon(orderId: string, couponCode: string | null): Promise<UpcomingBoxWeek> {
    const tokenValue = await resolveOrderToken(orderId)
    await apiRequest(`/shop/orders/${encodeURIComponent(tokenValue)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ couponCode }),
    })
    return refreshSingleCart(orderId, tokenValue)
  }

  async function toggleWallet(orderId: string, useWallet: boolean): Promise<UpcomingBoxWeek> {
    const tokenValue = await resolveOrderToken(orderId)
    await apiRequest(`/shop/orders/${encodeURIComponent(tokenValue)}/wallet`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ useWallet }),
    })
    return refreshSingleCart(orderId, tokenValue)
  }

  return {
    listUpcomingBoxes,
    getWeekCatalog,
    getDeliveryTimeSlots,
    addItem,
    updateItemQuantity,
    removeItem,
    updateServings,
    updateDeliverySlot,
    applyCoupon,
    toggleWallet,
  }
}

export type QuitoqueBoxClient = ReturnType<typeof createQuitoqueBoxClient>
