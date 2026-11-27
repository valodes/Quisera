// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  buildWebSearchCombinations,
  isPantryStaple,
  matchRecipesWithFridge,
  normalizeIngredientForMatch,
  parseFridgeQuickInput,
} from './matcher.js'

describe('fridge quick-add parser', () => {
  it('parses French quantities, units and ingredient names cleanly', () => {
    expect(parseFridgeQuickInput('3 tomates')).toEqual({
      name: 'Tomates',
      quantity: '3',
      unit: null,
    })
    expect(parseFridgeQuickInput('250g de poulet')).toEqual({
      name: 'Poulet',
      quantity: '250',
      unit: 'g',
    })
    expect(parseFridgeQuickInput('1,5 L de lait')).toEqual({
      name: 'Lait',
      quantity: '1,5',
      unit: 'L',
    })
    expect(parseFridgeQuickInput('crème fraîche')).toEqual({
      name: 'Crème fraîche',
      quantity: null,
      unit: null,
    })
    expect(parseFridgeQuickInput('2 boîtes de thon')).toEqual({
      name: 'Thon',
      quantity: '2',
      unit: 'boîtes',
    })
  })
})

describe('ingredient normalization & staples', () => {
  it('folds accents, ligatures, plurals and stop words', () => {
    expect(normalizeIngredientForMatch('Bœuf haché bio')).toBe('boeuf')
    expect(normalizeIngredientForMatch('Tomates fraîches')).toBe('tomate')
    expect(normalizeIngredientForMatch('Œufs')).toBe('oeuf')
    expect(normalizeIngredientForMatch('Poireaux')).toBe('poireau')
    expect(normalizeIngredientForMatch("Gousses d'ail")).toBe('gousse ail')
  })

  it('recognizes common pantry staples', () => {
    expect(isPantryStaple('Sel')).toBe(true)
    expect(isPantryStaple('Poivre noir moulu')).toBe(true)
    expect(isPantryStaple("Huile d'olive")).toBe(true)
    expect(isPantryStaple('Eau')).toBe(true)
    expect(isPantryStaple('Beurre doux')).toBe(true)
    expect(isPantryStaple('Tomates')).toBe(false)
    expect(isPantryStaple('Blanc de poulet')).toBe(false)
  })
})

describe('fridge recipe matcher', () => {
  const recipes = [
    {
      id: 'rec-ready',
      ingredients: ['Tomates', 'Oeufs', 'Sel', 'Poivre'],
    },
    {
      id: 'rec-almost',
      ingredients: ['Blanc de poulet', 'Crème fraîche', 'Parmesan', "Huile d'olive"],
    },
    {
      id: 'rec-expiring',
      ingredients: ['Courgette', 'Oeufs', 'Sel'],
    },
    {
      id: 'rec-partial',
      ingredients: ['Tomates', 'Aubergine', 'Mozzarella', 'Basilic', 'Pignons'],
    },
    {
      id: 'rec-none',
      ingredients: ['Saumon', 'Avocat', 'Riz'],
    },
  ]

  const fridgeItems = [
    { id: 'f1', name: 'Tomates', zone: 'fridge' as const, expiresOn: '2026-12-10' },
    { id: 'f2', name: 'Œufs', zone: 'fridge' as const, expiresOn: null },
    { id: 'f3', name: 'Poulet', zone: 'fridge' as const, expiresOn: '2026-12-05' },
    { id: 'f4', name: 'Crème fraîche', zone: 'fridge' as const, expiresOn: null },
    { id: 'f5', name: 'Courgettes', zone: 'fridge' as const, expiresOn: '2026-11-28' },
  ]

  it('buckets ready, almost, and partial recipes and boosts expiring ingredients', () => {
    const matches = matchRecipesWithFridge(fridgeItems, recipes, {
      today: '2026-11-27',
      includeStaples: false,
    })

    expect(matches.map((m) => m.recipeId)).toEqual([
      'rec-expiring',
      'rec-ready',
      'rec-almost',
      'rec-partial',
    ])

    const expiring = matches.find((m) => m.recipeId === 'rec-expiring')!
    expect(expiring.bucket).toBe('ready')
    expect(expiring.usesExpiringItems).toBe(true)
    expect(expiring.missingIngredients).toEqual([])

    const ready = matches.find((m) => m.recipeId === 'rec-ready')!
    expect(ready.bucket).toBe('ready')
    expect(ready.matchedCount).toBe(2)
    expect(ready.totalCount).toBe(2)

    const almost = matches.find((m) => m.recipeId === 'rec-almost')!
    expect(almost.bucket).toBe('almost')
    expect(almost.missingIngredients).toEqual(['Parmesan'])

    const partial = matches.find((m) => m.recipeId === 'rec-partial')!
    expect(partial.bucket).toBe('partial')
    expect(partial.missingIngredients).toHaveLength(4)
  })

  it('counts pantry staples as missing when includeStaples is true', () => {
    const matches = matchRecipesWithFridge(fridgeItems, [recipes[0]!], {
      today: '2026-11-27',
      includeStaples: true,
    })
    expect(matches[0]?.bucket).toBe('almost')
    expect(matches[0]?.missingIngredients).toEqual(['Sel', 'Poivre'])
  })
})

describe('web search combinatorics', () => {
  it('generates all non-empty subsets for up to 3 ingredients ordered by size desc', () => {
    expect(buildWebSearchCombinations(['Tomate', 'Citron', 'Kiwi'])).toEqual([
      ['Tomate', 'Citron', 'Kiwi'],
      ['Tomate', 'Citron'],
      ['Tomate', 'Kiwi'],
      ['Citron', 'Kiwi'],
      ['Tomate'],
      ['Citron'],
      ['Kiwi'],
    ])

    expect(buildWebSearchCombinations(['Tomate', 'Citron', 'Kiwi', 'Poulet'])).toHaveLength(7)
    expect(buildWebSearchCombinations(['Tomate'])).toEqual([['Tomate']])
  })
})
