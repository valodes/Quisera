<script setup lang="ts">
defineOptions({ name: 'FrigoView' })

import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Globe,
  Minus,
  Plus,
  Refrigerator,
  Snowflake,
  Trash2,
  UtensilsCrossed,
} from '@lucide/vue'
import { useQuery } from '@tanstack/vue-query'
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import { useToast } from '@/components/ui/toast'
import {
  addFridgeItem,
  deleteFridgeItem,
  getFridgeRecipeMatches,
  listFridgeItems,
  suggestFridgeIngredients,
  updateFridgeItem,
  type FridgeItem,
} from '@/fridge/api'
import {
  addDaysToCivilDate,
  adjustFridgeQuantity,
  expiryUrgency,
  formatExpiryLabel,
  FRIDGE_ZONES,
  groupFridgeItemsByZone,
  todayCivilDate,
  type FridgeZone,
} from '@/fridge/helpers'
import { queryClient, queryKeys } from '@/lib/query'

const FridgeWebDiscoverModal = defineAsyncComponent(
  () => import('@/components/fridge/FridgeWebDiscoverModal.vue'),
)

const toast = useToast()

const quickInput = ref('')
const selectedZone = ref<FridgeZone>('fridge')
const adding = ref(false)
const suggestions = ref<string[]>([])
const showSuggestions = ref(false)
const webModalOpen = ref(false)
const editingExpiryId = ref<string | null>(null)
let suggestTimer: ReturnType<typeof setTimeout> | null = null

const {
  data: itemsData,
  isPending: loading,
  error: queryError,
} = useQuery({
  queryKey: queryKeys.fridgeItems,
  queryFn: listFridgeItems,
})

const items = computed(() => itemsData.value ?? [])

const { data: matchesData } = useQuery({
  queryKey: computed(() => queryKeys.fridgeMatches(false)),
  queryFn: () => getFridgeRecipeMatches({ includeStaples: false }),
  enabled: computed(() => items.value.length > 0),
})

const readyCount = computed(
  () => (matchesData.value?.matches ?? []).filter((m) => m.bucket === 'ready').length,
)
const totalMatchCount = computed(() => matchesData.value?.matches.length ?? 0)

const today = computed(() => todayCivilDate())

const urgentItems = computed(() =>
  items.value.filter((item) => {
    const urgency = expiryUrgency(item.expiresOn, today.value)
    return urgency === 'expired' || urgency === 'urgent'
  }),
)

const groupedByZone = computed(() => groupFridgeItemsByZone(items.value))

watch(quickInput, (value) => {
  if (suggestTimer) clearTimeout(suggestTimer)
  const trimmed = value.trim()
  // Extract trailing alphabetic phrase when user types "3 tom..."
  const namePart = trimmed.replace(
    /^\d+(?:[.,]\d+)?\s*(?:[a-zA-ZÀ-ÿ]+\s+)?(?:de\s+|du\s+|des\s+|d['’]\s*)?/i,
    '',
  )
  const query = namePart.length >= 2 ? namePart : trimmed
  if (query.length < 2) {
    suggestions.value = []
    return
  }
  suggestTimer = setTimeout(async () => {
    try {
      suggestions.value = await suggestFridgeIngredients(query)
      showSuggestions.value = suggestions.value.length > 0
    } catch {
      suggestions.value = []
    }
  }, 180)
})

function applySuggestion(suggestion: string) {
  const prefixMatch =
    /^(\d+(?:[.,]\d+)?\s*(?:[a-zA-ZÀ-ÿ]+\s+)?(?:de\s+|du\s+|des\s+|d['’]\s*)?)/i.exec(
      quickInput.value.trim(),
    )
  quickInput.value = prefixMatch ? `${prefixMatch[1]}${suggestion.toLowerCase()}` : suggestion
  showSuggestions.value = false
  void submitQuickAdd()
}

async function invalidateFridge() {
  await queryClient.invalidateQueries({ queryKey: queryKeys.fridgeAll })
}

async function submitQuickAdd() {
  const value = quickInput.value.trim()
  if (!value || adding.value) return
  adding.value = true
  showSuggestions.value = false
  try {
    const res = await addFridgeItem({ input: value, zone: selectedZone.value })
    quickInput.value = ''
    suggestions.value = []
    await invalidateFridge()
    if (res.merged) {
      toast.success(
        `« ${res.item.name} » mis à jour (${res.item.quantity ?? ''}${res.item.unit ? ` ${res.item.unit}` : ''}).`,
      )
    }
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : 'Impossible d’ajouter cet ingrédient.')
  } finally {
    adding.value = false
  }
}

async function stepQuantity(item: FridgeItem, delta: 1 | -1) {
  const nextQty = adjustFridgeQuantity(item.quantity, delta, item.unit)
  try {
    if (nextQty === null && delta < 0 && item.quantity !== null) {
      await deleteFridgeItem(item.id)
    } else {
      await updateFridgeItem(item.id, { quantity: nextQty })
    }
    await invalidateFridge()
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : 'Mise à jour impossible.')
  }
}

async function setExpiry(item: FridgeItem, expiresOn: string | null) {
  editingExpiryId.value = null
  try {
    await updateFridgeItem(item.id, { expiresOn })
    await invalidateFridge()
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : 'Date non enregistrée.')
  }
}

async function moveZone(item: FridgeItem, zone: FridgeZone) {
  if (item.zone === zone) return
  try {
    await updateFridgeItem(item.id, { zone })
    await invalidateFridge()
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : 'Déplacement impossible.')
  }
}

