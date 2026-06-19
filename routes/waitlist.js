'use strict';

const express = require('express');
const { Resend } = require('resend');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 3;
const rateLimits = new Map();

const COPY = {
  it: {
    subject: 'Sei nella lista DUBI 🎉',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
        <h2 style="color:#2D6A4F">Grazie per esserti iscritto!</h2>
        <p>Sei ufficialmente nella lista d'attesa di <strong>DUBI</strong> — il tuo assistente nutrizionale personale basato sulla scienza.</p>
        <p>Ti scriveremo non appena DUBI sarà disponibile. Nel frattempo, puoi scoprire di più su <a href="https://dubi.health" style="color:#2D6A4F">dubi.health</a>.</p>
        <p style="margin-top:32px;color:#888;font-size:13px">— Il team DUBI</p>
      </div>
    `
  },
  en: {
    subject: 'You\'re on the DUBI waitlist 🎉',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
        <h2 style="color:#2D6A4F">Thanks for signing up!</h2>
        <p>You're officially on the <strong>DUBI</strong> waitlist — your science-based personal nutrition assistant.</p>
        <p>We'll reach out as soon as DUBI is ready. In the meantime, learn more at <a href="https://dubi.health" style="color:#2D6A4F">dubi.health</a>.</p>
        <p style="margin-top:32px;color:#888;font-size:13px">— The DUBI team</p>
      </div>
    `
  }
};

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
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

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
      const result = await pool.query(
        `INSERT INTO waitlist (email, lang, source, ip)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (LOWER(email)) DO NOTHING
         RETURNING id`,
        [email, lang, source, ip]
      );

      const isNew = result.rowCount > 0;

      // Send thank-you email only for new signups
      if (isNew && resend) {
        const copy = COPY[lang] || COPY.en;
        resend.emails.send({
          from: 'DUBI <onboarding@resend.dev>',
          to: email,
          subject: copy.subject,
          html: copy.html
        }).catch(() => {}); // fire-and-forget, don't block the response
      }

      return res.status(200).json({ success: true, duplicate: !isNew });
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
