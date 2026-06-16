const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

let Resend = null;
try {
  ({ Resend } = require('resend'));
} catch (error) {
  // Optional in local development. Render installs it from package.json.
}

module.exports = (pool) => {
  const router = express.Router();

  const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.userId;
      next();
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());

  const preferredLanguage = (req) => {
    const explicit = String(req.body?.language || req.query?.lang || '').toLowerCase();
    const header = String(req.headers['accept-language'] || '').toLowerCase();
    return explicit.startsWith('it') || header.startsWith('it') ? 'it' : 'en';
  };

  const getBackendBaseUrl = () => (
    process.env.BACKEND_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    'https://dubi.health'
  ).replace(/\/+$/, '');

  const htmlPage = ({ title, body }) => `
    <!doctype html>
    <html lang="it">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>${title}</title>
        <style>
          body{font-family:Inter,Arial,sans-serif;background:#F5F1EA;color:#232323;margin:0;padding:32px;}
          main{max-width:640px;margin:8vh auto;background:#fff;border:1px solid #E4DED4;border-radius:24px;padding:32px;box-shadow:0 18px 45px rgba(0,0,0,.08);}
          h1{margin:0 0 14px;font-size:28px;line-height:1.15;}
          p{font-size:16px;line-height:1.6;margin:0 0 12px;color:#555;}
          a{color:#6B8A64;font-weight:700;}
        </style>
      </head>
      <body><main>${body}</main></body>
    </html>
  `;

  const emailCopy = (lang, verifyUrl) => {
    if (lang === 'it') {
      return {
        subject: 'Autorizzazione richiesta per DUBI',
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.55;color:#232323">
            <h2>Autorizzazione richiesta per DUBI</h2>
            <p>Un minore ha creato un account DUBI e ha indicato questo indirizzo email per richiedere la tua autorizzazione.</p>
            <p>DUBI tratta dati legati a nutrizione, stile di vita e salute. Per questo, prima che un minore possa continuare, chiediamo il consenso di un genitore o tutore legale.</p>
            <p>
              <a href="${verifyUrl}" style="display:inline-block;background:#6B8A64;color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700">
                Conferma autorizzazione
              </a>
            </p>
            <p>Il link scade tra 7 giorni. Se non ti aspettavi questa email, puoi ignorarla.</p>
            <p style="font-size:12px;color:#777">Domande privacy: privacy@dubi.health</p>
          </div>
        `
      };
    }

    return {
      subject: 'Authorisation request for DUBI',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.55;color:#232323">
          <h2>Authorisation request for DUBI</h2>
          <p>A minor has created a DUBI account and entered this email address to request your authorisation.</p>
          <p>DUBI processes nutrition, lifestyle and health-related data. For this reason, a parent or legal guardian must authorise the account before the minor can continue.</p>
          <p>
            <a href="${verifyUrl}" style="display:inline-block;background:#6B8A64;color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700">
              Confirm authorisation
            </a>
          </p>
          <p>The link expires in 7 days. If you did not expect this email, you can ignore it.</p>
          <p style="font-size:12px;color:#777">Privacy questions: privacy@dubi.health</p>
        </div>
      `
    };
  };

  router.post('/request', verifyToken, async (req, res) => {
    try {
      const guardianName = String(req.body?.guardianName || '').trim();
      const guardianEmail = String(req.body?.guardianEmail || '').trim().toLowerCase();

      if (!guardianName) {
        return res.status(400).json({ error: 'guardian_name_required' });
      }

      if (!isValidEmail(guardianEmail)) {
        return res.status(400).json({ error: 'invalid_guardian_email' });
      }

      const userResult = await pool.query(
        'SELECT id, email, is_minor, parental_consent_status FROM users WHERE id = $1',
        [req.userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = userResult.rows[0];
      if (!user.is_minor) {
        return res.status(400).json({ error: 'parental_consent_not_required' });
      }

      if (user.parental_consent_status === 'approved') {
        return res.json({ success: true, alreadyApproved: true });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await pool.query(
        `
        UPDATE users
        SET guardian_name = $1,
            guardian_email = $2,
            parental_consent_token = $3,
            parental_consent_token_expires_at = $4,
            parental_consent_status = 'pending'
        WHERE id = $5
        `,
        [guardianName, guardianEmail, token, expiresAt, req.userId]
      );

      const verifyUrl = `${getBackendBaseUrl()}/api/parental-consent/verify/${token}`;
      const lang = preferredLanguage(req);
      const copy = emailCopy(lang, verifyUrl);
      const from = process.env.RESEND_FROM_EMAIL || 'DUBI <support@dubi.health>';
      const canSend = Boolean(process.env.RESEND_API_KEY && Resend);

      if (canSend) {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from,
          to: guardianEmail,
          subject: copy.subject,
          html: copy.html
        });
      } else {
        console.warn('Parental consent email not sent because RESEND_API_KEY or resend package is missing.');
        console.warn(`Parental consent verification link for user ${req.userId}: ${verifyUrl}`);
      }

      res.json({ success: true, emailSent: canSend });
    } catch (error) {
      console.error('Parental consent request failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/verify/:token', async (req, res) => {
    const token = String(req.params.token || '').trim();
    if (!token) {
      return res.status(400).send(htmlPage({
        title: 'Invalid link',
        body: '<h1>Link non valido / Invalid link</h1><p>Contattaci a <a href="mailto:privacy@dubi.health">privacy@dubi.health</a>.</p>'
      }));
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.allow_parental_consent_verify', 'true', true)");

      const result = await client.query(
        `
        SELECT id, parental_consent_token_expires_at
        FROM users
        WHERE parental_consent_token = $1
        LIMIT 1
        `,
        [token]
      );

      if (result.rows.length === 0) {
        await client.query('COMMIT');
        return res.status(404).send(htmlPage({
          title: 'Invalid link',
          body: '<h1>Link non valido / Invalid link</h1><p>Il link non esiste o e gia stato usato. Per domande: <a href="mailto:privacy@dubi.health">privacy@dubi.health</a>.</p>'
        }));
      }

      const user = result.rows[0];
      const expiresAt = user.parental_consent_token_expires_at
        ? new Date(user.parental_consent_token_expires_at)
        : null;

      if (!expiresAt || expiresAt.getTime() < Date.now()) {
        await client.query(
          "UPDATE users SET parental_consent_status = 'expired' WHERE id = $1",
          [user.id]
        );
        await client.query('COMMIT');
        return res.status(410).send(htmlPage({
          title: 'Expired link',
          body: '<h1>Link scaduto / Expired link</h1><p>Il link e scaduto. Chiedi al minore di richiedere una nuova email dall app DUBI.</p><p>Questions: <a href="mailto:privacy@dubi.health">privacy@dubi.health</a></p>'
        }));
      }

      await client.query(
        `
        UPDATE users
        SET parental_consent_status = 'approved',
            parental_consent_verified_at = NOW(),
            parental_consent_token = NULL,
            parental_consent_token_expires_at = NULL
        WHERE id = $1
        `,
        [user.id]
      );
      await client.query('COMMIT');

      res.send(htmlPage({
        title: 'Authorisation confirmed',
        body: '<h1>Autorizzazione confermata / Authorisation confirmed</h1><p>Grazie. Il minore puo ora accedere a DUBI e completare l onboarding.</p><p>Your child can now use DUBI.</p><p>Questions: <a href="mailto:privacy@dubi.health">privacy@dubi.health</a></p>'
      }));
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (rollbackError) {
        console.error('Parental consent rollback failed:', rollbackError.message);
      }
      console.error('Parental consent verification failed:', error);
      res.status(500).send(htmlPage({
        title: 'Verification error',
        body: '<h1>Errore / Error</h1><p>Non siamo riusciti a verificare il link. Riprova o contattaci a <a href="mailto:privacy@dubi.health">privacy@dubi.health</a>.</p>'
      }));
    } finally {
      client.release();
    }
  });

  return router;
};
