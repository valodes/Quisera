<script setup lang="ts">
defineOptions({ name: 'RecipeLibraryView' })

import {
  AlertTriangle,
  Download,
  Globe,
  Heart,
  Plus,
  RefreshCw,
  Refrigerator,
  Search,
} from '@lucide/vue'
import type { RecipeSummary } from '@quisera/shared'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { refDebounced, useMediaQuery } from '@vueuse/core'
import { TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import RecipeCard from '@/components/recipes/RecipeCard.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import { useToast } from '@/components/ui/toast'
import {
  getFridgeRecipeMatches,
  listFridgeItems,
  type FridgeMatchBucket,
  type RecipeFridgeMatch,
} from '@/fridge/api'
import { queryClient, queryKeys } from '@/lib/query'
import { listRecipes, setFavorite, type RecipeFilters } from '@/recipes/api'
import { recipeMetricValue, resolveRecipeSourceLabel } from '@/recipes/presentation'
import '@/styles/recipes.css'

const FridgeWebDiscoverModal = defineAsyncComponent(
  () => import('@/components/fridge/FridgeWebDiscoverModal.vue'),
)

const route = useRoute()
const router = useRouter()
const toast = useToast()

const source = ref<'house' | 'favorites'>('house')
const fridgeMode = ref(route.query['frigo'] === '1')
const includeStaples = ref(false)
const fridgeBucketFilter = ref<'all' | 'ready' | 'almost'>('all')
const webModalOpen = ref(false)
const isCompact = useMediaQuery('(max-width: 48rem)')
const query = ref('')
const debouncedQuery = refDebounced(query, 220)
const category = ref('')
const sort = ref<RecipeFilters['sort']>('recent')
const page = ref(1)
const pendingFavoriteId = ref<string | null>(null)
const tabs = [
  { id: 'house', label: 'Maison' },
  { id: 'favorites', label: 'Favoris' },
] as const

watch(
  () => route.query['frigo'],
  (value) => {
    fridgeMode.value = value === '1'
  },
)

function toggleFridgeMode() {
  const next = !fridgeMode.value
  fridgeMode.value = next
  const nextQuery = { ...route.query }
  if (next) {
    nextQuery['frigo'] = '1'
  } else {
    delete nextQuery['frigo']
  }
  void router.replace({ query: nextQuery })
}

watch([query, category, source, sort], () => {
  page.value = 1
})

const filters = computed<RecipeFilters>(() => ({
  q: debouncedQuery.value,
  source: fridgeMode.value || source.value === 'favorites' ? 'all' : source.value,
  category: category.value,
  ...(sort.value ? { sort: sort.value } : {}),
  page: fridgeMode.value ? 1 : page.value,
  pageSize: fridgeMode.value ? 100 : 24,
}))

const {
  data: result,
  isPending: loading,
  error: queryError,
  refetch,
} = useQuery({
  queryKey: computed(() =>
    queryKeys.recipes(filters.value, !fridgeMode.value && source.value === 'favorites'),
  ),
  queryFn: () => listRecipes(filters.value, !fridgeMode.value && source.value === 'favorites'),
  placeholderData: keepPreviousData,
})

const { data: fridgeItemsData } = useQuery({
  queryKey: queryKeys.fridgeItems,
  queryFn: listFridgeItems,
  enabled: fridgeMode,
})

const { data: fridgeMatchesData, isPending: fridgeMatchesLoading } = useQuery({
  queryKey: computed(() => queryKeys.fridgeMatches(includeStaples.value)),
  queryFn: () => getFridgeRecipeMatches({ includeStaples: includeStaples.value }),
  enabled: fridgeMode,
})

type MatchedRecipeEntry = {
  recipe: RecipeSummary
  match: RecipeFridgeMatch
}

const matchedEntries = computed<MatchedRecipeEntry[]>(() => {
  if (
    !fridgeMode.value ||
    !result.value?.items.length ||
    !fridgeMatchesData.value?.matches.length
  ) {
    return []
  }
  const byId = new Map(result.value.items.map((item) => [item.id, item]))
  const entries: MatchedRecipeEntry[] = []
  for (const match of fridgeMatchesData.value.matches) {
    const found = byId.get(match.recipeId)
    if (found) {
      entries.push({ recipe: found, match })
    }
  }
  return entries
})

const fridgeSections = computed<
  Array<{ id: FridgeMatchBucket; title: string; subtitle: string; entries: MatchedRecipeEntry[] }>
>(() => {
  const ready = matchedEntries.value.filter((entry) => entry.match.bucket === 'ready')
  const almost = matchedEntries.value.filter((entry) => entry.match.bucket === 'almost')
  const partial = matchedEntries.value.filter((entry) => entry.match.bucket === 'partial')

  const all = [
    {
      id: 'ready' as const,
      title: 'Prêtes à cuisiner',
      subtitle: 'Tous les ingrédients sont déjà dans votre stock.',
      entries: ready,
    },
    {
      id: 'almost' as const,
      title: 'Presque prêtes',
      subtitle: 'Il ne manque que 1 ou 2 ingrédients.',
      entries: almost,
    },
    {
      id: 'partial' as const,
      title: 'Autres correspondances',
      subtitle: 'Recettes utilisant au moins un ingrédient de votre stock.',
      entries: partial,
    },
  ]

  return all.filter((section) => {
    if (section.entries.length === 0) return false
    if (fridgeBucketFilter.value === 'ready') return section.id === 'ready'
    if (fridgeBucketFilter.value === 'almost') {
      return section.id === 'ready' || section.id === 'almost'
    }
    return true
  })
})

const fridgeItems = computed(() => fridgeItemsData.value ?? [])

const error = computed(() =>
  queryError.value instanceof Error
    ? queryError.value.message
    : queryError.value
      ? 'La bibliothèque est indisponible.'
      : '',
)

async function load() {
  await queryClient.invalidateQueries({ queryKey: queryKeys.recipesAll })
  await refetch()
}

async function toggleFavorite(recipe: RecipeSummary) {
  if (pendingFavoriteId.value) return
  pendingFavoriteId.value = recipe.id
  try {
    await setFavorite(recipe.id, !recipe.isFavorite)
    await load()
  } catch {
    toast.error('Le favori n’a pas pu être modifié.')
  } finally {
    pendingFavoriteId.value = null
  }
}
</script>

<template>
  <div class="recipe-library">
    <div class="recipe-library__intro">
      <div>
        <p class="recipe-library__lead">La bibliothèque du foyer</p>
        <p>Retrouvez vos recettes, ou gardez vos idées maison à portée de main.</p>
      </div>
      <div class="recipe-library__intro-actions">
        <RouterLink class="recipe-import-link" to="/recettes/importer">
          <Download :size="18" aria-hidden="true" /> Importer
        </RouterLink>
        <RouterLink class="recipe-create-link" to="/recettes/nouvelle">
          <Plus :size="18" aria-hidden="true" /> Nouvelle recette
        </RouterLink>
      </div>
    </div>

    <section class="recipe-library__toolbar" aria-label="Recherche et filtres">
      <label class="recipe-search">
        <Search :size="19" aria-hidden="true" />
        <span class="sr-only">Rechercher une recette</span>
        <input v-model="query" type="search" placeholder="Rechercher une recette…" />
      </label>
      <details class="recipe-filters" :open="!isCompact">
        <summary>Filtres et tri</summary>
        <div class="recipe-filter-controls">
          <label class="recipe-sort">
            <span>Trier par</span>
            <select v-model="sort">
              <option value="recent">Plus récentes</option>
              <option value="title">Nom</option>
              <option value="time">Durée</option>
            </select>
          </label>
          <label class="recipe-category">
            <span>Catégorie</span>
            <input v-model="category" type="search" placeholder="Toutes les catégories" />
          </label>
        </div>
      </details>
    </section>

    <div class="recipe-library__mode-row">
      <TabsRoot v-if="!fridgeMode" v-model="source">
        <TabsList class="recipe-tabs" aria-label="Sources des recettes">
          <TabsTrigger
            v-for="tab in tabs"
            :key="tab.id"
            :value="tab.id"
            :class="{ 'is-active': source === tab.id }"
          >
            {{ tab.label }}
          </TabsTrigger>
        </TabsList>
      </TabsRoot>

      <button
        type="button"
        class="recipe-fridge-toggle"
        :class="{ 'is-active': fridgeMode }"
        :aria-pressed="fridgeMode"
        @click="toggleFridgeMode"
      >
        <Refrigerator :size="17" aria-hidden="true" />
        Avec mon frigo
      </button>
    </div>

    <section v-if="fridgeMode" class="recipe-fridge-bar" aria-label="Filtres du mode frigo">
      <div class="recipe-fridge-bar__filters" role="group" aria-label="Filtrer par disponibilité">
        <button
          type="button"
          class="recipe-fridge-chip"
          :class="{ 'is-active': fridgeBucketFilter === 'all' }"
          @click="fridgeBucketFilter = 'all'"
        >
          Toutes ({{ matchedEntries.length }})
        </button>
        <button
          type="button"
          class="recipe-fridge-chip"
          :class="{ 'is-active': fridgeBucketFilter === 'ready' }"
          @click="fridgeBucketFilter = 'ready'"
        >
          Prêtes (0 manquant)
        </button>
        <button
          type="button"
          class="recipe-fridge-chip"
          :class="{ 'is-active': fridgeBucketFilter === 'almost' }"
          @click="fridgeBucketFilter = 'almost'"
        >
          ≤ 2 manquants
        </button>
      </div>

      <div class="recipe-fridge-bar__actions">
        <label class="recipe-fridge-staples">
          <input v-model="includeStaples" type="checkbox" />
          <span>Inclure les basiques (sel, huile…)</span>
        </label>
        <RouterLink class="recipe-fridge-link" to="/frigo">Gérer mon frigo</RouterLink>
        <Button
          v-if="fridgeItems.length > 0"
          type="button"
          variant="secondary"
          @click="webModalOpen = true"
        >
          <Globe :size="15" aria-hidden="true" />
          Chercher sur le web
        </Button>
      </div>
    </section>

    <div v-if="loading || (fridgeMode && fridgeMatchesLoading)" class="recipe-state" role="status">
      Chargement de la bibliothèque…
    </div>
    <div v-else-if="error" class="recipe-state recipe-state--error" role="alert">
      <p>{{ error }}</p>
      <Button variant="secondary" @click="load">
        <RefreshCw :size="17" aria-hidden="true" /> Réessayer
      </Button>
    </div>
    <template v-else-if="fridgeMode">
      <div v-if="fridgeItems.length === 0" class="recipe-empty">
        <h2>Votre frigo est encore vide</h2>
        <p>Ajoutez quelques ingrédients dans votre frigo pour voir les recettes faisables.</p>
        <RouterLink class="recipe-create-link" to="/frigo">
          <Refrigerator :size="18" aria-hidden="true" /> Remplir mon frigo
        </RouterLink>
      </div>
      <div v-else-if="fridgeSections.length === 0" class="recipe-empty">
        <h2>Aucune recette locale ne correspond</h2>
        <p>
          Essayez d’élargir le filtre ou cherchez de nouvelles idées sur le web avec vos
          ingrédients.
        </p>
        <Button type="button" @click="webModalOpen = true">
          <Globe :size="17" aria-hidden="true" /> Chercher sur le web
        </Button>
      </div>
      <div v-else class="recipe-fridge-sections">
        <section v-for="section in fridgeSections" :key="section.id" class="recipe-fridge-section">
          <header class="recipe-fridge-section__head">
            <div>
              <h2>{{ section.title }} ({{ section.entries.length }})</h2>
              <p>{{ section.subtitle }}</p>
            </div>
          </header>
          <div class="recipe-grid">
            <RecipeCard
              v-for="entry in section.entries"
              :key="entry.recipe.id"
              :title="entry.recipe.title"
              :source-label="resolveRecipeSourceLabel(entry.recipe)"
              :image-url="entry.recipe.thumbnailUrl ?? entry.recipe.imageUrl"
              :description="entry.recipe.description"
              :total-minutes="entry.recipe.totalMinutes"
              :calories-kcal="entry.recipe.nutrition?.caloriesKcal ?? null"
              :nutri-score="recipeMetricValue(entry.recipe.metrics, 'nutriScore')"
              :carbon-score="recipeMetricValue(entry.recipe.metrics, 'carbonScore')"
              :to="`/recettes/${entry.recipe.id}`"
            >
              <template #overlay>
                <IconButton
                  class="recipe-card__favorite-btn"
                  :label="entry.recipe.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'"
                  :disabled="pendingFavoriteId === entry.recipe.id"
                  :aria-pressed="entry.recipe.isFavorite"
                  @click="toggleFavorite(entry.recipe)"
                >
                  <Heart
                    :size="20"
                    :fill="entry.recipe.isFavorite ? 'currentColor' : 'none'"
                    aria-hidden="true"
                  />
                </IconButton>
              </template>
              <template #footer>
                <div class="recipe-fridge-footer">
                  <div class="recipe-fridge-footer__row">
                    <span class="recipe-fridge-ratio">
                      {{ entry.match.matchedCount }}/{{ entry.match.totalCount }} ingrédients
                    </span>
                    <span v-if="entry.match.usesExpiringItems" class="recipe-fridge-dlc">
                      <AlertTriangle :size="12" aria-hidden="true" />
                      DLC proche
                    </span>
                  </div>
                  <p v-if="entry.match.missingIngredients.length" class="recipe-fridge-missing">
                    Manque : {{ entry.match.missingIngredients.slice(0, 3).join(', ')
                    }}{{ entry.match.missingIngredients.length > 3 ? '…' : '' }}
                  </p>
                </div>
              </template>
            </RecipeCard>
          </div>
        </section>
      </div>
    </template>
    <div v-else-if="!result?.items.length" class="recipe-empty">
      <h2>
        {{
          source === 'favorites' ? 'Aucun favori pour le moment' : 'La bibliothèque commence ici'
        }}
      </h2>
      <p>
        {{
          source === 'favorites'
            ? 'Les recettes ajoutées à vos favoris apparaîtront ici.'
            : 'Ajoutez une recette maison pour commencer à constituer votre collection.'
        }}
      </p>
      <RouterLink v-if="source !== 'favorites'" class="recipe-create-link" to="/recettes/nouvelle">
        <Plus :size="18" aria-hidden="true" /> Créer une recette
      </RouterLink>
    </div>
    <template v-else>
      <p class="recipe-result-count">
        {{ result.total }} recette{{ result.total === 1 ? '' : 's' }}
      </p>
      <div class="recipe-grid">
        <RecipeCard
          v-for="item in result.items"
          :key="item.id"
          v-memo="[item.id, item.updatedAt, item.isFavorite, pendingFavoriteId === item.id]"
          :title="item.title"
          :source-label="resolveRecipeSourceLabel(item)"
          :image-url="item.thumbnailUrl ?? item.imageUrl"
          :description="item.description"
          :total-minutes="item.totalMinutes"
          :calories-kcal="item.nutrition?.caloriesKcal ?? null"
          :nutri-score="recipeMetricValue(item.metrics, 'nutriScore')"
          :carbon-score="recipeMetricValue(item.metrics, 'carbonScore')"
          :to="`/recettes/${item.id}`"
        >
          <template #overlay>
            <IconButton
              class="recipe-card__favorite-btn"
              :label="item.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'"
              :disabled="pendingFavoriteId === item.id"
              :aria-pressed="item.isFavorite"
              @click="toggleFavorite(item)"
            >
              <Heart
                :size="20"
                :fill="item.isFavorite ? 'currentColor' : 'none'"
                aria-hidden="true"
              />
            </IconButton>
          </template>
        </RecipeCard>
      </div>
      <div v-if="result.total > result.pageSize" class="recipe-pagination">
        <Button variant="secondary" :disabled="page <= 1" @click="page--">Précédent</Button>
        <span>Page {{ result.page }} · {{ Math.ceil(result.total / result.pageSize) }}</span>
        <Button
          variant="secondary"
          :disabled="page * result.pageSize >= result.total"
          @click="page++"
        >
          Suivant
        </Button>
      </div>
    </template>

    <FridgeWebDiscoverModal v-if="webModalOpen" v-model:open="webModalOpen" :items="fridgeItems" />
  </div>
</template>

<style scoped>
.recipe-card__favorite-btn {
  background: var(--q-peach);
}
.recipe-card__favorite-btn:hover {
  background: var(--q-shoot);
}

.recipe-library__mode-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--q-space-3);
}

