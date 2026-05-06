const express = require('express');
const sqlite3 = require('sqlite3').verbose();

const router = express.Router();
const DB_PATH = '/data/db.sqlite';

function openDb() {
  return new sqlite3.Database(DB_PATH);
}

router.get('/phases', (req, res) => {
  const db = openDb();
  db.all('SELECT * FROM phases ORDER BY sort_order ASC, id ASC', [], (err, rows) => {
    db.close();
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/rooms', (req, res) => {
  const db = openDb();
  db.all('SELECT * FROM rooms ORDER BY id ASC', [], (err, rows) => {
    db.close();
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

module.exports = router;
