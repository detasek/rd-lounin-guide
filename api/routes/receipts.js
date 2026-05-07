const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const ctrl = require('../controllers/receiptsController');
const { RECEIPTS_DIR } = require('../lib/runtimePaths');
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

const uploadDir = RECEIPTS_DIR;
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    cb(null, Date.now() + '_' + file.originalname.replace(/\s+/g, '_'));
  }
});

const fileFilter = (req, file, cb) => {
  const ok = file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/');
  if (ok) return cb(null, true);
  cb(new Error('unsupported_file_type'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_UPLOAD_BYTES }
});

router.get('/', ctrl.list);
router.post('/upload', upload.single('file'), ctrl.upload);
router.post('/:id/ocr-minimum', ctrl.ocrMinimum);
router.post('/ocr-approve-all-review-needed', ctrl.ocrApproveAllReviewNeeded);
router.post('/:id/ocr-approve', ctrl.ocrApprove);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
