import Database from 'better-sqlite3'
import { chmodSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { resolve } from 'node:path'
import { parseEnvironment } from '../config/env.js'
import { openDatabase } from '../db/connection.js'
import { promptLine } from './prompt.js'

const [action, suppliedPath] = process.argv.slice(2)
const environment = parseEnvironment()
const connection = openDatabase(environment.SQLITE_PATH)

try {
  if (action === 'integrity') {
    const result = connection.sqlite.pragma('integrity_check') as Array<{
      integrity_check: string
    }>
    if (result.length !== 1 || result[0]?.integrity_check !== 'ok') {
      throw new Error('SQLite integrity check failed.')
    }
    console.info('SQLite integrity check: ok.')
  } else if ((action === 'backup' || action === 'restore') && suppliedPath) {
    const targetPath = resolve(suppliedPath)
    if (targetPath === resolve(environment.SQLITE_PATH)) {
      throw new Error('Source and destination database paths must differ.')
    }
    if (action === 'backup') {
      if (existsSync(targetPath)) throw new Error('Backup destination already exists.')
      mkdirSync(dirname(targetPath), { recursive: true })
      await connection.sqlite.backup(targetPath)
      chmodSync(targetPath, 0o600)
      console.info(`Consistent SQLite backup created at ${targetPath}.`)
    } else {
      if (connection.sqlite.prepare('SELECT 1').get() === undefined) {
        throw new Error('Current database is unavailable.')
      }
      const confirmation = await promptLine(`Type RESTORE ${targetPath} to replace this database: `)
      if (confirmation !== `RESTORE ${targetPath}`) throw new Error('Restore cancelled.')
      connection.close()
      const source = new Database(targetPath, {
        readonly: true,
        fileMustExist: true,
      })
      const integrity = source.pragma('integrity_check') as Array<{
        integrity_check: string
      }>
      if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') {
        source.close()
        throw new Error('Backup integrity check failed.')
      }
      const destinationPath = resolve(environment.SQLITE_PATH)
      mkdirSync(dirname(destinationPath), { recursive: true })
      for (const suffix of ['', '-wal', '-shm']) {
        rmSync(`${destinationPath}${suffix}`, { force: true })
      }
      await source.backup(destinationPath)
      source.close()
      chmodSync(destinationPath, 0o600)
      const restored = new Database(destinationPath)
      const restoredIntegrity = restored.pragma('integrity_check') as Array<{
        integrity_check: string
      }>
      restored.close()
      if (restoredIntegrity.length !== 1 || restoredIntegrity[0]?.integrity_check !== 'ok') {
        throw new Error('Restored database integrity check failed.')
      }
      console.info('Database restored from a verified backup.')
    }
  } else {
    throw new Error('Usage: pnpm db:<backup|restore> -- <sqlite-path> or pnpm db:integrity')
  }
} finally {
  try {
    if (connection.sqlite.open) connection.close()
  } catch {
    // The restore flow closes the source connection before replacing the database.
  }
}
