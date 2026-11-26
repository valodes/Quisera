<script setup lang="ts">
defineOptions({ name: 'QuiseraRecipeDraftContent' })

import { Clock, Flame } from '@lucide/vue'
import NutritionPanel from '@/components/recipes/NutritionPanel.vue'
import type { ImportedRecipeDraft } from '@/recipes/api'

defineProps<{
  draft: ImportedRecipeDraft
}>()
</script>

<template>
  <div class="draft-content">
    <div v-if="draft.imageUrl" class="draft-content__photo">
      <img :src="draft.imageUrl" :alt="draft.title" decoding="async" />
    </div>

    <p v-if="draft.description" class="draft-content__desc">{{ draft.description }}</p>

    <div class="draft-content__facts">
      <span v-if="draft.totalMinutes">
        <Clock :size="15" aria-hidden="true" />
        {{ draft.totalMinutes }} min
      </span>
      <span v-if="draft.caloriesKcal">
        <Flame :size="15" aria-hidden="true" />
        {{ draft.caloriesKcal }} kcal / portion
      </span>
      <span>{{ draft.ingredients.length }} ingrédient(s)</span>
      <span>{{ draft.steps.length }} étape(s)</span>
    </div>

    <NutritionPanel :servings="draft.servings" :nutrition="draft.nutrition" />

    <div class="draft-content__columns">
      <section>
        <h4>Ingrédients</h4>
        <ul>
          <li v-for="(ing, idx) in draft.ingredients" :key="`${ing.name}-${idx}`">
            <strong v-if="ing.quantity"
              >{{ ing.quantity }}<span v-if="ing.unit"> {{ ing.unit }}</span></strong
            >
            {{ ing.name }}
            <em v-if="ing.notes"> ({{ ing.notes }})</em>
          </li>
        </ul>
      </section>
      <section>
        <h4>Préparation</h4>
        <ol>
          <li v-for="(step, idx) in draft.steps" :key="`${idx}-${step.slice(0, 24)}`">
            {{ step }}
          </li>
        </ol>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.draft-content {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-4);
  color: var(--q-forest);

  &__photo {
    flex: none;
    width: 100%;
    height: 18rem;
    overflow: hidden;
    border-radius: var(--q-radius-card);
    background: var(--q-sage);

    @media (max-width: 40rem) {
      height: 13rem;
    }

    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  &__desc {
    margin: 0;
    max-width: 68ch;
    line-height: var(--q-line-body);
  }

  &__facts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--q-space-2) var(--q-space-4);
    padding-block: var(--q-space-3);
    border-block: 1px solid var(--q-leaf);
    font-size: var(--q-type-body-small);
    font-weight: 700;

    span {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
    }
  }

  &__columns {
    display: grid;
    grid-template-columns: minmax(14rem, 0.85fr) minmax(0, 1.15fr);
    gap: var(--q-space-6);
    align-items: start;

    @media (max-width: 48rem) {
      grid-template-columns: 1fr;
    }

    h4 {
      margin: 0 0 var(--q-space-3);
      font-family: var(--q-font-display);
      font-size: var(--q-type-h4);
      font-weight: 800;
    }

    ul,
    ol {
      display: grid;
      gap: var(--q-space-2);
      margin: 0;
      padding-left: 1.35rem;
      line-height: var(--q-line-body);
    }

    li::marker {
      color: var(--q-leaf);
      font-weight: 700;
    }
  }
}
</style>
