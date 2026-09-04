'use client'

import { useEffect, useState, useRef } from 'react'
import {
  ArrowLeft, ArrowRight, Bell, Car, Check, ChevronDown, Home, Loader2, Lock, Mail, Plus,
  Receipt, ShieldCheck, SlidersHorizontal, Sparkles, User, UserPlus, Utensils, Wallet, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  AuthUser, Balance, Expense, Group, Participant, PendingInvite, SettlementTxn,
  acceptInvite, addExpense, addGuest, checkGoogleOAuthConfig, clearSession,
  confirmSettlement, createGroup, declineInvite, fetchBalances,
  fetchExpenses, fetchGroupDetail, fetchGroups, fetchNotifications, fetchSettlements,
  getGoogleAuthUrl, getStoredUser, getToken, loginUser, quickGoogleLogin, registerUser,
  sendInvite, setSession,
} from '@/lib/api'

const CATEGORY_ICONS: Record<string, any> = {
  Food: Utensils, Travel: Car, Rent: Home, Utilities: Sparkles, Other: Receipt,
}

function initialsOf(name: string) {
  if (!name) return 'U'
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
}

function getGreeting(name: string) {
  const hour = new Date().getHours()
  const firstName = name ? name.split(' ')[0] : 'there'
  if (hour < 12) return `Good morning, ${firstName}.`
  if (hour < 18) return `Good afternoon, ${firstName}.`
  return `Good evening, ${firstName}.`
}

