<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Check, KeyRound, Palette, ShieldCheck, User, Users } from '@lucide/vue'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import Button from '@/components/ui/Button.vue'
import { authClient } from '@/auth/client'
import { queryClient, queryKeys } from '@/lib/query'
import { applyTheme, getStoredTheme, themeOptions, type ThemeId } from '@/styles/themes'
import {
  changePassword,
  getHousehold,
  getProfile,
  revokeOtherSessions,
  updateProfile,
} from '@/account/api'

const SettingsHouseholdTab = defineAsyncComponent(
  () => import('@/components/settings/SettingsHouseholdTab.vue'),
)

type TabId = 'profil' | 'foyer'
type FoyerSectionId = 'membres' | 'preferences'

const route = useRoute()
const router = useRouter()
const session = authClient.useSession()

const activeTab = computed<TabId>(() => (route.query['tab'] === 'foyer' ? 'foyer' : 'profil'))
const activeFoyerSection = computed<FoyerSectionId>(() =>
  route.query['section'] === 'preferences' ? 'preferences' : 'membres',
)

function switchTab(tab: TabId) {
  void router.replace({ query: { ...route.query, tab } })
}

function switchFoyerSection(section: FoyerSectionId) {
  void router.replace({ query: { ...route.query, tab: 'foyer', section } })
}

// Profile state via declarative TanStack Query
const {
  data: profile,
  isPending: profileLoading,
  error: profileQueryError,
  refetch: refetchProfile,
} = useQuery({
  queryKey: queryKeys.profile,
  queryFn: getProfile,
})

// Lazy household query: only fetched when the "Mon foyer" tab is opened
const { data: household } = useQuery({
  queryKey: queryKeys.household,
  queryFn: getHousehold,
  enabled: computed(() => activeTab.value === 'foyer'),
})

const profileSaving = ref(false)
const profileActionError = ref('')
const profileSuccess = ref('')

const profileError = computed(() =>
  profileActionError.value
    ? profileActionError.value
    : profileQueryError.value instanceof Error
      ? profileQueryError.value.message
      : profileQueryError.value
        ? 'Profil indisponible.'
        : '',
)

const formName = ref('')
const formUsername = ref('')
const formEmail = ref('')
const formEmailPassword = ref('')

watch(
  profile,
  (data) => {
    if (!data) return
    formName.value = data.name
    formUsername.value = data.username ?? ''
    formEmail.value = data.email
    formEmailPassword.value = ''
  },
  { immediate: true },
)

const emailChanged = computed(() => {
  if (!profile.value) return false
  return formEmail.value.trim().toLowerCase() !== profile.value.email.toLowerCase()
})

// Password state
const passwordSaving = ref(false)
const passwordError = ref('')
const passwordSuccess = ref('')
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const revokeOthersOnPasswordChange = ref(true)

// Theme state
const currentTheme = ref<ThemeId>(getStoredTheme())

function selectTheme(id: ThemeId) {
  currentTheme.value = id
  applyTheme(id)
}

// Sessions state
const revokingSessions = ref(false)

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(new Date(iso))
}

async function submitProfile() {
  profileSaving.value = true
  profileActionError.value = ''
  profileSuccess.value = ''
  try {
    const updated = await updateProfile({
      name: formName.value.trim(),
      username: formUsername.value.trim() || null,
      email: formEmail.value.trim(),
      ...(emailChanged.value ? { currentPassword: formEmailPassword.value } : {}),
    })
    queryClient.setQueryData(queryKeys.profile, updated)
    formName.value = updated.name
    formUsername.value = updated.username ?? ''
    formEmail.value = updated.email
    formEmailPassword.value = ''
    profileSuccess.value = 'Votre profil a été mis à jour.'
    await session.value.refetch()
    await queryClient.invalidateQueries({ queryKey: queryKeys.household })
  } catch (cause) {
    profileActionError.value = cause instanceof Error ? cause.message : 'Mise à jour impossible.'
  } finally {
    profileSaving.value = false
  }
}

