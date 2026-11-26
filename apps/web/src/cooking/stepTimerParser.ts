import parseDuration from 'parse-duration'
import frUnits from 'parse-duration/locale/fr.js'

parseDuration.unit = frUnits

export type DetectedStepTimer = {
  minutes: number
  label: string
  durationLabel: string
  shortDurationLabel: string
}

export type StepTimerContext = {
  ingredients?: ReadonlyArray<{ name: string }> | undefined
  recipeTitle?: string | null | undefined
}

const UNIT_SOURCE = String.raw`(?:heures?|hrs?|h|min(?:utes?)?|mn|sec(?:ondes?)?|s)`
const SINGLE_DURATION_SOURCE = String.raw`\d{1,3}\s*(?:heures?|hrs?|h)\s*(?:\d{1,2}\s*(?:min(?:utes?)?|mn)?)?|\d{1,3}\s*(?:min(?:utes?)?|mn|sec(?:ondes?)?|s)`
const STEP_DURATION_REGEX = new RegExp(
  String.raw`\b(?:(?<low>\d{1,3})(?:\s*(?<lowUnit>${UNIT_SOURCE}))?\s*(?:à|ou|[-–—])\s*)?(?<high>${SINGLE_DURATION_SOURCE})\b`,
  'gi',
)

const GENERIC_STEP_TITLES =
  /^(?:préparation|cuisson|dressage|finition|finitions|assemblage|montage|service|étape\s*\d+)$/i

const ACTION_RULES: ReadonlyArray<{ pattern: RegExp; action: string }> = [
  {
    pattern: /\b(?:enfourne[rz]?|four|gratine[rz]?|rôti(?:r|ssez))\b/i,
    action: 'Four',
  },
  {
    pattern: /\b(?:mijote[rz]?|frémir|frémissement|rédui(?:re|sez))\b/i,
    action: 'Mijotage',
  },
  {
    pattern:
      /\b(?:dore[rz]?|revenir|rissole[rz]?|saisi(?:r|ssez)|colore[rz]?|grille[rz]?|poêle[rz]?|suer|caramélise[rz]?)\b/i,
    action: 'Dorer',
  },
  { pattern: /\b(?:bouillir|ébullition)\b/i, action: 'Ébullition' },
  { pattern: /\bvapeur\b/i, action: 'Vapeur' },
  { pattern: /\b(?:blanchi(?:r|ssez)|poche[rz]?)\b/i, action: 'Pocher' },
  { pattern: /\binfuse[rz]?\b/i, action: 'Infusion' },
  { pattern: /\bmarine[rz]?\b/i, action: 'Marinade' },
  { pattern: /\b(?:lever|pousse[rz]?)\b/i, action: 'Pousse' },
  {
    pattern: /\b(?:refroidir|frais|réfrigérateur|frigo|congélateur|froid)\b/i,
    action: 'Au frais',
  },
  { pattern: /\b(?:repose[rz]?|tiédir|détendre)\b/i, action: 'Repos' },
  { pattern: /\b(?:cuire|cuisez|cuisson|chauffe[rz]?|réchauffe[rz]?)\b/i, action: 'Cuisson' },
]

const CULINARY_TARGETS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\bmoules?\b/i, label: 'Moules' },
  { pattern: /\bplat\s+à\s+gratin\b|\bgratin\b/i, label: 'Gratin' },
  { pattern: /\bgâteau\b|\bcake\b|\bmoelleux\b|\bfondants?\b|\bbrownie\b/i, label: 'Gâteau' },
  { pattern: /\bbiscuits?\b|\bcookies?\b|\bsablés?\b/i, label: 'Biscuits' },
  { pattern: /\btarte\b|\bquiche\b|\bfond\s+de\s+tarte\b/i, label: 'Tarte' },
  { pattern: /\bbrioche\b|\bpain\b/i, label: 'Brioche' },
  {
    pattern: /\bpâtes\b|\bspaghettis?\b|\bpennes?\b|\btagliatelles?\b|\bgnocchis?\b/i,
    label: 'Pâtes',
  },
  { pattern: /\bpâte\b/i, label: 'Pâte' },
  { pattern: /\bappareil\b/i, label: 'Appareil' },
  { pattern: /\brisotto\b|\briz\b/i, label: 'Riz' },
  { pattern: /\bsauce\b/i, label: 'Sauce' },
  { pattern: /\bbouillon\b|\bsoupe\b|\bvelouté\b/i, label: 'Bouillon' },
  { pattern: /\bmarinade\b/i, label: 'Marinade' },
  { pattern: /\bfarce\b|\bgarniture\b/i, label: 'Garniture' },
  { pattern: /\bpurée\b/i, label: 'Purée' },
  { pattern: /\blégumes\b/i, label: 'Légumes' },
  { pattern: /\boignons?\b|\béchalotes?\b/i, label: 'Oignons' },
  { pattern: /\bpoulet\b|\bvolaille\b/i, label: 'Poulet' },
  { pattern: /\bviande\b|\bbœuf\b|\bboeuf\b|\bporc\b|\bagneau\b/i, label: 'Viande' },
  { pattern: /\bpoisson\b|\bsaumon\b|\bcabillaud\b|\bcrevettes?\b/i, label: 'Poisson' },
]

