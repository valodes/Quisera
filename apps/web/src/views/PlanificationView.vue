<script setup lang="ts">
defineOptions({ name: 'PlanificationView' })

import {
  computed,
  defineAsyncComponent,
  onMounted,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue'
import {
  ArrowRight,
  CalendarClock,
  ChefHat,
  ClipboardCheck,
  Minus,
  Plus,
  RefreshCw,
  Search,
  ShoppingBasket,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UtensilsCrossed,
  X,
} from '@lucide/vue'
import { ProgressIndicator, ProgressRoot } from 'reka-ui'
import RecipeCard from '@/components/recipes/RecipeCard.vue'
import Button from '@/components/ui/Button.vue'
import { useToast } from '@/components/ui/toast'
import { queryClient, queryKeys } from '@/lib/query'

const PlanificationProductModal = defineAsyncComponent(
  () => import('@/components/planification/PlanificationProductModal.vue'),
)
const PlanificationRecapTab = defineAsyncComponent(
  () => import('@/components/planification/PlanificationRecapTab.vue'),
)
import {
  addBoxItem,
  getWeekCatalog,
  listUpcomingWeeks,
  removeBoxItem,
  updateBoxItemQuantity,
  type BoxCartItem,
  type CatalogProduct,
  type DynamicFilterGroup,
  type PlanificationSection,
  type UpcomingBoxWeek,
} from '@/planification/api'

type PlanificationTab = PlanificationSection | 'recap'

const toast = useToast()

const catalogSections = [
  { id: 'recipes', label: 'Recettes' },
  { id: 'ready-meals', label: 'Plats cuisinés' },
  { id: 'market', label: 'Marché' },
] as const

const timelineSteps = [
  { id: 'recipes', step: 1, label: 'Recettes', icon: UtensilsCrossed },
  { id: 'ready-meals', step: 2, label: 'Plats cuisinés', icon: ChefHat },
  { id: 'market', step: 3, label: 'Marché', icon: ShoppingBasket },
  { id: 'recap', step: 4, label: 'Récapitulatif', icon: ClipboardCheck },
] as const

const weeks = shallowRef<UpcomingBoxWeek[]>([])
const selectedOrderId = ref('')
const activeSection = ref<PlanificationTab>('recipes')

const weeksLoading = ref(true)
const catalogLoading = ref(false)
const mutatingKey = ref<string | null>(null)
const cartPulse = ref<'catch' | 'remove' | null>(null)
const cartRef = useTemplateRef<HTMLElement>('cartRef')

const catalogItems = shallowRef<CatalogProduct[]>([])
const filterGroups = shallowRef<DynamicFilterGroup[]>([])
const seasonalCategories = shallowRef<string[]>([])

const searchQuery = ref('')
const selectedFilters = ref<Record<string, string[]>>({})
const selectedCategory = ref<string | null>(null)
const filtersOpen = ref(false)
const activeProductModal = shallowRef<CatalogProduct | null>(null)

const totalBoxItemsCount = computed(() =>
  (currentWeek.value?.items ?? []).reduce((sum, item) => sum + item.quantity, 0),
)

const activeFilterCount = computed(() =>
  Object.values(selectedFilters.value).reduce((sum, list) => sum + list.length, 0),
)

const activeFilterChips = computed(() => {
  const chips: Array<{ groupCode: string; value: string; label: string }> = []
  for (const group of filterGroups.value) {
    const selected = selectedFilters.value[group.code] ?? []
    for (const val of selected) {
      const opt = group.options.find((o) => o.value === val)
      chips.push({
        groupCode: group.code,
        value: val,
        label: opt?.label ?? val,
      })
    }
  }
  return chips
})

function openProductModal(product: CatalogProduct) {
  activeProductModal.value = product
}

function closeProductModal() {
  activeProductModal.value = null
}

const currentWeek = computed(
  () =>
    weeks.value.find((week) => week.orderId === selectedOrderId.value) ?? weeks.value[0] ?? null,
)

const isLocked = computed(() => {
  if (!currentWeek.value?.lockDate) return false
  return Date.parse(currentWeek.value.lockDate) <= Date.now()
})

const lockCountdown = computed(() => {
  const lock = currentWeek.value?.lockDate
  if (!lock) return null
  const diffMs = Date.parse(lock) - Date.now()
  if (Number.isNaN(diffMs)) return null
  if (diffMs <= 0) return 'Box verrouillée'
  const totalHours = Math.floor(diffMs / (1000 * 60 * 60))
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  if (days > 0) return `Il reste ${days} j ${hours} h`
  const mins = Math.max(1, Math.floor((diffMs / (1000 * 60)) % 60))
  return hours > 0 ? `Il reste ${hours} h ${mins} min` : `Il reste ${mins} min`
})

const cartItemByProductId = computed(() => {
  const map = new Map<string, BoxCartItem>()
  for (const item of currentWeek.value?.items ?? []) {
    map.set(item.productId, item)
  }
  return map
})

const groupedCartItems = computed(() => {
  const items = currentWeek.value?.items ?? []
  return {
    recipes: items.filter((item) => item.section === 'recipes'),
    'ready-meals': items.filter((item) => item.section === 'ready-meals'),
    market: items.filter((item) => item.section === 'market'),
  }
})

function sectionCount(section: PlanificationSection) {
  return groupedCartItems.value[section].reduce((sum, item) => sum + item.quantity, 0)
}

const recipeProgressPercent = computed(() => {
  const target = currentWeek.value?.recipeTargetCount
  if (!target || target <= 0) return 0
  return Math.min(100, Math.round((sectionCount('recipes') / target) * 100))
})

const hasActiveFilters = computed(
  () =>
    Boolean(searchQuery.value.trim()) ||
    Boolean(selectedCategory.value) ||
    Object.values(selectedFilters.value).some((list) => list.length > 0),
)

const filteredProducts = computed(() => {
  const query = searchQuery.value
    .trim()
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

  return catalogItems.value.filter((item) => {
    if (query) {
      const haystack =
        `${item.title} ${item.description ?? ''} ${item.highlights.join(' ')} ${item.categories.join(' ')} ${item.tags.join(' ')}`
          .toLocaleLowerCase('fr')
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
      if (!haystack.includes(query)) return false
    }

    if (
      selectedCategory.value &&
      !item.categories.includes(selectedCategory.value) &&
      !item.highlights.includes(selectedCategory.value)
    ) {
      return false
    }

    for (const [groupCode, values] of Object.entries(selectedFilters.value)) {
      if (!values.length) continue
      const itemValues = item.filterValues[groupCode] ?? []
      const matchesGroup = values.some((val) => itemValues.includes(val.toLowerCase()))
      if (!matchesGroup) return false
    }

    return true
  })
})

function formatShortDate(civilDate: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Paris',
  }).format(new Date(`${civilDate}T12:00:00`))
}

