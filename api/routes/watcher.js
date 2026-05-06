const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const watchFolder = require('./watchFolder');

const router = express.Router();
const DB_PATH = '/data/db.sqlite';

function openDb() {
  return new sqlite3.Database(DB_PATH);
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || {});
    });
  });
}

router.get('/watcher', async (req, res) => {
  const db = openDb();

  try {
    const endingSoonCountRow = await get(
      db,
      `
        SELECT COUNT(*) AS count
        FROM receipts
        WHERE warranty_until IS NOT NULL
          AND date(warranty_until) BETWEEN date('now') AND date('now', '+30 day')
      `
    );

    const endingSoon = await all(
      db,
      `
        SELECT id, product_id, title, original_name, warranty_until
        FROM receipts
        WHERE warranty_until IS NOT NULL
          AND date(warranty_until) BETWEEN date('now') AND date('now', '+30 day')
        ORDER BY warranty_until ASC, id DESC
        LIMIT 5
      `
    );

    const missingSupplierCountRow = await get(
      db,
      `
        SELECT COUNT(*) AS count
        FROM receipts
        WHERE COALESCE(NULLIF(supplier, ''), NULLIF(vendor, '')) IS NULL
      `
    );

    const missingSupplier = await all(
      db,
      `
        SELECT id, product_id, title, original_name
        FROM receipts
        WHERE COALESCE(NULLIF(supplier, ''), NULLIF(vendor, '')) IS NULL
        ORDER BY id DESC
        LIMIT 5
      `
    );

    const missingDocumentNumberCountRow = await get(
      db,
      `
        SELECT COUNT(*) AS count
        FROM receipts
        WHERE NULLIF(document_number, '') IS NULL
      `
    );

    const missingDocumentNumber = await all(
      db,
      `
        SELECT id, product_id, title, original_name
        FROM receipts
        WHERE NULLIF(document_number, '') IS NULL
        ORDER BY id DESC
        LIMIT 5
      `
    );

    const missingPurchaseDateCountRow = await get(
      db,
      `
        SELECT COUNT(*) AS count
        FROM receipts
        WHERE COALESCE(NULLIF(purchase_date, ''), NULLIF(date, '')) IS NULL
      `
    );

    const reviewNeededCountRow = await get(
      db,
      `
        SELECT COUNT(*) AS count
        FROM receipts
        WHERE ocr_status = 'review_needed'
      `
    );

    const missingPurchaseDate = await all(
      db,
      `
        SELECT id, product_id, title, original_name
        FROM receipts
        WHERE COALESCE(NULLIF(purchase_date, ''), NULLIF(date, '')) IS NULL
        ORDER BY id DESC
        LIMIT 5
      `
    );

    const reviewNeeded = await all(
      db,
      `
        SELECT id, product_id, title, original_name, ocr_status
        FROM receipts
        WHERE ocr_status = 'review_needed'
        ORDER BY updated_at DESC, id DESC
        LIMIT 5
      `
    );

    const inboxMediaAll = watchFolder.listImportableFiles();
    const inboxMedia = inboxMediaAll.slice(0, 5).map((file) => ({
      filename: file.filename,
      mime_type: file.mime_type,
      media_kind: file.media_kind,
      size: file.size
    }));

    const payload = {
      counts: {
        ending_soon: endingSoonCountRow.count || 0,
        missing_supplier: missingSupplierCountRow.count || 0,
        missing_document_number: missingDocumentNumberCountRow.count || 0,
        missing_purchase_date: missingPurchaseDateCountRow.count || 0,
        review_needed: reviewNeededCountRow.count || 0,
        inbox_media: inboxMediaAll.length
      },
      groups: {
        ending_soon: endingSoon,
        missing_supplier: missingSupplier,
        missing_document_number: missingDocumentNumber,
        missing_purchase_date: missingPurchaseDate,
        review_needed: reviewNeeded,
        inbox_media: inboxMedia
      }
    };

    db.close();
    res.json(payload);
  } catch (err) {
    db.close();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
