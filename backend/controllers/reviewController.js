const Review = require('../models/Review');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_EMAIL,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

const CREATOR_EMAILS = [
  'bikram77620@gmail.com',
  'gamingwithdeoxy@gmail.com',
  'tanjirokamado777555@gmail.com' 
];

/**
 * Submit a new review
 */
async function submitReview(req, res) {
  try {
    const { name, email, description } = req.body;
    if (!name || !email || !description) {
      return res.status(400).json({ message: 'Name, email, and description are required.' });
    }

    const newReview = new Review({ name, email, description });
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
 * Fetch all reviews
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

    const reviews = await Review.find().sort({ createdAt: -1 });
    res.json(reviews);
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
