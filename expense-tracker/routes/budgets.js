const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ─── GET /api/budgets ─────────────────────────────────────────────────────────
// Returns all budgets
router.get('/budgets', (req, res) => {
  try {
    const budgets = db.prepare('SELECT * FROM budgets ORDER BY category_name ASC').all();
    res.json(budgets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/budgets/status ──────────────────────────────────────────────────
// Returns each budget with current-month spending, pct used, and over-budget flag
router.get('/budgets/status', (req, res) => {
  try {
    const now      = new Date();
    const year     = now.getFullYear();
    const month    = String(now.getMonth() + 1).padStart(2, '0');
    const from     = `${year}-${month}-01`;
    const lastDay  = new Date(year, now.getMonth() + 1, 0).getDate();
    const to       = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

    const budgets  = db.prepare('SELECT * FROM budgets ORDER BY category_name ASC').all();

    const result = budgets.map(b => {
      const row = db.prepare(
        'SELECT COALESCE(SUM(amount), 0) as spent FROM expenses WHERE category = ? AND date BETWEEN ? AND ?'
      ).get(b.category_name, from, to);

      const spent = Number(row.spent.toFixed(2));
      const pct   = b.monthly_amount > 0 ? Math.round((spent / b.monthly_amount) * 100) : 0;

      return {
        id:             b.id,
        category_name:  b.category_name,
        monthly_amount: b.monthly_amount,
        spent,
        remaining:      Number(Math.max(0, b.monthly_amount - spent).toFixed(2)),
        pct:            Math.min(pct, 999),   // cap display at 999%
        over_budget:    spent > b.monthly_amount
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/budgets/check/:category ─────────────────────────────────────────
// Quick check for a single category — used after adding an expense
router.get('/budgets/check/:category', (req, res) => {
  try {
    const category = req.params.category;
    const budget   = db.prepare('SELECT * FROM budgets WHERE category_name = ?').get(category);
    if (!budget) return res.json({ hasBudget: false });

    const now     = new Date();
    const year    = now.getFullYear();
    const month   = String(now.getMonth() + 1).padStart(2, '0');
    const from    = `${year}-${month}-01`;
    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
    const to      = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

    const row   = db.prepare(
      'SELECT COALESCE(SUM(amount), 0) as spent FROM expenses WHERE category = ? AND date BETWEEN ? AND ?'
    ).get(category, from, to);

    const spent      = Number(row.spent.toFixed(2));
    const pct        = Math.round((spent / budget.monthly_amount) * 100);
    const overBudget = spent > budget.monthly_amount;

    res.json({
      hasBudget:      true,
      monthly_amount: budget.monthly_amount,
      spent,
      pct,
      over_budget:    overBudget
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/budgets ────────────────────────────────────────────────────────
router.post('/budgets', (req, res) => {
  const { category_name, monthly_amount } = req.body;

  if (!category_name || typeof category_name !== 'string' || !category_name.trim()) {
    return res.status(400).json({ error: 'Category name is required.' });
  }
  const amount = Number(monthly_amount);
  if (!isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Budget amount must be a positive number.' });
  }
  if (amount > 10000000) {
    return res.status(400).json({ error: 'Budget must not exceed ₹1,00,00,000.' });
  }

  // Upsert — update if exists, insert if not
  try {
    const existing = db.prepare('SELECT id FROM budgets WHERE category_name = ?').get(category_name.trim());
    if (existing) {
      db.prepare('UPDATE budgets SET monthly_amount = ? WHERE category_name = ?').run(amount, category_name.trim());
      const updated = db.prepare('SELECT * FROM budgets WHERE category_name = ?').get(category_name.trim());
      return res.json(updated);
    }
    const result = db.prepare(
      'INSERT INTO budgets (category_name, monthly_amount) VALUES (?, ?)'
    ).run(category_name.trim(), amount);
    const created = db.prepare('SELECT * FROM budgets WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/budgets/:id ─────────────────────────────────────────────────────
router.put('/budgets/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid budget ID.' });
  }

  const budget = db.prepare('SELECT * FROM budgets WHERE id = ?').get(id);
  if (!budget) return res.status(404).json({ error: 'Budget not found.' });

  const amount = Number(req.body.monthly_amount);
  if (!isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Budget amount must be a positive number.' });
  }

  try {
    db.prepare('UPDATE budgets SET monthly_amount = ? WHERE id = ?').run(amount, id);
    const updated = db.prepare('SELECT * FROM budgets WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/budgets/:id ──────────────────────────────────────────────────
router.delete('/budgets/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid budget ID.' });
  }

  const budget = db.prepare('SELECT * FROM budgets WHERE id = ?').get(id);
  if (!budget) return res.status(404).json({ error: 'Budget not found.' });

  try {
    db.prepare('DELETE FROM budgets WHERE id = ?').run(id);
    res.json({ message: 'Budget removed.', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
