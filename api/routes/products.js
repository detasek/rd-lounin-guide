const express = require('express');
const sqlite3 = require('sqlite3').verbose();

const router = express.Router();
const DB_PATH = '/data/db.sqlite';

function openDb() {
  return new sqlite3.Database(DB_PATH);
}

// GET ALL PRODUCTS
router.get('/', (req, res) => {
  const db = openDb();

  db.all('SELECT * FROM products ORDER BY id DESC', [], (err, rows) => {
    db.close();

    if (err) {
      return res.status(500).json({ error: err.message });
    }

    res.json(rows);
  });
});

// GET ONE PRODUCT
router.get('/:id', (req, res) => {
  const db = openDb();

  db.get('SELECT * FROM products WHERE id = ?', [req.params.id], (err, row) => {
    db.close();

    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!row) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(row);
  });
});

// CREATE PRODUCT
router.post('/', (req, res) => {
  const db = openDb();

  const {
    name,
    description,
    phase_id,
    room_id,
    vendor,
    manufacturer,
    model,
    serial_number,
    purchase_date
  } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const sql = `
    INSERT INTO products
    (name, description, phase_id, room_id, vendor, manufacturer, model, serial_number, purchase_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    name,
    description || null,
    phase_id || null,
    room_id || null,
    vendor || null,
    manufacturer || null,
    model || null,
    serial_number || null,
    purchase_date || null
  ];

  db.run(sql, params, function(err) {
    if (err) {
      db.close();
      return res.status(500).json({ error: err.message });
    }

    const newId = this.lastID;

    db.get('SELECT * FROM products WHERE id = ?', [newId], (err, row) => {
      db.close();

      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.status(201).json(row);
    });
  });
});

// UPDATE PRODUCT
router.put('/:id', (req, res) => {
  const db = openDb();

  const {
    name,
    description,
    phase_id,
    room_id,
    vendor,
    manufacturer,
    model,
    serial_number,
    purchase_date
  } = req.body;

  const sql = `
    UPDATE products SET
      name = ?,
      description = ?,
      phase_id = ?,
      room_id = ?,
      vendor = ?,
      manufacturer = ?,
      model = ?,
      serial_number = ?,
      purchase_date = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  const params = [
    name,
    description || null,
    phase_id || null,
    room_id || null,
    vendor || null,
    manufacturer || null,
    model || null,
    serial_number || null,
    purchase_date || null,
    req.params.id
  ];

  db.run(sql, params, function(err) {
    if (err) {
      db.close();
      return res.status(500).json({ error: err.message });
    }

    if (this.changes === 0) {
      db.close();
      return res.status(404).json({ error: 'Product not found' });
    }

    db.get('SELECT * FROM products WHERE id = ?', [req.params.id], (err, row) => {
      db.close();

      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.json(row);
    });
  });
});

// DELETE PRODUCT
router.delete('/:id', (req, res) => {
  const db = openDb();

  db.run('DELETE FROM products WHERE id = ?', [req.params.id], function(err) {
    db.close();

    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ success: true });
  });
});

module.exports = router;
