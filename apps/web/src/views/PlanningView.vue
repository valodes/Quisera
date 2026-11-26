<script setup lang="ts">
defineOptions({ name: 'PlanningView' })

import { computed, defineAsyncComponent, onMounted, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  addCivilDays,
  addCivilMonths,
  deliveryCycleSlots,
  isCivilDate,
  monthGridDates,
  parisCivilDate,
} from '@quisera/shared/dates'
import type { PlanningRange, RecipeNutrition } from '@quisera/shared'
import {
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  X,
} from '@lucide/vue'
import RecipeCard from '@/components/recipes/RecipeCard.vue'
import Button from '@/components/ui/Button.vue'
import { useToast } from '@/components/ui/toast'
import { queryClient, queryKeys } from '@/lib/query'
import { listRecipes } from '@/recipes/api'
import { recipeMetricValue, resolveRecipeSourceLabel } from '@/recipes/presentation'
import { useSlotDrag } from '@/planning/useSlotDrag'
import {
  clearPlanningSlot,
  type DeliverySnapshot,
  distributeDelivery,
  getDelivery,
  getPlanning,
  movePlanningSlot,
  savePlanningSlot,
  syncDeliveries,
  syncDeliveryRecipes,
} from '@/planning/api'

const PlanningMealModal = defineAsyncComponent(
  () => import('@/components/planning/PlanningMealModal.vue'),
)
const PlanningMonthGrid = defineAsyncComponent(
  () => import('@/components/planning/PlanningMonthGrid.vue'),
)
const ModalDialog = defineAsyncComponent(() => import('@/components/ui/ModalDialog.vue'))

type ViewMode = 'week' | 'month' | 'day'
type SlotMeal = NonNullable<PlanningRange['days'][number]['lunch']['meal']>
type Selection = {
  id: string
  title: string
  isAvailable: boolean
  sourcePosition: number
  occurrence: number
  imageUrl: string | null
  thumbnailUrl: string | null
  description: string | null
  totalMinutes: number | null
  servings: number | null
  nutriScore: string | null
  carbonScore: string | null
  nutrition: RecipeNutrition | null
  ingredients: Array<{
    name: string
    quantity: string | null
    unit: string | null
    notes: string | null
  }>
  steps: string[]
}
type HomeRecipeOption = {
  id: string
  title: string
  sourceLabel: string
  description: string | null
  totalMinutes: number | null
  caloriesKcal: number | null
  nutriScore: string | null
  carbonScore: string | null
}
const route = useRoute()
const router = useRouter()
const toast = useToast()
const selectedDate = computed(() =>
  typeof route.query['date'] === 'string' && isCivilDate(route.query['date'])
    ? route.query['date']
    : parisCivilDate(new Date()),
)
const view = computed<ViewMode>(() =>
  route.query['view'] === 'month' || route.query['view'] === 'day' ? route.query['view'] : 'week',
)
const range = shallowRef<PlanningRange | null>(null)
const selections = shallowRef<Selection[]>([])
const homeRecipes = shallowRef<HomeRecipeOption[]>([])
const cycleId = ref('')
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const status = ref('')
const confirmDistribution = ref(false)
const assignment = ref<
  Record<
    string,
    {
      category: 'home' | 'quitoque' | 'restaurant'
      recipeId: string
      selectionId: string
      restaurantName: string
      notes: string
    }
  >
>({})
const activeMealModal = ref<{
  date: string
  period: 'lunch' | 'dinner'
  meal: SlotMeal
} | null>(null)

const cycles = computed(() => range.value?.deliveryCycles ?? [])
const currentCycle = computed(
  () =>
    cycles.value.find((cycle) => cycle.id === cycleId.value) ??
    cycles.value
      .toReversed()
      .find(
        (cycle) =>
          cycle.deliveryDate <= selectedDate.value &&
          addCivilDays(cycle.deliveryDate, 7) >= selectedDate.value,
      ) ??
    cycles.value[0],
)
const daysByDate = computed(() => new Map((range.value?.days ?? []).map((day) => [day.date, day])))
const availableSelections = computed(() => selections.value.filter((item) => item.isAvailable))
const orderedSlots = computed(() => {
  if (!currentCycle.value) return []
  const result: Array<{
    date: string
    period: 'lunch' | 'dinner'
    meal: PlanningRange['days'][number]['lunch']['meal']
  }> = []
  for (let offset = 0; offset <= 7; offset += 1) {
    const date = addCivilDays(currentCycle.value.deliveryDate, offset)
    const day = daysByDate.value.get(date)
    if (!day) continue
    if (offset !== 0) result.push({ date, period: 'lunch', meal: day.lunch.meal })
    if (offset !== 7) result.push({ date, period: 'dinner', meal: day.dinner.meal })
  }
  return result
})
const selectedDay = computed(() => daysByDate.value.get(selectedDate.value))
const monthDates = computed(() => monthGridDates(selectedDate.value))
const monthName = computed(() =>
  new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(new Date(`${selectedDate.value}T12:00:00`)),
)

