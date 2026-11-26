<script setup lang="ts">
defineOptions({ name: 'SettingsHouseholdTab' })

import { Check, Copy, Mail, SlidersHorizontal, Trash2, UserPlus, Users } from '@lucide/vue'
import { useQuery } from '@tanstack/vue-query'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import {
  createHouseholdInvitation,
  getHousehold,
  removeHouseholdMember,
  renameHousehold,
  revokeHouseholdInvitation,
} from '@/account/api'
import HouseholdPreferencesPanel from '@/components/settings/HouseholdPreferencesPanel.vue'
import Button from '@/components/ui/Button.vue'
import { queryClient, queryKeys } from '@/lib/query'

const ModalDialog = defineAsyncComponent(() => import('@/components/ui/ModalDialog.vue'))

defineProps<{
  activeSection: 'membres' | 'preferences'
}>()

const emit = defineEmits<{
  switchSection: [section: 'membres' | 'preferences']
}>()

const {
  data: household,
  isPending: householdLoading,
  error: householdQueryError,
  refetch: refetchHousehold,
} = useQuery({
  queryKey: queryKeys.household,
  queryFn: getHousehold,
})

const householdNameInput = ref('')
watch(
  () => household.value?.name,
  (name) => {
    if (name !== undefined) householdNameInput.value = name
  },
  { immediate: true },
)

const actionError = ref('')
const householdSuccess = ref('')
const householdRenaming = ref(false)

const householdError = computed(() =>
  actionError.value
    ? actionError.value
    : householdQueryError.value instanceof Error
      ? householdQueryError.value.message
      : householdQueryError.value
        ? 'Foyer indisponible.'
        : '',
)

// Invitation form state
const inviteEmail = ref('')
const inviteName = ref('')
const inviting = ref(false)
const inviteError = ref('')
const createdInviteUrl = ref('')
const copiedLink = ref(false)

// Accessible member removal confirmation modal
const pendingRemoveMember = ref<{ id: string; name: string } | null>(null)
const removingMember = ref(false)
const removeModalOpen = computed({
  get: () => pendingRemoveMember.value !== null,
  set: (val) => {
    if (!val) pendingRemoveMember.value = null
  },
})

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(new Date(iso))
}

async function submitHouseholdName() {
  if (!householdNameInput.value.trim()) return
  householdRenaming.value = true
  actionError.value = ''
  householdSuccess.value = ''
  try {
    await renameHousehold(householdNameInput.value.trim())
    await queryClient.invalidateQueries({ queryKey: queryKeys.household })
    await refetchHousehold()
    householdSuccess.value = 'Le nom du foyer a été mis à jour.'
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : 'Renommage impossible.'
  } finally {
    householdRenaming.value = false
  }
}

async function submitInvitation() {
  inviting.value = true
  inviteError.value = ''
  createdInviteUrl.value = ''
  copiedLink.value = false
  try {
    const trimmedInvitedName = inviteName.value.trim()
    const result = await createHouseholdInvitation({
      email: inviteEmail.value.trim(),
      ...(trimmedInvitedName ? { invitedName: trimmedInvitedName } : {}),
    })
    createdInviteUrl.value = result.inviteUrl
    inviteEmail.value = ''
    inviteName.value = ''
    await queryClient.invalidateQueries({ queryKey: queryKeys.household })
    await refetchHousehold()
  } catch (cause) {
    inviteError.value = cause instanceof Error ? cause.message : 'Impossible de créer l’invitation.'
  } finally {
    inviting.value = false
  }
}

async function copyInviteUrl() {
  if (!createdInviteUrl.value) return
  try {
    await navigator.clipboard.writeText(createdInviteUrl.value)
    copiedLink.value = true
    window.setTimeout(() => {
      copiedLink.value = false
    }, 2500)
  } catch {
    copiedLink.value = false
  }
}

async function handleRevokeInvitation(id: string) {
  actionError.value = ''
  householdSuccess.value = ''
  try {
    await revokeHouseholdInvitation(id)
    householdSuccess.value = 'Invitation révoquée.'
    await queryClient.invalidateQueries({ queryKey: queryKeys.household })
    await refetchHousehold()
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : 'Révocation impossible.'
  }
}

async function confirmRemoveMember() {
  const target = pendingRemoveMember.value
  if (!target) return
  removingMember.value = true
  actionError.value = ''
  householdSuccess.value = ''
  try {
    await removeHouseholdMember(target.id)
    pendingRemoveMember.value = null
    householdSuccess.value = `${target.name} a été retiré du foyer.`
    await queryClient.invalidateQueries({ queryKey: queryKeys.household })
    await refetchHousehold()
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : 'Suppression impossible.'
  } finally {
    removingMember.value = false
  }
}
</script>

