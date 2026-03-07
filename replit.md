# Financial Radar v1.0

## Overview
Financial Radar is a habit-driven personal finance web application. It helps users track assets (Cash, Bank, E-Wallet), manage income/expenses, set savings goals, and build financial discipline through subtle gamification (XP, Levels, Streaks, Finance Score).

**Positioning:** Calm Premium Habit-Based Finance System

## Tech Stack
- **Frontend:** React 18 + TypeScript + Vite 7 + Tailwind CSS 3 + Shadcn UI + Framer Motion + PWA
- **Backend:** Express.js 5 + TypeScript
- **Database:** PostgreSQL with Drizzle ORM (Supabase for production)
- **Auth:** Google OAuth2 (session-based, no JWT) with guest login support
- **Session Store:** PostgreSQL via `connect-pg-simple`
- **Charts:** Recharts
- **Routing:** Wouter
- **Animations:** Framer Motion
- **Package Manager:** npm (separate frontend/backend packages)

## Deployment Architecture
```
Browser → Vercel (frontend + /api proxy) → Render (backend API) → Supabase PostgreSQL
   React SPA + Vite         Express API              Drizzle ORM
   PWA-enabled              Google OAuth             DATABASE_URL env var
   vercel.json rewrites     ← APP_URL = frontend URL
```

### Production Deployment
- **Frontend:** Vercel — `npm run build` produces `/dist` folder
- **Backend:** Render — `npm start` runs Express on `PORT` (default 5000)
- **Database:** Supabase PostgreSQL with `DATABASE_URL`
- **See:** `DEPLOYMENT.md` for full setup instructions

### Local Development (Replit)
- **Frontend:** Vite dev server on `0.0.0.0:5000`, proxies `/api` to `localhost:5001`
- **Backend:** Express on `localhost:5001`, `PORT=5001`
- **Database:** Replit built-in PostgreSQL via `DATABASE_URL`
- **Workflow:** `npm run dev` (concurrently runs backend + frontend)

## Project Structure
```
/
├── frontend/                             # React SPA (Vite + PWA) — deploys to Vercel
│   ├── index.html
│   ├── public/                           # Static assets, PWA icons, manifest
│   ├── src/
│   │   ├── App.tsx                       # Auth-gated routing
│   │   ├── main.tsx                      # React entry point
│   │   ├── index.css                     # Tailwind + theme CSS variables
│   │   ├── components/                   # UI components (Shadcn UI 40+)
│   │   ├── features/                     # Feature modules (score, gamification, onboarding)
│   │   ├── hooks/                        # Custom React hooks
│   │   ├── lib/                          # API client, i18n, constants, utils
│   │   └── pages/                        # Route pages
│   ├── vite.config.ts
│   ├── vercel.json                       # SPA routing for Vercel
│   ├── package.json                      # Frontend dependencies only
│   └── .env.example
│
├── backend/                              # Express API — deploys to Render
│   ├── src/
│   │   ├── index.ts                      # Express server (app.listen on PORT)
│   │   ├── auth/index.ts                 # Google OAuth2 + sessions + middleware
│   │   ├── routes/index.ts               # All API routes
│   │   ├── middleware/logger.ts           # Request logging
│   │   ├── storage.ts                    # Drizzle ORM data access layer
│   │   └── db.ts                         # PostgreSQL pool connection
│   ├── shared/                           # Shared schema (backend copy)
│   │   ├── schema.ts                     # Drizzle table definitions + Zod schemas
│   │   └── models/auth.ts               # Users table definition
│   ├── drizzle.config.ts
│   ├── tsconfig.json
│   ├── package.json                      # Backend dependencies only
│   └── .env.example
│
├── shared/                               # Shared types for frontend build-time imports
│   ├── schema.ts
│   └── models/auth.ts
│
├── DEPLOYMENT.md                         # Production deployment guide
├── package.json                          # Root dev orchestrator (concurrently)
├── drizzle.config.ts                     # Root drizzle config for Replit dev
├── tsconfig.json                         # Root TypeScript config
└── replit.md                             # This file
```

## Database Tables
- **users** — User accounts (id, email, firstName, lastName, profileImageUrl, role, isGuest)
- **sessions** — Express session store (auto-created by connect-pg-simple)
- **accounts** — Financial accounts (cash/bank/ewallet with balances)
- **transactions** — Income/expense/transfer records
- **goals** — Savings goals with target amount and deadline
- **liabilities** — Debt tracking (one_time or installment type)
- **budget_allocations** — Monthly budget limits per category
- **user_profiles** — Gamification state (xp, level, streak, unlocked features)
- **xp_logs** — XP gain history
- **streak_logs** — Daily streak activity log
- **badges** — 19 predefined badges across 4 categories
- **user_badges** — Tracks which badges each user has unlocked
- **daily_focus** — Daily missions (3 per day)
- **custom_categories** — User-defined transaction categories
- **budget_plans** — Monthly budget strategies

## Environment Variables

### Frontend (.env)
| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend API URL (empty string in dev for same-origin proxy) |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID |

### Backend (.env)
| Variable | Description |
|---|---|
| `PORT` | Server port (default 5000 in prod, 5001 in dev) |
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Session cookie signing secret (32+ chars) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `APP_URL` | Backend public URL (for OAuth redirect URI) |
| `FRONTEND_URL` | Frontend URL (for CORS + redirects) |
| `NODE_ENV` | `production` or `development` |
| `SUPER_ADMIN_EMAIL` | (Optional) First user with this email gets admin role |

## API Routes
- `/api/auth/*` — Authentication (login, callback, user, logout)
- `/api/profile` — User profile (XP, level, streak)
- `/api/dashboard` — Aggregated dashboard data
- `/api/accounts` — CRUD for financial accounts
- `/api/transactions` — CRUD for transactions + auto balance updates
- `/api/no-spending` — Record "no spending today"
- `/api/goals` — CRUD for savings goals + deposit
- `/api/smart-save` — Savings recommendation
- `/api/liabilities` — CRUD for debt records
- `/api/budget` — Budget allocation CRUD + summary
- `/api/budget-plan` — Monthly budget strategy CRUD
- `/api/debt-health` — Debt ratio analysis (Level 5+)
- `/api/net-worth` — Net worth tracking (Level 7+)
- `/api/spending-insight` — Spending breakdown
- `/api/finance-score` — Financial health score
- `/api/streak/revive` — Use weekly revive
- `/api/daily-focus` — Daily missions
- `/api/custom-categories` — User-defined categories
- `/api/guest-login` — Create guest account
- `/api/onboarding` — Save user preferences
- `/api/admin/*` — Admin-only routes
