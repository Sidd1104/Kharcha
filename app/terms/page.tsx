import type { Metadata } from 'next'
import Link from 'next/link'
import { Wallet, Scale, ArrowLeft, ShieldAlert, AlertTriangle, FileCheck, HelpCircle } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Terms of Service — Kharcha',
  description: 'Terms and conditions governing the use of the Kharcha expense splitting and settlement platform.',
}

export default function TermsPage() {
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
            <Scale className="size-3.5" />
            <span>Terms &amp; User Agreement</span>
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
            Terms of Service
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Effective Date: September 8, 2026 &bull; Last Updated: September 8, 2026
          </p>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground max-w-3xl">
            These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Kharcha (&ldquo;the Service&rdquo;). By accessing, registering for, or using Kharcha, you agree to comply with and be bound by these Terms. If you do not agree to these Terms, please do not use the application.
          </p>
        </div>

        {/* Terms Body */}
        <div className="mt-10 space-y-12">
          {/* Section 1 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                <FileCheck className="size-4" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                1. Description of the Service
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Kharcha is a shared expense tracking and balance calculation web application designed to help friends, roommates, travel groups, and families track group expenditures, calculate equal and custom splits, and view simplified debt settlement balances.
            </p>

            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-6 space-y-3">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                <AlertTriangle className="size-4.5 shrink-0" />
                <span>Important Financial Disclaimer</span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Kharcha is <strong>NOT</strong> a bank, financial institution, money transmitter, or payment processor. Kharcha does <strong>NOT</strong> hold funds, manage accounts, process bank transfers, or transmit actual money. Kharcha functions solely as a mathematical calculation and record-keeping tool. Any financial reimbursements or settlements recorded in Kharcha must be executed independently between users via their own preferred payment methods (such as cash, UPI, or third-party bank transfers).
              </p>
            </div>
          </section>

          {/* Section 2 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                <ShieldAlert className="size-4" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                2. User Accounts &amp; Authentication
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              You may create an account using email and password or by logging in through Google Sign-In. By creating an account, you agree to:
            </p>
            <ul className="list-disc pl-5 text-xs leading-relaxed text-muted-foreground space-y-2">
              <li>Provide accurate, truthful, and up-to-date information.</li>
              <li>Maintain the security and confidentiality of your credentials and authentication tokens.</li>
              <li>Notify us promptly if you discover or suspect unauthorized access to your account.</li>
              <li>Assume full responsibility for all activities that occur under your account.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                <Scale className="size-4" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                3. Acceptable Use &amp; Community Rules
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              When using Kharcha, you agree that you will not:
            </p>
            <ul className="list-disc pl-5 text-xs leading-relaxed text-muted-foreground space-y-2">
              <li>Use the Service for any unlawful, abusive, defamatory, harassing, or fraudulent purposes.</li>
              <li>Submit fabricated or malicious expense records intended to deceive group members.</li>
              <li>Distribute group 6-digit Join Codes to unauthorized third parties without group creator consent.</li>
              <li>Attempt to bypass, probe, scan, or breach authentication mechanisms, rate limits, or authorization middlewares.</li>
              <li>Use automated bots, scrapers, or scripts to overload our servers or harvest application data.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                <FileCheck className="size-4" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                4. Intellectual Property
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              The Kharcha application, branding, logos, user interface design, domain names, and source code are the intellectual property of Siddhant Mohan Jha and project contributors. You may not copy, replicate, redistribute, or reverse engineer any part of Kharcha without prior written authorization.
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              You retain all ownership rights to the raw data (group titles, expense descriptions, amounts) you input into the Service. By submitting data, you grant Kharcha a non-exclusive license strictly to process, store, and display that content to authorized group members as required to operate the Service.
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                <AlertTriangle className="size-4" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                5. Disclaimer of Warranties
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              THE SERVICE IS PROVIDED ON AN <strong>&ldquo;AS IS&rdquo;</strong> AND <strong>&ldquo;AS AVAILABLE&rdquo;</strong> BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, OR NON-INFRINGEMENT.
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              While we strive to ensure optimal availability, data consistency, and reliable split computations, we make no guarantees that Kharcha will be uninterrupted, error-free, completely secure, or free from server downtime.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                <Scale className="size-4" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                6. Limitation of Liability
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL KHARCHA, ITS CREATORS, MAINTAINERS, OR HOSTING INFRASTRUCTURE PROVIDERS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR IN CONNECTION WITH:
            </p>
            <ul className="list-disc pl-5 text-xs leading-relaxed text-muted-foreground space-y-1.5">
              <li>Your use of, or inability to use, the Service.</li>
              <li>Any financial disputes or misunderstandings occurring between users regarding debts, settlements, or payments.</li>
              <li>Errors or inaccuracies in user-submitted expense amounts, categories, or participant assignments.</li>
              <li>Unauthorized access, data loss, or server interruptions outside of our reasonable control.</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                <HelpCircle className="size-4" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                7. Termination &amp; Suspension
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              You are free to stop using Kharcha at any time. We reserve the right, in our sole discretion, to suspend, terminate, or restrict your access to the Service at any time, with or without notice, if you breach these Terms, engage in abusive behavior, or if necessary to protect the security and integrity of the platform.
            </p>
          </section>

          {/* Section 8 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                <FileCheck className="size-4" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                8. Modifications to Terms
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              We may revise these Terms of Service periodically to reflect changes in legal standards or product features. When changes are made, the &ldquo;Last Updated&rdquo; date at the top will be updated. Your continued use of Kharcha following the posting of revised Terms constitutes your acceptance of the updated terms.
            </p>
          </section>

          {/* Section 9 */}
          <section className="space-y-4 border-t border-border pt-8">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              9. Contact Information
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              For any questions, legal notices, or feedback concerning these Terms of Service, please reach out to:
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
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <span>&bull;</span>
            <Link href="/terms" className="text-foreground font-medium">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
