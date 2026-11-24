import { createRouter, createWebHistory } from 'vue-router'
import NotFoundView from '@/views/NotFoundView.vue'
import SectionPlaceholder from '@/views/SectionPlaceholder.vue'
import { authClient, safeReturnTo } from '@/auth/client'
import { navigationItems } from '@/app/navigation'
import ConnexionView from '@/views/ConnexionView.vue'
import RecipeLibraryView from '@/views/RecipeLibraryView.vue'
import RecipeDetailView from '@/views/RecipeDetailView.vue'
import RecipeFormView from '@/views/RecipeFormView.vue'
import PlanningView from '@/views/PlanningView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/connexion',
      name: 'connexion',
      component: ConnexionView,
      meta: { title: 'Connexion', public: true },
    },
    {
      path: '/recettes',
      name: 'recipes',
      component: RecipeLibraryView,
      meta: { title: 'Recettes', requiresAuth: true },
    },
    {
      path: '/recettes/nouvelle',
      name: 'recipe-create',
      component: RecipeFormView,
      meta: { title: 'Nouvelle recette', requiresAuth: true },
    },
    {
      path: '/recettes/:id/modifier',
      name: 'recipe-edit',
      component: RecipeFormView,
      meta: { title: 'Modifier la recette', requiresAuth: true },
    },
    {
      path: '/recettes/:id',
      name: 'recipe-detail',
      component: RecipeDetailView,
      meta: { title: 'Fiche recette', requiresAuth: true },
    },
    {
      path: '/planning',
      name: 'planning',
      component: PlanningView,
      meta: { title: 'Planning', requiresAuth: true },
    },
    ...navigationItems
      .filter((item) => item.name !== 'recipes' && item.name !== 'planning')
      .map((item) => ({
        path: item.path,
        name: item.name,
        component: SectionPlaceholder,
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
      component: NotFoundView,
      meta: { title: 'Page introuvable', requiresAuth: true },
    },
  ],
})

router.beforeEach(async (to) => {
  if (to.meta.public) {
    try {
      const session = await authClient.getSession()
      if (session.data) return safeReturnTo(to.query.returnTo)
    } catch {
      return true
    }
    return true
  }

  if (!to.meta.requiresAuth) return true
  try {
    const session = await authClient.getSession()
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
