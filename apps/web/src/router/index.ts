import { createRouter, createWebHistory } from 'vue-router'
import { authClient, safeReturnTo } from '@/auth/client'
import { navigationItems } from '@/app/navigation'
import { queryClient, queryKeys } from '@/lib/query'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    public?: boolean
    requiresAuth?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
      meta: { title: 'Accueil', requiresAuth: true },
    },
    {
      path: '/connexion',
      name: 'connexion',
      component: () => import('@/views/ConnexionView.vue'),
      meta: { title: 'Connexion', public: true },
    },
    {
      path: '/inscription',
      name: 'inscription',
      component: () => import('@/views/InscriptionView.vue'),
      meta: { title: 'Créer un compte', public: true },
    },
    {
      path: '/mot-de-passe-oublie',
      name: 'forgot-password',
      component: () => import('@/views/ForgotPasswordView.vue'),
      meta: { title: 'Mot de passe oublié', public: true },
    },
    {
      path: '/reinitialiser-mot-de-passe',
      name: 'reset-password',
      component: () => import('@/views/ResetPasswordView.vue'),
      meta: { title: 'Réinitialiser le mot de passe', public: true },
    },
    {
      path: '/recettes',
      name: 'recipes',
      component: () => import('@/views/RecipeLibraryView.vue'),
      meta: { title: 'Recettes', requiresAuth: true },
    },
    {
      path: '/recettes/nouvelle',
      name: 'recipe-create',
      component: () => import('@/views/RecipeFormView.vue'),
      meta: { title: 'Nouvelle recette', requiresAuth: true },
    },
    {
      path: '/recettes/importer',
      name: 'recipe-import',
      component: () => import('@/views/RecipeImportView.vue'),
      meta: { title: 'Importer une recette', requiresAuth: true },
    },
    {
      path: '/recettes/:id/modifier',
      name: 'recipe-edit',
      component: () => import('@/views/RecipeFormView.vue'),
      meta: { title: 'Modifier la recette', requiresAuth: true },
    },
    {
      path: '/recettes/:id',
      name: 'recipe-detail',
      component: () => import('@/views/RecipeDetailView.vue'),
      meta: { title: 'Fiche recette', requiresAuth: true },
    },
    {
      path: '/planning',
      name: 'planning',
      component: () => import('@/views/PlanningView.vue'),
      meta: { title: 'Planning', requiresAuth: true },
    },
    {
      path: '/planification',
      name: 'planification',
      component: () => import('@/views/PlanificationView.vue'),
      meta: { title: 'Planification Quitoque', requiresAuth: true },
    },
    {
      path: '/parametres',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { title: 'Paramètres', requiresAuth: true },
    },
    {
      path: '/cuisine',
      name: 'cooking',
      component: () => import('@/views/CookingView.vue'),
      meta: { title: 'Cuisiner', requiresAuth: true },
    },
    {
      path: '/invitation/:token',
      name: 'accept-invitation',
      component: () => import('@/views/AcceptInvitationView.vue'),
      meta: { title: 'Invitation au foyer', public: true },
    },
    ...navigationItems
      .filter(
        (item) =>
          item.name !== 'home' &&
          item.name !== 'recipes' &&
          item.name !== 'planning' &&
          item.name !== 'planification' &&
          item.name !== 'cooking' &&
          item.name !== 'settings',
      )
      .map((item) => ({
        path: item.path,
        name: item.name,
        component: () => import('@/views/SectionPlaceholder.vue'),
        props: {
          title: item.label,
          description: item.description,
        },
        meta: {
          title: item.label,
          requiresAuth: true,
        },
      })),
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { title: 'Page introuvable', requiresAuth: true },
    },
  ],
})

const liveSession = authClient.useSession()

async function getCachedSession() {
  if (!liveSession.value.isPending) {
    return { data: liveSession.value.data }
  }
  return queryClient.fetchQuery({
    queryKey: queryKeys.session,
    queryFn: () => authClient.getSession(),
    staleTime: 30_000,
  })
}

router.beforeEach(async (to) => {
  if (to.meta.public) {
    if (to.name === 'connexion' || to.name === 'inscription') {
      try {
        const session = await getCachedSession()
        if (session.data) return safeReturnTo(to.query['returnTo'])
      } catch {
        return true
      }
    }
    return true
  }

  if (!to.meta.requiresAuth) return true
  try {
    const session = await getCachedSession()
    if (session.data) return true
  } catch {
    // A failed session lookup is treated as unauthenticated; private content remains hidden.
  }
  return { name: 'connexion', query: { returnTo: to.fullPath } }
})

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : 'Quisera'
  document.title = `${title} · Quisera`
})

export default router
