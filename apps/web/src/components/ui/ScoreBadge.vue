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
      <Leaf v-if="kind === 'eco' && !compact" :size="11" aria-hidden="true" />
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
    <Leaf v-if="kind === 'eco' && !compact" :size="12" aria-hidden="true" />
    <span>{{ label }} n/d</span>
  </span>
</template>

<style scoped>
.score-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 2px 5px 2px 6px;
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  border: 1px solid var(--q-leaf);
  line-height: 1;
  vertical-align: middle;
}
.score-badge--unavailable {
  padding: 0.2rem 0.45rem;
  font-size: var(--q-type-metadata);
  font-weight: 600;
  color: var(--q-leaf);
  border-color: transparent;
}
.score-badge__prefix {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-family: var(--q-font-display);
  font-size: 0.6rem;
  font-weight: 850;
  letter-spacing: 0.04em;
  color: var(--q-forest);
}
.score-badge__scale {
  display: inline-flex;
  align-items: center;
  border-radius: var(--q-radius-control);
  overflow: visible;
}
.score-badge__cell {
  display: inline-grid;
  place-items: center;
  width: 14px;
  height: 16px;
  font-family: var(--q-font-display);
  font-size: 0.62rem;
  font-weight: 800;
  opacity: 0.55;
  transition: transform 120ms ease;
}
.score-badge__cell:first-child {
  border-radius: var(--q-radius-control) 0 0 var(--q-radius-control);
}
.score-badge__cell:last-child {
  border-radius: 0 var(--q-radius-control) var(--q-radius-control) 0;
}
.score-badge__cell.is-active {
  position: relative;
  z-index: 1;
  width: 19px;
  height: 20px;
  margin-block: -2px;
  border-radius: var(--q-radius-control);
  font-size: 0.75rem;
  font-weight: 900;
  opacity: 1;
  box-shadow: 0 0 0 1.5px var(--q-peach);
}
.score-badge__cell--nutri-a {
  background: #038141;
  color: #f7faf7;
}
.score-badge__cell--nutri-b {
  background: #85bb2f;
  color: #173d2c;
}
.score-badge__cell--nutri-c {
  background: #fecb02;
  color: #173d2c;
}
.score-badge__cell--nutri-d {
  background: #ee8100;
  color: #173d2c;
}
.score-badge__cell--nutri-e {
  background: #e63e11;
  color: #fff6f2;
}
.score-badge__cell--eco-a {
  background: #1e8f4e;
  color: #f7faf7;
}
.score-badge__cell--eco-b {
  background: #2ecc71;
  color: #173d2c;
}
.score-badge__cell--eco-c {
  background: #f5c518;
  color: #173d2c;
}
.score-badge__cell--eco-d {
  background: #ef7d1a;
  color: #173d2c;
}
.score-badge__cell--eco-e {
  background: #e63e11;
  color: #fff6f2;
}
.score-badge--compact {
  gap: 0.25rem;
  padding: 2px 4px 2px 5px;
}
.score-badge--compact .score-badge__cell {
  width: 11px;
  height: 15px;
  font-size: 0.58rem;
}
.score-badge--compact .score-badge__cell.is-active {
  width: 16px;
  height: 19px;
  font-size: 0.72rem;
}
</style>
