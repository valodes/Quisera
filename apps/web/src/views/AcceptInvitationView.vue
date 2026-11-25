<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import {
  acceptHouseholdInvitation,
  getPublicInvitation,
  type PublicInvitation,
} from '@/account/api'

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
const submitError = ref('')

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
  submitError.value = ''
  if (password.value.length < 12) {
    submitError.value = 'Le mot de passe doit contenir au moins 12 caractères.'
    return
  }
  if (password.value !== confirmPassword.value) {
    submitError.value = 'Les deux mots de passe ne correspondent pas.'
    return
  }
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
  <main class="login-page">
    <section class="login-brand-panel" aria-label="Invitation Quisera">
      <RouterLink class="login-brand" to="/connexion">
        <span class="login-brand__mark" aria-hidden="true">Q</span>
        <span>Quisera</span>
      </RouterLink>
      <div class="login-brand__message">
        <p v-if="invitation">Rejoignez {{ invitation.householdName }} sur Quisera.</p>
        <p v-else>Votre invitation au foyer Quisera.</p>
      </div>
    </section>

    <section class="login-form-panel">
      <div class="login-form-wrap">
        <div v-if="loading" role="status">Vérification de votre invitation…</div>
        <div v-else-if="loadError" class="invite-error-box" role="alert">
          <h1>Invitation indisponible</h1>
          <p>Erreur : {{ loadError }}</p>
          <RouterLink class="not-found__link" to="/connexion">Retour à la connexion</RouterLink>
        </div>
        <template v-else-if="invitation">
          <h1>Rejoindre {{ invitation.householdName }}</h1>
          <p class="login-intro">
            {{ invitation.invitedByName }} vous a invité à partager le planning et les recettes du
            foyer.
          </p>

          <form class="login-form" @submit.prevent="submit">
            <label class="invite-field">
              <span>Adresse e-mail</span>
              <input :value="invitation.email" type="email" readonly />
            </label>

            <label class="invite-field">
              <span>Votre nom</span>
              <input v-model="name" type="text" required maxlength="80" autocomplete="name" />
            </label>

            <label class="invite-field">
              <span>Nom d’utilisateur (facultatif)</span>
              <input
                v-model="username"
                type="text"
                maxlength="30"
                placeholder="ex. camille"
                autocomplete="username"
              />
            </label>

            <label class="invite-field">
              <span>Mot de passe (12 caractères minimum)</span>
              <input
                v-model="password"
                type="password"
                required
                minlength="12"
                maxlength="128"
                autocomplete="new-password"
              />
            </label>

            <label class="invite-field">
              <span>Confirmer le mot de passe</span>
              <input
                v-model="confirmPassword"
                type="password"
                required
                minlength="12"
                maxlength="128"
                autocomplete="new-password"
              />
            </label>

            <p v-if="submitError" class="login-error" role="alert">
              <span aria-hidden="true">!</span>
              Erreur : {{ submitError }}
            </p>

            <Button type="submit" class="login-submit" :loading="submitting">
              Créer mon compte et rejoindre le foyer
            </Button>
          </form>
        </template>
      </div>
    </section>
  </main>
</template>

<style scoped lang="scss">
.invite-field {
  display: grid;
  gap: 0.35rem;

  span {
    font-size: var(--q-type-label);
    font-weight: 700;
    color: var(--q-forest);
  }

  input {
    width: 100%;
    min-height: var(--q-touch-target);
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--q-leaf);
    border-radius: var(--q-radius-control);
    background: var(--q-peach);
    color: var(--q-forest);
    font-size: 1rem;

    &[readonly] {
      background: var(--q-sage);
      font-weight: 600;
    }

    &:focus-visible {
      outline: 3px solid var(--q-forest);
      outline-offset: 2px;
    }
  }
}

.invite-error-box {
  display: grid;
  gap: var(--q-space-3);
}
</style>
