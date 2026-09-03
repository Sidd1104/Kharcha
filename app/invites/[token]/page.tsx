'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, Wallet, Check, LogIn, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AuthUser, InviteInfo,
  acceptInvite, getInviteInfo, getStoredUser, getToken,
  loginUser, registerUser, setSession,
} from '@/lib/api'

export default function InvitePage() {
  const params = useParams()
  const token = params.token as string

  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)

  // Auth form state (shown when user is not logged in)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    // Check existing session
    const stored = getStoredUser()
    const storedToken = getToken()
    if (stored && storedToken) setUser(stored)

    // Fetch invite info
    async function load() {
      try {
        const info = await getInviteInfo(token)
        setInvite(info)
      } catch (err: any) {
        setError(err.message || 'Invalid or expired invite link')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setAuthError(null)
    setAuthLoading(true)
    try {
      const { token: authToken, user: authedUser } =
        authMode === 'register'
          ? await registerUser(name, email, password)
          : await loginUser(email, password)
      setSession(authToken, authedUser)
      setUser(authedUser)
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed')
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleAccept() {
    setAccepting(true)
    try {
      await acceptInvite(token)
      setAccepted(true)
    } catch (err: any) {
      setError(err.message || 'Failed to accept invite')
    } finally {
      setAccepting(false)
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && !invite) {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-lg">
          <X className="mx-auto size-12 text-red-400" />
          <h1 className="mt-4 text-xl font-bold text-foreground">Invalid Invite</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-6" onClick={() => window.location.href = '/'}>
            Go to Kharcha
          </Button>
        </div>
      </div>
    )
  }

  if (!invite) return null

  if (invite.status !== 'pending') {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-lg">
          <Check className="mx-auto size-12 text-emerald-400" />
          <h1 className="mt-4 text-xl font-bold text-foreground">
            Invite Already {invite.status === 'accepted' ? 'Accepted' : 'Declined'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This invite has already been {invite.status}.
          </p>
          <Button className="mt-6" onClick={() => window.location.href = '/'}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  if (accepted) {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-lg">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-500/15">
            <Check className="size-8 text-emerald-400" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-foreground">You're in!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You've joined <strong>{invite.groupName}</strong>. It will now appear in your dashboard.
          </p>
          <Button className="mt-6 w-full" onClick={() => window.location.href = '/'}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-lg">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="size-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground">
            kharcha<span className="text-emerald-500">.</span>
          </span>
        </div>

        {/* Invite info */}
        <div className="mt-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            You're invited to join
          </h1>
          <p className="mt-2 text-lg font-semibold text-primary">{invite.groupName}</p>
          {invite.inviterName && (
            <p className="mt-1 text-sm text-muted-foreground">
              Invited by <strong>{invite.inviterName}</strong>
            </p>
          )}
        </div>

        {user ? (
          /* Logged in — show accept button */
          <div className="mt-8">
            <p className="text-sm text-muted-foreground">
              Logged in as <strong>{user.name}</strong> ({user.email})
            </p>
            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
            <Button className="mt-4 h-11 w-full" onClick={handleAccept} disabled={accepting}>
              {accepting ? <Loader2 className="size-4 animate-spin" /> : <>
                <Check className="mr-1.5 size-4" /> Accept Invite
              </>}
            </Button>
          </div>
        ) : (
          /* Not logged in — show auth form */
          <div className="mt-8">
            <p className="text-sm text-muted-foreground mb-4">
              Log in or create an account to accept this invite.
            </p>

            <div className="flex items-center justify-between rounded-xl bg-muted p-1 mb-4">
              <button
                onClick={() => { setAuthMode('login'); setAuthError(null) }}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${authMode === 'login' ? 'bg-card shadow-sm' : ''}`}
              >
                Log in
              </button>
              <button
                onClick={() => { setAuthMode('register'); setAuthError(null) }}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${authMode === 'register' ? 'bg-card shadow-sm' : ''}`}
              >
                Register
              </button>
            </div>

            <form onSubmit={handleAuth} className="flex flex-col gap-3">
              {authMode === 'register' && (
                <Input
                  placeholder="Full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              )}
              <Input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />

              {authError && <p className="text-sm text-red-500">{authError}</p>}

              <Button type="submit" className="h-11 w-full" disabled={authLoading}>
                {authLoading ? <Loader2 className="size-4 animate-spin" /> : (
                  <><LogIn className="mr-1.5 size-4" /> {authMode === 'login' ? 'Log in & Accept' : 'Register & Accept'}</>
                )}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
