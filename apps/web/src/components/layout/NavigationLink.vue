<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import type { NavigationItem } from '@/app/navigation'

const props = defineProps<{
  item: NavigationItem
  mode: 'sidebar' | 'bottom'
}>()

const route = useRoute()
const isCurrent = computed(() => route.name === props.item.name)
</script>

<template>
  <RouterLink
    :to="item.path"
    :aria-current="isCurrent ? 'page' : undefined"
    class="navigation-link"
    :class="[`navigation-link--${mode}`, { 'is-current': isCurrent }]"
  >
    <component
      :is="item.icon"
      aria-hidden="true"
      :size="20"
      :stroke-width="2"
    />
    <span>{{ item.label }}</span>
  </RouterLink>
</template>
