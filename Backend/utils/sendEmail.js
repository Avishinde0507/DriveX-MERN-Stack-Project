'use strict';

const nodemailer = require('nodemailer');

// Configure the transporter with Gmail's recommended SMTP settings:
// Host: smtp.gmail.com
// Port: 587 (STARTTLS)
// Secure: false (since it uses STARTTLS)
// family: 4 forces Node.js to prefer IPv4 (bypasses IPv6 routing/ENETUNREACH errors)
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, 
  family: 4, 
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    // Necessary for environments like Render where SSL certs must bypass local validation
    rejectUnauthorized: false,
  },
});

/**
 * Reusable email utility using Gmail SMTP with App Passwords
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} [options.text] - Plain text content
 * @param {string} [options.html] - HTML content
 * @param {string} [options.from] - Custom from address (optional)
 * @returns {Promise<Object>} - Nodemailer send result info
 */
const sendEmail = async ({ to, subject, text, html, from }) => {
  const mailOptions = {
    from: from || process.env.SMTP_FROM || `"${process.env.EMAIL_USER ? process.env.EMAIL_USER.split('@')[0] : 'DriveX'}" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
    html,
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
      console.error('   💡 Suggestion: Authentication failed. Verify EMAIL_USER is correct and EMAIL_PASS is a valid 16-character Gmail App Password.');
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
  console.log(`   ↳ EMAIL_USER (from env):  ${process.env.EMAIL_USER || 'Not Set'}`);
  console.log(`   ↳ EMAIL_PASS (from env):  ${process.env.EMAIL_PASS ? '******** (configured)' : 'NOT CONFIGURED'}`);

  console.log('\n📡 [Nodemailer] SMTP Transporter Configuration:');
  console.log(`   ↳ Host:   smtp.gmail.com`);
  console.log(`   ↳ Port:   587`);
  console.log(`   ↳ Secure: false (STARTTLS)`);
  console.log(`   ↳ Family: IPv4 (Forced via family: 4)`);

  console.log('\n📡 [Nodemailer] Verifying SMTP connection to smtp.gmail.com:587...');
  try {
    await transporter.verify();
    console.log('✅ [Nodemailer] SMTP connection verified successfully. Ready to send emails.');
  } catch (error) {
    console.error('❌ [Nodemailer] SMTP connection verification failed.');
    console.error(`   ↳ Message:  ${error.message}`);
    console.error(`   ↳ Code:     ${error.code || 'N/A'}`);

    if (error.code === 'EAUTH') {
      console.error('   💡 Suggestion: Check if EMAIL_USER and EMAIL_PASS are correct. Verify you are using a Gmail App Password.');
    } else if (error.code === 'ENETUNREACH') {
      console.error('   💡 Suggestion: Network routing error (IPv6 unreachable). Ensure the family setting resolves to IPv4.');
    }
  }
};

sendEmail.transporter = transporter;
sendEmail.verifyConnection = verifyConnection;

module.exports = sendEmail;