function rangeAround(date: string) {
  return { from: addCivilDays(date, -31), to: addCivilDays(date, 31) }
}
async function load(silent = false, forceFresh = false) {
  if (!silent && !range.value) loading.value = true
  error.value = ''
  try {
    const bounds = rangeAround(selectedDate.value)
    if (forceFresh) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.planningAll })
    }
    range.value = await queryClient.fetchQuery({
      queryKey: queryKeys.planning(bounds.from, bounds.to),
      queryFn: () => getPlanning(bounds.from, bounds.to),
    })
    const requestedCycle =
      typeof route.query['cycle'] === 'string'
        ? cycles.value.find((cycle) => cycle.id === route.query['cycle'])
        : undefined
    const matchingCycle = cycles.value
      .toReversed()
      .find(
        (cycle) =>
          cycle.deliveryDate <= selectedDate.value &&
          addCivilDays(cycle.deliveryDate, 7) >= selectedDate.value,
      )
    const closestCycle = cycles.value.toSorted(
      (left, right) =>
        Math.abs(
          Date.parse(`${left.deliveryDate}T00:00:00Z`) -
            Date.parse(`${selectedDate.value}T00:00:00Z`),
        ) -
        Math.abs(
          Date.parse(`${right.deliveryDate}T00:00:00Z`) -
            Date.parse(`${selectedDate.value}T00:00:00Z`),
        ),
    )[0]
    cycleId.value = requestedCycle?.id ?? matchingCycle?.id ?? closestCycle?.id ?? ''
    if (view.value === 'week' && cycleId.value && route.query['cycle'] !== cycleId.value)
      void router.replace({ query: { ...route.query, cycle: cycleId.value } })
    if (currentCycle.value) await loadSelections(currentCycle.value.id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Le planning ne peut pas être chargé.'
  } finally {
    loading.value = false
  }
}
async function loadSelections(id: string, forceFresh = false) {
  try {
    if (forceFresh) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.delivery(id) })
    }
    const result = await queryClient.fetchQuery({
      queryKey: queryKeys.delivery(id),
      queryFn: () => getDelivery(id),
    })
    selections.value = result.selections.map((item) => ({
      id: item.id,
      title: item.title,
      isAvailable: item.isAvailable,
      sourcePosition: item.sourcePosition,
      occurrence: item.occurrence,
      imageUrl: item.photoUrl,
      thumbnailUrl: item.photoThumbnailUrl,
      description: item.description,
      totalMinutes: item.totalMinutes ?? null,
      servings: item.servings ?? null,
      nutriScore: item.nutriScore ?? null,
      carbonScore: item.carbonScore ?? null,
      nutrition: parseSelectionNutrition(item.nutritionJson),
      ingredients: parseIngredients(item.ingredientsJson),
      steps: parseSteps(item.stepsJson),
    }))
  } catch {
    selections.value = []
  }
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
const selectionsById = computed(() => new Map(selections.value.map((s) => [s.id, s])))
const homeRecipesById = computed(() => new Map(homeRecipes.value.map((r) => [r.id, r])))

function selectionFor(meal: SlotMeal | null | undefined) {
  return meal?.selectionId ? selectionsById.value.get(meal.selectionId) : undefined
}
function computeMealMetrics(meal: SlotMeal | null | undefined) {
  if (!meal || meal.category === 'restaurant') return null
  if (meal.category === 'quitoque') {
    const sel = selectionFor(meal)
    return {
      sourceLabel: 'Quitoque',
      description: sel?.description ?? meal.description ?? null,
      totalMinutes: sel?.totalMinutes ?? meal.totalMinutes ?? null,
      caloriesKcal: sel?.nutrition?.caloriesKcal ?? meal.caloriesKcal ?? null,
      nutriScore: sel?.nutriScore ?? meal.nutriScore ?? null,
      carbonScore: sel?.carbonScore ?? meal.carbonScore ?? null,
    }
  }
  const home = meal.recipeId ? homeRecipesById.value.get(meal.recipeId) : undefined
  return {
    sourceLabel: home?.sourceLabel ?? 'Maison',
    description: home?.description ?? meal.description ?? null,
    totalMinutes: home?.totalMinutes ?? meal.totalMinutes ?? null,
    caloriesKcal: home?.caloriesKcal ?? meal.caloriesKcal ?? null,
    nutriScore: home?.nutriScore ?? meal.nutriScore ?? null,
    carbonScore: home?.carbonScore ?? meal.carbonScore ?? null,
  }
}

const mealMetricsById = computed(() => {
  const map = new Map<string, ReturnType<typeof computeMealMetrics>>()
  for (const day of range.value?.days ?? []) {
    for (const meal of [day.lunch.meal, day.dinner.meal]) {
      if (meal && !map.has(meal.id)) {
        map.set(meal.id, computeMealMetrics(meal))
      }
    }
  }
  return map
})

function mealMetrics(meal: SlotMeal | null | undefined) {
  if (!meal) return null
  return mealMetricsById.value.get(meal.id) ?? computeMealMetrics(meal)
}

const activeMealSelection = computed(() =>
  activeMealModal.value ? selectionFor(activeMealModal.value.meal) : undefined,
)
const activeModalMetrics = computed(() =>
  activeMealModal.value ? mealMetrics(activeMealModal.value.meal) : null,
)

function parseSelectionNutrition(raw: string | null | undefined): RecipeNutrition | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as RecipeNutrition
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}
function hasLunchAbove(date: string, period: 'lunch' | 'dinner') {
  return (
    period === 'dinner' &&
    orderedSlots.value.some((item) => item.date === date && item.period === 'lunch')
  )
}
async function loadHomeRecipes() {
  try {
    const result = await queryClient.fetchQuery({
      queryKey: queryKeys.houseRecipesAll,
      queryFn: () =>
        listRecipes({
          source: 'house',
          page: 1,
          pageSize: 100,
          sort: 'title',
        }),
    })
    homeRecipes.value = result.items.map((item) => ({
      id: item.id,
      title: item.title,
      sourceLabel: resolveRecipeSourceLabel(item),
      description: item.description ?? null,
      totalMinutes: item.totalMinutes ?? null,
      caloriesKcal: item.nutrition?.caloriesKcal ?? null,
      nutriScore: recipeMetricValue(item.metrics, 'nutriScore'),
      carbonScore: recipeMetricValue(item.metrics, 'carbonScore'),
    }))
  } catch {
    homeRecipes.value = []
  }
}
watch(error, (message) => {
  if (message) {
    toast.error(message)
    error.value = ''
  }
})
watch(status, (message) => {
  if (message) {
    toast.success(message)
    status.value = ''
  }
})
onMounted(() => {
  void Promise.all([load(), loadHomeRecipes()])
})
watch(
  () => [route.query['date'], route.query['view']],
  () => void load(),
)
function changeView(next: ViewMode) {
  void router.replace({
    query: {
      ...route.query,
      view: next,
      date: selectedDate.value,
      ...(cycleId.value ? { cycle: cycleId.value } : {}),
    },
  })
}
function goDate(date: string, nextView = view.value) {
  void router.replace({
    query: {
      ...route.query,
      date,
      view: nextView,
      ...(nextView === 'week' && cycleId.value ? { cycle: cycleId.value } : { cycle: undefined }),
    },
  })
}
function shift(amount: number) {
  if (view.value === 'week' && currentCycle.value) {
    const index = cycles.value.findIndex((cycle) => cycle.id === currentCycle.value?.id)
    const target = cycles.value[index + amount]
    if (target) {
      cycleId.value = target.id
      goDate(target.deliveryDate, 'week')
      return
    }
    cycleId.value = ''
    goDate(addCivilDays(currentCycle.value.deliveryDate, amount * 7), 'week')
    return
  }
  goDate(
    view.value === 'month'
      ? addCivilMonths(selectedDate.value, amount)
      : addCivilDays(selectedDate.value, amount),
  )
}
function selectCycle(id: string) {
  cycleId.value = id
  const cycle = cycles.value.find((item) => item.id === id)
  if (cycle) goDate(cycle.deliveryDate, 'week')
}
function labelDate(
  date: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  },
) {
  return new Intl.DateTimeFormat('fr-FR', {
    ...options,
    timeZone: 'Europe/Paris',
  }).format(new Date(`${date}T12:00:00`))
}
function slotKey(date: string, period: string) {
  return `${date}:${period}`
}
function cycleIdForDate(date: string): string | null {
  const matched =
    cycles.value
      .toReversed()
      .find((cycle) => cycle.deliveryDate <= date && addCivilDays(cycle.deliveryDate, 7) >= date) ??
    currentCycle.value
  return matched?.id ?? null
}

