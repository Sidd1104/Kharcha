import type { Metadata } from 'next'
import Link from 'next/link'
import { Wallet, ShieldCheck, Lock, ArrowLeft, Database, KeyRound, Server, UserCheck, EyeOff, CheckCircle2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Privacy Policy — Kharcha',
  description: 'How Kharcha collects, uses, and protects your data, including Google Sign-In authentication details.',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Wallet className="size-4" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">
              kharcha<span className="text-emerald-500">.</span>
            </span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            <span>Back to App</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-5xl px-5 py-12 lg:px-8 lg:py-16">
        {/* Hero Section */}
        <div className="border-b border-border pb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="size-3.5" />
            <span>Data Transparency & Privacy</span>
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Effective Date: September 8, 2026 &bull; Last Updated: September 8, 2026
          </p>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground max-w-3xl">
            Kharcha is built with privacy, simplicity, and transparency at its core. This policy provides a clear, accurate, and complete explanation of what data we collect, how it is used, how Google Sign-In operates, and the safeguards in place to protect your information.
          </p>
        </div>

        {/* Policy Body */}
        <div className="mt-10 space-y-12">
          {/* Section 1 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                <UserCheck className="size-4" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                1. Information We Collect
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              We collect only the minimum information necessary to provide shared group expense tracking and settlement calculations:
            </p>

            <div className="grid gap-4 sm:grid-cols-2 mt-3">
              <div className="rounded-xl border border-border bg-card/60 p-5 space-y-2.5">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Lock className="size-4 text-primary" />
                  Direct Account Registration
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  If you sign up directly with an email and password, we collect your name, email address, and password. Your password is immediately hashed with <strong>bcrypt (10 salt rounds)</strong> before storage; we never see or store plain-text passwords.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card/60 p-5 space-y-2.5">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <KeyRound className="size-4 text-primary" />
                  Group & Expense Data
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  When creating or participating in groups, we store group names, group icons, participant names (including unlinked guest names added by group creators), 6-digit numeric join keys, expense descriptions, amounts, categories, and split allocations.
                </p>
              </div>
            </div>
          </section>

          {/* Section 2 — Google Sign-In Deep Dive */}
          <section className="space-y-4 rounded-2xl border border-primary/20 bg-primary/[0.03] p-6 sm:p-8">
            <div className="flex items-center gap-2.5">
              <div className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
                <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                2. Google Sign-In (OAuth 2.0) Data Handling
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              When you choose to authenticate via <strong>Continue with Google</strong>, Kharcha uses official Google OAuth 2.0 protocols to verify your identity. Here is precisely how Google data is handled:
            </p>

            <div className="space-y-3 text-xs leading-relaxed text-muted-foreground mt-4">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-foreground">OAuth Scope Requested:</strong> We request only the standard <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">openid email profile</code> scope.
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-foreground">Information Received:</strong> From Google's userinfo endpoint, we receive only your <strong>verified email address</strong> and your <strong>public display name</strong>.
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-foreground">Account Provisioning:</strong> We match your Google email to an existing Kharcha account or automatically create an account record with a cryptographically randomized password hash.
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-foreground">No Google Tokens Stored:</strong> Kharcha does <em>not</em> store Google access tokens or Google refresh tokens in its database. Following authentication, Kharcha issues its own secure 7-day application JWT.
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-foreground">No Access to Private Google Data:</strong> We never request, read, or have access to your Google contacts, Google Drive files, Gmail messages, calendar events, payment methods, or search history.
                </div>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                <EyeOff className="size-4" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                3. How We Use Your Information
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Your information is strictly used to deliver core application functionality:
            </p>
            <ul className="list-disc pl-5 text-xs leading-relaxed text-muted-foreground space-y-2">
              <li>Authenticating your session and verifying group membership permissions.</li>
              <li>Calculating equal and custom expense splits, running net debt balances, and optimal settlement transactions.</li>
              <li>Broadcasting live real-time group updates (e.g., newly added expenses or member changes) over authenticated WebSockets to members of that specific group.</li>
              <li>Displaying member provenance badges (e.g., &ldquo;Host&rdquo;, &ldquo;Joined by key&rdquo;, &ldquo;Member&rdquo;) to group participants.</li>
            </ul>
            <div className="rounded-xl border border-border bg-card/60 p-4 text-xs text-muted-foreground">
              <strong className="text-foreground">We never monetize your data:</strong> Kharcha does not sell, rent, license, or monetize your personal data. We do not engage in behavioral advertising, ad retargeting, or data broker sales.
            </div>
          </section>

          {/* Section 4 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                <Database className="size-4" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                4. Data Storage & Infrastructure Providers
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Kharcha is hosted on production-grade cloud infrastructure providers that adhere to high industry security standards:
            </p>

            <div className="grid gap-3 sm:grid-cols-3 mt-3">
              <div className="rounded-xl border border-border bg-card/60 p-4 space-y-1.5">
                <div className="text-xs font-bold text-foreground">Neon (PostgreSQL)</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Stores user records, group participants, expenses, and settlements in an isolated, encrypted managed PostgreSQL database.
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card/60 p-4 space-y-1.5">
                <div className="text-xs font-bold text-foreground">Render</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Hosts the Node.js Express REST API and persistent Socket.IO WebSocket server behind secure TLS encryption.
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card/60 p-4 space-y-1.5">
                <div className="text-xs font-bold text-foreground">Vercel</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Delivers the Next.js frontend application via edge caching and privacy-first Vercel Web Analytics without tracking personal data.
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card/40 p-4 text-xs text-muted-foreground">
              <strong className="text-foreground">Cookies & Local Storage:</strong> Kharcha does not set advertising or third-party tracking cookies. Your browser saves your session authentication token (<code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">kharcha_token</code>) and cached user identity (<code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">kharcha_user</code>) in client-side <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">localStorage</code> for session continuity.
            </div>
          </section>

          {/* Section 5 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                <Server className="size-4" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                5. Security Safeguards
              </h2>
            </div>
            <ul className="list-disc pl-5 text-xs leading-relaxed text-muted-foreground space-y-2">
              <li><strong>Transport Encryption:</strong> All client-to-backend and backend-to-database communications run over encrypted HTTPS and TLS.</li>
              <li><strong>CSRF Protection for OAuth:</strong> OAuth state tokens are generated with random entropy and signed with an HMAC-SHA256 signature valid for exactly 10 minutes, preventing cross-site request forgery.</li>
              <li><strong>Join PIN Confidentiality:</strong> Group 6-digit Join Keys are restricted on the server and redacted from API responses for regular group members; only the group creator can view or regenerate group join keys.</li>
              <li><strong>Strict Access Authorization:</strong> Backend middleware enforces group membership checks on all expense, settlement, and participant modification endpoints.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                <ShieldCheck className="size-4" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                6. Your Rights & Data Deletion
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              You maintain full control over your data in Kharcha:
            </p>
            <ul className="list-disc pl-5 text-xs leading-relaxed text-muted-foreground space-y-2">
              <li>You can leave groups or be removed by group hosts at any time (with custom splits proportionally reallocated to ensure fair accounting).</li>
              <li>Group hosts can merge unlinked guest placeholders into confirmed member accounts or delete expenses.</li>
              <li>You can request complete deletion of your account and associated records by emailing us directly. Account deletion permanently purges user profile credentials from our database.</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="space-y-4 border-t border-border pt-8">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              7. Contact Us
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              If you have any questions, concerns, or requests regarding this Privacy Policy or Kharcha&apos;s data practices, please contact:
            </p>
            <div className="rounded-xl border border-border bg-card/60 p-5 text-xs text-muted-foreground space-y-1">
              <div className="font-semibold text-foreground">Siddhant Mohan Jha (Kharcha Maintainer)</div>
              <div>Email: <a href="mailto:siddmj07@gmail.com" className="text-primary hover:underline">siddmj07@gmail.com</a></div>
              <div>Project Repository: <a href="https://github.com/Sidd1104/Kharcha" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">github.com/Sidd1104/Kharcha</a></div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="grid size-5 place-items-center rounded bg-primary text-primary-foreground">
              <Wallet className="size-3" />
            </div>
            <span className="font-semibold text-foreground">kharcha<span className="text-emerald-500">.</span></span>
            <span className="text-muted-foreground/60">&mdash; Split expenses. Settle instantly.</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="text-foreground font-medium">Privacy Policy</Link>
            <span>&bull;</span>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
