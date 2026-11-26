<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { ArrowRight, CalendarDays, ChefHat, Clock3, UtensilsCrossed } from '@lucide/vue'
import ScoreBadge from '@/components/ui/ScoreBadge.vue'
import { useNextMeal } from '@/home/useNextMeal'

const { loading, error, nextMeal, upcomingMeals, formatMealDate, formatShortDate } = useNextMeal()
</script>

<template>
  <div class="home-stage">
    <p v-if="error" class="home-stage__error" role="alert">Erreur : {{ error }}</p>
    <section v-if="nextMeal" class="home-stage__hero">
      <div class="home-stage__copy">
        <span class="home-stage__slot-pill">
          <ChefHat :size="16" aria-hidden="true" />
          Prochain repas ·
          {{ nextMeal.period === 'lunch' ? 'Déjeuner' : 'Dîner' }} ·
          {{ formatMealDate(nextMeal.date) }}
        </span>
        <h2 class="home-stage__title">{{ nextMeal.meal.title }}</h2>
        <p v-if="nextMeal.description" class="home-stage__desc">
          {{ nextMeal.description }}
        </p>
        <div class="home-stage__metrics" aria-label="Informations recette">
          <span class="home-stage__metric">
            <Clock3 :size="15" aria-hidden="true" />
            {{ nextMeal.totalMinutes ? `${nextMeal.totalMinutes} min` : 'Durée n/d' }}
          </span>
          <ScoreBadge kind="nutri" :grade="nextMeal.nutriScore" />
          <ScoreBadge kind="eco" :grade="nextMeal.carbonScore" />
        </div>
        <div class="home-stage__actions">
          <RouterLink
            class="home-stage__cta-primary"
            :to="
              nextMeal.meal.category === 'home' && nextMeal.meal.recipeId
                ? { name: 'cooking', query: { recipe: nextMeal.meal.recipeId } }
                : { name: 'cooking' }
            "
          >
            <ChefHat :size="18" aria-hidden="true" />
            Cuisiner maintenant
            <ArrowRight :size="17" aria-hidden="true" />
          </RouterLink>
          <RouterLink class="home-stage__cta-secondary" to="/planning">
            <CalendarDays :size="17" aria-hidden="true" />
            Planning
          </RouterLink>
          <RouterLink
            v-if="nextMeal.meal.category === 'home' && nextMeal.meal.recipeId"
            class="home-stage__cta-secondary"
            :to="`/recettes/${nextMeal.meal.recipeId}`"
          >
            Fiche recette
          </RouterLink>
        </div>
      </div>
      <div class="home-stage__visual">
        <div class="home-stage__photo-frame">
          <img
            v-if="nextMeal.meal.imageUrl || nextMeal.meal.thumbnailUrl"
            :src="nextMeal.meal.imageUrl || nextMeal.meal.thumbnailUrl || ''"
            :alt="`Photographie de ${nextMeal.meal.title}`"
          />
          <UtensilsCrossed v-else :size="48" aria-hidden="true" />
        </div>
        <div class="home-stage__visual-foot">
          <span class="home-stage__source-chip">{{
            nextMeal.meal.category === 'quitoque'
              ? 'Quitoque'
              : nextMeal.meal.category === 'home'
                ? 'Maison'
                : 'Restaurant'
          }}</span>
          <span v-if="nextMeal.ingredients.length">
            {{ nextMeal.ingredients.length }} ingrédients · {{ nextMeal.steps.length }} étapes
          </span>
        </div>
      </div>
    </section>

    <section v-else class="home-stage__hero">
      <div class="home-stage__copy">
        <span class="home-stage__slot-pill">Accueil Quisera</span>
        <h2 class="home-stage__title">
          {{ loading ? 'Chargement du prochain repas…' : 'Aucun repas planifié pour le moment' }}
        </h2>
        <div class="home-stage__actions">
          <RouterLink class="home-stage__cta-primary" to="/planning">
            <CalendarDays :size="18" aria-hidden="true" />
            Organiser le planning
            <ArrowRight :size="17" aria-hidden="true" />
          </RouterLink>
        </div>
      </div>
    </section>

    <div v-if="upcomingMeals.length" class="home-stage__upcoming">
      <div class="home-stage__upcoming-label">À suivre</div>
      <RouterLink
        v-for="item in upcomingMeals"
        :key="`${item.date}-${item.period}`"
        class="home-stage__upcoming-card"
        to="/planning"
      >
        <div class="home-stage__upcoming-thumb">
          <img
            v-if="item.meal.thumbnailUrl || item.meal.imageUrl"
            :src="item.meal.thumbnailUrl || item.meal.imageUrl || ''"
            :alt="''"
            loading="lazy"
          />
          <UtensilsCrossed v-else :size="22" aria-hidden="true" />
        </div>
        <div class="home-stage__upcoming-meta">
          <span
            >{{ formatShortDate(item.date) }} ·
            {{ item.period === 'lunch' ? 'Déjeuner' : 'Dîner' }}</span
          >
          <strong>{{ item.meal.title }}</strong>
        </div>
      </RouterLink>
    </div>
  </div>
</template>

