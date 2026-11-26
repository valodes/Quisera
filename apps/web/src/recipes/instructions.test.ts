import { describe, expect, it } from 'vitest'
import { useCookingSession } from '../cooking/useCookingSession.js'
import { extractNamedStepTimers } from '../cooking/stepTimerParser.js'
import { useCookingTimers } from '../cooking/useCookingTimers.js'
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

describe('extractNamedStepTimers', () => {
  it('parses hours+minutes, minutes, and seconds into distinct action/subject labels', () => {
    const timers = extractNamedStepTimers(
      null,
      ['Saisir les oignons 45 secondes, puis laisser mijoter 1 h 30 et reposer 10 min.'],
      2,
      { ingredients: [{ name: 'oignons jaunes' }] },
    )
    expect(timers).toEqual([
      {
        minutes: 0.75,
        label: 'Dorer · Oignons jaunes',
        durationLabel: '45 s',
        shortDurationLabel: '45 s',
      },
      {
        minutes: 90,
        label: 'Mijotage',
        durationLabel: '1 h 30',
        shortDurationLabel: '1 h 30',
      },
      {
        minutes: 10,
        label: 'Repos',
        durationLabel: '10 min',
        shortDurationLabel: '10 min',
      },
    ])
  })

  it('resolves ranges to lower bound and recovers the subject from the previous sentence', () => {
    const timers = extractNamedStepTimers(
      null,
      [
        "Versez l'appareil dans les moules préalablement beurrés (ou non s'il s'agit de moules souples). Enfournez pendant 15 à 20 minutes.",
      ],
      4,
      {
        ingredients: [{ name: 'beurre doux' }, { name: 'chocolat noir' }, { name: 'farine' }],
        recipeTitle: 'Moelleux au chocolat',
      },
    )
    expect(timers).toEqual([
      {
        minutes: 15,
        label: 'Four · Moules',
        durationLabel: '15 min (15–20)',
        shortDurationLabel: '15 min',
      },
    ])
  })

  it('distinguishes simultaneous cooking steps via recipe ingredients and deduplicates active timers', () => {
    const riceTimers = extractNamedStepTimers(
      null,
      ["Plongez le riz basmati dans l'eau bouillante salée. Laissez cuire 11 minutes."],
      1,
      { ingredients: [{ name: 'riz basmati' }, { name: 'filets de poulet' }] },
    )
    const chickenTimers = extractNamedStepTimers(
      null,
      ['Dans une poêle, faites dorer les filets de poulet 6 à 8 min.'],
      2,
      { ingredients: [{ name: 'riz basmati' }, { name: 'filets de poulet' }] },
    )

    expect(riceTimers[0]?.label).toBe('Cuisson · Riz basmati')
    expect(chickenTimers[0]).toMatchObject({
      minutes: 6,
      label: 'Dorer · Poulet',
      durationLabel: '6 min (6–8)',
    })

    const { timers, startTimer, dismissTimer } = useCookingTimers()
    const id1 = startTimer('Four · Moules', 15, 'recipe:r1')
    const id2 = startTimer('Four · Moules', 15, 'recipe:r1')
    expect(timers.value.map((t) => t.label)).toEqual(['Four · Moules', 'Four · Moules #2'])
    dismissTimer(id1)
    dismissTimer(id2)
  })

  it('persists cooking step across navigation and clears linked timers on session replacement', () => {
    const { timers, startTimer } = useCookingTimers()
    const {
      session,
      isSessionInProgress,
      activateRecipe,
      setPhase,
      setStep,
      cancelAndReplaceSession,
      clearSession,
    } = useCookingSession()

    activateRecipe({
      key: 'recipe:r1',
      id: 'r1',
      title: 'Risotto aux champignons',
      description: null,
      imageUrl: null,
      sourceLabel: 'Recette maison',
      totalMinutes: 30,
      prepMinutes: 10,
      cookMinutes: 20,
      ingredients: [{ name: 'riz arborio', quantity: '300', unit: 'g', notes: null }],
      steps: ['Étape 1', 'Étape 2', 'Étape 3'],
      routeQuery: { recipe: 'r1' },
    })
    setPhase('steps')
    setStep(2)
    startTimer('Mijotage · Riz', 18, 'recipe:r1')

    expect(isSessionInProgress.value).toBe(true)
    expect(session.value?.currentStep).toBe(2)
    expect(timers.value).toHaveLength(1)

    cancelAndReplaceSession({
      key: 'quitoque:c1:sel2',
      id: 'sel2',
      title: 'Poulet au curry Quitoque',
      description: null,
      imageUrl: null,
      sourceLabel: 'Quitoque',
      totalMinutes: 25,
      prepMinutes: null,
      cookMinutes: null,
      ingredients: [],
      steps: ['Cuire le poulet.'],
      routeQuery: { cycle: 'c1', selection: 'sel2' },
    })

    expect(timers.value).toHaveLength(0)
    expect(session.value?.recipe.title).toBe('Poulet au curry Quitoque')
    expect(session.value?.currentStep).toBe(0)
    expect(session.value?.phase).toBe('overview')

    clearSession()
  })
})
