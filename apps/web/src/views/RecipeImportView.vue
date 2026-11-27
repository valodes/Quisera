<script setup lang="ts">
defineOptions({ name: 'RecipeImportView' })

import { ArrowLeft, Check, Download, ExternalLink, Globe, Link2, Search } from '@lucide/vue'
import { scaleIngredientsForServings } from '@quisera/shared/servings'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { computed, onMounted, ref, shallowRef } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import RecipeCard from '@/components/recipes/RecipeCard.vue'
import RecipeDraftContent from '@/components/recipes/RecipeDraftContent.vue'
import Button from '@/components/ui/Button.vue'
import ModalDialog from '@/components/ui/ModalDialog.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useToast } from '@/components/ui/toast'
import { queryClient, queryKeys } from '@/lib/query'
import { useHouseholdDefaultServings } from '@/recipes/useRecipeServings'
import '@/styles/recipes.css'
import {
  importRecipeUrl,
  previewRecipeUrl,
  searchExternalCatalog,
  type CatalogSourceId,
  type CatalogSourceStatus,
  type ExternalCatalogItem,
  type ImportedRecipeDraft,
} from '@/recipes/api'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const defaultServings = useHouseholdDefaultServings()
const keepOriginalServings = ref(false)

function applyHouseholdServings(source: ImportedRecipeDraft | null): ImportedRecipeDraft | null {
  if (!source) return null
  if (keepOriginalServings.value) return source
  const target = defaultServings.value
  if (!source.servings || source.servings === target) {
    return { ...source, servings: source.servings ?? target }
  }
  return {
    ...source,
    servings: target,
    ingredients: scaleIngredientsForServings(source.ingredients, source.servings, target),
  }
}

const activeTab = ref<'url' | 'catalog'>('catalog')

// URL import state
const urlInput = ref('')
const previewLoading = ref(false)
const savingDraft = ref(false)
const urlError = ref('')
const draft = shallowRef<ImportedRecipeDraft | null>(null)

// Catalog search state
const SOURCES: ReadonlyArray<{ id: CatalogSourceId; label: string }> = [
  { id: 'all', label: 'Tous les sites' },
  { id: 'jow', label: 'Jow' },
  { id: 'marmiton', label: 'Marmiton' },
  { id: '750g', label: '750g' },
  { id: 'cuisineaz', label: 'CuisineAZ' },
  { id: 'hervecuisine', label: 'Hervé Cuisine' },
]

const catalogQuery = ref('')
const catalogSource = ref<CatalogSourceId>('all')
const catalogLoading = ref(false)
const catalogError = ref('')
const catalogItems = shallowRef<ExternalCatalogItem[]>([])
const catalogStatuses = shallowRef<CatalogSourceStatus[]>([])
const hasSearched = ref(false)
const importingUrl = ref<string | null>(null)

// Preview modal state
const modalOpen = ref(false)
const modalItem = shallowRef<ExternalCatalogItem | null>(null)
const modalLoading = ref(false)
const modalError = ref('')
const modalDraft = shallowRef<ImportedRecipeDraft | null>(null)
const modalSaving = ref(false)

const displayedDraft = computed(() => applyHouseholdServings(draft.value))
const displayedModalDraft = computed(() => applyHouseholdServings(modalDraft.value))

onMounted(() => {
  const initialUrl = typeof route.query['url'] === 'string' ? route.query['url'].trim() : ''
  if (initialUrl) {
    activeTab.value = 'url'
    urlInput.value = initialUrl
    void analyzeUrl()
  }
})

async function analyzeUrl() {
  urlError.value = ''
  draft.value = null
  const trimmed = urlInput.value.trim()
  if (!trimmed) {
    urlError.value = 'Collez l’adresse d’une recette (ex. Jow, Marmiton, 750g, CuisineAZ…).'
    return
  }

  previewLoading.value = true
  try {
    const result = await previewRecipeUrl(trimmed)
    draft.value = result.draft
  } catch (cause) {
    urlError.value = cause instanceof Error ? cause.message : 'Impossible d’analyser cette adresse.'
  } finally {
    previewLoading.value = false
  }
}

