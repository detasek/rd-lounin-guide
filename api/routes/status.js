const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { DB_PATH } = require('../lib/runtimePaths');

const router = express.Router();

function openDb() {
  return new sqlite3.Database(DB_PATH);
}

function countTable(db, table) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT COUNT(*) AS count FROM ${table}`, [], (err, row) => {
      if (err) reject(err);
      else resolve(row.count);
    });
  });
}

router.get('/status', async (req, res) => {
  const db = openDb();

  try {
    const status = {
      api: 'ok',
      db: 'connected',
      counts: {
        phases: await countTable(db, 'phases'),
        rooms: await countTable(db, 'rooms'),
        products: await countTable(db, 'products')
      }
    };

    db.close();
    res.json(status);
  } catch (err) {
    db.close();
    res.status(500).json({
      api: 'ok',
      db: 'error',
      error: err.message
    });
  }
});

module.exports = router;
