import { expect, test } from '@playwright/test'

test.describe('Cooking Mode on iPad Landscape', () => {
  test('renders overview and step-by-step cleanly at 1024x768 and 1180x820 with 1-click jump and wake lock', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const calls: string[] = []
      ;(window as unknown as { wakeLockCalls: string[] }).wakeLockCalls = calls
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: {
          request: async (type: string) => {
            calls.push(type)
            return {
              released: false,
              release: async () => {},
              addEventListener: () => {},
            }
          },
        },
      })
    })

    // iPad landscape (standard 1024x768)
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.goto('/recettes')

    // Create a rich multi-step recipe through the authenticated browser context
    const created = await page.evaluate(async () => {
      const response = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Risotto crémeux aux champignons de Paris',
          description: 'Un risotto onctueux au parmesan, prêt en 35 minutes.',
          totalMinutes: 35,
          difficulty: 'medium',
          category: 'Plat principal',
          tags: ['italien', 'chaud'],
          ingredients: [
            { name: 'riz arborio', quantity: '300', unit: 'g', notes: null },
            { name: 'champignons de Paris', quantity: '250', unit: 'g', notes: 'émincés' },
            { name: 'bouillon de légumes', quantity: '90', unit: 'cl', notes: 'chaud' },
            { name: 'parmesan râpé', quantity: '60', unit: 'g', notes: null },
            { name: 'oignon jaune', quantity: '1', unit: null, notes: 'finement ciselé' },
          ],
          steps: [
            { instructions: 'Émincer les champignons et ciseler finement l’oignon.' },
            {
              instructions:
                'Faire revenir l’oignon 4 minutes dans une grande poêle avec un filet d’huile d’olive.',
            },
            {
              instructions:
                'Ajouter le riz arborio et nacrer pendant 2 minutes en remuant constamment.',
            },
            {
              instructions:
                'Verser le bouillon chaud louche par louche et laisser mijoter 18 minutes.',
            },
            {
              instructions:
                'Hors du feu, incorporer le parmesan râpé et les champignons poêlés, puis servir immédiatement.',
            },
          ],
        }),
      })
      const payload = (await response.json()) as { id?: string; error?: string }
      if (!response.ok || !payload.id) {
        throw new Error(`POST /api/recipes failed (${response.status}): ${JSON.stringify(payload)}`)
      }
      return { id: payload.id }
    })

    await page.goto(`/cuisine?recipe=${created.id}`)
    await expect(
      page.getByRole('heading', { name: 'Risotto crémeux aux champignons de Paris' }),
    ).toBeVisible()

    // 1. Verify Screen Wake Lock was requested automatically
    const wakeCalls = await page.evaluate(
      () => (window as unknown as { wakeLockCalls: string[] }).wakeLockCalls,
    )
    expect(wakeCalls).toContain('screen')
    await expect(page.getByRole('button', { name: /Écran maintenu allumé/i })).toBeVisible()

    // 2. Verify Overview phase: 2-column landscape layout, zero horizontal overflow, CTA visible
    const overviewCheck = await page.evaluate(() => {
      const left = document.querySelector('.cooking-overview__left')?.getBoundingClientRect()
      const right = document.querySelector('.cooking-overview__right')?.getBoundingClientRect()
      return {
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
        sideBySide: Boolean(left && right && right.left >= left.right - 2),
      }
    })
    expect(overviewCheck.overflowX).toBe(false)
    expect(overviewCheck.sideBySide).toBe(true)

    // Check off an ingredient in Mise en place
    await page.getByRole('button', { name: /riz arborio/i }).click()
    await expect(page.getByText('1 / 5 prêts')).toBeVisible()

    await page.screenshot({ path: '/tmp/cooking-ipad-overview.png', fullPage: true })

    // 3. Enter Step-by-Step mode
    await page.getByRole('button', { name: 'Commencer étape par étape' }).click()
    await expect(page.getByText('Étape 1 sur 5')).toBeVisible()
    await expect(page.getByText(/Émincer les champignons/)).toBeVisible()

    // Verify 2-column step stage + persistent ingredients side rail at 1024x768
    const stepLayoutCheck = await page.evaluate(() => {
      const stage = document.querySelector('.step-stage')?.getBoundingClientRect()
      const side = document.querySelector('.cooking-side-ingredients')?.getBoundingClientRect()
      return {
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
        sideBySide: Boolean(stage && side && side.left >= stage.right - 2),
      }
    })
    expect(stepLayoutCheck.overflowX).toBe(false)
    expect(stepLayoutCheck.sideBySide).toBe(true)

    // 4. Jump in ONE CLICK from Step 1 to Step 5 (last step)
    await page.getByRole('button', { name: 'Aller à l’étape 5 sur 5' }).click()
    await expect(page.getByText('Étape 5 sur 5')).toBeVisible()
    await expect(page.getByText(/incorporer le parmesan râpé/i)).toBeVisible()

    // 5. Jump in ONE CLICK from Step 5 back to Step 1
    await page.getByRole('button', { name: 'Aller à l’étape 1 sur 5' }).click()
    await expect(page.getByText('Étape 1 sur 5')).toBeVisible()

    // 6. Jump to Step 4, launch a named timer, jump to Step 2 and launch a second simultaneous timer
    await page.getByRole('button', { name: 'Aller à l’étape 4 sur 5' }).click()
    await page.getByRole('button', { name: /Lancer · .*18 min/i }).click()
    await page.getByRole('button', { name: 'Aller à l’étape 2 sur 5' }).click()
    await page.getByRole('button', { name: /Lancer · .*4 min/i }).click()
    await expect(page.locator('.timer-toast')).toHaveCount(2)

    // Verify also at iPad Air landscape (1180x820)
    await page.setViewportSize({ width: 1180, height: 820 })
    const airOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    expect(airOverflow).toBe(false)

    await page.screenshot({ path: '/tmp/cooking-ipad-steps.png', fullPage: true })
  })
})
