<script setup lang="ts">
defineOptions({ name: 'QuiseraButton' })

withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost'
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
  }>(),
  {
    variant: 'primary',
    type: 'button',
    disabled: false,
    loading: false,
  },
)
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading ? 'true' : undefined"
    class="gap-q-2 rounded-q-control px-q-4 py-q-2 font-display text-button duration-q-fast ease-q-standard focus-visible:outline-q-focus inline-flex min-h-[var(--q-touch-target)] items-center justify-center font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-3 active:translate-y-px disabled:cursor-not-allowed motion-reduce:transform-none"
    :class="{
      'bg-q-action text-q-action-text enabled:hover:bg-q-action-hover disabled:ring-q-action-text disabled:ring-2 disabled:ring-inset':
        variant === 'primary',
      'bg-q-surface-secondary text-q-text enabled:hover:bg-q-surface-accent disabled:ring-q-text disabled:ring-2 disabled:ring-inset':
        variant === 'secondary',
      'text-q-text enabled:hover:bg-q-surface-secondary disabled:ring-q-text bg-transparent disabled:ring-2 disabled:ring-inset':
        variant === 'ghost',
      'button--primary': variant === 'primary',
    }"
  >
    <span
      v-if="loading"
      aria-hidden="true"
      class="animate-q-spin size-4 rounded-full border-2 border-current border-r-transparent"
    />
    <slot />
  </button>
</template>
