<script setup lang="ts">
defineOptions({ name: 'PlanningMonthGrid' })

import type { PlanningRange } from '@quisera/shared'
import { computed } from 'vue'

type SlotMeal = NonNullable<PlanningRange['days'][number]['lunch']['meal']>

const props = defineProps<{
  monthDates: readonly string[]
  selectedDate: string
  daysByDate: ReadonlyMap<string, PlanningRange['days'][number]>
  labelDate: (date: string) => string
}>()

const emit = defineEmits<{
  selectDate: [date: string]
}>()

const weekdays = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'] as const

const cells = computed(() =>
  props.monthDates.map((date) => {
    const day = props.daysByDate.get(date)
    const meals = [day?.lunch.meal, day?.dinner.meal].filter((meal): meal is SlotMeal =>
      Boolean(meal),
    )
    return {
      date,
      dayNumber: Number(date.slice(-2)),
      isOutside: date.slice(0, 7) !== props.selectedDate.slice(0, 7),
      isSelected: date === props.selectedDate,
      isDelivery: Boolean(day?.isDeliveryDay),
      meals,
      ariaLabel: `Voir ${props.labelDate(date)}`,
    }
  }),
)
</script>

<template>
  <section class="planning__month" aria-label="Calendrier mensuel">
    <div class="planning__weekdays">
      <span v-for="day in weekdays" :key="day">{{ day }}</span>
    </div>
    <div class="planning__month-grid">
      <button
        v-for="cell in cells"
        :key="cell.date"
        :aria-label="cell.ariaLabel"
        :class="{
          'is-outside': cell.isOutside,
          'is-selected': cell.isSelected,
          'is-delivery': cell.isDelivery,
        }"
        @click="emit('selectDate', cell.date)"
      >
        <strong>{{ cell.dayNumber }}</strong>
        <span
          v-for="meal in cell.meals"
          :key="meal.id"
          :class="`planning__month-meal--${meal.category}`"
          >{{
            meal.category === 'quitoque'
              ? 'Quitoque'
              : meal.category === 'home'
                ? 'Maison'
                : 'Restaurant'
          }}</span
        >
        <span v-if="cell.isDelivery">Livraison</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
@charset "UTF-8";
.planning__month {
  overflow: hidden;
}
.planning__weekdays,
.planning__month-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}
.planning__weekdays span {
  padding: 0.75rem 0.25rem;
  text-align: center;
  color: var(--q-leaf);
  font-weight: 700;
}
.planning__month-grid button {
  min-height: 100px;
  border: 1px solid var(--q-leaf);
  margin: -0.5px;
  padding: 0.5rem;
  text-align: left;
  background: var(--q-sage);
  color: var(--q-forest);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.planning__month-grid button:focus-visible {
  outline: 3px solid var(--q-forest);
  outline-offset: 2px;
}
.planning__month-grid button.is-outside {
  background: var(--q-peach);
}
.planning__month-grid button.is-selected {
  outline: 3px solid var(--q-terracotta);
  outline-offset: -3px;
}
.planning__month-grid button.is-delivery strong::after {
  content: ' · Livraison';
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
}
.planning__month-meal--quitoque,
.planning__month-meal--home,
.planning__month-meal--restaurant {
  color: var(--q-forest);
}
@media (max-width: 48rem) {
  .planning__month-grid button {
    min-height: 76px;
    padding: 0.3rem;
    font-size: var(--q-type-metadata);
  }
  .planning__month-grid button.is-delivery strong::after {
    content: '•';
    display: block;
  }
  .planning__weekdays span {
    font-size: 0.75rem;
  }
}
@media (max-width: 22rem) {
  .planning__month-grid button {
    min-height: 55px;
  }
  .planning__month-grid button span {
    display: none;
  }
}
</style>
