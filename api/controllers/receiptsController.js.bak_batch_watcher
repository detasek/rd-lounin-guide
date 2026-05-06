const db = require('../db/db');
const { calcWarranty } = require('../services/warrantyService');
const { extractCandidates } = require('../services/ocrReceiptService');
const fs = require('fs');

function normalizeProductId(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function deriveReceiptStatus(fields) {
  const hasSupplier = !!(fields.supplier || fields.vendor);
  const hasDocumentNumber = !!fields.document_number;
  const hasPurchaseDate = !!(fields.purchase_date || fields.date);
  return hasSupplier && hasDocumentNumber && hasPurchaseDate ? 'ready' : 'pending_review';
}

function normalizeReceiptRow(row) {
  if (!row || typeof row !== 'object') {
    return {
      status: 'pending_review',
      supplier: null,
      purchase_date: null,
      total_amount: null,
      title: null
    };
  }

  const computedStatus = deriveReceiptStatus(row);

  return {
    ...row,
    status: computedStatus,
    supplier: row.supplier || row.vendor || null,
    purchase_date: row.purchase_date || row.date || null,
    total_amount: row.total_amount ?? row.total ?? null,
    title: row.title || row.original_name || null
  };
}

// LIST
exports.list = (req,res)=>{
  const query = req.query || {};
  const productId = normalizeProductId(query.product_id);

  let sql = 'SELECT * FROM receipts';
  const params = [];

  if (query.product_id && productId === null) {
    return res.status(400).json({ error: 'invalid product_id' });
  }

  if (productId !== null) {
    sql += ' WHERE product_id = ?';
    params.push(productId);
  }

  sql += ' ORDER BY id DESC';

  db.all(sql, params, (err,rows)=>{
    if(err) return res.status(500).json({error:err.message});
    try {
      const safeRows = Array.isArray(rows) ? rows : [];
      res.json(safeRows.map(normalizeReceiptRow));
    } catch (e) {
      res.status(500).json({ error: e.message || 'receipts_list_failed' });
    }
  });
};

// CREATE FROM UPLOAD
exports.upload = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'no file' });
  }

  const body = req.body || {};
  const title = body.title || req.file.originalname;
  const productId = normalizeProductId(body.product_id);
  if (body.product_id && productId === null) {
    return res.status(400).json({ error: 'invalid product_id' });
  }
  const filePath = `/receipts/${req.file.filename}`;
  const purchaseDate = body.purchase_date || null;
  const warrantyMonths = normalizeOptionalNumber(body.warranty_months) ?? (purchaseDate ? 24 : null);
  const warrantyUntil = calcWarranty(purchaseDate, warrantyMonths);
  const status = deriveReceiptStatus({
    supplier: body.supplier || null,
    document_number: body.document_number || null,
    purchase_date: purchaseDate
  });

  db.run(
    `
      INSERT INTO receipts (
        product_id,
        title,
        file_path,
        original_name,
        mime_type,
        file_size,
        purchase_date,
        date,
        warranty_months,
        warranty_until,
        status,
        type,
        source
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      productId,
      title,
      filePath,
      req.file.originalname,
      req.file.mimetype,
      req.file.size,
      purchaseDate,
      purchaseDate,
      warrantyMonths,
      warrantyUntil,
      status,
      'receipt',
      'manual'
    ],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, success: true });
    }
  );
};

// UPDATE
exports.update = (req,res)=>{
  const id = req.params.id;
  const b = req.body || {};
  db.get('SELECT * FROM receipts WHERE id = ?', [id], (findErr, existing) => {
    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const purchaseDate =
      b.purchase_date !== undefined ? (b.purchase_date || null) : (existing.purchase_date || existing.date || null);

    const suppliedWarrantyMonths = normalizeOptionalNumber(b.warranty_months);
    const existingWarrantyMonths = normalizeOptionalNumber(existing.warranty_months);
    const warrantyMonths =
      suppliedWarrantyMonths ?? existingWarrantyMonths ?? (purchaseDate ? 24 : null);

    const totalAmount =
      b.total_amount === undefined ? (existing.total_amount ?? existing.total ?? null) : normalizeOptionalNumber(b.total_amount);

    const warrantyUntil =
      b.warranty_until !== undefined && b.warranty_until !== ''
        ? b.warranty_until
        : calcWarranty(purchaseDate, warrantyMonths);
    const supplier =
      b.supplier !== undefined ? (b.supplier || null) : (existing.supplier || existing.vendor || null);
    const documentNumber =
      b.document_number !== undefined ? (b.document_number || null) : (existing.document_number || null);
    const nextStatus = deriveReceiptStatus({
      supplier,
      document_number: documentNumber,
      purchase_date: purchaseDate
    });

    db.run(`
      UPDATE receipts SET
        title=?,
        supplier=?,
        vendor=?,
        document_number=?,
        purchase_date=?,
        date=?,
        total_amount=?,
        total=?,
        warranty_months=?,
        warranty_until=?,
        warranty_note=?,
        status=?,
        type=?,
        source=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `,[
      b.title || existing.title || existing.original_name || null,
      supplier,
      supplier,
      documentNumber,
      purchaseDate,
      purchaseDate,
      totalAmount,
      totalAmount,
      warrantyMonths,
      warrantyUntil,
      b.warranty_note !== undefined ? (b.warranty_note || null) : (existing.warranty_note || null),
      nextStatus,
      existing.type || 'receipt',
      existing.source || 'manual',
      id
    ],function(err){
      if(err) return res.status(500).json({error:err.message});
      if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
      res.json({success:true});
    });
  });
};

// DELETE
exports.remove = (req, res) => {
  db.get('SELECT file_path FROM receipts WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Not found' });

    const fullPath = '/data' + row.file_path;

    db.run('DELETE FROM receipts WHERE id = ?', [req.params.id], function (delErr) {
      if (delErr) return res.status(500).json({ error: delErr.message });

      try {
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      } catch (_) {}

      res.json({ success: true });
    });
  });
};

// OCR MINIMUM
exports.ocrMinimum = (req, res) => {
  const id = req.params.id;

  db.get('SELECT * FROM receipts WHERE id = ?', [id], (findErr, existing) => {
    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const candidates = extractCandidates(existing);
    const purchaseDate = existing.purchase_date || existing.date || candidates.purchase_date_candidate || null;
    const documentNumber = existing.document_number || candidates.document_number_candidate || null;
    const warrantyMonths = existing.warranty_months || candidates.warranty_months_candidate || (purchaseDate ? 24 : null);
    const warrantyUntil = existing.warranty_until || candidates.warranty_until_candidate || calcWarranty(purchaseDate, warrantyMonths);
    const nextStatus = candidates.document_number_candidate || candidates.purchase_date_candidate
      ? 'review_needed'
      : 'not_processed';
    const workflowStatus = deriveReceiptStatus({
      supplier: existing.supplier || existing.vendor || null,
      document_number: documentNumber,
      purchase_date: purchaseDate
    });

    db.run(
      `
        UPDATE receipts SET
          document_number = ?,
          purchase_date = ?,
          date = ?,
          warranty_months = ?,
          warranty_until = ?,
          status = ?,
          ocr_status = ?,
          ocr_raw_json = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        documentNumber,
        purchaseDate,
        purchaseDate,
        warrantyMonths,
        warrantyUntil,
        workflowStatus,
        nextStatus,
        JSON.stringify(candidates),
        id
      ],
      (updateErr) => {
        if (updateErr) return res.status(500).json({ error: updateErr.message });

        db.get('SELECT * FROM receipts WHERE id = ?', [id], (getErr, row) => {
          if (getErr) return res.status(500).json({ error: getErr.message });
          res.json({
            success: true,
            ocr: candidates,
            receipt: normalizeReceiptRow(row)
          });
        });
      }
    );
  });
};

