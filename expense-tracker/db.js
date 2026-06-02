const Database = require('better-sqlite3');

const db = new Database('expenses.db');

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── expenses table ───────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL CHECK(length(trim(title)) > 0),
    amount     REAL    NOT NULL CHECK(amount > 0),
    category   TEXT    NOT NULL,
    date       TEXT    NOT NULL,
    note       TEXT    NOT NULL DEFAULT '',
    account_id INTEGER NOT NULL DEFAULT 1
  )
`);

// Migrate existing expenses table: add account_id column if it doesn't exist
try {
  db.exec(`ALTER TABLE expenses ADD COLUMN account_id INTEGER NOT NULL DEFAULT 1`);
} catch (_) { /* column already exists — safe to ignore */ }

// ─── categories table ─────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE CHECK(length(trim(name)) > 0),
    color      TEXT    NOT NULL DEFAULT '#8888a0',
    is_default INTEGER NOT NULL DEFAULT 0
  )
`);

// ─── accounts table ───────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL UNIQUE CHECK(length(trim(name)) > 0),
    initial_balance REAL    NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (date('now'))
  )
`);

// ─── income table ─────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS income (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL CHECK(length(trim(title)) > 0),
    amount     REAL    NOT NULL CHECK(amount > 0),
    account_id INTEGER NOT NULL DEFAULT 1,
    category   TEXT    NOT NULL DEFAULT 'Other',
    date       TEXT    NOT NULL,
    note       TEXT    NOT NULL DEFAULT ''
  )
`);

// ─── budgets table ──────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS budgets (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    category_name  TEXT    NOT NULL UNIQUE,
    monthly_amount REAL    NOT NULL CHECK(monthly_amount > 0)
  )
`);

// ─── income_categories table ────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS income_categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE CHECK(length(trim(name)) > 0),
    color      TEXT    NOT NULL DEFAULT '#a99ef9',
    is_default INTEGER NOT NULL DEFAULT 0
  )
`);

// ─── Seed built-in categories (only runs if the table is empty) ───────────────
const catCount = db.prepare('SELECT COUNT(*) as n FROM categories').get();
if (catCount.n === 0) {
  const defaults = [
    { name: 'Food',          color: '#f7706a', is_default: 1 },
    { name: 'Transport',     color: '#6a9ef7', is_default: 1 },
    { name: 'Shopping',      color: '#f7c56a', is_default: 1 },
    { name: 'Bills',         color: '#a99ef9', is_default: 1 },
    { name: 'Entertainment', color: '#6af7c5', is_default: 1 },
    { name: 'Other',         color: '#8888a0', is_default: 1 },
  ];
  const insert = db.prepare(
    'INSERT INTO categories (name, color, is_default) VALUES (?, ?, ?)'
  );
  for (const c of defaults) {
    insert.run(c.name, c.color, c.is_default);
  }
}

// ─── Seed default account (only runs if the table is empty) ──────────────────
const accCount = db.prepare('SELECT COUNT(*) as n FROM accounts').get();
if (accCount.n === 0) {
  db.prepare(
    'INSERT INTO accounts (name, initial_balance) VALUES (?, ?)'
  ).run('Main Account', 0);
}

// ─── Seed default income categories ─────────────────────────────────────────
const incCatCount = db.prepare('SELECT COUNT(*) as n FROM income_categories').get();
if (incCatCount.n === 0) {
  const incDefaults = [
    { name: 'Salary',     color: '#6af7c5', is_default: 1 },
    { name: 'Freelance',  color: '#6a9ef7', is_default: 1 },
    { name: 'Investment', color: '#f7c56a', is_default: 1 },
    { name: 'Gift',       color: '#f77dc4', is_default: 1 },
    { name: 'Other',      color: '#8888a0', is_default: 1 },
  ];
  const insInc = db.prepare('INSERT INTO income_categories (name, color, is_default) VALUES (?, ?, ?)');
  for (const c of incDefaults) insInc.run(c.name, c.color, c.is_default);
}

module.exports = db;