function formatDeliveryDate(civilDate: string | null) {
  if (!civilDate) return 'Date à confirmer'
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Paris',
  }).format(new Date(`${civilDate}T12:00:00`))
}

function formatLockDate(iso: string | null) {
  if (!iso) return 'Date limite non communiquée'
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  }).format(new Date(iso))
}

function formatCents(cents: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

function toggleFilter(groupCode: string, value: string) {
  const current = selectedFilters.value[groupCode] ?? []
  const exists = current.includes(value)
  selectedFilters.value = {
    ...selectedFilters.value,
    [groupCode]: exists ? current.filter((v) => v !== value) : [...current, value],
  }
}

function isFilterActive(groupCode: string, value: string) {
  return (selectedFilters.value[groupCode] ?? []).includes(value)
}

function resetFilters() {
  searchQuery.value = ''
  selectedCategory.value = null
  selectedFilters.value = {}
}

function replaceWeekInList(updated: UpcomingBoxWeek) {
  const next = weeks.value.map((week) => (week.orderId === updated.orderId ? updated : week))
  weeks.value = next
  queryClient.setQueryData(queryKeys.upcomingBoxes, next)
}

async function loadWeeks() {
  weeksLoading.value = true
  try {
    const data = await queryClient.fetchQuery({
      queryKey: queryKeys.upcomingBoxes,
      queryFn: listUpcomingWeeks,
    })
    weeks.value = data
    if (!selectedOrderId.value || !data.some((w) => w.orderId === selectedOrderId.value)) {
      selectedOrderId.value = data.find((w) => w.isNextOrder)?.orderId ?? data[0]?.orderId ?? ''
    }
  } catch (cause) {
    toast.error(
      cause instanceof Error
        ? cause.message
        : 'Impossible de charger les prochaines semaines Quitoque.',
    )
  } finally {
    weeksLoading.value = false
  }
}

async function loadCatalog() {
  const week = currentWeek.value
  if (!week || activeSection.value === 'recap') return
  const section = activeSection.value
  catalogLoading.value = true
  try {
    const res = await queryClient.fetchQuery({
      queryKey: queryKeys.weekCatalog(week.periodStartDate, week.periodEndDate, section),
      queryFn: () => getWeekCatalog(week.periodStartDate, week.periodEndDate, section),
    })
    catalogItems.value = res.items
    filterGroups.value = res.filterGroups
    seasonalCategories.value = res.seasonalCategories
  } catch (cause) {
    catalogItems.value = []
    filterGroups.value = []
    seasonalCategories.value = []
    toast.error(
      cause instanceof Error ? cause.message : 'Impossible de charger le catalogue Quitoque.',
    )
  } finally {
    catalogLoading.value = false
  }
}

function triggerCartPulse(kind: 'catch' | 'remove') {
  cartPulse.value = null
  window.requestAnimationFrame(() => {
    cartPulse.value = kind
    window.setTimeout(() => {
      if (cartPulse.value === kind) cartPulse.value = null
    }, 460)
  })
}

function launchFlyToCart(product: CatalogProduct) {
  if (
    typeof window === 'undefined' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    triggerCartPulse('catch')
    return
  }
  const sourceEl = document.querySelector<HTMLElement>(
    `[data-product-id="${product.id}"] .q-recipe-card__photo`,
  )
  const targetEl =
    document.querySelector<HTMLElement>(`[data-cart-group="${product.section}"]`) ?? cartRef.value
  if (!sourceEl || !targetEl) {
    triggerCartPulse('catch')
    return
  }

  const from = sourceEl.getBoundingClientRect()
  const to = targetEl.getBoundingClientRect()

  const flyer = document.createElement('div')
  flyer.className = 'planif-flyer'
  flyer.style.width = `${from.width}px`
  flyer.style.height = `${from.height}px`
  flyer.style.left = `${from.left}px`
  flyer.style.top = `${from.top}px`

  if (product.imageUrl) {
    const img = document.createElement('img')
    img.src = product.imageUrl
    img.alt = ''
    flyer.appendChild(img)
  }
  document.body.appendChild(flyer)

  const endX = to.left + Math.min(to.width * 0.35, 80) - from.left - from.width * 0.38
  const endY = to.top + 16 - from.top - from.height * 0.38
  const midX = endX * 0.48
  const arcLift = Math.min(-90, Math.min(0, endY) - 95)

  const animation = flyer.animate(
    [
      {
        transform: 'translate3d(0, 0, 0) scale(1) rotate(0deg)',
        opacity: 1,
      },
      {
        transform: `translate3d(${midX * 0.45}px, ${arcLift * 0.75}px, 0) scale(1.06) rotate(-7deg)`,
        opacity: 1,
        offset: 0.28,
      },
      {
        transform: `translate3d(${midX}px, ${arcLift}px, 0) scale(0.76) rotate(5deg)`,
        opacity: 0.96,
        offset: 0.58,
      },
      {
        transform: `translate3d(${endX}px, ${endY}px, 0) scale(0.22) rotate(12deg)`,
        opacity: 0.15,
      },
    ],
    {
      duration: 540,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'forwards',
    },
  )

  window.setTimeout(() => triggerCartPulse('catch'), 430)
  animation.addEventListener('finish', () => flyer.remove(), { once: true })
  animation.addEventListener('cancel', () => flyer.remove(), { once: true })
}

async function handleAddProduct(product: CatalogProduct) {
  const week = currentWeek.value
  if (!week || !product.variantCode) {
    toast.error('Variante introuvable pour ce produit.')
    return
  }
  launchFlyToCart(product)
  mutatingKey.value = product.id
  try {
    const updated = await addBoxItem(week.orderId, product.variantCode, 1)
    replaceWeekInList(updated)
    toast.success(`« ${product.title} » ajouté à la box.`)
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : 'Ajout impossible.')
  } finally {
    mutatingKey.value = null
  }
}

