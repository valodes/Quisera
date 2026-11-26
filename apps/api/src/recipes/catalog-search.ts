import * as cheerio from 'cheerio'
import { XMLParser } from 'fast-xml-parser'
import { LRUCache } from 'lru-cache'
import MiniSearch from 'minisearch'
import { decodeHtmlEntities, importRecipeFromUrl } from './importer.js'

export type CatalogSourceId = 'jow' | 'marmiton' | '750g' | 'cuisineaz' | 'hervecuisine'

export type ExternalCatalogItem = {
  source: CatalogSourceId
  sourceLabel: string
  title: string
  url: string
  imageUrl: string | null
  description?: string | null
  totalMinutes?: number | null
  caloriesKcal?: number | null
}

export type CatalogSourceStatus = {
  source: CatalogSourceId
  label: string
  ok: boolean
  count: number
}

const DEFAULT_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'accept-language': 'fr-FR,fr;q=0.9,en;q=0.5',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function titleFromSlug(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const last = pathname.split('/').filter(Boolean).at(-1) ?? ''
    const cleaned = last
      .replace(/^recette[_-]/i, '')
      .replace(/(?:[_-]\d+|[_-]r\d+)?\.(?:aspx|htm|html)$/i, '')
      .replace(/-[a-z0-9]{15,}$/i, '')
      .replace(/-\d+$/, '')
      .replace(/[-_]+/g, ' ')
      .trim()
    if (!cleaned) return 'Recette'
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  } catch {
    return 'Recette'
  }
}

function resolveImgUrl(raw: string | undefined, baseUrl: string): string | null {
  if (!raw || raw.startsWith('data:')) return null
  try {
    const url = new URL(raw.trim(), baseUrl)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

function extractCardMinutes(textSnippet: string): number | null {
  const hourMinMatch = /(\d{1,2})\s*h\s*(\d{1,2})?(?:\s*min)?\b/i.exec(textSnippet)
  if (hourMinMatch?.[1]) {
    const hours = Number.parseInt(hourMinMatch[1], 10)
    const mins = hourMinMatch[2] ? Number.parseInt(hourMinMatch[2], 10) : 0
    const total = hours * 60 + mins
    if (total > 0 && total <= 720) return total
  }
  const minMatch = /\b(\d{1,3})\s*min(?:utes?)?\b/i.exec(textSnippet)
  if (minMatch?.[1]) {
    const mins = Number.parseInt(minMatch[1], 10)
    if (mins > 0 && mins <= 720) return mins
  }
  return null
}

// --- Jow (XMLParser + MiniSearch + LRUCache) ---
export type JowIndexEntry = ExternalCatalogItem & { normalizedSearch: string }

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  parseTagValue: false,
  isArray: (name) => name === 'url' || name === 'video:video' || name === 'image:image',
})

function firstXmlString(node: unknown): string | undefined {
  if (typeof node === 'string') return node.trim() || undefined
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = firstXmlString(item)
      if (found) return found
    }
  }
  return undefined
}

export function parseJowSitemapXml(xml: string): JowIndexEntry[] {
  const entries: JowIndexEntry[] = []
  const seen = new Set<string>()

  let parsed: Record<string, unknown>
  try {
    parsed = xmlParser.parse(xml) as Record<string, unknown>
  } catch {
    return entries
  }

  const urlset = parsed['urlset']
  if (!urlset || typeof urlset !== 'object') return entries
  const urls = (urlset as Record<string, unknown>)['url']
  if (!Array.isArray(urls)) return entries

  for (const item of urls) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const url = firstXmlString(record['loc'])
    if (!url || !url.includes('/recipes/') || seen.has(url)) continue
    seen.add(url)

    const videoNode = Array.isArray(record['video:video'])
      ? (record['video:video'][0] as Record<string, unknown> | undefined)
      : undefined
    const imageNode = Array.isArray(record['image:image'])
      ? (record['image:image'][0] as Record<string, unknown> | undefined)
      : undefined

    const rawTitle =
      firstXmlString(videoNode?.['video:title']) ??
      firstXmlString(imageNode?.['image:title']) ??
      firstXmlString(record['video:title']) ??
      firstXmlString(record['image:title'])
    const rawImg =
      firstXmlString(imageNode?.['image:loc']) ??
      firstXmlString(videoNode?.['video:thumbnail_loc']) ??
      firstXmlString(record['image:loc']) ??
      firstXmlString(record['video:thumbnail_loc'])
    const rawDesc =
      firstXmlString(videoNode?.['video:description']) ??
      firstXmlString(imageNode?.['image:caption']) ??
      firstXmlString(record['video:description']) ??
      firstXmlString(record['image:caption'])

    const title = rawTitle ? decodeHtmlEntities(rawTitle).slice(0, 120) : titleFromSlug(url)
    const description = rawDesc ? decodeHtmlEntities(rawDesc).slice(0, 180) : null
    const imageUrl = resolveImgUrl(rawImg, 'https://jow.fr')

    entries.push({
      source: 'jow',
      sourceLabel: 'Jow',
      title,
      url,
      imageUrl,
      description,
      normalizedSearch: normalizeSearchText(`${title} ${description ?? ''}`),
    })
  }

  return entries
}