async function submitPassword() {
  passwordError.value = ''
  passwordSuccess.value = ''
  if (newPassword.value.length < 12) {
    passwordError.value = 'Le nouveau mot de passe doit contenir au moins 12 caractères.'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = 'Les deux mots de passe ne correspondent pas.'
    return
  }
  passwordSaving.value = true
  try {
    await changePassword({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
      revokeOtherSessions: revokeOthersOnPasswordChange.value,
    })
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    passwordSuccess.value = 'Votre mot de passe a été modifié.'
    await queryClient.invalidateQueries({ queryKey: queryKeys.profile })
    await refetchProfile()
  } catch (cause) {
    passwordError.value =
      cause instanceof Error ? cause.message : 'Impossible de modifier le mot de passe.'
  } finally {
    passwordSaving.value = false
  }
}

async function handleRevokeOtherSessions() {
  revokingSessions.value = true
  profileActionError.value = ''
  profileSuccess.value = ''
  try {
    const res = await revokeOtherSessions()
    if (profile.value) {
      queryClient.setQueryData(queryKeys.profile, {
        ...profile.value,
        activeSessionsCount: res.activeSessionsCount,
      })
    }
    profileSuccess.value = 'Les autres sessions ont été déconnectées.'
  } catch (cause) {
    profileActionError.value =
      cause instanceof Error ? cause.message : 'Impossible de révoquer les sessions.'
  } finally {
    revokingSessions.value = false
  }
}
</script>