.recipe-fridge-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: var(--q-touch-target);
  padding: 0 var(--q-space-4);
  border-radius: var(--q-radius-pill);
  border: 1.5px solid var(--q-forest);
  background: var(--q-peach);
  color: var(--q-forest);
  font-size: var(--q-type-body-small);
  font-weight: 800;
  cursor: pointer;
}

.recipe-fridge-toggle.is-active {
  background: var(--q-forest);
  color: var(--q-peach);
}

.recipe-fridge-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--q-space-3);
  padding: var(--q-space-3) var(--q-space-4);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  border: 1px solid var(--q-leaf);
}

.recipe-fridge-bar__filters,
.recipe-fridge-bar__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--q-space-2);
}

.recipe-fridge-chip {
  padding: 0.35rem 0.75rem;
  border-radius: var(--q-radius-pill);
  border: 1px solid var(--q-leaf);
  background: var(--q-sage);
  color: var(--q-forest);
  font-size: var(--q-type-body-small);
  font-weight: 700;
  cursor: pointer;
}

.recipe-fridge-chip.is-active {
  background: var(--q-forest);
  color: var(--q-peach);
  border-color: var(--q-forest);
}

.recipe-fridge-staples {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 600;
  cursor: pointer;
}

.recipe-fridge-link {
  color: var(--q-terracotta);
  font-size: var(--q-type-body-small);
  font-weight: 700;
  text-decoration: underline;
}

.recipe-fridge-sections {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-6);
}

.recipe-fridge-section {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-3);
}

.recipe-fridge-section__head h2 {
  margin: 0;
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: var(--q-type-h3);
}

.recipe-fridge-section__head p {
  margin: 0.2rem 0 0;
  color: var(--q-leaf);
  font-size: var(--q-type-body-small);
}

.recipe-fridge-footer {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding-top: var(--q-space-2);
  border-top: 1px dashed var(--q-leaf);
}

.recipe-fridge-footer__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}

.recipe-fridge-ratio {
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 800;
}

.recipe-fridge-dlc {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.1rem 0.45rem;
  border-radius: var(--q-radius-pill);
  background: var(--q-shoot);
  color: var(--q-terracotta);
  font-size: var(--q-type-metadata);
  font-weight: 800;
}

.recipe-fridge-missing {
  margin: 0;
  color: var(--q-terracotta);
  font-size: var(--q-type-metadata);
  font-weight: 600;
}
</style>
