const admin = require('../config/firebase');
const User = require('../models/User');
const Group = require('../models/Group');

// Map to track the last time a notification was sent per group, and count of suppressed messages during cooldown
const groupNotifCooldowns = new Map();
const COOLDOWN_MS = 30000; // 30 seconds cooldown between push notifications per group

// Background cleanup interval to prevent memory leaks (clean up stale group data older than 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [groupId, data] of groupNotifCooldowns.entries()) {
    if (now - data.lastSentAt > 300000) { // 5 minutes
      groupNotifCooldowns.delete(groupId);
    }
  }
}, 60000); // check every 1 minute

/**
 * Register an FCM token for the authenticated user
 * POST /api/fcm/token
 */
exports.registerFcmToken = async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ message: 'FCM token is required' });
  }

  try {
    const userId = req.user.userId;
    // Add token using $addToSet to prevent duplicates
    await User.findByIdAndUpdate(userId, {
      $addToSet: { fcmTokens: token }
    });

    res.json({ success: true, message: 'FCM token registered successfully' });
  } catch (error) {
    console.error('Error registering FCM token:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

/**
 * Unregister an FCM token (e.g. on logout)
 * DELETE /api/fcm/token
 */
exports.unregisterFcmToken = async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ message: 'FCM token is required' });
  }

  try {
    const userId = req.user.userId;
    // Pull the token from fcmTokens array
    await User.findByIdAndUpdate(userId, {
      $pull: { fcmTokens: token }
    });

    res.json({ success: true, message: 'FCM token unregistered successfully' });
  } catch (error) {
    console.error('Error unregistering FCM token:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

/**
 * Toggle muting status for a specific group
 * POST /api/fcm/mute
 */
exports.toggleMuteGroup = async (req, res) => {
  const { groupId, mute } = req.body;
  if (!groupId) {
    return res.status(400).json({ message: 'Group ID is required' });
  }

  try {
    const userId = req.user.userId;
    const shouldMute = mute === true;

    if (shouldMute) {
      await User.findByIdAndUpdate(userId, {
        $addToSet: { mutedGroups: groupId }
      });
    } else {
      await User.findByIdAndUpdate(userId, {
        $pull: { mutedGroups: groupId }
      });
    }

    res.json({ 
      success: true, 
      muted: shouldMute,
      message: shouldMute ? 'Group muted successfully' : 'Group unmuted successfully' 
    });
  } catch (error) {
    console.error('Error toggling group mute status:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

/**
 * Send push notifications to other group members when a message is sent
 * POST /api/fcm/notify-chat
 */
exports.notifyGroupChat = async (req, res) => {
  const { groupId, senderName, text, hasMedia, mediaType } = req.body;
  
  if (!groupId || !senderName) {
    return res.status(400).json({ message: 'Group ID and Sender Name are required' });
  }

  try {
    const senderId = req.user.userId;

    // Smart notification throttle check
    const now = Date.now();
    const cooldownData = groupNotifCooldowns.get(String(groupId));
    if (cooldownData && (now - cooldownData.lastSentAt < COOLDOWN_MS)) {
      cooldownData.pendingCount = (cooldownData.pendingCount || 0) + 1;
      return res.json({ 
        success: true, 
        throttled: true, 
        message: 'Notification throttled. Count incremented.' 
      });
    }

    // Set/reset cooldown tracking for subsequent messages
    let pendingCount = 0;
    if (cooldownData) {
      pendingCount = cooldownData.pendingCount || 0;
    }
    
    groupNotifCooldowns.set(String(groupId), {
      lastSentAt: now,
      pendingCount: 0
    });

    // 1. Fetch group to verify existence and membership
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Verify sender is in the group members
    const isMember = group.members.some(id => String(id) === String(senderId));
    if (!isMember) {
      return res.status(403).json({ message: 'Unauthorized access: Not a group member' });
    }

    // 2. Query all other group members who have NOT muted this group
    const recipients = await User.find({
      _id: { $in: group.members, $ne: senderId },
      mutedGroups: { $ne: groupId }
    }, 'fcmTokens');

    // 3. Collect active FCM tokens
    const tokens = [];
    recipients.forEach(u => {
      if (u.fcmTokens && u.fcmTokens.length > 0) {
        tokens.push(...u.fcmTokens);
      }
    });

    // If no active tokens, complete request immediately to save FCM workload
    if (tokens.length === 0) {
      return res.json({ success: true, message: 'No recipients with registered FCM tokens' });
    }

    // 4. Formulate clean body text (Cloudinary bandwidth conservation)
    let bodyText = '';
    if (hasMedia) {
      let typeText = 'an attachment';
      if (mediaType === 'image') typeText = 'a photo';
      else if (mediaType === 'audio') typeText = 'a voice recording';
      else if (mediaType === 'video') typeText = 'a video';
      
      bodyText = `Sent ${typeText}`;
      if (text) {
        bodyText += `: "${text}"`;
      }
    } else {
      bodyText = text || '';
    }

    // Add pending/throttled message count if any existed
    if (pendingCount > 0) {
      bodyText += ` (and ${pendingCount} other message${pendingCount > 1 ? 's' : ''})`;
    }

    // 5. Build FCM Multicast Payload with collapseKey
    const payload = {
      notification: {
        title: `${group.name}`,
        body: `${senderName}: ${bodyText}`
      },
      data: {
        groupId: String(groupId)
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'default',
          sound: 'default'
        }
      },
      webpush: {
        headers: {
          Urgency: 'high'
        },
        fcmOptions: {
          link: `/?openChat=${groupId}`
        }
      },
      collapseKey: `chat_${groupId}`
    };

    // 6. Send the multicast push alerts asynchronously
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: payload.notification,
      data: payload.data,
      android: payload.android,
      webpush: payload.webpush,
      collapseKey: payload.collapseKey
    });

    // 7. Prune stale or expired tokens returned by FCM to clean up MongoDB
    const failedTokens = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        console.warn(`[FCM Send Error] Token: ${tokens[idx].substring(0, 15)}... Code: ${resp.error?.code}, Message: ${resp.error?.message}`);
        const errCode = resp.error?.code;
        if (
          errCode === 'messaging/registration-token-not-registered' || 
          errCode === 'messaging/invalid-registration-token' ||
          errCode === 'messaging/invalid-argument'
        ) {
          failedTokens.push(tokens[idx]);
        }
      }
    });

    if (failedTokens.length > 0) {
      await User.updateMany(
        { fcmTokens: { $in: failedTokens } },
        { $pull: { fcmTokens: { $in: failedTokens } } }
      );
      console.log(`Pruned ${failedTokens.length} expired or invalid FCM tokens.`);
    }

    res.json({ 
      success: true, 
      sentCount: response.successCount, 
      failedCount: response.failureCount 
    });
  } catch (error) {
    console.error('Error sending chat push notifications:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};