<template>
  <TabsRoot
    class="settings"
    aria-label="Profil et foyer"
    :model-value="activeTab"
    @update:model-value="(val) => switchTab(val === 'foyer' ? 'foyer' : 'profil')"
  >
    <TabsList class="settings__tabs" aria-label="Sections du compte">
      <TabsTrigger
        value="profil"
        class="settings__tab"
        :class="{ 'is-active': activeTab === 'profil' }"
      >
        <User :size="18" aria-hidden="true" />
        Mon profil
      </TabsTrigger>
      <TabsTrigger
        value="foyer"
        class="settings__tab"
        :class="{ 'is-active': activeTab === 'foyer' }"
      >
        <Users :size="18" aria-hidden="true" />
        Mon foyer
        <span v-if="household" class="settings__tab-count">{{ household.members.length }}</span>
      </TabsTrigger>
    </TabsList>

    <!-- PROFIL TAB -->
    <TabsContent value="profil" class="settings__panel">
      <div v-if="profileLoading" class="settings__status" role="status">
        Chargement de votre profil…
      </div>
      <template v-else-if="profile">
        <header class="profile-hero">
          <div class="profile-hero__identity">
            <span class="profile-hero__avatar" aria-hidden="true">{{
              profile.name.slice(0, 1).toUpperCase()
            }}</span>
            <div class="profile-hero__text">
              <div class="profile-hero__name-row">
                <h2>{{ profile.name }}</h2>
                <span v-if="profile.username" class="profile-hero__handle"
                  >@{{ profile.username }}</span
                >
                <span class="profile-hero__role">{{
                  profile.role === 'admin' ? 'Administrateur' : 'Membre'
                }}</span>
              </div>
              <p class="profile-hero__meta">
                {{ profile.email }} · Membre depuis le
                {{ formatDate(profile.createdAt) }}
              </p>
            </div>
          </div>
          <div class="profile-hero__sessions">
            <span class="profile-hero__session-pill">
              <ShieldCheck :size="15" aria-hidden="true" />
              {{ profile.activeSessionsCount }}
              {{ profile.activeSessionsCount > 1 ? 'sessions actives' : 'session active' }}
            </span>
            <button
              v-if="profile.activeSessionsCount > 1"
              type="button"
              class="profile-hero__revoke"
              :disabled="revokingSessions"
              @click="handleRevokeOtherSessions"
            >
              Déconnecter les autres appareils
            </button>
          </div>
        </header>

        <div class="settings__grid">
          <form class="settings-card" @submit.prevent="submitProfile">
            <div class="settings-card__head">
              <h3>
                <User :size="18" aria-hidden="true" />
                Informations personnelles
              </h3>
              <p>Modifiez votre nom, votre identifiant et votre adresse e-mail.</p>
            </div>

            <p v-if="profileError" class="settings__alert settings__alert--error" role="alert">
              Erreur : {{ profileError }}
            </p>
            <p v-if="profileSuccess" class="settings__alert settings__alert--success" role="status">
              {{ profileSuccess }}
            </p>

            <label class="settings-field">
              <span>Nom d’affichage</span>
              <input v-model="formName" type="text" required maxlength="80" autocomplete="name" />
            </label>

            <label class="settings-field">
              <span>Nom d’utilisateur</span>
              <div class="settings-field__prefix-wrap">
                <span class="settings-field__prefix" aria-hidden="true">@</span>
                <input
                  v-model="formUsername"
                  type="text"
                  maxlength="30"
                  placeholder="ex. valentin"
                  autocomplete="username"
                />
              </div>
              <small
                >3 à 30 caractères : lettres minuscules, chiffres, « . », « _ » ou « - ».</small
              >
            </label>

            <label class="settings-field">
              <span>Adresse e-mail</span>
              <input v-model="formEmail" type="email" required autocomplete="email" />
            </label>

            <label v-if="emailChanged" class="settings-field settings-field--highlight">
              <span>Mot de passe actuel requis pour changer d’e-mail</span>
              <input
                v-model="formEmailPassword"
                type="password"
                required
                autocomplete="current-password"
                placeholder="Confirmez votre mot de passe actuel"
              />
            </label>

            <div class="settings-card__actions">
              <Button type="submit" :loading="profileSaving">Enregistrer les modifications</Button>
            </div>
          </form>

          <form class="settings-card" @submit.prevent="submitPassword">
            <div class="settings-card__head">
              <h3>
                <KeyRound :size="18" aria-hidden="true" />
                Mot de passe et sécurité
              </h3>
              <p>
                Choisissez un mot de passe unique d’au moins 12 caractères pour protéger votre
                compte.
              </p>
            </div>

            <p v-if="passwordError" class="settings__alert settings__alert--error" role="alert">
              Erreur : {{ passwordError }}
            </p>
            <p
              v-if="passwordSuccess"
              class="settings__alert settings__alert--success"
              role="status"
            >
              {{ passwordSuccess }}
            </p>

            <label class="settings-field">
              <span>Mot de passe actuel</span>
              <input
                v-model="currentPassword"
                type="password"
                required
                autocomplete="current-password"
              />
            </label>

            <label class="settings-field">
              <span>Nouveau mot de passe</span>
              <input
                v-model="newPassword"
                type="password"
                required
                minlength="12"
                maxlength="128"
                autocomplete="new-password"
              />
              <small
                :class="{
                  'is-valid': newPassword.length >= 12,
                }"
              >
                {{ newPassword.length }} / 12 caractères minimum
              </small>
            </label>

            <label class="settings-field">
              <span>Confirmer le nouveau mot de passe</span>
              <input
                v-model="confirmPassword"
                type="password"
                required
                minlength="12"
                maxlength="128"
                autocomplete="new-password"
              />
            </label>

            <label class="settings-checkbox">
              <input v-model="revokeOthersOnPasswordChange" type="checkbox" />
              <span>Déconnecter mes autres appareils après modification</span>
            </label>

            <div class="settings-card__actions">
              <Button type="submit" variant="secondary" :loading="passwordSaving"
                >Mettre à jour le mot de passe</Button
              >
            </div>
          </form>
        </div>

        <section class="settings-card" aria-label="Thème de l’interface">
          <div class="settings-card__head">
            <h3>
              <Palette :size="18" aria-hidden="true" />
              Apparence et thèmes
            </h3>
            <p>
              Choisissez l’ambiance visuelle de Quisera. Tous les thèmes respectent les contrastes
              WCAG AA.
            </p>
          </div>

          <div class="theme-grid" role="radiogroup" aria-label="Choisir un thème">
            <button
              v-for="option in themeOptions"
              :key="option.id"
              type="button"
              role="radio"
              :aria-checked="currentTheme === option.id"
              class="theme-card"
              :class="{ 'is-selected': currentTheme === option.id }"
              @click="selectTheme(option.id)"
            >
              <div class="theme-card__top">
                <div class="theme-card__title-wrap">
                  <strong>{{ option.name }}</strong>
                  <span class="theme-card__mode">{{
                    option.mode === 'dark' ? 'Sombre' : 'Clair'
                  }}</span>
                </div>
                <span v-if="currentTheme === option.id" class="theme-card__active">
                  <Check :size="14" aria-hidden="true" />
                  Actif
                </span>
              </div>
              <p class="theme-card__desc">{{ option.description }}</p>
              <div class="theme-card__swatches" :aria-label="`Palette du thème ${option.name}`">
                <span
                  v-for="swatch in option.swatches"
                  :key="swatch.hex"
                  class="theme-card__swatch"
                  :style="{ backgroundColor: swatch.hex }"
                  :title="`${swatch.label} (${swatch.hex})`"
                />
              </div>
            </button>
          </div>
        </section>
      </template>
    </TabsContent>

    <!-- FOYER TAB -->
    <TabsContent value="foyer" class="settings__panel">
      <SettingsHouseholdTab
        v-if="activeTab === 'foyer'"
        :active-section="activeFoyerSection"
        @switch-section="switchFoyerSection"
      />
    </TabsContent>
  </TabsRoot>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-4);
  color: var(--q-forest);
}

