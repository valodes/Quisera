<script setup lang="ts">
defineOptions({ name: 'RecipeLibraryView' })

import { Download, Heart, Plus, RefreshCw, Search } from '@lucide/vue'
import type { RecipeSummary } from '@quisera/shared'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import RecipeCard from '@/components/recipes/RecipeCard.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import { useToast } from '@/components/ui/toast'
import { queryClient, queryKeys } from '@/lib/query'
import { listRecipes, setFavorite, type RecipeFilters } from '@/recipes/api'

const toast = useToast()

const source = ref<'house' | 'favorites'>('house')
const isCompact = ref(window.matchMedia('(max-width: 48rem)').matches)
const query = ref('')
const debouncedQuery = ref('')
const category = ref('')
const sort = ref<RecipeFilters['sort']>('recent')
const page = ref(1)
const pendingFavoriteId = ref<string | null>(null)
const tabs = [
  { id: 'house', label: 'Maison' },
  { id: 'favorites', label: 'Favoris' },
] as const

let debounce: ReturnType<typeof setTimeout> | undefined
watch(query, (value) => {
  page.value = 1
  clearTimeout(debounce)
  debounce = setTimeout(
    () => {
      debouncedQuery.value = value
    },
    value ? 220 : 0,
  )
})
watch([category, source, sort], () => {
  page.value = 1
})

const filters = computed<RecipeFilters>(() => ({
  q: debouncedQuery.value,
  source: source.value === 'favorites' ? 'all' : source.value,
  category: category.value,
  ...(sort.value ? { sort: sort.value } : {}),
  page: page.value,
  pageSize: 24,
}))

const {
  data: result,
  isPending: loading,
  error: queryError,
  refetch,
} = useQuery({
  queryKey: computed(() => queryKeys.recipes(filters.value, source.value === 'favorites')),
  queryFn: () => listRecipes(filters.value, source.value === 'favorites'),
  placeholderData: keepPreviousData,
})

const error = computed(() =>
  queryError.value instanceof Error
    ? queryError.value.message
    : queryError.value
      ? 'La bibliothèque est indisponible.'
      : '',
)

function metricValue(recipe: RecipeSummary, key: string): string | null {
  return recipe.metrics.find((metric) => metric.key === key)?.value ?? null
}

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

const compactMedia = window.matchMedia('(max-width: 48rem)')
function updateCompactState(event: MediaQueryListEvent) {
  isCompact.value = event.matches
}
onMounted(() => compactMedia.addEventListener('change', updateCompactState))
onUnmounted(() => {
  clearTimeout(debounce)
  compactMedia.removeEventListener('change', updateCompactState)
})
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

    <TabsRoot v-model="source">
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

    <div v-if="loading" class="recipe-state" role="status">Chargement de la bibliothèque…</div>
    <div v-else-if="error" class="recipe-state recipe-state--error" role="alert">
      <p>{{ error }}</p>
      <Button variant="secondary" @click="load">
        <RefreshCw :size="17" aria-hidden="true" /> Réessayer
      </Button>
    </div>
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
          :title="item.title"
          :source-label="item.source === 'house' ? 'Maison' : 'Quitoque'"
          :image-url="item.thumbnailUrl ?? item.imageUrl"
          :description="item.description"
          :total-minutes="item.totalMinutes"
          :calories-kcal="item.nutrition?.caloriesKcal ?? null"
          :nutri-score="metricValue(item, 'nutriScore')"
          :carbon-score="metricValue(item, 'carbonScore')"
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
  </div>
</template>

<style scoped lang="scss">
.recipe-card__favorite-btn {
  background: var(--q-peach);

  &:hover {
    background: var(--q-shoot);
  }
}
</style>
