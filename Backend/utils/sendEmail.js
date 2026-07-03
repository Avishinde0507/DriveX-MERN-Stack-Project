'use strict';

const nodemailer = require('nodemailer');

// Initialize the Nodemailer transporter using the Gmail SMTP service.
// This is the most reliable way to connect to Gmail SMTP as it configures
// host: smtp.gmail.com, port: 465, secure: true automatically under the hood.
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
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
    // If process.env.SMTP_FROM is set, use it; otherwise fall back to EMAIL_USER.
    from: from || process.env.SMTP_FROM || `"${process.env.EMAIL_USER.split('@')[0]}" <${process.env.EMAIL_USER}>`,
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
    console.error(`❌ [Nodemailer Error] Failed to send email to ${to}. Reason:`, error.message);
    throw error;
  }
};

module.exports = sendEmail;
