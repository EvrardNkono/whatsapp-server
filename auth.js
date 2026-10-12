const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const WINDOW = 15 * 60 * 1000;
const attempts = new Map(); // ip -> { count, resetAt }

function login(req, res) {
  const now = Date.now();
  const a = attempts.get(req.ip) || { count: 0, resetAt: now + WINDOW };
  if (now > a.resetAt) {
    a.count = 0;
    a.resetAt = now + WINDOW;
  }
  if (a.count >= 5) {
    return res.status(429).json({ error: 'Trop de tentatives, réessaie dans 15 minutes' });
  }

  const given = Buffer.from(String((req.body && req.body.password) || ''));
  const expected = Buffer.from(process.env.WA_PASSWORD || '');
  const ok =
    expected.length > 0 &&
    given.length === expected.length &&
    crypto.timingSafeEqual(given, expected);

  if (!ok) {
    a.count++;
    attempts.set(req.ip, a);
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  attempts.delete(req.ip);
  const token = jwt.sign({ role: 'wa-admin' }, process.env.WA_JWT_SECRET, { expiresIn: '30d' });
  res.json({ token });
}

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  try {
    jwt.verify(token, process.env.WA_JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Non autorisé' });
  }
}

module.exports = { login, requireAuth };