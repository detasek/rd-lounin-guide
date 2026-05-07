const path = require('path');

const DATA_DIR = process.env.RD_DATA_DIR || '/data';
const DB_PATH = path.join(DATA_DIR, 'db.sqlite');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const RECEIPTS_DIR = path.join(DATA_DIR, 'receipts');
const WATCH_MEDIA_DIR = path.join(DATA_DIR, 'watch-folder', 'media');

function stripLeadingSlash(value) {
  return String(value || '').replace(/^[/\\]+/, '');
}

function dataPath(relativePath) {
  return path.join(DATA_DIR, stripLeadingSlash(relativePath));
}

function uploadPath(relativePath) {
  return path.join(UPLOADS_DIR, stripLeadingSlash(relativePath));
}

module.exports = {
  DATA_DIR,
  DB_PATH,
  UPLOADS_DIR,
  RECEIPTS_DIR,
  WATCH_MEDIA_DIR,
  dataPath,
  uploadPath
};
