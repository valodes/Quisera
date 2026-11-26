import type { RecipeNutrition } from '@quisera/shared'
import { parseServings } from '../recipes/importer.js'

function parseNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.round(value * 10) / 10
  }
  if (typeof value === 'string') {
    const match = /(\d+(?:[.,]\d+)?)/.exec(value)
    if (match?.[1]) {
      const parsed = Number(match[1].replace(',', '.'))
      if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed * 10) / 10
    }
  }
  return null
}

function decodeMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return value
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function pickFromRecord(record: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    if (key in record) {
      const num = parseNum(record[key])
      if (num !== null) return num
    }
  }
  return null
}

export function parseQuitoqueServings(product: Record<string, unknown>): number | null {
  return (
    parseServings(product['servings']) ??
    parseServings(product['portions']) ??
    parseServings(product['portion']) ??
    parseServings(product['nb_persons']) ??
    parseServings(product['number_of_persons']) ??
    parseServings(product['default_variant_size'])
  )
}

export function parseQuitoqueNutrition(product: Record<string, unknown>): RecipeNutrition | null {
  const candidates: Record<string, unknown>[] = []

  const rawNutri = decodeMaybeJson(
    product['nutritional_values'] ??
      product['nutritional_info'] ??
      product['nutrition'] ??
      product['nutrients'],
  )

  if (rawNutri && typeof rawNutri === 'object' && !Array.isArray(rawNutri)) {
    const obj = rawNutri as Record<string, unknown>
    for (const nestedKey of [
      'per_serving',
      'per_portion',
      'portion',
      'serving',
      'per_100g',
      '100g',
    ]) {
      const nested = obj[nestedKey]
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        candidates.push(nested as Record<string, unknown>)
      }
    }
    candidates.push(obj)
  }
  candidates.push(product)

  const read = (keys: readonly string[]): number | null => {
    for (const candidate of candidates) {
      const value = pickFromRecord(candidate, keys)
      if (value !== null) return value
    }
    return null
  }

  const rawKcal = read(['energy_kcal', 'calories', 'kcal', 'energy', 'energie_kcal', 'energie'])
  const caloriesKcal = rawKcal !== null ? Math.round(rawKcal) : null
  const proteinGrams = read(['proteins', 'protein', 'proteines', 'protein_g'])
  const carbsGrams = read(['carbohydrates', 'carbs', 'glucides', 'carbohydrate_g'])
  const fatGrams = read(['fats', 'fat', 'lipides', 'fat_g', 'matieres_grasses'])
  const fiberGrams = read(['fibers', 'fiber', 'fibres', 'fiber_g'])
  const sugarGrams = read(['sugars', 'sugar', 'sucres', 'sugar_g'])
  const saltGrams = read(['salt', 'sel', 'salt_g'])

  if (
    caloriesKcal === null &&
    proteinGrams === null &&
    carbsGrams === null &&
    fatGrams === null &&
    fiberGrams === null &&
    sugarGrams === null &&
    saltGrams === null
  ) {
    return null
  }

  return {
    caloriesKcal,
    proteinGrams,
    carbsGrams,
    fatGrams,
    fiberGrams,
    sugarGrams,
    saltGrams,
  }
}
