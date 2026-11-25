export type ThemeId = 'jardin' | 'catppuccin' | 'moccachino' | 'sakura' | 'nocturne' | 'foret-nuit'

export type ThemeOption = {
  id: ThemeId
  name: string
  description: string
  mode: 'light' | 'dark'
  swatches: Array<{ label: string; hex: string }>
}

export const THEME_STORAGE_KEY = 'quisera:theme'

export const themeOptions: readonly ThemeOption[] = [
  {
    id: 'jardin',
    name: 'Jardin Quisera',
    description: 'Palette botanique d’origine : sauge, pêche et vert forêt.',
    mode: 'light',
    swatches: [
      { label: 'Fond sauge', hex: '#D7E8D6' },
      { label: 'Surface pêche', hex: '#FCE3D8' },
      { label: 'Vert forêt', hex: '#173D2C' },
      { label: 'Jeune pousse', hex: '#DAF097' },
      { label: 'Corail', hex: '#F08262' },
    ],
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin Latte',
    description: 'Pastels doux inspirés de Catppuccin sur encre ardoise.',
    mode: 'light',
    swatches: [
      { label: 'Fond brume', hex: '#E6E9EF' },
      { label: 'Surface latte', hex: '#EFF1F5' },
      { label: 'Encre ardoise', hex: '#2F3246' },
      { label: 'Lavande', hex: '#D9D2F8' },
      { label: 'Flamant', hex: '#F5C2B4' },
    ],
  },
  {
    id: 'moccachino',
    name: 'Moccachino',
    description: 'Notes chaudes de café torréfié, lait d’avoine et caramel.',
    mode: 'light',
    swatches: [
      { label: 'Lait d’avoine', hex: '#E8DDD1' },
      { label: 'Crème chaude', hex: '#F7F1E9' },
      { label: 'Espresso', hex: '#3B2314' },
      { label: 'Caramel', hex: '#E8C9A1' },
      { label: 'Cannelle', hex: '#DFA684' },
    ],
  },
  {
    id: 'sakura',
    name: 'Sakura',
    description: 'Fleurs de cerisier, soie rosée, matcha tendre et encre prune.',
    mode: 'light',
    swatches: [
      { label: 'Pétale rosé', hex: '#F5DCE4' },
      { label: 'Soie sakura', hex: '#FDF2F6' },
      { label: 'Encre prune', hex: '#3D1A2B' },
      { label: 'Matcha tendre', hex: '#E6E8B8' },
      { label: 'Cerisier', hex: '#F4A7BE' },
    ],
  },
  {
    id: 'nocturne',
    name: 'Nuit Lavande',
    description: 'Thème sombre ardoise inspiré de Catppuccin Mocha.',
    mode: 'dark',
    swatches: [
      { label: 'Nuit profonde', hex: '#181825' },
      { label: 'Surface ardoise', hex: '#242538' },
      { label: 'Clair lunaire', hex: '#E6ECFF' },
      { label: 'Menthe nuit', hex: '#2F4538' },
      { label: 'Prune douce', hex: '#5A3348' },
    ],
  },
  {
    id: 'foret-nuit',
    name: 'Sous-Bois Nocturne',
    description: 'Thème sombre émeraude nuit, mousse et braise ambrée.',
    mode: 'dark',
    swatches: [
      { label: 'Émeraude nuit', hex: '#101E18' },
      { label: 'Feuillage sombre', hex: '#192D24' },
      { label: 'Brume claire', hex: '#E8F3E6' },
      { label: 'Mousse', hex: '#2D4A2B' },
      { label: 'Braise', hex: '#633526' },
    ],
  },
] as const

const validThemeIds = new Set<string>(themeOptions.map((option) => option.id))

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && validThemeIds.has(value)
}

export function getStoredTheme(): ThemeId {
  if (typeof window === 'undefined') return 'jardin'
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  return isThemeId(stored) ? stored : 'jardin'
}

export function applyTheme(id: ThemeId) {
  if (typeof document !== 'undefined') {
    if (id === 'jardin') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', id)
    }
  }
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(THEME_STORAGE_KEY, id)
  }
}

export function initTheme() {
  applyTheme(getStoredTheme())
}