function canUseQuitoque(date: string, period: 'lunch' | 'dinner') {
  return Boolean(
    currentCycle.value &&
    deliveryCycleSlots(currentCycle.value.deliveryDate).some(
      (slot) => slot.date === date && slot.period === period,
    ),
  )
}
function formFor(date: string, period: 'lunch' | 'dinner') {
  const key = slotKey(date, period)
  return (assignment.value[key] ??= {
    category: 'home',
    recipeId: '',
    selectionId: '',
    restaurantName: '',
    notes: '',
  })
}
async function syncOrders() {
  busy.value = true
  error.value = ''
  status.value = ''
  try {
    const result = await syncDeliveries()
    status.value = `${result.added + result.updated} livraison(s) actualisée(s).${result.invalidDeliveryDates ? ` ${result.invalidDeliveryDates} date(s) non reconnue(s).` : ''}`
    await load(false, true)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Synchronisation impossible.'
  } finally {
    busy.value = false
  }
}
async function syncSelectedRecipes() {
  if (!currentCycle.value) return
  busy.value = true
  error.value = ''
  status.value = ''
  try {
    const result = await syncDeliveryRecipes(currentCycle.value.id)
    status.value = `${result.added} ajoutée(s), ${result.updated} mise(s) à jour, ${result.unavailable} indisponible(s).`
    await loadSelections(currentCycle.value.id, true)
    await load(false, true)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Sélection indisponible.'
  } finally {
    busy.value = false
  }
}
async function distribute(confirmed = false) {
  if (!currentCycle.value) return
  busy.value = true
  error.value = ''
  status.value = ''
  try {
    let result
    try {
      result = await distributeDelivery(currentCycle.value.id, confirmed)
    } catch (cause) {
      if ((cause as Error & { status?: number }).status !== 409) throw cause
      confirmDistribution.value = true
      return
    }
    confirmDistribution.value = false
    status.value = `${result.assigned} repas réparti(s), ${result.leftEmpty} créneau(x) vide(s), ${result.preserved} choix manuel(s) conservé(s), ${result.unassigned} non affecté(s).`
    await load(false, true)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Répartition impossible.'
  } finally {
    busy.value = false
  }
}
async function saveSlot(date: string, period: 'lunch' | 'dinner') {
  const form = formFor(date, period)
  busy.value = true
  error.value = ''
  try {
    if (form.category === 'home')
      await savePlanningSlot({
        date,
        period,
        category: 'home',
        recipeId: form.recipeId,
      })
    else if (form.category === 'quitoque')
      await savePlanningSlot({
        date,
        period,
        category: 'quitoque',
        selectionId: form.selectionId,
      })
    else
      await savePlanningSlot({
        date,
        period,
        category: 'restaurant',
        restaurantName: form.restaurantName,
        notes: form.notes,
      })
    status.value = 'Repas enregistré.'
    await load(false, true)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Enregistrement impossible.'
  } finally {
    busy.value = false
  }
}
async function clearSlot(date: string, period: 'lunch' | 'dinner') {
  try {
    await clearPlanningSlot(date, period)
    if (activeMealModal.value?.date === date && activeMealModal.value?.period === period)
      activeMealModal.value = null
    status.value = 'Créneau libéré.'
    await load(false, true)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Suppression impossible.'
  }
}
function openMealModal(slot: { date: string; period: 'lunch' | 'dinner'; meal: SlotMeal | null }) {
  if (suppressClick.value || !slot.meal) return
  activeMealModal.value = {
    date: slot.date,
    period: slot.period,
    meal: slot.meal,
  }
}
function closeMealModal() {
  activeMealModal.value = null
}
function swapMealsInRange(
  sourceDate: string,
  sourcePeriod: 'lunch' | 'dinner',
  targetDate: string,
  targetPeriod: 'lunch' | 'dinner',
) {
  if (!range.value) return false
  const sourceDay = range.value.days.find((day) => day.date === sourceDate)
  const targetDay = range.value.days.find((day) => day.date === targetDate)
  if (!sourceDay || !targetDay) return false
  const sourceMeal = sourceDay[sourcePeriod].meal
  const targetMeal = targetDay[targetPeriod].meal
  sourceDay[sourcePeriod].meal = targetMeal
  targetDay[targetPeriod].meal = sourceMeal
  return Boolean(targetMeal)
}

async function performSlotMove(
  sourceDate: string,
  sourcePeriod: 'lunch' | 'dinner',
  targetDate: string,
  targetPeriod: 'lunch' | 'dinner',
): Promise<boolean> {
  const wasSwap = swapMealsInRange(sourceDate, sourcePeriod, targetDate, targetPeriod)
  try {
    await movePlanningSlot(sourceDate, sourcePeriod, targetDate, targetPeriod)
    status.value = wasSwap ? 'Repas échangés.' : 'Repas déplacé.'
    await queryClient.invalidateQueries({ queryKey: queryKeys.planningAll })
    await load(true)
  } catch (cause) {
    swapMealsInRange(targetDate, targetPeriod, sourceDate, sourcePeriod)
    error.value = cause instanceof Error ? cause.message : 'Déplacement impossible.'
  }
  return wasSwap
}

const {
  dragSource,
  dragOverKey,
  justDroppedKey,
  justSwappedKey,
  suppressClick,
  floatingCard,
  onMealPointerDown,
} = useSlotDrag({
  onDropSlot: performSlotMove,
})
</script>

