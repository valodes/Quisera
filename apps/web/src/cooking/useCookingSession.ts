import { useStorage } from '@vueuse/core'
import { computed, readonly } from 'vue'
import { useCookingTimers } from './useCookingTimers'

export type CookingIngredient = {
  name: string
  quantity: string | null
  unit: string | null
  notes: string | null
}

export type CookingRecipe = {
  key: string
  id: string
  title: string
  description: string | null
  imageUrl: string | null
  sourceLabel: string
  totalMinutes: number | null
  servings?: number | null
  prepMinutes: number | null
  cookMinutes: number | null
  ingredients: CookingIngredient[]
  steps: string[]
  routeQuery: Record<string, string>
}

export type CookingSessionState = {
  recipe: CookingRecipe
  phase: 'overview' | 'steps'
  currentStep: number
  finished: boolean
  checkedIngredients: Record<string, boolean>
}

const SESSION_STORAGE_KEY = 'quisera:cooking-session-v1'

function parseStoredSession(raw: string): CookingSessionState | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as Record<string, unknown>
    const recipe = record['recipe'] as CookingRecipe | undefined
    if (
      !recipe ||
      typeof recipe.key !== 'string' ||
      typeof recipe.title !== 'string' ||
      !Array.isArray(recipe.steps) ||
      !Array.isArray(recipe.ingredients)
    ) {
      return null
    }
    const phase = record['phase'] === 'steps' ? 'steps' : 'overview'
    const rawStep = typeof record['currentStep'] === 'number' ? record['currentStep'] : 0
    const maxStep = Math.max(0, recipe.steps.length - 1)
    return {
      recipe,
      phase,
      currentStep: Math.max(0, Math.min(rawStep, maxStep)),
      finished: Boolean(record['finished']),
      checkedIngredients:
        record['checkedIngredients'] && typeof record['checkedIngredients'] === 'object'
          ? (record['checkedIngredients'] as Record<string, boolean>)
          : {},
    }
  } catch {
    return null
  }
}

const sessionState = useStorage<CookingSessionState | null>(SESSION_STORAGE_KEY, null, undefined, {
  serializer: {
    read: parseStoredSession,
    write: (value) => (value ? JSON.stringify(value) : ''),
  },
})

function persistSession() {
  if (!sessionState.value && typeof window !== 'undefined') {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
  }
}

export function useCookingSession() {
  const { timers, clearTimersForRecipe } = useCookingTimers()

  const isSessionInProgress = computed(() => {
    const current = sessionState.value
    if (!current) return false
    const hasLinkedTimers = timers.value.some(
      (t) => t.recipeKey === current.recipe.key || t.recipeKey === null,
    )
    if (hasLinkedTimers) return true
    if (current.finished) return false
    if (current.phase === 'steps') return true
    return Object.values(current.checkedIngredients).some(Boolean)
  })

  function activateRecipe(recipe: CookingRecipe, preserveIfSame = true) {
    const current = sessionState.value
    if (preserveIfSame && current && current.recipe.key === recipe.key) {
      const maxStep = Math.max(0, recipe.steps.length - 1)
      sessionState.value = {
        ...current,
        recipe,
        currentStep: Math.max(0, Math.min(current.currentStep, maxStep)),
      }
      persistSession()
      return
    }
    sessionState.value = {
      recipe,
      phase: 'overview',
      currentStep: 0,
      finished: false,
      checkedIngredients: {},
    }
    persistSession()
  }

  function setPhase(phase: 'overview' | 'steps') {
    if (!sessionState.value) return
    sessionState.value = { ...sessionState.value, phase }
    persistSession()
  }

  function setStep(currentStep: number, finished = false) {
    if (!sessionState.value) return
    const maxStep = Math.max(0, sessionState.value.recipe.steps.length - 1)
    sessionState.value = {
      ...sessionState.value,
      currentStep: Math.max(0, Math.min(currentStep, maxStep)),
      finished,
    }
    persistSession()
  }

  function setFinished(finished: boolean) {
    if (!sessionState.value) return
    sessionState.value = { ...sessionState.value, finished }
    persistSession()
  }

  function toggleIngredient(index: number) {
    const current = sessionState.value
    if (!current) return
    const key = `${current.recipe.key}:${index}`
    sessionState.value = {
      ...current,
      checkedIngredients: {
        ...current.checkedIngredients,
        [key]: !current.checkedIngredients[key],
      },
    }
    persistSession()
  }

  function isIngredientChecked(index: number): boolean {
    const current = sessionState.value
    if (!current) return false
    return Boolean(current.checkedIngredients[`${current.recipe.key}:${index}`])
  }

  function cancelAndReplaceSession(nextRecipe: CookingRecipe) {
    const previousKey = sessionState.value?.recipe.key
    if (previousKey) {
      clearTimersForRecipe(previousKey)
    }
    sessionState.value = {
      recipe: nextRecipe,
      phase: 'overview',
      currentStep: 0,
      finished: false,
      checkedIngredients: {},
    }
    persistSession()
  }

  function clearSession() {
    const previousKey = sessionState.value?.recipe.key
    if (previousKey) {
      clearTimersForRecipe(previousKey)
    }
    sessionState.value = null
    persistSession()
  }

  return {
    session: readonly(sessionState),
    isSessionInProgress,
    activateRecipe,
    setPhase,
    setStep,
    setFinished,
    toggleIngredient,
    isIngredientChecked,
    cancelAndReplaceSession,
    clearSession,
  }
}
