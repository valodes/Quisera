import { computed, onMounted, ref, shallowRef } from 'vue'
import { addCivilDays, parisCivilDate, type PlanningRange } from '@quisera/shared'
import { queryClient, queryKeys } from '@/lib/query'
import { getDelivery, getPlanning, type DeliverySnapshot } from '@/planning/api'
import { listRecipes } from '@/recipes/api'

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

export function useNextMeal() {
  const loading = ref(true)
  const error = ref('')
  const entries = shallowRef<HomeMealEntry[]>([])
  const checkedIngredients = ref<Record<string, boolean>>({})

  const nextMeal = computed(() => entries.value[0] ?? null)
  const upcomingMeals = computed(() => entries.value.slice(1, 4))

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

  async function load() {
    loading.value = true
    error.value = ''
    try {
      const today = parisCivilDate(new Date())
      const parisHour = Number(
        new Intl.DateTimeFormat('fr-FR', {
          hour: 'numeric',
          hour12: false,
          timeZone: 'Europe/Paris',
        }).format(new Date()),
      )
      const toDate = addCivilDays(today, 14)
      const [planning, homeList] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: queryKeys.planning(today, toDate),
          queryFn: () => getPlanning(today, toDate),
        }),
        queryClient
          .fetchQuery({
            queryKey: queryKeys.houseRecipesAll,
            queryFn: () =>
              listRecipes({
                source: 'house',
                page: 1,
                pageSize: 100,
                sort: 'title',
              }),
          })
          .catch(() => ({ items: [] })),
      ])

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
      const homeMap = new Map(homeList.items.map((item) => [item.id, item]))

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
              meal,
              description: sel?.description ?? null,
              totalMinutes: sel?.totalMinutes ?? null,
              nutriScore: sel?.nutriScore ?? null,
              carbonScore: sel?.carbonScore ?? null,
              ingredients: sel ? parseIngredients(sel.ingredientsJson) : [],
              steps: sel ? parseSteps(sel.stepsJson) : [],
            })
          } else if (meal.category === 'home') {
            const home = meal.recipeId ? homeMap.get(meal.recipeId) : undefined
            const nutri = home?.metrics.find((m) => m.key === 'nutriScore')
            const carbon = home?.metrics.find((m) => m.key === 'carbonScore')
            collected.push({
              date: day.date,
              period,
              meal,
              description: home?.description ?? null,
              totalMinutes: home?.totalMinutes ?? null,
              nutriScore: nutri?.value ?? null,
              carbonScore: carbon?.value ?? null,
              ingredients: [],
              steps: [],
            })
          } else {
            collected.push({
              date: day.date,
              period,
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
      entries.value = collected
    } catch (cause) {
      error.value =
        cause instanceof Error ? cause.message : 'Impossible de charger le prochain repas.'
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    void load()
  })

  return {
    loading,
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
