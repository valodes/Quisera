import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const credentials = JSON.parse(readFileSync(process.env.E2E_CREDENTIALS_PATH!, 'utf8')) as {
  email: string
  password: string
}

const deliveryCycle = {
  id: 'cycle-11111111-1111-4111-8111-111111111111',
  deliveryDate: '2026-11-18',
  periodStartDate: '2026-11-16',
  periodEndDate: '2026-11-23',
  lastSyncedAt: null,
  recipeCount: 1,
}

async function mockPlanning(page: import('@playwright/test').Page) {
  await page.route('**/api/planning?**', (route) =>
    route.fulfill({
      json: {
        deliveryCycles: [deliveryCycle],
        days: Array.from({ length: 63 }, (_, offset) => {
          const date = new Date('2026-10-18T12:00:00Z')
          date.setUTCDate(date.getUTCDate() + offset)
          const civil = date.toISOString().slice(0, 10)
          return {
            date: civil,
            isDeliveryDay: civil === deliveryCycle.deliveryDate,
            lunch: {
              date: civil,
              period: 'lunch',
              meal:
                civil === '2026-11-19'
                  ? {
                      id: 'planned-quitoque-1',
                      category: 'quitoque',
                      origin: 'automatic',
                      title: 'Recette sélectionnée',
                      recipeId: null,
                      selectionId: 'selection-1',
                      restaurantName: null,
                      notes: null,
                      imageUrl: null,
                      thumbnailUrl: null,
                    }
                  : null,
            },
            dinner: {
              date: civil,
              period: 'dinner',
              meal:
                civil === deliveryCycle.deliveryDate
                  ? {
                      id: 'restaurant-1',
                      category: 'restaurant',
                      origin: 'manual',
                      title: 'Restaurant du test',
                      recipeId: null,
                      selectionId: null,
                      restaurantName: 'Restaurant du test',
                      notes: null,
                      imageUrl: null,
                      thumbnailUrl: null,
                    }
                  : null,
            },
          }
        }),
      },
    }),
  )
  await page.route(`**/api/planning/deliveries/${deliveryCycle.id}`, (route) =>
    route.fulfill({
      json: {
        cycle: deliveryCycle,
        selections: [
          {
            id: 'selection-1',
            sourceItemId: 'line-1',
            sourceProductId: 'product-1',
            sourcePosition: 0,
            occurrence: 0,
            quantity: 1,
            isAvailable: true,
            title: 'Recette sélectionnée',
            description: 'Une recette liée à cette livraison.',
            photoUrl: null,
            photoThumbnailUrl: null,
            totalMinutes: null,
            nutriScore: null,
            ingredientsJson: JSON.stringify([
              { name: 'Carotte', quantity: '2', unit: 'pièces', notes: null },
            ]),
            stepsJson: JSON.stringify(['Laver les carottes.', 'Les couper.']),
          },
        ],
      },
    }),
  )
}

test('shows the anchored 14-slot cycle and persists navigation state in the URL', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await mockPlanning(page)
  await page.goto('/planning?view=week&date=2026-11-18')
  await expect(page.getByRole('heading', { level: 1, name: 'Planning' })).toBeVisible()
  await expect(page.getByText(/14 créneaux/)).toBeVisible()
  await expect(page.locator('.planning__slot')).toHaveCount(14)
  await page.getByText('Recette sélectionnée').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Carotte', { exact: true })).toBeVisible()
  await expect(dialog.getByText('2 pièces')).toBeVisible()
  await expect(dialog.getByText('Laver les carottes.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('Restaurant du test')).toBeVisible()
  await page.getByRole('button', { name: 'Mois', exact: true }).click()
  await expect(page).toHaveURL(/view=month/)
  await expect(page.locator('.planning__month-grid button')).toHaveCount(42)
  await page.locator('.planning__month-grid button').filter({ hasText: '18' }).first().click()
  await expect(page).toHaveURL(/view=day/)
  await expect(page.getByRole('heading', { name: /novembre/ })).toBeVisible()
})

test('planning remains within desktop, tablet, and mobile widths', async ({ page }) => {
  const viewports = [
    { width: 1440, height: 1000 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ] as const

  await page.setViewportSize(viewports[0])
  await page.context().clearCookies()
  await page.goto('/connexion')
  await page.getByLabel('Adresse e-mail').fill(credentials.email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(credentials.password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL('/')
  await mockPlanning(page)
  await page.getByRole('link', { name: 'Planning', exact: true }).click()
  await expect(page.locator('.planning__slot')).toHaveCount(14)

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.getByRole('button', { name: 'Cycle', exact: true }).click()
    await expect(page.locator('.planning__slot')).toHaveCount(14)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    )
    await page.getByRole('button', { name: 'Mois', exact: true }).click()
    await expect(page.locator('.planning__month-grid button')).toHaveCount(42)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    )
  }
})
