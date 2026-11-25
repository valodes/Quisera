import { parseArgs } from 'node:util'
import { and, eq, sql } from 'drizzle-orm'
import { parseEnvironment } from '../config/env.js'
import { createAuth } from '../auth.js'
import { openDatabase } from '../db/connection.js'
import { account, user } from '../db/schema.js'
import { promptConfirmedPassword, promptLine, promptSecret } from './prompt.js'

const rawArgs = process.argv.slice(2)
if (rawArgs[0] === '--') rawArgs.shift()

let parsed: ReturnType<typeof parseArgs>
try {
  parsed = parseArgs({
    args: rawArgs,
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      password: { type: 'string' },
    },
    allowPositionals: true,
    strict: true,
  })
} catch {
  throw new Error(
    'Usage: pnpm users <bootstrap-admin|create|reset-password> --email <address> [--name <name>]',
  )
}

if (parsed.values['password'] !== undefined) {
  throw new Error('Passwords must be entered at the hidden prompt.')
}

const action = parsed.positionals[0]
const emailArg = typeof parsed.values['email'] === 'string' ? parsed.values['email'] : undefined
const nameArg = typeof parsed.values['name'] === 'string' ? parsed.values['name'] : undefined

const environment = parseEnvironment()
const connection = openDatabase(environment.SQLITE_PATH)
const auth = createAuth(environment, connection.client)

async function operatorSession() {
  const email = (await promptLine('Email du compte opérateur : ')).toLowerCase()
  const password = await promptSecret('Mot de passe opérateur : ')
  const signedIn = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  })
  const cookies = signedIn.headers.getSetCookie().map((cookie) => cookie.split(';', 1)[0])
  if (cookies.length === 0 || 'error' in signedIn.response) {
    throw new Error('Operator authentication failed.')
  }
  const headers = new Headers({ cookie: cookies.join('; ') })
  return {
    headers,
    close: async () => {
      try {
        await auth.api.signOut({ headers })
      } catch {
        // Password changes may already have revoked this operator session.
      }
    },
  }
}

try {
  const email = emailArg?.toLowerCase()
  if (action === 'bootstrap-admin') {
    if (!email) throw new Error('An email is required with --email.')
    const name = nameArg
    if (!name) throw new Error('A name is required with --name.')
    const countRow = connection.client
      .select({ total: sql<number>`count(*)` })
      .from(user)
      .get()
    if ((countRow?.total ?? 0) !== 0)
      throw new Error('The initial administrator can only be created in an empty database.')
    const password = await promptConfirmedPassword()
    await auth.api.createUser({
      body: { email, name, password, role: 'admin' },
    })
    console.info('Initial administrator created.')
  } else if (action === 'create') {
    if (!email) throw new Error('An email is required with --email.')
    const name = nameArg
    if (!name) throw new Error('A name is required with --name.')
    const operatorAccount = connection.client.select({ id: user.id }).from(user).limit(1).get()
    if (!operatorAccount) {
      throw new Error(
        'No operator account exists. Create the initial administrator with auth:create-admin first.',
      )
    }
    const existing = connection.client
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .get()
    if (existing) throw new Error('An account with this email already exists.')
    const password = await promptConfirmedPassword()
    const operator = await operatorSession()
    try {
      await auth.api.createUser({
        headers: operator.headers,
        body: { email, name, password, role: 'user' },
      })
    } finally {
      await operator.close()
    }
    console.info('Account created.')
  } else if (action === 'reset-password') {
    if (!email) throw new Error('An email is required with --email.')
    const target = connection.client
      .select({ id: user.id })
      .from(user)
      .innerJoin(account, and(eq(account.userId, user.id), eq(account.providerId, 'credential')))
      .where(eq(user.email, email))
      .get()
    if (!target) throw new Error('Credential account not found.')
    const newPassword = await promptConfirmedPassword()
    const operator = await operatorSession()
    try {
      await auth.api.setUserPassword({
        headers: operator.headers,
        body: { userId: target.id, newPassword },
      })
      await auth.api.revokeUserSessions({
        headers: operator.headers,
        body: { userId: target.id },
      })
    } finally {
      await operator.close()
    }
    console.info('Password updated.')
  } else {
    throw new Error(
      'Usage: pnpm users <bootstrap-admin|create|reset-password> --email <address> [--name <name>]',
    )
  }
} finally {
  connection.close()
}
