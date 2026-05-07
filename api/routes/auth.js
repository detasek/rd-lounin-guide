const crypto = require('crypto');
const express = require('express');
const db = require('../db/db');
const { sendMail, verificationUrl, resetUrl } = require('../services/mailService');
const { ROLE_PERMISSIONS, permissionsForRole } = require('../middleware/accessControl');

const router = express.Router();
const HASH_ITERATIONS = 120000;
const SESSION_DAYS = 30;
const TOKEN_HOURS = 24;

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

  [
    ['email', 'TEXT'],
    ['email_verified_at', 'DATETIME'],
    ['email_verify_token_hash', 'TEXT'],
    ['email_verify_expires_at', 'DATETIME'],
    ['password_reset_token_hash', 'TEXT'],
    ['password_reset_expires_at', 'DATETIME'],
    ['password_changed_at', 'DATETIME'],
    ['role', "TEXT DEFAULT 'admin'"]
  ].forEach(([column, definition]) => {
    db.run(`ALTER TABLE users ADD COLUMN ${column} ${definition}`, (err) => {
      if (err && !String(err.message || '').includes('duplicate column name')) {
        console.error(`[auth] migration ${column}:`, err.message);
      }
    });
  });

  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email) WHERE email IS NOT NULL`);
  db.run(`UPDATE users SET role = 'admin' WHERE role IS NULL OR role = ''`);
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
  const role = row.role || 'guest';
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email || null,
    email_verified: Boolean(row.email_verified_at),
    role,
    permissions: permissionsForRole(role),
    created_at: row.created_at
  };
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function createRawToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function tokenExpiry() {
  return new Date(Date.now() + TOKEN_HOURS * 60 * 60 * 1000).toISOString();
}

function userByLoginWhere() {
  return `LOWER(username) = LOWER(?) OR LOWER(COALESCE(email, '')) = LOWER(?)`;
}

async function sendVerifyEmail(user, token) {
  if (!user.email) return;
  await sendMail({
    to: user.email,
    subject: 'Ověření účtu RD Lounín',
    text: [
      `Ahoj ${user.name || user.username},`,
      '',
      'účet v Průvodci stavbou RD Lounín byl vytvořen. E-mail ověříš tímto odkazem:',
      verificationUrl(token),
      '',
      'Pokud jsi účet nevytvářel/a ty, zprávu ignoruj.'
    ].join('\n')
  });
}

async function sendPasswordChangedEmail(user) {
  if (!user.email) return;
  await sendMail({
    to: user.email,
    subject: 'Změna hesla RD Lounín',
    text: [
      `Ahoj ${user.name || user.username},`,
      '',
      'heslo k účtu v Průvodci stavbou RD Lounín bylo změněno.',
      'Pokud jsi změnu neprovedl/a ty, zkontroluj účet a změň heslo znovu.'
    ].join('\n')
  });
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
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const pin = String(body.pin || '');

  if (!name || !username || !email || password.length < 6) {
    return res.status(400).json({ error: 'invalid_setup' });
  }

  db.get(`SELECT COUNT(*) AS count FROM users`, [], (countErr, countRow) => {
    if (countErr) return res.status(500).json({ error: countErr.message });
    if (Number(countRow?.count || 0) > 0) return res.status(409).json({ error: 'setup_already_done' });

    const passwordHash = hashSecret(password);
    const pinHash = pin ? hashSecret(pin) : { hash: null, salt: null };
    const verifyToken = createRawToken();

    db.run(
      `
        INSERT INTO users (name, username, email, password_hash, password_salt, pin_hash, pin_salt, email_verify_token_hash, email_verify_expires_at, role)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [name, username, email, passwordHash.hash, passwordHash.salt, pinHash.hash, pinHash.salt, hashToken(verifyToken), tokenExpiry(), 'admin'],
      function (insertErr) {
        if (insertErr) return res.status(500).json({ error: insertErr.message });

        db.get(`SELECT * FROM users WHERE id = ?`, [this.lastID], (getErr, user) => {
          if (getErr) return res.status(500).json({ error: getErr.message });
          createSession(user.id, (sessionErr, token, expiresAt) => {
            if (sessionErr) return res.status(500).json({ error: sessionErr.message });
            sendVerifyEmail(user, verifyToken).catch((mailErr) => console.error('[auth] verify mail:', mailErr.message));
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
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const pin = String(body.pin || '');

  if (!name || !username || !email || password.length < 6) {
    return res.status(400).json({ error: 'invalid_registration' });
  }

  const passwordHash = hashSecret(password);
  const pinHash = pin ? hashSecret(pin) : { hash: null, salt: null };
  const verifyToken = createRawToken();

  db.run(
    `
      INSERT INTO users (name, username, email, password_hash, password_salt, pin_hash, pin_salt, email_verify_token_hash, email_verify_expires_at, role)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [name, username, email, passwordHash.hash, passwordHash.salt, pinHash.hash, pinHash.salt, hashToken(verifyToken), tokenExpiry(), 'guest'],
    function (insertErr) {
      if (insertErr) {
        if (String(insertErr.message || '').includes('UNIQUE')) {
          return res.status(409).json({ error: 'login_or_email_exists' });
        }
        return res.status(500).json({ error: insertErr.message });
      }

      db.get(`SELECT * FROM users WHERE id = ?`, [this.lastID], (getErr, user) => {
        if (getErr) return res.status(500).json({ error: getErr.message });
        createSession(user.id, (sessionErr, token, expiresAt) => {
          if (sessionErr) return res.status(500).json({ error: sessionErr.message });
          sendVerifyEmail(user, verifyToken).catch((mailErr) => console.error('[auth] verify mail:', mailErr.message));
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

  db.get(`SELECT * FROM users WHERE ${userByLoginWhere()}`, [username, username], (err, user) => {
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

function requireAdmin(req, res, next) {
  requireSession(req, res, () => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'admin_required' });
    next();
  });
}

router.get('/roles', requireSession, (_req, res) => {
  res.json({ roles: ROLE_PERMISSIONS });
});

router.get('/users', requireAdmin, (_req, res) => {
  db.all(
    `SELECT id, name, username, email, email_verified_at, role, created_at, updated_at FROM users ORDER BY id ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json((rows || []).map(publicUser));
    }
  );
});

router.put('/users/:id/role', requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
  const role = String(req.body?.role || '').trim();
  if (!Number.isInteger(userId) || !ROLE_PERMISSIONS[role]) return res.status(400).json({ error: 'invalid_role' });

  if (Number(req.user.id) === userId && role !== 'admin') {
    return res.status(400).json({ error: 'cannot_demote_self' });
  }

  db.run(
    `UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [role, userId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (!this.changes) return res.status(404).json({ error: 'user_not_found' });
      res.json({ success: true });
    }
  );
});

router.post('/verify-email', (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (!token) return res.status(400).json({ error: 'token_required' });
  db.get(
    `SELECT * FROM users WHERE email_verify_token_hash = ? AND datetime(email_verify_expires_at) > datetime('now')`,
    [hashToken(token)],
    (err, user) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!user) return res.status(400).json({ error: 'invalid_or_expired_token' });
      db.run(
        `UPDATE users SET email_verified_at = CURRENT_TIMESTAMP, email_verify_token_hash = NULL, email_verify_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [user.id],
        (updateErr) => {
          if (updateErr) return res.status(500).json({ error: updateErr.message });
          res.json({ success: true });
        }
      );
    }
  );
});

