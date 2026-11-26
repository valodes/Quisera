<script setup lang="ts">
defineOptions({ name: 'PlanningMealModal' })

import { ChefHat, Clock3, Pencil, Star } from '@lucide/vue'
import type { PlanningRange, RecipeNutrition } from '@quisera/shared'
import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import NutritionPanel from '@/components/recipes/NutritionPanel.vue'
import Button from '@/components/ui/Button.vue'
import ModalDialog from '@/components/ui/ModalDialog.vue'
import ScoreBadge from '@/components/ui/ScoreBadge.vue'
import { queryKeys } from '@/lib/query'
import { getRecipe } from '@/recipes/api'
import { parseStructuredStep } from '@/recipes/instructions'

type SlotMeal = NonNullable<PlanningRange['days'][number]['lunch']['meal']>

export type PlanningModalSelection = {
  description: string | null
  servings: number | null
  nutrition: RecipeNutrition | null
  ingredients: Array<{
    name: string
    quantity: string | null
    unit: string | null
    notes: string | null
  }>
  steps: string[]
}

export type PlanningModalMetrics = {
  sourceLabel: string
  description: string | null
  totalMinutes: number | null
  caloriesKcal: number | null
  nutriScore: string | null
  carbonScore: string | null
} | null

const props = defineProps<{
  date: string
  period: 'lunch' | 'dinner'
  dateLabel: string
  cycleId: string | null
  meal: SlotMeal
  metrics: PlanningModalMetrics
  selection?: PlanningModalSelection | undefined
}>()

const emit = defineEmits<{
  close: []
  clear: [date: string, period: 'lunch' | 'dinner']
}>()

const open = computed({
  get: () => true,
  set: (val) => {
    if (!val) emit('close')
  },
})

const structuredSteps = computed(() =>
  (props.selection?.steps ?? []).map((step, index) => parseStructuredStep(step, index + 1)),
)

const homeRecipeId = computed(() =>
  props.meal.category === 'home' && props.meal.recipeId ? props.meal.recipeId : '',
)

const {
  data: homeRecipe,
  isPending: homeRecipeLoading,
  error: homeRecipeError,
} = useQuery({
  queryKey: computed(() => queryKeys.recipeDetail(homeRecipeId.value)),
  queryFn: () => getRecipe(homeRecipeId.value),
  enabled: computed(() => homeRecipeId.value.length > 0),
})

const homeStructuredSteps = computed(() =>
  (homeRecipe.value?.steps ?? []).map((step, index) =>
    parseStructuredStep(step.instructions, index + 1),
  ),
)

function difficultyLabel(value: string | null | undefined) {
  if (value === 'easy') return 'Facile'
  if (value === 'medium') return 'Moyenne'
  if (value === 'hard') return 'Difficile'
  return null
}
</script>

