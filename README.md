# 💰 Kharcha (खर्चा) — Smart Group Expense Settlement Platform

[![Next.js 16](https://img.shields.io/badge/Next.js-16.3.3-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.0-61dafb?style=flat-square&logo=react)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.19-000000?style=flat-square&logo=express)](https://expressjs.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?style=flat-square&logo=socket.io)](https://socket.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-4169E1?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL--Mode-003B57?style=flat-square&logo=sqlite)](https://sqlite.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)

> **Kharcha** is a production-grade, full-stack expense sharing and debt-simplification platform designed for roommates, hostelers, trips, and shared living. It eliminates circular and pairwise debt using a greedy minimum-cash-flow algorithm, collapsing dozens of messy cross-payments into the absolute minimum number of settlement transactions.

---

## 📑 Table of Contents

- [Overview](#-overview)
- [System Architecture](#-system-architecture)
- [Key Features](#-key-features)
- [The Settlement Algorithm](#-the-settlement-algorithm)
- [Tech Stack](#-tech-stack)
- [Project Directory Structure](#-project-directory-structure)
- [Getting Started (Local Development)](#-getting-started-local-development)
  - [Prerequisites](#prerequisites)
  - [Option A: Quick Start with SQLite (Zero Configuration)](#option-a-quick-start-with-sqlite-zero-configuration)
  - [Option B: Setup with PostgreSQL (Production / Cloud)](#option-b-setup-with-postgresql-production--cloud)
- [Configuration & Environment Variables](#-configuration--environment-variables)
- [Database Schema & Migrations](#-database-schema--migrations)
- [API Reference](#-api-reference)
- [Real-Time WebSocket Events](#-real-time-websocket-events)
- [Production Deployment Guide](#-production-deployment-guide)
  - [Deploy Backend (Render / Railway / Fly.io)](#1-deploy-backend-render--railway--flyio)
  - [Deploy Database (Neon / Supabase)](#2-deploy-database-neon--supabase)
  - [Deploy Frontend (Vercel)](#3-deploy-frontend-vercel)
  - [Production Readiness Checklist](#production-readiness-checklist)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [Security & Hardening](#-security--hardening)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🌟 Overview

When living with roommates or traveling in groups, tracking shared expenses quickly turns into a logistical nightmare:
- **Person A** pays for dinner (splitting with B and C).
- **Person B** buys groceries (splitting with A, C, and D).
- **Person C** pays for cab rides and utilities.

In traditional bookkeeping, everyone attempts to settle pairwise, leading to dozens of redundant transfers, confusion, and awkward balance conversations.

**Kharcha solves this fundamentally:**
1. **Mathematical Minimization:** It aggregates all split liabilities into a single net balance per participant (either positive creditor or negative debtor) and runs an optimal greedy matching algorithm to compute the minimal set of direct transfers.
2. **Frictionless Onboarding:** Members can create groups, generate instant 6-digit join codes, and add friends as placeholder "guest" participants before they even register.
3. **Seamless Identity Claiming:** When a guest friend signs up and enters the group's join code, Kharcha identifies their guest profile and merges their accumulated debts, history, and splits seamlessly without data loss.
4. **Real-time Collaboration:** Powered by Socket.IO, expenses, join events, code regenerations, and settlements reflect instantly on all active screens without manual refreshes.
5. **Dual Database Engine:** Runs locally out-of-the-box on a lightweight SQLite engine with WAL mode (zero setup!), and switches transparently to PostgreSQL in staging and production.

---

## 🏛 System Architecture

```mermaid
graph TD
    subgraph "Client Layer (Next.js 16 + React 19)"
        UI["Kharcha Responsive UI<br/>(Tailwind CSS v4 + Lucide)"]
        APIClient["API Client<br/>(lib/api.ts)"]
        SocketClient["Socket.IO Client<br/>(Real-time State Hook)"]
    end

    subgraph "Application Layer (Node.js + Express 4)"
        Server["Express HTTP & WS Server<br/>(Port 4000)"]
        AuthMiddleware["Auth & Rate-Limit Middleware<br/>(JWT + express-rate-limit)"]
        
        subgraph "Modular Route Handlers"
            AuthRoute["/auth (Register, Login, Google OAuth)"]
            GroupRoute["/groups (CRUD, Join Codes, Merging)"]
            ExpenseRoute["/groups/:id/expenses (Equal/Custom Splits)"]
            SettlementRoute["/groups/:id/settlements (Min-Cash Algorithm)"]
        end
        
        SocketServer["Socket.IO Manager<br/>(Group Rooms & Real-time Broadcasts)"]
    end

    subgraph "Data & Persistence Layer"
        DBAbstraction["db.js Abstraction Layer<br/>(Automatic Dialect & Parameter Translation)"]
        SQLiteDB[("Local SQLite<br/>kharcha.db (WAL Mode)")]
        PostgresDB[("PostgreSQL 15+<br/>Neon / Supabase / AWS RDS")]
    end

    UI --> APIClient
    UI --> SocketClient
    APIClient -->|REST Requests + Bearer JWT| Server
    SocketClient <-->|WebSocket Bidirectional Sync| SocketServer
    Server --> AuthMiddleware
    AuthMiddleware --> AuthRoute
    AuthMiddleware --> GroupRoute
    AuthMiddleware --> ExpenseRoute
    AuthMiddleware --> SettlementRoute
    GroupRoute --> SocketServer
    ExpenseRoute --> SocketServer
    SettlementRoute --> SocketServer
    AuthRoute --> DBAbstraction
    GroupRoute --> DBAbstraction
    ExpenseRoute --> DBAbstraction
    SettlementRoute --> DBAbstraction
    DBAbstraction -->|Dev Default| SQLiteDB
    DBAbstraction -->|Production DATABASE_URL| PostgresDB
```

---

## 🚀 Key Features

| Feature | Description |
|---|---|
| **⚡ Minimal Debt Settlement** | Greedy algorithm calculates the absolute fewest transactions needed to balance the entire group to $0.00. |
| **🔑 6-Digit Join Codes** | Join groups instantly with a secure 6-digit code. Room creators can regenerate join codes at any time to invalidate old links. |
| **👥 Guest Mode & Merge Flow** | Add unregistered friends as guests. When they sign up, Kharcha's claim flow merges their guest expenses into their verified account. |
| **💸 Equal & Custom Splits** | Split expenses evenly among all or selected members, or specify custom exact amounts down to 2 decimal places. |
| **🔄 Live WebSocket Sync** | Group members see real-time updates for added expenses, new participants, code resets, and completed payments. |
| **✅ 1-Click "Settle All" & Single Settlement** | Confirm individual debt payments or clear all remaining transactions in one tap when a trip or month concludes. |
| **🛡️ Enterprise Security** | Scoped JWTs, bcrypt salted passwords, timing-safe HMAC OAuth state tokens, room authorization checks, and rate-limited endpoints. |
| **📦 Zero-Config Local Dev** | Seamless fallback to SQLite (`better-sqlite3`) with WAL journal mode when no PostgreSQL connection string is provided. |

---

## 🧮 The Settlement Algorithm

Kharcha replaces clumsy pairwise transfers with an optimal debt-simplification model located in [`backend/src/utils/settlement.js`](file:///c:/Users/asus/OneDrive/Desktop/PROJECTS/KHARCHA/backend/src/utils/settlement.js).

### How It Works
1. **Net Balance Calculation:**
   For every participant $i$, net balance $B_i$ is calculated as:
   $$B_i = \sum (\text{Paid by } i) - \sum (\text{Owed by } i)$$
   - If $B_i > 0$, the participant is a **Creditor** (owed money).
   - If $B_i < 0$, the participant is a **Debtor** (owes money).
   - Balances where $|B_i| < \epsilon$ ($\epsilon = 0.01$) are considered settled to prevent floating-point micro-cents.

2. **Greedy Matching:**
   - Sort participants by balance: largest debtor at index $0$ and largest creditor at index $M-1$.
   - The transaction amount is:
     $$\text{Amount} = \min(|B_{\text{debtor}}|, B_{\text{creditor}})$$
   - Record transfer: `Debtor -> Creditor: Amount`.
   - Adjust both balances and remove whichever party has reached zero.
   - Repeat until all balances reach zero.

### Complexity & Efficiency Comparison

| Approach | Max Transactions (N people) | Transactions for 5 People | Algorithmic Complexity |
|---|---|---|---|
| **Naive Pairwise Settlement** | $\frac{N(N - 1)}{2}$ | Up to **10 transactions** | $O(N^2)$ transfers |
| **Kharcha Greedy Algorithm** | At most $N - 1$ | At most **4 transactions** | $O(N \log N)$ time, $O(N)$ space |

#### Example Walkthrough:
Suppose 4 friends on a weekend trip:
- **Alice** paid \$1,200 (Net: +$600)
- **Bob** paid \$600 (Net: +$150)
- **Charlie** paid \$0 (Net: -$450)
- **David** paid \$0 (Net: -$300)

**Naive settlement** would require Charlie and David to make multiple fragmented payments to both Alice and Bob.  
**Kharcha settles it in just 3 transactions:**
1. **Charlie** pays **Alice**: \$450
2. **David** pays **Alice**: \$150 *(Alice is now fully settled at +$600)*
3. **David** pays **Bob**: \$150 *(Everyone is now settled at \$0.00)*

---

## 🛠 Tech Stack

### Frontend
- **Framework:** [Next.js 16 (App Router)](https://nextjs.org/)
- **Library:** [React 19](https://react.dev/)
- **Language:** [TypeScript 5.7](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/) with CSS variables
- **Component Primitives:** [Base UI / Radix UI](https://base-ui.com/) & [Lucide Icons](https://lucide.dev/)
- **Real-Time Client:** [Socket.IO Client](https://socket.io/docs/v4/client-api/)

### Backend
- **Runtime:** [Node.js (>= 18.0.0)](https://nodejs.org/)
- **Framework:** [Express 4.19](https://expressjs.com/)
- **WebSockets:** [Socket.IO 4.8](https://socket.io/)
- **Authentication:** [JSON Web Token (jsonwebtoken)](https://github.com/auth0/node-jsonwebtoken) + [bcryptjs](https://github.com/dcodeIO/bcrypt.js)
- **Rate Limiting:** [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit)
- **OAuth:** Google Cloud OAuth 2.0 with cryptographic state validation

### Database & Persistence
- **Production Database:** [PostgreSQL 15+](https://www.postgresql.org/) via [`pg`](https://node-postgres.com/) connection pooling (compatible with Neon, Supabase, Railway, AWS RDS)
- **Local/Development Database:** [SQLite 3](https://sqlite.org/) via [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) with Write-Ahead Logging (WAL)
- **Query Layer:** Unified SQL abstraction supporting PostgreSQL parameter syntax (`$1, $2`) and native SQLite bindings with auto-migrations.

---

## 📂 Project Directory Structure

```text
KHARCHA/
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # Root application layout & metadata
│   ├── page.tsx                      # Main entrypoint rendering KharchaApp
│   ├── globals.css                   # Global Tailwind v4 styles & design tokens
│   ├── privacy/page.tsx              # Privacy policy
│   └── terms/page.tsx                # Terms of service
├── components/                       # Frontend UI components
│   ├── kharcha-app.tsx               # Main application component & state machine
│   └── ui/                           # Reusable UI kit (button, card, dialog, input, etc.)
├── lib/                              # Frontend core utilities
│   ├── api.ts                        # Typed API client, authentication & fetch wrappers
│   └── utils.ts                      # Class merging & formatting helpers
├── backend/                          # Express.js REST API & WebSocket server
│   ├── src/
│   │   ├── server.js                 # HTTP & Socket.IO server initialization
│   │   ├── db.js                     # Unified PostgreSQL & SQLite database engine
│   │   ├── socket.js                 # WebSocket room management & connection guards
│   │   ├── migrate.js                # Schema runner & index validation script
│   │   ├── middleware/
│   │   │   └── auth.js               # JWT bearer verification & group membership guards
│   │   ├── routes/
│   │   │   ├── auth.js               # Login, register, and Google OAuth handlers
│   │   │   ├── groups.js             # Groups CRUD, 6-digit codes, guest claim & merge
│   │   │   ├── expenses.js           # Expense creation, equal & custom splits
│   │   │   └── settlements.js        # Balances, greedy settlement & settle-all execution
│   │   └── utils/
│   │       ├── settlement.js         # Core greedy debt-simplification algorithm
│   │       ├── settlement.test.js    # Unit tests for the settlement algorithm
│   │       └── joinCode.js           # Cryptographically strong 6-digit code generator
│   ├── migrations/
│   │   └── schema.sql                # Production PostgreSQL DDL schema & partial indexes
│   ├── test/                         # Comprehensive test suites
│   │   ├── test_suite.js             # Master automated regression suite (Phases 0-8)
│   │   └── two_account_walkthrough.js# E2E simulated user scenario
│   ├── package.json                  # Backend dependencies & test scripts
│   └── .env.example                  # Backend environment template
├── public/                           # Static public assets (icons, manifests)
├── .env.local.example                # Frontend environment template
├── package.json                      # Next.js root configuration
├── tsconfig.json                     # TypeScript compiler configuration
└── README.md                         # Project documentation (this file)
```

---

## 💻 Getting Started (Local Development)

### Prerequisites
- **Node.js** `>= 18.0.0`
- **npm** `>= 9.0.0` or **pnpm** `>= 8.0.0`
- **Git**

---

### Option A: Quick Start with SQLite (Zero Configuration)

You can run the complete stack locally **without installing or configuring PostgreSQL**. The backend will automatically create and initialize a high-performance local SQLite database (`backend/kharcha.db`).

#### 1. Setup & Start Backend
```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Create local environment configuration
cp .env.example .env
```

Open `backend/.env` and ensure a random `JWT_SECRET` is set:
```env
PORT=4000
JWT_SECRET=your_super_secret_jwt_key_here_at_least_32_characters
FRONTEND_URL=http://localhost:3000
# Leave DATABASE_URL empty or commented out to use SQLite automatically!
```

Start the backend server:
```bash
npm run dev
```
*Output: `📦 Using local SQLite database (kharcha.db)` and `🚀 Kharcha backend running on port 4000`*

#### 2. Setup & Start Frontend
In a new terminal window:
```bash
# In the repository root
npm install

# Create frontend environment configuration
cp .env.local.example .env.local

# Start Next.js development server
npm run dev
```

Visit **`http://localhost:3000`** in your browser.

---

### Option B: Setup with PostgreSQL (Production / Cloud)

To run with a full PostgreSQL instance (e.g., local Postgres, [Neon](https://neon.tech), [Supabase](https://supabase.com), or Railway):

#### 1. Configure Backend Environment
Edit `backend/.env`:
```env
PORT=4000
JWT_SECRET=production_random_secret_string_here
FRONTEND_URL=http://localhost:3000
DATABASE_URL=postgresql://username:password@ep-sample-123.us-east-2.aws.neon.tech/kharcha?sslmode=require
```

#### 2. Run Database Migrations
```bash
cd backend
npm run migrate
```
*Output: `✅ Migration complete — all tables and partial indexes created.`*

#### 3. Start Both Services
```bash
# Start backend
npm run dev

# In root terminal, start frontend
npm run dev
```

---

## ⚙️ Configuration & Environment Variables

### Frontend Environment Variables (`.env.local`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | `http://localhost:4000` | Full URL of the running Kharcha Express backend API. |

### Backend Environment Variables (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `4000` | Port on which the Express & Socket.IO server listens. |
| `JWT_SECRET` | **Yes** | *None* | Cryptographic secret key used to sign and verify user JWT sessions. |
| `DATABASE_URL` | No | SQLite fallback | PostgreSQL connection string. If omitted or unset, automatically uses SQLite. |
| `FRONTEND_URL` | Yes | `http://localhost:3000` | Origin URL of the frontend application used for CORS and Socket.IO handshake validation. |
| `GOOGLE_CLIENT_ID` | Optional | *None* | Google Cloud OAuth 2.0 Client ID for Google Sign-In. |
| `GOOGLE_CLIENT_SECRET` | Optional | *None* | Google Cloud OAuth 2.0 Client Secret. |
| `GOOGLE_CALLBACK_URL` | Optional | `http://localhost:4000/auth/google/callback` | Authorized redirect URI configured in Google Cloud Console. |

---

## 🗄 Database Schema & Migrations

Kharcha's relational schema is optimized for financial integrity, cascade rules, and query efficiency:

```
 users (id, name, email, password_hash, created_at)
   │
   ├──< groups (id, name, icon, created_by, join_code, join_code_active, created_at)
   │     │
   │     ├──< group_participants (id, group_id, user_id, guest_name, status, joined_via, added_at)
   │     │     │
   │     │     ├──< expenses (id, group_id, paid_by, amount, description, category, split_type)
   │     │     │     │
   │     │     │     └──< expense_splits (id, expense_id, participant_id, share_amount)
   │     │     │
   │     │     └──< settlements (id, group_id, from_participant, to_participant, amount, status, settled_at)
```

### Key Schema Optimizations
1. **Partial Unique Index on Join Codes:**
   ```sql
   CREATE UNIQUE INDEX uq_groups_join_code_active ON groups (join_code) WHERE join_code_active = true;
   ```
   Ensures active 6-digit join codes are globally unique while allowing retired codes to remain in audit history.
2. **Participant Identity Constraint:**
   ```sql
   CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL)
   ```
   Guarantees that a participant is either a registered system user or a named guest.
3. **Cascading Integrity:**
   Deleting or purging a group cleanly removes participants, expenses, splits, and settlement records in transactional boundaries.

Run migrations at any time via:
```bash
cd backend && npm run migrate
```

---

## 🔌 API Reference

All requests expecting authentication must provide the header:  
`Authorization: Bearer <jwt_token>`

### 1. Authentication Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | Public | Create new account (`{ name, email, password }`). |
| `POST` | `/auth/login` | Public | Authenticate user (`{ email, password }`), returns JWT token and user info. |
| `GET` | `/auth/google/status`| Public | Check if Google OAuth is enabled on the server. |
| `GET` | `/auth/google` | Public | Initiate Google OAuth redirect with HMAC signed state token. |
| `GET` | `/auth/google/callback`| Public | Google OAuth callback; exchanges authorization code and issues JWT. |

### 2. Group Management Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/groups` | Required | List all groups the authenticated user participates in. |
| `POST` | `/groups` | Required | Create a new group (`{ name, icon, guests?: string[] }`). |
| `POST` | `/groups/join` | Required | Look up group by 6-digit code. Returns matching guest candidates if available. |
| `POST` | `/groups/:id/join/confirm` | Required | Confirm joining the group or claim an existing guest identity. |
| `GET` | `/groups/:id` | Required | Get complete group details, member lists, and role metadata. |
| `POST` | `/groups/:id/participants/guest` | Required | Add a new unauthenticated guest participant to the group. |
| `POST` | `/groups/:id/participants/merge` | Required | Merge an unlinked guest participant record into a registered user. |
| `POST` | `/groups/:id/participants/remove` | Required | Remove guest or member participants from group (must be settled). |
| `POST` | `/groups/:id/regenerate-key` | Required | Invalidate existing join code and generate a fresh 6-digit code (Creator only). |

### 3. Expenses & Splits Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/groups/:groupId/expenses` | Required | Fetch all expenses and their individual split allocations. |
| `POST` | `/groups/:groupId/expenses` | Required | Create an expense (`{ description, amount, paidBy, category, splits? }`). |

### 4. Settlements & Balances Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/groups/:groupId/balances` | Required | Retrieve current calculated net balances for all group participants. |
| `GET` | `/groups/:groupId/settlements` | Required | Run debt-minimization algorithm and return minimal pending transactions & history. |
| `POST` | `/groups/:groupId/settlements/confirm` | Required | Mark an individual settlement transaction as paid (`{ fromParticipantId, toParticipantId, amount }`). |
| `POST` | `/groups/:groupId/settlements/settle-all` | Required | Settle all current group transactions at once with a single atomic operation. |

---

## 📡 Real-Time WebSocket Events

Kharcha uses Socket.IO rooms partitioned by `group:<groupId>`. Clients connect with their JWT token in `auth.token`, and the server verifies membership before granting room admission.

### Client Emitted Events
- `join-group (groupId)`: Authenticates and subscribes client to the group room.
- `leave-group (groupId)`: Unsubscribes client from the group room.

### Server Broadcast Events
| Event Name | Payload | Trigger |
|---|---|---|
| `expense-created` | `{ expense, splits, balances, createdBy }` | A member logs a new group expense. |
| `member-joined` | `{ group, participant, action }` | A new user or guest joins the group. |
| `members-merged` | `{ unlinkedParticipantId, targetParticipantId }` | A guest record is claimed by a registered user. |
| `member-removed` | `{ removedParticipantIds }` | Participants are removed from the group. |
| `key-regenerated` | `{ groupId, newKey }` | Group owner regenerates the 6-digit join key. |
| `settlement-confirmed` | `{ settlement, balances, isAllSettled }` | Single or batch settlement is completed. |

---

## 🚀 Production Deployment Guide

### 1. Deploy Backend (Render / Railway / Fly.io)
1. Link your GitHub repository to [Render](https://render.com) or [Railway](https://railway.app).
2. Set the **Root Directory** to `backend`.
3. Set **Build Command**: `npm install`
4. Set **Start Command**: `npm start`
5. Configure Environment Variables:
   - `DATABASE_URL`: Connection string from your managed PostgreSQL instance.
   - `JWT_SECRET`: High-entropy 64-character random string.
   - `FRONTEND_URL`: The URL of your deployed frontend (e.g. `https://kharcha.vercel.app`).
   - `PORT`: `4000` (or leave default for platform injection).
6. Enable automatic migrations by adding a pre-deploy or release step: `npm run migrate`.

### 2. Deploy Database (Neon / Supabase)
1. Provision a free PostgreSQL database on [Neon](https://neon.tech) or [Supabase](https://supabase.com).
2. Copy the pooled connection string with `?sslmode=require`.
3. Run the schema migrations from your terminal:
   ```bash
   DATABASE_URL="your-connection-string" node backend/src/migrate.js
   ```

### 3. Deploy Frontend (Vercel)
1. Import your repository into [Vercel](https://vercel.com).
2. Configure **Root Directory**: `./` (project root).
3. Set the Environment Variable:
   - `NEXT_PUBLIC_API_URL`: The live URL of your deployed backend (e.g. `https://kharcha-api.onrender.com`).
4. Click **Deploy**.

### Production Readiness Checklist
- [x] CORS configured strictly to production frontend domain.
- [x] Database SSL enforced with connection pooling.
- [x] JWT secrets cryptographically generated (`openssl rand -hex 32`).
- [x] Partial database indexes applied for active join codes.
- [x] Join code brute-force protection enabled via `express-rate-limit`.
- [x] WebSocket handshake authorization enforced via JWT verification.

---

## 🧪 Testing & Quality Assurance

Kharcha includes unit tests and an automated multi-phase integration suite:

```bash
# Run unit tests on the settlement algorithm
cd backend
npm test
```

Expected test runner output:
```text
✔ settles a simple 3-person group with minimum transactions (0.68ms)
✔ produces fewer transactions than naive pairwise settling for 4 people (0.22ms)
✔ returns no transactions when everyone is already settled (0.10ms)
✔ computeBalances derives correct net balances from expenses and splits (0.18ms)

ℹ pass 4
ℹ fail 0
```

To run the complete automated integration test suite covering authorization, join codes, guest claim flows, and Socket.IO events:
```bash
cd backend
node test/test_suite.js
```

---

## 🔒 Security & Hardening

1. **Authentication & Session Tokens:** Passwords hashed with `bcryptjs` (salt rounds: 10). Session tokens are signed using standard HMAC-SHA256 JWTs with a 7-day expiration.
2. **CSRF-Proof OAuth State:** Google OAuth flow signs a timestamped state payload using HMAC-SHA256 and compares it on callback using `crypto.timingSafeEqual` with expiration checks.
3. **Room-Level WebSocket Authorization:** Before joining any Socket.IO room (`group:<id>`), the user's active membership in `group_participants` is queried and validated.
4. **Brute Force Protection:** Group join attempts are throttled by IP using `express-rate-limit` to prevent brute-forcing 6-digit keys.
5. **SQL Injection Prevention:** 100% of queries use parameterized prepared statements in both PostgreSQL and SQLite modes.

---

## 🤝 Contributing

Contributions, bug reports, and suggestions are welcome!

1. Fork the repository: `git checkout -b feature/amazing-feature`
2. Commit your changes: `git commit -m 'feat: add amazing feature'`
3. Push to the branch: `git push origin feature/amazing-feature`
4. Open a Pull Request.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with ❤️ for hassle-free group living.
</p>
