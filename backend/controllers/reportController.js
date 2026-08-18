const Report = require('../models/Report');
const User = require('../models/User');
const { sendEmail } = require('../utils/email');

/**
 * Submit a new issue report
 * POST /api/reports
 */
async function submitReport(req, res) {
  try {
    const userId = req.user.userId;
    const { category, description } = req.body;

    // Validate inputs
    const validCategories = ['Bug', 'UI', 'Payment', 'Feature', 'Other'];
    if (!category || !validCategories.includes(category)) {
      return res.status(400).json({ message: 'Invalid or missing category.' });
    }

    if (!description || description.trim().length < 20) {
      return res.status(400).json({ message: 'Description must be at least 20 characters long.' });
    }

    // Resolve user details
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User account not found.' });
    }

    // Save report
    const newReport = new Report({
      userId,
      username: user.username || 'Anonymous',
      email: user.email,
      category,
      description: description.trim(),
      status: 'Pending'
    });

    await newReport.save();

    // Send email notification to ADMIN_OTP_RECIPIENT_EMAIL
    const recipientEmail = process.env.ADMIN_OTP_RECIPIENT_EMAIL || process.env.OWNER_EMAIL || process.env.ADMIN_EMAIL || 'bikram77620@gmail.com';
    const formattedDate = new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'full',
      timeStyle: 'medium'
    });

    const emailSubject = `[Issue Report / Feedback] ${category}: Submitted by ${user.name || user.username || 'User'}`;
    const emailHtml = `
      <div style="padding: 24px; font-family: Arial, sans-serif; color: #1e293b;">
        <h2 style="margin-top: 0; color: #2563eb; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
          📩 New Issue Report / User Feedback
        </h2>
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 6px 0;"><strong>Category:</strong> <span style="background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 4px; font-weight: bold;">${category}</span></p>
          <p style="margin: 6px 0;"><strong>Submitted By:</strong> ${user.name || 'N/A'} (${user.username ? '@' + user.username : 'No username'})</p>
          <p style="margin: 6px 0;"><strong>User Email:</strong> <a href="mailto:${user.email}">${user.email}</a></p>
          <p style="margin: 6px 0;"><strong>User ID:</strong> ${userId}</p>
          <p style="margin: 6px 0;"><strong>Submitted At:</strong> ${formattedDate} (IST)</p>
          <p style="margin: 6px 0;"><strong>Email Verified Status:</strong> ${user.isEmailVerified ? '✔ Verified' : '⚠️ Unverified'}</p>
        </div>
        
        <h3 style="margin-bottom: 8px; color: #0f172a;">Message / Description:</h3>
        <div style="background: #ffffff; border: 2px dashed #94a3b8; border-radius: 8px; padding: 16px; white-space: pre-wrap; font-size: 14px; line-height: 1.6; color: #334155;">
${description.trim()}
        </div>

        <p style="font-size: 12px; color: #64748b; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
          This is an automated notification from Consistency Daily server when a user files a report from their Profile page.
        </p>
      </div>
    `;

    sendEmail({
      to: recipientEmail,
      subject: emailSubject,
      html: emailHtml
    }).catch(emailErr => console.error('[Report] Failed to send email notification to admin:', emailErr));

    res.status(201).json({
      message: 'Report submitted successfully. Thank you for your feedback!',
      report: newReport
    });
  } catch (err) {
    console.error('submitReport error:', err);
    res.status(500).json({ message: 'Server error while submitting report.', error: err.message });
  }
}

module.exports = {
  submitReport
};
