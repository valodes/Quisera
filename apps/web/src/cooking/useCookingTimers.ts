import { readonly, ref } from 'vue'

export type CookingTimer = {
  id: number
  recipeKey: string | null
  label: string
  totalSeconds: number
  remainingSeconds: number
  endsAtMs: number | null
  running: boolean
  done: boolean
}

const TIMERS_STORAGE_KEY = 'quisera:cooking-timers-v1'

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
    window.setTimeout(() => {
      void ctx.close().catch(() => {})
    }, 800)
  } catch {
    // Ignore audio context restrictions if blocked by browser autoplay policy.
  }
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

function loadStoredTimers(): { list: CookingTimer[]; maxId: number } {
  if (typeof window === 'undefined') return { list: [], maxId: 0 }
  try {
    const raw = window.localStorage.getItem(TIMERS_STORAGE_KEY)
    if (!raw) return { list: [], maxId: 0 }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return { list: [], maxId: 0 }
    const now = Date.now()
    let maxId = 0
    const list: CookingTimer[] = []

    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue
      const r = entry as Record<string, unknown>
      const id = typeof r['id'] === 'number' ? r['id'] : 0
      const label = typeof r['label'] === 'string' ? r['label'] : 'Minuteur'
      const totalSeconds = typeof r['totalSeconds'] === 'number' ? r['totalSeconds'] : 60
      let remainingSeconds =
        typeof r['remainingSeconds'] === 'number' ? r['remainingSeconds'] : totalSeconds
      let running = Boolean(r['running'])
      let done = Boolean(r['done'])
      const endsAtMs = typeof r['endsAtMs'] === 'number' ? r['endsAtMs'] : null
      const recipeKey = typeof r['recipeKey'] === 'string' ? r['recipeKey'] : null

      if (id <= 0) continue
      if (id > maxId) maxId = id

      if (running && endsAtMs !== null) {
        const left = Math.max(0, Math.ceil((endsAtMs - now) / 1000))
        remainingSeconds = left
        if (left <= 0) {
          running = false
          done = true
        }
      }

      list.push({
        id,
        recipeKey,
        label,
        totalSeconds,
        remainingSeconds,
        endsAtMs: running ? endsAtMs : null,
        running,
        done,
      })
    }

    return { list, maxId }
  } catch {
    return { list: [], maxId: 0 }
  }
}

const initialTimers = loadStoredTimers()
const globalTimers = ref<CookingTimer[]>(initialTimers.list)
let nextTimerId = initialTimers.maxId + 1
let globalTicker: number | null = null

function persistTimers() {
  if (typeof window === 'undefined') return
  try {
    if (globalTimers.value.length === 0) {
      window.localStorage.removeItem(TIMERS_STORAGE_KEY)
    } else {
      window.localStorage.setItem(TIMERS_STORAGE_KEY, JSON.stringify(globalTimers.value))
    }
  } catch {
    // Ignore storage quota errors
  }
}

function tickGlobalTimers() {
  const now = Date.now()
  let anyRunning = false
  let anyFinishedNow = false

  globalTimers.value = globalTimers.value.map((timer) => {
    if (!timer.running || timer.done) return timer
    const remaining =
      timer.endsAtMs !== null
        ? Math.max(0, Math.ceil((timer.endsAtMs - now) / 1000))
        : Math.max(0, timer.remainingSeconds - 1)
    if (remaining <= 0) {
      anyFinishedNow = true
      return { ...timer, remainingSeconds: 0, endsAtMs: null, running: false, done: true }
    }
    anyRunning = true
    return { ...timer, remainingSeconds: remaining }
  })

  if (anyFinishedNow) {
    persistTimers()
    playCompletionChime()
  }
  if (!anyRunning && globalTicker !== null && typeof window !== 'undefined') {
    window.clearInterval(globalTicker)
    globalTicker = null
  }
}

function ensureGlobalTicker() {
  if (typeof window === 'undefined' || globalTicker !== null) return
  if (!globalTimers.value.some((t) => t.running && !t.done)) return
  globalTicker = window.setInterval(tickGlobalTimers, 1000)
}

