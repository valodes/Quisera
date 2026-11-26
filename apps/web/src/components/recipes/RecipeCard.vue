<script setup lang="ts">
defineOptions({ name: 'QuiseraRecipeCard' })

import { Clock3, Flame, UtensilsCrossed } from '@lucide/vue'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import ScoreBadge from '@/components/ui/ScoreBadge.vue'

const props = withDefaults(
  defineProps<{
    title: string
    sourceLabel: string
    imageUrl?: string | null | undefined
    description?: string | null | undefined
    totalMinutes?: number | null | undefined
    caloriesKcal?: number | null | undefined
    nutriScore?: string | null | undefined
    carbonScore?: string | null | undefined
    to?: string | undefined
    active?: boolean
    horizontal?: boolean
  }>(),
  {
    imageUrl: null,
    description: null,
    totalMinutes: null,
    caloriesKcal: null,
    nutriScore: null,
    carbonScore: null,
    to: undefined,
    active: false,
    horizontal: false,
  },
)

const emit = defineEmits<{ open: [] }>()

const hasNutri = computed(() => Boolean(props.nutriScore && /^[A-E]$/i.test(props.nutriScore)))
const hasCarbon = computed(() => Boolean(props.carbonScore && /^[A-E]$/i.test(props.carbonScore)))
const hasCalories = computed(() => props.caloriesKcal != null && props.caloriesKcal > 0)
const hasMetricsBar = computed(() => hasCalories.value || hasNutri.value || hasCarbon.value)
</script>

<template>
  <article
    class="q-recipe-card"
    :class="{
      'q-recipe-card--horizontal': horizontal,
      'q-recipe-card--active': active,
    }"
  >
    <component
      :is="to ? RouterLink : 'button'"
      :to="to"
      :type="to ? undefined : 'button'"
      class="q-recipe-card__trigger"
      :aria-label="`Consulter ${title}`"
      @click="!to && emit('open')"
    >
      <div class="q-recipe-card__photo">
        <img
          v-if="imageUrl"
          :src="imageUrl"
          :alt="`Photographie de ${title}`"
          loading="lazy"
          decoding="async"
        />
        <span v-else class="q-recipe-card__photo-empty" aria-hidden="true">
          <UtensilsCrossed :size="28" />
        </span>

        <span v-if="totalMinutes != null && totalMinutes > 0" class="q-recipe-card__time-pill">
          <Clock3 :size="13" aria-hidden="true" />
          {{ totalMinutes }} min
        </span>
      </div>

      <div class="q-recipe-card__body">
        <span class="q-recipe-card__source">{{ sourceLabel }}</span>
        <h3 class="q-recipe-card__title">{{ title }}</h3>
        <p v-if="description" class="q-recipe-card__description">
          {{ description }}
        </p>

        <div v-if="hasMetricsBar" class="q-recipe-card__metrics">
          <span v-if="hasCalories" class="q-recipe-card__kcal">
            <Flame :size="14" aria-hidden="true" />
            {{ caloriesKcal }} kcal
          </span>
          <div v-if="hasNutri || hasCarbon" class="q-recipe-card__scores">
            <ScoreBadge v-if="hasNutri" kind="nutri" :grade="nutriScore" compact />
            <ScoreBadge v-if="hasCarbon" kind="eco" :grade="carbonScore" compact />
          </div>
        </div>
      </div>
    </component>

    <div v-if="$slots['overlay']" class="q-recipe-card__overlay">
      <slot name="overlay" />
    </div>

    <footer v-if="$slots['footer']" class="q-recipe-card__footer">
      <slot name="footer" />
    </footer>
  </article>
</template>

<style scoped>
.q-recipe-card {
  position: relative;
  display: grid;
  grid-template-rows: 1fr auto;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  color: var(--q-forest);
  transition:
    transform var(--q-duration-normal) var(--q-ease-standard),
    border-color var(--q-duration-fast) var(--q-ease-standard);
}
.q-recipe-card:hover {
  transform: translateY(-2px);
  border-color: var(--q-forest);
}
.q-recipe-card--active {
  border: 2px solid var(--q-forest);
  background: var(--q-shoot);
}
.q-recipe-card__trigger {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}
.q-recipe-card__trigger:focus-visible {
  outline: 3px solid var(--q-focus);
  outline-offset: -3px;
}
.q-recipe-card__photo {
  position: relative;
  display: grid;
  width: 100%;
  aspect-ratio: 4/3;
  flex: 0 0 auto;
  place-items: center;
  overflow: hidden;
  background: var(--q-sage);
}
.q-recipe-card__photo img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 280ms var(--q-ease-standard);
}
.q-recipe-card:hover .q-recipe-card__photo img {
  transform: scale(1.03);
}
.q-recipe-card__photo-empty {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  color: var(--q-leaf);
}
.q-recipe-card__time-pill {
  position: absolute;
  bottom: var(--q-space-2);
  left: var(--q-space-2);
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.6rem;
  border-radius: var(--q-radius-control);
  background: var(--q-forest);
  color: var(--q-shoot);
  font-family: var(--q-font-display);
  font-size: var(--q-type-metadata);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.q-recipe-card__overlay {
  position: absolute;
  top: var(--q-space-2);
  right: var(--q-space-2);
  left: var(--q-space-2);
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--q-space-1);
  pointer-events: none;
}
.q-recipe-card__overlay > :deep(*) {
  pointer-events: auto;
}
.q-recipe-card__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: var(--q-space-2);
  padding: var(--q-space-3) var(--q-space-4) var(--q-space-4);
  min-width: 0;
}
.q-recipe-card__source {
  width: fit-content;
  padding: 0.15rem 0.5rem;
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: var(--q-type-metadata);
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.q-recipe-card__title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  margin: 0;
  font-family: var(--q-font-display);
  font-size: var(--q-type-component);
  font-weight: 800;
  line-height: var(--q-line-heading);
  text-wrap: balance;
}
.q-recipe-card__description {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  margin: 0;
  color: var(--q-leaf);
  font-size: var(--q-type-body-small);
  line-height: var(--q-line-compact);
}
.q-recipe-card__metrics {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--q-space-2);
  margin-top: auto;
  padding-top: var(--q-space-2);
  border-top: 1px solid var(--q-leaf);
}
.q-recipe-card__scores {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
}
.q-recipe-card__kcal {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem 0.5rem;
  border-radius: var(--q-radius-control);
  background: var(--q-forest);
  color: var(--q-peach);
  font-family: var(--q-font-display);
  font-size: var(--q-type-metadata);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.q-recipe-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--q-space-2);
  padding: var(--q-space-3) var(--q-space-4);
  border-top: 1px solid var(--q-leaf);
  background: var(--q-sage);
}
.q-recipe-card--horizontal .q-recipe-card__trigger {
  display: grid;
  grid-template-rows: auto;
  grid-template-columns: minmax(10rem, 0.78fr) minmax(0, 1.22fr);
}
.q-recipe-card--horizontal .q-recipe-card__photo {
  height: 100%;
  aspect-ratio: auto;
  min-height: 12rem;
}
@media (max-width: 48rem) {
  .q-recipe-card--horizontal .q-recipe-card__trigger {
    grid-template-columns: 1fr;
  }
  .q-recipe-card--horizontal .q-recipe-card__photo {
    aspect-ratio: 4/3;
    min-height: 10rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .q-recipe-card,
  .q-recipe-card__photo img {
    transition: none;
  }
  .q-recipe-card:hover,
  .q-recipe-card:hover .q-recipe-card__photo img {
    transform: none;
  }
}
</style>