<template>
  <section class="planning" aria-label="Planning">
    <div class="planning__bar">
      <div class="planning__bar-left">
        <div class="planning__views" role="group" aria-label="Vue du calendrier">
          <button
            v-for="item in [
              { id: 'week', label: 'Cycle' },
              { id: 'month', label: 'Mois' },
              { id: 'day', label: 'Jour' },
            ] as const"
            :key="item.id"
            :aria-pressed="view === item.id"
            @click="changeView(item.id)"
          >
            {{ item.label }}
          </button>
        </div>
        <div class="planning__navigate">
          <button aria-label="Période précédente" @click="shift(-1)">
            <ChevronLeft :size="18" aria-hidden="true" />
          </button>
          <select
            v-if="view === 'week' && cycles.length"
            class="planning__cycle-select"
            aria-label="Cycle de livraison"
            :value="cycleId"
            @change="selectCycle(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="cycle in cycles" :key="cycle.id" :value="cycle.id">
              Livraison · {{ labelDate(cycle.deliveryDate) }}
            </option>
          </select>
          <strong v-else class="planning__period-label">{{
            view === 'month' ? monthName : labelDate(selectedDate)
          }}</strong>
          <button aria-label="Période suivante" @click="shift(1)">
            <ChevronRight :size="18" aria-hidden="true" />
          </button>
        </div>
        <span v-if="view === 'week' && currentCycle" class="planning__count">14 créneaux</span>
      </div>
      <div class="planning__bar-actions">
        <Button variant="secondary" :loading="busy" @click="syncOrders"
          ><RefreshCw :size="15" aria-hidden="true" /> Livraisons</Button
        >
        <template v-if="view === 'week' && currentCycle">
          <Button variant="secondary" :loading="busy" @click="syncSelectedRecipes"
            >Synchroniser cette sélection</Button
          >
          <Button :disabled="busy || !selections.length" @click="distribute()"
            >Répartir les repas</Button
          >
          <RouterLink
            class="planning__prefs-link"
            :to="{ name: 'settings', query: { tab: 'foyer', section: 'preferences' } }"
          >
            <SlidersHorizontal :size="15" aria-hidden="true" />
            Préférences
          </RouterLink>
        </template>
      </div>
    </div>
    <div v-if="loading" class="planning__empty" role="status">Chargement du calendrier…</div>
    <template v-else-if="view === 'week'">
      <section v-if="!cycles.length" class="planning__empty">
        <h2>Aucune livraison connue</h2>
        <p>
          Synchronisez vos livraisons Quitoque pour créer les cycles à partir de leur date réelle.
        </p>
      </section>
      <template v-else-if="currentCycle">
        <ol class="planning__slots">
          <li
            v-for="slot in orderedSlots"
            :key="slotKey(slot.date, slot.period)"
            :data-slot-key="slotKey(slot.date, slot.period)"
            :class="[
              'planning__slot',
              slot.meal ? `planning__slot--${slot.meal.category}` : 'planning__slot--empty',
              slot.period === 'lunch' &&
              orderedSlots.some((s) => s.date === slot.date && s.period === 'dinner')
                ? 'planning__slot--day-start'
                : '',
              hasLunchAbove(slot.date, slot.period) ? 'planning__slot--day-continue' : '',
              dragOverKey === slotKey(slot.date, slot.period) ? 'is-drop-target' : '',
              dragSource?.date === slot.date && dragSource?.period === slot.period
                ? 'is-dragging'
                : '',
              justDroppedKey === slotKey(slot.date, slot.period) ? 'is-just-dropped' : '',
              justSwappedKey === slotKey(slot.date, slot.period) ? 'is-just-swapped' : '',
            ]"
          >
            <div v-if="!hasLunchAbove(slot.date, slot.period)" class="planning__day-banner">
              <strong>{{
                labelDate(slot.date, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })
              }}</strong>
              <span>{{
                slot.period === 'dinner'
                  ? 'Soir de livraison'
                  : orderedSlots.some((s) => s.date === slot.date && s.period === 'dinner')
                    ? 'Midi & Soir'
                    : 'Fin de cycle'
              }}</span>
            </div>
            <div class="planning__slot-subhead">
              <span class="planning__period-tag" :class="`planning__period-tag--${slot.period}`">{{
                slot.period === 'lunch' ? 'Déjeuner' : 'Dîner'
              }}</span>
              <button
                v-if="slot.meal"
                class="planning__clear"
                :aria-label="`Vider ${slot.period === 'lunch' ? 'le déjeuner' : 'le dîner'} du ${labelDate(slot.date)}`"
                @click.stop="clearSlot(slot.date, slot.period)"
              >
                <X :size="15" aria-hidden="true" />
              </button>
            </div>
            <div
              v-if="slot.meal"
              class="planning__meal-wrap"
              @pointerdown="onMealPointerDown($event, slot)"
            >
              <RecipeCard
                class="planning__recipe-card"
                :title="slot.meal.title"
                :source-label="
                  slot.meal.category === 'restaurant'
                    ? 'Restaurant'
                    : (mealMetrics(slot.meal)?.sourceLabel ?? 'Maison')
                "
                :image-url="slot.meal.thumbnailUrl || slot.meal.imageUrl"
                :description="slot.meal.notes || mealMetrics(slot.meal)?.description || null"
                :total-minutes="mealMetrics(slot.meal)?.totalMinutes ?? null"
                :calories-kcal="mealMetrics(slot.meal)?.caloriesKcal ?? null"
                :nutri-score="mealMetrics(slot.meal)?.nutriScore ?? null"
                :carbon-score="mealMetrics(slot.meal)?.carbonScore ?? null"
                @open="openMealModal(slot)"
              />
            </div>
            <details v-else class="planning__assign">
              <summary>
                <Plus :size="16" aria-hidden="true" />
                Ajouter un repas
              </summary>
              <div class="planning__form">
                <select
                  v-model="formFor(slot.date, slot.period).category"
                  aria-label="Type de repas"
                >
                  <option value="home">Maison</option>
                  <option value="quitoque">Quitoque</option>
                  <option value="restaurant">Restaurant</option></select
                ><select
                  v-if="formFor(slot.date, slot.period).category === 'home'"
                  v-model="formFor(slot.date, slot.period).recipeId"
                  aria-label="Recette maison"
                >
                  <option value="">Choisir une recette</option>
                  <option v-for="recipe in homeRecipes" :key="recipe.id" :value="recipe.id">
                    {{ recipe.title }}
                  </option></select
                ><select
                  v-else-if="formFor(slot.date, slot.period).category === 'quitoque'"
                  v-model="formFor(slot.date, slot.period).selectionId"
                  aria-label="Recette Quitoque"
                >
                  <option value="">Choisir une recette</option>
                  <option v-for="item in availableSelections" :key="item.id" :value="item.id">
                    {{ item.title }}
                  </option>
                </select>
                <div v-else class="planning__restaurant-fields">
                  <input
                    v-model="formFor(slot.date, slot.period).restaurantName"
                    placeholder="Nom du restaurant (facultatif)"
                    aria-label="Nom du restaurant"
                  /><textarea
                    v-model="formFor(slot.date, slot.period).notes"
                    placeholder="Notes (facultatif)"
                    aria-label="Notes du repas"
                  />
                </div>
                <Button
                  variant="secondary"
                  :disabled="
                    busy ||
                    (formFor(slot.date, slot.period).category === 'home' &&
                      !formFor(slot.date, slot.period).recipeId) ||
                    (formFor(slot.date, slot.period).category === 'quitoque' &&
                      !formFor(slot.date, slot.period).selectionId)
                  "
                  @click="saveSlot(slot.date, slot.period)"
                  >Enregistrer</Button
                >
              </div>
            </details>
          </li>
        </ol>
        <p v-if="!selections.length" class="planning__note">
          La sélection de recettes de cette livraison n’a pas encore été synchronisée.
        </p>
      </template>
    </template>
    <section v-else-if="view === 'day'" class="planning__day">
      <h2>{{ labelDate(selectedDate) }}</h2>
      <article
        v-for="period in ['lunch', 'dinner'] as const"
        :key="period"
        class="planning__day-slot"
      >
        <div>
          <h3>{{ period === 'lunch' ? 'Déjeuner' : 'Dîner' }}</h3>
          <p
            v-if="
              selectedDay?.[period].meal?.category === 'home' && selectedDay[period].meal.recipeId
            "
          >
            <RouterLink :to="`/recettes/${selectedDay[period].meal.recipeId}`">{{
              selectedDay[period].meal.title
            }}</RouterLink>
          </p>
          <p v-else>
            {{ selectedDay?.[period].meal?.title ?? 'Aucun repas prévu' }}
          </p>
          <small v-if="selectedDay?.[period].meal">{{
            selectedDay[period].meal.category === 'quitoque'
              ? 'Quitoque'
              : selectedDay[period].meal.category === 'home'
                ? 'Maison'
                : 'Restaurant'
          }}</small>
          <small v-if="selectedDay?.[period].meal?.notes">{{
            selectedDay[period].meal.notes
          }}</small>
          <details
            v-if="selectedDay?.[period].meal?.category === 'quitoque'"
            class="planning__recipe-details"
          >
            <summary>Consulter la recette</summary>
            <p v-if="selectionFor(selectedDay?.[period].meal)?.description">
              {{ selectionFor(selectedDay?.[period].meal)?.description }}
            </p>
            <h4>Ingrédients</h4>
            <ul v-if="selectionFor(selectedDay?.[period].meal)?.ingredients.length">
              <li
                v-for="(ingredient, index) in selectionFor(selectedDay?.[period].meal)?.ingredients"
                :key="`${index}-${ingredient.name}`"
              >
                {{ ingredient.name
                }}<span v-if="ingredient.quantity">
                  · {{ ingredient.quantity }} {{ ingredient.unit }}</span
                ><span v-if="ingredient.notes"> · {{ ingredient.notes }}</span>
              </li>
            </ul>
            <p v-else>Ingrédients non disponibles.</p>
            <h4>Préparation</h4>
            <ol v-if="selectionFor(selectedDay?.[period].meal)?.steps.length">
              <li
                v-for="(step, index) in selectionFor(selectedDay?.[period].meal)?.steps"
                :key="index"
              >
                {{ step }}
              </li>
            </ol>
            <p v-else>Étapes non disponibles.</p>
          </details>
        </div>
        <RouterLink
          v-if="
            selectedDay?.[period].meal?.category === 'home' && selectedDay[period].meal.recipeId
          "
          class="planning__cook-link"
          :to="{ name: 'cooking', query: { recipe: selectedDay[period].meal.recipeId } }"
        >
          <ChefHat :size="14" aria-hidden="true" /> Mode cuisine
        </RouterLink>
        <RouterLink
          v-else-if="
            selectedDay?.[period].meal?.category === 'quitoque' &&
            selectedDay[period].meal.selectionId &&
            cycleIdForDate(selectedDate)
          "
          class="planning__cook-link"
          :to="{
            name: 'cooking',
            query: {
              cycle: cycleIdForDate(selectedDate)!,
              selection: selectedDay[period].meal.selectionId,
            },
          }"
        >
          <ChefHat :size="14" aria-hidden="true" /> Mode cuisine
        </RouterLink>
        <button v-if="selectedDay?.[period].meal" @click="clearSlot(selectedDate, period)">
          Vider</button
        ><button @click="changeView('week')">Ouvrir le cycle de livraison</button>
        <details>
          <summary>
            {{ selectedDay?.[period].meal ? 'Remplacer le repas' : 'Ajouter un repas' }}
          </summary>
          <div class="planning__form">
            <select v-model="formFor(selectedDate, period).category" aria-label="Type de repas">
              <option value="home">Maison</option>
              <option value="quitoque" :disabled="!canUseQuitoque(selectedDate, period)">
                Quitoque
              </option>
              <option value="restaurant">Restaurant</option></select
            ><select
              v-if="formFor(selectedDate, period).category === 'home'"
              v-model="formFor(selectedDate, period).recipeId"
              aria-label="Recette maison"
            >
              <option value="">Choisir une recette</option>
              <option v-for="recipe in homeRecipes" :key="recipe.id" :value="recipe.id">
                {{ recipe.title }}
              </option></select
            ><select
              v-else-if="formFor(selectedDate, period).category === 'quitoque'"
              v-model="formFor(selectedDate, period).selectionId"
              aria-label="Recette Quitoque"
            >
              <option value="">Choisir une recette</option>
              <option
                v-for="item in selections.filter((item) => item.isAvailable)"
                :key="item.id"
                :value="item.id"
              >
                {{ item.title }}
              </option>
            </select>
            <div v-else class="planning__restaurant-fields">
              <input
                v-model="formFor(selectedDate, period).restaurantName"
                placeholder="Nom du restaurant (facultatif)"
                aria-label="Nom du restaurant"
              /><textarea
                v-model="formFor(selectedDate, period).notes"
                placeholder="Notes (facultatif)"
                aria-label="Notes du repas"
              />
            </div>
            <Button
              variant="secondary"
              :disabled="
                busy ||
                (formFor(selectedDate, period).category === 'home' &&
                  !formFor(selectedDate, period).recipeId) ||
                (formFor(selectedDate, period).category === 'quitoque' &&
                  (!formFor(selectedDate, period).selectionId ||
                    !canUseQuitoque(selectedDate, period)))
              "
              @click="saveSlot(selectedDate, period)"
              >Enregistrer</Button
            >
          </div>
        </details>
      </article>
    </section>
    <PlanningMonthGrid
      v-else
      :month-dates="monthDates"
      :selected-date="selectedDate"
      :days-by-date="daysByDate"
      :label-date="labelDate"
      @select-date="(date) => goDate(date, 'day')"
    />
    <Teleport to="body">
      <div
        v-if="floatingCard"
        class="planning-drag-ghost"
        :class="{ 'is-settling': floatingCard.settling }"
        aria-hidden="true"
        :style="{
          width: `${floatingCard.width}px`,
          transformOrigin: `${floatingCard.offsetX}px 18px`,
          transform: `translate3d(${floatingCard.x}px, ${floatingCard.y}px, 0) rotate(${floatingCard.angle.toFixed(2)}deg) scale(${floatingCard.settling ? 1 : 1.04})`,
        }"
      >
        <div class="planning-drag-ghost__pin" />
        <div
          v-if="floatingCard.meal.thumbnailUrl || floatingCard.meal.imageUrl"
          class="planning-drag-ghost__media"
        >
          <img :src="floatingCard.meal.thumbnailUrl || floatingCard.meal.imageUrl || ''" alt="" />
        </div>
        <div class="planning-drag-ghost__body">
          <span
            class="planning-drag-ghost__tag"
            :class="`planning-drag-ghost__tag--${floatingCard.period}`"
            >{{ floatingCard.period === 'lunch' ? 'Déjeuner' : 'Dîner' }}</span
          >
          <strong>{{ floatingCard.meal.title }}</strong>
        </div>
      </div>
    </Teleport>

    <PlanningMealModal
      v-if="activeMealModal"
      :date="activeMealModal.date"
      :period="activeMealModal.period"
      :date-label="labelDate(activeMealModal.date)"
      :cycle-id="cycleIdForDate(activeMealModal.date)"
      :meal="activeMealModal.meal"
      :metrics="activeModalMetrics"
      :selection="activeMealSelection"
      @close="closeMealModal"
      @clear="clearSlot"
    />

    <ModalDialog
      v-if="confirmDistribution"
      v-model:open="confirmDistribution"
      title="Remplacer la répartition automatique ?"
      badge="Confirmation"
      size="md"
    >
      <p>
        Une répartition automatique existe déjà sur ce cycle. Voulez-vous la recalculer tout en
        conservant vos choix manuels ?
      </p>
      <template #footer>
        <Button
          variant="secondary"
          :disabled="busy"
          @click="
            () => {
              confirmDistribution = false
              status = 'Répartition annulée.'
            }
          "
        >
          Annuler
        </Button>
        <Button :loading="busy" @click="distribute(true)">Remplacer la répartition</Button>
      </template>
    </ModalDialog>
  </section>