if (typeof window !== 'undefined') {
  ensureGlobalTicker()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && globalTimers.value.some((t) => t.running)) {
      tickGlobalTimers()
    }
  })
  window.addEventListener('storage', (event) => {
    if (event.key !== TIMERS_STORAGE_KEY) return
    const loaded = loadStoredTimers()
    globalTimers.value = loaded.list
    if (loaded.maxId >= nextTimerId) nextTimerId = loaded.maxId + 1
    if (loaded.list.some((t) => t.running && !t.done)) ensureGlobalTicker()
  })
}

export function useCookingTimers() {
  function uniqueTimerLabel(rawLabel: string): string {
    const base = rawLabel.trim() || 'Minuteur'
    const existing = new Set(globalTimers.value.map((t) => t.label))
    if (!existing.has(base)) return base
    let suffix = 2
    while (existing.has(`${base} #${suffix}`)) {
      suffix += 1
    }
    return `${base} #${suffix}`
  }

  function startTimer(label: string, minutes: number, recipeKey: string | null = null) {
    const cleanLabel = uniqueTimerLabel(label)
    const totalSeconds = Math.max(1, Math.round(minutes * 60))
    const id = nextTimerId
    nextTimerId += 1
    globalTimers.value = [
      ...globalTimers.value,
      {
        id,
        recipeKey,
        label: cleanLabel,
        totalSeconds,
        remainingSeconds: totalSeconds,
        endsAtMs: Date.now() + totalSeconds * 1000,
        running: true,
        done: false,
      },
    ]
    persistTimers()
    ensureGlobalTicker()
    return id
  }

  function togglePause(id: number) {
    const now = Date.now()
    globalTimers.value = globalTimers.value.map((timer) => {
      if (timer.id !== id || timer.done) return timer
      if (timer.running) {
        const remaining =
          timer.endsAtMs !== null
            ? Math.max(1, Math.ceil((timer.endsAtMs - now) / 1000))
            : timer.remainingSeconds
        return { ...timer, remainingSeconds: remaining, endsAtMs: null, running: false }
      }
      return {
        ...timer,
        endsAtMs: now + timer.remainingSeconds * 1000,
        running: true,
      }
    })
    persistTimers()
    if (globalTimers.value.some((t) => t.running)) ensureGlobalTicker()
    else if (globalTicker !== null && typeof window !== 'undefined') {
      window.clearInterval(globalTicker)
      globalTicker = null
    }
  }

  function addMinute(id: number) {
    const now = Date.now()
    globalTimers.value = globalTimers.value.map((timer) => {
      if (timer.id !== id) return timer
      const nextRemaining = timer.remainingSeconds + 60
      return {
        ...timer,
        totalSeconds: timer.totalSeconds + 60,
        remainingSeconds: nextRemaining,
        endsAtMs: now + nextRemaining * 1000,
        done: false,
        running: true,
      }
    })
    persistTimers()
    ensureGlobalTicker()
  }

  function dismissTimer(id: number) {
    globalTimers.value = globalTimers.value.filter((timer) => timer.id !== id)
    persistTimers()
    if (
      !globalTimers.value.some((t) => t.running) &&
      globalTicker !== null &&
      typeof window !== 'undefined'
    ) {
      window.clearInterval(globalTicker)
      globalTicker = null
    }
  }

  function clearTimersForRecipe(recipeKey: string) {
    globalTimers.value = globalTimers.value.filter(
      (timer) => timer.recipeKey !== null && timer.recipeKey !== recipeKey,
    )
    persistTimers()
    if (
      !globalTimers.value.some((t) => t.running) &&
      globalTicker !== null &&
      typeof window !== 'undefined'
    ) {
      window.clearInterval(globalTicker)
      globalTicker = null
    }
  }

  return {
    timers: readonly(globalTimers),
    startTimer,
    togglePause,
    addMinute,
    dismissTimer,
    clearTimersForRecipe,
  }
}