async function removeItem(item: FridgeItem) {
  try {
    await deleteFridgeItem(item.id)
    await invalidateFridge()
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : 'Suppression impossible.')
  }
}
</script>

<template>
  <section class="frigo-page">
    <header class="frigo-hero">
      <div class="frigo-hero__text">
        <p class="frigo-hero__eyebrow">Stock du foyer</p>
        <h1>Frigo &amp; placard</h1>
        <p class="frigo-hero__lead">
          Tapez simplement <strong>« 3 tomates »</strong> ou <strong>« 250g de poulet »</strong>
          pour valider en un clic, puis retrouvez instantanément les recettes faisables.
        </p>
      </div>
      <div class="frigo-hero__actions">
        <RouterLink
          v-if="items.length > 0"
          class="frigo-cta-recipes"
          :to="{ path: '/recettes', query: { frigo: '1' } }"
        >
          <span>
            {{
              readyCount > 0
                ? `${readyCount} prête${readyCount > 1 ? 's' : ''} (${totalMatchCount} au total)`
                : totalMatchCount > 0
                  ? `Voir les ${totalMatchCount} recettes possibles`
                  : 'Voir le catalogue avec mon frigo'
            }}
          </span>
          <ArrowRight :size="16" aria-hidden="true" />
        </RouterLink>
        <Button
          v-if="items.length > 0"
          type="button"
          variant="secondary"
          @click="webModalOpen = true"
        >
          <Globe :size="16" aria-hidden="true" />
          Chercher sur le web
        </Button>
      </div>
    </header>

    <form class="frigo-quick-add" @submit.prevent="submitQuickAdd">
      <div class="frigo-quick-add__zones" role="radiogroup" aria-label="Zone de rangement">
        <button
          v-for="zone in FRIDGE_ZONES"
          :key="zone.id"
          type="button"
          class="frigo-zone-pill"
          :class="{ 'is-active': selectedZone === zone.id }"
          :aria-pressed="selectedZone === zone.id"
          @click="selectedZone = zone.id"
        >
          <Refrigerator v-if="zone.id === 'fridge'" :size="15" aria-hidden="true" />
          <UtensilsCrossed v-else-if="zone.id === 'pantry'" :size="15" aria-hidden="true" />
          <Snowflake v-else :size="15" aria-hidden="true" />
          {{ zone.label }}
        </button>
      </div>

      <div class="frigo-quick-add__bar">
        <div class="frigo-quick-add__input-wrap">
          <input
            v-model="quickInput"
            type="text"
            class="frigo-quick-add__input"
            placeholder="Ex. 3 tomates, 250g de poulet, crème fraîche…"
            aria-label="Ajouter un ingrédient au stock"
            autocomplete="off"
            @focus="showSuggestions = suggestions.length > 0"
          />
          <ul v-if="showSuggestions && suggestions.length" class="frigo-suggestions" role="listbox">
            <li v-for="suggestion in suggestions" :key="suggestion">
              <button
                type="button"
                class="frigo-suggestions__btn"
                @mousedown.prevent="applySuggestion(suggestion)"
              >
                <Plus :size="14" aria-hidden="true" />
                {{ suggestion }}
              </button>
            </li>
          </ul>
        </div>
        <Button type="submit" :loading="adding" :disabled="!quickInput.trim()">
          <Plus :size="17" aria-hidden="true" />
          Ajouter
        </Button>
      </div>
    </form>

    <p v-if="queryError" class="frigo-alert" role="alert">
      {{ queryError instanceof Error ? queryError.message : 'Impossible de charger le frigo.' }}
    </p>
    <div v-else-if="loading" class="frigo-state" role="status">Chargement de votre stock…</div>

    <template v-else>
      <section v-if="urgentItems.length" class="frigo-urgent" aria-label="À consommer vite">
        <header class="frigo-urgent__head">
          <AlertTriangle :size="18" aria-hidden="true" />
          <h2>À consommer vite ({{ urgentItems.length }})</h2>
        </header>
        <div class="frigo-urgent__chips">
          <span
            v-for="item in urgentItems"
            :key="`urgent-${item.id}`"
            class="frigo-urgent__chip"
            :class="`is-${expiryUrgency(item.expiresOn, today)}`"
          >
            <strong>{{ item.name }}</strong>
            <span>{{ formatExpiryLabel(item.expiresOn, today) }}</span>
          </span>
        </div>
      </section>

      <div v-if="items.length === 0" class="frigo-empty">
        <Refrigerator :size="36" aria-hidden="true" />
        <h2>Votre frigo est encore vide</h2>
        <p>
          Ajoutez vos premiers ingrédients ci-dessus (ex. <em>« 3 tomates »</em>,
          <em>« 6 œufs »</em>) pour débloquer les idées de recettes adaptées.
        </p>
      </div>

      <div v-else class="frigo-zones-grid">
        <section
          v-for="zone in FRIDGE_ZONES"
          :key="zone.id"
          class="frigo-zone-card"
          :aria-label="zone.label"
        >
          <header class="frigo-zone-card__head">
            <h2>
              <Refrigerator v-if="zone.id === 'fridge'" :size="18" aria-hidden="true" />
              <UtensilsCrossed v-else-if="zone.id === 'pantry'" :size="18" aria-hidden="true" />
              <Snowflake v-else :size="18" aria-hidden="true" />
              {{ zone.label }}
            </h2>
            <span class="frigo-zone-card__count">{{ groupedByZone[zone.id].length }}</span>
          </header>

          <p v-if="groupedByZone[zone.id].length === 0" class="frigo-zone-card__empty">
            Aucun produit dans {{ zone.label.toLowerCase() }}.
          </p>

          <ul v-else class="frigo-list">
            <li v-for="item in groupedByZone[zone.id]" :key="item.id" class="frigo-item">
              <div class="frigo-item__main">
                <div class="frigo-item__title">
                  <strong>{{ item.name }}</strong>
                  <span
                    v-if="item.expiresOn"
                    class="frigo-dlc-badge"
                    :class="`is-${expiryUrgency(item.expiresOn, today)}`"
                  >
                    {{ formatExpiryLabel(item.expiresOn, today) }}
                  </span>
                </div>
                <div class="frigo-item__qty">
                  <button
                    type="button"
                    class="frigo-icon-btn"
                    :aria-label="`Diminuer la quantité de ${item.name}`"
                    @click="stepQuantity(item, -1)"
                  >
                    <Minus :size="13" aria-hidden="true" />
                  </button>
                  <span class="frigo-item__qty-val">
                    {{
                      item.quantity
                        ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`
                        : 'En stock'
                    }}
                  </span>
                  <button
                    type="button"
                    class="frigo-icon-btn"
                    :aria-label="`Augmenter la quantité de ${item.name}`"
                    @click="stepQuantity(item, 1)"
                  >
                    <Plus :size="13" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div class="frigo-item__controls">
                <button
                  type="button"
                  class="frigo-mini-btn"
                  :aria-expanded="editingExpiryId === item.id"
                  @click="editingExpiryId = editingExpiryId === item.id ? null : item.id"
                >
                  <CalendarClock :size="13" aria-hidden="true" />
                  DLC
                </button>
                <select
                  class="frigo-zone-select"
                  :value="item.zone"
                  :aria-label="`Zone de ${item.name}`"
                  @change="moveZone(item, ($event.target as HTMLSelectElement).value as FridgeZone)"
                >
                  <option v-for="z in FRIDGE_ZONES" :key="z.id" :value="z.id">{{ z.label }}</option>
                </select>
                <button
                  type="button"
                  class="frigo-icon-btn frigo-icon-btn--danger"
                  :aria-label="`Retirer ${item.name}`"
                  @click="removeItem(item)"
                >
                  <Trash2 :size="14" aria-hidden="true" />
                </button>
              </div>

              <div v-if="editingExpiryId === item.id" class="frigo-dlc-editor">
                <button
                  type="button"
                  class="frigo-dlc-chip"
                  @click="setExpiry(item, addDaysToCivilDate(today, 3))"
                >
                  +3 j
                </button>
                <button
                  type="button"
                  class="frigo-dlc-chip"
                  @click="setExpiry(item, addDaysToCivilDate(today, 7))"
                >
                  +7 j
                </button>
                <input
                  type="date"
                  class="frigo-dlc-input"
                  :value="item.expiresOn ?? ''"
                  :aria-label="`Date limite de consommation pour ${item.name}`"
                  @change="setExpiry(item, ($event.target as HTMLInputElement).value || null)"
                />
                <button
                  v-if="item.expiresOn"
                  type="button"
                  class="frigo-dlc-chip frigo-dlc-chip--clear"
                  @click="setExpiry(item, null)"
                >
                  Retirer
                </button>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </template>

    <FridgeWebDiscoverModal v-if="webModalOpen" v-model:open="webModalOpen" :items="items" />
  </section>
</template>

<style scoped>
.frigo-page {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-5);
}

.frigo-hero {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--q-space-4);
}

.frigo-hero__eyebrow {
  margin: 0 0 0.25rem;
  color: var(--q-terracotta);
  font-size: var(--q-type-metadata);
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.frigo-hero h1 {
  margin: 0;
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: var(--q-type-h2);
  line-height: 1.08;
}

.frigo-hero__lead {
  margin: 0.4rem 0 0;
  max-width: 40rem;
  color: var(--q-leaf);
  font-size: var(--q-type-body-small);
}

.frigo-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--q-space-2);
}

.frigo-cta-recipes {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: var(--q-touch-target);
  padding: 0 var(--q-space-4);
  border-radius: var(--q-radius-pill);
  background: var(--q-forest);
  color: var(--q-peach);
  font-size: var(--q-type-button);
  font-weight: 700;
  text-decoration: none;
}

.frigo-quick-add {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-3);
  padding: var(--q-space-4);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  border: 1px solid var(--q-leaf);
}

.frigo-quick-add__zones {
  display: flex;
  flex-wrap: wrap;
  gap: var(--q-space-2);
}

.frigo-zone-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.8rem;
  border-radius: var(--q-radius-pill);
  border: 1px solid var(--q-leaf);
  background: var(--q-sage);
  color: var(--q-forest);
  font-size: var(--q-type-body-small);
  font-weight: 700;
  cursor: pointer;
}

.frigo-zone-pill.is-active {
  background: var(--q-forest);
  color: var(--q-peach);
  border-color: var(--q-forest);
}

.frigo-quick-add__bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--q-space-2);
}

.frigo-quick-add__input-wrap {
  position: relative;
  flex: 1;
  min-width: 15rem;
}

.frigo-quick-add__input {
  width: 100%;
  min-height: var(--q-touch-target);
  padding: 0 var(--q-space-3);
  border-radius: var(--q-radius-control);
  border: 1.5px solid var(--q-leaf);
  background: var(--q-sage);
  color: var(--q-forest);
  font-size: var(--q-type-body);
  font-weight: 500;
}

.frigo-quick-add__input::placeholder {
  color: var(--q-leaf);
}

.frigo-suggestions {
  position: absolute;
  top: calc(100% + 0.3rem);
  left: 0;
  right: 0;
  z-index: 20;
  margin: 0;
  padding: 0.3rem;
  list-style: none;
  border-radius: var(--q-radius-control);
  border: 1px solid var(--q-forest);
  background: var(--q-peach);
  box-shadow: 0 10px 24px rgba(23, 61, 44, 0.16);
}

.frigo-suggestions__btn {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  padding: 0.5rem 0.65rem;
  border: 0;
  border-radius: var(--q-radius-control);
  background: transparent;
  color: var(--q-forest);
  font-size: var(--q-type-body-small);
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.frigo-suggestions__btn:hover {
  background: var(--q-shoot);
}

.frigo-urgent {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-2);
  padding: var(--q-space-3) var(--q-space-4);
  border-radius: var(--q-radius-card);
  background: var(--q-shoot);
  border: 1px solid var(--q-terracotta);
}

.frigo-urgent__head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--q-terracotta);
}

.frigo-urgent__head h2 {
  margin: 0;
  font-size: var(--q-type-body);
  font-weight: 800;
}

.frigo-urgent__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--q-space-2);
}

.frigo-urgent__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.65rem;
  border-radius: var(--q-radius-pill);
  background: var(--q-peach);
  border: 1px solid var(--q-terracotta);
  color: var(--q-forest);
  font-size: var(--q-type-body-small);
}

.frigo-urgent__chip.is-expired {
  background: var(--q-tomato);
  color: var(--q-peach);
  border-color: var(--q-tomato);
}

.frigo-zones-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  gap: var(--q-space-4);
}

.frigo-zone-card {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-3);
  padding: var(--q-space-4);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  border: 1px solid var(--q-leaf);
}

.frigo-zone-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--q-space-2);
}

.frigo-zone-card__head h2 {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
  color: var(--q-forest);
  font-size: var(--q-type-h4);
}

.frigo-zone-card__count {
  padding: 0.15rem 0.55rem;
  border-radius: var(--q-radius-pill);
  background: var(--q-sage);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 800;
}

.frigo-zone-card__empty {
  margin: 0;
  color: var(--q-leaf);
  font-size: var(--q-type-body-small);
}

.frigo-list {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.frigo-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: var(--q-space-3);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  border: 1px solid var(--q-leaf);
}

.frigo-item__main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--q-space-2);
}

.frigo-item__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  color: var(--q-forest);
  font-size: var(--q-type-body);
}

.frigo-dlc-badge {
  padding: 0.1rem 0.45rem;
  border-radius: var(--q-radius-pill);
  background: var(--q-peach);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 700;
}

.frigo-dlc-badge.is-urgent {
  background: var(--q-shoot);
  color: var(--q-terracotta);
}

.frigo-dlc-badge.is-expired {
  background: var(--q-tomato);
  color: var(--q-peach);
}

.frigo-item__qty {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.frigo-item__qty-val {
  min-width: 3.2rem;
  text-align: center;
  color: var(--q-forest);
  font-size: var(--q-type-body-small);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.frigo-item__controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.45rem;
}

.frigo-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: var(--q-radius-pill);
  border: 1px solid var(--q-leaf);
  background: var(--q-peach);
  color: var(--q-forest);
  cursor: pointer;
}

.frigo-icon-btn--danger {
  border-color: var(--q-terracotta);
  color: var(--q-terracotta);
}

.frigo-mini-btn,
.frigo-zone-select {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem 0.5rem;
  border-radius: var(--q-radius-pill);
  border: 1px solid var(--q-leaf);
  background: var(--q-peach);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 700;
  cursor: pointer;
}

.frigo-dlc-editor {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  padding-top: 0.35rem;
  border-top: 1px dashed var(--q-leaf);
}

.frigo-dlc-chip {
  padding: 0.2rem 0.55rem;
  border-radius: var(--q-radius-pill);
  border: 1px solid var(--q-forest);
  background: var(--q-shoot);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 700;
  cursor: pointer;
}

.frigo-dlc-chip--clear {
  background: var(--q-peach);
  border-color: var(--q-terracotta);
  color: var(--q-terracotta);
}

.frigo-dlc-input {
  padding: 0.2rem 0.45rem;
  border-radius: var(--q-radius-control);
  border: 1px solid var(--q-leaf);
  background: var(--q-peach);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
}

.frigo-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--q-space-2);
  padding: var(--q-space-7) var(--q-space-4);
  border-radius: var(--q-radius-card);
  border: 1px dashed var(--q-leaf);
  background: var(--q-peach);
  color: var(--q-forest);
  text-align: center;
}

.frigo-empty h2,
.frigo-empty p {
  margin: 0;
}

.frigo-state {
  color: var(--q-leaf);
  font-weight: 600;
}

.frigo-alert {
  padding: var(--q-space-3);
  border-radius: var(--q-radius-control);
  border: 1px solid var(--q-tomato);
  background: var(--q-peach);
  color: var(--q-terracotta);
  font-weight: 600;
}
</style>
