// ── Direct Messaging Module ──────────────────────────────────
console.log("[Module] dm.js initializing...");

const showToast = (...args) => window.showToast(...args);
const { firebaseDb, firestore } = window;

// ── State variables ──
let activeChatRecipientId = null;
let activeChatRecipientName = '';
let activeChatRecipientPhoto = '';
let activeChatId = null;
let dmUnsubscribe = null;
let dmMetaUnsubscribe = null;
let contactsListeners = new Map(); // chatId -> unsubscribe function
let dmMessagesLimit = 30;
let selectedDMMediaBlobs = []; // Array of { blob, type, source, duration }
let activeDMReplyTo = null;
let isFriendActive = false;
let myDeletedAt = 0;
let isDMSending = false;
let renderContactsListId = 0;

// Cooldown / limits
let lastDMMessageSentAt = 0;
let imageLimitRemaining = 20;
let audioLimitRemaining = 20;
let audioFileLimitRemaining = 5;
let imageLimitMax = 20;
let audioLimitMax = 20;
let audioFileLimitMax = 5;

// Audio Recording State
let dmMediaRecorder = null;
let dmAudioChunks = [];
let dmRecordingInterval = null;
let dmRecordingStartTime = 0;
let dmIsRecording = false;

// ── Helper: generate chatId ──
function getChatId(uid1, uid2) {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
}

// ── Sync DM Read status to Firestore ──
let lastFirestoreLastReadSyncedAt = 0;
async function syncLastReadToFirestore(chatId) {
  const { firebaseDb, firestore, userId } = window;
  if (!firebaseDb || !firestore || !userId || !chatId) return;

  const now = Date.now();
  if (now - lastFirestoreLastReadSyncedAt < 3000) return;
  lastFirestoreLastReadSyncedAt = now;

  try {
    const metaRef = firestore.doc(firebaseDb, 'direct_messages', chatId, 'messages', 'metadata');
    await firestore.setDoc(metaRef, {
      lastRead: {
        [String(userId)]: now
      }
    }, { merge: true });
  } catch (err) {
    console.warn('Failed to sync lastRead to Firestore:', err);
  }
}

// ── Update message double ticks in DOM ──
function updateDMMessagesTicks(otherLastRead) {
  const msgsList = document.getElementById('dm-messages-list');
  if (!msgsList) return;

  const tickElements = msgsList.querySelectorAll('.chat-tick');
  tickElements.forEach(tick => {
    const bubbleWrapper = tick.closest('.chat-bubble-wrapper');
    if (!bubbleWrapper) return;

    const ts = parseInt(bubbleWrapper.dataset.ts || '0');
    if (ts && ts <= otherLastRead) {
      if (!tick.classList.contains('blue') && !tick.classList.contains('pending')) {
        tick.className = 'chat-tick blue';
        tick.innerHTML = '<i data-lucide="check-check" style="width:14px;height:14px;"></i>';
        if (window.lucide) lucide.createIcons({ root: tick });
      }
    }
  });
}

// ── Friends & Relationship API mappings ──

async function fetchFriends() {
  const localDb = window.localDb;
  if (!localDb) return [];

  // 1. Try to load and render cached contacts instantly first (forceCache = true)
  let cached = [];
  try {
    cached = await localDb.friends.toArray();
    if (cached && cached.length > 0) {
      cached.forEach(f => {
        localStorage.setItem('activeContact_' + f._id, 'true');
      });
      // Render instantly using cached data (messages, unread indicators)
      await renderContactsList(cached, true);
    }
  } catch (err) {
    console.warn('Failed to read cached friends during instant load:', err);
  }

  // 2. If offline, we're done (we already rendered cached above)
  if (!navigator.onLine) {
    return cached;
  }

  // 3. If online, fetch fresh friends list in the background
  try {
    const data = await window.apiFetch(`${window.API}/api/friends/list`);
    if (data) {
      await localDb.friends.clear();
      await localDb.friends.bulkPut(data);
      data.forEach(f => {
        localStorage.setItem('activeContact_' + f._id, 'true');
      });
      // Render again with latest data and sync with Firestore normally
      await renderContactsList(data, false);
      return data;
    }
  } catch (err) {
    console.warn('Failed to fetch friends from server:', err);
    // If the server fetch failed and we didn't render cache yet (e.g., cached was empty), return cached anyway
    if (!cached || cached.length === 0) {
      const fallbackCached = await localDb.friends.toArray();
      await renderContactsList(fallbackCached, true);
      return fallbackCached;
    }
    return cached;
  }
}

async function fetchFriendRequests() {
  if (!navigator.onLine) return;
  try {
    const requests = await window.apiFetch(`${window.API}/api/friends/requests`);
    renderFriendRequestsList(requests);
  } catch (err) {
    console.warn('Failed to fetch friend requests:', err);
  }
}

async function sendFriendRequest(targetUserId, username) {
  try {
    const res = await window.apiFetch(`${window.API}/api/friends/request/${targetUserId}`, {
      method: 'POST'
    });
    showToast(res.message || 'Request sent successfully!', 'success');
    refreshProfileActionsIfOpen(targetUserId, res.status);
    fetchFriendRequests();
  } catch (err) {
    showToast(err.message || 'Failed to send request.', 'error');
  }
}

async function acceptFriendRequest(targetUserId, username) {
  try {
    const res = await window.apiFetch(`${window.API}/api/friends/accept/${targetUserId}`, {
      method: 'POST'
    });
    showToast(res.message || 'Accepted friend request!', 'success');
    refreshProfileActionsIfOpen(targetUserId, res.status);
    fetchFriends();
    fetchFriendRequests();
  } catch (err) {
    showToast(err.message || 'Failed to accept request.', 'error');
  }
}

async function declineFriendRequest(targetUserId, username) {
  try {
    const res = await window.apiFetch(`${window.API}/api/friends/decline/${targetUserId}`, {
      method: 'POST'
    });
    showToast(res.message || 'Declined friend request.', 'info');
    refreshProfileActionsIfOpen(targetUserId, res.status);
    fetchFriendRequests();
  } catch (err) {
    showToast(err.message || 'Failed to decline request.', 'error');
  }
}

async function cancelFriendRequest(targetUserId, username) {
  try {
    const res = await window.apiFetch(`${window.API}/api/friends/cancel/${targetUserId}`, {
      method: 'POST'
    });
    showToast(res.message || 'Request cancelled.', 'info');
    refreshProfileActionsIfOpen(targetUserId, res.status);
  } catch (err) {
    showToast(err.message || 'Failed to cancel request.', 'error');
  }
}

async function removeFriend(targetUserId, username) {
  if (!confirm(`Are you sure you want to unfollow ${username}? You won't be able to send new messages until you follow each other again.`)) return;
  try {
    const res = await window.apiFetch(`${window.API}/api/friends/${targetUserId}`, {
      method: 'DELETE'
    });
    showToast(res.message || 'Friend removed successfully.', 'info');
    refreshProfileActionsIfOpen(targetUserId, res.status);
    fetchFriends();
  } catch (err) {
    showToast(err.message || 'Failed to remove friend.', 'error');
  }
}

async function unfriendActiveUser() {
  if (!activeChatRecipientId) return;
  const targetId = activeChatRecipientId;
  const name = activeChatRecipientName;
  const photo = activeChatRecipientPhoto;
  
  await removeFriend(targetId, name);
  
  // Refresh the chat UI to instantly trigger read-only view
  if (activeChatRecipientId === targetId) {
    await openDMChat(targetId, name, photo);
  }
}

async function followActiveUser() {
  if (!activeChatRecipientId) return;
  const targetId = activeChatRecipientId;
  const name = activeChatRecipientName;
  const photo = activeChatRecipientPhoto;

  try {
    const statusRes = await window.apiFetch(`${window.API}/api/friends/status/${targetId}`);
    if (statusRes.status === 'requested_received') {
      const res = await window.apiFetch(`${window.API}/api/friends/accept/${targetId}`, {
        method: 'POST'
      });
      showToast(res.message || 'Request accepted!', 'success');
      refreshProfileActionsIfOpen(targetId, res.status);
      fetchFriends();
      if (activeChatRecipientId === targetId) {
        await openDMChat(targetId, name, photo);
      }
    } else if (statusRes.status === 'none') {
      const res = await window.apiFetch(`${window.API}/api/friends/request/${targetId}`, {
        method: 'POST'
      });
      showToast(res.message || 'Follow request sent!', 'success');
      refreshProfileActionsIfOpen(targetId, res.status);
      if (activeChatRecipientId === targetId) {
        await openDMChat(targetId, name, photo);
      }
    }
  } catch (err) {
    showToast(err.message || 'Failed to follow user.', 'error');
  }
}

function refreshProfileActionsIfOpen(userId, status) {
  const profileModal = document.getElementById('modal-public-profile');
  if (profileModal && profileModal.style.display !== 'none' && window._currentMemberId === userId) {
    const u = {
      _id: window._currentMemberId,
      name: window._currentMemberName,
      username: window._currentMemberUsername
    };
    if (typeof window.renderProfileActions === 'function') {
      window.renderProfileActions(u, status);
    }
  }
}

// ── Media Limits ──

async function fetchDMMediaLimit() {
  try {
    const res = await window.apiFetch(`${window.API}/api/auth/media-upload-limit`);
    imageLimitRemaining = res.imageRemaining;
    audioLimitRemaining = res.audioRemaining;
    audioFileLimitRemaining = (res.audioFileRemaining !== undefined) ? res.audioFileRemaining : 5;
    
    imageLimitMax = res.imageLimit || 20;
    audioLimitMax = res.audioLimit || 20;
    audioFileLimitMax = (res.audioFileLimit !== undefined) ? res.audioFileLimit : 5;
    
    updateDMMediaLimitDisplay();
  } catch (err) {
    console.error('Failed to fetch media limit:', err);
  }
}

function updateDMMediaLimitDisplay() {
  const el = document.getElementById('dm-media-limit-text');
  if (!el) return;
  
  el.style.display = 'block';
  const imgStr = imageLimitRemaining <= 0 ? '<span style="color:var(--red)">Images: 0</span>' : `Images: ${imageLimitRemaining}/${imageLimitMax}`;
  const recStr = audioLimitRemaining <= 0 ? '<span style="color:var(--red)">Voice: 0</span>' : `Voice: ${audioLimitRemaining}/${audioLimitMax}`;
  const fileStr = audioFileLimitRemaining <= 0 ? '<span style="color:var(--red)">Audio Files: 0</span>' : `Audio Files: ${audioFileLimitRemaining}/${audioFileLimitMax}`;
  
  el.innerHTML = `${imgStr} • ${recStr} • ${fileStr}`;
}

// ── Open DM Chat Modal & Load Cached Messages ──

