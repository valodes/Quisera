import { scaleIngredientsForServings } from '@quisera/shared/servings'
import { useQuery } from '@tanstack/vue-query'
import { computed, ref, watch, type Ref } from 'vue'
import { getHouseholdPreferences } from '@/account/api'
import { queryKeys } from '@/lib/query'

export function useHouseholdDefaultServings() {
  const { data } = useQuery({
    queryKey: queryKeys.householdPreferences,
    queryFn: getHouseholdPreferences,
    staleTime: 5 * 60_000,
  })
  return computed(() => data.value?.defaultServings ?? 2)
}

export function createServingsController<T extends { readonly quantity?: string | null }>(
  sourceServings: Ref<number | null | undefined>,
  ingredients: Ref<readonly T[]>,
  defaultServings: Ref<number>,
) {
  const override = ref<number | null>(null)

  watch(sourceServings, () => {
    override.value = null
  })

  const canScale = computed(
    () => typeof sourceServings.value === 'number' && sourceServings.value > 0,
  )

  const displayServings = computed(() => {
    if (!canScale.value) return sourceServings.value ?? defaultServings.value
    if (override.value !== null) return override.value
    return defaultServings.value
  })

  const isScaled = computed(() => canScale.value && displayServings.value !== sourceServings.value)

  const scaledIngredients = computed(() => {
    if (!canScale.value) return [...ingredients.value]
    return scaleIngredientsForServings(
      ingredients.value,
      sourceServings.value,
      displayServings.value,
    )
  })

  function setServings(next: number) {
    override.value = Math.max(1, Math.min(24, Math.round(next)))
  }

  function increment() {
    setServings(displayServings.value + 1)
  }

  function decrement() {
    setServings(displayServings.value - 1)
  }

  function reset() {
    if (canScale.value && sourceServings.value) {
      override.value = sourceServings.value
    } else {
      override.value = null
    }
  }

  return {
    canScale,
    displayServings,
    isScaled,
    scaledIngredients,
    setServings,
    increment,
    decrement,
    reset,
  }
}

export function useRecipeServings<T extends { readonly quantity?: string | null }>(
  sourceServings: Ref<number | null | undefined>,
  ingredients: Ref<readonly T[]>,
) {
  const defaultServings = useHouseholdDefaultServings()
  return createServingsController(sourceServings, ingredients, defaultServings)
}
