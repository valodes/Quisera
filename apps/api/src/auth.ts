import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth/minimal'
import { admin } from 'better-auth/plugins'
import type { AppEnvironment } from './config/env.js'
import type { DatabaseClient } from './db/connection.js'
import { schema } from './db/schema.js'
import { createMailer, type Mailer } from './mail/mailer.js'

export function createAuth(
  environment: AppEnvironment,
  database: DatabaseClient,
  mailer: Mailer = createMailer(environment),
) {
  const secureCookies = environment.NODE_ENV === 'production'

  return betterAuth({
    appName: 'Quisera',
    baseURL: environment.APP_URL,
    basePath: '/api/auth',
    secret: environment.BETTER_AUTH_SECRET,
    database: drizzleAdapter(database, {
      provider: 'sqlite',
      schema,
    }),
    trustedOrigins: environment.TRUSTED_ORIGINS,
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, url }) {
        await mailer.sendPasswordResetEmail({
          to: user.email,
          name: user.name,
          resetUrl: url,
        })
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 12,
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: environment.NODE_ENV === 'test' ? 500 : 100,
      customRules: {
        '/sign-in/email': {
          window: 60,
          max: 5,
        },
        '/sign-up/email': {
          window: 60,
          max: 5,
        },
        '/request-password-reset': {
          window: 60,
          max: 5,
        },
        '/reset-password': {
          window: 60,
          max: 5,
        },
      },
    },
    advanced: {
      useSecureCookies: secureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: secureCookies,
        sameSite: 'lax',
      },
      ipAddress: {
        ipAddressHeaders: ['x-quisera-client-ip'],
      },
    },
    plugins: [admin()],
  })
}

export type AuthInstance = ReturnType<typeof createAuth>
export type AuthSession = NonNullable<Awaited<ReturnType<AuthInstance['api']['getSession']>>>