async function openDMChat(recipientId, recipientName, recipientPhoto) {
  if (!recipientId) return;
  recipientId = String(recipientId).toLowerCase().trim();
  console.log(`[DM] openDMChat called for recipientId: ${recipientId}`);

  // Exit early if the chat is already open for this recipient to prevent duplicate transition glitches
  const chatModal = document.getElementById('modal-direct-chat');
  if (chatModal && chatModal.classList.contains('open') && activeChatRecipientId === recipientId) {
    console.log(`[DM] Chat is already open for ${recipientId}. Ignoring call.`);
    return;
  }

  window.activeChatRecipientLastRead = 0;

  // Close public profile modal instantly (no animation) to avoid overlap
  const profileModal = document.getElementById('modal-public-profile');
  if (profileModal && profileModal.classList.contains('open')) {
    console.log(`[DM] Closing public profile modal instantly before opening DM.`);
    if (window.gsap) {
      gsap.killTweensOf([profileModal, profileModal.querySelector('.modal')]);
    }
    profileModal.classList.remove('open');
    profileModal.style.opacity = '';
    const modalEl = profileModal.querySelector('.modal');
    if (modalEl) {
      modalEl.style.transform = '';
      modalEl.style.opacity = '';
    }
  }

  // ── OPEN MODAL FIRST (before any DOM mutations) ──
  // This mirrors openGroupChat which calls openModal immediately, allowing
  // GSAP to begin the slide-up animation in the very first paint frame
  // without being delayed by layout-invalidating DOM mutations.
  openModal('modal-direct-chat');

  // ── State & data setup ──
  activeChatRecipientId = recipientId;
  activeChatRecipientName = recipientName;
  activeChatRecipientPhoto = recipientPhoto;

  localStorage.setItem('activeContact_' + recipientId, 'true');
  localStorage.setItem('contact_details_' + recipientId, JSON.stringify({
    name: recipientName,
    profilePicture: recipientPhoto || ''
  }));
  
  const myUserId = window.userId;
  activeChatId = getChatId(myUserId, recipientId);
  dmMessagesLimit = 30;
  activeDMReplyTo = null;
  selectedDMMediaBlobs = [];

  // Update last read timestamp and clear UI unread badge
  localStorage.setItem('lastRead_' + activeChatId, Date.now().toString());
  const unreadWrapper = document.querySelector(`#dm-contact-card-${recipientId} .dm-unread-badge-wrapper`);
  if (unreadWrapper) {
    unreadWrapper.innerHTML = '';
  } else {
    const unreadBadge = document.querySelector(`#dm-contact-card-${recipientId} .dm-unread-badge`);
    if (unreadBadge) unreadBadge.remove();
  }
  
  // ── Update header UI ──
  const modal = document.getElementById('modal-direct-chat');
  document.getElementById('dm-chat-title').textContent = recipientName;
  const avatarWrap = document.getElementById('dm-chat-avatar-wrap');
  if (avatarWrap) {
    avatarWrap.innerHTML = recipientPhoto 
      ? `<img src="${recipientPhoto}" onerror="this.onerror=null; this.src='/checklist.png'; this.style.padding='4px';" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
      : `<div style="width:100%;height:100%;background:var(--yellow);color:#000;display:flex;align-items:center;justify-content:center;font-weight:900;border-radius:50%;font-size:16px;">${recipientName.charAt(0).toUpperCase()}</div>`;
  }
  if (window.lucide) lucide.createIcons({ root: modal });
  
  // Clear preview block if any
  clearDMMediaPreview();
  clearDMReply();
  
  const msgsList = document.getElementById('dm-messages-list');
  if (msgsList) {
    msgsList.innerHTML = '<div class="dm-chat-loader" style="text-align:center; padding:40px; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; animation: pulse 1.5s infinite;">Loading chat history...</div>';
  }

  myDeletedAt = parseInt(localStorage.getItem('deletedAt_' + activeChatId) || '0');
  const { firebaseDb, firestore } = window;
  if (firebaseDb && firestore && navigator.onLine) {
    const metaRef = firestore.doc(firebaseDb, 'direct_messages', activeChatId, 'messages', 'metadata');
    firestore.getDoc(metaRef).then(metaSnap => {
      if (metaSnap.exists()) {
        const newDeletedAt = metaSnap.data()?.deletedAt?.[myUserId] || 0;
        if (newDeletedAt !== myDeletedAt) {
          localStorage.setItem('deletedAt_' + activeChatId, newDeletedAt.toString());
          myDeletedAt = newDeletedAt;
          if (activeChatId) {
            window.localDb.directMessages
              .where('chatId').equals(activeChatId)
              .and(msg => msg.timestamp <= newDeletedAt)
              .delete()
              .then(() => {
                if (activeChatId) {
                  window.localDb.directMessages
                    .where('chatId').equals(activeChatId)
                    .sortBy('timestamp')
                    .then(cached => {
                      const msgsList = document.getElementById('dm-messages-list');
                      if (msgsList && activeChatId) {
                        msgsList.innerHTML = '';
                        cached.forEach(msg => renderDMMessage(msg, msgsList, false));
                        rebuildDMDateSeparators(msgsList);
                        scrollToBottom('dm-messages-container');
                      }
                    });
                }
              });
          }
        }
      }
    }).catch(err => console.warn('Failed to fetch DM chat metadata in background:', err));
  }

  let lastTimestamp = 0;
  try {
    if (myDeletedAt) {
      try {
        await window.localDb.directMessages
          .where('chatId').equals(activeChatId)
          .and(msg => msg.timestamp <= myDeletedAt)
          .delete();
      } catch (err) {
        console.warn('Failed to clean up cached soft-deleted DMs:', err);
      }
    }

    const cached = await window.localDb.directMessages
      .where('chatId').equals(activeChatId)
      .sortBy('timestamp');
    
    if (msgsList) msgsList.innerHTML = '';
    
    if (cached.length > 0) {
      cached.forEach(msg => {
        renderDMMessage(msg, msgsList, false);
      });
      rebuildDMDateSeparators(msgsList);
      lastTimestamp = cached[cached.length - 1].timestamp;
      scrollToBottom('dm-messages-container');
      if (window.initLazyLoading) {
        window.initLazyLoading();
      }
    }
  } catch (err) {
    console.warn('Failed to load cached DM messages:', err);
  }

  // Check friendship status to see if chat is read-only
  isFriendActive = false;
  let relationshipStatus = 'none';
  const input = document.getElementById('dm-chat-input');
  const sendBtn = document.getElementById('dm-chat-send-btn');
  const footerInputBar = document.getElementById('dm-chat-input-bar');
  const readOnlyBanner = document.getElementById('dm-chat-readonly-banner');
  const attachBtn = document.getElementById('dm-chat-attach-btn');
  const micBtn = document.getElementById('dm-chat-mic-btn');

  if (navigator.onLine) {
    try {
      const statusRes = await window.apiFetch(`${window.API}/api/friends/status/${recipientId}`);
      isFriendActive = (statusRes.status === 'friends');
      relationshipStatus = statusRes.status;
    } catch (err) {
      console.warn('Failed to check friendship status for DM:', err);
    }
  } else {
    let cachedFriend = await window.localDb.friends.get(recipientId);
    if (!cachedFriend && recipientId) {
      const allFriends = await window.localDb.friends.toArray();
      cachedFriend = allFriends.find(f => String(f._id).toLowerCase() === recipientId);
    }
    isFriendActive = !!cachedFriend;
    relationshipStatus = isFriendActive ? 'friends' : 'none';
  }

  const unfriendBtn = document.getElementById('dm-chat-unfriend-btn');
  const followBtn = document.getElementById('dm-chat-follow-btn');
  
  if (isFriendActive) {
    if (readOnlyBanner) readOnlyBanner.style.display = 'none';
    if (footerInputBar) footerInputBar.style.display = 'flex';
    if (input) { input.disabled = false; input.placeholder = "Type a message..."; }
    if (sendBtn) sendBtn.disabled = false;
    if (attachBtn) attachBtn.style.display = 'flex';
    if (micBtn) micBtn.style.display = 'flex';
    if (unfriendBtn) unfriendBtn.style.display = 'flex';
    if (followBtn) followBtn.style.display = 'none';
    fetchDMMediaLimit();
  } else {
    if (readOnlyBanner) {
      readOnlyBanner.style.display = 'block';
      readOnlyBanner.textContent = `You can only view messages. You must be mutual friends to send new messages.`;
    }
    if (footerInputBar) footerInputBar.style.display = 'none';
    if (input) { input.disabled = true; input.placeholder = "Mutual friendship required to message"; }
    if (sendBtn) sendBtn.disabled = true;
    if (attachBtn) attachBtn.style.display = 'none';
    if (micBtn) micBtn.style.display = 'none';
    if (unfriendBtn) unfriendBtn.style.display = 'none';
    
    if (followBtn) {
      followBtn.style.display = 'flex';
      if (relationshipStatus === 'requested_sent') {
        followBtn.style.background = 'var(--bg-muted)';
        followBtn.title = "Follow Request Pending";
        followBtn.disabled = true;
        followBtn.innerHTML = '<i data-lucide="clock" style="width: 18px; height: 18px; color: var(--text-muted);"></i>';
      } else if (relationshipStatus === 'requested_received') {
        followBtn.style.background = 'var(--yellow)';
        followBtn.title = "Follow Back / Accept Request";
        followBtn.disabled = false;
        followBtn.innerHTML = '<i data-lucide="user-check" style="width: 18px; height: 18px; color: #000;"></i>';
      } else { // 'none'
        followBtn.style.background = 'var(--yellow)';
        followBtn.title = "Follow User";
        followBtn.disabled = false;
        followBtn.innerHTML = '<i data-lucide="user-plus" style="width: 18px; height: 18px; color: #000;"></i>';
      }
      if (window.lucide) lucide.createIcons({ root: followBtn });
    }
    
    const limitDisplay = document.getElementById('dm-media-limit-text');
    if (limitDisplay) limitDisplay.style.display = 'none';
  }

  subscribeToDMMessages();
  syncLastReadToFirestore(activeChatId);
}

// ── Firestore Subscription for DMs ──

function subscribeToDMMessages() {
  if (dmUnsubscribe) {
    dmUnsubscribe();
    dmUnsubscribe = null;
  }
  if (dmMetaUnsubscribe) {
    dmMetaUnsubscribe();
    dmMetaUnsubscribe = null;
  }

  const { firebaseDb, firestore } = window;
  if (!firebaseDb || !firestore) return;

  const msgsRef = firestore.collection(firebaseDb, 'direct_messages', activeChatId, 'messages');
  
  // Real-time metadata subscription for read status
  const metaRef = firestore.doc(firebaseDb, 'direct_messages', activeChatId, 'messages', 'metadata');
  dmMetaUnsubscribe = firestore.onSnapshot(metaRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data && data.lastRead) {
        const otherUserId = String(activeChatRecipientId).toLowerCase();
        let otherLastRead = 0;
        for (const [uid, ts] of Object.entries(data.lastRead)) {
          if (uid.toLowerCase() === otherUserId) {
            otherLastRead = ts;
            break;
          }
        }
        window.activeChatRecipientLastRead = otherLastRead;
        updateDMMessagesTicks(otherLastRead);
      }
    }
  }, (err) => {
    console.warn('Failed to listen to DM metadata changes:', err);
  });

  const q = firestore.query(
    msgsRef,
    firestore.orderBy('timestamp', 'asc')
  );

  const msgsList = document.getElementById('dm-messages-list');

  dmUnsubscribe = firestore.onSnapshot(q, { includeMetadataChanges: true }, async (snapshot) => {
    const loader = msgsList.querySelector('.dm-chat-loader');
    if (loader) loader.remove();

    const hasBubbles = msgsList.querySelectorAll('.chat-bubble-wrapper').length > 0;
    if (snapshot.empty && !hasBubbles) {
      msgsList.innerHTML = `
        <div id="dm-empty-state" style="text-align:center; padding:60px 20px; color:var(--text-light);">
          <div style="font-size:40px; margin-bottom:16px;">👋</div>
          <h3 style="font-family:'Space Grotesk', sans-serif; font-weight:900; text-transform:uppercase;">Say Hi!</h3>
          <p style="font-size:13px; font-weight:600; opacity:0.7;">Start a conversation with ${activeChatRecipientName}</p>
        </div>
      `;
      return;
    }

    const emptyState = document.getElementById('dm-empty-state');
    if (emptyState) emptyState.remove();
    if (msgsList.querySelector('.pulse')) msgsList.innerHTML = '';

    const container = document.getElementById('dm-messages-container');
    const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;

    for (const change of snapshot.docChanges()) {
      const doc = change.doc;
      if (doc.id === 'metadata') continue;
      const data = doc.data();
      const timestampDate = data.timestamp?.toDate ? data.timestamp.toDate() : new Date();
      const isPending = doc.metadata?.hasPendingWrites || false;
      const msg = {
        ...data,
        _id: doc.id,
        chatId: activeChatId,
        timestamp: timestampDate.getTime()
      };

      // Client-side soft-delete filter
      if (myDeletedAt && msg.timestamp <= myDeletedAt) {
        continue;
      }

      if (change.type === 'added') {
        // Double check it's not already rendered
        if (!document.getElementById(`dm-msg-${doc.id}`)) {
          await window.localDb.directMessages.put(msg);
          renderDMMessage(msg, msgsList, true, isPending);
          if (String(msg.senderId).toLowerCase() !== String(window.userId).toLowerCase()) {
            syncLastReadToFirestore(activeChatId);
          }
        }
      } else if (change.type === 'modified') {
        await window.localDb.directMessages.put(msg);
        updateDMMessageInUI(msg);
        updateDMMessageInDOM(msg, isPending);
      } else if (change.type === 'removed') {
        await window.localDb.directMessages.delete(doc.id);
        removeDMMessageFromUI(doc.id);
      }
    }
    rebuildDMDateSeparators(msgsList);

    if (wasAtBottom) {
      scrollToBottom('dm-messages-container');
    }

    if (activeChatId) {
      localStorage.setItem('lastRead_' + activeChatId, Date.now().toString());
    }
  });
}

// ── Close Chat & Cleanup ──

function closeDMChat() {
  if (dmIsRecording) {
    cancelDMVoiceRecord();
  }
  if (dmUnsubscribe) {
    dmUnsubscribe();
    dmUnsubscribe = null;
  }
  if (dmMetaUnsubscribe) {
    dmMetaUnsubscribe();
    dmMetaUnsubscribe = null;
  }
  if (activeChatId) {
    localStorage.setItem('lastRead_' + activeChatId, Date.now().toString());
    syncLastReadToFirestore(activeChatId);
  }
  closeModal('modal-direct-chat');
  activeChatRecipientId = null;
  activeChatId = null;
}

// ── Render Message Bubble in UI ──

function renderDMMessage(msg, container, animate = false, isPending = false) {
  const userId = window.userId;
  const isSelf = String(msg.senderId) === String(userId);
  const timestamp = new Date(msg.timestamp);
  const time = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const docId = msg._id || '';

  const otherLastRead = window.activeChatRecipientLastRead || 0;
  const isRead = !isPending && msg.timestamp <= otherLastRead;
  const tickClass = `chat-tick ${isRead ? 'blue' : ''} ${isPending ? 'pending' : ''}`;

  const wrapper = document.createElement('div');
  wrapper.className = `chat-bubble-wrapper ${isSelf ? 'self' : 'other'}`;
  wrapper.id = `dm-msg-${docId}`;
  wrapper.dataset.ts = msg.timestamp.toString();

  const isPremiumSender = msg.senderIsPremium === true;
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${isSelf ? 'self' : 'other'} ${isPremiumSender ? 'premium' : ''}`;

  const isEditable = isSelf && (Date.now() - msg.timestamp < 15 * 60 * 1000);
  const editBtn = isEditable ? `<button class="chat-edit-btn" onclick="window.DM.startEditDMMessage('${docId}', '${window.escJs(msg.text)}')"><i data-lucide="pencil" style="width:12px;height:12px;"></i></button>` : '';

  // Clickable Avatar
  let avatarHtml = '';
  const senderUsername = msg.senderUsername || '';
  const onclickHtml = `onclick="window.openQuickView('${window.escJs(senderUsername)}'); event.stopPropagation();"`;
  const clickableStyle = 'cursor: pointer;';
  const glowClass = isPremiumSender ? 'premium-glow' : '';

  if (msg.senderPhoto) {
    avatarHtml = `<div class="chat-avatar ${glowClass}" style="margin-right: 8px; ${clickableStyle}" ${onclickHtml}><img src="${msg.senderPhoto}" alt="${window.escHtml(msg.senderName)}" /></div>`;
  } else {
    const colors = ['#FFD60A', '#FF3EA5', '#64FFDA', '#FF6B35', '#7B5EA7', '#B5FF4D', '#3B82F6'];
    const colorIdx = (msg.senderName || '?').charCodeAt(0) % colors.length;
    const initial = msg.senderName ? msg.senderName.charAt(0).toUpperCase() : '?';
    avatarHtml = `<div class="chat-avatar ${glowClass}" style="margin-right: 8px; background: ${colors[colorIdx]}; color: #000; ${clickableStyle}" ${onclickHtml}>${initial}</div>`;
  }

  // Reply Snippet
  let replySnippetHtml = '';
  if (msg.replyTo) {
    const isAudioReply = msg.replyTo.mediaType === 'audio' || 
                         (msg.replyTo.mediaUrl && (
                           msg.replyTo.mediaUrl.match(/\.(mp3|wav|ogg|m4a|aac)($|\?)/i) || 
                           msg.replyTo.mediaUrl.includes('audio') || 
                           msg.replyTo.mediaUrl.includes('voice')
                         ));
    
    replySnippetHtml = `
      <div class="chat-reply-snippet" onclick="window.DM.scrollToDMMessage('${msg.replyTo.docId}')">
        ${msg.replyTo.mediaUrl ? (isAudioReply ? `
          <div class="chat-reply-thumbnail" style="display:flex;align-items:center;justify-content:center;background:var(--purple);border:2px solid var(--black);border-radius:50%;width:32px;height:32px;flex-shrink:0;box-sizing:border-box;">
            <i data-lucide="mic" style="width:14px;height:14px;color:#fff;"></i>
          </div>
        ` : `
          <img data-src="${msg.replyTo.mediaUrl}" class="chat-reply-thumbnail lazy-media" />
        `) : ''}
        <div style="flex:1; min-width:0;">
          <span class="chat-reply-sender">${window.escHtml(msg.replyTo.senderName)}</span>
          <div class="chat-reply-text">${window.escHtml(msg.replyTo.text || (isAudioReply ? 'Voice Message' : 'Photo'))}</div>
        </div>
      </div>
    `;
  }

  // Reactions HTML
  const reactionsHtml = renderDMReactionsHTML(msg.reactions, docId);

  // Message Actions Row
  const buttonsHtml = `
    <div class="chat-message-actions-outside" style="display: flex; flex-direction: column; gap: 4px; justify-content: center; align-self: center; margin: 0 12px; transition: opacity 0.2s;">
      <button class="chat-edit-btn" onclick="window.DM.toggleDMReactionPicker(event, '${docId}')" title="React"><i data-lucide="smile" style="width:16px;height:16px;"></i></button>
      <button class="chat-edit-btn" onclick="window.DM.setDMReplyTo('${docId}', '${window.escJs(msg.text)}', '${window.escJs(msg.senderName)}', '${msg.mediaUrl || ''}', '${msg.mediaType || ''}', ${msg.audioDuration || 0})" title="Reply"><i data-lucide="reply" style="width:16px;height:16px;"></i></button>
      ${editBtn ? `
        <button class="chat-edit-btn" onclick="window.DM.startEditDMMessage('${docId}', '${window.escJs(msg.text)}')" title="Edit"><i data-lucide="pencil" style="width:16px;height:16px;"></i></button>
        <button class="chat-edit-btn" onclick="window.DM.deleteDMMessage('${docId}')" title="Delete" style="color:var(--red);"><i data-lucide="trash-2" style="width:16px;height:16px;"></i></button>
      ` : ''}
    </div>
  `;

  bubble.innerHTML = `
    <div class="chat-message-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
      <div style="display: flex; align-items: center; gap: 4px; ${clickableStyle}" ${onclickHtml}>
        ${avatarHtml}
        <span class="chat-sender-name">${isSelf ? 'YOU' : window.escHtml(msg.senderName)}</span>
      </div>
    </div>
    ${replySnippetHtml}
    ${msg.mediaUrl ? `
      ${msg.mediaType === 'audio' ? `
        <div class="chat-audio-player" id="dm-audio-player-${docId}">
          <button class="btn-audio-download ripple" id="dm-audio-btn-${docId}" onclick="window.DM.downloadDMAudio('${docId}', '${msg.mediaUrl}')">
            <i data-lucide="download" style="width: 20px; height: 20px;"></i>
          </button>
          <div class="audio-info">
            <div class="audio-duration" id="dm-audio-duration-${docId}">${msg.audioDuration ? window.formatDuration(msg.audioDuration) : 'Voice Message'}</div>
            <div class="audio-progress-container">
              <div class="audio-progress-bar" id="dm-audio-progress-${docId}"></div>
            </div>
          </div>
        </div>
      ` : `
        <div class="chat-media-content" onclick="window.openLightbox('${msg.mediaUrl}')">
          ${msg.mediaType === 'video' 
            ? `<video data-src="${msg.mediaUrl}" autoplay muted loop playsinline class="lazy-media"></video>` 
            : `<img data-src="${msg.mediaUrl}" class="lazy-media" />`}
        </div>
      `}
    ` : ''}
    <div class="chat-text" id="dm-chat-text-${docId}" style="margin-top: 4px;">${window.linkify(window.escHtml(msg.text))}</div>
    ${reactionsHtml}
    <div class="chat-message-footer">
      ${msg.edited ? '<span class="chat-edited-tag">Edited</span>' : ''}
      <span class="chat-time">${time}</span>
      ${isSelf ? `
        <span class="${tickClass}" id="dm-tick-${docId}">
          <i data-lucide="${isPending ? 'clock' : 'check-check'}" style="width:14px;height:14px;"></i>
        </span>
      ` : ''}
    </div>
  `;

  if (window.lucide) lucide.createIcons({ root: bubble });

  const actionsEl = document.createElement('div');
  actionsEl.innerHTML = buttonsHtml.trim();
  const buttonsNode = actionsEl.firstChild;
  if (window.lucide) lucide.createIcons({ root: buttonsNode });

  if (isSelf) {
    wrapper.appendChild(buttonsNode);
    wrapper.appendChild(bubble);
  } else {
    wrapper.appendChild(bubble);
    wrapper.appendChild(buttonsNode);
  }

  // Sort and insert
  insertDMMessageSorted(container, wrapper);

  if (window.initLazyLoading) {
    window.initLazyLoading();
  }

  if (animate && window.gsap) {
    gsap.from(bubble, { scale: 0.9, opacity: 0, duration: 0.3, ease: 'back.out(1.5)' });
  }
}

function insertDMMessageSorted(container, element) {
  const ts = parseFloat(element.dataset.ts);
  const children = Array.from(container.children).filter(el => el.classList.contains('chat-bubble-wrapper'));
  
  let inserted = false;
  for (let i = children.length - 1; i >= 0; i--) {
    const childTs = parseFloat(children[i].dataset.ts);
    if (ts >= childTs) {
      children[i].after(element);
      inserted = true;
      break;
    }
  }
  if (!inserted) {
    // Check if there's a loader or empty state to place it after, or put it at start
    const emptyState = document.getElementById('dm-empty-state');
    if (emptyState) {
      emptyState.remove();
    }
    container.appendChild(element);
  }
}

function updateDMMessageInUI(msg) {
  const bubble = document.getElementById(`dm-msg-${msg._id}`);
  if (!bubble) return;
  const textEl = bubble.querySelector(`#dm-chat-text-${msg._id}`);
  if (textEl) textEl.innerHTML = window.linkify(window.escHtml(msg.text));
  
  // Update reactions
  const reactionsHtml = renderDMReactionsHTML(msg.reactions, msg._id);
  const oldReactions = bubble.querySelector('.chat-reactions');
  if (oldReactions) oldReactions.remove();
  
  if (reactionsHtml) {
    const temp = document.createElement('div');
    temp.innerHTML = reactionsHtml.trim();
    const footer = bubble.querySelector('.chat-message-footer');
    bubble.querySelector('.chat-bubble').insertBefore(temp.firstChild, footer);
  }
  
  // Show Edited tag
  let footer = bubble.querySelector('.chat-message-footer');
  if (footer && !footer.querySelector('.chat-edited-tag') && msg.edited) {
    const tag = document.createElement('span');
    tag.className = 'chat-edited-tag';
    tag.textContent = 'Edited';
    footer.prepend(tag);
  }
  
  if (window.lucide) lucide.createIcons({ root: bubble });
}

function updateDMMessageInDOM(msg, isPending = false) {
  const el = document.getElementById(`dm-msg-${msg._id}`);
  if (!el) return;

  const timestamp = msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date();
  el.dataset.ts = timestamp.getTime().toString();

  const isSelf = String(msg.senderId) === String(window.userId);

  const timeEl = el.querySelector('.chat-time');
  if (timeEl && msg.timestamp) {
    const time = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    timeEl.textContent = time;
  }

  if (isSelf) {
    const tick = el.querySelector('.chat-tick');
    if (tick) {
      if (isPending) {
        tick.classList.add('pending');
        tick.innerHTML = '<i data-lucide="clock" style="width:14px;height:14px;"></i>';
      } else {
        tick.classList.remove('pending');
        const otherLastRead = window.activeChatRecipientLastRead || 0;
        const isRead = timestamp.getTime() <= otherLastRead;
        tick.className = `chat-tick ${isRead ? 'blue' : ''}`;
        tick.innerHTML = '<i data-lucide="check-check" style="width:14px;height:14px;"></i>';
      }
      if (window.lucide) lucide.createIcons({ root: tick });
    }
  }
}

function rebuildDMDateSeparators(container) {
  if (!container) return;

  const seps = container.querySelectorAll('.chat-date-separator');
  seps.forEach(el => el.remove());

  const wrappers = Array.from(container.children).filter(el => el.classList.contains('chat-bubble-wrapper'));
  wrappers.sort((a, b) => parseFloat(a.dataset.ts) - parseFloat(b.dataset.ts));
  wrappers.forEach(el => container.appendChild(el));

  let lastDateLabel = '';
  wrappers.forEach(wrapper => {
    const ts = parseFloat(wrapper.dataset.ts);
    if (!ts) return;
    const dateLabel = getFriendlyDate(new Date(ts));
    if (dateLabel !== lastDateLabel) {
      const sep = document.createElement('div');
      sep.className = 'chat-date-separator';
      sep.textContent = dateLabel;
      wrapper.before(sep);
      lastDateLabel = dateLabel;
    }
  });
}

function removeDMMessageFromUI(docId) {
  const bubble = document.getElementById(`dm-msg-${docId}`);
  if (bubble) {
    if (window.gsap) {
      gsap.to(bubble, { opacity: 0, height: 0, duration: 0.3, onComplete: () => bubble.remove() });
    } else {
      bubble.remove();
    }
  }
}

function renderDMReactionsHTML(reactions, docId) {
  if (!reactions || Object.keys(reactions).length === 0) return '';
  
  // Aggregate reactions count
  const counts = {}; // { emoji: [userIds] }
  Object.entries(reactions).forEach(([userId, emoji]) => {
    if (!counts[emoji]) counts[emoji] = [];
    counts[emoji].push(userId);
  });

  const myId = window.userId;
  
  let html = `<div class="chat-reactions" style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px;">`;
  Object.entries(counts).forEach(([emoji, userIds]) => {
    const isMyReaction = userIds.includes(myId);
    const activeClass = isMyReaction ? 'active' : '';
    html += `
      <div class="chat-reaction-badge ${activeClass}" onclick="window.DM.toggleDMReaction('${docId}', '${emoji}')" style="display:flex; align-items:center; gap:4px; background:var(--bg-muted); border:2px solid var(--black); border-radius:12px; padding:2px 8px; font-size:12px; font-weight:800; cursor:pointer; box-shadow: 1px 1px 0 var(--black);">
        <span>${emoji}</span>
        <span style="font-size:10px; color:var(--text-muted);">${userIds.length}</span>
      </div>
    `;
  });
  html += `</div>`;
  return html;
}

// ── Sending Direct Messages ──

async function sendDMMessage() {
  if (!activeChatId || !isFriendActive) return;
  if (isDMSending) return;
  
  const input = document.getElementById('dm-chat-input');
  if (!input) return;
  const text = input.value.trim();
  
  if (!text && selectedDMMediaBlobs.length === 0) return;
  
  // Cooldown
  if (Date.now() - lastDMMessageSentAt < 1000) {
    showToast('Spam prevention: Please wait a second.', 'warn');
    return;
  }

  // Quota pre-check (for attachments)
  if (selectedDMMediaBlobs.length > 0) {
    for (const item of selectedDMMediaBlobs) {
      if (item.type === 'image' && imageLimitRemaining <= 0) {
        showToast('Daily image upload limit reached.', 'warn');
        return;
      }
      if (item.type === 'audio') {
        if (item.source === 'upload' && audioFileLimitRemaining <= 0) {
          showToast('Daily audio file upload limit reached.', 'warn');
          return;
        }
        if (item.source !== 'upload' && audioLimitRemaining <= 0) {
          showToast('Daily voice recording limit reached.', 'warn');
          return;
        }
      }
    }
  }

  if (!navigator.onLine && selectedDMMediaBlobs.length > 0) {
    return showToast('Uploading media attachments requires an internet connection.', 'error');
  }

  const { firebaseDb, firestore } = window;
  if (!firebaseDb || !firestore) {
    return showToast('Chat is currently offline.', 'error');
  }

  // Ensure we are signed into Firebase Auth before writing to Firestore.
  // If the custom token was previously rejected (e.g. on the local dev server),
  // this transparently re-authenticates and clears the permission-denied error.
  if (typeof window.ensureFirebaseAuth === 'function') {
    const authed = await window.ensureFirebaseAuth();
    if (!authed) {
      return showToast('Could not authenticate with chat server. Please check your connection and try again.', 'error');
    }
  }

  isDMSending = true;
  const btn = document.getElementById('dm-chat-send-btn');

  try {
    if (btn) {
      btn.disabled = true;
      if (selectedDMMediaBlobs.length > 0) {
        btn.innerHTML = '<i data-lucide="upload-cloud" class="loading-bounce"></i>';
        if (window.lucide) lucide.createIcons({ root: btn });
      }
    }

    // Clear input bar instantly
    input.value = '';
    input.style.height = '48px';
    lastDMMessageSentAt = Date.now();
    const replyCopy = activeDMReplyTo;
    activeDMReplyTo = null;
    clearDMReply();

    const msgsRef = firestore.collection(firebaseDb, 'direct_messages', activeChatId, 'messages');
    
    // Build message metadata (similar to backend format)
    const myUserId = window.userId;
    const myName = localStorage.getItem('window.userName') || 'Friend';
    const myUsername = localStorage.getItem('userUsername') || '';
    const myPhoto = localStorage.getItem('window.userProfilePicture') || '';
    const myIsPremium = localStorage.getItem('isPremium') === 'true' || localStorage.getItem('subscriptionTier') === 'premium';
    
    const baseMsgData = {
      senderId: String(myUserId),
      senderName: myName,
      senderUsername: myUsername,
      senderPhoto: myPhoto || null,
      senderIsPremium: myIsPremium,
      timestamp: firestore.serverTimestamp()
    };

    if (selectedDMMediaBlobs.length === 0) {
      const msgData = {
        ...baseMsgData,
        text
      };
      if (replyCopy) {
        msgData.replyTo = {
          docId: replyCopy.docId || '',
          text: replyCopy.text || '',
          senderName: replyCopy.senderName || '',
          mediaUrl: replyCopy.mediaUrl || null,
          mediaType: replyCopy.mediaType || null,
          audioDuration: replyCopy.audioDuration || null
        };
      }
      if (navigator.onLine) {
        await firestore.addDoc(msgsRef, msgData);
      } else {
        firestore.addDoc(msgsRef, msgData).catch(err => console.error('Offline DM write error:', err));
      }
      triggerDMPushNotification(text, false, null);
    } else {
      let isFirst = true;
      for (const item of selectedDMMediaBlobs) {
        const mediaUrl = await uploadMediaToCloudinary(item.blob, item.type, item.source);
        
        const msgData = {
          ...baseMsgData,
          text: isFirst ? text : '',
          mediaUrl,
          mediaType: item.type,
          audioDuration: item.duration || null
        };
        
        if (isFirst && replyCopy) {
          msgData.replyTo = {
            docId: replyCopy.docId || '',
            text: replyCopy.text || '',
            senderName: replyCopy.senderName || '',
            mediaUrl: replyCopy.mediaUrl || null,
            mediaType: replyCopy.mediaType || null,
            audioDuration: replyCopy.audioDuration || null
          };
        }
        
        await firestore.addDoc(msgsRef, msgData);
        if (isFirst) {
          triggerDMPushNotification(text, true, item.type);
        }

        // Deduct remaining limits locally
        if (item.type === 'image') imageLimitRemaining--;
        else if (item.type === 'audio') {
          if (item.source === 'upload') audioFileLimitRemaining--;
          else audioLimitRemaining--;
        }
        isFirst = false;
      }
      clearDMMediaPreview();
      updateDMMediaLimitDisplay();
    }
  } catch (err) {
    console.error('Failed to send DM message:', err);
    showToast(err.message || 'Error sending message.', 'error');
  } finally {
    isDMSending = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="send" style="width: 20px; height: 20px; color: #fff;"></i>';
      if (window.lucide) lucide.createIcons({ root: btn });
    }
  }
}