type JowIndexedCatalog = {
  byUrl: Map<string, JowIndexEntry>
  index: MiniSearch<{ url: string; title: string; description: string }>
}

function buildJowSearchIndex(entries: JowIndexEntry[]): JowIndexedCatalog {
  const index = new MiniSearch<{ url: string; title: string; description: string }>({
    idField: 'url',
    fields: ['title', 'description'],
    processTerm: (term) => {
      const normalized = normalizeSearchText(term)
      return normalized.length >= 2 ? normalized : null
    },
    searchOptions: {
      boost: { title: 2 },
      prefix: true,
      fuzzy: 0.2,
      combineWith: 'AND',
    },
  })

  const byUrl = new Map<string, JowIndexEntry>()
  for (const entry of entries) {
    byUrl.set(entry.url, entry)
  }
  index.addAll(
    entries.map((entry) => ({
      url: entry.url,
      title: entry.title,
      description: entry.description ?? '',
    })),
  )

  return { byUrl, index }
}

const jowCatalogCache = new LRUCache<string, JowIndexedCatalog>({
  max: 1,
  ttl: 6 * 60 * 60 * 1000,
})

async function loadJowCatalog(fetchImplementation: typeof fetch): Promise<JowIndexedCatalog> {
  if (fetchImplementation === fetch) {
    const cached = jowCatalogCache.get('jow')
    if (cached) return cached
  }
  const res = await fetchImplementation('https://jow.fr/sitemap.xml', {
    headers: DEFAULT_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Jow sitemap ${res.status}`)
  const built = buildJowSearchIndex(parseJowSitemapXml(await res.text()))
  if (fetchImplementation === fetch) {
    jowCatalogCache.set('jow', built)
  }
  return built
}

async function searchJowCatalog(
  query: string,
  limit: number,
  fetchImplementation: typeof fetch,
): Promise<ExternalCatalogItem[]> {
  const catalog = await loadJowCatalog(fetchImplementation)
  const hits = catalog.index.search(query)
  const results: ExternalCatalogItem[] = []

  for (const hit of hits) {
    const entry = catalog.byUrl.get(String(hit.id))
    if (!entry) continue
    results.push({
      source: entry.source,
      sourceLabel: entry.sourceLabel,
      title: entry.title,
      url: entry.url,
      imageUrl: entry.imageUrl,
      description: entry.description ?? null,
    })
    if (results.length >= limit) break
  }

  return results
}

function pickElementImage($el: ReturnType<cheerio.CheerioAPI>, baseUrl: string): string | null {
  const img = $el.find('img').first()
  if (img.length > 0) {
    const candidate = img.attr('data-src') ?? img.attr('src')
    const resolved = resolveImgUrl(candidate, baseUrl)
    if (resolved) return resolved
  }
  const source = $el
    .find('source[srcset]')
    .first()
    .attr('srcset')
    ?.split(/[\s,]+/)[0]
  return resolveImgUrl(source, baseUrl)
}

function extractAnchorCards(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  urlPattern: RegExp,
  source: CatalogSourceId,
  sourceLabel: string,
  limit: number,
): ExternalCatalogItem[] {
  const items: ExternalCatalogItem[] = []
  const seen = new Set<string>()

  for (const element of $('a[href]').toArray()) {
    if (items.length >= limit) break
    const $a = $(element)
    const rawHref = $a.attr('href')?.trim()
    if (!rawHref) continue

    let resolved: string
    try {
      const parsed = new URL(rawHref, baseUrl)
      parsed.hash = ''
      resolved = parsed.toString()
    } catch {
      continue
    }
    if (!urlPattern.test(resolved) || seen.has(resolved)) continue

    const imageUrl = pickElementImage($a, baseUrl)
    const altText = $a.find('img[alt]').first().attr('alt')
    const textContent = decodeHtmlEntities($a.text())
    const title =
      (textContent.length >= 4 && textContent.length <= 120 ? textContent : null) ??
      (altText ? decodeHtmlEntities(altText) : null) ??
      titleFromSlug(resolved)

    seen.add(resolved)
    items.push({
      source,
      sourceLabel,
      title: title.slice(0, 120),
      url: resolved,
      imageUrl,
    })
  }

  return items
}

// --- Marmiton ---
export function parseMarmitonSearchHtml(html: string, limit: number): ExternalCatalogItem[] {
  const $ = cheerio.load(html)
  const items: ExternalCatalogItem[] = []
  const seen = new Set<string>()

  for (const element of $('script[type*="ld+json" i]').toArray()) {
    if (items.length >= limit) break
    try {
      const parsed: unknown = JSON.parse($(element).html() ?? '')
      const rawNodes = Array.isArray(parsed)
        ? parsed
        : parsed &&
            typeof parsed === 'object' &&
            Array.isArray((parsed as Record<string, unknown>)['@graph'])
          ? ((parsed as Record<string, unknown>)['@graph'] as unknown[])
          : [parsed]
      for (const node of rawNodes) {
        if (
          node &&
          typeof node !== 'string' &&
          typeof node === 'object' &&
          (node as Record<string, unknown>)['@type'] === 'ItemList'
        ) {
          const list = (node as Record<string, unknown>)['itemListElement']
          if (!Array.isArray(list)) continue
          for (const entry of list) {
            if (!entry || typeof entry !== 'object') continue
            const record = entry as Record<string, unknown>
            const rawUrl = record['url']
            if (typeof rawUrl !== 'string' || seen.has(rawUrl)) continue
            seen.add(rawUrl)
            const rawName = record['name']
            const rawImage = record['image']
            const imageUrl =
              typeof rawImage === 'string'
                ? resolveImgUrl(rawImage, 'https://www.marmiton.org')
                : Array.isArray(rawImage) && typeof rawImage[0] === 'string'
                  ? resolveImgUrl(rawImage[0], 'https://www.marmiton.org')
                  : null
            items.push({
              source: 'marmiton',
              sourceLabel: 'Marmiton',
              title:
                typeof rawName === 'string' && rawName.trim()
                  ? decodeHtmlEntities(rawName).slice(0, 120)
                  : titleFromSlug(rawUrl),
              url: rawUrl,
              imageUrl,
            })
            if (items.length >= limit) break
          }
        }
      }
    } catch {
      // Fallback to HTML cards below
    }
  }

  if (items.length > 0) return items.slice(0, limit)

  return extractAnchorCards(
    $,
    'https://www.marmiton.org',
    /^https:\/\/www\.marmiton\.org\/recettes\/recette_[^?#]+\.aspx$/i,
    'marmiton',
    'Marmiton',
    limit,
  )
}

// --- 750g ---
export function parse750gSearchHtml(html: string, limit: number): ExternalCatalogItem[] {
  const $ = cheerio.load(html)
  const items: ExternalCatalogItem[] = []
  const seen = new Set<string>()
  const urlPattern = /^https:\/\/www\.750g\.com\/[^"'?#]+-r\d+\.htm$/i

  for (const element of $('a[href]').toArray()) {
    if (items.length >= limit) break
    const $a = $(element)
    const rawHref = $a.attr('href')?.trim()
    if (!rawHref) continue

    let url: string
    try {
      url = new URL(rawHref, 'https://www.750g.com').toString()
    } catch {
      continue
    }
    if (!urlPattern.test(url) || seen.has(url)) continue
    seen.add(url)

    const $card = $a.closest('article, li, .card, .c-recipe-row')
    const $scope = $card.length > 0 ? $card : $a.parent().prevAll().addBack()
    let rawImg: string | undefined
    for (const imgEl of $scope.find('img').toArray()) {
      const src = $(imgEl).attr('data-src') ?? $(imgEl).attr('src')
      if (src?.startsWith('https://static.750g.com/images/')) {
        rawImg = src
      }
    }
    const imageUrl = rawImg
      ? resolveImgUrl(
          rawImg.replace('/images/145-110/', '/images/640-420/'),
          'https://www.750g.com',
        )
      : null

    const rawText = decodeHtmlEntities($a.text())
    const title = rawText.length >= 3 ? rawText.slice(0, 120) : titleFromSlug(url)
    const totalMinutes = extractCardMinutes($scope.text())

    items.push({
      source: '750g',
      sourceLabel: '750g',
      title,
      url,
      imageUrl,
      ...(totalMinutes !== null ? { totalMinutes } : {}),
    })
  }

  return items
}

// --- CuisineAZ ---
export function parseCuisineAzSearchHtml(html: string, limit: number): ExternalCatalogItem[] {
  const $ = cheerio.load(html)
  const items: ExternalCatalogItem[] = []
  const seen = new Set<string>()
  const linkPattern = /^(?:https:\/\/www\.cuisineaz\.com)?\/recettes\/[^"'?#]+-\d+\.aspx$/i

  for (const articleEl of $('article.searchResult').toArray()) {
    if (items.length >= limit) break
    const $card = $(articleEl)
    let matchedLink: ReturnType<cheerio.CheerioAPI> | null = null
    let resolvedUrl = ''

    for (const linkEl of $card.find('a[href]').toArray()) {
      const href = $(linkEl).attr('href')?.trim() ?? ''
      if (!linkPattern.test(href)) continue
      try {
        resolvedUrl = new URL(href, 'https://www.cuisineaz.com').toString()
        matchedLink = $(linkEl)
        break
      } catch {
        continue
      }
    }

    if (!matchedLink || !resolvedUrl || seen.has(resolvedUrl)) continue
    seen.add(resolvedUrl)

    const imageUrl = pickElementImage($card, 'https://www.cuisineaz.com')
    const rawTitle = decodeHtmlEntities(matchedLink.text())
      .replace(/^Recette\s*:\s*/i, '')
      .trim()
    const totalMinutes = extractCardMinutes($card.text())

    items.push({
      source: 'cuisineaz',
      sourceLabel: 'CuisineAZ',
      title: (rawTitle || titleFromSlug(resolvedUrl)).slice(0, 120),
      url: resolvedUrl,
      imageUrl,
      ...(totalMinutes !== null ? { totalMinutes } : {}),
    })
  }

  return items
}

// --- Hervé Cuisine ---
export function parseHerveCuisineSearchHtml(html: string, limit: number): ExternalCatalogItem[] {
  const $ = cheerio.load(html)
  return extractAnchorCards(
    $,
    'https://www.hervecuisine.com',
    /^https:\/\/www\.hervecuisine\.com\/recette\/[^/?#]+\/?$/i,
    'hervecuisine',
    'Hervé Cuisine',
    limit,
  )
}

const CATALOG_ADAPTERS: ReadonlyArray<{
  source: CatalogSourceId
  label: string
  search: (query: string, limit: number, fetchImpl: typeof fetch) => Promise<ExternalCatalogItem[]>
}> = [
  {
    source: 'jow',
    label: 'Jow',
    search: searchJowCatalog,
  },
  {
    source: 'marmiton',
    label: 'Marmiton',
    search: async (query, limit, fetchImpl) => {
      const res = await fetchImpl(
        `https://www.marmiton.org/recettes/recherche.aspx?aqt=${encodeURIComponent(query)}`,
        { headers: DEFAULT_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(8_000) },
      )
      if (!res.ok) throw new Error(`Marmiton ${res.status}`)
      return parseMarmitonSearchHtml(await res.text(), limit)
    },
  },
  {
    source: '750g',
    label: '750g',
    search: async (query, limit, fetchImpl) => {
      const res = await fetchImpl(
        `https://www.750g.com/recherche/?q=${encodeURIComponent(query)}`,
        { headers: DEFAULT_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(8_000) },
      )
      if (!res.ok) throw new Error(`750g ${res.status}`)
      return parse750gSearchHtml(await res.text(), limit)
    },
  },
  {
    source: 'cuisineaz',
    label: 'CuisineAZ',
    search: async (query, limit, fetchImpl) => {
      const res = await fetchImpl(
        `https://www.cuisineaz.com/recettes/recherche_terme.aspx?recherche=${encodeURIComponent(query)}`,
        { headers: DEFAULT_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(8_000) },
      )
      if (!res.ok) throw new Error(`CuisineAZ ${res.status}`)
      return parseCuisineAzSearchHtml(await res.text(), limit)
    },
  },
  {
    source: 'hervecuisine',
    label: 'Hervé Cuisine',
    search: async (query, limit, fetchImpl) => {
      const res = await fetchImpl(`https://www.hervecuisine.com/?s=${encodeURIComponent(query)}`, {
        headers: DEFAULT_HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(8_000),
      })
      if (!res.ok) throw new Error(`Hervé Cuisine ${res.status}`)
      return parseHerveCuisineSearchHtml(await res.text(), limit)
    },
  },
]

