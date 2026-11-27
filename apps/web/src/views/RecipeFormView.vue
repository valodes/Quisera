<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from '@lucide/vue'
import {
  recipeWriteSchema,
  type RecipeDetail,
  type RecipeWriteInput,
} from '@quisera/shared/recipes'
import Button from '@/components/ui/Button.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { queryClient, queryKeys } from '@/lib/query'
import { getRecipe, saveRecipe } from '@/recipes/api'
import { useHouseholdDefaultServings } from '@/recipes/useRecipeServings'
import '@/styles/recipes.css'

type KeyedIngredient = RecipeWriteInput['ingredients'][number] & { _uid: string }
type KeyedStep = RecipeWriteInput['steps'][number] & { _uid: string }

let localUidSeq = 1
function nextUid(): string {
  localUidSeq += 1
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `uid-${localUidSeq}`
}

const route = useRoute()
const router = useRouter()
const recipeId = computed(() =>
  typeof route.params['id'] === 'string' && route.params['id'].length > 0
    ? route.params['id']
    : null,
)
const editing = computed(() => recipeId.value !== null)
const defaultServings = useHouseholdDefaultServings()
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const fieldErrors = ref<string[]>([])
const photo = ref<File | null>(null)

const draft = reactive<{
  title: string
  description: string | null
  totalMinutes: number | null
  servings: number | null
  difficulty: RecipeWriteInput['difficulty']
  category: string | null
  tags: string[]
  ingredients: KeyedIngredient[]
  steps: KeyedStep[]
}>({
  title: '',
  description: null,
  totalMinutes: null,
  servings: defaultServings.value,
  difficulty: null,
  category: null,
  tags: [],
  ingredients: [{ _uid: nextUid(), name: '', quantity: null, unit: null, notes: null }],
  steps: [{ _uid: nextUid(), instructions: '' }],
})

function resetDraft() {
  error.value = ''
  fieldErrors.value = []
  photo.value = null
  Object.assign(draft, {
    title: '',
    description: null,
    totalMinutes: null,
    servings: defaultServings.value,
    difficulty: null,
    category: null,
    tags: [],
    ingredients: [{ _uid: nextUid(), name: '', quantity: null, unit: null, notes: null }],
    steps: [{ _uid: nextUid(), instructions: '' }],
  })
}

watch(defaultServings, (next) => {
  if (!editing.value && draft.servings === null) {
    draft.servings = next
  }
})