.settings__tabs {
  display: inline-flex;
  width: fit-content;
  gap: var(--q-space-1);
  padding: 4px;
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  border: 2px solid var(--q-forest);
}

.settings__tab {
  display: inline-flex;
  align-items: center;
  gap: var(--q-space-2);
  min-height: var(--q-touch-target);
  padding: 0 var(--q-space-4);
  border: 0;
  border-radius: var(--q-radius-control);
  background: transparent;
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: var(--q-type-button);
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color var(--q-duration-fast) var(--q-ease-standard),
    color var(--q-duration-fast) var(--q-ease-standard);
}

.settings__tab:hover:not(.is-active) {
  background: var(--q-shoot);
}

.settings__tab.is-active {
  background: var(--q-forest);
  color: var(--q-peach);
}

.settings__subtabs-root {
  display: grid;
  gap: var(--q-space-4);
}

.settings__subtabs {
  display: inline-flex;
  width: fit-content;
  flex-wrap: wrap;
  gap: var(--q-space-2);
}

.settings__subtab {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: var(--q-touch-target);
  padding: 0 var(--q-space-4);
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: var(--q-type-label);
  font-weight: 700;
  cursor: pointer;
}

.settings__subtab:hover:not(.is-active) {
  background: var(--q-shoot);
}

.settings__subtab.is-active {
  background: var(--q-shoot);
  border-color: var(--q-forest);
  color: var(--q-forest);
}

.settings__subtab:focus-visible {
  outline: 3px solid var(--q-focus);
  outline-offset: 2px;
}

.settings__tab-count {
  display: inline-grid;
  place-items: center;
  min-width: 1.4rem;
  height: 1.4rem;
  padding-inline: 0.35rem;
  border-radius: var(--q-radius-control);
  background: var(--q-shoot);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.settings__panel {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-4);
}

.settings__status {
  padding: var(--q-space-4);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  border: 1px solid var(--q-leaf);
  font-weight: 600;
}

