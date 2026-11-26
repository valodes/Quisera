import type { HttpBindings } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { compress } from 'hono/compress'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { Hono } from 'hono'
import type { AuthInstance, AuthSession } from './auth.js'
import type { AppEnvironment } from './config/env.js'
import type { DatabaseConnection } from './db/connection.js'
import { createRecipeRoutes } from './recipes/routes.js'
import { createQuitoqueClient } from './quitoque/client.js'
import { createPlanningRoutes, type QuitoquePlanningClient } from './planning/routes.js'
import { createProfileRoutes } from './profile/routes.js'
import { createHouseholdRoutes } from './household/routes.js'
import { createQuitoqueBoxClient } from './quitoque/box-client.js'
import { createPlanificationRoutes } from './planification/routes.js'

type Dependencies = {
  auth: AuthInstance
  database: DatabaseConnection
  environment: AppEnvironment
  quitoquePlanningClient?: QuitoquePlanningClient
}

export type ApiHonoEnvironment = {
  Bindings: HttpBindings
  Variables: {
    clientIp: string | undefined
    session: AuthSession
  }
}

export function requireSession(auth: AuthInstance) {
  return createMiddleware<ApiHonoEnvironment>(async (context, next) => {
    const session = await auth.api.getSession({
      headers: context.req.raw.headers,
    })
    if (!session) {
      return context.json({ error: 'Authentification requise.' }, 401)
    }
    context.set('session', session)
    await next()
    return
  })
}

export function createApp({ auth, database, environment, quitoquePlanningClient }: Dependencies) {
  const app = new Hono<ApiHonoEnvironment>()

  app.use('*', compress())

  app.onError((error, context) => {
    if (error instanceof HTTPException) {
      return error.getResponse()
    }
    console.error('Unhandled API request error.')
    return context.json({ error: 'Une erreur est survenue.' }, 500)
  })

  app.get('/health', (context) => {
    try {
      database.sqlite.prepare('SELECT 1').get()
      return context.json({ status: 'ok' })
    } catch {
      return context.json({ status: 'unavailable' }, 503)
    }
  })

  app.use('/api/*', async (context, next) => {
    context.set('clientIp', context.env?.incoming?.socket.remoteAddress)
    await next()
  })

  app.use('/api/*', async (context, next) => {
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
        if (requestOrigin !== origin || !environment.TRUSTED_ORIGINS.includes(requestOrigin)) {
          return context.json({ error: 'Origine non autorisée.' }, 403)
        }
      }
    }
    await next()
    return
  })

  app.all('/api/auth/admin', (context) => context.notFound())
  app.all('/api/auth/admin/*', (context) => context.notFound())
  app.all('/api/auth/*', (context) => {
    const headers = new Headers(context.req.raw.headers)
    headers.delete('x-forwarded-for')
    headers.delete('x-real-ip')
    const clientIp = context.get('clientIp')
    if (clientIp) headers.set('x-quisera-client-ip', clientIp)
    else headers.delete('x-quisera-client-ip')
    return auth.handler(new Request(context.req.raw, { headers }))
  })

  app.get('/api/me', requireSession(auth), (context) => {
    const session = context.get('session')
    return context.json({
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
      },
    })
  })

  app.route(
    '/api/recipes',
    createRecipeRoutes(database.client, auth, environment.RECIPE_UPLOAD_DIR),
  )

  app.route(
    '/api/planning',
    createPlanningRoutes(
      database.client,
      auth,
      quitoquePlanningClient ??
        (environment.QUITOQUE_MAIL && environment.QUITOQUE_MAIL_PASSWORD
          ? createQuitoqueClient({
              email: environment.QUITOQUE_MAIL,
              password: environment.QUITOQUE_MAIL_PASSWORD,
            })
          : undefined),
    ),
  )

  app.route('/api/profile', createProfileRoutes(database.client, auth))

  app.route('/api/household', createHouseholdRoutes(database.client, auth, environment.APP_URL))

  app.route(
    '/api/planification',
    createPlanificationRoutes(
      auth,
      environment.QUITOQUE_MAIL && environment.QUITOQUE_MAIL_PASSWORD
        ? createQuitoqueBoxClient({
            email: environment.QUITOQUE_MAIL,
            password: environment.QUITOQUE_MAIL_PASSWORD,
          })
        : undefined,
    ),
  )

  if (environment.WEB_ASSETS_DIR) {
    app.use('/assets/*', async (context, next) => {
      await next()
      context.header('Cache-Control', 'public, max-age=31536000, immutable')
    })
    app.use('/*', serveStatic({ root: environment.WEB_ASSETS_DIR }))
    app.get(
      '*',
      serveStatic({
        root: environment.WEB_ASSETS_DIR,
        path: 'index.html',
      }),
    )
  }

  return app
}