// ── Cloudinary Direct Upload Helper ──

async function uploadMediaToCloudinary(blob, type, source = 'recording') {
  const formData = new FormData();
  let filename = 'media.webp';
  if (type === 'video') filename = 'animation.webm';
  if (type === 'audio') filename = 'voice.webm';
  
  formData.append('file', blob, filename);

  const res = await window.apiFetch(`${window.API}/api/auth/chat-media`, {
    method: 'POST',
    headers: {
      'X-Media-Type': type,
      'X-Media-Source': source || 'recording',
      'X-Recipient-Id': activeChatRecipientId || ''
    },
    body: formData,
    timeout: 120000
  });

  return res.secure_url;
}

// ── Trigger DM push notifications via backend Cooldown stacks ──

function triggerDMPushNotification(text, hasMedia, mediaType) {
  if (!activeChatRecipientId) return;
  const myName = localStorage.getItem('window.userName') || 'Friend';

  window.apiFetch(`${window.API}/api/fcm/notify-dm`, {
    method: 'POST',
    body: JSON.stringify({
      recipientId: activeChatRecipientId,
      senderName: myName,
      text: text,
      hasMedia: hasMedia,
      mediaType: mediaType
    })
  }).catch(err => {
    console.warn('Failed to dispatch background FCM DM notification:', err);
  });
}

