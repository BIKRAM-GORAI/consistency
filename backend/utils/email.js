const nodemailer = require('nodemailer');
const crypto = require('crypto');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_EMAIL,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

/**
 * Strip HTML tags to produce a plain-text fallback.
 * Used to generate multipart/alternative emails (crucial for inbox delivery).
 */
function htmlToPlainText(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Wrap raw HTML in a proper email-safe document shell.
 * Spam filters heavily penalise HTML-only fragments with no doctype.
 */
function wrapHtml(html, subject) {
  // If it already has a doctype/full structure, don't re-wrap
  if (/<!doctype/i.test(html) || /<html/i.test(html)) return html;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject || 'Consistency Tracker'}</title>
</head>
<body style="margin:0;padding:0;background:#f8f8f8;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border:1px solid #e0e0e0;border-radius:4px;overflow:hidden;">
    ${html}
  </div>
  <p style="text-align:center;font-size:11px;color:#aaa;margin-top:16px;">
    You are receiving this email because you are a registered user of Consistency Tracker.<br>
    © ${new Date().getFullYear()} Consistency Tracker
  </p>
</body>
</html>`;
}

/**
 * Send an email using the configured transporter.
 *
 * Always sends multipart/alternative (text + html) for best inbox delivery.
 *
 * @param {Object}   options
 * @param {String}   options.to          - Recipient email
 * @param {String}   options.subject     - Email subject
 * @param {String}   options.html        - HTML body (will be auto-wrapped if needed)
 * @param {String}   [options.text]      - Optional plain-text override (auto-derived if omitted)
 * @param {Array}    [options.attachments] - Nodemailer attachments array
 * @returns {Promise}
 */
const sendEmail = async (options) => {
  console.log(`[Email Service] Preparing to send email to: ${options.to} | Subject: ${options.subject}`);

  const wrappedHtml = wrapHtml(options.html, options.subject);
  const plainText   = options.text || htmlToPlainText(options.html);

  const mailOptions = {
    from: `Consistency Tracker <${process.env.GMAIL_EMAIL}>`,
    to: options.to,
    subject: options.subject,
    // multipart/alternative — both parts drastically reduce spam score
    text: plainText,
    html: wrappedHtml,
    // Standard headers that inbox providers expect
    headers: {
      'X-Mailer': 'Consistency Tracker Mailer/1.0',
      'Message-ID': `<${crypto.randomUUID()}@consistency-tracker.app>`,
    },
    ...(options.attachments ? { attachments: options.attachments } : {}),
  };

  return transporter.sendMail(mailOptions);
};

module.exports = {
  transporter,
  sendEmail,
  htmlToPlainText,
  wrapHtml,
};
