<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { navigationItems } from '@/app/navigation'

const home = navigationItems[0]
</script>

<template>
  <section class="not-found">
    <p>Cette adresse ne correspond à aucune section de Quisera.</p>
    <RouterLink :to="home.path" class="not-found__link">
      Revenir à l’accueil
    </RouterLink>
  </section>
</template>
