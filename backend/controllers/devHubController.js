const User = require('../models/User');
const axios = require('axios');

// Helper to determine bookmark and AI notes quota based on user status
const getQuotas = (user) => {
  const isPremium = user.isSubscriptionActive || false;
  const freeBookmarkLimit = parseInt(process.env.FREE_BOOKMARK_LIMIT || '75', 10);
  const premiumBookmarkLimit = parseInt(process.env.PREMIUM_BOOKMARK_LIMIT || '500', 10);
  const freeAiNotesQuota = parseInt(process.env.FREE_AI_NOTES_QUOTA || '200', 10);
  const premiumAiNotesQuota = parseInt(process.env.PREMIUM_AI_NOTES_QUOTA || '500', 10);

  const bookmarkLimit = isPremium ? premiumBookmarkLimit : freeBookmarkLimit;
  const aiNotesQuota = isPremium ? premiumAiNotesQuota : freeAiNotesQuota;

  return { bookmarkLimit, aiNotesQuota, isPremium };
};

/**
 * GET /api/devhub/bookmarks
 * Returns user bookmarks and current quota status
 */
exports.getBookmarks = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { bookmarkLimit, isPremium } = getQuotas(user);
    res.json({
      bookmarks: user.bookmarks || [],
      usage: {
        count: (user.bookmarks || []).length,
        limit: bookmarkLimit,
        isPremium
      }
    });
  } catch (err) {
    console.error('Error fetching bookmarks:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * POST /api/devhub/bookmarks
 * Body: { title, url, serviceType, description, tags }
 */
exports.addBookmark = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { bookmarkLimit, isPremium } = getQuotas(user);
    const currentCount = (user.bookmarks || []).length;

    if (currentCount >= bookmarkLimit) {
      return res.status(403).json({
        error: 'LIMIT_REACHED',
        message: `Bookmark limit reached (${currentCount}/${bookmarkLimit}). Upgrade to Premium to unlock up to 250 bookmarks!`,
        count: currentCount,
        limit: bookmarkLimit,
        isPremium
      });
    }

    const { title, url, serviceType, description, tags } = req.body;
    if (!title || !url) {
      return res.status(400).json({ message: 'Title and URL are required' });
    }

    const newBookmark = {
      title,
      url,
      serviceType: serviceType || 'Custom',
      description: (description || '').slice(0, 200),
      tags: Array.isArray(tags) ? tags : (tags ? tags.split(',').map(t => t.trim()) : []),
      createdAt: new Date()
    };

    user.bookmarks.push(newBookmark);
    await user.save();

    res.status(201).json({
      message: 'Bookmark saved successfully',
      bookmark: user.bookmarks[user.bookmarks.length - 1],
      count: user.bookmarks.length,
      limit: bookmarkLimit
    });
  } catch (err) {
    console.error('Error adding bookmark:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * DELETE /api/devhub/bookmarks/:id
 */
exports.deleteBookmark = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const bookmarkId = req.params.id;
    user.bookmarks = user.bookmarks.filter(b => b._id.toString() !== bookmarkId);
    await user.save();

    res.json({ message: 'Bookmark deleted successfully', count: user.bookmarks.length });
  } catch (err) {
    console.error('Error deleting bookmark:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * POST /api/devhub/keys
 * Save/update custom BYO YouTube and Gemini keys
 */
exports.updateUserKeys = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { customYouTubeApiKey, customGeminiApiKey } = req.body;
    if (customYouTubeApiKey !== undefined) user.customYouTubeApiKey = customYouTubeApiKey.trim();
    if (customGeminiApiKey !== undefined) user.customGeminiApiKey = customGeminiApiKey.trim();

    await user.save();

    res.json({
      message: 'API keys updated successfully',
      hasCustomYouTubeKey: !!user.customYouTubeApiKey,
      hasCustomGeminiKey: !!user.customGeminiApiKey,
      customYouTubeKey: user.customYouTubeApiKey || '',
      customGeminiKey: user.customGeminiApiKey || ''
    });
  } catch (err) {
    console.error('Error updating user keys:', err);
    res.status(500).json({ message: 'Failed to update API keys' });
  }
};

exports.getUserKeys = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      hasCustomYouTubeKey: !!user.customYouTubeApiKey,
      hasCustomGeminiKey: !!user.customGeminiApiKey,
      customYouTubeKey: user.customYouTubeApiKey || '',
      customGeminiKey: user.customGeminiApiKey || ''
    });
  } catch (err) {
    console.error('Error fetching user keys:', err);
    res.status(500).json({ message: 'Failed to fetch API keys' });
  }
};

