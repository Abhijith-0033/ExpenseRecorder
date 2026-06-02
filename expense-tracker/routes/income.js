const express = require('express');
const router = express.Router();
const db = require('../db');

const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Investment', 'Gift', 'Other'];

function isValidCategory(name) {
  return INCOME_CATEGORIES.includes(name);
}

function isValidDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function validateIncomeBody(body, isPartial = false) {
  const errors = [];

  if (!isPartial || body.title !== undefined) {
    const title = (body.title || '').trim();
    if (!title) errors.push('Title is required and cannot be empty.');
    else if (title.length > 200) errors.push('Title must be 200 characters or fewer.');
  }

  if (!isPartial || body.amount !== undefined) {
    if (body.amount === undefined || body.amount === null || body.amount === '') {
      if (!isPartial) errors.push('Amount is required.');
    } else {
      const amount = Number(body.amount);
      if (!isFinite(amount) || amount <= 0) {
        errors.push('Amount must be a positive number.');
      } else if (amount > 10000000) {
        errors.push('Amount must not exceed ₹1,00,00,000.');
      }
    }
  }

  if (!isPartial || body.category !== undefined) {
    if (!body.category) {
      if (!isPartial) errors.push('Category is required.');
    } else if (!isValidCategory(body.category)) {
      errors.push(`Invalid category. Please select one of: ${INCOME_CATEGORIES.join(', ')}`);
    }
  }

  if (!isPartial || body.date !== undefined) {
    if (!body.date) {
      if (!isPartial) errors.push('Date is required.');
    } else if (!isValidDate(body.date)) {
      errors.push('Date must be a valid calendar date in YYYY-MM-DD format.');
    }
  }

  if (!isPartial || body.account_id !== undefined) {
    const accountId = Number(body.account_id);
    if (!Number.isInteger(accountId) || accountId <= 0) {
      errors.push('Account ID must be a valid positive integer.');
    } else {
      const acc = db.prepare('SELECT id FROM accounts WHERE id = ?').get(accountId);
      if (!acc) errors.push('Target account does not exist.');
    }
  }

  if (body.note !== undefined && body.note !== null && String(body.note).length > 1000) {
    errors.push('Note must be 1000 characters or fewer.');
  }

  return errors;
}

// GET /api/income/summary  ← must be declared BEFORE /income/:id routes
router.get('/income/summary', (req, res) => {
  try {
    const now       = new Date();
    const year      = now.getFullYear();
    const month     = now.getMonth() + 1;  // 1-indexed
    const monthStr  = String(month).padStart(2, '0');
    const lastDay   = new Date(year, month, 0).getDate();
    const from      = `${year}-${monthStr}-01`;
    const to        = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

    const monthNames = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
    const monthLabel = `${monthNames[month - 1]} ${year}`;

    const rows = db.prepare(`
      SELECT category, SUM(amount) AS total, COUNT(*) AS count
      FROM income
      WHERE date BETWEEN ? AND ?
      GROUP BY category
    `).all(from, to);

    const map = {};
    for (const row of rows) {
      map[row.category] = { total: row.total, count: row.count };
    }

    const breakdown = INCOME_CATEGORIES.map(cat => ({
      category: cat,
      total:    map[cat] ? Number(map[cat].total.toFixed(2)) : 0,
      count:    map[cat] ? map[cat].count : 0
    }));

    const totalIncome = Number(breakdown.reduce((sum, c) => sum + c.total, 0).toFixed(2));

    res.json({
      month:       monthLabel,
      year,
      monthNumber: month,
      totalIncome,
      breakdown
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/income
router.get('/income', (req, res) => {
  const { category, from, to, search, account_id } = req.query;

  if (category && !isValidCategory(category)) {
    return res.status(400).json({ error: 'Invalid category' });
  }

  if (from && to && from > to) {
    return res.status(400).json({ error: "Invalid date range: 'from' must be on or before 'to'" });
  }

  let sql = 'SELECT * FROM income WHERE 1=1';
  const params = [];

  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (from) {
    sql += ' AND date >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND date <= ?';
    params.push(to);
  }
  if (search) {
    sql += ' AND title LIKE ?';
    params.push(`%${search}%`);
  }
  if (account_id) {
    sql += ' AND account_id = ?';
    params.push(Number(account_id));
  }

  sql += ' ORDER BY date DESC, id DESC';

  try {
    const income = db.prepare(sql).all(...params);
    res.json(income);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/income
router.post('/income', (req, res) => {
  const errors = validateIncomeBody(req.body, false);
  if (errors.length > 0) {
    return res.status(400).json({ error: errors[0] });
  }

  const title    = req.body.title.trim();
  const amount   = Number(req.body.amount);
  const category = req.body.category;
  const date     = req.body.date;
  const account_id = Number(req.body.account_id || 1);
  const note     = req.body.note !== undefined && req.body.note !== null
                   ? String(req.body.note).trim()
                   : '';

  try {
    const stmt = db.prepare(
      'INSERT INTO income (title, amount, category, date, note, account_id) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(title, amount, category, date, note, account_id);

    const newIncome = db.prepare('SELECT * FROM income WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newIncome);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/income/:id
router.put('/income/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid income ID.' });
  }

  try {
    const existing = db.prepare('SELECT * FROM income WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Income not found' });
    }

    const errors = validateIncomeBody(req.body, true);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0] });
    }

    const title      = req.body.title      !== undefined ? req.body.title.trim()          : existing.title;
    const amount     = req.body.amount     !== undefined ? Number(req.body.amount)        : existing.amount;
    const category   = req.body.category   !== undefined ? req.body.category              : existing.category;
    const date       = req.body.date       !== undefined ? req.body.date                  : existing.date;
    const account_id = req.body.account_id !== undefined ? Number(req.body.account_id)    : existing.account_id;
    const note       = req.body.note       !== undefined ? String(req.body.note).trim()   : existing.note;

    db.prepare(
      'UPDATE income SET title=?, amount=?, category=?, date=?, note=?, account_id=? WHERE id=?'
    ).run(title, amount, category, date, note, account_id, id);

    const updated = db.prepare('SELECT * FROM income WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/income/:id
router.delete('/income/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid income ID.' });
  }

  try {
    const existing = db.prepare('SELECT * FROM income WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Income not found' });
    }

    db.prepare('DELETE FROM income WHERE id = ?').run(id);
    res.json({ message: 'Deleted successfully', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// (summary route moved to top of file, before :id routes)

module.exports = router;
