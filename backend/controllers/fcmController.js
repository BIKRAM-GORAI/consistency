const admin = require('../config/firebase');
const User = require('../models/User');
const Group = require('../models/Group');

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

    // 5. Build FCM Multicast Payload with collapseKey
    const payload = {
      notification: {
        title: `${group.name}`,
        body: `${senderName}: ${bodyText}`
      },
      data: {
        groupId: String(groupId)
      },
      webpush: {
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
