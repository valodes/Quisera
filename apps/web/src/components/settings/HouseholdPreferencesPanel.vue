<script setup lang="ts">
import {
  Ban,
  CalendarCheck2,
  Check,
  Clock,
  Flame,
  Leaf,
  RotateCcw,
  Sparkles,
  Users,
} from '@lucide/vue'
import {
  defaultHouseholdPlanningPreferences,
  type CalorieBalance,
  type HouseholdPlanningPreferences,
  type MealPeriod,
  type SlotPreferenceKey,
} from '@quisera/shared/dates'
import { useQuery } from '@tanstack/vue-query'
import { SwitchRoot, SwitchThumb } from 'reka-ui'
import { computed, ref, watch } from 'vue'
import { getHouseholdPreferences, updateHouseholdPreferences } from '@/account/api'
import Button from '@/components/ui/Button.vue'
import { useToast } from '@/components/ui/toast'
import { queryClient, queryKeys } from '@/lib/query'

const toast = useToast()

const WEEKDAYS = [
  { id: 1, short: 'Lun', full: 'Lundi' },
  { id: 2, short: 'Mar', full: 'Mardi' },
  { id: 3, short: 'Mer', full: 'Mercredi' },
  { id: 4, short: 'Jeu', full: 'Jeudi' },
  { id: 5, short: 'Ven', full: 'Vendredi' },
  { id: 6, short: 'Sam', full: 'Samedi' },
  { id: 0, short: 'Dim', full: 'Dimanche' },
] as const

const PERIODS: ReadonlyArray<{ id: MealPeriod; label: string }> = [
  { id: 'lunch', label: 'Midi' },
  { id: 'dinner', label: 'Soir' },
]

const CALORIE_BALANCES: ReadonlyArray<{ id: CalorieBalance; label: string; hint: string }> = [
  { id: 'neutral', label: 'Équilibré', hint: 'Aucune préférence entre midi et soir' },
  { id: 'heavier-lunch', label: 'Plus copieux le midi', hint: 'Repas plus léger le soir' },
  { id: 'heavier-dinner', label: 'Plus copieux le soir', hint: 'Repas plus léger le midi' },
]

const saving = ref(false)
const {
  data: loadedPrefs,
  isPending: loading,
  error: prefsQueryError,
} = useQuery({
  queryKey: queryKeys.householdPreferences,
  queryFn: getHouseholdPreferences,
})

watch(
  loadedPrefs,
  (data) => {
    if (!data) return
    prefs.value = {
      ...data,
      requiredSlots: [...data.requiredSlots],
      excludedSlots: [...data.excludedSlots],
      longRecipeDays: [...data.longRecipeDays],
    }
    syncInputsFromPrefs(data)
  },
  { immediate: true },
)

const loadError = computed(() =>
  prefsQueryError.value instanceof Error
    ? prefsQueryError.value.message
    : prefsQueryError.value
      ? 'Impossible de charger les préférences.'
      : '',
)
const saveError = ref('')

const prefs = ref<HouseholdPlanningPreferences>({
  ...defaultHouseholdPlanningPreferences,
  requiredSlots: [...defaultHouseholdPlanningPreferences.requiredSlots],
  excludedSlots: [...defaultHouseholdPlanningPreferences.excludedSlots],
  longRecipeDays: [...defaultHouseholdPlanningPreferences.longRecipeDays],
})

const defaultServingsInput = ref('2')
const freshDaysInput = ref('3')
const weekdayMaxInput = ref('30')
const maxCaloriesInput = ref('')

function syncInputsFromPrefs(value: HouseholdPlanningPreferences) {
  defaultServingsInput.value = String(value.defaultServings ?? 2)
  freshDaysInput.value =
    value.freshProductsMaxDays === null ? '' : String(value.freshProductsMaxDays)
  weekdayMaxInput.value =
    value.weekdayMaxPrepMinutes === null ? '' : String(value.weekdayMaxPrepMinutes)
  maxCaloriesInput.value = value.maxDailyCalories === null ? '' : String(value.maxDailyCalories)
}

function slotKey(weekday: number, period: MealPeriod): SlotPreferenceKey {
  return `${weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6}:${period}`
}

type SlotState = 'normal' | 'required' | 'excluded'

function getSlotState(weekday: number, period: MealPeriod): SlotState {
  const key = slotKey(weekday, period)
  if (prefs.value.requiredSlots.includes(key)) return 'required'
  if (prefs.value.excludedSlots.includes(key)) return 'excluded'
  return 'normal'
}

