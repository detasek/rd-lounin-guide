const crypto = require('crypto');
const express = require('express');
const db = require('../db/db');

const router = express.Router();
const HASH_ITERATIONS = 120000;
const SESSION_DAYS = 30;

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      pin_hash TEXT,
      pin_salt TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
    )
  `);
});

function hashSecret(secret, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(secret), salt, HASH_ITERATIONS, 32, 'sha256').toString('hex');
  return { hash, salt };
}

function verifySecret(secret, hash, salt) {
  if (!secret || !hash || !salt) return false;
  const candidate = hashSecret(secret, salt).hash;
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    created_at: row.created_at
  };
}

function createSession(userId, cb) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  db.run(
    `INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
    [userId, tokenHash, expiresAt],
    (err) => cb(err, token, expiresAt)
  );
}

function tokenFromRequest(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function requireSession(req, res, next) {
  const token = tokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'auth_required' });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  db.get(
    `
      SELECT users.*
      FROM user_sessions
      JOIN users ON users.id = user_sessions.user_id
      WHERE user_sessions.token_hash = ?
        AND datetime(user_sessions.expires_at) > datetime('now')
    `,
    [tokenHash],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(401).json({ error: 'invalid_session' });
      req.user = publicUser(row);
      next();
    }
  );
}

router.get('/bootstrap', (_req, res) => {
  db.get(`SELECT COUNT(*) AS count FROM users`, [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    const count = Number(row?.count || 0);
    res.json({ needs_setup: count === 0, user_count: count });
  });
});

router.post('/setup', (req, res) => {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const pin = String(body.pin || '');

  if (!name || !username || password.length < 6) {
    return res.status(400).json({ error: 'invalid_setup' });
  }

  db.get(`SELECT COUNT(*) AS count FROM users`, [], (countErr, countRow) => {
    if (countErr) return res.status(500).json({ error: countErr.message });
    if (Number(countRow?.count || 0) > 0) return res.status(409).json({ error: 'setup_already_done' });

    const passwordHash = hashSecret(password);
    const pinHash = pin ? hashSecret(pin) : { hash: null, salt: null };

    db.run(
      `
        INSERT INTO users (name, username, password_hash, password_salt, pin_hash, pin_salt)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [name, username, passwordHash.hash, passwordHash.salt, pinHash.hash, pinHash.salt],
      function (insertErr) {
        if (insertErr) return res.status(500).json({ error: insertErr.message });

        db.get(`SELECT * FROM users WHERE id = ?`, [this.lastID], (getErr, user) => {
          if (getErr) return res.status(500).json({ error: getErr.message });
          createSession(user.id, (sessionErr, token, expiresAt) => {
            if (sessionErr) return res.status(500).json({ error: sessionErr.message });
            res.status(201).json({ user: publicUser(user), token, expires_at: expiresAt });
          });
        });
      }
    );
  });
});

router.post('/register', (req, res) => {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const pin = String(body.pin || '');

  if (!name || !username || password.length < 6) {
    return res.status(400).json({ error: 'invalid_registration' });
  }

  const passwordHash = hashSecret(password);
  const pinHash = pin ? hashSecret(pin) : { hash: null, salt: null };

  db.run(
    `
      INSERT INTO users (name, username, password_hash, password_salt, pin_hash, pin_salt)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [name, username, passwordHash.hash, passwordHash.salt, pinHash.hash, pinHash.salt],
    function (insertErr) {
      if (insertErr) {
        if (String(insertErr.message || '').includes('UNIQUE')) {
          return res.status(409).json({ error: 'username_exists' });
        }
        return res.status(500).json({ error: insertErr.message });
      }

      db.get(`SELECT * FROM users WHERE id = ?`, [this.lastID], (getErr, user) => {
        if (getErr) return res.status(500).json({ error: getErr.message });
        createSession(user.id, (sessionErr, token, expiresAt) => {
          if (sessionErr) return res.status(500).json({ error: sessionErr.message });
          res.status(201).json({ user: publicUser(user), token, expires_at: expiresAt });
        });
      });
    }
  );
});

router.post('/login', (req, res) => {
  const body = req.body || {};
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const pin = String(body.pin || '');

  if (!username || (!password && !pin)) {
    return res.status(400).json({ error: 'credentials_required' });
  }

  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'invalid_credentials' });

    const ok = password
      ? verifySecret(password, user.password_hash, user.password_salt)
      : verifySecret(pin, user.pin_hash, user.pin_salt);

    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

    createSession(user.id, (sessionErr, token, expiresAt) => {
      if (sessionErr) return res.status(500).json({ error: sessionErr.message });
      res.json({ user: publicUser(user), token, expires_at: expiresAt });
    });
  });
});

router.get('/me', requireSession, (req, res) => {
  res.json({ user: req.user });
});

router.post('/logout', (req, res) => {
  const token = tokenFromRequest(req);
  if (!token) return res.json({ ok: true });
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  db.run(`DELETE FROM user_sessions WHERE token_hash = ?`, [tokenHash], () => {
    res.json({ ok: true });
  });
});

module.exports = router;
