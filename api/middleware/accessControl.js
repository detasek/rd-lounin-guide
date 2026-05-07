const crypto = require('crypto');
const db = require('../db/db');

const SECTION_RULES = [
  { prefix: '/api/products', section: 'products', system: true },
  { prefix: '/api/documents', section: 'documents' },
  { prefix: '/api/receipts', section: 'receipts' },
  { prefix: '/api/budget', section: 'budget', system: true },
  { prefix: '/api/photos', section: 'media' },
  { prefix: '/api/watch-folder', section: 'media' },
  { prefix: '/api/diary', section: 'diary' },
  { prefix: '/api/watcher', section: 'watcher' },
  { prefix: '/api/upload', section: 'receipts' }
];

const ROLE_PERMISSIONS = {
  admin: {
    label: 'Správce',
    can_read: true,
    can_write: true,
    can_manage_system: true,
    sections: ['products', 'documents', 'receipts', 'budget', 'media', 'diary', 'watcher', 'settings']
  },
  user: {
    label: 'Uživatel',
    can_read: true,
    can_write: true,
    can_manage_system: false,
    sections: ['products', 'documents', 'receipts', 'budget', 'media', 'diary', 'watcher']
  },
  guest: {
    label: 'Guest',
    can_read: true,
    can_write: false,
    can_manage_system: false,
    sections: ['products', 'documents', 'receipts', 'budget', 'media', 'diary']
  }
};

function permissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.guest;
}

function publicAccessUser(row) {
  const role = row.role || 'guest';
  const permissions = permissionsForRole(role);
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email || null,
    role,
    permissions
  };
}

function tokenFromRequest(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function routeRule(path) {
  return SECTION_RULES.find((rule) => path.startsWith(rule.prefix)) || { section: 'unknown', system: false };
}

function requireAccess(req, res, next) {
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

      const user = publicAccessUser(row);
      const permissions = user.permissions;
      const rule = routeRule(req.path);
      const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);

      if (!permissions.sections.includes(rule.section) && rule.section !== 'unknown') {
        return res.status(403).json({ error: 'section_forbidden' });
      }

      if (isWrite && !permissions.can_write) {
        return res.status(403).json({ error: 'write_forbidden' });
      }

      if (isWrite && rule.system && !permissions.can_manage_system) {
        return res.status(403).json({ error: 'system_write_forbidden' });
      }

      req.user = user;
      next();
    }
  );
}

module.exports = {
  ROLE_PERMISSIONS,
  permissionsForRole,
  requireAccess
};
