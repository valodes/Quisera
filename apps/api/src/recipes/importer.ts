import type { RecipeNutrition } from '@quisera/shared'
import { z } from 'zod'

export type ImportedIngredient = {
  name: string
  quantity: string | null
  unit: string | null
  notes: string | null
}

export type ImportedRecipeDraft = {
  title: string
  description: string | null
  imageUrl: string | null
  totalMinutes: number | null
  servings: number | null
  difficulty: string | null
  category: string | null
  tags: string[]
  ingredients: ImportedIngredient[]
  steps: string[]
  caloriesKcal: number | null
  nutrition: RecipeNutrition | null
  sourceUrl: string
  sourceHost: string
  strategy: 'site-adapter' | 'schema-org'
}

export class RecipeImportError extends Error {
  status: number
  constructor(message: string, status = 422) {
    super(message)
    this.name = 'RecipeImportError'
    this.status = status
  }
}

const DEFAULT_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'accept-language': 'fr-FR,fr;q=0.9,en;q=0.5',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

const MAX_HTML_BYTES = 2 * 1024 * 1024

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
  /^\[?fc00:/i,
  /^\[?fd/i,
  /\.local$/i,
  /\.internal$/i,
]

export function validateExternalRecipeUrl(rawUrl: string): URL {
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    throw new RecipeImportError('Adresse URL invalide.', 400)
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new RecipeImportError('Seules les adresses HTTP et HTTPS sont autorisées.', 400)
  }
  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(parsed.hostname))) {
    throw new RecipeImportError('Cette adresse réseau locale n’est pas autorisée.', 400)
  }
  return parsed
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseIsoDurationMinutes(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value)
  }
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  const iso = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(trimmed)
  if (iso) {
    const days = Number(iso[1] ?? 0)
    const hours = Number(iso[2] ?? 0)
    const minutes = Number(iso[3] ?? 0)
    const seconds = Number(iso[4] ?? 0)
    const total = days * 1440 + hours * 60 + minutes + (seconds >= 30 ? 1 : 0)
    return total > 0 ? total : null
  }
  const plain = /^(\d{1,3})\s*(?:min|minutes?)$/i.exec(trimmed)
  return plain?.[1] ? Number(plain[1]) : null
}

const FRACTION_MAP: Record<string, string> = {
  '¼': '0.25',
  '½': '0.5',
  '¾': '0.75',
  '⅓': '0.33',
  '⅔': '0.66',
}

const FRENCH_UNIT_REGEX =
  /^(c\.?\s*à\s*s\.?|c\.?\s*à\s*c\.?|(?:cuill[eè]res?\s+à\s+soupe|cuill[eè]res?\s+à\s+café|kg|mg|g|ml|cl|dl|l|pincées?|gousses?|tranches?|sachets?|bo[îi]tes?|pots?|brins?|bottes?|feuilles?|verres?|tasses?|morceaux?|filets?|escalopes?|pavés?)\b)\.?\s*/i

export function parseFrenchIngredient(rawLine: string): ImportedIngredient {
  let line = decodeHtmlEntities(rawLine).replace(/^[-•*]\s*/, '')
  for (const [glyph, decimal] of Object.entries(FRACTION_MAP)) {
    line = line.replaceAll(glyph, decimal)
  }

  let quantity: string | null = null
  let unit: string | null = null

  const qtyMatch = /^(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?(?:\s*[-à]\s*\d+(?:[.,]\d+)?)?)\s*/.exec(line)
  if (qtyMatch?.[1]) {
    quantity = qtyMatch[1].replace(/\s+/g, '')
    line = line.slice(qtyMatch[0].length)
  }

  if (quantity) {
    const unitMatch = FRENCH_UNIT_REGEX.exec(line)
    if (unitMatch?.[1]) {
      unit = unitMatch[1].trim()
      line = line.slice(unitMatch[0].length)
    }
  }

  line = line.replace(/^(?:de\s+|d['’]\s*)/i, '').trim()

  let notes: string | null = null
  const parenMatch = /\(([^)]+)\)\s*$/.exec(line)
  if (parenMatch?.[1]) {
    notes = parenMatch[1].trim()
    line = line.slice(0, parenMatch.index).trim()
  }

  return {
    name: (line || decodeHtmlEntities(rawLine)).slice(0, 140),
    quantity: quantity ? quantity.slice(0, 40) : null,
    unit: unit ? unit.slice(0, 40) : null,
    notes: notes ? notes.slice(0, 140) : null,
  }
}

function isRecipeType(value: unknown): boolean {
  if (typeof value === 'string') return value.toLowerCase() === 'recipe'
  if (Array.isArray(value)) return value.some((entry) => isRecipeType(entry))
  return false
}

function findRecipeNode(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = findRecipeNode(entry)
      if (found) return found
    }
    return null
  }
  const record = node as Record<string, unknown>
  if (isRecipeType(record['@type'])) return record
  if (Array.isArray(record['@graph'])) {
    const found = findRecipeNode(record['@graph'])
    if (found) return found
  }
  return null
}

