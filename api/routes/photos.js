const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('/data/db.sqlite');
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

function deriveMediaKind(mimeType) {
  if (String(mimeType || '').startsWith('video/')) return 'video';
  if (String(mimeType || '').startsWith('image/')) return 'image';
  return 'file';
}

function normalizePhotoRow(row) {
  const fallbackTitle = String(row?.file_path || '').split('/').pop() || null;
  return {
    ...row,
    title: row?.title || fallbackTitle,
    media_kind: deriveMediaKind(row?.mime_type)
  };
}

function productExists(productId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT id FROM products WHERE id = ?', [productId], (err, row) => {
      if (err) reject(err);
      else resolve(!!row);
    });
  });
}

// ===== MULTER =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const productId = req.body.product_id;
    const dir = `/data/uploads/product_${productId}`;
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safeName = Date.now() + '_' + file.originalname.replace(/\s+/g, '_');
    cb(null, safeName);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('unsupported_file_type'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_UPLOAD_BYTES }
});

// ===== GET =====
router.get('/', (req, res) => {
  const productId = req.query.product_id;

  let sql = 'SELECT * FROM photos';
  let params = [];

  if (productId) {
    sql += ' WHERE product_id = ?';
    params.push(productId);
  }

  sql += ' ORDER BY created_at DESC, id DESC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json((rows || []).map(normalizePhotoRow));
  });
});

// ===== POST UPLOAD =====
router.post('/upload', upload.single('photo'), async (req, res) => {
  const productId = req.body.product_id;
  const file = req.file;

  if (!productId || !file) {
    return res.status(400).json({ error: 'Missing data' });
  }

  try {
    const exists = await productExists(productId);
    if (!exists) {
      return res.status(400).json({ error: 'invalid product_id' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const filePath = `/product_${productId}/${file.filename}`;

  db.run(
    `INSERT INTO photos (product_id, file_path, title, mime_type, file_size)
     VALUES (?, ?, ?, ?, ?)`,
    [productId, filePath, file.originalname, file.mimetype, file.size],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      res.json({
        id: this.lastID,
        product_id: productId,
        file_path: filePath,
        title: file.originalname,
        mime_type: file.mimetype,
        media_kind: deriveMediaKind(file.mimetype),
        file_size: file.size
      });
    }
  );
});

// ===== UPDATE META =====
router.put('/:id', (req, res) => {
  const id = req.params.id;
  const body = req.body || {};
  const title = typeof body.title === 'string' ? body.title.trim() : '';

  db.get('SELECT * FROM photos WHERE id = ?', [id], (findErr, row) => {
    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!row) return res.status(404).json({ error: 'Not found' });

    db.run(
      `UPDATE photos
       SET title = ?
       WHERE id = ?`,
      [title || row.title || null, id],
      function (updateErr) {
        if (updateErr) return res.status(500).json({ error: updateErr.message });

        db.get('SELECT * FROM photos WHERE id = ?', [id], (getErr, updated) => {
          if (getErr) return res.status(500).json({ error: getErr.message });
          res.json({ success: true, photo: normalizePhotoRow(updated) });
        });
      }
    );
  });
});

// ===== DELETE =====
router.delete('/:id', (req, res) => {
  const id = req.params.id;

  db.get('SELECT file_path FROM photos WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Not found' });

    const fullPath = '/data/uploads' + row.file_path;

    db.run('DELETE FROM photos WHERE id = ?', [id], function (err) {
      if (err) return res.status(500).json({ error: err.message });

      try {
        fs.unlinkSync(fullPath);
      } catch (e) {}

      res.json({ success: true });
    });
  });
});

module.exports = router;