async function handleChangeQuantity(item: BoxCartItem, delta: number) {
  const week = currentWeek.value
  if (!week) return
  const nextQty = item.quantity + delta

  if (delta > 0) {
    const catalogMatch = catalogItems.value.find((p) => p.id === item.productId)
    if (catalogMatch) launchFlyToCart(catalogMatch)
    else triggerCartPulse('catch')
  } else if (nextQty <= 0) {
    triggerCartPulse('remove')
  }

  // Snapshot for clean rollback if API rejects
  const previousWeek: UpcomingBoxWeek = {
    ...week,
    items: week.items.map((entry) => ({ ...entry })),
  }

  // Optimistic instant update — zero 2s lag before exit/qty animation!
  const optimisticItems =
    nextQty <= 0
      ? week.items.filter((entry) => entry.id !== item.id)
      : week.items.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                quantity: nextQty,
                totalCents: entry.unitPriceCents * nextQty,
              }
            : entry,
        )
  const priceDelta = nextQty <= 0 ? -item.totalCents : item.unitPriceCents * delta
  replaceWeekInList({
    ...week,
    items: optimisticItems,
    itemsTotalCents: Math.max(0, week.itemsTotalCents + priceDelta),
    totalCents: Math.max(0, week.totalCents + priceDelta),
  })

  mutatingKey.value = item.productId
  try {
    const updated =
      nextQty <= 0
        ? await removeBoxItem(week.orderId, item.id)
        : await updateBoxItemQuantity(week.orderId, item.id, nextQty)
    replaceWeekInList(updated)
    toast.success(nextQty <= 0 ? `« ${item.title} » retiré de la box.` : 'Quantité mise à jour.')
  } catch (cause) {
    replaceWeekInList(previousWeek)
    toast.error(cause instanceof Error ? cause.message : 'Modification impossible.')
  } finally {
    mutatingKey.value = null
  }
}

function goNextStep() {
  if (activeSection.value === 'recipes') activeSection.value = 'ready-meals'
  else if (activeSection.value === 'ready-meals') activeSection.value = 'market'
  else if (activeSection.value === 'market') activeSection.value = 'recap'
}

watch([selectedOrderId, activeSection], () => {
  if (activeSection.value !== 'recap') {
    resetFilters()
    void loadCatalog()
  }
})

onMounted(async () => {
  await loadWeeks()
  if (currentWeek.value) await loadCatalog()
})
</script>