<style scoped lang="scss">
.home-stage {
  flex: 1;
  display: grid;
  grid-template-rows: 1fr auto;
  gap: var(--q-space-4);
  min-height: calc(100vh - 3rem);
  min-height: calc(100dvh - 3rem);
}
.home-stage__error {
  margin: 0;
  padding: var(--q-space-3) var(--q-space-4);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  color: var(--q-forest);
  outline: 2px solid var(--q-tomato);
  font-weight: 600;
}
.home-stage__hero {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  gap: var(--q-space-8);
  padding: clamp(1.5rem, 3.2vw, 3.25rem);
  border-radius: var(--q-radius-card);
  background: var(--q-leaf);
  color: var(--q-peach);
  border: 2px solid var(--q-forest);
  align-items: center;
  transition:
    opacity 420ms var(--q-ease-standard),
    transform 480ms var(--q-ease-standard);
}
@starting-style {
  .home-stage__hero {
    opacity: 0;
    transform: translateY(14px);
  }
}
.home-stage__copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--q-space-4);
  min-width: 0;
}
.home-stage__slot-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.85rem;
  border-radius: var(--q-radius-control);
  background: var(--q-shoot);
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: var(--q-type-label);
  font-weight: 800;
  text-transform: capitalize;
}
.home-stage__title {
  margin: 0;
  font-family: var(--q-font-display);
  font-size: clamp(2.1rem, 4vw, 4.1rem);
  font-weight: 800;
  line-height: 1.04;
  letter-spacing: -0.03em;
  text-wrap: balance;
}
.home-stage__desc {
  margin: 0;
  max-width: 56ch;
  font-size: var(--q-type-body-large);
  line-height: 1.5;
}
.home-stage__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: var(--q-space-2);
}
.home-stage__metric {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.8rem;
  border-radius: var(--q-radius-control);
  background: var(--q-forest);
  color: var(--q-peach);
  font-weight: 700;
  font-size: var(--q-type-label);
  font-variant-numeric: tabular-nums;
}
.home-stage__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--q-space-3);
  margin-top: var(--q-space-2);
}
.home-stage__cta-primary,
.home-stage__cta-secondary {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-height: 48px;
  padding: 0 1.25rem;
  border-radius: var(--q-radius-control);
  font-family: var(--q-font-display);
  font-weight: 750;
  font-size: 1rem;
  text-decoration: none;
  transition:
    transform 180ms var(--q-ease-standard),
    background-color var(--q-duration-fast) var(--q-ease-standard);
}
.home-stage__cta-primary {
  background: var(--q-coral);
  color: var(--q-forest);
}
.home-stage__cta-primary:hover {
  background: var(--q-shoot);
  transform: translateY(-2px);
}
.home-stage__cta-secondary {
  background: transparent;
  color: var(--q-peach);
  border: 2px solid var(--q-peach);
}
.home-stage__cta-secondary:hover {
  background: var(--q-shoot);
  color: var(--q-forest);
  border-color: var(--q-shoot);
}
.home-stage__cta-primary:focus-visible,
.home-stage__cta-secondary:focus-visible,
.home-stage__upcoming-card:focus-visible {
  outline: 3px solid var(--q-shoot);
  outline-offset: 2px;
}
.home-stage__visual {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-3);
  padding: var(--q-space-4);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  color: var(--q-forest);
  transition: transform 320ms var(--q-ease-standard);
}
.home-stage__visual:hover {
  transform: translateY(-4px);
}
.home-stage__photo-frame {
  aspect-ratio: 4 / 3;
  width: 100%;
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.home-stage__photo-frame img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.home-stage__visual-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--q-space-2);
  font-size: var(--q-type-label);
  font-weight: 700;
}
.home-stage__source-chip {
  padding: 0.25rem 0.6rem;
  border-radius: var(--q-radius-control);
  background: var(--q-shoot);
  color: var(--q-forest);
}
.home-stage__upcoming {
  display: grid;
  grid-template-columns: auto repeat(3, minmax(0, 1fr));
  gap: var(--q-space-3);
  align-items: stretch;
}
.home-stage__upcoming-label {
  display: flex;
  align-items: center;
  padding: var(--q-space-3) var(--q-space-4);
  border-radius: var(--q-radius-card);
  background: var(--q-shoot);
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-weight: 800;
  font-size: var(--q-type-label);
  white-space: nowrap;
}
.home-stage__upcoming-card {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: var(--q-space-3);
  align-items: center;
  padding: var(--q-space-3);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  border: 2px solid var(--q-forest);
  color: var(--q-forest);
  text-decoration: none;
  transition:
    transform 160ms var(--q-ease-standard),
    background-color var(--q-duration-fast) var(--q-ease-standard);
}
.home-stage__upcoming-card:hover {
  background: var(--q-shoot);
  transform: translateY(-2px);
}
.home-stage__upcoming-thumb {
  width: 76px;
  height: 60px;
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.home-stage__upcoming-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.home-stage__upcoming-meta {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}
.home-stage__upcoming-meta span {
  font-size: var(--q-type-metadata);
  font-weight: 700;
  color: var(--q-leaf);
  text-transform: capitalize;
}
.home-stage__upcoming-meta strong {
  font-family: var(--q-font-display);
  font-size: var(--q-type-label);
  font-weight: 750;
  line-height: 1.25;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
@media (max-width: 64rem) {
  .home-stage {
    min-height: 0;
  }
  .home-stage__hero {
    grid-template-columns: 1fr;
  }
  .home-stage__upcoming {
    grid-template-columns: 1fr;
  }
}
@media (prefers-reduced-motion: reduce) {
  .home-stage__hero,
  .home-stage__visual,
  .home-stage__cta-primary,
  .home-stage__cta-secondary,
  .home-stage__upcoming-card {
    transition: none;
    transform: none;
  }
}
</style>
