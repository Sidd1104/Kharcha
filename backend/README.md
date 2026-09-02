# Kharcha Backend

Express + PostgreSQL backend for the Kharcha group-expense-settlement app.

## Setup

1. `cd backend`
2. `npm install`
3. Copy `.env.example` to `.env` and fill in your `DATABASE_URL` (get a free
   Postgres instance from [neon.tech](https://neon.tech) if you don't have one)
   and a random `JWT_SECRET`.
4. Create the tables: `npm run migrate`
5. Start the server: `npm run dev` (or `npm start`)
6. Test the settlement algorithm in isolation: `npm test`

The API will run on `http://localhost:4000` by default.

## API Overview

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | No | Create an account |
| POST | `/auth/login` | No | Log in, get a JWT |
| GET | `/groups` | Yes | List your groups |
| POST | `/groups` | Yes | Create a group |
| GET | `/groups/:id` | Yes | Group detail + members |
| POST | `/groups/:id/members` | Yes | Add a member by email |
| GET | `/groups/:id/expenses` | Yes | List expenses |
| POST | `/groups/:id/expenses` | Yes | Add an expense (equal or custom split) |
| GET | `/groups/:id/balances` | Yes | Net balance per member |
| GET | `/groups/:id/settlements` | Yes | Minimal transaction list to settle up |
| POST | `/groups/:id/settlements/confirm` | Yes | Mark a settlement as paid |

All authenticated routes expect `Authorization: Bearer <token>`.

## The Algorithm

`src/utils/settlement.js` contains the core debt-simplification logic,
kept deliberately separate from the database/API code so it's easy to
test and to explain on its own — this is the part worth walking an
interviewer through. Run `npm test` to see it verified against a few
scenarios.
