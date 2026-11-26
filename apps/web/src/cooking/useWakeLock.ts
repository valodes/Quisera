import { useWakeLock as useVueUseWakeLock } from '@vueuse/core'
import { onBeforeUnmount, onMounted, readonly, ref } from 'vue'

export function useWakeLock() {
  const { isSupported, isActive, request, release } = useVueUseWakeLock()
  const desired = ref(true)

  async function toggle() {
    if (desired.value) {
      desired.value = false
      await release().catch(() => {})
    } else {
      desired.value = true
      await request('screen').catch(() => {})
    }
  }

  onMounted(() => {
    if (isSupported.value && desired.value) {
      void request('screen').catch(() => {})
    }
  })

  onBeforeUnmount(() => {
    void release().catch(() => {})
  })

  return {
    supported: readonly(isSupported),
    active: readonly(isActive),
    desired: readonly(desired),
    toggle,
  }
}
