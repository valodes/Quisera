import { defineConfig } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function findAvailablePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not reserve a test port.')
  const port = address.port
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  return port
}

const apiPort = Number(process.env.QUI_E2E_API_PORT ?? (await findAvailablePort()))
const webPort = Number(process.env.QUI_E2E_WEB_PORT ?? (await findAvailablePort()))
const temporaryDirectory =
  process.env.QUI_E2E_TEMP_DIR ?? mkdtempSync(join(tmpdir(), 'quisera-playwright-'))
process.env.QUI_E2E_API_PORT = String(apiPort)
process.env.QUI_E2E_WEB_PORT = String(webPort)
process.env.QUI_E2E_TEMP_DIR = temporaryDirectory
process.env.SQLITE_PATH = join(temporaryDirectory, 'auth.sqlite')
process.env.RECIPE_UPLOAD_DIR = join(temporaryDirectory, 'recipe-photos')
process.env.E2E_CREDENTIALS_PATH = join(temporaryDirectory, 'credentials.json')
process.env.E2E_STORAGE_STATE_PATH = join(temporaryDirectory, 'storage-state.json')
process.env.APP_URL = `http://127.0.0.1:${webPort}`
process.env.TRUSTED_ORIGINS = process.env.APP_URL
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('base64url')
process.env.NODE_ENV = 'test'
process.env.API_HOST = '127.0.0.1'
process.env.API_PORT = String(apiPort)
process.env.WEB_PORT = String(webPort)

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  globalTeardown: './tests/e2e/global-teardown.ts',
  retries: 0,
  use: {
    baseURL: process.env.APP_URL,
    browserName: 'chromium',
    storageState: process.env.E2E_STORAGE_STATE_PATH,
  },
  webServer: {
    command:
      'pnpm --filter @quisera/api e2e:prepare && pnpm --parallel --filter @quisera/api --filter @quisera/web run dev',
    url: `${process.env.APP_URL}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ...process.env },
  },
})
