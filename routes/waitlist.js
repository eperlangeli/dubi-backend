'use strict';

const express = require('express');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 3;
const rateLimits = new Map();

const getClientIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) return String(forwardedFor).split(',')[0].trim();
  return req.ip || null;
};

const isRateLimited = (ip) => {
  const key = ip || 'unknown';
  const now = Date.now();
  const current = rateLimits.get(key);
  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimits.set(key, { count: 1, startedAt: now });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT_MAX_REQUESTS;
};

module.exports = (pool) => {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const ip = getClientIp(req);
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    const email = typeof req.body?.email === 'string'
      ? req.body.email.toLowerCase().trim()
      : '';

    if (!email || !EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    const lang = typeof req.body?.lang === 'string' && req.body.lang.trim()
      ? req.body.lang.trim()
      : 'en';
    const source = typeof req.body?.source === 'string' && req.body.source.trim()
      ? req.body.source.trim()
      : 'landing_page';

    try {
      await pool.query(
        `INSERT INTO waitlist (email, lang, source, ip)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (LOWER(email)) DO NOTHING`,
        [email, lang, source, ip]
      );
      return res.status(200).json({ success: true });
    } catch (err) {
      const duplicate = err.code === '23505' || /duplicate/i.test(err.message || '');
      if (duplicate) {
        return res.status(200).json({ success: true, duplicate: true });
      }
      console.error('Waitlist signup could not be saved.');
      return res.status(500).json({ error: 'Could not save signup' });
    }
  });

  return router;
};
