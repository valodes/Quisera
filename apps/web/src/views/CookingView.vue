<script setup lang="ts">
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChefHat,
  Clock3,
  Flame,
  LayoutGrid,
  Play,
  RotateCcw,
  Sun,
  Timer,
  UtensilsCrossed,
} from '@lucide/vue'
import type { RecipeDetail, RecipeSummary } from '@quisera/shared'
import { ProgressIndicator, ProgressRoot } from 'reka-ui'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import CookingTimerDock from '@/components/cooking/CookingTimerDock.vue'
import Button from '@/components/ui/Button.vue'
import { extractNamedStepTimers, useCookingTimers } from '@/cooking/useCookingTimers'
import { useFoldablePosture } from '@/cooking/useFoldablePosture'
import { useWakeLock } from '@/cooking/useWakeLock'
import { useNextMeal } from '@/home/useNextMeal'
import { queryClient, queryKeys } from '@/lib/query'
import { getRecipe, listRecipes } from '@/recipes/api'
import { parseStructuredStep } from '@/recipes/instructions'

type CookingIngredient = {
  name: string
  quantity: string | null
  unit: string | null
  notes: string | null
}

type CookingRecipe = {
  id: string
  title: string
  description: string | null
  imageUrl: string | null
  sourceLabel: string
  totalMinutes: number | null
  prepMinutes: number | null
  cookMinutes: number | null
  ingredients: CookingIngredient[]
  steps: string[]
}

const route = useRoute()
const router = useRouter()
const {
  active: wakeLockActive,
  supported: wakeLockSupported,
  desired: wakeLockDesired,
  toggle: toggleWakeLock,
} = useWakeLock()
const {
  timers: activeTimers,
  startTimer,
  togglePause,
  addMinute,
  dismissTimer,
} = useCookingTimers()
const { loading: nextMealLoading, nextMeal, upcomingMeals } = useNextMeal()
const { isFlexMode, isCoverScreen, refreshPosture } = useFoldablePosture(() =>
  typeof route.query['fold'] === 'string' ? route.query['fold'] : null,
)

const phase = ref<'overview' | 'steps'>('overview')
const flexDeckTab = ref<'controls' | 'ingredients'>('controls')
const coverShowIngredients = ref(false)
let touchStartX: number | null = null
const currentStep = ref(0)
const finished = ref(false)
const loadingRecipe = ref(false)
const loadError = ref('')
const directRecipe = shallowRef<RecipeDetail | null>(null)
const houseRecipes = shallowRef<RecipeSummary[]>([])
const checkedIngredients = ref<Record<string, boolean>>({})

function estimateCookMinutes(
  steps: readonly string[],
  totalMinutes: number | null,
): { prep: number | null; cook: number | null } {
  let cookSum = 0
  for (let i = 0; i < steps.length; i += 1) {
    const parsed = parseStructuredStep(steps[i] ?? '', i + 1)
    const text = parsed.lines.join(' ')
    if (/(cuire|four|mijoter|bouillir|dorer|rôtir|enfourner|chauffer|poêle|sauteuse)/i.test(text)) {
      const detected = extractNamedStepTimers(parsed.title, parsed.lines, i + 1)
      if (detected[0]) cookSum += detected[0].minutes
    }
  }
  if (totalMinutes && cookSum > 0 && cookSum < totalMinutes) {
    return { prep: totalMinutes - cookSum, cook: cookSum }
  }
  if (cookSum > 0) {
    return { prep: null, cook: cookSum }
  }
  return { prep: null, cook: null }
}

const activeRecipe = computed<CookingRecipe | null>(() => {
  if (directRecipe.value) {
    const r = directRecipe.value
    const steps = r.steps.map((s) => s.instructions)
    const { prep, cook } = estimateCookMinutes(steps, r.totalMinutes)
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      imageUrl: r.imageUrl ?? r.thumbnailUrl,
      sourceLabel: r.source === 'house' ? 'Recette maison' : 'Quitoque',
      totalMinutes: r.totalMinutes,
      prepMinutes: prep,
      cookMinutes: cook,
      ingredients: r.ingredients.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        notes: item.notes,
      })),
      steps,
    }
  }

  if (nextMeal.value) {
    const meal = nextMeal.value
    const { prep, cook } = estimateCookMinutes(meal.steps, meal.totalMinutes)
    return {
      id: meal.meal.id,
      title: meal.meal.title,
      description: meal.description,
      imageUrl: meal.meal.imageUrl ?? meal.meal.thumbnailUrl,
      sourceLabel:
        meal.meal.category === 'quitoque'
          ? 'Prochain repas · Quitoque'
          : meal.meal.category === 'home'
            ? 'Prochain repas · Maison'
            : 'Prochain repas',
      totalMinutes: meal.totalMinutes,
      prepMinutes: prep,
      cookMinutes: cook,
      ingredients: meal.ingredients,
      steps: meal.steps,
    }
  }

  return null
})

const loading = computed(
  () => loadingRecipe.value || (!directRecipe.value && nextMealLoading.value),
)
const totalSteps = computed(() => activeRecipe.value?.steps.length ?? 0)
const currentStepStructured = computed(() => {
  const recipe = activeRecipe.value
  if (!recipe || recipe.steps.length === 0) return { title: null, lines: [] }
  return parseStructuredStep(recipe.steps[currentStep.value] ?? '', currentStep.value + 1)
})
const currentStepTimers = computed(() =>
  extractNamedStepTimers(
    currentStepStructured.value.title,
    currentStepStructured.value.lines,
    currentStep.value + 1,
  ),
)

