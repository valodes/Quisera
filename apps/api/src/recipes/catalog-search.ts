import { decodeHtmlEntities } from './importer.js'

export type CatalogSourceId = 'jow' | 'marmiton' | '750g' | 'cuisineaz' | 'hervecuisine'

export type ExternalCatalogItem = {
  source: CatalogSourceId
  sourceLabel: string
  title: string
  url: string
  imageUrl: string | null
  description?: string | null
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

// --- Jow (cached sitemap index) ---
type JowIndexEntry = ExternalCatalogItem & { normalizedSearch: string }
const JOW_CACHE_TTL_MS = 6 * 60 * 60 * 1000
let jowCache: { expiresAt: number; entries: JowIndexEntry[] } | null = null

export function parseJowSitemapXml(xml: string): JowIndexEntry[] {
  const entries: JowIndexEntry[] = []
  const seen = new Set<string>()
  const urlBlockRegex = /<url>([\s\S]*?)<\/url>/gi

  for (const match of xml.matchAll(urlBlockRegex)) {
    const block = match[1] ?? ''
    const locMatch = /<loc>([^<]+)<\/loc>/i.exec(block)
    const url = locMatch?.[1]?.trim()
    if (!url || !url.includes('/recipes/') || seen.has(url)) continue
    seen.add(url)

    const titleMatch = /<(?:video|image):title>([^<]+)<\/(?:video|image):title>/i.exec(block)
    const imgMatch =
      /<(?:video:thumbnail_loc|image:loc)>([^<]+)<\/(?:video:thumbnail_loc|image:loc)>/i.exec(block)
    const descMatch = /<video:description>([^<]+)<\/video:description>/i.exec(block)

    const title = titleMatch?.[1]
      ? decodeHtmlEntities(titleMatch[1]).slice(0, 120)
      : titleFromSlug(url)
    const description = descMatch?.[1] ? decodeHtmlEntities(descMatch[1]).slice(0, 180) : null
    const imageUrl = resolveImgUrl(imgMatch?.[1], 'https://jow.fr')

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

async function searchJowCatalog(
  query: string,
  limit: number,
  fetchImplementation: typeof fetch,
): Promise<ExternalCatalogItem[]> {
  if (!jowCache || Date.now() >= jowCache.expiresAt) {
    const res = await fetchImplementation('https://jow.fr/sitemap.xml', {
      headers: DEFAULT_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`Jow sitemap ${res.status}`)
    const xml = await res.text()
    jowCache = {
      expiresAt: Date.now() + JOW_CACHE_TTL_MS,
      entries: parseJowSitemapXml(xml),
    }
  }

  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []

  const results: ExternalCatalogItem[] = []
  for (const entry of jowCache.entries) {
    if (tokens.every((token) => entry.normalizedSearch.includes(token))) {
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
  }
  return results
}

// --- Marmiton ---
export function parseMarmitonSearchHtml(html: string, limit: number): ExternalCatalogItem[] {
  const items: ExternalCatalogItem[] = []
  const seen = new Set<string>()

  const ldMatches = [
    ...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ]
  for (const match of ldMatches) {
    try {
      const parsed: unknown = JSON.parse(match[1] ?? '')
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
    html,
    'https://www.marmiton.org',
    /^https:\/\/www\.marmiton\.org\/recettes\/recette_[^?#]+\.aspx$/i,
    'marmiton',
    'Marmiton',
    limit,
  )
}

// --- 750g ---
export function parse750gSearchHtml(html: string, limit: number): ExternalCatalogItem[] {
  const items: ExternalCatalogItem[] = []
  const seen = new Set<string>()
  const linkRegex =
    /<a\b[^>]*href=["'](https:\/\/www\.750g\.com\/[^"'?#]+-r\d+\.htm)["'][^>]*>([\s\S]*?)<\/a>/gi

  for (const match of html.matchAll(linkRegex)) {
    const url = match[1]?.trim()
    if (!url || seen.has(url)) continue
    seen.add(url)

    const matchIndex = match.index ?? 0
    const preceding = html.slice(Math.max(0, matchIndex - 900), matchIndex)
    const imgMatches = [
      ...preceding.matchAll(
        /<img\b[^>]+(?:data-src|src)=["'](https:\/\/static\.750g\.com\/images\/[^"']+)["'][^>]*>/gi,
      ),
    ]
    const lastImg = imgMatches.at(-1)?.[1]
    // Upgrade 145-110 thumbnails to crisper 640-420 when pattern matches
    const imageUrl = lastImg
      ? resolveImgUrl(
          lastImg.replace('/images/145-110/', '/images/640-420/'),
          'https://www.750g.com',
        )
      : null

    const rawText = decodeHtmlEntities((match[2] ?? '').replace(/<[^>]+>/g, ' '))
    const title = rawText.length >= 3 ? rawText.slice(0, 120) : titleFromSlug(url)

    items.push({
      source: '750g',
      sourceLabel: '750g',
      title,
      url,
      imageUrl,
    })
    if (items.length >= limit) break
  }

  return items
}

// --- CuisineAZ ---
export function parseCuisineAzSearchHtml(html: string, limit: number): ExternalCatalogItem[] {
  const items: ExternalCatalogItem[] = []
  const seen = new Set<string>()
  const articleRegex =
    /<article\b[^>]*class=["'][^"']*searchResult[^"']*["'][^>]*>([\s\S]*?)<\/article>/gi

  for (const match of html.matchAll(articleRegex)) {
    const card = match[1] ?? ''
    const linkMatch =
      /<a\b[^>]*href=["']((?:https:\/\/www\.cuisineaz\.com)?\/recettes\/[^"'?#]+-\d+\.aspx)["'][^>]*>([\s\S]*?)<\/a>/i.exec(
        card,
      )
    if (!linkMatch?.[1]) continue

    let url: string
    try {
      url = new URL(linkMatch[1], 'https://www.cuisineaz.com').toString()
    } catch {
      continue
    }
    if (seen.has(url)) continue
    seen.add(url)

    const imgMatch =
      /<img\b[^>]+(?:data-src|src)=["']([^"']+)["'][^>]*>/i.exec(card) ??
      /<source\b[^>]+srcset=["']([^"'\s,]+)/i.exec(card)
    const imageUrl = resolveImgUrl(imgMatch?.[1], 'https://www.cuisineaz.com')

    const rawTitle = decodeHtmlEntities((linkMatch[2] ?? '').replace(/<[^>]+>/g, ' '))
      .replace(/^Recette\s*:\s*/i, '')
      .trim()

    items.push({
      source: 'cuisineaz',
      sourceLabel: 'CuisineAZ',
      title: (rawTitle || titleFromSlug(url)).slice(0, 120),
      url,
      imageUrl,
    })
    if (items.length >= limit) break
  }

  return items
}

// --- Hervé Cuisine ---
function extractAnchorCards(
  html: string,
  baseUrl: string,
  urlPattern: RegExp,
  source: CatalogSourceId,
  sourceLabel: string,
  limit: number,
): ExternalCatalogItem[] {
  const items: ExternalCatalogItem[] = []
  const seen = new Set<string>()
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi

  for (const match of html.matchAll(anchorRegex)) {
    const rawHref = match[1]?.trim()
    const inner = match[2] ?? ''
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

    const imgMatch = /<img\b[^>]+(?:data-src|src)=["']([^"']+)["'][^>]*>/i.exec(inner)
    const imageUrl = resolveImgUrl(imgMatch?.[1], baseUrl)
    const altMatch = /<img\b[^>]+alt=["']([^"']+)["']/i.exec(inner)
    const textContent = decodeHtmlEntities(inner.replace(/<[^>]+>/g, ' '))
    const title =
      (textContent.length >= 4 && textContent.length <= 120 ? textContent : null) ??
      (altMatch?.[1] ? decodeHtmlEntities(altMatch[1]) : null) ??
      titleFromSlug(resolved)

    seen.add(resolved)
    items.push({
      source,
      sourceLabel,
      title: title.slice(0, 120),
      url: resolved,
      imageUrl,
    })
    if (items.length >= limit) break
  }

  return items
}

export function parseHerveCuisineSearchHtml(html: string, limit: number): ExternalCatalogItem[] {
  return extractAnchorCards(
    html,
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

  return {
    items: settled.flatMap((entry) => entry.items),
    sourceStatuses: settled.map((entry) => entry.status),
  }
}
