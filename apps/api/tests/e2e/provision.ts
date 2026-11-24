import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { parseEnvironment } from '../../src/config/env.js'
import { createAuth } from '../../src/auth.js'
import { openDatabase } from '../../src/db/connection.js'

const environment = parseEnvironment()
const connection = openDatabase(environment.SQLITE_PATH)
const auth = createAuth(environment, connection.client)
const credentials = {
  email: `e2e-${randomBytes(8).toString('hex')}@quisera.invalid`,
  name: 'Compte de test temporaire',
  password: randomBytes(24).toString('base64url'),
}

try {
  await auth.api.createUser({ body: { ...credentials, role: 'admin' } })
  const credentialsPath = process.env.E2E_CREDENTIALS_PATH
  const storageStatePath = process.env.E2E_STORAGE_STATE_PATH
  if (!credentialsPath || !storageStatePath) {
    throw new Error('E2E credential and storage-state paths are required.')
  }
  const signedIn = await auth.api.signInEmail({
    body: { email: credentials.email, password: credentials.password },
    returnHeaders: true,
  })
  const sessionCookie = signedIn.headers
    .getSetCookie()
    .find((cookie) => /(?:__Secure-)?better-auth\.session_token=/.test(cookie))
  if (!sessionCookie)
    throw new Error('Could not create the temporary browser session.')
  const [pair] = sessionCookie.split(';', 1)
  const separator = pair.indexOf('=')
  const name = pair.slice(0, separator)
  const value = pair.slice(separator + 1)
  await writeFile(credentialsPath, JSON.stringify(credentials), { mode: 0o600 })
  await writeFile(
    storageStatePath,
    JSON.stringify({
      cookies: [
        {
          name,
          value,
          domain: '127.0.0.1',
          path: '/',
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    }),
    { mode: 0o600 },
  )
  console.info('Isolated browser-test account provisioned.')
} finally {
  connection.close()
}
