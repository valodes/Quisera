import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth/minimal'
import { admin } from 'better-auth/plugins'
import type { AppEnvironment } from './config/env.js'
import type { DatabaseClient } from './db/connection.js'
import { schema } from './db/schema.js'

export function createAuth(
  environment: AppEnvironment,
  database: DatabaseClient,
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
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
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
export type AuthSession = NonNullable<
  Awaited<ReturnType<AuthInstance['api']['getSession']>>
>
