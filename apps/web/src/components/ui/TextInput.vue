<script setup lang="ts">
defineOptions({ name: 'QuiseraTextInput' })

import { computed, useId } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    id?: string | undefined
    type?: 'text' | 'email' | 'password' | 'search' | 'url' | 'tel'
    helpText?: string | undefined
    errorMessage?: string | undefined
    disabled?: boolean
    autocomplete?: string | undefined
  }>(),
  {
    id: undefined,
    type: 'text',
    helpText: undefined,
    errorMessage: undefined,
    disabled: false,
    autocomplete: undefined,
  },
)

const model = defineModel<string>({ default: '' })
const generatedId = useId()
const inputId = computed(() => props.id ?? `quisera-input-${generatedId}`)
const helpId = computed(() => (props.helpText ? `${inputId.value}-help` : undefined))
const errorId = computed(() => (props.errorMessage ? `${inputId.value}-error` : undefined))
const describedBy = computed(
  () => [helpId.value, errorId.value].filter(Boolean).join(' ') || undefined,
)
</script>

<template>
  <div class="gap-q-2 grid">
    <label :for="inputId" class="font-body text-label text-q-text font-semibold">
      {{ label }}
    </label>
    <input
      :id="inputId"
      v-model="model"
      :type="type"
      :disabled="disabled"
      :autocomplete="autocomplete"
      :aria-invalid="errorMessage ? 'true' : undefined"
      :aria-describedby="describedBy"
      class="rounded-q-control border-q-border bg-q-surface px-q-3 py-q-2 font-body text-body text-q-text placeholder:text-q-text-secondary focus-visible:outline-q-focus disabled:ring-q-text min-h-[var(--q-touch-target)] w-full border focus-visible:outline-3 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:ring-2 disabled:ring-inset"
      :class="{ 'border-q-error-border': errorMessage }"
    />
    <p v-if="helpText" :id="helpId" class="font-body text-body-small text-q-text-secondary">
      {{ helpText }}
    </p>
    <p
      v-if="errorMessage"
      :id="errorId"
      role="alert"
      class="font-body text-body-small text-q-text font-semibold"
    >
      Erreur : {{ errorMessage }}
    </p>
  </div>
</template>
