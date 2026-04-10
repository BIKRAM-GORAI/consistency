const User = require('../models/User');

/**
 * POST /api/auth/register
 * Register a new user with name, email, and password
 */
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    // Check if email already taken
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ message: 'An account with this email already exists' });
    }

    const user = new User({ name, email: email.toLowerCase().trim(), password });
    const saved = await user.save();

    res.status(201).json({ _id: saved._id, name: saved.name, email: saved.email });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * POST /api/auth/login
 * Login with email and password — returns user info or 401
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim(), password });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    res.json({ _id: user._id, name: user.name, email: user.email });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { register, login };
