// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createApp } from './app.js'
import { createAuth } from './auth.js'
import { openDatabase } from './db/connection.js'

const testEnvironment = {
  NODE_ENV: 'test' as const,
  APP_URL: 'http://localhost:3131',
  TRUSTED_ORIGINS: ['http://localhost:3131'],
  BETTER_AUTH_SECRET: 'local-isolated-test-secret-with-at-least-32-bytes',
  SQLITE_PATH: ':memory:',
  RECIPE_UPLOAD_DIR: '../../data/recipe-photos',
  API_HOST: '127.0.0.1',
  API_PORT: 3000,
}

const ownerAccount = {
  email: 'owner@quisera.invalid',
  name: 'Valentin',
  password: 'owner-password-1234',
}

let connection: ReturnType<typeof openDatabase>
let auth: ReturnType<typeof createAuth>
let app: ReturnType<typeof createApp>

async function signIn(email: string, password: string) {
  const response = await app.request('http://localhost:3131/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost:3131',
    },
    body: JSON.stringify({ email, password }),
  })
  expect(response.status).toBe(200)
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';', 1)[0])
    .join('; ')
}

beforeEach(async () => {
  connection = openDatabase(':memory:')
  migrate(connection.client, {
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
  })
  auth = createAuth(testEnvironment, connection.client)
  app = createApp({ auth, database: connection, environment: testEnvironment })
  await auth.api.createUser({ body: { ...ownerAccount, role: 'admin' } })
})

afterEach(() => {
  connection.sqlite.close()
})

