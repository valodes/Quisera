import {
  defaultHouseholdPlanningPreferences,
  householdPlanningPreferencesSchema,
  type HouseholdPlanningPreferences,
  type SlotPreferenceKey,
} from '@quisera/shared'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gt } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { ApiHonoEnvironment } from '../app.js'
import { requireSession } from '../app.js'
import type { AuthInstance } from '../auth.js'
import type { DatabaseClient } from '../db/connection.js'
import {
  household,
  householdInvitation,
  householdMember,
  householdPlanningPreferences,
  user,
} from '../db/schema.js'

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const usernamePattern = /^[a-z0-9._-]{3,30}$/

const renameHouseholdSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Le nom du foyer est requis.')
    .max(80, 'Le nom du foyer ne peut pas dépasser 80 caractères.'),
})

const createInvitationSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Adresse e-mail invalide.')
    .transform((value) => value.toLowerCase()),
  invitedName: z
    .string()
    .trim()
    .max(80, 'Le nom ne peut pas dépasser 80 caractères.')
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional(),
})

const acceptInvitationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Votre nom est requis.')
    .max(80, 'Votre nom ne peut pas dépasser 80 caractères.'),
  username: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value.toLowerCase()))
    .nullable()
    .optional()
    .refine(
      (value) => !value || usernamePattern.test(value),
      'Le nom d’utilisateur doit contenir entre 3 et 30 caractères (lettres minuscules, chiffres, ., _, -).',
    ),
  password: z
    .string()
    .min(12, 'Le mot de passe doit contenir au moins 12 caractères.')
    .max(128, 'Le mot de passe ne peut pas dépasser 128 caractères.'),
})

function hashToken(rawToken: string) {
  return createHash('sha256').update(rawToken).digest('hex')
}

function ensureUserHousehold(database: DatabaseClient, userId: string) {
  const existingMembership = database
    .select({
      householdId: householdMember.householdId,
      role: householdMember.role,
    })
    .from(householdMember)
    .where(eq(householdMember.userId, userId))
    .get()

  if (existingMembership) {
    const existingHousehold = database
      .select()
      .from(household)
      .where(eq(household.id, existingMembership.householdId))
      .get()
    if (existingHousehold) {
      return { household: existingHousehold, role: existingMembership.role }
    }
  }

  const now = new Date()
  const firstHousehold = database.select().from(household).limit(1).get()
  if (firstHousehold) {
    const existingOwner = database
      .select({ userId: householdMember.userId })
      .from(householdMember)
      .where(
        and(eq(householdMember.householdId, firstHousehold.id), eq(householdMember.role, 'owner')),
      )
      .get()
    const role = existingOwner ? ('member' as const) : ('owner' as const)
    database
      .insert(householdMember)
      .values({
        householdId: firstHousehold.id,
        userId,
        role,
        joinedAt: now,
      })
      .onConflictDoNothing()
      .run()
    return { household: firstHousehold, role }
  }

  const newHousehold = {
    id: randomUUID(),
    name: 'Mon foyer',
    createdAt: now,
    updatedAt: now,
  }
  database.insert(household).values(newHousehold).run()
  database
    .insert(householdMember)
    .values({
      householdId: newHousehold.id,
      userId,
      role: 'owner',
      joinedAt: now,
    })
    .run()

  return { household: newHousehold, role: 'owner' as const }
}

function parseJsonArray<T>(raw: string, fallback: T[]): T[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : fallback
  } catch {
    return fallback
  }
}

export function getHouseholdPlanningPreferences(
  database: DatabaseClient,
  userId: string,
): HouseholdPlanningPreferences {
  const { household: currentHousehold } = ensureUserHousehold(database, userId)
  const row = database
    .select()
    .from(householdPlanningPreferences)
    .where(eq(householdPlanningPreferences.householdId, currentHousehold.id))
    .get()

  if (!row) return { ...defaultHouseholdPlanningPreferences }

  return {
    freshProductsMaxDays: row.freshProductsMaxDays,
    requiredSlots: parseJsonArray<SlotPreferenceKey>(
      row.requiredSlotsJson,
      defaultHouseholdPlanningPreferences.requiredSlots,
    ),
    excludedSlots: parseJsonArray<SlotPreferenceKey>(
      row.excludedSlotsJson,
      defaultHouseholdPlanningPreferences.excludedSlots,
    ),
    weekdayMaxPrepMinutes: row.weekdayMaxPrepMinutes,
    longRecipeDays: parseJsonArray<number>(
      row.longRecipeDaysJson,
      defaultHouseholdPlanningPreferences.longRecipeDays,
    ),
    maxDailyCalories: row.maxDailyCalories,
    calorieBalance: row.calorieBalance,
    avoidConsecutiveSameProtein: row.avoidConsecutiveSameProtein,
    avoidConsecutiveSameStarch: row.avoidConsecutiveSameStarch,
    preserveManualMeals: row.preserveManualMeals,
  }
}

