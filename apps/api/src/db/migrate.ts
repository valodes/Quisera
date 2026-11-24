import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { parseEnvironment } from '../config/env.js'
import { openDatabase } from './connection.js'

const environment = parseEnvironment()
const connection = openDatabase(environment.SQLITE_PATH)

try {
  migrate(connection.client, {
    migrationsFolder: new URL('../../drizzle', import.meta.url).pathname,
  })
  console.info('SQLite migrations applied.')
} finally {
  connection.close()
}
