<script setup lang="ts">
defineOptions({ name: 'QuiseraSurface' })

withDefaults(
  defineProps<{
    as?: 'div' | 'section' | 'article'
    variant?: 'sage' | 'peach' | 'shoot' | 'coral'
  }>(),
  { as: 'div', variant: 'sage' },
)
</script>

<template>
  <component
    :is="as"
    :data-variant="variant"
    class="rounded-q-card p-q-4"
    :class="{
      'bg-q-canvas text-q-text': variant === 'sage',
      'bg-q-surface text-q-text': variant === 'peach',
      'bg-q-surface-secondary text-q-text': variant === 'shoot',
      'bg-q-surface-accent text-q-text': variant === 'coral',
    }"
  >
    <slot />
  </component>
</template>