exports.deleteUserKey = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { service } = req.params;
    if (service === 'youtube') {
      user.customYouTubeApiKey = undefined;
    } else if (service === 'gemini') {
      user.customGeminiApiKey = undefined;
    } else {
      return res.status(400).json({ message: 'Invalid key service' });
    }

    await user.save();
    res.json({
      message: `${service.toUpperCase()} API key removed successfully`,
      hasCustomYouTubeKey: !!user.customYouTubeApiKey,
      hasCustomGeminiKey: !!user.customGeminiApiKey,
      customYouTubeKey: user.customYouTubeApiKey || '',
      customGeminiKey: user.customGeminiApiKey || ''
    });
  } catch (err) {
    console.error('Error deleting user key:', err);
    res.status(500).json({ message: 'Failed to delete API key' });
  }
};

/**
 * POST /api/devhub/youtube-search
 * Body: { query }
 */
exports.searchYouTube = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const { query } = req.body;
    if (!query) return res.status(400).json({ message: 'Search query is required' });

    const apiKey = (user && user.customYouTubeApiKey) ? user.customYouTubeApiKey : process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
      return res.status(400).json({
        error: 'NO_KEY',
        message: 'No YouTube API Key set. Please add your free YouTube API Key in DevHub Key Settings to enable YouTube search!'
      });
    }

    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=9&q=${encodeURIComponent(query)}&type=video&key=${apiKey}`;
    const ytRes = await axios.get(url);

    const videos = (ytRes.data.items || []).map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || '',
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt
    }));

    res.json({ videos, isCustomKey: !!(user && user.customYouTubeApiKey) });
  } catch (err) {
    console.error('YouTube API search error:', err.response?.data || err.message);
    const errorMsg = err.response?.data?.error?.message || err.message;
    res.status(500).json({ message: 'YouTube Search error: ' + errorMsg });
  }
};

/**
 * POST /api/devhub/ai-notes
 * Body: { videoId, videoTitle, videoDescription }
 */
exports.generateAINotes = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { videoTitle, videoDescription } = req.body;
    if (!videoTitle) return res.status(400).json({ message: 'Video title is required' });

    const { aiNotesQuota, isPremium } = getQuotas(user);
    const hasCustomKey = !!user.customGeminiApiKey;

    if (!hasCustomKey && (user.aiNotesCount || 0) >= aiNotesQuota) {
      return res.status(403).json({
        error: 'QUOTA_EXCEEDED',
        message: `AI Study Notes limit reached (${user.aiNotesCount}/${aiNotesQuota}). Upgrade to Premium or enter your own free Gemini API Key for UNLIMITED note generation!`,
        used: user.aiNotesCount,
        quota: aiNotesQuota,
        isPremium
      });
    }

    const geminiKey = hasCustomKey ? user.customGeminiApiKey : process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return res.status(400).json({
        error: 'NO_GEMINI_KEY',
        message: 'No Gemini API Key available. Please add your free Gemini API Key in DevHub Settings to generate study notes!'
      });
    }

    const prompt = `You are an expert developer and tech educator. Generate detailed, highly structured study notes for this video tutorial:
Title: "${videoTitle}"
Description: "${videoDescription || 'N/A'}"

Include:
1. 📌 **Core Concept & Summary**
2. 💡 **Key Takeaways & Technical Concepts**
3. 🛠 **Code Snippets or Architecture Design Points**
4. 🚀 **Action Items & Practice Exercises**

Format in clean GitHub-style Markdown with clear headings and bullet points.`;

    const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
    const modelsToTry = Array.from(new Set([primaryModel, 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-latest']));
    let geminiRes = null;
    let lastError = null;

    for (const model of modelsToTry) {
      try {
        geminiRes = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          {
            contents: [{ parts: [{ text: prompt }] }]
          },
          { headers: { 'Content-Type': 'application/json' }, timeout: 20000 }
        );
        if (geminiRes && geminiRes.data) break;
      } catch (err) {
        lastError = err;
        console.warn(`Gemini model ${model} failed:`, err.response?.data?.error?.message || err.message);
      }
    }

    if (!geminiRes || !geminiRes.data) {
      const errMsg = lastError?.response?.data?.error?.message || lastError?.message || 'Gemini API call failed.';
      return res.status(500).json({ message: `AI Notes Generation error: ${errMsg}` });
    }

    const notesText = geminiRes.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No notes generated.';

    // Deduct quota if not using custom key
    if (!hasCustomKey) {
      user.aiNotesCount = (user.aiNotesCount || 0) + 1;
      await user.save();
    }

    res.json({
      notes: notesText,
      used: user.aiNotesCount,
      quota: aiNotesQuota,
      hasCustomKey
    });
  } catch (err) {
    console.error('Gemini AI notes generation error:', err.response?.data || err.message);
    const errorMsg = err.response?.data?.error?.message || err.message;
    res.status(500).json({ message: 'AI Notes Generation error: ' + errorMsg });
  }
};
