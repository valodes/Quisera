import { QueryClient } from '@tanstack/vue-query'
import type { RecipeFilters } from '@/recipes/api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

export const queryKeys = {
  session: ['auth', 'session'] as const,
  profile: ['account', 'profile'] as const,
  household: ['account', 'household'] as const,
  householdPreferences: ['account', 'household', 'preferences'] as const,
  recipes: (filters: RecipeFilters, favorites = false) =>
    ['recipes', 'list', { ...filters, favorites }] as const,
  recipesAll: ['recipes'] as const,
  houseRecipesAll: ['recipes', 'house-options'] as const,
  planning: (from: string, to: string) => ['planning', 'range', from, to] as const,
  planningAll: ['planning'] as const,
  delivery: (cycleId: string) => ['planning', 'delivery', cycleId] as const,
  upcomingBoxes: ['planification', 'boxes'] as const,
  weekCatalog: (start: string, end: string, section: string) =>
    ['planification', 'catalog', start, end, section] as const,
}
