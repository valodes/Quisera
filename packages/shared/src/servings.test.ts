import { describe, expect, it } from 'vitest'
import { scaleIngredientQuantity, scaleIngredientsForServings } from './servings.js'

describe('servings scaling', () => {
  it('scales integer and decimal quantities cleanly with culinary rounding', () => {
    expect(scaleIngredientQuantity('400', 4, 2)).toBe('200')
    expect(scaleIngredientQuantity('3', 6, 2)).toBe('1')
    expect(scaleIngredientQuantity('1,5', 2, 4)).toBe('3')
    expect(scaleIngredientQuantity('1.5', 4, 2)).toBe('0,75')
    expect(scaleIngredientQuantity('250', 3, 2)).toBe('165')
    expect(scaleIngredientQuantity('100', 3, 2)).toBe('65')
    expect(scaleIngredientQuantity('2', 3, 2)).toBe('1,5')
  })

  it('scales ASCII and Unicode fractions cleanly', () => {
    expect(scaleIngredientQuantity('1/2', 2, 4)).toBe('1')
    expect(scaleIngredientQuantity('½', 4, 2)).toBe('0,25')
    expect(scaleIngredientQuantity('3/4', 4, 2)).toBe('0,4')
    expect(scaleIngredientQuantity('1 1/2', 2, 4)).toBe('3')
  })

  it('scales numeric ranges while keeping separator format', () => {
    expect(scaleIngredientQuantity('2-4', 4, 2)).toBe('1-2')
    expect(scaleIngredientQuantity('2 à 3', 2, 4)).toBe('4 à 6')
  })

  it('preserves non-numeric quantities, null, and identical servings', () => {
    expect(scaleIngredientQuantity(null, 4, 2)).toBeNull()
    expect(scaleIngredientQuantity('', 4, 2)).toBe('')
    expect(scaleIngredientQuantity('au goût', 4, 2)).toBe('au goût')
    expect(scaleIngredientQuantity('quelques feuilles', 4, 2)).toBe('quelques feuilles')
    expect(scaleIngredientQuantity('250', 2, 2)).toBe('250')
    expect(scaleIngredientQuantity('250', null, 2)).toBe('250')
    expect(scaleIngredientQuantity('250', 0, 2)).toBe('250')
  })

  it('scales an ingredient list and returns updated servings metadata', () => {
    const ingredients = [
      { name: 'Tomates', quantity: '6', unit: null, notes: null },
      { name: 'Crème fraîche', quantity: '20', unit: 'cl', notes: null },
      { name: 'Sel', quantity: null, unit: null, notes: 'au goût' },
    ]

    const scaled = scaleIngredientsForServings(ingredients, 6, 2)
    expect(scaled).toEqual([
      { name: 'Tomates', quantity: '2', unit: null, notes: null },
      { name: 'Crème fraîche', quantity: '6,5', unit: 'cl', notes: null },
      { name: 'Sel', quantity: null, unit: null, notes: 'au goût' },
    ])
  })
})
