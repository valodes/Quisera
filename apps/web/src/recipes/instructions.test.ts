import { describe, expect, it } from 'vitest'
import { formatRecipeInstructions } from './instructions.js'

describe('formatRecipeInstructions', () => {
  it('converts paragraph and break markup into readable text', () => {
    expect(
      formatRecipeInstructions(
        '<p>1. Le riz au poireau</p><p>Portez à ébullition.<br />Coupez le poireau.</p>',
        1,
      ),
    ).toBe('Le riz au poireau\n\nPortez à ébullition.\nCoupez le poireau.')
  })

  it('never returns active markup or script content', () => {
    expect(
      formatRecipeInstructions(
        '<p>Cuisez le riz.</p><script>alert(1)</script><img src=x onerror=alert(2)>',
        1,
      ),
    ).toBe('Cuisez le riz.')
  })
})
