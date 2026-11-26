<script setup lang="ts">
import { AlertCircle, CheckCircle2, X } from '@lucide/vue'
import { ToastClose, ToastProvider, ToastRoot, ToastTitle, ToastViewport } from 'reka-ui'
import { useToast } from '@/components/ui/toast'

const { items, dismiss } = useToast()
</script>

<template>
  <ToastProvider label="Notifications">
    <ToastRoot
      v-for="item in items"
      :key="item.id"
      :open="true"
      class="toast"
      :class="`toast--${item.variant}`"
      :type="item.variant === 'error' ? 'foreground' : 'background'"
      @update:open="(open) => !open && dismiss(item.id)"
    >
      <AlertCircle
        v-if="item.variant === 'error'"
        class="toast__icon"
        :size="18"
        aria-hidden="true"
      />
      <CheckCircle2 v-else class="toast__icon" :size="18" aria-hidden="true" />
      <ToastTitle class="toast__message">
        <strong v-if="item.variant === 'error'">Erreur : </strong>
        {{ item.message }}
      </ToastTitle>
      <ToastClose
        class="toast__close"
        aria-label="Fermer la notification"
        @click="dismiss(item.id)"
      >
        <X :size="15" aria-hidden="true" />
      </ToastClose>
    </ToastRoot>
    <ToastViewport class="toast-region" />
  </ToastProvider>
</template>

<style>
.toast-region {
  position: fixed;
  right: var(--q-space-4);
  bottom: var(--q-space-4);
  z-index: calc(var(--q-z-toast) + 20);
  display: flex;
  flex-direction: column;
  gap: var(--q-space-2);
  max-width: min(26rem, 100vw - 2rem);
  margin: 0;
  padding: 0;
  list-style: none;
  pointer-events: none;
}
@media (max-width: 64rem) {
  .toast-region {
    bottom: calc(5.25rem + env(safe-area-inset-bottom));
  }
}

.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: var(--q-space-3);
  padding: var(--q-space-3) var(--q-space-4);
  border-radius: var(--q-radius-card);
  font-family: var(--q-font-body);
  font-size: var(--q-type-label);
  font-weight: 600;
  line-height: 1.35;
  box-shadow: 0 12px 28px -8px color-mix(in srgb, var(--q-forest) 38%, transparent);
}
.toast--success {
  background: var(--q-forest);
  color: var(--q-peach);
  border: 2px solid var(--q-shoot);
}
.toast--success .toast__icon {
  color: var(--q-shoot);
  flex: none;
}
.toast--error {
  background: var(--q-peach);
  color: var(--q-forest);
  border: 2px solid var(--q-tomato);
}
.toast--error .toast__icon {
  color: var(--q-tomato);
  flex: none;
}
.toast__message {
  margin: 0;
  flex: 1;
  min-width: 0;
}
.toast__close {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--q-radius-control);
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.toast__close:hover {
  background: var(--q-coral);
  color: var(--q-forest);
}
.toast__close:focus-visible {
  outline: 3px solid var(--q-shoot);
  outline-offset: 2px;
}

.toast-slide-enter-active,
.toast-slide-leave-active {
  transition:
    opacity 200ms var(--q-ease-standard),
    transform 240ms var(--q-ease-standard);
}
.toast-slide-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}
.toast-slide-leave-to {
  opacity: 0;
  transform: translateX(18px);
}

@media (prefers-reduced-motion: reduce) {
  .toast-slide-enter-active,
  .toast-slide-leave-active {
    transition: opacity 120ms ease;
  }
  .toast-slide-enter-from,
  .toast-slide-leave-to {
    transform: none;
  }
}
</style>
