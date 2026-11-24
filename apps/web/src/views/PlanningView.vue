<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  addCivilDays,
  addCivilMonths,
  civilDateSchema,
  deliveryCycleSlots,
  monthGridDates,
  parisCivilDate,
  type PlanningRange,
} from '@quisera/shared'
import { ChevronLeft, ChevronRight, RefreshCw } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import { listRecipes } from '@/recipes/api'
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
  ingredients: Array<{
    name: string
    quantity: string | null
    unit: string | null
    notes: string | null
  }>
  steps: string[]
}
const route = useRoute()
const router = useRouter()
const selectedDate = computed(() =>
  civilDateSchema.safeParse(route.query.date).success
    ? (route.query.date as string)
    : parisCivilDate(new Date()),
)
const view = computed<ViewMode>(() =>
  route.query.view === 'month' || route.query.view === 'day'
    ? route.query.view
    : 'week',
)
const range = ref<PlanningRange | null>(null)
const selections = ref<Selection[]>([])
const homeRecipes = ref<Array<{ id: string; title: string }>>([])
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
const moveTargets = ref<
  Record<string, { date: string; period: 'lunch' | 'dinner' }>
>({})

const cycles = computed(() => range.value?.deliveryCycles ?? [])
const currentCycle = computed(
  () =>
    cycles.value.find((cycle) => cycle.id === cycleId.value) ??
    cycles.value.find(
      (cycle) =>
        cycle.deliveryDate <= selectedDate.value &&
        addCivilDays(cycle.deliveryDate, 7) >= selectedDate.value,
    ) ??
    cycles.value[0],
)
const orderedSlots = computed(() => {
  if (!currentCycle.value) return []
  const result: Array<{
    date: string
    period: 'lunch' | 'dinner'
    meal: PlanningRange['days'][number]['lunch']['meal']
  }> = []
  for (let offset = 0; offset <= 7; offset += 1) {
    const date = addCivilDays(currentCycle.value.deliveryDate, offset)
    const day = range.value?.days.find((item) => item.date === date)
    if (!day) continue
    if (offset !== 0)
      result.push({ date, period: 'lunch', meal: day.lunch.meal })
    if (offset !== 7)
      result.push({ date, period: 'dinner', meal: day.dinner.meal })
  }
  return result
})
const selectedDay = computed(() =>
  range.value?.days.find((day) => day.date === selectedDate.value),
)
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
async function load() {
  loading.value = true
  error.value = ''
  try {
    const bounds = rangeAround(selectedDate.value)
    range.value = await getPlanning(bounds.from, bounds.to)
    const requestedCycle =
      typeof route.query.cycle === 'string'
        ? cycles.value.find((cycle) => cycle.id === route.query.cycle)
        : undefined
    const matchingCycle = cycles.value.find(
      (cycle) =>
        cycle.deliveryDate <= selectedDate.value &&
        addCivilDays(cycle.deliveryDate, 7) >= selectedDate.value,
    )
    const closestCycle = [...cycles.value].sort(
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
    cycleId.value =
      requestedCycle?.id ?? matchingCycle?.id ?? closestCycle?.id ?? ''
    if (
      view.value === 'week' &&
      cycleId.value &&
      route.query.cycle !== cycleId.value
    )
      void router.replace({ query: { ...route.query, cycle: cycleId.value } })
    if (currentCycle.value) await loadSelections(currentCycle.value.id)
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : 'Le planning ne peut pas être chargé.'
  } finally {
    loading.value = false
  }
}
async function loadSelections(id: string) {
  try {
    const result = await getDelivery(id)
    selections.value = result.selections.map((item) => ({
      id: item.id,
      title: item.title,
      isAvailable: item.isAvailable,
      sourcePosition: item.sourcePosition,
      occurrence: item.occurrence,
      imageUrl: item.photoUrl,
      thumbnailUrl: item.photoThumbnailUrl,
      description: item.description,
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
      if (typeof item.name !== 'string') return []
      return [
        {
          name: item.name,
          quantity: typeof item.quantity === 'string' ? item.quantity : null,
          unit: typeof item.unit === 'string' ? item.unit : null,
          notes: typeof item.notes === 'string' ? item.notes : null,
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
function selectionFor(meal: SlotMeal | null | undefined) {
  return meal?.selectionId
    ? selections.value.find((selection) => selection.id === meal.selectionId)
    : undefined
}
async function loadHomeRecipes() {
  try {
    const result = await listRecipes({
      source: 'house',
      page: 1,
      pageSize: 100,
      sort: 'title',
    })
    homeRecipes.value = result.items.map(({ id, title }) => ({ id, title }))
  } catch {
    homeRecipes.value = []
  }
}
onMounted(() => {
  void Promise.all([load(), loadHomeRecipes()])
})
watch(
  () => [route.query.date, route.query.view],
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
      ...(nextView === 'week' && cycleId.value
        ? { cycle: cycleId.value }
        : { cycle: undefined }),
    },
  })
}
function shift(amount: number) {
  if (view.value === 'week' && currentCycle.value) {
    const index = cycles.value.findIndex(
      (cycle) => cycle.id === currentCycle.value?.id,
    )
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
function canUseQuitoque(date: string, period: 'lunch' | 'dinner') {
  return Boolean(
    currentCycle.value &&
    deliveryCycleSlots(currentCycle.value.deliveryDate).some(
      (slot) => slot.date === date && slot.period === period,
    ),
  )
}
function mealsForDate(date: string): SlotMeal[] {
  const day = range.value?.days.find((item) => item.date === date)
  return [day?.lunch.meal, day?.dinner.meal].filter((meal): meal is SlotMeal =>
    Boolean(meal),
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
function moveFor(date: string, period: 'lunch' | 'dinner') {
  const key = slotKey(date, period)
  return (moveTargets.value[key] ??= {
    date,
    period: period === 'lunch' ? 'dinner' : 'lunch',
  })
}
async function syncOrders() {
  busy.value = true
  error.value = ''
  status.value = ''
  try {
    const result = await syncDeliveries()
    status.value = `${result.added + result.updated} livraison(s) actualisée(s).${result.invalidDeliveryDates ? ` ${result.invalidDeliveryDates} date(s) non reconnue(s).` : ''}`
    await load()
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : 'Synchronisation impossible.'
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
    await loadSelections(currentCycle.value.id)
    await load()
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : 'Sélection indisponible.'
  } finally {
    busy.value = false
  }
}
async function distribute() {
  if (!currentCycle.value) return
  busy.value = true
  error.value = ''
  status.value = ''
  try {
    let result
    try {
      result = await distributeDelivery(
        currentCycle.value.id,
        confirmDistribution.value,
      )
    } catch (cause) {
      if ((cause as Error & { status?: number }).status !== 409) throw cause
      if (
        !window.confirm(
          'Une répartition automatique existe déjà. La remplacer en conservant les choix manuels ?',
        )
      ) {
        status.value = 'Répartition annulée.'
        return
      }
      confirmDistribution.value = true
      result = await distributeDelivery(currentCycle.value.id, true)
    }
    confirmDistribution.value = false
    status.value = `${result.assigned} repas réparti(s), ${result.leftEmpty} créneau(x) vide(s), ${result.preserved} choix manuel(s) conservé(s), ${result.unassigned} non affecté(s).`
    await load()
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : 'Répartition impossible.'
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
    await load()
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : 'Enregistrement impossible.'
  } finally {
    busy.value = false
  }
}
async function clearSlot(date: string, period: 'lunch' | 'dinner') {
  try {
    await clearPlanningSlot(date, period)
    status.value = 'Créneau libéré.'
    await load()
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : 'Suppression impossible.'
  }
}
async function moveSlot(date: string, period: 'lunch' | 'dinner') {
  const target = moveFor(date, period)
  try {
    await movePlanningSlot(date, period, target.date, target.period)
    status.value = 'Repas déplacé.'
    await load()
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : 'Déplacement impossible.'
  }
}
</script>

<template>
  <section class="planning" aria-label="Planning">
    <div class="planning__header">
      <div>
        <p>Organisez vos repas autour des livraisons réelles.</p>
      </div>
      <Button variant="secondary" :loading="busy" @click="syncOrders"
        ><RefreshCw :size="17" aria-hidden="true" /> Synchroniser les
        livraisons</Button
      >
    </div>
    <div class="planning__toolbar">
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
          <ChevronLeft :size="19" /></button
        ><strong>{{
          view === 'week' && currentCycle
            ? `Livraison · ${labelDate(currentCycle.deliveryDate)}`
            : view === 'month'
              ? monthName
              : labelDate(selectedDate)
        }}</strong
        ><button aria-label="Période suivante" @click="shift(1)">
          <ChevronRight :size="19" />
        </button>
      </div>
    </div>
    <p
      v-if="error"
      class="planning__message planning__message--error"
      role="alert"
    >
      {{ error }}
    </p>
    <p v-if="status" class="planning__message" role="status">{{ status }}</p>
    <div v-if="loading" class="planning__empty" role="status">
      Chargement du calendrier…
    </div>
    <template v-else-if="view === 'week'">
      <section v-if="!cycles.length" class="planning__empty">
        <h2>Aucune livraison connue</h2>
        <p>
          Synchronisez vos livraisons Quitoque pour créer les cycles à partir de
          leur date réelle.
        </p>
      </section>
      <template v-else-if="currentCycle">
        <section class="planning__cycle-head">
          <label
            >Cycle de livraison
            <select
              :value="cycleId"
              @change="selectCycle(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="cycle in cycles" :key="cycle.id" :value="cycle.id">
                {{ labelDate(cycle.deliveryDate) }}
              </option>
            </select></label
          >
          <p>14 créneaux · du soir de la livraison au déjeuner suivant</p>
          <Button
            variant="secondary"
            :loading="busy"
            @click="syncSelectedRecipes"
            >Synchroniser cette sélection</Button
          ><Button :disabled="busy || !selections.length" @click="distribute"
            >Répartir les repas</Button
          >
        </section>
        <ol class="planning__slots">
          <li
            v-for="slot in orderedSlots"
            :key="slotKey(slot.date, slot.period)"
            class="planning__slot"
          >
            <div class="planning__slot-date">
              <span>{{
                labelDate(slot.date, { weekday: 'short' })
              }}</span><strong>{{
                labelDate(slot.date, { day: 'numeric', month: 'short' })
              }}</strong
              ><small>{{
                slot.period === 'lunch' ? 'Déjeuner' : 'Dîner'
              }}</small>
            </div>
            <div
              v-if="slot.meal"
              class="planning__meal"
              :class="`planning__meal--${slot.meal.category}`"
            >
              <img
                v-if="slot.meal.thumbnailUrl || slot.meal.imageUrl"
                :src="slot.meal.thumbnailUrl || slot.meal.imageUrl || ''"
                :alt="''"
                loading="lazy"
              />
              <div>
                <strong
                  v-if="slot.meal.category === 'home' && slot.meal.recipeId"
                  ><RouterLink :to="`/recettes/${slot.meal.recipeId}`">{{
                    slot.meal.title
                  }}</RouterLink></strong
                >
                <strong v-else>{{ slot.meal.title }}</strong><small
                  >{{
                    slot.meal.category === 'quitoque'
                      ? 'Quitoque'
                      : slot.meal.category === 'home'
                        ? 'Maison'
                        : 'Restaurant'
                  }}
                  ·
                  {{
                    slot.meal.origin === 'automatic' ? 'répartition' : 'choisi'
                  }}</small
                >
                <small v-if="slot.meal.notes">{{ slot.meal.notes }}</small>
                <details
                  v-if="slot.meal.category === 'quitoque'"
                  class="planning__recipe-details"
                >
                  <summary>Consulter la recette</summary>
                  <p v-if="selectionFor(slot.meal)?.description">
                    {{ selectionFor(slot.meal)?.description }}
                  </p>
                  <h4>Ingrédients</h4>
                  <ul v-if="selectionFor(slot.meal)?.ingredients.length">
                    <li
                      v-for="(ingredient, index) in selectionFor(slot.meal)
                        ?.ingredients"
                      :key="`${index}-${ingredient.name}`"
                    >
                      {{ ingredient.name
                      }}<span v-if="ingredient.quantity">
                        · {{ ingredient.quantity }} {{ ingredient.unit }}</span
                      ><span v-if="ingredient.notes">
                        · {{ ingredient.notes }}</span
                      >
                    </li>
                  </ul>
                  <p v-else>Ingrédients non disponibles.</p>
                  <h4>Préparation</h4>
                  <ol v-if="selectionFor(slot.meal)?.steps.length">
                    <li
                      v-for="(step, index) in selectionFor(slot.meal)?.steps"
                      :key="index"
                    >
                      {{ step }}
                    </li>
                  </ol>
                  <p v-else>Étapes non disponibles.</p>
                </details>
              </div>
              <button
                class="planning__clear"
                :aria-label="`Vider ${slot.period === 'lunch' ? 'le déjeuner' : 'le dîner'} du ${labelDate(slot.date)}`"
                @click="clearSlot(slot.date, slot.period)"
              >
                ×
              </button>
              <details class="planning__move">
                <summary>Déplacer</summary>
                <label
                  >Date<input
                    v-model="moveFor(slot.date, slot.period).date"
                    type="date" /></label
                ><label
                  >Moment<select
                    v-model="moveFor(slot.date, slot.period).period"
                  >
                    <option value="lunch">Déjeuner</option>
                    <option value="dinner">Dîner</option>
                  </select></label
                ><Button
                  variant="secondary"
                  @click="moveSlot(slot.date, slot.period)"
                  >Confirmer</Button
                >
              </details>
            </div>
            <details v-else class="planning__assign">
              <summary>Ajouter un repas</summary>
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
                  <option
                    v-for="recipe in homeRecipes"
                    :key="recipe.id"
                    :value="recipe.id"
                  >
                    {{ recipe.title }}
                  </option></select
                ><select
                  v-else-if="
                    formFor(slot.date, slot.period).category === 'quitoque'
                  "
                  v-model="formFor(slot.date, slot.period).selectionId"
                  aria-label="Recette Quitoque"
                >
                  <option value="">Choisir une recette</option>
                  <option
                    v-for="item in selections.filter(
                      (item) => item.isAvailable,
                    )"
                    :key="item.id"
                    :value="item.id"
                  >
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
          La sélection de recettes de cette livraison n’a pas encore été
          synchronisée.
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
              selectedDay?.[period].meal?.category === 'home' &&
              selectedDay[period].meal.recipeId
            "
          >
            <RouterLink
              :to="`/recettes/${selectedDay[period].meal.recipeId}`"
              >{{ selectedDay[period].meal.title }}</RouterLink
            >
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
            <ul
              v-if="
                selectionFor(selectedDay?.[period].meal)?.ingredients.length
              "
            >
              <li
                v-for="(ingredient, index) in selectionFor(
                  selectedDay?.[period].meal,
                )?.ingredients"
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
                v-for="(step, index) in selectionFor(selectedDay?.[period].meal)
                  ?.steps"
                :key="index"
              >
                {{ step }}
              </li>
            </ol>
            <p v-else>Étapes non disponibles.</p>
          </details>
        </div>
        <button
          v-if="selectedDay?.[period].meal"
          @click="clearSlot(selectedDate, period)"
        >
          Vider</button
        ><button @click="changeView('week')">
          Ouvrir le cycle de livraison
        </button>
        <details>
          <summary>
            {{
              selectedDay?.[period].meal
                ? 'Remplacer le repas'
                : 'Ajouter un repas'
            }}
          </summary>
          <div class="planning__form">
            <select
              v-model="formFor(selectedDate, period).category"
              aria-label="Type de repas"
            >
              <option value="home">Maison</option>
              <option
                value="quitoque"
                :disabled="!canUseQuitoque(selectedDate, period)"
              >
                Quitoque
              </option>
              <option value="restaurant">Restaurant</option></select
            ><select
              v-if="formFor(selectedDate, period).category === 'home'"
              v-model="formFor(selectedDate, period).recipeId"
              aria-label="Recette maison"
            >
              <option value="">Choisir une recette</option>
              <option
                v-for="recipe in homeRecipes"
                :key="recipe.id"
                :value="recipe.id"
              >
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
    <section v-else class="planning__month" aria-label="Calendrier mensuel">
      <div class="planning__weekdays">
        <span
          v-for="day in [
            'Lun.',
            'Mar.',
            'Mer.',
            'Jeu.',
            'Ven.',
            'Sam.',
            'Dim.',
          ]"
          :key="day"
          >{{ day }}</span
        >
      </div>
      <div class="planning__month-grid">
        <button
          v-for="date in monthDates"
          :key="date"
          :aria-label="`Voir ${labelDate(date)}`"
          :class="{
            'is-outside': date.slice(0, 7) !== selectedDate.slice(0, 7),
            'is-selected': date === selectedDate,
            'is-delivery': range?.days.find((day) => day.date === date)
              ?.isDeliveryDay,
          }"
          @click="goDate(date, 'day')"
        >
          <strong>{{ Number(date.slice(-2)) }}</strong><span
            v-for="meal in mealsForDate(date)"
            :key="meal.id"
            :class="`planning__month-meal--${meal.category}`"
            >{{
              meal.category === 'quitoque'
                ? 'Quitoque'
                : meal.category === 'home'
                  ? 'Maison'
                  : 'Restaurant'
            }}</span
          ><span
            v-if="range?.days.find((day) => day.date === date)?.isDeliveryDay"
            >Livraison</span
          >
        </button>
      </div>
    </section>
  </section>
</template>

<style scoped>
.planning {
  color: var(--q-text);
}
.planning__header,
.planning__toolbar,
.planning__navigate,
.planning__cycle-head,
.planning__day-slot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--q-space-4);
}
.planning__header {
  margin-bottom: var(--q-space-8);
  align-items: flex-start;
}
.planning h1 {
  font: 700 var(--q-type-h1)/var(--q-line-heading) var(--q-font-display);
  margin: 0;
}
.planning h2 {
  font: 700 var(--q-type-h3)/var(--q-line-heading) var(--q-font-display);
}
.planning__header p,
.planning__cycle-head p,
.planning__note {
  color: var(--q-forest);
}
.planning__toolbar {
  padding: var(--q-space-3) 0;
  border-block: 1px solid var(--q-border);
  margin-bottom: var(--q-space-6);
  flex-wrap: wrap;
}
.planning__views {
  display: flex;
  gap: var(--q-space-1);
}
.planning__views button,
.planning__navigate button,
.planning__clear {
  min-width: var(--q-touch-target);
  min-height: var(--q-touch-target);
  border: 0;
  border-radius: var(--q-radius-control);
  color: var(--q-text);
  background: transparent;
  cursor: pointer;
}
.planning__views button[aria-pressed='true'] {
  background: var(--q-forest);
  color: var(--q-peach);
}
.planning__navigate {
  justify-content: center;
}
.planning__navigate button:hover,
.planning__clear:hover {
  background: var(--q-shoot);
}
.planning__cycle-head {
  justify-content: flex-start;
  flex-wrap: wrap;
  padding: var(--q-space-4);
  background: var(--q-shoot);
  border-radius: var(--q-radius-card);
  margin-bottom: var(--q-space-4);
}
.planning__cycle-head :deep(button:not(.button--primary)) {
  background: var(--q-peach);
}
.planning__cycle-head label {
  display: grid;
  gap: 0.25rem;
  font-weight: 600;
}
.planning select,
.planning input,
.planning textarea {
  min-height: 44px;
  max-width: 100%;
  padding: 0.5rem 0.65rem;
  background: var(--q-peach);
  color: var(--q-forest);
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
}
.planning textarea {
  min-height: 5rem;
  resize: vertical;
}
.planning__slots {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--q-space-3);
}
.planning__slot {
  min-width: 0;
  min-height: 124px;
  padding: var(--q-space-3);
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr);
  gap: var(--q-space-3);
  background: var(--q-peach);
  border-radius: var(--q-radius-card);
}
.planning__slot-date {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  color: var(--q-leaf);
  text-transform: capitalize;
}
.planning__slot-date strong {
  font: 700 1.25rem var(--q-font-display);
  color: var(--q-forest);
}
.planning__slot-date small,
.planning__meal small {
  font-size: var(--q-type-label);
}
.planning__meal {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  min-width: 0;
  flex-wrap: wrap;
}
.planning__move {
  flex-basis: 100%;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}
.planning__move summary {
  cursor: pointer;
  color: var(--q-forest);
  min-height: 44px;
  display: flex;
  align-items: center;
}
.planning__move label {
  display: grid;
  gap: 0.2rem;
  font-size: var(--q-type-label);
}
.planning__meal img {
  width: 80px;
  height: 80px;
  object-fit: contain;
  background: var(--q-sage);
  border-radius: 4px;
}
.planning__meal div {
  display: grid;
  gap: 0.3rem;
  min-width: 0;
}
.planning__meal strong {
  overflow-wrap: anywhere;
}
.planning__meal small {
  color: var(--q-forest);
}
.planning__meal a,
.planning__day a {
  color: var(--q-forest);
  text-decoration-thickness: 2px;
  text-underline-offset: 0.2em;
}
.planning__recipe-details {
  flex-basis: 100%;
}
.planning__recipe-details summary {
  min-height: 44px;
  display: flex;
  align-items: center;
  color: var(--q-forest);
  cursor: pointer;
  font-weight: 700;
}
.planning__recipe-details p,
.planning__recipe-details ul,
.planning__recipe-details ol {
  margin: 0.4rem 0;
}
.planning__recipe-details li {
  margin-block: 0.35rem;
  white-space: pre-line;
}
.planning__recipe-details h4 {
  margin: 0.7rem 0 0.25rem;
}
.planning__meal--quitoque {
  background: var(--q-sage);
}
.planning__meal--home {
  background: var(--q-shoot);
}
.planning__meal--restaurant {
  background: var(--q-coral);
}
.planning__clear {
  margin-left: auto;
  font-size: 1.5rem;
}
.planning__assign {
  align-self: center;
}
.planning__assign summary {
  cursor: pointer;
  color: var(--q-forest);
  min-height: 44px;
  display: flex;
  align-items: center;
  font-weight: 700;
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
  padding: var(--q-space-4);
  background: var(--q-sage);
  border-radius: var(--q-radius-card);
}
.planning__message--error {
  background: var(--q-peach);
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
.planning__month {
  overflow: hidden;
}
.planning__weekdays,
.planning__month-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}
.planning__weekdays span {
  padding: 0.75rem 0.25rem;
  text-align: center;
  color: var(--q-leaf);
  font-weight: 700;
}
.planning__month-grid button {
  min-height: 100px;
  border: 1px solid var(--q-leaf);
  margin: -0.5px;
  padding: 0.5rem;
  text-align: left;
  background: var(--q-sage);
  color: var(--q-forest);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.planning__month-grid button.is-outside {
  background: var(--q-peach);
}
.planning__month-grid button.is-selected {
  outline: 3px solid var(--q-terracotta);
  outline-offset: -3px;
}
.planning__month-grid button.is-delivery strong::after {
  content: ' · Livraison';
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
}
.planning__month-meal--quitoque {
  color: var(--q-forest);
}
.planning__month-meal--home {
  color: var(--q-forest);
}
.planning__month-meal--restaurant {
  color: var(--q-forest);
}
.planning button:focus-visible,
.planning summary:focus-visible,
.planning select:focus-visible,
.planning input:focus-visible {
  outline: 3px solid var(--q-terracotta);
  outline-offset: 2px;
}
@media (max-width: 48rem) {
  .planning__header {
    flex-direction: column;
  }
  .planning__slots {
    grid-template-columns: 1fr;
  }
  .planning__slot {
    grid-template-columns: 75px minmax(0, 1fr);
  }
  .planning__cycle-head {
    align-items: stretch;
    flex-direction: column;
  }
  .planning__navigate {
    order: -1;
    width: 100%;
  }
  .planning__month-grid button {
    min-height: 76px;
    padding: 0.3rem;
    font-size: var(--q-type-metadata);
  }
  .planning__month-grid button.is-delivery strong::after {
    content: '•';
    display: block;
  }
  .planning__weekdays span {
    font-size: 0.75rem;
  }
}
@media (max-width: 22rem) {
  .planning__month-grid button {
    min-height: 55px;
  }
  .planning__month-grid button span {
    display: none;
  }
  .planning__slot {
    grid-template-columns: 1fr;
  }
}
@media (prefers-reduced-motion: reduce) {
  .planning :is(button, summary, details) {
    scroll-behavior: auto;
    transition: none;
    animation: none;
  }
}
</style>
