import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { chmodSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { schema } from './schema.js'

export type DatabaseClient = BetterSQLite3Database<typeof schema>

export type DatabaseConnection = {
  client: DatabaseClient
  sqlite: Database.Database
  close: () => void
}

export function openDatabase(databasePath: string): DatabaseConnection {
  const resolvedPath =
    databasePath === ':memory:'
      ? databasePath
      : isAbsolute(databasePath)
        ? databasePath
        : resolve(process.cwd(), databasePath)

  if (resolvedPath !== ':memory:') {
    mkdirSync(dirname(resolvedPath), { recursive: true })
  }

  const sqlite = new Database(resolvedPath)

  try {
    if (resolvedPath !== ':memory:') chmodSync(resolvedPath, 0o600)
    sqlite.pragma('foreign_keys = ON')
    sqlite.pragma('busy_timeout = 5000')

    if (resolvedPath !== ':memory:') {
      sqlite.pragma('journal_mode = WAL')
      sqlite.pragma('synchronous = NORMAL')
      sqlite.pragma('cache_size = -16000')
      sqlite.pragma('temp_store = MEMORY')
    }

    const client = drizzle(sqlite, { schema })

    return {
      client,
      sqlite,
      close: () => sqlite.close(),
    }
  } catch (error) {
    sqlite.close()
    throw error
  }
}