<template>
  <section class="planification" aria-label="Planification Quitoque">
    <!-- Top bar: Week dropdown + Modification deadline recap -->
    <header class="planif-top">
      <div class="planif-top__week">
        <label class="planif-top__select-wrap">
          <span>Semaine à planifier</span>
          <select v-model="selectedOrderId" :disabled="weeksLoading || !weeks.length">
            <option v-for="week in weeks" :key="week.orderId" :value="week.orderId">
              Semaine du {{ formatShortDate(week.periodStartDate) }} au
              {{ formatShortDate(week.periodEndDate) }}
              {{ week.isNextOrder ? '· Prochaine box' : '' }}
              {{ week.onBreak ? '· En pause' : '' }}
            </option>
          </select>
        </label>
        <Button variant="secondary" :loading="weeksLoading" @click="loadWeeks">
          <RefreshCw :size="15" aria-hidden="true" />
          Actualiser
        </Button>
      </div>

      <div
        v-if="currentWeek"
        class="planif-deadline"
        :class="{ 'planif-deadline--locked': isLocked }"
      >
        <CalendarClock :size="20" aria-hidden="true" />
        <div class="planif-deadline__text">
          <strong>
            {{
              isLocked
                ? 'Cette box n’est plus modifiable'
                : `Modifiable jusqu’au ${formatLockDate(currentWeek.lockDate)}`
            }}
          </strong>
          <span>
            Livraison prévue :
            {{ formatDeliveryDate(currentWeek.deliveryDate) }}
            <template v-if="lockCountdown"> · {{ lockCountdown }}</template>
          </span>
        </div>
      </div>
    </header>

    <!-- 4-Step Timeline: Recettes — Plats cuisinés — Marché — Récapitulatif -->
    <nav class="planif-timeline" aria-label="Étapes de composition de la box">
      <button
        v-for="step in timelineSteps"
        :key="step.id"
        type="button"
        class="planif-timeline__step"
        :class="{ 'is-active': activeSection === step.id }"
        :aria-current="activeSection === step.id ? 'step' : undefined"
        @click="activeSection = step.id"
      >
        <span class="planif-timeline__num">{{ step.step }}</span>
        <component :is="step.icon" :size="18" aria-hidden="true" />
        <span class="planif-timeline__label">{{ step.label }}</span>
        <span class="planif-timeline__count">{{
          step.id === 'recap' ? totalBoxItemsCount : sectionCount(step.id)
        }}</span>
      </button>
    </nav>

    <div v-if="weeksLoading" class="planif-empty" role="status">
      Chargement de vos prochaines box Quitoque…
    </div>
    <div v-else-if="!currentWeek" class="planif-empty">
      Aucune box Quitoque à venir n’a été trouvée sur votre compte.
    </div>

    <!-- Step 4: Full Visual Recap View -->
    <PlanificationRecapTab
      v-else-if="activeSection === 'recap'"
      :week="currentWeek"
      :is-locked="isLocked"
      :grouped-cart-items="groupedCartItems"
      :section-count="sectionCount"
      :format-cents="formatCents"
      :format-short-date="formatShortDate"
      :format-delivery-date="formatDeliveryDate"
      @updated-week="replaceWeekInList"
      @edit-section="(sec) => (activeSection = sec)"
    />

    <!-- Steps 1-3: Main 2-column workspace: Catalog + Sticky Box Cart Sidebar -->
    <div v-else class="planif-workspace">
      <div class="planif-catalog">
        <!-- Compact Search & Collapsible Dynamic Filters -->
        <section class="planif-filters" aria-label="Filtres du catalogue">
          <div class="planif-filters__search-row">
            <label class="planif-search">
              <Search :size="16" aria-hidden="true" />
              <input
                v-model="searchQuery"
                type="search"
                :placeholder="`Rechercher dans ${timelineSteps.find((s) => s.id === activeSection)?.label.toLowerCase()}…`"
              />
            </label>
            <button
              v-if="filterGroups.length"
              type="button"
              class="planif-filters__toggle"
              :class="{ 'is-open': filtersOpen || activeFilterCount > 0 }"
              :aria-expanded="filtersOpen"
              @click="filtersOpen = !filtersOpen"
            >
              <SlidersHorizontal :size="15" aria-hidden="true" />
              <span>Filtres</span>
              <span v-if="activeFilterCount" class="planif-filters__badge">{{
                activeFilterCount
              }}</span>
            </button>
            <span class="planif-filters__count">
              {{ filteredProducts.length }}
              {{ filteredProducts.length > 1 ? 'résultats' : 'résultat' }}
            </span>
            <button
              v-if="hasActiveFilters"
              type="button"
              class="planif-filters__reset"
              @click="resetFilters"
            >
              Réinitialiser
            </button>
          </div>

          <!-- Single-line scrollable seasonal & active filter strip -->
          <div v-if="seasonalCategories.length || activeFilterChips.length" class="planif-strip">
            <span v-if="seasonalCategories.length" class="planif-strip__icon">
              <Sparkles :size="14" aria-hidden="true" />
            </span>
            <button
              v-for="cat in seasonalCategories"
              :key="cat"
              type="button"
              class="planif-pill planif-pill--seasonal"
              :class="{ 'is-active': selectedCategory === cat }"
              :aria-pressed="selectedCategory === cat"
              @click="selectedCategory = selectedCategory === cat ? null : cat"
            >
              {{ cat }}
            </button>
            <button
              v-for="chip in activeFilterChips"
              :key="`chip-${chip.groupCode}-${chip.value}`"
              type="button"
              class="planif-pill is-active planif-pill--chip"
              @click="toggleFilter(chip.groupCode, chip.value)"
            >
              {{ chip.label }}
              <X :size="12" aria-hidden="true" />
            </button>
          </div>

          <!-- Collapsible detailed filter groups -->
          <div v-if="filtersOpen && filterGroups.length" class="planif-drawer">
            <div v-for="group in filterGroups" :key="group.code" class="planif-filter-group">
              <span class="planif-filter-group__label">{{ group.name }}</span>
              <div class="planif-filter-pills">
                <button
                  v-for="opt in group.options"
                  :key="`${group.code}-${opt.value}`"
                  type="button"
                  class="planif-pill"
                  :class="{
                    'is-active': isFilterActive(group.code, opt.value),
                  }"
                  :aria-pressed="isFilterActive(group.code, opt.value)"
                  @click="toggleFilter(group.code, opt.value)"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Product Grid -->
        <div v-if="catalogLoading" class="planif-empty" role="status">
          Chargement du catalogue de la semaine…
        </div>
        <div v-else-if="!filteredProducts.length" class="planif-empty">
          Aucun produit ne correspond aux filtres sélectionnés.
        </div>
        <div v-else class="planif-grid">
          <RecipeCard
            v-for="product in filteredProducts"
            :key="product.id"
            v-memo="[
              product.id,
              cartItemByProductId.get(product.id)?.quantity ?? 0,
              mutatingKey === product.id,
              currentWeek?.onBreak,
            ]"
            :data-product-id="product.id"
            :title="product.title"
            source-label="Quitoque"
            :image-url="product.imageUrl"
            :description="product.description"
            :total-minutes="product.totalMinutes"
            :calories-kcal="product.nutrition?.caloriesKcal ?? null"
            :nutri-score="product.nutriScore"
            :carbon-score="product.carbonScore"
            :active="cartItemByProductId.has(product.id)"
            @open="openProductModal(product)"
          >
            <template
              v-if="
                product.highlights.length ||
                product.additionalCostCents > 0 ||
                (product.section !== 'recipes' && product.priceCents)
              "
              #overlay
            >
              <span v-if="product.highlights.length" class="planif-card__highlight">{{
                product.highlights[0]
              }}</span>
              <span v-if="product.additionalCostCents > 0" class="planif-card__extra"
                >+{{ formatCents(product.additionalCostCents) }}</span
              >
              <span
                v-else-if="product.section !== 'recipes' && product.priceCents"
                class="planif-card__extra"
                >{{ formatCents(product.priceCents) }}</span
              >
            </template>

            <template #footer>
              <template v-if="cartItemByProductId.get(product.id)">
                <div class="planif-stepper">
                  <button
                    type="button"
                    aria-label="Retirer un exemplaire"
                    :disabled="isLocked || mutatingKey === product.id"
                    @click="handleChangeQuantity(cartItemByProductId.get(product.id)!, -1)"
                  >
                    <Minus :size="15" aria-hidden="true" />
                  </button>
                  <span>{{ cartItemByProductId.get(product.id)!.quantity }}</span>
                  <button
                    type="button"
                    aria-label="Ajouter un exemplaire"
                    :disabled="isLocked || mutatingKey === product.id"
                    @click="handleChangeQuantity(cartItemByProductId.get(product.id)!, 1)"
                  >
                    <Plus :size="15" aria-hidden="true" />
                  </button>
                </div>
              </template>
              <Button
                v-else
                variant="secondary"
                class="planif-card__add"
                :disabled="isLocked || !product.variantCode"
                :loading="mutatingKey === product.id"
                @click="handleAddProduct(product)"
              >
                <Plus :size="16" aria-hidden="true" />
                Ajouter à la box
              </Button>
            </template>
          </RecipeCard>
        </div>
      </div>

      <!-- Right Sticky Sidebar: Panier récapitulatif de la Box -->
      <aside
        ref="cartRef"
        class="planif-cart"
        :class="{
          'is-catching': cartPulse === 'catch',
          'is-removing': cartPulse === 'remove',
        }"
        aria-label="Panier récapitulatif de la box"
      >
        <header class="planif-cart__head">
          <div>
            <h2>Ma Box</h2>
            <p>
              Semaine du {{ formatShortDate(currentWeek.periodStartDate) }} au
              {{ formatShortDate(currentWeek.periodEndDate) }}
            </p>
          </div>
          <span v-if="currentWeek.servings" class="planif-cart__servings">
            {{ currentWeek.servings }} pers.
          </span>
        </header>

        <div v-if="currentWeek.recipeTargetCount" class="planif-cart__progress">
          <div class="planif-cart__progress-row">
            <strong>Recettes choisies</strong>
            <span>{{ sectionCount('recipes') }} / {{ currentWeek.recipeTargetCount }}</span>
          </div>
          <ProgressRoot
            :model-value="recipeProgressPercent"
            :max="100"
            class="planif-cart__progress-track"
          >
            <ProgressIndicator
              class="planif-cart__progress-fill"
              :style="{ transform: `scaleX(${recipeProgressPercent / 100})` }"
            />
          </ProgressRoot>
        </div>

        <div class="planif-cart__groups">
          <div
            v-for="step in catalogSections"
            :key="`cart-${step.id}`"
            :data-cart-group="step.id"
            class="planif-cart__group"
          >
            <div class="planif-cart__group-head">
              <h3>{{ step.label }}</h3>
              <span>{{ sectionCount(step.id) }}</span>
            </div>
            <TransitionGroup
              v-if="groupedCartItems[step.id].length"
              name="cart-item"
              tag="ul"
              class="planif-cart__list"
            >
              <li
                v-for="item in groupedCartItems[step.id]"
                :key="item.id"
                class="planif-cart__item"
              >
                <div class="planif-cart__thumb">
                  <img v-if="item.imageUrl" :src="item.imageUrl" alt="" loading="lazy" />
                  <UtensilsCrossed v-else :size="18" aria-hidden="true" />
                </div>
                <div class="planif-cart__item-info">
                  <strong>{{ item.title }}</strong>
                  <small v-if="item.totalCents > 0">{{ formatCents(item.totalCents) }}</small>
                </div>
                <div class="planif-cart__item-controls">
                  <button
                    type="button"
                    aria-label="Diminuer la quantité"
                    :disabled="isLocked || mutatingKey === item.productId"
                    @click="handleChangeQuantity(item, -1)"
                  >
                    <Trash2 v-if="item.quantity === 1" :size="13" aria-hidden="true" />
                    <Minus v-else :size="13" aria-hidden="true" />
                  </button>
                  <span>{{ item.quantity }}</span>
                  <button
                    type="button"
                    aria-label="Augmenter la quantité"
                    :disabled="isLocked || mutatingKey === item.productId"
                    @click="handleChangeQuantity(item, 1)"
                  >
                    <Plus :size="13" aria-hidden="true" />
                  </button>
                </div>
              </li>
            </TransitionGroup>
            <p v-else class="planif-cart__empty">Aucun élément sélectionné.</p>
          </div>
        </div>

        <footer class="planif-cart__summary">
          <div class="planif-cart__line">
            <span>Sous-total articles</span>
            <strong>{{ formatCents(currentWeek.itemsTotalCents) }}</strong>
          </div>
          <div
            v-if="currentWeek.promotionTotalCents !== 0"
            class="planif-cart__line planif-cart__line--promo"
          >
            <span>Réductions</span>
            <strong>{{ formatCents(currentWeek.promotionTotalCents) }}</strong>
          </div>
          <div class="planif-cart__line">
            <span>Livraison</span>
            <strong>{{ formatCents(currentWeek.shippingTotalCents) }}</strong>
          </div>
          <div class="planif-cart__total">
            <span>Total estimé</span>
            <strong>{{ formatCents(currentWeek.totalCents) }}</strong>
          </div>
          <Button class="planif-cart__next" @click="goNextStep">
            {{
              activeSection === 'recipes'
                ? 'Continuer vers Plats cuisinés'
                : activeSection === 'ready-meals'
                  ? 'Continuer vers le Marché'
                  : 'Voir le récapitulatif'
            }}
            <ArrowRight :size="16" aria-hidden="true" />
          </Button>
        </footer>
      </aside>
    </div>

    <!-- Product Detail Modal (Recettes, Plats cuisinés & Marché) -->
    <PlanificationProductModal
      v-if="activeProductModal"
      :product="activeProductModal"
      :cart-item="cartItemByProductId.get(activeProductModal.id)"
      :servings="currentWeek?.servings ?? null"
      :is-locked="isLocked"
      :mutating="mutatingKey === activeProductModal.id"
      :format-cents="formatCents"
      @close="closeProductModal"
      @add="handleAddProduct"
      @change-quantity="handleChangeQuantity"
    />
  </section>
