<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Plus, RefreshCw, Search } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import RecipeCard from '@/components/recipes/RecipeCard.vue'
import { listRecipes, type RecipeFilters } from '@/recipes/api'
import type { RecipeListResponse } from '@quisera/shared'

const source = ref<'house' | 'favorites'>('house')
const isCompact = ref(window.matchMedia('(max-width: 48rem)').matches)
const query = ref('')
const category = ref('')
const sort = ref<RecipeFilters['sort']>('recent')
const page = ref(1)
const result = ref<RecipeListResponse | null>(null)
const loading = ref(true)
const error = ref('')
const tabs = [
  { id: 'house', label: 'Maison' },
  { id: 'favorites', label: 'Favoris' },
] as const

async function load() {
  loading.value = true
  error.value = ''
  try {
    result.value = await listRecipes(
      {
        q: query.value,
        source: source.value === 'favorites' ? 'all' : source.value,
        category: category.value,
        sort: sort.value,
        page: page.value,
        pageSize: 24,
      },
      source.value === 'favorites',
    )
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : 'La bibliothèque est indisponible.'
  } finally {
    loading.value = false
  }
}

let debounce: ReturnType<typeof setTimeout> | undefined
watch([query, category, source, sort], () => {
  page.value = 1
  clearTimeout(debounce)
  debounce = setTimeout(load, query.value ? 220 : 0)
})
watch(page, load)
onMounted(load)
const compactMedia = window.matchMedia('(max-width: 48rem)')
function updateCompactState(event: MediaQueryListEvent) {
  isCompact.value = event.matches
}
onMounted(() => compactMedia.addEventListener('change', updateCompactState))
onUnmounted(() =>
  compactMedia.removeEventListener('change', updateCompactState),
)
</script>

<template>
  <div class="recipe-library">
    <div class="recipe-library__intro">
      <div>
        <p class="recipe-library__lead">La bibliothèque du foyer</p>
        <p>
          Retrouvez vos recettes, ou gardez vos idées maison à portée de main.
        </p>
      </div>
      <RouterLink class="recipe-create-link" to="/recettes/nouvelle"
        ><Plus :size="18" aria-hidden="true" /> Nouvelle recette</RouterLink
      >
    </div>

    <section class="recipe-library__toolbar" aria-label="Recherche et filtres">
      <label class="recipe-search"
        ><Search :size="19" aria-hidden="true" /><span class="sr-only"
          >Rechercher une recette</span
        ><input
          v-model="query"
          type="search"
          placeholder="Rechercher une recette…"
      /></label>
      <details class="recipe-filters" :open="!isCompact">
        <summary>Filtres et tri</summary>
        <div class="recipe-filter-controls">
          <label class="recipe-sort"
            ><span>Trier par</span
            ><select v-model="sort">
              <option value="recent">Plus récentes</option>
              <option value="title">Nom</option>
              <option value="time">Durée</option>
            </select></label
          >
          <label class="recipe-category">
            <span>Catégorie</span>
            <input
              v-model="category"
              type="search"
              placeholder="Toutes les catégories"
            />
          </label>
        </div>
      </details>
    </section>

    <div class="recipe-tabs" role="group" aria-label="Sources des recettes">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        :aria-pressed="source === tab.id"
        :class="{ 'is-active': source === tab.id }"
        @click="source = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="loading" class="recipe-state" role="status">
      Chargement de la bibliothèque…
    </div>
    <div
      v-else-if="error"
      class="recipe-state recipe-state--error"
      role="alert"
    >
      <p>{{ error }}</p>
      <Button variant="secondary" @click="load">
        <RefreshCw :size="17" aria-hidden="true" /> Réessayer
      </Button>
    </div>
    <div v-else-if="!result?.items.length" class="recipe-empty">
      <h2>
        {{
          source === 'favorites'
            ? 'Aucun favori pour le moment'
            : 'La bibliothèque commence ici'
        }}
      </h2>
      <p>
        {{
          source === 'favorites'
            ? 'Les recettes ajoutées à vos favoris apparaîtront ici.'
            : 'Ajoutez une recette maison pour commencer à constituer votre collection.'
        }}
      </p>
      <RouterLink
        v-if="source !== 'favorites'"
        class="recipe-create-link"
        to="/recettes/nouvelle"
        ><Plus :size="18" aria-hidden="true" /> Créer une recette</RouterLink
      >
    </div>
    <template v-else>
      <p class="recipe-result-count">
        {{ result.total }} recette{{ result.total === 1 ? '' : 's' }}
      </p>
      <div class="recipe-grid">
        <RecipeCard
          v-for="item in result.items"
          :key="item.id"
          :recipe="item"
          @changed="load"
        />
      </div>
      <div v-if="result.total > result.pageSize" class="recipe-pagination">
        <Button variant="secondary" :disabled="page <= 1" @click="page--">
          Précédent </Button
        ><span
          >Page {{ result.page }} ·
          {{ Math.ceil(result.total / result.pageSize) }}</span
        ><Button
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
