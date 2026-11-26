import type { RecipeNutrition } from '@quisera/shared'
import * as cheerio from 'cheerio'
import { decodeHTML } from 'entities'
import ipaddr from 'ipaddr.js'
import { lookup } from 'node:dns/promises'
import { parseIngredient, type ParseIngredientOptions } from 'parse-ingredient'
import { parse as parseIsoDuration } from 'tinyduration'
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
const MAX_REDIRECT_HOPS = 5

const BLOCKED_HOSTNAME_SUFFIXES = [/^localhost$/i, /\.localhost$/i, /\.local$/i, /\.internal$/i]

function isPublicIpAddress(rawIp: string): boolean {
  const normalized = rawIp.replace(/^\[|\]$/g, '').split('%')[0] ?? ''
  if (!ipaddr.isValid(normalized)) return false
  return ipaddr.process(normalized).range() === 'unicast'
}

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
  const bareHost = parsed.hostname.replace(/^\[|\]$/g, '')
  if (BLOCKED_HOSTNAME_SUFFIXES.some((pattern) => pattern.test(bareHost))) {
    throw new RecipeImportError('Cette adresse réseau locale n’est pas autorisée.', 400)
  }
  if (ipaddr.isValid(bareHost) && !isPublicIpAddress(bareHost)) {
    throw new RecipeImportError('Cette adresse réseau locale n’est pas autorisée.', 400)
  }
  return parsed
}

async function assertPublicDnsResolution(hostname: string): Promise<void> {
  const bareHost = hostname.replace(/^\[|\]$/g, '')
  if (ipaddr.isValid(bareHost)) {
    if (!isPublicIpAddress(bareHost)) {
      throw new RecipeImportError('Cette adresse réseau locale n’est pas autorisée.', 400)
    }
    return
  }
  const records = await lookup(bareHost, { all: true })
  if (records.length === 0 || records.some((record) => !isPublicIpAddress(record.address))) {
    throw new RecipeImportError('Cette adresse réseau locale n’est pas autorisée.', 400)
  }
}

export function decodeHtmlEntities(value: string): string {
  return decodeHTML(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function stripHtmlToText(value: string): string {
  if (!value.includes('<') && !value.includes('&')) {
    return value.replace(/\s+/g, ' ').trim()
  }
  const $ = cheerio.load(`<div>${value}</div>`, null, false)
  $('script, style, svg, iframe, object').remove()
  $('br').replaceWith(' ')
  return decodeHtmlEntities($.text())
}

export function parseIsoDurationMinutes(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value)
  }
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  if (/^P/i.test(trimmed)) {
    try {
      const d = parseIsoDuration(trimmed.toUpperCase())
      const totalMinutes =
        (d.years ?? 0) * 525_600 +
        (d.months ?? 0) * 43_200 +
        (d.weeks ?? 0) * 10_080 +
        (d.days ?? 0) * 1_440 +
        (d.hours ?? 0) * 60 +
        (d.minutes ?? 0) +
        ((d.seconds ?? 0) >= 30 ? 1 : (d.seconds ?? 0) > 0 ? Math.round((d.seconds ?? 0) / 60) : 0)
      const rounded = Math.round(totalMinutes)
      return rounded > 0 ? rounded : null
    } catch {
      return null
    }
  }

  const hourMin = /^(\d{1,2})\s*h(?:\s*(\d{1,2})\s*(?:min|minutes?)?)?$/i.exec(trimmed)
  if (hourMin?.[1]) {
    const total = Number(hourMin[1]) * 60 + Number(hourMin[2] ?? 0)
    return total > 0 ? total : null
  }

  const plain = /^(\d{1,3})\s*(?:min|minutes?)$/i.exec(trimmed)
  return plain?.[1] ? Number(plain[1]) : null
}

