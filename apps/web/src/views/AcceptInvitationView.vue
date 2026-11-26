<script setup lang="ts">
import { AlertCircle } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  acceptHouseholdInvitation,
  getPublicInvitation,
  type PublicInvitation,
} from '@/account/api'
import AuthLayout from '@/components/auth/AuthLayout.vue'
import Button from '@/components/ui/Button.vue'
import PasswordInput from '@/components/ui/PasswordInput.vue'
import TextInput from '@/components/ui/TextInput.vue'

const route = useRoute()
const router = useRouter()

const token = String(route.params['token'] ?? '')
const loading = ref(true)
const loadError = ref('')
const invitation = ref<PublicInvitation | null>(null)

const name = ref('')
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const submitting = ref(false)
const nameError = ref('')
const passwordError = ref('')
const confirmError = ref('')
const submitError = ref('')

const brandMessage = computed(() =>
  invitation.value
    ? `Rejoignez ${invitation.value.householdName} sur Quisera.`
    : 'Votre invitation au foyer Quisera.',
)

onMounted(async () => {
  loading.value = true
  loadError.value = ''
  try {
    const data = await getPublicInvitation(token)
    invitation.value = data
    if (data.invitedName) name.value = data.invitedName
  } catch (cause) {
    loadError.value =
      cause instanceof Error ? cause.message : 'Cette invitation est invalide ou a expiré.'
  } finally {
    loading.value = false
  }
})

async function submit() {
  nameError.value = ''
  passwordError.value = ''
  confirmError.value = ''
  submitError.value = ''

  if (!name.value.trim()) {
    nameError.value = 'Saisissez votre nom.'
  }
  if (password.value.length < 12) {
    passwordError.value = 'Le mot de passe doit contenir au moins 12 caractères.'
  }
  if (password.value !== confirmPassword.value) {
    confirmError.value = 'Les deux mots de passe ne correspondent pas.'
  }
  if (nameError.value || passwordError.value || confirmError.value) return

  submitting.value = true
  try {
    await acceptHouseholdInvitation(token, {
      name: name.value.trim(),
      username: username.value.trim() || null,
      password: password.value,
    })
    await router.replace('/')
  } catch (cause) {
    submitError.value =
      cause instanceof Error ? cause.message : 'Impossible de finaliser votre inscription.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthLayout
    :brand-message="brandMessage"
    brand-label="Invitation Quisera"
    title-id="invite-title"
  >
    <div v-if="loading" role="status">Vérification de votre invitation…</div>

    <template v-else-if="loadError">
      <h1 id="invite-title">Invitation indisponible.</h1>
      <div class="auth-status-box auth-status-box--error" role="alert">
        <div class="auth-status-box__header">
          <AlertCircle class="auth-status-box__icon" :size="22" aria-hidden="true" />
          <p>{{ loadError }}</p>
        </div>
        <div class="auth-actions">
          <RouterLink class="auth-link" :to="{ name: 'connexion' }">
            Retour à la connexion
          </RouterLink>
        </div>
      </div>
    </template>

    <template v-else-if="invitation">
      <h1 id="invite-title">Rejoindre {{ invitation.householdName }}.</h1>
      <p class="login-intro">
        {{ invitation.invitedByName }} vous a invité à partager le planning et les recettes du
        foyer.
      </p>

      <form class="login-form" novalidate @submit.prevent="submit">
        <TextInput :model-value="invitation.email" label="Adresse e-mail" type="email" disabled />

        <TextInput
          v-model="name"
          label="Votre nom"
          type="text"
          autocomplete="name"
          :error-message="nameError"
          :disabled="submitting"
        />

        <TextInput
          v-model="username"
          label="Nom d’utilisateur (facultatif)"
          type="text"
          autocomplete="username"
          help-text="ex. camille"
          :disabled="submitting"
        />

        <PasswordInput
          v-model="password"
          label="Mot de passe"
          autocomplete="new-password"
          help-text="12 caractères minimum."
          :error-message="passwordError"
          :disabled="submitting"
        />

        <PasswordInput
          v-model="confirmPassword"
          label="Confirmer le mot de passe"
          autocomplete="new-password"
          toggle-label="la confirmation du mot de passe"
          :error-message="confirmError"
          :disabled="submitting"
        />

        <p v-if="submitError" class="login-error" role="alert">
          <span aria-hidden="true">!</span>{{ submitError }}
        </p>

        <Button type="submit" class="login-submit" :loading="submitting">
          {{ submitting ? 'Création en cours' : 'Créer mon compte et rejoindre le foyer' }}
        </Button>
      </form>
    </template>
  </AuthLayout>
</template>
