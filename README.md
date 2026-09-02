# Kharcha — Smart Group Expense Settlement App

A full-stack web app for splitting group expenses (hostel/PG/trip groups) that
computes the **minimum number of transactions** needed to settle everyone up,
instead of everyone paying everyone individually.

## Structure

```
/                → Next.js frontend (from v0, now wired to a real API)
  app/           → Next.js app router entry
  components/    → UI components, including kharcha-app.tsx (main app logic)
  lib/api.ts     → API client (auth, groups, expenses, settlements)
/backend         → Express + PostgreSQL backend
  src/routes/    → auth, groups, expenses, settlements
  src/utils/     → the core settlement algorithm + its unit tests
  migrations/    → SQL schema
```

## What's real vs. what was static

The original v0-generated UI used hardcoded arrays for people, groups, and
expenses. That's now been replaced end-to-end:

- **Auth** — real register/login against the backend, JWT stored client-side
- **Groups** — created, listed, and fetched from PostgreSQL
- **Expenses** — added via a real form, split equally or with custom amounts
- **Balances & settlements** — computed live from real expense data using
  the greedy debt-simplification algorithm in `backend/src/utils/settlement.js`

## Running it locally

**1. Backend**
```
cd backend
npm install
cp .env.example .env   # fill in DATABASE_URL (e.g. from neon.tech) and JWT_SECRET
npm run migrate        # creates the tables
npm run dev            # runs on http://localhost:4000
```

**2. Frontend**
```
npm install
cp .env.local.example .env.local   # points to the backend above
npm run dev                        # runs on http://localhost:3000
```

Register an account, create a group, add a couple more test accounts as
members (they need to sign up first), add some expenses, then hit "Settle up"
to see the minimal transaction list computed live.

## Next steps (for Antigravity)

This is functionally complete but rough around a few edges — good next tasks
to hand to Antigravity:
1. Add proper form validation and toast notifications instead of inline error text
2. Add a "delete expense" / "edit expense" flow
3. Add pagination for expense lists in large groups
4. Replace the email-based "add member" flow with invite links
5. Add integration tests for the API routes (the settlement algorithm already
   has unit tests in `backend/src/utils/settlement.test.js`)
6. Deploy: backend → Render/Railway, frontend → Vercel, and update
   `NEXT_PUBLIC_API_URL` / `FRONTEND_URL` to the live URLs