const FRENCH_INGREDIENT_OPTIONS: ParseIngredientOptions = {
  ignoreUOMs: ['c', 'c.', 'C', 'C.', 't', 't.', 'T', 'T.', 'm', 'm.', 'small', 'medium', 'large'],
  additionalUOMs: {
    'c. à s.': { short: 'c. à s.', plural: 'c. à s.', alternates: ['__cas__'] },
    'c. à soupe': { short: 'c. à soupe', plural: 'c. à soupe', alternates: ['__cas_long__'] },
    'c. à c.': { short: 'c. à c.', plural: 'c. à c.', alternates: ['__cac__'] },
    'c. à café': { short: 'c. à café', plural: 'c. à café', alternates: ['__cac_long__'] },
    gousse: { short: 'gousse', plural: 'gousses', alternates: [] },
    pincée: { short: 'pincée', plural: 'pincées', alternates: ['pincee', 'pincees'] },
    tranche: { short: 'tranche', plural: 'tranches', alternates: [] },
    sachet: { short: 'sachet', plural: 'sachets', alternates: [] },
    boîte: { short: 'boîte', plural: 'boîtes', alternates: ['boite', 'boites'] },
    pot: { short: 'pot', plural: 'pots', alternates: [] },
    brin: { short: 'brin', plural: 'brins', alternates: [] },
    botte: { short: 'botte', plural: 'bottes', alternates: [] },
    feuille: { short: 'feuille', plural: 'feuilles', alternates: [] },
    verre: { short: 'verre', plural: 'verres', alternates: [] },
    tasse: { short: 'tasse', plural: 'tasses', alternates: [] },
    morceau: { short: 'morceau', plural: 'morceaux', alternates: [] },
    filet: { short: 'filet', plural: 'filets', alternates: [] },
    escalope: { short: 'escalope', plural: 'escalopes', alternates: [] },
    pavé: { short: 'pavé', plural: 'pavés', alternates: ['pave', 'paves'] },
    pièce: { short: 'pièce', plural: 'pièces', alternates: ['piece', 'pieces'] },
    branche: { short: 'branche', plural: 'branches', alternates: [] },
    bouquet: { short: 'bouquet', plural: 'bouquets', alternates: [] },
    poignée: { short: 'poignée', plural: 'poignées', alternates: ['poignee', 'poignees'] },
  },
  groupHeaderPatterns: ['For', /^Pour\s/iu],
  rangeSeparators: ['to', 'or', 'à'],
  leadingQuantityPrefixes: ['environ', 'env.'],
  descriptionStripPrefixes: [
    'of',
    'de',
    /^d['’]\s*/iu,
    /^de\s+l[ae'’]\s*/iu,
    /^du\s+/iu,
    /^des\s+/iu,
  ],
}

const SPOON_TOKEN_MAP: Record<string, string> = {
  __cas__: 'c. à s.',
  __cas_long__: 'c. à soupe',
  __cac__: 'c. à c.',
  __cac_long__: 'c. à café',
}

export function parseFrenchIngredient(rawLine: string): ImportedIngredient {
  const cleanedLine = decodeHtmlEntities(rawLine)
    .replace(/^[-•*]\s*/, '')
    .replace(/(\d),(\d)/g, '$1.$2')

  const tokenizedLine = cleanedLine
    .replace(/\b(?:cuill[eè]res?\s+à\s+soupe|c\.?\s*à\s*soupe)\b/gi, '__cas_long__')
    .replace(/\bc\.?\s*à\s*s\.?(?=\s|$)/gi, '__cas__')
    .replace(/\b(?:cuill[eè]res?\s+à\s+caf[eé]|c\.?\s*à\s*caf[eé])\b/gi, '__cac_long__')
    .replace(/\bc\.?\s*à\s*c\.?(?=\s|$)/gi, '__cac__')

  const [parsed] = parseIngredient(tokenizedLine, FRENCH_INGREDIENT_OPTIONS)
  if (!parsed || parsed.isGroupHeader) {
    return {
      name: cleanedLine.slice(0, 140),
      quantity: null,
      unit: null,
      notes: null,
    }
  }

  let description = parsed.description
    .replace(/__(?:cas|cac)(?:_long)?__/g, (token) => SPOON_TOKEN_MAP[token] ?? token)
    .replace(/^(?:de\s+|d['’]\s*)/i, '')
    .trim()
  let notes: string | null = null
  const parenMatch = /\(([^)]+)\)\s*$/.exec(description)
  if (parenMatch?.[1]) {
    notes = parenMatch[1].trim()
    description = description.slice(0, parenMatch.index).trim()
  }

  const quantity =
    parsed.quantity !== null
      ? parsed.quantity2 !== null
        ? `${parsed.quantity}-${parsed.quantity2}`
        : String(parsed.quantity)
      : null

  const unit = parsed.unitOfMeasure
    ? (SPOON_TOKEN_MAP[parsed.unitOfMeasure] ?? parsed.unitOfMeasure).slice(0, 40)
    : null

  return {
    name: (description || cleanedLine).slice(0, 140),
    quantity: quantity ? quantity.slice(0, 40) : null,
    unit,
    notes: notes ? notes.slice(0, 140) : null,
  }
}

function isRecipeType(value: unknown): boolean {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === 'recipe' || normalized.endsWith('/recipe')
  }
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
  for (const nestedKey of ['@graph', 'mainEntity', 'mainEntityOfPage']) {
    if (record[nestedKey]) {
      const found = findRecipeNode(record[nestedKey])
      if (found) return found
    }
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
      const cleaned = stripHtmlToText(node)
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

function extractMicrodataRecipeNode($: cheerio.CheerioAPI): Record<string, unknown> | null {
  const root = $('[itemtype*="schema.org/Recipe" i]').first()
  if (root.length === 0) return null

  const propText = (prop: string) =>
    root.find(`[itemprop="${prop}"]`).first().attr('content') ??
    decodeHtmlEntities(root.find(`[itemprop="${prop}"]`).first().text())

  const name = propText('name')
  if (!name) return null

  const recipeIngredient = root
    .find('[itemprop="recipeIngredient"], [itemprop="ingredients"]')
    .map((_, el) => $(el).attr('content') ?? decodeHtmlEntities($(el).text()))
    .get()
    .filter(Boolean)

  const recipeInstructions = root
    .find('[itemprop="recipeInstructions"]')
    .map((_, el) => $(el).attr('content') ?? decodeHtmlEntities($(el).text()))
    .get()
    .filter(Boolean)

  const imageEl = root.find('[itemprop="image"]').first()
  const image = imageEl.attr('content') ?? imageEl.attr('src') ?? undefined

  return {
    '@type': 'Recipe',
    name,
    description: propText('description') || undefined,
    image,
    totalTime:
      root.find('[itemprop="totalTime"]').first().attr('datetime') ?? propText('totalTime'),
    prepTime: root.find('[itemprop="prepTime"]').first().attr('datetime') ?? propText('prepTime'),
    cookTime: root.find('[itemprop="cookTime"]').first().attr('datetime') ?? propText('cookTime'),
    recipeYield: propText('recipeYield') || undefined,
    recipeCategory: propText('recipeCategory') || undefined,
    keywords: propText('keywords') || undefined,
    recipeCuisine: propText('recipeCuisine') || undefined,
    recipeIngredient,
    recipeInstructions,
  }
}

export function extractSchemaOrgRecipe(
  html: string,
  sourceUrl: string,
): ImportedRecipeDraft | null {
  const $ = cheerio.load(html)

  let recipeNode: Record<string, unknown> | null = null
  $('script[type*="ld+json" i]').each((_, element) => {
    if (recipeNode) return
    const rawJson = $(element).html()?.trim()
    if (!rawJson) return
    try {
      const parsed: unknown = JSON.parse(rawJson)
      const found = findRecipeNode(parsed)
      if (found) {
        recipeNode = found
      }
    } catch {
      // Ignore malformed JSON-LD blocks and continue scanning
    }
  })

  if (!recipeNode) {
    recipeNode = extractMicrodataRecipeNode($)
  }

  if (!recipeNode) return null

  const title = typeof recipeNode['name'] === 'string' ? decodeHtmlEntities(recipeNode['name']) : ''
  if (!title) return null

  const description =
    typeof recipeNode['description'] === 'string' && recipeNode['description'].trim()
      ? stripHtmlToText(recipeNode['description']).slice(0, 1200)
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
  let currentUrl = validateExternalRecipeUrl(rawUrl)
  const checkDns = fetchImplementation === fetch

  let response: Response | null = null
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    if (checkDns) {
      await assertPublicDnsResolution(currentUrl.hostname)
    }

    try {
      response = await fetchImplementation(currentUrl.toString(), {
        headers: DEFAULT_HEADERS,
        redirect: checkDns ? 'manual' : 'follow',
        signal: AbortSignal.timeout(10_000),
      })
    } catch (error) {
      if (error instanceof RecipeImportError) throw error
      throw new RecipeImportError('Impossible de joindre ce site pour le moment.', 502)
    }

    if (checkDns && response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) {
        throw new RecipeImportError('Redirection invalide depuis ce site.', 502)
      }
      currentUrl = validateExternalRecipeUrl(new URL(location, currentUrl).toString())
      continue
    }
    break
  }

  if (!response || (response.status >= 300 && response.status < 400)) {
    throw new RecipeImportError('Trop de redirections vers cette recette.', 502)
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
  const finalUrl = response.url || currentUrl.toString()

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
