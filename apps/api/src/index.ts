import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { createAuth } from './auth.js'
import { parseEnvironment } from './config/env.js'
import { openDatabase } from './db/connection.js'

const environment = parseEnvironment()
const database = openDatabase(environment.SQLITE_PATH)
const auth = createAuth(environment, database.client)
const app = createApp({ auth, database, environment })
const server = serve({
  fetch: app.fetch,
  hostname: environment.API_HOST,
  port: environment.API_PORT,
})

console.info(`Quisera API listening on ${environment.API_HOST}:${environment.API_PORT}`)

let closing = false
const close = () => {
  if (closing) return
  closing = true
  server.close(() => {
    database.close()
    process.exit(0)
  })
}

process.on('SIGINT', close)
process.on('SIGTERM', close)