async function saveAnalyzedDraft() {
  if (!draft.value) return
  savingDraft.value = true
  urlError.value = ''
  try {
    const saved = await importRecipeUrl(draft.value.sourceUrl, {
      keepOriginalServings: keepOriginalServings.value,
    })
    await queryClient.invalidateQueries({ queryKey: queryKeys.recipesAll })
    toast.success(`« ${saved.title} » ajoutée à votre bibliothèque.`)
    await router.push(`/recettes/${saved.id}`)
  } catch (cause) {
    urlError.value =
      cause instanceof Error ? cause.message : 'Impossible d’enregistrer cette recette.'
  } finally {
    savingDraft.value = false
  }
}

async function runCatalogSearch() {
  catalogError.value = ''
  const trimmed = catalogQuery.value.trim()
  if (trimmed.length < 2) {
    catalogError.value = 'Saisissez au moins 2 caractères pour lancer la recherche.'
    return
  }

  catalogLoading.value = true
  hasSearched.value = true
  try {
    const result = await searchExternalCatalog(trimmed, catalogSource.value)
    catalogItems.value = result.items
    catalogStatuses.value = result.sourceStatuses
  } catch (cause) {
    catalogError.value =
      cause instanceof Error ? cause.message : 'La recherche dans les catalogues a échoué.'
    catalogItems.value = []
    catalogStatuses.value = []
  } finally {
    catalogLoading.value = false
  }
}

async function openCatalogPreview(item: ExternalCatalogItem) {
  modalItem.value = item
  modalDraft.value = null
  modalError.value = ''
  modalOpen.value = true
  modalLoading.value = true
  try {
    const result = await previewRecipeUrl(item.url)
    modalDraft.value = result.draft
  } catch (cause) {
    modalError.value =
      cause instanceof Error
        ? cause.message
        : `Impossible de charger l’aperçu de « ${item.title} ».`
  } finally {
    modalLoading.value = false
  }
}

async function importFromModal() {
  const targetUrl = modalDraft.value?.sourceUrl ?? modalItem.value?.url
  if (!targetUrl) return
  modalSaving.value = true
  modalError.value = ''
  try {
    const saved = await importRecipeUrl(targetUrl, {
      keepOriginalServings: keepOriginalServings.value,
    })
    await queryClient.invalidateQueries({ queryKey: queryKeys.recipesAll })
    modalOpen.value = false
    toast.success(`« ${saved.title} » ajoutée à votre bibliothèque.`)
    await router.push(`/recettes/${saved.id}`)
  } catch (cause) {
    modalError.value =
      cause instanceof Error ? cause.message : 'Impossible d’importer cette recette.'
  } finally {
    modalSaving.value = false
  }
}

async function importFromCatalog(item: ExternalCatalogItem) {
  importingUrl.value = item.url
  catalogError.value = ''
  try {
    const saved = await importRecipeUrl(item.url)
    await queryClient.invalidateQueries({ queryKey: queryKeys.recipesAll })
    toast.success(`« ${saved.title} » importée depuis ${item.sourceLabel}.`)
    await router.push(`/recettes/${saved.id}`)
  } catch (cause) {
    catalogError.value =
      cause instanceof Error
        ? cause.message
        : `Impossible d’importer « ${item.title} ». Essayez une autre fiche.`
  } finally {
    importingUrl.value = null
  }
}
</script>

