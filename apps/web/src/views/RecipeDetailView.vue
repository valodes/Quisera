<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { computed, defineAsyncComponent, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ChefHat, Clock3, Heart, Pencil, Star, Trash2 } from '@lucide/vue'
import NutritionPanel from '@/components/recipes/NutritionPanel.vue'
import ServingsStepper from '@/components/recipes/ServingsStepper.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import { queryClient, queryKeys } from '@/lib/query'
import { deleteRecipe, getRecipe, setFavorite } from '@/recipes/api'
import { formatRecipeInstructions } from '@/recipes/instructions'
import { useRecipeServings } from '@/recipes/useRecipeServings'
import '@/styles/recipes.css'

const ModalDialog = defineAsyncComponent(() => import('@/components/ui/ModalDialog.vue'))

const route = useRoute()
const router = useRouter()
const pending = ref(false)
const actionError = ref('')
const confirmDeleteOpen = ref(false)

const recipeId = computed(() => String(route.params['id'] ?? ''))

const {
  data: recipe,
  isPending: loading,
  error: queryError,
  refetch,
} = useQuery({
  queryKey: computed(() => queryKeys.recipeDetail(recipeId.value)),
  queryFn: () => getRecipe(recipeId.value),
  enabled: computed(() => recipeId.value.length > 0),
})

const servingsCtrl = useRecipeServings(
  computed(() => recipe.value?.servings ?? null),
  computed(() => recipe.value?.ingredients ?? []),
)

const error = computed(() =>
  actionError.value
    ? actionError.value
    : queryError.value instanceof Error
      ? queryError.value.message
      : queryError.value
        ? 'Recette indisponible.'
        : '',
)

const difficultyLabel = (value: string | null) =>
  value === 'easy'
    ? 'Facile'
    : value === 'medium'
      ? 'Moyenne'
      : value === 'hard'
        ? 'Difficile'
        : 'Difficulté non disponible'

const metricLabel = (key: string) =>
  key === 'nutriScore'
    ? 'Nutri-Score'
    : key === 'carbonScore'
      ? 'Score carbone'
      : 'Information nutritionnelle'

async function toggleFavorite() {
  if (!recipe.value) return
  pending.value = true
  actionError.value = ''
  try {
    await setFavorite(recipe.value.id, !recipe.value.isFavorite)
    await queryClient.invalidateQueries({ queryKey: queryKeys.recipesAll })
    await refetch()
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : 'Favori indisponible.'
  } finally {
    pending.value = false
  }
}

