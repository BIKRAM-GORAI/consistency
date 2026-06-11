const admin = require('../config/firebase');
const User = require('../models/User');
const { setFriendshipCache, invalidateFriendshipCache, isFriendsCached } = require('../utils/friendshipCache');
const { syncFriendsToFirestore } = require('../utils/firestoreSync');

// 1. Send Friend / Follow Request
exports.sendFriendRequest = async (req, res) => {
  try {
    const senderId = req.user.userId;
    const { targetUserId } = req.params;

    if (String(senderId) === String(targetUserId)) {
      return res.status(400).json({ message: 'You cannot send a friend request to yourself.' });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Target user not found.' });
    }

    const senderUser = await User.findById(senderId);

    // Check if already friends
    if (senderUser.friends.includes(targetUserId)) {
      return res.status(400).json({ message: 'You are already friends with this user.' });
    }

    // Check if request already sent
    if (senderUser.sentRequests.includes(targetUserId)) {
      return res.status(400).json({ message: 'Friend request already sent.' });
    }

    // Check if there is an incoming request from the target user (auto-accept to form friendship)
    if (senderUser.friendRequests.includes(targetUserId)) {
      senderUser.friends.push(targetUserId);
      senderUser.friendRequests = senderUser.friendRequests.filter(id => String(id) !== String(targetUserId));
      await senderUser.save();

      targetUser.friends.push(senderId);
      targetUser.sentRequests = targetUser.sentRequests.filter(id => String(id) !== String(senderId));
      await targetUser.save();

      setFriendshipCache(senderId, targetUserId, true);
      await syncFriendsToFirestore(senderId);
      await syncFriendsToFirestore(targetUserId);

      return res.json({ 
        success: true, 
        status: 'friends', 
        message: 'Mutual request detected! You are now friends.' 
      });
    }

    // Send the request
    senderUser.sentRequests.push(targetUserId);
    await senderUser.save();

    targetUser.friendRequests.push(senderId);
    await targetUser.save();

    // Trigger FCM Push Notification for Friend Request
    const tokens = targetUser.fcmTokens || [];
    if (tokens.length > 0) {
      const payload = {
        notification: {
          title: 'New Friend Request',
          body: `${senderUser.name} sent you a friend request.`
        },
        data: {
          type: 'friend_request',
          senderName: String(senderUser.name)
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'consistency_chime_channel_v2',
            sound: 'notificationsound'
          }
        },
        webpush: {
          headers: {
            Urgency: 'high'
          },
          fcmOptions: {
            link: `/?openTab=messages&t=${Date.now()}`
          }
        }
      };

      admin.messaging().sendEachForMulticast({
        tokens,
        notification: payload.notification,
        data: payload.data,
        android: payload.android,
        webpush: payload.webpush
      }).then(response => {
        console.log(`[FCM Friend Request] Sent to ${response.successCount} devices.`);
      }).catch(err => {
        console.error('Error sending friend request push notification:', err);
      });
    }

    res.json({ success: true, status: 'requested_sent', message: 'Friend request sent successfully.' });
  } catch (err) {
    console.error('Error sending friend request:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// 2. Accept Friend / Follow Request
exports.acceptFriendRequest = async (req, res) => {
  try {
    const myId = req.user.userId;
    const { targetUserId } = req.params;

    const me = await User.findById(myId);
    const target = await User.findById(targetUserId);

    if (!target) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Verify request exists
    if (!me.friendRequests.map(String).includes(String(targetUserId))) {
      return res.status(400).json({ message: 'No pending friend request from this user.' });
    }

    // Add to friends
    if (!me.friends.map(String).includes(String(targetUserId))) me.friends.push(targetUserId);
    if (!target.friends.map(String).includes(String(myId))) target.friends.push(myId);

    // Clean requests arrays
    me.friendRequests = me.friendRequests.filter(id => String(id) !== String(targetUserId));
    target.sentRequests = target.sentRequests.filter(id => String(id) !== String(myId));

    await me.save();
    await target.save();

    setFriendshipCache(myId, targetUserId, true);
    await syncFriendsToFirestore(myId);
    await syncFriendsToFirestore(targetUserId);

    res.json({ success: true, status: 'friends', message: 'Friend request accepted.' });
  } catch (err) {
    console.error('Error accepting friend request:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// 3. Decline Friend / Follow Request
exports.declineFriendRequest = async (req, res) => {
  try {
    const myId = req.user.userId;
    const { targetUserId } = req.params;

    const me = await User.findById(myId);
    const target = await User.findById(targetUserId);

    if (me) {
      me.friendRequests = me.friendRequests.filter(id => String(id) !== String(targetUserId));
      await me.save();
    }
    if (target) {
      target.sentRequests = target.sentRequests.filter(id => String(id) !== String(myId));
      await target.save();
    }

    res.json({ success: true, status: 'none', message: 'Friend request declined.' });
  } catch (err) {
    console.error('Error declining friend request:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// 4. Cancel Outgoing Friend Request
exports.cancelFriendRequest = async (req, res) => {
  try {
    const myId = req.user.userId;
    const { targetUserId } = req.params;

    const me = await User.findById(myId);
    const target = await User.findById(targetUserId);

    if (me) {
      me.sentRequests = me.sentRequests.filter(id => String(id) !== String(targetUserId));
      await me.save();
    }
    if (target) {
      target.friendRequests = target.friendRequests.filter(id => String(id) !== String(myId));
      await target.save();
    }

    res.json({ success: true, status: 'none', message: 'Friend request cancelled.' });
  } catch (err) {
    console.error('Error cancelling friend request:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// 5. Get Friends / Connections List
exports.getFriendsList = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).populate({
      path: 'friends',
      select: 'name username profilePicture currentStreak highestStreak lastActiveAt'
    });

    res.json(user.friends || []);
  } catch (err) {
    console.error('Error fetching friends list:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// 6. Get Pending Incoming Requests
exports.getFriendRequests = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).populate({
      path: 'friendRequests',
      select: 'name username profilePicture'
    });

    res.json(user.friendRequests || []);
  } catch (err) {
    console.error('Error fetching friend requests:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// 7. Remove Friend / Unfriend
exports.removeFriend = async (req, res) => {
  try {
    const myId = req.user.userId;
    const { targetUserId } = req.params;

    const me = await User.findById(myId);
    const target = await User.findById(targetUserId);

    if (me) {
      me.friends = me.friends.filter(id => String(id) !== String(targetUserId));
      await me.save();
      await syncFriendsToFirestore(myId);
    }
    if (target) {
      target.friends = target.friends.filter(id => String(id) !== String(myId));
      await target.save();
      await syncFriendsToFirestore(targetUserId);
    }

    invalidateFriendshipCache(myId, targetUserId);

    res.json({ success: true, status: 'none', message: 'Friend removed successfully.' });
  } catch (err) {
    console.error('Error removing friend:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// 8. Get Friendship Relationship Status between Current User and Target User
exports.getFriendshipStatus = async (req, res) => {
  try {
    const myId = req.user.userId;
    const { targetUserId } = req.params;

    const me = await User.findById(myId);

    let status = 'none';
    if (me.friends.map(String).includes(String(targetUserId))) {
      status = 'friends';
    } else if (me.sentRequests.map(String).includes(String(targetUserId))) {
      status = 'requested_sent';
    } else if (me.friendRequests.map(String).includes(String(targetUserId))) {
      status = 'requested_received';
    }

    res.json({ status });
  } catch (err) {
    console.error('Error getting friendship status:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

