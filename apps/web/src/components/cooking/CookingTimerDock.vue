<script setup lang="ts">
defineOptions({ name: 'QuiseraCookingTimerDock' })

import { BellRing, ChefHat, Pause, Play, Plus, Timer, X } from '@lucide/vue'
import { ProgressIndicator, ProgressRoot } from 'reka-ui'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { formatCountdown, type CookingTimer } from '@/cooking/useCookingTimers'

defineProps<{
  timers: readonly CookingTimer[]
  flexMode?: boolean
  coverMode?: boolean
  returnLink?: {
    to: RouteLocationRaw
    title: string
    stepLabel: string | null
  } | null
}>()

const emit = defineEmits<{
  togglePause: [id: number]
  addMinute: [id: number]
  dismiss: [id: number]
}>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="timers.length"
      class="timer-dock"
      :class="{
        'timer-dock--flex': flexMode,
        'timer-dock--cover': coverMode,
      }"
      role="region"
      aria-label="Minuteurs actifs"
    >
      <RouterLink v-if="returnLink" :to="returnLink.to" class="timer-dock__return">
        <ChefHat :size="15" aria-hidden="true" />
        <span class="timer-dock__return-title">{{ returnLink.title }}</span>
        <span v-if="returnLink.stepLabel" class="timer-dock__return-step">{{
          returnLink.stepLabel
        }}</span>
      </RouterLink>

      <div
        v-for="timer in timers"
        :key="timer.id"
        class="timer-toast"
        :class="{ 'is-done': timer.done, 'is-paused': !timer.running && !timer.done }"
        role="status"
      >
        <div class="timer-toast__main">
          <div class="timer-toast__meta">
            <BellRing v-if="timer.done" :size="17" class="timer-toast__icon" aria-hidden="true" />
            <Timer v-else :size="17" class="timer-toast__icon" aria-hidden="true" />
            <span class="timer-toast__label">{{ timer.label }}</span>
          </div>
          <strong class="timer-toast__time">
            {{ timer.done ? 'Terminé !' : formatCountdown(timer.remainingSeconds) }}
          </strong>
        </div>

        <ProgressRoot
          :model-value="timer.remainingSeconds"
          :max="timer.totalSeconds"
          class="timer-toast__progress"
          aria-hidden="true"
        >
          <ProgressIndicator
            class="timer-toast__progress-fill"
            :style="{
              transform: `scaleX(${Math.max(0, timer.remainingSeconds / timer.totalSeconds)})`,
            }"
          />
        </ProgressRoot>

        <div class="timer-toast__controls">
          <button
            v-if="!timer.done"
            type="button"
            class="timer-toast__btn"
            :aria-label="
              timer.running ? `Mettre en pause ${timer.label}` : `Reprendre ${timer.label}`
            "
            @click="emit('togglePause', timer.id)"
          >
            <Pause v-if="timer.running" :size="15" aria-hidden="true" />
            <Play v-else :size="15" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="timer-toast__btn timer-toast__btn--text"
            :aria-label="`Ajouter 1 minute à ${timer.label}`"
            @click="emit('addMinute', timer.id)"
          >
            <Plus :size="14" aria-hidden="true" />
            1 min
          </button>
          <button
            type="button"
            class="timer-toast__btn"
            :aria-label="`Fermer le minuteur ${timer.label}`"
            @click="emit('dismiss', timer.id)"
          >
            <X :size="15" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.timer-dock {
  position: fixed;
  right: var(--q-space-4);
  bottom: var(--q-space-4);
  z-index: calc(var(--q-z-toast) + 15);
  display: flex;
  flex-direction: column;
  gap: var(--q-space-2);
  width: min(22rem, 100vw - 2rem);
  pointer-events: none;
}
@media (max-width: 64rem) {
  .timer-dock {
    bottom: calc(5.25rem + env(safe-area-inset-bottom));
  }
}
.timer-dock--flex {
  right: var(--q-space-3);
  bottom: calc(100vh - env(viewport-segment-height 0 0, 48vh) + var(--q-space-2));
  bottom: calc(100dvh - env(viewport-segment-height 0 0, 48dvh) + var(--q-space-2));
  width: min(20rem, 100vw - 1.5rem);
}
.timer-dock--cover {
  right: var(--q-space-2);
  bottom: 4.25rem;
  width: calc(100vw - 1rem);
}

.timer-dock__return {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: var(--q-space-2);
  min-height: 2.35rem;
  padding: var(--q-space-1) var(--q-space-3);
  border: 1px solid var(--q-forest);
  border-radius: var(--q-radius-control);
  background: var(--q-shoot);
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: var(--q-type-metadata);
  font-weight: 800;
  text-decoration: none;
  box-shadow: 0 8px 20px -8px color-mix(in srgb, var(--q-forest) 35%, transparent);
}
.timer-dock__return:hover {
  background: var(--q-coral);
}
.timer-dock__return-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.timer-dock__return-step {
  flex: none;
  padding: 0.12rem 0.45rem;
  border-radius: var(--q-radius-control);
  background: var(--q-forest);
  color: var(--q-peach);
  font-variant-numeric: tabular-nums;
}

.timer-toast {
  pointer-events: auto;
  display: grid;
  gap: var(--q-space-2);
  min-width: 0;
  overflow: hidden;
  padding: var(--q-space-3) var(--q-space-4);
  border: 2px solid var(--q-shoot);
  border-radius: var(--q-radius-card);
  background: var(--q-forest);
  color: var(--q-peach);
  box-shadow: 0 12px 28px -8px color-mix(in srgb, var(--q-forest) 45%, transparent);
}
.timer-toast.is-done {
  border-color: var(--q-forest);
  background: var(--q-coral);
  color: var(--q-forest);
}
.timer-toast.is-done .timer-toast__icon,
.timer-toast.is-done .timer-toast__time {
  color: var(--q-forest);
}
.timer-toast.is-done .timer-toast__btn {
  border-color: var(--q-forest);
  color: var(--q-forest);
}
.timer-toast__main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--q-space-3);
  min-width: 0;
}
.timer-toast__meta {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  gap: var(--q-space-2);
  min-width: 0;
  overflow: hidden;
}
.timer-toast__icon {
  flex: none;
  color: var(--q-shoot);
}
.timer-toast__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--q-font-display);
  font-size: var(--q-type-label);
  font-weight: 800;
}
.timer-toast__time {
  flex: none;
  font-family: var(--q-font-display);
  font-size: var(--q-type-h4);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--q-shoot);
}
.timer-toast__progress {
  height: 5px;
  border-radius: var(--q-radius-control);
  background: color-mix(in srgb, var(--q-peach) 25%, transparent);
  overflow: hidden;
}
.timer-toast__progress-fill {
  width: 100%;
  height: 100%;
  transform-origin: left center;
  background: var(--q-shoot);
  transition: transform 300ms linear;
}
.timer-toast__controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--q-space-2);
}
.timer-toast__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  min-width: 34px;
  min-height: 34px;
  padding: 0 0.5rem;
  border: 1px solid var(--q-shoot);
  border-radius: var(--q-radius-control);
  background: transparent;
  color: var(--q-peach);
  font-family: var(--q-font-display);
  font-size: var(--q-type-metadata);
  font-weight: 700;
}
.timer-toast__btn:hover {
  background: var(--q-shoot);
  color: var(--q-forest);
}
</style>