const checkedCount = computed(() => {
  const recipe = activeRecipe.value
  if (!recipe) return 0
  return recipe.ingredients.filter((_, index) =>
    Boolean(checkedIngredients.value[`${recipe.id}-${index}`]),
  ).length
})

function toggleIngredient(index: number) {
  const recipe = activeRecipe.value
  if (!recipe) return
  const key = `${recipe.id}-${index}`
  checkedIngredients.value = {
    ...checkedIngredients.value,
    [key]: !checkedIngredients.value[key],
  }
}

function isIngredientChecked(index: number): boolean {
  const recipe = activeRecipe.value
  if (!recipe) return false
  return Boolean(checkedIngredients.value[`${recipe.id}-${index}`])
}

function startStepByStep(stepIndex = 0) {
  if (!activeRecipe.value || activeRecipe.value.steps.length === 0) return
  currentStep.value = Math.max(0, Math.min(stepIndex, activeRecipe.value.steps.length - 1))
  finished.value = false
  phase.value = 'steps'
}

function goToStep(index: number) {
  if (!activeRecipe.value) return
  if (index < 0 || index >= activeRecipe.value.steps.length) return
  currentStep.value = index
  finished.value = false
}

function nextStep() {
  if (!activeRecipe.value) return
  if (currentStep.value < activeRecipe.value.steps.length - 1) {
    goToStep(currentStep.value + 1)
  } else {
    finished.value = true
  }
}

function previousStep() {
  if (finished.value) {
    finished.value = false
    return
  }
  if (currentStep.value > 0) {
    goToStep(currentStep.value - 1)
  }
}

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
  if (deltaX < 0) nextStep()
  else previousStep()
}

function backToOverview() {
  phase.value = 'overview'
  finished.value = false
  coverShowIngredients.value = false
}

async function selectRecipeById(recipeId: string) {
  if (!recipeId) {
    directRecipe.value = null
    await router.replace({ name: 'cooking' })
    return
  }
  await router.replace({ name: 'cooking', query: { recipe: recipeId } })
}

async function loadFromRoute() {
  loadError.value = ''
  const recipeId = typeof route.query['recipe'] === 'string' ? route.query['recipe'].trim() : ''
  phase.value = 'overview'
  currentStep.value = 0
  finished.value = false

  if (recipeId) {
    loadingRecipe.value = true
    try {
      directRecipe.value = await getRecipe(recipeId)
    } catch (cause) {
      directRecipe.value = null
      loadError.value =
        cause instanceof Error ? cause.message : 'Impossible de charger cette recette.'
    } finally {
      loadingRecipe.value = false
    }
  } else {
    directRecipe.value = null
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (phase.value !== 'steps') return
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    nextStep()
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    previousStep()
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  await Promise.all([
    loadFromRoute(),
    queryClient
      .fetchQuery({
        queryKey: queryKeys.houseRecipesAll,
        queryFn: () => listRecipes({ source: 'house', page: 1, pageSize: 100, sort: 'title' }),
      })
      .then((res) => {
        houseRecipes.value = res.items
      })
      .catch(() => {
        houseRecipes.value = []
      }),
  ])
})

