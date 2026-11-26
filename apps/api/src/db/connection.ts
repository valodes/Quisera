import Database from 'better-sqlite3'
import { lt } from 'drizzle-orm'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { chmodSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { rateLimit, schema, session, verification } from './schema.js'

export function foldFrenchSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function purgeExpiredAuthArtifacts(client: DatabaseClient, now = new Date()): void {
  try {
    client.delete(session).where(lt(session.expiresAt, now)).run()
    client.delete(verification).where(lt(verification.expiresAt, now)).run()
    client
      .delete(rateLimit)
      .where(lt(rateLimit.lastRequest, now.getTime() - 24 * 60 * 60 * 1000))
      .run()
  } catch {
    // Tables may not exist yet before initial migration runs.
  }
}

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
    sqlite.function('fold_fr', { deterministic: true }, (input: unknown) =>
      typeof input === 'string' ? foldFrenchSearchText(input) : '',
    )

    if (resolvedPath !== ':memory:') {
      sqlite.pragma('journal_mode = WAL')
      sqlite.pragma('synchronous = NORMAL')
      sqlite.pragma('cache_size = -16000')
      sqlite.pragma('mmap_size = 67108864')
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
