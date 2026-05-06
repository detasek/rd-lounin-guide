const express = require('express');
const QRCode = require('qrcode');

const router = express.Router();

router.get('/qr', async (req, res, next) => {
  const data = String(req.query.data || '').trim();
  const size = Math.min(Math.max(parseInt(req.query.size || '80', 10) || 80, 64), 512);

  if (!data) {
    return res.status(400).json({ error: 'missing_data' });
  }

  try {
    const svg = await QRCode.toString(data, {
      type: 'svg',
      width: size,
      margin: 1
    });

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(svg);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
