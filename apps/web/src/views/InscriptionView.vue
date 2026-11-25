<script setup lang="ts">
import { Eye, EyeOff } from '@lucide/vue'
import { isValidEmail } from '@quisera/shared'
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { authClient, safeReturnTo } from '@/auth/client'

const route = useRoute()
const router = useRouter()

const name = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const passwordVisible = ref(false)
const confirmVisible = ref(false)
const loading = ref(false)

const nameError = ref('')
const emailError = ref('')
const passwordError = ref('')
const confirmError = ref('')
const formError = ref('')

const passwordType = computed(() => (passwordVisible.value ? 'text' : 'password'))
const confirmType = computed(() => (confirmVisible.value ? 'text' : 'password'))
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

    await router.replace(safeReturnTo(route.query['returnTo']))
  } catch {
    formError.value = 'Impossible de créer votre compte pour le moment. Réessayez.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-brand-panel" aria-label="Quisera">
      <RouterLink class="login-brand" :to="{ name: 'connexion' }">
        <span class="login-brand__mark" aria-hidden="true">Q</span>
        <span>Quisera</span>
      </RouterLink>
      <div class="login-brand__message">
        <p>Préparez vos repas et partagez votre cuisine au quotidien.</p>
      </div>
    </section>

    <section class="login-form-panel" aria-labelledby="signup-title">
      <div class="login-form-wrap">
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

          <div class="password-field">
            <TextInput
              v-model="password"
              label="Mot de passe"
              :type="passwordType"
              autocomplete="new-password"
              help-text="12 caractères minimum."
              :error-message="passwordError"
              :disabled="loading"
            />
            <button
              type="button"
              class="password-toggle"
              :aria-label="passwordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'"
              :aria-pressed="passwordVisible"
              :disabled="loading"
              @click="passwordVisible = !passwordVisible"
            >
              <EyeOff v-if="passwordVisible" :size="19" aria-hidden="true" />
              <Eye v-else :size="19" aria-hidden="true" />
            </button>
          </div>

          <div class="password-field">
            <TextInput
              v-model="confirmPassword"
              label="Confirmer le mot de passe"
              :type="confirmType"
              autocomplete="new-password"
              :error-message="confirmError"
              :disabled="loading"
            />
            <button
              type="button"
              class="password-toggle"
              :aria-label="
                confirmVisible
                  ? 'Masquer la confirmation du mot de passe'
                  : 'Afficher la confirmation du mot de passe'
              "
              :aria-pressed="confirmVisible"
              :disabled="loading"
              @click="confirmVisible = !confirmVisible"
            >
              <EyeOff v-if="confirmVisible" :size="19" aria-hidden="true" />
              <Eye v-else :size="19" aria-hidden="true" />
            </button>
          </div>

          <p v-if="formError" class="login-error" role="alert">
            <span aria-hidden="true">!</span>{{ formError }}
          </p>

          <Button type="submit" :loading="loading" class="login-submit">
            {{ loading ? 'Création en cours' : 'Créer mon compte' }}
          </Button>
        </form>

        <div class="auth-footer">
          <span>Déjà inscrit ?</span>
          <RouterLink class="auth-link" :to="signInRoute"> Se connecter </RouterLink>
        </div>

        <p class="login-private-note">Espace privé · réservé à votre foyer</p>
      </div>
    </section>
  </main>
</template>