</template>

<style scoped>
@charset "UTF-8";
.planning {
  color: var(--q-text);
  display: flex;
  flex-direction: column;
  gap: var(--q-space-3);
}

.planning__cook-link {
  display: inline-flex;
  align-items: center;
  gap: var(--q-space-2);
  width: fit-content;
  min-height: var(--q-touch-target);
  padding: 0 var(--q-space-3);
  border-radius: var(--q-radius-control);
  background: var(--q-forest);
  color: var(--q-peach);
  font-family: var(--q-font-display);
  font-size: var(--q-type-label);
  font-weight: 700;
  text-decoration: none;
}

.planning__cook-link:hover {
  background: var(--q-leaf);
}

.planning__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--q-space-3);
  padding: var(--q-space-2) var(--q-space-3);
  background: var(--q-peach);
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-card);
}

.planning__bar-left,
.planning__bar-actions,
.planning__navigate {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--q-space-2);
}

.planning__views {
  display: inline-flex;
  padding: 2px;
  gap: 2px;
  background: var(--q-sage);
  border-radius: var(--q-radius-control);
}

.planning__views button {
  min-height: 36px;
  padding: 0 var(--q-space-3);
  border: 0;
  border-radius: var(--q-radius-control);
  color: var(--q-forest);
  background: transparent;
  font-weight: 600;
  font-size: var(--q-type-label);
  cursor: pointer;
  transition:
    background-color var(--q-duration-fast) var(--q-ease-standard),
    color var(--q-duration-fast) var(--q-ease-standard);
}

