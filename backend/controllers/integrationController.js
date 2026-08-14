const User = require('../models/User');
const axios = require('axios');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Symmetric Encryption Helpers for OAuth Tokens
const ENCRYPTION_KEY = crypto.scryptSync(process.env.JWT_SECRET || 'fallback-secret-key-1234567890', 'salt', 32);
const IV_LENGTH = 16;

function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  if (!text) return null;
  try {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    console.error('Failed to decrypt token:', err.message);
    return null;
  }
}

/**
 * Redirection to GitHub OAuth
 * GET /api/integrations/github/auth?token=...
 */
const githubAuth = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(401).send('Authentication token is required');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const state = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const client_id = process.env.GITHUB_CLIENT_ID || '';
    const redirect_uri = encodeURIComponent(
      process.env.GITHUB_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/integrations/github/callback`
    );
    const scope = 'repo,read:user';

    const oauthUrl = `https://github.com/login/oauth/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}&scope=${scope}&state=${state}`;
    res.redirect(oauthUrl);
  } catch (error) {
    console.error('GitHub Auth initiation error:', error);
    res.status(500).send('Authentication failed: ' + error.message);
  }
};

/**
 * GitHub OAuth Callback
 * GET /api/integrations/github/callback?code=...&state=...
 */
const githubCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(400).send('Authorization code and state are required');
    }

    // Verify state back to userId
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    const userId = decoded.userId;

    // Exchange code for Access Token
    const client_id = process.env.GITHUB_CLIENT_ID;
    const client_secret = process.env.GITHUB_CLIENT_SECRET;
    const redirect_uri = process.env.GITHUB_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/integrations/github/callback`;

    const response = await axios.post('https://github.com/login/oauth/access_token', {
      client_id,
      client_secret,
      code,
      redirect_uri
    }, {
      headers: { Accept: 'application/json' }
    });

    if (response.data.error) {
      throw new Error(response.data.error_description || response.data.error);
    }

    const { access_token, refresh_token, expires_in } = response.data;
    const expiry = expires_in ? new Date(Date.now() + expires_in * 1000) : null;

    // Encrypt and save to user model
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send('User not found');
    }

    user.githubOAuth = {
      accessToken: encrypt(access_token),
      refreshToken: encrypt(refresh_token || null),
      expiry: expiry
    };
    await user.save();

    // Redirect to frontend devhub tab
    const rawFrontendUrl = process.env.FRONTEND_URL || 'http://localhost:5000';
    const baseUrl = rawFrontendUrl.replace(/\/+(index\.html)?$/i, '');
    res.redirect(`${baseUrl}/index.html?tab=devhub&connected=github`);
  } catch (error) {
    console.error('GitHub Callback exchange error:', error);
    res.status(500).send('GitHub connection failed: ' + error.message);
  }
};

/**
 * Redirection to Google OAuth (Calendar Read-Only)
 * GET /api/integrations/google/auth?token=...
 */
const googleAuth = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(401).send('Authentication token is required');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const state = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const client_id = process.env.GOOGLE_CLIENT_ID || '';
    const redirect_uri = encodeURIComponent(
      process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/integrations/google/callback`
    );
    const scope = 'https://www.googleapis.com/auth/calendar.readonly';

    const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${client_id}&redirect_uri=${redirect_uri}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}&access_type=offline&prompt=consent`;
    res.redirect(oauthUrl);
  } catch (error) {
    console.error('Google Auth initiation error:', error);
    res.status(500).send('Authentication failed: ' + error.message);
  }
};

/**
 * Google OAuth Callback
 * GET /api/integrations/google/callback?code=...&state=...
 */
const googleCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(400).send('Authorization code and state are required');
    }

    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const client_id = process.env.GOOGLE_CLIENT_ID;
    const client_secret = process.env.GOOGLE_CLIENT_SECRET;
    const redirect_uri = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/integrations/google/callback`;

    // Exchange code for Google Access + Refresh Tokens
    const response = await axios.post('https://oauth2.googleapis.com/token', {
      client_id,
      client_secret,
      code,
      redirect_uri,
      grant_type: 'authorization_code'
    }, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token, refresh_token, expires_in } = response.data;
    const expiry = new Date(Date.now() + expires_in * 1000);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send('User not found');
    }

    user.googleCalendarOAuth = {
      accessToken: encrypt(access_token),
      // Google only returns refresh_token on the first prompt=consent
      refreshToken: refresh_token ? encrypt(refresh_token) : user.googleCalendarOAuth.refreshToken,
      expiry: expiry
    };
    await user.save();

    const rawFrontendUrl = process.env.FRONTEND_URL || 'http://localhost:5000';
    const baseUrl = rawFrontendUrl.replace(/\/+(index\.html)?$/i, '');
    res.redirect(`${baseUrl}/index.html?tab=devhub&connected=google`);
  } catch (error) {
    console.error('Google Callback exchange error:', error);
    res.status(500).send('Google connection failed: ' + error.message);
  }
};

