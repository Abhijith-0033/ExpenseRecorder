const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ─── Helper: compute balance for an account ───────────────────────────────────
function computeBalance(accountId) {
  const acc = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!acc) return null;

  const incomeRow   = db.prepare(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM income WHERE account_id = ?'
  ).get(accountId);
  const expenseRow  = db.prepare(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE account_id = ?'
  ).get(accountId);

  const totalIncome   = Number(incomeRow.total);
  const totalExpenses = Number(expenseRow.total);
  const balance       = Number(acc.initial_balance) + totalIncome - totalExpenses;

  return {
    id:             acc.id,
    name:           acc.name,
    initial_balance: Number(acc.initial_balance),
    total_income:   Number(totalIncome.toFixed(2)),
    total_expenses: Number(totalExpenses.toFixed(2)),
    balance:        Number(balance.toFixed(2)),
    created_at:     acc.created_at
  };
}

// GET /api/accounts
router.get('/accounts', (req, res) => {
  try {
    const accounts = db.prepare('SELECT id FROM accounts ORDER BY id ASC').all();
    const result   = accounts.map(a => computeBalance(a.id)).filter(Boolean);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/accounts/:id/balance
router.get('/accounts/:id/balance', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid account ID.' });
  }
  try {
    const data = computeBalance(id);
    if (!data) return res.status(404).json({ error: 'Account not found.' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/accounts
router.post('/accounts', (req, res) => {
  const name            = (req.body.name || '').trim();
  const initial_balance = Number(req.body.initial_balance) || 0;

  if (!name) return res.status(400).json({ error: 'Account name is required.' });
  if (name.length > 100) return res.status(400).json({ error: 'Name must be 100 chars or fewer.' });
  if (!isFinite(initial_balance) || initial_balance < 0) {
    return res.status(400).json({ error: 'Initial balance must be a non-negative number.' });
  }

  try {
    const result = db.prepare(
      'INSERT INTO accounts (name, initial_balance) VALUES (?, ?)'
    ).run(name, initial_balance);
    const data = computeBalance(result.lastInsertRowid);
    res.status(201).json(data);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: `An account named "${name}" already exists.` });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/accounts/:id
router.put('/accounts/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid account ID.' });
  }

  try {
    const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Account not found.' });

    const name            = req.body.name !== undefined ? req.body.name.trim() : existing.name;
    const initial_balance = req.body.initial_balance !== undefined
      ? Number(req.body.initial_balance)
      : existing.initial_balance;

    if (!name) return res.status(400).json({ error: 'Account name is required.' });
    if (!isFinite(initial_balance) || initial_balance < 0) {
      return res.status(400).json({ error: 'Initial balance must be a non-negative number.' });
    }

    db.prepare(
      'UPDATE accounts SET name = ?, initial_balance = ? WHERE id = ?'
    ).run(name, initial_balance, id);

    res.json(computeBalance(id));
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'An account with that name already exists.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/accounts/:id
router.delete('/accounts/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid account ID.' });
  }

  try {
    const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Account not found.' });

    // Prevent deleting the only account
    const total = db.prepare('SELECT COUNT(*) as n FROM accounts').get().n;
    if (total <= 1) {
      return res.status(409).json({ error: 'Cannot delete the only account. Rename it instead.' });
    }

    // Check for linked data
    const hasIncome   = db.prepare('SELECT COUNT(*) as n FROM income   WHERE account_id = ?').get(id).n;
    const hasExpenses = db.prepare('SELECT COUNT(*) as n FROM expenses WHERE account_id = ?').get(id).n;
    if (hasIncome > 0 || hasExpenses > 0) {
      return res.status(409).json({
        error: 'Cannot delete an account that has linked income or expenses.'
      });
    }

    db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    res.json({ message: 'Deleted', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
