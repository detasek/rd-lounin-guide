const express = require('express');
const db = require('../db/db');

const router = express.Router();

db.run(`
  CREATE TABLE IF NOT EXISTS diary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_date TEXT NOT NULL DEFAULT (date('now')),
    content TEXT NOT NULL,
    product_id INTEGER,
    phase_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

router.get('/diary', (req, res) => {
  db.all(
    `
      SELECT *
      FROM diary
      ORDER BY entry_date DESC, id DESC
    `,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.post('/diary', (req, res) => {
  const body = req.body || {};
  const content = String(body.content || '').trim();
  const productId = body.product_id || null;
  const phaseId = body.phase_id || null;

  if (!content) {
    return res.status(400).json({ error: 'content_required' });
  }

  db.run(
    `
      INSERT INTO diary (content, product_id, phase_id)
      VALUES (?, ?, ?)
    `,
    [content, productId, phaseId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      db.get(
        'SELECT * FROM diary WHERE id = ?',
        [this.lastID],
        (getErr, row) => {
          if (getErr) return res.status(500).json({ error: getErr.message });
          res.status(201).json(row);
        }
      );
    }
  );
});

module.exports = router;