/**
 * Save configuration for WakaTime, Stack Overflow, and Dev.to
 * POST /api/integrations/config
 */
const setIntegrationConfig = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { wakaTimeKey, stackOverflowId, devtoUsername, mediumUsername } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (wakaTimeKey !== undefined) {
      user.wakaTimeKey = wakaTimeKey ? encrypt(wakaTimeKey) : null;
    }
    if (stackOverflowId !== undefined) {
      user.stackOverflowId = stackOverflowId || null;
    }
    if (devtoUsername !== undefined) {
      user.devtoUsername = devtoUsername || null;
    }
    if (mediumUsername !== undefined) {
      user.mediumUsername = mediumUsername || null;
    }

    await user.save();
    res.json({ message: 'Configuration saved successfully' });
  } catch (error) {
    console.error('Save configuration error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get Integration Status & Decrypted Tokens
 * GET /api/integrations/status
 */
const getIntegrationStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Decrypt access tokens if they exist and check expiry
    let githubConnected = !!(user.githubOAuth && user.githubOAuth.accessToken);
    let githubToken = githubConnected ? decrypt(user.githubOAuth.accessToken) : null;

    // Google Calendar removed from app � always not connected
    let googleConnected = false;
    let googleToken = null;

    res.json({
      github: {
        connected: githubConnected,
        accessToken: githubToken
      },
      google: {
        connected: googleConnected,
        accessToken: googleToken
      },
      wakatime: {
        connected: !!user.wakaTimeKey,
        key: user.wakaTimeKey ? decrypt(user.wakaTimeKey) : null
      },
      stackoverflow: {
        connected: !!user.stackOverflowId,
        id: user.stackOverflowId
      },
      devto: {
        connected: !!user.devtoUsername,
        username: user.devtoUsername
      },
      medium: {
        connected: !!user.mediumUsername,
        username: user.mediumUsername
      }
    });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Disconnect a service
 * POST /api/integrations/disconnect
 */
const disconnectService = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { service } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (service === 'github') {
      user.githubOAuth = undefined;
      user.githubAccessToken = undefined;
      user.githubUsername = undefined;
      user.githubId = undefined;
      user.githubAvatarUrl = undefined;
      user.githubProfileUrl = undefined;
    } else if (service === 'google') {
      user.googleCalendarOAuth = { accessToken: null, refreshToken: null, expiry: null };
    } else if (service === 'wakatime') {
      user.wakaTimeKey = null;
    } else if (service === 'stackoverflow') {
      user.stackOverflowId = null;
    } else if (service === 'devto') {
      user.devtoUsername = null;
    } else if (service === 'medium') {
      user.mediumUsername = null;
    } else {
      return res.status(400).json({ message: 'Invalid service parameter' });
    }

    await user.save();
    res.json({ message: `${service} disconnected successfully` });
  } catch (error) {
    console.error('Disconnect service error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Internal Helper to refresh Google OAuth Access Token
 */
async function refreshGoogleToken(user) {
  const refreshTokenDecrypted = decrypt(user.googleCalendarOAuth.refreshToken);
  if (!refreshTokenDecrypted) {
    throw new Error('No refresh token available');
  }

  const client_id = process.env.GOOGLE_CLIENT_ID;
  const client_secret = process.env.GOOGLE_CLIENT_SECRET;

  const response = await axios.post('https://oauth2.googleapis.com/token', {
    client_id,
    client_secret,
    refresh_token: refreshTokenDecrypted,
    grant_type: 'refresh_token'
  }, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  const { access_token, expires_in } = response.data;
  const expiry = new Date(Date.now() + expires_in * 1000);

  user.googleCalendarOAuth.accessToken = encrypt(access_token);
  user.googleCalendarOAuth.expiry = expiry;
  await user.save();

  return access_token;
}

module.exports = {
  githubAuth,
  githubCallback,
  googleAuth,
  googleCallback,
  setIntegrationConfig,
  getIntegrationStatus,
  disconnectService
};
