import { rmSync } from 'node:fs'

export default async function globalTeardown() {
  const temporaryDirectory = process.env.QUI_E2E_TEMP_DIR
  if (temporaryDirectory)
    rmSync(temporaryDirectory, { recursive: true, force: true })
}
