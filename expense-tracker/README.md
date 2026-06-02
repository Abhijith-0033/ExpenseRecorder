# 💰 ExpenseRecorder — Personal Finance Tracker

A full-stack personal finance web application built with **Node.js + Express + SQLite** on the backend and **Vanilla JS + CSS** on the frontend. Track your expenses and income, manage budgets, analyse spending patterns, and stay in full control of your finances.

---

## ✨ Feature Overview

| Area | Features |
|------|----------|
| **Expenses** | Add, edit, delete • Category tagging • Date filter • Search • Notes |
| **Income** | Add, edit, delete • Category tagging • Account assignment • Monthly summary |
| **Accounts** | Multi-account balance tracking • Initial balance setup • Balance breakdown |
| **Categories** | Dynamic expense categories (add/edit/delete) • Dynamic income categories |
| **Budgets** | Monthly budgets per expense category • Progress bars • Over-budget warnings |
| **Analysis** | Interactive calendar • Daily/category/monthly charts • Budget overview |
| **Dashboard** | Net balance • This week/month stats • Cashflow chart • Recent transactions |
| **Settings** | Expense categories CRUD • Income categories CRUD • Monthly budgets CRUD |
| **UI/UX** | Dark/light theme toggle • Toast notifications • Responsive layout |

---

## 🏗️ Architecture

```
expense-tracker/
├── server.js                  # Express entry point
├── db.js                      # SQLite schema + seeding
├── expenses.db                # SQLite database (auto-created)
├── package.json
├── routes/
│   ├── expenses.js            # GET/POST/PUT/DELETE expenses + summary
│   ├── income.js              # GET/POST/PUT/DELETE income + income summary
│   ├── categories.js          # GET/POST/PUT/DELETE expense categories
│   ├── income_categories.js   # GET/POST/PUT/DELETE income categories
│   ├── accounts.js            # GET/POST/PUT/DELETE accounts + balance calc
│   ├── budgets.js             # GET/POST/PUT/DELETE budgets + status + check
│   └── analytics.js          # Overview, daily, monthly, comparison charts
└── public/
    ├── index.html             # Single-page app (all sections)
    ├── app.js                 # All frontend logic (~2800 lines)
    └── style.css              # All styles (~1900 lines)
```

---

## 🗄️ Data Model

### `expenses`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, AUTOINCREMENT |
| title | TEXT | NOT NULL, non-empty, max 200 chars |
| amount | REAL | NOT NULL, > 0, max ₹1,00,00,000 |
| category | TEXT | NOT NULL, must exist in `categories` table |
| date | TEXT | NOT NULL, YYYY-MM-DD format |
| note | TEXT | NOT NULL DEFAULT '', max 1000 chars |
| account_id | INTEGER | NOT NULL DEFAULT 1, FK → accounts |

### `income`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, AUTOINCREMENT |
| title | TEXT | NOT NULL, non-empty, max 200 chars |
| amount | REAL | NOT NULL, > 0, max ₹1,00,00,000 |
| account_id | INTEGER | NOT NULL, FK → accounts |
| category | TEXT | NOT NULL DEFAULT 'Other', must exist in `income_categories` |
| date | TEXT | NOT NULL, YYYY-MM-DD format |
| note | TEXT | NOT NULL DEFAULT '', max 1000 chars |

### `categories`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, AUTOINCREMENT |
| name | TEXT | NOT NULL, UNIQUE, max 50 chars |
| color | TEXT | NOT NULL DEFAULT '#8888a0', valid hex color |
| is_default | INTEGER | NOT NULL DEFAULT 0 (1 = built-in) |

**Built-in expense categories:** Food, Transport, Shopping, Bills, Entertainment, Other

### `income_categories`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, AUTOINCREMENT |
| name | TEXT | NOT NULL, UNIQUE, max 50 chars |
| color | TEXT | NOT NULL DEFAULT '#a99ef9', valid hex color |
| is_default | INTEGER | NOT NULL DEFAULT 0 (1 = built-in) |

**Built-in income categories:** Salary, Freelance, Investment, Gift, Other

### `accounts`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, AUTOINCREMENT |
| name | TEXT | NOT NULL, UNIQUE, max 100 chars |
| initial_balance | REAL | NOT NULL DEFAULT 0, ≥ 0 |
| created_at | TEXT | NOT NULL DEFAULT date('now') |

