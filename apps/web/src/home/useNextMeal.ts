import { useQuery } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { addCivilDays, parisCivilDate } from '@quisera/shared/dates'
import type { PlanningRange } from '@quisera/shared'
import { queryClient, queryKeys } from '@/lib/query'
import { getDelivery, getPlanning, type DeliverySnapshot } from '@/planning/api'
import { getRecipe } from '@/recipes/api'

type SlotMeal = NonNullable<PlanningRange['days'][number]['lunch']['meal']>

export type HomeMealIngredient = {
  name: string
  quantity: string | null
  unit: string | null
  notes: string | null
}

export type HomeMealEntry = {
  date: string
  period: 'lunch' | 'dinner'
  cycleId: string | null
  meal: SlotMeal
  description: string | null
  totalMinutes: number | null
  nutriScore: string | null
  carbonScore: string | null
  ingredients: HomeMealIngredient[]
  steps: string[]
}

function parseIngredients(value: DeliverySnapshot['ingredientsJson']) {
  try {
    const entries: unknown = JSON.parse(value)
    if (!Array.isArray(entries)) return []
    return entries.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return []
      const item = entry as Record<string, unknown>
      if (typeof item['name'] !== 'string') return []
      const rawUnit = typeof item['unit'] === 'string' ? item['unit'].trim() : null
      return [
        {
          name: item['name'],
          quantity: typeof item['quantity'] === 'string' ? item['quantity'] : null,
          unit: rawUnit && rawUnit.toLowerCase() !== 'g' ? rawUnit : null,
          notes: typeof item['notes'] === 'string' ? item['notes'] : null,
        },
      ]
    })
  } catch {
    return []
  }
}

function parseSteps(value: DeliverySnapshot['stepsJson']) {
  try {
    const entries: unknown = JSON.parse(value)
    return Array.isArray(entries)
      ? entries.filter((entry): entry is string => typeof entry === 'string')
      : []
  } catch {
    return []
  }
}

function formatMealDate(date: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Paris',
  }).format(new Date(`${date}T12:00:00`))
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Paris',
  }).format(new Date(`${date}T12:00:00`))
}

async function fetchNextMeals(today: string): Promise<HomeMealEntry[]> {
  const parisHour = Number(
    new Intl.DateTimeFormat('fr-FR', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Europe/Paris',
    }).format(new Date()),
  )
  const toDate = addCivilDays(today, 14)
  const planning = await queryClient.fetchQuery({
    queryKey: queryKeys.planning(today, toDate),
    queryFn: () => getPlanning(today, toDate),
  })

  const activeCycle =
    planning.deliveryCycles
      .toReversed()
      .find(
        (cycle) => cycle.deliveryDate <= today && addCivilDays(cycle.deliveryDate, 7) >= today,
      ) ?? planning.deliveryCycles[0]

  const deliverySelections = activeCycle
    ? await queryClient
        .fetchQuery({
          queryKey: queryKeys.delivery(activeCycle.id),
          queryFn: () => getDelivery(activeCycle.id),
        })
        .then((res) => res.selections)
        .catch(() => [])
    : []

  const selectionMap = new Map(deliverySelections.map((item) => [item.id, item]))
  const collected: HomeMealEntry[] = []

  for (const day of planning.days) {
    if (day.date < today) continue
    const periods: Array<'lunch' | 'dinner'> =
      day.date === today && parisHour >= 15 ? ['dinner'] : ['lunch', 'dinner']
    for (const period of periods) {
      const meal = day[period].meal
      if (!meal) continue
      if (meal.category === 'quitoque') {
        const sel = meal.selectionId ? selectionMap.get(meal.selectionId) : undefined
        collected.push({
          date: day.date,
          period,
          cycleId: activeCycle?.id ?? null,
          meal,
          description: sel?.description ?? meal.description ?? null,
          totalMinutes: sel?.totalMinutes ?? meal.totalMinutes ?? null,
          nutriScore: sel?.nutriScore ?? meal.nutriScore ?? null,
          carbonScore: sel?.carbonScore ?? meal.carbonScore ?? null,
          ingredients: sel ? parseIngredients(sel.ingredientsJson) : [],
          steps: sel ? parseSteps(sel.stepsJson) : [],
        })
      } else if (meal.category === 'home') {
        collected.push({
          date: day.date,
          period,
          cycleId: null,
          meal,
          description: meal.description ?? null,
          totalMinutes: meal.totalMinutes ?? null,
          nutriScore: meal.nutriScore ?? null,
          carbonScore: meal.carbonScore ?? null,
          ingredients: [],
          steps: [],
        })
      } else {
        collected.push({
          date: day.date,
          period,
          cycleId: null,
          meal,
          description: meal.notes,
          totalMinutes: null,
          nutriScore: null,
          carbonScore: null,
          ingredients: [],
          steps: [],
        })
      }
      if (collected.length >= 4) break
    }
    if (collected.length >= 4) break
  }

  // Hydrate ingredients & steps only for the immediate next meal when it is a house recipe
  const first = collected[0]
  if (first && first.meal.category === 'home' && first.meal.recipeId) {
    const recipeId = first.meal.recipeId
    const detail = await queryClient
      .fetchQuery({
        queryKey: queryKeys.recipeDetail(recipeId),
        queryFn: () => getRecipe(recipeId),
      })
      .catch(() => null)
    if (detail) {
      first.description = first.description ?? detail.description
      first.totalMinutes = first.totalMinutes ?? detail.totalMinutes
      first.nutriScore =
        first.nutriScore ?? detail.metrics.find((m) => m.key === 'nutriScore')?.value ?? null
      first.carbonScore =
        first.carbonScore ?? detail.metrics.find((m) => m.key === 'carbonScore')?.value ?? null
      first.ingredients = detail.ingredients.map((ing) => ({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        notes: ing.notes,
      }))
      first.steps = detail.steps.map((s) => s.instructions)
    }
  }

  return collected
}

export function useNextMeal() {
  const today = parisCivilDate(new Date())
  const checkedIngredients = ref<Record<string, boolean>>({})

  const {
    data,
    isPending,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.nextMeals(today),
    queryFn: () => fetchNextMeals(today),
  })

  const entries = computed(() => data.value ?? [])
  const nextMeal = computed(() => entries.value[0] ?? null)
  const upcomingMeals = computed(() => entries.value.slice(1, 4))
  const error = computed(() =>
    queryError.value instanceof Error
      ? queryError.value.message
      : queryError.value
        ? 'Impossible de charger le prochain repas.'
        : '',
  )

  const checkedCount = computed(() => {
    const meal = nextMeal.value
    if (!meal) return 0
    return meal.ingredients.filter((_, index) =>
      Boolean(checkedIngredients.value[`${meal.meal.id}-${index}`]),
    ).length
  })

  function toggleIngredient(index: number) {
    const meal = nextMeal.value
    if (!meal) return
    const key = `${meal.meal.id}-${index}`
    checkedIngredients.value = {
      ...checkedIngredients.value,
      [key]: !checkedIngredients.value[key],
    }
  }

  function isIngredientChecked(index: number) {
    const meal = nextMeal.value
    if (!meal) return false
    return Boolean(checkedIngredients.value[`${meal.meal.id}-${index}`])
  }

  return {
    loading: isPending,
    error,
    nextMeal,
    upcomingMeals,
    checkedCount,
    toggleIngredient,
    isIngredientChecked,
    formatMealDate,
    formatShortDate,
  }
}