watch(
  () => [route.query['recipe'], route.query['fold']],
  () => {
    refreshPosture()
    void loadFromRoute()
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <section
    class="cooking-stage"
    :class="{
      'cooking-stage--flex': isFlexMode && phase === 'steps' && Boolean(activeRecipe),
      'cooking-stage--cover': isCoverScreen && Boolean(activeRecipe),
    }"
    aria-label="Mode cuisine"
  >
    <!-- COVER SCREEN (Z FLIP 7/8 FLEXWINDOW 4.1") -->
    <div v-if="isCoverScreen && activeRecipe" class="cover-stage">
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
                : `Ingrédients (${checkedCount}/${activeRecipe.ingredients.length})`
            }}
          </button>
        </div>
      </header>

      <div v-if="phase === 'overview'" class="cover-overview">
        <h2 class="cover-overview__title">{{ activeRecipe.title }}</h2>
        <div class="cover-overview__meta">
          <span v-if="activeRecipe.totalMinutes">{{ activeRecipe.totalMinutes }} min</span>
          <span>{{ activeRecipe.ingredients.length }} ingr.</span>
          <span>{{ totalSteps }} étapes</span>
        </div>
        <Button
          type="button"
          class="cover-start-btn"
          :disabled="totalSteps === 0"
          @click="startStepByStep(0)"
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
              v-for="(item, index) in activeRecipe.ingredients"
              :key="`cover-${item.name}-${index}`"
              class="cooking-ingredient"
              :class="{ 'is-checked': isIngredientChecked(index) }"
            >
              <button
                type="button"
                class="cooking-ingredient__btn"
                :aria-pressed="isIngredientChecked(index)"
                @click="toggleIngredient(index)"
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
              <Button type="button" variant="secondary" @click="goToStep(0)">Étape 1</Button>
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
                @click="startTimer(detected.label, detected.minutes)"
              >
                <Timer :size="15" aria-hidden="true" />
                {{ detected.minutes }} min
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
            @click="previousStep"
          >
            <ArrowLeft :size="20" aria-hidden="true" />
          </button>

          <div class="cover-step-dots" role="group" aria-label="Saut direct d’étape">
            <button
              v-for="(_, idx) in activeRecipe.steps"
              :key="`cover-pill-${idx}`"
              type="button"
              class="cover-step-pill"
              :class="{
                'is-current': !finished && idx === currentStep,
                'is-done': finished || idx < currentStep,
              }"
              :aria-label="`Aller à l’étape ${idx + 1} sur ${totalSteps}`"
              @click="goToStep(idx)"
            >
              {{ idx + 1 }}
            </button>
          </div>

          <button
            type="button"
            class="cover-nav-btn cover-nav-btn--primary"
            :aria-label="currentStep === totalSteps - 1 ? 'Terminer' : 'Étape suivante'"
            @click="nextStep"
          >
            <Check v-if="currentStep === totalSteps - 1" :size="20" aria-hidden="true" />
            <ArrowRight v-else :size="20" aria-hidden="true" />
          </button>
        </footer>
      </template>
    </div>

    <!-- FLEX MODE (Z FLIP 7/8 HALF-FOLDED AT 90 DEG) -->
    <div v-else-if="isFlexMode && phase === 'steps' && activeRecipe" class="flex-stage">
      <section
        class="flex-top-screen"
        aria-label="Lecture de l’étape (écran supérieur)"
        @touchstart.passive="handleTouchStart"
        @touchend.passive="handleTouchEnd"
      >
        <div class="step-stage__header">
          <span class="step-stage__kicker"> Étape {{ currentStep + 1 }} sur {{ totalSteps }} </span>
          <span class="step-stage__dish">{{ activeRecipe.title }}</span>
        </div>
        <ProgressRoot
          :model-value="currentStep + 1"
          :max="totalSteps"
          class="step-progress"
          aria-hidden="true"
        >
          <ProgressIndicator
            class="step-progress__fill"
            :style="{ transform: `scaleX(${(currentStep + 1) / totalSteps})` }"
          />
        </ProgressRoot>
        <div class="flex-top-screen__body">
          <template v-if="finished">
            <div class="step-done">
              <CheckCircle2 :size="40" class="step-done__icon" aria-hidden="true" />
              <h2>Bon appétit !</h2>
            </div>
          </template>
          <template v-else>
            <h3 v-if="currentStepStructured.title" class="step-stage__heading">
              {{ currentStepStructured.title }}
            </h3>
            <div class="step-stage__lines">
              <p
                v-for="(line, lineIdx) in currentStepStructured.lines"
                :key="`flex-line-${currentStep}-${lineIdx}`"
                class="step-stage__text"
              >
                {{ line }}
              </p>
            </div>
          </template>
        </div>
      </section>

      <div class="flex-hinge-gap" aria-hidden="true" />

      <section class="flex-bottom-deck" aria-label="Pupitre de commande (écran inférieur)">
        <nav class="flex-bottom-deck__rail" aria-label="Navigation directe entre les étapes">
          <div class="step-rail step-rail--bar">
            <button
              v-for="(_, idx) in activeRecipe.steps"
              :key="`flex-rail-${idx}`"
              type="button"
              class="step-pill"
              :class="{
                'is-current': !finished && idx === currentStep,
                'is-done': finished || idx < currentStep,
              }"
              :aria-current="!finished && idx === currentStep ? 'step' : undefined"
              :aria-label="`Aller à l’étape ${idx + 1} sur ${totalSteps}`"
              @click="goToStep(idx)"
            >
              <Check v-if="finished || idx < currentStep" :size="15" aria-hidden="true" />
              <span>{{ idx + 1 }}</span>
            </button>
          </div>
        </nav>

        <div class="flex-deck-tabs" role="tablist" aria-label="Outils du pupitre">
          <button
            type="button"
            role="tab"
            class="flex-deck-tab"
            :class="{ 'is-active': flexDeckTab === 'controls' }"
            :aria-selected="flexDeckTab === 'controls'"
            @click="flexDeckTab = 'controls'"
          >
            Commandes & minuteurs
          </button>
          <button
            type="button"
            role="tab"
            class="flex-deck-tab"
            :class="{ 'is-active': flexDeckTab === 'ingredients' }"
            :aria-selected="flexDeckTab === 'ingredients'"
            @click="flexDeckTab = 'ingredients'"
          >
            Ingrédients ({{ checkedCount }}/{{ activeRecipe.ingredients.length }})
          </button>
        </div>

        <div v-if="flexDeckTab === 'controls'" class="flex-deck-controls">
          <div v-if="currentStepTimers.length" class="step-timers">
            <button
              v-for="detected in currentStepTimers"
              :key="`flex-timer-${detected.minutes}-${detected.label}`"
              type="button"
              class="timer-chip"
              @click="startTimer(detected.label, detected.minutes)"
            >
              <Timer :size="17" aria-hidden="true" />
              <span>Lancer · {{ detected.label }} ({{ detected.minutes }} min)</span>
            </button>
          </div>

          <div class="step-nav step-nav--flex">
            <Button
              type="button"
              variant="secondary"
              class="step-nav__btn"
              :disabled="currentStep === 0 && !finished"
              @click="previousStep"
            >
              <ArrowLeft :size="20" aria-hidden="true" />
              Précédent
            </Button>
            <Button type="button" class="step-nav__btn" @click="nextStep">
              {{ currentStep === totalSteps - 1 ? 'Terminer' : 'Suivant' }}
              <Check v-if="currentStep === totalSteps - 1" :size="20" aria-hidden="true" />
              <ArrowRight v-else :size="20" aria-hidden="true" />
            </Button>
          </div>

          <div class="flex-deck-foot">
            <button
              v-if="wakeLockSupported"
              type="button"
              class="flex-mini-btn"
              :aria-pressed="wakeLockDesired"
              @click="toggleWakeLock"
            >
              <Sun :size="15" aria-hidden="true" />
              {{ wakeLockDesired ? 'Écran allumé' : 'Veille auto' }}
            </button>
            <button type="button" class="flex-mini-btn" @click="backToOverview">
              <LayoutGrid :size="15" aria-hidden="true" />
              Vue complète
            </button>
          </div>
        </div>

        <div v-else class="flex-deck-ingredients">
          <ul class="cooking-ingredients">
            <li
              v-for="(item, index) in activeRecipe.ingredients"
              :key="`flex-ing-${item.name}-${index}`"
              class="cooking-ingredient"
              :class="{ 'is-checked': isIngredientChecked(index) }"
            >
              <button
                type="button"
                class="cooking-ingredient__btn"
                :aria-pressed="isIngredientChecked(index)"
                @click="toggleIngredient(index)"
              >
                <span class="cooking-ingredient__check" aria-hidden="true">
                  <Check v-if="isIngredientChecked(index)" :size="15" />
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
      </section>
    </div>

    <template v-else>
      <header class="cooking-topbar">
        <div class="cooking-topbar__left">
          <span class="cooking-topbar__badge">
            <ChefHat :size="16" aria-hidden="true" />
            Mode cuisine
          </span>
          <label v-if="houseRecipes.length" class="cooking-switcher">
            <span class="sr-only">Choisir une autre recette</span>
            <select
              :value="typeof route.query['recipe'] === 'string' ? route.query['recipe'] : ''"
              @change="selectRecipeById(($event.target as HTMLSelectElement).value)"
            >
              <option value="">
                {{ nextMeal ? `Prochain repas : ${nextMeal.meal.title}` : 'Choisir une recette…' }}
              </option>
              <option v-for="item in houseRecipes" :key="item.id" :value="item.id">
                {{ item.title }}
              </option>
            </select>
          </label>
        </div>

        <div class="cooking-topbar__right">
          <button
            v-if="wakeLockSupported"
            type="button"
            class="wake-pill"
            :class="{ 'is-active': wakeLockActive || wakeLockDesired }"
            :aria-pressed="wakeLockDesired"
            @click="toggleWakeLock"
          >
            <Sun :size="15" aria-hidden="true" />
            <span>{{ wakeLockDesired ? 'Écran maintenu allumé' : 'Veille autorisée' }}</span>
          </button>

          <button
            v-if="phase === 'steps'"
            type="button"
            class="cooking-mode-btn"
            @click="backToOverview"
          >
            <LayoutGrid :size="16" aria-hidden="true" />
            Vue complète
          </button>
        </div>
      </header>

      <div v-if="loading" class="cooking-state" role="status">
        Préparation de votre espace cuisine…
      </div>

      <div v-else-if="loadError" class="cooking-state cooking-state--error" role="alert">
        Erreur : {{ loadError }}
      </div>

      <div v-else-if="!activeRecipe" class="cooking-empty">
        <UtensilsCrossed :size="36" aria-hidden="true" />
        <h2>Aucune recette sélectionnée</h2>
        <p>
          Planifiez un prochain repas ou choisissez une recette dans la bibliothèque pour lancer le
          mode cuisine.
        </p>
        <div class="cooking-empty__actions">
          <RouterLink class="cooking-link-cta" to="/recettes">
            <BookOpen :size="17" aria-hidden="true" />
            Ouvrir les recettes
          </RouterLink>
          <RouterLink class="cooking-link-secondary" to="/planning">Voir le planning</RouterLink>
        </div>
      </div>

      <!-- PHASE 1: FULL OVERVIEW (MISE EN PLACE) -->
      <div v-else-if="phase === 'overview'" class="cooking-overview">
        <div class="cooking-overview__left">
          <div class="cooking-photo">
            <img
              v-if="activeRecipe.imageUrl"
              :src="activeRecipe.imageUrl"
              :alt="`Photographie de ${activeRecipe.title}`"
              decoding="async"
            />
            <div v-else class="cooking-photo__empty" aria-hidden="true">
              <UtensilsCrossed :size="40" />
            </div>
            <span class="cooking-photo__source">{{ activeRecipe.sourceLabel }}</span>
          </div>

          <div class="cooking-overview__head">
            <h2>{{ activeRecipe.title }}</h2>
            <p v-if="activeRecipe.description" class="cooking-overview__desc">
              {{ activeRecipe.description }}
            </p>
          </div>

          <dl class="cooking-times" aria-label="Temps de préparation et cuisson">
            <div class="cooking-time-card cooking-time-card--primary">
              <dt>
                <Clock3 :size="15" aria-hidden="true" />
                Temps total
              </dt>
              <dd>{{ activeRecipe.totalMinutes ? `${activeRecipe.totalMinutes} min` : '—' }}</dd>
            </div>
            <div class="cooking-time-card">
              <dt>Préparation</dt>
              <dd>{{ activeRecipe.prepMinutes ? `${activeRecipe.prepMinutes} min` : '—' }}</dd>
            </div>
            <div class="cooking-time-card">
              <dt>
                <Flame :size="15" aria-hidden="true" />
                Cuisson
              </dt>
              <dd>{{ activeRecipe.cookMinutes ? `${activeRecipe.cookMinutes} min` : '—' }}</dd>
            </div>
            <div class="cooking-time-card">
              <dt>Étapes</dt>
              <dd>{{ totalSteps }}</dd>
            </div>
          </dl>

          <div class="cooking-overview__cta">
            <Button
              type="button"
              class="cooking-start-btn"
              :disabled="totalSteps === 0"
              @click="startStepByStep(0)"
            >
              <Play :size="19" aria-hidden="true" />
              Commencer étape par étape
            </Button>
          </div>
        </div>

        <aside class="cooking-overview__right" aria-label="Ingrédients et accès rapide aux étapes">
          <div class="cooking-panel">
            <div class="cooking-panel__head">
              <h3>Ingrédients</h3>
              <span class="cooking-counter">
                {{ checkedCount }} / {{ activeRecipe.ingredients.length }} prêts
              </span>
            </div>

            <ul v-if="activeRecipe.ingredients.length" class="cooking-ingredients">
              <li
                v-for="(item, index) in activeRecipe.ingredients"
                :key="`${item.name}-${index}`"
                class="cooking-ingredient"
                :class="{ 'is-checked': isIngredientChecked(index) }"
              >
                <button
                  type="button"
                  class="cooking-ingredient__btn"
                  :aria-pressed="isIngredientChecked(index)"
                  @click="toggleIngredient(index)"
                >
                  <span class="cooking-ingredient__check" aria-hidden="true">
                    <Check v-if="isIngredientChecked(index)" :size="15" />
                  </span>
                  <span class="cooking-ingredient__text">
                    <strong v-if="item.quantity"
                      >{{ item.quantity }}<span v-if="item.unit"> {{ item.unit }}</span></strong
                    >
                    {{ item.name }}
                    <em v-if="item.notes"> ({{ item.notes }})</em>
                  </span>
                </button>
              </li>
            </ul>
            <p v-else class="cooking-panel__empty">Aucun ingrédient renseigné.</p>
          </div>

          <div v-if="totalSteps > 0" class="cooking-panel cooking-panel--compact">
            <div class="cooking-panel__head">
              <h3>Accès direct aux étapes</h3>
              <span class="cooking-counter">{{ totalSteps }} étapes</span>
            </div>
            <div class="step-rail" role="group" aria-label="Aller directement à une étape">
              <button
                v-for="(_, idx) in activeRecipe.steps"
                :key="`overview-step-${idx}`"
                type="button"
                class="step-pill"
                :aria-label="`Commencer à l’étape ${idx + 1}`"
                @click="startStepByStep(idx)"
              >
                {{ idx + 1 }}
              </button>
            </div>
          </div>
        </aside>
      </div>

      <!-- PHASE 2: STEP-BY-STEP MODE -->
      <div v-else class="cooking-steps-layout">
        <nav class="step-rail-bar" aria-label="Navigation directe entre les étapes">
          <div class="step-rail step-rail--bar">
            <button
              v-for="(_, idx) in activeRecipe.steps"
              :key="`rail-step-${idx}`"
              type="button"
              class="step-pill"
              :class="{
                'is-current': !finished && idx === currentStep,
                'is-done': finished || idx < currentStep,
              }"
              :aria-current="!finished && idx === currentStep ? 'step' : undefined"
              :aria-label="`Aller à l’étape ${idx + 1} sur ${totalSteps}`"
              @click="goToStep(idx)"
            >
              <Check v-if="finished || idx < currentStep" :size="15" aria-hidden="true" />
              <span>{{ idx + 1 }}</span>
            </button>
          </div>
        </nav>

        <div class="cooking-steps-grid">
          <article class="step-stage">
            <template v-if="finished">
              <div class="step-done">
                <CheckCircle2 :size="48" class="step-done__icon" aria-hidden="true" />
                <h2>Bon appétit !</h2>
                <p>Toutes les étapes de « {{ activeRecipe.title }} » sont terminées.</p>
                <div class="step-done__actions">
                  <Button type="button" variant="secondary" @click="goToStep(0)">
                    <RotateCcw :size="16" aria-hidden="true" />
                    Reprendre à l’étape 1
                  </Button>
                  <Button type="button" @click="backToOverview">Vue complète</Button>
                </div>
              </div>
            </template>

            <template v-else>
              <div class="step-stage__header">
                <span class="step-stage__kicker">
                  Étape {{ currentStep + 1 }} sur {{ totalSteps }}
                </span>
                <span class="step-stage__dish">{{ activeRecipe.title }}</span>
              </div>

              <div class="step-progress" aria-hidden="true">
                <div
                  class="step-progress__fill"
                  :style="{ width: `${((currentStep + 1) / totalSteps) * 100}%` }"
                />
              </div>

              <div class="step-stage__body">
                <h3 v-if="currentStepStructured.title" class="step-stage__heading">
                  {{ currentStepStructured.title }}
                </h3>
                <div class="step-stage__lines">
                  <p
                    v-for="(line, lineIdx) in currentStepStructured.lines"
                    :key="`cook-line-${currentStep}-${lineIdx}`"
                    class="step-stage__text"
                  >
                    {{ line }}
                  </p>
                </div>

                <div v-if="currentStepTimers.length" class="step-timers">
                  <button
                    v-for="detected in currentStepTimers"
                    :key="`timer-${detected.minutes}-${detected.label}`"
                    type="button"
                    class="timer-chip"
                    @click="startTimer(detected.label, detected.minutes)"
                  >
                    <Timer :size="17" aria-hidden="true" />
                    <span>Lancer · {{ detected.label }} ({{ detected.minutes }} min)</span>
                  </button>
                </div>
              </div>

              <footer class="step-nav">
                <Button
                  type="button"
                  variant="secondary"
                  class="step-nav__btn"
                  :disabled="currentStep === 0"
                  @click="previousStep"
                >
                  <ArrowLeft :size="20" aria-hidden="true" />
                  Précédent
                </Button>

                <span class="step-nav__counter">{{ currentStep + 1 }} / {{ totalSteps }}</span>

                <Button type="button" class="step-nav__btn" @click="nextStep">
                  {{ currentStep === totalSteps - 1 ? 'Terminer' : 'Suivant' }}
                  <Check v-if="currentStep === totalSteps - 1" :size="20" aria-hidden="true" />
                  <ArrowRight v-else :size="20" aria-hidden="true" />
                </Button>
              </footer>
            </template>
          </article>

          <aside class="cooking-side-ingredients" aria-label="Ingrédients à portée de main">
            <div class="cooking-panel cooking-panel--full">
              <div class="cooking-panel__head">
                <h3>Ingrédients</h3>
                <span class="cooking-counter">
                  {{ checkedCount }} / {{ activeRecipe.ingredients.length }}
                </span>
              </div>
              <ul v-if="activeRecipe.ingredients.length" class="cooking-ingredients">
                <li
                  v-for="(item, index) in activeRecipe.ingredients"
                  :key="`side-${item.name}-${index}`"
                  class="cooking-ingredient"
                  :class="{ 'is-checked': isIngredientChecked(index) }"
                >
                  <button
                    type="button"
                    class="cooking-ingredient__btn"
                    :aria-pressed="isIngredientChecked(index)"
                    @click="toggleIngredient(index)"
                  >
                    <span class="cooking-ingredient__check" aria-hidden="true">
                      <Check v-if="isIngredientChecked(index)" :size="15" />
                    </span>
                    <span class="cooking-ingredient__text">
                      <strong v-if="item.quantity"
                        >{{ item.quantity }}<span v-if="item.unit"> {{ item.unit }}</span></strong
                      >
                      {{ item.name }}
                      <em v-if="item.notes"> ({{ item.notes }})</em>
                    </span>
                  </button>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>

      <div
        v-if="upcomingMeals.length && !route.query['recipe'] && phase === 'overview'"
        class="sr-only"
      >
        {{ upcomingMeals.length }} autres repas prévus
      </div>
    </template>

    <!-- FLOATING MULTI-TIMER TOAST DOCK -->
    <CookingTimerDock
      :timers="activeTimers"
      :flex-mode="isFlexMode && phase === 'steps'"
      :cover-mode="isCoverScreen"
      @toggle-pause="togglePause"
      @add-minute="addMinute"
      @dismiss="dismissTimer"
    />
  </section>