export function createHouseholdRoutes(
  database: DatabaseClient,
  auth: AuthInstance,
  appUrl: string,
) {
  const routes = new Hono<ApiHonoEnvironment>()

  // Public invitation lookup
  routes.get('/invitations/:token', (context) => {
    const token = context.req.param('token')
    if (!token || token.length < 16) {
      return context.json({ error: 'Invitation invalide ou expirée.' }, 404)
    }

    const tokenHash = hashToken(token)
    const now = new Date()
    const row = database
      .select({
        id: householdInvitation.id,
        email: householdInvitation.email,
        invitedName: householdInvitation.invitedName,
        expiresAt: householdInvitation.expiresAt,
        householdName: household.name,
        invitedByName: user.name,
      })
      .from(householdInvitation)
      .innerJoin(household, eq(household.id, householdInvitation.householdId))
      .innerJoin(user, eq(user.id, householdInvitation.invitedByUserId))
      .where(
        and(
          eq(householdInvitation.tokenHash, tokenHash),
          eq(householdInvitation.status, 'pending'),
          gt(householdInvitation.expiresAt, now),
        ),
      )
      .get()

    if (!row) {
      return context.json({ error: 'Invitation invalide ou expirée.' }, 404)
    }

    return context.json({
      invitation: {
        email: row.email,
        invitedName: row.invitedName,
        householdName: row.householdName,
        invitedByName: row.invitedByName,
        expiresAt: row.expiresAt.toISOString(),
      },
    })
  })

  // Public invitation acceptance
  routes.post('/invitations/:token/accept', async (context) => {
    const token = context.req.param('token')
    if (!token || token.length < 16) {
      return context.json({ error: 'Invitation invalide ou expirée.' }, 404)
    }

    const rawBody: unknown = await context.req.json().catch(() => null)
    const parsed = acceptInvitationSchema.safeParse(rawBody)
    if (!parsed.success) {
      return context.json(
        {
          error: parsed.error.issues[0]?.message ?? 'Données d’inscription invalides.',
        },
        400,
      )
    }

    const tokenHash = hashToken(token)
    const now = new Date()
    const invitation = database
      .select()
      .from(householdInvitation)
      .where(
        and(
          eq(householdInvitation.tokenHash, tokenHash),
          eq(householdInvitation.status, 'pending'),
          gt(householdInvitation.expiresAt, now),
        ),
      )
      .get()

    if (!invitation) {
      return context.json({ error: 'Invitation invalide ou expirée.' }, 404)
    }

    const existingEmail = database
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, invitation.email))
      .get()
    if (existingEmail) {
      return context.json({ error: 'Un compte existe déjà avec cette adresse e-mail.' }, 409)
    }

    if (parsed.data.username) {
      const existingUsername = database
        .select({ id: user.id })
        .from(user)
        .where(eq(user.username, parsed.data.username))
        .get()
      if (existingUsername) {
        return context.json({ error: 'Ce nom d’utilisateur est déjà pris.' }, 409)
      }
    }

    const created = await auth.api.createUser({
      body: {
        email: invitation.email,
        name: parsed.data.name,
        password: parsed.data.password,
        role: 'user',
      },
    })

    const createdUserId = created.user.id
    if (parsed.data.username) {
      database
        .update(user)
        .set({ username: parsed.data.username, updatedAt: now })
        .where(eq(user.id, createdUserId))
        .run()
    }

    database
      .insert(householdMember)
      .values({
        householdId: invitation.householdId,
        userId: createdUserId,
        role: 'member',
        joinedAt: now,
      })
      .run()

    database
      .update(householdInvitation)
      .set({ status: 'accepted', acceptedAt: now })
      .where(eq(householdInvitation.id, invitation.id))
      .run()

    const signedIn = await auth.api.signInEmail({
      body: {
        email: invitation.email,
        password: parsed.data.password,
      },
      returnHeaders: true,
    })

    for (const cookie of signedIn.headers.getSetCookie()) {
      context.header('Set-Cookie', cookie, { append: true })
    }

    return context.json(
      {
        ok: true,
        user: {
          id: createdUserId,
          name: parsed.data.name,
          email: invitation.email,
          username: parsed.data.username ?? null,
        },
      },
      201,
    )
  })

  // Authenticated household routes
  routes.get('/', requireSession(auth), (context) => {
    const current = context.get('session')
    const { household: currentHousehold, role } = ensureUserHousehold(database, current.user.id)
    const now = new Date()

    const members = database
      .select({
        userId: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: householdMember.role,
        joinedAt: householdMember.joinedAt,
      })
      .from(householdMember)
      .innerJoin(user, eq(user.id, householdMember.userId))
      .where(eq(householdMember.householdId, currentHousehold.id))
      .orderBy(asc(householdMember.joinedAt))
      .all()

    const invitations = database
      .select({
        id: householdInvitation.id,
        email: householdInvitation.email,
        invitedName: householdInvitation.invitedName,
        status: householdInvitation.status,
        expiresAt: householdInvitation.expiresAt,
        createdAt: householdInvitation.createdAt,
        invitedByName: user.name,
      })
      .from(householdInvitation)
      .innerJoin(user, eq(user.id, householdInvitation.invitedByUserId))
      .where(
        and(
          eq(householdInvitation.householdId, currentHousehold.id),
          eq(householdInvitation.status, 'pending'),
          gt(householdInvitation.expiresAt, now),
        ),
      )
      .orderBy(desc(householdInvitation.createdAt))
      .all()

    return context.json({
      household: {
        id: currentHousehold.id,
        name: currentHousehold.name,
        createdAt: currentHousehold.createdAt.toISOString(),
        currentUserRole: role,
        members: members.map((member) => ({
          id: member.userId,
          name: member.name,
          username: member.username,
          email: member.email,
          role: member.role,
          joinedAt: member.joinedAt.toISOString(),
          isCurrentUser: member.userId === current.user.id,
        })),
        invitations: invitations.map((inv) => ({
          id: inv.id,
          email: inv.email,
          invitedName: inv.invitedName,
          invitedByName: inv.invitedByName,
          expiresAt: inv.expiresAt.toISOString(),
          createdAt: inv.createdAt.toISOString(),
        })),
      },
    })
  })

  routes.patch('/', requireSession(auth), async (context) => {
    const current = context.get('session')
    const rawBody: unknown = await context.req.json().catch(() => null)
    const parsed = renameHouseholdSchema.safeParse(rawBody)
    if (!parsed.success) {
      return context.json(
        {
          error: parsed.error.issues[0]?.message ?? 'Nom du foyer invalide.',
        },
        400,
      )
    }

    const { household: currentHousehold } = ensureUserHousehold(database, current.user.id)
    const now = new Date()
    database
      .update(household)
      .set({ name: parsed.data.name, updatedAt: now })
      .where(eq(household.id, currentHousehold.id))
      .run()

    return context.json({
      household: {
        id: currentHousehold.id,
        name: parsed.data.name,
      },
    })
  })

  routes.post('/invitations', requireSession(auth), async (context) => {
    const current = context.get('session')
    const rawBody: unknown = await context.req.json().catch(() => null)
    const parsed = createInvitationSchema.safeParse(rawBody)
    if (!parsed.success) {
      return context.json(
        {
          error: parsed.error.issues[0]?.message ?? 'Données d’invitation invalides.',
        },
        400,
      )
    }

    const { household: currentHousehold } = ensureUserHousehold(database, current.user.id)

    const existingUser = database
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, parsed.data.email))
      .get()
    if (existingUser) {
      return context.json(
        {
          error: 'Un compte existe déjà avec cette adresse e-mail dans Quisera.',
        },
        409,
      )
    }

    const now = new Date()
    database
      .update(householdInvitation)
      .set({ status: 'revoked' })
      .where(
        and(
          eq(householdInvitation.householdId, currentHousehold.id),
          eq(householdInvitation.email, parsed.data.email),
          eq(householdInvitation.status, 'pending'),
        ),
      )
      .run()

    const rawToken = randomBytes(32).toString('base64url')
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS)
    const id = randomUUID()

    database
      .insert(householdInvitation)
      .values({
        id,
        householdId: currentHousehold.id,
        email: parsed.data.email,
        invitedName: parsed.data.invitedName ?? null,
        tokenHash: hashToken(rawToken),
        status: 'pending',
        invitedByUserId: current.user.id,
        expiresAt,
        createdAt: now,
      })
      .run()

    const base = appUrl.replace(/\/$/, '')
    return context.json(
      {
        invitation: {
          id,
          email: parsed.data.email,
          invitedName: parsed.data.invitedName ?? null,
          invitedByName: current.user.name,
          expiresAt: expiresAt.toISOString(),
          createdAt: now.toISOString(),
        },
        inviteUrl: `${base}/invitation/${rawToken}`,
      },
      201,
    )
  })

  routes.delete('/invitations/:id', requireSession(auth), (context) => {
    const current = context.get('session')
    const invitationId = context.req.param('id')
    const { household: currentHousehold } = ensureUserHousehold(database, current.user.id)

    const existing = database
      .select({ id: householdInvitation.id })
      .from(householdInvitation)
      .where(
        and(
          eq(householdInvitation.id, invitationId),
          eq(householdInvitation.householdId, currentHousehold.id),
          eq(householdInvitation.status, 'pending'),
        ),
      )
      .get()

    if (!existing) {
      return context.json({ error: 'Invitation introuvable.' }, 404)
    }

    database
      .update(householdInvitation)
      .set({ status: 'revoked' })
      .where(eq(householdInvitation.id, invitationId))
      .run()

    return context.json({ ok: true })
  })

  routes.delete('/members/:userId', requireSession(auth), (context) => {
    const current = context.get('session')
    const targetUserId = context.req.param('userId')
    const { household: currentHousehold, role } = ensureUserHousehold(database, current.user.id)

    if (role !== 'owner') {
      return context.json({ error: 'Seul le propriétaire du foyer peut retirer un membre.' }, 403)
    }
    if (targetUserId === current.user.id) {
      return context.json({ error: 'Vous ne pouvez pas vous retirer vous-même du foyer.' }, 400)
    }

    const membership = database
      .select({ userId: householdMember.userId })
      .from(householdMember)
      .where(
        and(
          eq(householdMember.householdId, currentHousehold.id),
          eq(householdMember.userId, targetUserId),
        ),
      )
      .get()

    if (!membership) {
      return context.json({ error: 'Membre introuvable dans ce foyer.' }, 404)
    }

    database
      .delete(householdMember)
      .where(
        and(
          eq(householdMember.householdId, currentHousehold.id),
          eq(householdMember.userId, targetUserId),
        ),
      )
      .run()

    return context.json({ ok: true })
  })

  routes.get('/preferences', requireSession(auth), (context) => {
    const current = context.get('session')
    const preferences = getHouseholdPlanningPreferences(database, current.user.id)
    return context.json({ preferences })
  })

  routes.put('/preferences', requireSession(auth), async (context) => {
    const current = context.get('session')
    const { household: currentHousehold } = ensureUserHousehold(database, current.user.id)
    const body = householdPlanningPreferencesSchema.safeParse(
      await context.req.json().catch(() => null),
    )
    if (!body.success) {
      return context.json({ error: body.error.issues[0]?.message ?? 'Préférences invalides.' }, 400)
    }

    const data = body.data
    const now = new Date()
    const values = {
      householdId: currentHousehold.id,
      freshProductsMaxDays: data.freshProductsMaxDays,
      requiredSlotsJson: JSON.stringify([...new Set(data.requiredSlots)]),
      excludedSlotsJson: JSON.stringify([...new Set(data.excludedSlots)]),
      weekdayMaxPrepMinutes: data.weekdayMaxPrepMinutes,
      longRecipeDaysJson: JSON.stringify([...new Set(data.longRecipeDays)]),
      maxDailyCalories: data.maxDailyCalories,
      calorieBalance: data.calorieBalance,
      avoidConsecutiveSameProtein: data.avoidConsecutiveSameProtein,
      avoidConsecutiveSameStarch: data.avoidConsecutiveSameStarch,
      preserveManualMeals: data.preserveManualMeals,
      updatedAt: now,
    }

    database
      .insert(householdPlanningPreferences)
      .values(values)
      .onConflictDoUpdate({
        target: householdPlanningPreferences.householdId,
        set: {
          freshProductsMaxDays: values.freshProductsMaxDays,
          requiredSlotsJson: values.requiredSlotsJson,
          excludedSlotsJson: values.excludedSlotsJson,
          weekdayMaxPrepMinutes: values.weekdayMaxPrepMinutes,
          longRecipeDaysJson: values.longRecipeDaysJson,
          maxDailyCalories: values.maxDailyCalories,
          calorieBalance: values.calorieBalance,
          avoidConsecutiveSameProtein: values.avoidConsecutiveSameProtein,
          avoidConsecutiveSameStarch: values.avoidConsecutiveSameStarch,
          preserveManualMeals: values.preserveManualMeals,
          updatedAt: values.updatedAt,
        },
      })
      .run()

    return context.json({
      preferences: getHouseholdPlanningPreferences(database, current.user.id),
    })
  })

  return routes
}