function cycleSlotState(weekday: number, period: MealPeriod) {
  const key = slotKey(weekday, period)
  const current = getSlotState(weekday, period)
  const required = prefs.value.requiredSlots.filter((item) => item !== key)
  const excluded = prefs.value.excludedSlots.filter((item) => item !== key)

  if (current === 'normal') {
    required.push(key)
  } else if (current === 'required') {
    excluded.push(key)
  }

  prefs.value.requiredSlots = required
  prefs.value.excludedSlots = excluded
}

function applyWeekdayLunchPreset() {
  const preset: SlotPreferenceKey[] = ['1:lunch', '2:lunch', '3:lunch', '4:lunch', '5:lunch']
  prefs.value.requiredSlots = preset
  prefs.value.excludedSlots = prefs.value.excludedSlots.filter((item) => !preset.includes(item))
}

function clearSlots() {
  prefs.value.requiredSlots = []
  prefs.value.excludedSlots = []
}

function toggleLongRecipeDay(weekday: number) {
  if (prefs.value.longRecipeDays.includes(weekday)) {
    prefs.value.longRecipeDays = prefs.value.longRecipeDays.filter((day) => day !== weekday)
  } else {
    prefs.value.longRecipeDays = [...prefs.value.longRecipeDays, weekday]
  }
}

function parseOptionalInt(raw: string, min: number, max: number, label: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const num = Number(trimmed)
  if (!Number.isInteger(num) || num < min || num > max) {
    throw new Error(`${label} doit être un nombre entier entre ${min} et ${max}.`)
  }
  return num
}

