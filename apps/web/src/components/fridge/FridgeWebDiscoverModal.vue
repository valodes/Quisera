<script setup lang="ts">
import { Download, ExternalLink, Globe, Search } from '@lucide/vue'
import { computed, ref, shallowRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import ModalDialog from '@/components/ui/ModalDialog.vue'
import {
  discoverWebRecipesFromFridge,
  type FridgeItem,
  type FridgeWebDiscoverItem,
} from '@/fridge/api'
import { formatExpiryLabel, pickDefaultWebDiscoverIds } from '@/fridge/helpers'

const props = defineProps<{
  open: boolean
  items: readonly FridgeItem[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const modalOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
})

const selectedIds = ref<string[]>([])
const loading = ref(false)
const error = ref('')
const hasSearched = ref(false)
const queriesRun = ref(0)
const results = shallowRef<FridgeWebDiscoverItem[]>([])

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && selectedIds.value.length === 0 && props.items.length > 0) {
      selectedIds.value = pickDefaultWebDiscoverIds(props.items)
    }
  },
  { immediate: true },
)

function toggleItem(id: string) {
  if (selectedIds.value.includes(id)) {
    selectedIds.value = selectedIds.value.filter((entry) => entry !== id)
    return
  }
  if (selectedIds.value.length >= 3) return
  selectedIds.value = [...selectedIds.value, id]
}

async function runDiscover() {
  if (selectedIds.value.length === 0) return
  loading.value = true
  error.value = ''
  hasSearched.value = true
  try {
    const response = await discoverWebRecipesFromFridge(selectedIds.value)
    results.value = response.items
    queriesRun.value = response.queriesRun
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : 'La recherche web a échoué pour le moment.'
    results.value = []
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <ModalDialog
    v-model:open="modalOpen"
    title="Idées de recettes sur le web"
    badge="Marmiton · 750g · Jow · CuisineAZ"
    close-label="Fermer la recherche web"
  >
    <div class="web-discover">
      <p class="web-discover__intro">
        Sélectionnez jusqu’à <strong>3 ingrédients</strong> : nous cherchons toutes les combinaisons
        possibles (trio, paires et seuls) en parallèle.
      </p>

      <div class="web-discover__chips" role="group" aria-label="Ingrédients à combiner">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="web-discover__chip"
          :class="{
            'is-selected': selectedIds.includes(item.id),
            'is-disabled': !selectedIds.includes(item.id) && selectedIds.length >= 3,
          }"
          :aria-pressed="selectedIds.includes(item.id)"
          @click="toggleItem(item.id)"
        >
          <span>{{ item.name }}</span>
          <small v-if="item.expiresOn">{{ formatExpiryLabel(item.expiresOn) }}</small>
        </button>
      </div>

      <div class="web-discover__actions">
        <Button
          type="button"
          :loading="loading"
          :disabled="selectedIds.length === 0"
          @click="runDiscover"
        >
          <Search :size="16" aria-hidden="true" />
          {{
            loading
              ? 'Recherche combinée en cours…'
              : `Chercher avec ${selectedIds.length} ingrédient${selectedIds.length > 1 ? 's' : ''}`
          }}
        </Button>
        <span v-if="hasSearched && !loading && !error" class="web-discover__meta">
          {{ results.length }} recette{{ results.length > 1 ? 's' : '' }} ({{ queriesRun }}
          combinaisons)
        </span>
      </div>

      <p v-if="error" class="web-discover__error" role="alert">{{ error }}</p>

      <div v-if="loading" class="web-discover__status" role="status">
        Interrogation des catalogues culinaires…
      </div>

      <ul v-else-if="results.length" class="web-discover__list">
        <li v-for="entry in results" :key="entry.url" class="web-discover__row">
          <img
            v-if="entry.imageUrl"
            :src="entry.imageUrl"
            :alt="entry.title"
            class="web-discover__thumb"
            loading="lazy"
          />
          <div class="web-discover__body">
            <div class="web-discover__badges">
              <span class="web-discover__source">
                <Globe :size="12" aria-hidden="true" />
                {{ entry.sourceLabel }}
              </span>
              <span
                v-for="ing in entry.matchedIngredients"
                :key="ing"
                class="web-discover__match-pill"
              >
                {{ ing }}
              </span>
            </div>
            <h4>{{ entry.title }}</h4>
            <div class="web-discover__row-actions">
              <RouterLink
                class="web-discover__import-link"
                :to="{ path: '/recettes/importer', query: { url: entry.url } }"
                @click="modalOpen = false"
              >
                <Download :size="14" aria-hidden="true" />
                Importer dans mes recettes
              </RouterLink>
              <a
                class="web-discover__ext-link"
                :href="entry.url"
                target="_blank"
                rel="noopener noreferrer"
              >
                Source
                <ExternalLink :size="13" aria-hidden="true" />
              </a>
            </div>
          </div>
        </li>
      </ul>

      <p v-else-if="hasSearched && !error" class="web-discover__status">
        Aucune recette trouvée pour ces ingrédients. Essayez une autre combinaison.
      </p>
    </div>
  </ModalDialog>
</template>

<style scoped>
.web-discover {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-4);
}

