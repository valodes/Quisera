import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const credentials = JSON.parse(readFileSync(process.env.E2E_CREDENTIALS_PATH!, 'utf8')) as {
  email: string
  password: string
}

async function enterCredentials(page: import('@playwright/test').Page) {
  await page.getByLabel('Adresse e-mail').fill(credentials.email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(credentials.password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
}

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/connexion')
  await enterCredentials(page)
}

test('protects deep routes, preserves the destination, and keeps the session on reload', async ({
  page,
}) => {
  await page.context().clearCookies()
  await page.goto('/planning')
  await expect(page).toHaveURL(/\/connexion\?returnTo=\/planning/)
  await enterCredentials(page)
  await expect(page).toHaveURL(/\/planning$/)
  await expect(page.getByRole('heading', { name: 'Planning' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Planning' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Déconnexion' })).toBeVisible()
  await page.getByRole('button', { name: 'Déconnexion' }).click()
  await expect(page).toHaveURL(/\/connexion$/)
  await expect.poll(() => page.evaluate(async () => (await fetch('/api/me')).status)).toBe(401)
})

test('shows a generic error for invalid credentials', async ({ page }) => {
  await page.context().clearCookies()
  await page.goto('/connexion')
  await page.getByLabel('Adresse e-mail').fill(credentials.email)
  await page.getByLabel('Mot de passe', { exact: true }).fill('invalid-test-password')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('alert')).toContainText('Adresse e-mail ou mot de passe incorrect.')
  await expect(page).toHaveURL(/\/connexion$/)
})

test('password visibility toggle is labelled and keyboard operable', async ({ page }) => {
  await page.context().clearCookies()
  await page.goto('/connexion')
  const password = page.getByLabel('Mot de passe', { exact: true })
  const toggle = page.getByRole('button', { name: 'Afficher le mot de passe' })

  await password.fill('temporary-value')
  await toggle.focus()
  await page.keyboard.press('Enter')

  await expect(password).toHaveAttribute('type', 'text')
  await expect(page.getByRole('button', { name: 'Masquer le mot de passe' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('provides a reachable logout action on a narrow mobile viewport', async ({ page }) => {
  await page.context().clearCookies()
  await page.setViewportSize({ width: 320, height: 720 })
  await signIn(page)
  await expect(page.getByRole('navigation', { name: 'Navigation mobile principale' })).toBeVisible()
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Déconnexion' }).click()
  await expect(page).toHaveURL(/\/connexion$/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})

test('keeps the login form usable at tablet and desktop widths', async ({ page }) => {
  for (const width of [768, 1024, 1440]) {
    await page.context().clearCookies()
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/connexion')
    await expect(page.getByRole('heading', { name: 'Ravi de vous retrouver.' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    )
  }
})
