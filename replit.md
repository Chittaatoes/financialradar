# Financial Radar v1.0

## Overview
Financial Radar is a habit-driven personal finance web application. It helps users track assets (Cash, Bank, E-Wallet), manage income/expenses, set savings goals, and build financial discipline through subtle gamification (XP, Levels, Streaks, Finance Score).

**Positioning:** Calm Premium Habit-Based Finance System

## Tech Stack
- **Frontend:** React 18 + TypeScript + Vite 7 + Tailwind CSS 3 + Shadcn UI + Framer Motion + PWA
- **Backend:** Express.js 5 + TypeScript (deployed on Render)
- **Database:** PostgreSQL with Drizzle ORM (Supabase)
- **Auth:** Google OAuth2 (session-based, no JWT) with guest login support
- **Session Store:** PostgreSQL via `connect-pg-simple`
- **Charts:** Recharts
- **Routing:** Wouter
- **Animations:** Framer Motion
- **Package Manager:** npm (monorepo, root + frontend workspaces)

## Deployment Architecture (Replit)
```
Frontend (port 5000)  ←→  Backend (port 5001)  ←→  Database (Replit PostgreSQL)
   React SPA + Vite         Express API               Drizzle ORM
   PWA-enabled              Google OAuth              DATABASE_URL env var
   /api proxy →             ← FRONTEND_URL
```

- **Frontend:** Vite dev server on `0.0.0.0:5000`, proxies `/api` to `localhost:5001`
- **Backend:** Express on `localhost:5001`, `PORT=5001` via cross-env
- **Database:** Replit built-in PostgreSQL, `DATABASE_URL` set as secret
- **Session Store:** PostgreSQL via `connect-pg-simple` (creates sessions table automatically)
- **Workflow:** `npm run dev` (concurrently runs backend + frontend)
- **Environment vars:** `FRONTEND_URL=http://localhost:5000`, `APP_URL=http://localhost:5001`
- **Cross-origin cookies:** `sameSite: "lax"` in dev, `"none"` + `secure` in prod

