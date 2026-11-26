import type { RecipeMetric, RecipeSummary } from '@quisera/shared'

export function recipeMetricValue(metrics: readonly RecipeMetric[], key: string): string | null {
  return metrics.find((metric) => metric.key === key)?.value ?? null
}

export function resolveRecipeSourceLabel(
  item: Pick<RecipeSummary, 'source' | 'metrics' | 'imageUrl'>,
): string {
  if (item.source === 'quitoque') return 'Quitoque'
  const host =
    recipeMetricValue(item.metrics, 'sourceHost') ??
    item.metrics.find((metric) => metric.provenance)?.provenance ??
    item.imageUrl ??
    ''
  const lower = host.toLowerCase()
  if (lower.includes('jow.')) return 'Jow'
  if (lower.includes('marmiton.') || lower.includes('afcdn.com')) return 'Marmiton'
  if (lower.includes('750g.')) return '750g'
  if (lower.includes('cuisineaz.')) return 'CuisineAZ'
  if (lower.includes('hervecuisine.')) return 'Hervé Cuisine'
  return 'Maison'
}
