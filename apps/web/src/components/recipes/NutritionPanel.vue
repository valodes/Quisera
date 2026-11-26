<script setup lang="ts">
defineOptions({ name: 'QuiseraNutritionPanel' })

import { Flame, Users } from '@lucide/vue'
import type { RecipeNutrition } from '@quisera/shared'
import { computed } from 'vue'

const props = defineProps<{
  servings?: number | null | undefined
  nutrition?: RecipeNutrition | null | undefined
}>()

type MacroItem = {
  key: string
  label: string
  grams: number
  tone: 'protein' | 'carbs' | 'fat' | 'fiber' | 'sugar' | 'salt'
}

const macroItems = computed<MacroItem[]>(() => {
  const n = props.nutrition
  if (!n) return []
  const items: MacroItem[] = []
  if (n.proteinGrams !== null) {
    items.push({ key: 'protein', label: 'Protéines', grams: n.proteinGrams, tone: 'protein' })
  }
  if (n.carbsGrams !== null) {
    items.push({ key: 'carbs', label: 'Glucides', grams: n.carbsGrams, tone: 'carbs' })
  }
  if (n.fatGrams !== null) {
    items.push({ key: 'fat', label: 'Lipides', grams: n.fatGrams, tone: 'fat' })
  }
  if (n.fiberGrams !== null) {
    items.push({ key: 'fiber', label: 'Fibres', grams: n.fiberGrams, tone: 'fiber' })
  }
  if (n.sugarGrams !== null) {
    items.push({ key: 'sugar', label: 'Sucres', grams: n.sugarGrams, tone: 'sugar' })
  }
  if (n.saltGrams !== null) {
    items.push({ key: 'salt', label: 'Sel', grams: n.saltGrams, tone: 'salt' })
  }
  return items
})

const coreMacroTotal = computed(() => {
  const n = props.nutrition
  if (!n) return 0
  return (n.proteinGrams ?? 0) + (n.carbsGrams ?? 0) + (n.fatGrams ?? 0)
})

const hasAnyData = computed(
  () =>
    props.servings != null || props.nutrition?.caloriesKcal != null || macroItems.value.length > 0,
)
</script>

<template>
  <section
    v-if="hasAnyData"
    class="nutrition-panel"
    aria-label="Portions et valeurs nutritionnelles"
  >
    <div class="nutrition-panel__head">
      <div class="nutrition-panel__badges">
        <span v-if="servings" class="nutrition-pill nutrition-pill--servings">
          <Users :size="15" aria-hidden="true" />
          Pour {{ servings }} {{ servings > 1 ? 'personnes' : 'personne' }}
        </span>
        <span v-if="nutrition?.caloriesKcal != null" class="nutrition-pill nutrition-pill--kcal">
          <Flame :size="15" aria-hidden="true" />
          {{ nutrition.caloriesKcal }} kcal / portion
        </span>
      </div>
    </div>

    <template v-if="macroItems.length">
      <div
        v-if="coreMacroTotal > 0"
        class="nutrition-bar"
        role="img"
        aria-label="Répartition visuelle protéines, glucides et lipides"
      >
        <span
          v-if="nutrition?.proteinGrams"
          class="nutrition-bar__seg nutrition-bar__seg--protein"
          :style="{ width: `${(nutrition.proteinGrams / coreMacroTotal) * 100}%` }"
        />
        <span
          v-if="nutrition?.carbsGrams"
          class="nutrition-bar__seg nutrition-bar__seg--carbs"
          :style="{ width: `${(nutrition.carbsGrams / coreMacroTotal) * 100}%` }"
        />
        <span
          v-if="nutrition?.fatGrams"
          class="nutrition-bar__seg nutrition-bar__seg--fat"
          :style="{ width: `${(nutrition.fatGrams / coreMacroTotal) * 100}%` }"
        />
      </div>

      <dl class="nutrition-grid">
        <div
          v-for="item in macroItems"
          :key="item.key"
          class="nutrition-cell"
          :class="`nutrition-cell--${item.tone}`"
        >
          <dt>{{ item.label }}</dt>
          <dd>{{ item.grams }} g</dd>
        </div>
      </dl>
    </template>
  </section>
</template>

<style scoped>
.nutrition-panel {
  display: grid;
  gap: var(--q-space-3);
  padding: var(--q-space-4);
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-card);
  background: var(--q-sage);
  color: var(--q-forest);
}
.nutrition-panel__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--q-space-2);
}
.nutrition-panel__badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--q-space-2);
}

.nutrition-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.7rem;
  border-radius: var(--q-radius-control);
  font-family: var(--q-font-display);
  font-size: var(--q-type-label);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.nutrition-pill--servings {
  border: 1px solid var(--q-forest);
  background: var(--q-peach);
  color: var(--q-forest);
}
.nutrition-pill--kcal {
  background: var(--q-forest);
  color: var(--q-shoot);
}

.nutrition-bar {
  display: flex;
  height: 10px;
  overflow: hidden;
  border: 1px solid var(--q-forest);
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
}
.nutrition-bar__seg {
  height: 100%;
}
.nutrition-bar__seg--protein {
  background: var(--q-forest);
}
.nutrition-bar__seg--carbs {
  background: var(--q-leaf);
}
.nutrition-bar__seg--fat {
  background: var(--q-coral);
}

.nutrition-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));
  gap: var(--q-space-2);
  margin: 0;
}

.nutrition-cell {
  display: grid;
  gap: 0.15rem;
  padding: var(--q-space-2) var(--q-space-3);
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
}
.nutrition-cell dt {
  font-size: var(--q-type-metadata);
  font-weight: 700;
  color: var(--q-leaf);
}
.nutrition-cell dd {
  margin: 0;
  font-family: var(--q-font-display);
  font-size: var(--q-type-body);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--q-forest);
}
.nutrition-cell--protein {
  border-color: var(--q-forest);
}
.nutrition-cell--fat {
  background: var(--q-peach);
}
</style>
