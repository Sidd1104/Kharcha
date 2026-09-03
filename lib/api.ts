// Thin fetch wrapper for talking to the Kharcha backend.
// Set NEXT_PUBLIC_API_URL in .env.local (e.g. http://localhost:4000 while developing).

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

const TOKEN_KEY = 'kharcha_token'
const USER_KEY = 'kharcha_user'

export type AuthUser = { id: number; name: string; email: string }

// A participant in a group — could be a registered user, a guest, or an invited person
export type Participant = {
  participant_id: number
  user_id: number | null
  name: string
  email: string | null
  status: 'active' | 'invited' | 'guest'
  type: 'user' | 'guest' | 'invited'
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(USER_KEY)
  return raw ? JSON.parse(raw) : null
}

export function setSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new ApiError(data.error || 'Something went wrong', res.status)
  }
  return data as T
}

// ---- Auth ----
export const getGoogleAuthUrl = () => `${BASE_URL}/auth/google`

export const checkGoogleOAuthConfig = () =>
  request<{ configured: boolean; clientId: string | null }>('/auth/google/status')

export const registerUser = (name: string, email: string, password: string) =>
  request<{ token: string; user: AuthUser }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  })

export const loginUser = (email: string, password: string) =>
  request<{ token: string; user: AuthUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })

export const quickGoogleLogin = (email?: string, name?: string) =>
  request<{ token: string; user: AuthUser }>('/auth/google/quick', {
    method: 'POST',
    body: JSON.stringify({ email, name }),
  })

export const loginWithGoogleCredential = (credential: string) =>
  request<{ token: string; user: AuthUser }>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  })


// ---- Groups ----
export type Group = {
  id: number
  name: string
  icon: string
  member_count: string
  expense_count: string
}

export const fetchGroups = () => request<{ groups: Group[] }>('/groups')

export const createGroup = (
  name: string,
  icon?: string,
  guests?: string[],
  inviteEmails?: string[]
) =>
  request<{ group: Group }>('/groups', {
    method: 'POST',
    body: JSON.stringify({ name, icon, guests, inviteEmails }),
  })

export const fetchGroupDetail = (groupId: number) =>
  request<{ group: Group; participants: Participant[] }>(`/groups/${groupId}`)

export const addGuest = (groupId: number, name: string) =>
  request<{ participant: Participant }>(`/groups/${groupId}/participants/guest`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })

export const sendInvite = (groupId: number, email: string) =>
  request<{ participant: Participant }>(`/groups/${groupId}/participants/invite`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  })

// ---- Expenses ----
export type Expense = {
  id: number
  amount: string
  description: string
  category: string
  created_at: string
  paid_by_id: number
  paid_by_name: string
}

export const fetchExpenses = (groupId: number) =>
  request<{ expenses: Expense[] }>(`/groups/${groupId}/expenses`)

export const addExpense = (
  groupId: number,
  payload: {
    description: string
    amount: number
    paidBy: number // participant_id
    category: string
    splits?: { participantId: number; shareAmount: number }[]
  }
) =>
  request(`/groups/${groupId}/expenses`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

// ---- Balances & Settlements ----
export type Balance = { participantId: number; userId: number | null; name: string; balance: number }
export type SettlementTxn = { from: number; fromName: string; to: number; toName: string; amount: number }

export const fetchBalances = (groupId: number) =>
  request<{ balances: Balance[] }>(`/groups/${groupId}/balances`)

export const fetchSettlements = (groupId: number) =>
  request<{ transactionCount: number; transactions: SettlementTxn[] }>(`/groups/${groupId}/settlements`)

export const confirmSettlement = (groupId: number, fromParticipantId: number, toParticipantId: number, amount: number) =>
  request(`/groups/${groupId}/settlements/confirm`, {
    method: 'POST',
    body: JSON.stringify({ fromParticipantId, toParticipantId, amount }),
  })

// ---- Invites ----
export type InviteInfo = {
  groupName: string
  groupIcon: string
  inviterName: string
  email: string
  status: string
  createdAt: string
}

export const getInviteInfo = (token: string) =>
  request<InviteInfo>(`/invites/${token}`)

export const acceptInvite = (token: string) =>
  request<{ message: string; group: { id: number; name: string } }>(`/invites/${token}/accept`, {
    method: 'POST',
  })

export const declineInvite = (token: string) =>
  request<{ message: string }>(`/invites/${token}/decline`, {
    method: 'POST',
  })

// ---- Notifications ----
export type PendingInvite = {
  id: number
  token: string
  email: string
  created_at: string
  group_name: string
  group_icon: string
  inviter_name: string
}

export const fetchNotifications = () =>
  request<{ invites: PendingInvite[] }>('/notifications')
