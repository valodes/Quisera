import {
  civilWeekday,
  deliveryCycleSlots,
  type CivilDate,
  type HouseholdPlanningPreferences,
  type MealPeriod,
  type SlotPreferenceKey,
} from '@quisera/shared'

export type DistributableSelection = {
  id: string
  title: string
  totalMinutes: number | null
  caloriesKcal: number | null
  ingredientsJson: string
}

export type OccupiedSlot = {
  date: CivilDate
  period: MealPeriod
  caloriesKcal?: number | null
}

export type PlannedAssignment = {
  date: CivilDate
  period: MealPeriod
  selectionId: string
}

type ProteinGroup =
  | 'poultry'
  | 'beef'
  | 'pork'
  | 'lamb'
  | 'fish'
  | 'seafood'
  | 'egg'
  | 'tofu'
  | 'legume'
  | 'cheese'

type StarchGroup = 'pasta' | 'rice' | 'potato' | 'bread' | 'semolina' | 'quinoa' | 'noodles'

type ClassifiedSelection = DistributableSelection & {
  isFresh: boolean
  protein: ProteinGroup | null
  starch: StarchGroup | null
}

type CandidateSlot = {
  index: number
  date: CivilDate
  period: MealPeriod
  dayOffset: number
  weekday: number
  isRequired: boolean
  isLongRecipeDay: boolean
}

const FRESH_PATTERNS: RegExp[] = [
  /\b(saumon|cabillaud|colin|merlu|lieu|truite|bar|dorade|daurade|maquereau|sardine|thon frais|poisson|filet de)\b/,
  /\b(crevette|gambas|moule|saint[- ]jacques|calamar|encornet|poulpe)\b/,
  /\b(poulet|dinde|canard|pintade|volaille|escalope|aiguillette|cuisse)\b/,
  /\b(boeuf|bœuf|steak|bavette|entrecote|entrecôte|veau|porc|echine|échine|filet mignon|agneau|saucisse|chipolata|merguez|viande hach)/,
  /\b(epinard|épinard|roquette|mache|mâche|cresson|mesclun|salade|laitue|coriandre|persil|basilic|ciboulette|aneth|menthe)\b/,
  /\b(burrata|mozzarella|ricotta|stracciatella|creme fraiche|crème fraîche)\b/,
]

const PROTEIN_PATTERNS: ReadonlyArray<[ProteinGroup, RegExp]> = [
  ['seafood', /\b(crevette|gambas|moule|saint[- ]jacques|calamar|encornet|poulpe|crabe)\b/],
  [
    'fish',
    /\b(saumon|cabillaud|colin|merlu|lieu|truite|bar|dorade|daurade|maquereau|sardine|thon|poisson)\b/,
  ],
  ['poultry', /\b(poulet|dinde|canard|pintade|volaille|chapon)\b/],
  ['beef', /\b(boeuf|bœuf|steak|bavette|entrecote|entrecôte|veau|viande hach)/],
  ['pork', /\b(porc|jambon|lardon|bacon|chorizo|saucisse|chipolata|filet mignon|echine|échine)\b/],
  ['lamb', /\b(agneau|merguez|gigot)\b/],
  ['tofu', /\b(tofu|tempeh|seitan)\b/],
  ['egg', /\b(oeuf|œuf|omelette|frittata|shakshuka|chakchouka)\b/],
  [
    'legume',
    /\b(lentille|pois chiche|haricot rouge|haricot noir|haricot blanc|falafel|dahl|dal)\b/,
  ],
  ['cheese', /\b(halloumi|burrata|mozzarella|camembert|chevre|chèvre|feta|ricotta|comte|comté)\b/],
]

