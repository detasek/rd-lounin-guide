const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const receiptsController = require('../controllers/receiptsController');
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

const uploadDir = '/data/receipts';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    cb(null, Date.now() + '_' + file.originalname.replace(/\s+/g,'_'));
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

router.post('/receipt', upload.single('file'), receiptsController.upload);

module.exports = router;