</template>

<style scoped>
.planification {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-4);
  color: var(--q-forest);
}

.planif-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--q-space-3);
  padding: var(--q-space-3) var(--q-space-4);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  border: 2px solid var(--q-forest);
}

.planif-top__week {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: var(--q-space-3);
}

.planif-top__select-wrap {
  display: grid;
  gap: 0.25rem;
}

.planif-top__select-wrap span {
  font-size: var(--q-type-metadata);
  font-weight: 750;
  color: var(--q-leaf);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.planif-top__select-wrap select {
  min-height: var(--q-touch-target);
  padding: 0.45rem 0.75rem;
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-weight: 700;
  font-size: var(--q-type-label);
}

.planif-deadline {
  display: flex;
  align-items: center;
  gap: var(--q-space-3);
  padding: var(--q-space-2) var(--q-space-4);
  border-radius: var(--q-radius-control);
  background: var(--q-shoot);
  color: var(--q-forest);
  border: 1px solid var(--q-forest);
}

.planif-deadline--locked {
  background: var(--q-coral);
}

.planif-deadline__text {
  display: grid;
  gap: 0.1rem;
}

.planif-deadline__text strong {
  font-family: var(--q-font-display);
  font-size: var(--q-type-label);
  font-weight: 800;
}

.planif-deadline__text span {
  font-size: var(--q-type-metadata);
  font-weight: 600;
  text-transform: capitalize;
}

.planif-timeline {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--q-space-3);
}

