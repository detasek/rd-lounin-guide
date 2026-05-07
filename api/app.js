// =====================================================
// rd-lounin-api — main application
// =====================================================
// Architektura: routes -> controllers -> services -> db
// Vstupní bod běhu (docker-compose: "node app.js")
// =====================================================

const express = require('express');
const cors = require('cors');

const logger = require('./middleware/logger');
const response = require('./middleware/response');
const security = require('./middleware/security');
const errorHandler = require('./middleware/errorHandler');
const { UPLOADS_DIR, RECEIPTS_DIR } = require('./lib/runtimePaths');

const app = express();
app.disable('x-powered-by');

// ----- GLOBAL MIDDLEWARE -----
app.use(cors());
app.use(security);
app.use(express.json({ limit: '1mb' }));
app.use(logger);     // [API] METHOD URL
app.use(response);   // res.success(data)

// ----- STATIC FILES -----
// Pořadí má význam: nejprve specifičtější mount (/files/receipts), pak obecný /files
const staticOptions = {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
  }
};

app.use('/files/receipts', express.static(RECEIPTS_DIR, staticOptions));
app.use('/files', express.static(UPLOADS_DIR, staticOptions));

// ----- ROUTES -----
app.use('/api', require('./routes/status'));    // GET /api/status
app.use('/api', require('./routes/lookups'));   // GET /api/phases, /api/rooms
app.use('/api', require('./routes/qr'));        // GET /api/qr
app.use('/api', require('./routes/diary'));     // GET/POST /api/diary
app.use('/api', require('./routes/watcher'));   // GET /api/watcher
app.use('/api/watch-folder', require('./routes/watchFolder'));
app.use('/api/products',  require('./routes/products'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/photos',    require('./routes/photos'));
app.use('/api/receipts',  require('./routes/receipts'));
app.use('/api/upload',    require('./routes/upload'));

// ----- HEALTH -----
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ----- 404 fallback for /api/* -----
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: 'route_not_found' });
});

// ----- GLOBAL ERROR HANDLER (must be last) -----
app.use(errorHandler);

// ----- LISTEN -----
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`rd-lounin-api listening on ${PORT}`);
  });
}

module.exports = app;