.web-discover__intro {
  margin: 0;
  color: var(--q-forest);
  font-size: var(--q-type-body-small);
}

.web-discover__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--q-space-2);
}

.web-discover__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.75rem;
  border-radius: var(--q-radius-pill);
  border: 1px solid var(--q-leaf);
  background: var(--q-sage);
  color: var(--q-forest);
  font-size: var(--q-type-body-small);
  font-weight: 600;
  cursor: pointer;
}

.web-discover__chip.is-selected {
  background: var(--q-forest);
  color: var(--q-peach);
  border-color: var(--q-forest);
}

.web-discover__chip.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.web-discover__chip small {
  font-size: var(--q-type-metadata);
  opacity: 0.85;
}

.web-discover__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--q-space-3);
}

.web-discover__meta,
.web-discover__status {
  margin: 0;
  color: var(--q-leaf);
  font-size: var(--q-type-body-small);
  font-weight: 600;
}

.web-discover__error {
  margin: 0;
  padding: var(--q-space-2) var(--q-space-3);
  border-radius: var(--q-radius-control);
  border: 1px solid var(--q-tomato);
  background: var(--q-peach);
  color: var(--q-terracotta);
  font-size: var(--q-type-body-small);
  font-weight: 600;
}

.web-discover__list {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.web-discover__row {
  display: flex;
  gap: var(--q-space-3);
  padding: var(--q-space-3);
  border-radius: var(--q-radius-card);
  border: 1px solid var(--q-leaf);
  background: var(--q-peach);
}

.web-discover__thumb {
  width: 4.5rem;
  height: 4.5rem;
  border-radius: var(--q-radius-control);
  object-fit: cover;
  flex-shrink: 0;
}

.web-discover__body {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
  flex: 1;
}

.web-discover__body h4 {
  margin: 0;
  color: var(--q-forest);
  font-size: var(--q-type-body);
  line-height: 1.3;
}

.web-discover__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.web-discover__source {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.12rem 0.5rem;
  border-radius: var(--q-radius-pill);
  background: var(--q-sage);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 700;
}

.web-discover__match-pill {
  padding: 0.12rem 0.5rem;
  border-radius: var(--q-radius-pill);
  background: var(--q-shoot);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 700;
}

.web-discover__row-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--q-space-3);
  margin-top: 0.2rem;
}

.web-discover__import-link {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.7rem;
  border-radius: var(--q-radius-pill);
  background: var(--q-forest);
  color: var(--q-peach);
  font-size: var(--q-type-metadata);
  font-weight: 700;
  text-decoration: none;
}

.web-discover__ext-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--q-terracotta);
  font-size: var(--q-type-metadata);
  font-weight: 700;
  text-decoration: underline;
}
</style>