<template>
  <div class="recipe-import">
    <div class="recipe-import__top">
      <RouterLink class="recipe-back" to="/recettes">
        <ArrowLeft :size="18" aria-hidden="true" />
        Retour aux recettes
      </RouterLink>
      <div class="recipe-import__heading">
        <h2>Importer ou explorer des recettes</h2>
        <p>
          Fouillez Jow, Marmiton, 750g, CuisineAZ et Hervé Cuisine, vérifiez la recette en aperçu,
          ou collez directement n’importe quel lien.
        </p>
      </div>
    </div>

    <TabsRoot v-model="activeTab" class="import-tabs">
      <TabsList class="import-tabs__list" aria-label="Mode d’importation">
        <TabsTrigger
          value="catalog"
          class="import-tabs__trigger"
          :class="{ 'is-active': activeTab === 'catalog' }"
        >
          <Globe :size="17" aria-hidden="true" />
          Explorer les catalogues
        </TabsTrigger>
        <TabsTrigger
          value="url"
          class="import-tabs__trigger"
          :class="{ 'is-active': activeTab === 'url' }"
        >
          <Link2 :size="17" aria-hidden="true" />
          Importer depuis un lien
        </TabsTrigger>
      </TabsList>

      <TabsContent value="catalog" class="import-panel">
        <form class="catalog-search-bar" @submit.prevent="runCatalogSearch">
          <label class="catalog-search-input">
            <Search :size="18" aria-hidden="true" />
            <span class="sr-only">Rechercher dans les catalogues</span>
            <input
              v-model="catalogQuery"
              type="search"
              placeholder="ex. poulet curry, lasagnes, quiche lorraine…"
              :disabled="catalogLoading"
            />
          </label>
          <Button type="submit" :loading="catalogLoading">
            {{ catalogLoading ? 'Recherche…' : 'Chercher' }}
          </Button>
        </form>

        <div class="catalog-sources" role="group" aria-label="Filtrer par catalogue">
          <button
            v-for="src in SOURCES"
            :key="src.id"
            type="button"
            class="catalog-source-pill"
            :class="{ 'is-active': catalogSource === src.id }"
            :aria-pressed="catalogSource === src.id"
            @click="catalogSource = src.id"
          >
            {{ src.label }}
          </button>
        </div>

        <p v-if="catalogError" class="import-error" role="alert">Erreur : {{ catalogError }}</p>

        <div v-if="catalogStatuses.length" class="catalog-statuses" role="status">
          <span
            v-for="st in catalogStatuses"
            :key="st.source"
            class="catalog-status-chip"
            :class="{ 'is-failed': !st.ok }"
          >
            {{ st.label }} : {{ st.ok ? `${st.count} résultat(s)` : 'indisponible' }}
          </span>
        </div>

        <div v-if="catalogLoading" class="import-empty" role="status">
          Recherche en cours sur les catalogues sélectionnés…
        </div>

        <div v-else-if="hasSearched && catalogItems.length === 0" class="import-empty">
          Aucune recette trouvée pour « {{ catalogQuery }} ». Essayez un autre mot-clé ou importez
          directement un lien.
        </div>

        <div v-else-if="catalogItems.length" class="catalog-grid">
          <RecipeCard
            v-for="item in catalogItems"
            :key="item.url"
            :title="item.title"
            :source-label="item.sourceLabel"
            :image-url="item.imageUrl"
            :description="item.description ?? null"
            :total-minutes="item.totalMinutes ?? null"
            :calories-kcal="item.caloriesKcal ?? null"
            @open="openCatalogPreview(item)"
          >
            <template #overlay>
              <a
                class="catalog-ext-link"
                :href="item.url"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="`Ouvrir ${item.title} sur ${item.sourceLabel}`"
              >
                <ExternalLink :size="16" aria-hidden="true" />
              </a>
            </template>
            <template #footer>
              <Button
                type="button"
                variant="secondary"
                class="catalog-import-btn"
                :loading="importingUrl === item.url"
                :disabled="importingUrl !== null && importingUrl !== item.url"
                @click="importFromCatalog(item)"
              >
                <Download :size="16" aria-hidden="true" />
                Importer la recette
              </Button>
            </template>
          </RecipeCard>
        </div>
      </TabsContent>

      <TabsContent value="url" class="import-panel">
        <form class="import-url-form" novalidate @submit.prevent="analyzeUrl">
          <TextInput
            v-model="urlInput"
            label="Lien de la recette"
            type="url"
            help-text="Compatible Jow, Marmiton, 750g, CuisineAZ, Ricardo, Journal des Femmes, Hervé Cuisine et tout site exposant le schéma Google Recipe."
            :error-message="urlError"
            :disabled="previewLoading || savingDraft"
          />
          <div class="import-url-form__actions">
            <Button type="submit" :loading="previewLoading">
              {{ previewLoading ? 'Analyse en cours…' : 'Analyser le lien' }}
            </Button>
          </div>
        </form>

        <article v-if="draft" class="import-preview-card">
          <header class="import-preview-card__head">
            <div>
              <p class="import-preview-card__source">
                {{ draft.sourceHost }} ·
                {{
                  draft.strategy === 'site-adapter' ? 'Adaptateur dédié' : 'Schéma Google Recipe'
                }}
              </p>
              <h3>{{ draft.title }}</h3>
            </div>
            <div class="import-preview-card__actions">
              <Button type="button" :loading="savingDraft" @click="saveAnalyzedDraft">
                <Check :size="16" aria-hidden="true" />
                {{ savingDraft ? 'Enregistrement…' : 'Ajouter à ma bibliothèque' }}
              </Button>
              <a
                class="import-external-link"
                :href="draft.sourceUrl"
                target="_blank"
                rel="noopener noreferrer"
              >
                Voir la source
                <ExternalLink :size="15" aria-hidden="true" />
              </a>
            </div>
          </header>

          <div
            v-if="draft.servings && draft.servings !== defaultServings"
            class="import-servings-banner"
          >
            <span>
              {{
                keepOriginalServings
                  ? `Quantités d’origine conservées (${draft.servings} pers.)`
                  : `Quantités adaptées automatiquement de ${draft.servings} à ${defaultServings} pers. (foyer)`
              }}
            </span>
            <button
              type="button"
              class="import-servings-banner__btn"
              @click="keepOriginalServings = !keepOriginalServings"
            >
              {{
                keepOriginalServings
                  ? `Adapter pour ${defaultServings} pers.`
                  : `Garder ${draft.servings} pers.`
              }}
            </button>
          </div>

          <RecipeDraftContent v-if="displayedDraft" :draft="displayedDraft" />
        </article>
      </TabsContent>
    </TabsRoot>

    <ModalDialog
      v-model:open="modalOpen"
      :title="modalDraft?.title ?? modalItem?.title ?? 'Aperçu de la recette'"
      :badge="modalItem?.sourceLabel ?? null"
      close-label="Fermer l’aperçu"
    >
      <div v-if="modalLoading" class="import-modal-loading" role="status">
        Récupération de la fiche complète (ingrédients et étapes)…
      </div>
      <div v-else-if="modalError" class="import-error" role="alert">Erreur : {{ modalError }}</div>
      <template v-else-if="modalDraft && displayedModalDraft">
        <div
          v-if="modalDraft.servings && modalDraft.servings !== defaultServings"
          class="import-servings-banner"
        >
          <span>
            {{
              keepOriginalServings
                ? `Quantités d’origine conservées (${modalDraft.servings} pers.)`
                : `Quantités adaptées de ${modalDraft.servings} à ${defaultServings} pers. (foyer)`
            }}
          </span>
          <button
            type="button"
            class="import-servings-banner__btn"
            @click="keepOriginalServings = !keepOriginalServings"
          >
            {{
              keepOriginalServings
                ? `Adapter pour ${defaultServings} pers.`
                : `Garder ${modalDraft.servings} pers.`
            }}
          </button>
        </div>
        <RecipeDraftContent :draft="displayedModalDraft" />
      </template>

      <template #footer>
        <a
          v-if="modalItem"
          class="import-external-link"
          :href="modalItem.url"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ouvrir sur {{ modalItem.sourceLabel }}
          <ExternalLink :size="15" aria-hidden="true" />
        </a>
        <div class="import-modal-actions">
          <Button type="button" variant="secondary" @click="modalOpen = false">Fermer</Button>
          <Button v-if="modalDraft" type="button" :loading="modalSaving" @click="importFromModal">
            <Download :size="15" aria-hidden="true" />
            {{ modalSaving ? 'Importation…' : 'Importer dans ma bibliothèque' }}
          </Button>
        </div>
      </template>
    </ModalDialog>
  </div>
