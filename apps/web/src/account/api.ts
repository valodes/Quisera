export type UserProfile = {
  id: string
  name: string
  username: string | null
  email: string
  role: string
  createdAt: string
  activeSessionsCount: number
}

export type HouseholdMember = {
  id: string
  name: string
  username: string | null
  email: string
  role: 'owner' | 'member'
  joinedAt: string
  isCurrentUser: boolean
}

export type HouseholdInvitation = {
  id: string
  email: string
  invitedName: string | null
  invitedByName: string
  expiresAt: string
  createdAt: string
}

export type HouseholdOverview = {
  id: string
  name: string
  createdAt: string
  currentUserRole: 'owner' | 'member'
  members: HouseholdMember[]
  invitations: HouseholdInvitation[]
}

export type PublicInvitation = {
  email: string
  invitedName: string | null
  householdName: string
  invitedByName: string
  expiresAt: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
  })
  const payload = (await response.json().catch(() => null)) as
    (T & { error?: string }) | null
  if (!response.ok) {
    throw new Error(payload?.error ?? 'Une erreur est survenue.')
  }
  return payload as T
}

export async function getProfile() {
  const result = await request<{ profile: UserProfile }>('/api/profile')
  return result.profile
}

export async function updateProfile(payload: {
  name: string
  username: string | null
  email: string
  currentPassword?: string
}) {
  const result = await request<{ profile: UserProfile }>('/api/profile', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return result.profile
}

export async function changePassword(payload: {
  currentPassword: string
  newPassword: string
  revokeOtherSessions: boolean
}) {
  return request<{ ok: true }>('/api/profile/password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function revokeOtherSessions() {
  return request<{ ok: true; activeSessionsCount: number }>(
    '/api/profile/sessions/revoke-others',
    { method: 'POST' },
  )
}

export async function getHousehold() {
  const result = await request<{ household: HouseholdOverview }>(
    '/api/household',
  )
  return result.household
}

export async function renameHousehold(name: string) {
  const result = await request<{ household: { id: string; name: string } }>(
    '/api/household',
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    },
  )
  return result.household
}

export async function createHouseholdInvitation(payload: {
  email: string
  invitedName?: string
}) {
  return request<{ invitation: HouseholdInvitation; inviteUrl: string }>(
    '/api/household/invitations',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
}

export async function revokeHouseholdInvitation(id: string) {
  return request<{ ok: true }>(
    `/api/household/invitations/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
}

export async function removeHouseholdMember(userId: string) {
  return request<{ ok: true }>(
    `/api/household/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  )
}

export async function getPublicInvitation(token: string) {
  const result = await request<{ invitation: PublicInvitation }>(
    `/api/household/invitations/${encodeURIComponent(token)}`,
  )
  return result.invitation
}

export async function acceptHouseholdInvitation(
  token: string,
  payload: { name: string; username?: string | null; password: string },
) {
  return request<{
    ok: true
    user: { id: string; name: string; email: string; username: string | null }
  }>(`/api/household/invitations/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
