<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import MobileSettingsMenu from '@/components/layout/MobileSettingsMenu.vue'
import NavigationLink from '@/components/layout/NavigationLink.vue'
import { navigationItems, mobileNavigationItems } from '@/app/navigation'
import { authClient } from '@/auth/client'
import Button from '@/components/ui/Button.vue'

const route = useRoute()
const router = useRouter()
const session = authClient.useSession()
const pageTitle = computed(() =>
  typeof route.meta.title === 'string' ? route.meta.title : 'Quisera',
)

watch(
  () => session.value.data,
  async (value) => {
    if (!value && route.meta.requiresAuth && !session.value.isPending) {
      await router.replace({
        name: 'connexion',
        query: { returnTo: route.fullPath },
      })
    }
  },
)

async function signOut() {
  await authClient.signOut()
  await router.replace({ name: 'connexion' })
}
</script>

<template>
  <RouterView v-if="route.meta.public" />
  <div v-else-if="session.isPending" class="session-loading" role="status">
    Vérification de votre session…
  </div>
  <div v-else-if="!session.data" class="session-loading" role="status">
    Redirection vers la connexion…
  </div>
  <div v-else class="app-shell">
    <a class="skip-link" href="#main-content">Aller au contenu principal</a>

    <aside class="app-sidebar" aria-label="Navigation de Quisera">
      <RouterLink
        class="app-brand app-brand--sidebar"
        to="/"
        aria-label="Quisera, accueil"
      >
        <span class="app-brand__mark" aria-hidden="true">Q</span>
        <span>Quisera</span>
      </RouterLink>

      <nav class="sidebar-navigation" aria-label="Navigation principale">
        <NavigationLink
          v-for="item in navigationItems"
          :key="item.name"
          :item="item"
          mode="sidebar"
        />
      </nav>
    </aside>

    <div class="app-column">
      <header class="app-header">
        <div class="app-header__mobile-row">
          <RouterLink
            class="app-brand app-brand--mobile"
            to="/"
            aria-label="Quisera, accueil"
          >
            <span class="app-brand__mark" aria-hidden="true">Q</span>
            <span>Quisera</span>
          </RouterLink>
        </div>
        <div class="app-header__title-row">
          <h1 id="page-title">{{ pageTitle }}</h1>
          <div class="account-controls">
            <span class="account-name">{{ session.data.user.name }}</span>
            <Button variant="ghost" class="sign-out" @click="signOut">
              Déconnexion
            </Button>
            <MobileSettingsMenu />
          </div>
        </div>
      </header>

      <main
        id="main-content"
        class="app-main"
        tabindex="-1"
        aria-labelledby="page-title"
        aria-live="polite"
      >
        <div class="app-main__content">
          <RouterView />
        </div>
      </main>
    </div>

    <nav class="mobile-navigation" aria-label="Navigation mobile principale">
      <NavigationLink
        v-for="item in mobileNavigationItems"
        :key="item.name"
        :item="item"
        mode="bottom"
      />
    </nav>
  </div>
</template>
