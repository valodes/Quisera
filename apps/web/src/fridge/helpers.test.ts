import { describe, expect, it } from 'vitest'
import {
  addDaysToCivilDate,
  adjustFridgeQuantity,
  expiryUrgency,
  groupFridgeItemsByZone,
  pickDefaultWebDiscoverIds,
} from './helpers'

describe('fridge frontend helpers', () => {
  it('computes expiry urgency badges cleanly', () => {
    expect(expiryUrgency(null, '2026-11-27')).toBe('none')
    expect(expiryUrgency('2026-11-26', '2026-11-27')).toBe('expired')
    expect(expiryUrgency('2026-11-27', '2026-11-27')).toBe('urgent')
    expect(expiryUrgency('2026-11-30', '2026-11-27')).toBe('urgent')
    expect(expiryUrgency('2026-12-05', '2026-11-27')).toBe('ok')
  })

  it('adds days to civil date for quick DLC chips (+3j, +7j)', () => {
    expect(addDaysToCivilDate('2026-11-27', 3)).toBe('2026-11-30')
    expect(addDaysToCivilDate('2026-11-27', 7)).toBe('2026-12-04')
  })

  it('steps quantities cleanly for - / + buttons', () => {
    expect(adjustFridgeQuantity('3', 1)).toBe('4')
    expect(adjustFridgeQuantity('3', -1)).toBe('2')
    expect(adjustFridgeQuantity('1', -1)).toBeNull()
    expect(adjustFridgeQuantity(null, 1)).toBe('1')
    expect(adjustFridgeQuantity('250', 1, 'g')).toBe('300')
    expect(adjustFridgeQuantity('250', -1, 'g')).toBe('200')
  })

  it('groups items by zone and picks up to 3 urgent/first items for web discovery', () => {
    const items = [
      { id: '1', name: 'Pâtes', zone: 'pantry' as const, expiresOn: null },
      { id: '2', name: 'Tomates', zone: 'fridge' as const, expiresOn: '2026-11-29' },
      { id: '3', name: 'Poulet', zone: 'fridge' as const, expiresOn: '2026-11-28' },
      { id: '4', name: 'Petits pois', zone: 'freezer' as const, expiresOn: '2027-03-01' },
    ]

    const grouped = groupFridgeItemsByZone(items)
    expect(grouped.fridge).toHaveLength(2)
    expect(grouped.pantry).toHaveLength(1)
    expect(grouped.freezer).toHaveLength(1)

    expect(pickDefaultWebDiscoverIds(items, '2026-11-27')).toEqual(['3', '2', '4'])
  })
})
