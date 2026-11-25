// @vitest-environment node
import { defaultHouseholdPlanningPreferences } from '@quisera/shared'
import { describe, expect, it } from 'vitest'
import { autoDistributeSelections, type DistributableSelection } from './auto-distribute.js'

const deliveryDate = '2026-11-16' // Monday

function makeSelection(
  id: string,
  title: string,
  overrides: Partial<DistributableSelection> = {},
): DistributableSelection {
  return {
    id,
    title,
    totalMinutes: 25,
    caloriesKcal: 650,
    ingredientsJson: '[]',
    ...overrides,
  }
}

describe('autoDistributeSelections', () => {
  it('places fresh recipes within freshProductsMaxDays after delivery', () => {
    const selections = [
      makeSelection('dry-1', 'Dahl de lentilles', { totalMinutes: 25 }),
      makeSelection('dry-2', 'Risotto aux champignons', { totalMinutes: 25 }),
      makeSelection('dry-3', 'Pâtes au pesto', { totalMinutes: 20 }),
      makeSelection('dry-4', 'Chili aux haricots rouges', { totalMinutes: 25 }),
      makeSelection('fresh-1', 'Pavé de saumon et épinards frais', { totalMinutes: 25 }),
    ]

    const result = autoDistributeSelections(deliveryDate, selections, [], {
      ...defaultHouseholdPlanningPreferences,
      requiredSlots: [],
      freshProductsMaxDays: 3,
    })

    const freshSlot = result.find((entry) => entry.selectionId === 'fresh-1')
    expect(freshSlot).toBeDefined()
    expect(freshSlot!.date <= '2026-11-19').toBe(true)
  })

  it('fills required weekday lunches before optional slots and skips excluded slots', () => {
    const selections = [
      makeSelection('r1', 'Bol quinoa avocat'),
      makeSelection('r2', 'Pâtes aux tomates'),
      makeSelection('r3', 'Riz sauté aux légumes'),
    ]

    const result = autoDistributeSelections(deliveryDate, selections, [], {
      ...defaultHouseholdPlanningPreferences,
      requiredSlots: ['2:lunch', '3:lunch', '4:lunch'],
      excludedSlots: ['1:dinner', '5:dinner'],
    })

    expect(result.map((entry) => `${entry.date}:${entry.period}`)).toEqual([
      '2026-11-17:lunch',
      '2026-11-18:lunch',
      '2026-11-19:lunch',
    ])
  })

  it('reserves long recipes for longRecipeDays when weekdayMaxPrepMinutes is set', () => {
    const selections = [
      makeSelection('long', 'Blanquette mijotée aux champignons', { totalMinutes: 55 }),
      makeSelection('quick', 'Pâtes express au pesto', { totalMinutes: 15 }),
    ]

    const result = autoDistributeSelections(deliveryDate, selections, [], {
      ...defaultHouseholdPlanningPreferences,
      requiredSlots: ['2:dinner', '6:dinner'],
      weekdayMaxPrepMinutes: 30,
      longRecipeDays: [6, 0],
    })

    const longSlot = result.find((entry) => entry.selectionId === 'long')
    expect(longSlot?.date).toBe('2026-11-21') // Saturday
  })

  it('respects daily calorie cap and heavier-lunch balance', () => {
    const selections = [
      makeSelection('heavy-1', 'Lasagnes généreuses', { caloriesKcal: 950 }),
      makeSelection('heavy-2', 'Burger maison', { caloriesKcal: 950 }),
      makeSelection('light-1', 'Soupe de courge', { caloriesKcal: 420 }),
      makeSelection('light-2', 'Salade tiède de lentilles', { caloriesKcal: 450 }),
    ]

    const result = autoDistributeSelections(deliveryDate, selections, [], {
      ...defaultHouseholdPlanningPreferences,
      requiredSlots: ['2:lunch', '2:dinner', '3:lunch', '3:dinner'],
      maxDailyCalories: 1500,
      calorieBalance: 'heavier-lunch',
      avoidConsecutiveSameProtein: false,
      avoidConsecutiveSameStarch: false,
    })

    const byKey = new Map(result.map((r) => [`${r.date}:${r.period}`, r.selectionId]))
    const kcalOf = (id: string | undefined) =>
      selections.find((item) => item.id === id)?.caloriesKcal ?? 0

    const tueLunch = kcalOf(byKey.get('2026-11-17:lunch'))
    const tueDinner = kcalOf(byKey.get('2026-11-17:dinner'))
    const wedLunch = kcalOf(byKey.get('2026-11-18:lunch'))
    const wedDinner = kcalOf(byKey.get('2026-11-18:dinner'))

    expect(tueLunch + tueDinner).toBeLessThanOrEqual(1500)
    expect(wedLunch + wedDinner).toBeLessThanOrEqual(1500)
    expect(tueLunch).toBeGreaterThan(tueDinner)
    expect(wedLunch).toBeGreaterThan(wedDinner)
  })

  it('avoids consecutive meals with the same protein or starch', () => {
    const selections = [
      makeSelection('p1', 'Poulet rôti et riz'),
      makeSelection('p2', 'Poulet curry et pommes de terre'),
      makeSelection('s1', 'Saumon grillé et quinoa'),
    ]

    const result = autoDistributeSelections(deliveryDate, selections, [], {
      ...defaultHouseholdPlanningPreferences,
      requiredSlots: ['2:lunch', '2:dinner', '3:lunch'],
      freshProductsMaxDays: null,
      avoidConsecutiveSameProtein: true,
      avoidConsecutiveSameStarch: true,
    })

    // Saumon should sit between the two chicken dishes
    expect(result[1]?.selectionId).toBe('s1')
  })

  it('preserves occupied manual slots', () => {
    const selections = [makeSelection('r1', 'Riz aux légumes')]
    const result = autoDistributeSelections(
      deliveryDate,
      selections,
      [{ date: '2026-11-17', period: 'lunch' }],
      {
        ...defaultHouseholdPlanningPreferences,
        requiredSlots: ['2:lunch', '3:lunch'],
      },
    )

    expect(result).toEqual([{ date: '2026-11-18', period: 'lunch', selectionId: 'r1' }])
  })
})
