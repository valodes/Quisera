import { usePreferredReducedMotion } from '@vueuse/core'
import { onBeforeUnmount, ref } from 'vue'
import type { PlanningRange } from '@quisera/shared'

type SlotMeal = NonNullable<PlanningRange['days'][number]['lunch']['meal']>

export type FloatingMealCard = {
  x: number
  y: number
  width: number
  offsetX: number
  offsetY: number
  angle: number
  settling: boolean
  meal: SlotMeal
  period: 'lunch' | 'dinner'
}

export function slotKey(date: string, period: 'lunch' | 'dinner') {
  return `${date}:${period}`
}

function hitTestSlot(clientX: number, clientY: number) {
  const elements = document.elementsFromPoint(clientX, clientY)
  for (const el of elements) {
    const slotEl = (el as HTMLElement).closest?.('[data-slot-key]') as HTMLElement | null
    if (slotEl?.dataset['slotKey']) return slotEl.dataset['slotKey']
  }
  return null
}

export function useSlotDrag(options: {
  onDropSlot: (
    sourceDate: string,
    sourcePeriod: 'lunch' | 'dinner',
    targetDate: string,
    targetPeriod: 'lunch' | 'dinner',
  ) => Promise<boolean>
}) {
  const reducedMotion = usePreferredReducedMotion()
  const dragSource = ref<{
    date: string
    period: 'lunch' | 'dinner'
    meal: SlotMeal
  } | null>(null)
  const dragOverKey = ref<string | null>(null)
  const justDroppedKey = ref<string | null>(null)
  const justSwappedKey = ref<string | null>(null)
  const suppressClick = ref(false)
  const floatingCard = ref<FloatingMealCard | null>(null)

  let pendingDrag: {
    pointerId: number
    startX: number
    startY: number
    offsetX: number
    offsetY: number
    width: number
    date: string
    period: 'lunch' | 'dinner'
    meal: SlotMeal
  } | null = null
  let dragRafId: number | null = null
  let lastFrameTime = 0
  let lastPointerX = 0
  let pointerTargetX = 0
  let pointerTargetY = 0
  let pendulumAngle = 0
  let pendulumVel = 0

  function isReducedMotion() {
    return reducedMotion.value === 'reduce'
  }

  function autoScrollViewport() {
    if (typeof window === 'undefined') return
    const edgeThreshold = 64
    const maxSpeed = 14
    if (pointerTargetY < edgeThreshold) {
      window.scrollBy(0, -Math.ceil(((edgeThreshold - pointerTargetY) / edgeThreshold) * maxSpeed))
    } else if (pointerTargetY > window.innerHeight - edgeThreshold) {
      window.scrollBy(
        0,
        Math.ceil(
          ((pointerTargetY - (window.innerHeight - edgeThreshold)) / edgeThreshold) * maxSpeed,
        ),
      )
    }

    const board = document.querySelector<HTMLElement>('.planning__cycle-scroll')
    if (board) {
      const rect = board.getBoundingClientRect()
      if (pointerTargetX < rect.left + edgeThreshold && pointerTargetX >= rect.left) {
        board.scrollLeft -= maxSpeed
      } else if (pointerTargetX > rect.right - edgeThreshold && pointerTargetX <= rect.right) {
        board.scrollLeft += maxSpeed
      }
    }
  }

  function stepPendulum(now: number) {
    if (!floatingCard.value) {
      dragRafId = null
      return
    }
    const dt = Math.min((now - lastFrameTime) / 1000, 0.05)
    lastFrameTime = now

    autoScrollViewport()

    if (isReducedMotion()) {
      pendulumAngle = 0
      pendulumVel = 0
    } else if (dt > 0) {
      const vx = (pointerTargetX - lastPointerX) / dt
      lastPointerX = pointerTargetX

      const stiffness = 210
      const damping = 10.5
      const impulse = Math.max(-2400, Math.min(2400, vx)) * -0.14
      const angularAcc = -stiffness * pendulumAngle - damping * pendulumVel + impulse
      pendulumVel += angularAcc * dt
      pendulumAngle += pendulumVel * dt
      pendulumAngle = Math.max(-24, Math.min(24, pendulumAngle))
    }

    floatingCard.value = {
      ...floatingCard.value,
      x: pointerTargetX - floatingCard.value.offsetX,
      y: pointerTargetY - floatingCard.value.offsetY,
      angle: pendulumAngle,
    }

    dragRafId = window.requestAnimationFrame(stepPendulum)
  }

  function handlePointerMove(event: PointerEvent) {
    pointerTargetX = event.clientX
    pointerTargetY = event.clientY

    if (pendingDrag && !dragSource.value) {
      const dx = event.clientX - pendingDrag.startX
      const dy = event.clientY - pendingDrag.startY
      if (Math.hypot(dx, dy) < 6) return

      dragSource.value = {
        date: pendingDrag.date,
        period: pendingDrag.period,
        meal: pendingDrag.meal,
      }
      suppressClick.value = true
      pendulumAngle = 0
      pendulumVel = isReducedMotion() ? 0 : 65
      lastPointerX = event.clientX
      lastFrameTime = performance.now()
      floatingCard.value = {
        x: event.clientX - pendingDrag.offsetX,
        y: event.clientY - pendingDrag.offsetY,
        width: pendingDrag.width,
        offsetX: pendingDrag.offsetX,
        offsetY: pendingDrag.offsetY,
        angle: 0,
        settling: false,
        meal: pendingDrag.meal,
        period: pendingDrag.period,
      }
      document.body.style.userSelect = 'none'
      dragRafId = window.requestAnimationFrame(stepPendulum)
    }

    if (dragSource.value) {
      const hovered = hitTestSlot(event.clientX, event.clientY)
      const sourceKey = slotKey(dragSource.value.date, dragSource.value.period)
      dragOverKey.value = hovered && hovered !== sourceKey ? hovered : null
    }
  }

  function detachWindowListeners() {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    window.removeEventListener('pointercancel', stopPointerDrag)
    if (dragRafId !== null) {
      window.cancelAnimationFrame(dragRafId)
      dragRafId = null
    }
  }

  async function handlePointerUp(event: PointerEvent) {
    const source = dragSource.value
    const targetKey = source ? hitTestSlot(event.clientX, event.clientY) : null
    const currentFloating = floatingCard.value

    if (!source || !targetKey || targetKey === slotKey(source.date, source.period)) {
      stopPointerDrag()
      return
    }

    const sourceKey = slotKey(source.date, source.period)
    const [targetDate, targetPeriod] = targetKey.split(':') as [string, 'lunch' | 'dinner']

    detachWindowListeners()
    pendingDrag = null
    dragSource.value = null
    dragOverKey.value = null
    document.body.style.userSelect = ''
    window.setTimeout(() => {
      suppressClick.value = false
    }, 60)

    const targetEl = document.querySelector<HTMLElement>(`[data-slot-key="${targetKey}"]`)
    if (currentFloating && targetEl && !isReducedMotion()) {
      const targetRect = targetEl.getBoundingClientRect()
      floatingCard.value = {
        ...currentFloating,
        x: targetRect.left + 8,
        y: targetRect.top + 36,
        width: Math.max(180, targetRect.width - 16),
        angle: 0,
        settling: true,
      }
      window.setTimeout(() => {
        floatingCard.value = null
      }, 230)
    } else {
      floatingCard.value = null
    }

    const wasSwap = await options.onDropSlot(source.date, source.period, targetDate, targetPeriod)
    justDroppedKey.value = targetKey
    if (wasSwap) justSwappedKey.value = sourceKey
    window.setTimeout(() => {
      if (justDroppedKey.value === targetKey) justDroppedKey.value = null
      if (justSwappedKey.value === sourceKey) justSwappedKey.value = null
    }, 520)
  }

  function stopPointerDrag() {
    detachWindowListeners()
    const wasDragging = Boolean(dragSource.value)
    pendingDrag = null
    dragSource.value = null
    dragOverKey.value = null
    floatingCard.value = null
    document.body.style.userSelect = ''
    if (wasDragging) {
      window.setTimeout(() => {
        suppressClick.value = false
      }, 60)
    }
  }

  function onMealPointerDown(
    event: PointerEvent,
    slot: { date: string; period: 'lunch' | 'dinner'; meal: SlotMeal | null },
  ) {
    if (event.button !== 0 || !slot.meal) return
    const target = event.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    pendingDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: Math.min(event.clientY - rect.top, 44),
      width: rect.width,
      date: slot.date,
      period: slot.period,
      meal: slot.meal,
    }
    pointerTargetX = event.clientX
    pointerTargetY = event.clientY
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', stopPointerDrag)
  }

  onBeforeUnmount(() => {
    stopPointerDrag()
  })

  return {
    dragSource,
    dragOverKey,
    justDroppedKey,
    justSwappedKey,
    suppressClick,
    floatingCard,
    onMealPointerDown,
    stopPointerDrag,
  }
}
