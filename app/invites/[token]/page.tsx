'use client'

import { Wallet, KeyRound, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function InvitePage() {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-lg">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <KeyRound className="size-7" />
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-foreground">
          Join via 6-Digit Code
        </h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          Email invite links have been upgraded! Kharcha now uses instant 6-digit Join Codes to join groups without waiting for emails.
        </p>
        <div className="mt-6 rounded-lg bg-muted/60 p-4 text-xs text-muted-foreground">
          Ask your group creator for their 6-digit join key and click <strong>Join Group</strong> on your dashboard.
        </div>
        <Button className="mt-6 w-full h-11" onClick={() => (window.location.href = '/')}>
          Go to Dashboard <ArrowRight className="ml-2 size-4" />
        </Button>
      </div>
    </div>
  )
}
