import { z } from 'zod'

export type CivilDate = string
export type MealPeriod = 'lunch' | 'dinner'
export type MealCategory = 'quitoque' | 'home' | 'restaurant'

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
export type SlotPreferenceKey = `${0 | 1 | 2 | 3 | 4 | 5 | 6}:${MealPeriod}`

export const calorieBalanceSchema = z.enum(['neutral', 'heavier-lunch', 'heavier-dinner'])
export type CalorieBalance = z.infer<typeof calorieBalanceSchema>

export const householdPlanningPreferencesSchema = z
  .object({
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

export type HouseholdPlanningPreferences = {
  freshProductsMaxDays: number | null
  requiredSlots: SlotPreferenceKey[]
  excludedSlots: SlotPreferenceKey[]
  weekdayMaxPrepMinutes: number | null
  longRecipeDays: number[]
  maxDailyCalories: number | null
  calorieBalance: CalorieBalance
  avoidConsecutiveSameProtein: boolean
  avoidConsecutiveSameStarch: boolean
  preserveManualMeals: boolean
}

export const defaultHouseholdPlanningPreferences: HouseholdPlanningPreferences = {
  freshProductsMaxDays: 3,
  requiredSlots: ['1:lunch', '2:lunch', '3:lunch', '4:lunch', '5:lunch'],
  excludedSlots: [],
  weekdayMaxPrepMinutes: 30,
  longRecipeDays: [6, 0],
  maxDailyCalories: null,
  calorieBalance: 'neutral',
  avoidConsecutiveSameProtein: true,
  avoidConsecutiveSameStarch: true,
  preserveManualMeals: true,
}

export function isCivilDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [, year, month, day] = match
  const date = createUtcDate(Number(year), Number(month) - 1, Number(day))
  return date.toISOString().slice(0, 10) === value
}

function createUtcDate(year: number, month: number, day: number): Date {
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year, month, day)
  return date
}

export function addCivilDays(date: CivilDate, amount: number): CivilDate {
  if (!isCivilDate(date) || !Number.isInteger(amount)) {
    throw new Error('Date civile ou déplacement invalide.')
  }
  const [year, month, day] = date.split('-').map(Number)
  const result = createUtcDate(year!, month! - 1, day! + amount)
  return result.toISOString().slice(0, 10)
}

export function addCivilMonths(date: CivilDate, amount: number): CivilDate {
  if (!isCivilDate(date) || !Number.isInteger(amount)) {
    throw new Error('Date civile ou déplacement invalide.')
  }
  const [year, month, day] = date.split('-').map(Number)
  const firstOfTarget = createUtcDate(year!, month! - 1 + amount, 1)
  const lastDay = createUtcDate(
    firstOfTarget.getUTCFullYear(),
    firstOfTarget.getUTCMonth() + 1,
    0,
  ).getUTCDate()
  firstOfTarget.setUTCDate(Math.min(day!, lastDay))
  return firstOfTarget.toISOString().slice(0, 10)
}

export function civilWeekday(date: CivilDate): number {
  if (!isCivilDate(date)) throw new Error('Date civile invalide.')
  const [year, month, day] = date.split('-').map(Number)
  return createUtcDate(year!, month! - 1, day!).getUTCDay()
}

export function deliveryCycleSlots(deliveryDate: CivilDate) {
  if (!isCivilDate(deliveryDate)) throw new Error('Date civile invalide.')

  return Array.from({ length: 8 }, (_, offset) => {
    const date = addCivilDays(deliveryDate, offset)
    const periods: MealPeriod[] =
      offset === 0 ? ['dinner'] : offset === 7 ? ['lunch'] : ['lunch', 'dinner']
    return periods.map((period) => ({ date, period }))
  }).flat()
}

export function monthGridDates(date: CivilDate) {
  if (!isCivilDate(date)) throw new Error('Date civile invalide.')
  const [year, month] = date.split('-').map(Number)
  const first = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`
  const lastDay = createUtcDate(year!, month!, 0).getUTCDate()
  const firstOffset = (civilWeekday(first) + 6) % 7
  const last = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const finalOffset = (6 - ((civilWeekday(last) + 6) % 7)) % 7
  const start = addCivilDays(first, -firstOffset)
  const end = addCivilDays(last, finalOffset)
  const dates: CivilDate[] = []
  for (let current = start; ; current = addCivilDays(current, 1)) {
    dates.push(current)
    if (current === end) return dates
  }
}

export function parisCivilDate(instant: Date): CivilDate {
  if (Number.isNaN(instant.getTime())) throw new Error('Instant invalide.')
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)
  const part = (type: string) => parts.find((item) => item.type === type)?.value
  const date = `${part('year')}-${part('month')}-${part('day')}`
  if (!isCivilDate(date)) throw new Error('Date Europe/Paris invalide.')
  return date
}