</template>

<style scoped lang="scss">
.cooking-stage {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: var(--q-space-4);
  min-height: calc(100vh - 3rem);
  min-height: calc(100dvh - 3rem);
  min-width: 0;
  color: var(--q-forest);
}

.cooking-topbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--q-space-3);
  padding: var(--q-space-3) var(--q-space-4);
  border-radius: var(--q-radius-card);
  background: var(--q-forest);
  color: var(--q-peach);

  &__left,
  &__right {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--q-space-2);
    min-width: 0;
  }

  &__badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem;
    border-radius: var(--q-radius-control);
    background: var(--q-coral);
    color: var(--q-forest);
    font-family: var(--q-font-display);
    font-size: var(--q-type-label);
    font-weight: 800;
  }
}

.cooking-switcher select {
  min-height: var(--q-touch-target);
  max-width: min(17rem, 50vw);
  padding: 0 var(--q-space-3);
  border: 2px solid var(--q-shoot);
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
  color: var(--q-forest);
  font-size: var(--q-type-body-small);
  font-weight: 700;
}

.wake-pill,
.cooking-mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: var(--q-touch-target);
  padding: 0 var(--q-space-3);
  border: 2px solid var(--q-peach);
  border-radius: var(--q-radius-control);
  background: transparent;
  color: var(--q-peach);
  font-family: var(--q-font-display);
  font-size: var(--q-type-body-small);
  font-weight: 700;

  &:hover {
    background: var(--q-shoot);
    border-color: var(--q-shoot);
    color: var(--q-forest);
  }

  &.is-active {
    background: var(--q-shoot);
    border-color: var(--q-shoot);
    color: var(--q-forest);
  }
}

