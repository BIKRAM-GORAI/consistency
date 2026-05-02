const User = require('../models/User');
const Day = require('../models/Day');
const axios = require('axios');

// Configuration
const LEETCODE_API_BASE_URL = process.env.LEETCODE_API_BASE_URL || 'https://alfa-leetcode-api.onrender.com';
const VERIFICATION_CODE_EXPIRY_HOURS = parseInt(process.env.VERIFICATION_CODE_EXPIRY_HOURS) || 1;
const MAX_USERNAME_CHANGES = parseInt(process.env.MAX_USERNAME_CHANGES) || 3;

/**
 * Generate verification code for user
 * POST /api/leetcode/generate-code
 */
const generateVerificationCode = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { leetcodeUsername } = req.body;

    if (!leetcodeUsername) {
      return res.status(400).json({ message: 'LeetCode username is required' });
    }

    // Check if user has reached the maximum username change limit
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.leetcodeUsernameChangeCount >= MAX_USERNAME_CHANGES) {
      return res.status(400).json({
        message: `You have reached the maximum limit of ${MAX_USERNAME_CHANGES} username changes.`,
        remainingChanges: 0
      });
    }

    // Block new code generation while a retry window is still active
    if (user.leetcodeVerificationStatus === 'pending_retry' && user.leetcodeRetryScheduledAt) {
      const expiresAt = new Date(user.leetcodeRetryScheduledAt.getTime() + 15 * 60 * 1000);
      if (new Date() < expiresAt) {
        return res.status(400).json({
          message: 'A verification retry is in progress. Use the "Check Status" button, or wait for the 15-minute window to expire.',
          retryAvailableAt: new Date(user.leetcodeRetryScheduledAt.getTime() + 5 * 60 * 1000).toISOString(),
          retryExpiresAt: expiresAt.toISOString()
        });
      }
      // 15-min window expired — auto-clear stale pending state before generating fresh code
      user.leetcodeVerificationStatus = 'none';
      user.leetcodeRetryScheduledAt = null;
      user.leetcodeVerificationCode = null;
      user.leetcodeVerificationExpiry = null;
      user.leetcodePendingUsername = null;
    }

    // Generate unique verification code
    const code = `TODOAI-${generateRandomCode()}`;
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + VERIFICATION_CODE_EXPIRY_HOURS);

    // Store username as PENDING — only commit to leetcodeUsername after verification succeeds
    user.leetcodePendingUsername = leetcodeUsername;
    user.leetcodeVerificationCode = code;
    user.leetcodeVerificationExpiry = expiry;
    await user.save();

    res.json({
      verificationCode: code,
      expiry: expiry.toISOString(),
      message: 'Add this code to your LeetCode profile bio',
      remainingChanges: MAX_USERNAME_CHANGES - user.leetcodeUsernameChangeCount
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Verify LeetCode profile ownership
 * POST /api/leetcode/verify-profile
 */
const verifyLeetCodeProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user has a verification code
    if (!user.leetcodeVerificationCode) {
      return res.status(400).json({ message: 'No verification code found. Please generate a code first.' });
    }

    // Check if verification code has expired
    if (new Date() > user.leetcodeVerificationExpiry) {
      return res.status(400).json({ message: 'Verification code has expired. Please generate a new code.' });
    }

    // Determine which username to verify against (pending takes priority)
    const usernameToVerify = user.leetcodePendingUsername || user.leetcodeUsername;
    if (!usernameToVerify) {
      return res.status(400).json({ message: 'No LeetCode username found. Please generate a verification code first.' });
    }

    try {
      // Fetch the PENDING username's profile from LeetCode API
      const profileData = await getLeetCodeProfile(usernameToVerify);

      // Check if verification code exists in the about section
      const aboutText = profileData.about || '';
      const verificationCode = user.leetcodeVerificationCode;

      console.log(`Checking profile bio for ${usernameToVerify}:`);
      console.log('  Full about text:', aboutText);
      console.log('  Looking for code:', verificationCode);
      console.log('  Code found in bio:', aboutText.includes(verificationCode));

      if (!aboutText.includes(verificationCode)) {
        if (user.leetcodeVerificationStatus === 'pending_retry') {
          // ── SCENARIO C: Retry attempt ("Check Status" button) ──
          // Enforce the 5-min minimum server-side so the timer can't be bypassed via direct API call
          const availableAt = new Date(user.leetcodeRetryScheduledAt.getTime() + 5 * 60 * 1000);
          if (new Date() < availableAt) {
            return res.status(429).json({
              message: 'Please wait for the countdown timer before retrying.',
              retryAvailableAt: availableAt.toISOString()
            });
          }

          // 5+ min have passed and code is still not found → FINAL FAILURE
          user.leetcodeVerificationStatus = 'none';
          user.leetcodeRetryScheduledAt = null;
          user.leetcodeVerificationCode = null;
          user.leetcodeVerificationExpiry = null;
          user.leetcodePendingUsername = null;
          await user.save();

          return res.json({
            verified: false,
            finalFailure: true,
            message: 'Verification code not found. Please double-check your LeetCode bio for typos, then generate a fresh code and try again.'
          });
        }

        // ── SCENARIO B: First attempt failed — start the retry window ──
        user.leetcodeVerificationStatus = 'pending_retry';
        user.leetcodeRetryScheduledAt = new Date();
        await user.save();

        const retryAvailableAt = new Date(Date.now() + 5  * 60 * 1000).toISOString();
        const retryExpiresAt   = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        return res.json({
          verified: false,
          pendingRetry: true,
          retryAvailableAt,
          retryExpiresAt,
          message: 'Code not found yet — this may be a caching delay. You can check again in 5 minutes.'
        });
      }

      // ── SCENARIO A: Code found — commit and clear everything ──
      user.leetcodeUsername = usernameToVerify;
      user.leetcodePendingUsername = null;
      user.leetcodeLastVerifiedAt = new Date();
      user.leetcodeUsernameChangeCount += 1;
      user.leetcodeProfilePicture = profileData.avatar || '';
      user.leetcodeVerificationCode = null;
      user.leetcodeVerificationExpiry = null;
      user.leetcodeVerificationStatus = 'none';
      user.leetcodeRetryScheduledAt = null;
      await user.save();

      res.json({
        verified: true,
        leetcodeUsername: user.leetcodeUsername,
        profilePicture: user.leetcodeProfilePicture,
        message: 'Profile verified successfully',
        remainingChanges: MAX_USERNAME_CHANGES - user.leetcodeUsernameChangeCount
      });
    } catch (apiError) {
      console.error('LeetCode API error:', apiError);

      // Provide more specific error messages
      if (apiError.response && apiError.response.status === 404) {
        return res.status(404).json({
          message: 'LeetCode profile not found. Please check your username and try again.'
        });
      }

      return res.status(503).json({
        message: 'LeetCode services are currently unavailable. This might be due to rate limiting or server issues. Please try again in a few minutes.',
        error: apiError.message
      });
    }
  } catch (error) {
    console.error('Error verifying LeetCode profile:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Validate LeetCode problem submission
 * POST /api/leetcode/validate-problem
 */
const validateLeetCodeProblem = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { problemUrl, dayDate } = req.body;

    console.log('Validating LeetCode problem:', { userId, problemUrl, dayDate });

    if (!problemUrl) {
      return res.status(400).json({ message: 'Problem URL is required' });
    }

    if (!dayDate) {
      return res.status(400).json({ message: 'Day date is required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.leetcodeUsername) {
      return res.status(400).json({ message: 'Please connect your LeetCode profile first' });
    }

    if (!user.leetcodeLastVerifiedAt) {
      return res.status(400).json({ message: 'Please verify your LeetCode profile first' });
    }

    // Extract problem title from URL
    const problemTitle = extractProblemTitle(problemUrl);
    if (!problemTitle) {
      return res.status(400).json({ message: 'Invalid LeetCode problem URL' });
    }

    try {
      // Get problem details from alfa-leetcode-api
      console.log('Fetching problem details for:', problemTitle);
      const problemDetails = await getProblemDetails(problemTitle);
      console.log('Problem details:', problemDetails);

      // Get user's accepted submissions
      console.log('Fetching user accepted submissions for:', user.leetcodeUsername);
      const submissions = await getUserAcceptedSubmissions(user.leetcodeUsername);

      // Check for accepted submission on the specific date
      const validation = validateSubmission(submissions, problemTitle, dayDate);

      if (!validation.valid) {
        console.log('Validation failed:', validation);
        return res.status(400).json({
          valid: false,
          message: validation.message
        });
      }

      console.log('Validation successful:', validation);

      res.json({
        valid: true,
        problemTitle: problemDetails.title,
        difficulty: problemDetails.difficulty,
        acceptedDate: validation.acceptedDate,
        submissionCount: validation.submissionCount,
        verified: true,
        message: 'Problem verified successfully'
      });
    } catch (apiError) {
      console.error('LeetCode API error:', apiError);
      return res.status(503).json({
        message: 'LeetCode services are currently down. Please try again later.'
      });
    }
  } catch (error) {
    console.error('Error validating LeetCode problem:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get current daily LeetCode problem
 * GET /api/leetcode/daily-problem
 */
const getDailyLeetCodeProblem = async (req, res) => {
  try {
    try {
      const response = await axios.get(`${LEETCODE_API_BASE_URL}/daily`);
      res.json(response.data);
    } catch (apiError) {
      console.error('LeetCode API error:', apiError);
      return res.status(503).json({
        message: 'LeetCode services are currently down. Please try again later.'
      });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Helper Functions

/**
 * Generate random 6-character code
 */
function generateRandomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Get LeetCode user profile
 */
async function getLeetCodeProfile(username) {
  try {
    console.log(`Fetching LeetCode profile for: ${username}`);

    const response = await axios.get(`${LEETCODE_API_BASE_URL}/${username}`, {
      timeout: 10000
    });

    const profileData = response.data;
    console.log('Profile data received:', { username, hasAbout: !!profileData.about });

    return profileData;
  } catch (error) {
    console.error('Error getting LeetCode profile:', error.message);
    if (error.response) {
      console.error('API response status:', error.response.status);
      console.error('API response data:', error.response.data);
    }
    throw new Error('Failed to get LeetCode profile');
  }
}

/**
 * Extract problem title from URL
 */
function extractProblemTitle(url) {
  try {
    console.log('Extracting problem title from URL:', url);

    // Handle various URL formats
    const patterns = [
      /leetcode\.com\/problems\/([^\/\?]+)/,  // Matches problem-title or problem-title/description
      /leetcode\.com\/problems\/([^\/\?]+)\/?/,  // Matches with optional trailing slash
      /leetcode\.com\/problems\/([^\/\?]+)\?/,  // Matches with query parameters
      /leetcode\.com\/problems\/([^\/\?]+)\/?[^\/]*\/?/  // Matches with additional path segments
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        // If the matched part contains a slash, take only the first part (the problem title)
        const problemTitle = match[1].split('/')[0];
        console.log('Extracted problem title:', problemTitle);
        return problemTitle;
      }
    }

    console.error('Could not extract problem title from URL:', url);
    return null;
  } catch (error) {
    console.error('Error extracting problem title:', error);
    return null;
  }
}

/**
 * Get problem details from alfa-leetcode-api
 */
async function getProblemDetails(problemTitle) {
  try {
    console.log('Fetching problem details from API:', `${LEETCODE_API_BASE_URL}/select`);

    const response = await axios.get(`${LEETCODE_API_BASE_URL}/select`, {
      params: { titleSlug: problemTitle },
      timeout: 10000
    });

    const problemData = response.data;
    // alfa-leetcode-api /select returns 'questionTitle', not 'title'
    const title = problemData.questionTitle || problemData.title;
    console.log('Problem data received:', { title, difficulty: problemData.difficulty });

    return {
      title,
      difficulty: problemData.difficulty,
      topicTags: problemData.topicTags || []
    };
  } catch (error) {
    console.error('Error getting problem details:', error.message);
    if (error.response) {
      console.error('API response status:', error.response.status);
      console.error('API response data:', error.response.data);
    }
    throw new Error('Failed to get problem details');
  }
}

/**
 * Get user's accepted submissions
 */
async function getUserAcceptedSubmissions(username) {
  try {
    console.log('Fetching accepted submissions for user:', username);

    // Get more submissions to cover a wider date range
    const response = await axios.get(`${LEETCODE_API_BASE_URL}/${username}/acSubmission`, {
      params: { limit: 50 }, // Get 50 recent accepted submissions
      timeout: 10000
    });

    const submissions = response.data.submission || [];
    console.log('Received accepted submissions:', submissions.length);

    // Log first few submissions for debugging
    if (submissions.length > 0) {
      console.log('Sample submissions:', submissions.slice(0, 3).map(s => ({
        title: s.title,
        titleSlug: s.titleSlug,
        statusDisplay: s.statusDisplay,
        timestamp: s.timestamp
      })));
    }

    return submissions;
  } catch (error) {
    console.error('Error getting user submissions:', error);
    throw new Error('Failed to get user submissions');
  }
}

/**
 * Validate submission against problem and date
 */
function validateSubmission(submissions, problemTitle, dayDate) {
  try {
    console.log('Validating submission:', { problemTitle, dayDate, submissionsCount: submissions?.length });

    // Convert dayDate to YYYY-MM-DD format for comparison
    const targetDate = new Date(dayDate);

    // Handle timezone issues by using local date components
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth(); // 0-indexed
    const targetDay = targetDate.getDate();

    console.log('Target date:', { targetYear, targetMonth, targetDay, original: dayDate });

    // Find submissions for the specific problem
    const problemSubmissions = submissions.filter(submission => {
      const submissionTitleSlug = submission.titleSlug?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
      const targetTitleSlug = problemTitle.toLowerCase().replace(/[^a-z0-9]/g, '');

      const isMatch = submissionTitleSlug === targetTitleSlug;
      if (isMatch) {
        console.log('Found matching submission:', {
          submissionTitleSlug,
          targetTitleSlug,
          status: submission.statusDisplay,
          timestamp: submission.timestamp
        });
      }

      return isMatch;
    });

    if (problemSubmissions.length === 0) {
      console.log('No submissions found for problem:', problemTitle);
      return {
        valid: false,
        message: 'No submissions found for this problem'
      };
    }

    console.log('Found problem submissions:', problemSubmissions.length);

    // Check for accepted submission on the target date
    const acceptedSubmissions = problemSubmissions.filter(submission => {
      if (submission.statusDisplay !== 'Accepted') {
        console.log('Skipping non-accepted submission:', submission.statusDisplay);
        return false;
      }

      // Handle timestamp - it's in seconds from the API
      const submissionTimestamp = parseInt(submission.timestamp);
      const submissionDate = new Date(submissionTimestamp * 1000); // Convert to milliseconds

      // Use local date components for comparison to avoid timezone issues
      const submissionYear = submissionDate.getFullYear();
      const submissionMonth = submissionDate.getMonth();
      const submissionDay = submissionDate.getDate();

      const isSameDate = submissionYear === targetYear &&
                        submissionMonth === targetMonth &&
                        submissionDay === targetDay;

      console.log('Date comparison:', {
        submissionTimestamp,
        submissionDate: submissionDate.toISOString(),
        submissionLocal: `${submissionYear}-${submissionMonth + 1}-${submissionDay}`,
        targetLocal: `${targetYear}-${targetMonth + 1}-${targetDay}`,
        isSameDate
      });

      return isSameDate;
    });

    if (acceptedSubmissions.length === 0) {
      console.log('No accepted submissions found on target date');
      return {
        valid: false,
        message: `No accepted submission found for this problem on ${dayDate}. Make sure you solved it on this specific date.`
      };
    }

    console.log('Validation successful! Found accepted submissions:', acceptedSubmissions.length);

    return {
      valid: true,
      acceptedDate: dayDate,
      submissionCount: problemSubmissions.length,
      message: 'Problem verified successfully'
    };
  } catch (error) {
    console.error('Error validating submission:', error);
    return {
      valid: false,
      message: 'Failed to validate submission'
    };
  }
}

module.exports = {
  generateVerificationCode,
  verifyLeetCodeProfile,
  validateLeetCodeProblem,
  getDailyLeetCodeProblem
};