describe('profile and household management', () => {
  it('reads and updates profile name, username, email (requiring password) and password', async () => {
    const cookie = await signIn(ownerAccount.email, ownerAccount.password)

    const initial = await app.request('http://localhost:3131/api/profile', {
      headers: { cookie },
    })
    expect(initial.status).toBe(200)
    const initialBody = (await initial.json()) as {
      profile: { name: string; email: string; username: string | null }
    }
    expect(initialBody.profile.name).toBe('Valentin')
    expect(initialBody.profile.username).toBeNull()

    // Rejects email change without current password
    const missingPassword = await app.request('http://localhost:3131/api/profile', {
      method: 'PATCH',
      headers: {
        cookie,
        'content-type': 'application/json',
        origin: 'http://localhost:3131',
      },
      body: JSON.stringify({
        name: 'Valentin D.',
        username: 'valentin_d',
        email: 'new-owner@quisera.invalid',
      }),
    })
    expect(missingPassword.status).toBe(400)

    // Updates name, username and email with valid password
    const updated = await app.request('http://localhost:3131/api/profile', {
      method: 'PATCH',
      headers: {
        cookie,
        'content-type': 'application/json',
        origin: 'http://localhost:3131',
      },
      body: JSON.stringify({
        name: 'Valentin D.',
        username: 'Valentin_D',
        email: 'new-owner@quisera.invalid',
        currentPassword: ownerAccount.password,
      }),
    })
    expect(updated.status).toBe(200)
    const updatedBody = (await updated.json()) as {
      profile: { name: string; username: string; email: string }
    }
    expect(updatedBody.profile.name).toBe('Valentin D.')
    expect(updatedBody.profile.username).toBe('valentin_d')
    expect(updatedBody.profile.email).toBe('new-owner@quisera.invalid')

    // Changes password and signs in with the new password
    const changed = await app.request('http://localhost:3131/api/profile/password', {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
        origin: 'http://localhost:3131',
      },
      body: JSON.stringify({
        currentPassword: ownerAccount.password,
        newPassword: 'brand-new-password-5678',
        revokeOtherSessions: true,
      }),
    })
    expect(changed.status).toBe(200)

    const newCookie = await signIn('new-owner@quisera.invalid', 'brand-new-password-5678')
    expect(newCookie).toContain('better-auth.session_token=')
  })

  it('manages household, invites a second member, accepts the invite and lists both members', async () => {
    const ownerCookie = await signIn(ownerAccount.email, ownerAccount.password)

    // Auto-bootstraps household for owner
    const householdRes = await app.request('http://localhost:3131/api/household', {
      headers: { cookie: ownerCookie },
    })
    expect(householdRes.status).toBe(200)
    const initialHousehold = (await householdRes.json()) as {
      household: { name: string; currentUserRole: string; members: unknown[] }
    }
    expect(initialHousehold.household.name).toBe('Mon foyer')
    expect(initialHousehold.household.currentUserRole).toBe('owner')
    expect(initialHousehold.household.members).toHaveLength(1)

    // Rename household
    const renameRes = await app.request('http://localhost:3131/api/household', {
      method: 'PATCH',
      headers: {
        cookie: ownerCookie,
        'content-type': 'application/json',
        origin: 'http://localhost:3131',
      },
      body: JSON.stringify({ name: 'Foyer Martin' }),
    })
    expect(renameRes.status).toBe(200)

    // Create invitation
    const inviteRes = await app.request('http://localhost:3131/api/household/invitations', {
      method: 'POST',
      headers: {
        cookie: ownerCookie,
        'content-type': 'application/json',
        origin: 'http://localhost:3131',
      },
      body: JSON.stringify({
        email: 'camille@quisera.invalid',
        invitedName: 'Camille',
      }),
    })
    expect(inviteRes.status).toBe(201)
    const inviteBody = (await inviteRes.json()) as { inviteUrl: string }
    const token = inviteBody.inviteUrl.split('/invitation/')[1]
    expect(token).toBeTruthy()

    // Public lookup works without session
    const lookupRes = await app.request(`http://localhost:3131/api/household/invitations/${token}`)
    expect(lookupRes.status).toBe(200)
    const lookupBody = (await lookupRes.json()) as {
      invitation: { householdName: string; email: string }
    }
    expect(lookupBody.invitation.householdName).toBe('Foyer Martin')
    expect(lookupBody.invitation.email).toBe('camille@quisera.invalid')

    // Accept invitation creates account, joins household, and returns session cookie
    const acceptRes = await app.request(
      `http://localhost:3131/api/household/invitations/${token}/accept`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3131',
        },
        body: JSON.stringify({
          name: 'Camille',
          username: 'camille',
          password: 'camille-password-1234',
        }),
      },
    )
    expect(acceptRes.status).toBe(201)
    const memberCookie = acceptRes.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';', 1)[0])
      .join('; ')
    expect(memberCookie).toContain('better-auth.session_token=')

    // Token cannot be reused
    const reuseRes = await app.request(`http://localhost:3131/api/household/invitations/${token}`)
    expect(reuseRes.status).toBe(404)

    // Household now lists both members and zero pending invitations
    const updatedHousehold = await app.request('http://localhost:3131/api/household', {
      headers: { cookie: memberCookie },
    })
    expect(updatedHousehold.status).toBe(200)
    const updatedBody = (await updatedHousehold.json()) as {
      household: {
        name: string
        currentUserRole: string
        members: Array<{ id: string; email: string; role: string }>
        invitations: unknown[]
      }
    }
    expect(updatedBody.household.name).toBe('Foyer Martin')
    expect(updatedBody.household.currentUserRole).toBe('member')
    expect(updatedBody.household.members).toHaveLength(2)
    expect(updatedBody.household.invitations).toHaveLength(0)

    // Non-owner cannot remove owner
    const ownerMember = updatedBody.household.members.find((m) => m.role === 'owner')!
    const invitedMember = updatedBody.household.members.find((m) => m.role === 'member')!
    const forbiddenRemove = await app.request(
      `http://localhost:3131/api/household/members/${ownerMember.id}`,
      {
        method: 'DELETE',
        headers: { cookie: memberCookie, origin: 'http://localhost:3131' },
      },
    )
    expect(forbiddenRemove.status).toBe(403)

    // Owner removes member -> member's sessions and household access are immediately revoked
    const ownerRemove = await app.request(
      `http://localhost:3131/api/household/members/${invitedMember.id}`,
      {
        method: 'DELETE',
        headers: { cookie: ownerCookie, origin: 'http://localhost:3131' },
      },
    )
    expect(ownerRemove.status).toBe(200)

    const revokedRecipes = await app.request('http://localhost:3131/api/recipes', {
      headers: { cookie: memberCookie },
    })
    expect(revokedRecipes.status).toBe(401)

    const revokedHousehold = await app.request('http://localhost:3131/api/household', {
      headers: { cookie: memberCookie },
    })
    expect(revokedHousehold.status).toBe(401)
  })

  it('reads, validates and persists household planning preferences', async () => {
    const cookie = await signIn(ownerAccount.email, ownerAccount.password)

    const initialRes = await app.request('http://localhost:3131/api/household/preferences', {
      headers: { cookie },
    })
    expect(initialRes.status).toBe(200)
    const initialBody = (await initialRes.json()) as {
      preferences: {
        freshProductsMaxDays: number | null
        requiredSlots: string[]
        excludedSlots: string[]
      }
    }
    expect(initialBody.preferences.freshProductsMaxDays).toBe(3)
    expect(initialBody.preferences.requiredSlots).toContain('1:lunch')

    // Rejects conflicting required & excluded slot
    const conflictRes = await app.request('http://localhost:3131/api/household/preferences', {
      method: 'PUT',
      headers: {
        cookie,
        origin: 'http://localhost:3131',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        freshProductsMaxDays: 2,
        requiredSlots: ['1:lunch'],
        excludedSlots: ['1:lunch'],
        weekdayMaxPrepMinutes: 25,
        longRecipeDays: [6, 0],
        maxDailyCalories: 1600,
        calorieBalance: 'heavier-lunch',
        avoidConsecutiveSameProtein: true,
        avoidConsecutiveSameStarch: true,
        preserveManualMeals: true,
      }),
    })
    expect(conflictRes.status).toBe(400)

    // Saves valid preferences
    const saveRes = await app.request('http://localhost:3131/api/household/preferences', {
      method: 'PUT',
      headers: {
        cookie,
        origin: 'http://localhost:3131',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        freshProductsMaxDays: 2,
        requiredSlots: ['1:lunch', '2:lunch', '3:lunch', '4:lunch', '5:lunch'],
        excludedSlots: ['5:dinner'],
        weekdayMaxPrepMinutes: 25,
        longRecipeDays: [6, 0],
        maxDailyCalories: 1600,
        calorieBalance: 'heavier-lunch',
        avoidConsecutiveSameProtein: true,
        avoidConsecutiveSameStarch: false,
        preserveManualMeals: true,
      }),
    })
    expect(saveRes.status).toBe(200)

    const reloadedRes = await app.request('http://localhost:3131/api/household/preferences', {
      headers: { cookie },
    })
    expect(reloadedRes.status).toBe(200)
    const reloadedBody = (await reloadedRes.json()) as {
      preferences: {
        freshProductsMaxDays: number | null
        excludedSlots: string[]
        maxDailyCalories: number | null
        calorieBalance: string
        avoidConsecutiveSameStarch: boolean
      }
    }
    expect(reloadedBody.preferences.freshProductsMaxDays).toBe(2)
    expect(reloadedBody.preferences.excludedSlots).toEqual(['5:dinner'])
    expect(reloadedBody.preferences.maxDailyCalories).toBe(1600)
    expect(reloadedBody.preferences.calorieBalance).toBe('heavier-lunch')
    expect(reloadedBody.preferences.avoidConsecutiveSameStarch).toBe(false)
  })
})