> **Balance formula:** `balance = initial_balance + SUM(income) − SUM(expenses)` (computed on every read, never stored)

### `budgets`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, AUTOINCREMENT |
| category_name | TEXT | NOT NULL, UNIQUE |
| monthly_amount | REAL | NOT NULL, > 0, max ₹1,00,00,000 |

> Budgets are **monthly** and compared against expenses within the current calendar month.

---

## 🌐 REST API Reference

All endpoints are prefixed with `/api`.

### Expenses

| Method | Path | Description |
|--------|------|-------------|
| GET | `/expenses` | List expenses. Filters: `category`, `from`, `to`, `search`, `account_id` |
| POST | `/expenses` | Create expense |
| PUT | `/expenses/:id` | Update expense (partial update supported) |
| DELETE | `/expenses/:id` | Delete expense |
| GET | `/summary` | Current month expense summary with category breakdown |

### Income

| Method | Path | Description |
|--------|------|-------------|
| GET | `/income` | List income. Filters: `category`, `from`, `to`, `search`, `account_id` |
| POST | `/income` | Create income entry |
| PUT | `/income/:id` | Update income (partial update supported) |
| DELETE | `/income/:id` | Delete income entry |
| GET | `/income/summary` | Current month income summary with category breakdown |

### Expense Categories

| Method | Path | Description |
|--------|------|-------------|
| GET | `/categories` | List all categories (built-ins first) |
| POST | `/categories` | Create custom category (requires `name`, `color`) |
| PUT | `/categories/:id` | Edit category (built-ins: color only; custom: name + color) |
| DELETE | `/categories/:id` | Delete custom category (blocked if expenses use it) |

### Income Categories

| Method | Path | Description |
|--------|------|-------------|
| GET | `/income-categories` | List all income categories |
| POST | `/income-categories` | Create custom income category |
| PUT | `/income-categories/:id` | Edit income category |
| DELETE | `/income-categories/:id` | Delete (blocked if income records use it) |

### Accounts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/accounts` | List accounts with computed balances |
| POST | `/accounts` | Create account |
| PUT | `/accounts/:id` | Update account name or initial balance |
| DELETE | `/accounts/:id` | Delete (blocked if only account or if it has linked data) |
| GET | `/accounts/:id/balance` | Single account balance detail |

### Budgets

| Method | Path | Description |
|--------|------|-------------|
| GET | `/budgets` | List all budgets |
| GET | `/budgets/status` | Budgets with current-month spending, %, remaining |
| GET | `/budgets/check/:category` | Quick single-category budget check (used after expense save) |
| POST | `/budgets` | Set/upsert budget for a category |
| PUT | `/budgets/:id` | Update budget amount |
| DELETE | `/budgets/:id` | Remove budget |

### Analytics

| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/overview` | Dashboard stats (net balance, today/week/month spend, cashflow) |
| GET | `/analytics/monthly` | Month-specific spending breakdown + daily totals |
| GET | `/analytics/comparison` | Multi-month comparison data |
| GET | `/analytics/daily-expenses` | Calendar: expenses per day for a given month |

---

## ✅ Validation & Constraints

### Expense / Income Forms (Frontend)
- **Title:** Required, non-empty
- **Amount:** Required, positive number
- **Category:** Required, must be a valid category from the DB
- **Date:** Required, cannot be **in the future** (enforced by both HTML `max` attribute and JS validation)
- **Note:** Optional, max 1000 characters
- When **editing** a record, the date `max` constraint is temporarily removed so historical dates remain editable, and is restored on cancel

### Date Filter Validation
- "To" date must be **≥ From** date — enforced client-side with a toast error that clears the invalid field

### Category Constraints
- Built-in expense and income categories **cannot be deleted**
- Built-in categories **cannot be renamed** (only their colour can be changed)
- A custom category **cannot be deleted** if any expense/income records reference it
- Category names are **case-insensitively unique**

### Account Constraints
- The **last remaining account cannot be deleted**
- An account with **linked income or expenses cannot be deleted** (reassign first)
- Account names are **unique**
- `initial_balance` must be **≥ 0**

### Budget Constraints
- Budget amount must be a **positive number**
- Maximum budget is **₹1,00,00,000**
- Each category can have at most **one active budget** (POST upserts)
- Exceeding a budget **never blocks** adding an expense — a warning toast is shown instead

### Backend Validation (API-level)
- All amounts validated as finite, positive numbers within the ₹1,00,00,000 ceiling
- All dates validated as real calendar dates (e.g. `2024-02-30` is rejected)
- Category names validated against the DB on every write (custom categories are immediately recognised after being created)
- Account ID references validated for existence
- Color values must be valid 6-digit hex (`#rrggbb`)

