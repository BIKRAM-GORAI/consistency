// ── Chat Module ───────────────────────────────────────────
console.log("[Module] chat.js initializing...");

// Local toast reference delegation to bypass strict module scope reference errors
const showToast = (...args) => window.showToast(...args);

// ── GROUP CHAT LOGIC ────────────────────────────────────────

let activeChatGroupId = null;
let chatUnsubscribe = null;
let videoCallUnsubscribe = null;
let activeCallParticipants = {};
let jitsiApi = null;
let chatMessagesLimit = 30;
let activeReplyTo = null;
let isPaginating = false;
let prevScrollHeight = 0;
let selectedMediaBlobs = []; // Array of { blob, type }
let imageLimitRemaining = 20; 
let audioLimitRemaining = 20; // recordings
let audioFileLimitRemaining = 5; // manual uploads
let imageLimitMax = 20;
let audioLimitMax = 20;
let audioFileLimitMax = 5;
let lastMessageSentAt = 0; // For anti-spam cooldown
let isChatSending = false;

// --- VOICE MESSAGE STATE ---
let mediaRecorder = null;
let audioChunks = [];
let recordingInterval = null;
let recordingStartTime = 0;
let isRecording = false;

// --- READ RECEIPTS STATE ---
let memberReadStatuses = {}; // { userId: timestamp }
let chatReadThresholdPct = 10; // Default threshold for blue ticks

async function fetchMediaLimit() {
  try {
    const res = await apiFetch(`${window.API}/api/auth/media-upload-limit`);
    imageLimitRemaining = res.imageRemaining;
    audioLimitRemaining = res.audioRemaining;
    audioFileLimitRemaining = (res.audioFileRemaining !== undefined) ? res.audioFileRemaining : 5;
    
    imageLimitMax = res.imageLimit || 20;
    audioLimitMax = res.audioLimit || 20;
    audioFileLimitMax = (res.audioFileLimit !== undefined) ? res.audioFileLimit : 5;
    
    updateMediaLimitDisplay();
  } catch (err) {
    console.error('Failed to fetch media limit:', err);
  }
}

function updateMediaLimitDisplay() {
  const el = document.getElementById('media-limit-text');
  if (!el) return;
  
  const imgStr = imageLimitRemaining <= 0 ? '<span style="color:var(--red)">Images: 0</span>' : `Images: ${imageLimitRemaining}/${imageLimitMax}`;
  const recStr = audioLimitRemaining <= 0 ? '<span style="color:var(--red)">Voice: 0</span>' : `Voice: ${audioLimitRemaining}/${audioLimitMax}`;
  const fileStr = audioFileLimitRemaining <= 0 ? '<span style="color:var(--red)">Audio Files: 0</span>' : `Audio Files: ${audioFileLimitRemaining}/${audioFileLimitMax}`;
  
  el.innerHTML = `${imgStr} • ${recStr} • ${fileStr}`;
}
let lastReadUpdate = 0;
let myHighestReadTimestamp = 0;
let readStatusUnsubscribe = null;
let readObserver = null;
let presenceUnsubscribe = null;
let presenceHeartbeatInterval = null;

function openGroupChat(groupId, groupName, groupIcon, resetLimit = true) {
  console.log(`[Chat] openGroupChat called for groupId: ${groupId}`);
  const modal = document.getElementById('modal-group-chat');
  
  // Exit early if the group chat modal is already open for this group
  if (modal && modal.classList.contains('open') && activeChatGroupId === groupId) {
    console.log(`[Chat] Group chat is already open for ${groupId}. Ignoring call.`);
    return;
  }

  activeChatGroupId = groupId;
  if (resetLimit) chatMessagesLimit = 30; 
  document.getElementById('chat-group-name').textContent = groupName;
  
  openModal('modal-group-chat');
  fetchMediaLimit();

  // Check if current user is the owner of this group
  const group = (typeof window.allJoinedGroups !== 'undefined' && window.allJoinedGroups) 
    ? window.allJoinedGroups.find(g => g._id === groupId) 
    : null;
  const myUserId = window.userId;
  
  // The group.owner can be an object with _id or just an ID string
  const isOwner = group && group.owner && String(group.owner._id || group.owner) === String(myUserId);
  
  const bulkDeleteBtn = document.getElementById('chat-bulk-delete-btn');
  if (bulkDeleteBtn) {
    bulkDeleteBtn.style.display = isOwner ? 'flex' : 'none';
  }
  // Re-initialize all icons in the modal (Fixes missing Close/Send icons)
  if (window.lucide) lucide.createIcons({ root: modal });

  const iconWrap = document.getElementById('chat-group-icon-wrap');
  iconWrap.innerHTML = groupIcon 
    ? `<img src="${groupIcon}" onerror="this.onerror=null; this.src='/checklist.png'; this.style.padding='4px'; this.style.background='var(--yellow)';" style="width:100%;height:100%;object-fit:cover;" />`
    : `<i data-lucide="users" style="width:24px;height:24px;color:var(--black);"></i>`;
  if (window.lucide) lucide.createIcons({ root: iconWrap });

  // Clear previous messages and show loading in the list container
  const msgsList = document.getElementById('chat-messages-list');
  if (msgsList) {
    msgsList.innerHTML = '<div style="text-align:center; padding:40px; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; animation: pulse 1.5s infinite;">Connecting to stream...</div>';
  }

  // Set up real-time listener
  const { firebaseDb, firestore } = window;
  if (!firebaseDb || !firestore) {
    if (msgsList) {
      msgsList.innerHTML = '<div style="text-align:center; padding:20px; color:var(--red); font-weight:900;">FIREBASE OFFLINE</div>';
    }
    return;
  }

  // Real-time Presence
  updatePresence(groupId, true);
  subscribeToPresence(groupId);

  // Subscribe to read receipts
  subscribeToReadStatuses(groupId);

  const msgsRef = firestore.collection(firebaseDb, 'group_chats', groupId, 'messages');
  const q = firestore.query(msgsRef, firestore.orderBy('timestamp', 'desc'), firestore.limit(chatMessagesLimit));

  // Set up infinite scroll observer if not already done
  setupChatInfiniteScroll();

  chatUnsubscribe = firestore.onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
    const container = document.getElementById('chat-messages-container');
    const msgsList = document.getElementById('chat-messages-list');
    const loadMoreBtn = document.getElementById('chat-load-more-container');
    
    if (!msgsList || !container) return;

    if (snapshot.empty) {
      msgsList.innerHTML = `
        <div id="chat-empty-state" style="text-align:center; padding:60px 20px; color:var(--text-light);">
          <div style="font-size:40px; margin-bottom:16px;">💬</div>
          <h3 style="font-family:'Space Grotesk', sans-serif; font-weight:900; text-transform:uppercase;">No messages yet</h3>
          <p style="font-size:13px; font-weight:600; opacity:0.7;">Be the first to break the ice!</p>
        </div>
      `;
      loadMoreBtn.style.display = 'none';
      return;
    }

    // Remove empty state if it exists
    const emptyState = document.getElementById('chat-empty-state');
    if (emptyState) emptyState.remove();
    if (msgsList.querySelector('.pulse')) msgsList.innerHTML = '';

    loadMoreBtn.style.display = snapshot.size >= chatMessagesLimit ? 'block' : 'none';

    // We still need to maintain order, especially when loading older messages.
    // However, for real-time updates (new messages), we want to append without wiping.
    
    const isInitialLoad = msgsList.children.length <= 1; // Only load-more btn or empty
    const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

    // To handle pagination correctly (where older messages are added at the TOP), 
    // we'll clear and re-render ONLY if the snapshot size changed significantly (pagination).
    // Otherwise, we update incrementally.
    
    const docs = [...snapshot.docs].reverse();
    const currentRenderedIds = new Set([...msgsList.querySelectorAll('.chat-bubble-wrapper')].map(el => el.id.replace('chat-msg-', '')));

    if (docs.length > currentRenderedIds.size + 1) {
      msgsList.innerHTML = '';
      let lastDateLabel = '';
      docs.forEach(doc => {
        const msg = { ...doc.data(), id: doc.id };
        const timestamp = msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date();
        const dateLabel = timestamp.toLocaleDateString();
        if (dateLabel !== lastDateLabel) {
          const sep = document.createElement('div');
          sep.className = 'chat-date-separator';
          sep.textContent = getFriendlyDate(timestamp);
          msgsList.appendChild(sep);
          lastDateLabel = dateLabel;
        }
        renderChatMessage(msg, msgsList, false, doc.metadata.hasPendingWrites);
      });
      
      // If we were paginating, maintain scroll position accurately
      if (isPaginating) {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight - prevScrollHeight;
          isPaginating = false;
        });
      }
    } else {
      // Incremental update
      snapshot.docChanges().forEach(change => {
        const msg = { ...change.doc.data(), id: change.doc.id };
        const isPending = change.doc.metadata.hasPendingWrites;
        const existing = document.getElementById(`chat-msg-${msg.id}`);
        
        if (change.type === 'added' && !existing) {
          renderChatMessage(msg, msgsList, true, isPending);
        } else if (change.type === 'modified' && existing) {
          // Update the existing message if it's no longer pending or has changed
          updateMessageInDOM(msg, isPending);
          updateExistingMessage(msg, existing);
        } else if (change.type === 'removed' && existing) {
          existing.remove();
        }
      });
    }

    if (!isPaginating && (isInitialLoad || wasAtBottom)) {
      container.scrollTop = container.scrollHeight;
    }
  }, (err) => {
    console.error('🔥 Firestore Messages Error:', err.code, err.message);
    const msgsList = document.getElementById('chat-messages-list');
    if (msgsList) {
      msgsList.innerHTML = `<div style="text-align:center; padding:20px; color:var(--red); font-weight:900;">CONNECTION ERROR: ${err.code}</div>`;
    }
  });

  // Start listening for typing indicators
  listenForTyping();

  // Start listening for active video call participants
  subscribeToActiveVideoCall(groupId);
}

function subscribeToActiveVideoCall(groupId) {
  if (typeof videoCallUnsubscribe === 'function') {
    videoCallUnsubscribe();
    videoCallUnsubscribe = null;
  }

  const { firebaseRtdb, rtdb } = window;
  if (!firebaseRtdb || !rtdb) return;
  const callRef = rtdb.ref(firebaseRtdb, `video_calls/${groupId}/participants`);
  
  videoCallUnsubscribe = rtdb.onValue(callRef, (snapshot) => {
    const participants = snapshot.val() || {};
    updateVideoCallUI(participants);
  });
}

function updateVideoCallUI(participants) {
  activeCallParticipants = participants || {};
  const pList = Object.values(activeCallParticipants);
  
  const indicator = document.getElementById('video-call-indicator');
  const banner = document.getElementById('active-video-call-banner');
  const bannerAvatars = document.getElementById('banner-participants');
  const bannerText = document.getElementById('banner-status-text');

  if (!indicator || !banner) return;

  if (pList.length > 0) {
    indicator.style.display = 'block';
    banner.style.display = 'flex';
    if (bannerText) bannerText.textContent = `${pList.length} member${pList.length === 1 ? '' : 's'} currently in call`;
    
    // Render overlapping avatars for the banner only
    let html = '';
    pList.slice(0, 3).forEach(p => {
      const name = p.name || 'Member';
      if (p.photo && p.photo !== 'null' && p.photo !== 'undefined') {
        html += `<div class="participant-avatar" title="${escHtml(name)}"><img src="${p.photo}" /></div>`;
      } else {
        const initial = name.charAt(0).toUpperCase();
        html += `<div class="participant-avatar" title="${escHtml(name)}">${initial}</div>`;
      }
    });
    
    if (pList.length > 3) {
      html += `<div class="participant-avatar" style="font-size: 8px;">+${pList.length - 3}</div>`;
    }
    
    if (bannerAvatars) bannerAvatars.innerHTML = html;
  } else {
    indicator.style.display = 'none';
    banner.style.display = 'none';
    if (bannerAvatars) bannerAvatars.innerHTML = '';
  }
}

function loadMoreChatMessages() {
  const btn = document.getElementById('btn-chat-load-more');
  if (btn) btn.disabled = true; // Prevent double loading

  const container = document.getElementById('chat-messages-container');
  prevScrollHeight = container.scrollHeight;
  isPaginating = true;
  chatMessagesLimit += 30;
  const groupName = document.getElementById('chat-group-name').textContent;
  const groupIconWrap = document.getElementById('chat-group-icon-wrap');
  const groupIcon = groupIconWrap.querySelector('img')?.src || '';
  
  // Re-open chat with new limit, but keep the current limit
  openGroupChat(activeChatGroupId, groupName, groupIcon, false);
}