async function submit() {
  saveError.value = ''
  let defaultServings: number
  let freshProductsMaxDays: number | null
  let weekdayMaxPrepMinutes: number | null
  let maxDailyCalories: number | null
  try {
    const parsedServings = parseOptionalInt(
      defaultServingsInput.value,
      1,
      24,
      'Le nombre de portions par défaut',
    )
    if (parsedServings === null) {
      throw new Error('Le nombre de portions par défaut doit être compris entre 1 et 24.')
    }
    defaultServings = parsedServings
    freshProductsMaxDays = parseOptionalInt(
      freshDaysInput.value,
      1,
      7,
      'Le délai pour les produits frais',
    )
    weekdayMaxPrepMinutes = parseOptionalInt(
      weekdayMaxInput.value,
      5,
      180,
      'Le temps max en semaine',
    )
    maxDailyCalories = parseOptionalInt(
      maxCaloriesInput.value,
      600,
      5000,
      'Le plafond calorique journalier',
    )
  } catch (cause) {
    saveError.value = cause instanceof Error ? cause.message : 'Valeurs invalides.'
    return
  }

  saving.value = true
  try {
    const saved = await updateHouseholdPreferences({
      ...prefs.value,
      defaultServings,
      freshProductsMaxDays,
      weekdayMaxPrepMinutes,
      maxDailyCalories,
    })
    queryClient.setQueryData(queryKeys.householdPreferences, saved)
    prefs.value = saved
    syncInputsFromPrefs(saved)
    toast.success('Préférences de répartition enregistrées.')
  } catch (cause) {
    saveError.value =
      cause instanceof Error ? cause.message : 'Impossible d’enregistrer les préférences.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="prefs">
    <div v-if="loading" class="prefs__status" role="status">
      Chargement des préférences de répartition…
    </div>
    <p v-else-if="loadError" class="prefs__alert" role="alert">Erreur : {{ loadError }}</p>

    <form v-else class="prefs__form" @submit.prevent="submit">
      <section class="prefs-card">
        <div class="prefs-card__head">
          <div>
            <h3>
              <Users :size="18" aria-hidden="true" />
              Portions par défaut du foyer
            </h3>
            <p>
              Les recettes importées et affichées s’ajustent automatiquement à ce nombre de
              personnes, indépendamment du nombre de comptes du foyer.
            </p>
          </div>
          <label class="prefs-inline-field" for="pref-default-servings">
            <span>Personnes</span>
            <input
              id="pref-default-servings"
              v-model="defaultServingsInput"
              type="number"
              min="1"
              max="24"
              inputmode="numeric"
            />
          </label>
        </div>
      </section>

      <section class="prefs-card">
        <div class="prefs-card__head">
          <div>
            <h3>
              <CalendarCheck2 :size="18" aria-hidden="true" />
              Créneaux obligatoires et exclus
            </h3>
            <p>
              Cliquez sur un créneau pour alterner entre <strong>Libre</strong>,
              <strong>Obligatoire</strong> et <strong>Exclu</strong>. La répartition automatique
              remplit les créneaux obligatoires en priorité.
            </p>
          </div>
          <div class="prefs-card__presets">
            <button type="button" class="prefs-chip-btn" @click="applyWeekdayLunchPreset">
              Midis ouvrés obligatoires
            </button>
            <button type="button" class="prefs-chip-btn" @click="clearSlots">
              <RotateCcw :size="14" aria-hidden="true" />
              Tout réinitialiser
            </button>
          </div>
        </div>

        <div class="slot-matrix" role="group" aria-label="Préférences par jour et créneau">
          <div class="slot-matrix__corner" aria-hidden="true" />
          <div v-for="day in WEEKDAYS" :key="day.id" class="slot-matrix__day">
            <span class="slot-matrix__day-short">{{ day.short }}</span>
          </div>

          <template v-for="period in PERIODS" :key="period.id">
            <div class="slot-matrix__period">{{ period.label }}</div>
            <button
              v-for="day in WEEKDAYS"
              :key="`${day.id}-${period.id}`"
              type="button"
              class="slot-cell"
              :class="`slot-cell--${getSlotState(day.id, period.id)}`"
              :aria-label="`${day.full} ${period.label} : ${
                getSlotState(day.id, period.id) === 'required'
                  ? 'Obligatoire'
                  : getSlotState(day.id, period.id) === 'excluded'
                    ? 'Exclu'
                    : 'Libre'
              }`"
              @click="cycleSlotState(day.id, period.id)"
            >
              <Check
                v-if="getSlotState(day.id, period.id) === 'required'"
                :size="15"
                aria-hidden="true"
              />
              <Ban
                v-else-if="getSlotState(day.id, period.id) === 'excluded'"
                :size="15"
                aria-hidden="true"
              />
              <span>
                {{
                  getSlotState(day.id, period.id) === 'required'
                    ? 'Oblig.'
                    : getSlotState(day.id, period.id) === 'excluded'
                      ? 'Exclu'
                      : 'Libre'
                }}
              </span>
            </button>
          </template>
        </div>
      </section>

      <div class="prefs__grid">
        <section class="prefs-card">
          <h3>
            <Leaf :size="18" aria-hidden="true" />
            Fraîcheur & temps de cuisine
          </h3>

          <label class="prefs-field">
            <span>Délai max pour les produits frais (jours après livraison)</span>
            <input
              v-model="freshDaysInput"
              type="number"
              min="1"
              max="7"
              inputmode="numeric"
              placeholder="ex. 3 (vide = sans limite)"
            />
            <small>
              Poisson, viande fraîche et herbes sont placés dans les X premiers jours du cycle.
            </small>
          </label>

          <label class="prefs-field">
            <span>
              <Clock :size="14" aria-hidden="true" />
              Temps de préparation max en semaine (minutes)
            </span>
            <input
              v-model="weekdayMaxInput"
              type="number"
              min="5"
              max="180"
              inputmode="numeric"
              placeholder="ex. 30 (vide = sans limite)"
            />
          </label>

          <div class="prefs-field">
            <span>Jours autorisés pour les recettes longues</span>
            <div class="day-pills" role="group" aria-label="Jours pour les recettes longues">
              <button
                v-for="day in WEEKDAYS"
                :key="day.id"
                type="button"
                class="day-pill"
                :class="{ 'is-active': prefs.longRecipeDays.includes(day.id) }"
                :aria-pressed="prefs.longRecipeDays.includes(day.id)"
                @click="toggleLongRecipeDay(day.id)"
              >
                {{ day.short }}
              </button>
            </div>
          </div>
        </section>

        <section class="prefs-card">
          <h3>
            <Flame :size="18" aria-hidden="true" />
            Calories & équilibre
          </h3>

          <label class="prefs-field">
            <span>Plafond calorique journalier (kcal/jour, facultatif)</span>
            <input
              v-model="maxCaloriesInput"
              type="number"
              min="600"
              max="5000"
              step="50"
              inputmode="numeric"
              placeholder="ex. 1600 (vide = sans limite)"
            />
            <small>Appliqué sur la somme midi + soir lorsque les calories sont connues.</small>
          </label>

          <fieldset class="prefs-fieldset">
            <legend>Répartition midi / soir</legend>
            <div class="balance-options">
              <button
                v-for="option in CALORIE_BALANCES"
                :key="option.id"
                type="button"
                class="balance-option"
                :class="{ 'is-active': prefs.calorieBalance === option.id }"
                :aria-pressed="prefs.calorieBalance === option.id"
                @click="prefs.calorieBalance = option.id"
              >
                <strong>{{ option.label }}</strong>
                <span>{{ option.hint }}</span>
              </button>
            </div>
          </fieldset>
        </section>
      </div>

      <section class="prefs-card">
        <h3>
          <Sparkles :size="18" aria-hidden="true" />
          Variété & respect des placements manuels
        </h3>

        <div class="prefs-toggles">
          <div class="prefs-switch-row">
            <label for="pref-protein">Éviter la même protéine sur deux repas consécutifs</label>
            <SwitchRoot
              id="pref-protein"
              v-model="prefs.avoidConsecutiveSameProtein"
              class="q-switch"
            >
              <SwitchThumb class="q-switch__thumb" />
            </SwitchRoot>
          </div>

          <div class="prefs-switch-row">
            <label for="pref-starch">Éviter le même féculent sur deux repas consécutifs</label>
            <SwitchRoot
              id="pref-starch"
              v-model="prefs.avoidConsecutiveSameStarch"
              class="q-switch"
            >
              <SwitchThumb class="q-switch__thumb" />
            </SwitchRoot>
          </div>

          <div class="prefs-switch-row">
            <label for="pref-manual">
              Toujours préserver les repas placés manuellement lors de la répartition
            </label>
            <SwitchRoot id="pref-manual" v-model="prefs.preserveManualMeals" class="q-switch">
              <SwitchThumb class="q-switch__thumb" />
            </SwitchRoot>
          </div>
        </div>
      </section>

      <p v-if="saveError" class="prefs__alert" role="alert">Erreur : {{ saveError }}</p>

      <div class="prefs__actions">
        <Button type="submit" :loading="saving">
          {{ saving ? 'Enregistrement…' : 'Enregistrer les préférences' }}
        </Button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.prefs {
  display: grid;
  gap: var(--q-space-4);
}
.prefs__status {
  padding: var(--q-space-6);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  font-weight: 600;
}
.prefs__alert {
  margin: 0;
  padding: var(--q-space-3) var(--q-space-4);
  border: 2px solid var(--q-tomato);
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
  color: var(--q-forest);
  font-weight: 700;
}
.prefs__form {
  display: grid;
  gap: var(--q-space-4);
}
.prefs__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--q-space-4);
}
@media (max-width: 56rem) {
  .prefs__grid {
    grid-template-columns: 1fr;
  }
}
.prefs__actions {
  display: flex;
  justify-content: flex-end;
}

.prefs-card {
  display: grid;
  align-content: start;
  gap: var(--q-space-4);
  padding: var(--q-space-6);
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  color: var(--q-forest);
}
.prefs-card h3 {
  display: inline-flex;
  align-items: center;
  gap: var(--q-space-2);
  margin: 0;
  font-family: var(--q-font-display);
  font-size: var(--q-type-h4);
  font-weight: 800;
}
.prefs-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--q-space-3);
}
.prefs-card__head p {
  margin: var(--q-space-2) 0 0;
  max-width: 65ch;
  font-size: var(--q-type-body-small);
  line-height: var(--q-line-body);
}
.prefs-card__presets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--q-space-2);
}

.prefs-chip-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: var(--q-touch-target);
  padding: 0 var(--q-space-3);
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  color: var(--q-forest);
  font-size: var(--q-type-body-small);
  font-weight: 700;
  cursor: pointer;
}
.prefs-chip-btn:hover {
  background: var(--q-shoot);
}
.prefs-chip-btn:focus-visible {
  outline: 3px solid var(--q-focus);
  outline-offset: 2px;
}

.slot-matrix {
  display: grid;
  grid-template-columns: 3.75rem repeat(7, minmax(0, 1fr));
  gap: var(--q-space-2);
  overflow-x: auto;
  padding-bottom: var(--q-space-1);
}
.slot-matrix__day {
  text-align: center;
  font-family: var(--q-font-display);
  font-size: var(--q-type-label);
  font-weight: 800;
  color: var(--q-forest);
}
.slot-matrix__period {
  display: flex;
  align-items: center;
  font-size: var(--q-type-label);
  font-weight: 700;
  color: var(--q-leaf);
}

.slot-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  min-height: var(--q-touch-target);
  min-width: 4.5rem;
  padding: var(--q-space-2);
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  font-size: var(--q-type-metadata);
  font-weight: 700;
  cursor: pointer;
  transition: background-color var(--q-duration-fast) var(--q-ease-standard);
}
.slot-cell:focus-visible {
  outline: 3px solid var(--q-focus);
  outline-offset: 2px;
}
.slot-cell--normal {
  background: var(--q-peach);
  color: var(--q-forest);
}
.slot-cell--normal:hover {
  background: var(--q-sage);
}
.slot-cell--required {
  background: var(--q-shoot);
  border-color: var(--q-forest);
  color: var(--q-forest);
}
.slot-cell--excluded {
  background: var(--q-sage);
  border-style: dashed;
  color: var(--q-forest);
}

.prefs-field {
  display: grid;
  gap: var(--q-space-2);
}
.prefs-field span {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: var(--q-type-label);
  font-weight: 700;
  color: var(--q-forest);
}
.prefs-field input {
  width: 100%;
  min-height: var(--q-touch-target);
  padding: var(--q-space-2) var(--q-space-3);
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  color: var(--q-forest);
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
}
.prefs-field input:focus-visible {
  outline: 3px solid var(--q-focus);
  outline-offset: 2px;
}
.prefs-field small {
  color: var(--q-leaf);
  font-size: var(--q-type-body-small);
  line-height: var(--q-line-compact);
}

.day-pills {
  display: flex;
  flex-wrap: wrap;
  gap: var(--q-space-2);
}

.day-pill {
  min-width: var(--q-touch-target);
  min-height: var(--q-touch-target);
  padding: 0 var(--q-space-3);
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: var(--q-type-label);
  font-weight: 700;
  cursor: pointer;
}
.day-pill.is-active {
  background: var(--q-forest);
  border-color: var(--q-forest);
  color: var(--q-peach);
}
.day-pill:focus-visible {
  outline: 3px solid var(--q-focus);
  outline-offset: 2px;
}

.prefs-fieldset {
  display: grid;
  gap: var(--q-space-2);
  margin: 0;
  padding: 0;
  border: 0;
}
.prefs-fieldset legend {
  margin-bottom: var(--q-space-2);
  font-size: var(--q-type-label);
  font-weight: 700;
  color: var(--q-forest);
}

.balance-options {
  display: grid;
  gap: var(--q-space-2);
}

.balance-option {
  display: grid;
  gap: 0.15rem;
  text-align: left;
  min-height: var(--q-touch-target);
  padding: var(--q-space-3);
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  color: var(--q-forest);
  cursor: pointer;
}
.balance-option strong {
  font-family: var(--q-font-display);
  font-size: var(--q-type-label);
  font-weight: 800;
}
.balance-option span {
  font-size: var(--q-type-metadata);
  color: var(--q-leaf);
}
.balance-option.is-active {
  background: var(--q-shoot);
  border-color: var(--q-forest);
}
.balance-option.is-active span {
  color: var(--q-forest);
}
.balance-option:focus-visible {
  outline: 3px solid var(--q-focus);
  outline-offset: 2px;
}

.prefs-toggles {
  display: grid;
  gap: var(--q-space-2);
}

.prefs-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--q-space-4);
  min-height: var(--q-touch-target);
  padding: var(--q-space-2) var(--q-space-3);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  font-size: var(--q-type-body-small);
  font-weight: 600;
}
.prefs-switch-row label {
  cursor: pointer;
}

.q-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: none;
  width: 48px;
  height: 28px;
  padding: 3px;
  border: 2px solid var(--q-forest);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  transition: background-color var(--q-duration-fast) var(--q-ease-standard);
}
.q-switch[data-state='checked'] {
  background: var(--q-forest);
}
.q-switch__thumb {
  display: block;
  width: 18px;
  height: 18px;
  border-radius: var(--q-radius-control);
  background: var(--q-forest);
  transition: transform var(--q-duration-fast) var(--q-ease-standard);
}
[data-state='checked'] > .q-switch__thumb {
  transform: translateX(20px);
  background: var(--q-shoot);
}
</style>
