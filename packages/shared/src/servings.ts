const UNICODE_FRACTIONS: Record<string, string> = {
  '¼': '1/4',
  '½': '1/2',
  '¾': '3/4',
  '⅓': '1/3',
  '⅔': '2/3',
  '⅕': '1/5',
  '⅖': '2/5',
  '⅗': '3/5',
  '⅘': '4/5',
  '⅙': '1/6',
  '⅚': '5/6',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
}

const UNICODE_FRACTION_REGEX = new RegExp(`[${Object.keys(UNICODE_FRACTIONS).join('')}]`, 'g')

function parseSingleNumber(raw: string): number | null {
  const cleaned = raw
    .trim()
    .replace(UNICODE_FRACTION_REGEX, (match) => ` ${UNICODE_FRACTIONS[match]} `)
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return null

  const mixedMatch = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(cleaned)
  if (mixedMatch) {
    const whole = Number(mixedMatch[1])
    const num = Number(mixedMatch[2])
    const den = Number(mixedMatch[3])
    return den > 0 ? whole + num / den : null
  }

  const fractionMatch = /^(\d+)\s*\/\s*(\d+)$/.exec(cleaned)
  if (fractionMatch) {
    const num = Number(fractionMatch[1])
    const den = Number(fractionMatch[2])
    return den > 0 ? num / den : null
  }

  if (/^\d+(?:[.,]\d+)?$/.test(cleaned)) {
    const parsed = Number(cleaned.replace(',', '.'))
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }

  return null
}

function roundCulinary(value: number): number {
  if (value >= 50) {
    return Math.round(value / 5) * 5
  }
  if (value >= 10) {
    return Math.round(value)
  }
  if (value >= 1) {
    return Math.round(value * 2) / 2
  }
  const quarter = Math.round(value * 4) / 4
  if (quarter > 0 && Math.abs(value - quarter) < 0.001) {
    return quarter
  }
  const tenth = Math.round(value * 10) / 10
  return tenth > 0 ? tenth : 0.1
}

function formatFrenchNumber(value: number): string {
  const rounded = roundCulinary(value)
  if (Number.isInteger(rounded)) {
    return String(rounded)
  }
  return String(Number(rounded.toFixed(2))).replace('.', ',')
}

export function scaleIngredientQuantity(
  quantity: string | null | undefined,
  fromServings: number | null | undefined,
  toServings: number | null | undefined,
): string | null {
  if (quantity === null || quantity === undefined) {
    return null
  }
  const trimmed = quantity.trim()
  if (
    !trimmed ||
    !fromServings ||
    !toServings ||
    fromServings <= 0 ||
    toServings <= 0 ||
    fromServings === toServings
  ) {
    return quantity
  }

  const ratio = toServings / fromServings
  const rangeMatch = /^(.+?)\s*(à|-|–)\s*(.+)$/.exec(trimmed)
  if (rangeMatch) {
    const start = parseSingleNumber(rangeMatch[1]!)
    const end = parseSingleNumber(rangeMatch[3]!)
    if (start !== null && end !== null) {
      const sep = rangeMatch[2] === 'à' ? ' à ' : rangeMatch[2]!
      return `${formatFrenchNumber(start * ratio)}${sep}${formatFrenchNumber(end * ratio)}`
    }
  }

  const parsed = parseSingleNumber(trimmed)
  if (parsed === null) {
    return quantity
  }
  return formatFrenchNumber(parsed * ratio)
}

export function scaleIngredientsForServings<T extends { readonly quantity?: string | null }>(
  ingredients: readonly T[],
  fromServings: number | null | undefined,
  toServings: number | null | undefined,
): T[] {
  if (
    !fromServings ||
    !toServings ||
    fromServings <= 0 ||
    toServings <= 0 ||
    fromServings === toServings
  ) {
    return ingredients.map((item) => ({ ...item }))
  }
  return ingredients.map((item) => ({
    ...item,
    quantity: scaleIngredientQuantity(item.quantity ?? null, fromServings, toServings),
  }))
}
