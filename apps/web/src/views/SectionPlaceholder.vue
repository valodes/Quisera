<script setup lang="ts">
import { Badge, Surface } from '@/components/ui'

defineProps<{
  title: string
  description: string
}>()
</script>

<template>
  <Surface as="section" variant="peach" class="section-placeholder">
    <p>{{ description }}</p>
    <Badge variant="info"> À venir </Badge>
  </Surface>
</template>
