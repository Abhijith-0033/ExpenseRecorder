# Expense Tracker

A personal expense tracker web app that runs locally. Track your daily spending in INR (₹) with category breakdowns and monthly summaries.

---

## How to Run

### Prerequisites

Node.js 18+ is required. Check your version:
```bash
node --version
```

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# 3. Open in your browser
# Visit: http://localhost:3000
```

### Dev Mode (auto-restart on file changes)

```bash
npm run dev
```

The SQLite database file (`expenses.db`) is created automatically on first run in the project root. No setup or migration needed.

---

## Stack Choices & Tradeoffs

- **Node.js + Express**: Chosen for minimal boilerplate and fast local setup. No build step required.
- **better-sqlite3**: Synchronous SQLite driver — simpler than async alternatives for a single-user local tool. The database is a plain `.db` file in the project root; backup by copying it.
- **Vanilla JS (no framework)**: A framework like React would add a build step for no meaningful benefit at this scale. The DOM API is sufficient.
- **No ORM**: Direct SQL with `better-sqlite3`'s prepared statements. Parameterized queries prevent SQL injection. An ORM would add abstraction overhead without benefit at this complexity level.
- **Currency**: INR (₹), formatted with `en-IN` locale for Indian numbering system (lakhs/crores).

---

## What's Done

- [x] Add expense with all required fields (title, amount, category, date, note)
- [x] View list sorted by date descending, all fields shown
- [x] Edit any expense inline in the form
- [x] Delete any expense with confirmation dialog
- [x] Monthly summary — total + category breakdown with visual bars
- [x] Filter by category (exact), date range (from/to), title (partial match)
- [x] Input validation on both client and server
- [x] Empty state handling
- [x] XSS-safe rendering (`textContent` for user data)
- [x] Parameterized SQL queries (no injection risk)
- [x] Date filter edge case handling (`from > to` returns 400)

---

## What's Skipped (and Why)

- **Authentication / multi-user**: Out of scope for a personal local tool
- **Test suite**: Skipped per requirements
- **Deployment**: Local-only per requirements
- **CSV export / import**: Not in spec
- **Recurring expenses**: Not in spec
- **Multi-currency**: Explicitly single-currency (INR)

---

## Known Rough Edges

- The SQLite file is not encrypted. It's a plain file on disk. For sensitive financial data on shared machines, consider adding encryption separately.
- "Edit" populates the form at the top of the page; on mobile this requires scrolling up. A modal would improve this but adds complexity.
- Summary is always for the current calendar month; there's no way to view historical monthly summaries.