// OCR APPROVE MINIMUM
exports.ocrApprove = (req, res) => {
  const id = req.params.id;

  db.get('SELECT * FROM receipts WHERE id = ?', [id], (findErr, existing) => {
    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const workflowStatus = deriveReceiptStatus({
      supplier: existing.supplier || existing.vendor || null,
      document_number: existing.document_number || null,
      purchase_date: existing.purchase_date || existing.date || null
    });

    db.run(
      `
        UPDATE receipts SET
          status = ?,
          ocr_status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [workflowStatus, 'approved', id],
      function (updateErr) {
        if (updateErr) return res.status(500).json({ error: updateErr.message });

        db.get('SELECT * FROM receipts WHERE id = ?', [id], (getErr, row) => {
          if (getErr) return res.status(500).json({ error: getErr.message });
          res.json({
            success: true,
            receipt: normalizeReceiptRow(row)
          });
        });
      }
    );
  });
};

// OCR APPROVE ALL REVIEW NEEDED MINIMUM
exports.ocrApproveAllReviewNeeded = (req, res) => {
  db.run(
    `
      UPDATE receipts SET
        ocr_status = 'approved',
        status = CASE
          WHEN COALESCE(NULLIF(supplier, ''), NULLIF(vendor, '')) IS NOT NULL
           AND NULLIF(document_number, '') IS NOT NULL
           AND COALESCE(NULLIF(purchase_date, ''), NULLIF(date, '')) IS NOT NULL
          THEN 'ready'
          ELSE 'pending_review'
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE ocr_status = 'review_needed'
    `,
    [],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, updated: this.changes || 0 });
    }
  );
};