// ── Edit, Delete, Reply, and Reactions ──

function startEditDMMessage(docId, currentText) {
  const textEl = document.getElementById(`dm-chat-text-${docId}`);
  if (!textEl) return;
  
  // Avoid duplicating edit container
  if (document.getElementById(`dm-edit-container-${docId}`)) return;

  const originalHtml = textEl.innerHTML;
  textEl.innerHTML = `
    <div class="chat-edit-container" id="dm-edit-container-${docId}" style="display:flex; flex-direction:column; gap:8px; margin-top:4px;">
      <textarea class="form-control" rows="2" style="background:var(--bg); border:2px solid var(--black); font-size:13px; color:var(--text); width:100%; border-radius:8px; padding:6px 10px; box-sizing:border-box;">${currentText}</textarea>
      <div style="display:flex; gap:6px; justify-content:flex-end;">
        <button class="btn-chat-edit btn-chat-cancel" onclick="window.DM.cancelEditDMMessage('${docId}', '${window.escJs(currentText)}')" style="padding:4px 10px; font-size:11px; border-radius:4px; font-weight:800; cursor:pointer; background:var(--bg-muted); border:2px solid var(--black);">Cancel</button>
        <button class="btn-chat-edit btn-chat-save" onclick="window.DM.saveEditDMMessage('${docId}')" style="padding:4px 10px; font-size:11px; border-radius:4px; font-weight:800; cursor:pointer; background:var(--yellow); color:#000; border:2px solid var(--black);">Save</button>
      </div>
    </div>
  `;
}

function cancelEditDMMessage(docId, currentText) {
  const textEl = document.getElementById(`dm-chat-text-${docId}`);
  if (textEl) {
    textEl.textContent = currentText;
  }
}

async function saveEditDMMessage(docId) {
  const container = document.getElementById(`dm-edit-container-${docId}`);
  if (!container) return;
  const textarea = container.querySelector('textarea');
  const newText = textarea.value.trim();
  if (!newText) return showToast('Message text cannot be empty.', 'warn');

  try {
    const docRef = firestore.doc(firebaseDb, 'direct_messages', activeChatId, 'messages', docId);
    await firestore.updateDoc(docRef, {
      text: newText,
      edited: true,
      editedAt: firestore.serverTimestamp()
    });
    showToast('Message edited successfully.', 'success');
  } catch (err) {
    showToast('Failed to edit message.', 'error');
  }
}

async function deleteDMMessage(docId) {
  if (!confirm('Are you sure you want to delete this message? This action is permanent.')) return;
  try {
    const docRef = firestore.doc(firebaseDb, 'direct_messages', activeChatId, 'messages', docId);
    await firestore.deleteDoc(docRef);
    showToast('Message deleted.', 'info');
  } catch (err) {
    showToast('Failed to delete message.', 'error');
  }
}

function toggleDMReactionPicker(event, docId) {
  event.stopPropagation();
  // Close any existing pickers
  const existing = document.getElementById('dm-reaction-picker');
  if (existing) {
    existing.remove();
    if (existing.dataset.docId === docId) return;
  }

  const emojis = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
  const picker = document.createElement('div');
  picker.id = 'dm-reaction-picker';
  picker.className = 'chat-reaction-picker';
  picker.dataset.docId = docId;
  picker.style.cssText = `
    position: absolute; display: flex; gap: 6px; background: var(--bg-card); 
    border: 3px solid var(--black); border-radius: 12px; padding: 6px; 
    box-shadow: 4px 4px 0 var(--black); z-index: 100; transform: translateY(-40px);
  `;

  emojis.forEach(emoji => {
    const btn = document.createElement('button');
    btn.textContent = emoji;
    btn.style.cssText = 'background:none; border:none; font-size:18px; cursor:pointer; padding:2px; transition:transform 0.1s;';
    btn.onclick = () => {
      toggleDMReaction(docId, emoji);
      picker.remove();
    };
    btn.onmouseover = () => btn.style.transform = 'scale(1.25)';
    btn.onmouseout = () => btn.style.transform = 'scale(1)';
    picker.appendChild(btn);
  });

  const messageWrapper = document.getElementById(`dm-msg-${docId}`);
  if (messageWrapper) {
    const bubble = messageWrapper.querySelector('.chat-bubble');
    bubble.appendChild(picker);
  }

  // Close picker on outside click
  const closeHandler = () => {
    picker.remove();
    document.removeEventListener('click', closeHandler);
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 10);
}