function extractImageUrl(value: unknown, baseUrl: string): string | null {
  const resolveUrl = (candidate: unknown): string | null => {
    if (typeof candidate !== 'string' || !candidate.trim()) return null
    try {
      const url = new URL(candidate.trim(), baseUrl)
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
    } catch {
      return null
    }
  }

  if (typeof value === 'string') return resolveUrl(value)
  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = extractImageUrl(item, baseUrl)
      if (resolved) return resolved
    }
    return null
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return resolveUrl(record['url'] ?? record['contentUrl'])
  }
  return null
}

function extractInstructions(value: unknown): string[] {
  const steps: string[] = []
  const visit = (node: unknown) => {
    if (!node) return
    if (typeof node === 'string') {
      const cleaned = decodeHtmlEntities(node.replace(/<[^>]+>/g, ' '))
      if (cleaned) steps.push(cleaned)
      return
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }
    if (typeof node === 'object') {
      const record = node as Record<string, unknown>
      if (Array.isArray(record['itemListElement'])) {
        visit(record['itemListElement'])
        return
      }
      const text = record['text'] ?? record['name']
      if (typeof text === 'string') visit(text)
    }
  }
  visit(value)
  return steps.slice(0, 60)
}

function parseNumericValue(value: unknown): number | null {
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

export function parseServings(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 30) {
    return value
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = parseServings(entry)
      if (found !== null) return found
    }
    return null
  }
  if (typeof value === 'string') {
    const match = /(\d{1,2})/.exec(value)
    if (match?.[1]) {
      const parsed = Number(match[1])
      if (parsed >= 1 && parsed <= 30) return parsed
    }
  }
  return null
}

