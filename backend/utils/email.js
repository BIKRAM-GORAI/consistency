const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_EMAIL,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

/**
 * Send an email using the configured transporter.
 * @param {Object} options - Email options
 * @param {String} options.to - Recipient email
 * @param {String} options.subject - Email subject
 * @param {String} options.html - HTML body
 * @returns {Promise}
 */
const sendEmail = async (options) => {
  console.log(`[Email Service] Preparing to send email to: ${options.to} | Subject: ${options.subject}`);
  const mailOptions = {
    from: `Consistency Tracker <${process.env.GMAIL_EMAIL}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
  };

  return transporter.sendMail(mailOptions);
};

module.exports = {
  transporter,
  sendEmail,
};