async function toggleDMReaction(docId, emoji) {
  try {
    const docRef = firestore.doc(firebaseDb, 'direct_messages', activeChatId, 'messages', docId);
    const snap = await firestore.getDoc(docRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const reactions = data.reactions || {};
    const myId = window.userId;

    if (reactions[myId] === emoji) {
      delete reactions[myId]; // remove reaction
    } else {
      reactions[myId] = emoji; // add/change reaction
    }

    await firestore.updateDoc(docRef, { reactions });
  } catch (err) {
    console.error('Failed to toggle reaction:', err);
  }
}

function setDMReplyTo(docId, text, senderName, mediaUrl, mediaType, audioDuration) {
  activeDMReplyTo = { docId, text, senderName, mediaUrl, mediaType, audioDuration };
  
  const container = document.getElementById('dm-reply-preview-container');
  if (!container) return;

  container.style.display = 'flex';
  const previewText = container.querySelector('.reply-preview-text');
  const previewSender = container.querySelector('.reply-preview-sender');
  
  if (previewSender) previewSender.textContent = senderName;
  if (previewText) {
    if (mediaUrl) {
      if (mediaType === 'audio') {
        previewText.textContent = 'Voice Message';
      } else {
        previewText.textContent = 'Photo Attachment';
      }
    } else {
      previewText.textContent = text;
    }
  }

  const input = document.getElementById('dm-chat-input');
  if (input) input.focus();
}

function clearDMReply() {
  activeDMReplyTo = null;
  const container = document.getElementById('dm-reply-preview-container');
  if (container) container.style.display = 'none';
}

function scrollToDMMessage(docId) {
  const el = document.getElementById(`dm-msg-${docId}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (window.gsap) {
      gsap.fromTo(el.querySelector('.chat-bubble'), 
        { backgroundColor: 'var(--yellow)' }, 
        { backgroundColor: '', duration: 1 }
      );
    }
  }
}

// ── Clear Chat History (Local & Firestore) ──

async function clearDMChatHistory() {
  if (!activeChatId || !activeChatRecipientId) return;

  if (isFriendActive) {
    if (!confirm('Are you sure you want to permanently delete your entire conversation history with this user? This cannot be undone.')) return;

    const msgsList = document.getElementById('dm-messages-list');
    const myUserId = window.userId;
    const now = Date.now();

    try {
      // 1. Delete locally from IndexedDB
      await window.localDb.directMessages.where('chatId').equals(activeChatId).delete();
      
      // 2. Set the delete timestamp in the chat metadata document
      const metaRef = firestore.doc(firebaseDb, 'direct_messages', activeChatId, 'messages', 'metadata');
      await firestore.setDoc(metaRef, {
        deletedAt: {
          [myUserId]: now
        }
      }, { merge: true });

      // Update local state
      myDeletedAt = now;
      localStorage.setItem('deletedAt_' + activeChatId, now.toString());

      // Restart real-time listener to apply new start timestamp filter
      subscribeToDMMessages(0);

      if (msgsList) {
        msgsList.innerHTML = `
          <div id="dm-empty-state" style="text-align:center; padding:60px 20px; color:var(--text-light);">
            <div style="font-size:40px; margin-bottom:16px;">🧹</div>
            <h3 style="font-family:'Space Grotesk', sans-serif; font-weight:900; text-transform:uppercase;">Chat Cleared</h3>
            <p style="font-size:13px; font-weight:600; opacity:0.7;">All messages were deleted permanently.</p>
          </div>
        `;
      }
      showToast('Chat history cleared.', 'success');

      // 3. Check if both users have cleared this chat to trigger hard deletion
      const metaSnap = await firestore.getDoc(metaRef);
      if (metaSnap.exists()) {
        const metaData = metaSnap.data();
        const deletedAt = metaData.deletedAt || {};

        const userIds = activeChatId.split('_');
        const user1 = userIds[0];
        const user2 = userIds[1];

        if (deletedAt[user1] && deletedAt[user2]) {
          // Find the older of the delete times: messages older than both are invisible to both
          const cutoff = Math.min(deletedAt[user1], deletedAt[user2]);

          const msgsRef = firestore.collection(firebaseDb, 'direct_messages', activeChatId, 'messages');
          const q = firestore.query(msgsRef, firestore.where('timestamp', '<=', new Date(cutoff)));
          const snap = await firestore.getDocs(q);

          if (!snap.empty) {
            const mediaUrls = [];
            const deletePromises = [];

            snap.docs.forEach(doc => {
              if (doc.id === 'metadata') return;
              const msgData = doc.data();
              if (msgData.mediaUrl) {
                mediaUrls.push(msgData.mediaUrl);
              }
              deletePromises.push(firestore.deleteDoc(doc.ref));
            });

            // Delete media from Cloudinary
            if (mediaUrls.length > 0) {
              await window.apiFetch(`${window.API}/api/auth/chat-media`, {
                method: 'DELETE',
                body: JSON.stringify({ urls: mediaUrls })
              }).catch(e => console.warn('Cloudinary DM media deletion failed:', e));
            }

            // Delete messages from Firestore
            await Promise.all(deletePromises);
            console.log(`Hard-deleted ${snap.size} messages and their Cloudinary media.`);
          }
        }
      }
    } catch (err) {
      console.error('Failed to clear DM history:', err);
      showToast('Error clearing chat history.', 'error');
    }
  } else {
    // Unfollowed user: delete permanently and remove contact
    if (!confirm(`Are you sure you want to permanently delete your entire conversation history with ${activeChatRecipientName} and remove this contact? This cannot be undone.`)) return;

    const msgsList = document.getElementById('dm-messages-list');
    const myUserId = window.userId;
    const now = Date.now();
    const recipientId = activeChatRecipientId;
    const recipientName = activeChatRecipientName;

    try {
      // 1. Delete locally from IndexedDB
      await window.localDb.directMessages.where('chatId').equals(activeChatId).delete();
      
      // 2. Set the delete timestamp in the chat metadata document
      const metaRef = firestore.doc(firebaseDb, 'direct_messages', activeChatId, 'messages', 'metadata');
      await firestore.setDoc(metaRef, {
        deletedAt: {
          [myUserId]: now
        }
      }, { merge: true });

      // 3. Remove from Firestore friendships
      const docRef = firestore.doc(firebaseDb, 'friendships', myUserId);
      const docSnap = await firestore.getDoc(docRef);
      if (docSnap.exists()) {
        const friendsList = docSnap.data().friends || [];
        const updatedFriends = friendsList.filter(id => String(id) !== recipientId);
        await firestore.updateDoc(docRef, { friends: updatedFriends });
      }

      // 4. Remove local storage keys
      localStorage.removeItem('activeContact_' + recipientId);
      localStorage.removeItem('contact_details_' + recipientId);
      localStorage.removeItem('deletedAt_' + activeChatId);
      localStorage.removeItem('lastRead_' + activeChatId);

      closeDMChat();
      showToast(`Permanently deleted chat with ${recipientName}.`, 'success');
      fetchFriends();

      // 5. Trigger hard deletion if both have deleted
      const metaSnap = await firestore.getDoc(metaRef);
      if (metaSnap.exists()) {
        const metaData = metaSnap.data();
        const deletedAt = metaData.deletedAt || {};

        const userIds = activeChatId.split('_');
        const user1 = userIds[0];
        const user2 = userIds[1];

        if (deletedAt[user1] && deletedAt[user2]) {
          const cutoff = Math.min(deletedAt[user1], deletedAt[user2]);
          const msgsRef = firestore.collection(firebaseDb, 'direct_messages', activeChatId, 'messages');
          const q = firestore.query(msgsRef, firestore.where('timestamp', '<=', new Date(cutoff)));
          const snap = await firestore.getDocs(q);

          if (!snap.empty) {
            const mediaUrls = [];
            const deletePromises = [];

            snap.docs.forEach(doc => {
              if (doc.id === 'metadata') return;
              const msgData = doc.data();
              if (msgData.mediaUrl) {
                mediaUrls.push(msgData.mediaUrl);
              }
              deletePromises.push(firestore.deleteDoc(doc.ref));
            });

            if (mediaUrls.length > 0) {
              await window.apiFetch(`${window.API}/api/auth/chat-media`, {
                method: 'DELETE',
                body: JSON.stringify({ urls: mediaUrls })
              }).catch(e => console.warn('Cloudinary DM media deletion failed:', e));
            }

            await Promise.all(deletePromises);
            console.log(`Hard-deleted ${snap.size} messages and their Cloudinary media.`);
          }
        }
      }
    } catch (err) {
      console.error('Failed to permanently clear DM history:', err);
      showToast('Error deleting chat.', 'error');
    }
  }
}

// ── Audio Player Helper ──

const activeDMAudioUrls = {}; // docId -> Audio Object
function downloadDMAudio(docId, url) {
  const btn = document.getElementById(`dm-audio-btn-${docId}`);
  const progress = document.getElementById(`dm-audio-progress-${docId}`);
  const durationEl = document.getElementById(`dm-audio-duration-${docId}`);

  if (!btn) return;

  // Toggle Play / Pause
  if (activeDMAudioUrls[docId]) {
    const audio = activeDMAudioUrls[docId];
    if (audio.paused) {
      audio.play();
      btn.innerHTML = '<i data-lucide="pause" style="width:20px; height:20px;"></i>';
    } else {
      audio.pause();
      btn.innerHTML = '<i data-lucide="play" style="width:20px; height:20px;"></i>';
    }
    if (window.lucide) lucide.createIcons({ root: btn });
    return;
  }

  // Load and play new audio
  btn.disabled = true;
  btn.innerHTML = '<div class="loading-spinner-small" style="width:14px; height:14px; border:2px solid var(--black); border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite;"></div>';

  const audio = new Audio(url);
  activeDMAudioUrls[docId] = audio;

  audio.addEventListener('canplaythrough', () => {
    btn.disabled = false;
    audio.play();
    btn.innerHTML = '<i data-lucide="pause" style="width:20px; height:20px;"></i>';
    if (window.lucide) lucide.createIcons({ root: btn });
  });

  audio.addEventListener('timeupdate', () => {
    if (progress && audio.duration) {
      const pct = (audio.currentTime / audio.duration) * 100;
      progress.style.width = `${pct}%`;
      if (durationEl) {
        durationEl.textContent = `${window.formatDuration(audio.currentTime)} / ${window.formatDuration(audio.duration)}`;
      }
    }
  });

  audio.addEventListener('ended', () => {
    btn.innerHTML = '<i data-lucide="play" style="width:20px; height:20px;"></i>';
    if (progress) progress.style.width = '0%';
    if (durationEl) durationEl.textContent = window.formatDuration(audio.duration);
    if (window.lucide) lucide.createIcons({ root: btn });
  });

  audio.addEventListener('error', () => {
    showToast('Failed to load audio stream.', 'error');
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="download" style="width:20px; height:20px;"></i>';
    if (window.lucide) lucide.createIcons({ root: btn });
    delete activeDMAudioUrls[docId];
  });
}

// ── Audio Recording & File Selection helpers ──

/** ── AUDIO COMPRESSION HELPER ── **/
async function compressDMAudioFile(file) {
  return new Promise(async (resolve, reject) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuffer = await file.arrayBuffer();
      const decodedData = await audioCtx.decodeAudioData(arrayBuffer);
      
      const source = audioCtx.createBufferSource();
      source.buffer = decodedData;
      
      const destination = audioCtx.createMediaStreamDestination();
      source.connect(destination);
      
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';
        
      const recorder = new MediaRecorder(destination.stream, { 
        mimeType,
        audioBitsPerSecond: 32000 // 32 kbps target
      });
      
      const chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        resolve(blob);
      };
      
      recorder.start();
      source.start(0);
      
      source.onended = () => {
        recorder.stop();
        audioCtx.close();
      };
    } catch (e) {
      reject(e);
    }
  });
}

async function getDMAudioDuration(file) {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.src = url;
    audio.onloadedmetadata = () => {
      resolve(audio.duration);
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
  });
}

async function processDMImage(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  let width = bitmap.width;
  let height = bitmap.height;
  const maxDim = 1200;
  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height *= maxDim / width;
      width = maxDim;
    } else {
      width *= maxDim / height;
      height = maxDim;
    }
  }

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/webp', 0.75);
  });
}

function triggerDMCameraCapture() {
  if (window.startCameraCapture) {
    window.startCameraCapture((file) => {
      const mockEvent = {
        target: {
          files: [file],
          value: ''
        }
      };
      handleDMFileSelect(mockEvent);
    });
  } else {
    const input = document.getElementById('dm-camera-input');
    if (input) input.click();
  }
}

async function handleDMFileSelect(event) {
  const files = Array.from(event.target.files);
  if (!files || files.length === 0) return;

  // Reset input value
  event.target.value = '';

  // 1. Quota check for images
  const imagesInBatch = files.filter(f => f.type.startsWith('image/')).length;
  if (imagesInBatch > 0) {
    if (imagesInBatch > imageLimitRemaining) {
      return showToast(`Limit exceeded! You only have ${imageLimitRemaining} photo uploads left this hour.`, 'error');
    }
    if (imagesInBatch > 20) {
      return showToast('Max 20 images allowed at once.', 'warn');
    }
  }

  // 2. Validate all files first
  const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  const maxImageSize = 10 * 1024 * 1024; // 10MB
  const maxAudioSize = 2 * 1024 * 1024; // 2MB

  for (const file of files) {
    if (file.type.startsWith('image/')) {
      if (!allowedImageTypes.includes(file.type)) {
        return showToast(`Invalid format in batch: ${file.name}`, 'warn');
      }
      if (file.size > maxImageSize) {
        return showToast(`Image too large (>10MB): ${file.name}`, 'warn');
      }
    } else if (file.type.startsWith('audio/')) {
      if (file.size > maxAudioSize) {
        return showToast(`Audio file too large (>2MB): ${file.name}`, 'warn');
      }
    } else {
      return showToast(`Unsupported file type: ${file.name}`, 'warn');
    }
  }

  showToast(`Processing ${files.length} attachment(s)...`, 'info');

  try {
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        if (file.type === 'image/gif') {
          selectedDMMediaBlobs.push({ blob: file, type: 'image', source: 'upload', duration: null });
        } else {
          const compressedBlob = await processDMImage(file);
          selectedDMMediaBlobs.push({ blob: compressedBlob, type: 'image', source: 'upload', duration: null });
        }
      } else if (file.type.startsWith('audio/')) {
        if (audioFileLimitRemaining <= 0) {
          showToast('Audio file upload limit exceeded! Wait until next hour.', 'error');
          continue;
        }
        const duration = await getDMAudioDuration(file).catch(() => null);
        showToast('Compressing audio file...', 'info');
        try {
          const compressedBlob = await compressDMAudioFile(file);
          selectedDMMediaBlobs.push({ blob: compressedBlob, type: 'audio', source: 'upload', duration });
        } catch (err) {
          console.warn('Audio compression failed, sending original:', err);
          selectedDMMediaBlobs.push({ blob: file, type: 'audio', source: 'upload', duration });
        }
      }
    }
    showToast('Attachments processed!', 'success');
  } catch (err) {
    console.error('Failed to process DM attachments:', err);
    showToast('Failed to process some attachments.', 'error');
  }

  renderDMMediaPreviews();
}

let dmRecordingTimerInterval = null;

function startDMVoiceRecord() {
  if (dmIsRecording) {
    stopDMVoiceRecord();
    return;
  }

  if (audioLimitRemaining <= 0) {
    showToast('Daily voice recording limit reached.', 'warn');
    return;
  }

  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      dmIsRecording = true;
      dmAudioChunks = [];
      dmRecordingStartTime = Date.now();

      // Show recording UI, hide chat form
      const recorderUi = document.getElementById('dm-chat-recorder-ui');
      const chatForm = document.getElementById('dm-chat-form');
      if (recorderUi) recorderUi.style.display = 'flex';
      if (chatForm) chatForm.style.display = 'none';

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';

      dmMediaRecorder = new MediaRecorder(stream, { 
        mimeType,
        audioBitsPerSecond: 32000 // 32 kbps target
      });
      dmMediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) dmAudioChunks.push(e.data);
      };

      dmMediaRecorder.onstop = async () => {
        if (dmAudioChunks.length > 0) {
          const audioBlob = new Blob(dmAudioChunks, { type: mimeType });
          const durationSec = Math.round((Date.now() - dmRecordingStartTime) / 1000);
          
          selectedDMMediaBlobs.push({
            blob: audioBlob,
            type: 'audio',
            source: 'recording',
            duration: durationSec
          });
          
          renderDMMediaPreviews();
        }
        
        // Stop stream tracks
        stream.getTracks().forEach(track => track.stop());
      };

      dmMediaRecorder.start();

      // Timer update
      dmRecordingTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - dmRecordingStartTime) / 1000);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        const timerEl = document.getElementById('dm-recorder-timer');
        if (timerEl) timerEl.textContent = `${mins}:${secs}`;
        
        if (elapsed >= 60) {
          stopDMVoiceRecord();
        }
      }, 1000);

    })
    .catch(err => {
      console.error('Failed to start recording:', err);
      showToast('Microphone access denied.', 'error');
    });
}

function stopDMVoiceRecord() {
  if (!dmIsRecording) return;
  dmIsRecording = false;

  clearInterval(dmRecordingTimerInterval);

  if (dmMediaRecorder && dmMediaRecorder.state !== 'inactive') {
    dmMediaRecorder.stop();
  }

  // Restore UI
  const recorderUi = document.getElementById('dm-chat-recorder-ui');
  const chatForm = document.getElementById('dm-chat-form');
  if (recorderUi) recorderUi.style.display = 'none';
  if (chatForm) chatForm.style.display = 'flex';

  const timerEl = document.getElementById('dm-recorder-timer');
  if (timerEl) timerEl.textContent = '00:00';
}

function cancelDMVoiceRecord() {
  if (!dmIsRecording) return;
  dmIsRecording = false;

  clearInterval(dmRecordingTimerInterval);
  dmAudioChunks = [];

  if (dmMediaRecorder && dmMediaRecorder.state !== 'inactive') {
    // Override onstop to ignore chunks
    dmMediaRecorder.onstop = () => {
      const stream = dmMediaRecorder.stream;
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
    dmMediaRecorder.stop();
  }

  // Restore UI
  const recorderUi = document.getElementById('dm-chat-recorder-ui');
  const chatForm = document.getElementById('dm-chat-form');
  if (recorderUi) recorderUi.style.display = 'none';
  if (chatForm) chatForm.style.display = 'flex';

  const timerEl = document.getElementById('dm-recorder-timer');
  if (timerEl) timerEl.textContent = '00:00';
  showToast('Recording cancelled.', 'info');
}

function renderDMMediaPreviews() {
  const container = document.getElementById('dm-media-previews');
  if (!container) return;

  container.innerHTML = '';
  if (selectedDMMediaBlobs.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  selectedDMMediaBlobs.forEach((item, idx) => {
    const preview = document.createElement('div');
    preview.className = 'chat-media-preview-item';
    preview.style.cssText = 'position:relative; width:60px; height:60px; border:2px solid var(--black); border-radius:8px; overflow:hidden; background:var(--bg-muted); display:flex; align-items:center; justify-content:center; box-shadow:2px 2px 0 var(--black);';

    if (item.type === 'image') {
      const url = URL.createObjectURL(item.blob);
      preview.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover;" />`;
    } else if (item.type === 'audio') {
      preview.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; color:var(--purple);"><i data-lucide="mic" style="width:24px; height:24px;"></i><span style="font-size:9px; font-weight:800;">${item.duration ? item.duration + 's' : 'Voice'}</span></div>`;
    }

    const removeBtn = document.createElement('button');
    removeBtn.innerHTML = '×';
    removeBtn.style.cssText = 'position:absolute; top:2px; right:2px; width:16px; height:16px; background:var(--red); color:#fff; border:1px solid var(--black); border-radius:50%; font-size:10px; line-height:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-weight:900;';
    removeBtn.onclick = () => {
      selectedDMMediaBlobs.splice(idx, 1);
      renderDMMediaPreviews();
    };

    preview.appendChild(removeBtn);
    container.appendChild(preview);
  });

  if (window.lucide) lucide.createIcons({ root: container });
}

