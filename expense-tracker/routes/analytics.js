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

    // Query daily
    const dailyRow = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM expenses WHERE date = ?`
    ).get(todayStr);

    // Query weekly
    const weeklyRow = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM expenses WHERE date BETWEEN ? AND ?`
    ).get(weekStartStr, weekEndStr);

    // Query monthly
    const monthlyRow = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM expenses WHERE date BETWEEN ? AND ?`
    ).get(monthStartStr, monthEndStr);

    res.json({
      daily: {
        total: Number(Number(dailyRow.total).toFixed(2)),
        count: dailyRow.count
      },
      weekly: {
        total: Number(Number(weeklyRow.total).toFixed(2)),
        count: weeklyRow.count
      },
      monthly: {
        total: Number(Number(monthlyRow.total).toFixed(2)),
        count: monthlyRow.count
      },
      date: {
        today:      todayStr,
        weekStart:  weekStartStr,
        weekEnd:    weekEndStr,
        monthStart: monthStartStr,
        monthEnd:   monthEndStr
      }
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

module.exports = router;
