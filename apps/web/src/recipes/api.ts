import type { RecipeDetail, RecipeListResponse } from '@quisera/shared'

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