type EnrichedMeta = {
  imageUrl: string | null
  description: string | null
  totalMinutes: number | null
  caloriesKcal: number | null
}

const fastEnrichFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(3_500) })

const enrichCache = new LRUCache<string, EnrichedMeta>({
  max: 500,
  ttl: 6 * 60 * 60 * 1000,
  fetchMethod: async (url) => {
    const draft = await importRecipeFromUrl(url, fastEnrichFetch)
    return {
      imageUrl: draft.imageUrl,
      description: draft.description,
      totalMinutes: draft.totalMinutes,
      caloriesKcal: draft.nutrition?.caloriesKcal ?? null,
    }
  },
})

async function enrichCatalogItem(item: ExternalCatalogItem): Promise<ExternalCatalogItem> {
  try {
    const meta = await enrichCache.fetch(item.url)
    if (!meta) return item
    return {
      ...item,
      imageUrl: item.imageUrl ?? meta.imageUrl,
      description: item.description ?? meta.description,
      totalMinutes: item.totalMinutes ?? meta.totalMinutes,
      caloriesKcal: item.caloriesKcal ?? meta.caloriesKcal,
    }
  } catch {
    return item
  }
}

export async function searchExternalCatalog(
  source: CatalogSourceId | 'all',
  rawQuery: string,
  limitPerSource = 8,
  fetchImplementation: typeof fetch = fetch,
): Promise<{
  items: ExternalCatalogItem[]
  sourceStatuses: CatalogSourceStatus[]
}> {
  const query = rawQuery.trim()
  if (!query) return { items: [], sourceStatuses: [] }

  const targets =
    source === 'all'
      ? CATALOG_ADAPTERS
      : CATALOG_ADAPTERS.filter((adapter) => adapter.source === source)

  const settled = await Promise.all(
    targets.map(async (adapter) => {
      try {
        const items = await adapter.search(query, limitPerSource, fetchImplementation)
        return {
          status: { source: adapter.source, label: adapter.label, ok: true, count: items.length },
          items,
        }
      } catch {
        return {
          status: { source: adapter.source, label: adapter.label, ok: false, count: 0 },
          items: [] as ExternalCatalogItem[],
        }
      }
    }),
  )

  const rawItems = settled.flatMap((entry) => entry.items)
  const items =
    fetchImplementation === fetch ? await Promise.all(rawItems.map(enrichCatalogItem)) : rawItems

  return {
    items,
    sourceStatuses: settled.map((entry) => entry.status),
  }
}
