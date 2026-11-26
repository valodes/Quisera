import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const tokens = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'tokens.css'), 'utf8')

function extractBlock(selector: string): string {
  const escaped = selector
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/'([^']+)'/g, '[\'"]?$1[\'"]?')
  const match = tokens.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))
  const body = match?.[1]
  if (body === undefined) throw new Error(`Missing CSS block: ${selector}`)
  return body
}

function colorFrom(block: string, token: string): string {
  const match = block.match(new RegExp(`--q-${token}:\\s*(#[0-9a-fA-F]{6});`))
  const value = match?.[1]
  if (value === undefined) throw new Error(`Missing color token: --q-${token}`)
  return value
}

function luminance(hex: string): number {
  const [red = 0, green = 0, blue = 0] = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((value) => parseInt(value, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(foreground: string, background: string): number {
  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)

  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  )
}

const themes = [
  { name: 'jardin (default)', selector: ':root', hasExplicitSidebar: false },
  {
    name: 'catppuccin',
    selector: ":root[data-theme='catppuccin']",
    hasExplicitSidebar: true,
  },
  {
    name: 'moccachino',
    selector: ":root[data-theme='moccachino']",
    hasExplicitSidebar: true,
  },
  {
    name: 'sakura',
    selector: ":root[data-theme='sakura']",
    hasExplicitSidebar: true,
  },
  {
    name: 'nocturne',
    selector: ":root[data-theme='nocturne']",
    hasExplicitSidebar: true,
  },
  {
    name: 'foret-nuit',
    selector: ":root[data-theme='foret-nuit']",
    hasExplicitSidebar: true,
  },
] as const

describe.each(themes)('Theme "$name" WCAG contrast', (theme) => {
  const block = extractBlock(theme.selector)

  it.each([
    ['forest', 'sage', 4.5],
    ['forest', 'peach', 4.5],
    ['forest', 'shoot', 4.5],
    ['forest', 'coral', 4.5],
    ['leaf', 'peach', 4.5],
    ['peach', 'leaf', 4.5],
    ['tomato', 'peach', 3],
  ])('%s on %s meets its %s:1 contrast threshold', (foreground, background, threshold) => {
    expect(
      contrast(colorFrom(block, foreground), colorFrom(block, background)),
    ).toBeGreaterThanOrEqual(threshold)
  })

  if (theme.hasExplicitSidebar) {
    it('sidebar-text on sidebar-bg meets 4.5:1 contrast threshold', () => {
      expect(
        contrast(colorFrom(block, 'sidebar-text'), colorFrom(block, 'sidebar-bg')),
      ).toBeGreaterThanOrEqual(4.5)
    })
  }
})
