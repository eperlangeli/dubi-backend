'use strict';

const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 3;
const rateLimits = new Map();

let supabaseClient = null;

const getSupabaseClient = () => {
  if (supabaseClient) return supabaseClient;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase waitlist configuration is missing');
  }

  supabaseClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return supabaseClient;
};

const getClientIp = (req) => {
  if (req.ip) return req.ip;
  const forwardedFor = req.headers['x-forwarded-for'];
  return forwardedFor ? String(forwardedFor).split(',')[0].trim() : null;
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
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('waitlist')
      .insert({ email, lang, source, ip });

    if (error) {
      const duplicate = error.code === '23505' || /duplicate/i.test(error.message || '');
      if (duplicate) {
        return res.status(200).json({ success: true, duplicate: true });
      }
      throw error;
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Waitlist signup could not be saved.');
    return res.status(500).json({ error: 'Could not save signup' });
  }
});

module.exports = router;
