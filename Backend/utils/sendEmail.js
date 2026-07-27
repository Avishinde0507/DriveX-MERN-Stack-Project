'use strict';

const https = require('https');
const path  = require('path');
const fs    = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
// Brevo Transactional Email – HTTP API
//
// WHY HTTP INSTEAD OF SMTP?
//   Render.com (and most PaaS providers) block outbound SMTP ports 25/465/587.
//   Brevo's REST API runs on HTTPS port 443, which is always open.
//
// API KEY:
//   The SMTP_PASS value that starts with "xsmtpsib-..." is also accepted as
//   a Brevo API key for the REST endpoint, so no new secret is required.
// ─────────────────────────────────────────────────────────────────────────────

const BREVO_API_KEY = process.env.BREVO_API_KEY || process.env.SMTP_PASS;
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

// ── Logo: embed as Base64 CID attachment so it renders inside all mail clients ─
const logoPath = path.resolve(__dirname, '../../Frontend/public/DriveX-logo.png');
let logoCidAttachment = null;
if (fs.existsSync(logoPath)) {
  logoCidAttachment = {
    content:     fs.readFileSync(logoPath).toString('base64'),
    name:        'DriveX-logo.png',
    contentId:   'logo@drivex.com',   // templates use  src="cid:logo@drivex.com"
    contentType: 'image/png',
    disposition: 'inline',
  };
  console.log('✅ [Email] DriveX logo loaded as inline Base64 CID attachment.');
} else {
  console.warn('⚠️  [Email] DriveX-logo.png not found – logo will not appear in emails.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Low-level helper: POST JSON to Brevo's API via Node built-in https
// ─────────────────────────────────────────────────────────────────────────────
const brevoPost = (payload) =>
  new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);

    const req = https.request(
      {
        hostname: 'api.brevo.com',
        path:     '/v3/smtp/email',
        method:   'POST',
        headers: {
          'api-key':       BREVO_API_KEY,
          'Content-Type':  'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          const data = raw ? JSON.parse(raw) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, ...data });
          } else {
            const err = new Error(
              `Brevo API error ${res.statusCode}: ${data.message || raw}`
            );
            err.statusCode = res.statusCode;
            err.response   = data;
            reject(err);
          }
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('Brevo HTTP request timed out after 15 s'));
    });
    req.write(body);
    req.end();
  });

// ─────────────────────────────────────────────────────────────────────────────
// sendEmail  – drop-in replacement for the old Nodemailer version
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a transactional email via Brevo's HTTP API.
 *
 * @param {Object} options
 * @param {string} options.to       - Recipient email address
 * @param {string} options.subject  - Email subject
 * @param {string} [options.text]   - Plain-text fallback
 * @param {string} [options.html]   - HTML body
 * @param {string} [options.from]   - Custom "From" address (optional)
 * @returns {Promise<Object>}        - Brevo API response { messageId }
 */
const sendEmail = async ({ to, subject, text, html, from }) => {
  if (!BREVO_API_KEY) {
    throw new Error('sendEmail: BREVO_API_KEY / SMTP_PASS is not set in environment.');
  }

  // ── Sender ──────────────────────────────────────────────────────────────────
  let senderEmail = process.env.SMTP_USER || 'noreply@drivex.com';
  let senderName  = 'DriveX Support';

  if (from) {
    // Parse  "DriveX Support" <email@example.com>
    const match = from.match(/^"?([^"<]+)"?\s*<([^>]+)>$/);
    if (match) {
      senderName  = match[1].trim();
      senderEmail = match[2].trim();
    } else {
      senderEmail = from.trim();
    }
  } else if (process.env.SMTP_FROM) {
    const match = process.env.SMTP_FROM.match(/^"?([^"<]+)"?\s*<([^>]+)>$/);
    if (match) {
      senderName  = match[1].trim();
      senderEmail = match[2].trim();
    }
  }

  // ── Payload ─────────────────────────────────────────────────────────────────
  const payload = {
    sender:      { name: senderName, email: senderEmail },
    to:          [{ email: to }],
    subject,
    ...(html && { htmlContent: html }),
    ...(text && { textContent: text }),
  };

  // Attach logo as inline CID so HTML templates can use src="cid:logo@drivex.com"
  if (logoCidAttachment) {
    payload.attachment = [logoCidAttachment];
  }

  // ── Send ────────────────────────────────────────────────────────────────────
  try {
    console.log(`📧 [Brevo HTTP] Sending email → ${to} (Subject: "${subject}")`);
    const info = await brevoPost(payload);
    console.log(`✅ [Brevo HTTP] Email sent. Message ID: ${info.messageId || '(none)'}`);
    return info;
  } catch (error) {
    console.error(`❌ [Brevo HTTP] Failed to send email to ${to}.`);
    console.error(`   ↳ Error:    ${error.message}`);
    if (error.statusCode === 401) {
      console.error('   💡 Suggestion: BREVO_API_KEY / SMTP_PASS is invalid. Regenerate it in Brevo → Settings → API Keys.');
    } else if (error.statusCode === 400) {
      console.error('   💡 Suggestion: Bad request – check sender email is verified in your Brevo account.');
    }
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// verifyConnection  – confirms the API key is valid with a lightweight check
// ─────────────────────────────────────────────────────────────────────────────
const verifyConnection = async () => {
  console.log('\n📡 [Brevo HTTP] Email Service Configuration:');
  console.log(`   ↳ Transport:   Brevo REST API (HTTPS port 443 – no SMTP blocking)`);
  console.log(`   ↳ API Key:     ${BREVO_API_KEY ? '******** (configured)' : 'NOT CONFIGURED ⚠️'}`);
  console.log(`   ↳ Sender:      ${process.env.SMTP_FROM || process.env.SMTP_USER || '(not set)'}`);

  if (!BREVO_API_KEY) {
    console.error('❌ [Brevo HTTP] BREVO_API_KEY / SMTP_PASS is not set. Emails will fail.');
    return;
  }

  // Verify by fetching account info (GET /v3/account)
  const check = () =>
    new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'api.brevo.com',
          path:     '/v3/account',
          method:   'GET',
          headers:  { 'api-key': BREVO_API_KEY },
        },
        (res) => {
          let raw = '';
          res.on('data', (c) => (raw += c));
          res.on('end', () => {
            if (res.statusCode === 200) resolve(JSON.parse(raw));
            else reject(new Error(`Status ${res.statusCode}: ${raw}`));
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(10000, () => req.destroy(new Error('Timeout')));
      req.end();
    });

  try {
    const account = await check();
    console.log(`✅ [Brevo HTTP] API key valid. Account: ${account.email} (Plan: ${account.plan?.[0]?.type || 'unknown'})`);
  } catch (err) {
    console.error(`❌ [Brevo HTTP] API key verification failed: ${err.message}`);
    if (err.message.includes('401')) {
      console.error('   💡 Suggestion: Regenerate your API key in Brevo → Settings → API Keys.');
    }
  }
};

module.exports        = sendEmail;
module.exports.verifyConnection = verifyConnection;