router.post('/password-reset/request', (req, res) => {
  const login = String(req.body?.login || '').trim().toLowerCase();
  if (!login) return res.status(400).json({ error: 'login_required' });

  db.get(`SELECT * FROM users WHERE ${userByLoginWhere()}`, [login, login], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user || !user.email) return res.json({ success: true });

    const resetToken = createRawToken();
    db.run(
      `UPDATE users SET password_reset_token_hash = ?, password_reset_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [hashToken(resetToken), tokenExpiry(), user.id],
      (updateErr) => {
        if (updateErr) return res.status(500).json({ error: updateErr.message });
        sendMail({
          to: user.email,
          subject: 'Obnova hesla RD Lounín',
          text: [
            `Ahoj ${user.name || user.username},`,
            '',
            'heslo obnovíš přes tento odkaz:',
            resetUrl(resetToken),
            '',
            'Odkaz platí 24 hodin. Pokud jsi obnovu nevyžádal/a, zprávu ignoruj.'
          ].join('\n')
        }).catch((mailErr) => console.error('[auth] reset mail:', mailErr.message));
        res.json({ success: true });
      }
    );
  });
});

router.post('/password-reset/confirm', (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');
  const pin = String(req.body?.pin || '');
  if (!token || password.length < 6) return res.status(400).json({ error: 'invalid_password_reset' });

  db.get(
    `SELECT * FROM users WHERE password_reset_token_hash = ? AND datetime(password_reset_expires_at) > datetime('now')`,
    [hashToken(token)],
    (err, user) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!user) return res.status(400).json({ error: 'invalid_or_expired_token' });
      const passwordHash = hashSecret(password);
      const pinHash = pin ? hashSecret(pin) : { hash: user.pin_hash, salt: user.pin_salt };
      db.run(
        `
          UPDATE users SET
            password_hash = ?,
            password_salt = ?,
            pin_hash = ?,
            pin_salt = ?,
            password_reset_token_hash = NULL,
            password_reset_expires_at = NULL,
            password_changed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [passwordHash.hash, passwordHash.salt, pinHash.hash, pinHash.salt, user.id],
        (updateErr) => {
          if (updateErr) return res.status(500).json({ error: updateErr.message });
          db.run(`DELETE FROM user_sessions WHERE user_id = ?`, [user.id], () => {});
          sendPasswordChangedEmail(user).catch((mailErr) => console.error('[auth] password changed mail:', mailErr.message));
          res.json({ success: true });
        }
      );
    }
  );
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
