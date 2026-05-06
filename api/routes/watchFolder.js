const express = require('express');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const router = express.Router();
const db = new sqlite3.Database('/data/db.sqlite');

const WATCH_MEDIA_DIR = '/data/watch-folder/media';
const IMPORTABLE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic',
  '.mp4', '.mov', '.m4v', '.webm', '.avi'
]);

function ensureWatchDir() {
  fs.mkdirSync(WATCH_MEDIA_DIR, { recursive: true });
}

function normalizeProductId(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function productExists(productId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT id FROM products WHERE id = ?', [productId], (err, row) => {
      if (err) reject(err);
      else resolve(!!row);
    });
  });
}

function detectMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (['.jpg', '.jpeg'].includes(ext)) return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.bmp') return 'image/bmp';
  if (ext === '.heic') return 'image/heic';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.m4v') return 'video/x-m4v';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.avi') return 'video/x-msvideo';
  return 'application/octet-stream';
}

function detectMediaKind(mimeType) {
  if (String(mimeType || '').startsWith('video/')) return 'video';
  if (String(mimeType || '').startsWith('image/')) return 'image';
  return 'file';
}

function listImportableFiles() {
  ensureWatchDir();

  return fs.readdirSync(WATCH_MEDIA_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => !entry.name.startsWith('.'))
    .map((entry) => {
      const ext = path.extname(entry.name).toLowerCase();
      if (!IMPORTABLE_EXTENSIONS.has(ext)) return null;

      const fullPath = path.join(WATCH_MEDIA_DIR, entry.name);
      const stat = fs.statSync(fullPath);
      if (!stat.size) return null;

      const mimeType = detectMimeType(entry.name);
      return {
        filename: entry.name,
        size: stat.size,
        mime_type: mimeType,
        media_kind: detectMediaKind(mimeType),
        modified_at: stat.mtime.toISOString(),
        watch_path: fullPath
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.modified_at).localeCompare(String(a.modified_at)));
}

function buildCounts(files) {
  const counts = {
    total: files.length,
    image: 0,
    video: 0,
    file: 0
  };

  files.forEach((file) => {
    if (file.media_kind === 'image') counts.image += 1;
    else if (file.media_kind === 'video') counts.video += 1;
    else counts.file += 1;
  });

  return counts;
}

router.get('/media', (req, res) => {
  const productId = normalizeProductId(req.query.product_id);
  if (req.query.product_id && productId === null) {
    return res.status(400).json({ error: 'invalid product_id' });
  }

  const files = listImportableFiles();

  res.json({
    watch_dir: WATCH_MEDIA_DIR,
    product_id: productId,
    counts: buildCounts(files),
    files
  });
});

router.post('/media/import', async (req, res) => {
  const body = req.body || {};
  const productId = normalizeProductId(body.product_id);
  const filename = typeof body.filename === 'string' ? body.filename.trim() : '';

  if (productId === null) {
    return res.status(400).json({ error: 'invalid product_id' });
  }

  if (!filename) {
    return res.status(400).json({ error: 'missing filename' });
  }

  try {
    const exists = await productExists(productId);
    if (!exists) {
      return res.status(400).json({ error: 'invalid product_id' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const safeName = path.basename(filename);
  const sourcePath = path.join(WATCH_MEDIA_DIR, safeName);
  if (!fs.existsSync(sourcePath)) {
    return res.status(404).json({ error: 'watch_file_not_found' });
  }

  const ext = path.extname(safeName).toLowerCase();
  if (!IMPORTABLE_EXTENSIONS.has(ext)) {
    return res.status(400).json({ error: 'unsupported_file_type' });
  }

  const targetDir = `/data/uploads/product_${productId}`;
  fs.mkdirSync(targetDir, { recursive: true });

  const targetName = `${Date.now()}_${safeName.replace(/\s+/g, '_')}`;
  const targetPath = path.join(targetDir, targetName);
  fs.renameSync(sourcePath, targetPath);

  const filePath = `/product_${productId}/${targetName}`;
  const stat = fs.statSync(targetPath);
  const mimeType = detectMimeType(safeName);

  db.run(
    `INSERT INTO photos (product_id, file_path, title, mime_type, file_size)
     VALUES (?, ?, ?, ?, ?)`,
    [productId, filePath, safeName, mimeType, stat.size],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      res.status(201).json({
        success: true,
        id: this.lastID,
        product_id: productId,
        file_path: filePath,
        title: safeName,
        mime_type: mimeType,
        media_kind: detectMediaKind(mimeType),
        file_size: stat.size
      });
    }
  );
});

router.post('/media/import-all', async (req, res) => {
  const body = req.body || {};
  const productId = normalizeProductId(body.product_id);

  if (productId === null) {
    return res.status(400).json({ error: 'invalid product_id' });
  }

  try {
    const exists = await productExists(productId);
    if (!exists) {
      return res.status(400).json({ error: 'invalid product_id' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const files = listImportableFiles();
  if (!files.length) {
    return res.json({ success: true, imported: 0, ids: [] });
  }

  const targetDir = `/data/uploads/product_${productId}`;
  fs.mkdirSync(targetDir, { recursive: true });

  const imported = [];

  const importNext = (index) => {
    if (index >= files.length) {
      return res.status(201).json({
        success: true,
        imported: imported.length,
        ids: imported
      });
    }

    const file = files[index];
    const safeName = path.basename(file.filename);
    const sourcePath = path.join(WATCH_MEDIA_DIR, safeName);

    if (!fs.existsSync(sourcePath)) {
      return importNext(index + 1);
    }

    const targetName = `${Date.now()}_${index}_${safeName.replace(/\s+/g, '_')}`;
    const targetPath = path.join(targetDir, targetName);
    fs.renameSync(sourcePath, targetPath);

    const filePath = `/product_${productId}/${targetName}`;
    const stat = fs.statSync(targetPath);
    const mimeType = detectMimeType(safeName);

    db.run(
      `INSERT INTO photos (product_id, file_path, title, mime_type, file_size)
       VALUES (?, ?, ?, ?, ?)`,
      [productId, filePath, safeName, mimeType, stat.size],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        imported.push(this.lastID);
        importNext(index + 1);
      }
    );
  };

  importNext(0);
});

router.delete('/media', (req, res) => {
  const filename = typeof req.query.filename === 'string' ? req.query.filename.trim() : '';

  if (!filename) {
    return res.status(400).json({ error: 'missing filename' });
  }

  const safeName = path.basename(filename);
  const sourcePath = path.join(WATCH_MEDIA_DIR, safeName);

  if (!fs.existsSync(sourcePath)) {
    return res.status(404).json({ error: 'watch_file_not_found' });
  }

  fs.unlinkSync(sourcePath);
  return res.json({ success: true, deleted: safeName });
});

module.exports = router;
module.exports.listImportableFiles = listImportableFiles;
module.exports.detectMediaKind = detectMediaKind;
