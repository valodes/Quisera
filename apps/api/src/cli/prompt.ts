import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

export async function promptLine(label: string): Promise<string> {
  const terminal = createInterface({ input: stdin, output: stdout })
  try {
    return (await terminal.question(label)).trim()
  } finally {
    terminal.close()
  }
}

export async function promptSecret(label: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error('Password prompts require an interactive terminal.')
  }

  stdout.write(label)
  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')

  let value = ''
  try {
    while (true) {
      const chunk = await new Promise<string>((resolve) => stdin.once('data', resolve))
      for (const character of chunk) {
        if (character === '\u0003') throw new Error('Prompt cancelled.')
        if (character === '\r' || character === '\n') {
          stdout.write('\n')
          return value
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1)
          continue
        }
        value += character
      }
    }
  } finally {
    stdin.setRawMode(false)
    stdin.pause()
  }
}

export async function promptConfirmedPassword(): Promise<string> {
  const password = await promptSecret('Mot de passe (12 caractères minimum) : ')
  const confirmation = await promptSecret('Confirmer le mot de passe : ')
  if (password.length < 12 || password.length > 128) {
    throw new Error('Password must contain between 12 and 128 characters.')
  }
  if (password !== confirmation) throw new Error('Passwords do not match.')
  return password
}