.cooking-state,
.cooking-empty {
  display: grid;
  place-items: center;
  align-content: center;
  gap: var(--q-space-3);
  padding: var(--q-space-8);
  border: 2px solid var(--q-forest);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  text-align: center;

  h2,
  p {
    margin: 0;
    max-width: 52ch;
  }

  &--error {
    border-color: var(--q-tomato);
    font-weight: 700;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--q-space-3);
    margin-top: var(--q-space-2);
  }
}

.cooking-link-cta,
.cooking-link-secondary {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: var(--q-touch-target);
  padding: 0 var(--q-space-4);
  border-radius: var(--q-radius-control);
  font-family: var(--q-font-display);
  font-weight: 700;
  text-decoration: none;
}

.cooking-link-cta {
  background: var(--q-forest);
  color: var(--q-peach);
}

.cooking-link-secondary {
  border: 2px solid var(--q-forest);
  background: var(--q-sage);
  color: var(--q-forest);
}

// PHASE 1: OVERVIEW (iPad Landscape optimized 2-column split)
.cooking-overview {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(19rem, 0.92fr);
  gap: var(--q-space-4);
  align-items: start;
  min-width: 0;

  @media (max-width: 54rem) {
    grid-template-columns: 1fr;
  }

  &__left {
    display: grid;
    gap: var(--q-space-4);
    padding: var(--q-space-4);
    border: 2px solid var(--q-forest);
    border-radius: var(--q-radius-card);
    background: var(--q-peach);
    min-width: 0;
  }

  &__right {
    display: grid;
    gap: var(--q-space-4);
    min-width: 0;
  }

  &__head {
    display: grid;
    gap: var(--q-space-2);

    h2 {
      margin: 0;
      font-family: var(--q-font-display);
      font-size: var(--q-type-h3);
      font-weight: 800;
      line-height: 1.1;
      text-wrap: balance;
    }
  }

  &__desc {
    margin: 0;
    font-size: var(--q-type-body);
    line-height: var(--q-line-body);
  }

  &__cta {
    display: flex;
  }
}

