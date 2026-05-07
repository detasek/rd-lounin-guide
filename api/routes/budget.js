const express = require('express');
const db = require('../db/db');

const router = express.Router();

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS budget_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      name TEXT NOT NULL,
      planned_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'open',
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS budget_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_budget_item_id INTEGER,
      target_name TEXT NOT NULL DEFAULT 'Disponibilní částka',
      amount REAL NOT NULL,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

router.get('/', (_req, res) => {
  db.all(
    `
      SELECT
        products.id AS product_id,
        products.name AS product_name,
        COALESCE(budget_items.id, NULL) AS budget_item_id,
        COALESCE(budget_items.name, products.name) AS name,
        COALESCE(budget_items.planned_amount, 0) AS planned_amount,
        COALESCE(budget_items.status, 'open') AS status,
        COALESCE(SUM(receipts.total_amount), 0) AS spent_amount
      FROM products
      LEFT JOIN budget_items ON budget_items.product_id = products.id
      LEFT JOIN receipts ON receipts.product_id = products.id
      GROUP BY products.id, budget_items.id
      ORDER BY products.id ASC
    `,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json((rows || []).map((row) => {
        const planned = numberOrZero(row.planned_amount);
        const spent = numberOrZero(row.spent_amount);
        return {
          ...row,
          planned_amount: planned,
          spent_amount: spent,
          remaining_amount: planned - spent,
          progress_pct: planned > 0 ? Math.round((spent / planned) * 100) : 0,
          is_over_budget: planned > 0 && spent > planned
        };
      }));
    }
  );
});

router.put('/:productId', (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: 'invalid_product_id' });

  const plannedAmount = numberOrZero(req.body?.planned_amount);
  const name = String(req.body?.name || '').trim();
  const status = String(req.body?.status || 'open').trim();
  const note = String(req.body?.note || '').trim() || null;

  db.get('SELECT id, name FROM products WHERE id = ?', [productId], (productErr, product) => {
    if (productErr) return res.status(500).json({ error: productErr.message });
    if (!product) return res.status(404).json({ error: 'product_not_found' });

    db.get('SELECT id FROM budget_items WHERE product_id = ?', [productId], (findErr, existing) => {
      if (findErr) return res.status(500).json({ error: findErr.message });
      const itemName = name || product.name;

      if (existing) {
        return db.run(
          `UPDATE budget_items SET name = ?, planned_amount = ?, status = ?, note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [itemName, plannedAmount, status, note, existing.id],
          function (updateErr) {
            if (updateErr) return res.status(500).json({ error: updateErr.message });
            res.json({ success: true, id: existing.id });
          }
        );
      }

      db.run(
        `INSERT INTO budget_items (product_id, name, planned_amount, status, note) VALUES (?, ?, ?, ?, ?)`,
        [productId, itemName, plannedAmount, status, note],
        function (insertErr) {
          if (insertErr) return res.status(500).json({ error: insertErr.message });
          res.status(201).json({ success: true, id: this.lastID });
        }
      );
    });
  });
});

router.post('/:productId/close', (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: 'invalid_product_id' });

  db.get(
    `
      SELECT
        budget_items.id,
        COALESCE(budget_items.planned_amount, 0) AS planned_amount,
        COALESCE(SUM(receipts.total_amount), 0) AS spent_amount
      FROM budget_items
      LEFT JOIN receipts ON receipts.product_id = budget_items.product_id
      WHERE budget_items.product_id = ?
      GROUP BY budget_items.id
    `,
    [productId],
    (err, item) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!item) return res.status(404).json({ error: 'budget_item_not_found' });

      const remaining = numberOrZero(item.planned_amount) - numberOrZero(item.spent_amount);
      db.run(`UPDATE budget_items SET status = 'closed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [item.id], (updateErr) => {
        if (updateErr) return res.status(500).json({ error: updateErr.message });
        if (remaining <= 0) return res.json({ success: true, remaining_amount: remaining, transferred: 0 });

        db.run(
          `INSERT INTO budget_transfers (source_budget_item_id, target_name, amount, note) VALUES (?, ?, ?, ?)`,
          [item.id, req.body?.target_name || 'Disponibilní částka', remaining, req.body?.note || 'Uzavření stavebního okruhu'],
          (transferErr) => {
            if (transferErr) return res.status(500).json({ error: transferErr.message });
            res.json({ success: true, remaining_amount: remaining, transferred: remaining });
          }
        );
      });
    }
  );
});

module.exports = router;
