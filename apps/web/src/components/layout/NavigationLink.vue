<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import type { NavigationItem } from '@/app/navigation'

const props = defineProps<{
  item: NavigationItem
  mode: 'sidebar' | 'bottom'
  collapsed?: boolean
}>()

const route = useRoute()
const isCurrent = computed(() => route.name === props.item.name)
</script>

<template>
  <RouterLink
    :to="item.path"
    :aria-current="isCurrent ? 'page' : undefined"
    :aria-label="collapsed ? item.label : undefined"
    :title="collapsed ? item.label : undefined"
    class="navigation-link"
    :class="[`navigation-link--${mode}`, { 'is-current': isCurrent, 'is-collapsed': collapsed }]"
  >
    <component :is="item.icon" aria-hidden="true" :size="20" :stroke-width="2" />
    <span v-if="!collapsed">{{ item.label }}</span>
  </RouterLink>
</template>
