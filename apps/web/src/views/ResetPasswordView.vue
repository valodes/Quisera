<script setup lang="ts">
import { AlertCircle, CheckCircle2, Eye, EyeOff } from '@lucide/vue'
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { authClient } from '@/auth/client'

const route = useRoute()
const router = useRouter()

const token = computed(() =>
  typeof route.query['token'] === 'string' ? route.query['token'].trim() : '',
)
const linkInvalid = computed(() => !token.value || route.query['error'] === 'INVALID_TOKEN')

const password = ref('')
const confirmPassword = ref('')
const passwordVisible = ref(false)
const confirmVisible = ref(false)
const passwordError = ref('')
const confirmError = ref('')
const formError = ref('')
const loading = ref(false)
const completed = ref(false)
const expiredAfterSubmit = ref(false)

const passwordType = computed(() => (passwordVisible.value ? 'text' : 'password'))
const confirmType = computed(() => (confirmVisible.value ? 'text' : 'password'))

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
  <main class="login-page">
    <section class="login-brand-panel" aria-label="Quisera">
      <RouterLink class="login-brand" :to="{ name: 'connexion' }">
        <span class="login-brand__mark" aria-hidden="true">Q</span>
        <span>Quisera</span>
      </RouterLink>
      <div class="login-brand__message">
        <p>Choisissez un nouveau mot de passe pour votre foyer.</p>
      </div>
    </section>

    <section class="login-form-panel" aria-labelledby="reset-title">
      <div class="login-form-wrap">
        <template v-if="completed">
          <h1 id="reset-title">Mot de passe mis à jour.</h1>
          <div class="auth-status-box" role="status">
            <div class="auth-status-box__header">
              <CheckCircle2 class="auth-status-box__icon" :size="22" aria-hidden="true" />
              <p>
                Votre nouveau mot de passe est enregistré et vos anciennes sessions ont été fermées
                par sécurité.
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
                Ce lien de réinitialisation n’est plus utilisable. Demandez-en un nouveau pour
                choisir un autre mot de passe.
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
            <div class="password-field">
              <TextInput
                v-model="password"
                label="Nouveau mot de passe"
                :type="passwordType"
                autocomplete="new-password"
                help-text="12 caractères minimum."
                :error-message="passwordError"
                :disabled="loading"
              />
              <button
                type="button"
                class="password-toggle"
                :aria-label="
                  passwordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                "
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
              {{ loading ? 'Enregistrement en cours' : 'Enregistrer le mot de passe' }}
            </Button>
          </form>

          <div class="auth-footer">
            <RouterLink class="auth-link" :to="{ name: 'connexion' }">
              Retour à la connexion
            </RouterLink>
          </div>
        </template>
      </div>
    </section>
  </main>
</template>
