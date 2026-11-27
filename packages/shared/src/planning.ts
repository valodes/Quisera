import { z } from 'zod'
import { isCivilDate, type CivilDate, type MealCategory, type MealPeriod } from './dates.js'

export * from './dates.js'

export const civilDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isCivilDate, 'Date civile invalide.')

export const mealPeriodSchema = z.enum(['lunch', 'dinner'])
export const mealCategorySchema = z.enum(['quitoque', 'home', 'restaurant'])

export type DeliveryCycle = {
  id: string
  deliveryDate: CivilDate
  periodStartDate: CivilDate | null
  periodEndDate: CivilDate | null
  lastSyncedAt: string | null
  recipeCount: number
}

export type QuitoqueSelection = {
  id: string
  sourceItemId: string
  sourceProductId: string
  position: number
  occurrence: number
  quantity: number
  isAvailable: boolean
  title: string
  description: string | null
  imageUrl: string | null
  thumbnailUrl: string | null
  totalMinutes: number | null
  nutriScore: string | null
}

export type PlannedMeal = {
  id: string
  category: MealCategory
  origin: 'manual' | 'automatic'
  title: string
  recipeId: string | null
  selectionId: string | null
  restaurantName: string | null
  notes: string | null
  imageUrl: string | null
  thumbnailUrl: string | null
  description?: string | null
  totalMinutes?: number | null
  caloriesKcal?: number | null
  nutriScore?: string | null
  carbonScore?: string | null
}

export type PlanningSlot = {
  date: CivilDate
  period: MealPeriod
  meal: PlannedMeal | null
}

export type PlanningRange = {
  days: Array<{
    date: CivilDate
    isDeliveryDay: boolean
    lunch: PlanningSlot
    dinner: PlanningSlot
  }>
  deliveryCycles: DeliveryCycle[]
}

export type QuitoqueDeliverySyncResult = {
  added: number
  updated: number
  invalidDeliveryDates: number
  completedAt: string
}

export type QuitoqueSelectionSyncResult = {
  added: number
  updated: number
  unavailable: number
  completedAt: string
}

export type DistributionResult = {
  assigned: number
  leftEmpty: number
  preserved: number
  unassigned: number
}

export const slotPreferenceKeySchema = z.string().regex(/^[0-6]:(lunch|dinner)$/)

export const calorieBalanceSchema = z.enum(['neutral', 'heavier-lunch', 'heavier-dinner'])

export const householdPlanningPreferencesSchema = z
  .object({
    defaultServings: z.number().int().min(1).max(24).optional(),
    freshProductsMaxDays: z.number().int().min(1).max(7).nullable(),
    requiredSlots: z.array(slotPreferenceKeySchema).max(14),
    excludedSlots: z.array(slotPreferenceKeySchema).max(14),
    weekdayMaxPrepMinutes: z.number().int().min(5).max(180).nullable(),
    longRecipeDays: z.array(z.number().int().min(0).max(6)).max(7),
    maxDailyCalories: z.number().int().min(600).max(5000).nullable(),
    calorieBalance: calorieBalanceSchema,
    avoidConsecutiveSameProtein: z.boolean(),
    avoidConsecutiveSameStarch: z.boolean(),
    preserveManualMeals: z.boolean(),
  })
  .superRefine((value, context) => {
    const excluded = new Set(value.excludedSlots)
    const conflict = value.requiredSlots.find((slot) => excluded.has(slot))
    if (conflict) {
      context.addIssue({
        code: 'custom',
        path: ['requiredSlots'],
        message: 'Un créneau ne peut pas être à la fois obligatoire et exclu.',
      })
    }
  })
