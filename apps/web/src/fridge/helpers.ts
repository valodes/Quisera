export type FridgeZone = 'fridge' | 'pantry' | 'freezer'
export type ExpiryUrgency = 'expired' | 'urgent' | 'ok' | 'none'

export const FRIDGE_ZONES: ReadonlyArray<{ id: FridgeZone; label: string }> = [
  { id: 'fridge', label: 'Frigo' },
  { id: 'pantry', label: 'Placard' },
  { id: 'freezer', label: 'Congélateur' },
]

export function todayCivilDate(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDaysToCivilDate(baseCivilDate: string, days: number): string {
  const ms = Date.parse(`${baseCivilDate}T00:00:00Z`)
  const target = new Date(ms + days * 86_400_000)
  return target.toISOString().slice(0, 10)
}

export function expiryUrgency(expiresOn: string | null, today = todayCivilDate()): ExpiryUrgency {
  if (!expiresOn) return 'none'
  const expMs = Date.parse(`${expiresOn}T00:00:00Z`)
  const todayMs = Date.parse(`${today}T00:00:00Z`)
  if (!Number.isFinite(expMs) || !Number.isFinite(todayMs)) return 'none'
  const diffDays = Math.floor((expMs - todayMs) / 86_400_000)
  if (diffDays < 0) return 'expired'
  if (diffDays <= 3) return 'urgent'
  return 'ok'
}

export function formatExpiryLabel(expiresOn: string | null, today = todayCivilDate()): string {
  if (!expiresOn) return ''
  const expMs = Date.parse(`${expiresOn}T00:00:00Z`)
  const todayMs = Date.parse(`${today}T00:00:00Z`)
  const diffDays = Math.floor((expMs - todayMs) / 86_400_000)
  if (diffDays < 0) return 'Périmé'
  if (diffDays === 0) return 'Aujourd’hui'
  if (diffDays === 1) return 'Demain'
  if (diffDays <= 3) return `Dans ${diffDays} j`
  const [, month, day] = expiresOn.split('-')
  return `${day}/${month}`
}

export function adjustFridgeQuantity(
  current: string | null,
  delta: 1 | -1,
  unit?: string | null,
): string | null {
  const step = unit && /^(g|gr|ml)$/i.test(unit.trim()) ? 50 : 1
  if (!current) {
    return delta > 0 ? String(step) : null
  }
  const parsed = Number(current.trim().replace(',', '.'))
  if (!Number.isFinite(parsed)) {
    return current
  }
  const next = parsed + delta * step
  if (next <= 0) return null
  if (Number.isInteger(next)) return String(next)
  return String(Number(next.toFixed(2))).replace('.', ',')
}

export function groupFridgeItemsByZone<T extends { zone: FridgeZone }>(items: readonly T[]) {
  const grouped: Record<FridgeZone, T[]> = {
    fridge: [],
    pantry: [],
    freezer: [],
  }
  for (const item of items) {
    grouped[item.zone].push(item)
  }
  return grouped
}

export function pickDefaultWebDiscoverIds<T extends { id: string; expiresOn: string | null }>(
  items: readonly T[],
  today = todayCivilDate(),
): string[] {
  const sorted = items.toSorted((a, b) => {
    const aExp = a.expiresOn ? Date.parse(`${a.expiresOn}T00:00:00Z`) : Number.POSITIVE_INFINITY
    const bExp = b.expiresOn ? Date.parse(`${b.expiresOn}T00:00:00Z`) : Number.POSITIVE_INFINITY
    if (aExp !== bExp) return aExp - bExp
    return 0
  })
  void today
  return sorted.slice(0, 3).map((item) => item.id)
}