function getFriendlyDate(date) {
  const today = new Date().toLocaleDateString();
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString();
  const d = date.toLocaleDateString();
  if (d === today) return 'Today';
  if (d === yesterday) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function renderChatMessage(msg, container, animate = false, isPending = false) {
  const userId = window.userId;
  const isSelf = String(msg.senderId) === String(window.userId);
  const timestamp = msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date();
  const time = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const docId = msg.id || '';

  const wrapper = document.createElement('div');
  wrapper.className = `chat-bubble-wrapper ${isSelf ? 'self' : 'other'}`;
  wrapper.id = `chat-msg-${docId}`;
  wrapper.dataset.ts = timestamp.getTime().toString();

  const isPremiumSender = msg.senderIsPremium === true;

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${isSelf ? 'self' : 'other'} ${isPremiumSender ? 'premium' : ''}`;
  
  // Calculate Blue Tick status based on threshold percentage
  let isBlue = false;
  if (isSelf) {
    const tsMillis = timestamp.getTime();
    const group = (typeof window.allJoinedGroups !== 'undefined' && window.allJoinedGroups) ? window.allJoinedGroups.find(g => g._id === activeChatGroupId) : null;
    const totalOthers = group ? Math.max(1, group.members.length - 1) : 1;
    const readCount = Object.values(memberReadStatuses).filter(lr => lr >= tsMillis).length;
    isBlue = (readCount / totalOthers) * 100 >= (window.globalConfig.chatReadThresholdPct || 10);
  }
  
  // Check if editable (15 mins)
  const isEditable = isSelf && (Date.now() - timestamp.getTime() < 15 * 60 * 1000);
  const editBtn = isEditable ? `<button class="chat-edit-btn" onclick="startEditChatMessage('${docId}', '${escJs(msg.text)}')"><i data-lucide="pencil" style="width:12px;height:12px;"></i></button>` : '';

  // Avatar HTML with clickable link to profile
  let avatarHtml = '';
  const senderUsername = msg.senderUsername || '';
  
  // If we don't have a username (old message), we'll try to use a fallback helper
  const onclickHtml = senderUsername 
    ? `onclick="openQuickView('${escJs(senderUsername)}'); event.stopPropagation();"` 
    : `onclick="openQuickViewByMemberId('${msg.senderId}', '${escJs(msg.senderName)}'); event.stopPropagation();"`;
  
  const clickableStyle = 'cursor: pointer;'; // Always clickable now
  const glowClass = isPremiumSender ? 'premium-glow' : '';

  if (msg.senderPhoto) {
    avatarHtml = `<div class="chat-avatar ${glowClass}" style="margin-right: 8px; ${clickableStyle}" ${onclickHtml}><img src="${msg.senderPhoto}" alt="${escHtml(msg.senderName)}" /></div>`;
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
    
    const formatSecs = (seconds) => {
      if (!seconds) return '';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    const durationText = msg.replyTo.audioDuration ? (window.formatDuration ? window.formatDuration(msg.replyTo.audioDuration) : formatSecs(msg.replyTo.audioDuration)) : '';
    const voiceLabel = durationText ? `Voice Message (${durationText})` : 'Voice Message';
    
    replySnippetHtml = `
      <div class="chat-reply-snippet" onclick="scrollToMessage('${msg.replyTo.docId}')">
        ${msg.replyTo.mediaUrl ? (isAudioReply ? `
          <div class="chat-reply-thumbnail" style="display:flex;align-items:center;justify-content:center;background:var(--purple);border:2px solid var(--black);border-radius:50%;width:32px;height:32px;flex-shrink:0;box-sizing:border-box;">
            <i data-lucide="mic" style="width:14px;height:14px;color:#fff;"></i>
          </div>
        ` : `
          <img data-src="${msg.replyTo.mediaUrl}" class="chat-reply-thumbnail lazy-media" />
        `) : ''}
        <div style="flex:1; min-width:0;">
          <span class="chat-reply-sender">${escHtml(msg.replyTo.senderName)}</span>
          <div class="chat-reply-text">${escHtml(msg.replyTo.text || (isAudioReply ? voiceLabel : (msg.replyTo.mediaUrl ? 'Photo' : '')))}</div>
        </div>
      </div>
    `;
  }

  // Reactions HTML
  const reactionsHtml = renderReactionsHTML(msg.reactions, docId);

  // Buttons Row (Outside) - Permanently visible for mobile friendliness
  const buttonsHtml = `
    <div class="chat-message-actions-outside" style="display: flex; flex-direction: column; gap: 4px; justify-content: center; align-self: center; margin: 0 12px; transition: opacity 0.2s;">
      <button class="chat-edit-btn" onclick="toggleReactionPicker(event, '${docId}')" title="React"><i data-lucide="smile" style="width:16px;height:16px;"></i></button>
      <button class="chat-edit-btn" onclick="setReplyTo('${docId}', '${escJs(msg.text)}', '${escJs(msg.senderName)}', '${msg.mediaUrl || ''}', '${msg.mediaType || ''}', ${msg.audioDuration || 0})" title="Reply"><i data-lucide="reply" style="width:16px;height:16px;"></i></button>
      ${editBtn ? `
        <button class="chat-edit-btn" onclick="startEditChatMessage('${docId}', '${escJs(msg.text)}')" title="Edit"><i data-lucide="pencil" style="width:16px;height:16px;"></i></button>
        <button class="chat-edit-btn" onclick="deleteChatMessage('${docId}')" title="Delete" style="color:var(--red);"><i data-lucide="trash-2" style="width:16px;height:16px;"></i></button>
      ` : ''}
    </div>
  `;

  bubble.innerHTML = `
    <div class="chat-message-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
      <div style="display: flex; align-items: center; gap: 4px; ${clickableStyle}" ${onclickHtml}>
        ${avatarHtml}
        <span class="chat-sender-name">${isSelf ? 'YOU' : escHtml(msg.senderName)}</span>
      </div>
    </div>
    ${replySnippetHtml}
    ${msg.mediaUrl ? `
      ${msg.mediaType === 'audio' ? `
        <div class="chat-audio-player" id="audio-player-${docId}">
          <button class="btn-audio-download ripple" id="audio-btn-${docId}" onclick="downloadAudio('${docId}', '${msg.mediaUrl}')">
            <i data-lucide="download" style="width: 20px; height: 20px;"></i>
          </button>
          <div class="audio-info">
            <div class="audio-duration" id="audio-duration-${docId}">${msg.audioDuration ? formatDuration(msg.audioDuration) : 'Voice Message'}</div>
            <div class="audio-progress-container">
              <div class="audio-progress-bar" id="audio-progress-${docId}"></div>
            </div>
          </div>
        </div>
      ` : `
        <div class="chat-media-content" onclick="openLightbox('${msg.mediaUrl}')">
          ${msg.mediaType === 'video' 
            ? `<video data-src="${msg.mediaUrl}" autoplay muted loop playsinline class="lazy-media"></video>` 
            : `<img data-src="${msg.mediaUrl}" class="lazy-media" />`}
        </div>
      `}
    ` : ''}
    <div class="chat-text" id="chat-text-${docId}" style="margin-top: 4px;">${window.linkify(escHtml(msg.text))}</div>
    ${reactionsHtml}
    <div class="chat-message-footer">
      ${msg.edited ? '<span class="chat-edited-tag">Edited</span>' : ''}
      <span class="chat-time">${time}</span>
      ${isSelf ? `
        <span class="chat-tick ${isBlue ? 'blue' : ''} ${isPending ? 'pending' : ''}" id="tick-${docId}">
          <i data-lucide="${isPending ? 'clock' : 'check-check'}" style="width:14px;height:14px;"></i>
        </span>
      ` : ''}
    </div>
  `;
  if (window.lucide) lucide.createIcons({ root: bubble });
  
  const actionsEl = buttonsHtmlToElement(buttonsHtml);
  if (window.lucide) lucide.createIcons({ root: actionsEl });

  if (isSelf) {
    wrapper.appendChild(actionsEl);
    wrapper.appendChild(bubble);
  } else {
    wrapper.appendChild(bubble);
    wrapper.appendChild(actionsEl);
  }
  
  insertMessageSorted(container, wrapper);
  
  // Initialize Lazy Loading and Read Tracker for the new elements
  initLazyLoading();
  initReadTracker();
  initSwipeToReply(wrapper, bubble, isSelf, msg);

  // Proactively check and cache audio
  if (msg.mediaType === 'audio' && msg.mediaUrl) {
    checkAudioCache(docId, msg.mediaUrl);
  }
}

/** ── CHRONOLOGICAL MESSAGE INSERTION ── **/
function insertMessageSorted(container, wrapper) {
  const ts = parseInt(wrapper.dataset.ts);
  const children = Array.from(container.children).filter(el => el.classList.contains('chat-bubble-wrapper'));
  
  let inserted = false;
  for (const child of children) {
    const childTs = parseInt(child.dataset.ts);
    if (ts < childTs) {
      container.insertBefore(wrapper, child);
      inserted = true;
      break;
    }
  }
  
  if (!inserted) {
    container.appendChild(wrapper);
  }
}

function initSwipeToReply(wrapper, bubble, isSelf, msg) {
  let touchStartX = 0;
  let touchMoveX = 0;
  let isSwiping = false;

  bubble.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchMoveX = touchStartX;
    bubble.style.transition = 'none';
    isSwiping = false;
  }, { passive: true });

  bubble.addEventListener('touchmove', (e) => {
    touchMoveX = e.touches[0].clientX;
    const diff = touchMoveX - touchStartX;
    
    // Check if it's a horizontal swipe
    if (Math.abs(diff) > 10) isSwiping = true;

    if (isSwiping) {
      // Swipe Right for 'other', Swipe Left for 'self'
      if (!isSelf && diff > 0) {
        const move = Math.min(diff, 70);
        bubble.style.transform = `translateX(${move}px)`;
      } else if (isSelf && diff < 0) {
        const move = Math.max(diff, -70);
        bubble.style.transform = `translateX(${move}px)`;
      }
    }
  }, { passive: true });

  bubble.addEventListener('touchend', () => {
    if (isSwiping) {
      const diff = touchMoveX - touchStartX;
      bubble.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      bubble.style.transform = 'translateX(0)';
      
      // Threshold to trigger reply
      if (Math.abs(diff) > 50) {
        setReplyTo(msg.id, msg.text || '', msg.senderName, msg.mediaUrl || '', msg.mediaType || '', msg.audioDuration || 0);
        if (window.navigator.vibrate) window.navigator.vibrate(15);
      }
    }
    isSwiping = false;
  });

  if (window.lucide) lucide.createIcons({ root: wrapper });
}

function buttonsHtmlToElement(html) {
  const div = document.createElement('div');
  div.innerHTML = html.trim();
  return div.firstChild;
}

function closeChatModal() {
  if (chatUnsubscribe) {
    chatUnsubscribe();
    chatUnsubscribe = null;
  }
  if (typingUnsubscribe) {
    typingUnsubscribe();
    typingUnsubscribe = null;
  }
  // Stop listening for read receipts
  if (readStatusUnsubscribe) {
    readStatusUnsubscribe();
    readStatusUnsubscribe = null;
  }
  if (readObserver) {
    readObserver.disconnect();
    readObserver = null;
  }
  memberReadStatuses = {};
  myHighestReadTimestamp = 0;
  
  // Stop presence
  updatePresence(activeChatGroupId, false);
  if (presenceUnsubscribe) {
    presenceUnsubscribe();
    presenceUnsubscribe = null;
  }
  clearInterval(presenceHeartbeatInterval);
  presenceHeartbeatInterval = null;

  // Clear own typing status
  updateTypingStatus(false);
  
  if (videoCallUnsubscribe) {
    videoCallUnsubscribe();
    videoCallUnsubscribe = null;
  }
  activeCallParticipants = {};

  activeChatGroupId = null;
  closeModal('modal-group-chat');
  clearMediaPreview(); // Reset media selection
}

/** ── JITSI VIDEO CALL INTEGRATION ── **/
async function startGroupVideoCall() {
  const groupId = activeChatGroupId;
  if (!groupId) return;

  const { firebaseRtdb, rtdb } = window;
  if (!firebaseRtdb || !rtdb) {
    return showToast('Video calls are not available offline.', 'warn');
  }

  const userId = window.userId;
  const userName = localStorage.getItem('window.userName');
  const userPhoto = localStorage.getItem('window.userProfilePicture');

  const btn = document.getElementById('chat-video-call-btn');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-inline"></span>';

  try {
    const res = await apiFetch(`${window.API}/api/groups/${groupId}/meeting`);
    if (!res.roomId) throw new Error('No Room ID received');
    
    const { roomId } = res;
    
    // Check if the call is new/empty before we join it
    const isNewCall = Object.keys(activeCallParticipants).length === 0;
    if (isNewCall) {
      apiFetch(`${window.API}/api/fcm/notify-video-call`, {
        method: 'POST',
        body: JSON.stringify({ groupId })
      }).catch(err => {
        console.warn('Failed to send video call notification:', err);
      });
    }
    
    // Show overlay and set title
    const overlay = document.getElementById('modal-video-call');
    const groupName = document.getElementById('chat-group-name')?.textContent || 'Group Meeting';
    document.getElementById('video-call-title').textContent = groupName;
    
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
    
    // Clear container
    // Clear container and show loader
    const container = document.getElementById('jitsi-container');
    container.innerHTML = '';
    
    // Re-insert loader (since we cleared innerHTML)
    const loaderHtml = `
      <div id="jitsi-loading-overlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #000; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 10; gap: 24px; transition: opacity 0.5s ease;">
        <div class="loader" style="width: 60px; height: 60px; border: 5px solid #222; border-top-color: var(--purple); border-radius: 50%; animation: jitsi-spin 1s linear infinite;"></div>
        <div style="text-align: center;">
          <h3 style="color: white; margin: 0; font-family: 'Space Grotesk', sans-serif; text-transform: uppercase; letter-spacing: 2px; font-size: 18px;">Establishing Connection...</h3>
          <p style="color: #666; margin: 10px 0 0 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Hang tight! This usually takes about 10 seconds.</p>
          <p style="color: #555; margin: 15px 0 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0; animation: fallbackFadeIn 1s ease 12s forwards;">If it takes longer, refresh the page and try again.</p>
        </div>
      </div>
      <style>
        @keyframes fallbackFadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
      </style>
    `;
    container.innerHTML = loaderHtml;
    
    const domain = 'jitsi.belnet.be';
    const options = {
      roomName: roomId,
      width: '100%',
      height: '100%',
      parentNode: container,
      onload: () => {
        console.log('[Jitsi] Iframe loaded successfully, fading out overlay.');
        const loader = document.getElementById('jitsi-loading-overlay');
        if (loader) {
          loader.style.opacity = '0';
          setTimeout(() => { loader.style.display = 'none'; }, 500);
        }
      },
      userInfo: {
        displayName: localStorage.getItem('window.userName') || 'Consistency User',
        avatarUrl: (() => {
          const pic = localStorage.getItem('window.userProfilePicture');
          if (!pic || pic === 'undefined' || pic === 'null') return '';
          const url = (pic.startsWith('http') || pic.startsWith('data:')) 
            ? pic 
            : window.location.origin + (pic.startsWith('/') ? '' : '/') + pic;
          console.log('[Jitsi] Setting avatar URL:', url);
          return url;
        })()
      },
      configOverwrite: {
        subject: '', // Hide the internal Jitsi subject bar to prevent overlap
        hideConferenceSubject: true,
        hideConferenceTimer: true,
        prejoinPageEnabled: false,
        prejoinConfig: { enabled: false },
        disableDeepLinking: true,
        disableInviteFunctions: true,
        startWithAudioMuted: false,
        startWithVideoMuted: true,
        doNotStoreRoom: true,
        disableTileEnlargement: true,
        disableFilmstripAutohiding: true,
        doNotFlipLocalVideo: true,
        disableLocalVideoFlip: true,
        constraints: {
          video: {
            aspectRatio: { ideal: 1.777 } // 16:9 ideal to prevent sides from being cut off
          }
        },
        toolbarButtons: ['microphone', 'camera', 'desktop', 'hangup', 'tileview', 'chat', 'fullscreen']
      },
      interfaceConfigOverwrite: {
        VIDEO_LAYOUT_FIT: 'nocrop',
        TOOLBAR_BUTTONS: ['microphone', 'camera', 'desktop', 'hangup', 'tileview', 'chat', 'fullscreen'],
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        DEFAULT_REMOTE_DISPLAY_NAME: 'Member',
        MOBILE_APP_PROMO: false,
        DISPLAY_WELCOME_PAGE_CONTENT: false,
        GENERATE_ROOMNAMES_ON_WELCOME_PAGE: false,
        SHOW_CHROME_EXTENSION_BANNER: false
      }
    };

    if (typeof JitsiMeetExternalAPI === 'undefined') {
      throw new Error('Jitsi library failed to load. Please refresh the page or check your connection.');
    }

    jitsiApi = new JitsiMeetExternalAPI(domain, options);
    
    // Mark user as in-call in RTDB
    const participantRef = rtdb.ref(firebaseRtdb, `video_calls/${groupId}/participants/${window.userId}`);
    const participantData = {
      name: window.userName || 'User',
      photo: (userPhoto && userPhoto !== 'undefined' && userPhoto !== 'null') ? userPhoto : null,
      joinedAt: rtdb.serverTimestamp()
    };
    
    console.log(`[VideoCall] Marking self as in-call:`, participantData);
    
    rtdb.set(participantRef, participantData);
    rtdb.onDisconnect(participantRef).remove();
    
    jitsiApi.addEventListener('videoConferenceLeft', () => {
      closeVideoCall();
    });

    jitsiApi.addEventListener('videoConferenceJoined', async () => {
      // Hide loading overlay with a smooth fade
      const loader = document.getElementById('jitsi-loading-overlay');
      if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => { loader.style.display = 'none'; }, 500);
      }

      const avatar = options.userInfo.avatarUrl;
      if (avatar) {
        jitsiApi.executeCommand('avatarUrl', avatar);
      }

      // Check for multiple cameras (mobile front/back) to show the switch button
      try {
        const devices = await jitsiApi.getAvailableDevices();
        const videoInputs = devices.videoInput || [];
        if (videoInputs.length > 1) {
          const btn = document.getElementById('switch-camera-btn');
          if (btn) btn.style.display = 'flex';
        }
      } catch (e) {
        console.warn('[VideoCall] Could not check devices:', e);
      }
    });

    jitsiApi.addEventListener('screenSharingStatusChanged', (event) => {
      const indicator = document.getElementById('sharing-indicator');
      if (indicator) {
        indicator.style.display = event.on ? 'flex' : 'none';
      }
    });

    jitsiApi.addEventListener('videoMuteStatusChanged', (event) => {
      const indicator = document.getElementById('video-indicator');
      if (indicator) {
        indicator.style.display = event.muted ? 'none' : 'flex';
      }
    });

  } catch (err) {
    console.error('Video call error:', err);
    showToast('Failed to start video call.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    if (window.lucide) lucide.createIcons({ root: btn });
  }
}

function closeVideoCall() {
  // Capture and immediately nullify the window.API reference so UI closes instantly.
  // Then dispose() in the background — it can take several seconds to
  // handshake with the Jitsi server and should NOT block the UI.
  const apiToDispose = jitsiApi;
  jitsiApi = null;

  // ── Close the UI immediately ──
  document.getElementById('modal-video-call').style.display = 'none';
  document.body.style.overflow = ''; // Restore scrolling
  document.getElementById('jitsi-container').innerHTML = '';

  // Hide switch camera button on close
  const switchBtn = document.getElementById('switch-camera-btn');
  if (switchBtn) switchBtn.style.display = 'none';

  // Remove from RTDB immediately (non-blocking)
  if (activeChatGroupId) {
    const { firebaseRtdb, rtdb } = window;
    if (firebaseRtdb && rtdb) {
      const userId = window.userId;
      const participantRef = rtdb.ref(firebaseRtdb, `video_calls/${activeChatGroupId}/participants/${window.userId}`);
      rtdb.remove(participantRef);
    }
  }

  // Force a read-receipt check now that the video call is hidden
  setTimeout(() => {
    if (typeof triggerManualReadCheck === 'function') {
      triggerManualReadCheck();
    }
  }, 300);

  // ── Dispose Jitsi asynchronously in the background ──
  // This prevents the ~10s block caused by waiting for session cleanup.
  if (apiToDispose) {
    setTimeout(() => {
      try { apiToDispose.dispose(); } catch (e) { /* ignore disposal errors */ }
    }, 0);
  }
}

/** ── Switch Camera Logic ── **/
let isSwitchingCamera = false;
async function switchVideoCamera() {
  if (!jitsiApi || isSwitchingCamera) return;
  
  isSwitchingCamera = true;
  const btn = document.getElementById('switch-camera-btn');
  if (btn) {
    btn.style.opacity = '0.4';
    btn.style.pointerEvents = 'none';
  }

  try {
    const devices = await jitsiApi.getAvailableDevices();
    // Keep all video devices, including 'default' to ensure we can cycle back
    const videoInputs = (devices.videoInput || []).filter(d => d.deviceId);
    
    if (videoInputs.length < 2) {
      showToast('No other cameras detected', 'info');
      isSwitchingCamera = false;
      if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
      return;
    }

    // IMPORTANT: On some devices, Jitsi hangs if you switch while video is OFF.
    // We'll check the current video state if possible, but the safest way is to just execute the command.
    
    // Get current device info
    const currentDevices = await jitsiApi.getCurrentDevices();
    const currentId = currentDevices.videoInput?.deviceId;
    const currentLabel = currentDevices.videoInput?.label;

    // Find the current device index using both ID and Label for robustness
    let currIdx = videoInputs.findIndex(d => d.deviceId === currentId);
    if (currIdx === -1 && currentLabel) {
      currIdx = videoInputs.findIndex(d => d.label === currentLabel);
    }

    // Determine the next camera in the loop
    const nextIndex = (currIdx + 1) % videoInputs.length;
    const nextDevice = videoInputs[nextIndex];

    console.log(`[VideoCall] Cycling to camera ${nextIndex + 1}/${videoInputs.length}: ${nextDevice.label}`);
    
    // Notify the user at the TOP of the screen to avoid covering the Jitsi toolbar
    showToast(`Switching to: ${nextDevice.label || 'Next Camera'}`, 'info');

    // Switch the device
    await jitsiApi.setVideoInputDevice(nextDevice.label, nextDevice.deviceId);
    
    // Success!
    setTimeout(() => {
      showToast('Camera switched successfully', 'success');
    }, 500);

  } catch (err) {
    console.error('[VideoCall] Camera switch failed:', err);
    showToast('Failed to switch camera. Try toggling video off/on.', 'error');
  } finally {
    // 3-second cooldown to ensure the hardware driver has fully initialized the new stream
    // and Jitsi has re-enabled its internal toolbar buttons.
    setTimeout(() => {
      isSwitchingCamera = false;
      if (btn) {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
      }
    }, 3000);
  }
}

function updateExistingMessage(msg, el) {
  const bubble = el.querySelector('.chat-bubble');
  if (!bubble) return;
  
  // Update text
  const textEl = bubble.querySelector('.chat-text');
  if (textEl && textEl.textContent !== msg.text) {
    textEl.innerHTML = window.linkify(escHtml(msg.text));
  }
  
  // Update reactions
  const existingReactions = bubble.querySelector('.chat-reactions');
  const newReactionsHtml = renderReactionsHTML(msg.reactions, msg.id);
  
  if (existingReactions) {
    if (!newReactionsHtml) existingReactions.remove();
    else existingReactions.outerHTML = newReactionsHtml;
  } else if (newReactionsHtml) {
    const footer = bubble.querySelector('.chat-message-footer');
    const temp = document.createElement('div');
    temp.innerHTML = newReactionsHtml;
    bubble.insertBefore(temp.firstElementChild, footer);
  }
}

async function handleChatSubmit(e) {
  e.preventDefault();
  if (isChatSending) return;
  
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text && selectedMediaBlobs.length === 0) return;
  if (!activeChatGroupId) return;

  // Anti-spam cooldown (1.5 seconds)
  const now = Date.now();
  if (now - lastMessageSentAt < 1500) {
    return showToast('Sending too fast! Please wait a moment.', 'warn');
  }

  // Length check (2000 chars)
  if (text.length > 2000) {
    return showToast('Message too long! Max 2000 characters.', 'warn');
  }

  const form = document.getElementById('chat-form');
  const btn = form.querySelector('button[type="submit"]');
  
  // Only block the button if uploading media (needs wait)
  if (selectedMediaBlobs.length > 0) {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="upload-cloud" class="loading-bounce"></i>';
      if (window.lucide) lucide.createIcons({ root: btn });
    }
  }

  const { firebaseDb, firestore } = window;
  if (!firebaseDb || !firestore) {
    return showToast('Chat is currently offline.', 'error');
  }
  
  isChatSending = true;
  const userId = window.userId;
  const userName = localStorage.getItem('window.userName');
  const userPhoto = localStorage.getItem('window.userProfilePicture');
  
  try {
    const msgsRef = firestore.collection(firebaseDb, 'group_chats', activeChatGroupId, 'messages');
    const baseMsgData = {
      senderId: window.userId || '',
      senderName: window.userName || 'User',
      senderUsername: localStorage.getItem('userUsername') || '',
      senderPhoto: userPhoto || null,
      senderIsPremium: localStorage.getItem('isPremium') === 'true' || localStorage.getItem('subscriptionTier') === 'premium',
      timestamp: firestore.serverTimestamp()
    };

    if (activeReplyTo) {
      baseMsgData.replyTo = {
        docId: activeReplyTo.docId || '',
        text: activeReplyTo.text || '',
        senderName: activeReplyTo.senderName || '',
        mediaUrl: activeReplyTo.mediaUrl || null,
        mediaType: activeReplyTo.mediaType || null,
        audioDuration: activeReplyTo.audioDuration || null
      };
    }

    // Clear UI instantly
    input.value = ''; 
    input.style.height = '48px'; // Reset height
    updateTypingStatus(false);
    lastMessageSentAt = Date.now(); // Update cooldown
    const replyToCopy = activeReplyTo; // For the first message only
    activeReplyTo = null;
    clearReply();

    if (selectedMediaBlobs.length === 0) {
      // Just text
      await firestore.addDoc(msgsRef, { ...baseMsgData, text });
      triggerChatPushNotification(text, false, null);
    } else {
      // Send media (with text attached to the first one)
      let isFirstMedia = true;
      for (const item of selectedMediaBlobs) {
        const mediaUrl = await uploadMediaToCloudinary(item.blob, item.type, item.source);
        
        const msgData = { 
          ...baseMsgData, 
          text: isFirstMedia ? text : '', // Attach text only to the first media message
          mediaUrl, 
          mediaType: item.type,
          audioDuration: item.duration || null,
          replyTo: isFirstMedia ? replyToCopy : null
        };

        await firestore.addDoc(msgsRef, msgData);
        if (isFirstMedia) {
          triggerChatPushNotification(text, true, item.type);
        }
        
        if (item.type === 'audio') {
          if (item.source === 'upload') {
            audioFileLimitRemaining--;
          } else {
            audioLimitRemaining--;
          }
        } else {
          imageLimitRemaining--;
        }
        isFirstMedia = false;
        updateMediaLimitDisplay();
      }
    }

  } catch (err) {
    console.error('Send error:', err);
    showToast(err.message || 'Failed to send message.', 'error');
    // If it's a rate limit error, refresh the limit count
    if (err.message && err.message.includes('limit')) {
      fetchMediaLimit();
    }
  } finally {
    isChatSending = false;
    clearMediaPreview(); // Always clear preview: success, partial, or error
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="send" style="width: 20px; height: 20px; color: #fff;"></i>';
      if (window.lucide) lucide.createIcons({ root: btn });
    }
  }
}

// ── EDIT MESSAGE LOGIC ───────────────────────────────────────

function startEditChatMessage(docId, currentText) {
  const textEl = document.getElementById(`chat-text-${docId}`);
  if (!textEl) return;

  const originalHTML = textEl.innerHTML;
  textEl.innerHTML = `
    <div class="chat-edit-input-container">
      <textarea id="edit-input-${docId}" class="chat-edit-textarea">${currentText}</textarea>
      <div class="chat-edit-actions">
        <button class="btn-chat-edit btn-chat-cancel" onclick="cancelEditChatMessage('${docId}', '${escJs(currentText)}')">Cancel</button>
        <button class="btn-chat-edit btn-chat-save" onclick="submitEditChatMessage('${docId}')">Save</button>
      </div>
    </div>
  `;
}

function cancelEditChatMessage(docId, originalText) {
  const textEl = document.getElementById(`chat-text-${docId}`);
  if (textEl) textEl.textContent = originalText;
}

async function submitEditChatMessage(docId) {
  const input = document.getElementById(`edit-input-${docId}`);
  const newText = input.value.trim();
  if (!newText || !activeChatGroupId) return;

  const { firebaseDb, firestore } = window;
  if (!firebaseDb || !firestore) return showToast('Cannot edit while offline.', 'error');
  const docRef = firestore.doc(firebaseDb, 'group_chats', activeChatGroupId, 'messages', docId);

  try {
    await firestore.updateDoc(docRef, {
      text: newText,
      edited: true,
      editedAt: firestore.serverTimestamp()
    });
    showToast('Message updated', 'success');
  } catch (err) {
    console.error('Edit error:', err);
    showToast('Failed to edit message', 'error');
  }
}

// ── REACTIONS & REPLIES ─────────────────────────────────────

async function toggleReaction(docId, emoji = '❤️') {
  const { firebaseDb, firestore } = window;
  if (!firebaseDb || !firestore) return;
  const userId = window.userId;
  if (!activeChatGroupId) return;
  const docRef = firestore.doc(firebaseDb, 'group_chats', activeChatGroupId, 'messages', docId);
  
  try {
    const docSnap = await firestore.getDoc(docRef);
    if (!docSnap.exists()) return;
    const data = docSnap.data();
    const reactions = data.reactions || {};
    
    if (!reactions[emoji]) reactions[emoji] = [];
    const idx = reactions[emoji].indexOf(window.userId);
    if (idx > -1) reactions[emoji].splice(idx, 1);
    else reactions[emoji].push(window.userId);
    
    if (reactions[emoji].length === 0) delete reactions[emoji];
    
    await firestore.updateDoc(docRef, { reactions });
    
    // Tiny pop animation
    const bubble = document.getElementById(`chat-msg-${docId}`);
    if (bubble && window.gsap) {
      gsap.to(bubble.querySelector('.chat-bubble'), { scale: 1.05, duration: 0.1, yoyo: true, repeat: 1 });
    }
  } catch (err) { console.error('Reaction error:', err); }
}

async function deleteChatMessage(docId) {
  if (!confirm('Are you sure you want to delete this message for everyone?')) return;
  const { firebaseDb, firestore } = window;
  if (!firebaseDb || !firestore) return showToast('Cannot delete while offline.', 'error');
  if (!activeChatGroupId) return;
  const docRef = firestore.doc(firebaseDb, 'group_chats', activeChatGroupId, 'messages', docId);
  
  try {
    // 1. Fetch document to check for media
    const snap = await firestore.getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data.mediaUrl) {
        await apiFetch(`${window.API}/api/auth/chat-media`, {
          method: 'DELETE',
          body: JSON.stringify({ urls: [data.mediaUrl] })
        }).catch(e => console.warn('Media deletion failed (may be already gone):', e));
      }
    }

    // 2. Delete from Firestore
    await firestore.deleteDoc(docRef);
    showToast('Message deleted.', 'info');
  } catch (err) {
    console.error('Delete error:', err);
    showToast('Failed to delete message.', 'error');
  }
}

function renderReactionsHTML(reactions, docId) {
  if (!reactions || Object.keys(reactions).length === 0) return '';
  const userId = window.userId;
  let html = '<div class="chat-reactions">';
  for (const [emoji, users] of Object.entries(reactions)) {
    const isActive = users.includes(window.userId);
    html += `
      <div class="chat-reaction-pill ${isActive ? 'active' : ''}" onclick="showReactionUsers(event, this, '${docId}', '${emoji}')">
        <span class="chat-reaction-emoji">${emoji}</span>
        <span class="chat-reaction-count">${users.length}</span>
      </div>
    `;
  }
  html += '</div>';
  return html;
}

function toggleReactionPicker(e, docId) {
  e.stopPropagation();
  // Remove existing pickers
  const existing = document.querySelector('.reaction-picker');
  if (existing) {
    const wasSame = existing.dataset.docId === docId;
    existing.remove();
    if (wasSame) return;
  }

  const emojis = ['👍', '❤️', '😂', '🎉', '😮', '🔥'];
  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  picker.style.position = 'fixed';
  picker.dataset.docId = docId;
  
  emojis.forEach(emoji => {
    const span = document.createElement('span');
    span.className = 'reaction-emoji';
    span.textContent = emoji;
    span.onclick = () => {
      toggleReaction(docId, emoji);
      picker.remove();
    };
    picker.appendChild(span);
  });

  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  
  // Position picker above the button, centered horizontally relative to it
  document.body.appendChild(picker);
  
  requestAnimationFrame(() => {
    const pWidth = picker.offsetWidth || 280;
    const pHeight = picker.offsetHeight || 50;
    
    let top = rect.top - pHeight - 12;
    let left = rect.left + (rect.width / 2) - (pWidth / 2);
    
    // Viewport safety
    const margin = 16;
    if (top < margin) top = rect.bottom + 12; // Flip to bottom if no space above
    if (left < margin) left = margin;
    if (left + pWidth > window.innerWidth - margin) {
      left = window.innerWidth - pWidth - margin;
    }
    
    picker.style.top = `${top}px`;
    picker.style.left = `${left}px`;
    picker.style.visibility = 'visible';
  });

  // Close when clicking outside
  const closer = (ev) => {
    // Only close if we didn't click the emoji button again or the picker itself
    if (!picker.contains(ev.target)) {
      picker.remove();
      document.removeEventListener('mousedown', closer);
    }
  };
  // Use mousedown to catch clicks before they trigger other things
  setTimeout(() => document.addEventListener('mousedown', closer), 10);
}

async function showReactionUsers(e, targetEl, docId, emoji) {
  if (e) e.stopPropagation();
  
  const { firebaseDb, firestore } = window;
  if (!firebaseDb || !firestore || !activeChatGroupId) return;
  
  const docRef = firestore.doc(firebaseDb, 'group_chats', activeChatGroupId, 'messages', docId);
  
  try {
    const docSnap = await firestore.getDoc(docRef);
    
    if (!docSnap.exists()) return;
    const reactions = docSnap.data().reactions || {};
    const userIds = reactions[emoji] || [];

    if (userIds.length === 0) return;

    // Get current user ID
    const myUserId = window.userId;
    const hasReacted = userIds.includes(myUserId);

    // Create popup
    const existing = document.querySelector('.reaction-info-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.className = 'reaction-info-popup';
    
    let html = `<span class="reaction-info-header">${emoji} Reactions</span>`;
    
    if (hasReacted) {
      html += `<button class="reaction-info-btn" onclick="toggleReaction('${docId}', '${emoji}'); document.querySelector('.reaction-info-popup').remove();">Remove My Reaction</button>`;
    }
    
    html += `<div class="reaction-info-list">`;
    
    // Try to find names from allJoinedGroups members
    const group = (typeof window.allJoinedGroups !== 'undefined' && window.allJoinedGroups) 
      ? window.allJoinedGroups.find(g => g._id === activeChatGroupId) 
      : null;
    
    userIds.forEach(uid => {
      let name = 'Anonymous';
      if (uid === myUserId) name = 'You';
      else if (group && group.members) {
        const member = group.members.find(m => (m._id || m) === uid);
        if (member) name = member.name || 'Member';
      }
      html += `<div class="reaction-info-user">${escapeHTML(name)}</div>`;
    });
    
    html += `</div>`;
    popup.innerHTML = html;
    popup.style.zIndex = '99999';
    document.body.appendChild(popup);
 
    setTimeout(() => {
      const anchor = targetEl || (e ? e.currentTarget : null);
      if (anchor) {
        const rect = anchor.getBoundingClientRect();
        const pWidth = popup.offsetWidth || 180;
        const pHeight = popup.offsetHeight || 100;

        let top = rect.top - pHeight - 10;
        let left = rect.left + (rect.width / 2) - (pWidth / 2);
        
        if (top < 10) top = rect.bottom + 10;
        if (left < 10) left = 10;
        if (left + pWidth > window.innerWidth - 10) left = window.innerWidth - pWidth - 10;
        
        popup.style.top = `${top}px`;
        popup.style.left = `${left}px`;
        popup.style.visibility = 'visible';
      } else {
        // No anchor
      }
    }, 0);

    // Close on outside click
    const closePopup = (ev) => {
      if (!popup.contains(ev.target)) {
        popup.remove();
        document.removeEventListener('mousedown', closePopup);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closePopup), 10);
  } catch (err) { console.error(err); }
}

function setReplyTo(docId, text, senderName, mediaUrl, mediaType = '', audioDuration = 0) {
  activeReplyTo = { docId, text, senderName, mediaUrl, mediaType, audioDuration };
  let preview = document.getElementById('chat-reply-preview');
  if (!preview) {
    const footer = document.querySelector('#modal-group-chat .modal-footer');
    preview = document.createElement('div');
    preview.id = 'chat-reply-preview';
    preview.className = 'chat-reply-preview';
    footer.parentNode.insertBefore(preview, footer);
  }
  
  const isAudio = mediaType === 'audio' || 
                  (mediaUrl && (
                    mediaUrl.match(/\.(mp3|wav|ogg|m4a|aac)($|\?)/i) || 
                    mediaUrl.includes('audio') || 
                    mediaUrl.includes('voice')
                  ));
  
  const formatSecs = (seconds) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  const durationText = audioDuration ? (window.formatDuration ? window.formatDuration(audioDuration) : formatSecs(audioDuration)) : '';
  const voiceLabel = durationText ? `Voice Message (${durationText})` : 'Voice Message';
  
  preview.innerHTML = `
    ${mediaUrl ? (isAudio ? `
      <div class="chat-reply-thumbnail" style="display:flex;align-items:center;justify-content:center;background:var(--purple);border:2px solid var(--black);border-radius:50%;width:32px;height:32px;flex-shrink:0;box-sizing:border-box;">
        <i data-lucide="mic" style="width:14px;height:14px;color:#fff;"></i>
      </div>
    ` : `
      <img src="${mediaUrl}" class="chat-reply-thumbnail" />
    `) : ''}
    <div class="chat-reply-preview-content">
      <div class="chat-reply-preview-name">Replying to ${escHtml(senderName)}</div>
      <div class="chat-reply-preview-text">${escHtml(text || (isAudio ? voiceLabel : (mediaUrl ? 'Photo' : '')))}</div>
    </div>
    <button class="chat-edit-btn" onclick="clearReply()" style="opacity:1;"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
  `;
  preview.style.display = 'flex';
  if (window.lucide) lucide.createIcons({ root: preview });
  document.getElementById('chat-input').focus();
}

/** ── LAZY LOADING & READ RECEIPTS LOGIC ── **/
let lazyObserver;
function initLazyLoading() {
  if (!lazyObserver) {
    lazyObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const media = entry.target;
          if (media.dataset.src) {
            media.src = media.dataset.src;
            media.removeAttribute('data-src');
            media.classList.remove('lazy-media');
          }
          observer.unobserve(media);
        }
      });
    }, { rootMargin: '200px' });
  }
  
  document.querySelectorAll('.lazy-media').forEach(m => lazyObserver.observe(m));
}

function initReadTracker() {
  if (!readObserver) {
    readObserver = new IntersectionObserver((entries) => {
      // If user is in a video call, don't mark anything as read
      if (document.getElementById('modal-video-call').style.display === 'flex') return;

      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const msgId = entry.target.id.replace('chat-msg-', '');
          const msgEl = entry.target;
          const msgTimestamp = msgEl.dataset.ts ? parseInt(msgEl.dataset.ts) : 0;
          
          if (msgTimestamp > myHighestReadTimestamp) {
            myHighestReadTimestamp = msgTimestamp;
            throttledUpdateReadStatus();
          }
        }
      });
    }, { threshold: 0.1 }); // 10% of message visible is enough
  }
  
  // Observe all messages that are NOT from the current user
  const userId = window.userId;
  document.querySelectorAll('.chat-bubble-wrapper.other').forEach(m => readObserver.observe(m));
}

function triggerManualReadCheck() {
  if (!activeChatGroupId) return;
  const container = document.getElementById('chat-messages-container');
  if (!container || container.style.display === 'none') return;
  
  // If user is still in a video call (just in case), skip
  const videoModal = document.getElementById('modal-video-call');
  if (videoModal && videoModal.style.display === 'flex') return;

  const messages = document.querySelectorAll('.chat-bubble-wrapper.other');
  const containerRect = container.getBoundingClientRect();
  let highestVisible = myHighestReadTimestamp;

  messages.forEach(m => {
    const rect = m.getBoundingClientRect();
    // Check if the message is roughly within the viewport of the scroll container
    if (rect.top < containerRect.bottom && rect.bottom > containerRect.top) {
      const ts = m.dataset.ts ? parseInt(m.dataset.ts) : 0;
      if (ts > highestVisible) highestVisible = ts;
    }
  });

  if (highestVisible > myHighestReadTimestamp) {
    myHighestReadTimestamp = highestVisible;
    console.log(`[ReadSync] Manual check triggered.`);
    throttledUpdateReadStatus();
  }
}

let readStatusTimeout = null;
function throttledUpdateReadStatus() {
  if (readStatusTimeout) return;
  
  const now = Date.now();
  const timeSinceLast = now - lastReadUpdate;
  const delay = Math.max(0, 5000 - timeSinceLast); // 5 second throttle for batching
  
  readStatusTimeout = setTimeout(async () => {
    readStatusTimeout = null;
    if (!activeChatGroupId || !myHighestReadTimestamp) return;
    
    const { firebaseDb, firestore } = window;
    if (!firebaseDb || !firestore) return;
    const userId = window.userId;
    const readRef = firestore.doc(firebaseDb, 'group_chats', activeChatGroupId, 'last_reads', window.userId);
    
    try {
      await firestore.setDoc(readRef, { timestamp: myHighestReadTimestamp });
      lastReadUpdate = Date.now();
    } catch (err) {
      console.error('Failed to sync read status:', err);
    }
  }, delay);
}

function subscribeToReadStatuses(groupId) {
  if (readStatusUnsubscribe) readStatusUnsubscribe();
  memberReadStatuses = {}; // Reset for new group
  
  const { firebaseDb, firestore } = window;
  if (!firebaseDb || !firestore) return;
  const userId = window.userId;
  const readsRef = firestore.collection(firebaseDb, 'group_chats', groupId, 'last_reads');
  
  readStatusUnsubscribe = firestore.onSnapshot(readsRef, (snapshot) => {
    // Process all docs to ensure we have the absolute latest state
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const uid = doc.id;
      if (uid !== window.userId) {
        memberReadStatuses[uid] = data.timestamp || 0;
      }
    });
    
    updateExistingTicks();
  });
}

function updateExistingTicks() {
  const group = (typeof window.allJoinedGroups !== 'undefined' && window.allJoinedGroups) ? window.allJoinedGroups.find(g => g._id === activeChatGroupId) : null;
  if (!group) return;
  const totalOthers = Math.max(1, group.members.length - 1);
  
  const selfMessages = document.querySelectorAll('.chat-bubble-wrapper.self');
  selfMessages.forEach(msgEl => {
    const ts = parseInt(msgEl.dataset.ts || '0');
    const tick = msgEl.querySelector('.chat-tick');
    if (!tick || tick.classList.contains('blue')) return;

    const readCount = Object.values(memberReadStatuses).filter(lastRead => lastRead >= ts).length;
    const pct = (readCount / totalOthers) * 100;
    
    if (pct >= window.globalConfig.chatReadThresholdPct) {
      tick.classList.add('blue');
      if (window.lucide) lucide.createIcons({ root: tick });
    }
  });
}

function updateMessageInDOM(msg, isPending = false) {
  const el = document.getElementById(`chat-msg-${msg.id}`);
  if (!el) return;
  
  const timestamp = msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date();
  el.dataset.ts = timestamp.getTime().toString();
  
  const userId = window.userId;
  const isSelf = String(msg.senderId) === String(window.userId);
  
  // Proactively update timestamp text in UI once saved to server
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
        const isBlue = calculateBlueStatus(msg);
        tick.className = `chat-tick ${isBlue ? 'blue' : ''}`;
        tick.innerHTML = '<i data-lucide="check-check" style="width:14px;height:14px;"></i>';
      }
      if (window.lucide) lucide.createIcons({ root: tick });
    }
  }
}

function calculateBlueStatus(msg) {
  const tsMillis = msg.timestamp?.toMillis ? msg.timestamp.toMillis() : (msg.timestamp?.toDate ? msg.timestamp.toDate().getTime() : Date.now());
  const group = (typeof window.allJoinedGroups !== 'undefined' && window.allJoinedGroups) ? window.allJoinedGroups.find(g => g._id === activeChatGroupId) : null;
  const totalOthers = group ? Math.max(1, group.members.length - 1) : 1;
  const readCount = Object.values(memberReadStatuses).filter(lr => lr >= tsMillis).length;
  return (readCount / totalOthers) * 100 >= (window.globalConfig.chatReadThresholdPct || 10);
}

function clearReply() {
  activeReplyTo = null;
  const preview = document.getElementById('chat-reply-preview');
  if (preview) preview.style.display = 'none';
}

function scrollToMessage(docId) {
  const el = document.getElementById(`chat-msg-${docId}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (window.gsap) {
      gsap.fromTo(el.querySelector('.chat-bubble'), { backgroundColor: 'var(--yellow)' }, { backgroundColor: '', duration: 1 });
    }
  } else {
    showToast('Original message is too old to jump to.', 'info');
  }
}