## Project Structure
```
/
├── frontend/                             # React SPA (Vite + PWA)
│   ├── index.html                        # HTML entry + PWA meta tags
│   ├── public/
│   │   ├── favicon.png
│   │   ├── manifest.json                 # PWA manifest
│   │   ├── apple-touch-icon.png          # iOS PWA icon
│   │   ├── icon-*.png                    # PWA icons (72-512px)
│   │   └── sounds/                       # Sound effect assets
│   ├── src/
│   │   ├── App.tsx                       # Auth-gated routing, onboarding flow
│   │   ├── main.tsx                      # React entry point
│   │   ├── index.css                     # Tailwind + theme CSS variables
│   │   ├── components/
│   │   │   ├── app-sidebar.tsx           # Desktop navigation sidebar
│   │   │   ├── mobile-nav.tsx            # Mobile bottom nav (4 tabs + raised center +)
│   │   │   ├── add-action.tsx            # Shared add action logic
│   │   │   ├── add-action-desktop.tsx    # Desktop add action UI
│   │   │   ├── add-action-mobile.tsx     # Mobile add action UI
│   │   │   ├── setup-first-account-modal.tsx
│   │   │   ├── profile-author-footer.tsx # Author credit footer
│   │   │   ├── theme-provider.tsx        # Dark/light theme context
│   │   │   ├── theme-toggle.tsx          # Theme switch button
│   │   │   └── ui/                       # Shadcn UI components (40+)
│   │   ├── features/
│   │   │   ├── onboarding/onboarding.tsx # 3-slide onboarding + login
│   │   │   ├── score/
│   │   │   │   ├── score-page.tsx        # Finance Score page
│   │   │   │   ├── score-ring.tsx        # Animated circular ring
│   │   │   │   └── score-widget.tsx      # Dashboard score widget
│   │   │   └── gamification/
│   │   │       ├── xp-chip.tsx           # XP popup animation
│   │   │       ├── milestone-flame.tsx   # Streak flame (7 levels)
│   │   │       └── level-up-celebration.tsx
│   │   ├── hooks/
│   │   │   ├── use-auth.ts              # Google Auth + guest login
│   │   │   ├── use-mobile.tsx           # Mobile viewport detection
│   │   │   ├── use-sound.ts            # Web Audio API sounds
│   │   │   └── use-toast.ts            # Toast notifications
│   │   ├── lib/
│   │   │   ├── api.ts                   # API_URL = VITE_API_URL || ""
│   │   │   ├── queryClient.ts           # TanStack Query + apiRequest
│   │   │   ├── constants.ts             # XP thresholds, categories
│   │   │   ├── auth-utils.ts            # Auth error handling
│   │   │   ├── i18n.tsx                 # EN/ID translations
│   │   │   └── utils.ts                # cn() Tailwind merge
│   │   └── pages/
│   │       ├── landing.tsx              # Landing page (unauthenticated)
│   │       ├── dashboard.tsx            # Main dashboard
│   │       ├── accounts.tsx             # Account CRUD
│   │       ├── transactions.tsx         # Transaction management
│   │       ├── goals.tsx                # Smart Save goals
│   │       ├── budget.tsx               # Budget Plan (category allocations + income + pressure)
│   │       ├── debt-health.tsx          # Debt ratio (Level 5+)
│   │       ├── net-worth.tsx            # Net worth (Level 7+)
│   │       ├── weekly-insight.tsx       # Weekly spending insight
│   │       ├── achievements.tsx         # Badge gallery
│   │       ├── profile.tsx              # Profile hub
│   │       ├── admin.tsx                # Admin panel
│   │       └── not-found.tsx            # 404 page
│   ├── vite.config.ts                   # Vite + PWA plugin + dev proxy
│   ├── vercel.json                      # SPA routing for Vercel
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── components.json                  # Shadcn CLI config
│   ├── package.json                     # Frontend deps
│   └── .env.example                     # VITE_API_URL
│
├── backend/                             # Express API
│   ├── src/
│   │   ├── index.ts                     # Express server (app.listen, port 10000)
│   │   ├── auth/index.ts               # Google OAuth2 + sessions + middleware
│   │   ├── routes/index.ts             # All API routes (~1650 lines)
│   │   ├── middleware/logger.ts        # Request logging
│   │   ├── storage.ts                   # Drizzle ORM data access
│   │   └── db.ts                        # PostgreSQL pool (SSL in prod)
│   ├── tsconfig.json
│   ├── package.json                     # Backend deps (self-contained for Render)
│   ├── .env.example
│   └── .gitignore
│
├── shared/                              # Shared types & schemas
│   ├── schema.ts                        # All Drizzle table definitions + Zod schemas
│   └── models/auth.ts                  # Users table
│
├── render.yaml                          # Render Blueprint (IaC)
├── drizzle.config.ts                    # Drizzle Kit config
├── package.json                         # Root monorepo scripts + deps
├── tsconfig.json                        # Root TypeScript config
├── MASTER_DEPLOYMENT_GUIDE.txt          # Complete 3-platform deploy guide
└── replit.md                            # This file
```

## Database Tables
- **users** — User accounts (id, email, firstName, lastName, profileImageUrl, role, isGuest)
- **sessions** — Express session store (auto-created by connect-pg-simple)
- **accounts** — Financial accounts (cash/bank/ewallet with balances)
- **transactions** — Income/expense/transfer records
- **goals** — Savings goals with target amount and deadline
- **liabilities** — Debt tracking (one_time or installment type)
- **budget_allocations** — Monthly budget limits per category (userId, category, budgetLimit, month, note)
- **user_profiles** — Gamification state (xp, level, streak, unlocked features, etc.)
- **xp_logs** — XP gain history
- **streak_logs** — Daily streak activity log
- **badges** — 19 predefined badges across 4 categories
- **user_badges** — Tracks which badges each user has unlocked
- **daily_focus** — Daily missions (3 per day)
- **custom_categories** — User-defined transaction categories

## Key Features

### Core Finance
- Asset tracking with auto-balance updates on transactions
- Daily interaction system (transaction or "No Spending Today" = +5 XP)
- Transactions with date range filter + Spending Overview chart
- Dashboard Spending Insight with daily/weekly/monthly selector
- Smart Save daily suggestion calculator
- Budget Plan with category-based allocation (Needs/Wants/Financial), progress tracking, income management
- Debt Health Analyzer with DSR-based debt ratios (Level 5+)
- Net Worth Tracking with asset vs liability breakdown (Level 7+)
- Weekly spending insight with category breakdown

### V1.0 Features
- **Onboarding Flow:** 3-slide questionnaire → Google or Guest login
- **Guest Login:** Anonymous account with UUID, upgradeable to Google
- **Finance Score:** 4-component scoring with tiers (Bronze → Diamond)
- **Mobile-First Layout:** Bottom nav (Dashboard, Account, +, Transactions, Profile) with raised center + button, premium Menu Utama grid on dashboard
- **Streak Milestone Flame:** 7 progressive visual levels
- **PWA:** Installable on mobile/desktop, offline-capable, auto-updating service worker

