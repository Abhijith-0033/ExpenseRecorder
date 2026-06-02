const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ─── GET /api/income-categories ───────────────────────────────────────────────
router.get('/income-categories', (req, res) => {
  try {
    const cats = db.prepare(
      'SELECT * FROM income_categories ORDER BY is_default DESC, name ASC'
    ).all();
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/income-categories ──────────────────────────────────────────────
router.post('/income-categories', (req, res) => {
  const { name, color } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Category name is required.' });
  }
  const trimmed = name.trim();
  if (!trimmed) return res.status(400).json({ error: 'Category name cannot be empty.' });
  if (trimmed.length > 50) return res.status(400).json({ error: 'Name must be 50 characters or fewer.' });

  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return res.status(400).json({ error: 'Color must be a valid 6-digit hex color (e.g. #a99ef9).' });
  }

  const dup = db.prepare('SELECT id FROM income_categories WHERE LOWER(name) = LOWER(?)').get(trimmed);
  if (dup) return res.status(409).json({ error: 'A category with this name already exists.' });

  try {
    const result = db.prepare(
      'INSERT INTO income_categories (name, color, is_default) VALUES (?, ?, 0)'
    ).run(trimmed, color);
    const created = db.prepare('SELECT * FROM income_categories WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/income-categories/:id ───────────────────────────────────────────
router.put('/income-categories/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid category ID.' });
  }

  const cat = db.prepare('SELECT * FROM income_categories WHERE id = ?').get(id);
  if (!cat) return res.status(404).json({ error: 'Category not found.' });

  const { name, color } = req.body;

  if (color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return res.status(400).json({ error: 'Color must be a valid 6-digit hex color.' });
  }

  let newName = cat.name;
  if (name !== undefined) {
    if (cat.is_default) {
      return res.status(403).json({ error: 'Cannot rename a built-in income category.' });
    }
    const trimmed = String(name).trim();
    if (!trimmed) return res.status(400).json({ error: 'Category name cannot be empty.' });
    if (trimmed.length > 50) return res.status(400).json({ error: 'Name must be 50 characters or fewer.' });
    const dup = db.prepare('SELECT id FROM income_categories WHERE LOWER(name) = LOWER(?) AND id != ?').get(trimmed, id);
    if (dup) return res.status(409).json({ error: 'A category with this name already exists.' });
    newName = trimmed;
  }

  const newColor = color !== undefined ? color : cat.color;

  try {
    db.prepare('UPDATE income_categories SET name = ?, color = ? WHERE id = ?').run(newName, newColor, id);
    const updated = db.prepare('SELECT * FROM income_categories WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/income-categories/:id ────────────────────────────────────────
router.delete('/income-categories/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid category ID.' });
  }

  const cat = db.prepare('SELECT * FROM income_categories WHERE id = ?').get(id);
  if (!cat) return res.status(404).json({ error: 'Category not found.' });

  if (cat.is_default === 1) {
    return res.status(403).json({ error: 'Cannot delete a built-in income category.' });
  }

  // Block if any income entries use this category
  const usage = db.prepare('SELECT COUNT(*) as count FROM income WHERE category = ?').get(cat.name);
  if (usage.count > 0) {
    return res.status(409).json({
      error: `Cannot delete: ${usage.count} income record(s) use this category. Reassign them first.`
    });
  }

  try {
    db.prepare('DELETE FROM income_categories WHERE id = ?').run(id);
    res.json({ message: 'Deleted', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
