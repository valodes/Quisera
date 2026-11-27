import MiniSearch from 'minisearch'
import { parseIngredient } from 'parse-ingredient'

export type FridgeZone = 'fridge' | 'pantry' | 'freezer'

export type ParsedFridgeInput = {
  name: string
  quantity: string | null
  unit: string | null
}

export type FridgeItemForMatching = {
  id: string
  name: string
  zone: FridgeZone
  expiresOn: string | null
}

export type RecipeForMatching = {
  id: string
  ingredients: readonly string[]
}

export type FridgeMatchBucket = 'ready' | 'almost' | 'partial'

export type RecipeFridgeMatch = {
  recipeId: string
  bucket: FridgeMatchBucket
  matchedCount: number
  totalCount: number
  coverage: number
  matchedIngredients: string[]
  missingIngredients: string[]
  usesExpiringItems: boolean
  expiringMatches: string[]
}

const FRENCH_UNITS = new Set([
  'g',
  'gr',
  'gramme',
  'grammes',
  'kg',
  'kilo',
  'kilos',
  'mg',
  'l',
  'cl',
  'dl',
  'ml',
  'litre',
  'litres',
  'boite',
  'boites',
  'boîte',
  'boîtes',
  'pot',
  'pots',
  'sachet',
  'sachets',
  'tranche',
  'tranches',
  'paquet',
  'paquets',
  'bouteille',
  'bouteilles',
  'barquette',
  'barquettes',
  'bocal',
  'bocaux',
  'botte',
  'bottes',
  'gousse',
  'gousses',
  'brin',
  'brins',
  'cas',
  'cac',
  'cs',
  'cc',
  'cuillere',
  'cuilleres',
  'cuillère',
  'cuillères',
  'verre',
  'verres',
  'pincee',
  'pincees',
  'pincée',
  'pincées',
])

const STOP_WORDS = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'un',
  'une',
  'et',
  'ou',
  'au',
  'aux',
  'en',
  'a',
  'avec',
  'sans',
  'frais',
  'fraiche',
  'fraiches',
  'bio',
  'biologique',
  'hache',
  'hachee',
  'haches',
  'rape',
  'rapee',
  'rapes',
  'coupe',
  'coupee',
  'coupes',
  'emince',
  'emincee',
  'moulu',
  'moulue',
  'doux',
  'douce',
  'noir',
  'noire',
  'blanc',
  'blanche',
  'entier',
  'entiere',
  'entiers',
  'entieres',
  'nature',
  'fine',
  'fin',
  'gros',
  'grosse',
  'petit',
  'petite',
  'moyen',
  'moyenne',
  'grand',
  'grande',
  'cru',
  'crue',
  'cuit',
  'cuite',
  'seche',
  'sechee',
  'seches',
  'surgele',
  'surgelee',
  'surgeles',
  'conserve',
  'liquide',
  'epaisse',
  'epais',
])

const PANTRY_STAPLES = new Set([
  'sel',
  'poivre',
  'eau',
  'huile',
  'huile olive',
  'huile tournesol',
  'huile colza',
  'huile neutre',
  'beurre',
  'sucre',
  'vinaigre',
  'vinaigre balsamique',
  'vinaigre cidre',
  'vinaigre vin',
  'farine',
  'moutarde',
  'ail poudre',
  'oignon poudre',
  'herbe provence',
  'paprika',
  'cumin',
  'curry',
])

export function foldFrench(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('œ', 'oe')
    .replaceAll('æ', 'ae')
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[’'`]/g, ' ')
    .replaceAll(/[^a-z0-9\s]/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

const INVARIABLE_S = new Set([
  'radis',
  'mais',
  'coulis',
  'anis',
  'couscous',
  'humus',
  'houmous',
  'jus',
  'riz',
  'brie',
])

function singularizeFrenchWord(word: string): string {
  if (word.length <= 3 || INVARIABLE_S.has(word)) return word
  if (word.endsWith('eaux') || word.endsWith('aux')) {
    return word.slice(0, -1)
  }
  if (word.endsWith('eux') && word !== 'deux') {
    return word
  }
  if (word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1)
  }
  if (word.endsWith('x') && word.length > 4) {
    return word.slice(0, -1)
  }
  return word
}

export function normalizeIngredientForMatch(raw: string): string {
  const folded = foldFrench(raw)
    .replace(/\b(d|l)\s+/g, '')
    .trim()
  if (!folded) return ''

  const tokens = folded
    .split(' ')
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token))
    .map(singularizeFrenchWord)

  if (tokens.length === 0) {
    return folded.split(' ').map(singularizeFrenchWord).join(' ')
  }
  return tokens.join(' ')
}

