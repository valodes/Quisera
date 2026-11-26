<script setup lang="ts">
defineOptions({ name: 'PlanificationRecapTab' })

import { Check, Clock3, MapPin, Tag, Users, UtensilsCrossed, Wallet } from '@lucide/vue'
import { computed, ref, shallowRef, watch } from 'vue'
import RecipeCard from '@/components/recipes/RecipeCard.vue'
import Button from '@/components/ui/Button.vue'
import { useToast } from '@/components/ui/toast'
import {
  applyBoxCoupon,
  geocodeAddress,
  getDeliveryTimeSlots,
  toggleBoxWallet,
  updateBoxDeliverySlot,
  updateBoxServings,
  type BoxCartItem,
  type DeliveryTimeSlotOption,
  type PlanificationSection,
  type UpcomingBoxWeek,
} from '@/planification/api'

const props = defineProps<{
  week: UpcomingBoxWeek
  isLocked: boolean
  groupedCartItems: Record<PlanificationSection, BoxCartItem[]>
  sectionCount: (section: PlanificationSection) => number
  formatCents: (cents: number) => string
  formatShortDate: (civilDate: string) => string
  formatDeliveryDate: (civilDate: string | null) => string
}>()

const emit = defineEmits<{
  updatedWeek: [week: UpcomingBoxWeek]
  editSection: [section: PlanificationSection]
}>()

const toast = useToast()

const catalogSections = [
  { id: 'recipes', label: 'Recettes' },
  { id: 'ready-meals', label: 'Plats cuisinés' },
  { id: 'market', label: 'Marché' },
] as const

const timeSlotsLoading = ref(false)
const availableDeliveryDates = shallowRef<string[]>([])
const availableTimeSlots = shallowRef<DeliveryTimeSlotOption[]>([])
const selectedDeliveryDate = ref('')
const selectedTimeSlotId = ref<number | null>(null)
const savingDelivery = ref(false)
const savingServings = ref(false)
const savingPromo = ref(false)
const manualCouponInput = ref('')
const mapCoords = ref<{ lat: number; lon: number } | null>(null)

