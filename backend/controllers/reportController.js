const Report = require('../models/Report');
const User = require('../models/User');

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