.cooking-photo {
  position: relative;
  width: 100%;
  height: clamp(12rem, 26dvh, 18rem);
  overflow: hidden;
  border-radius: var(--q-radius-card);
  background: var(--q-sage);

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &__empty {
    display: grid;
    width: 100%;
    height: 100%;
    place-items: center;
    color: var(--q-leaf);
  }

  &__source {
    position: absolute;
    top: var(--q-space-3);
    left: var(--q-space-3);
    padding: 0.25rem 0.65rem;
    border-radius: var(--q-radius-control);
    background: var(--q-forest);
    color: var(--q-peach);
    font-family: var(--q-font-display);
    font-size: var(--q-type-metadata);
    font-weight: 800;
  }
}

.cooking-times {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--q-space-2);
  margin: 0;

  @media (max-width: 72rem) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.cooking-time-card {
  display: grid;
  gap: 0.2rem;
  padding: var(--q-space-3);
  border: 1px solid var(--q-forest);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);

  dt {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: var(--q-type-metadata);
    font-weight: 700;
    color: var(--q-forest);
  }

  dd {
    margin: 0;
    font-family: var(--q-font-display);
    font-size: var(--q-type-h4);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  &--primary {
    background: var(--q-forest);
    color: var(--q-peach);

    dt {
      color: var(--q-shoot);
    }
  }
}