function clearDMMediaPreview() {
  selectedDMMediaBlobs = [];
  renderDMMediaPreviews();
}

// ── Contact List & Request List Renderers ──

function setupRealtimeContactsListeners(contactList) {
  const { firebaseDb, firestore, userId, firebaseAuth } = window;
  if (!firebaseDb || !firestore || !userId) return;

  // Prevent Firestore permission errors if auth hasn't completed yet
  if (!firebaseAuth || !firebaseAuth.currentUser) {
    return;
  }

  const currentChatIds = new Set();

  contactList.forEach(f => {
    const chatId = getChatId(userId, f._id);
    currentChatIds.add(chatId);

    if (!contactsListeners.has(chatId)) {
      const msgsRef = firestore.collection(firebaseDb, 'direct_messages', chatId, 'messages');
      const q = firestore.query(
        msgsRef,
        firestore.orderBy('timestamp', 'desc'),
        firestore.limit(1)
      );

      const unsubscribe = firestore.onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) return;
        
        // Find latest message doc that is not 'metadata'
        const doc = snapshot.docs.find(d => d.id !== 'metadata');
        if (!doc) return;

        const data = doc.data();
        const timestampDate = data.timestamp?.toDate ? data.timestamp.toDate() : new Date();
        const msg = {
          ...data,
          _id: doc.id,
          chatId: chatId,
          timestamp: timestampDate.getTime()
        };

        // 1. Put into local IndexDB so cache is fresh
        if (window.localDb) {
          await window.localDb.directMessages.put(msg);
        }

        // 2. Update UI card if it is in DOM
        const card = document.getElementById(`dm-contact-card-${f._id}`);
        if (card) {
          // Update last message preview text
          const isSelf = String(msg.senderId) === String(userId);
          let prefix = isSelf ? 'You: ' : '';
          let lastMsgText = '';
          if (msg.mediaUrl) {
            if (msg.mediaType === 'audio') {
              lastMsgText = prefix + '🎙️ Voice Message';
            } else {
              lastMsgText = prefix + '📷 Photo';
            }
          } else {
            lastMsgText = prefix + (msg.text || '');
          }

          const previewEl = card.querySelector('.dm-last-msg-text');
          if (previewEl) {
            previewEl.textContent = lastMsgText;
            previewEl.style.color = 'var(--text)';
            previewEl.style.fontSize = '12px';
            previewEl.style.fontWeight = '600';
          }

          // Update unread badge in real-time
          const unreadWrapper = card.querySelector('.dm-unread-badge-wrapper');
          if (unreadWrapper) {
            const lastReadTime = parseInt(localStorage.getItem('lastRead_' + chatId) || '0');
            const chatDeletedAt = parseInt(localStorage.getItem('deletedAt_' + chatId) || '0');
            
            // Query local IndexedDB for exact count
            let unreadCount = 0;
            if (window.localDb) {
              const unreadMsgs = await window.localDb.directMessages
                .where('chatId').equals(chatId)
                .and(m => String(m.senderId) !== String(userId) && m.timestamp > lastReadTime && m.timestamp > chatDeletedAt)
                .toArray();
              unreadCount = unreadMsgs.length;
            }

            if (unreadCount > 0 && activeChatId !== chatId) {
              const displayUnread = unreadCount > 10 ? '10+' : String(unreadCount);
              unreadWrapper.innerHTML = `<span class="dm-unread-badge" style="background:#ff3b30; color:#fff; font-size:10px; font-weight:900; padding:2px 6px; border-radius:10px; min-width:14px; text-align:center; box-shadow: 2px 2px 0 var(--black); border:1.5px solid var(--black);">${displayUnread}</span>`;
            } else {
              unreadWrapper.innerHTML = '';
            }
          }

          // Prepend card to top of list container since it is active
          const container = document.getElementById('dm-contacts-list');
          if (container && container.firstChild !== card) {
            container.prepend(card);
          }
        }
      }, (err) => {
        console.warn('Real-time contact card listener error:', chatId, err);
      });

      contactsListeners.set(chatId, unsubscribe);
    }
  });

  // Clean up unused/removed contacts listeners
  for (const [chatId, unsubscribe] of contactsListeners.entries()) {
    if (!currentChatIds.has(chatId)) {
      unsubscribe();
      contactsListeners.delete(chatId);
    }
  }
}

// ── Contact List & Request List Renderers ──

