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
  nutriScore: string | null
  carbonScore: string | null
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

export type WeekCatalogResponse = {
  items: CatalogProduct[]
  filterGroups: DynamicFilterGroup[]
  seasonalCategories: string[]
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/planification${path}`, {
    credentials: 'same-origin',
    ...init,
  })
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null
  if (!response.ok) {
    throw new Error(payload?.error ?? 'La planification Quitoque est indisponible.')
  }
  return payload as T
}

export async function listUpcomingWeeks() {
  const res = await request<{ weeks: UpcomingBoxWeek[] }>('/weeks')
  return res.weeks
}

export async function getWeekCatalog(start: string, end: string, section: PlanificationSection) {
  const query = new URLSearchParams({ start, end, section })
  return request<WeekCatalogResponse>(`/catalog?${query}`)
}

export async function addBoxItem(orderId: string, variantCode: string, quantity = 1) {
  const res = await request<{ week: UpcomingBoxWeek }>(
    `/weeks/${encodeURIComponent(orderId)}/items`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ variantCode, quantity }),
    },
  )
  return res.week
}

export async function updateBoxItemQuantity(orderId: string, itemId: string, quantity: number) {
  const res = await request<{ week: UpcomingBoxWeek }>(
    `/weeks/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quantity }),
    },
  )
  return res.week
}

export async function removeBoxItem(orderId: string, itemId: string) {
  const res = await request<{ week: UpcomingBoxWeek }>(
    `/weeks/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`,
    { method: 'DELETE' },
  )
  return res.week
}

export async function getDeliveryTimeSlots(postalCode: string, startDate: string) {
  const query = new URLSearchParams({ postalCode, startDate })
  return request<{
    deliveryDates: string[]
    timeSlots: DeliveryTimeSlotOption[]
  }>(`/time-slots?${query}`)
}

export async function updateBoxServings(orderId: string, size: number) {
  const res = await request<{ week: UpcomingBoxWeek }>(
    `/weeks/${encodeURIComponent(orderId)}/servings`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ size }),
    },
  )
  return res.week
}

export async function updateBoxDeliverySlot(
  orderId: string,
  payload: {
    shipmentId: string
    shippingMethodCode: string
    deliveryDate: string
    begin: string
    end: string
    timeSlotId: number
  },
) {
  const res = await request<{ week: UpcomingBoxWeek }>(
    `/weeks/${encodeURIComponent(orderId)}/delivery`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  return res.week
}

export async function applyBoxCoupon(orderId: string, couponCode: string | null) {
  const res = await request<{ week: UpcomingBoxWeek }>(
    `/weeks/${encodeURIComponent(orderId)}/coupon`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ couponCode }),
    },
  )
  return res.week
}

export async function toggleBoxWallet(orderId: string, useWallet: boolean) {
  const res = await request<{ week: UpcomingBoxWeek }>(
    `/weeks/${encodeURIComponent(orderId)}/wallet`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ useWallet }),
    },
  )
  return res.week
}

export async function geocodeAddress(query: string) {
  const params = new URLSearchParams({ q: query })
  const res = await request<{ coords: { lat: number; lon: number } | null }>(`/geocode?${params}`)
  return res.coords
}
