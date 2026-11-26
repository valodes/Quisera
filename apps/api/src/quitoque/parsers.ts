const apiOrigin = 'https://app.quitoque.fr'

export function decodeQuitoqueJsonLoose(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

export function parseQuitoqueScoreGrade(value: unknown): string | null {
  if (typeof value === 'string') {
    const grade = value.trim().toUpperCase()
    return /^[A-E]$/.test(grade) ? grade : null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  for (const candidate of [
    Object.keys(record)[0],
    typeof record['grade'] === 'string' ? record['grade'] : undefined,
    typeof record['value'] === 'string' ? record['value'] : undefined,
    typeof record['label'] === 'string' ? record['label'] : undefined,
  ]) {
    const grade = candidate?.trim().toUpperCase()
    if (grade && /^[A-E]$/.test(grade)) return grade
  }
  return null
}

export function parseQuitoqueMinutes(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value)
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d{1,3})\s*(?:min|minutes?)$/i)
  return match?.[1] ? Number(match[1]) : null
}

export function toQuitoqueThumbnailUrl(imagePath: unknown): string | null {
  if (typeof imagePath !== 'string' || !imagePath.trim()) return null
  const trimmed = imagePath.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed)
      return url.origin === apiOrigin ? url.toString() : null
    } catch {
      return null
    }
  }
  if (trimmed.startsWith('/media/')) return `${apiOrigin}${trimmed}`
  return `${apiOrigin}/media/cache/resolve/sylius_shop_product_thumbnail/${trimmed.replace(/^\/+/, '')}`
}

export function parseQuitoqueNameList(value: unknown): string[] {
  const decoded = decodeQuitoqueJsonLoose(value)
  if (!Array.isArray(decoded)) return []
  const names: string[] = []
  for (const entry of decoded) {
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as Record<string, unknown>)['name'] === 'string'
    ) {
      const name = ((entry as Record<string, unknown>)['name'] as string).trim()
      if (name && !names.includes(name)) names.push(name)
    }
  }
  return names
}
