import { useEventListener, useMediaQuery } from '@vueuse/core'
import { computed, ref } from 'vue'

type DevicePostureLike = EventTarget & {
  type?: 'continuous' | 'folded'
}

type NavigatorWithPosture = Navigator & {
  devicePosture?: DevicePostureLike
}

export function useFoldablePosture(forcedMode?: () => string | null) {
  const postureMedia = useMediaQuery('(device-posture: folded)')
  const segmentsMedia = useMediaQuery('(vertical-viewport-segments: 2)')
  const coverMedia = useMediaQuery('(max-width: 460px) and (max-height: 480px)')
  const postureTick = ref(0)

  const nav = typeof navigator !== 'undefined' ? (navigator as NavigatorWithPosture) : null
  if (nav?.devicePosture) {
    useEventListener(nav.devicePosture, 'change', () => {
      postureTick.value += 1
    })
  }

  function refreshPosture() {
    postureTick.value += 1
  }

  const isFlexMode = computed(() => {
    void postureTick.value
    const forced = forcedMode?.()
    if (forced === 'flex') return true
    if (forced === 'cover') return false
    return nav?.devicePosture?.type === 'folded' || postureMedia.value || segmentsMedia.value
  })

  const isCoverScreen = computed(() => {
    void postureTick.value
    const forced = forcedMode?.()
    if (forced === 'cover') return true
    if (forced === 'flex') return false
    return !isFlexMode.value && coverMedia.value
  })

  return {
    isFlexMode,
    isCoverScreen,
    refreshPosture,
  }
}