const STARCH_PATTERNS: ReadonlyArray<[StarchGroup, RegExp]> = [
  ['noodles', /\b(nouille|ramen|udon|soba|pad thai|vermicelle)\b/],
  [
    'pasta',
    /\b(pate|pâte|spaghetti|penne|tagliatelle|fusilli|rigatoni|macaroni|gnocchi|ravioli|lasagne|orzo|coquillette|tortellini)\b/,
  ],
  ['rice', /\b(riz|risotto|paella|pilaf|basmati)\b/],
  ['potato', /\b(pomme de terre|patate|purée|puree|frite|grenaille|ecrase|écrasé)\b/],
  ['semolina', /\b(semoule|couscous|boulgour|bulgur|taboule|taboulé|polenta)\b/],
  ['quinoa', /\b(quinoa|epeautre|épeautre|sarrasin|blé|ble)\b/],
  [
    'bread',
    /\b(burger|bun|wrap|tortilla|taco|quesadilla|naan|pita|bagel|focaccia|brioche|pain|croque|tartine|pizza|flammekueche)\b/,
  ],
]

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function extractIngredientNames(ingredientsJson: string): string {
  try {
    const parsed: unknown = JSON.parse(ingredientsJson)
    if (!Array.isArray(parsed)) return ''
    return parsed
      .map((entry) =>
        entry &&
        typeof entry === 'object' &&
        typeof (entry as Record<string, unknown>)['name'] === 'string'
          ? String((entry as Record<string, unknown>)['name'])
          : '',
      )
      .filter(Boolean)
      .join(' ')
  } catch {
    return ''
  }
}

export function classifySelection(selection: DistributableSelection): ClassifiedSelection {
  const combined = normalizeText(
    `${selection.title} ${extractIngredientNames(selection.ingredientsJson)}`,
  )
  const isFresh = FRESH_PATTERNS.some((pattern) => pattern.test(combined))
  const protein = PROTEIN_PATTERNS.find(([, pattern]) => pattern.test(combined))?.[0] ?? null
  const starch = STARCH_PATTERNS.find(([, pattern]) => pattern.test(combined))?.[0] ?? null
  return { ...selection, isFresh, protein, starch }
}

function slotKey(date: CivilDate, period: MealPeriod): string {
  return `${date}:${period}`
}

function preferenceKey(weekday: number, period: MealPeriod): SlotPreferenceKey {
  return `${weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6}:${period}`
}

function scoreAssignment(
  targetSlots: readonly CandidateSlot[],
  assigned: readonly ClassifiedSelection[],
  occupiedCaloriesByDate: ReadonlyMap<CivilDate, number>,
  preferences: HouseholdPlanningPreferences,
): number {
  let penalty = 0
  const dayCalories = new Map<CivilDate, number>(occupiedCaloriesByDate)
  const dayMealCalories = new Map<CivilDate, { lunch?: number; dinner?: number }>()

  for (let i = 0; i < targetSlots.length; i += 1) {
    const slot = targetSlots[i]!
    const item = assigned[i]!

    // 1. Freshness constraint
    if (
      preferences.freshProductsMaxDays !== null &&
      item.isFresh &&
      slot.dayOffset > preferences.freshProductsMaxDays
    ) {
      penalty += 1000 + (slot.dayOffset - preferences.freshProductsMaxDays) * 100
    }

    // 2. Weekday max prep minutes (long recipes reserved for longRecipeDays)
    if (
      preferences.weekdayMaxPrepMinutes !== null &&
      item.totalMinutes !== null &&
      item.totalMinutes > preferences.weekdayMaxPrepMinutes &&
      !slot.isLongRecipeDay
    ) {
      penalty += 400 + (item.totalMinutes - preferences.weekdayMaxPrepMinutes) * 5
    }

    // 3. Track daily calories
    if (item.caloriesKcal !== null) {
      dayCalories.set(slot.date, (dayCalories.get(slot.date) ?? 0) + item.caloriesKcal)
      const entry = dayMealCalories.get(slot.date) ?? {}
      entry[slot.period] = item.caloriesKcal
      dayMealCalories.set(slot.date, entry)
    }

    // 4. Consecutive meal variety (same protein or starch on adjacent chronological slots)
    if (i > 0) {
      const prev = assigned[i - 1]!
      if (
        preferences.avoidConsecutiveSameProtein &&
        item.protein &&
        item.protein === prev.protein
      ) {
        penalty += 150
      }
      if (preferences.avoidConsecutiveSameStarch && item.starch && item.starch === prev.starch) {
        penalty += 100
      }
    }
  }

  // 5. Daily calorie cap
  if (preferences.maxDailyCalories !== null) {
    for (const total of dayCalories.values()) {
      if (total > preferences.maxDailyCalories) {
        penalty += 500 + (total - preferences.maxDailyCalories)
      }
    }
  }

  // 6. Lunch vs dinner calorie balance
  if (preferences.calorieBalance !== 'neutral') {
    for (const { lunch, dinner } of dayMealCalories.values()) {
      if (lunch === undefined || dinner === undefined) continue
      if (preferences.calorieBalance === 'heavier-lunch' && lunch < dinner) {
        penalty += 120
      } else if (preferences.calorieBalance === 'heavier-dinner' && dinner < lunch) {
        penalty += 120
      }
    }
  }

  return penalty
}