<template>
  <ModalDialog
    v-model:open="open"
    :title="meal.title"
    :badge="`${dateLabel} · ${period === 'lunch' ? 'Déjeuner' : 'Dîner'}`"
    close-label="Fermer la recette"
  >
    <div class="planning-modal-content">
      <div v-if="meal.imageUrl || meal.thumbnailUrl" class="planning-modal__media">
        <img
          :src="meal.imageUrl || meal.thumbnailUrl || ''"
          :alt="`Photographie de ${meal.title}`"
        />
      </div>

      <div class="planning-modal__badges">
        <span
          class="planning-modal__category"
          :class="`planning-modal__category--${meal.category}`"
          >{{
            meal.category === 'quitoque'
              ? 'Quitoque'
              : meal.category === 'home'
                ? 'Maison'
                : 'Restaurant'
          }}</span
        >
        <span class="planning-modal__origin">{{
          meal.origin === 'automatic' ? 'Répartition' : 'Choisi'
        }}</span>
        <template v-if="metrics">
          <span v-if="metrics.totalMinutes" class="planning-modal__metric">
            <Clock3 :size="13" aria-hidden="true" />
            {{ metrics.totalMinutes }} min
          </span>
          <ScoreBadge v-if="metrics.nutriScore" kind="nutri" :grade="metrics.nutriScore" />
          <ScoreBadge v-if="metrics.carbonScore" kind="eco" :grade="metrics.carbonScore" />
        </template>
      </div>

      <p v-if="meal.notes" class="planning-modal__notes">{{ meal.notes }}</p>

      <template v-if="meal.category === 'quitoque'">
        <div v-if="cycleId && meal.selectionId" class="planning-modal__sheet-actions">
          <RouterLink
            class="planning-modal__sheet-btn planning-modal__sheet-btn--primary"
            :to="{ name: 'cooking', query: { cycle: cycleId, selection: meal.selectionId } }"
            @click="emit('close')"
          >
            <ChefHat :size="15" aria-hidden="true" />
            Mode cuisine
          </RouterLink>
        </div>
        <p v-if="selection?.description" class="planning-modal__description">
          {{ selection.description }}
        </p>
        <NutritionPanel
          :servings="selection?.servings ?? null"
          :nutrition="selection?.nutrition ?? null"
        />
        <section class="planning-modal__section">
          <h3>Ingrédients</h3>
          <ul v-if="selection?.ingredients.length" class="planning-modal__ingredients">
            <li
              v-for="(ingredient, index) in selection.ingredients"
              :key="`${index}-${ingredient.name}`"
            >
              <strong>{{ ingredient.name }}</strong>
              <span v-if="ingredient.quantity">
                · {{ ingredient.quantity }} {{ ingredient.unit }}</span
              >
              <span v-if="ingredient.notes"> · {{ ingredient.notes }}</span>
            </li>
          </ul>
          <p v-else>Ingrédients non disponibles.</p>
        </section>
        <section class="planning-modal__section">
          <h3>Préparation</h3>
          <ol v-if="structuredSteps.length" class="planning-modal__steps">
            <li
              v-for="(step, index) in structuredSteps"
              :key="`step-${index}`"
              class="planning-modal__step"
            >
              <strong v-if="step.title" class="planning-modal__step-title">
                {{ step.title }}
              </strong>
              <div class="planning-modal__step-lines">
                <p v-for="(line, lineIdx) in step.lines" :key="`line-${index}-${lineIdx}`">
                  {{ line }}
                </p>
              </div>
            </li>
          </ol>
          <p v-else>Étapes non disponibles.</p>
        </section>
      </template>

      <section
        v-else-if="meal.category === 'home' && meal.recipeId"
        class="planning-modal__recipe-sheet"
      >
        <p v-if="homeRecipeLoading" class="planning-modal__sheet-status" role="status">
          Chargement de la recette…
        </p>
        <p v-else-if="homeRecipeError" class="planning-modal__sheet-status" role="alert">
          Erreur : Impossible de charger le détail de cette recette.
        </p>
        <template v-else-if="homeRecipe">
          <div class="planning-modal__sheet-toolbar">
            <div class="planning-modal__sheet-facts">
              <span
                v-if="difficultyLabel(homeRecipe.difficulty)"
                class="planning-modal__sheet-fact"
              >
                <Star :size="13" aria-hidden="true" />
                {{ difficultyLabel(homeRecipe.difficulty) }}
              </span>
              <span v-if="homeRecipe.category" class="planning-modal__sheet-fact">
                {{ homeRecipe.category }}
              </span>
              <span v-for="tag in homeRecipe.tags" :key="tag" class="planning-modal__sheet-fact">
                {{ tag }}
              </span>
            </div>
            <div class="planning-modal__sheet-actions">
              <RouterLink
                class="planning-modal__sheet-btn planning-modal__sheet-btn--primary"
                :to="{ name: 'cooking', query: { recipe: homeRecipe.id } }"
                @click="emit('close')"
              >
                <ChefHat :size="15" aria-hidden="true" />
                Mode cuisine
              </RouterLink>
              <RouterLink
                class="planning-modal__sheet-btn"
                :to="`/recettes/${homeRecipe.id}/modifier`"
                @click="emit('close')"
              >
                <Pencil :size="14" aria-hidden="true" />
                Modifier
              </RouterLink>
            </div>
          </div>

          <p v-if="homeRecipe.description" class="planning-modal__sheet-desc">
            {{ homeRecipe.description }}
          </p>

          <NutritionPanel :servings="homeRecipe.servings" :nutrition="homeRecipe.nutrition" />

          <div class="planning-modal__sheet-cols">
            <div class="planning-modal__sheet-col">
              <h3>Ingrédients</h3>
              <ul v-if="homeRecipe.ingredients.length" class="planning-modal__sheet-ing-list">
                <li v-for="(item, idx) in homeRecipe.ingredients" :key="`${idx}-${item.name}`">
                  <strong v-if="item.quantity"
                    >{{ item.quantity }}<span v-if="item.unit"> {{ item.unit }}</span>
                  </strong>
                  {{ item.name }}<span v-if="item.notes"> — {{ item.notes }}</span>
                </li>
              </ul>
              <p v-else class="planning-modal__sheet-desc">Ingrédients non disponibles.</p>
            </div>

            <div class="planning-modal__sheet-col">
              <h3>Préparation</h3>
              <ol v-if="homeStructuredSteps.length" class="planning-modal__sheet-steps">
                <li v-for="(step, idx) in homeStructuredSteps" :key="`hstep-${idx}`">
                  <strong v-if="step.title" class="planning-modal__sheet-step-title">
                    {{ step.title }}
                  </strong>
                  <div class="planning-modal__sheet-step-lines">
                    <p v-for="(line, lIdx) in step.lines" :key="`hline-${idx}-${lIdx}`">
                      {{ line }}
                    </p>
                  </div>
                </li>
              </ol>
              <p v-else class="planning-modal__sheet-desc">Étapes non disponibles.</p>
            </div>
          </div>
        </template>
      </section>
    </div>

    <template #footer>
      <Button variant="secondary" @click="emit('clear', date, period)">Retirer du planning</Button>
      <Button @click="emit('close')">Fermer</Button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.planning-modal-content {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-4);
}
.planning-modal__media {
  height: 240px;
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.planning-modal__media img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.planning-modal__badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--q-space-2);
}
.planning-modal__category,
.planning-modal__metric {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.22rem 0.55rem;
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.planning-modal__category--home {
  background: var(--q-shoot);
}
.planning-modal__category--restaurant {
  background: var(--q-coral);
}
.planning-modal__origin {
  font-size: var(--q-type-metadata);
  font-weight: 600;
  color: var(--q-leaf);
}
.planning-modal__description,
.planning-modal__notes {
  margin: 0;
  line-height: var(--q-line-body);
}
.planning-modal__section {
  display: grid;
  gap: var(--q-space-2);
}
.planning-modal__section h3 {
  margin: 0;
  font-family: var(--q-font-display);
  font-size: var(--q-type-h4);
  font-weight: 750;
  color: var(--q-forest);
}
.planning-modal__ingredients {
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
.planning-modal__steps {
  margin: 0;
  padding-left: 1.35rem;
  display: grid;
  gap: var(--q-space-4);
  line-height: var(--q-line-body);
}
.planning-modal__step-title {
  display: block;
  margin-bottom: var(--q-space-2);
  font-family: var(--q-font-display);
  font-size: var(--q-type-body);
  font-weight: 800;
  color: var(--q-forest);
}
.planning-modal__step-lines {
  display: grid;
  gap: var(--q-space-2);
}
.planning-modal__step-lines p {
  margin: 0;
}
.planning-modal__recipe-sheet {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-4);
}
.planning-modal__sheet-status {
  margin: 0;
  padding: var(--q-space-3);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  color: var(--q-forest);
  font-size: var(--q-type-label);
  font-weight: 600;
}
.planning-modal__sheet-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--q-space-2);
}
.planning-modal__sheet-facts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--q-space-2);
}
.planning-modal__sheet-fact {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.22rem 0.6rem;
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 700;
}
.planning-modal__sheet-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--q-space-2);
}
.planning-modal__sheet-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--q-space-2);
  min-height: 2.35rem;
  padding: 0 var(--q-space-3);
  border-radius: var(--q-radius-control);
  border: 1px solid var(--q-leaf);
  background: var(--q-sage);
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: var(--q-type-label);
  font-weight: 700;
  text-decoration: none;
}
.planning-modal__sheet-btn--primary {
  border-color: transparent;
  background: var(--q-forest);
  color: var(--q-peach);
}
.planning-modal__sheet-btn--primary:hover {
  background: var(--q-leaf);
}
.planning-modal__sheet-btn:not(.planning-modal__sheet-btn--primary):hover {
  background: var(--q-shoot);
}
.planning-modal__sheet-desc {
  margin: 0;
  color: var(--q-forest);
  line-height: var(--q-line-body);
}
.planning-modal__sheet-cols {
  display: grid;
  grid-template-columns: minmax(13.5rem, 0.85fr) minmax(0, 1.35fr);
  gap: var(--q-space-4);
  align-items: start;
}
@media (max-width: 42rem) {
  .planning-modal__sheet-cols {
    grid-template-columns: 1fr;
  }
}
.planning-modal__sheet-col {
  display: grid;
  gap: var(--q-space-2);
  min-width: 0;
}
.planning-modal__sheet-col h3 {
  margin: 0;
  font-family: var(--q-font-display);
  font-size: var(--q-type-h4);
  font-weight: 750;
  color: var(--q-forest);
}
.planning-modal__sheet-ing-list {
  margin: 0;
  padding: var(--q-space-3);
  list-style: none;
  display: grid;
  gap: var(--q-space-2);
  background: var(--q-sage);
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  font-size: var(--q-type-label);
}
.planning-modal__sheet-steps {
  margin: 0;
  padding-left: 1.35rem;
  display: grid;
  gap: var(--q-space-3);
  line-height: var(--q-line-body);
}
.planning-modal__sheet-step-title {
  display: block;
  margin-bottom: var(--q-space-1);
  font-family: var(--q-font-display);
  font-size: var(--q-type-body);
  font-weight: 800;
  color: var(--q-forest);
}
.planning-modal__sheet-step-lines {
  display: grid;
  gap: var(--q-space-2);
}
.planning-modal__sheet-step-lines p {
  margin: 0;
}
</style>
