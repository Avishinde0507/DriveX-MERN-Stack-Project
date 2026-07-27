'use strict';

const nodemailer = require('nodemailer');

// Configure the transporter using SMTP settings from environment variables.
// Port: 587 (STARTTLS) — Secure: false since STARTTLS is used.
// family: 4 forces Node.js to prefer IPv4 (bypasses IPv6 routing/ENETUNREACH errors)
const transporter = nodemailer.createTransport({
  host:    process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port:    parseInt(process.env.SMTP_PORT, 10) || 587,   // ← must be a Number, not a String
  secure:  false,                                          // false = STARTTLS on port 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  family:             4,      // force IPv4 — Render/cloud hosts often drop IPv6 SMTP
  connectionTimeout:  10000,  // 10 s — fail fast instead of hanging
  greetingTimeout:    10000,  // 10 s — time allowed for SMTP EHLO handshake
  socketTimeout:      15000,  // 15 s — max idle time per socket operation
});

/**
 * Reusable email utility using Gmail SMTP with App Passwords.
 * Automatically attaches DriveX-logo.png as a CID inline attachment so
 * every email template can reference it as <img src="cid:drivex-logo">.
 * This avoids the Gmail 102 KB clip limit that breaks base64 data URIs.
 *
 * @param {Object} options
 * @param {string} options.to       - Recipient email address
 * @param {string} options.subject  - Email subject
 * @param {string} [options.text]   - Plain text content
 * @param {string} [options.html]   - HTML content
 * @param {string} [options.from]   - Custom from address (optional)
 * @returns {Promise<Object>}       - Nodemailer send result info
 */
const sendEmail = async ({ to, subject, text, html, from }) => {
  const path = require('path');
  const fs = require('fs');

  // Attach the DriveX logo as a CID inline image.
  // The HTML templates reference it as:  <img src="cid:drivex-logo">
  const logoPath = path.resolve(__dirname, '../../Frontend/public/DriveX-logo.png');
  const attachments = [];
  if (fs.existsSync(logoPath)) {
    attachments.push({
      filename: 'DriveX-logo.png',
      path: logoPath,
      cid: 'logo@drivex.com',   // <-- HTML uses  src="cid:logo@drivex.com"
      contentType: 'image/png',
      contentDisposition: 'inline',
    });
  } else {
    console.warn('⚠️  [Email] DriveX-logo.png not found at:', logoPath);
  }

  const mailOptions = {
    from: from || process.env.SMTP_FROM || `"${process.env.SMTP_USER ? process.env.SMTP_PASS.split('@')[0] : 'DriveX'}" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html,
    attachments,
  };

  try {
    console.log(`📧 [Nodemailer] Attempting to send email to: ${to} (Subject: "${subject}")`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ [Nodemailer] Email sent successfully. Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`❌ [Nodemailer Error] Failed to send email to ${to}.`);
    console.error(`   ↳ Error Message: ${error.message}`);
    console.error(`   ↳ Code:          ${error.code || 'N/A'}`);
    console.error(`   ↳ Command:       ${error.command || 'N/A'}`);
    console.error(`   ↳ Response:      ${error.response || 'N/A'}`);

    if (error.code === 'EAUTH') {
      console.error('   💡 Suggestion: Authentication failed. Verify SMTP_USER is correct and SMTP_PASS is a valid 16-character Gmail App Password.');
    } else if (error.code === 'ENETUNREACH') {
      console.error('   💡 Suggestion: Network unreachable. Ensure there is internet connectivity and IPv4 is preferred.');
    }
    throw error;
  }
};

/**
 * Verifies Nodemailer SMTP connectivity
 */
const verifyConnection = async () => {
  console.log('\n📡 [Nodemailer] Deployed Environment SMTP Configuration Check:');
  console.log(`   ↳ SMTP_HOST (from env):   ${process.env.SMTP_HOST || 'Not Set (using default smtp.gmail.com)'}`);
  console.log(`   ↳ SMTP_PORT (from env):   ${process.env.SMTP_PORT || 'Not Set (using default 587)'}`);
  console.log(`   ↳ SMTP_SECURE (from env): ${process.env.SMTP_SECURE || 'Not Set (using default false)'}`);
  console.log(`   ↳ SMTP_USER (from env):  ${process.env.SMTP_USER || 'Not Set'}`);
  console.log(`   ↳ SMTP_PASS (from env):  ${process.env.SMTP_PASS ? '******** (configured)' : 'NOT CONFIGURED'}`);

  console.log('\n📡 [Nodemailer] SMTP Transporter Configuration:');
  console.log(`   ↳ Host:   ${process.env.SMTP_HOST || 'smtp-relay.brevo.com'}`);
  console.log(`   ↳ Port:   ${process.env.SMTP_PORT || 587}`);
  console.log(`   ↳ Secure: false (STARTTLS)`);
  console.log(`   ↳ Family: IPv4 (Forced via family: 4)`);

  console.log(`\n📡 [Nodemailer] Verifying SMTP connection to ${process.env.SMTP_HOST || 'smtp-relay.brevo.com'}:${process.env.SMTP_PORT || 587}...`);
  try {
    await transporter.verify();
    console.log('✅ [Nodemailer] SMTP connection verified successfully. Ready to send emails.');
  } catch (error) {
    console.error('❌ [Nodemailer] SMTP connection verification failed.');
    console.error(`   ↳ Message:  ${error.message}`);
    console.error(`   ↳ Code:     ${error.code || 'N/A'}`);

    if (error.code === 'EAUTH') {
      console.error('   💡 Suggestion: Check if SMTP_USER and SMTP_PASS are correct in your .env file.');
    } else if (error.code === 'ENETUNREACH') {
      console.error('   💡 Suggestion: Network routing error (IPv6 unreachable). Ensure the family setting resolves to IPv4.');
    }
  }
};

sendEmail.transporter = transporter;
sendEmail.verifyConnection = verifyConnection;

module.exports = sendEmail;