.profile-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--q-space-4);
  padding: var(--q-space-6);
  border-radius: var(--q-radius-card);
  background: var(--q-forest);
  color: var(--q-peach);
  border: 2px solid var(--q-forest);
}

.profile-hero__identity {
  display: flex;
  align-items: center;
  gap: var(--q-space-4);
  min-width: 0;
}

.profile-hero__avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 4rem;
  height: 4rem;
  border-radius: var(--q-radius-card);
  background: var(--q-shoot);
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: 1.75rem;
  font-weight: 850;
}

.profile-hero__text {
  display: grid;
  gap: 0.3rem;
  min-width: 0;
}

.profile-hero__name-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--q-space-2);
}

.profile-hero__name-row h2 {
  margin: 0;
  font-family: var(--q-font-display);
  font-size: var(--q-type-h3);
  font-weight: 800;
  line-height: 1.1;
}

.profile-hero__handle {
  padding: 0.2rem 0.55rem;
  border-radius: var(--q-radius-control);
  background: var(--q-leaf);
  color: var(--q-peach);
  font-size: var(--q-type-label);
  font-weight: 700;
}

.profile-hero__role {
  padding: 0.2rem 0.55rem;
  border-radius: var(--q-radius-control);
  background: var(--q-coral);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 800;
}

.profile-hero__meta {
  margin: 0;
  font-size: var(--q-type-label);
  color: var(--q-sage);
}

.profile-hero__sessions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--q-space-2);
}

.profile-hero__session-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.75rem;
  border-radius: var(--q-radius-control);
  background: var(--q-leaf);
  color: var(--q-peach);
  font-size: var(--q-type-label);
  font-weight: 700;
}

.profile-hero__revoke {
  min-height: 38px;
  padding: 0 var(--q-space-3);
  border: 1px solid var(--q-peach);
  border-radius: var(--q-radius-control);
  background: transparent;
  color: var(--q-peach);
  font-size: var(--q-type-label);
  font-weight: 700;
  cursor: pointer;
}

.profile-hero__revoke:hover {
  background: var(--q-coral);
  border-color: var(--q-coral);
  color: var(--q-forest);
}

.household-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--q-space-4);
  padding: var(--q-space-6);
  border-radius: var(--q-radius-card);
  background: var(--q-leaf);
  color: var(--q-peach);
  border: 2px solid var(--q-forest);
}

.household-hero__form {
  flex: 1 1 22rem;
}

.household-hero__label {
  display: grid;
  gap: var(--q-space-2);
}

.household-hero__label span {
  font-family: var(--q-font-display);
  font-size: var(--q-type-label);
  font-weight: 750;
  color: var(--q-shoot);
}

.household-hero__input-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--q-space-2);
}

.household-hero__input-row input {
  flex: 1 1 14rem;
  min-height: var(--q-touch-target);
  padding: 0.5rem 0.75rem;
  border: 2px solid var(--q-forest);
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
  color: var(--q-forest);
  font-family: var(--q-font-display);
  font-size: 1.125rem;
  font-weight: 750;
}

.household-hero__stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--q-space-2);
}

.household-hero__stat {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.85rem;
  border-radius: var(--q-radius-control);
  background: var(--q-forest);
  color: var(--q-peach);
  font-size: var(--q-type-label);
  font-weight: 700;
}

.household-hero__stat--soft {
  background: var(--q-shoot);
  color: var(--q-forest);
}

.settings__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--q-space-4);
  align-items: start;
}

.settings-card {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-4);
  padding: var(--q-space-6);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  border: 2px solid var(--q-forest);
}

.settings-card__head {
  display: grid;
  gap: 0.25rem;
}

.settings-card__head h3 {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--q-space-2);
  font-family: var(--q-font-display);
  font-size: var(--q-type-h4);
  font-weight: 800;
  color: var(--q-forest);
}

.settings-card__head p {
  margin: 0;
  font-size: var(--q-type-label);
  color: var(--q-leaf);
}