// ── TYPING INDICATOR LOGIC ───────────────────────────────────

let isCurrentlyTyping = false;
let lastTypingUpdate = 0;
let typingUnsubscribe = null;
let typingTimeout = null;

// Handle paste events to warn about truncation
document.addEventListener('DOMContentLoaded', () => {
  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.addEventListener('paste', (e) => {
      const paste = (e.clipboardData || window.clipboardData).getData('text');
      const currentLength = chatInput.value.length;
      if (currentLength + paste.length > 2000) {
        showToast('Text truncated! Max 2000 characters allowed.', 'warn');
      }
    });

    // Enter sends, Shift+Enter inserts newline
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.isAndroidNative;
        if (!isMobile) {
          if (e.shiftKey) {
            // Shift+Enter: allow default (insert newline)
            return;
          } else {
            // Plain Enter: send message
            e.preventDefault();
            handleChatSubmit(e);
          }
        }
      }
    });
  }
});

function handleTyping() {
  const el = document.getElementById('chat-input');
  if (el) {
    // Auto-resize logic
    el.style.height = '48px'; // Reset
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  }

  const now = Date.now();
  
  // Debounce Firestore updates: only update every 2 seconds while typing
  if (!isCurrentlyTyping || (now - lastTypingUpdate > 2000)) {
    isCurrentlyTyping = true;
    lastTypingUpdate = now;
    updateTypingStatus(true);
  }

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    isCurrentlyTyping = false;
    updateTypingStatus(false);
  }, 1500); // Stop after 1.5s of inactivity
}