<template>
  <TabsRoot
    class="settings-subtabs-root"
    :model-value="activeSection"
    @update:model-value="
      (val) => emit('switchSection', val === 'preferences' ? 'preferences' : 'membres')
    "
  >
    <TabsList class="settings-subtabs" aria-label="Sections du foyer">
      <TabsTrigger
        value="membres"
        class="settings-subtab"
        :class="{ 'is-active': activeSection === 'membres' }"
      >
        <Users :size="16" aria-hidden="true" />
        Membres & invitations
      </TabsTrigger>
      <TabsTrigger
        value="preferences"
        class="settings-subtab"
        :class="{ 'is-active': activeSection === 'preferences' }"
      >
        <SlidersHorizontal :size="16" aria-hidden="true" />
        Préférences planning
      </TabsTrigger>
    </TabsList>

    <TabsContent value="membres" class="settings-panel">
      <div v-if="householdLoading" class="settings-status" role="status">
        Chargement de votre foyer…
      </div>
      <template v-else-if="household">
        <header class="household-hero">
          <form class="household-hero__form" @submit.prevent="submitHouseholdName">
            <label class="household-hero__label">
              <span>Nom du foyer</span>
              <div class="household-hero__input-row">
                <input v-model="householdNameInput" type="text" required maxlength="80" />
                <Button type="submit" variant="secondary" :loading="householdRenaming">
                  Renommer
                </Button>
              </div>
            </label>
          </form>
          <div class="household-hero__stats">
            <span class="household-hero__stat">
              <Users :size="15" aria-hidden="true" />
              {{ household.members.length }}
              {{ household.members.length > 1 ? 'membres' : 'membre' }}
            </span>
            <span class="household-hero__stat household-hero__stat--soft">
              <Mail :size="15" aria-hidden="true" />
              {{ household.invitations.length }}
              {{
                household.invitations.length > 1
                  ? 'invitations en attente'
                  : 'invitation en attente'
              }}
            </span>
          </div>
        </header>

        <p v-if="householdError" class="settings-alert settings-alert--error" role="alert">
          Erreur : {{ householdError }}
        </p>
        <p v-if="householdSuccess" class="settings-alert settings-alert--success" role="status">
          {{ householdSuccess }}
        </p>

        <div class="household-grid">
          <section class="household-card">
            <div class="household-card__head">
              <h3>
                <Users :size="18" aria-hidden="true" />
                Membres du foyer
              </h3>
              <p>Les membres partagent le même planning et la bibliothèque de recettes.</p>
            </div>

            <ul class="member-list">
              <li v-for="member in household.members" :key="member.id" class="member-card">
                <span
                  class="member-card__avatar"
                  :class="{
                    'member-card__avatar--owner': member.role === 'owner',
                  }"
                  aria-hidden="true"
                  >{{ member.name.slice(0, 1).toUpperCase() }}</span
                >
                <div class="member-card__info">
                  <div class="member-card__title-row">
                    <strong>{{ member.name }}</strong>
                    <span v-if="member.username" class="member-card__handle"
                      >@{{ member.username }}</span
                    >
                    <span v-if="member.isCurrentUser" class="member-card__you">Vous</span>
                    <span class="member-card__role" :class="`member-card__role--${member.role}`">{{
                      member.role === 'owner' ? 'Propriétaire' : 'Membre'
                    }}</span>
                  </div>
                  <p class="member-card__meta">
                    {{ member.email }} · Rejoint le
                    {{ formatDate(member.joinedAt) }}
                  </p>
                </div>
                <button
                  v-if="household.currentUserRole === 'owner' && !member.isCurrentUser"
                  type="button"
                  class="member-card__remove"
                  :aria-label="`Retirer ${member.name} du foyer`"
                  @click="pendingRemoveMember = { id: member.id, name: member.name }"
                >
                  <Trash2 :size="16" aria-hidden="true" />
                  Retirer
                </button>
              </li>
            </ul>
          </section>

          <section class="household-card">
            <div class="household-card__head">
              <h3>
                <UserPlus :size="18" aria-hidden="true" />
                Inviter une personne
              </h3>
              <p>
                Générez un lien d’invitation sécurisé valable 7 jours pour permettre à un proche de
                rejoindre votre foyer.
              </p>
            </div>

            <p v-if="inviteError" class="settings-alert settings-alert--error" role="alert">
              Erreur : {{ inviteError }}
            </p>

            <form class="invite-form" @submit.prevent="submitInvitation">
              <label class="household-field">
                <span>Adresse e-mail de la personne invitée</span>
                <input
                  v-model="inviteEmail"
                  type="email"
                  required
                  placeholder="prenom@exemple.fr"
                />
              </label>

              <label class="household-field">
                <span>Prénom ou nom (facultatif)</span>
                <input v-model="inviteName" type="text" maxlength="80" placeholder="ex. Camille" />
              </label>

              <div class="household-card__actions">
                <Button type="submit" :loading="inviting">
                  <UserPlus :size="16" aria-hidden="true" />
                  Créer le lien d’invitation
                </Button>
              </div>
            </form>

            <div v-if="createdInviteUrl" class="invite-link-box" role="status">
              <strong>Lien d’invitation prêt à être partagé :</strong>
              <div class="invite-link-box__row">
                <input
                  :value="createdInviteUrl"
                  type="text"
                  readonly
                  aria-label="Lien d’invitation"
                  @focus="($event.target as HTMLInputElement).select()"
                />
                <Button type="button" variant="secondary" @click="copyInviteUrl">
                  <Check v-if="copiedLink" :size="16" aria-hidden="true" />
                  <Copy v-else :size="16" aria-hidden="true" />
                  {{ copiedLink ? 'Copié !' : 'Copier' }}
                </Button>
              </div>
              <small
                >Ce lien est à usage unique et expire dans 7 jours. Transmettez-le directement à
                votre proche.</small
              >
            </div>

            <div v-if="household.invitations.length" class="pending-invitations">
              <h4>Invitations en attente</h4>
              <ul>
                <li v-for="inv in household.invitations" :key="inv.id" class="pending-invitation">
                  <div>
                    <strong>{{
                      inv.invitedName ? `${inv.invitedName} · ${inv.email}` : inv.email
                    }}</strong>
                    <small
                      >Invité par {{ inv.invitedByName }} · Expire le
                      {{ formatDate(inv.expiresAt) }}</small
                    >
                  </div>
                  <button
                    type="button"
                    class="pending-invitation__revoke"
                    @click="handleRevokeInvitation(inv.id)"
                  >
                    Révoquer
                  </button>
                </li>
              </ul>
            </div>
          </section>
        </div>
      </template>
      <p v-else-if="householdError" class="settings-alert settings-alert--error" role="alert">
        Erreur : {{ householdError }}
      </p>
    </TabsContent>

    <TabsContent value="preferences" class="settings-panel">
      <HouseholdPreferencesPanel />
    </TabsContent>

    <ModalDialog
      v-if="pendingRemoveMember"
      v-model:open="removeModalOpen"
      :title="`Retirer ${pendingRemoveMember.name} du foyer ?`"
      badge="Confirmation"
      size="md"
    >
      <p>
        L’accès de <strong>{{ pendingRemoveMember.name }}</strong> au planning et aux recettes du
        foyer sera immédiatement révoqué et ses sessions seront déconnectées.
      </p>
      <template #footer>
        <Button variant="secondary" :disabled="removingMember" @click="pendingRemoveMember = null">
          Annuler
        </Button>
        <Button :loading="removingMember" @click="confirmRemoveMember">Retirer du foyer</Button>
      </template>
    </ModalDialog>
  </TabsRoot>
