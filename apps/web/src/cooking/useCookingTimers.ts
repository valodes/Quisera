import { onBeforeUnmount, readonly, ref } from 'vue'

export type CookingTimer = {
  id: number
  label: string
  totalSeconds: number
  remainingSeconds: number
  running: boolean
  done: boolean
}

export type DetectedStepTimer = {
  minutes: number
  label: string
}

function playCompletionChime() {
  if (typeof window === 'undefined') return
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime
    for (const [offset, freq] of [
      [0, 880],
      [0.18, 1046.5],
      [0.36, 1318.5],
    ] as const) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + offset)
      gain.gain.setValueAtTime(0.08, now + offset)
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.22)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + offset)
      osc.stop(now + offset + 0.24)
    }
  } catch {
    // Ignore audio context restrictions if blocked by browser autoplay policy.
  }
}

export function extractNamedStepTimers(
  stepTitle: string | null,
  lines: readonly string[],
  stepNumber: number,
): DetectedStepTimer[] {
  const results: DetectedStepTimer[] = []
  const seenMinutes = new Set<number>()
  const rx = /(\d{1,3})\s*(?:min(?:utes?)?|mn)\b/gi

  for (const line of lines) {
    for (const match of line.matchAll(rx)) {
      const minutes = Number(match[1])
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 240 || seenMinutes.has(minutes)) {
        continue
      }
      seenMinutes.add(minutes)

      // Build a short, meaningful French label from the step title or the clause before the duration
      let label = stepTitle?.trim() || ''
      if (!label) {
        const before = line.slice(0, match.index ?? 0).trim()
        const clause = before
          .split(/[.!?;,]/)
          .map((part) => part.trim())
          .filter(Boolean)
          .at(-1)
        if (clause && clause.length >= 4) {
          label = clause.length > 36 ? `${clause.slice(0, 35).trimEnd()}…` : clause
        }
      }
      if (!label) label = `Étape ${stepNumber}`

      results.push({ minutes, label })
      if (results.length >= 4) return results
    }
  }

  return results
}

export function formatCountdown(seconds: number): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function useCookingTimers() {
  const timers = ref<CookingTimer[]>([])
  let nextId = 1
  let ticker: number | null = null

  function ensureTicker() {
    if (ticker !== null || typeof window === 'undefined') return
    ticker = window.setInterval(() => {
      let anyRunning = false
      let anyFinishedNow = false
      timers.value = timers.value.map((timer) => {
        if (!timer.running || timer.done) return timer
        if (timer.remainingSeconds <= 1) {
          anyFinishedNow = true
          return { ...timer, remainingSeconds: 0, running: false, done: true }
        }
        anyRunning = true
        return { ...timer, remainingSeconds: timer.remainingSeconds - 1 }
      })
      if (anyFinishedNow) playCompletionChime()
      if (!anyRunning && ticker !== null) {
        window.clearInterval(ticker)
        ticker = null
      }
    }, 1000)
  }

  function startTimer(label: string, minutes: number) {
    const cleanLabel = label.trim() || 'Minuteur'
    const totalSeconds = Math.max(1, Math.round(minutes * 60))
    const id = nextId
    nextId += 1
    timers.value = [
      ...timers.value,
      {
        id,
        label: cleanLabel,
        totalSeconds,
        remainingSeconds: totalSeconds,
        running: true,
        done: false,
      },
    ]
    ensureTicker()
    return id
  }

  function togglePause(id: number) {
    timers.value = timers.value.map((timer) => {
      if (timer.id !== id || timer.done) return timer
      return { ...timer, running: !timer.running }
    })
    if (timers.value.some((t) => t.running)) ensureTicker()
  }

  function addMinute(id: number) {
    timers.value = timers.value.map((timer) => {
      if (timer.id !== id) return timer
      return {
        ...timer,
        totalSeconds: timer.totalSeconds + 60,
        remainingSeconds: timer.remainingSeconds + 60,
        done: false,
        running: true,
      }
    })
    ensureTicker()
  }

  function dismissTimer(id: number) {
    timers.value = timers.value.filter((timer) => timer.id !== id)
    if (!timers.value.some((t) => t.running) && ticker !== null) {
      window.clearInterval(ticker)
      ticker = null
    }
  }

  onBeforeUnmount(() => {
    if (ticker !== null) {
      window.clearInterval(ticker)
      ticker = null
    }
  })

  return {
    timers: readonly(timers),
    startTimer,
    togglePause,
    addMinute,
    dismissTimer,
  }
}