.planning__views button:hover:not([aria-pressed='true']) {
  background: var(--q-shoot);
}

.planning__views button[aria-pressed='true'] {
  background: var(--q-forest);
  color: var(--q-peach);
}

.planning__navigate button {
  display: grid;
  place-items: center;
  min-width: 36px;
  min-height: 36px;
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  color: var(--q-forest);
  background: var(--q-sage);
  cursor: pointer;
  transition: background-color var(--q-duration-fast) var(--q-ease-standard);
}

.planning__navigate button:hover {
  background: var(--q-shoot);
}

.planning__cycle-select {
  min-height: 36px;
  padding: 0.35rem 0.65rem;
  font-weight: 600;
  font-size: var(--q-type-label);
}

.planning__period-label {
  padding-inline: var(--q-space-2);
  font-family: var(--q-font-display);
  font-weight: 700;
  text-transform: capitalize;
}

.planning__count {
  padding: 0.25rem 0.55rem;
  border-radius: var(--q-radius-control);
  background: var(--q-shoot);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.planning__bar-actions :deep(button) {
  min-height: 38px;
  padding-block: 0.4rem;
  padding-inline: 0.75rem;
  font-size: var(--q-type-label);
}

.planning__prefs-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 38px;
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: var(--q-type-label);
  font-weight: 700;
  text-decoration: none;
}
.planning__prefs-link:hover {
  background: var(--q-shoot);
}
.planning__prefs-link:focus-visible {
  outline: 3px solid var(--q-focus);
  outline-offset: 2px;
}

.planning__day-slot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--q-space-4);
}

.planning h1 {
  font: 700 var(--q-type-h1)/var(--q-line-heading) var(--q-font-display);
  margin: 0;
}