</template>

<style scoped>
.settings-subtabs-root {
  display: grid;
  gap: var(--q-space-4);
}
.settings-subtabs {
  display: inline-flex;
  width: fit-content;
  flex-wrap: wrap;
  gap: var(--q-space-2);
}
.settings-subtab {
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
.settings-subtab:hover:not(.is-active) {
  background: var(--q-shoot);
}
.settings-subtab.is-active {
  background: var(--q-shoot);
  border-color: var(--q-forest);
  color: var(--q-forest);
}
.settings-subtab:focus-visible {
  outline: 3px solid var(--q-focus);
  outline-offset: 2px;
}
.settings-panel {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-4);
}
.settings-status {
  padding: var(--q-space-4);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  border: 1px solid var(--q-leaf);
  font-weight: 600;
}
.settings-alert {
  margin: 0;
  padding: var(--q-space-3);
  border-radius: var(--q-radius-control);
  font-size: var(--q-type-label);
  font-weight: 700;
}
.settings-alert--error {
  background: var(--q-peach);
  color: var(--q-forest);
  outline: 2px solid var(--q-tomato);
}
.settings-alert--success {
  background: var(--q-shoot);
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
.household-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--q-space-4);
  align-items: start;
}
@media (max-width: 64rem) {
  .household-grid {
    grid-template-columns: 1fr;
  }
}
.household-card {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-4);
  padding: var(--q-space-6);
  border-radius: var(--q-radius-card);
  background: var(--q-peach);
  border: 2px solid var(--q-forest);
}
.household-card__head {
  display: grid;
  gap: 0.25rem;
}
.household-card__head h3 {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--q-space-2);
  font-family: var(--q-font-display);
  font-size: var(--q-type-h4);
  font-weight: 800;
  color: var(--q-forest);
}
.household-card__head p {
  margin: 0;
  font-size: var(--q-type-label);
  color: var(--q-leaf);
}
.household-card__actions {
  display: flex;
  justify-content: flex-start;
}
.household-field {
  display: grid;
  gap: 0.35rem;
}
.household-field > span {
  font-size: var(--q-type-label);
  font-weight: 700;
  color: var(--q-forest);
}
.household-field input {
  width: 100%;
  min-height: var(--q-touch-target);
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--q-leaf);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  color: var(--q-forest);
  font-size: 1rem;
}
.household-field input:focus-visible {
  outline: 3px solid var(--q-forest);
  outline-offset: 2px;
}
.member-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--q-space-3);
}
.member-card {
  display: flex;
  align-items: center;
  gap: var(--q-space-3);
  padding: var(--q-space-3);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  border: 1px solid var(--q-leaf);
}
.member-card__avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--q-radius-control);
  background: var(--q-forest);
  color: var(--q-peach);
  font-family: var(--q-font-display);
  font-size: 1.125rem;
  font-weight: 800;
}
.member-card__avatar--owner {
  background: var(--q-shoot);
  color: var(--q-forest);
  border: 1px solid var(--q-forest);
}
.member-card__info {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 0.2rem;
}
.member-card__title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.member-card__title-row strong {
  font-family: var(--q-font-display);
  font-weight: 750;
}
.member-card__handle {
  font-size: var(--q-type-metadata);
  font-weight: 700;
  color: var(--q-leaf);
}
.member-card__you,
.member-card__role {
  padding: 0.15rem 0.45rem;
  border-radius: var(--q-radius-control);
  font-size: var(--q-type-metadata);
  font-weight: 750;
}
.member-card__you {
  background: var(--q-forest);
  color: var(--q-peach);
}
.member-card__role--owner {
  background: var(--q-shoot);
  color: var(--q-forest);
}
.member-card__role--member {
  background: var(--q-peach);
  color: var(--q-forest);
}
.member-card__meta {
  margin: 0;
  font-size: var(--q-type-metadata);
  color: var(--q-leaf);
  overflow-wrap: anywhere;
}
.member-card__remove {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 38px;
  padding: 0 0.7rem;
  border: 1px solid var(--q-tomato);
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 700;
  cursor: pointer;
}
.member-card__remove:hover {
  background: var(--q-coral);
}
.invite-form {
  display: flex;
  flex-direction: column;
  gap: var(--q-space-3);
}
.invite-link-box {
  display: grid;
  gap: var(--q-space-2);
  padding: var(--q-space-4);
  border-radius: var(--q-radius-control);
  background: var(--q-shoot);
  border: 2px solid var(--q-forest);
}
.invite-link-box__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--q-space-2);
}
.invite-link-box__row input {
  flex: 1 1 14rem;
  min-height: var(--q-touch-target);
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--q-forest);
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
  color: var(--q-forest);
  font-size: var(--q-type-label);
}
.invite-link-box small {
  font-size: var(--q-type-metadata);
  color: var(--q-forest);
  font-weight: 600;
}
.pending-invitations {
  display: grid;
  gap: var(--q-space-2);
  padding-top: var(--q-space-3);
  border-top: 1px solid var(--q-leaf);
}
.pending-invitations h4 {
  margin: 0;
  font-family: var(--q-font-display);
  font-size: var(--q-type-label);
  font-weight: 800;
}
.pending-invitations ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--q-space-2);
}
.pending-invitation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--q-space-3);
  padding: var(--q-space-3);
  border-radius: var(--q-radius-control);
  background: var(--q-sage);
  border: 1px solid var(--q-leaf);
}
.pending-invitation div {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}
.pending-invitation strong {
  font-size: var(--q-type-label);
  overflow-wrap: anywhere;
}
.pending-invitation small {
  font-size: var(--q-type-metadata);
  color: var(--q-leaf);
}
.pending-invitation__revoke {
  min-height: 36px;
  padding: 0 0.7rem;
  border: 1px solid var(--q-forest);
  border-radius: var(--q-radius-control);
  background: var(--q-peach);
  color: var(--q-forest);
  font-size: var(--q-type-metadata);
  font-weight: 700;
  cursor: pointer;
}
.pending-invitation__revoke:hover {
  background: var(--q-coral);
}
</style>