function getGroupIconDetails(group: Group) {
  const nameLower = (group.name || '').toLowerCase()
  const icon = (group.icon || '').toLowerCase()

  if (
    nameLower.includes('trip') ||
    nameLower.includes('travel') ||
    nameLower.includes('goa') ||
    nameLower.includes('car') ||
    nameLower.includes('tour') ||
    icon === 'trip' ||
    icon === 'travel' ||
    icon === 'car'
  ) {
    return {
      Icon: Car,
      bg: 'bg-[#e8f5e9] text-[#2e7d32]',
    }
  }

  if (
    nameLower.includes('flat') ||
    nameLower.includes('home') ||
    nameLower.includes('room') ||
    nameLower.includes('pg') ||
    nameLower.includes('rent') ||
    nameLower.includes('house') ||
    icon === 'home' ||
    icon === 'rent'
  ) {
    return {
      Icon: Home,
      bg: 'bg-[#fce8e6] text-[#c5221f]',
    }
  }

  if (
    nameLower.includes('food') ||
    nameLower.includes('dinner') ||
    nameLower.includes('lunch') ||
    nameLower.includes('cafe') ||
    nameLower.includes('party') ||
    icon === 'food'
  ) {
    return {
      Icon: Utensils,
      bg: 'bg-[#fff3e0] text-[#e65100]',
    }
  }

  return {
    Icon: Wallet,
    bg: 'bg-[#e8eaf6] text-[#283593]',
  }
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
function AuthScreen({
  onAuthed,
  initialError,
}: {
  onAuthed: (user: AuthUser) => void
  initialError?: string | null
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError || null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { token, user } =
        mode === 'register'
          ? await registerUser(name, email, password)
          : await loginUser(email, password)
      setSession(token, user)
      onAuthed(user)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function handleGoogleLogin() {
    setError(null)
    window.location.href = getGoogleAuthUrl()
  }

  return (
    <main className="grid min-h-screen md:grid-cols-2">
      {/* Left panel with dot-grid pattern */}
      <div className="relative flex flex-col justify-between p-8 sm:p-12 md:p-14 bg-background bg-[radial-gradient(rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:16px_16px]">
        {/* Brand logo */}
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="size-4" />
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground">
            kharcha<span className="text-emerald-500">.</span>
          </span>
        </div>

        {/* Center form */}
        <div className="mx-auto my-auto w-full max-w-sm py-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === 'login' ? 'Log in to see your groups.' : 'Split expenses without the awkward math.'}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
            {mode === 'register' && (
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 rounded-lg border-border bg-card/60 pl-10 text-foreground placeholder:text-muted-foreground"
                  required
                />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-lg border-border bg-card/60 pl-10 text-foreground placeholder:text-muted-foreground"
                required
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-lg border-border bg-card/60 pl-10 text-foreground placeholder:text-muted-foreground"
                required
                minLength={6}
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="mt-2 h-11 w-full rounded-lg bg-primary font-medium text-primary-foreground hover:bg-primary/90"
              disabled={loading}
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : 'Continue'}
            </Button>

            {/* Horizontal divider */}
            <div className="relative my-2 flex items-center justify-center">
              <div className="w-full border-t border-border" />
              <span className="absolute bg-[#09090b] px-3 text-xs text-muted-foreground">or</span>
            </div>

            {/* Continue with Google button */}
            <Button
              type="button"
              variant="outline"
              onClick={handleGoogleLogin}
              className="h-11 w-full rounded-lg border-border bg-card/40 text-sm font-medium text-foreground hover:bg-muted cursor-pointer transition-colors"
            >
              <svg className="mr-2 size-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              Continue with Google
            </Button>

            <p className="mt-3 text-center text-sm text-muted-foreground">
              {mode === 'login' ? 'New to kharcha?' : 'Already have an account?'}{' '}
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

        {/* Bottom trust indicators */}
        <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Lock className="size-3.5 text-muted-foreground" />
            Encrypted data
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-muted-foreground" />
            No spam, ever
          </span>
        </div>
      </div>

      {/* Right indigo panel */}
      <section className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground md:flex md:flex-col md:justify-between">
        <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full border-[40px] border-primary-foreground/10" />
        <div className="flex justify-end">
          <Badge variant="outline" className="border-primary-foreground/20 text-primary-foreground">
            Private by design
          </Badge>
        </div>
        <div className="relative my-auto max-w-sm">
          <Sparkles className="size-9 text-accent text-white" />
          <h2 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-white">
            Every rupee, accounted for.
          </h2>
          <p className="mt-4 text-sm leading-6 text-indigo-100/80">
            The calm way to keep group money transparent, fair, and drama-free.
          </p>
        </div>
        <div className="h-6" />
      </section>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Add expense modal — uses participant IDs
// ---------------------------------------------------------------------------
function NewExpense({
  groupId, participants, onClose, onSaved,
}: {
  groupId: number
  participants: Participant[]
  onClose: () => void
  onSaved: () => void
}) {
  // Only active & guest participants can pay or be split with (not invited)
  const splitParticipants = participants.filter((p) => p.status !== 'invited')

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState<number | ''>(splitParticipants[0]?.participant_id ?? '')
  const [paidByOpen, setPaidByOpen] = useState(false)
  const paidByRef = useRef<HTMLDivElement>(null)
  const [category, setCategory] = useState('Food')
  const [unequal, setUnequal] = useState(false)
  const [shares, setShares] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (paidByRef.current && !paidByRef.current.contains(e.target as Node)) {
        setPaidByOpen(false)
      }
    }
    if (paidByOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [paidByOpen])

  const selectedParticipant = splitParticipants.find((p) => p.participant_id === paidBy)

  async function handleSave() {
    setError(null)
    const amt = parseFloat(amount)
    if (!description || !amt || !paidBy) {
      setError('Please fill in description, amount, and who paid.')
      return
    }

    let splits
    if (unequal) {
      splits = splitParticipants.map((p) => ({ participantId: p.participant_id, shareAmount: parseFloat(shares[p.participant_id] || '0') }))
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
      <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Add an expense</h2>
            <p className="mt-1 text-sm text-muted-foreground">Split with {splitParticipants.length} people</p>
          </div>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-4">
          <Input placeholder="What was this for?" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Input placeholder="Amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />

          {/* Custom Paid by dropdown matching theme */}
          <div ref={paidByRef} className="relative">
            <button
              type="button"
              onClick={() => setPaidByOpen(!paidByOpen)}
              className="flex w-full items-center justify-between rounded-xl border border-input bg-card/60 px-4 py-3 text-sm transition-colors hover:border-zinc-700"
            >
              <span className="font-medium text-muted-foreground">Paid by</span>
              <div className="flex items-center gap-2">
                {selectedParticipant ? (
                  <div className="flex items-center gap-2">
                    <Avatar className="size-5">
                      <AvatarFallback className="bg-primary/20 text-[9px] font-bold text-primary">
                        {initialsOf(selectedParticipant.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-semibold text-foreground">
                      {selectedParticipant.name}
                    </span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">Select member</span>
                )}
                <ChevronDown className={cn('size-4 text-muted-foreground transition-transform duration-200', paidByOpen && 'rotate-180')} />
              </div>
            </button>

            {paidByOpen && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-zinc-800 bg-[#121215] p-1.5 shadow-2xl backdrop-blur-xl">
                {splitParticipants.map((p) => {
                  const isSelected = p.participant_id === paidBy
                  return (
                    <button
                      key={p.participant_id}
                      type="button"
                      onClick={() => {
                        setPaidBy(p.participant_id)
                        setPaidByOpen(false)
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all',
                        isSelected
                          ? 'border border-primary/30 bg-primary/20 font-semibold text-primary'
                          : 'text-zinc-200 hover:bg-zinc-800/80 hover:text-white'
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar className="size-6 shrink-0">
                          <AvatarFallback className="bg-zinc-800 text-[9px] font-bold text-zinc-300">
                            {initialsOf(p.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate font-semibold">{p.name}</span>
                      </div>
                      {isSelected && <Check className="ml-2 size-4 shrink-0 text-primary" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

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
              {splitParticipants.map((p) => (
                <div key={p.participant_id} className="flex items-center gap-3">
                  <Avatar className="size-7"><AvatarFallback className="text-[10px]">{initialsOf(p.name)}</AvatarFallback></Avatar>
                  <span className="flex-1 text-sm">{p.name}</span>
                  <Input
                    className="w-28"
                    value={shares[p.participant_id] || ''}
                    onChange={(e) => setShares((s) => ({ ...s, [p.participant_id]: e.target.value }))}
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
// ---------------------------------------------------------------------------
// Add Member modal — add member by name or invite by email
// ---------------------------------------------------------------------------
function AddPersonModal({
  groupId,
  onClose,
  onAdded,
}: {
  groupId: number
  onClose: () => void
  onAdded: () => void
}) {
  const [mode, setMode] = useState<'guest' | 'invite'>('guest')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleAdd() {
    setError(null)
    setSuccess(null)
    setLoading(true)
    try {
      if (mode === 'guest') {
        if (!name.trim()) { setError('Enter a name'); setLoading(false); return }
        await addGuest(groupId, name.trim())
        setSuccess(`${name.trim()} added to group`)
        setName('')
      } else {
        if (!email.trim()) { setError('Enter an email'); setLoading(false); return }
        await sendInvite(groupId, email.trim())
        setSuccess(`Invite sent to ${email.trim()}`)
        setEmail('')
      }
      onAdded()
    } catch (err: any) {
      setError(err.message || 'Failed to add member')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold text-foreground">Add member</h2>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="mt-4 flex items-center justify-between rounded-xl bg-muted p-1">
          <button
            onClick={() => { setMode('guest'); setError(null); setSuccess(null) }}
            className={cn('flex-1 rounded-lg py-2 text-sm font-medium transition-all', mode === 'guest' && 'bg-card shadow-sm')}
          >
            <User className="mr-1.5 inline size-3.5" /> By name
          </button>
          <button
            onClick={() => { setMode('invite'); setError(null); setSuccess(null) }}
            className={cn('flex-1 rounded-lg py-2 text-sm font-medium transition-all', mode === 'invite' && 'bg-card shadow-sm')}
          >
            <Mail className="mr-1.5 inline size-3.5" /> By email
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {mode === 'guest' ? (
            <>
              <Input
                placeholder="Member name (e.g. Rahul)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <p className="text-xs text-muted-foreground">
                Add directly by name. They can be included in expense splits immediately.
              </p>
            </>
          ) : (
            <>
              <Input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <p className="text-xs text-muted-foreground">
                They'll receive an email invite. If they already have an account, they'll be added directly.
              </p>
            </>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
          {success && <p className="text-sm text-emerald-500">{success}</p>}

          <Button className="h-11" onClick={handleAdd} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : mode === 'guest' ? 'Add member' : 'Send invite'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// New group modal — supports members by name + email invites
// ---------------------------------------------------------------------------
function NewGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [guests, setGuests] = useState<string[]>([])
  const [inviteEmails, setInviteEmails] = useState<string[]>([])
  const [guestInput, setGuestInput] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [addMode, setAddMode] = useState<'guest' | 'invite'>('guest')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addGuest() {
    const trimmed = guestInput.trim()
    if (!trimmed) return
    const stored = getStoredUser()
    if (stored?.name && trimmed.toLowerCase() === stored.name.toLowerCase()) {
      setError(`"${trimmed}" is already added as the group creator (you).`)
      return
    }
    if (!guests.includes(trimmed)) {
      setGuests((g) => [...g, trimmed])
      setGuestInput('')
      setError(null)
    }
  }

  function addEmail() {
    const trimmed = emailInput.trim().toLowerCase()
    if (trimmed && !inviteEmails.includes(trimmed)) {
      setInviteEmails((e) => [...e, trimmed])
      setEmailInput('')
    }
  }

  async function handleCreate() {
    if (!name) { setError('Group name is required'); return }
    setLoading(true)
    setError(null)
    try {
      const stored = getStoredUser()
      const filteredGuests = stored?.name
        ? guests.filter((g) => g.toLowerCase() !== stored.name.toLowerCase())
        : guests
      await createGroup(name, 'wallet', filteredGuests, inviteEmails)
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
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold text-foreground">New group</h2>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <Input placeholder="Group name (e.g. Goa Trip 2024)" value={name} onChange={(e) => setName(e.target.value)} />

          {/* Add members section */}
          <div className="mt-2">
            <p className="text-sm font-medium text-foreground mb-2">Add members</p>
            <div className="flex items-center justify-between rounded-xl bg-muted p-1 mb-3">
              <button
                onClick={() => setAddMode('guest')}
                className={cn('flex-1 rounded-lg py-2 text-sm font-medium transition-all', addMode === 'guest' && 'bg-card shadow-sm')}
              >
                <User className="mr-1 inline size-3.5" /> By name
              </button>
              <button
                onClick={() => setAddMode('invite')}
                className={cn('flex-1 rounded-lg py-2 text-sm font-medium transition-all', addMode === 'invite' && 'bg-card shadow-sm')}
              >
                <Mail className="mr-1 inline size-3.5" /> By email
              </button>
            </div>

            {addMode === 'guest' ? (
              <div className="flex gap-2">
                <Input
                  placeholder="Member name"
                  value={guestInput}
                  onChange={(e) => setGuestInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addGuest())}
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={addGuest} className="shrink-0">
                  <Plus className="size-4" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="Email address"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEmail())}
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={addEmail} className="shrink-0">
                  <Plus className="size-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Tags showing added people */}
          {(guests.length > 0 || inviteEmails.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {guests.map((g) => (
                <span key={`g-${g}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400">
                  <User className="size-3" /> {g}
                  <button onClick={() => setGuests((gs) => gs.filter((x) => x !== g))} className="ml-0.5 hover:text-red-400">
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              {inviteEmails.map((e) => (
                <span key={`e-${e}`} className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-3 py-1 text-xs font-medium text-blue-400">
                  <Mail className="size-3" /> {e}
                  <button onClick={() => setInviteEmails((es) => es.filter((x) => x !== e))} className="ml-0.5 hover:text-red-400">
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Add members directly by name or invite them by email. You + {guests.length + inviteEmails.length} {guests.length + inviteEmails.length === 1 ? 'member' : 'members'}.
          </p>

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
  const pendingGroupsCount = groups.filter((g) => (groupBalances[g.id] ?? 0) !== 0).length

  const todayFormatted = new Date()
    .toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase()

  return (
    <>
      {/* Header with date, greeting and New group button */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-semibold tracking-wider text-primary">
            {todayFormatted}
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {getGreeting(user.name)}
          </h1>
        </div>
        <Button
          onClick={onNewGroup}
          className="h-10 rounded-lg bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="mr-1.5 size-4" /> New group
        </Button>
      </div>

      {/* Two-card summary layout */}
      <section className="mt-7 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:col-span-2">
          <p className="text-sm font-medium text-muted-foreground">Total balance</p>
          <p
            className={cn(
              'mt-3 text-3xl sm:text-4xl font-bold tracking-tight',
              totalBalance > 0
                ? 'text-emerald-400'
                : totalBalance < 0
                ? 'text-rose-400'
                : 'text-foreground'
            )}
          >
            {totalBalance > 0 ? '+' : totalBalance < 0 ? '-' : ''}₹{Math.abs(Math.round(totalBalance)).toLocaleString('en-IN')}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {totalBalance > 0
              ? `You are owed overall · across ${groups.length} ${groups.length === 1 ? 'group' : 'groups'}`
              : totalBalance < 0
              ? `You owe overall · across ${groups.length} ${groups.length === 1 ? 'group' : 'groups'}`
              : `All settled up · across ${groups.length} ${groups.length === 1 ? 'group' : 'groups'}`}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">To settle</p>
          <p className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            {pendingGroupsCount}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">pending transactions</p>
        </div>
      </section>

      {/* "Your groups" section */}
      <div className="mt-10">
        <h2 className="text-lg font-bold tracking-tight text-foreground">Your groups</h2>

        {loading ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : groups.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border p-10 text-center">
            <p className="font-medium text-foreground">No groups yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first group to start splitting expenses.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {groups.map((group) => {
              const balance = groupBalances[group.id] ?? 0
              const isPositive = balance > 0
              const isNegative = balance < 0
              const iconData = getGroupIconDetails(group)
              const GroupIcon = iconData.Icon

              return (
                <button
                  key={group.id}
                  onClick={() => onOpenGroup(group.id)}
                  className="group flex flex-col justify-between rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-zinc-700"
                >
                  <div>
                    <div className={cn('grid size-10 place-items-center rounded-lg', iconData.bg)}>
                      <GroupIcon className="size-5" />
                    </div>
                    <h3 className="mt-4 text-base font-bold text-foreground">{group.name}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {group.member_count ?? 1} members · {group.expense_count ?? 0} expenses
                    </p>
                  </div>

                  <div className="mt-6 flex justify-end">
                    <p
                      className={cn(
                        'text-base font-bold tracking-tight',
                        isPositive ? 'text-emerald-400' : isNegative ? 'text-rose-400' : 'text-muted-foreground'
                      )}
                    >
                      {isPositive ? '+' : isNegative ? '-' : ''}₹{Math.abs(Math.round(balance)).toLocaleString('en-IN')}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Group detail view — uses participants instead of members
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
  const [participants, setParticipants] = useState<Participant[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [settlements, setSettlements] = useState<SettlementTxn[]>([])
  const [loading, setLoading] = useState(true)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [addPersonOpen, setAddPersonOpen] = useState(false)
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
      setParticipants(detail.participants)
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

  const activeSettlementsCount = settlements.length - paidKeys.length
  const activeParticipants = participants.filter((p) => p.status !== 'invited')

  return (
    <>
      <button onClick={onBack} className="mb-6 flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All groups
      </button>

      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div className="flex items-center gap-4">
          <div className="grid size-14 place-items-center rounded-xl bg-accent text-accent-foreground"><Wallet className="size-6" /></div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{group.name}</h1>
            <div className="mt-2 flex items-center gap-3">
              <PeopleStack members={activeParticipants} size="size-6" />
              <span className="text-sm text-muted-foreground">{activeParticipants.length} members</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAddPersonOpen(true)}>
            <UserPlus className="mr-1 size-4" /> Add member
          </Button>
          <Button variant="outline" onClick={() => setExpenseOpen(true)}><Plus className="mr-1 size-4" /> Expense</Button>
          <Button onClick={() => setTab('settle')} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Receipt className="mr-1 size-4" /> Settle up
          </Button>
        </div>
      </div>

      {tab === 'settle' ? (
        <section className="mt-8">
          <div className="rounded-xl bg-[#e2f3df] p-5 shadow-sm">
            <p className="text-base sm:text-lg font-bold text-[#1b5e20]">
              {activeSettlementsCount} {activeSettlementsCount === 1 ? 'transaction' : 'transactions'} will settle this group
            </p>
            <p className="mt-1 text-sm font-medium text-[#2e7d32]">
              Once everyone pays, all balances are squared up.
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {settlements.map((txn, i) => {
              const key = `${txn.from}-${txn.to}-${i}`
              const isPaid = paidKeys.includes(key)
              return (
                <div
                  key={key}
                  className={cn(
                    'flex items-center justify-between rounded-xl border border-border bg-card p-4 sm:p-5 transition-opacity',
                    isPaid && 'opacity-50'
                  )}
                >
                  <div className="flex items-center gap-3.5">
                    <div className="grid size-10 place-items-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-200">
                      {initialsOf(txn.fromName || 'User')}
                    </div>
                    <p className="text-sm sm:text-base font-semibold text-foreground">
                      {txn.fromName} pays {txn.toName}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <p className="text-base sm:text-lg font-bold text-foreground">
                      ₹{Math.round(txn.amount).toLocaleString('en-IN')}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPaid}
                      onClick={() => handleMarkPaid(txn, key)}
                      className={cn(
                        'rounded-lg border-zinc-700 bg-transparent px-3.5 py-1.5 text-xs sm:text-sm font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white',
                        isPaid && 'border-emerald-800 text-emerald-400 bg-emerald-950/20'
                      )}
                    >
                      {isPaid ? (
                        <>
                          <Check className="mr-1 size-3.5" /> Paid
                        </>
                      ) : (
                        'Mark as paid'
                      )}
                    </Button>
                  </div>
                </div>
              )
            })}

            {settlements.length === 0 && (
              <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
                Everyone is already settled up. 🎉
              </div>
            )}
          </div>

          <button
            onClick={() => setTab('expenses')}
            className="mt-6 text-sm font-medium text-primary hover:underline"
          >
            Back to expenses
          </button>
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
            <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
              {expenses.length === 0 && <p className="p-6 text-sm text-muted-foreground">No expenses yet — add the first one.</p>}
              {expenses.map((expense) => {
                const Icon = CATEGORY_ICONS[expense.category] || Receipt
                return (
                  <div key={expense.id} className="flex items-center gap-4 border-b border-border p-4 last:border-0 sm:p-5">
                    <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground">{expense.description}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {expense.paid_by_name} paid · {new Date(expense.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <p className="font-bold text-foreground">₹{Number(expense.amount).toFixed(0)}</p>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {balances.map((b) => {
                const isYou = b.userId === currentUser.id
                const isPositive = b.balance > 0
                const isNegative = b.balance < 0
                return (
                  <div key={b.participantId} className="flex items-center gap-3.5 rounded-xl border border-border bg-card p-4">
                    <Avatar className="size-10"><AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-semibold">{initialsOf(b.name)}</AvatarFallback></Avatar>
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">{b.name}{isYou && <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>}</p>
                      <p className="text-sm text-muted-foreground">{isPositive ? 'gets back' : isNegative ? 'owes' : 'settled'}</p>
                    </div>
                    <p className={cn('font-bold', isPositive ? 'text-emerald-400' : isNegative ? 'text-rose-400' : 'text-muted-foreground')}>
                      {isPositive ? '+' : isNegative ? '-' : ''}₹{Math.abs(Math.round(b.balance)).toLocaleString('en-IN')}
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
          participants={participants}
          onClose={() => setExpenseOpen(false)}
          onSaved={loadAll}
        />
      )}

      {addPersonOpen && (
        <AddPersonModal
          groupId={groupId}
          onClose={() => setAddPersonOpen(false)}
          onAdded={loadAll}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Notification bell dropdown
// ---------------------------------------------------------------------------
function NotificationBell() {
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  async function load() {
    try {
      const data = await fetchNotifications()
      setInvites(data.invites)
    } catch {
      // Ignore errors — non-critical
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000) // poll every 30s
    return () => clearInterval(interval)
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleAccept(token: string) {
    setLoading(true)
    try {
      await acceptInvite(token)
      setInvites((inv) => inv.filter((i) => i.token !== token))
      // Force page reload to refresh groups
      window.location.reload()
    } catch {
      // Ignore
    } finally {
      setLoading(false)
    }
  }

  async function handleDecline(token: string) {
    setLoading(true)
    try {
      await declineInvite(token)
      setInvites((inv) => inv.filter((i) => i.token !== token))
    } catch {
      // Ignore
    } finally {
      setLoading(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        aria-label="Notifications"
        onClick={() => setOpen(!open)}
        className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted"
      >
        <Bell className="size-4" />
        {invites.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {invites.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 rounded-xl border border-border bg-card p-3 shadow-xl">
          {invites.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No pending invitations</p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pending invitations
              </p>
              {invites.map((inv) => (
                <div key={inv.id} className="rounded-lg border border-border bg-background p-3">
                  <p className="text-sm font-semibold text-foreground">{inv.group_name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Invited by {inv.inviter_name || 'someone'}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 flex-1 text-xs"
                      onClick={() => handleAccept(inv.token)}
                      disabled={loading}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 flex-1 text-xs"
                      onClick={() => handleDecline(inv.token)}
                      disabled={loading}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------
export function KharchaApp() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [oauthError, setOauthError] = useState<string | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [groups, setGroups] = useState<Group[]>([])
  const [groupBalances, setGroupBalances] = useState<Record<number, number>>({})
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null)
  const [newGroupOpen, setNewGroupOpen] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const token = params.get('token')
      const userId = params.get('userId')
      const name = params.get('name')
      const email = params.get('email')
      const err = params.get('error')

      if (token && userId) {
        const authedUser: AuthUser = {
          id: Number(userId),
          name: name ? decodeURIComponent(name) : 'Google User',
          email: email ? decodeURIComponent(email) : '',
        }
        setSession(token, authedUser)
        setUser(authedUser)
        window.history.replaceState({}, document.title, window.location.pathname)
      } else if (err) {
        setOauthError(decodeURIComponent(err))
        window.history.replaceState({}, document.title, window.location.pathname)
      } else {
        const stored = getStoredUser()
        const storedToken = getToken()
        if (stored && storedToken) setUser(stored)
      }
    }
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
          // Find balance for current user by matching userId on participants
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
    if (typeof window !== 'undefined') {
      try {
        ;(window as any).google?.accounts?.id?.disableAutoSelect?.()
      } catch (e) {
        // Ignore if GIS not loaded
      }
    }
    clearSession()
    setUser(null)
    setGroups([])
    setActiveGroupId(null)
  }

  if (checkingSession) {
    return <div className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
  }

  if (!user) {
    return <AuthScreen onAuthed={setUser} initialError={oauthError} />
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <button onClick={() => setActiveGroupId(null)} className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Wallet className="size-4" /></div>
            <span className="font-bold tracking-tight text-foreground">kharcha<span className="text-emerald-500">.</span></span>
          </button>
          <div className="flex items-center gap-2">
            <NotificationBell />
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