.planning h2 {
  font: 700 var(--q-type-h3)/var(--q-line-heading) var(--q-font-display);
}

.planning__note {
  color: var(--q-forest);
}

.planning select,
.planning input,
.planning textarea {
  min-height: 40px;
  max-width: 100%;
  padding: 0.45rem 0.65rem;
  background: var(--q-peach);
  color: var(--q-forest);
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  font-size: var(--q-type-label);
}

.planning textarea {
  min-height: 4.5rem;
  resize: vertical;
}

.planning__slots {
  list-style: none;
  padding: var(--q-space-3);
  margin: 0;
  display: grid;
  grid-auto-flow: column;
  grid-template-columns: repeat(8, minmax(14rem, 1fr));
  grid-template-rows: auto auto;
  column-gap: var(--q-space-3);
  row-gap: 0;
  background: var(--q-board-bg);
  border-radius: var(--q-radius-card);
  overflow-x: auto;
  align-items: stretch;
}

.planning__slot:nth-child(1) {
  grid-column: 1;
  grid-row: 2;
}

.planning__slot:nth-child(2) {
  grid-column: 2;
  grid-row: 1;
}

.planning__slot:nth-child(3) {
  grid-column: 2;
  grid-row: 2;
}

.planning__slot:nth-child(4) {
  grid-column: 3;
  grid-row: 1;
}

.planning__slot:nth-child(5) {
  grid-column: 3;
  grid-row: 2;
}

.planning__slot:nth-child(6) {
  grid-column: 4;
  grid-row: 1;
}

.planning__slot:nth-child(7) {
  grid-column: 4;
  grid-row: 2;
}

.planning__slot:nth-child(8) {
  grid-column: 5;
  grid-row: 1;
}

.planning__slot:nth-child(9) {
  grid-column: 5;
  grid-row: 2;
}

.planning__slot:nth-child(10) {
  grid-column: 6;
  grid-row: 1;
}

.planning__slot:nth-child(11) {
  grid-column: 6;
  grid-row: 2;
}

.planning__slot:nth-child(12) {
  grid-column: 7;
  grid-row: 1;
}

.planning__slot:nth-child(13) {
  grid-column: 7;
  grid-row: 2;
}

.planning__slot:nth-child(14) {
  grid-column: 8;
  grid-row: 1;
}

.planning__slot {
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--q-peach);
  border: 2px solid var(--q-forest);
  border-radius: var(--q-radius-card);
  overflow: hidden;
  transition:
    border-color var(--q-duration-fast) var(--q-ease-standard),
    transform var(--q-duration-fast) var(--q-ease-standard);
}

.planning__slot--day-start {
  border-bottom: 0;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.planning__slot--day-continue {
  border-top: 1px dashed var(--q-leaf);
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.planning__slot:hover {
  border-color: var(--q-forest);
}

.planning__day-banner {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0.45rem 0.75rem;
  background: var(--q-forest);
  color: var(--q-peach);
  font-family: var(--q-font-display);
  font-variant-numeric: tabular-nums;
}

.planning__day-banner strong {
  font-size: 0.9375rem;
  font-weight: 750;
  text-transform: capitalize;
  letter-spacing: -0.015em;
}

.planning__day-banner span {
  font-size: var(--q-type-metadata);
  color: var(--q-shoot);
  font-weight: 600;
}

.planning__slot-subhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem 0.3rem;
}

.planning__period-tag {
  display: inline-flex;
  align-items: center;
  padding: 0.18rem 0.5rem;
  border-radius: var(--q-radius-control);
  font-size: var(--q-type-metadata);
  font-weight: 700;
  letter-spacing: 0.01em;
}

.planning__period-tag--lunch {
  background: var(--q-shoot);
  color: var(--q-forest);
}

.planning__period-tag--dinner {
  background: var(--q-coral);
  color: var(--q-forest);
}

.planning__clear {
  display: grid;
  place-items: center;
  min-width: 32px;
  min-height: 32px;
  border: 0;
  border-radius: var(--q-radius-control);
  color: var(--q-forest);
  background: transparent;
  cursor: pointer;
  transition: background-color var(--q-duration-fast) var(--q-ease-standard);
}

.planning__clear:hover {
  background: var(--q-coral);
}

.planning__slot.is-dragging {
  opacity: 0.35;
  transform: scale(0.97);
  border-style: dashed;
}

.planning__slot.is-drop-target {
  background: var(--q-shoot);
  outline: 3px dashed var(--q-forest);
  outline-offset: -3px;
  transform: scale(1.015);
}

.planning__slot.is-just-dropped {
  animation: slot-land 480ms cubic-bezier(0.22, 1, 0.36, 1);
  z-index: 2;
}

.planning__slot.is-just-swapped {
  animation: slot-swap 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes slot-land {
  0% {
    transform: scale(0.92) rotate(-2deg);
    background: var(--q-shoot);
  }
  42% {
    transform: scale(1.035) rotate(1deg);
    background: var(--q-shoot);
  }
  72% {
    transform: scale(0.99) rotate(-0.35deg);
    background: var(--q-peach);
  }
  100% {
    transform: scale(1) rotate(0deg);
    background: var(--q-peach);
  }
}
@keyframes slot-swap {
  0% {
    transform: scale(0.96);
    background: var(--q-shoot);
  }
  55% {
    transform: scale(1.02);
  }
  100% {
    transform: scale(1);
    background: var(--q-peach);
  }
}
.planning__meal-wrap {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  cursor: grab;
  touch-action: none;
}
.planning__meal-wrap:active {
  cursor: grabbing;
}

.planning__recipe-card {
  flex: 1;
  border: 0;
  border-radius: 0;
  border-top: 1px solid var(--q-leaf);
}
.planning__recipe-card:hover {
  transform: none;
}

.planning__metric {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.18rem 0.45rem;
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.planning__category-badge {
  padding: 0.2rem 0.5rem;
  border-radius: var(--q-radius-control);
  font-size: var(--q-type-metadata);
  font-weight: 700;
  color: var(--q-forest);
}

.planning__category-badge--quitoque {
  background: var(--q-sage);
}

.planning__category-badge--home {
  background: var(--q-shoot);
}

.planning__category-badge--restaurant {
  background: var(--q-coral);
}

.planning__origin {
  font-size: var(--q-type-metadata);
  font-weight: 600;
  color: var(--q-leaf);
}

.planning__day a {
  color: var(--q-forest);
  text-decoration-thickness: 2px;
  text-underline-offset: 0.2em;
}

.planning__meal-actions {
  margin-top: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--q-space-1) var(--q-space-3);
  padding: var(--q-space-2) var(--q-space-3);
  border-top: 1px solid var(--q-leaf);
  background: var(--q-sage);
}

.planning__recipe-details,
.planning__move {
  max-width: 100%;
}

.planning__recipe-details[open],
.planning__move[open] {
  flex-basis: 100%;
}

.planning__recipe-details summary,
.planning__move summary {
  list-style: none;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 36px;
  padding: 0 var(--q-space-2);
  border-radius: var(--q-radius-control);
  color: var(--q-forest);
  font-size: var(--q-type-label);
  font-weight: 700;
  cursor: pointer;
  transition: background-color var(--q-duration-fast) var(--q-ease-standard);
}

.planning__recipe-details summary::-webkit-details-marker,
.planning__move summary::-webkit-details-marker,
.planning__assign summary::-webkit-details-marker {
  display: none;
}

.planning__recipe-details summary:hover,
.planning__move summary:hover {
  background: var(--q-shoot);
}

.planning__recipe-drawer {
  margin-top: var(--q-space-2);
  padding: var(--q-space-3);
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
  font-size: var(--q-type-label);
  line-height: 1.45;
}

.planning__recipe-drawer p,
.planning__recipe-drawer ul,
.planning__recipe-drawer ol {
  margin: 0.35rem 0;
}

.planning__recipe-drawer li {
  margin-block: 0.3rem;
  white-space: pre-line;
}

.planning__recipe-drawer h4 {
  margin: 0.65rem 0 0.25rem;
  font-family: var(--q-font-display);
  font-size: var(--q-type-label);
  font-weight: 750;
}

.planning__move-form {
  margin-top: var(--q-space-2);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--q-space-2);
  align-items: end;
}

.planning__move-form :deep(button) {
  grid-column: 1/-1;
}

.planning__move-form label {
  display: grid;
  gap: 0.2rem;
  font-size: var(--q-type-metadata);
  font-weight: 600;
  color: var(--q-forest);
}

.planning__assign {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding: 0.4rem 0.75rem 0.75rem;
}

.planning__assign summary {
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--q-space-2);
  min-height: 4.5rem;
  border: 1px dashed var(--q-leaf);
  background: var(--q-sage);
  border-radius: var(--q-radius-control);
  color: var(--q-forest);
  font-weight: 700;
  font-size: var(--q-type-label);
  cursor: pointer;
  transition: background-color var(--q-duration-fast) var(--q-ease-standard);
}