### Gamification
- XP/Level system with identity tiers (Financial Starter → Wealth Architect)
- 19 badges across 4 categories
- Streak system with weekly revives (3 per week)
- Daily Focus missions (3 per day, auto-checked)
- Sound effects with Web Audio API

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
- `/api/budget` — Budget allocation CRUD + summary (GET/POST/DELETE)
- `/api/debt-health` — Debt ratio analysis (Level 5+)
- `/api/net-worth` — Net worth tracking (Level 7+)
- `/api/spending-insight` — Spending breakdown
- `/api/streak/revive` — Use weekly revive
- `/api/daily-focus` — Daily missions
- `/api/custom-categories` — User-defined categories
- `/api/guest-login` — Create guest account
- `/api/admin/*` — Admin-only routes

## Development Setup
- **Dev command:** `npm run dev` runs backend (port 5001) and frontend (port 5000) concurrently
- **Vite proxy:** Frontend proxies `/api` requests to backend at `http://localhost:5001`
- **Public port:** 5000 (Vite dev server, publicly accessible on Replit)
- **Frontend API URL:** Empty string in dev (same-origin via Vite proxy)
- **Backend entry:** `backend/src/index.ts` — Express with `app.listen()`

## Environment Variables
| Variable | Where | Description |
|---|---|---|
| `DATABASE_URL` | Render | Supabase PostgreSQL connection string (port 6543) |
| `SESSION_SECRET` | Render | Session cookie signing secret (32+ chars) |
| `GOOGLE_CLIENT_ID` | Render | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Render | Google OAuth client secret |
| `APP_URL` | Render | Backend public URL (for OAuth redirect URI) |
| `FRONTEND_URL` | Render | Vercel frontend URL (for CORS + redirects) |
| `NODE_ENV` | Render | Must be `production` |
| `VITE_API_URL` | Vercel | Render backend URL (no trailing slash) |
| `PORT` | Dev only | Backend port (default 5001 in dev, 10000 on Render) |
| `SUPER_ADMIN_EMAIL` | Optional | First user with this email gets admin role |

## Authentication
- **Google OAuth2:** Session-based (no JWT). Redirects through backend
- **Guest Login:** Creates anonymous user via `POST /api/guest-login`
- **Session Store:** PostgreSQL via `connect-pg-simple`
- **Cookie Config (prod):** `secure: true`, `httpOnly: true`, `sameSite: "none"`, `maxAge: 7 days`
- **Cross-origin:** Frontend (Vercel) sends `credentials: "include"`, backend allows `FRONTEND_URL` origin

## i18n System
- `frontend/src/lib/i18n.tsx` — LanguageProvider with `useLanguage()` hook
- Full EN/ID translation dictionaries
- Language toggle in sidebar and mobile Profile

## Design System
- Theme: Calm Premium Minimal
- Colors: Soft green primary (#3d9d5c), neutral beige backgrounds
- Typography: Plus Jakarta Sans, Playfair Display, JetBrains Mono
- Dark mode supported (class-based toggle)
- Shadcn UI components (40+)
- Framer Motion animations

## User Preferences
- Indonesian Rupiah (IDR) currency format
- Indonesian target audience (20-35 age range)
- Default language: English (persisted to localStorage)

## Category System (Updated)
- **Transaction category picker** uses `EXPENSE_CATEGORY_GROUPS` from `constants.ts` (grouped: KEBUTUHAN / KEINGINAN) with emojis
- **KEBUTUHAN (Needs):** Food & Drinks, Housing, Transportation, Electricity, Water, Health, Education, Other Needs
- **KEINGINAN (Wants):** Shopping, Hangout, Entertainment, Snacks, Hobby, Lifestyle
- Income categories remain a flat list (Salary, Freelance, Business, Investment Returns, Gift, Other)
- Backend `txCategoryToBudgetKey` maps all category values (including new ones: Housing→housing, Electricity→electricity, Water→water, Hangout→hangout, Snacks→snacks, Hobby→hobby, Lifestyle→lifestyle) to budget keys
- Old categories (Bills & Utilities, Travel, Shopping, Entertainment as broad) remain mapped for backward compatibility

## Budget Planner — Category Groups
- **Savings section** shows user's savings goals (from `/api/goals`) instead of fixed subcategories; empty state if no goals exist
- **Investment section** shows only Investasi (loan and tax removed)
- Both `/api/finance-score` and `/api/budget/summary` use the same extended `txCategoryToBudgetKey` mapping