---

## 🔔 Toast Notification System

All create/edit/delete actions emit a non-blocking toast with:
- ✅ **Success** (green) — record added/updated
- ✏️ **Edit** (green) — record saved after editing
- 🗑️ **Delete** (info/blue) — record removed
- ⚠️ **Warning** (red, 6s) — budget exceeded
- ⚠️ **Info** (info, 5s) — budget at ≥80% of limit

Toasts stack vertically, auto-dismiss, and have a close button.

---

## 📊 Budget Feature

1. Go to **Settings → Monthly Budgets**
2. Each expense category is listed with a mini progress bar if a budget exists
3. Enter an amount and click **Set** or **Update**
4. Navigate to **Analysis → Budget Overview** to see full progress bars colour-coded:
   - 🟢 Green — below 80%
   - 🟡 Amber — 80–99%
   - 🔴 Red — over budget + "Over Budget" badge
5. When you add any expense, the backend silently checks the budget:
   - At ≥80%: info toast — *"Food budget at 85% — ₹1,500 remaining"*
   - At >100%: red toast — *"Budget exceeded for Food! Spent ₹6,200 of ₹5,000 (124%)"*

---

## 🎨 UI/UX Details

- **Dark theme** by default; **light theme** toggled via the 🌙/☀️ button, persisted in `localStorage`
- **Sidebar navigation** — Expenses, Income, Dashboard, Analysis, Accounts, Settings
- **Responsive** — stacks vertically on screens ≤768px
- **Animated progress bars** — smooth spring animation on load
- **Interactive calendar** in Analysis — click any day to see a modal with expenses, totals, and category breakdown
- **Category colour dots** — consistently used across forms, filters, charts, and category lists
- All category dropdowns in forms and filters are **dynamically populated from the DB** and update immediately when you add/edit categories in Settings

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18+ recommended
- npm

### Installation

```bash
git clone <repo-url>
cd expense-tracker
npm install
```

### Run (Development)

```bash
npm run dev
# App available at http://localhost:3000
```

### Run (Production)

```bash
node server.js
```

The SQLite database (`expenses.db`) is created automatically on first run with:
- 6 built-in expense categories seeded
- 5 built-in income categories seeded
- 1 default "Main Account" seeded with ₹0 initial balance

---

## 🔧 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port the server listens on |

---

## 📦 Dependencies

| Package | Purpose |
|---------|---------|
| `express` | HTTP server + routing |
| `better-sqlite3` | Synchronous SQLite driver |
| `nodemon` *(dev)* | Auto-restart on file changes |

Frontend uses only **Vanilla JS** and **Vanilla CSS** — no frameworks or bundlers required.

---

## 🔐 Security Notes

- All SQL queries use **parameterised statements** (no string interpolation) — SQL injection safe
- All user input is **trimmed and length-capped** before writing to the DB
- Category and account references are **validated for existence** before insert/update
- No authentication — this is a **single-user local application**. Do not expose to the internet without adding auth

---

## 📁 Notable Implementation Details

- **Balance is never stored** — it is computed fresh on every `GET /accounts` from `initial_balance + SUM(income) - SUM(expenses)`, so it always reflects the actual data
- **Income category validation** is DB-driven, so any custom income category you create is immediately valid for new income entries
- **Budget check** is a separate lightweight API call (`/api/budgets/check/:category`) made client-side after a successful expense save — it never delays or blocks the save
- **`better-sqlite3`** is used synchronously for simplicity and performance; it uses WAL journal mode for concurrent reads
- **Category color map** is maintained client-side as a live dictionary updated whenever categories are fetched, ensuring charts and summaries always use the correct colour for custom categories
- The **`/api/income/summary`** route is declared before `/:id` in Express to prevent "summary" being captured as a numeric ID parameter
