<script setup lang="ts">
defineOptions({ name: 'PlanificationProductModal' })

import { Clock3, Minus, Plus } from '@lucide/vue'
import { computed } from 'vue'
import NutritionPanel from '@/components/recipes/NutritionPanel.vue'
import Button from '@/components/ui/Button.vue'
import ModalDialog from '@/components/ui/ModalDialog.vue'
import ScoreBadge from '@/components/ui/ScoreBadge.vue'
import type { BoxCartItem, CatalogProduct } from '@/planification/api'
import { parseStructuredStep } from '@/recipes/instructions'

const props = defineProps<{
  product: CatalogProduct
  cartItem?: BoxCartItem | undefined
  servings: number | null
  isLocked: boolean
  mutating: boolean
  formatCents: (cents: number) => string
}>()

const emit = defineEmits<{
  close: []
  add: [product: CatalogProduct]
  changeQuantity: [item: BoxCartItem, delta: -1 | 1]
}>()

const open = computed({
  get: () => true,
  set: (val) => {
    if (!val) emit('close')
  },
})

const sectionBadge = computed(() =>
  props.product.section === 'recipes'
    ? 'Recette à cuisiner'
    : props.product.section === 'ready-meals'
      ? 'Plat cuisiné'
      : 'Produit du marché',
)

const structuredSteps = computed(() =>
  props.product.steps.map((step, idx) => parseStructuredStep(step, idx + 1)),
)
</script>

