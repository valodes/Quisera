<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Clock3, Heart, Leaf, Star } from '@lucide/vue'
import type { RecipeSummary } from '@quisera/shared'
import IconButton from '@/components/ui/IconButton.vue'
import ScoreBadge from '@/components/ui/ScoreBadge.vue'
import { setFavorite } from '@/recipes/api'

const props = withDefaults(defineProps<{ recipe: RecipeSummary; horizontal?: boolean }>(), {
  horizontal: false,
})
const emit = defineEmits<{ changed: [] }>()
const pending = defineModel<boolean>('pending', { default: false })
const actionError = ref('')
const nutriScore = computed(() =>
  props.recipe.metrics.find((metric) => metric.key === 'nutriScore'),
)
const carbonScore = computed(() =>
  props.recipe.metrics.find((metric) => metric.key === 'carbonScore'),
)

async function toggleFavorite() {
  if (pending.value) return
  pending.value = true
  actionError.value = ''
  try {
    await setFavorite(props.recipe.id, !props.recipe.isFavorite)
    emit('changed')
  } catch {
    actionError.value = 'Le favori n’a pas pu être modifié.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <article class="recipe-card" :class="{ 'recipe-card--horizontal': horizontal }">
    <RouterLink
      class="recipe-card__open"
      :to="`/recettes/${recipe.id}`"
      :aria-label="`Consulter ${recipe.title}`"
    >
      <div class="recipe-card__photo">
        <img
          v-if="recipe.thumbnailUrl || recipe.imageUrl"
          :src="recipe.thumbnailUrl ?? recipe.imageUrl ?? undefined"
          :alt="`Photographie de ${recipe.title}`"
          loading="lazy"
        />
        <span v-else class="recipe-card__photo-empty" role="img" aria-label="Photo non disponible">
          <Leaf :size="25" aria-hidden="true" />
          <span aria-hidden="true">Photo non disponible</span>
        </span>
      </div>
      <div class="recipe-card__body">
        <div class="recipe-card__source">
          {{ recipe.source === 'house' ? 'Maison' : 'Quitoque' }}
        </div>
        <h2>{{ recipe.title }}</h2>
        <p v-if="recipe.description" class="recipe-card__description">
          {{ recipe.description }}
        </p>
        <div class="recipe-card__metadata">
          <span
            ><Clock3 :size="16" aria-hidden="true" />{{
              recipe.totalMinutes ? `${recipe.totalMinutes} min` : 'Durée non disponible'
            }}</span
          >
          <span
            ><Star :size="16" aria-hidden="true" />{{
              recipe.difficulty
                ? ({ easy: 'Facile', medium: 'Moyenne', hard: 'Difficile' }[recipe.difficulty] ??
                  recipe.difficulty)
                : 'Difficulté non disponible'
            }}</span
          >
        </div>
        <div class="recipe-card__scores">
          <ScoreBadge kind="nutri" :grade="nutriScore?.value" />
          <ScoreBadge kind="eco" :grade="carbonScore?.value" />
        </div>
      </div>
    </RouterLink>
    <IconButton
      class="recipe-card__favorite"
      :label="recipe.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'"
      :disabled="pending"
      :aria-pressed="recipe.isFavorite"
      @click="toggleFavorite"
    >
      <Heart :size="20" :fill="recipe.isFavorite ? 'currentColor' : 'none'" aria-hidden="true" />
    </IconButton>
    <span v-if="actionError" class="recipe-card__action-error" role="alert">
      {{ actionError }}
    </span>
  </article>
</template>
