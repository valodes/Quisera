import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { createServingsController } from './useRecipeServings'

describe('createServingsController', () => {
  it('defaults displayed servings to household default and scales ingredients', () => {
    const sourceServings = ref<number | null>(6)
    const defaultServings = ref(2)
    const ingredients = ref([
      { name: 'Tomates', quantity: '6', unit: null, notes: null },
      { name: 'Crème', quantity: '30', unit: 'cl', notes: null },
    ])

    const ctrl = createServingsController(sourceServings, ingredients, defaultServings)

    expect(ctrl.displayServings.value).toBe(2)
    expect(ctrl.isScaled.value).toBe(true)
    expect(ctrl.scaledIngredients.value).toEqual([
      { name: 'Tomates', quantity: '2', unit: null, notes: null },
      { name: 'Crème', quantity: '10', unit: 'cl', notes: null },
    ])

    ctrl.increment()
    expect(ctrl.displayServings.value).toBe(3)
    expect(ctrl.scaledIngredients.value[0]?.quantity).toBe('3')

    ctrl.reset()
    expect(ctrl.displayServings.value).toBe(6)
    expect(ctrl.isScaled.value).toBe(false)
  })

  it('does not scale when sourceServings is missing', () => {
    const sourceServings = ref<number | null>(null)
    const defaultServings = ref(2)
    const ingredients = ref([{ name: 'Tomates', quantity: '3', unit: null, notes: null }])

    const ctrl = createServingsController(sourceServings, ingredients, defaultServings)
    expect(ctrl.canScale.value).toBe(false)
    expect(ctrl.scaledIngredients.value[0]?.quantity).toBe('3')
  })
})
