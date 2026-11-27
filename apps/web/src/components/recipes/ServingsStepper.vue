<script setup lang="ts">
import { Minus, Plus, RotateCcw, Users } from '@lucide/vue'

defineProps<{
  servings: number
  sourceServings?: number | null | undefined
  canScale: boolean
  isScaled: boolean
}>()

const emit = defineEmits<{
  increment: []
  decrement: []
  reset: []
}>()
</script>

<template>
  <div class="servings-stepper" role="group" aria-label="Adapter le nombre de portions">
    <Users :size="15" aria-hidden="true" class="servings-stepper__icon" />
    <template v-if="canScale">
      <button
        type="button"
        class="servings-stepper__btn"
        :disabled="servings <= 1"
        aria-label="Retirer une portion"
        @click="emit('decrement')"
      >
        <Minus :size="13" aria-hidden="true" />
      </button>
      <span class="servings-stepper__value">
        {{ servings }} {{ servings > 1 ? 'pers.' : 'pers.' }}
      </span>
      <button
        type="button"
        class="servings-stepper__btn"
        :disabled="servings >= 24"
        aria-label="Ajouter une portion"
        @click="emit('increment')"
      >
        <Plus :size="13" aria-hidden="true" />
      </button>
      <button
        v-if="isScaled && sourceServings"
        type="button"
        class="servings-stepper__reset"
        :title="`Revenir à la recette d'origine (${sourceServings} pers.)`"
        @click="emit('reset')"
      >
        <RotateCcw :size="12" aria-hidden="true" />
        <span>{{ sourceServings }}</span>
      </button>
    </template>
    <span v-else class="servings-stepper__value">{{ servings }} pers.</span>
  </div>
</template>

<style scoped>
.servings-stepper {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.55rem;
  border-radius: var(--q-radius-pill);
  background: var(--q-sage);
  border: 1px solid var(--q-leaf);
  color: var(--q-forest);
  font-size: var(--q-type-body-small);
  font-weight: 700;
}

.servings-stepper__icon {
  color: var(--q-forest);
  flex-shrink: 0;
}

.servings-stepper__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: var(--q-radius-pill);
  border: 1px solid var(--q-leaf);
  background: var(--q-peach);
  color: var(--q-forest);
  cursor: pointer;
}

.servings-stepper__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.servings-stepper__value {
  min-width: 3.4rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.servings-stepper__reset {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.15rem 0.45rem;
  border-radius: var(--q-radius-pill);
  border: 1px solid var(--q-terracotta);
  background: var(--q-peach);
  color: var(--q-terracotta);
  font-size: var(--q-type-metadata);
  font-weight: 700;
  cursor: pointer;
}
</style>
