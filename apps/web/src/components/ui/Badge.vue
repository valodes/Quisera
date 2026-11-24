<script setup lang="ts">
defineOptions({ name: 'QuiseraBadge' })

withDefaults(
  defineProps<{
    variant?: 'info' | 'success' | 'warning' | 'error'
  }>(),
  { variant: 'info' },
)
</script>

<template>
  <span
    :data-variant="variant"
    class="rounded-q-control px-q-2 py-q-1 font-body text-label inline-flex min-h-6 items-center border border-transparent leading-tight font-semibold"
    :class="{
      'bg-q-info text-q-text': variant === 'info',
      'bg-q-success text-q-success-text': variant === 'success',
      'bg-q-warning text-q-text': variant === 'warning',
      'border-q-error-border bg-q-error text-q-text': variant === 'error',
    }"
  >
    <span v-if="variant === 'error'">Erreur : </span>
    <slot />
  </span>
</template>
