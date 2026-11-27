import type { ExternalCatalogItem } from '@/recipes/api'
import type { FridgeZone } from './helpers'

export type FridgeItem = {
  id: string
  name: string
  normalizedName: string
  quantity: string | null
  unit: string | null
  zone: FridgeZone
  expiresOn: string | null
  createdAt: string
  updatedAt: string
}

export type FridgeMatchBucket = 'ready' | 'almost' | 'partial'

export type RecipeFridgeMatch = {
  recipeId: string
  bucket: FridgeMatchBucket
  matchedCount: number
  totalCount: number
  coverage: number
  matchedIngredients: string[]
  missingIngredients: string[]
  usesExpiringItems: boolean
  expiringMatches: string[]
}

export type FridgeWebDiscoverItem = ExternalCatalogItem & {
  matchedIngredients: string[]
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/fridge${path}`, {
    credentials: 'include',
    ...init,
  })
  if (response.status === 204) return undefined as T
  const body = (await response.json().catch(() => null)) as { error?: string } | null
  if (!response.ok) {
    throw new Error(body?.error ?? 'Action impossible pour le moment.')
  }
  return body as T
}

export async function listFridgeItems(): Promise<FridgeItem[]> {
  const result = await request<{ items: FridgeItem[] }>('')
  return result.items
}

export function addFridgeItem(payload: {
  input?: string
  name?: string
  quantity?: string | null
  unit?: string | null
  zone?: FridgeZone
  expiresOn?: string | null
}) {
  return request<{ item: FridgeItem; merged: boolean }>('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function updateFridgeItem(
  id: string,
  payload: {
    name?: string
    quantity?: string | null
    unit?: string | null
    zone?: FridgeZone
    expiresOn?: string | null
  },
) {
  return request<{ item: FridgeItem }>(`/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function deleteFridgeItem(id: string) {
  return request<void>(`/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function suggestFridgeIngredients(query: string): Promise<string[]> {
  if (query.trim().length < 2) return []
  const result = await request<{ suggestions: string[] }>(
    `/suggest?q=${encodeURIComponent(query.trim())}`,
  )
  return result.suggestions
}

export function getFridgeRecipeMatches(options?: { includeStaples?: boolean; itemIds?: string[] }) {
  const params = new URLSearchParams()
  if (options?.includeStaples) params.set('includeStaples', 'true')
  if (options?.itemIds?.length) params.set('itemIds', options.itemIds.join(','))
  const suffix = params.toString() ? `?${params.toString()}` : ''
  return request<{ matches: RecipeFridgeMatch[]; fridgeItemCount: number }>(`/matches${suffix}`)
}

export function discoverWebRecipesFromFridge(itemIds: string[]) {
  const params = new URLSearchParams()
  if (itemIds.length) params.set('itemIds', itemIds.slice(0, 3).join(','))
  const suffix = params.toString() ? `?${params.toString()}` : ''
  return request<{
    items: FridgeWebDiscoverItem[]
    queriesRun: number
    selectedIngredients: string[]
  }>(`/discover${suffix}`)
}
