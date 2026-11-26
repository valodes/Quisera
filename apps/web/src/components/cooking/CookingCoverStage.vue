<script setup lang="ts">
defineOptions({ name: 'CookingCoverStage' })

import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChefHat, Play, Timer } from '@lucide/vue'
import { ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import type { DetectedStepTimer } from '@/cooking/stepTimerParser'
import type { StructuredStep } from '@/recipes/instructions'

const props = defineProps<{
  recipe: {
    readonly title: string
    readonly totalMinutes: number | null
    readonly ingredients: ReadonlyArray<{
      readonly name: string
      readonly quantity: string | null
      readonly unit: string | null
    }>
    readonly steps: readonly string[]
  }
  phase: 'overview' | 'steps'
  currentStep: number
  totalSteps: number
  finished: boolean
  checkedCount: number
  currentStepStructured: StructuredStep
  currentStepTimers: readonly DetectedStepTimer[]
  isIngredientChecked: (index: number) => boolean
}>()

const emit = defineEmits<{
  start: []
  previousStep: []
  nextStep: []
  goToStep: [step: number]
  toggleIngredient: [index: number]
  launchTimer: [label: string, minutes: number]
}>()

const coverShowIngredients = ref(false)
watch(
  () => props.phase,
  () => {
    coverShowIngredients.value = false
  },
)

let touchStartX: number | null = null
function handleTouchStart(event: TouchEvent) {
  touchStartX = event.changedTouches[0]?.clientX ?? null
}
function handleTouchEnd(event: TouchEvent) {
  if (touchStartX === null) return
  const endX = event.changedTouches[0]?.clientX
  if (endX === undefined) return
  const deltaX = endX - touchStartX
  touchStartX = null
  if (Math.abs(deltaX) < 48) return
  if (deltaX < 0) emit('nextStep')
  else emit('previousStep')
}
</script>

<template>
  <div class="cover-stage">
    <header class="cover-header">
      <span class="cover-header__step">
        <ChefHat :size="14" aria-hidden="true" />
        {{ phase === 'overview' ? 'Cuisine' : `${currentStep + 1} / ${totalSteps}` }}
      </span>
      <div class="cover-header__actions">
        <button
          v-if="phase === 'steps'"
          type="button"
          class="cover-toggle-btn"
          :aria-pressed="coverShowIngredients"
          @click="coverShowIngredients = !coverShowIngredients"
        >
          {{
            coverShowIngredients
              ? 'Étape'
              : `Ingrédients (${checkedCount}/${recipe.ingredients.length})`
          }}
        </button>
      </div>
    </header>

    <div v-if="phase === 'overview'" class="cover-overview">
      <h2 class="cover-overview__title">{{ recipe.title }}</h2>
      <div class="cover-overview__meta">
        <span v-if="recipe.totalMinutes">{{ recipe.totalMinutes }} min</span>
        <span>{{ recipe.ingredients.length }} ingr.</span>
        <span>{{ totalSteps }} étapes</span>
      </div>
      <Button
        type="button"
        class="cover-start-btn"
        :disabled="totalSteps === 0"
        @click="emit('start')"
      >
        <Play :size="18" aria-hidden="true" />
        Commencer
      </Button>
    </div>

    <template v-else>
      <div
        v-if="coverShowIngredients"
        class="cover-scroll"
        aria-label="Ingrédients sur écran externe"
      >
        <ul class="cooking-ingredients">
          <li
            v-for="(item, index) in recipe.ingredients"
            :key="`cover-${item.name}-${index}`"
            class="cooking-ingredient"
            :class="{ 'is-checked': isIngredientChecked(index) }"
          >
            <button
              type="button"
              class="cooking-ingredient__btn"
              :aria-pressed="isIngredientChecked(index)"
              @click="emit('toggleIngredient', index)"
            >
              <span class="cooking-ingredient__check" aria-hidden="true">
                <Check v-if="isIngredientChecked(index)" :size="14" />
              </span>
              <span class="cooking-ingredient__text">
                <strong v-if="item.quantity"
                  >{{ item.quantity }}<span v-if="item.unit"> {{ item.unit }}</span></strong
                >
                {{ item.name }}
              </span>
            </button>
          </li>
        </ul>
      </div>

      <div
        v-else
        class="cover-scroll"
        @touchstart.passive="handleTouchStart"
        @touchend.passive="handleTouchEnd"
      >
        <template v-if="finished">
          <div class="cover-done">
            <CheckCircle2 :size="32" aria-hidden="true" />
            <strong>Bon appétit !</strong>
            <Button type="button" variant="secondary" @click="emit('goToStep', 0)">Étape 1</Button>
          </div>
        </template>
        <template v-else>
          <h3 v-if="currentStepStructured.title" class="cover-step-title">
            {{ currentStepStructured.title }}
          </h3>
          <div class="cover-step-lines">
            <p
              v-for="(line, lineIdx) in currentStepStructured.lines"
              :key="`cover-line-${currentStep}-${lineIdx}`"
            >
              {{ line }}
            </p>
          </div>
          <div v-if="currentStepTimers.length" class="cover-timers">
            <button
              v-for="detected in currentStepTimers"
              :key="`cover-timer-${detected.minutes}-${detected.label}`"
              type="button"
              class="cover-timer-btn"
              @click="emit('launchTimer', detected.label, detected.minutes)"
            >
              <Timer :size="15" aria-hidden="true" />
              {{ detected.shortDurationLabel }}
            </button>
          </div>
        </template>
      </div>

      <footer class="cover-footer">
        <button
          type="button"
          class="cover-nav-btn"
          aria-label="Étape précédente"
          :disabled="currentStep === 0 && !finished"
          @click="emit('previousStep')"
        >
          <ArrowLeft :size="20" aria-hidden="true" />
        </button>

        <div class="cover-step-dots" role="group" aria-label="Saut direct d’étape">
          <button
            v-for="(_, idx) in recipe.steps"
            :key="`cover-pill-${idx}`"
            type="button"
            class="cover-step-pill"
            :class="{
              'is-current': !finished && idx === currentStep,
              'is-done': finished || idx < currentStep,
            }"
            :aria-label="`Aller à l’étape ${idx + 1} sur ${totalSteps}`"
            @click="emit('goToStep', idx)"
          >
            {{ idx + 1 }}
          </button>
        </div>

        <button
          type="button"
          class="cover-nav-btn cover-nav-btn--primary"
          :aria-label="currentStep === totalSteps - 1 ? 'Terminer' : 'Étape suivante'"
          @click="emit('nextStep')"
        >
          <Check v-if="currentStep === totalSteps - 1" :size="20" aria-hidden="true" />
          <ArrowRight v-else :size="20" aria-hidden="true" />
        </button>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.cover-stage {
  display: grid;
  grid-template-rows: auto 1fr auto;
  height: 100vh;
  height: 100dvh;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
    env(safe-area-inset-left);
  background: var(--q-peach);
  color: var(--q-forest);
}
.cover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--q-space-2);
  padding: var(--q-space-2) var(--q-space-3);
  background: var(--q-forest);
  color: var(--q-peach);
}
.cover-header__step {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-family: var(--q-font-display);
  font-size: var(--q-type-label);
  font-weight: 800;
  color: var(--q-shoot);
  font-variant-numeric: tabular-nums;
}
.cover-toggle-btn {
  min-height: 36px;
  padding: 0 var(--q-space-2);
  border: 1px solid var(--q-shoot);
  border-radius: var(--q-radius-control);
  background: transparent;
  color: var(--q-peach);
  font-family: var(--q-font-display);
  font-size: var(--q-type-metadata);
  font-weight: 700;
}
.cover-toggle-btn[aria-pressed='true'] {
  background: var(--q-shoot);
  color: var(--q-forest);
}
.cover-overview {
  grid-row: 2/4;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--q-space-3);
  padding: var(--q-space-4);
}
.cover-overview__title {
  margin: 0;
  font-family: var(--q-font-display);
  font-size: var(--q-type-h4);
  font-weight: 800;
  line-height: 1.15;
}
.cover-overview__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--q-space-2);
}
.cover-overview__meta span {
  padding: 0.25rem 0.55rem;
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  font-size: var(--q-type-metadata);
  font-weight: 800;
}
.cover-start-btn {
  width: 100%;
  min-height: 52px;
}
.cover-scroll {
  min-height: 0;
  overflow-y: auto;
  padding: var(--q-space-3);
  display: grid;
  align-content: start;
  gap: var(--q-space-2);
}
.cover-step-title {
  margin: 0;
  font-family: var(--q-font-display);
  font-size: var(--q-type-body-large);
  font-weight: 800;
}
.cover-step-lines {
  display: grid;
  gap: var(--q-space-2);
}
.cover-step-lines p {
  margin: 0;
  font-size: var(--q-type-body);
  font-weight: 600;
  line-height: 1.4;
}
.cover-timers {
  display: flex;
  flex-wrap: wrap;
  gap: var(--q-space-2);
  margin-top: var(--q-space-1);
}
.cover-timer-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 40px;
  padding: 0 var(--q-space-3);
  border: 2px solid var(--q-forest);
  border-radius: var(--q-radius-control);
  background: var(--q-shoot);
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: var(--q-type-body-small);
  font-weight: 800;
}
.cover-done {
  display: grid;
  place-items: center;
  gap: var(--q-space-3);
  padding: var(--q-space-4);
  text-align: center;
}
.cover-footer {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--q-space-2);
  padding: var(--q-space-2);
  border-top: 2px solid var(--q-forest);
  background: var(--q-sage);
}
.cover-nav-btn {
  display: grid;
  place-items: center;
  min-width: 48px;
  min-height: 48px;
  border: 2px solid var(--q-forest);
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
  color: var(--q-forest);
}
.cover-nav-btn--primary {
  background: var(--q-forest);
  color: var(--q-peach);
}
.cover-step-dots {
  display: flex;
  justify-content: center;
  gap: var(--q-space-1);
  overflow-x: auto;
}
.cover-step-pill {
  min-width: 34px;
  min-height: 36px;
  padding: 0 0.35rem;
  border: 1px solid var(--q-forest);
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: var(--q-type-metadata);
  font-weight: 800;
}
.cover-step-pill.is-done {
  background: var(--q-forest);
  color: var(--q-shoot);
}
.cover-step-pill.is-current {
  background: var(--q-coral);
  color: var(--q-forest);
}
.cooking-ingredients {
  display: grid;
  gap: var(--q-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.cooking-ingredient__btn {
  display: flex;
  align-items: center;
  gap: var(--q-space-3);
  width: 100%;
  min-height: 46px;
  padding: var(--q-space-2) var(--q-space-3);
  border: 1px solid var(--q-forest);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  color: var(--q-forest);
  text-align: left;
  font-size: var(--q-type-body-small);
  font-weight: 600;
  line-height: var(--q-line-compact);
}
.cooking-ingredient__btn:hover {
  background: var(--q-shoot);
}
.cooking-ingredient__check {
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  border: 2px solid var(--q-forest);
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
  color: var(--q-forest);
}
.cooking-ingredient.is-checked .cooking-ingredient__btn {
  background: var(--q-shoot);
}
.cooking-ingredient.is-checked .cooking-ingredient__check {
  background: var(--q-forest);
  color: var(--q-peach);
}
.cooking-ingredient.is-checked .cooking-ingredient__text {
  text-decoration: line-through;
  opacity: 0.78;
}
</style>
