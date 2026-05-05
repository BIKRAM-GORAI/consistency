const Review = require('../models/Review');
const jwt = require('jsonwebtoken');

/**
 * Admin Login
 */
async function adminLogin(req, res) {
  try {
    const { email, password } = req.body;
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      return res.status(500).json({ message: 'Admin credentials not configured in server environment.' });
    }

    if (email !== adminEmail || password !== adminPassword) {
      return res.status(401).json({ message: 'Invalid admin credentials.' });
    }

    // Generate Admin Token
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const token = jwt.sign(
      { isAdmin: true, email: adminEmail },
      jwtSecret,
      { expiresIn: '24h' }
    );

    res.json({ token, message: 'Admin login successful' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * Get all reviews with full data for admin
 */
async function getAdminReviews(req, res) {
  try {
    const { sort } = req.query;
    const sortOrder = sort === 'asc' ? 1 : -1;
    
    const reviews = await Review.find().sort({ createdAt: sortOrder });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * Create a new review manually
 */
async function createReview(req, res) {
  try {
    const { name, email, description, createdAt, userBadges } = req.body;
    
    const newReview = new Review({
      name,
      email,
      description,
      createdAt: createdAt || Date.now(),
      userBadges: userBadges || []
    });

    await newReview.save();
    res.status(201).json({ message: 'Review created successfully', review: newReview });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * Update a review
 */
async function updateReview(req, res) {
  try {
    const { id } = req.params;
    const { name, email, description, createdAt, userBadges } = req.body;

    const updatedReview = await Review.findByIdAndUpdate(
      id,
      { name, email, description, createdAt, userBadges },
      { new: true }
    );

    if (!updatedReview) {
      return res.status(404).json({ message: 'Review not found.' });
    }

    res.json({ message: 'Review updated successfully', review: updatedReview });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * Delete a review
 */
async function deleteReview(req, res) {
  try {
    const { id } = req.params;
    const deletedReview = await Review.findByIdAndDelete(id);

    if (!deletedReview) {
      return res.status(404).json({ message: 'Review not found.' });
    }

    res.json({ message: 'Review deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

module.exports = {
  adminLogin,
  getAdminReviews,
  createReview,
  updateReview,
  deleteReview
};
