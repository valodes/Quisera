import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const credentials = JSON.parse(readFileSync(process.env.E2E_CREDENTIALS_PATH!, 'utf8')) as {
  email: string
  password: string
}

test('creates, searches, opens, and favorites a house recipe', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/recettes')
  await expect(page.getByRole('heading', { name: 'Recettes' })).toBeVisible()
  await page.getByRole('link', { name: 'Nouvelle recette' }).click()

  const title = `Recette de test ${Date.now()}`
  await page.getByLabel('Nom de la recette').fill(title)
  await page.locator('.recipe-form__item input[type="text"]').first().fill('Courge de test')
  await page
    .getByLabel('Étape 1', { exact: true })
    .fill(
      '<p>1. Étape de test</p><p>Faire cuire.<br />Laisser reposer.</p><script>alert(1)</script>',
    )
  await page.getByRole('button', { name: 'Enregistrer la recette' }).click()

  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await expect(page.getByText('Nutri-Score : Non disponible')).toBeVisible()
  await expect(page.getByText('Courge de test', { exact: true })).toBeVisible()
  await expect(page.locator('.recipe-detail__instructions')).toHaveText(
    'Étape de test\n\nFaire cuire.\nLaisser reposer.',
  )
  await page.getByRole('link', { name: 'Retour aux recettes' }).click()

  const search = page.getByRole('searchbox', { name: 'Rechercher une recette' })
  await search.fill(title)
  await expect(page.getByText('1 recette', { exact: true })).toBeVisible()
  const recipeLink = page.getByRole('link', { name: `Consulter ${title}` })
  await expect(recipeLink).toBeVisible()
  const card = page.getByRole('article').filter({ has: recipeLink })
  await card.getByRole('button', { name: 'Ajouter aux favoris', exact: true }).click()
  await expect(card.getByRole('button', { name: 'Retirer des favoris', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Favoris', exact: true }).click()
  await expect(recipeLink).toBeVisible()

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('recipe library fits desktop, tablet, and mobile widths', async ({ page }) => {
  const viewports = [
    { width: 1440, height: 1000, mobile: false },
    { width: 1024, height: 768, mobile: false },
    { width: 768, height: 1024, mobile: true },
    { width: 390, height: 844, mobile: true },
    { width: 320, height: 720, mobile: true },
  ] as const

  await page.context().clearCookies()
  await page.goto('/connexion')
  await page.getByLabel('Adresse e-mail').fill(credentials.email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(credentials.password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL('/')
  await page.getByRole('link', { name: 'Recettes' }).click()
  await expect(page.getByRole('heading', { name: 'Recettes' })).toBeVisible()

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    )
    await expect(page.getByRole('button', { name: 'Favoris', exact: true })).toBeVisible()
    if (viewport.mobile) {
      await expect(page.locator('.recipe-filters summary')).toBeVisible()
      await expect(page.getByLabel('Catégorie')).toBeHidden()
    } else {
      await expect(page.locator('.recipe-filters summary')).toBeHidden()
      await expect(page.getByLabel('Catégorie')).toBeVisible()
    }
  }
})