async function confirmRemoveRecipe() {
  if (!recipe.value) return
  pending.value = true
  actionError.value = ''
  try {
    await deleteRecipe(recipe.value.id)
    confirmDeleteOpen.value = false
    await queryClient.invalidateQueries({ queryKey: queryKeys.recipesAll })
    await router.replace('/recettes')
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : 'Suppression impossible.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="recipe-detail">
    <RouterLink class="recipe-back" to="/recettes"
      ><ArrowLeft :size="18" aria-hidden="true" /> Retour aux recettes</RouterLink
    >
    <p v-if="loading" class="recipe-state" role="status">Chargement de la recette…</p>
    <div v-else-if="error && !recipe" class="recipe-state recipe-state--error" role="alert">
      {{ error }}
    </div>
    <template v-else-if="recipe">
      <div class="recipe-detail__top">
        <div>
          <p class="recipe-card__source">
            {{ recipe.source === 'house' ? 'Recette maison' : 'Recette Quitoque' }}
          </p>
          <h2>{{ recipe.title }}</h2>
        </div>
        <div class="recipe-detail__actions">
          <RouterLink
            class="recipe-create-link"
            :to="{ name: 'cooking', query: { recipe: recipe.id } }"
          >
            <ChefHat :size="18" aria-hidden="true" />
            Mode cuisine
          </RouterLink>
          <IconButton
            :label="recipe.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'"
            :disabled="pending"
            :aria-pressed="recipe.isFavorite"
            @click="toggleFavorite"
          >
            <Heart
              :size="20"
              :fill="recipe.isFavorite ? 'currentColor' : 'none'"
              aria-hidden="true"
            /> </IconButton
          ><RouterLink
            v-if="recipe.source === 'house'"
            class="recipe-icon-link"
            :to="`/recettes/${recipe.id}/modifier`"
            aria-label="Modifier la recette"
            ><Pencil :size="19" aria-hidden="true" /></RouterLink
          ><Button
            v-if="recipe.source === 'house'"
            variant="ghost"
            :disabled="pending"
            aria-label="Supprimer la recette"
            @click="confirmDeleteOpen = true"
          >
            <Trash2 :size="18" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div v-if="!recipe.imageUrl" class="recipe-detail__photo-empty">
        Photographie non disponible
      </div>
      <img
        v-if="recipe.imageUrl"
        class="recipe-detail__photo"
        :src="recipe.imageUrl"
        :alt="`Photographie de ${recipe.title}`"
      />
      <p v-if="recipe.description" class="recipe-detail__description">
        {{ recipe.description }}
      </p>
      <div class="recipe-detail__facts">
        <span
          ><Clock3 :size="17" aria-hidden="true" />{{
            recipe.totalMinutes ? `${recipe.totalMinutes} min` : 'Durée non disponible'
          }}</span
        ><span><Star :size="17" aria-hidden="true" />{{ difficultyLabel(recipe.difficulty) }}</span
        ><span
          >Nutri-Score :
          {{
            recipe.metrics.find((metric) => metric.key === 'nutriScore')?.value ?? 'Non disponible'
          }}</span
        ><span
          >Score carbone :
          {{
            recipe.metrics.find((metric) => metric.key === 'carbonScore')?.value ?? 'Non disponible'
          }}</span
        >
      </div>
      <div
        v-if="recipe.metrics.some((metric) => metric.provenance || metric.method)"
        class="recipe-detail__metric-notes"
      >
        <p
          v-for="metric in recipe.metrics.filter((item) => item.provenance || item.method)"
          :key="metric.key"
        >
          <strong>{{ metricLabel(metric.key) }} :</strong>
          <span v-if="metric.provenance"> Source : {{ metric.provenance }}.</span>
          <span v-if="metric.method"> Méthode : {{ metric.method }}.</span>
        </p>
      </div>
      <NutritionPanel :servings="recipe.servings" :nutrition="recipe.nutrition" />
      <p v-if="error" class="recipe-state--error" role="alert">{{ error }}</p>
      <div class="recipe-detail__columns">
        <section>
          <div
            style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 0.75rem;
              flex-wrap: wrap;
            "
          >
            <h3>Ingrédients</h3>
            <ServingsStepper
              v-if="recipe.ingredients.length"
              :servings="servingsCtrl.displayServings.value"
              :source-servings="recipe.servings"
              :can-scale="servingsCtrl.canScale.value"
              :is-scaled="servingsCtrl.isScaled.value"
              @increment="servingsCtrl.increment"
              @decrement="servingsCtrl.decrement"
              @reset="servingsCtrl.reset"
            />
          </div>
          <ul v-if="servingsCtrl.scaledIngredients.value.length">
            <li
              v-for="(item, index) in servingsCtrl.scaledIngredients.value"
              :key="`${item.name}-${index}`"
            >
              <strong v-if="item.quantity"
                >{{ item.quantity }}<span v-if="item.unit"> {{ item.unit }}</span></strong
              >
              {{ item.name }}<span v-if="item.notes"> — {{ item.notes }}</span>
            </li>
          </ul>
          <p v-else>Ingrédients non disponibles.</p>
        </section>
        <section>
          <h3>Préparation</h3>
          <ol v-if="recipe.steps.length">
            <li v-for="(step, index) in recipe.steps" :key="step.position">
              <span class="recipe-detail__instructions">{{
                formatRecipeInstructions(step.instructions, index + 1)
              }}</span>
            </li>
          </ol>
          <p v-else>Étapes non disponibles.</p>
        </section>
      </div>

      <ModalDialog
        v-if="confirmDeleteOpen"
        v-model:open="confirmDeleteOpen"
        title="Supprimer cette recette maison ?"
        badge="Confirmation"
        size="md"
      >
        <p>
          La recette <strong>{{ recipe.title }}</strong> sera définitivement retirée de votre
          bibliothèque.
        </p>
        <template #footer>
          <Button variant="secondary" :disabled="pending" @click="confirmDeleteOpen = false">
            Annuler
          </Button>
          <Button :loading="pending" @click="confirmRemoveRecipe">Supprimer définitivement</Button>
        </template>
      </ModalDialog>
    </template>
  </section>
</template>