.planning__assign[open] summary {
  min-height: 36px;
  justify-content: flex-start;
  margin-bottom: var(--q-space-2);
}

.planning__assign summary:hover {
  background: var(--q-shoot);
}

.planning__form {
  display: grid;
  gap: 0.5rem;
}

.planning__restaurant-fields {
  display: grid;
  gap: 0.5rem;
}

.planning__message,
.planning__empty,
.planning__note {
  margin: 0;
  padding: var(--q-space-3) var(--q-space-4);
  background: var(--q-peach);
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-card);
  font-size: var(--q-type-label);
}

.planning__message--error {
  background: var(--q-peach);
  border-color: var(--q-tomato);
  outline: 2px solid var(--q-tomato);
}

.planning__day {
  max-width: 52rem;
}

.planning__day-slot {
  padding: var(--q-space-4);
  margin-block: var(--q-space-3);
  background: var(--q-peach);
  border-radius: var(--q-radius-card);
  flex-wrap: wrap;
}

.planning__day-slot h3 {
  margin: 0;
}

.planning button:focus-visible,
.planning summary:focus-visible,
.planning select:focus-visible,
.planning input:focus-visible,
.planning textarea:focus-visible {
  outline: 3px solid var(--q-forest);
  outline-offset: 2px;
}

@media (max-width: 72rem) {
  .planning__slots {
    grid-auto-flow: row;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: auto;
    row-gap: var(--q-space-3);
  }
  .planning__slot:nth-child(n) {
    grid-column: auto;
    grid-row: auto;
  }
  .planning__slot {
    border-radius: var(--q-radius-card);
    border: 2px solid var(--q-forest);
  }
}
@media (max-width: 48rem) {
  .planning__bar {
    flex-direction: column;
    align-items: stretch;
  }
  .planning__bar-left,
  .planning__bar-actions {
    justify-content: space-between;
  }
  .planning__slots {
    grid-template-columns: 1fr;
  }
}
@media (prefers-reduced-motion: reduce) {
  .planning :is(button, summary, details, li) {
    scroll-behavior: auto;
    transition: none;
    animation: none;
  }
}
</style>

<style>
.planning-drag-ghost {
  position: fixed;
  top: 0;
  left: 0;
  z-index: calc(var(--q-z-toast) + 10);
  pointer-events: none;
  will-change: transform;
  display: flex;
  flex-direction: column;
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  color: var(--q-forest);
  border: 2px solid var(--q-forest);
  overflow: hidden;
  box-shadow: 0 22px 44px -10px color-mix(in srgb, var(--q-forest) 45%, transparent);
}

.planning-drag-ghost.is-settling {
  transition:
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 200ms ease,
    box-shadow 200ms ease;
  opacity: 0;
  box-shadow: 0 4px 12px -4px color-mix(in srgb, var(--q-forest) 20%, transparent);
}

.planning-drag-ghost__pin {
  position: absolute;
  top: 8px;
  left: 50%;
  width: 10px;
  height: 10px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: var(--q-shoot);
  border: 2px solid var(--q-forest);
  z-index: 2;
}

.planning-drag-ghost__media {
  height: 120px;
  background: var(--q-sage);
  overflow: hidden;
}

.planning-drag-ghost__media img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.planning-drag-ghost__body {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.6rem 0.75rem 0.75rem;
}

.planning-drag-ghost__tag {
  width: fit-content;
  padding: 0.16rem 0.48rem;
  border-radius: var(--q-radius-control);
  font-size: var(--q-type-metadata);
  font-weight: 750;
}

.planning-drag-ghost__tag--lunch {
  background: var(--q-shoot);
  color: var(--q-forest);
}

.planning-drag-ghost__tag--dinner {
  background: var(--q-coral);
  color: var(--q-forest);
}

.planning-drag-ghost__body strong {
  font-family: var(--q-font-display);
  font-size: 0.9375rem;
  font-weight: 750;
  line-height: 1.25;
}
</style>
