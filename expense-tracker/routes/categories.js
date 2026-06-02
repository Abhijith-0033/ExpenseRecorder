const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ─── GET /api/categories ──────────────────────────────────────────────────────
// Returns all categories (default + custom) ordered by: built-ins first, then alphabetical
router.get('/categories', (req, res) => {
  try {
    const categories = db.prepare(
      'SELECT * FROM categories ORDER BY is_default DESC, name ASC'
    ).all();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/categories ─────────────────────────────────────────────────────
// Creates a new custom category
router.post('/categories', (req, res) => {
  const { name, color } = req.body;

  // --- Validate name ---
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Category name is required.' });
  }
  const trimmedName = name.trim();
  if (!trimmedName) {
    return res.status(400).json({ error: 'Category name cannot be empty.' });
  }
  if (trimmedName.length > 50) {
    return res.status(400).json({ error: 'Category name must be 50 characters or fewer.' });
  }

  // --- Validate color ---
  if (!color || typeof color !== 'string') {
    return res.status(400).json({ error: 'Color is required.' });
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    return res.status(400).json({ error: 'Color must be a valid 6-digit hex color (e.g. #f77dc4).' });
  }

  // --- Check for duplicate name (case-insensitive) ---
  const existing = db.prepare(
    'SELECT id FROM categories WHERE LOWER(name) = LOWER(?)'
  ).get(trimmedName);
  if (existing) {
    return res.status(409).json({ error: 'A category with this name already exists' });
  }

  // --- Insert ---
  try {
    const result = db.prepare(
      'INSERT INTO categories (name, color, is_default) VALUES (?, ?, 0)'
    ).run(trimmedName, color);

    const created = db.prepare(
      'SELECT * FROM categories WHERE id = ?'
    ).get(result.lastInsertRowid);

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/categories/:id ───────────────────────────────────────────────
// Deletes a custom (non-default) category
router.delete('/categories/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);

  // --- Validate ID ---
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid category ID.' });
  }

  // --- Find category ---
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!category) {
    return res.status(404).json({ error: 'Category not found.' });
  }

  // --- Block deletion of built-in categories ---
  if (category.is_default === 1) {
    return res.status(403).json({ error: 'Cannot delete a built-in category' });
  }

  // --- Block deletion if any expenses use this category ---
  const usageRow = db.prepare(
    'SELECT COUNT(*) as count FROM expenses WHERE category = ?'
  ).get(category.name);
  if (usageRow.count > 0) {
    return res.status(409).json({
      error: `Cannot delete: ${usageRow.count} expense(s) use this category. Reassign them first.`
    });
  }

  // --- Delete ---
  try {
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    res.json({ message: 'Deleted', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