async function updateTypingStatus(isTyping) {
  if (!activeChatGroupId) return;
  const { firebaseRtdb, rtdb } = window;
  if (!firebaseRtdb || !rtdb) return;
  const userId = window.userId;
  const userName = localStorage.getItem('window.userName');
  
  const typingRef = rtdb.ref(firebaseRtdb, `typing/${activeChatGroupId}/${window.userId}`);
  
  try {
    if (isTyping) {
      await rtdb.set(typingRef, {
        name: window.userName,
        timestamp: rtdb.serverTimestamp()
      });
      rtdb.onDisconnect(typingRef).remove();
    } else {
      await rtdb.remove(typingRef);
    }
  } catch (err) {
    // Silent fail
  }
}

function listenForTyping() {
  if (typingUnsubscribe) {
    if (typeof typingUnsubscribe === 'function') typingUnsubscribe();
    typingUnsubscribe = null;
  }

  const { firebaseRtdb, rtdb } = window;
  if (!firebaseRtdb || !rtdb) return;
  const userId = window.userId;
  const typingRef = rtdb.ref(firebaseRtdb, `typing/${activeChatGroupId}`);
  
  typingUnsubscribe = rtdb.onValue(typingRef, (snapshot) => {
    const typers = [];
    snapshot.forEach(child => {
      if (child.key !== window.userId) {
        typers.push(child.val().name);
      }
    });
    renderTypingIndicator(typers);
  });
}