export function extractNutrition(nutrition: unknown): RecipeNutrition | null {
  if (!nutrition || typeof nutrition !== 'object') return null
  const record = nutrition as Record<string, unknown>
  const caloriesRaw = parseNumericValue(record['calories'])
  const caloriesKcal = caloriesRaw !== null ? Math.round(caloriesRaw) : null
  const proteinGrams = parseNumericValue(record['proteinContent'])
  const carbsGrams = parseNumericValue(record['carbohydrateContent'])
  const fatGrams = parseNumericValue(record['fatContent'])
  const fiberGrams = parseNumericValue(record['fiberContent'])
  const sugarGrams = parseNumericValue(record['sugarContent'])

  let saltGrams = parseNumericValue(record['saltContent'])
  if (saltGrams === null && record['sodiumContent'] !== undefined) {
    const rawSodium = record['sodiumContent']
    const sodiumNum = parseNumericValue(rawSodium)
    if (sodiumNum !== null) {
      const isMg = typeof rawSodium === 'string' && /mg/i.test(rawSodium)
      const sodiumGrams = isMg || sodiumNum > 20 ? sodiumNum / 1000 : sodiumNum
      saltGrams = Math.round(sodiumGrams * 2.5 * 10) / 10
    }
  }

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

function extractTags(keywords: unknown, cuisine: unknown): string[] {
  const values: string[] = []
  const add = (input: unknown) => {
    if (typeof input === 'string') {
      for (const part of input.split(',')) {
        const cleaned = decodeHtmlEntities(part)
        if (cleaned && cleaned.length <= 40) values.push(cleaned)
      }
    } else if (Array.isArray(input)) {
      for (const item of input) add(item)
    }
  }
  add(keywords)
  add(cuisine)
  return [...new Set(values)].slice(0, 12)
}

export function extractSchemaOrgRecipe(
  html: string,
  sourceUrl: string,
): ImportedRecipeDraft | null {
  const ldMatches = [
    ...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ]

  let recipeNode: Record<string, unknown> | null = null
  for (const match of ldMatches) {
    const rawJson = match[1]?.trim()
    if (!rawJson) continue
    try {
      const parsed: unknown = JSON.parse(rawJson)
      const found = findRecipeNode(parsed)
      if (found) {
        recipeNode = found
        break
      }
    } catch {
      // Ignore malformed JSON-LD blocks and continue scanning
    }
  }

  if (!recipeNode) return null

  const title = typeof recipeNode['name'] === 'string' ? decodeHtmlEntities(recipeNode['name']) : ''
  if (!title) return null

  const description =
    typeof recipeNode['description'] === 'string' && recipeNode['description'].trim()
      ? decodeHtmlEntities(recipeNode['description'].replace(/<[^>]+>/g, ' ')).slice(0, 1200)
      : null

  const rawIngredients = z
    .array(z.string())
    .safeParse(recipeNode['recipeIngredient'] ?? recipeNode['ingredients'] ?? [])
  const ingredients = (rawIngredients.success ? rawIngredients.data : [])
    .map((line) => parseFrenchIngredient(line))
    .filter((item) => item.name.length > 0)
    .slice(0, 80)

  const steps = extractInstructions(recipeNode['recipeInstructions'])

  const totalMinutes =
    parseIsoDurationMinutes(recipeNode['totalTime']) ??
    (() => {
      const prep = parseIsoDurationMinutes(recipeNode['prepTime']) ?? 0
      const cook = parseIsoDurationMinutes(recipeNode['cookTime']) ?? 0
      return prep + cook > 0 ? prep + cook : null
    })()

  const rawCategory = recipeNode['recipeCategory']
  const category =
    typeof rawCategory === 'string'
      ? decodeHtmlEntities(rawCategory).slice(0, 60)
      : Array.isArray(rawCategory) && typeof rawCategory[0] === 'string'
        ? decodeHtmlEntities(rawCategory[0]).slice(0, 60)
        : null

  const parsedUrl = new URL(sourceUrl)
  const nutrition = extractNutrition(recipeNode['nutrition'])
  const servings = parseServings(recipeNode['recipeYield'])
  return {
    title: title.slice(0, 140),
    description,
    imageUrl: extractImageUrl(recipeNode['image'], sourceUrl),
    totalMinutes,
    servings,
    difficulty: null,
    category,
    tags: extractTags(recipeNode['keywords'], recipeNode['recipeCuisine']),
    ingredients,
    steps,
    caloriesKcal: nutrition?.caloriesKcal ?? null,
    nutrition,
    sourceUrl,
    sourceHost: parsedUrl.hostname.replace(/^www\./, ''),
    strategy: 'schema-org',
  }
}

export async function importRecipeFromUrl(
  rawUrl: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<ImportedRecipeDraft> {
  const url = validateExternalRecipeUrl(rawUrl)

  let response: Response
  try {
    response = await fetchImplementation(url.toString(), {
      headers: DEFAULT_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new RecipeImportError('Impossible de joindre ce site pour le moment.', 502)
  }

  if (!response.ok) {
    throw new RecipeImportError(
      `Le site a répondu avec une erreur (${response.status}). Vérifiez le lien.`,
      502,
    )
  }

  const contentLength = Number(response.headers.get('content-length') ?? '0')
  if (contentLength > MAX_HTML_BYTES) {
    throw new RecipeImportError('Cette page est trop volumineuse pour être importée.', 413)
  }

  const html = (await response.text()).slice(0, MAX_HTML_BYTES)
  const finalUrl = response.url || url.toString()

  const extracted = extractSchemaOrgRecipe(html, finalUrl)
  if (!extracted) {
    throw new RecipeImportError(
      'Aucune donnée recette structurée (schema.org/Recipe) n’a été trouvée sur cette page. Vous pouvez la créer manuellement.',
      422,
    )
  }

  if (extracted.ingredients.length === 0 || extracted.steps.length === 0) {
    throw new RecipeImportError(
      'La recette trouvée sur cette page est incomplète (ingrédients ou étapes manquants).',
      422,
    )
  }

  return extracted
}
