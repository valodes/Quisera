import { expect, test } from '@playwright/test'

test('desktop navigation opens the selected section', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Planning' })
    .click()

  await expect(page).toHaveURL(/\/planning$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Planning' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Aucune livraison connue' })).toBeVisible()
})

test('the current desktop section exposes its active route', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/recettes')

  const navigation = page.getByRole('navigation', {
    name: 'Navigation principale',
  })

  await expect(navigation.getByRole('link', { name: 'Recettes' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(navigation.getByRole('link', { name: 'Planning' })).not.toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden()
  await expect(navigation.getByRole('link', { name: 'Paramètres' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
})

test('mobile navigation changes route and keeps the active section visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const navigation = page.getByRole('navigation', {
    name: 'Navigation mobile principale',
  })

  await expect(navigation).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeHidden()
  await navigation.getByRole('link', { name: 'Cuisiner' }).click()

  await expect(page).toHaveURL(/\/cuisine$/)
  await expect(navigation.getByRole('link', { name: 'Cuisiner' })).toHaveAttribute(
    'aria-current',
    'page',
  )
})

test('the secondary menu opens, routes to Settings, and closes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  await page.getByRole('button', { name: 'Menu' }).click()
  const settings = page.getByRole('menuitem', { name: 'Paramètres' })
  await expect(settings).toBeVisible()
  await settings.click()

  await expect(page).toHaveURL(/\/parametres$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Paramètres' })).toBeVisible()
  await expect(settings).toBeHidden()
})

test('the secondary menu closes on Escape and returns focus to its trigger', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const trigger = page.getByRole('button', { name: 'Menu' })
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menuitem', { name: 'Paramètres' })).toBeVisible()
  await page.keyboard.press('Escape')

  await expect(page.getByRole('menuitem', { name: 'Paramètres' })).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('the secondary menu does not cover a long heading on a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/adresse-inconnue')

  const heading = page.locator('#page-title')
  await page.getByRole('button', { name: 'Menu' }).click()

  const headingBounds = await heading.boundingBox()
  const menuBounds = await page.getByRole('menuitem', { name: 'Paramètres' }).boundingBox()

  expect(headingBounds).not.toBeNull()
  expect(menuBounds).not.toBeNull()
  expect(menuBounds!.y).toBeGreaterThanOrEqual(headingBounds!.y + headingBounds!.height)
})

test('an unknown route provides a clear recovery link', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/adresse-inconnue')

  await expect(page.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeVisible()
  await page.getByRole('link', { name: 'Revenir à l’accueil' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Accueil' })).toBeVisible()
})

test('a deep route remains available after reload', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/planning')
  await page.reload()

  await expect(page).toHaveURL(/\/planning$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Planning' })).toBeVisible()
})

test('the web manifest supports standalone install without offline workers', async ({ page }) => {
  await page.goto('/')

  const manifest = await page.evaluate(async () => {
    const response = await fetch('/manifest.webmanifest')
    return response.json()
  })

  expect(manifest.display).toBe('standalone')
  expect(manifest.start_url).toBe('/')
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: '192x192', type: 'image/png' }),
      expect.objectContaining({ sizes: '512x512', type: 'image/png' }),
    ]),
  )
  expect(await page.evaluate(() => 'serviceWorker' in navigator)).toBe(true)
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations())).toHaveLength(0)
})

const viewports = [
  { name: 'desktop-wide', width: 1440, height: 900, desktop: true },
  { name: 'desktop-compact', width: 1024, height: 768, desktop: true },
  { name: 'tablet-portrait', width: 768, height: 1024, desktop: false },
  { name: 'tablet-landscape', width: 1024, height: 768, desktop: true },
  { name: 'mobile', width: 390, height: 844, desktop: false },
  { name: 'mobile-small', width: 320, height: 640, desktop: false },
] as const

for (const viewport of viewports) {
  test(`layout fits ${viewport.name} (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    })
    await page.goto('/planning')

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }))

    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)
    await expect(page.getByRole('heading', { level: 1, name: 'Planning' })).toBeVisible()

    if (viewport.desktop) {
      await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
      await expect(
        page.getByRole('navigation', { name: 'Navigation mobile principale' }),
      ).toBeHidden()
    } else {
      const mobileNavigation = page.getByRole('navigation', {
        name: 'Navigation mobile principale',
      })
      await expect(mobileNavigation).toBeVisible()

      const links = mobileNavigation.getByRole('link')
      await expect(links).toHaveCount(4)
      for (const link of await links.all()) {
        const bounds = await link.boundingBox()
        expect(bounds?.width).toBeGreaterThanOrEqual(44)
        expect(bounds?.height).toBeGreaterThanOrEqual(44)
      }
    }
  })
}
