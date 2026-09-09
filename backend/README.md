# ⚙️ Kharcha Backend API & WebSocket Engine

[![Express](https://img.shields.io/badge/Express-4.19-000000?style=flat-square&logo=express)](https://expressjs.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?style=flat-square&logo=socket.io)](https://socket.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-4169E1?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?style=flat-square&logo=sqlite)](https://sqlite.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=flat-square&logo=node.js)](https://nodejs.org/)

Production-grade Express.js backend for the **Kharcha** group expense settlement platform. Provides full REST endpoints, real-time WebSocket broadcasting via Socket.IO, dual SQLite/PostgreSQL persistence abstraction, and the core greedy debt-minimization algorithm.

---

## ⚡ Quick Start

### 1. Installation
```bash
cd backend
npm install
```

### 2. Environment Configuration
Copy the template to `.env`:
```bash
cp .env.example .env
```

Configure your `.env`:
```env
PORT=4000
JWT_SECRET=use_a_long_random_string_here_for_jwt_signing
FRONTEND_URL=http://localhost:3000

# Optional: Set DATABASE_URL to use PostgreSQL (Neon, Supabase, etc.).
# If DATABASE_URL is omitted or unset, backend automatically falls back to local SQLite (kharcha.db) with WAL mode!
DATABASE_URL=
```

### 3. Run Migrations (PostgreSQL only)
If using PostgreSQL, execute the migration runner:
```bash
npm run migrate
```
*(Note: If using local SQLite, schema and partial indexes are initialized automatically on server boot).*

### 4. Start the Server
```bash
# Development mode with nodemon auto-restart:
npm run dev

# Production mode:
npm start
```
Server runs by default on `http://localhost:4000`.

---

## 🗄 Dual Database Architecture (`src/db.js`)

Kharcha features a custom database abstraction layer:
- **Zero-Config Local Dev (SQLite):** Uses `better-sqlite3` with Write-Ahead Logging (`PRAGMA journal_mode = WAL`) and foreign keys enabled. Queries using PostgreSQL `$1, $2` parameterized placeholders and `now()` timestamps are automatically translated at runtime to native SQLite syntax.
- **Production Mode (PostgreSQL):** When `DATABASE_URL` is set to a PostgreSQL connection URI, the engine switches to pooled connections via `pg` with automated SSL detection for cloud providers like Neon and Supabase.

---

## 📡 Complete API Reference

All protected endpoints require the HTTP header:  
`Authorization: Bearer <token>`

### Authentication (`/auth`)

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | Public | Register new user with name, email, password. |
| `POST` | `/auth/login` | Public | Log in with email and password, receive JWT. |
| `GET` | `/auth/google/status` | Public | Check if Google OAuth is configured on the backend. |
| `GET` | `/auth/google` | Public | Initiates Google OAuth redirect with HMAC-signed CSRF state. |
| `GET` | `/auth/google/callback` | Public | Handles OAuth code exchange and session issuance. |

### Groups & Participants (`/groups`)

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/groups` | Member | List all groups the authenticated user belongs to. |
| `POST` | `/groups` | Member | Create a group with optional initial guest participants. |
| `POST` | `/groups/join` | Member | Submit a 6-digit join code (rate-limited). Returns potential guest matches. |
| `POST` | `/groups/:id/join/confirm` | Member | Confirm joining a group and optionally claim a guest profile. |
| `GET` | `/groups/:id` | Member | Group details, participants, and role information. |
| `POST` | `/groups/:id/participants/guest` | Member | Add an unregistered friend as a guest. |
| `POST` | `/groups/:id/participants/merge` | Member | Merge guest participant into a registered user. |
| `POST` | `/groups/:id/participants/remove` | Member | Remove settled participants from group. |
| `POST` | `/groups/:id/regenerate-key` | Creator | Generate a new 6-digit code and deactivate the previous one. |

### Expenses & Settlements (`/groups/:groupId`)

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/groups/:groupId/expenses` | Member | List all expenses with split breakdown. |
| `POST` | `/groups/:groupId/expenses` | Member | Create an expense with equal or custom splits. |
| `GET` | `/groups/:groupId/balances` | Member | Calculate net balances per participant. |
| `GET` | `/groups/:groupId/settlements` | Member | Compute minimal debt-settlement transactions. |
| `POST` | `/groups/:groupId/settlements/confirm` | Member | Mark an individual settlement transaction as paid. |
| `POST` | `/groups/:groupId/settlements/settle-all` | Member | Clear all pending transactions at once. |

---

## 🔄 Real-Time Events (Socket.IO)

Clients connect to `ws://localhost:4000` with `{ auth: { token: "<jwt>" } }`.
- Client emits `join-group` with `groupId`. The backend verifies the user's membership in that group before admitting the socket into the room `group:<groupId>`.
- The server broadcasts:
  - `expense-created`: New expense posted.
  - `member-joined`: New member joined via 6-digit key.
  - `members-merged`: Guest record linked to registered user.
  - `member-removed`: Participant removed.
  - `key-regenerated`: New 6-digit key generated.
  - `settlement-confirmed`: Transaction(s) paid.

---

## 🧪 Testing

```bash
# Run unit tests on the settlement algorithm
npm test

# Run full integration and regression test suite
node test/test_suite.js
```