.cooking-start-btn {
  width: 100%;
  min-height: 54px;
  font-size: var(--q-type-body-large);
}

.cooking-panel {
  display: grid;
  gap: var(--q-space-3);
  padding: var(--q-space-4);
  border: 2px solid var(--q-forest);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  min-width: 0;

  &--full {
    height: 100%;
    align-content: start;
  }

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--q-space-2);
    padding-bottom: var(--q-space-2);
    border-bottom: 1px solid var(--q-leaf);

    h3 {
      margin: 0;
      font-family: var(--q-font-display);
      font-size: var(--q-type-h4);
      font-weight: 800;
    }
  }

  &__empty {
    margin: 0;
    color: var(--q-leaf);
  }
}

.cooking-counter {
  padding: 0.25rem 0.6rem;
  border-radius: var(--q-radius-control);
  background: var(--q-forest);
  color: var(--q-shoot);
  font-size: var(--q-type-metadata);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.cooking-ingredients {
  display: grid;
  gap: var(--q-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 24rem;
  overflow-y: auto;
}

.cooking-ingredient {
  &__btn {
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

    &:hover {
      background: var(--q-shoot);
    }
  }

  &__check {
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

  &.is-checked {
    .cooking-ingredient__btn {
      background: var(--q-shoot);
    }

    .cooking-ingredient__check {
      background: var(--q-forest);
      color: var(--q-peach);
    }

    .cooking-ingredient__text {
      text-decoration: line-through;
      opacity: 0.78;
    }
  }
}

// PHASE 2: STEP-BY-STEP MODE (High contrast iPad Landscape)
.cooking-steps-layout {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: var(--q-space-4);
  min-height: 0;
  min-width: 0;
}

.step-rail-bar {
  padding: var(--q-space-2) var(--q-space-3);
  border: 2px solid var(--q-forest);
  border-radius: var(--q-radius-card);
  background: var(--q-leaf);
  overflow-x: auto;
}

.step-rail {
  display: flex;
  flex-wrap: wrap;
  gap: var(--q-space-2);

  &--bar {
    flex-wrap: nowrap;
  }
}

.step-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  flex: none;
  min-width: 48px;
  min-height: 48px;
  padding: 0 var(--q-space-3);
  border: 2px solid var(--q-forest);
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: 1rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;

  &:hover {
    background: var(--q-shoot);
  }

  &.is-done {
    background: var(--q-forest);
    border-color: var(--q-forest);
    color: var(--q-shoot);
  }

  &.is-current {
    background: var(--q-coral);
    border-color: var(--q-forest);
    color: var(--q-forest);
  }
}

.cooking-steps-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(18rem, 0.85fr);
  gap: var(--q-space-4);
  align-items: stretch;
  min-height: 0;
  min-width: 0;

  @media (max-width: 54rem) {
    grid-template-columns: 1fr;
  }
}

.step-stage {
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  overflow: hidden;
  border: 2px solid var(--q-forest);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  min-width: 0;

  &__header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--q-space-2);
    padding: var(--q-space-3) var(--q-space-6);
    background: var(--q-forest);
    color: var(--q-peach);
  }

  &__kicker {
    padding: 0.25rem 0.65rem;
    border-radius: var(--q-radius-control);
    background: var(--q-shoot);
    color: var(--q-forest);
    font-family: var(--q-font-display);
    font-size: var(--q-type-label);
    font-weight: 800;
  }

  &__dish {
    font-family: var(--q-font-display);
    font-size: var(--q-type-label);
    font-weight: 700;
    color: var(--q-peach);
  }

  &__body {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--q-space-4);
    padding: clamp(1.25rem, 2.5vw, 2rem);
  }

  &__heading {
    margin: 0;
    font-family: var(--q-font-display);
    font-size: var(--q-type-h3);
    font-weight: 800;
    color: var(--q-forest);
  }

  &__lines {
    display: grid;
    gap: var(--q-space-3);
  }

  &__text {
    margin: 0;
    font-family: var(--q-font-body);
    font-size: var(--q-type-body-large);
    font-weight: 600;
    line-height: 1.5;
    color: var(--q-forest);
    text-wrap: pretty;
  }
}