async function renderContactsList(friends, forceCache = false) {
  const container = document.getElementById('dm-contacts-list');
  if (!container) return;

  const currentRenderId = ++renderContactsListId;
  const myUserId = window.userId;
  const { firebaseDb, firestore } = window;

  const friendsMap = new Map((friends || []).map(f => [String(f._id).toLowerCase(), f]));
  const activeIdsSet = new Set();
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('activeContact_')) {
      activeIdsSet.add(key.substring('activeContact_'.length).toLowerCase());
    }
  }
  
  // Also ensure all current friends are in the active set
  if (friends) {
    friends.forEach(f => activeIdsSet.add(String(f._id).toLowerCase()));
  }

  if (activeIdsSet.size === 0) {
    if (currentRenderId === renderContactsListId) {
      container.innerHTML = `
        <div style="text-align:center; padding:32px 16px; color:var(--text-muted); font-size:13px; font-weight:600; line-height:1.5;">
          No connections yet.<br>
          Search for users and add them as friends to start messaging!
        </div>
      `;
    }
    return;
  }

  const contactList = [];
  activeIdsSet.forEach(id => {
    const friend = friendsMap.get(String(id).toLowerCase());
    if (friend) {
      contactList.push({
        _id: friend._id,
        name: friend.name,
        username: friend.username,
        profilePicture: friend.profilePicture,
        currentStreak: friend.currentStreak || 0,
        isFriend: true
      });
    } else {
      let cachedDetails = null;
      try {
        const detailsStr = localStorage.getItem('contact_details_' + id);
        if (detailsStr) cachedDetails = JSON.parse(detailsStr);
      } catch (err) {
        console.warn('Failed to parse cached details for', id, err);
      }
      contactList.push({
        _id: id,
        name: cachedDetails?.name || 'Unfollowed User',
        username: cachedDetails?.username || 'unfollowed',
        profilePicture: cachedDetails?.profilePicture || '',
        currentStreak: 0,
        isFriend: false
      });
    }
  });

  const getTimestampMs = (ts) => {
    if (!ts) return Date.now();
    if (ts.seconds) return ts.seconds * 1000;
    if (typeof ts.toDate === 'function') return ts.toDate().getTime();
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === 'number') return ts;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? Date.now() : d.getTime();
  };

  const promises = contactList.map(async (f) => {
    const chatId = getChatId(myUserId, f._id);
    let lastMsgText = '';
    let unreadCount = 0;
    let displayUnread = '';
    let lastReadTime = parseInt(localStorage.getItem('lastRead_' + chatId) || '0');
    let chatDeletedAt = parseInt(localStorage.getItem('deletedAt_' + chatId) || '0');

    let loadedFromFirestore = false;

    // Only attempt Firestore reads if Firebase Auth has a signed-in user.
    // If initFirebaseChat hasn't completed yet, skip and fall through to
    // the local IndexedDB cache (handled below) — no permission-denied error.
    const isFirebaseAuthed = !!(window.firebaseAuth?.currentUser);
    if (!forceCache && navigator.onLine && firebaseDb && firestore && isFirebaseAuthed) {

      try {
        const metaRef = firestore.doc(firebaseDb, 'direct_messages', chatId, 'messages', 'metadata');
        const lastMsgQuery = firestore.query(
          firestore.collection(firebaseDb, 'direct_messages', chatId, 'messages'),
          firestore.orderBy('timestamp', 'desc'),
          firestore.limit(3)
        );

        const [metaSnap, lastMsgSnap] = await Promise.all([
          firestore.getDoc(metaRef),
          firestore.getDocs(lastMsgQuery)
        ]);

        if (metaSnap.exists()) {
          const metaData = metaSnap.data();
          chatDeletedAt = metaData?.deletedAt?.[myUserId] || 0;
          localStorage.setItem('deletedAt_' + chatId, chatDeletedAt.toString());

          // KEY FIX: Also load and sync lastRead time from Firestore metadata
          const serverLastRead = metaData?.lastRead?.[myUserId] || 0;
          if (serverLastRead > lastReadTime) {
            lastReadTime = serverLastRead;
            localStorage.setItem('lastRead_' + chatId, lastReadTime.toString());
          }
        }

        let lastMsg = null;
        if (!lastMsgSnap.empty) {
          const msgDocs = lastMsgSnap.docs.filter(doc => doc.id !== 'metadata');
          if (msgDocs.length > 0) {
            lastMsg = msgDocs[0].data();
            lastMsg.id = msgDocs[0].id;
          }
        }

        if (lastMsg) {
          loadedFromFirestore = true;
          const isSelf = String(lastMsg.senderId) === String(myUserId);
          let prefix = isSelf ? 'You: ' : '';
          if (lastMsg.mediaUrl) {
            if (lastMsg.mediaType === 'audio') {
              lastMsgText = prefix + '🎙️ Voice Message';
            } else {
              lastMsgText = prefix + '📷 Photo';
            }
          } else {
            lastMsgText = prefix + (lastMsg.text || '');
          }

          const ts = getTimestampMs(lastMsg.timestamp);

          if (!isSelf && ts > lastReadTime && ts > chatDeletedAt) {
            const unreadQuery = firestore.query(
              firestore.collection(firebaseDb, 'direct_messages', chatId, 'messages'),
              firestore.where('timestamp', '>', new Date(lastReadTime)),
              firestore.limit(11)
            );
            const unreadSnap = await firestore.getDocs(unreadQuery);
            let count = 0;
            unreadSnap.forEach(doc => {
              if (doc.id === 'metadata') return;
              const m = doc.data();
              const mTs = getTimestampMs(m.timestamp);
              if (String(m.senderId) !== String(myUserId) && mTs > chatDeletedAt) {
                count++;
              }
            });

            if (count >= 11) {
              displayUnread = '10+';
              unreadCount = 11;
            } else if (count > 0) {
              displayUnread = String(count);
              unreadCount = count;
            }
          }
        }
      } catch (err) {
        console.warn('Failed to fetch real-time DM info from Firestore for contact:', f._id, err);
      }
    }

    if (!loadedFromFirestore && window.localDb) {
      try {
        const messages = await window.localDb.directMessages
          .where('chatId').equals(chatId)
          .sortBy('timestamp');

        if (messages.length > 0) {
          const lastMsg = messages[messages.length - 1];
          const isSelf = String(lastMsg.senderId) === String(myUserId);
          let prefix = isSelf ? 'You: ' : '';

          if (lastMsg.mediaUrl) {
            if (lastMsg.mediaType === 'audio') {
              lastMsgText = prefix + '🎙️ Voice Message';
            } else {
              lastMsgText = prefix + '📷 Photo';
            }
          } else {
            lastMsgText = prefix + lastMsg.text;
          }

          let localCount = 0;
          messages.forEach(msg => {
            if (String(msg.senderId) !== String(myUserId) && msg.timestamp > lastReadTime && msg.timestamp > chatDeletedAt) {
              localCount++;
            }
          });

          if (localCount >= 11) {
            displayUnread = '10+';
            unreadCount = 11;
          } else if (localCount > 0) {
            displayUnread = String(localCount);
            unreadCount = localCount;
          }
        }
      } catch (err) {
        console.warn('Failed local DB fallback for contact:', f._id, err);
      }
    }

    return { friend: f, lastMsgText, unreadCount, displayUnread };
  });

  const results = await Promise.all(promises);

  if (currentRenderId !== renderContactsListId) {
    return;
  }

  container.innerHTML = '';
  let totalUnread = 0;

  for (const res of results) {
    const f = res.friend;
    const lastMsgText = res.lastMsgText;
    const unreadCount = res.unreadCount;
    const displayUnread = res.displayUnread;
    totalUnread += unreadCount;

    const card = document.createElement('div');
    card.className = 'dm-contact-card ripple dm-open-chat-btn';
    card.id = `dm-contact-card-${f._id}`;
    card.dataset.recipientId = f._id;
    card.dataset.recipientName = f.name;
    card.dataset.recipientPhoto = f.profilePicture || '';
    card.style.cssText = 'display:flex; align-items:center; gap:12px; padding:12px 16px; border:3px solid var(--black); border-radius:12px; background:var(--bg-card); cursor:pointer; box-shadow:4px 4px 0 var(--black); transition:all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); margin-bottom:12px;';

    card.onmouseover = () => {
      card.style.transform = 'translateY(-2px)';
      card.style.boxShadow = '6px 6px 0 var(--black)';
    };
    card.onmouseout = () => {
      card.style.transform = 'translateY(0)';
      card.style.boxShadow = '4px 4px 0 var(--black)';
    };

    const initial = f.name ? f.name.charAt(0).toUpperCase() : '?';
    const avatarHtml = f.profilePicture
      ? `<img src="${f.profilePicture}" style="width:100%; height:100%; object-fit:cover;" />`
      : `<div style="width:100%; height:100%; background:var(--yellow); color:#000; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:16px;">${initial}</div>`;

    const lastMsgHtml = lastMsgText 
      ? `<p class="dm-last-msg-text" style="margin:4px 0 0 0; font-size:12px; font-weight:600; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${window.escHtml(lastMsgText)}</p>` 
      : `<p class="dm-last-msg-text" style="margin:2px 0 0 0; font-size:11px; font-weight:600; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">@${window.escHtml(f.username)}</p>`;

    const unreadHtml = unreadCount > 0
      ? `<span class="dm-unread-badge" style="background:#ff3b30; color:#fff; font-size:10px; font-weight:900; padding:2px 6px; border-radius:10px; min-width:14px; text-align:center; box-shadow: 2px 2px 0 var(--black); border:1.5px solid var(--black);">${displayUnread}</span>`
      : '';

    let badgeHtml = '';
    if (f.isFriend) {
      badgeHtml = `
        <div style="display:flex; align-items:center; gap:4px; background:rgba(255,214,10,0.15); border:1.5px solid var(--yellow); padding:3px 8px; border-radius:20px;">
          <span style="font-size:11px; font-weight:900; color:var(--yellow);">${f.currentStreak || 0} 🔥</span>
        </div>
      `;
    } else {
      badgeHtml = `
        <div style="display:flex; align-items:center; gap:4px; background:rgba(239,68,68,0.15); border:1.5px solid var(--red); padding:3px 8px; border-radius:20px;">
          <span style="font-size:11px; font-weight:900; color:var(--red); text-transform:uppercase; font-family:'Space Grotesk',sans-serif;">Unfollowed</span>
        </div>
      `;
    }

    card.innerHTML = `
      <div style="width:48px; height:48px; border:2px solid var(--black); border-radius:50%; overflow:hidden; flex-shrink:0; background:var(--bg-muted);">
        ${avatarHtml}
      </div>
      <div style="flex:1; min-width:0; display:flex; flex-direction:column; justify-content:center;">
        <h4 style="margin:0; font-family:'Space Grotesk',sans-serif; font-weight:900; font-size:14px; text-transform:uppercase; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${window.escHtml(f.name)}</h4>
        ${lastMsgHtml}
      </div>
      <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
        <span class="dm-unread-badge-wrapper">${unreadHtml}</span>
        ${badgeHtml}
        <button class="contact-delete-btn" onclick="event.stopPropagation(); window.DM.deleteContact('${f._id}', '${window.escJs(f.name)}')" title="Remove Contact Card" style="background:var(--red); border:2.5px solid var(--black); border-radius:8px; width:32px; height:32px; display:flex; align-items:center; justify-content:center; box-shadow:2px 2px 0 var(--black); padding:0; cursor:pointer; flex-shrink:0; margin-left:4px;">
          <i data-lucide="trash-2" style="width:16px; height:16px; color:#fff;"></i>
        </button>
      </div>
    `;

    container.appendChild(card);
  }

  setupRealtimeContactsListeners(contactList);

  if (window.lucide) {
    lucide.createIcons({ root: container });
  }

  // Update notification dots if we are not on the messages page
  const activePage = document.querySelector('.page-container.active')?.id || '';
  if (activePage !== 'page-messages') {
    const mDot = document.getElementById('messages-notif-dot');
    const bDot = document.getElementById('bnav-messages-notif-dot');
    if (totalUnread > 0) {
      if (mDot) mDot.style.display = 'block';
      if (bDot) bDot.style.display = 'block';
    } else {
      const badge = document.getElementById('dm-requests-badge');
      const requestsCount = badge && badge.style.display !== 'none' ? parseInt(badge.textContent || '0') : 0;
      if (requestsCount === 0) {
        if (mDot) mDot.style.display = 'none';
        if (bDot) bDot.style.display = 'none';
      }
    }
  }
}

async function deleteContact(friendId, name) {
  if (!friendId) return;
  friendId = String(friendId).trim();

  // Check if they are an active friend (in local IndexedDB cache)
  let isActiveFriend = false;
  if (window.localDb) {
    try {
      const cachedFriend = await window.localDb.friends.get(friendId);
      isActiveFriend = !!cachedFriend;
    } catch (e) {
      console.warn('Failed to check friend cache in deleteContact:', e);
    }
  }

  if (isActiveFriend) {
    // ── ACTIVE FRIEND: unfriend via backend, then clear DM history locally ──
    if (!confirm(`Are you sure you want to unfriend ${name} and hide this conversation? This will remove them from your contacts.`)) {
      return;
    }

    try {
      // Call the real backend unfriend endpoint — this updates MongoDB AND syncs Firestore
      const res = await window.apiFetch(`${window.API}/api/friends/${friendId}`, {
        method: 'DELETE'
      });

      // Also clear the local DM cache so the chat disappears immediately
      const chatId = getChatId(window.userId, friendId);
      if (window.localDb) {
        await window.localDb.directMessages.where('chatId').equals(chatId).delete().catch(() => {});
      }
      localStorage.removeItem('activeContact_' + friendId);
      localStorage.removeItem('contact_details_' + friendId);
      localStorage.removeItem('deletedAt_' + chatId);
      localStorage.removeItem('lastRead_' + chatId);

      showToast(res?.message || `Unfriended ${name} and removed from contacts.`, 'info');
      fetchFriends();
    } catch (err) {
      console.error('Failed to unfriend contact:', err);
      showToast(err.message || 'Failed to remove contact.', 'error');
    }
  } else {
    // ── UNFOLLOWED / DELETED USER: permanently wipe local history ──
    if (!confirm(`Are you sure you want to permanently delete your entire conversation history with ${name} and remove this contact? This cannot be undone.`)) {
      return;
    }

    try {
      const chatId = getChatId(window.userId, friendId);
      const now = Date.now();
      const myUserId = String(window.userId);

      // 1. Delete locally from IndexedDB
      if (window.localDb) {
        await window.localDb.directMessages.where('chatId').equals(chatId).delete();
      }

      // 2. Set the delete timestamp in the chat metadata document in Firestore
      const { firebaseDb, firestore } = window;
      if (firebaseDb && firestore) {
        const metaRef = firestore.doc(firebaseDb, 'direct_messages', chatId, 'messages', 'metadata');
        await firestore.setDoc(metaRef, {
          deletedAt: { [myUserId]: now }
        }, { merge: true });

        // 3. Trigger hard deletion if both sides have deleted
        const metaSnap = await firestore.getDoc(metaRef);
        if (metaSnap.exists()) {
          const metaData = metaSnap.data();
          const deletedAt = metaData.deletedAt || {};

          const userIds = chatId.split('_');
          const user1 = userIds[0];
          const user2 = userIds[1];

          if (deletedAt[user1] && deletedAt[user2]) {
            const cutoff = Math.min(deletedAt[user1], deletedAt[user2]);
            const msgsRef = firestore.collection(firebaseDb, 'direct_messages', chatId, 'messages');
            const q = firestore.query(msgsRef, firestore.where('timestamp', '<=', new Date(cutoff)));
            const snap = await firestore.getDocs(q);

            if (!snap.empty) {
              const mediaUrls = [];
              const deletePromises = [];

              snap.docs.forEach(doc => {
                if (doc.id === 'metadata') return;
                const msgData = doc.data();
                if (msgData.mediaUrl) mediaUrls.push(msgData.mediaUrl);
                deletePromises.push(firestore.deleteDoc(doc.ref));
              });

              if (mediaUrls.length > 0) {
                await window.apiFetch(`${window.API}/api/auth/chat-media`, {
                  method: 'DELETE',
                  body: JSON.stringify({ urls: mediaUrls })
                }).catch(e => console.warn('Cloudinary DM media deletion failed:', e));
              }

              await Promise.all(deletePromises);
              console.log(`Hard-deleted ${snap.size} messages and their Cloudinary media.`);
            }
          }
        }
      }

      // 4. Remove local storage keys
      localStorage.removeItem('activeContact_' + friendId);
      localStorage.removeItem('contact_details_' + friendId);
      localStorage.removeItem('deletedAt_' + chatId);
      localStorage.removeItem('lastRead_' + chatId);

      showToast(`Permanently deleted chat with ${name}.`, 'success');
      fetchFriends();
    } catch (err) {
      console.error('Failed to permanently delete unfollowed contact:', err);
      showToast('Error deleting chat.', 'error');
    }
  }
}

