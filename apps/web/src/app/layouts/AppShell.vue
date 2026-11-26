<script setup lang="ts">
import { computed, onErrorCaptured, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { LogOut, Menu } from '@lucide/vue'
import MobileSettingsMenu from '@/components/layout/MobileSettingsMenu.vue'
import NavigationLink from '@/components/layout/NavigationLink.vue'
import Button from '@/components/ui/Button.vue'
import ToastRegion from '@/components/ui/ToastRegion.vue'
import { mobileNavigationItems, sidebarNavigationItems } from '@/app/navigation'
import { authClient } from '@/auth/client'
import { queryClient } from '@/lib/query'

const SIDEBAR_STORAGE_KEY = 'quisera:sidebar-collapsed'
const route = useRoute()
const router = useRouter()
const session = authClient.useSession()
const boundaryError = ref<string | null>(null)
const sidebarCollapsed = ref(
  typeof window !== 'undefined' && window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true',
)
const pageTitle = computed(() =>
  typeof route.meta.title === 'string' ? route.meta.title : 'Quisera',
)

onErrorCaptured((error) => {
  boundaryError.value =
    error instanceof Error ? error.message : 'Une erreur inattendue est survenue.'
  return false
})

watch(
  () => route.fullPath,
  () => {
    boundaryError.value = null
  },
)

function retryRoute() {
  boundaryError.value = null
}

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
  if (typeof window !== 'undefined')
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed.value))
}

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
  queryClient.clear()
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
  <div v-else class="app-shell" :class="{ 'app-shell--collapsed': sidebarCollapsed }">
    <a class="skip-link" href="#main-content">Aller au contenu principal</a>

    <aside class="app-sidebar" aria-label="Navigation de Quisera">
      <div class="sidebar-top">
        <RouterLink
          v-if="!sidebarCollapsed"
          class="app-brand app-brand--sidebar"
          to="/"
          aria-label="Quisera, accueil"
        >
          <span class="app-brand__mark" aria-hidden="true">Q</span>
          <span>Quisera</span>
        </RouterLink>
        <button
          type="button"
          class="sidebar-toggle"
          :aria-expanded="!sidebarCollapsed"
          :aria-label="
            sidebarCollapsed ? 'Agrandir la barre latérale' : 'Réduire la barre latérale'
          "
          :title="sidebarCollapsed ? 'Agrandir le menu' : 'Réduire le menu'"
          @click="toggleSidebar"
        >
          <Menu :size="20" aria-hidden="true" />
        </button>
      </div>

      <nav class="sidebar-navigation" aria-label="Navigation principale">
        <NavigationLink
          v-for="item in sidebarNavigationItems"
          :key="item.name"
          :item="item"
          mode="sidebar"
          :collapsed="sidebarCollapsed"
        />
      </nav>

      <div class="sidebar-account">
        <RouterLink
          v-if="!sidebarCollapsed"
          to="/parametres"
          class="sidebar-account__user"
          :title="`${session.data.user.name} — Profil et foyer`"
        >
          <span class="sidebar-account__avatar" aria-hidden="true">{{
            session.data.user.name.slice(0, 1).toUpperCase()
          }}</span>
          <span class="sidebar-account__name">{{ session.data.user.name }}</span>
        </RouterLink>
        <button
          type="button"
          class="sidebar-sign-out"
          :aria-label="sidebarCollapsed ? 'Déconnexion' : undefined"
          :title="sidebarCollapsed ? `Déconnexion (${session.data.user.name})` : undefined"
          @click="signOut"
        >
          <LogOut :size="18" aria-hidden="true" />
          <span v-if="!sidebarCollapsed">Déconnexion</span>
        </button>
      </div>
    </aside>

    <div class="app-column">
      <h1 id="page-title" class="sr-only">{{ pageTitle }}</h1>

      <header class="app-header">
        <div class="app-header__mobile-row">
          <RouterLink class="app-brand app-brand--mobile" to="/" aria-label="Quisera, accueil">
            <span class="app-brand__mark" aria-hidden="true">Q</span>
            <span>Quisera</span>
          </RouterLink>
          <MobileSettingsMenu />
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
          <section v-if="boundaryError" class="section-placeholder" role="alert">
            <p>Erreur d’affichage : {{ boundaryError }}</p>
            <Button type="button" @click="retryRoute">Réessayer</Button>
          </section>
          <RouterView v-else v-slot="{ Component }">
            <KeepAlive
              :include="['PlanningView', 'PlanificationView', 'RecipeLibraryView']"
              :max="3"
            >
              <component :is="Component" />
            </KeepAlive>
          </RouterView>
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
    <ToastRegion />
  </div>
</template>