function renderTypingIndicator(typers) {
  const container = document.getElementById('typing-indicator-container');
  if (!container) return;

  if (typers.length === 0) {
    container.innerHTML = '';
    return;
  }

  let text = '';
  if (typers.length === 1) text = `<strong>${escHtml(typers[0])}</strong> is typing`;
  else if (typers.length === 2) text = `<strong>${escHtml(typers[0])}</strong> and <strong>${escHtml(typers[1])}</strong> are typing`;
  else text = 'Multiple people are typing';

  container.innerHTML = `
    <div class="typing-indicator">
      <span>${text}</span>
      <div class="typing-dots">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
}

async function initFirebaseChat(retryCount = 0) {
  const token = localStorage.getItem('token');
  if (!window.userId || !token) return;

  try {
    // Use apiFetch (not raw fetch) so a 401 expired-token is automatically
    // refreshed and retried, rather than silently failing here.
    const data = await window.apiFetch(`${window.API}/api/auth/firebase-token`);
    if (data && data.token) {
      const { firebaseAuth, signInWithFirebase } = window;
      if (firebaseAuth && signInWithFirebase) {
        await signInWithFirebase(firebaseAuth, data.token);
        console.log('[Firebase] Chat auth signed in successfully.');

        // Contacts list renders before auth completes — refresh it now
        // so it can fetch real-time last-message/unread counts from Firestore.
        if (typeof window.DM?.fetchFriends === 'function') {
          window.DM.fetchFriends();
        }

      }
    }
  } catch (err) {
    // Retry up to 3 times with exponential backoff for transient token issues
    if (retryCount < 3) {
      const delay = Math.pow(2, retryCount) * 1500; // 1.5s, 3s, 6s
      console.warn(`[Firebase] Auth sync failed (attempt ${retryCount + 1}/3), retrying in ${delay}ms...`, err.message);
      setTimeout(() => initFirebaseChat(retryCount + 1), delay);
    } else {
      console.warn('[Firebase] Auth sync failed after 3 retries. Chat features requiring Firebase Auth may be limited:', err.message);
    }
  }
}

// Ensures Firebase Auth has a valid current user before Firestore writes.
// Called by dm.js and chat.js before any addDoc/updateDoc calls.
window.ensureFirebaseAuth = async function() {
  const { firebaseAuth } = window;
  if (!firebaseAuth) return false;
  if (firebaseAuth.currentUser) return true;
  // Not signed in — attempt sign-in now
  try {
    await initFirebaseChat();
    // Give the auth state a moment to settle
    await new Promise(resolve => setTimeout(resolve, 500));
    return !!firebaseAuth.currentUser;
  } catch (e) {
    return false;
  }
};

async function initPushNotifications(forcePrompt = false) {
  const manuallyDisabled = localStorage.getItem('fcmNotificationsDisabled') === 'true';
  if (manuallyDisabled && !forcePrompt) {
    console.log('[FCM] Push notifications are manually disabled. Skipping automatic initialization.');
    renderFcmBannerState();
    return;
  }

  const isNativeApp = (window.Capacitor && window.Capacitor.isNativePlatform()) || 
                      navigator.userAgent.includes("Capacitor");

  if (isNativeApp) {
    const PushNotifications = window.Capacitor?.Plugins?.PushNotifications;
    if (!PushNotifications) {
      console.warn('Capacitor PushNotifications plugin is not available.');
      return;
    }

    try {
      let permStatus = await PushNotifications.requestPermissions();
      if (permStatus.receive === 'granted') {
        await PushNotifications.register();

        PushNotifications.addListener('registration', async (token) => {
          const fcmToken = token.value;
          if (fcmToken) {
            localStorage.setItem('fcmToken', fcmToken);
            console.log('[Native FCM] Token registered:', fcmToken);
            
            // Register with backend to self-heal
            await apiFetch(`${window.API}/api/fcm/token`, {
              method: 'POST',
              body: JSON.stringify({ token: fcmToken })
            });
            showToast('Push notifications enabled! ✅', 'success');
            renderFcmBannerState();
          }
        });

        PushNotifications.addListener('registrationError', (error) => {
          console.error('[Native FCM] Registration Error:', error);
          showToast('Failed to register native push channel.', 'error');
        });

        // Foreground Push Handler: shows premium slim banner when messages arrive in other rooms
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('[Native FCM] Foreground push received:', notification);
          const groupId = notification.data?.groupId || notification.groupId || notification.data?.group_id || notification.group_id;
          const senderId = notification.data?.senderId || notification.senderId || notification.data?.sender_id || notification.sender_id;
          const type = notification.data?.type || notification.type;
          const title = notification.title || notification.data?.title || 'New Message';
          const body = notification.body || notification.data?.body || '';
          
          if (type === 'friend_request') {
            showPushBanner(title, body, null, null, 'friend_request');
            const mDot = document.getElementById('messages-notif-dot');
            const bDot = document.getElementById('bnav-messages-notif-dot');
            if (mDot) mDot.style.display = 'block';
            if (bDot) bDot.style.display = 'block';
            if (typeof window.DM?.fetchFriendRequests === 'function') {
              window.DM.fetchFriendRequests();
            }
          } else if (groupId) {
            const activeId = typeof activeChatGroupId !== 'undefined' ? activeChatGroupId : null;
            if (!activeId || String(activeId) !== String(groupId)) {
              showPushBanner(title, body, groupId);
              const gDot = document.getElementById('groups-notif-dot');
              const bDot = document.getElementById('bnav-groups-notif-dot');
              if (gDot) gDot.style.display = 'block';
              if (bDot) bDot.style.display = 'block';
            }
          } else if (senderId) {
            localStorage.setItem('activeContact_' + senderId, 'true');
            const activeDMRecipientId = window.DM?.activeChatRecipientId;
            const hasActiveDM = activeDMRecipientId && String(activeDMRecipientId) === String(senderId);
            if (!hasActiveDM) {
              showPushBanner(title, body, null, senderId);
              const mDot = document.getElementById('messages-notif-dot');
              const bDot = document.getElementById('bnav-messages-notif-dot');
              if (mDot) mDot.style.display = 'block';
              if (bDot) bDot.style.display = 'block';

              const activePage = document.querySelector('.page-container.active')?.id || '';
              if (activePage === 'page-messages' && typeof window.DM?.fetchFriends === 'function') {
                window.DM.fetchFriends();
              }
            }
          }
        });

        // Action Performed Handler: handles background notifications clicks (system tray)
        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          console.log('[Native FCM] Action performed on push:', action);
          const groupId = action.notification?.data?.groupId;
          const senderId = action.notification?.data?.senderId || action.notification?.senderId || action.notification?.data?.sender_id || action.notification?.sender_id;
          const type = action.notification?.data?.type || action.notification?.type;
          
          if (senderId) {
            localStorage.setItem('activeContact_' + senderId, 'true');
          }
          
          if (type === 'friend_request') {
            showPage('messages');
          } else if (groupId) {
            // Navigate directly to the chat
            showPage('groups');
            openGroupChatFromDeepLink(groupId);
          } else if (senderId) {
            showPage('messages');
          }
        });
      } else {
        localStorage.setItem('fcmNotificationsDisabled', 'true');
        renderFcmBannerState();
      }
    } catch (err) {
      console.error('Native Push setup failed:', err);
    }
    return;
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Notifications not supported in this browser.');
    return;
  }

  // If Firebase Messaging is determined to be unsupported in the current session (e.g. Incognito)
  if (window.firebaseMessaging === null) {
    const banner = document.getElementById('fcm-permission-banner');
    if (banner) banner.style.display = 'none';
    return;
  }

  // Defer execution if Firebase SDK is still loading asynchronously (module script deferral)
  if (window.getFcmToken === undefined || window.firebaseMessaging === undefined) {
    setTimeout(() => initPushNotifications(forcePrompt), 200);
    return;
  }

  const banner = document.getElementById('fcm-permission-banner');
  if (!banner) return;

  const currentPermission = Notification.permission;
  
  if (currentPermission === 'granted') {
    try {
      const manuallyDisabled = localStorage.getItem('fcmNotificationsDisabled') === 'true';
      if (!manuallyDisabled) {
        // Clean up legacy duplicate firebase-messaging-sw.js to prevent double notifications in PWA
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) {
            if (r.active && r.active.scriptURL.includes('firebase-messaging-sw.js')) {
              await r.unregister();
              console.log('[SW Cleanup] Unregistered duplicate firebase-messaging-sw.js worker.');
            }
          }
        } catch (swErr) {
          console.warn('Service worker cleanup failed:', swErr);
        }

        // Use the unified service worker to prevent registration conflicts and retain PWA status
        await navigator.serviceWorker.register('/sw.js?v=59');
        
        // Wait until the service worker is fully active and ready to handle pushes
        const reg = await navigator.serviceWorker.ready;
        
        const token = await window.getFcmToken(window.firebaseMessaging, {
          vapidKey: 'BEaGRMs91bpXQ1LUZ26AU75jlYB0Gg0IzapbqHaO-HDgnST_pfyBzlqeA3Swr_GDtt2n786bFV9S2nHyCX5WYF4',
          serviceWorkerRegistration: reg
        });
        
        if (token) {
          localStorage.setItem('fcmToken', token);
          console.log('[FCM] Token registered successfully:', token.substring(0, 20) + '...');
          // Always register the token to self-heal any missing database entries
          await apiFetch(`${window.API}/api/fcm/token`, {
            method: 'POST',
            body: JSON.stringify({ token })
          });
          showToast('Push notifications enabled! \u2705', 'success');

          // Register foreground message listener for PWA/Web
          if (window.onFcmMessage && window.firebaseMessaging) {
            window.onFcmMessage(window.firebaseMessaging, (payload) => {
              console.log('[PWA FCM] Foreground push received:', payload);
              const activeId = typeof activeChatGroupId !== 'undefined' ? activeChatGroupId : null;
              const groupId = payload.data?.groupId || payload.groupId || payload.data?.group_id || payload.group_id;
              const senderId = payload.data?.senderId || payload.senderId || payload.data?.sender_id || payload.sender_id;
              const type = payload.data?.type || payload.type;
              
              if (type === 'friend_request') {
                showPushBanner(payload.notification?.title || 'Friend Request', payload.notification?.body || '', null, null, 'friend_request');
                const mDot = document.getElementById('messages-notif-dot');
                const bDot = document.getElementById('bnav-messages-notif-dot');
                if (mDot) mDot.style.display = 'block';
                if (bDot) bDot.style.display = 'block';
                if (typeof window.DM?.fetchFriendRequests === 'function') {
                  window.DM.fetchFriendRequests();
                }
              } else if (groupId) {
                if (!activeId || String(activeId) !== String(groupId)) {
                  showPushBanner(payload.notification?.title || 'New Message', payload.notification?.body || '', groupId);
                  const gDot = document.getElementById('groups-notif-dot');
                  const bDot = document.getElementById('bnav-groups-notif-dot');
                  if (gDot) gDot.style.display = 'block';
                  if (bDot) bDot.style.display = 'block';
                }
              } else if (senderId) {
                localStorage.setItem('activeContact_' + senderId, 'true');
                const activeDMRecipientId = window.DM?.activeChatRecipientId;
                const hasActiveDM = activeDMRecipientId && String(activeDMRecipientId) === String(senderId);
                if (!hasActiveDM) {
                  showPushBanner(payload.notification?.title || 'New DM', payload.notification?.body || '', null, senderId);
                  const mDot = document.getElementById('messages-notif-dot');
                  const bDot = document.getElementById('bnav-messages-notif-dot');
                  if (mDot) mDot.style.display = 'block';
                  if (bDot) bDot.style.display = 'block';
                  
                  const activePage = document.querySelector('.page-container.active')?.id || '';
                  if (activePage === 'page-messages' && typeof window.DM?.fetchFriends === 'function') {
                    window.DM.fetchFriends();
                  }

                  if (payload.notification?.title?.toLowerCase().includes('request') && typeof window.DM?.fetchFriendRequests === 'function') {
                    window.DM.fetchFriendRequests();
                  }
                }
              }
            });
          }
        } else {
          console.warn('[FCM] getToken() returned null — push subscription may have failed');
          showToast('Notification setup incomplete. Try toggling Off then On again.', 'info');
        }
      }
    } catch (err) {
      console.warn('FCM token registration failed:', err);
      showToast(`FCM Registration Failed: ${err.message || err}`, 'error');
    }
  }

  renderFcmBannerState();
}

function renderFcmBannerState() {
  const banner = document.getElementById('fcm-permission-banner');
  if (!banner) return;

  const isNativeApp = (window.Capacitor && window.Capacitor.isNativePlatform()) || 
                      navigator.userAgent.includes("Capacitor");

  const titleEl = document.getElementById('fcm-banner-title');
  const descEl = document.getElementById('fcm-banner-desc');
  const btnEl = document.getElementById('fcm-banner-btn');
  const iconWrap = document.getElementById('fcm-banner-icon-wrap');

  // WebView might not have window.Notification, but native APK supports pushes natively!
  if (!isNativeApp && !('Notification' in window)) {
    banner.style.display = 'none';
    return;
  }

  banner.style.display = 'flex';
  
  // Resolve permission dynamically
  let permission = 'default';
  if (isNativeApp) {
    permission = localStorage.getItem('fcmToken') ? 'granted' : 'default';
    if (localStorage.getItem('fcmNotificationsDisabled') === 'true') {
      permission = 'granted';
    }
  } else {
    permission = Notification.permission;
  }

  const manuallyDisabled = localStorage.getItem('fcmNotificationsDisabled') === 'true';

  if (permission === 'default') {
    iconWrap.style.background = 'var(--yellow)';
    iconWrap.innerHTML = '<i data-lucide="bell" style="width: 20px; height: 20px; color: var(--black);"></i>';
    titleEl.textContent = 'Notifications: Off';
    descEl.textContent = isNativeApp 
      ? 'Enable high-priority native notifications for direct chat alerts.'
      : 'Notification access is required to receive real-time notifications.';
    btnEl.style.display = 'block';
    btnEl.textContent = 'Turn On';
    btnEl.onclick = async () => {
      if (!isNativeApp) {
        await Notification.requestPermission();
      }
      localStorage.removeItem('fcmNotificationsDisabled');
      initPushNotifications(true);
    };
  } else if (permission === 'granted') {
    if (manuallyDisabled) {
      iconWrap.style.background = 'var(--yellow)';
      iconWrap.innerHTML = '<i data-lucide="bell-off" style="width: 20px; height: 20px; color: var(--black);"></i>';
      titleEl.textContent = 'Notifications: Suspended';
      descEl.textContent = 'Notifications are currently disabled manually for this device.';
      btnEl.style.display = 'block';
      btnEl.textContent = 'Turn On';
      btnEl.onclick = async () => {
        localStorage.removeItem('fcmNotificationsDisabled');
        initPushNotifications(true);
      };
    } else {
      const token = localStorage.getItem('fcmToken');
      iconWrap.style.background = 'var(--green)';
      iconWrap.innerHTML = '<i data-lucide="bell" style="width: 20px; height: 20px; color: var(--black);"></i>';
      titleEl.textContent = 'Notifications: On';
      if (token) {
        descEl.textContent = 'Active. Push notifications are successfully enabled.';
      } else {
        descEl.textContent = 'Permission granted but device token is missing — tap Re-register.';
        iconWrap.style.background = 'var(--yellow)';
      }
      btnEl.style.display = 'block';
      btnEl.textContent = token ? 'Turn Off' : 'Re-register';
      btnEl.onclick = async () => {
        if (token) {
          // Turn Off path
          apiFetch(`${window.API}/api/fcm/token`, {
            method: 'DELETE',
            body: JSON.stringify({ token })
          }).catch(err => console.warn('Failed to delete token on manual mute:', err));
          localStorage.setItem('fcmNotificationsDisabled', 'true');
          localStorage.removeItem('fcmToken');
          renderFcmBannerState();
          showToast('Notifications disabled for this device.', 'info');
        } else {
          // Re-register path — force a fresh token
          localStorage.removeItem('fcmNotificationsDisabled');
          await initPushNotifications(true);
        }
      };
    }
  } else if (permission === 'denied') {
    iconWrap.style.background = 'var(--red)';
    iconWrap.innerHTML = '<i data-lucide="bell-off" style="width: 20px; height: 20px; color: #fff;"></i>';
    titleEl.textContent = 'Notifications: Blocked';
    descEl.textContent = 'Access was denied. Please click the padlock icon in your browser address bar to allow.';
    btnEl.style.display = 'block';
    btnEl.textContent = 'How to Enable';
    btnEl.onclick = () => {
      showToast('Click the padlock/settings icon next to the URL in your browser bar, toggle Notifications to ALLOW, and reload.', 'info');
    };
  }

  if (window.lucide) lucide.createIcons({ root: banner });
}

async function toggleGroupMuteStatus(groupId) {
  const mutedGroupsStr = localStorage.getItem('userMutedGroups') || '[]';
  let mutedGroups = [];
  try {
    mutedGroups = JSON.parse(mutedGroupsStr);
  } catch (e) {
    mutedGroups = [];
  }

  const isMuted = mutedGroups.includes(String(groupId));
  const newMuteState = !isMuted;

  if (newMuteState) {
    mutedGroups.push(String(groupId));
  } else {
    mutedGroups = mutedGroups.filter(id => id !== String(groupId));
  }

  localStorage.setItem('userMutedGroups', JSON.stringify(mutedGroups));

  // Update button UI snappily
  const btn = document.getElementById(`mute-btn-${groupId}`);
  if (btn) {
    btn.style.background = newMuteState ? 'var(--red)' : 'var(--bg-card)';
    btn.title = newMuteState ? 'Unmute notifications' : 'Mute notifications';
    btn.innerHTML = `<i data-lucide="${newMuteState ? 'bell-off' : 'bell'}" style="width: 18px; height: 18px; color: ${newMuteState ? '#fff' : 'var(--black)'};"></i>`;
    if (window.lucide) lucide.createIcons({ root: btn });
  }

  try {
    await apiFetch(`${window.API}/api/fcm/mute`, {
      method: 'POST',
      body: JSON.stringify({ groupId, mute: newMuteState })
    });
    showToast(newMuteState ? 'Notifications muted for this group' : 'Notifications enabled for this group', 'success');
  } catch (err) {
    console.error('Failed to toggle group mute status:', err);
    showToast('Failed to save mute settings on server', 'error');
  }
}

function triggerChatPushNotification(text, hasMedia, mediaType) {
  if (!activeChatGroupId) return;
  const userName = localStorage.getItem('window.userName') || 'User';

  apiFetch(`${window.API}/api/fcm/notify-chat`, {
    method: 'POST',
    body: JSON.stringify({
      groupId: activeChatGroupId,
      senderName: window.userName,
      text: text,
      hasMedia: hasMedia,
      mediaType: mediaType
    })
  }).catch(err => {
    console.warn('Failed to dispatch background FCM notification:', err);
  });
}

async function openQuickViewByMemberId(memberId, memberName) {
  try {
    const userId = window.userId;
    if (memberId === window.userId) {
      const myUsername = localStorage.getItem('userUsername');
      if (myUsername) return openQuickView(myUsername);
    }
    if (typeof window.allJoinedGroups !== 'undefined' && window.allJoinedGroups) {
      const group = window.allJoinedGroups.find(g => g._id === activeChatGroupId);
      if (group && group.members) {
        const member = group.members.find(m => (m._id || m) === memberId);
        if (member && typeof member === 'object' && member.username) {
          return openQuickView(member.username);
        }
      }
    }
    showToast(`Profile link unavailable for older messages by ${memberName}.`, 'info');
  } catch (err) { console.error('Fallback error:', err); }
}

let chatObserver = null;
function setupChatInfiniteScroll() {
  if (chatObserver) return;
  const loadMoreTrigger = document.getElementById('chat-load-more-container');
  if (!loadMoreTrigger) return;

  chatObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && activeChatGroupId && !isPaginating) {
      const msgsList = document.getElementById('chat-messages-list');
      if (msgsList && msgsList.children.length >= 30) {
        loadMoreChatMessages();
      }
    }
  }, { threshold: 0.1 });
  
  chatObserver.observe(loadMoreTrigger);
}

/** ── PURGE FIRESTORE DATA ON DELETE ── **/
async function deleteFirestoreGroupData(groupId) {
  const { firebaseDb, firestore } = window;
  if (!firebaseDb || !firestore) return;

  try {
    // 1. Delete typing indicators
    const typingRef = firestore.collection(firebaseDb, 'group_chats', groupId, 'typing');
    const typingSnap = await firestore.getDocs(typingRef);
    const typingPromises = typingSnap.docs.map(doc => firestore.deleteDoc(doc.ref));
    await Promise.all(typingPromises);

    // 2. Delete all messages
    const msgsRef = firestore.collection(firebaseDb, 'group_chats', groupId, 'messages');
    const msgsSnap = await firestore.getDocs(msgsRef);
    
    const mediaUrls = [];
    msgsSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.mediaUrl) mediaUrls.push(data.mediaUrl);
    });

    if (mediaUrls.length > 0) {
      await apiFetch(`${window.API}/api/auth/chat-media`, {
        method: 'DELETE',
        body: JSON.stringify({ urls: mediaUrls })
      }).catch(e => console.warn('Group media purge failed:', e));
    }

    const msgsPromises = msgsSnap.docs.map(doc => firestore.deleteDoc(doc.ref));
    await Promise.all(msgsPromises);
  } catch (err) {
    console.error('Error purging Firestore group data:', err);
  }
}

/** ── MEDIA UPLOAD & COMPRESSION LOGIC ── **/

function togglePlusMenu() {
  const menu = document.getElementById('chat-plus-menu');
  const icon = document.getElementById('chat-plus-icon');
  if (menu.classList.contains('active')) {
    menu.classList.remove('active');
    icon.style.transform = 'rotate(0deg)';
  } else {
    menu.classList.add('active');
    icon.style.transform = 'rotate(45deg)';
  }
}

// Close menu if clicking outside
document.addEventListener('click', (e) => {
  const menu = document.getElementById('chat-plus-menu');
  const btn = document.getElementById('chat-plus-btn');
  if (menu && menu.classList.contains('active') && !menu.contains(e.target) && !btn.contains(e.target)) {
    togglePlusMenu();
  }
});

async function handleAudioSelect(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  e.target.value = '';

  // Check rate limit
  if (audioFileLimitRemaining <= 0) {
    return showToast('Audio file upload limit exceeded! Wait until next hour.', 'error');
  }

  const file = files[0];
  const maxSize = 2 * 1024 * 1024; // STRICT 2MB LIMIT
  if (file.size > maxSize) {
    return showToast('Audio file too large (Max 2MB).', 'warn');
  }

  const duration = await getAudioDuration(file).catch(() => null);

  showToast('Compressing audio file...', 'info');
  try {
    const compressedBlob = await compressAudioFile(file);
    selectedMediaBlobs.push({ blob: compressedBlob, type: 'audio', duration, source: 'upload' });
    showToast('Audio file compressed!', 'success');
  } catch (err) {
    console.error('Audio compression failed, falling back to original:', err);
    selectedMediaBlobs.push({ blob: file, type: 'audio', duration, source: 'upload' });
  }
  renderMediaPreviews();
}

/** ── AUDIO COMPRESSION HELPER ── **/
async function compressAudioFile(file) {
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

async function getAudioDuration(file) {
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

async function startAudioRecording() {
  if (isRecording) return;
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Check supported mime types
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
      ? 'audio/webm;codecs=opus' 
      : 'audio/webm';
      
    mediaRecorder = new MediaRecorder(stream, { 
      mimeType,
      audioBitsPerSecond: 32000 // High quality for voice but very small file size
    });
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      if (!isRecording && audioChunks.length === 0) return;

      if (audioChunks.length > 0) {
        const audioBlob = new Blob(audioChunks, { type: mimeType });
        const duration = (Date.now() - recordingStartTime) / 1000;
        selectedMediaBlobs.push({ blob: audioBlob, type: 'audio', duration, source: 'recording' });
        renderMediaPreviews();
      }
      
      stream.getTracks().forEach(track => track.stop());
    };

    isRecording = true;
    mediaRecorder.start();
    recordingStartTime = Date.now();
    
    document.getElementById('chat-recorder-ui').style.display = 'flex';
    document.getElementById('chat-form').style.display = 'none';
    
    recordingInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
      const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const secs = (elapsed % 60).toString().padStart(2, '0');
      document.getElementById('recorder-timer').textContent = `${mins}:${secs}`;
      
      if (elapsed >= 60) {
        stopAudioRecording();
      }
    }, 1000);

  } catch (err) {
    console.error('Recording error:', err);
    showToast('Could not access microphone.', 'error');
  }
}

function stopAudioRecording() {
  if (!isRecording) return;
  isRecording = false;
  clearInterval(recordingInterval);
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  document.getElementById('chat-recorder-ui').style.display = 'none';
  document.getElementById('chat-form').style.display = 'flex';
  document.getElementById('recorder-timer').textContent = '00:00';
}

function cancelAudioRecording() {
  if (!isRecording) return;
  isRecording = false;
  clearInterval(recordingInterval);
  audioChunks = [];
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  document.getElementById('chat-recorder-ui').style.display = 'none';
  document.getElementById('chat-form').style.display = 'flex';
  document.getElementById('recorder-timer').textContent = '00:00';
  showToast('Recording cancelled.', 'info');
}

async function handleMediaSelect(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  // Reset input so the same files can be selected again if removed
  e.target.value = '';

  // 1. Check if total count exceeds remaining limit
  if (files.length > imageLimitRemaining) {
    return showToast(`Limit exceeded! You only have ${imageLimitRemaining} photo uploads left this hour.`, 'error');
  }

  // 2. Check batch limit (Max 20 at once)
  if (files.length > 20) {
    return showToast('Max 20 images allowed at once.', 'warn');
  }

  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const maxSize = 10 * 1024 * 1024; // 10MB

  // 3. Validate all files first
  for (const file of files) {
    if (!allowedTypes.includes(file.type)) {
      return showToast(`Invalid format in batch: ${file.name}`, 'warn');
    }
    if (file.size > maxSize) {
      return showToast(`File too large (>10MB): ${file.name}`, 'warn');
    }
  }

  showToast(`Processing ${files.length} images...`, 'info');
  
  try {
    for (const file of files) {
      await processImage(file);
    }
  } catch (err) {
    console.error('Media processing error:', err);
    showToast('Failed to process some media.', 'error');
  }
}

async function processImage(file) {
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

  canvas.toBlob((blob) => {
    selectedMediaBlobs.push({ blob, type: 'image' });
    renderMediaPreviews();
    showToast('Image processed!', 'success');
  }, 'image/webp', 0.75);
}

async function processGif(file) {
  selectedMediaBlobs.push({ blob: file, type: 'image' });
  renderMediaPreviews();
  showToast('GIF selected!', 'success');
}

function renderMediaPreviews() {
  const container = document.getElementById('chat-media-preview');
  if (!container) return;
  
  if (selectedMediaBlobs.length === 0) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.style.display = 'flex';
  container.style.flexWrap = 'wrap';
  container.style.gap = '10px';
  container.style.padding = '12px 0';

  container.innerHTML = selectedMediaBlobs.map((item, index) => {
    const url = item.type === 'audio' ? '' : URL.createObjectURL(item.blob);
    const content = item.type === 'audio' 
      ? `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:var(--bg-muted);"><i data-lucide="mic" style="width:24px; height:24px;"></i></div>`
      : `<img src="${url}" style="width:100%; height:100%; object-fit:cover;" />`;
      
    return `
      <div class="chat-media-preview-item" style="position:relative; width:65px; height:65px; border:3px solid var(--black); border-radius:8px; overflow:hidden; box-shadow: 2px 2px 0 var(--black);">
        ${content}
        <div class="chat-media-remove" onclick="removeMediaItem(${index})" style="position:absolute; top:2px; right:2px; background:var(--red); color:#fff; width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; cursor:pointer; font-weight:900; border:2px solid var(--black);">✕</div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons({ root: container });
}

function removeMediaItem(index) {
  selectedMediaBlobs.splice(index, 1);
  renderMediaPreviews();
}

function clearMediaPreview() {
  selectedMediaBlobs = [];
  renderMediaPreviews();
}

async function uploadMediaToCloudinary(blob, type, source = 'recording') {
  const formData = new FormData();
  let filename = 'media.webp';
  if (type === 'video') filename = 'animation.webm';
  if (type === 'audio') filename = 'voice.webm';
  
  formData.append('file', blob, filename);

  const res = await apiFetch(`${window.API}/api/auth/chat-media`, {
    method: 'POST',
    headers: {
      'X-Media-Type': type,
      'X-Media-Source': source || 'recording'
    },
    body: formData,
    timeout: 120000 // 2 minutes for media uploads
  });

  return res.secure_url;
}

/** ── BULK DELETE BY TIME RANGE (OWNER ONLY) ── **/
function openBulkDeleteModal() {
  // Clear previous values
  document.getElementById('bulk-delete-start').value = '';
  document.getElementById('bulk-delete-end').value = '';
  document.getElementById('bulk-delete-confirm-check').checked = false;
  openModal('modal-bulk-delete');
}

async function executeBulkDelete() {
  if (!activeChatGroupId) return;
  
  const startStr = document.getElementById('bulk-delete-start').value;
  const endStr = document.getElementById('bulk-delete-end').value;
  const confirmed = document.getElementById('bulk-delete-confirm-check').checked;

  if (!startStr || !endStr) {
    return showToast('Please select both start and end times.', 'warn');
  }
  if (!confirmed) {
    return showToast('Please confirm that you understand the consequences.', 'warn');
  }

  const startDate = new Date(startStr);
  const endDate = new Date(endStr);

  if (endDate <= startDate) {
    return showToast('End time must be after start time.', 'warn');
  }

  const btn = document.getElementById('btn-execute-bulk-delete');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-inline"></span> Deleting...';

  const { firebaseDb, firestore } = window;
  if (!firebaseDb || !firestore) {
    btn.disabled = false;
    btn.innerHTML = originalText;
    return showToast('Cannot bulk delete while offline.', 'error');
  }
  try {
    const msgsRef = firestore.collection(firebaseDb, 'group_chats', activeChatGroupId, 'messages');
    
    // Query messages within range
    const q = firestore.query(
      msgsRef,
      firestore.orderBy('timestamp', 'asc'),
      firestore.where('timestamp', '>=', startDate),
      firestore.where('timestamp', '<=', endDate)
    );

    const snapshot = await firestore.getDocs(q);
    if (snapshot.empty) {
      showToast('No messages found in this time range.', 'info');
      btn.disabled = false;
      btn.innerHTML = originalText;
      return;
    }

    // Collect all media URLs to delete from Cloudinary
    const mediaUrls = [];
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.mediaUrl) mediaUrls.push(data.mediaUrl);
    });

    if (mediaUrls.length > 0) {
      await apiFetch(`${window.API}/api/auth/chat-media`, {
        method: 'DELETE',
        body: JSON.stringify({ urls: mediaUrls })
      }).catch(e => console.warn('Bulk media deletion failed:', e));
    }

    const deletePromises = snapshot.docs.map(doc => firestore.deleteDoc(doc.ref));
    await Promise.all(deletePromises);

    showToast(`Successfully deleted ${snapshot.size} messages and associated media.`, 'success');
    closeModal('modal-bulk-delete');
  } catch (err) {
    console.error('Bulk delete error:', err);
    showToast('Error performing bulk delete.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

/** ── REAL-TIME PRESENCE (WHO'S ONLINE) ── **/

async function updatePresence(groupId, isOnline) {
  if (!groupId) return;
  const { firebaseRtdb, rtdb } = window;
  if (!firebaseRtdb || !rtdb) return;
  const userId = window.userId;
  const userName = localStorage.getItem('window.userName');
  const userPic = localStorage.getItem('window.userProfilePicture');
  
  const presenceRef = rtdb.ref(firebaseRtdb, `presence/${groupId}/${window.userId}`);
  
  try {
    if (isOnline) {
      const updateData = { userId: window.userId,
        name: window.userName,
        profilePicture: userPic || '',
        lastSeen: rtdb.serverTimestamp()
      };
      await rtdb.set(presenceRef, updateData);
      rtdb.onDisconnect(presenceRef).remove();

      if (!presenceHeartbeatInterval) {
        presenceHeartbeatInterval = setInterval(() => {
          if (document.visibilityState === 'visible') {
            updatePresence(groupId, true);
          }
        }, 30000); // 30s heartbeat
      }
    } else {
      await rtdb.remove(presenceRef);
    }
  } catch (err) {
    // Fail silently
  }
}

function subscribeToPresence(groupId) {
  if (presenceUnsubscribe) {
    if (typeof presenceUnsubscribe === 'function') presenceUnsubscribe();
    presenceUnsubscribe = null;
  }
  
  const { firebaseRtdb, rtdb } = window;
  if (!firebaseRtdb || !rtdb) return;
  const presenceRef = rtdb.ref(firebaseRtdb, `presence/${groupId}`);
  const myId = window.userId;
  
  presenceUnsubscribe = rtdb.onValue(presenceRef, (snapshot) => {
    const now = Date.now();
    const activeViewers = [];
    
    snapshot.forEach(child => {
      if (child.key === myId) return; // Exclude self
      
      const data = child.val();
      const lastSeen = data.lastSeen || now;
      
      // Tightened: Only count users active in the last 75 seconds
      if (now - lastSeen < 75000) {
        activeViewers.push(data);
      }
    });
    
    renderPresenceUI(activeViewers);
  });
}

// Handle PWA/Mobile App Backgrounding and Closure
window.addEventListener('pagehide', () => {
  if (activeChatGroupId) updatePresence(activeChatGroupId, false);
});

document.addEventListener('visibilitychange', () => {
  const isVisible = document.visibilityState === 'visible';
  if (activeChatGroupId) {
    updatePresence(activeChatGroupId, isVisible);
  }
});

function renderPresenceUI(viewers) {
  const container = document.getElementById('chat-presence-container');
  if (!container) return;

  const count = viewers.length;
  if (count <= 0) {
    container.innerHTML = `
      <span class="blink" style="width: 8px; height: 8px; background: var(--green); border-radius: 50%; border: 1px solid var(--black);"></span>
      <p class="chat-online-count" style="margin:0;">Live Feed</p>
    `;
    return;
  }

  // Build Avatar Stack
  let facePileHtml = '<div class="chat-face-pile">';
  viewers.slice(0, 3).forEach(v => {
    if (v.profilePicture) {
      facePileHtml += `<img src="${v.profilePicture}" title="${escHtml(v.name)}" />`;
    } else {
      facePileHtml += `<div class="mini-avatar" title="${escHtml(v.name)}" style="background:var(--yellow); display:flex; align-items:center; justify-content:center; font-size:8px; font-weight:900;">${v.name ? v.name.charAt(0).toUpperCase() : '?'}</div>`;
    }
  });
  facePileHtml += '</div>';

  container.innerHTML = `
    <span class="blink" style="width: 8px; height: 8px; background: var(--green); border-radius: 50%; border: 1px solid var(--black);"></span>
    <p class="chat-online-count" style="margin:0;">${count} Online</p>
    ${facePileHtml}
    ${count > 3 ? `<span style="font-size:10px; font-weight:800; color:var(--text-muted); margin-left:4px;">+${count-3}</span>` : ''}
  `;
}

/** Proactively cache profile and leaderboard for offline access */
let _lastSyncTime = parseInt(localStorage.getItem('lastProactiveSyncTime') || '0');
/**
 * Full reconciliation between local IndexedDB and Server IDs.
 * Prunes any "zombie" records that no longer exist on the server.
 */
async function reconcileAllData() {
  if (!navigator.onLine) return false;
  const userId = window.userId;
  if (!window.userId) return false;

  console.log('🔄 Starting full sync reconciliation...');
  try {
    const serverAudit = await apiFetch(`${window.API}/api/sync/audit`);
    if (!serverAudit) return false;

    const db = window.localDb;
    let anyDeleted = false;

    // Define tables to reconcile
    const tables = [
      { name: 'days',         serverIds: serverAudit.days },
      { name: 'goals',        serverIds: serverAudit.goals },
      { name: 'achievements', serverIds: serverAudit.achievements },
      { name: 'groups',       serverIds: serverAudit.groups },
      { name: 'templates',    serverIds: serverAudit.templates },
      { name: 'badges',       serverIds: serverAudit.badges }
    ];

    for (const table of tables) {
      const localRecords = await db[table.name].toArray();
      const serverIdSet  = new Set(table.serverIds);

      // Filter out temporary (unsynced) records and records that still exist on server
      const toDelete = localRecords
        .filter(rec => {
          const id = rec._id;
          // Don't delete if it's a temp ID (not synced yet)
          if (String(id).startsWith('temp_')) return false;
          // Don't delete if it's in the server's master list
          if (serverIdSet.has(id)) return false;
          return true;
        })
        .map(rec => rec._id);

      if (toDelete.length > 0) {
        console.log(`🗑️ Reconciliation: Deleting ${toDelete.length} zombie records from ${table.name}`);
        await db[table.name].bulkDelete(toDelete);
        anyDeleted = true;
      }
    }

    if (anyDeleted) {
      console.log('✅ Reconciliation complete. Purged zombie data.');
    }
    return anyDeleted;
  } catch (err) {
    console.warn('Sync reconciliation failed:', err);
    return false;
  }
}

async function proactiveSync(force = false) {
  if (!navigator.onLine) return;
  
  if (window.syncManager && window.syncManager.isProcessing) {
    await window.syncManager.processQueue();
  }
  
  // Throttle: Only sync once every 5 minutes unless forced
  const now = Date.now();
  if (!force && (now - _lastSyncTime < 5 * 60 * 1000)) {
    return;
  }
  _lastSyncTime = now;
  localStorage.setItem('lastProactiveSyncTime', now.toString());

  const userId = window.userId;
  if (!window.userId) return;

  try {
    const localDb = window.localDb;
    if (!localDb) return;

    // 0. Reconcile deleted data first
    const itemsDeleted = await reconcileAllData();

    // 1. Sync Profile & Config
    await fetchConfig();
    await fetchAiLimit();
    const profile = await apiFetch(`${window.API}/api/auth/settings`);
    if (profile) {
      profile.userId = window.userId;
      if (profile.mutedGroups) {
        localStorage.setItem('userMutedGroups', JSON.stringify(profile.mutedGroups.map(g => String(g._id || g))));
      } else {
        localStorage.setItem('userMutedGroups', '[]');
      }
      if (profile.isPremium !== undefined) {
        localStorage.setItem('isPremium', profile.isPremium.toString());
        localStorage.setItem('subscriptionTier', profile.isPremium ? 'premium' : 'free');
      }
      await cacheProfileImagesOffline(profile);
      await localDb.userProfile.put(profile);
      
      if (typeof window.checkChangelogNotifications === 'function') {
        window.checkChangelogNotifications(profile);
      }
      
      // Initialize FCM real-time chat push notifications
      initPushNotifications();

      // Update showcase toggles from server response
      const showcaseToggle = document.getElementById('leaderboard-showcase-settings-toggle');
      if (showcaseToggle) showcaseToggle.checked = profile.showOnLeaderboard !== false;
      const lbShowcaseToggle = document.getElementById('leaderboard-showcase-toggle');
      if (lbShowcaseToggle) lbShowcaseToggle.checked = profile.showOnLeaderboard !== false;

      localStorage.setItem('showOnLeaderboard', (profile.showOnLeaderboard !== false).toString());

      // Apply profile updates to UI
      if (profile.theme && localStorage.getItem('theme') !== profile.theme) {
        if (typeof window.toggleAppTheme === 'function') {
          window.toggleAppTheme(profile.theme, true);
        }
      }
      if (profile.profilePicture) {
        window.userProfilePicture = profile.profilePicture;
        localStorage.setItem('window.userProfilePicture', window.userProfilePicture);
      }
      if (profile.name) {
        window.userName = profile.name;
        localStorage.setItem('window.userName', profile.name);
        const chipName = document.getElementById('user-chip-name');
        if (chipName) chipName.textContent = profile.name;
      }
      if (profile.username) {
        localStorage.setItem('userUsername', profile.username);
      }
      if (profile.currentStreak !== undefined) {
        localStorage.setItem('userCurrentStreak', profile.currentStreak);
      }
      if (profile.highestStreak !== undefined) {
        localStorage.setItem('userHighestStreak', profile.highestStreak);
      }
      updateNavAvatar();
    }

    // 2. Sync Leaderboard (Top 10 of each sort)
    const current = await apiFetch(`${window.API}/api/users/leaderboard?sort=current&page=1&limit=10`);
    if (current && current.users) {
      await window.localDb.leaderboard.put({ sort: 'current', users: current.users, timestamp: Date.now() });
    }
    const highest = await apiFetch(`${window.API}/api/users/leaderboard?sort=highest&page=1&limit=10`);
    if (highest && highest.users) {
      await window.localDb.leaderboard.put({ sort: 'highest', users: highest.users, timestamp: Date.now() });
    }

    // 3. Sync Days (Only if forced or not already populated by loadDays)
    if (force || !window.allDays || window.allDays.length === 0) {
      const daysData = await apiFetch(`${window.API}/api/days?page=1&limit=${window.daysPerPage || 30}`);
      if (daysData && daysData.days) {
        // Preserve local-only changes (those not yet synced)
        const localOnly = await window.localDb.syncQueue.where('entity').equals('days').toArray();
        const localIds = localOnly.map(q => q.targetId);
        
        const toUpdate = daysData.days.filter(d => !localIds.includes(d._id));
        await window.localDb.days.bulkPut(toUpdate);
        
        // Update in-memory state if on first page
        if (window.currentPage === 1) {
          window.allDays = (await window.localDb.days.toArray()).sort((a,b) => b.date.localeCompare(a.date)).slice(0, window.daysPerPage || 30);
          renderDays();
          updateStreak();
        }
      }
    }

    // 4. Sync Goals
    const goals = await apiFetch(`${window.API}/api/goals`);
    if (goals) {
      const pendingGoalItems = await localDb.syncQueue
        .filter(x => x.entity === 'goals')
        .toArray();
      const pendingIds = new Set(pendingGoalItems.map(q => q.targetId).filter(Boolean));
      const pendingLocalIds = new Set(pendingGoalItems.map(q => q.localId).filter(Boolean));

      const safeToUpdate = goals.filter(g => !pendingIds.has(g._id));
      const localGoals = await localDb.goals.toArray();
      const toDelete = localGoals
        .filter(g => !pendingIds.has(g._id) && !pendingLocalIds.has(g._id))
        .map(g => g._id);
      
      await localDb.goals.bulkDelete(toDelete);
      await localDb.goals.bulkPut(safeToUpdate);

      // Reconstruct final window.allGoals in memory
      const localPendingGoals = await Promise.all(
        [...pendingIds, ...pendingLocalIds].map(id => localDb.goals.get(id))
      );
      const localPendingMap = new Map();
      localPendingGoals.filter(Boolean).forEach(g => localPendingMap.set(g._id, g));

      window.allGoals = goals.map(sg => localPendingMap.get(sg._id) || sg);
      for (const [id, goal] of localPendingMap) {
        if (!window.allGoals.find(g => g._id === id)) {
          window.allGoals.push(goal);
        }
      }
      
      sortGoals();
    }

    // 5. Sync Achievements
    const achs = await apiFetch(`${window.API}/api/achievements`);
    if (achs && achs.achievements) {
      const serverAchs = achs.achievements;
      const pendingAchItems = await localDb.syncQueue
        .filter(x => x.entity === 'achievements')
        .toArray();
      const pendingIds = new Set(pendingAchItems.map(q => q.targetId).filter(Boolean));
      const pendingLocalIds = new Set(pendingAchItems.map(q => q.localId).filter(Boolean));

      const safeToUpdate = serverAchs.filter(a => !pendingIds.has(a._id));
      const localAchs = await localDb.achievements.toArray();
      const toDelete = localAchs
        .filter(a => !pendingIds.has(a._id) && !pendingLocalIds.has(a._id))
        .map(a => a._id);
      
      await localDb.achievements.bulkDelete(toDelete);
      await localDb.achievements.bulkPut(safeToUpdate);

      // Reconstruct final window.allAchievements in memory
      const localPendingAchs = await Promise.all(
        [...pendingIds, ...pendingLocalIds].map(id => localDb.achievements.get(id))
      );
      const localPendingMap = new Map();
      localPendingAchs.filter(Boolean).forEach(a => localPendingMap.set(a._id, a));

      window.allAchievements = serverAchs.map(sa => localPendingMap.get(sa._id) || sa);
      for (const [id, ach] of localPendingMap) {
        if (!window.allAchievements.find(a => a._id === id)) {
          window.allAchievements.push(ach);
        }
      }
    }

    // Sync templates for offline task creation
    const templates = await apiFetch(`${window.API}/api/templates`);
    if (window.localDb) {
      await window.localDb.templates.clear();
      await window.localDb.templates.bulkPut(templates);
    }

    // If reconciliation or sync changed data, force a UI refresh
    if (itemsDeleted) {
      if (typeof window.renderDays === 'function') renderDays();
      if (typeof window.loadGoals === 'function') loadGoals();
      if (typeof window.loadAchievements === 'function') loadAchievements();
      if (typeof loadGroups === 'function') loadGroups();
      if (typeof loadTemplates === 'function') loadTemplates();
      updateStreak();
    }

    console.log('Proactive sync complete');
  } catch (err) {
    console.warn('Proactive sync partial fail:', err);
  }
}





// ── Chat Module Bindings ─────────────────────────────────
window.fetchMediaLimit = fetchMediaLimit;
window.updateMediaLimitDisplay = updateMediaLimitDisplay;
window.openGroupChat = openGroupChat;
window.subscribeToActiveVideoCall = subscribeToActiveVideoCall;
window.updateVideoCallUI = updateVideoCallUI;
window.loadMoreChatMessages = loadMoreChatMessages;
window.getFriendlyDate = getFriendlyDate;
window.renderChatMessage = renderChatMessage;
window.insertMessageSorted = insertMessageSorted;
window.initSwipeToReply = initSwipeToReply;
window.buttonsHtmlToElement = buttonsHtmlToElement;
window.closeChatModal = closeChatModal;
window.startGroupVideoCall = startGroupVideoCall;
window.closeVideoCall = closeVideoCall;
window.switchVideoCamera = switchVideoCamera;
window.updateExistingMessage = updateExistingMessage;
window.handleChatSubmit = handleChatSubmit;
window.startEditChatMessage = startEditChatMessage;
window.cancelEditChatMessage = cancelEditChatMessage;
window.submitEditChatMessage = submitEditChatMessage;
window.toggleReaction = toggleReaction;
window.deleteChatMessage = deleteChatMessage;
window.renderReactionsHTML = renderReactionsHTML;
window.toggleReactionPicker = toggleReactionPicker;
window.showReactionUsers = showReactionUsers;
window.setReplyTo = setReplyTo;
window.initLazyLoading = initLazyLoading;
window.initReadTracker = initReadTracker;
window.triggerManualReadCheck = triggerManualReadCheck;
window.throttledUpdateReadStatus = throttledUpdateReadStatus;
window.subscribeToReadStatuses = subscribeToReadStatuses;
window.updateExistingTicks = updateExistingTicks;
window.updateMessageInDOM = updateMessageInDOM;
window.calculateBlueStatus = calculateBlueStatus;
window.clearReply = clearReply;
window.scrollToMessage = scrollToMessage;
window.handleTyping = handleTyping;
window.updateTypingStatus = updateTypingStatus;
window.listenForTyping = listenForTyping;
window.renderTypingIndicator = renderTypingIndicator;
window.initFirebaseChat = initFirebaseChat;
window.initPushNotifications = initPushNotifications;
window.renderFcmBannerState = renderFcmBannerState;
window.toggleGroupMuteStatus = toggleGroupMuteStatus;
window.triggerChatPushNotification = triggerChatPushNotification;
window.openQuickViewByMemberId = openQuickViewByMemberId;
window.setupChatInfiniteScroll = setupChatInfiniteScroll;
window.deleteFirestoreGroupData = deleteFirestoreGroupData;
window.togglePlusMenu = togglePlusMenu;
window.handleAudioSelect = handleAudioSelect;
window.handleMediaSelect = handleMediaSelect;
window.startAudioRecording = startAudioRecording;
window.stopAudioRecording = stopAudioRecording;
window.cancelAudioRecording = cancelAudioRecording;
window.openBulkDeleteModal = openBulkDeleteModal;
window.executeBulkDelete = executeBulkDelete;
window.removeMediaItem = removeMediaItem;
window.clearMediaPreview = clearMediaPreview;
window.proactiveSync = proactiveSync;

function triggerChatCameraCapture() {
  if (window.startCameraCapture) {
    window.startCameraCapture((file) => {
      const mockEvent = {
        target: {
          files: [file],
          value: ''
        }
      };
      handleMediaSelect(mockEvent);
    });
  } else {
    const input = document.getElementById('chat-camera-input');
    if (input) input.click();
  }
}
window.triggerChatCameraCapture = triggerChatCameraCapture;

console.log("[Module] chat.js loaded and Chat functions bound to window");