</template>

<style scoped>
.recipe-import {
  display: grid;
  gap: var(--q-space-6);
  min-width: 0;
}
.recipe-import__top {
  display: grid;
  gap: var(--q-space-3);
}
.recipe-import__heading h2 {
  margin: 0;
  font-family: var(--q-font-display);
  font-size: var(--q-type-h2);
  font-weight: 800;
  line-height: var(--q-line-heading);
}
.recipe-import__heading p {
  margin: var(--q-space-2) 0 0;
  max-width: 68ch;
  color: var(--q-forest);
}

.import-tabs {
  display: grid;
  gap: var(--q-space-6);
}
.import-tabs__list {
  display: inline-flex;
  flex-wrap: wrap;
  width: fit-content;
  gap: var(--q-space-1);
  padding: 4px;
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
}
.import-tabs__trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: var(--q-touch-target);
  padding: 0 var(--q-space-4);
  border: 0;
  border-radius: var(--q-radius-control);
  background: transparent;
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: var(--q-type-label);
  font-weight: 700;
}
.import-tabs__trigger:hover:not(.is-active) {
  background: var(--q-shoot);
}
.import-tabs__trigger.is-active {
  background: var(--q-forest);
  color: var(--q-peach);
}

.import-panel {
  display: grid;
  gap: var(--q-space-6);
}

