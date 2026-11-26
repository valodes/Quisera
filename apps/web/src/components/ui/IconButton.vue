<script setup lang="ts">
defineOptions({ name: 'QuiseraIconButton' })

import Button from './Button.vue'

withDefaults(
  defineProps<{
    label: string
    variant?: 'primary' | 'secondary' | 'ghost'
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
  }>(),
  { variant: 'ghost', type: 'button', disabled: false, loading: false },
)
</script>

<template>
  <Button
    :variant="variant"
    :type="type"
    :disabled="disabled"
    :loading="loading"
    :aria-label="label"
    class="size-[var(--q-touch-target)] shrink-0 p-0"
  >
    <slot />
  </Button>
</template>