.settings__alert {
  margin: 0;
  padding: var(--q-space-3);
  border-radius: var(--q-radius-control);
  font-size: var(--q-type-label);
  font-weight: 700;
}

.settings__alert--error {
  background: var(--q-peach);
  color: var(--q-forest);
  outline: 2px solid var(--q-tomato);
}

.settings__alert--success {
  background: var(--q-shoot);
  color: var(--q-forest);
}

.settings-field {
  display: grid;
  gap: 0.35rem;
}

.settings-field > span {
  font-size: var(--q-type-label);
  font-weight: 700;
  color: var(--q-forest);
}

.settings-field input {
  width: 100%;
  min-height: var(--q-touch-target);
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  color: var(--q-forest);
  font-size: 1rem;
}

.settings-field input:focus-visible {
  outline: 3px solid var(--q-forest);
  outline-offset: 2px;
}

.settings-field small {
  font-size: var(--q-type-metadata);
  color: var(--q-leaf);
  font-weight: 600;
}

.settings-field small.is-valid {
  color: var(--q-forest);
}

.settings-field--highlight {
  padding: var(--q-space-3);
  border-radius: var(--q-radius-control);
  background: var(--q-shoot);
}

.settings-field__prefix-wrap {
  display: flex;
  align-items: stretch;
}

.settings-field__prefix {
  display: grid;
  place-items: center;
  padding-inline: 0.75rem;
  background: var(--q-forest);
  color: var(--q-peach);
  border-radius: var(--q-radius-control) 0 0 var(--q-radius-control);
  font-weight: 800;
}

.settings-field__prefix-wrap input {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.settings-checkbox {
  display: flex;
  align-items: center;
  gap: var(--q-space-2);
  font-size: var(--q-type-label);
  font-weight: 600;
  cursor: pointer;
}

.settings-checkbox input {
  width: 1.15rem;
  height: 1.15rem;
  accent-color: var(--q-forest);
}

.settings-card__actions {
  display: flex;
  justify-content: flex-start;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(17.5rem, 1fr));
  gap: var(--q-space-3);
}

.theme-card {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-2);
  padding: var(--q-space-4);
  border: 2px solid var(--q-leaf);
  border-radius: var(--q-radius-card);
  background: var(--q-sage);
  color: var(--q-forest);
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--q-duration-fast) var(--q-ease-standard),
    background-color var(--q-duration-fast) var(--q-ease-standard),
    transform var(--q-duration-fast) var(--q-ease-standard);
}

.theme-card:hover {
  border-color: var(--q-forest);
  transform: translateY(-2px);
}

.theme-card.is-selected {
  border-color: var(--q-forest);
  background: var(--q-shoot);
}

.theme-card:focus-visible {
  outline: 3px solid var(--q-forest);
  outline-offset: 2px;
}

.theme-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--q-space-2);
}

.theme-card__title-wrap {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.theme-card__title-wrap strong {
  font-family: var(--q-font-display);
  font-size: 1rem;
  font-weight: 800;
}

.theme-card__mode {
  padding: 0.12rem 0.45rem;
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 700;
}

.theme-card__active {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.18rem 0.5rem;
  border-radius: var(--q-radius-control);
  background: var(--q-forest);
  color: var(--q-peach);
  font-size: var(--q-type-metadata);
  font-weight: 750;
}

.theme-card__desc {
  margin: 0;
  font-size: var(--q-type-metadata);
  line-height: 1.4;
  color: var(--q-forest);
}

.theme-card__swatches {
  margin-top: auto;
  padding-top: var(--q-space-2);
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.theme-card__swatch {
  width: 1.65rem;
  height: 1.65rem;
  border-radius: 999px;
  border: 2px solid var(--q-forest);
  flex: none;
}

@media (max-width: 64rem) {
  .settings__grid {
    grid-template-columns: 1fr;
  }
}
</style>
