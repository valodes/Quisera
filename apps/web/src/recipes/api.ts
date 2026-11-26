import type { RecipeDetail, RecipeListResponse, RecipeNutrition } from '@quisera/shared'

export type RecipeFilters = {
  q?: string
  source?: 'all' | 'house' | 'quitoque'
  category?: string
  sort?: 'recent' | 'title' | 'time'
  page?: number
  pageSize?: number
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/recipes${path}`, {
    credentials: 'same-origin',
    ...init,
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(payload?.error ?? 'Une erreur est survenue. Réessayez.')
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function listRecipes(filters: RecipeFilters, favorites = false) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  return request<RecipeListResponse>(`${favorites ? '/favorites' : ''}?${query}`)
}

export function getRecipe(id: string) {
  return request<RecipeDetail>(`/${encodeURIComponent(id)}`)
}

export function setFavorite(id: string, favorite: boolean) {
  return request<void>(`/${encodeURIComponent(id)}/favorite`, {
    method: favorite ? 'POST' : 'DELETE',
  })
}

export function saveRecipe(id: string | undefined, payload: FormData | object) {
  const formData = payload instanceof FormData
  return request<RecipeDetail>(id ? `/${encodeURIComponent(id)}` : '', {
    method: id ? 'PUT' : 'POST',
    ...(formData ? {} : { headers: { 'Content-Type': 'application/json' } }),
    body: formData ? payload : JSON.stringify(payload),
  })
}

export function deleteRecipe(id: string) {
  return request<void>(`/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export type CatalogSourceId = 'all' | 'jow' | 'marmiton' | '750g' | 'cuisineaz' | 'hervecuisine'

export type ExternalCatalogItem = {
  source: Exclude<CatalogSourceId, 'all'>
  sourceLabel: string
  title: string
  url: string
  imageUrl: string | null
  description?: string | null
}

export type CatalogSourceStatus = {
  source: Exclude<CatalogSourceId, 'all'>
  label: string
  ok: boolean
  count: number
}

export type ImportedRecipeDraft = {
  title: string
  description: string | null
  imageUrl: string | null
  totalMinutes: number | null
  servings: number | null
  difficulty: string | null
  category: string | null
  tags: string[]
  ingredients: Array<{
    name: string
    quantity: string | null
    unit: string | null
    notes: string | null
  }>
  steps: string[]
  caloriesKcal: number | null
  nutrition: RecipeNutrition | null
  sourceUrl: string
  sourceHost: string
  strategy: 'site-adapter' | 'schema-org'
}

export function searchExternalCatalog(q: string, source: CatalogSourceId = 'all') {
  const query = new URLSearchParams({ q, source })
  return request<{
    items: ExternalCatalogItem[]
    sourceStatuses: CatalogSourceStatus[]
  }>(`/external/search?${query}`)
}

export function previewRecipeUrl(url: string) {
  return request<{ draft: ImportedRecipeDraft }>('/import-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, save: false }),
  })
}

export function importRecipeUrl(url: string) {
  return request<RecipeDetail>('/import-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, save: true }),
  })
}
