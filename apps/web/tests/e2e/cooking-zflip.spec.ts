import { expect, test } from '@playwright/test'

async function createSampleRecipe(page: import('@playwright/test').Page): Promise<string> {
  const created = await page.evaluate(async () => {
    const response = await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Gnocchis aux champignons Stroganoff',
        description: 'Gnocchis dorés et légumes fondants à la sauce Stroganoff.',
        totalMinutes: 30,
        difficulty: 'easy',
        category: 'Plat principal',
        tags: ['rapide'],
        ingredients: [
          { name: 'gnocchis', quantity: '400', unit: 'g', notes: null },
          { name: 'champignons de Paris', quantity: '250', unit: 'g', notes: 'émincés' },
          { name: 'carottes', quantity: '2', unit: null, notes: 'en demi-rondelles' },
          { name: 'crème fraîche', quantity: '15', unit: 'cl', notes: null },
        ],
        steps: [
          {
            instructions:
              '1. Les légumes\n\n<p>Épluchez et coupez les carottes.<br />Faites revenir les légumes 15 min.</p>',
          },
          {
            instructions:
              '2. La sauce\n\n<p>Ajoutez la crème et la moutarde.<br />Laissez mijoter 5 min.</p>',
          },
          {
            instructions:
              '3. Les gnocchis\n\n<p>Faites dorer les gnocchis 10 min.<br />Servez aussitôt.</p>',
          },
        ],
      }),
    })
    const payload = (await response.json()) as { id?: string }
    if (!response.ok || !payload.id) throw new Error('Failed to create test recipe')
    return payload.id
  })
  return created
}

test.describe('Cooking Mode on Samsung Galaxy Z Flip 7/8', () => {
  test('Flex Mode (half-folded 90 deg at 412x892): reading pane on top, control deck on bottom', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const target = new EventTarget() as EventTarget & { type: string }
      target.type = 'folded'
      Object.defineProperty(navigator, 'devicePosture', {
        configurable: true,
        value: target,
      })
    })

    await page.setViewportSize({ width: 412, height: 892 })
    await page.goto('/recettes')
    const recipeId = await createSampleRecipe(page)

    await page.goto(`/cuisine?recipe=${recipeId}`)
    await expect(
      page.getByRole('heading', { name: 'Gnocchis aux champignons Stroganoff' }),
    ).toBeVisible()

    // Enter step-by-step Flex Mode
    await page.getByRole('button', { name: 'Commencer étape par étape' }).click()
    await expect(page.getByText('Étape 1 sur 3')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Les légumes' })).toBeVisible()

    // Verify top reading half sits cleanly above bottom control deck without horizontal overflow
    const geometry = await page.evaluate(() => {
      const topHalf = document.querySelector('.flex-top-screen')?.getBoundingClientRect()
      const bottomDeck = document.querySelector('.flex-bottom-deck')?.getBoundingClientRect()
      const headerHidden =
        getComputedStyle(document.querySelector('.app-header') as HTMLElement).display === 'none'
      return {
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
        splitVertically: Boolean(topHalf && bottomDeck && bottomDeck.top >= topHalf.bottom - 1),
        headerHidden,
      }
    })
    expect(geometry.overflowX).toBe(false)
    expect(geometry.splitVertically).toBe(true)
    expect(geometry.headerHidden).toBe(true)

    // Launch named timer from bottom deck, jump 1 -> 3 -> 1 in one click
    await page.getByRole('button', { name: /Lancer · Les légumes \(15 min\)/i }).click()
    await expect(page.locator('.timer-toast')).toHaveCount(1)

    await page.getByRole('button', { name: 'Aller à l’étape 3 sur 3' }).click()
    await expect(page.getByText('Étape 3 sur 3')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Les gnocchis' })).toBeVisible()

    await page.getByRole('button', { name: 'Aller à l’étape 1 sur 3' }).click()
    await expect(page.getByText('Étape 1 sur 3')).toBeVisible()

    await page.screenshot({ path: '/tmp/cooking-zflip-flex.png', fullPage: false })
  })

  test('Cover Screen / FlexWindow (closed 4.1" at 360x398): pocket full-screen cooking card', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 398 })
    await page.goto('/recettes')
    const recipeId = await createSampleRecipe(page)

    await page.goto(`/cuisine?recipe=${recipeId}`)
    await expect(page.getByText('Gnocchis aux champignons Stroganoff')).toBeVisible()

    // Enter step-by-step on Cover Screen
    await page.getByRole('button', { name: /Commencer/i }).click()
    await expect(page.getByText('1 / 3')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Les légumes' })).toBeVisible()

    const coverCheck = await page.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      headerHidden:
        getComputedStyle(document.querySelector('.app-header') as HTMLElement).display === 'none',
    }))
    expect(coverCheck.overflowX).toBe(false)
    expect(coverCheck.headerHidden).toBe(true)

    // Jump 1 -> 3 in one tap on Cover Screen
    await page.getByRole('button', { name: 'Aller à l’étape 3 sur 3' }).click()
    await expect(page.getByText('3 / 3')).toBeVisible()

    // Toggle ingredients panel on Cover Screen
    await page.getByRole('button', { name: /Ingrédients/i }).click()
    await expect(page.getByText(/gnocchis/i).first()).toBeVisible()
    await page.getByRole('button', { name: 'Étape', exact: true }).click()

    await page.screenshot({ path: '/tmp/cooking-zflip-cover.png', fullPage: false })
  })
})