const osmEmbedUrl = computed(() => {
  if (!mapCoords.value) return null
  const { lat, lon } = mapCoords.value
  const dLat = 0.008
  const dLon = 0.012
  const bbox = `${(lon - dLon).toFixed(5)},${(lat - dLat).toFixed(5)},${(lon + dLon).toFixed(5)},${(lat + dLat).toFixed(5)}`
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(5)},${lon.toFixed(5)}`
})

const slotsForSelectedDate = computed(() => {
  if (!selectedDeliveryDate.value) return availableTimeSlots.value
  return availableTimeSlots.value.filter(
    (slot) =>
      slot.deliveryDates.length === 0 || slot.deliveryDates.includes(selectedDeliveryDate.value),
  )
})

const totalBoxItemsCount = computed(() =>
  props.week.items.reduce((sum, item) => sum + item.quantity, 0),
)

async function loadRecapData(week: UpcomingBoxWeek) {
  selectedDeliveryDate.value = week.shipment?.deliveryDate ?? week.deliveryDate ?? ''
  selectedTimeSlotId.value = week.shipment?.timeSlotId ?? null

  const postcode = week.shippingAddress?.postcode
  if (postcode) {
    timeSlotsLoading.value = true
    try {
      const res = await getDeliveryTimeSlots(postcode, week.periodStartDate)
      availableDeliveryDates.value = res.deliveryDates
      availableTimeSlots.value = res.timeSlots
      if (!selectedDeliveryDate.value && res.deliveryDates[0]) {
        selectedDeliveryDate.value = res.deliveryDates[0]
      }
    } catch {
      availableDeliveryDates.value = []
      availableTimeSlots.value = []
    } finally {
      timeSlotsLoading.value = false
    }
  }

  const addressQuery = [
    week.shippingAddress?.street,
    week.shippingAddress?.postcode,
    week.shippingAddress?.city,
    'France',
  ]
    .filter(Boolean)
    .join(', ')
  if (addressQuery) {
    try {
      mapCoords.value = await geocodeAddress(addressQuery)
    } catch {
      mapCoords.value = null
    }
  }
}

watch(
  () => props.week.orderId,
  () => {
    void loadRecapData(props.week)
  },
  { immediate: true },
)

async function handleSelectServings(size: number) {
  if (props.isLocked || props.week.servings === size) return
  savingServings.value = true
  try {
    const updated = await updateBoxServings(props.week.orderId, size)
    emit('updatedWeek', updated)
    toast.success(`Box ajustée pour ${size} personnes.`)
  } catch (cause) {
    toast.error(
      cause instanceof Error ? cause.message : 'Impossible de modifier le nombre de personnes.',
    )
  } finally {
    savingServings.value = false
  }
}

async function handleSaveDeliverySlot() {
  if (!props.week.shipment?.id || !selectedDeliveryDate.value || !selectedTimeSlotId.value) return
  const slot = slotsForSelectedDate.value.find((s) => s.id === selectedTimeSlotId.value)
  if (!slot) return
  savingDelivery.value = true
  try {
    const updated = await updateBoxDeliverySlot(props.week.orderId, {
      shipmentId: props.week.shipment.id,
      shippingMethodCode: slot.shippingMethodCode,
      deliveryDate: selectedDeliveryDate.value,
      begin: slot.begin,
      end: slot.end,
      timeSlotId: slot.id,
    })
    emit('updatedWeek', updated)
    toast.success(
      `Livraison mise à jour : ${props.formatDeliveryDate(selectedDeliveryDate.value)} (${slot.label}).`,
    )
  } catch (cause) {
    toast.error(
      cause instanceof Error ? cause.message : 'Impossible de modifier le créneau de livraison.',
    )
  } finally {
    savingDelivery.value = false
  }
}

async function handleApplyCoupon(code: string | null) {
  if (props.isLocked) return
  savingPromo.value = true
  try {
    const updated = await applyBoxCoupon(props.week.orderId, code)
    emit('updatedWeek', updated)
    manualCouponInput.value = ''
    toast.success(code ? `Code promo « ${code} » appliqué.` : 'Code promo retiré.')
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : 'Code promo refusé.')
  } finally {
    savingPromo.value = false
  }
}

async function handleToggleWallet() {
  if (props.isLocked) return
  savingPromo.value = true
  try {
    const updated = await toggleBoxWallet(props.week.orderId, !props.week.useWallet)
    emit('updatedWeek', updated)
    toast.success(updated.useWallet ? 'Cagnotte activée sur cette box.' : 'Cagnotte désactivée.')
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : 'Modification impossible.')
  } finally {
    savingPromo.value = false
  }
}
</script>

<template>
  <div class="planif-recap">
    <div class="planif-recap__main">
      <section class="recap-card">
        <header class="recap-card__head">
          <div>
            <h2>
              <MapPin :size="19" aria-hidden="true" />
              Lieu et horaires de livraison
            </h2>
            <p v-if="week.shippingAddress">
              {{ week.shippingAddress.recipientName }} · {{ week.shippingAddress.street }},
              {{ week.shippingAddress.postcode }}
              {{ week.shippingAddress.city }}
            </p>
          </div>
          <span
            v-if="week.shipment?.startTime && week.shipment?.endTime"
            class="recap-card__slot-pill"
          >
            <Clock3 :size="14" aria-hidden="true" />
            Entre {{ week.shipment.startTime }} et
            {{ week.shipment.endTime }}
          </span>
        </header>

        <div class="recap-delivery-grid">
          <div class="recap-map">
            <iframe
              v-if="osmEmbedUrl"
              :src="osmEmbedUrl"
              title="Carte du lieu de livraison"
              loading="lazy"
              referrerpolicy="no-referrer"
            />
            <div v-else class="recap-map__fallback">
              <MapPin :size="28" aria-hidden="true" />
              <strong>{{ week.shippingAddress?.city ?? 'Adresse de livraison' }}</strong>
              <span>{{ week.shippingAddress?.street }}</span>
            </div>
          </div>

          <div class="recap-slots">
            <h3>Modifier le jour et le créneau horaire</h3>
            <div v-if="timeSlotsLoading" class="recap-slots__loading" role="status">
              Chargement des créneaux disponibles…
            </div>
            <template v-else-if="availableDeliveryDates.length">
              <div class="recap-date-pills">
                <button
                  v-for="date in availableDeliveryDates"
                  :key="date"
                  type="button"
                  class="recap-pill"
                  :class="{ 'is-active': selectedDeliveryDate === date }"
                  :disabled="isLocked"
                  @click="selectedDeliveryDate = date"
                >
                  {{ formatShortDate(date) }}
                </button>
              </div>

              <div class="recap-timeslot-list">
                <button
                  v-for="slot in slotsForSelectedDate"
                  :key="slot.id"
                  type="button"
                  class="recap-timeslot"
                  :class="{ 'is-selected': selectedTimeSlotId === slot.id }"
                  :disabled="isLocked"
                  @click="selectedTimeSlotId = slot.id"
                >
                  <div>
                    <strong>Entre {{ slot.begin }} et {{ slot.end }}</strong>
                    <span v-if="slot.recommended" class="recap-timeslot__tag">Recommandé</span>
                  </div>
                  <span>{{ formatCents(slot.priceCents) }}</span>
                </button>
              </div>

              <Button
                variant="secondary"
                :disabled="isLocked || !selectedTimeSlotId"
                :loading="savingDelivery"
                @click="handleSaveDeliverySlot"
              >
                Enregistrer le créneau
              </Button>
            </template>
            <p v-else class="recap-empty">
              Livraison prévue le
              {{ formatDeliveryDate(week.deliveryDate) }}.
            </p>
          </div>
        </div>
      </section>

      <section class="recap-card">
        <header class="recap-card__head">
          <div>
            <h2>
              <Users :size="19" aria-hidden="true" />
              Nombre de personnes
            </h2>
            <p>Ajuste automatiquement les portions des recettes de cette box.</p>
          </div>
        </header>
        <div class="recap-servings">
          <button
            v-for="count in [2, 3, 4, 5]"
            :key="count"
            type="button"
            class="recap-servings__btn"
            :class="{ 'is-active': week.servings === count }"
            :disabled="isLocked || savingServings"
            @click="handleSelectServings(count)"
          >
            <strong>{{ count }}</strong>
            <span>personnes</span>
          </button>
        </div>
      </section>

      <section class="recap-card">
        <header class="recap-card__head">
          <div>
            <h2>
              <UtensilsCrossed :size="19" aria-hidden="true" />
              Contenu de votre box ({{ totalBoxItemsCount }} articles)
            </h2>
          </div>
        </header>

        <div
          v-for="section in catalogSections"
          :key="`recap-${section.id}`"
          class="recap-gallery-group"
        >
          <div class="recap-gallery-group__head">
            <h3>{{ section.label }} ({{ sectionCount(section.id) }})</h3>
            <button
              type="button"
              class="recap-gallery-group__edit"
              @click="emit('editSection', section.id)"
            >
              Modifier
            </button>
          </div>
          <div v-if="groupedCartItems[section.id].length" class="recap-gallery-grid">
            <RecipeCard
              v-for="item in groupedCartItems[section.id]"
              :key="`recap-item-${item.id}`"
              :title="item.title"
              source-label="Quitoque"
              :image-url="item.imageUrl"
              :description="item.totalCents > 0 ? formatCents(item.totalCents) : null"
              @open="emit('editSection', section.id)"
            >
              <template #overlay>
                <span class="recap-card-extra">×{{ item.quantity }}</span>
              </template>
            </RecipeCard>
          </div>
          <p v-else class="recap-empty">Aucun article dans cette catégorie.</p>
        </div>
      </section>
    </div>

    <aside class="planif-recap__side">
      <section class="recap-card">
        <header class="recap-card__head">
          <h2>
            <Tag :size="18" aria-hidden="true" />
            Codes promos et cagnotte
          </h2>
        </header>

        <ul v-if="week.promotions.length" class="recap-promos">
          <li
            v-for="promo in week.promotions"
            :key="promo.id"
            class="recap-promo"
            :class="{ 'is-applied': promo.isOnOrder }"
          >
            <div class="recap-promo__info">
              <strong>{{ promo.description ?? promo.name }}</strong>
              <small>
                <span v-if="promo.couponCode">{{ promo.couponCode }}</span>
                <span v-if="promo.amountCents > 0"> · -{{ formatCents(promo.amountCents) }}</span>
                <span v-if="promo.endsAt">
                  · Valable jusqu’au {{ formatShortDate(promo.endsAt) }}</span
                >
              </small>
            </div>
            <button
              v-if="promo.couponCode"
              type="button"
              class="recap-promo__btn"
              :disabled="isLocked || savingPromo"
              @click="handleApplyCoupon(promo.isOnOrder ? null : promo.couponCode)"
            >
              <Check v-if="promo.isOnOrder" :size="14" aria-hidden="true" />
              {{ promo.isOnOrder ? 'Appliqué' : 'Appliquer' }}
            </button>
          </li>
        </ul>
        <p v-else class="recap-empty">Aucun code promo disponible sur votre compte.</p>

        <form
          class="recap-coupon-form"
          @submit.prevent="manualCouponInput.trim() && handleApplyCoupon(manualCouponInput.trim())"
        >
          <input
            v-model="manualCouponInput"
            type="text"
            placeholder="Saisir un code promo…"
            :disabled="isLocked || savingPromo"
          />
          <Button
            type="submit"
            variant="secondary"
            :disabled="isLocked || !manualCouponInput.trim()"
            :loading="savingPromo"
            >Appliquer</Button
          >
        </form>

        <div class="recap-wallet">
          <div>
            <strong>
              <Wallet :size="16" aria-hidden="true" />
              Cagnotte Quitoque
            </strong>
            <small>Solde disponible : {{ formatCents(week.walletBalanceCents) }}</small>
          </div>
          <button
            type="button"
            class="recap-pill"
            :class="{ 'is-active': week.useWallet }"
            :disabled="isLocked || savingPromo"
            @click="handleToggleWallet"
          >
            {{ week.useWallet ? 'Activée' : 'Activer' }}
          </button>
        </div>
      </section>

      <section class="recap-card">
        <header class="recap-card__head">
          <h2>Total de la box</h2>
        </header>
        <div class="recap-summary">
          <div class="recap-summary__line">
            <span>Sous-total articles</span>
            <strong>{{ formatCents(week.itemsTotalCents) }}</strong>
          </div>
          <div
            v-if="week.promotionTotalCents !== 0"
            class="recap-summary__line recap-summary__line--promo"
          >
            <span>Réductions</span>
            <strong>{{ formatCents(week.promotionTotalCents) }}</strong>
          </div>
          <div
            v-if="week.walletTotalCents !== 0"
            class="recap-summary__line recap-summary__line--promo"
          >
            <span>Cagnotte utilisée</span>
            <strong>{{ formatCents(week.walletTotalCents) }}</strong>
          </div>
          <div class="recap-summary__line">
            <span>Livraison</span>
            <strong>{{ formatCents(week.shippingTotalCents) }}</strong>
          </div>
          <div class="recap-summary__total">
            <span>Total estimé</span>
            <strong>{{ formatCents(week.totalCents) }}</strong>
          </div>
        </div>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.planif-recap {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(20rem, 0.85fr);
  gap: var(--q-space-4);
  align-items: start;
}
.planif-recap__main,
.planif-recap__side {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-4);
  min-width: 0;
}
.planif-recap__side {
  position: sticky;
  top: var(--q-space-4);
}
.recap-card {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-4);
  padding: var(--q-space-4);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  border: 2px solid var(--q-forest);
}
.recap-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--q-space-2);
}
.recap-card__head h2 {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--q-space-2);
  font-family: var(--q-font-display);
  font-size: var(--q-type-h4);
  font-weight: 850;
}
.recap-card__head p {
  margin: 0.25rem 0 0;
  font-size: var(--q-type-label);
  color: var(--q-leaf);
  font-weight: 600;
}
.recap-card__slot-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.7rem;
  border-radius: var(--q-radius-control);
  background: var(--q-shoot);
  color: var(--q-forest);
  border: 1px solid var(--q-forest);
  font-size: var(--q-type-label);
  font-weight: 800;
}
.recap-delivery-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--q-space-4);
  align-items: stretch;
}
.recap-map {
  min-height: 260px;
  border-radius: var(--q-radius-control);
  border: 1px solid var(--q-leaf);
  background: var(--q-sage);
  overflow: hidden;
  display: flex;
}
.recap-map iframe {
  width: 100%;
  height: 100%;
  min-height: 260px;
  border: 0;
}
.recap-map__fallback {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: var(--q-space-4);
  text-align: center;
}
.recap-slots {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-3);
}
.recap-slots h3 {
  margin: 0;
  font-family: var(--q-font-display);
  font-size: var(--q-type-label);
  font-weight: 800;
}
.recap-date-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.recap-pill {
  min-height: 36px;
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: var(--q-type-metadata);
  font-weight: 750;
  cursor: pointer;
}
.recap-pill:hover:not(:disabled):not(.is-active) {
  background: var(--q-shoot);
}
.recap-pill.is-active {
  background: var(--q-forest);
  color: var(--q-peach);
  border-color: var(--q-forest);
}
.recap-timeslot-list {
  display: grid;
  gap: 0.45rem;
}
.recap-timeslot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--q-space-2);
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  color: var(--q-forest);
  cursor: pointer;
  font-size: var(--q-type-label);
  font-weight: 700;
  text-align: left;
}
.recap-timeslot:hover {
  background: var(--q-shoot);
}
.recap-timeslot.is-selected {
  background: var(--q-forest);
  color: var(--q-peach);
  border-color: var(--q-forest);
}
.recap-timeslot__tag {
  margin-left: 0.45rem;
  padding: 0.1rem 0.4rem;
  border-radius: var(--q-radius-control);
  background: var(--q-shoot);
  color: var(--q-forest);
  font-size: 0.7rem;
  font-weight: 800;
}
.recap-servings {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--q-space-2);
}
.recap-servings__btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  padding: var(--q-space-3);
  border: 2px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  color: var(--q-forest);
  cursor: pointer;
}
.recap-servings__btn strong {
  font-family: var(--q-font-display);
  font-size: 1.5rem;
  font-weight: 850;
  line-height: 1;
}
.recap-servings__btn span {
  font-size: var(--q-type-metadata);
  font-weight: 700;
}
.recap-servings__btn:hover:not(.is-active) {
  background: var(--q-shoot);
}
.recap-servings__btn.is-active {
  background: var(--q-forest);
  color: var(--q-peach);
  border-color: var(--q-forest);
}
.recap-gallery-group {
  display: grid;
  gap: var(--q-space-2);
}
.recap-gallery-group__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--q-leaf);
}
.recap-gallery-group__head h3 {
  margin: 0;
  font-family: var(--q-font-display);
  font-size: var(--q-type-label);
  font-weight: 800;
}
.recap-gallery-group__edit {
  border: 0;
  background: transparent;
  color: var(--q-leaf);
  font-size: var(--q-type-metadata);
  font-weight: 800;
  text-decoration: underline;
  cursor: pointer;
}
.recap-gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12.5rem, 1fr));
  gap: var(--q-space-3);
}
.recap-card-extra {
  padding: 0.2rem 0.5rem;
  border-radius: var(--q-radius-control);
  background: var(--q-forest);
  color: var(--q-shoot);
  font-family: var(--q-font-display);
  font-size: var(--q-type-metadata);
  font-weight: 850;
}
.recap-empty {
  margin: 0;
  font-size: var(--q-type-label);
  color: var(--q-leaf);
}
.recap-promos {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--q-space-2);
}
.recap-promo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--q-space-2);
  padding: var(--q-space-3);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  border: 1px solid var(--q-leaf);
}
.recap-promo.is-applied {
  background: var(--q-shoot);
  border-color: var(--q-forest);
}
.recap-promo__info {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}
.recap-promo__info strong {
  font-size: var(--q-type-label);
  line-height: 1.3;
}
.recap-promo__info small {
  font-size: var(--q-type-metadata);
  color: var(--q-leaf);
  font-weight: 600;
}
.recap-promo__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  flex: none;
  min-height: 36px;
  padding: 0 0.7rem;
  border: 1px solid var(--q-forest);
  border-radius: var(--q-radius-control);
  background: var(--q-forest);
  color: var(--q-peach);
  font-size: var(--q-type-metadata);
  font-weight: 750;
  cursor: pointer;
}
.recap-coupon-form {
  display: flex;
  gap: var(--q-space-2);
}
.recap-coupon-form input {
  flex: 1;
  min-height: var(--q-touch-target);
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  color: var(--q-forest);
  font-size: var(--q-type-label);
}
.recap-wallet {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--q-space-2);
  padding: var(--q-space-3);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  border: 1px solid var(--q-leaf);
}
.recap-wallet strong {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: var(--q-type-label);
}
.recap-wallet small {
  display: block;
  font-size: var(--q-type-metadata);
  color: var(--q-leaf);
}
.recap-summary {
  display: grid;
  gap: var(--q-space-2);
}
.recap-summary__line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--q-type-label);
}
.recap-summary__line--promo {
  color: var(--q-leaf);
  font-weight: 700;
}
.recap-summary__total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--q-space-2);
  border-top: 1px solid var(--q-leaf);
  font-family: var(--q-font-display);
  font-size: var(--q-type-h4);
  font-weight: 850;
}
@media (max-width: 72rem) {
  .planif-recap,
  .recap-delivery-grid {
    grid-template-columns: 1fr;
  }
  .planif-recap__side {
    position: static;
  }
}
</style>
