<script setup lang="ts">
defineOptions({ name: 'QuiseraModalDialog' })

import { X } from '@lucide/vue'
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'

withDefaults(
  defineProps<{
    title: string
    badge?: string | null | undefined
    size?: 'md' | 'lg'
    closeLabel?: string
  }>(),
  {
    badge: null,
    size: 'lg',
    closeLabel: 'Fermer la fenêtre',
  },
)

const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="q-modal-overlay" />
      <DialogContent class="q-modal" :class="`q-modal--${size}`">
        <header class="q-modal__head">
          <div class="q-modal__head-text">
            <span v-if="badge" class="q-modal__badge">{{ badge }}</span>
            <DialogTitle class="q-modal__title">{{ title }}</DialogTitle>
          </div>
          <DialogClose class="q-modal__close" :aria-label="closeLabel">
            <X :size="20" aria-hidden="true" />
          </DialogClose>
        </header>

        <div class="q-modal__body">
          <slot />
        </div>

        <footer v-if="$slots['footer']" class="q-modal__foot">
          <slot name="footer" />
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style lang="scss">
.q-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: calc(var(--q-z-toast) + 5);
  background: color-mix(in srgb, var(--q-forest) 55%, transparent);
}

.q-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: calc(var(--q-z-toast) + 10);
  display: grid;
  grid-template-rows: auto 1fr auto;
  width: min(54rem, calc(100vw - 2rem));
  max-height: calc(100vh - 3rem);
  max-height: calc(100dvh - 3rem);
  transform: translate(-50%, -50%);
  overflow: hidden;
  border: 2px solid var(--q-forest);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  color: var(--q-forest);

  &--md {
    width: min(44rem, calc(100vw - 2rem));
  }

  &__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--q-space-4);
    padding: var(--q-space-4) var(--q-space-6);
    border-bottom: 1px solid var(--q-leaf);
    background: var(--q-sage);
  }

  &__head-text {
    min-width: 0;
  }

  &__badge {
    display: inline-block;
    margin-bottom: var(--q-space-1);
    padding: 0.15rem 0.5rem;
    border-radius: var(--q-radius-control);
    background: var(--q-forest);
    color: var(--q-peach);
    font-family: var(--q-font-display);
    font-size: var(--q-type-metadata);
    font-weight: 800;
  }

  &__title {
    margin: 0;
    font-family: var(--q-font-display);
    font-size: var(--q-type-h3);
    font-weight: 800;
    line-height: var(--q-line-heading);
    text-wrap: balance;
  }

  &__close {
    display: grid;
    place-items: center;
    flex: none;
    width: var(--q-touch-target);
    height: var(--q-touch-target);
    border: 0;
    border-radius: var(--q-radius-control);
    background: transparent;
    color: var(--q-forest);

    &:hover {
      background: var(--q-shoot);
    }

    &:focus-visible {
      outline: 3px solid var(--q-focus);
      outline-offset: 2px;
    }
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: var(--q-space-4);
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--q-space-6);
  }

  &__foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--q-space-3);
    padding: var(--q-space-4) var(--q-space-6);
    border-top: 1px solid var(--q-leaf);
    background: var(--q-sage);
  }
}
</style>
