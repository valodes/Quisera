import { onBeforeUnmount, onMounted, ref } from 'vue'

type DevicePostureLike = EventTarget & {
  type?: 'continuous' | 'folded'
}

type NavigatorWithPosture = Navigator & {
  devicePosture?: DevicePostureLike
}

export function useFoldablePosture(forcedMode?: () => string | null) {
  const isFlexMode = ref(false)
  const isCoverScreen = ref(false)

  let postureMedia: MediaQueryList | null = null
  let segmentsMedia: MediaQueryList | null = null
  let coverMedia: MediaQueryList | null = null

  function evaluate() {
    const forced = forcedMode?.()
    if (forced === 'flex') {
      isFlexMode.value = true
      isCoverScreen.value = false
      return
    }
    if (forced === 'cover') {
      isFlexMode.value = false
      isCoverScreen.value = true
      return
    }

    const nav = typeof navigator !== 'undefined' ? (navigator as NavigatorWithPosture) : null
    const postureFolded =
      nav?.devicePosture?.type === 'folded' ||
      Boolean(postureMedia?.matches) ||
      Boolean(segmentsMedia?.matches)

    const coverMatches = Boolean(coverMedia?.matches)

    isCoverScreen.value = !postureFolded && coverMatches
    isFlexMode.value = postureFolded
  }

  onMounted(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      postureMedia = window.matchMedia('(device-posture: folded)')
      segmentsMedia = window.matchMedia('(vertical-viewport-segments: 2)')
      coverMedia = window.matchMedia('(max-width: 460px) and (max-height: 480px)')

      postureMedia.addEventListener('change', evaluate)
      segmentsMedia.addEventListener('change', evaluate)
      coverMedia.addEventListener('change', evaluate)
    }

    const nav = typeof navigator !== 'undefined' ? (navigator as NavigatorWithPosture) : null
    nav?.devicePosture?.addEventListener('change', evaluate)

    evaluate()
  })

  onBeforeUnmount(() => {
    postureMedia?.removeEventListener('change', evaluate)
    segmentsMedia?.removeEventListener('change', evaluate)
    coverMedia?.removeEventListener('change', evaluate)
    const nav = typeof navigator !== 'undefined' ? (navigator as NavigatorWithPosture) : null
    nav?.devicePosture?.removeEventListener('change', evaluate)
  })

  return {
    isFlexMode,
    isCoverScreen,
    refreshPosture: evaluate,
  }
}
