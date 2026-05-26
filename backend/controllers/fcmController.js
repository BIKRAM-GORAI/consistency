const admin = require('../config/firebase');
const User = require('../models/User');
const Group = require('../models/Group');

// Map to track WhatsApp-style smart notification states per group:
// { lastNotificationSentAt, lastNoisyNotificationSentAt, pendingCount, pendingList, timeoutId }
const groupNotifCooldowns = new Map();

// Background cleanup interval to prevent memory leaks (clean up stale group data older than 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [groupId, data] of groupNotifCooldowns.entries()) {
    if (now - data.lastNotificationSentAt > 300000) { // 5 minutes of total silence
      if (data.timeoutId) clearTimeout(data.timeoutId);
      groupNotifCooldowns.delete(groupId);
    }
  }
}, 60000); // check every 1 minute

// Smart Stacked Summary Formatter
function buildSummaryText(pendingList, pendingCount) {
  const senders = [...new Set(pendingList.map(m => m.senderName))];
  let sendersText = senders.slice(0, 3).join(', ');
  if (senders.length > 3) {
    sendersText += ` & others`;
  }
  const lastMsg = pendingList[pendingList.length - 1];
  return `${sendersText}: ${lastMsg.text} (+${pendingCount} new)`;
}

// Global Multicast Helper supporting Silent Stacks
async function sendMulticastPush(group, bodyText, tokens, isSilent) {
  const payload = {
    notification: {
      title: `${group.name}`,
      body: bodyText
    },
    data: {
      groupId: String(group._id)
    },
    android: {
      priority: isSilent ? 'normal' : 'high',
      notification: {
        channelId: 'default'
      }
    },
    webpush: {
      headers: {
        Urgency: isSilent ? 'normal' : 'high'
      },
      fcmOptions: {
        link: `/?openChat=${group._id}`
      }
    },
    collapseKey: `chat_${group._id}`
  };

  if (!isSilent) {
    payload.android.notification.sound = 'default';
  } else {
    // Specifically disable default sound and vibration on Android for silent stack
    payload.android.notification.defaultSound = false;
    payload.android.notification.defaultVibrateTimings = false;
  }

  try {
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: payload.notification,
      data: payload.data,
      android: payload.android,
      webpush: payload.webpush,
      collapseKey: payload.collapseKey
    });

    // Prune stale or expired tokens returned by FCM to clean up MongoDB
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

    return response;
  } catch (error) {
    console.error('[FCM Multicast Helper] Core send failed:', error);
    throw error;
  }
}

// Background delivery runner for debounced/throttled burst notifications
async function deliverPendingNotifications(groupId) {
  const state = groupNotifCooldowns.get(groupId);
  if (!state || state.pendingCount === 0) return;

  const now = Date.now();
  const elapsedSinceLastNoisy = now - state.lastNoisyNotificationSentAt;

  // Decide noise level: burst updates are noisy only once every 30 seconds
  let isSilent = true;
  if (elapsedSinceLastNoisy >= 30000) {
    isSilent = false;
    state.lastNoisyNotificationSentAt = now;
  }

  state.lastNotificationSentAt = now;

  // Build the stacked summary
  const summaryText = buildSummaryText(state.pendingList, state.pendingCount);

  // Extract variables for sending
  const lastSenderId = state.pendingList[state.pendingList.length - 1]?.senderId;

  // Clean the pending state queue
  const currentPendingCount = state.pendingCount;
  state.pendingCount = 0;
  state.pendingList = [];
  state.timeoutId = null;

  try {
    // 1. Fetch group
    const group = await Group.findById(groupId);
    if (!group) return;

    // 2. Query other members who haven't muted
    const recipients = await User.find({
      _id: { $in: group.members, $ne: lastSenderId },
      mutedGroups: { $ne: groupId }
    }, 'fcmTokens');

    const tokens = [];
    recipients.forEach(u => {
      if (u.fcmTokens && u.fcmTokens.length > 0) {
        tokens.push(...u.fcmTokens);
      }
    });

    if (tokens.length === 0) return;

    // 3. Send
    console.log(`[FCM Smart Debouncer] Delivering stack of ${currentPendingCount} messages for group ${group.name} (Silent: ${isSilent})`);
    await sendMulticastPush(group, summaryText, tokens, isSilent);
  } catch (error) {
    console.error(`[FCM Smart Debouncer] Background delivery failed for group ${groupId}:`, error);
  }
}

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

    // 5. Smart WhatsApp-style Rate-Limiter logic
    const now = Date.now();
    let state = groupNotifCooldowns.get(String(groupId));
    if (!state) {
      state = {
        lastNotificationSentAt: 0,
        lastNoisyNotificationSentAt: 0,
        pendingCount: 0,
        pendingList: [],
        timeoutId: null
      };
      groupNotifCooldowns.set(String(groupId), state);
    }

    // Clear any active debouncing timer
    if (state.timeoutId) {
      clearTimeout(state.timeoutId);
      state.timeoutId = null;
    }

    const elapsedSinceLastNotif = now - state.lastNotificationSentAt;

    // SCENARIO A: Quiet Group conversation (10+ seconds of silence)
    // Send push instantly and with sound!
    if (elapsedSinceLastNotif >= 10000) {
      state.lastNotificationSentAt = now;
      state.lastNoisyNotificationSentAt = now;
      state.pendingCount = 0;
      state.pendingList = [];

      const fullBodyText = `${senderName}: ${bodyText}`;
      console.log(`[FCM Smart Throttle] Quiet conversation. Sending instant noisy push for group ${group.name}`);
      const response = await sendMulticastPush(group, fullBodyText, tokens, false);

      return res.json({ 
        success: true, 
        sentCount: response.successCount, 
        failedCount: response.failureCount 
      });
    } 
    // SCENARIO B: Rapid burst / spam mode (less than 10s apart)
    // Queue message and schedule silent stacked update in 10s
    else {
      state.pendingCount++;
      state.pendingList.push({ senderName, senderId, text: bodyText });

      state.timeoutId = setTimeout(async () => {
        try {
          await deliverPendingNotifications(String(groupId));
        } catch (e) {
          console.error('[FCM Smart Debouncer] Background delivery timer failed:', e);
        }
      }, 10000);

      console.log(`[FCM Smart Throttle] Burst mode. Queueing message from ${senderName} for silent delivery in 10s.`);
      return res.json({ 
        success: true, 
        throttled: true, 
        message: 'WhatsApp-style burst throttle active. Message queued for silent stacked delivery.' 
      });
    }
  } catch (error) {
    console.error('Error sending chat push notifications:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};
