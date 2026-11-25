<script setup lang="ts">
import { CheckCircle2 } from '@lucide/vue'
import { isValidEmail } from '@quisera/shared'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { authClient } from '@/auth/client'

const email = ref('')
const submittedEmail = ref('')
const emailError = ref('')
const formError = ref('')
const loading = ref(false)
const sent = ref(false)

async function submit() {
  emailError.value = ''
  formError.value = ''

  const normalizedEmail = email.value.trim().toLowerCase()
  if (!isValidEmail(normalizedEmail)) {
    emailError.value = 'Saisissez une adresse e-mail valide.'
    return
  }

  loading.value = true
  try {
    const result = await authClient.requestPasswordReset({
      email: normalizedEmail,
      redirectTo: `${window.location.origin}/reinitialiser-mot-de-passe`,
    })
    if (result.error) {
      formError.value = 'Impossible d’envoyer la demande pour le moment. Réessayez.'
      return
    }
    submittedEmail.value = normalizedEmail
    sent.value = true
  } catch {
    formError.value = 'Impossible d’envoyer la demande pour le moment. Réessayez.'
  } finally {
    loading.value = false
  }
}

function resetForm() {
  sent.value = false
  formError.value = ''
  emailError.value = ''
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
        <p>Retrouvez l’accès à votre espace cuisine.</p>
      </div>
    </section>

    <section class="login-form-panel" aria-labelledby="forgot-title">
      <div class="login-form-wrap">
        <h1 id="forgot-title">Mot de passe oublié.</h1>

        <template v-if="sent">
          <div class="auth-status-box" role="status">
            <div class="auth-status-box__header">
              <CheckCircle2 class="auth-status-box__icon" :size="22" aria-hidden="true" />
              <p>
                Si un compte correspond à
                <strong>{{ submittedEmail }}</strong>, un lien de réinitialisation vient d’être
                envoyé. Il reste valable pendant une heure.
              </p>
            </div>
            <div class="auth-actions">
              <Button type="button" variant="secondary" @click="resetForm">
                Utiliser une autre adresse
              </Button>
              <RouterLink class="auth-link" :to="{ name: 'connexion' }">
                Retour à la connexion
              </RouterLink>
            </div>
          </div>
        </template>

        <template v-else>
          <p class="login-intro">
            Indiquez votre adresse e-mail pour recevoir un lien de réinitialisation.
          </p>

          <form class="login-form" novalidate @submit.prevent="submit">
            <TextInput
              v-model="email"
              label="Adresse e-mail"
              type="email"
              autocomplete="email"
              :error-message="emailError"
              :disabled="loading"
            />

            <p v-if="formError" class="login-error" role="alert">
              <span aria-hidden="true">!</span>{{ formError }}
            </p>

            <Button type="submit" :loading="loading" class="login-submit">
              {{ loading ? 'Envoi en cours' : 'Envoyer le lien de réinitialisation' }}
            </Button>
          </form>

          <div class="auth-footer">
            <span>Vous avez retrouvé votre mot de passe ?</span>
            <RouterLink class="auth-link" :to="{ name: 'connexion' }">
              Retour à la connexion
            </RouterLink>
          </div>
        </template>
      </div>
    </section>
  </main>
</template>