.planif-timeline__step {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--q-space-2);
  min-height: 52px;
  padding: var(--q-space-2) var(--q-space-4);
  border: 2px solid var(--q-leaf);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: 1rem;
  font-weight: 750;
  cursor: pointer;
  transition:
    background-color var(--q-duration-fast) var(--q-ease-standard),
    border-color var(--q-duration-fast) var(--q-ease-standard),
    transform var(--q-duration-fast) var(--q-ease-standard);
}

.planif-timeline__step:hover:not(.is-active) {
  background: var(--q-shoot);
  border-color: var(--q-forest);
}

.planif-timeline__step.is-active {
  background: var(--q-forest);
  color: var(--q-peach);
  border-color: var(--q-forest);
}

.planif-timeline__num {
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  background: var(--q-shoot);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 850;
}

.planif-timeline__count {
  padding: 0.15rem 0.5rem;
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.planif-timeline__step.is-active .planif-timeline__count {
  background: var(--q-coral);
  color: var(--q-forest);
}

.planif-empty {
  padding: var(--q-space-6);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  border: 1px solid var(--q-leaf);
  font-weight: 600;
}

.planif-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 23rem;
  gap: var(--q-space-4);
  align-items: start;
}

.planif-catalog {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-4);
  min-width: 0;
}

