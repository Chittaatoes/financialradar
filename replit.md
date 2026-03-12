# Financial Radar v1.0

## Overview
Financial Radar is a habit-driven personal finance web application. It helps users track assets (Cash, Bank, E-Wallet), manage income/expenses, set savings goals, and build financial discipline through subtle gamification (XP, Levels, Streaks, Finance Score).

**Positioning:** Calm Premium Habit-Based Finance System  
**Default Language:** Bahasa Indonesia (ID) — toggle to English available

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
- **Migrated from Vercel/Render:** Now runs fully on Replit with built-in PostgreSQL
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
│   │   ├── App.tsx                       # Auth-gated routing + LanguageProvider in main.tsx
│   │   ├── main.tsx                      # React entry point — wraps app in LanguageProvider
│   │   ├── index.css                     # Tailwind + theme CSS variables + iOS date fix
│   │   ├── components/                   # UI components (Shadcn UI 40+)
│   │   │   ├── calculator-sheet.tsx      # Calculator bottom sheet (safe arithmetic parser)
│   │   │   ├── emoji-picker.tsx          # Full emoji picker (10 categories, ~700 emojis, search)
│   │   │   └── budget-summary-card.tsx   # Today's Budget card (daily budget, monthly income/expense, progress)
│   │   ├── features/                     # Feature modules (score, gamification, onboarding)
│   │   ├── hooks/                        # Custom React hooks
│   │   │   └── use-toast.ts              # Toast with typed helpers: toast.success/error/warning/radar()
│   │   ├── lib/                          # API client, i18n, constants, utils
│   │   │   └── i18n.tsx                  # EN/ID translations — default language: ID
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
- **accounts** — Financial accounts (cash/bank/ewallet with balances, `color`, `note` fields)
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
- **custom_categories** — User-defined transaction categories (Google users only)
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

## i18n (Internationalization)
- **File:** `frontend/src/lib/i18n.tsx`
- **Languages:** English (EN) and Bahasa Indonesia (ID)
- **Default:** ID — stored in `localStorage` under key `fr-lang`
- **Hook:** `useLanguage()` returns `{ t, language, setLanguage }`
- **Provider:** `LanguageProvider` wraps the app in `main.tsx`
- **Scope:** All pages (dashboard, accounts, transactions, budget, goals, profile, etc.)
- **Key sections:** `nav`, `dashboard`, `accounts`, `transactions`, `categories`, `goals`, `budget`, `common`, `profile`, `landing`, `mainMenu`, `tiers`

## Gamification System
- **XP & Levels:** Transactions, daily focus, no-spend days, savings deposits, debt payments all award XP
- **Streaks:** Daily activity tracked; weekly revive available (3 per week)
- **Badges:** 19 badges across discipline, debt, wealth, and smart_money categories
- **Finance Score:** Gold/Silver/Bronze tier based on spending ratios and consistency
- **Daily Focus:** 3 auto-generated missions per day with XP rewards
- **Level Up & Streak Celebrations:** Modal overlays on XP milestone / streak increase

## Account Settings (Color + Note)
- Each account has optional `color` and `note` fields in the DB
- Gear icon (SlidersHorizontal) next to account name opens settings bottom sheet
- Color picker: 8 presets (Default, Biru, Hijau, Ungu, Oranye, Merah, Kuning, Pink)
- Note field: max 120 chars, free text
- Fully translated (EN/ID)

## Toast System
- **File:** `frontend/src/hooks/use-toast.ts`
- **Renderer:** `frontend/src/components/ui/toaster.tsx` — dual position (top for errors, bottom for others)
- **Helpers:** `toast.success()`, `toast.error()`, `toast.warning()`, `toast.radar()`
- **Auto-dismiss:** 3s (success/warning/radar), 4s (errors)
- **Position:** Errors slide from top; all others appear 90px above the FAB

## Budget Reset Confirmation
- "Reset Budget" opens a bottom sheet requiring user to type "Hapus" to confirm
- Shows what gets deleted before confirming
- Located in budget page (`frontend/src/pages/budget.tsx`)

