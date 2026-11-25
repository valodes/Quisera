<script setup lang="ts">
import { computed } from 'vue'
import { Leaf } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    kind: 'nutri' | 'eco'
    grade: string | null | undefined
    compact?: boolean
  }>(),
  { compact: false },
)

const grades = ['A', 'B', 'C', 'D', 'E'] as const

const normalizedGrade = computed(() => {
  const value = props.grade?.trim().toUpperCase()
  return value && /^[A-E]$/.test(value) ? value : null
})

const label = computed(() => (props.kind === 'nutri' ? 'Nutri-Score' : 'Score carbone'))

const ariaLabel = computed(() =>
  normalizedGrade.value
    ? `${label.value} ${normalizedGrade.value}`
    : `${label.value} non disponible`,
)
</script>

<template>
  <span
    v-if="normalizedGrade"
    class="score-badge"
    :class="[
      `score-badge--${kind}`,
      `score-badge--grade-${normalizedGrade.toLowerCase()}`,
      { 'score-badge--compact': compact },
    ]"
    :aria-label="ariaLabel"
    :title="ariaLabel"
  >
    <span class="score-badge__prefix">
      <Leaf v-if="kind === 'eco'" :size="11" aria-hidden="true" />
      <span>{{ kind === 'nutri' ? 'NUTRI' : 'CARBONE' }}</span>
    </span>
    <span class="score-badge__scale" aria-hidden="true">
      <span
        v-for="letter in grades"
        :key="letter"
        class="score-badge__cell"
        :class="[
          `score-badge__cell--${kind}-${letter.toLowerCase()}`,
          { 'is-active': letter === normalizedGrade },
        ]"
        >{{ letter }}</span
      >
    </span>
  </span>
  <span
    v-else
    class="score-badge score-badge--unavailable"
    :aria-label="ariaLabel"
    :title="ariaLabel"
  >
    <Leaf v-if="kind === 'eco'" :size="12" aria-hidden="true" />
    <span>{{ label }} n/d</span>
  </span>
</template>

<style scoped lang="scss">
@use 'sass:list';

$score-palettes: (
  'nutri-a': (
    #038141,
    #f7faf7,
  ),
  'nutri-b': (
    #85bb2f,
    #173d2c,
  ),
  'nutri-c': (
    #fecb02,
    #173d2c,
  ),
  'nutri-d': (
    #ee8100,
    #173d2c,
  ),
  'nutri-e': (
    #e63e11,
    #fff6f2,
  ),
  'eco-a': (
    #1e8f4e,
    #f7faf7,
  ),
  'eco-b': (
    #2ecc71,
    #173d2c,
  ),
  'eco-c': (
    #f5c518,
    #173d2c,
  ),
  'eco-d': (
    #ef7d1a,
    #173d2c,
  ),
  'eco-e': (
    #e63e11,
    #fff6f2,
  ),
);

.score-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 2px 5px 2px 6px;
  border-radius: 5px;
  background: var(--q-sage);
  border: 1px solid var(--q-leaf);
  line-height: 1;
  vertical-align: middle;

  &--unavailable {
    padding: 0.2rem 0.45rem;
    font-size: var(--q-type-metadata);
    font-weight: 600;
    color: var(--q-leaf);
    border-color: transparent;
  }

  &__prefix {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-family: var(--q-font-display);
    font-size: 0.6rem;
    font-weight: 850;
    letter-spacing: 0.04em;
    color: var(--q-forest);
  }

  &__scale {
    display: inline-flex;
    align-items: center;
    border-radius: 3px;
    overflow: visible;
  }

  &__cell {
    display: inline-grid;
    place-items: center;
    width: 14px;
    height: 16px;
    font-family: var(--q-font-display);
    font-size: 0.62rem;
    font-weight: 800;
    opacity: 0.55;
    transition: transform 120ms ease;

    &:first-child {
      border-radius: 3px 0 0 3px;
    }

    &:last-child {
      border-radius: 0 3px 3px 0;
    }

    &.is-active {
      position: relative;
      z-index: 1;
      width: 19px;
      height: 20px;
      margin-block: -2px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 900;
      opacity: 1;
      box-shadow: 0 0 0 1.5px var(--q-peach);
    }

    @each $grade, $colors in $score-palettes {
      &--#{$grade} {
        background: list.nth($colors, 1);
        color: list.nth($colors, 2);
      }
    }
  }

  &--compact {
    .score-badge__cell {
      width: 12px;
      height: 15px;
      font-size: 0.58rem;

      &.is-active {
        width: 17px;
        height: 19px;
        font-size: 0.72rem;
      }
    }
  }
}
</style>
