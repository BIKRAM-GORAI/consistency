const mongoose = require('mongoose');
const AdminMessageLog = require('../models/AdminMessageLog');
const User = require('../models/User');

/**
 * Build a recipient match filter for the currently authenticated user.
 */
async function buildRecipientFilter(req) {
  const userId = req.user.userId;
  const user = await User.findById(userId).select('email').lean();
  const orConditions = [{ recipientId: userId }];
  if (user && user.email) {
    orConditions.push({ recipientEmail: user.email.toLowerCase().trim() });
  }
  return {
    deliveryStatus: 'sent',
    $or: orConditions,
  };
}

/**
 * GET /api/notifications?page=1&limit=20
 * Returns paginated personalized/bulk admin messages for the authenticated user
 * along with the current unread count.
 */
async function getUserNotifications(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = await buildRecipientFilter(req);

    const [notifications, total, unreadCount] = await Promise.all([
      AdminMessageLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('type subject bodyHtml bodyText mode readInApp readInAppAt createdAt')
        .lean(),
      AdminMessageLog.countDocuments(filter),
      AdminMessageLog.countDocuments({ ...filter, readInApp: false }),
    ]);

    res.json({
      notifications,
      unreadCount,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error('[Notifications] getUserNotifications error:', err);
    res.status(500).json({ message: 'Failed to load notifications.' });
  }
}

/**
 * POST /api/notifications/mark-read
 * Silently marks notifications as read in the background.
 * Body: { notificationIds?: string[] } — if omitted/empty, marks all unread as read.
 */
async function markNotificationsRead(req, res) {
  try {
    const filter = await buildRecipientFilter(req);
    const { notificationIds } = req.body || {};

    const updateFilter = { ...filter, readInApp: false };
    if (Array.isArray(notificationIds) && notificationIds.length > 0) {
      const validIds = notificationIds
        .slice(0, 100)
        .filter(id => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id));
      if (validIds.length === 0) {
        return res.json({ ok: true, modifiedCount: 0 });
      }
      updateFilter._id = { $in: validIds };
    }

    const result = await AdminMessageLog.updateMany(updateFilter, {
      $set: {
        readInApp: true,
        readInAppAt: new Date(),
      },
    });

    res.json({
      ok: true,
      modifiedCount: result.modifiedCount || 0,
    });
  } catch (err) {
    console.error('[Notifications] markNotificationsRead error:', err);
    res.status(500).json({ message: 'Failed to update notification status.' });
  }
}

module.exports = {
  getUserNotifications,
  markNotificationsRead,
};