const PANTRY_NOISE = new Set([
  'sel',
  'poivre',
  'eau',
  'huile',
  "huile d'olive",
  'huile de tournesol',
  'beurre',
  'farine',
  'sucre',
  'gousse',
  'brin',
  'feuille',
  'pincee',
])

function foldText(value: string): string {
  return value
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function capitalizeLabel(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

function cleanStepTitle(stepTitle: string | null): string | null {
  if (!stepTitle) return null
  const trimmed = stepTitle.trim()
  if (!trimmed || GENERIC_STEP_TITLES.test(trimmed)) return null
  return capitalizeLabel(trimmed.replace(/^(?:le|la|les|l['’])\s+/i, ''))
}

type CandidateTarget = {
  foldedToken: string
  wordRegex: RegExp
  label: string
}

function buildIngredientCandidates(
  ingredients: ReadonlyArray<{ name: string }> | undefined,
): CandidateTarget[] {
  if (!ingredients?.length) return []
  const candidates: CandidateTarget[] = []
  const seen = new Set<string>()

  for (const item of ingredients) {
    const raw = item.name
      .replace(/\([^)]*\)/g, '')
      .split(',')[0]
      ?.trim()
    if (!raw) continue
    const stripped = raw
      .replace(
        /^(?:filets?|pavés?|escalopes?|morceaux?|tranches?|gousses?|brins?|feuilles?|bottes?|boîtes?|sachets?|dés|rondelles)\s+(?:de\s+|d['’]\s*)/i,
        '',
      )
      .replace(/^(?:le|la|les|du|de\s+la|des|d['’])\s+/i, '')
      .trim()
    const folded = foldText(stripped)
    if (!folded || folded.length < 3 || PANTRY_NOISE.has(folded) || seen.has(folded)) continue

    const headWord = folded.split(/[\s'-]+/)[0] ?? ''
    if (headWord.length < 3 || PANTRY_NOISE.has(headWord)) continue
    seen.add(folded)

    const escapedHead = headWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[sx]$/, '')
    candidates.push({
      foldedToken: headWord,
      wordRegex: new RegExp(`\\b${escapedHead}[sx]?\\b`, 'i'),
      label: capitalizeLabel(stripped.length <= 22 ? stripped : headWord),
    })
  }

  return candidates
}

function stripParentheticals(text: string): string {
  return text.replace(/\([^)]*\)/g, ' ')
}

function findSubjectInSnippet(
  snippet: string,
  ingredientCandidates: readonly CandidateTarget[],
): string | null {
  const clean = stripParentheticals(snippet)
  const folded = foldText(clean)

  for (const candidate of ingredientCandidates) {
    if (candidate.wordRegex.test(folded)) {
      return candidate.label
    }
  }

  for (const target of CULINARY_TARGETS) {
    if (target.pattern.test(clean)) {
      return target.label
    }
  }

  return null
}

function extractAction(clauseAround: string, fullSentence: string): string | null {
  for (const rule of ACTION_RULES) {
    if (rule.pattern.test(clauseAround)) return rule.action
  }
  for (const rule of ACTION_RULES) {
    if (rule.pattern.test(fullSentence)) return rule.action
  }
  return null
}

function cleanFallbackClause(rawBefore: string): string {
  return (
    rawBefore
      .split(/[.!?;,]/)
      .map((part) =>
        part
          .trim()
          .replace(/^(?:et|puis|ensuite|alors)\s+/i, '')
          .replace(
            /\s+(?:pendant|durant|environ|encore|au\s+moins|jusqu['’]à|entre|de|d['’]|pour|sur|à)\s*$/i,
            '',
          )
          .trim(),
      )
      .filter(Boolean)
      .at(-1) ?? ''
  )
}

function formatShortDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  if (hours > 0) {
    return mins > 0 ? `${hours} h ${String(mins).padStart(2, '0')}` : `${hours} h`
  }
  return `${totalMinutes} min`
}

export function extractNamedStepTimers(
  stepTitle: string | null,
  lines: readonly string[],
  stepNumber: number,
  context?: StepTimerContext,
): DetectedStepTimer[] {
  const results: DetectedStepTimer[] = []
  const seenKeys = new Set<string>()
  const ingredientCandidates = buildIngredientCandidates(context?.ingredients)
  const normalizedTitle = cleanStepTitle(stepTitle)
  const priorSentences: string[] = []

  for (const line of lines) {
    const sentences = line
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean)

    for (const sentence of sentences) {
      let lastEnd = 0

      for (const match of sentence.matchAll(STEP_DURATION_REGEX)) {
        const highText = match.groups?.['high']
        const lowRaw = match.groups?.['low']
        const lowUnitRaw = match.groups?.['lowUnit']
        const matchStart = match.index ?? 0
        const prevEnd = lastEnd
        lastEnd = matchStart + match[0].length
        if (!highText) continue

        const highSeconds = parseDuration(highText, 's')
        if (
          highSeconds === null ||
          !Number.isFinite(highSeconds) ||
          highSeconds < 10 ||
          highSeconds > 4 * 3600
        ) {
          continue
        }

        let targetSeconds = Math.round(highSeconds)
        let rangeText: string | null = null

        if (lowRaw) {
          const inferredUnit =
            lowUnitRaw ??
            (/\b(?:heures?|hrs?|h)\b/i.exec(highText)?.[0] ||
              /\b(?:sec(?:ondes?)?|s)\b/i.exec(highText)?.[0] ||
              'min')
          const lowSeconds = parseDuration(`${lowRaw} ${inferredUnit}`, 's')
          if (lowSeconds !== null && lowSeconds >= 10 && lowSeconds < highSeconds) {
            targetSeconds = Math.round(lowSeconds)
            const lowShort = formatShortDuration(targetSeconds)
            const highShort = formatShortDuration(Math.round(highSeconds))
            if (lowShort.endsWith(' min') && highShort.endsWith(' min')) {
              rangeText = `${lowShort} (${Math.round(targetSeconds / 60)}–${Math.round(highSeconds / 60)})`
            } else {
              rangeText = `${lowShort} (${lowShort}–${highShort})`
            }
          }
        }

        const beforeSlice = sentence.slice(prevEnd, matchStart).split(/[,;]/).at(-1) ?? ''
        const afterSlice = (sentence.slice(lastEnd).split(/[,;]/)[0] ?? '').slice(0, 50)

        let label = ''
        if (prevEnd === 0 && normalizedTitle && results.length === 0) {
          label = normalizedTitle
        } else {
          const action = extractAction(`${beforeSlice} ${afterSlice}`, sentence)
          let subject = findSubjectInSnippet(`${beforeSlice} ${afterSlice}`, ingredientCandidates)

          if (!subject && prevEnd === 0) {
            subject = findSubjectInSnippet(sentence, ingredientCandidates)
            if (!subject) {
              for (let i = priorSentences.length - 1; i >= 0; i -= 1) {
                subject = findSubjectInSnippet(priorSentences[i] ?? '', ingredientCandidates)
                if (subject) break
              }
            }
          }

          if (
            !subject &&
            prevEnd === 0 &&
            (action === 'Four' || action === 'Au frais') &&
            context?.recipeTitle?.trim()
          ) {
            const shortRecipe = context.recipeTitle.trim()
            subject =
              shortRecipe.length > 26 ? `${shortRecipe.slice(0, 25).trimEnd()}…` : shortRecipe
          }

          if (action && subject) {
            label = foldText(subject).includes(foldText(action))
              ? subject
              : `${action} · ${subject}`
          } else if (action) {
            label = action
          } else if (subject) {
            label = subject
          } else {
            const fallback = cleanFallbackClause(beforeSlice)
            if (fallback.length >= 4) {
              const capped = capitalizeLabel(fallback)
              label = capped.length > 36 ? `${capped.slice(0, 35).trimEnd()}…` : capped
            } else {
              label = normalizedTitle ?? `Étape ${stepNumber}`
            }
          }
        }

        const dedupeKey = `${targetSeconds}:${foldText(label)}`
        if (seenKeys.has(dedupeKey)) continue
        seenKeys.add(dedupeKey)

        const shortDurationLabel = formatShortDuration(targetSeconds)
        const minutes = Math.round((targetSeconds / 60) * 100) / 100

        results.push({
          minutes,
          label,
          durationLabel: rangeText ?? shortDurationLabel,
          shortDurationLabel,
        })
        if (results.length >= 4) return results
      }

      priorSentences.push(sentence)
    }
  }

  return results
}
