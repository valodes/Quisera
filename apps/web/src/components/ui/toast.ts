import { readonly, ref } from 'vue'

export type ToastVariant = 'success' | 'error'

export type ToastItem = {
  id: number
  variant: ToastVariant
  message: string
}

const items = ref<ToastItem[]>([])
let nextId = 1
const timers = new Map<number, number>()

export function dismissToast(id: number) {
  const timer = timers.get(id)
  if (timer !== undefined) {
    window.clearTimeout(timer)
    timers.delete(id)
  }
  items.value = items.value.filter((item) => item.id !== id)
}

export function pushToast(
  message: string,
  variant: ToastVariant = 'success',
  durationMs = variant === 'error' ? 6000 : 3500,
) {
  const id = nextId
  nextId += 1
  items.value = [...items.value.slice(-3), { id, variant, message }]
  if (typeof window !== 'undefined' && durationMs > 0) {
    const timer = window.setTimeout(() => dismissToast(id), durationMs)
    timers.set(id, timer)
  }
  return id
}

export function useToast() {
  return {
    items: readonly(items),
    success: (message: string) => pushToast(message, 'success'),
    error: (message: string) => pushToast(message, 'error'),
    dismiss: dismissToast,
  }
}
