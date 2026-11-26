import { onBeforeUnmount, onMounted, ref } from 'vue'

type WakeLockSentinelLike = {
  released: boolean
  release: () => Promise<void>
  addEventListener?: (type: 'release', listener: () => void) => void
}

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>
  }
}

export function useWakeLock() {
  const supported = ref(
    typeof navigator !== 'undefined' &&
      'wakeLock' in navigator &&
      typeof (navigator as NavigatorWithWakeLock).wakeLock?.request === 'function',
  )
  const active = ref(false)
  const desired = ref(true)
  let sentinel: WakeLockSentinelLike | null = null

  async function acquire() {
    if (!supported.value || !desired.value) return
    const nav = navigator as NavigatorWithWakeLock
    if (!nav.wakeLock) return
    try {
      sentinel = await nav.wakeLock.request('screen')
      active.value = true
      sentinel.addEventListener?.('release', () => {
        active.value = false
      })
    } catch {
      active.value = false
    }
  }

  async function release() {
    if (sentinel) {
      try {
        await sentinel.release()
      } catch {
        // Ignore release errors when browser already released the sentinel.
      }
      sentinel = null
    }
    active.value = false
  }

  async function toggle() {
    if (desired.value) {
      desired.value = false
      await release()
    } else {
      desired.value = true
      await acquire()
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible' && desired.value && !active.value) {
      void acquire()
    }
  }

  onMounted(() => {
    void acquire()
    document.addEventListener('visibilitychange', handleVisibilityChange)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    void release()
  })

  return {
    supported,
    active,
    desired,
    toggle,
  }
}
