<script setup lang="ts">
defineOptions({ name: 'QuiseraAuthLayout' })

import { RouterLink } from 'vue-router'

withDefaults(
  defineProps<{
    brandMessage: string
    titleId?: string | undefined
    brandLabel?: string
  }>(),
  {
    titleId: undefined,
    brandLabel: 'Quisera',
  },
)
</script>

<template>
  <main class="login-page">
    <section class="login-brand-panel" :aria-label="brandLabel">
      <RouterLink class="login-brand" :to="{ name: 'connexion' }" aria-label="Quisera">
        <span class="login-brand__mark" aria-hidden="true">Q</span>
        <span>Quisera</span>
      </RouterLink>
      <div class="login-brand__message">
        <p>{{ brandMessage }}</p>
      </div>
    </section>

    <section class="login-form-panel" :aria-labelledby="titleId">
      <div class="login-form-wrap">
        <slot />
      </div>
    </section>
  </main>
</template>
