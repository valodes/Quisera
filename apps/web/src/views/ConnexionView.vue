<script setup lang="ts">
import { Eye, EyeOff } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { authClient, safeReturnTo } from '@/auth/client'

const route = useRoute()
const router = useRouter()
const email = ref('')
const password = ref('')
const passwordVisible = ref(false)
const loading = ref(false)
const formError = ref('')
const emailError = ref('')
const passwordError = ref('')
const passwordType = computed(() =>
  passwordVisible.value ? 'text' : 'password',
)

async function submit() {
  emailError.value = ''
  passwordError.value = ''
  formError.value = ''
  const normalizedEmail = email.value.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
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
    await router.replace(safeReturnTo(route.query.returnTo))
  } catch {
    formError.value = 'Connexion impossible pour le moment. Réessayez.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-brand-panel" aria-label="Quisera">
      <a class="login-brand" href="/" aria-label="Quisera">
        <span class="login-brand__mark" aria-hidden="true">Q</span>
        <span>Quisera</span>
      </a>
      <div class="login-brand__message">
        <p>Organisez vos repas et retrouvez votre espace cuisine.</p>
      </div>
    </section>

    <section class="login-form-panel" aria-labelledby="login-title">
      <div class="login-form-wrap">
        <h1 id="login-title">Ravi de vous retrouver.</h1>
        <p class="login-intro">
          Connectez-vous pour retrouver votre espace Quisera.
        </p>

        <form class="login-form" novalidate @submit.prevent="submit">
          <TextInput
            v-model="email"
            label="Adresse e-mail"
            type="email"
            autocomplete="username"
            :error-message="emailError"
            :disabled="loading"
          />
          <div class="password-field">
            <TextInput
              v-model="password"
              label="Mot de passe"
              :type="passwordType"
              autocomplete="current-password"
              :error-message="passwordError"
              :disabled="loading"
            />
            <button
              type="button"
              class="password-toggle"
              :aria-label="
                passwordVisible
                  ? 'Masquer le mot de passe'
                  : 'Afficher le mot de passe'
              "
              :aria-pressed="passwordVisible"
              :disabled="loading"
              @click="passwordVisible = !passwordVisible"
            >
              <EyeOff v-if="passwordVisible" :size="19" aria-hidden="true" />
              <Eye v-else :size="19" aria-hidden="true" />
            </button>
          </div>

          <p v-if="formError" class="login-error" role="alert">
            <span aria-hidden="true">!</span>{{ formError }}
          </p>

          <Button type="submit" :loading="loading" class="login-submit">
            {{ loading ? 'Connexion en cours' : 'Se connecter' }}
          </Button>
        </form>

        <p class="login-private-note">Espace privé · réservé à votre foyer</p>
      </div>
    </section>
  </main>
</template>