.planif-filters {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-2);
  padding: var(--q-space-3);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  border: 2px solid var(--q-forest);
}

.planif-filters__search-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--q-space-2);
}

.planif-filters__toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 40px;
  padding: 0 0.85rem;
  border: 1px solid var(--q-forest);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: var(--q-type-label);
  font-weight: 750;
  cursor: pointer;
}

.planif-filters__toggle:hover,
.planif-filters__toggle.is-open {
  background: var(--q-forest);
  color: var(--q-peach);
}

.planif-filters__badge {
  display: inline-grid;
  place-items: center;
  min-width: 1.25rem;
  height: 1.25rem;
  padding-inline: 0.3rem;
  border-radius: 999px;
  background: var(--q-shoot);
  color: var(--q-forest);
  font-size: 0.7rem;
  font-weight: 850;
}

.planif-strip {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: thin;
}

.planif-strip__icon {
  display: inline-flex;
  color: var(--q-leaf);
  flex: none;
}

.planif-strip .planif-pill {
  flex: none;
}

.planif-pill--chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.planif-drawer {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: var(--q-space-3);
  padding-top: var(--q-space-3);
  border-top: 1px solid var(--q-leaf);
}

.planif-search {
  flex: 1 1 16rem;
  display: flex;
  align-items: center;
  gap: var(--q-space-2);
  min-height: 42px;
  padding: 0 0.75rem;
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  color: var(--q-forest);
}

.planif-search input {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--q-forest);
  font-size: var(--q-type-label);
  outline: none;
}

.planif-filters__count {
  font-size: var(--q-type-label);
  font-weight: 700;
  color: var(--q-leaf);
  font-variant-numeric: tabular-nums;
}

.planif-filters__reset {
  min-height: 36px;
  padding: 0 var(--q-space-3);
  border: 1px solid var(--q-forest);
  border-radius: var(--q-radius-control);
  background: var(--q-coral);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 750;
  cursor: pointer;
}

.planif-filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.planif-filter-group__label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: var(--q-type-metadata);
  font-weight: 800;
  color: var(--q-leaf);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.planif-filter-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.planif-pill {
  min-height: 34px;
  padding: 0.25rem 0.7rem;
  border: 1px solid var(--q-leaf);
  border-radius: 999px;
  background: var(--q-sage);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color var(--q-duration-fast) var(--q-ease-standard),
    color var(--q-duration-fast) var(--q-ease-standard);
}

.planif-pill:hover:not(.is-active) {
  background: var(--q-shoot);
}

.planif-pill--seasonal {
  border-style: dashed;
}

.planif-pill.is-active {
  background: var(--q-forest);
  color: var(--q-peach);
  border-color: var(--q-forest);
  border-style: solid;
}

.planif-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
  gap: var(--q-space-4);
}

.planif-card__highlight {
  margin-right: auto;
  max-width: 72%;
  padding: 0.2rem 0.55rem;
  border-radius: var(--q-radius-control);
  background: var(--q-shoot);
  color: var(--q-forest);
  border: 1px solid var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.planif-card__extra {
  margin-left: auto;
  padding: 0.2rem 0.5rem;
  border-radius: var(--q-radius-control);
  background: var(--q-forest);
  color: var(--q-shoot);
  font-size: var(--q-type-metadata);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.planif-card__add {
  width: 100%;
  flex: 1;
}

.planif-stepper {
  width: 100%;
  flex: 1;
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  align-items: center;
  min-height: 44px;
  border-radius: var(--q-radius-control);
  background: var(--q-forest);
  color: var(--q-peach);
  overflow: hidden;
}

.planif-stepper button {
  display: grid;
  place-items: center;
  height: 44px;
  border: 0;
  background: transparent;
  color: var(--q-peach);
  cursor: pointer;
}

.planif-stepper button:hover {
  background: var(--q-leaf);
}

.planif-stepper span {
  text-align: center;
  font-family: var(--q-font-display);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.planif-cart {
  position: sticky;
  top: var(--q-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--q-space-3);
  max-height: calc(100dvh - 2rem);
  padding: var(--q-space-4);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  border: 2px solid var(--q-forest);
  overflow: hidden;
}

.planif-cart__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--q-space-2);
}

.planif-cart__head h2 {
  margin: 0;
  font-family: var(--q-font-display);
  font-size: var(--q-type-h4);
  font-weight: 850;
}

.planif-cart__head p {
  margin: 0.15rem 0 0;
  font-size: var(--q-type-metadata);
  color: var(--q-leaf);
  font-weight: 600;
}

.planif-cart__servings {
  padding: 0.2rem 0.55rem;
  border-radius: var(--q-radius-control);
  background: var(--q-shoot);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 800;
}

.planif-cart__progress {
  display: grid;
  gap: 0.35rem;
  padding: var(--q-space-2) var(--q-space-3);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
}

.planif-cart__progress-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--q-type-metadata);
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}

