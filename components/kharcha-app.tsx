'use client'

import { useEffect, useState } from 'react'
import {
  ArrowLeft, ArrowRight, Bell, Car, Check, Home, Loader2, Plus,
  Receipt, SlidersHorizontal, Sparkles, Utensils, Wallet, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  AuthUser, Balance, Expense, Group, SettlementTxn,
  addExpense, clearSession, confirmSettlement, createGroup, fetchBalances,
  fetchExpenses, fetchGroupDetail, fetchGroups, fetchSettlements,
  getStoredUser, getToken, loginUser, registerUser, setSession,
} from '@/lib/api'

const CATEGORY_ICONS: Record<string, any> = {
  Food: Utensils, Travel: Car, Rent: Home, Utilities: Sparkles, Other: Receipt,
}

function initialsOf(name: string) {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
}

function PeopleStack({ members, size = 'size-8' }: { members: { name: string }[]; size?: string }) {
  return (
    <div className="flex -space-x-2">
      {members.slice(0, 4).map((m, i) => (
        <Avatar key={i} className={cn(size, 'border-2 border-card')}>
          <AvatarFallback className="text-[10px] font-semibold bg-secondary text-secondary-foreground">
            {initialsOf(m.name)}
          </AvatarFallback>
        </Avatar>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Auth screen — real register/login against the backend
// ---------------------------------------------------------------------------
function AuthScreen({ onAuthed }: { onAuthed: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = mode === 'login'
        ? await loginUser(email, password)
        : await registerUser(name, email, password)
      setSession(result.token, result.user)
      onAuthed(result.user)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-screen md:grid-cols-2">
      <div className="flex items-center justify-center p-8">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Wallet className="size-4" />
            </div>
            <span className="font-bold tracking-tight">kharcha<span className="text-emerald-600">.</span></span>
          </div>
          <h1 className="text-2xl font-semibold">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === 'login' ? 'Log in to see your groups.' : 'Split expenses without the awkward math.'}
          </p>

          <div className="mt-6 flex flex-col gap-3">
            {mode === 'register' && (
              <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
            )}
            <Input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>

          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

          <Button type="submit" className="mt-5 h-11 w-full" disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : mode === 'login' ? 'Continue' : 'Create account'}
          </Button>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === 'login' ? "New to kharcha?" : 'Already have an account?'}{' '}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}
            >
              {mode === 'login' ? 'Create an account' : 'Log in'}
            </button>
          </p>
        </form>
      </div>

      <section className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground md:flex md:flex-col md:justify-between">
        <div className="absolute -right-20 -top-20 size-72 rounded-full border-[40px] border-primary-foreground/10" />
        <div className="relative">
          <div className="flex justify-end">
            <Badge variant="outline" className="border-primary-foreground/20 text-primary-foreground">Private by design</Badge>
          </div>
          <Sparkles className="mt-24 size-9 text-accent" />
          <h2 className="mt-5 max-w-sm text-4xl font-semibold leading-tight">Every rupee, accounted for.</h2>
          <p className="mt-4 max-w-xs leading-6 text-muted-foreground">
            The calm way to keep group money transparent, fair, and drama-free.
          </p>
        </div>
      </section>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Add expense modal — real form, posts to the backend
// ---------------------------------------------------------------------------
function NewExpense({
  groupId, members, onClose, onSaved,
}: {
  groupId: number
  members: AuthUser[]
  onClose: () => void
  onSaved: () => void
}) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState<number | ''>(members[0]?.id ?? '')
  const [category, setCategory] = useState('Food')
  const [unequal, setUnequal] = useState(false)
  const [shares, setShares] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    const amt = parseFloat(amount)
    if (!description || !amt || !paidBy) {
      setError('Please fill in description, amount, and who paid.')
      return
    }

    let splits
    if (unequal) {
      splits = members.map((m) => ({ userId: m.id, shareAmount: parseFloat(shares[m.id] || '0') }))
      const total = splits.reduce((s, x) => s + x.shareAmount, 0)
      if (Math.abs(total - amt) > 0.05) {
        setError(`Splits add up to ₹${total.toFixed(2)}, but the expense is ₹${amt.toFixed(2)}.`)
        return
      }
    }

    setLoading(true)
    try {
      await addExpense(groupId, { description, amount: amt, paidBy: Number(paidBy), category, splits })
      onSaved()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to save expense')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">Add an expense</h2>
            <p className="mt-1 text-sm text-muted-foreground">Split with {members.length} people</p>
          </div>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-4">
          <Input placeholder="What was this for?" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Input placeholder="Amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />

          <label className="flex items-center justify-between rounded-xl border border-input px-4 py-3 text-sm">
            <span>Paid by</span>
            <select
              className="bg-transparent text-right font-semibold outline-none"
              value={paidBy}
              onChange={(e) => setPaidBy(Number(e.target.value))}
            >
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>

          <div>
            <p className="mb-2 text-sm font-medium">Category</p>
            <div className="flex flex-wrap gap-2">
              {['Food', 'Travel', 'Rent', 'Utilities', 'Other'].map((item) => (
                <button
                  key={item}
                  onClick={() => setCategory(item)}
                  className={cn(
                    'rounded-full border px-3 py-2 text-sm transition-colors',
                    category === item ? 'border-primary bg-primary text-primary-foreground' : 'border-input hover:bg-muted'
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-muted p-1">
            <button onClick={() => setUnequal(false)} className={cn('flex-1 rounded-lg py-2 text-sm font-medium', !unequal && 'bg-card shadow-sm')}>
              Split equally
            </button>
            <button onClick={() => setUnequal(true)} className={cn('flex-1 rounded-lg py-2 text-sm font-medium', unequal && 'bg-card shadow-sm')}>
              Split unequally
            </button>
          </div>

          {unequal && (
            <div className="flex flex-col gap-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3">
                  <Avatar className="size-7"><AvatarFallback className="text-[10px]">{initialsOf(m.name)}</AvatarFallback></Avatar>
                  <span className="flex-1 text-sm">{m.name}</span>
                  <Input
                    className="w-28"
                    value={shares[m.id] || ''}
                    onChange={(e) => setShares((s) => ({ ...s, [m.id]: e.target.value }))}
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button className="mt-2 h-11" onClick={handleSave} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <>Save expense <Check className="ml-1 size-4" /></>}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// New group modal
// ---------------------------------------------------------------------------
function NewGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [emails, setEmails] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!name) { setError('Group name is required'); return }
    setLoading(true)
    setError(null)
    try {
      const memberEmails = emails.split(',').map((e) => e.trim()).filter(Boolean)
      await createGroup(name, 'wallet', memberEmails)
      onCreated()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to create group')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold">New group</h2>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <Input placeholder="Group name (e.g. Goa Trip 2024)" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Member emails, comma separated (optional)" value={emails} onChange={(e) => setEmails(e.target.value)} />
          <p className="text-xs text-muted-foreground">Members must already have a kharcha account to be added by email.</p>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button className="mt-2 h-11" onClick={handleCreate} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : 'Create group'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dashboard — real groups + real aggregate balance
// ---------------------------------------------------------------------------
function Dashboard({
  user, groups, groupBalances, loading, onOpenGroup, onNewGroup,
}: {
  user: AuthUser
  groups: Group[]
  groupBalances: Record<number, number>
  loading: boolean
  onOpenGroup: (id: number) => void
  onNewGroup: () => void
}) {
  const totalBalance = Object.values(groupBalances).reduce((s, b) => s + b, 0)

  return (
    <>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-primary">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Good to see you, {user.name.split(' ')[0]}.</h1>
          <p className="mt-2 text-muted-foreground">Here's your money, at a glance.</p>
        </div>
        <Button onClick={onNewGroup}><Plus className="mr-1 size-4" /> New group</Button>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total balance</p>
              <p className={cn('mt-2 text-4xl font-semibold tracking-tight', totalBalance >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                {totalBalance >= 0 ? '+' : '-'}₹{Math.abs(totalBalance).toFixed(0)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{totalBalance >= 0 ? 'You are owed overall' : 'You owe overall'}</p>
            </div>
            <div className="rounded-xl bg-muted p-2 text-muted-foreground"><Wallet className="size-5" /></div>
          </div>
          <div className="mt-8 flex items-center justify-between border-t border-border pt-4 text-sm">
            <span className="text-muted-foreground">Across {groups.length} active groups</span>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Groups</p>
          <p className="mt-3 text-3xl font-semibold">{groups.length}</p>
          <p className="mt-1 text-sm text-muted-foreground">to keep an eye on</p>
        </div>
      </section>

      <div className="mt-10 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Your groups</h2>
          <p className="mt-1 text-sm text-muted-foreground">Keep tabs on shared spending.</p>
        </div>
        <button className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Filter groups"><SlidersHorizontal className="size-4" /></button>
      </div>

      {loading ? (
        <div className="mt-8 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : groups.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="font-medium">No groups yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create your first group to start splitting expenses.</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => {
            const balance = groupBalances[group.id] ?? 0
            const owed = balance >= 0
            return (
              <button
                key={group.id}
                onClick={() => onOpenGroup(group.id)}
                className="group rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground"><Wallet className="size-5" /></div>
                  <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <h3 className="mt-5 font-semibold">{group.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{group.member_count} members · {group.expense_count} expenses</p>
                <Separator className="my-5" />
                <div className="flex items-end justify-between">
                  <div className="text-right ml-auto">
                    <p className={cn('text-lg font-semibold', owed ? 'text-emerald-600' : 'text-red-500')}>
                      {owed ? '+' : '-'}₹{Math.abs(balance).toFixed(0)}
                    </p>
                    <p className="text-xs text-muted-foreground">{owed ? 'you are owed' : 'you owe'}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Group detail view — real expenses, balances, and settlement
// ---------------------------------------------------------------------------
function GroupView({
  groupId, currentUser, onBack,
}: {
  groupId: number
  currentUser: AuthUser
  onBack: () => void
}) {
  const [tab, setTab] = useState<'expenses' | 'balances' | 'settle'>('expenses')
  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<AuthUser[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [settlements, setSettlements] = useState<SettlementTxn[]>([])
  const [loading, setLoading] = useState(true)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [paidKeys, setPaidKeys] = useState<string[]>([])

  async function loadAll() {
    setLoading(true)
    try {
      const [detail, exp, bal] = await Promise.all([
        fetchGroupDetail(groupId),
        fetchExpenses(groupId),
        fetchBalances(groupId),
      ])
      setGroup(detail.group)
      setMembers(detail.members)
      setExpenses(exp.expenses)
      setBalances(bal.balances)
    } finally {
      setLoading(false)
    }
  }

  async function loadSettlements() {
    const s = await fetchSettlements(groupId)
    setSettlements(s.transactions)
  }

  useEffect(() => { loadAll() }, [groupId])
  useEffect(() => { if (tab === 'settle') loadSettlements() }, [tab])

  if (loading || !group) {
    return <div className="mt-16 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
  }

  async function handleMarkPaid(txn: SettlementTxn, key: string) {
    await confirmSettlement(groupId, txn.from, txn.to, txn.amount)
    setPaidKeys((k) => [...k, key])
  }

  return (
    <>
      <button onClick={onBack} className="mb-6 flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All groups
      </button>

      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div className="flex items-center gap-4">
          <div className="grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground"><Wallet className="size-6" /></div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{group.name}</h1>
            <div className="mt-2 flex items-center gap-3">
              <PeopleStack members={members} size="size-6" />
              <span className="text-sm text-muted-foreground">{members.length} members</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setExpenseOpen(true)}><Plus className="mr-1 size-4" /> Expense</Button>
          <Button onClick={() => setTab('settle')}><Receipt className="mr-1 size-4" /> Settle up</Button>
        </div>
      </div>

      {tab === 'settle' ? (
        <section className="mt-9">
          <div className="rounded-2xl border border-chart-2/20 bg-chart-2/10 p-5">
            <p className="font-semibold">{settlements.length - paidKeys.length} transactions will settle this group</p>
            <p className="mt-1 text-sm text-muted-foreground">Once everyone pays, all balances will be squared up.</p>
          </div>
          <div className="mt-5 flex flex-col gap-3">
            {settlements.map((txn, i) => {
              const key = `${txn.from}-${txn.to}-${i}`
              const isPaid = paidKeys.includes(key)
              return (
                <div key={key} className={cn('flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:p-5', isPaid && 'opacity-60')}>
                  <Avatar className="size-10"><AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-semibold">{initialsOf(txn.fromName)}</AvatarFallback></Avatar>
                  <div className="flex-1">
                    <p className="font-medium">{txn.fromName} <span className="text-muted-foreground">pays</span> {txn.toName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Settlement for {group.name}</p>
                  </div>
                  <p className="text-lg font-semibold">₹{txn.amount.toFixed(0)}</p>
                  <Button
                    variant={isPaid ? 'secondary' : 'outline'}
                    size="sm"
                    disabled={isPaid}
                    onClick={() => handleMarkPaid(txn, key)}
                  >
                    {isPaid ? <><Check className="mr-1 size-4" /> Paid</> : 'Mark as paid'}
                  </Button>
                </div>
              )
            })}
            {settlements.length === 0 && <p className="text-sm text-muted-foreground">Everyone is already settled up. 🎉</p>}
          </div>
          <button onClick={() => setTab('expenses')} className="mt-6 text-sm font-medium text-primary hover:underline">Back to expenses</button>
        </section>
      ) : (
        <>
          <div className="mt-9 flex gap-6 border-b border-border">
            <button onClick={() => setTab('expenses')} className={cn('border-b-2 pb-3 text-sm font-semibold', tab === 'expenses' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}>
              Expenses <Badge variant="secondary" className="ml-1.5">{expenses.length}</Badge>
            </button>
            <button onClick={() => setTab('balances')} className={cn('border-b-2 pb-3 text-sm font-semibold', tab === 'balances' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}>
              Balances
            </button>
          </div>

          {tab === 'expenses' ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
              {expenses.length === 0 && <p className="p-6 text-sm text-muted-foreground">No expenses yet — add the first one.</p>}
              {expenses.map((expense) => {
                const Icon = CATEGORY_ICONS[expense.category] || Receipt
                return (
                  <div key={expense.id} className="flex items-center gap-4 border-b border-border p-4 last:border-0 sm:p-5">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground"><Icon className="size-4" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{expense.description}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {expense.paid_by_name} paid · {new Date(expense.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <p className="font-semibold">₹{Number(expense.amount).toFixed(0)}</p>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {balances.map((b) => {
                const isYou = b.userId === currentUser.id
                const owed = b.balance >= 0
                return (
                  <div key={b.userId} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                    <Avatar className="size-10"><AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-semibold">{initialsOf(b.name)}</AvatarFallback></Avatar>
                    <div className="flex-1">
                      <p className="font-medium">{b.name}{isYou && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}</p>
                      <p className="text-sm text-muted-foreground">{owed ? 'gets back' : 'owes'}</p>
                    </div>
                    <p className={cn('font-semibold', owed ? 'text-emerald-600' : 'text-red-500')}>
                      {owed ? '+' : '-'}₹{Math.abs(b.balance).toFixed(0)}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {expenseOpen && (
        <NewExpense
          groupId={groupId}
          members={members}
          onClose={() => setExpenseOpen(false)}
          onSaved={loadAll}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------
export function KharchaApp() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [groups, setGroups] = useState<Group[]>([])
  const [groupBalances, setGroupBalances] = useState<Record<number, number>>({})
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null)
  const [newGroupOpen, setNewGroupOpen] = useState(false)

  useEffect(() => {
    const stored = getStoredUser()
    const token = getToken()
    if (stored && token) setUser(stored)
    setCheckingSession(false)
  }, [])

  async function loadGroups(currentUser: AuthUser) {
    setGroupsLoading(true)
    try {
      const { groups: list } = await fetchGroups()
      setGroups(list)
      const balancePairs = await Promise.all(
        list.map(async (g) => {
          const { balances } = await fetchBalances(g.id)
          const mine = balances.find((b) => b.userId === currentUser.id)
          return [g.id, mine?.balance ?? 0] as const
        })
      )
      setGroupBalances(Object.fromEntries(balancePairs))
    } finally {
      setGroupsLoading(false)
    }
  }

  useEffect(() => { if (user) loadGroups(user) }, [user])

  function handleLogout() {
    clearSession()
    setUser(null)
    setGroups([])
    setActiveGroupId(null)
  }

  if (checkingSession) {
    return <div className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
  }

  if (!user) {
    return <AuthScreen onAuthed={setUser} />
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <button onClick={() => setActiveGroupId(null)} className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Wallet className="size-4" /></div>
            <span className="font-bold tracking-tight">kharcha<span className="text-emerald-600">.</span></span>
          </button>
          <div className="flex items-center gap-2">
            <button aria-label="Notifications" className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><Bell className="size-4" /></button>
            <button onClick={handleLogout} className="ml-1">
              <Avatar className="size-8"><AvatarFallback className="bg-accent text-accent-foreground text-xs font-semibold">{initialsOf(user.name)}</AvatarFallback></Avatar>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10">
        {activeGroupId === null ? (
          <Dashboard
            user={user}
            groups={groups}
            groupBalances={groupBalances}
            loading={groupsLoading}
            onOpenGroup={setActiveGroupId}
            onNewGroup={() => setNewGroupOpen(true)}
          />
        ) : (
          <GroupView groupId={activeGroupId} currentUser={user} onBack={() => setActiveGroupId(null)} />
        )}
      </div>

      {newGroupOpen && (
        <NewGroupModal onClose={() => setNewGroupOpen(false)} onCreated={() => loadGroups(user)} />
      )}
    </main>
  )
}

export default KharchaApp
