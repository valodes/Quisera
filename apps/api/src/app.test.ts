// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createApp } from './app.js'
import { createAuth } from './auth.js'
import { parseEnvironment } from './config/env.js'
import { openDatabase } from './db/connection.js'
import { session, user } from './db/schema.js'

const testEnvironment = {
  NODE_ENV: 'test' as const,
  APP_URL: 'http://localhost:5173',
  TRUSTED_ORIGINS: ['http://localhost:5173'],
  BETTER_AUTH_SECRET: 'local-isolated-test-secret-with-at-least-32-bytes',
  SQLITE_PATH: ':memory:',
  RECIPE_UPLOAD_DIR: '../../data/recipe-photos',
  API_HOST: '127.0.0.1',
  API_PORT: 3000,
}
const testUser = {
  email: 'test-account@quisera.invalid',
  name: 'Test Account',
  password: 'isolated-test-password-123',
}

let directory = ''
let connection: ReturnType<typeof openDatabase>
let auth: ReturnType<typeof createAuth>
let app: ReturnType<typeof createApp>

function createTestDatabase(path = ':memory:') {
  const opened = openDatabase(path)
  migrate(opened.client, {
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
  })
  return opened
}

async function createTestUser() {
  return auth.api.createUser({ body: { ...testUser, role: 'admin' } })
}

async function signIn() {
  return app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      origin: testEnvironment.APP_URL,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: testUser.email,
      password: testUser.password,
    }),
  })
}

function sessionCookie(response: Response) {
  const cookie = response.headers
    .get('set-cookie')
    ?.match(/better-auth\.session_token=[^;,]+/)?.[0]
  expect(cookie).toBeTruthy()
  return cookie!
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'quisera-auth-test-'))
  connection = createTestDatabase()
  auth = createAuth(testEnvironment, connection.client)
  app = createApp({ auth, database: connection, environment: testEnvironment })
})

afterEach(() => {
  if (connection.sqlite.open) connection.close()
  if (directory) rmSync(directory, { recursive: true, force: true })
})

