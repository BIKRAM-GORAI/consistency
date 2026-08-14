const axios = require('axios');

const LEETCODE_GRAPHQL_URL = 'https://leetcode.com/graphql';
const ALFA_LEETCODE_FALLBACK_URL = process.env.LEETCODE_API_BASE_URL || 'https://alfa-leetcode-api.onrender.com';

const GRAPHQL_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://leetcode.com'
};

/**
 * Fetch User Profile (bio / aboutMe and avatar) directly from LeetCode GraphQL
 * @param {string} username 
 * @returns {Promise<{about: string, avatar: string, username: string}>}
 */
async function getLeetCodeProfileDirect(username) {
  const query = `
    query getUserProfile($username: String!) {
      matchedUser(username: $username) {
        username
        profile {
          userAvatar
          aboutMe
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      LEETCODE_GRAPHQL_URL,
      { query, variables: { username } },
      { headers: GRAPHQL_HEADERS, timeout: 10000 }
    );

    if (response.data && response.data.errors && response.data.errors.length > 0) {
      const errMessage = response.data.errors[0].message || '';
      if (errMessage.toLowerCase().includes('not exist') || errMessage.toLowerCase().includes('not found')) {
        const error = new Error('LeetCode profile not found');
        error.status = 404;
        throw error;
      }
    }

    const matchedUser = response.data?.data?.matchedUser;
    if (!matchedUser) {
      const error = new Error('LeetCode profile not found');
      error.status = 404;
      throw error;
    }

    return {
      username: matchedUser.username,
      about: matchedUser.profile?.aboutMe || '',
      avatar: matchedUser.profile?.userAvatar || ''
    };
  } catch (directErr) {
    if (directErr.status === 404) throw directErr;
    console.warn(`Direct LeetCode GraphQL profile fetch failed for ${username}. Trying fallback API...`, directErr.message);

    // Fallback to Alfa API if direct GraphQL call fails due to network/IP issues
    try {
      const fallbackRes = await axios.get(`${ALFA_LEETCODE_FALLBACK_URL}/${username}`, { timeout: 10000 });
      return {
        username: username,
        about: fallbackRes.data.about || '',
        avatar: fallbackRes.data.avatar || ''
      };
    } catch (fallbackErr) {
      if (fallbackErr.response && fallbackErr.response.status === 404) {
        const error = new Error('LeetCode profile not found');
        error.status = 404;
        throw error;
      }
      throw directErr;
    }
  }
}

/**
 * Fetch Problem Details (title, titleSlug, difficulty) directly from LeetCode GraphQL
 * @param {string} titleSlug 
 * @returns {Promise<{questionId: string, title: string, titleSlug: string, difficulty: string}>}
 */
async function getProblemDetailsDirect(titleSlug) {
  const query = `
    query getQuestionDetails($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId
        title
        titleSlug
        difficulty
      }
    }
  `;

  try {
    const response = await axios.post(
      LEETCODE_GRAPHQL_URL,
      { query, variables: { titleSlug } },
      { headers: GRAPHQL_HEADERS, timeout: 10000 }
    );

    const question = response.data?.data?.question;
    if (!question) {
      const error = new Error(`Problem not found for slug: ${titleSlug}`);
      error.status = 404;
      throw error;
    }

    return {
      questionId: question.questionId,
      title: question.title,
      titleSlug: question.titleSlug,
      difficulty: question.difficulty || 'Medium'
    };
  } catch (directErr) {
    if (directErr.status === 404) throw directErr;
    console.warn(`Direct LeetCode GraphQL problem fetch failed for ${titleSlug}. Trying fallback API...`, directErr.message);

    try {
      const fallbackRes = await axios.get(`${ALFA_LEETCODE_FALLBACK_URL}/select?titleSlug=${titleSlug}`, { timeout: 10000 });
      return {
        questionId: fallbackRes.data.questionId || '',
        title: fallbackRes.data.questionTitle || fallbackRes.data.title || titleSlug,
        titleSlug: titleSlug,
        difficulty: fallbackRes.data.difficulty || 'Medium'
      };
    } catch (fallbackErr) {
      throw directErr;
    }
  }
}

/**
 * Fetch User's Recent Accepted Submissions directly from LeetCode GraphQL
 * @param {string} username 
 * @param {number} limit 
 * @returns {Promise<Array<{title: string, titleSlug: string, timestamp: string}>>}
 */
async function getUserAcceptedSubmissionsDirect(username, limit = 50) {
  const query = `
    query getRecentAcSubmissions($username: String!, $limit: Int!) {
      recentAcSubmissionList(username: $username, limit: $limit) {
        title
        titleSlug
        timestamp
      }
    }
  `;

  try {
    const response = await axios.post(
      LEETCODE_GRAPHQL_URL,
      { query, variables: { username, limit: Number(limit) || 50 } },
      { headers: GRAPHQL_HEADERS, timeout: 10000 }
    );

    const submissionList = response.data?.data?.recentAcSubmissionList;
    if (Array.isArray(submissionList)) {
      return submissionList.map(sub => ({
        title: sub.title,
        titleSlug: sub.titleSlug,
        timestamp: sub.timestamp,
        statusDisplay: 'Accepted'
      }));
    }

    return [];
  } catch (directErr) {
    console.warn(`Direct LeetCode GraphQL submissions fetch failed for ${username}. Trying fallback API...`, directErr.message);

    try {
      const fallbackRes = await axios.get(`${ALFA_LEETCODE_FALLBACK_URL}/${username}/acSubmission?limit=${limit}`, { timeout: 10000 });
      const submissions = fallbackRes.data?.submission || fallbackRes.data || [];
      return Array.isArray(submissions) ? submissions : [];
    } catch (fallbackErr) {
      throw directErr;
    }
  }
}

module.exports = {
  getLeetCodeProfileDirect,
  getProblemDetailsDirect,
  getUserAcceptedSubmissionsDirect
};
