<script setup lang="ts">
import { isValidEmail } from '@quisera/shared'
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
const email = ref('')
const password = ref('')
const loading = ref(false)
const formError = ref('')
const emailError = ref('')
const passwordError = ref('')

const signUpRoute = computed(() =>
  typeof route.query['returnTo'] === 'string'
    ? { name: 'inscription', query: { returnTo: route.query['returnTo'] } }
    : { name: 'inscription' },
)

async function submit() {
  emailError.value = ''
  passwordError.value = ''
  formError.value = ''
  const normalizedEmail = email.value.trim()
  if (!isValidEmail(normalizedEmail)) {
    emailError.value = 'Saisissez une adresse e-mail valide.'
  }
  if (!password.value) passwordError.value = 'Saisissez votre mot de passe.'
  if (emailError.value || passwordError.value) return

  loading.value = true
  try {
    const result = await authClient.signIn.email({
      email: normalizedEmail,
      password: password.value,
    })
    if (result.error) {
      formError.value = 'Adresse e-mail ou mot de passe incorrect.'
      return
    }
    queryClient.removeQueries({ queryKey: queryKeys.session })
    await router.replace(safeReturnTo(route.query['returnTo']))
  } catch {
    formError.value = 'Connexion impossible pour le moment. Réessayez.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthLayout
    brand-message="Organisez vos repas et retrouvez votre espace cuisine."
    title-id="login-title"
  >
    <h1 id="login-title">Ravi de vous retrouver.</h1>
    <p class="login-intro">Connectez-vous pour retrouver votre espace Quisera.</p>

    <form class="login-form" novalidate @submit.prevent="submit">
      <TextInput
        v-model="email"
        label="Adresse e-mail"
        type="email"
        autocomplete="username"
        :error-message="emailError"
        :disabled="loading"
      />

      <PasswordInput
        v-model="password"
        label="Mot de passe"
        autocomplete="current-password"
        :error-message="passwordError"
        :disabled="loading"
      />

      <div class="auth-field-action">
        <RouterLink class="auth-link" :to="{ name: 'forgot-password' }">
          Mot de passe oublié ?
        </RouterLink>
      </div>

      <p v-if="formError" class="login-error" role="alert">
        <span aria-hidden="true">!</span>{{ formError }}
      </p>

      <Button type="submit" :loading="loading" class="login-submit">
        {{ loading ? 'Connexion en cours' : 'Se connecter' }}
      </Button>
    </form>

    <div class="auth-footer">
      <span>Pas encore de compte ?</span>
      <RouterLink class="auth-link" :to="signUpRoute">Créer un compte</RouterLink>
    </div>

    <p class="login-private-note">Espace privé · réservé à votre foyer</p>
  </AuthLayout>
</template>
