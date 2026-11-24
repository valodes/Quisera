import type { PlanningRange } from '@quisera/shared'

export type DeliverySnapshot = {
  id: string
  title: string
  isAvailable: boolean
  sourcePosition: number
  occurrence: number
  description: string | null
  photoUrl: string | null
  photoThumbnailUrl: string | null
  totalMinutes: number | null
  nutriScore: string | null
  carbonScore: string | null
  ingredientsJson: string
  stepsJson: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/planning${path}`, {
    credentials: 'same-origin',
    ...init,
  })
  const payload = (await response.json().catch(() => null)) as
    (T & { error?: string; preview?: unknown }) | null
  if (!response.ok) {
    const error = new Error(payload?.error ?? 'Le planning est indisponible.')
    Object.assign(error, { status: response.status, preview: payload?.preview })
    throw error
  }
  return payload as T
}

export function getPlanning(from: string, to: string) {
  const query = new URLSearchParams({ from, to })
  return request<PlanningRange>(`?${query}`)
}

export function syncDeliveries() {
  return request<{
    added: number
    updated: number
    invalidDeliveryDates: number
    completedAt: string
  }>('/quitoque/sync', { method: 'POST' })
}

export function getDelivery(id: string) {
  return request<{
    cycle: { id: string; deliveryDate: string }
    selections: DeliverySnapshot[]
  }>(`/deliveries/${encodeURIComponent(id)}`)
}

export function syncDeliveryRecipes(id: string) {
  return request<{ added: number; updated: number; unavailable: number }>(
    `/deliveries/${encodeURIComponent(id)}/recipes/sync`,
    { method: 'POST' },
  )
}

export function distributeDelivery(id: string, confirmed = false) {
  return request<{
    assigned: number
    leftEmpty: number
    preserved: number
    unassigned: number
  }>(`/deliveries/${encodeURIComponent(id)}/distribute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirmed }),
  })
}

export function savePlanningSlot(
  payload:
    | {
        date: string
        period: 'lunch' | 'dinner'
        category: 'home'
        recipeId: string
      }
    | {
        date: string
        period: 'lunch' | 'dinner'
        category: 'quitoque'
        selectionId: string
      }
    | {
        date: string
        period: 'lunch' | 'dinner'
        category: 'restaurant'
        restaurantName?: string
        notes?: string
      },
) {
  return request<{ saved: true }>('/slots', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function clearPlanningSlot(date: string, period: 'lunch' | 'dinner') {
  return request<{ cleared: true }>(`/slots/${date}/${period}`, {
    method: 'DELETE',
  })
}

export function movePlanningSlot(
  fromDate: string,
  fromPeriod: 'lunch' | 'dinner',
  toDate: string,
  toPeriod: 'lunch' | 'dinner',
) {
  return request<{ moved: true }>('/slots/move', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fromDate, fromPeriod, toDate, toPeriod }),
  })
}
