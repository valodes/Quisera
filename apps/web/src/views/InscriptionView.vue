<script setup lang="ts">
import { isValidEmail } from '@quisera/shared/email'
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { authClient, safeReturnTo } from '@/auth/client'
import AuthLayout from '@/components/auth/AuthLayout.vue'
import Button from '@/components/ui/Button.vue'
import PasswordInput from '@/components/ui/PasswordInput.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { queryClient, queryKeys } from '@/lib/query'

const route = useRoute()
const router = useRouter()

const name = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)

const nameError = ref('')
const emailError = ref('')
const passwordError = ref('')
const confirmError = ref('')
const formError = ref('')

const signInRoute = computed(() =>
  typeof route.query['returnTo'] === 'string'
    ? { name: 'connexion', query: { returnTo: route.query['returnTo'] } }
    : { name: 'connexion' },
)

async function submit() {
  nameError.value = ''
  emailError.value = ''
  passwordError.value = ''
  confirmError.value = ''
  formError.value = ''

  const normalizedName = name.value.trim()
  const normalizedEmail = email.value.trim().toLowerCase()

  if (!normalizedName) {
    nameError.value = 'Saisissez votre nom.'
  } else if (normalizedName.length > 80) {
    nameError.value = 'Votre nom ne peut pas dépasser 80 caractères.'
  }

  if (!isValidEmail(normalizedEmail)) {
    emailError.value = 'Saisissez une adresse e-mail valide.'
  }

  if (password.value.length < 12) {
    passwordError.value = 'Le mot de passe doit contenir au moins 12 caractères.'
  } else if (password.value.length > 128) {
    passwordError.value = 'Le mot de passe ne peut pas dépasser 128 caractères.'
  }

  if (!confirmPassword.value) {
    confirmError.value = 'Confirmez votre mot de passe.'
  } else if (password.value !== confirmPassword.value) {
    confirmError.value = 'Les deux mots de passe ne correspondent pas.'
  }

  if (nameError.value || emailError.value || passwordError.value || confirmError.value) {
    return
  }

  loading.value = true
  try {
    const result = await authClient.signUp.email({
      name: normalizedName,
      email: normalizedEmail,
      password: password.value,
    })

    if (result.error) {
      const code = result.error.code ?? ''
      if (code === 'USER_ALREADY_EXISTS' || code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
        formError.value = 'Un compte existe déjà avec cette adresse e-mail.'
      } else if (code === 'PASSWORD_TOO_SHORT') {
        passwordError.value = 'Le mot de passe doit contenir au moins 12 caractères.'
      } else {
        formError.value = 'Impossible de créer votre compte pour le moment. Réessayez.'
      }
      return
    }

    queryClient.removeQueries({ queryKey: queryKeys.session })
    await router.replace(safeReturnTo(route.query['returnTo']))
  } catch {
    formError.value = 'Impossible de créer votre compte pour le moment. Réessayez.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthLayout
    brand-message="Préparez vos repas et partagez votre cuisine au quotidien."
    title-id="signup-title"
  >
    <h1 id="signup-title">Créer votre compte.</h1>
    <p class="login-intro">Ouvrez votre accès personnel pour organiser les menus du foyer.</p>

    <form class="login-form" novalidate @submit.prevent="submit">
      <TextInput
        v-model="name"
        label="Votre nom"
        type="text"
        autocomplete="name"
        :error-message="nameError"
        :disabled="loading"
      />

      <TextInput
        v-model="email"
        label="Adresse e-mail"
        type="email"
        autocomplete="email"
        :error-message="emailError"
        :disabled="loading"
      />

      <PasswordInput
        v-model="password"
        label="Mot de passe"
        autocomplete="new-password"
        help-text="12 caractères minimum."
        :error-message="passwordError"
        :disabled="loading"
      />

      <PasswordInput
        v-model="confirmPassword"
        label="Confirmer le mot de passe"
        autocomplete="new-password"
        toggle-label="la confirmation du mot de passe"
        :error-message="confirmError"
        :disabled="loading"
      />

      <p v-if="formError" class="login-error" role="alert">
        <span aria-hidden="true">!</span>{{ formError }}
      </p>

      <Button type="submit" :loading="loading" class="login-submit">
        {{ loading ? 'Création en cours' : 'Créer mon compte' }}
      </Button>
    </form>

    <div class="auth-footer">
      <span>Déjà inscrit ?</span>
      <RouterLink class="auth-link" :to="signInRoute">Se connecter</RouterLink>
    </div>

    <p class="login-private-note">Espace privé · réservé à votre foyer</p>
  </AuthLayout>
</template>