<template>
  <ModalDialog
    v-model:open="open"
    :title="product.title"
    :badge="sectionBadge"
    close-label="Fermer la fiche"
  >
    <div class="planif-modal-content">
      <div v-if="product.imageUrl" class="planif-modal__media">
        <img :src="product.imageUrl" :alt="`Photographie de ${product.title}`" />
      </div>

      <div class="planif-modal__badges">
        <span
          v-for="hl in product.highlights"
          :key="hl"
          class="planif-modal__chip planif-modal__chip--shoot"
          >{{ hl }}</span
        >
        <span v-if="product.totalMinutes" class="planif-modal__chip">
          <Clock3 :size="13" aria-hidden="true" />
          {{ product.totalMinutes }} min
        </span>
        <span
          v-if="product.additionalCostCents > 0"
          class="planif-modal__chip planif-modal__chip--accent"
        >
          Supplément +{{ formatCents(product.additionalCostCents) }}
        </span>
        <span
          v-else-if="product.section !== 'recipes' && product.priceCents"
          class="planif-modal__chip planif-modal__chip--accent"
        >
          {{ formatCents(product.priceCents) }}
        </span>
        <ScoreBadge v-if="product.nutriScore" kind="nutri" :grade="product.nutriScore" />
        <ScoreBadge v-if="product.carbonScore" kind="eco" :grade="product.carbonScore" />
      </div>

      <p v-if="product.description" class="planif-modal__desc">{{ product.description }}</p>

      <NutritionPanel :servings="product.servings ?? servings" :nutrition="product.nutrition" />

      <section v-if="product.allergens.length" class="planif-modal__section-block">
        <h3>Allergènes</h3>
        <div class="planif-modal__badges">
          <span v-for="allergen in product.allergens" :key="allergen" class="planif-modal__chip">{{
            allergen
          }}</span>
        </div>
      </section>

      <section v-if="product.ingredients.length" class="planif-modal__section-block">
        <h3>Ingrédients</h3>
        <ul class="planif-modal__ingredients">
          <li v-for="(ing, idx) in product.ingredients" :key="`${idx}-${ing.name}`">
            <strong>{{ ing.name }}</strong>
            <span v-if="ing.quantity">
              · {{ ing.quantity }}<template v-if="ing.unit"> {{ ing.unit }}</template></span
            >
            <span v-if="ing.notes"> · {{ ing.notes }}</span>
          </li>
        </ul>
      </section>

      <section v-if="structuredSteps.length" class="planif-modal__section-block">
        <h3>Préparation</h3>
        <ol class="planif-modal__steps">
          <li
            v-for="(step, idx) in structuredSteps"
            :key="`pstep-${idx}`"
            class="planif-modal__step"
          >
            <strong v-if="step.title" class="planif-modal__step-title">
              {{ step.title }}
            </strong>
            <div class="planif-modal__step-lines">
              <p v-for="(line, lineIdx) in step.lines" :key="`pline-${idx}-${lineIdx}`">
                {{ line }}
              </p>
            </div>
          </li>
        </ol>
      </section>

      <div v-if="product.categories.length" class="planif-modal__badges">
        <span v-for="cat in product.categories" :key="cat" class="planif-modal__chip">{{
          cat
        }}</span>
      </div>
    </div>

    <template #footer>
      <template v-if="cartItem">
        <div class="planif-modal__stepper">
          <button
            type="button"
            aria-label="Retirer un exemplaire"
            :disabled="isLocked || mutating"
            @click="emit('changeQuantity', cartItem, -1)"
          >
            <Minus :size="15" aria-hidden="true" />
          </button>
          <span>{{ cartItem.quantity }}</span>
          <button
            type="button"
            aria-label="Ajouter un exemplaire"
            :disabled="isLocked || mutating"
            @click="emit('changeQuantity', cartItem, 1)"
          >
            <Plus :size="15" aria-hidden="true" />
          </button>
        </div>
      </template>
      <Button
        v-else
        variant="secondary"
        :disabled="isLocked || !product.variantCode"
        :loading="mutating"
        @click="emit('add', product)"
      >
        <Plus :size="16" aria-hidden="true" />
        Ajouter à la box
      </Button>
      <Button @click="emit('close')">Fermer</Button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.planif-modal-content {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-4);
}
.planif-modal__media {
  height: 240px;
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  overflow: hidden;
}
.planif-modal__media img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.planif-modal__badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}
.planif-modal__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.22rem 0.55rem;
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 700;
}
.planif-modal__chip--shoot {
  background: var(--q-shoot);
}
.planif-modal__chip--accent {
  background: var(--q-coral);
}
.planif-modal__desc {
  margin: 0;
  line-height: var(--q-line-body);
}
.planif-modal__section-block {
  display: grid;
  gap: var(--q-space-2);
}
.planif-modal__section-block h3 {
  margin: 0;
  font-family: var(--q-font-display);
  font-size: var(--q-type-h4);
  font-weight: 750;
}
.planif-modal__ingredients {
  margin: 0;
  padding: var(--q-space-3);
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: var(--q-space-2);
  background: var(--q-sage);
  border-radius: var(--q-radius-control);
  font-size: var(--q-type-label);
}
.planif-modal__steps {
  margin: 0;
  padding-left: 1.35rem;
  display: grid;
  gap: var(--q-space-4);
  line-height: var(--q-line-body);
}
.planif-modal__step-title {
  display: block;
  margin-bottom: var(--q-space-2);
  font-family: var(--q-font-display);
  font-size: var(--q-type-body);
  font-weight: 800;
  color: var(--q-forest);
}
.planif-modal__step-lines {
  display: grid;
  gap: var(--q-space-2);
}
.planif-modal__step-lines p {
  margin: 0;
}
.planif-modal__stepper {
  display: inline-grid;
  grid-template-columns: 40px 1fr 40px;
  align-items: center;
  min-width: 9rem;
  min-height: var(--q-touch-target);
  border: 1px solid var(--q-forest);
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
  overflow: hidden;
  font-family: var(--q-font-display);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.planif-modal__stepper button {
  display: grid;
  place-items: center;
  height: 100%;
  border: 0;
  background: transparent;
  color: var(--q-forest);
}
.planif-modal__stepper button:hover:not(:disabled) {
  background: var(--q-shoot);
}
.planif-modal__stepper span {
  text-align: center;
}
</style>