.planif-cart__progress-track {
  height: 8px;
  border-radius: 999px;
  background: var(--q-peach);
  overflow: hidden;
}

.planif-cart__progress-fill {
  width: 100%;
  height: 100%;
  transform-origin: left center;
  background: var(--q-leaf);
  transition: transform 240ms var(--q-ease-standard);
}

.planif-cart__groups {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--q-space-3);
  padding-right: 2px;
}

.planif-cart__group {
  display: grid;
  gap: 0.4rem;
}

.planif-cart__group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--q-leaf);
}

.planif-cart__group-head h3 {
  margin: 0;
  font-family: var(--q-font-display);
  font-size: var(--q-type-metadata);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--q-leaf);
}

.planif-cart__group-head span {
  font-size: var(--q-type-metadata);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.planif-cart__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}

.planif-cart__item {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 0.5rem;
  align-items: center;
  padding: 0.35rem;
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
}

.planif-cart__thumb {
  width: 44px;
  height: 44px;
  border-radius: 4px;
  background: var(--q-peach);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.planif-cart__thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.planif-cart__item-info {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}

.planif-cart__item-info strong {
  font-size: var(--q-type-metadata);
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.planif-cart__item-info small {
  font-size: 0.7rem;
  color: var(--q-leaf);
  font-weight: 700;
}

.planif-cart__item-controls {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.planif-cart__item-controls button {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--q-leaf);
  border-radius: 4px;
  background: var(--q-peach);
  color: var(--q-forest);
  cursor: pointer;
}

.planif-cart__item-controls button:hover {
  background: var(--q-shoot);
}

.planif-cart__item-controls span {
  min-width: 1.2rem;
  text-align: center;
  font-size: var(--q-type-metadata);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.planif-cart__empty {
  margin: 0;
  font-size: var(--q-type-metadata);
  color: var(--q-leaf);
}

.planif-cart__summary {
  display: grid;
  gap: 0.35rem;
  padding-top: var(--q-space-3);
  border-top: 2px solid var(--q-forest);
  font-variant-numeric: tabular-nums;
}

.planif-cart__line {
  display: flex;
  justify-content: space-between;
  font-size: var(--q-type-metadata);
}

.planif-cart__line--promo strong {
  color: var(--q-leaf);
}

.planif-cart__total {
  display: flex;
  justify-content: space-between;
  padding-top: 0.3rem;
  font-family: var(--q-font-display);
  font-size: 1.0625rem;
  font-weight: 850;
}

.planif-cart__next {
  width: 100%;
  margin-top: var(--q-space-2);
}

@media (max-width: 72rem) {
  .planif-workspace {
    grid-template-columns: 1fr;
  }
  .planif-cart {
    position: static;
    max-height: none;
  }
}
@media (max-width: 48rem) {
  .planif-timeline {
    grid-template-columns: 1fr;
  }
}
.planif-cart.is-catching {
  animation: cart-catch 440ms cubic-bezier(0.22, 1, 0.36, 1);
}

.planif-cart.is-removing {
  animation: cart-recoil 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes cart-catch {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--q-shoot) 0%, transparent);
  }
  38% {
    transform: scale(1.022);
    box-shadow: 0 0 0 6px var(--q-shoot);
  }
  72% {
    transform: scale(0.994);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--q-shoot) 45%, transparent);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--q-shoot) 0%, transparent);
  }
}
@keyframes cart-recoil {
  0% {
    transform: translateX(0);
  }
  35% {
    transform: translateX(-4px) scale(0.992);
  }
  100% {
    transform: translateX(0) scale(1);
  }
}
.cart-item-enter-active {
  transition:
    opacity 280ms var(--q-ease-standard),
    transform 340ms cubic-bezier(0.22, 1, 0.36, 1),
    background-color 420ms ease;
}

.cart-item-leave-active {
  transition:
    opacity 240ms ease,
    transform 280ms cubic-bezier(0.4, 0, 0.2, 1);
}

.cart-item-move {
  transition: transform 300ms cubic-bezier(0.22, 1, 0.36, 1);
}

.cart-item-enter-from {
  opacity: 0;
  transform: translateX(22px) scale(0.92);
  background: var(--q-shoot);
}

.cart-item-leave-to {
  opacity: 0;
  transform: translateX(34px) scale(0.86) rotate(2deg);
}

@media (prefers-reduced-motion: reduce) {
  .planif-cart.is-catching,
  .planif-cart.is-removing {
    animation: none;
  }
  .cart-item-enter-from,
  .cart-item-leave-to {
    transform: none;
  }
}
</style>

<style>
.planif-flyer {
  position: fixed;
  z-index: calc(var(--q-z-toast) + 30);
  pointer-events: none;
  will-change: transform, opacity;
  border-radius: var(--q-radius-card);
  border: 2px solid var(--q-forest);
  background: var(--q-peach);
  overflow: hidden;
  box-shadow: 0 20px 40px -10px color-mix(in srgb, var(--q-forest) 50%, transparent);
}

.planif-flyer img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
