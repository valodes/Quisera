import { describe, expect, it } from 'vitest'
import { formatRecipeInstructions, parseStructuredStep } from './instructions.js'

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

describe('parseStructuredStep', () => {
  it('separates Quitoque step title and individual instruction lines', () => {
    const raw =
      "1. Les légumes\n\n<p>Épluchez les carottes.<br />\r\nPressez l'ail.<br />\r\nFaites revenir 15 min.</p>"
    expect(parseStructuredStep(raw, 1)).toEqual({
      title: 'Les légumes',
      lines: ['Épluchez les carottes.', "Pressez l'ail.", 'Faites revenir 15 min.'],
    })
  })

  it('keeps plain single-paragraph steps without inventing a title', () => {
    expect(parseStructuredStep('Préchauffer le four à 180°C et enfourner 20 min.', 1)).toEqual({
      title: null,
      lines: ['Préchauffer le four à 180°C et enfourner 20 min.'],
    })
  })
})