.step-progress {
  height: 8px;
  background: var(--q-sage);
  overflow: hidden;

  &__fill {
    width: 100%;
    height: 100%;
    transform-origin: left center;
    background: var(--q-coral);
    transition: transform 220ms var(--q-ease-standard);
  }
}

.step-timers {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--q-space-2);
  margin-top: var(--q-space-2);
}

.timer-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 48px;
  padding: 0 var(--q-space-4);
  border: 2px solid var(--q-forest);
  border-radius: var(--q-radius-control);
  background: var(--q-shoot);
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: var(--q-type-body-small);
  font-weight: 800;

  &:hover {
    background: var(--q-coral);
  }
}

.step-nav {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--q-space-3);
  padding: var(--q-space-4) var(--q-space-6);
  border-top: 2px solid var(--q-forest);
  background: var(--q-sage);

  &__btn {
    min-height: 56px;
    font-size: var(--q-type-body-large);
  }

  &__counter {
    font-family: var(--q-font-display);
    font-size: var(--q-type-body-large);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
}

.step-done {
  display: grid;
  place-items: center;
  align-content: center;
  gap: var(--q-space-4);
  padding: var(--q-space-8);
  text-align: center;

  &__icon {
    color: var(--q-leaf);
  }

  h2,
  p {
    margin: 0;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--q-space-3);
  }
}

.cooking-side-ingredients {
  min-width: 0;

  .cooking-ingredients {
    max-height: calc(100vh - 17rem);
    max-height: calc(100dvh - 17rem);
  }
}

// SAMSUNG GALAXY Z FLIP 7/8 — FLEX MODE (HALF-FOLDED 90°)
.cooking-stage--flex {
  display: block;
  min-height: 100vh;
  min-height: 100dvh;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}

.flex-stage {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  background: var(--q-canvas);
}

.flex-top-screen {
  display: grid;
  grid-template-rows: auto auto 1fr;
  height: env(viewport-segment-height 0 0, 48dvh);
  flex: none;
  overflow: hidden;
  border-bottom: 2px solid var(--q-forest);
  background: var(--q-peach);

  &__body {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--q-space-3);
    overflow-y: auto;
    padding: var(--q-space-4);
  }
}

.flex-hinge-gap {
  height: max(
    0px,
    calc(env(viewport-segment-top 0 1, 48dvh) - env(viewport-segment-height 0 0, 48dvh))
  );
  flex: none;
  background: var(--q-forest);
}

.flex-bottom-deck {
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: var(--q-space-3);
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  padding: var(--q-space-3);
  padding-bottom: max(var(--q-space-3), env(safe-area-inset-bottom));
  background: var(--q-canvas);

  &__rail {
    overflow-x: auto;
  }
}

.flex-deck-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--q-space-2);
}

.flex-deck-tab {
  min-height: var(--q-touch-target);
  padding: 0 var(--q-space-3);
  border: 2px solid var(--q-forest);
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: var(--q-type-body-small);
  font-weight: 800;

  &.is-active {
    background: var(--q-forest);
    color: var(--q-shoot);
  }
}

.flex-deck-controls {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--q-space-3);
  min-height: 0;
}

.step-nav--flex {
  grid-template-columns: 1fr 1fr;
  padding: 0;
  border-top: 0;
  background: transparent;
}

.flex-deck-foot {
  display: flex;
  justify-content: space-between;
  gap: var(--q-space-2);
}

.flex-mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: var(--q-touch-target);
  padding: 0 var(--q-space-3);
  border: 1px solid var(--q-forest);
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: var(--q-type-metadata);
  font-weight: 700;
}

.flex-deck-ingredients {
  min-height: 0;
  overflow-y: auto;

  .cooking-ingredients {
    max-height: none;
  }
}

// SAMSUNG GALAXY Z FLIP 7/8 — COVER SCREEN / FLEXWINDOW (4.1" ~360x398)
.cooking-stage--cover {
  display: block;
  min-height: 100vh;
  min-height: 100dvh;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}

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

  &__step {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-family: var(--q-font-display);
    font-size: var(--q-type-label);
    font-weight: 800;
    color: var(--q-shoot);
    font-variant-numeric: tabular-nums;
  }
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

  &[aria-pressed='true'] {
    background: var(--q-shoot);
    color: var(--q-forest);
  }
}

.cover-overview {
  grid-row: 2 / 4;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--q-space-3);
  padding: var(--q-space-4);

  &__title {
    margin: 0;
    font-family: var(--q-font-display);
    font-size: var(--q-type-h4);
    font-weight: 800;
    line-height: 1.15;
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--q-space-2);

    span {
      padding: 0.25rem 0.55rem;
      border-radius: var(--q-radius-control);
      background: var(--q-sage);
      font-size: var(--q-type-metadata);
      font-weight: 800;
    }
  }
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

  p {
    margin: 0;
    font-size: var(--q-type-body);
    font-weight: 600;
    line-height: 1.4;
  }
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

  &--primary {
    background: var(--q-forest);
    color: var(--q-peach);
  }
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

  &.is-done {
    background: var(--q-forest);
    color: var(--q-shoot);
  }

  &.is-current {
    background: var(--q-coral);
    color: var(--q-forest);
  }
}
</style>
