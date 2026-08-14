const Review = require('../models/Review');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_EMAIL,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// Use environment variable for creator emails, fallback to primary if not set
const CREATOR_EMAILS = process.env.REVIEW_RECIPIENT_EMAILS 
  ? process.env.REVIEW_RECIPIENT_EMAILS.split(',').map(e => e.trim()) 
  : ['bikram77620@gmail.com'];

/**
 * Submit a new review
 */
async function submitReview(req, res) {
  try {
    const { name, email, description, userBadges } = req.body;
    if (!name || !email || !description) {
      return res.status(400).json({ message: 'Name, email, and description are required.' });
    }

    const newReview = new Review({ 
      name, 
      email, 
      description,
      userBadges: userBadges || []
    });
    await newReview.save();

    // Send email to creators
    const mailOptions = {
      from: process.env.GMAIL_EMAIL,
      to: CREATOR_EMAILS.join(', '),
      subject: `New Review for Consistency Daily from ${name} (${email})`,
      text: `A new user review has been submitted on Consistency Daily!\n\nUser Name: ${name}\nUser Email: ${email}\n\nReview:\n${description}\n\nCheck out the dashboard to see all reviews.`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending review email:', error);
      } else {
        console.log('Review email sent:', info.response);
      }
    });

    res.status(201).json({ message: 'Review submitted successfully.' });
  } catch (err) {
    console.error('Error submitting review:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * Fetch reviews with server-side pagination
 */
async function getReviews(req, res) {
  try {
    const mode = process.env.REVIEW_ACCESS_MODE || 'private';
    
    // Check password if private
    if (mode === 'private') {
      const password = req.headers['x-admin-password'];
      const adminPassword = process.env.REVIEW_ADMIN_PASSWORD;
      
      if (!adminPassword) {
        console.warn('REVIEW_ADMIN_PASSWORD is not set in environment variables!');
        return res.status(500).json({ message: 'Server configuration error.' });
      }

      if (password !== adminPassword) {
        return res.status(401).json({ message: 'Incorrect password.' });
      }
    }

    // Backward compatibility for legacy callers requesting raw array
    if (req.query.all === 'true') {
      const reviews = await Review.find().select('-email').sort({ createdAt: -1 });
      return res.json(reviews);
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 6));
    const skip = (page - 1) * limit;

    const totalReviews = await Review.countDocuments();
    const reviews = await Review.find()
      .select('-email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      reviews,
      page,
      limit,
      totalReviews,
      totalPages: Math.ceil(totalReviews / limit),
      hasMore: page * limit < totalReviews
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * Get current access mode so frontend knows whether to ask for password
 */
function getAccessMode(req, res) {
  const mode = process.env.REVIEW_ACCESS_MODE || 'private';
  res.json({ mode });
}

module.exports = {
  submitReview,
  getReviews,
  getAccessMode
};
