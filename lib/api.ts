// Thin fetch wrapper for talking to the Kharcha backend.
// Set NEXT_PUBLIC_API_URL in .env.local (e.g. http://localhost:4000 while developing).

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

const TOKEN_KEY = 'kharcha_token'
const USER_KEY = 'kharcha_user'

export type AuthUser = { id: number; name: string; email: string }

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

// ---- Groups ----
export type Group = {
  id: number
  name: string
  icon: string
  member_count: string
  expense_count: string
}

export const fetchGroups = () => request<{ groups: Group[] }>('/groups')

export const createGroup = (name: string, icon?: string, memberEmails?: string[]) =>
  request<{ group: Group }>('/groups', {
    method: 'POST',
    body: JSON.stringify({ name, icon, memberEmails }),
  })

export const fetchGroupDetail = (groupId: number) =>
  request<{ group: Group; members: AuthUser[] }>(`/groups/${groupId}`)

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
    paidBy: number
    category: string
    splits?: { userId: number; shareAmount: number }[]
  }
) =>
  request(`/groups/${groupId}/expenses`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

// ---- Balances & Settlements ----
export type Balance = { userId: number; name: string; balance: number }
export type SettlementTxn = { from: number; fromName: string; to: number; toName: string; amount: number }

export const fetchBalances = (groupId: number) =>
  request<{ balances: Balance[] }>(`/groups/${groupId}/balances`)

export const fetchSettlements = (groupId: number) =>
  request<{ transactionCount: number; transactions: SettlementTxn[] }>(`/groups/${groupId}/settlements`)

export const confirmSettlement = (groupId: number, fromUserId: number, toUserId: number, amount: number) =>
  request(`/groups/${groupId}/settlements/confirm`, {
    method: 'POST',
    body: JSON.stringify({ fromUserId, toUserId, amount }),
  })