watch(
  recipeId,
  async (id) => {
    resetDraft()
    if (!id) {
      loading.value = false
      return
    }
    loading.value = true
    try {
      const recipe: RecipeDetail = await getRecipe(id)
      if (recipe.source !== 'house') {
        throw new Error('Les recettes Quitoque ne sont pas modifiables.')
      }
      Object.assign(draft, {
        title: recipe.title,
        description: recipe.description,
        totalMinutes: recipe.totalMinutes,
        servings: recipe.servings,
        difficulty: recipe.difficulty as RecipeWriteInput['difficulty'],
        category: recipe.category,
        tags: recipe.tags,
        ingredients: recipe.ingredients.map(({ name, quantity, unit, notes }) => ({
          _uid: nextUid(),
          name,
          quantity,
          unit,
          notes,
        })),
        steps: recipe.steps.map(({ instructions }) => ({
          _uid: nextUid(),
          instructions,
        })),
      })
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Impossible de charger la recette.'
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

function move<T>(items: T[], index: number, offset: -1 | 1) {
  const target = index + offset
  if (target < 0 || target >= items.length) return
  ;[items[index], items[target]] = [items[target]!, items[index]!]
}

async function submit() {
  error.value = ''
  fieldErrors.value = []
  const parsed = recipeWriteSchema.safeParse({
    title: draft.title,
    description: draft.description?.trim() || null,
    totalMinutes: draft.totalMinutes || null,
    servings: draft.servings || null,
    difficulty: draft.difficulty,
    category: draft.category?.trim() || null,
    tags: draft.tags,
    ingredients: draft.ingredients.map(({ name, quantity, unit, notes }) => ({
      name,
      quantity,
      unit,
      notes,
    })),
    steps: draft.steps.map(({ instructions }) => ({ instructions })),
  })
  if (!parsed.success) {
    fieldErrors.value = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))]
    error.value = 'Vérifiez les champs indiqués avant d’enregistrer.'
    return
  }
  saving.value = true
  try {
    let payload: object | FormData = parsed.data
    if (photo.value) {
      const form = new FormData()
      form.set('recipe', JSON.stringify(parsed.data))
      form.set('image', photo.value)
      payload = form
    }
    const saved = await saveRecipe(recipeId.value ?? undefined, payload)
    await queryClient.invalidateQueries({ queryKey: queryKeys.recipesAll })
    await router.replace(`/recettes/${saved.id}`)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Enregistrement impossible.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="recipe-form-page">
    <RouterLink class="recipe-back" to="/recettes"
      ><ArrowLeft :size="18" aria-hidden="true" /> Retour aux recettes</RouterLink
    >
    <div v-if="loading" class="recipe-state" role="status">Chargement…</div>
    <form v-else class="recipe-form" @submit.prevent="submit">
      <div class="recipe-form__heading">
        <h2>
          {{ editing ? 'Modifier la recette' : 'Créer une recette maison' }}
        </h2>
        <p>Ajoutez les informations dont vous disposez. Rien n’est calculé automatiquement.</p>
      </div>
      <p v-if="error" class="recipe-state--error" role="alert">{{ error }}</p>
      <TextInput
        v-model="draft.title"
        label="Nom de la recette"
        :error-message="
          fieldErrors.includes('title') ? 'Saisissez un titre (200 caractères maximum).' : undefined
        "
      />
      <div class="recipe-form__field">
        <label for="recipe-description">Description <span>(facultative)</span></label
        ><textarea id="recipe-description" v-model="draft.description" rows="3" maxlength="5000" />
      </div>
      <div class="recipe-form__row">
        <div class="recipe-form__field">
          <label for="recipe-duration">Durée totale (minutes)</label
          ><input
            id="recipe-duration"
            :value="draft.totalMinutes ?? ''"
            type="number"
            min="1"
            max="1440"
            @input="
              draft.totalMinutes = ($event.target as HTMLInputElement).value
                ? Number(($event.target as HTMLInputElement).value)
                : null
            "
          />
        </div>
        <div class="recipe-form__field">
          <label for="recipe-servings">Portions (personnes)</label
          ><input
            id="recipe-servings"
            :value="draft.servings ?? ''"
            type="number"
            min="1"
            max="24"
            @input="
              draft.servings = ($event.target as HTMLInputElement).value
                ? Number(($event.target as HTMLInputElement).value)
                : null
            "
          />
        </div>
        <div class="recipe-form__field">
          <label for="recipe-difficulty">Difficulté</label
          ><select id="recipe-difficulty" v-model="draft.difficulty">
            <option :value="null">Non renseignée</option>
            <option value="easy">Facile</option>
            <option value="medium">Moyenne</option>
            <option value="hard">Difficile</option>
          </select>
        </div>
        <div class="recipe-form__field">
          <label for="recipe-category">Catégorie</label
          ><input id="recipe-category" v-model="draft.category" type="text" maxlength="80" />
        </div>
      </div>
      <div class="recipe-form__field">
        <span id="recipe-photo-label" class="recipe-form__field-label"
          >Photo <span>(facultative, JPEG, PNG, WebP, AVIF ou HEIC, 8 Mo maximum)</span></span
        >
        <div class="recipe-photo-picker">
          <input
            id="recipe-photo"
            class="recipe-photo-picker__input"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
            aria-labelledby="recipe-photo-label"
            @change="photo = ($event.target as HTMLInputElement).files?.[0] ?? null"
          />
          <label class="recipe-photo-picker__button" for="recipe-photo">Choisir une photo</label>
          <span class="recipe-photo-picker__name" aria-live="polite">
            {{ photo?.name ?? 'Aucune photo choisie' }}
          </span>
        </div>
      </div>
      <fieldset class="recipe-form__list">
        <legend>Ingrédients</legend>
        <div
          v-for="(ingredient, index) in draft.ingredients"
          :key="ingredient._uid"
          class="recipe-form__item"
        >
          <TextInput v-model="ingredient.name" :label="`Ingrédient ${index + 1}`" /><TextInput
            :model-value="ingredient.quantity ?? ''"
            label="Quantité"
            @update:model-value="ingredient.quantity = $event || null"
          /><TextInput
            :model-value="ingredient.unit ?? ''"
            label="Unité"
            @update:model-value="ingredient.unit = $event || null"
          /><TextInput
            :model-value="ingredient.notes ?? ''"
            label="Précision"
            @update:model-value="ingredient.notes = $event || null"
          />
          <div class="recipe-form__ordering">
            <Button
              variant="ghost"
              :disabled="index === 0"
              :aria-label="`Monter l’ingrédient ${index + 1}`"
              @click.prevent="move(draft.ingredients, index, -1)"
            >
              <ArrowUp :size="16" aria-hidden="true" /> </Button
            ><Button
              variant="ghost"
              :disabled="index === draft.ingredients.length - 1"
              :aria-label="`Descendre l’ingrédient ${index + 1}`"
              @click.prevent="move(draft.ingredients, index, 1)"
            >
              <ArrowDown :size="16" aria-hidden="true" /> </Button
            ><Button
              variant="ghost"
              :disabled="draft.ingredients.length <= 1"
              :aria-label="`Supprimer l’ingrédient ${index + 1}`"
              @click.prevent="draft.ingredients.splice(index, 1)"
            >
              <Trash2 :size="16" aria-hidden="true" />
            </Button>
          </div>
        </div>
        <Button
          variant="secondary"
          @click.prevent="
            draft.ingredients.push({
              _uid: nextUid(),
              name: '',
              quantity: null,
              unit: null,
              notes: null,
            })
          "
        >
          <Plus :size="17" aria-hidden="true" /> Ajouter un ingrédient
        </Button>
      </fieldset>
      <fieldset class="recipe-form__list">
        <legend>Étapes de préparation</legend>
        <div
          v-for="(step, index) in draft.steps"
          :key="step._uid"
          class="recipe-form__item recipe-form__item--step"
        >
          <div class="recipe-form__field">
            <label :for="`recipe-step-${step._uid}`">Étape {{ index + 1 }}</label
            ><textarea
              :id="`recipe-step-${step._uid}`"
              v-model="step.instructions"
              rows="3"
              maxlength="4000"
            />
          </div>
          <div class="recipe-form__ordering">
            <Button
              variant="ghost"
              :disabled="index === 0"
              :aria-label="`Monter l’étape ${index + 1}`"
              @click.prevent="move(draft.steps, index, -1)"
            >
              <ArrowUp :size="16" aria-hidden="true" /> </Button
            ><Button
              variant="ghost"
              :disabled="index === draft.steps.length - 1"
              :aria-label="`Descendre l’étape ${index + 1}`"
              @click.prevent="move(draft.steps, index, 1)"
            >
              <ArrowDown :size="16" aria-hidden="true" /> </Button
            ><Button
              variant="ghost"
              :disabled="draft.steps.length <= 1"
              :aria-label="`Supprimer l’étape ${index + 1}`"
              @click.prevent="draft.steps.splice(index, 1)"
            >
              <Trash2 :size="16" aria-hidden="true" />
            </Button>
          </div>
        </div>
        <Button
          variant="secondary"
          @click.prevent="draft.steps.push({ _uid: nextUid(), instructions: '' })"
        >
          <Plus :size="17" aria-hidden="true" /> Ajouter une étape
        </Button>
      </fieldset>
      <div class="recipe-form__actions">
        <RouterLink class="recipe-back" to="/recettes">Annuler</RouterLink
        ><Button type="submit" :loading="saving">Enregistrer la recette</Button>
      </div>
    </form>
  </section>
</template>
