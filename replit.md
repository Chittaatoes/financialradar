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
Browser → Vite dev server (port 5000, /api proxy) → Express API (port 5001) → Replit PostgreSQL
   React SPA + Vite         Express API              Drizzle ORM
   PWA-enabled              Google OAuth             DATABASE_URL env var (Replit built-in)
   vite proxy /api          ← APP_URL = Replit dev domain
```

### Replit Environment
- **Frontend:** Vite dev server on `0.0.0.0:5000`, proxies `/api` to `localhost:5001`
- **Backend:** Express on `localhost:5001`, `PORT=5001` (env var)
- **Database:** Replit built-in PostgreSQL via `DATABASE_URL` secret
- **Workflow:** `npm run dev` (concurrently runs backend + frontend)
- **CORS:** Allows `*.replit.dev` and `*.repl.co` domains automatically

## Project Structure
```
/
├── frontend/                             # React SPA (Vite + PWA) — deploys to Vercel
│   ├── index.html
│   ├── public/                           # Static assets, PWA icons, manifest
│   ├── src/
│   │   ├── App.tsx                       # Auth-gated routing
│   │   ├── main.tsx                      # React entry point
│   │   ├── index.css                     # Tailwind + theme CSS variables + iOS date fix
│   │   ├── components/                   # UI components (Shadcn UI 40+)
│   │   │   ├── calculator-sheet.tsx      # Calculator bottom sheet (safe arithmetic parser)
│   │   │   └── budget-summary-card.tsx   # Today's Budget card (daily budget, monthly income/expense, progress)
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

## Custom Categories (Budget Page)
- **Location**: Budget page → NEEDS and WANTS `CategoryGroup` sections only
- **Storage**: `custom_categories` table — `id`, `userId`, `name`, `emoji`, `type`, `createdAt`
- **Type field values**: `"needs"` or `"wants"` (to group them), `"expense"` for legacy categories
- **Budget key**: Category `name` string (exact match) — backend maps unmapped transaction categories to their own name in `spentByBudgetKey`
- **Add flow**: "+ Tambah Kategori" button at bottom of list → bottom sheet form with name input + emoji picker (preset grid + manual input)
- **Delete flow**: Trash icon on each custom category row → bottom sheet confirmation dialog before deletion
- **Transaction forms**: Custom categories appear in expense category pickers in dashboard quick-add, transactions page, scan panel, scan dialog — filtered as expense-compatible (`type === "needs" || "wants" || "expense"`)
- **Spending tracking**: Backend now falls through unmapped categories (custom) to use their name as budget key, so custom category spending shows on budget cards

## Receipt Scanner (Scan Struk)
- **Entry points:** `scan-panel.tsx` (dashboard inline), `scan-receipt-dialog.tsx` (modal)
- **OCR engine:** Tesseract.js with `eng+ind` language for Indonesian + English support
- **Preprocessing:** Canvas API — resizes to 1200px max, grayscale, contrast boost (1.5×)
- **Shared OCR helper:** `frontend/src/lib/receipt-ocr.ts` — `runOCR(file)` preprocesses and recognizes
- **Shared parser:** `frontend/src/lib/receipt-parser.ts` — `parseTotal`, `parseMerchant`, `parseDate`, `suggestCategory`
- **Total detection:** Priority keyword search (total bayar → grand total → total → jumlah → subtotal), multi-line support (keyword on line N, amount on N+1), fallback to largest formatted number
- **Merchant detection:** Bank/e-wallet name for payment proofs; first uppercase-dominant line otherwise
- **Date formats:** ISO `2026-03-09`, `09/03/2026`, `09-03-2026`, `9 Maret 2026`, `9 March 2026`
- **Category detection:** Keyword matching against merchant name + full OCR text; covers Indonesian & international merchants
- **Supported receipts:** Supermarket, restaurant, retail, bank transfer proofs (BCA/BNI/Mandiri/BRI/etc.), QRIS, ATM, international (USD/SGD/MYR/EUR)

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
