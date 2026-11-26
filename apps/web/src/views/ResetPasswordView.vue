<script setup lang="ts">
import { AlertCircle, CheckCircle2 } from '@lucide/vue'
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { authClient } from '@/auth/client'
import AuthLayout from '@/components/auth/AuthLayout.vue'
import Button from '@/components/ui/Button.vue'
import PasswordInput from '@/components/ui/PasswordInput.vue'

const route = useRoute()
const router = useRouter()

const token = computed(() =>
  typeof route.query['token'] === 'string' ? route.query['token'].trim() : '',
)
const linkInvalid = computed(() => !token.value || route.query['error'] === 'INVALID_TOKEN')

const password = ref('')
const confirmPassword = ref('')
const passwordError = ref('')
const confirmError = ref('')
const formError = ref('')
const loading = ref(false)
const completed = ref(false)
const expiredAfterSubmit = ref(false)

async function submit() {
  passwordError.value = ''
  confirmError.value = ''
  formError.value = ''
  expiredAfterSubmit.value = false

  if (password.value.length < 12) {
    passwordError.value = 'Le mot de passe doit contenir au moins 12 caractères.'
  } else if (password.value.length > 128) {
    passwordError.value = 'Le mot de passe ne peut pas dépasser 128 caractères.'
  }

  if (!confirmPassword.value) {
    confirmError.value = 'Confirmez votre nouveau mot de passe.'
  } else if (password.value !== confirmPassword.value) {
    confirmError.value = 'Les deux mots de passe ne correspondent pas.'
  }

  if (passwordError.value || confirmError.value) return

  loading.value = true
  try {
    const result = await authClient.resetPassword({
      newPassword: password.value,
      token: token.value,
    })
    if (result.error) {
      const code = result.error.code ?? ''
      if (code === 'INVALID_TOKEN' || code === 'TOKEN_EXPIRED') {
        expiredAfterSubmit.value = true
        return
      }
      formError.value = 'Impossible de mettre à jour votre mot de passe. Demandez un nouveau lien.'
      return
    }
    completed.value = true
  } catch {
    formError.value = 'Impossible de mettre à jour votre mot de passe pour le moment. Réessayez.'
  } finally {
    loading.value = false
  }
}

async function goToLogin() {
  await router.replace({ name: 'connexion' })
}
</script>

<template>
  <AuthLayout
    brand-message="Choisissez un nouveau mot de passe pour votre foyer."
    title-id="reset-title"
  >
    <template v-if="completed">
      <h1 id="reset-title">Mot de passe mis à jour.</h1>
      <div class="auth-status-box" role="status">
        <div class="auth-status-box__header">
          <CheckCircle2 class="auth-status-box__icon" :size="22" aria-hidden="true" />
          <p>
            Votre nouveau mot de passe est enregistré et vos anciennes sessions ont été fermées par
            sécurité.
          </p>
        </div>
        <div class="auth-actions">
          <Button type="button" @click="goToLogin">Se connecter</Button>
        </div>
      </div>
    </template>

    <template v-else-if="linkInvalid || expiredAfterSubmit">
      <h1 id="reset-title">Lien invalide ou expiré.</h1>
      <div class="auth-status-box auth-status-box--error" role="alert">
        <div class="auth-status-box__header">
          <AlertCircle class="auth-status-box__icon" :size="22" aria-hidden="true" />
          <p>
            Ce lien de réinitialisation n’est plus utilisable. Demandez-en un nouveau pour choisir
            un autre mot de passe.
          </p>
        </div>
        <div class="auth-actions">
          <RouterLink class="auth-link" :to="{ name: 'forgot-password' }">
            Demander un nouveau lien
          </RouterLink>
          <RouterLink class="auth-link" :to="{ name: 'connexion' }">
            Retour à la connexion
          </RouterLink>
        </div>
      </div>
    </template>

    <template v-else>
      <h1 id="reset-title">Nouveau mot de passe.</h1>
      <p class="login-intro">
        Choisissez un mot de passe d’au moins 12 caractères pour sécuriser votre compte.
      </p>

      <form class="login-form" novalidate @submit.prevent="submit">
        <PasswordInput
          v-model="password"
          label="Nouveau mot de passe"
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
          {{ loading ? 'Enregistrement en cours' : 'Enregistrer le mot de passe' }}
        </Button>
      </form>

      <div class="auth-footer">
        <RouterLink class="auth-link" :to="{ name: 'connexion' }">
          Retour à la connexion
        </RouterLink>
      </div>
    </template>
  </AuthLayout>
</template>