export function autoDistributeSelections(
  deliveryDate: CivilDate,
  selections: readonly DistributableSelection[],
  occupiedSlots: readonly OccupiedSlot[],
  preferences: HouseholdPlanningPreferences,
): PlannedAssignment[] {
  if (selections.length === 0) return []

  const occupiedKeys = new Set(occupiedSlots.map((slot) => slotKey(slot.date, slot.period)))
  const occupiedCaloriesByDate = new Map<CivilDate, number>()
  for (const slot of occupiedSlots) {
    if (slot.caloriesKcal) {
      occupiedCaloriesByDate.set(
        slot.date,
        (occupiedCaloriesByDate.get(slot.date) ?? 0) + slot.caloriesKcal,
      )
    }
  }

  const requiredSet = new Set(preferences.requiredSlots)
  const excludedSet = new Set(preferences.excludedSlots)
  const longDaysSet = new Set(preferences.longRecipeDays)

  const allSlots = deliveryCycleSlots(deliveryDate).map((slot, index): CandidateSlot => {
    const weekday = civilWeekday(slot.date)
    const prefKey = preferenceKey(weekday, slot.period)
    const dayOffset = Math.round(
      (Date.parse(`${slot.date}T00:00:00Z`) - Date.parse(`${deliveryDate}T00:00:00Z`)) / 86_400_000,
    )
    return {
      index,
      date: slot.date,
      period: slot.period,
      dayOffset,
      weekday,
      isRequired: requiredSet.has(prefKey),
      isLongRecipeDay: longDaysSet.has(weekday),
    }
  })

  const openSlots = allSlots.filter((slot) => {
    if (occupiedKeys.has(slotKey(slot.date, slot.period))) return false
    if (excludedSet.has(preferenceKey(slot.weekday, slot.period))) return false
    return true
  })

  if (openSlots.length === 0) return []

  // Prioritize required slots first, then remaining open slots chronologically, then re-sort chronologically
  const count = Math.min(selections.length, openSlots.length)
  const requiredOpen = openSlots.filter((slot) => slot.isRequired)
  const optionalOpen = openSlots.filter((slot) => !slot.isRequired)
  const targetSlots = [...requiredOpen, ...optionalOpen]
    .slice(0, count)
    .toSorted((left, right) => left.index - right.index)

  // Classify & sort initial candidate list (fresh recipes first, then quicker recipes)
  const classified = selections.slice(0, count).map(classifySelection)
  const current = classified.toSorted((left, right) => {
    if (left.isFresh !== right.isFresh) return left.isFresh ? -1 : 1
    return (left.totalMinutes ?? 999) - (right.totalMinutes ?? 999)
  })

  // Pairwise swap hill-climbing to minimize total constraint penalty
  let bestScore = scoreAssignment(targetSlots, current, occupiedCaloriesByDate, preferences)
  let improved = true
  let iterations = 0
  while (improved && bestScore > 0 && iterations < 50) {
    improved = false
    iterations += 1
    for (let i = 0; i < current.length; i += 1) {
      for (let j = i + 1; j < current.length; j += 1) {
        const temp = current[i]!
        current[i] = current[j]!
        current[j] = temp
        const nextScore = scoreAssignment(targetSlots, current, occupiedCaloriesByDate, preferences)
        if (nextScore < bestScore) {
          bestScore = nextScore
          improved = true
        } else {
          current[j] = current[i]!
          current[i] = temp
        }
      }
    }
  }

  return targetSlots.map((slot, index) => ({
    date: slot.date,
    period: slot.period,
    selectionId: current[index]!.id,
  }))
}