function renderFriendRequestsList(requests) {
  const container = document.getElementById('dm-requests-list');
  if (!container) return;

  container.innerHTML = '';
  // Update request count badge if present
  const badge = document.getElementById('dm-requests-badge');
  if (badge) {
    if (requests.length > 0) {
      badge.textContent = requests.length;
      badge.style.display = 'inline-flex';
      
      // Light up messages nav dots if not on messages page
      const activePage = document.querySelector('.page-container.active')?.id || '';
      if (activePage !== 'page-messages') {
        const mDot = document.getElementById('messages-notif-dot');
        const bDot = document.getElementById('bnav-messages-notif-dot');
        if (mDot) mDot.style.display = 'block';
        if (bDot) bDot.style.display = 'block';
      }
    } else {
      badge.style.display = 'none';
    }
  }

  if (!requests || requests.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:32px 16px; color:var(--text-muted); font-size:13px; font-weight:600;">
        No pending friend requests.
      </div>
    `;
    return;
  }

  requests.forEach(r => {
    const card = document.createElement('div');
    card.style.cssText = 'display:flex; align-items:center; gap:12px; padding:12px 16px; border:3px solid var(--black); border-radius:12px; background:var(--bg-card); box-shadow:4px 4px 0 var(--black); margin-bottom:12px;';

    const initial = r.name ? r.name.charAt(0).toUpperCase() : '?';
    const avatarHtml = r.profilePicture
      ? `<img src="${r.profilePicture}" style="width:100%; height:100%; object-fit:cover;" />`
      : `<div style="width:100%; height:100%; background:var(--yellow); color:#000; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:16px;">${initial}</div>`;

    card.innerHTML = `
      <div onclick="window.openQuickView('${window.escJs(r.username)}')" style="width:40px; height:40px; border:2px solid var(--black); border-radius:50%; overflow:hidden; flex-shrink:0; background:var(--bg-muted); cursor:pointer;" title="View Profile">
        ${avatarHtml}
      </div>
      <div onclick="window.openQuickView('${window.escJs(r.username)}')" style="flex:1; min-width:0; cursor:pointer;" title="View Profile">
        <h4 style="margin:0; font-family:'Space Grotesk',sans-serif; font-weight:900; font-size:13px; text-transform:uppercase; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${window.escHtml(r.name)}</h4>
        <p style="margin:2px 0 0 0; font-size:10px; font-weight:600; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">@${window.escHtml(r.username)}</p>
      </div>
      <div style="display:flex; gap:6px; flex-shrink:0;">
        <button onclick="window.DM.acceptFriendRequest('${r._id}', '${window.escJs(r.username)}')" style="background:var(--green); color:#000; border:2px solid var(--black); border-radius:6px; width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:2px 2px 0 var(--black);" title="Accept"><i data-lucide="check" style="width:14px; height:14px;"></i></button>
        <button onclick="window.DM.declineFriendRequest('${r._id}', '${window.escJs(r.username)}')" style="background:var(--red); color:#fff; border:2px solid var(--black); border-radius:6px; width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:2px 2px 0 var(--black);" title="Decline"><i data-lucide="x" style="width:14px; height:14px;"></i></button>
      </div>
    `;

    container.appendChild(card);
  });

  if (window.lucide) lucide.createIcons({ root: container });
}

// Helper: scroll container to bottom
function scrollToBottom(containerId) {
  const container = document.getElementById(containerId);
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

// Helper: convert date to friendly label
function getFriendlyDate(date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  }
}

function toggleDMPlusMenu() {
  const menu = document.getElementById('dm-chat-plus-menu');
  const icon = document.getElementById('dm-plus-icon');
  if (!menu || !icon) return;
  if (menu.style.display === 'flex') {
    menu.style.display = 'none';
    icon.style.transform = 'rotate(0deg)';
  } else {
    menu.style.display = 'flex';
    icon.style.transform = 'rotate(45deg)';
  }
}
window.toggleDMPlusMenu = toggleDMPlusMenu;

// Close menu if clicking outside
document.addEventListener('click', (e) => {
  const menu = document.getElementById('dm-chat-plus-menu');
  const btn = document.getElementById('dm-chat-attach-btn');
  if (menu && menu.style.display === 'flex' && !menu.contains(e.target) && !btn.contains(e.target)) {
    toggleDMPlusMenu();
  }
});

function switchMessagesTab(tab) {
  const btnChats = document.getElementById('btn-tab-chats');
  const btnRequests = document.getElementById('btn-tab-requests');
  if (btnChats) {
    if (tab === 'chats') {
      btnChats.classList.add('active');
      btnChats.classList.remove('btn-ghost');
      btnChats.style.background = 'var(--yellow)';
      btnChats.style.color = '#000';
    } else {
      btnChats.classList.remove('active');
      btnChats.classList.add('btn-ghost');
      btnChats.style.background = '';
      btnChats.style.color = '';
    }
  }
  if (btnRequests) {
    if (tab === 'requests') {
      btnRequests.classList.add('active');
      btnRequests.classList.remove('btn-ghost');
      btnRequests.style.background = 'var(--yellow)';
      btnRequests.style.color = '#000';
    } else {
      btnRequests.classList.remove('active');
      btnRequests.classList.add('btn-ghost');
      btnRequests.style.background = '';
      btnRequests.style.color = '';
    }
  }

  const contentChats = document.getElementById('tab-content-chats');
  const contentRequests = document.getElementById('tab-content-requests');
  if (contentChats) contentChats.style.display = (tab === 'chats' ? 'block' : 'none');
  if (contentRequests) contentRequests.style.display = (tab === 'requests' ? 'block' : 'none');

  if (tab === 'requests') {
    fetchFriendRequests();
  } else {
    fetchFriends();
  }
}
window.switchMessagesTab = switchMessagesTab;

let dmSearchTimeout = null;

function filterDMContacts(val) {
  const query = val.toLowerCase().trim();
  const contacts = document.querySelectorAll('#dm-contacts-list .dm-contact-card');
  contacts.forEach(card => {
    const name = card.querySelector('h4').textContent.toLowerCase();
    const username = card.querySelector('p').textContent.toLowerCase();
    if (name.includes(query) || username.includes(query)) {
      card.style.display = 'flex';
    } else {
      card.style.display = 'none';
    }
  });

  const globalSection = document.getElementById('dm-global-search-results-section');
  const globalList = document.getElementById('dm-global-search-results');
  if (!globalSection || !globalList) return;

  if (dmSearchTimeout) {
    clearTimeout(dmSearchTimeout);
    dmSearchTimeout = null;
  }

  if (query.length < 2) {
    globalSection.style.display = 'none';
    globalList.innerHTML = '';
    return;
  }

  dmSearchTimeout = setTimeout(async () => {
    try {
      const data = await window.apiFetch(`${window.API}/api/users/search?q=${encodeURIComponent(query)}`);
      if (!data || data.length === 0) {
        globalList.innerHTML = `
          <div style="text-align:center; padding:16px; color:var(--text-muted); font-size:12px; font-weight:600;">
            No users found matching "${window.escHtml(val)}".
          </div>
        `;
        globalSection.style.display = 'block';
        return;
      }

      const myUsername = localStorage.getItem('userUsername') || '';
      let friendsList = [];
      try {
        if (window.localDb && window.localDb.friends) {
          const cachedFriends = await window.localDb.friends.toArray();
          friendsList = cachedFriends.map(f => String(f._id));
        }
      } catch (e) {
        console.warn('Failed to load friends for filter:', e);
      }

      const filtered = data.filter(u => u.username !== myUsername && !friendsList.includes(String(u._id)));

      if (filtered.length === 0) {
        globalList.innerHTML = `
          <div style="text-align:center; padding:16px; color:var(--text-muted); font-size:12px; font-weight:600;">
            No new users found (already connected or self).
          </div>
        `;
        globalSection.style.display = 'block';
        return;
      }

      globalList.innerHTML = '';
      filtered.forEach(u => {
        const card = document.createElement('div');
        card.className = 'dm-global-search-card ripple';
        card.style.cssText = 'display:flex; align-items:center; gap:12px; padding:12px 16px; border:3px solid var(--black); border-radius:12px; background:var(--bg-card); cursor:pointer; box-shadow:4px 4px 0 var(--black); transition:all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);';
        card.onclick = () => {
          if (typeof window.openQuickView === 'function') {
            window.openQuickView(u.username);
          }
        };

        card.onmouseover = () => {
          card.style.transform = 'translateY(-2px)';
          card.style.boxShadow = '6px 6px 0 var(--black)';
        };
        card.onmouseout = () => {
          card.style.transform = 'translateY(0)';
          card.style.boxShadow = '4px 4px 0 var(--black)';
        };

        const initial = u.username ? u.username.charAt(0).toUpperCase() : '?';
        const avatarHtml = u.profilePicture
          ? `<img src="${u.profilePicture}" style="width:100%; height:100%; object-fit:cover;" />`
          : `<div style="width:100%; height:100%; background:var(--purple); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:16px;">${initial}</div>`;

        card.innerHTML = `
          <div style="width:40px; height:40px; border:2px solid var(--black); border-radius:50%; overflow:hidden; flex-shrink:0; background:var(--bg-muted);">
            ${avatarHtml}
          </div>
          <div style="flex:1; min-width:0;">
            <h4 style="margin:0; font-family:'Space Grotesk',sans-serif; font-weight:900; font-size:13px; text-transform:uppercase; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">@${window.escHtml(u.username)}</h4>
            <p style="margin:2px 0 0 0; font-size:11px; font-weight:600; color:var(--text-muted);">Click to view profile</p>
          </div>
          <div style="display:flex; align-items:center; gap:4px; flex-shrink:0; background:rgba(168,85,247,0.15); border:1.5px solid var(--purple); padding:3px 8px; border-radius:20px;">
            <span style="font-size:11px; font-weight:900; color:var(--purple);">${u.currentStreak || 0} 🔥</span>
          </div>
        `;
        globalList.appendChild(card);
      });

      globalSection.style.display = 'block';
      if (window.lucide) lucide.createIcons({ root: globalSection });
    } catch (err) {
      console.error('Failed to fetch global search results:', err);
    }
  }, 500);
}
window.filterDMContacts = filterDMContacts;

// ── Bindings ──

window.DM = {
  get activeChatRecipientId() { return activeChatRecipientId; },
  fetchFriends,
  fetchFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
  unfriendActiveUser,
  followActiveUser,
  deleteContact,
  openDMChat,
  closeDMChat,
  sendDMMessage,
  startEditDMMessage,
  cancelEditDMMessage,
  saveEditDMMessage,
  deleteDMMessage,
  toggleDMReactionPicker,
  toggleDMReaction,
  setDMReplyTo,
  clearDMReply,
  scrollToDMMessage,
  clearDMChatHistory,
  downloadDMAudio,
  handleDMFileSelect,
  startDMVoiceRecord,
  stopDMVoiceRecord,
  cancelDMVoiceRecord,
  triggerDMCameraCapture
};

console.log("[Module] dm.js loaded and direct messaging functions bound to window.DM");

// ── DM Input: Enter sends, Shift+Enter = newline, auto-resize ──
document.addEventListener('DOMContentLoaded', () => {
  const dmInput = document.getElementById('dm-chat-input');
  if (!dmInput) return;

  dmInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.isAndroidNative;
      if (!isMobile) {
        if (e.shiftKey) {
          // Shift+Enter: allow default (insert newline)
          return;
        } else {
          // Plain Enter: send message
          e.preventDefault();
          window.DM.sendDMMessage();
        }
      }
    }
  });

  dmInput.addEventListener('input', () => {
    dmInput.style.height = '48px';
    dmInput.style.height = Math.min(dmInput.scrollHeight, 150) + 'px';
  });
});

// Delegated click handler for DM Chat cards (avoids event conflicts and matches group chat logic)
document.addEventListener('click', function(e) {
  const card = e.target.closest('.dm-open-chat-btn');
  if (!card) return;
  // If clicking on delete button or inside it, ignore opening the chat
  if (e.target.closest('.contact-delete-btn')) return;
  
  const recipientId = card.dataset.recipientId;
  const recipientName = card.dataset.recipientName;
  const recipientPhoto = card.dataset.recipientPhoto || '';
  
  console.log(`[DM] Delegated click triggered openDMChat for recipientId: ${recipientId}`);
  openDMChat(recipientId, recipientName, recipientPhoto);
});
