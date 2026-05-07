const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { DB_PATH, UPLOADS_DIR, uploadPath } = require('../lib/runtimePaths');

const db = new sqlite3.Database(DB_PATH);
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

const upload = multer({
  dest: path.join(UPLOADS_DIR, 'tmp'),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 500 }
});

function ensureProductExists(productId, callback) {
  db.get(`SELECT id FROM products WHERE id = ?`, [productId], (err, row) => {
    if (err) return callback(err);
    if (!row) return callback(new Error('invalid product_id'));
    callback(null, row);
  });
}

function toStoredFilename(file, index) {
  const original = path.basename(file.originalname || file.filename || `document-${index}`);
  return `${Date.now()}_${index}_${original}`;
}

router.get('/', (req, res) => {
  const { product_id } = req.query;

  let sql = `SELECT * FROM documents`;
  const params = [];

  if (product_id) {
    sql += ` WHERE product_id = ?`;
    params.push(product_id);
  }

  sql += ` ORDER BY created_at DESC`;

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/upload', upload.any(), (req, res) => {
  const product_id = req.body.product_id;
  const customName = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const files = (req.files || []).filter((file) => file && (file.fieldname === 'file' || file.fieldname === 'files'));

  if (!product_id) {
    return res.status(400).json({ error: 'missing product_id' });
  }

  if (!files.length) {
    return res.status(400).json({ error: 'missing files' });
  }

  ensureProductExists(product_id, (productErr) => {
    if (productErr) {
      return res.status(productErr.message === 'invalid product_id' ? 400 : 500).json({ error: productErr.message });
    }

    const dir = path.join(UPLOADS_DIR, `product_${product_id}`);
    fs.mkdirSync(dir, { recursive: true });

    const inserted = [];
    let done = 0;
    let failed = false;

    files.forEach((file, index) => {
      const originalName = path.basename(file.originalname || file.filename || `document-${index}`);
      const storedFilename = toStoredFilename(file, index);
      const newPath = `${dir}/${storedFilename}`;

      fs.renameSync(file.path, newPath);

      const file_path = newPath.replace(UPLOADS_DIR, '').replace(/\\/g, '/');
      const displayName = files.length === 1 && customName ? customName : originalName;

      db.run(
        `INSERT INTO documents
         (product_id, name, file_path, original_name, mime_type)
         VALUES (?, ?, ?, ?, ?)`,
        [product_id, displayName, file_path, originalName, file.mimetype],
        function(err) {
          if (failed) return;
          if (err) {
            failed = true;
            return res.status(500).json({ error: err.message });
          }

          inserted.push({
            id: this.lastID,
            name: displayName,
            original_name: originalName,
            mime_type: file.mimetype,
            file_path
          });

          done += 1;
          if (done === files.length) {
            res.json({
              success: true,
              uploaded: inserted.length,
              documents: inserted
            });
          }
        }
      );
    });
  });
});

router.put('/:id', (req, res) => {
  const id = req.params.id;
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const product_id = body.product_id;

  db.get(`SELECT * FROM documents WHERE id = ?`, [id], (findErr, row) => {
    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!row) return res.status(404).json({ error: 'Not found' });

    const finalName = name || row.name || row.original_name || null;
    const finalProductId = product_id === undefined || product_id === null || product_id === ''
      ? row.product_id
      : Number(product_id);

    const doUpdate = () => {
      db.run(
        `UPDATE documents
         SET name = ?, product_id = ?
         WHERE id = ?`,
        [finalName, finalProductId, id],
        function(updateErr) {
          if (updateErr) return res.status(500).json({ error: updateErr.message });

          db.get(`SELECT * FROM documents WHERE id = ?`, [id], (getErr, updated) => {
            if (getErr) return res.status(500).json({ error: getErr.message });
            res.json({ success: true, document: updated });
          });
        }
      );
    };

    if (finalProductId !== null && finalProductId !== row.product_id) {
      return ensureProductExists(finalProductId, (productErr) => {
        if (productErr) {
          return res.status(productErr.message === 'invalid product_id' ? 400 : 500).json({ error: productErr.message });
        }
        doUpdate();
      });
    }

    doUpdate();
  });
});

router.delete('/:id', (req, res) => {
  db.get(`SELECT * FROM documents WHERE id = ?`, [req.params.id], (err, row) => {
    if (!row) return res.json({ deleted: 0 });

    const fullPath = uploadPath(row.file_path);

    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    db.run(`DELETE FROM documents WHERE id = ?`, [req.params.id], function(deleteErr) {
      if (deleteErr) return res.status(500).json({ error: deleteErr.message });
      res.json({ deleted: this.changes });
    });
  });
});

module.exports = router;
