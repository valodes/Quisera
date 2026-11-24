import { describe, expect, it } from 'vitest'
import {
  addCivilDays,
  addCivilMonths,
  deliveryCycleSlots,
  monthGridDates,
  parisCivilDate,
} from './planning.js'

describe('deliveryCycleSlots', () => {
  it.each([
    ['lundi', '2026-06-01'],
    ['mercredi', '2026-06-03'],
    ['vendredi', '2026-06-05'],
    ['dimanche', '2026-06-07'],
  ])('construit 14 créneaux pour une livraison le %s', (_day, deliveryDate) => {
    const slots = deliveryCycleSlots(deliveryDate)

    expect(slots).toHaveLength(14)
    expect(slots[0]).toEqual({ date: deliveryDate, period: 'dinner' })
    expect(slots.at(-1)).toEqual({
      date: addCivilDays(deliveryDate, 7),
      period: 'lunch',
    })
    expect(slots.filter((slot) => slot.date === deliveryDate)).toHaveLength(1)
    expect(
      slots.filter((slot) => slot.date === addCivilDays(deliveryDate, 7)),
    ).toHaveLength(1)
  })

  it('handles month and year transitions as civil dates', () => {
    const slots = deliveryCycleSlots('2026-12-30')

    expect(slots.at(-1)?.date).toBe('2027-01-06')
    expect(addCivilDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addCivilMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addCivilMonths('2026-12-15', 1)).toBe('2027-01-15')
  })
})

describe('monthGridDates', () => {
  it('builds Monday-first calendar rows around the selected month', () => {
    const dates = monthGridDates('2026-02-15')

    expect(dates[0]).toBe('2026-01-26')
    expect(dates.at(-1)).toBe('2026-03-01')
    expect(dates).toHaveLength(35)
  })
})

describe('parisCivilDate', () => {
  it('keeps calendar dates correct across daylight-saving transitions', () => {
    expect(parisCivilDate(new Date('2026-03-29T00:30:00Z'))).toBe('2026-03-29')
    expect(parisCivilDate(new Date('2026-10-25T00:30:00Z'))).toBe('2026-10-25')
    expect(parisCivilDate(new Date('2026-03-29T22:30:00Z'))).toBe('2026-03-30')
  })
})