export function isPantryStaple(raw: string): boolean {
  const normalized = normalizeIngredientForMatch(raw)
  if (!normalized) return true
  if (PANTRY_STAPLES.has(normalized)) return true
  const tokens = normalized.split(' ')
  if (tokens.length === 1 && PANTRY_STAPLES.has(tokens[0]!)) return true
  if (tokens.every((token) => PANTRY_STAPLES.has(token))) return true
  return false
}

function capitalizeFirst(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

function stripLeadingFrenchPreposition(value: string): string {
  return value.replace(/^(?:de\s+|du\s+|des\s+|d['’]\s*)/i, '').trim()
}

export function parseFridgeQuickInput(rawInput: string): ParsedFridgeInput {
  const trimmed = rawInput.trim().replace(/\s+/g, ' ')
  if (!trimmed) {
    return { name: '', quantity: null, unit: null }
  }

  // Handle French decimal/attached units cleanly (e.g. "250g de poulet", "1,5 L de lait", "2 boîtes de thon")
  const explicitMatch =
    /^(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)\s*([a-zA-ZÀ-ÿ]+)?(?:\s+(?:de\s+|du\s+|des\s+|d['’]\s*)?(.+))?$/i.exec(
      trimmed,
    )

  if (explicitMatch) {
    const qty = explicitMatch[1]!.trim()
    const maybeUnit = explicitMatch[2]?.trim() ?? null
    const rest = explicitMatch[3]?.trim() ?? null

    if (maybeUnit && rest && FRENCH_UNITS.has(foldFrench(maybeUnit))) {
      return {
        name: capitalizeFirst(stripLeadingFrenchPreposition(rest)),
        quantity: qty,
        unit: maybeUnit,
      }
    }

    if (maybeUnit && !rest) {
      return {
        name: capitalizeFirst(stripLeadingFrenchPreposition(maybeUnit)),
        quantity: qty,
        unit: null,
      }
    }

    if (maybeUnit && rest) {
      return {
        name: capitalizeFirst(stripLeadingFrenchPreposition(`${maybeUnit} ${rest}`)),
        quantity: qty,
        unit: null,
      }
    }
  }

  const parsed = parseIngredient(trimmed.replace(',', '.'))[0]
  if (parsed && parsed.description) {
    const quantity = parsed.quantity !== null ? String(parsed.quantity).replace('.', ',') : null
    const unit = parsed.unitOfMeasure?.trim() || null
    const name = capitalizeFirst(stripLeadingFrenchPreposition(parsed.description))
    if (name) {
      return { name, quantity, unit }
    }
  }

  return {
    name: capitalizeFirst(trimmed),
    quantity: null,
    unit: null,
  }
}

function isExpiringSoon(expiresOn: string | null, today: string): boolean {
  if (!expiresOn) return false
  const expMs = Date.parse(`${expiresOn}T00:00:00Z`)
  const todayMs = Date.parse(`${today}T00:00:00Z`)
  if (!Number.isFinite(expMs) || !Number.isFinite(todayMs)) return false
  const diffDays = Math.floor((expMs - todayMs) / 86_400_000)
  return diffDays <= 3
}

function tokensMatch(fridgeNorm: string, recipeNorm: string): boolean {
  if (!fridgeNorm || !recipeNorm) return false
  if (fridgeNorm === recipeNorm) return true
  const fridgeTokens = fridgeNorm.split(' ')
  const recipeTokens = new Set(recipeNorm.split(' '))
  if (fridgeTokens.every((token) => recipeTokens.has(token))) return true
  const fridgeSet = new Set(fridgeTokens)
  const recipeTokenList = [...recipeTokens]
  if (recipeTokenList.every((token) => fridgeSet.has(token))) return true
  return false
}

export function matchRecipesWithFridge(
  fridgeItems: readonly FridgeItemForMatching[],
  recipes: readonly RecipeForMatching[],
  options: { today: string; includeStaples?: boolean },
): RecipeFridgeMatch[] {
  if (fridgeItems.length === 0 || recipes.length === 0) return []

  const includeStaples = options.includeStaples ?? false
  const normalizedFridge = fridgeItems
    .map((item) => ({
      ...item,
      normalized: normalizeIngredientForMatch(item.name),
      expiringSoon: isExpiringSoon(item.expiresOn, options.today),
    }))
    .filter((item) => item.normalized.length > 0)

  if (normalizedFridge.length === 0) return []

  // Build MiniSearch index over fridge items for fuzzy/prefix fallback
  const miniSearch = new MiniSearch<{ id: string; normalized: string }>({
    fields: ['normalized'],
    storeFields: ['id', 'normalized'],
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      combineWith: 'AND',
    },
  })
  miniSearch.addAll(
    normalizedFridge.map((item) => ({
      id: item.id,
      normalized: item.normalized,
    })),
  )
  const fridgeById = new Map(normalizedFridge.map((item) => [item.id, item]))

  function findFridgeMatch(recipeIngredient: string) {
    const recipeNorm = normalizeIngredientForMatch(recipeIngredient)
    if (!recipeNorm) return null

    for (const item of normalizedFridge) {
      if (tokensMatch(item.normalized, recipeNorm)) {
        return item
      }
    }

    const fuzzyHit = miniSearch.search(recipeNorm)[0]
    if (fuzzyHit && fuzzyHit.score >= 1) {
      return fridgeById.get(String(fuzzyHit.id)) ?? null
    }
    return null
  }

  const results: RecipeFridgeMatch[] = []

  for (const recipe of recipes) {
    const relevant = includeStaples
      ? recipe.ingredients
      : recipe.ingredients.filter((ingredient) => !isPantryStaple(ingredient))

    if (relevant.length === 0) continue

    const matchedIngredients: string[] = []
    const missingIngredients: string[] = []
    const expiringMatches: string[] = []

    for (const ingredient of relevant) {
      const hit = findFridgeMatch(ingredient)
      if (hit) {
        matchedIngredients.push(ingredient)
        if (hit.expiringSoon) {
          expiringMatches.push(hit.name)
        }
      } else {
        missingIngredients.push(ingredient)
      }
    }

    if (matchedIngredients.length === 0) continue

    const bucket: FridgeMatchBucket =
      missingIngredients.length === 0
        ? 'ready'
        : missingIngredients.length <= 2
          ? 'almost'
          : 'partial'

    results.push({
      recipeId: recipe.id,
      bucket,
      matchedCount: matchedIngredients.length,
      totalCount: relevant.length,
      coverage: matchedIngredients.length / relevant.length,
      matchedIngredients,
      missingIngredients,
      usesExpiringItems: expiringMatches.length > 0,
      expiringMatches: [...new Set(expiringMatches)],
    })
  }

  const bucketRank: Record<FridgeMatchBucket, number> = {
    ready: 0,
    almost: 1,
    partial: 2,
  }

  return results.toSorted((a, b) => {
    if (bucketRank[a.bucket] !== bucketRank[b.bucket]) {
      return bucketRank[a.bucket] - bucketRank[b.bucket]
    }
    if (a.usesExpiringItems !== b.usesExpiringItems) {
      return a.usesExpiringItems ? -1 : 1
    }
    if (a.missingIngredients.length !== b.missingIngredients.length) {
      return a.missingIngredients.length - b.missingIngredients.length
    }
    if (a.coverage !== b.coverage) {
      return b.coverage - a.coverage
    }
    return b.matchedCount - a.matchedCount
  })
}

export function buildWebSearchCombinations(ingredients: readonly string[]): string[][] {
  const unique = [
    ...new Set(ingredients.map((item) => item.trim()).filter((item) => item.length > 0)),
  ].slice(0, 3)

  const combos: string[][] = []
  const totalMasks = 1 << unique.length
  for (let mask = 1; mask < totalMasks; mask++) {
    const subset: string[] = []
    for (let index = 0; index < unique.length; index++) {
      if ((mask & (1 << index)) !== 0) {
        subset.push(unique[index]!)
      }
    }
    combos.push(subset)
  }

  return combos.toSorted((a, b) => {
    if (b.length !== a.length) return b.length - a.length
    for (let i = 0; i < a.length; i++) {
      const idxA = unique.indexOf(a[i]!)
      const idxB = unique.indexOf(b[i]!)
      if (idxA !== idxB) return idxA - idxB
    }
    return 0
  })
}