## Emoji Picker
- **File:** `frontend/src/components/emoji-picker.tsx`
- **Categories:** 10 categories, ~700+ Unicode emojis
- **Features:** Search bar, scrollable grid (9 columns), category tab navigation
- **Used in:** Budget page for custom category emoji selection

## Custom Categories (Budget Page)
- **Location:** Budget page → NEEDS and WANTS `CategoryGroup` sections only
- **Storage:** `custom_categories` table — `id`, `userId`, `name`, `emoji`, `type`, `createdAt`
- **Type field values:** `"needs"` or `"wants"` (to group them), `"expense"` for legacy categories
- **Budget key:** Category `name` string (exact match) — backend maps unmapped transaction categories to their own name in `spentByBudgetKey`
- **Add flow:** "+ Tambah Kategori" button at bottom of list → bottom sheet form with name input + emoji picker
- **Delete flow:** Trash icon on each custom category row → bottom sheet confirmation dialog before deletion
- **Restriction:** Google-authenticated users only (guests cannot add custom categories)
- **Transaction forms:** Custom categories appear in expense category pickers in dashboard quick-add, transactions page, scan panel, scan dialog

## Receipt Scanner (Scan Struk)
- **Entry points:** `scan-panel.tsx` (dashboard inline), `scan-receipt-dialog.tsx` (modal)
- **OCR engine:** Tesseract.js with `eng+ind` language for Indonesian + English support
- **Preprocessing:** Canvas API — resizes to 1200px max, grayscale, contrast boost (1.5×)
- **Shared OCR helper:** `frontend/src/lib/receipt-ocr.ts` — `runOCR(file)` preprocesses and recognizes
- **Shared parser:** `frontend/src/lib/receipt-parser.ts` — `parseTotal`, `parseMerchant`, `parseDate`, `suggestCategory`
- **Total detection:** Priority keyword search (total bayar → grand total → total → jumlah → subtotal), multi-line support, fallback to largest formatted number
- **Merchant detection:** Bank/e-wallet name for payment proofs; first uppercase-dominant line otherwise
- **Date formats:** ISO `2026-03-09`, `09/03/2026`, `09-03-2026`, `9 Maret 2026`, `9 March 2026`
- **Category detection:** Keyword matching against merchant name + full OCR text

## Budget Cycle System
- **Cycle types:** `bulanan` (1st–last of calendar month) and `custom` (user-defined start date)
- **Fields in `budget_plans`:** `cycle_type`, `cycle_start_day` (int), `cycle_start_date` (text, "YYYY-MM-DD")
- **Period calculation:** `custom` cycles run from `cycleStartDate` to 30 days later; `bulanan` uses month boundaries
- **Day extraction:** `cycleStartDate.split("-")[2]` (timezone-safe, avoids JS Date offset issues)
- **Frontend display:** Budget page header shows "Periode: DD Mmm – DD Mmm YYYY" derived from `periodStart`/`periodEnd` in `/api/budget/summary` response
- **Critical architecture note:** `backend/shared/` must be real file copies (not symlinks) because `drizzle-orm` only exists in `backend/node_modules`. Symlinks pointing outside `backend/` break Node ESM module resolution
- **React Query cache:** `persistQueryClient` uses buster key `"financialradar-v2"` to clear stale null values from localStorage. The `getQueryFn` returns `null` (not `undefined`) on 401/errors — React Query v5 requires non-undefined returns
- **Null guards:** `customCats` and `goals` query results in `budget.tsx` use `?? []` fallback defensively

## API Routes
- `/api/auth/*` — Authentication (login, callback, user, logout)
- `/api/profile` — User profile (XP, level, streak)
- `/api/dashboard` — Aggregated dashboard data
- `/api/accounts` — CRUD for financial accounts (supports `color` and `note` fields)
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
- `/api/custom-categories` — User-defined categories (Google auth only)
- `/api/guest-login` — Create guest account
- `/api/onboarding` — Save user preferences
- `/api/admin/*` — Admin-only routes
