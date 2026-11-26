<script setup lang="ts">
defineOptions({ name: 'QuiseraPasswordInput' })

import { Eye, EyeOff } from '@lucide/vue'
import { computed, ref } from 'vue'
import TextInput from './TextInput.vue'

withDefaults(
  defineProps<{
    label: string
    id?: string | undefined
    helpText?: string | undefined
    errorMessage?: string | undefined
    disabled?: boolean
    autocomplete?: string | undefined
    toggleLabel?: string
  }>(),
  {
    id: undefined,
    helpText: undefined,
    errorMessage: undefined,
    disabled: false,
    autocomplete: undefined,
    toggleLabel: 'le mot de passe',
  },
)

const model = defineModel<string>({ default: '' })
const visible = ref(false)
const inputType = computed<'text' | 'password'>(() => (visible.value ? 'text' : 'password'))
</script>

<template>
  <div class="password-field">
    <TextInput
      v-model="model"
      :id="id"
      :label="label"
      :type="inputType"
      :autocomplete="autocomplete"
      :help-text="helpText"
      :error-message="errorMessage"
      :disabled="disabled"
    />
    <button
      type="button"
      class="password-toggle"
      :aria-label="visible ? `Masquer ${toggleLabel}` : `Afficher ${toggleLabel}`"
      :aria-pressed="visible"
      :disabled="disabled"
      @click="visible = !visible"
    >
      <EyeOff v-if="visible" :size="19" aria-hidden="true" />
      <Eye v-else :size="19" aria-hidden="true" />
    </button>
  </div>
</template>
