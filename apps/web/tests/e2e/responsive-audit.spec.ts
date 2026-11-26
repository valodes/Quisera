import { expect, test, type Page } from '@playwright/test'

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
] as const

const mockWeek = {
  orderId: '42596838',
  periodStartDate: '2026-11-30',
  periodEndDate: '2026-12-06',
  deliveryDate: '2026-12-01',
  lockDate: '2026-11-25T23:59:59+01:00',
  isNextOrder: true,
  onBreak: false,
  edited: 'recipe',
  recipeTargetCount: 9,
  servings: 2,
  itemsTotalCents: 10190,
  shippingTotalCents: 399,
  promotionTotalCents: -1000,
  walletTotalCents: 0,
  walletBalanceCents: 500,
  useWallet: false,
  totalCents: 9589,
  shippingAddress: {
    street: '12 Rue des Lilas',
    postcode: '31400',
    city: 'Toulouse',
    countryCode: 'FR',
    recipientName: 'Valentin',
  },
  shipment: {
    id: 'ship-1',
    method: '/api/v2/shop/shipping-methods/home_3_99',
    deliveryDate: '2026-12-01',
    startTime: '08:00',
    endTime: '18:00',
    timeSlotId: 38,
  },
  promotions: [
    {
      id: 'promo-1',
      name: 'Fidélité',
      description: 'Votre récompense fidélité !',
      couponCode: 'FIDELITE10',
      amountCents: 1000,
      isOnOrder: true,
      isLoyalty: true,
      endsAt: '2027-01-23',
    },
  ],
  items: [
    {
      id: 'item-1',
      productId: '21665',
      variantId: '56887',
      variantCode: 'VAR-21665',
      title: 'Gnocchis aux champignons, sauce Stroganoff',
      quantity: 1,
      unitPriceCents: 1200,
      totalCents: 1200,
      imageUrl: null,
      section: 'recipes',
    },
  ],
}

async function mockPlanificationApi(page: Page) {
  await page.route('**/api/planification/weeks', (route) =>
    route.fulfill({ json: { weeks: [mockWeek] } }),
  )
  await page.route('**/api/planification/catalog?**', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: '21665',
            code: 'gnocchis-stroganoff',
            variantId: '56887',
            variantCode: 'VAR-21665',
            title: 'Gnocchis aux champignons, sauce Stroganoff',
            description: 'Une recette crémeuse aux champignons de Paris.',
            imageUrl: null,
            totalMinutes: 30,
            nutriScore: 'B',
            carbonScore: 'A',
            priceCents: 1200,
            additionalCostCents: 0,
            section: 'recipes',
            categories: ['À cuisiner'],
            highlights: ['Repas de fête'],
            tags: ['hiver'],
            allergens: ['Gluten', 'Lait'],
            ingredients: [{ name: 'Gnocchis', quantity: '400 g', unit: null, notes: null }],
            steps: ['Faire revenir les champignons puis les gnocchis.'],
            filterValues: { recipe_type: ['veggie'], carbon_score: ['a'] },
          },
        ],
        filterGroups: [
          {
            code: 'recipe_type',
            name: 'Type',
            type: 'multichoice',
            options: [{ value: 'veggie', label: 'Veggie' }],
          },
        ],
        seasonalCategories: ['Repas de fête', 'Avec Jean-Michel Cohen'],
      },
    }),
  )
  await page.route('**/api/planification/time-slots?**', (route) =>
    route.fulfill({
      json: {
        deliveryDates: ['2026-12-01', '2026-12-02'],
        timeSlots: [
          {
            id: 24,
            shippingMethodCode: 'home_5_99',
            label: '8:00 - 13:00',
            begin: '8:00',
            end: '13:00',
            priceCents: 599,
            recommended: true,
            deliveryDates: ['2026-12-01', '2026-12-02'],
          },
          {
            id: 38,
            shippingMethodCode: 'home_3_99',
            label: '8:00 - 18:00',
            begin: '8:00',
            end: '18:00',
            priceCents: 399,
            recommended: false,
            deliveryDates: ['2026-12-01', '2026-12-02'],
          },
        ],
      },
    }),
  )
  await page.route('**/api/planification/geocode?**', (route) =>
    route.fulfill({ json: { coords: null } }),
  )
}

for (const vp of viewports) {
  test(`Impeccable responsive audit on ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.setViewportSize({ width: vp.width, height: vp.height })
    await mockPlanificationApi(page)

    const assertPageCraft = async (label: string) => {
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(
        overflow.scrollWidth,
        `Horizontal overflow on ${label} (${vp.name})`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 2)

      const shellBg = await page
        .locator('.app-shell')
        .evaluate((el) => getComputedStyle(el).backgroundColor)
      expect(shellBg).not.toBe('rgb(255, 255, 255)')
      expect(shellBg).not.toBe('rgb(0, 0, 0)')
    }

    await page.goto('/')
    await assertPageCraft('/')

    // Client-side navigation across every core surface
    await page.goto('/planning')
    await assertPageCraft('/planning')

    await page.goto('/planification')
    await assertPageCraft('/planification')
    await expect(page.getByText('Repas de fête').first()).toBeVisible()
    await page.locator('.q-recipe-card__trigger').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.getByRole('button', { name: /Récapitulatif/ }).click()
    await expect(page.getByText('Lieu et horaires de livraison')).toBeVisible()
    await expect(page.getByText('Nombre de personnes')).toBeVisible()
    await expect(page.getByText('Codes promos et cagnotte')).toBeVisible()
    await assertPageCraft('/planification#recap')

    await page.goto('/recettes')
    await assertPageCraft('/recettes')

    await page.goto('/parametres')
    await assertPageCraft('/parametres')
    await expect(page.locator('.theme-card')).toHaveCount(6)
    await page.getByRole('tab', { name: /Mon foyer/ }).click()
    await expect(page.getByText('Membres du foyer')).toBeVisible()
    await assertPageCraft('/parametres?tab=foyer')

    expect(errors, `Console/page errors on ${vp.name}`).toEqual([])
  })
}