describe('private authentication', () => {
  it('keeps public account creation and unauthenticated private access closed', async () => {
    const signup = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        origin: testEnvironment.APP_URL,
        'content-type': 'application/json',
      },
      body: JSON.stringify(testUser),
    })
    const privateResponse = await app.request('/api/me')
    const adminApi = await app.request('/api/auth/admin/create-user', {
      method: 'POST',
    })

    expect(signup.status).not.toBe(200)
    expect(privateResponse.status).toBe(401)
    expect(await privateResponse.json()).toEqual({
      error: 'Authentification requise.',
    })
    expect(adminApi.status).toBe(404)
    expect(
      connection.client.select({ id: user.id }).from(user).all(),
    ).toHaveLength(0)
  })

  it('authenticates, reads and revokes a persistent session', async () => {
    await createTestUser()
    const wrongCredentials = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        origin: testEnvironment.APP_URL,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: testUser.email,
        password: 'incorrect-password',
      }),
    })
    expect(wrongCredentials.status).toBe(401)

    const signedIn = await signIn()
    expect(signedIn.status).toBe(200)
    const cookieAttributes = signedIn.headers.get('set-cookie')?.toLowerCase()
    expect(cookieAttributes).toContain('httponly')
    expect(cookieAttributes).toContain('samesite=lax')
    expect(cookieAttributes).not.toContain('; secure')
    const cookie = sessionCookie(signedIn)
    expect(
      await auth.api.getSession({ headers: new Headers({ cookie }) }),
    ).not.toBeNull()
    const privateResponse = await app.request('/api/me', {
      headers: { cookie },
    })
    expect(privateResponse.status).toBe(200)
    expect(await privateResponse.json()).toMatchObject({
      user: { email: testUser.email, name: testUser.name },
    })

    const signedOut = await app.request('/api/auth/sign-out', {
      method: 'POST',
      headers: { origin: testEnvironment.APP_URL, cookie },
    })
    expect(signedOut.status).toBe(200)
    expect((await app.request('/api/me', { headers: { cookie } })).status).toBe(
      401,
    )
  })

  it('rejects untrusted origins and enforces the login rate limit', async () => {
    await createTestUser()
    const rejectedOrigin = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        origin: 'https://attacker.invalid',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password,
      }),
    })
    expect(rejectedOrigin.status).toBe(403)

    let lastResponse: Response | undefined
    for (let attempt = 0; attempt < 6; attempt += 1) {
      lastResponse = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          origin: testEnvironment.APP_URL,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: testUser.email,
          password: 'wrong-password',
        }),
      })
    }
    expect(lastResponse?.status).toBe(429)
  })

  it('invalidates an expired session', async () => {
    await createTestUser()
    const cookie = sessionCookie(await signIn())
    connection.client
      .update(session)
      .set({ expiresAt: new Date(0) })
      .run()
    expect((await app.request('/api/me', { headers: { cookie } })).status).toBe(
      401,
    )
  })

  it('marks session cookies Secure when production HTTPS is configured', async () => {
    await createTestUser()
    const productionAuth = createAuth(
      {
        ...testEnvironment,
        NODE_ENV: 'production',
        APP_URL: 'https://quisera.invalid',
        TRUSTED_ORIGINS: ['https://quisera.invalid'],
      },
      connection.client,
    )
    const signedIn = await productionAuth.api.signInEmail({
      body: { email: testUser.email, password: testUser.password },
      returnHeaders: true,
    })
    const cookieAttributes = signedIn.headers
      .getSetCookie()
      .join('; ')
      .toLowerCase()

    expect(cookieAttributes).toContain('httponly')
    expect(cookieAttributes).toContain('secure')
    expect(cookieAttributes).toContain('samesite=lax')
  })

  it('retains a session across a database connection restart', async () => {
    const path = join(directory, 'persistent.sqlite')
    connection.close()
    connection = createTestDatabase(path)
    auth = createAuth(
      { ...testEnvironment, SQLITE_PATH: path },
      connection.client,
    )
    app = createApp({
      auth,
      database: connection,
      environment: testEnvironment,
    })
    await createTestUser()
    const cookie = sessionCookie(await signIn())
    connection.close()

    connection = openDatabase(path)
    auth = createAuth(
      { ...testEnvironment, SQLITE_PATH: path },
      connection.client,
    )
    app = createApp({
      auth,
      database: connection,
      environment: testEnvironment,
    })
    expect((await app.request('/api/me', { headers: { cookie } })).status).toBe(
      200,
    )
  })

  it('rejects missing or insecure production settings without exposing values', () => {
    expect(() => parseEnvironment({})).toThrow(
      'Invalid Quisera API configuration',
    )
    expect(() =>
      parseEnvironment({
        NODE_ENV: 'production',
        APP_URL: 'http://quisera.invalid',
        TRUSTED_ORIGINS: 'http://quisera.invalid',
        BETTER_AUTH_SECRET: 'short',
        SQLITE_PATH: ':memory:',
      }),
    ).toThrow('Invalid Quisera API configuration')
    const validEnvironment = {
      NODE_ENV: 'test',
      APP_URL: 'http://localhost:5173',
      TRUSTED_ORIGINS: 'http://localhost:5173',
      BETTER_AUTH_SECRET: testEnvironment.BETTER_AUTH_SECRET,
      SQLITE_PATH: ':memory:',
      QUITOQUE_MAIL: '',
      QUITOQUE_MAIL_PASSWORD: '',
    }
    expect(parseEnvironment(validEnvironment).QUITOQUE_MAIL).toBeUndefined()
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        QUITOQUE_MAIL: 'chef@example.invalid',
      }),
    ).toThrow('Both Quitoque credentials must be configured together')
  })
})