.import-url-form {
  display: grid;
  gap: var(--q-space-4);
  max-width: 48rem;
  padding: var(--q-space-6);
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
}
.import-url-form__actions {
  display: flex;
  justify-content: flex-start;
}

.import-preview-card {
  display: grid;
  gap: var(--q-space-4);
  padding: var(--q-space-6);
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  color: var(--q-forest);
}
.import-preview-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--q-space-4);
}
.import-preview-card__head h3 {
  margin: var(--q-space-1) 0 0;
  font-family: var(--q-font-display);
  font-size: var(--q-type-h3);
  font-weight: 800;
}
.import-preview-card__source {
  margin: 0;
  font-size: var(--q-type-metadata);
  font-weight: 700;
  color: var(--q-leaf);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.import-preview-card__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--q-space-3);
}

.import-external-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: var(--q-touch-target);
  padding-inline: var(--q-space-2);
  border-radius: var(--q-radius-control);
  color: var(--q-forest);
  font-size: var(--q-type-body-small);
  font-weight: 700;
  text-decoration: underline;
  text-decoration-color: var(--q-terracotta);
  text-underline-offset: 0.2em;
}

.import-servings-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--q-space-2);
  padding: var(--q-space-2) var(--q-space-3);
  border-radius: var(--q-radius-control);
  background: var(--q-shoot);
  border: 1px solid var(--q-leaf);
  color: var(--q-forest);
  font-size: var(--q-type-body-small);
  font-weight: 600;
}

.import-servings-banner__btn {
  padding: 0.25rem 0.65rem;
  border-radius: var(--q-radius-pill);
  border: 1px solid var(--q-forest);
  background: var(--q-peach);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 700;
  cursor: pointer;
}
.import-external-link:hover {
  color: var(--q-leaf);
}

.catalog-search-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--q-space-3);
  max-width: 48rem;
}

.catalog-search-input {
  display: grid;
  flex: 1 1 18rem;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: var(--q-space-2);
  min-height: var(--q-touch-target);
  padding-inline: var(--q-space-3);
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
}
.catalog-search-input:focus-within {
  outline: 3px solid var(--q-focus);
  outline-offset: 2px;
}
.catalog-search-input input {
  width: 100%;
  min-height: var(--q-touch-target);
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--q-forest);
}

.catalog-sources {
  display: flex;
  flex-wrap: wrap;
  gap: var(--q-space-2);
}

.catalog-source-pill {
  min-height: var(--q-touch-target);
  padding: 0 var(--q-space-3);
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: var(--q-type-label);
  font-weight: 700;
}
.catalog-source-pill.is-active {
  background: var(--q-forest);
  border-color: var(--q-forest);
  color: var(--q-peach);
}

.catalog-statuses {
  display: flex;
  flex-wrap: wrap;
  gap: var(--q-space-2);
}

.catalog-status-chip {
  padding: 0.25rem 0.65rem;
  border-radius: var(--q-radius-control);
  background: var(--q-shoot);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 700;
}
.catalog-status-chip.is-failed {
  background: var(--q-peach);
  border: 1px solid var(--q-tomato);
}

.import-error {
  margin: 0;
  padding: var(--q-space-3) var(--q-space-4);
  border: 2px solid var(--q-tomato);
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
  color: var(--q-forest);
  font-weight: 700;
}

.import-empty,
.import-modal-loading {
  padding: var(--q-space-6);
  border-radius: var(--q-radius-card);
  background: var(--q-shoot);
  color: var(--q-forest);
  font-weight: 600;
}

.catalog-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
  gap: var(--q-space-4);
}

.catalog-import-btn {
  width: 100%;
  flex: 1;
}

.import-modal-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--q-space-2);
}

.catalog-ext-link {
  display: grid;
  place-items: center;
  width: var(--q-touch-target);
  height: var(--q-touch-target);
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
  color: var(--q-forest);
}
.catalog-ext-link:hover {
  background: var(--q-shoot);
}
</style>
