const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ─── Date Utility Helpers ─────────────────────────────────────────────────────

// Convert a Date object to 'YYYY-MM-DD' string using LOCAL time (not UTC)
function toDateString(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Returns the Monday of the ISO week containing `dt`
function getMondayOfWeek(dt) {
  const day = dt.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  // ISO week: Mon=0 offset, Sun=6 offset
  const offset = (day + 6) % 7;  // Mon→0, Tue→1, ..., Sun→6
  const monday = new Date(dt);
  monday.setDate(dt.getDate() - offset);
  return monday;
}

// Returns the Sunday of the ISO week containing `dt`
function getSundayOfWeek(dt) {
  const monday = getMondayOfWeek(dt);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}

// Returns last day of month for given year + 1-based month
function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// Short month names array
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];
const SHORT_MONTH_NAMES = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec'
];

// ─── GET /api/analytics/overview ─────────────────────────────────────────────
router.get('/overview', (req, res) => {
  try {
    const now = new Date();

    // Today
    const todayStr = toDateString(now);

    // This week (Monday – Sunday, ISO week)
    const weekStart = getMondayOfWeek(now);
    const weekEnd   = getSundayOfWeek(now);
    const weekStartStr = toDateString(weekStart);
    const weekEndStr   = toDateString(weekEnd);

    // This month
    const year     = now.getFullYear();
    const month    = now.getMonth() + 1;  // 1-indexed
    const monthStr = String(month).padStart(2, '0');
    const last     = lastDayOfMonth(year, month);
    const monthStartStr = `${year}-${monthStr}-01`;
    const monthEndStr   = `${year}-${monthStr}-${String(last).padStart(2, '0')}`;

    // Query daily expenses
    const dailyRow = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM expenses WHERE date = ?`
    ).get(todayStr);

    // Query daily income
    const dailyIncomeRow = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM income WHERE date = ?`
    ).get(todayStr);

    // Query weekly expenses
    const weeklyRow = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM expenses WHERE date BETWEEN ? AND ?`
    ).get(weekStartStr, weekEndStr);

    // Query weekly income
    const weeklyIncomeRow = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM income WHERE date BETWEEN ? AND ?`
    ).get(weekStartStr, weekEndStr);

    // Query monthly expenses
    const monthlyRow = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM expenses WHERE date BETWEEN ? AND ?`
    ).get(monthStartStr, monthEndStr);

    // Query monthly income
    const monthlyIncomeRow = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM income WHERE date BETWEEN ? AND ?`
    ).get(monthStartStr, monthEndStr);

    // Compute net balance across all accounts
    const initialAccRow = db.prepare('SELECT COALESCE(SUM(initial_balance), 0) as total FROM accounts').get();
    const allIncomeRow  = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM income').get();
    const allExpenseRow = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM expenses').get();
    const accountBalance = Number(initialAccRow.total) + Number(allIncomeRow.total) - Number(allExpenseRow.total);

    res.json({
      daily: {
        total: Number(Number(dailyRow.total).toFixed(2)),
        count: dailyRow.count,
        income: Number(Number(dailyIncomeRow.total).toFixed(2)),
        incomeCount: dailyIncomeRow.count
      },
      weekly: {
        total: Number(Number(weeklyRow.total).toFixed(2)),
        count: weeklyRow.count,
        income: Number(Number(weeklyIncomeRow.total).toFixed(2)),
        incomeCount: weeklyIncomeRow.count
      },
      monthly: {
        total: Number(Number(monthlyRow.total).toFixed(2)),
        count: monthlyRow.count,
        income: Number(Number(monthlyIncomeRow.total).toFixed(2)),
        incomeCount: monthlyIncomeRow.count
      },
      date: {
        today:      todayStr,
        weekStart:  weekStartStr,
        weekEnd:    weekEndStr,
        monthStart: monthStartStr,
        monthEnd:   monthEndStr
      },
      accountBalance: Number(accountBalance.toFixed(2))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/analytics/monthly-detail?year=YYYY&month=MM ────────────────────
router.get('/monthly-detail', (req, res) => {
  try {
    const now = new Date();

    // Parse and validate query params
    let year  = parseInt(req.query.year  || now.getFullYear(), 10);
    let month = parseInt(req.query.month || (now.getMonth() + 1), 10);

    if (isNaN(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'year must be between 2000 and 2100.' });
    }
    if (isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'month must be between 1 and 12.' });
    }

    const monthStr   = String(month).padStart(2, '0');
    const last       = lastDayOfMonth(year, month);
    const from       = `${year}-${monthStr}-01`;
    const to         = `${year}-${monthStr}-${String(last).padStart(2, '0')}`;
    const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

    // ── Daily totals for every day in the month ───────────────────────────────
    // Fetch all expenses in the month grouped by day
    const dailyRows = db.prepare(
      `SELECT CAST(substr(date, 9, 2) AS INTEGER) as day,
              SUM(amount) as total,
              COUNT(*) as count
       FROM expenses
       WHERE date BETWEEN ? AND ?
       GROUP BY date
       ORDER BY date ASC`
    ).all(from, to);

    // Build a map: day number → {total, count}
    const dailyMap = {};
    for (const row of dailyRows) {
      dailyMap[row.day] = { total: row.total, count: row.count };
    }

    // Generate full array for all days in month (1 to last), filling gaps with 0
    const dailyTotals = [];
    for (let day = 1; day <= last; day++) {
      const dayStr = `${year}-${monthStr}-${String(day).padStart(2, '0')}`;
      dailyTotals.push({
        day,
        date:  dayStr,
        total: dailyMap[day] ? Number(Number(dailyMap[day].total).toFixed(2)) : 0,
        count: dailyMap[day] ? dailyMap[day].count : 0
      });
    }

    // ── Total spent & expense count for the month ─────────────────────────────
    const totalsRow = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM expenses WHERE date BETWEEN ? AND ?`
    ).get(from, to);
    const totalSpent   = Number(Number(totalsRow.total).toFixed(2));
    const expenseCount = totalsRow.count;

    // ── Category breakdown ────────────────────────────────────────────────────
    // All categories (from categories table so custom ones appear too)
    const allCategories = db.prepare(
      'SELECT name, color FROM categories ORDER BY is_default DESC, name ASC'
    ).all();

    // Per-category totals for this month
    const catRows = db.prepare(
      `SELECT category, SUM(amount) as total, COUNT(*) as count
       FROM expenses
       WHERE date BETWEEN ? AND ?
       GROUP BY category`
    ).all(from, to);

    // Build map: category name → {total, count}
    const catMap = {};
    for (const row of catRows) {
      catMap[row.category] = { total: row.total, count: row.count };
    }

    // Build full breakdown array for ALL categories
    const categoryBreakdown = allCategories.map(cat => {
      const catTotal = catMap[cat.name] ? Number(catMap[cat.name].total) : 0;
      const catCount = catMap[cat.name] ? catMap[cat.name].count : 0;
      const pct = totalSpent > 0 ? Number((catTotal / totalSpent * 100).toFixed(1)) : 0;
      return {
        category:   cat.name,
        color:      cat.color,
        total:      Number(catTotal.toFixed(2)),
        count:      catCount,
        percentage: pct
      };
    });

    // Sort by total descending
    categoryBreakdown.sort((a, b) => b.total - a.total);

    res.json({
      year,
      month,
      monthName:         monthLabel,
      totalSpent,
      expenseCount,
      dailyTotals,
      categoryBreakdown
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/analytics/comparison?months=N ───────────────────────────────────
router.get('/comparison', (req, res) => {
  try {
    let n = parseInt(req.query.months || '6', 10);
    if (isNaN(n) || n < 2 || n > 12) {
      n = 6; // clamp to default instead of erroring
    }

    const now     = new Date();
    const results = [];

    // Build list of last N months going backwards from current month
    // Example: if current is June 2025, and n=3 → [April 2025, May 2025, June 2025]
    for (let i = n - 1; i >= 0; i--) {
      // Go back `i` months from now
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;  // 1-indexed
      const mStr  = String(m).padStart(2, '0');
      const last  = lastDayOfMonth(y, m);
      const from  = `${y}-${mStr}-01`;
      const to    = `${y}-${mStr}-${String(last).padStart(2, '0')}`;
      const label = `${SHORT_MONTH_NAMES[m - 1]} ${y}`;

      const row = db.prepare(
        `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
         FROM expenses WHERE date BETWEEN ? AND ?`
      ).get(from, to);

      results.push({
        label,
        year:  y,
        month: m,
        total: Number(Number(row.total).toFixed(2)),
        count: row.count
      });
    }

    // Results are already in chronological order (oldest first) because
    // the loop goes from i = n-1 (furthest back) down to i = 0 (current month)
    res.json({ months: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/analytics/cashflow?months=N ─────────────────────────────────────
router.get('/cashflow', (req, res) => {
  try {
    let n = parseInt(req.query.months || '6', 10);
    if (isNaN(n) || n < 2 || n > 12) {
      n = 6;
    }

    const now     = new Date();
    const results = [];

    for (let i = n - 1; i >= 0; i--) {
      const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y     = d.getFullYear();
      const m     = d.getMonth() + 1;
      const mStr  = String(m).padStart(2, '0');
      const last  = lastDayOfMonth(y, m);
      const from  = `${y}-${mStr}-01`;
      const to    = `${y}-${mStr}-${String(last).padStart(2, '0')}`;
      const label = `${SHORT_MONTH_NAMES[m - 1]} ${y}`;

      const expRow = db.prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date BETWEEN ? AND ?`
      ).get(from, to);

      const incRow = db.prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM income WHERE date BETWEEN ? AND ?`
      ).get(from, to);

      results.push({
        label,
        year:     y,
        month:    m,
        expenses: Number(Number(expRow.total).toFixed(2)),
        income:   Number(Number(incRow.total).toFixed(2))
      });
    }

    res.json({ months: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/analytics/daily-expenses?year=YYYY&month=MM&day=DD ──────────────
router.get('/daily-expenses', (req, res) => {
  try {
    const { year, month, day } = req.query;
    if (!year || !month || !day) {
      return res.status(400).json({ error: 'year, month, and day are required.' });
    }

    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);

    if (isNaN(y) || y < 2000 || y > 2100) {
      return res.status(400).json({ error: 'Invalid year.' });
    }
    if (isNaN(m) || m < 1 || m > 12) {
      return res.status(400).json({ error: 'Invalid month.' });
    }
    if (isNaN(d) || d < 1 || d > 31) {
      return res.status(400).json({ error: 'Invalid day.' });
    }

    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    // Get all expenses on this day
    const expenses = db.prepare(
      `SELECT e.*, a.name as account_name
       FROM expenses e
       LEFT JOIN accounts a ON e.account_id = a.id
       WHERE e.date = ?
       ORDER BY e.id DESC`
    ).all(dateStr);

    // Calculate total and count
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    const count = expenses.length;

    // Get categories with colors
    const categories = db.prepare('SELECT name, color FROM categories').all();
    const catColorMap = {};
    for (const cat of categories) {
      catColorMap[cat.name] = cat.color;
    }

    // Group by category for breakdown
    const catMap = {};
    for (const exp of expenses) {
      if (!catMap[exp.category]) {
        catMap[exp.category] = {
          category: exp.category,
          total: 0,
          count: 0,
          color: catColorMap[exp.category] || '#8888a0'
        };
      }
      catMap[exp.category].total += exp.amount;
      catMap[exp.category].count += 1;
    }

    const categoryBreakdown = Object.values(catMap).map(c => {
      c.total = Number(c.total.toFixed(2));
      return c;
    });

    // Sort category breakdown by total descending
    categoryBreakdown.sort((a, b) => b.total - a.total);

    res.json({
      date: dateStr,
      total: Number(total.toFixed(2)),
      count,
      expenses,
      categoryBreakdown
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;


