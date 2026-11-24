import { and, eq, ne, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { ApiHonoEnvironment } from '../app.js'
import { requireSession } from '../app.js'
import type { AuthInstance } from '../auth.js'
import type { DatabaseClient } from '../db/connection.js'
import { account, session, user } from '../db/schema.js'

const usernamePattern = /^[a-z0-9._-]{3,30}$/

const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Le nom est requis.')
    .max(80, 'Le nom ne peut pas dépasser 80 caractères.'),
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
  email: z
    .string()
    .trim()
    .email('Adresse e-mail invalide.')
    .transform((value) => value.toLowerCase()),
  currentPassword: z.string().optional(),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Le mot de passe actuel est requis.'),
  newPassword: z
    .string()
    .min(12, 'Le nouveau mot de passe doit contenir au moins 12 caractères.')
    .max(128, 'Le nouveau mot de passe ne peut pas dépasser 128 caractères.'),
  revokeOtherSessions: z.boolean().optional().default(false),
})

export function createProfileRoutes(
  database: DatabaseClient,
  auth: AuthInstance,
  trustedOrigins: readonly string[],
) {
  const routes = new Hono<ApiHonoEnvironment>()

  routes.use('*', async (context, next) => {
    if (
      context.req.method !== 'GET' &&
      context.req.method !== 'HEAD' &&
      context.req.method !== 'OPTIONS'
    ) {
      const origin = context.req.header('origin')
      if (origin) {
        let requestOrigin: string
        try {
          requestOrigin = new URL(origin).origin
        } catch {
          return context.json({ error: 'Origine non autorisée.' }, 403)
        }
        if (
          requestOrigin !== origin ||
          !trustedOrigins.includes(requestOrigin)
        ) {
          return context.json({ error: 'Origine non autorisée.' }, 403)
        }
      }
    }
    await next()
  })

  routes.use('*', requireSession(auth))

  routes.get('/', (context) => {
    const current = context.get('session')
    const record = database
      .select({
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.id, current.user.id))
      .get()

    if (!record) return context.json({ error: 'Utilisateur introuvable.' }, 404)

    const [{ total }] = database
      .select({ total: sql<number>`count(*)` })
      .from(session)
      .where(eq(session.userId, current.user.id))
      .all()

    return context.json({
      profile: {
        id: record.id,
        name: record.name,
        username: record.username,
        email: record.email,
        role: record.role,
        createdAt: record.createdAt.toISOString(),
        activeSessionsCount: Number(total ?? 1),
      },
    })
  })

  routes.patch('/', async (context) => {
    const current = context.get('session')
    const rawBody: unknown = await context.req.json().catch(() => null)
    const parsed = updateProfileSchema.safeParse(rawBody)
    if (!parsed.success) {
      return context.json(
        {
          error:
            parsed.error.issues[0]?.message ?? 'Données de profil invalides.',
        },
        400,
      )
    }

    const existing = database
      .select({
        id: user.id,
        email: user.email,
        username: user.username,
      })
      .from(user)
      .where(eq(user.id, current.user.id))
      .get()

    if (!existing)
      return context.json({ error: 'Utilisateur introuvable.' }, 404)

    const { name, username, email, currentPassword } = parsed.data
    const emailChanged = email !== existing.email.toLowerCase()

    if (emailChanged) {
      if (!currentPassword) {
        return context.json(
          {
            error:
              'Votre mot de passe actuel est requis pour modifier votre adresse e-mail.',
          },
          400,
        )
      }
      const credentialAccount = database
        .select({ password: account.password })
        .from(account)
        .where(
          and(
            eq(account.userId, current.user.id),
            eq(account.providerId, 'credential'),
          ),
        )
        .get()
      if (!credentialAccount?.password) {
        return context.json(
          { error: 'Vérification du mot de passe impossible.' },
          400,
        )
      }
      const authContext = await auth.$context
      const valid = await authContext.password.verify({
        hash: credentialAccount.password,
        password: currentPassword,
      })
      if (!valid) {
        return context.json({ error: 'Mot de passe actuel incorrect.' }, 400)
      }

      const emailConflict = database
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.email, email), ne(user.id, current.user.id)))
        .get()
      if (emailConflict) {
        return context.json(
          { error: 'Cette adresse e-mail est déjà utilisée.' },
          409,
        )
      }
    }

    if (username) {
      const usernameConflict = database
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.username, username), ne(user.id, current.user.id)))
        .get()
      if (usernameConflict) {
        return context.json(
          { error: 'Ce nom d’utilisateur est déjà pris.' },
          409,
        )
      }
    }

    const now = new Date()
    database
      .update(user)
      .set({
        name,
        username: username ?? null,
        email,
        updatedAt: now,
      })
      .where(eq(user.id, current.user.id))
      .run()

    const updated = database
      .select({
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.id, current.user.id))
      .get()!

    const [{ total }] = database
      .select({ total: sql<number>`count(*)` })
      .from(session)
      .where(eq(session.userId, current.user.id))
      .all()

    return context.json({
      profile: {
        id: updated.id,
        name: updated.name,
        username: updated.username,
        email: updated.email,
        role: updated.role,
        createdAt: updated.createdAt.toISOString(),
        activeSessionsCount: Number(total ?? 1),
      },
    })
  })

  routes.post('/password', async (context) => {
    const rawBody: unknown = await context.req.json().catch(() => null)
    const parsed = changePasswordSchema.safeParse(rawBody)
    if (!parsed.success) {
      return context.json(
        {
          error: parsed.error.issues[0]?.message ?? 'Mot de passe invalide.',
        },
        400,
      )
    }

    try {
      await auth.api.changePassword({
        body: {
          currentPassword: parsed.data.currentPassword,
          newPassword: parsed.data.newPassword,
          revokeOtherSessions: parsed.data.revokeOtherSessions,
        },
        headers: context.req.raw.headers,
      })
    } catch {
      return context.json(
        { error: 'Mot de passe actuel incorrect ou changement refusé.' },
        400,
      )
    }

    return context.json({ ok: true })
  })

  routes.post('/sessions/revoke-others', (context) => {
    const current = context.get('session')
    database
      .delete(session)
      .where(
        and(
          eq(session.userId, current.user.id),
          ne(session.id, current.session.id),
        ),
      )
      .run()

    return context.json({ ok: true, activeSessionsCount: 1 })
  })

  return routes
}
