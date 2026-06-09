// ── Groups Module ─────────────────────────────────────────
console.log("[Module] groups.js initializing...");

// Local toast reference delegation to bypass strict module scope reference errors
const showToast = (...args) => window.showToast(...args);

let allGroups = [];

let allJoinedGroups = []; window.allJoinedGroups = allJoinedGroups;
let availablePublicGroups = [];

let _lastGroupsLoad = 0;
async function loadGroups() {
  const now = Date.now();
  if (now - _lastGroupsLoad < 30000 && allJoinedGroups.length > 0) return;
  _lastGroupsLoad = now;
  const localDb = window.localDb;
  if (!localDb) return;
  const container = document.getElementById('groups-container');

  // 1. STALE: Load from IndexedDB
  try {
    const cached = await localDb.groups.toArray();
    if (cached.length > 0) {
      allJoinedGroups = cached; window.allJoinedGroups = allJoinedGroups;
      renderGroups();
    } else {
      container.innerHTML = `
        <div style="text-align:center; padding:40px; color:var(--text-muted);">
          <p style="font-weight:700; margin-bottom:10px;">No local groups found.</p>
          <p style="font-size:12px;">Syncing with server...</p>
          <div class="loading-spinner" style="margin:20px auto; transform:scale(0.8);"><div class="spinner-ring"></div></div>
        </div>`;
    }
  } catch (err) {
    console.warn('Dexie read error:', err);
  }

  // 2. REVALIDATE: Load from Server (Only if online and non-blocking)
  if (!navigator.onLine) {
    if (allJoinedGroups.length > 0) {
      showToast('Offline: Using cached groups.', 'info');
    } else {
      // Offline with no groups cached: render empty groups state!
      renderGroups();
    }
    return;
  }

  try {
    const [joined, publicGroupsList, limits] = await Promise.all([
      apiFetch(`${window.API}/api/groups/mine`),
      apiFetch(`${window.API}/api/groups/public`),
      apiFetch(`${window.API}/api/groups/creation-limits`).catch(err => {
        console.warn('Failed to load group creation limits:', err);
        return null;
      })
    ]);
    
    if (joined && publicGroupsList) {
      // Filter out any groups that have pending DELETE queue items
      const pendingGroupItems = await localDb.syncQueue
        .filter(x => x.entity === 'groups' && x.method === 'DELETE')
        .toArray();
      const pendingDeleteIds = new Set(
        pendingGroupItems.map(q => q.targetId).filter(Boolean)
      );

      const serverJoined = joined;
      const safeJoined = serverJoined.filter(g => !pendingDeleteIds.has(g._id));

      allJoinedGroups = safeJoined; window.allJoinedGroups = allJoinedGroups;
      availablePublicGroups = publicGroupsList;

      // Sync Local Cache
      await localDb.groups.clear();
      const validGroups = (allJoinedGroups || []).filter(g => g && typeof g === 'object' && g._id);
      await localDb.groups.bulkPut(validGroups);

      updateGroupQuotaUI(limits);
      renderGroups();
    }
  } catch (err) {
    console.warn('Background groups refresh failed:', err);
    if (allJoinedGroups.length === 0) {
      container.innerHTML = `<p style="color:#ef4444;text-align:center">⚠️ Failed to load groups. Check your connection.</p>`;
    }
  }
}


function renderGroups() {
  const container = document.getElementById('groups-container');
  container.innerHTML = '';

  // 1. My Private Teams (owned by me)
  const myPrivateTeams = allJoinedGroups.filter(g => !g.isPublic && String(g.owner._id || g.owner) === String(window.userId));
  // 2. Joined Private Groups (owned by others)
  const joinedPrivate = allJoinedGroups.filter(g => !g.isPublic && String(g.owner._id || g.owner) !== String(window.userId));
  // 3. Joined Public Groups
  const joinedPublic = allJoinedGroups.filter(g => g.isPublic);

  // ── Section 1: My Private Teams ─────────────────────────
  renderGroupSection(container, '<i data-lucide="crown"></i> My Private Teams', myPrivateTeams, true, 'lock', 'Join or create a group to access live chats, share images, and start video calls with your team!');

  // ── Section 2: Joined Private Teams ─────────────────────
  const joinedPrivateSection = document.createElement('div');
  joinedPrivateSection.className = 'groups-section';
  let jpHTML = `
    <div class="groups-section-header">
      <h2 class="groups-section-title"><i data-lucide="link"></i> Joined Private Teams</h2>
      <button class="btn-ghost ripple groups-join-btn" onclick="openJoinGroupModal()">
        <span><i data-lucide="plus"></i></span> Join with Code
      </button>
    </div>
  `;
  if (joinedPrivate.length === 0) {
    jpHTML += `
      <div class="group-empty-card">
        <span class="group-empty-icon"><i data-lucide="users"></i></span>
        <p>Join a group or create one to unlock live chats, video sessions, send images/audio/files, and more!</p>
      </div>
    `;
  } else {
    jpHTML += '<div class="groups-list">';
    for (const group of joinedPrivate) {
      jpHTML += renderSingleGroupCard(group, 'handshake');
    }
    jpHTML += '</div>';
  }
  joinedPrivateSection.innerHTML = jpHTML;
  container.appendChild(joinedPrivateSection);

  // ── Section 3: Joined Public Groups ──────────────────────
  renderGroupSection(container, '<i data-lucide="globe"></i> Joined Public Groups', joinedPublic, false, 'globe', 'Explore public groups to collaborate, chat live, share images/audio/files, and maintain streaks together!');

  if (availablePublicGroups.length > 0) {
    const divider = document.createElement('hr');
    divider.className = 'groups-divider';
    container.appendChild(divider);

    const publicSection = document.createElement('div');
    publicSection.className = 'groups-section';
    let html = `
      <div class="groups-section-header">
        <h2 class="groups-section-title"><i data-lucide="sparkles"></i> Discover Public Groups</h2>
        <button class="btn-ghost ripple groups-join-btn" onclick="openJoinGroupModal()" style="font-size: 11px; padding: 6px 12px; border: 2px solid var(--black); border-radius: 8px;">
          <span><i data-lucide="hash"></i></span> Join via Code
        </button>
      </div>
      <div class="groups-list">
    `;

    for (const group of availablePublicGroups) {
      const iconHtml = group.icon 
        ? `<img src="${group.icon}" onerror="this.onerror=null; this.src='/checklist.png'; this.style.padding='8px'; this.style.background='var(--yellow)';" style="width:40px;height:40px;border-radius:50%;border:2px solid var(--black);object-fit:cover;box-shadow:2px 2px 0 var(--black);cursor:pointer;" onclick="openLightbox(this.src)" />`
        : `<span class="group-emoji"><i data-lucide="globe"></i></span>`;

      const isOwnerBlacklisted = group.owner && group.owner.isBlacklisted && group.ownerBlacklistedAt;
      let warningHtml = '';
      if (isOwnerBlacklisted) {
        const expiryMs = new Date(group.ownerBlacklistedAt).getTime() + (group.groupExpiryMinutes || 60) * 60 * 1000;
        warningHtml = `
          <div class="group-blacklist-warning pulse-red-anim" style="background: rgba(239, 68, 68, 0.08); border: 2px dashed #ef4444; border-radius: 10px; padding: 12px; margin: 12px 0; box-shadow: 2px 2px 0 #ef4444; text-align: left;">
            <div style="display: flex; align-items: center; gap: 8px; color: #ef4444; font-weight: 900; font-size: 13px; text-transform: uppercase;">
              <i data-lucide="alert-triangle" style="width: 16px; height: 16px;"></i>
              <span>Group Creator Banned</span>
            </div>
            <p style="margin: 6px 0; font-size: 13px; color: var(--text-muted); font-weight: 500;">
              The group owner <strong>${escHtml(group.owner.name)}</strong> has been blacklisted. Reason: <em>${escHtml(group.owner.blacklistReason || 'Violation of terms')}</em>
            </p>
            <div class="group-countdown-timer" id="group-countdown-${group._id}" data-expiry="${expiryMs}" style="font-size: 13px; font-weight: 800; color: #ef4444; display: flex; align-items: center; gap: 6px;">
              <i data-lucide="clock" style="width: 14px; height: 14px;"></i>
              <span>This group will be deleted in: --:--:--</span>
            </div>
          </div>
        `;
      }

      let safetyBannerHtml = '';
      if (group.safetyStatus === 'warning') {
        safetyBannerHtml = `
          <div class="group-safety-banner warning" style="background: #fee2e2; border: 2px solid #ef4444; border-radius: 8px; padding: 10px 14px; margin: 10px 0; color: #991b1b; font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 8px; box-shadow: 2px 2px 0 #ef4444; text-align: left;">
            <span style="font-size: 16px; flex-shrink: 0;">⚠️</span>
            <span>This group may be dangerous or promote explicit activities; join at your own risk.</span>
          </div>
        `;
      } else if (group.safetyStatus === 'safe') {
        safetyBannerHtml = `
          <div class="group-safety-banner safe" style="background: #dcfce7; border: 2px solid #22c55e; border-radius: 8px; padding: 10px 14px; margin: 10px 0; color: #166534; font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 8px; box-shadow: 2px 2px 0 #22c55e; text-align: left;">
            <span style="font-size: 16px; flex-shrink: 0;">🛡️</span>
            <span>AI verified: This group seems safe (verify on your own).</span>
          </div>
        `;
      }

      html += `
        <div class="group-card public-discovery-card" style="border-color: var(--green); box-shadow: 4px 4px 0 rgba(34, 197, 150, 0.15);">
          <div class="group-card-top">
            <div class="group-name-wrap">
              ${iconHtml}
              <span class="group-name" style="font-size: 1.25rem;">${escHtml(group.name)}</span>
            </div>
            <span class="group-owner-badge" style="background: var(--bg-muted); border: 1px solid var(--green); color: var(--green); padding: 2px 8px; border-radius: 4px; font-weight: 800; font-size: 10px; text-transform: uppercase;">BY ${escHtml(group.owner.name || 'Admin')}</span>
          </div>
          ${group.description ? `<p class="group-description" style="font-size:15px; color:var(--text-muted); margin:8px 0; line-height:1.4;">${escHtml(group.description)}</p>` : ''}
          
          ${safetyBannerHtml}
          ${warningHtml}

          <p class="group-meta" style="margin-bottom:16px; font-weight: 700; opacity: 0.9;">${group.memberCount || 0} members</p>
          <div style="display: flex; justify-content: center; width: 100%;">
            ${group.hasRequested ? 
              `<button class="btn-primary ripple" style="width: 80%; justify-content: center; background: var(--red); border-color: var(--black); box-shadow: 2px 2px 0 var(--black); padding: 12px; font-size: 16px; font-weight: 800; color: #fff;" onclick="cancelJoinRequest('${group._id}', '${escJs(group.name)}')"><i data-lucide="x-circle"></i> Cancel Request</button>` :
              `<button class="btn-primary ripple" style="width: 80%; justify-content: center; background: var(--green); border-color: var(--black); box-shadow: 2px 2px 0 var(--black); padding: 12px; font-size: 16px; font-weight: 800;" onclick="joinPublicGroup('${group._id}', '${escJs(group.name)}')"><i data-lucide="user-plus"></i> Request to Join</button>`
            }
          </div>
        </div>
      `;
    }
    html += '</div>';
    publicSection.innerHTML = html;
    container.appendChild(publicSection);
  }

  if (window.gsap) {
    gsap.from('.group-card, .group-empty-card', {
      opacity: 0,
      y: 20,
      duration: 0.45,
      stagger: 0.05,
      ease: 'power2.out',
      clearProps: 'all',
    });
  }
  if (window.lucide) lucide.createIcons({ root: container });
  
  // Dynamically render/update the FCM status banner whenever groups tab is drawn
  if (typeof renderFcmBannerState === 'function') {
    renderFcmBannerState();
  }

  // Clear any existing countdown interval to avoid memory leaks
  if (window.groupCountdownInterval) {
    clearInterval(window.groupCountdownInterval);
    window.groupCountdownInterval = null;
  }

  // Setup live countdown updates for blacklisted owners' groups
  const timers = document.querySelectorAll('.group-countdown-timer');
  if (timers.length > 0) {
    const updateTimers = () => {
      let activeTimers = 0;
      timers.forEach(timer => {
        const expiryTime = parseInt(timer.getAttribute('data-expiry'), 10);
        const remainingMs = expiryTime - Date.now();
        
        if (remainingMs <= 0) {
          timer.querySelector('span').textContent = 'This group has expired and is scheduled for deletion.';
          if (!timer.dataset.triggeredReload) {
            timer.dataset.triggeredReload = 'true';
            setTimeout(() => loadGroups(), 2000);
          }
        } else {
          activeTimers++;
          const seconds = Math.floor((remainingMs / 1000) % 60);
          const minutes = Math.floor((remainingMs / (1000 * 60)) % 60);
          const hours = Math.floor(remainingMs / (1000 * 60 * 60));
          
          const pad = (num) => String(num).padStart(2, '0');
          timer.querySelector('span').textContent = `This group will be deleted in: ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
        }
      });
      if (activeTimers === 0 && window.groupCountdownInterval) {
        clearInterval(window.groupCountdownInterval);
        window.groupCountdownInterval = null;
      }
    };
    
    updateTimers(); // Run once immediately
    window.groupCountdownInterval = setInterval(updateTimers, 1000);
  }
}

function renderGroupSection(container, title, groups, isOwnerSection, emoji, emptyMsg) {
  const section = document.createElement('div');
  section.className = 'groups-section';

  let html = `
    <div class="groups-section-header">
      <h2 class="groups-section-title">${title}</h2>
    </div>
  `;

  if (groups.length === 0) {
    html += `
      <div class="group-empty-card">
        <span class="group-empty-icon"><i data-lucide="${isOwnerSection ? 'construction' : 'users'}"></i></span>
        <p>${emptyMsg}</p>
      </div>
    `;
  } else {
    html += '<div class="groups-list">';
    for (const group of groups) {
      html += renderSingleGroupCard(group, emoji);
    }
    html += '</div>';
  }
  section.innerHTML = html;
  container.appendChild(section);
  if (window.lucide) lucide.createIcons({ root: section });
}

function renderSingleGroupCard(group, emoji) {
  const userId = localStorage.getItem('window.userId');
  const isMyOwned = String(group.owner._id || group.owner) === String(window.userId);
  const isPublic = group.isPublic;
  
  const mutedGroupsStr = localStorage.getItem('userMutedGroups') || '[]';
  let mutedGroups = [];
  try {
    mutedGroups = JSON.parse(mutedGroupsStr);
  } catch (e) {
    mutedGroups = [];
  }
  const isMuted = mutedGroups.includes(String(group._id));
  
  const iconHtml = group.icon 
    ? `<img src="${group.icon}" onerror="this.onerror=null; this.src='/checklist.png'; this.style.padding='8px'; this.style.background='var(--yellow)';" style="width:40px;height:40px;border-radius:50%;border:2px solid var(--black);object-fit:cover;box-shadow:2px 2px 0 var(--black);cursor:pointer;" onclick="openLightbox(this.src)" />`
    : `<span class="group-emoji"><i data-lucide="${emoji}"></i></span>`;

  const isOwnerBlacklisted = group.owner && group.owner.isBlacklisted && group.ownerBlacklistedAt;
  let warningHtml = '';
  if (isOwnerBlacklisted) {
    const expiryMs = new Date(group.ownerBlacklistedAt).getTime() + (group.groupExpiryMinutes || 60) * 60 * 1000;
    warningHtml = `
      <div class="group-blacklist-warning pulse-red-anim" style="background: rgba(239, 68, 68, 0.08); border: 2px dashed #ef4444; border-radius: 10px; padding: 12px; margin: 12px 0; box-shadow: 2px 2px 0 #ef4444;">
        <div style="display: flex; align-items: center; gap: 8px; color: #ef4444; font-weight: 900; font-size: 13px; text-transform: uppercase;">
          <i data-lucide="alert-triangle" style="width: 16px; height: 16px;"></i>
          <span>Group Creator Banned</span>
        </div>
        <p style="margin: 6px 0; font-size: 13px; color: var(--text-muted); font-weight: 500;">
          The group owner <strong>${escHtml(group.owner.name)}</strong> has been blacklisted. Reason: <em>${escHtml(group.owner.blacklistReason || 'Violation of terms')}</em>
        </p>
        <div class="group-countdown-timer" id="group-countdown-${group._id}" data-expiry="${expiryMs}" style="font-size: 13px; font-weight: 800; color: #ef4444; display: flex; align-items: center; gap: 6px;">
          <i data-lucide="clock" style="width: 14px; height: 14px;"></i>
          <span>This group will be deleted in: --:--:--</span>
        </div>
      </div>
    `;
  }

  let safetyBannerHtml = '';
  if (group.safetyStatus === 'warning') {
    safetyBannerHtml = `
      <div class="group-safety-banner warning" style="background: #fee2e2; border: 2px solid #ef4444; border-radius: 8px; padding: 10px 14px; margin: 10px 0; color: #991b1b; font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 8px; box-shadow: 2px 2px 0 #ef4444; text-align: left;">
        <span style="font-size: 16px; flex-shrink: 0;">⚠️</span>
        <span>This group may be dangerous or promote explicit activities; join at your own risk.</span>
      </div>
    `;
  } else if (group.safetyStatus === 'safe') {
    safetyBannerHtml = `
      <div class="group-safety-banner safe" style="background: #dcfce7; border: 2px solid #22c55e; border-radius: 8px; padding: 10px 14px; margin: 10px 0; color: #166534; font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 8px; box-shadow: 2px 2px 0 #22c55e; text-align: left;">
        <span style="font-size: 16px; flex-shrink: 0;">🛡️</span>
        <span>AI verified: This group seems safe (verify on your own).</span>
      </div>
    `;
  }

  return `
    <div class="group-card ${isMyOwned ? 'my-team-card' : ''}" id="group-card-${group._id}">
      <div class="group-card-top">
        <!-- Left Side: Identity & Core Actions -->
        <div class="group-card-left">
          <div class="group-name-wrap">
            ${iconHtml}
            <div style="min-width: 0;">
              <span class="group-name" style="font-size: 1.15rem; font-weight: 800;">${escHtml(group.name)}</span>
              ${!isMyOwned ? `<span class="group-owner-badge" style="border: 1px solid var(--text-muted); padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 9px; text-transform: uppercase;">by ${escHtml(group.owner.name || 'Unknown')}</span>` : ''}
            </div>
          </div>
          
          ${isMyOwned ? `
            <div style="display: flex; gap: 8px; align-items: center;">
              <button class="btn-group-admin" onclick="openEditGroupModal('${group._id}', '${escJs(group.name)}', '${group.icon || ''}', '${escJs(group.description || '')}')">
                <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i> Edit
              </button>
              <button class="btn-group-admin delete" onclick="deleteGroup('${group._id}')">
                <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i> Delete
              </button>
            </div>
          ` : ''}
        </div>

        <!-- Right Side: Access & Metadata -->
        <div class="group-card-right">
          ${isMyOwned ? `
            <div class="team-code-wrap" style="margin: 0;">
              <button class="team-code-pill" style="height: 34px; background: var(--yellow); padding: 0 12px; border: 2px solid #000; box-shadow: 3px 3px 0 #000; display: flex; align-items: center; gap: 8px;" onclick="copyTeamCode('${group.code}')" title="Click to copy">
                <span class="team-code-text" style="font-size: 13px; font-weight: 900; letter-spacing: 1px;">${group.code}</span>
                <i data-lucide="copy" style="width: 14px; height: 14px;"></i>
              </button>
            </div>
          ` : ''}

          ${isMyOwned && group.requests && group.requests.length > 0 ? `
            <button class="btn-ghost ripple" style="height: 34px; padding: 0 14px; font-size: 11px; background: var(--pink); color: #fff; border: 2px solid var(--black); box-shadow: 3px 3px 0 var(--black); font-weight: 900; text-transform: uppercase; display: flex; align-items: center; gap: 8px;" onclick="openRequestsModal('${group._id}')">
              <i data-lucide="user-plus" style="width: 15px; height: 15px;"></i> ${group.requests.length} Request${group.requests.length !== 1 ? 's' : ''}
            </button>
          ` : ''}
        </div>
      </div>
      ${group.description ? `<p class="group-description" style="font-size:15px; color:var(--text-muted); margin:8px 0; line-height:1.4;">${escHtml(group.description)}</p>` : ''}
      
      ${safetyBannerHtml}
      ${warningHtml}

      <!-- Core Chat & Mute Actions -->
      <div style="margin: 12px 0; display: flex; gap: 10px;">
        <button class="btn-primary ripple" style="flex: 1; justify-content: center; background: var(--pink); border-radius: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 4px 4px 0 var(--black); margin: 0;" onclick="openGroupChat('${group._id}', '${escJs(group.name)}', '${group.icon || ''}')">
          <i data-lucide="message-square" style="width: 18px; height: 18px;"></i> Live Chat
        </button>
        <button class="btn-primary ripple" id="mute-btn-${group._id}" style="width: 48px; min-width: 48px; justify-content: center; background: ${isMuted ? 'var(--red)' : 'var(--bg-card)'}; border-radius: 8px; font-weight: 800; box-shadow: 4px 4px 0 var(--black); margin: 0; padding: 0; display: flex; align-items: center;" onclick="toggleGroupMuteStatus('${group._id}')" title="${isMuted ? 'Unmute notifications' : 'Mute notifications'}">
          <i data-lucide="${isMuted ? 'bell-off' : 'bell'}" style="width: 18px; height: 18px; color: ${isMuted ? '#fff' : 'var(--black)'};"></i>
        </button>
      </div>

      <p class="group-meta">${group.members.length} member${group.members.length !== 1 ? 's' : ''}</p>
      <div class="members-row" id="members-row-${group._id}">
        ${buildMembersHTML(group.members, group._id, isMyOwned)}
      </div>
      ${group.members.length > 10 ? `
        <div id="members-load-more-${group._id}" style="margin-top:10px;">
          <button class="btn-ghost ripple" style="font-size:12px; width:100%;" onclick="loadMoreMembers('${group._id}')">Load More Members <i data-lucide="chevron-down"></i></button>
        </div>
      ` : ''}
      ${!isMyOwned ? `
        <div style="margin-top:12px;text-align:right;">
          <button class="btn-ghost ripple" style="color:#ef4444;font-size:13px;padding:6px 12px;" onclick="leaveGroup('${group._id}')"><i data-lucide="log-out"></i> Leave ${isPublic ? 'Group' : 'Team'}</button>
        </div>
      ` : ''}
    </div>
  `;
}

function updateCharCount(inputId, countId, max) {
  const input = document.getElementById(inputId);
  const count = document.getElementById(countId);
  if (!input || !count) return;
  const len = input.value.length;
  count.textContent = `${len} / ${max}`;
  if (len >= max) {
    count.style.color = 'var(--red)';
  } else {
    count.style.color = 'var(--text-muted)';
  }
}

// ── Join Requests Management ──────────────────────────────
async function openRequestsModal(groupId) {
  const container = document.getElementById('requests-list-container');
  container.innerHTML = `<div class="loading-spinner"><div class="spinner-ring"></div><p>Loading requests...</p></div>`;
  openModal('modal-join-requests');

  try {
    const requests = await apiFetch(`${window.API}/api/groups/${groupId}/requests`);
    
    if (requests.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 20px 0;">
          <span class="empty-icon"><i data-lucide="users"></i></span>
          <h3>No pending requests</h3>
          <p>You're all caught up!</p>
        </div>`;
      if (window.lucide) lucide.createIcons({ root: container });
      return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 16px;">';
    for (const r of requests) {
      const u = r.user;
      if (!u) continue;

      const initial = (u.name || '?').charAt(0).toUpperCase();
      const avatarHtml = u.profilePicture 
        ? `<img src="${u.profilePicture}" style="width:40px;height:40px;border-radius:50%;border:2px solid var(--black);object-fit:cover;cursor:pointer;" onclick="openLightbox(this.src)" title="View Photo" />`
        : `<div style="width:40px;height:40px;border-radius:50%;background:var(--pink);border:2px solid var(--black);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;">${initial}</div>`;

      html += `
        <div style="display: flex; flex-direction: column; gap: 8px; padding: 16px; background: var(--bg-muted); border: 2px solid var(--black); border-radius: 12px; box-shadow: 4px 4px 0 var(--black);">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 12px;">
              ${avatarHtml}
              <div>
                <p style="font-weight: 800; margin: 0; cursor:pointer;" onclick="closeModal('modal-join-requests'); openQuickView('${u.username}')" title="View Profile">${escapeHTML(u.name)}</p>
                <p style="font-size: 12px; color: var(--text-muted); margin: 0;">@${escHtml(u.username)}</p>
              </div>
            </div>
            <div style="display: flex; gap: 10px;">
              <button class="btn-primary ripple" style="padding: 8px; background: var(--green); color: var(--black); min-width: 42px; border-radius: 8px; box-shadow: 2px 2px 0 var(--black); border: 2px solid var(--black);" onclick="handleRequest('${groupId}', '${u._id}', 'approve', this)" title="Approve">
                <i data-lucide="check"></i>
              </button>
              <button class="btn-primary ripple" style="padding: 8px; background: var(--red); color: #fff; min-width: 42px; border-radius: 8px; box-shadow: 2px 2px 0 var(--black); border: 2px solid var(--black);" onclick="handleRequest('${groupId}', '${u._id}', 'reject', this)" title="Reject">
                <i data-lucide="x"></i>
              </button>
            </div>
          </div>
          ${r.message ? `
            <div style="margin-top: 8px; padding: 14px; background: var(--bg-card); border: 2px solid var(--black); border-radius: 8px; font-size: 14px; position: relative; box-shadow: inset 2px 2px 0 rgba(0,0,0,0.05);">
              <div style="position: absolute; top: -10px; left: 12px; background: var(--bg-muted); border: 2px solid var(--black); padding: 0 8px; font-size: 10px; font-weight: 900; text-transform: uppercase; color: var(--text); border-radius: 4px;">Message</div>
              <p style="margin: 0; color: var(--text); line-height: 1.5; word-break: break-word; font-weight: 500;">${escHtml(r.message)}</p>
            </div>
          ` : ''}
        </div>
      `;
    }
    html += '</div>';
    container.innerHTML = html;
    if (window.lucide) lucide.createIcons({ root: container });
  } catch (err) {
    container.innerHTML = `<p style="color: var(--red); text-align: center;"><i data-lucide="alert-triangle"></i> Failed to load requests.</p>`;
    if (window.lucide) lucide.createIcons({ root: container });
  }
}

async function handleRequest(groupId, targetUserId, action, btn) {
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i>';
  if (window.lucide) lucide.createIcons({ root: btn });

  try {
    const res = await apiFetch(`${window.API}/api/groups/${groupId}/requests/${targetUserId}`, {
      method: 'POST',
      body: JSON.stringify({ action })
    });

    showToast(res.message, 'success');
    // Reload modal and main groups list
    openRequestsModal(groupId);
    loadGroups(); 
  } catch (err) {
    showToast(err.message || 'Failed to process request.', 'error');
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    if (window.lucide) lucide.createIcons({ root: btn });
  }
}

async function cancelJoinRequest(groupId, groupName) {
  if (!confirm(`Are you sure you want to cancel your join request for "${groupName}"?`)) return;

  try {
    const res = await apiFetch(`${window.API}/api/groups/${groupId}/requests`, {
      method: 'DELETE'
    });

    showToast(res.message, 'success');
    loadGroups(); // Refresh discovery list
  } catch (err) {
    showToast(err.message || 'Failed to cancel request.', 'error');
  }
}

const groupMembersState = {};

async function loadMoreMembers(groupId) {
  if (!groupMembersState[groupId]) {
    groupMembersState[groupId] = { page: 2, limit: 10 }; // We already have the first 5-10 from the initial load? 
    // Actually allJoinedGroups initially has all members because the backend populates them.
    // BUT we want to limit to 5-6 initially for UI performance.
  } else {
    groupMembersState[groupId].page++;
  }

  const btn = document.querySelector(`#members-load-more-${groupId} button`);
  btn.disabled = true; btn.textContent = 'Loading...';

  try {
    const data = await apiFetch(`${window.API}/api/groups/${groupId}/members?page=${groupMembersState[groupId].page}&limit=${groupMembersState[groupId].limit}`);
    const row = document.getElementById(`members-row-${groupId}`);
    
    // Check if we are the owner to show remove buttons
    const group = allJoinedGroups.find(g => g._id === groupId);
    const isOwner = group && String(group.owner._id || group.owner) === String(window.userId);
    
    const newMembersHtml = buildMembersHTML(data.members, groupId, isOwner);
    row.insertAdjacentHTML('beforeend', newMembersHtml);
    if (window.lucide) lucide.createIcons({ root: row });

    if (!data.pagination.hasMore) {
      document.getElementById(`members-load-more-${groupId}`).style.display = 'none';
    }
  } catch (err) {
    showToast('Failed to load more members.', 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = 'Load More Members <i data-lucide="chevron-down"></i>';
    if (window.lucide) lucide.createIcons({ root: btn });
  }
}

async function joinPublicGroup(groupId, groupName) {
  document.getElementById('join-public-group-id').value = groupId;
  document.getElementById('join-public-group-name').textContent = groupName;
  
  // Reset message field
  const msgInput = document.getElementById('join-public-message');
  if (msgInput) msgInput.value = '';
  updateCharCount('join-public-message', 'join-public-char-count', 200);

  openModal('modal-join-public-confirm');
}

async function confirmJoinPublicGroup() {
  const groupId = document.getElementById('join-public-group-id').value;
  const message = document.getElementById('join-public-message').value.trim();
  const btn = document.getElementById('confirm-join-public-btn');
  const originalText = btn.textContent;
  
  btn.disabled = true; btn.textContent = 'Joining...';
  
  try {
    const res = await apiFetch(`${window.API}/api/groups/${groupId}/join-public`, { 
      method: 'POST',
      body: JSON.stringify({ message })
    });
    showToast(res.message || 'Joined successfully!', 'success');
    closeModal('modal-join-public-confirm');
    loadGroups();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = originalText;
  }
}

function buildMembersHTML(members, groupId, isOwner = false) {
  if (!members || !members.length) return '<p class="no-members">No members yet.</p>';

  // If we are rendering the initial row and have > 10 members, slice it
  let list = members;
  if (members.length > 10 && !groupMembersState[groupId]) {
    list = members.slice(0, 10);
  }

  return list.map(member => {
    const memberId   = member._id || member;
    const memberName = member.name || 'Unknown';
    const initial    = memberName.charAt(0).toUpperCase();
    const isSelf     = String(memberId) === String(window.userId);
    const profilePic = member.profilePicture;

    const removeBtn = (isOwner && !isSelf) 
      ? `<button class="member-view-btn ripple" style="background:rgba(239,68,68,0.15);color:#fca5a5;margin-left:4px;" onclick="removeMember('${groupId}', '${memberId}', '${escJs(memberName)}')">Remove</button>`
      : '';

    const avatarContent = profilePic 
      ? `<img class="member-avatar-img" src="${profilePic}" />`
      : initial;

    const avatarClick = profilePic ? `onclick="openLightbox('${profilePic}')"` : '';

    const nameClick = (!isSelf && member.username) 
      ? `onclick="openQuickView('${member.username}')" style="cursor: pointer; color: inherit;" title="View Profile"` 
      : '';

    return `
      <div class="member-pill">
        <div class="member-avatar" style="background:${memberAvatarColor(memberName)}" ${avatarClick}>${avatarContent}</div>
        <span class="member-name" ${nameClick}>${escHtml(memberName)}${isSelf ? ' (you)' : ''}</span>
        ${!isSelf ? `<button class="member-view-btn ripple" onclick="openMemberTasks('${memberId}', '${escJs(memberName)}', '${member.username || ''}')"><span class="vbtn-full">View Tasks</span><span class="vbtn-short">Tasks</span></button>` : ''}
        ${removeBtn}
      </div>
    `;
  }).join('');
}

/** Deterministic color from name so the same person always gets the same hue */
function memberAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 45%)`;
}

function copyTeamCode(code) {
  navigator.clipboard.writeText(code).then(() => {
    showToast(`Code "${code}" copied! ⚠️ Warning: Anyone with this code can join directly without request.`, 'success');
  }).catch(() => {
    showToast(`Your code: ${code}`, 'info');
  });
}

// ── Create Group Modal ─────────────────────────────────────
function openCreateGroupModal(isPublic = false) {
  document.getElementById('group-name-input').value = '';
  document.getElementById('group-desc-input').value = '';
  document.getElementById('group-is-public-hidden').value = isPublic;
  
  // Reset Icon
  const iconInput = document.getElementById('group-icon-input');
  if (iconInput) iconInput.value = '';
  const iconUrlInput = document.getElementById('group-icon-url');
  if (iconUrlInput) iconUrlInput.value = '';
  const iconImg = document.getElementById('group-icon-img');
  if (iconImg) {
    iconImg.src = '';
    iconImg.style.display = 'none';
  }
  const iconPlaceholder = document.getElementById('group-icon-placeholder');
  if (iconPlaceholder) iconPlaceholder.style.display = 'block';
  
  const title = document.getElementById('create-group-title');
  const warning = document.getElementById('group-public-warning');
  const hint = document.getElementById('group-private-hint');
  const btn = document.getElementById('submit-create-group-btn');

  if (isPublic) {
    title.innerHTML = '<i data-lucide="globe"></i> Create Public Group';
    warning.style.display = 'block';
    warning.style.background = 'rgba(34,197,94,0.1)';
    warning.style.borderColor = 'var(--green)';
    warning.querySelector('p').style.color = 'var(--green)';
    hint.style.display = 'none';
    btn.textContent = 'Create Public Group';
    btn.style.background = 'var(--green)';
  } else {
    title.innerHTML = '<i data-lucide="users"></i> Create Private Team';
    warning.style.display = 'none';
    hint.style.display = 'block';
    btn.textContent = 'Create Private Team';
  }

  openModal('modal-create-group');
}

async function submitCreateGroup() {
  const name = document.getElementById('group-name-input').value.trim();
  const description = document.getElementById('group-desc-input').value.trim();
  const isPublic = document.getElementById('group-is-public-hidden').value === 'true';
  const icon = document.getElementById('group-icon-url').value;

  if (name.length < 3 || name.length > 25) {
    showToast('Group name must be between 3 and 25 characters.', 'warn');
    return;
  }

  if (!icon) {
    showToast('A group icon is mandatory. Please upload an image.', 'warn');
    return;
  }

  // Close creation modal, clear/setup and open analysis modal
  closeModal('modal-create-group');
  
  // Set group preview details
  document.getElementById('analysis-icon-img').src = icon;
  document.getElementById('analysis-group-name').textContent = name;
  document.getElementById('analysis-group-desc').textContent = description || 'No description provided.';
  
  // Reset Analysis UI
  document.getElementById('analysis-loading-area').style.display = 'block';
  document.getElementById('analysis-result-area').style.display = 'none';
  document.getElementById('analysis-finalize-btn').style.display = 'none';
  document.getElementById('analysis-quota-limit').textContent = 'Quota status: Checking...';

  openModal('modal-group-analysis');

  // Keep a reference to the pending group metadata
  window._pendingGroupCreation = { name, isPublic, description, icon, token: null };

  try {
    const res = await apiFetch(`${window.API}/api/groups/moderate`, {
      method: 'POST',
      body: JSON.stringify({ name, isPublic, description, icon })
    });

    // Update dynamic quota indicators
    if (res.dailyGroupCreationsCount !== undefined) {
      const quotaLimits = {
        dailyGroupCreationsCount: res.dailyGroupCreationsCount,
        dailyGroupCreationsLimit: res.dailyGroupCreationsLimit
      };
      updateGroupQuotaUI(quotaLimits);
      document.getElementById('analysis-quota-limit').textContent = `Daily Creations: ${res.dailyGroupCreationsCount} / ${res.dailyGroupCreationsLimit} used`;
    }

    document.getElementById('analysis-loading-area').style.display = 'none';
    const resultArea = document.getElementById('analysis-result-area');
    resultArea.style.display = 'block';

    const statusBox = document.getElementById('analysis-status-box');
    const statusIcon = document.getElementById('analysis-status-icon');
    const statusTitle = document.getElementById('analysis-status-title');
    const statusReason = document.getElementById('analysis-status-reason');
    const finalizeBtn = document.getElementById('analysis-finalize-btn');

    if (res.safetyStatus === 'rejected') {
      // Style status box for rejection (Neo-brutalist red alert)
      statusBox.style.background = '#fee2e2';
      statusBox.style.borderColor = '#ef4444';
      statusBox.style.color = '#991b1b';
      statusBox.style.boxShadow = '4px 4px 0 #ef4444';
      
      statusIcon.textContent = '❌';
      statusTitle.textContent = 'Group Creation Blocked';
      statusReason.textContent = res.reason || 'Group name, description, or icon violated safety moderation rules.';
      
      finalizeBtn.style.display = 'none';
      showToast('Group creation blocked by AI safety moderation.', 'error');
    } else {
      // Style status box for approval (Neo-brutalist green/yellow approval)
      const isWarn = res.safetyStatus === 'warning';
      statusBox.style.background = isWarn ? '#fef3c7' : '#dcfce7';
      statusBox.style.borderColor = isWarn ? '#f59e0b' : '#22c55e';
      statusBox.style.color = isWarn ? '#92400e' : '#166534';
      statusBox.style.boxShadow = isWarn ? '4px 4px 0 #f59e0b' : '4px 4px 0 #22c55e';
      
      statusIcon.textContent = isWarn ? '⚠️' : '🛡️';
      statusTitle.textContent = isWarn ? 'Moderation Warning' : 'AI Safety Approved';
      statusReason.textContent = isWarn
        ? 'Warning: This group content was flagged as borderline/moderate safety concern. You can still create it, but users will see a warning banner.'
        : 'AI verified: This group content meets all safety compliance standards.';

      // Save token in memory
      window._pendingGroupCreation.token = res.creationToken;
      
      finalizeBtn.style.display = 'inline-block';
      finalizeBtn.disabled = false;
      finalizeBtn.textContent = 'Finalize & Create';
    }
  } catch (err) {
    document.getElementById('analysis-loading-area').style.display = 'none';
    const resultArea = document.getElementById('analysis-result-area');
    resultArea.style.display = 'block';

    const statusBox = document.getElementById('analysis-status-box');
    const statusIcon = document.getElementById('analysis-status-icon');
    const statusTitle = document.getElementById('analysis-status-title');
    const statusReason = document.getElementById('analysis-status-reason');

    statusBox.style.background = '#fee2e2';
    statusBox.style.borderColor = '#ef4444';
    statusBox.style.color = '#991b1b';
    statusBox.style.boxShadow = '4px 4px 0 #ef4444';

    statusIcon.textContent = '⚠️';
    statusTitle.textContent = 'Moderation Check Failed';
    statusReason.textContent = err.message || 'Server error during moderation check.';
    
    document.getElementById('analysis-finalize-btn').style.display = 'none';
  }
}

async function finalizeGroupCreation() {
  const pending = window._pendingGroupCreation;
  if (!pending || !pending.token) {
    showToast('No valid group session found. Please recheck moderation.', 'error');
    return;
  }

  const finalizeBtn = document.getElementById('analysis-finalize-btn');
  const cancelBtn = document.getElementById('analysis-cancel-btn');
  const originalText = finalizeBtn.textContent;

  finalizeBtn.disabled = true; finalizeBtn.textContent = 'Creating...';
  cancelBtn.disabled = true;

  try {
    const group = await apiFetch(`${window.API}/api/groups/create`, {
      method: 'POST',
      body: JSON.stringify({ creationToken: pending.token })
    });

    closeModal('modal-group-analysis');
    
    if (group.isPublic) {
      showToast(`Public Group "${group.name}" created!`, 'success');
    } else {
      showToast(`Team "${group.name}" created! Code: ${group.code}`, 'success');
    }
    
    // Reset in-memory reference
    window._pendingGroupCreation = null;
    loadGroups(); // refresh
  } catch (err) {
    showToast(err.message, 'error');
    finalizeBtn.disabled = false; finalizeBtn.textContent = originalText;
    cancelBtn.disabled = false;
  }
}

// ── Join Group Modal ───────────────────────────────────────
function openJoinGroupModal() {
  document.getElementById('join-code-input').value = '';
  openModal('modal-join-group');
}

async function submitJoinGroup() {
  const code = document.getElementById('join-code-input').value.trim().toUpperCase();
  if (!code || code.length !== 6) { showToast('Please enter a valid 6-character code.', 'warn'); return; }

  const btn = document.getElementById('submit-join-group-btn');
  btn.disabled = true; btn.textContent = 'Joining...';

  try {
    const group = await apiFetch(`${window.API}/api/groups/join`, {
      method: 'POST',
      body: JSON.stringify({ userId: window.userId, code }),
    });
    closeModal('modal-join-group');
    showToast(`Joined "${group.name}"! <i data-lucide="party-popper"></i>`, 'success');
    loadGroups(); // refresh
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Join Team';
  }
}

// ── Manage Groups ──────────────────────────────────────────
let editingGroupId = null;

function openEditGroupModal(id, name, icon, description) {
  editingGroupId = id;
  document.getElementById('edit-group-name-input').value = name;
  document.getElementById('edit-group-desc-input').value = description || '';
  
  // Set Icon
  document.getElementById('edit-group-icon-url').value = icon;
  const iconImg = document.getElementById('edit-group-icon-img');
  const iconPlaceholder = document.getElementById('edit-group-icon-placeholder');
  
  if (icon) {
    iconImg.src = icon;
    iconImg.style.display = 'block';
    iconPlaceholder.style.display = 'none';
  } else {
    iconImg.src = '';
    iconImg.style.display = 'none';
    iconPlaceholder.style.display = 'block';
  }

  openModal('modal-edit-group');
}

async function submitEditGroup() {
  const name = document.getElementById('edit-group-name-input').value.trim();
  const description = document.getElementById('edit-group-desc-input').value.trim();
  const icon = document.getElementById('edit-group-icon-url').value;

  if (name.length < 3 || name.length > 25) {
    showToast('Team name must be between 3 and 25 characters.', 'warn');
    return;
  }

  const btn = document.getElementById('submit-edit-group-btn');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    await apiFetch(`${window.API}/api/groups/${editingGroupId}`, {
      method: 'PUT',
      body: JSON.stringify({ userId: window.userId, name, description, icon }),
    });
    closeModal('modal-edit-group');
    showToast('Team updated!', 'success');
    loadGroups();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Changes';
  }
}

async function deleteGroup(groupId) {
  if (!confirm('Are you sure you want to completely delete this team? This action is permanent.')) return;
  try {
    // 1. Update UI and Local DB instantly
    allJoinedGroups = allJoinedGroups.filter(g => g._id !== groupId); window.allJoinedGroups = allJoinedGroups;
    await window.localDb.groups.delete(groupId);
    renderGroups();

    // 2. Queue for sync
    window.syncManager.addToQueue('DELETE', 'groups', groupId, { userId: window.userId });
    
    // Clear Firestore Chat Data (Background)
    deleteFirestoreGroupData(groupId).catch(console.error);

    showToast('Team deleted locally.', 'info');
  } catch (err) {
    console.error('Offline delete error:', err);
  }
}

async function leaveGroup(groupId) {
  if (!confirm('Are you sure you want to leave this team?')) return;
  try {
    await apiFetch(`${window.API}/api/groups/${groupId}/remove-member`, {
      method: 'POST',
      body: JSON.stringify({ userId: window.userId, targetUserId: window.userId }),
    });
    showToast('You left the team.', 'info');
    loadGroups();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function removeMember(groupId, memberId, memberName) {
  if (!confirm(`Remove ${memberName} from the team?`)) return;
  try {
    await apiFetch(`${window.API}/api/groups/${groupId}/remove-member`, {
      method: 'POST',
      body: JSON.stringify({ userId: window.userId, targetUserId: memberId }),
    });
    showToast(`${memberName} was removed.`, 'info');
    loadGroups();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Member Tasks Modal (read-only) ─────────────────────────
let memberDaysPage = 1;
let memberDaysData = [];
let memberDaysHasMore = false;
let memberCurrentStreak = 0;
let memberHighestStreak = 0;

async function openMemberTasks(memberId, memberName, username = null) {
  const titleEl = document.getElementById('member-tasks-title');
  const bodyEl  = document.getElementById('member-tasks-list-area');
  const insightsArea = document.getElementById('member-insights-area');

  titleEl.innerHTML = `<i data-lucide="user"></i> ${escapeHTML(memberName)}'s Insights`;
  if (window.lucide) lucide.createIcons({ root: titleEl });
  
  insightsArea.style.display = 'none';
  insightsArea.innerHTML = '';
  
  window._currentMemberId   = memberId;
  window._currentMemberName = memberName;
  window._currentMemberUsername = username;
  memberDaysPage = 1;
  memberDaysData = [];
  memberDaysHasMore = false;
  memberCurrentStreak = 0;
  memberHighestStreak = 0;

  if (!navigator.onLine) {
    bodyEl.innerHTML = `
      <div class="empty-state" style="padding:40px 0">
        <span class="empty-icon"><i data-lucide="wifi-off"></i></span>
        <h3>Offline Mode</h3>
        <p>You are in offline mode. Cannot view ${escapeHTML(memberName)}'s tasks.</p>
      </div>`;
    if (window.lucide) lucide.createIcons({ root: bodyEl });
    openModal('modal-member-tasks');
    return;
  }

  bodyEl.innerHTML = `<div class="loading-spinner"><div class="spinner-ring"></div><p>Loading journey...</p></div>`;
  openModal('modal-member-tasks');

  // If username is provided, fetch extra insights (graph, etc.)
  if (username) {
    (async () => {
      try {
        const res = await apiFetch(`${window.API}/api/users/${username}`);
        if (res && res.user) {
          insightsArea.style.display = 'block';
          insightsArea.innerHTML = `
            <div class="quick-insights-grid">
              <div class="insight-pill">
                <span class="insight-val">${res.user.currentStreak}</span>
                <span class="insight-lbl">Current</span>
              </div>
              <div class="insight-pill">
                <span class="insight-val">${res.user.highestStreak}</span>
                <span class="insight-lbl">Highest</span>
              </div>
            </div>
            <div id="quick-view-graph" class="quick-view-graph-container" style="overflow-x:auto; margin-top:16px; background:var(--bg); padding:16px; border:2px solid var(--black); border-radius:12px;">
              <svg id="quick-profile-graph" width="800" height="150"></svg>
            </div>
          `;
          renderContributionGraph(res.user.contributionData, 'quick-profile-graph', res.user.isPremium);
        }
      } catch (e) { console.error('Insights load fail', e); }
    })();
  }

  await loadMemberDays();
}

async function loadMemberDays() {
  const bodyEl  = document.getElementById('member-tasks-list-area');

  if (!navigator.onLine) {
    bodyEl.innerHTML = `
      <div class="empty-state" style="padding:40px 0">
        <span class="empty-icon"><i data-lucide="wifi-off"></i></span>
        <h3>Offline Mode</h3>
        <p>You are in offline mode. Cannot view ${escapeHTML(window._currentMemberName)}'s tasks.</p>
      </div>`;
    if (window.lucide) lucide.createIcons({ root: bodyEl });
    return;
  }

  try {
    const response = await apiFetch(`${window.API}/api/groups/member-days?memberId=${encodeURIComponent(window._currentMemberId)}&page=${memberDaysPage}&limit=10`);

    // Handle both old format (array) and new format (object with days)
    const days = response.days || response;
    memberDaysData = memberDaysData.concat(days);
    memberDaysHasMore = response.pagination ? response.pagination.hasMore : false;

    if (response.streak) {
      memberCurrentStreak = response.streak.current || 0;
      memberHighestStreak = response.streak.highest || 0;
    }

    if (!memberDaysData.length) {
      bodyEl.innerHTML = `
        <div class="empty-state" style="padding:40px 0">
          <span class="empty-icon"><i data-lucide="mailbox"></i></span>
          <h3>No cards yet</h3>
          <p>${escHtml(window._currentMemberName)} hasn't created any day cards yet.</p>
        </div>`;
      if (window.lucide) lucide.createIcons({ root: bodyEl });
      return;
    }

    // Sort newest-first for the viewer
    const sorted = [...memberDaysData].sort((a, b) => b.date.localeCompare(a.date));

    let html = '<div class="member-days-list">';
    for (const day of sorted) {
      const pct = calcProgress(day.categories);
      const { total, completed } = countTasks(day.categories);

      let catsHTML = '';
      for (const cat of day.categories) {
        const catCompleted = cat.tasks.filter(t => t.completed).length;
        let tasksHTML = '';
        for (const task of cat.tasks) {
          const lockClass = task.completed ? 'locked-complete' : 'locked-incomplete';
          tasksHTML += `
            <div class="task-item ${lockClass}">
              <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} disabled />
              <span class="task-title">${escHtml(task.title)}</span>
            </div>`;
        }
        catsHTML += `
          <div class="category-block">
            <div class="category-header">
              <span class="category-name">${escHtml(cat.name)}</span>
              <span class="category-count">${catCompleted}/${cat.tasks.length}</span>
            </div>
            <div class="tasks-list">${tasksHTML || '<p style="padding:8px 14px;font-size:13px;color:var(--text-3)">No tasks.</p>'}</div>
          </div>`;
      }

      html += `
        <div class="member-day-card" data-day-id="${day._id}">
          <div class="member-day-header">
            <div>
              <span class="card-date">${formatDisplayDate(day.date)}</span>
              <span class="card-day-name">${getDayName(day.date)}</span>
            </div>
            <span class="member-day-progress" style="color:${progressColor(pct)}">${pct}% · ${completed}/${total}</span>
          </div>
          <div class="progress-track" style="margin:8px 0 12px">
            <div class="progress-fill ${progressClass(pct)}" style="width:${pct}%"></div>
          </div>
          <div class="categories-list">${catsHTML || '<p style="color:var(--text-3);font-size:14px">No categories.</p>'}</div>
        </div>`;
    }
    html += '</div>';

    // Add load more button if there are more days
    if (memberDaysHasMore) {
      html += `
        <div style="text-align:center; margin-top:20px;">
          <button class="btn-ghost ripple" onclick="loadMoreMemberDays()" style="padding:10px 20px; border-radius:8px;">
            Load More Days <i data-lucide="chevron-down"></i>
          </button>
        </div>`;
    }

    bodyEl.innerHTML = html;

    // Inject achievements per day asynchronously
    for (const day of sorted) {
      (async () => {
        try {
          const achs = await apiFetch(`${window.API}/api/achievements/day/${day._id}`);
          if (!achs.length) return;
          const dayCard = bodyEl.querySelector(`[data-day-id="${day._id}"]`);
          if (!dayCard) return;
          let achHtml = `<div class="achievements-section" style="margin-top:10px;"><div class="achievements-section-header"><span class="achievements-section-label"><i data-lucide="trophy"></i> Wins</span></div>`;
          for (const a of achs) {
            const linksHTML = buildLinksHTML(a.links || []);
            const descHTML  = a.description ? `<p class="ach-desc">${escHtml(a.description)}</p>` : '';
            achHtml += `<div class="achievement-item"><span class="achievement-item-title"><i data-lucide="medal"></i> ${escHtml(a.title)}</span>${descHTML}<div class="ach-links-row">${linksHTML}</div></div>`;
          }
          achHtml += '</div>';
          dayCard.insertAdjacentHTML('beforeend', achHtml);
        } catch (_) {}
      })();
    }
  } catch (err) {
    bodyEl.innerHTML = `<p style="color:#ef4444;text-align:center"><i data-lucide="alert-triangle"></i> Failed to load tasks.</p>`;
  }
}

async function loadMoreMemberDays() {
  memberDaysPage++;
  await loadMemberDays();
}

/** Open a panel showing all achievements for the current member */
async function openMemberAllAchievements() {
  if (!window._currentMemberId) return;
  const bodyEl = document.getElementById('member-tasks-body');
  const titleEl = document.getElementById('member-tasks-title');
  titleEl.innerHTML = `<button id="btn-back-to-tasks" style="background:var(--bg-card);border:var(--border-2);border-radius:var(--r-sm);padding:4px 10px;font-size:11px;font-weight:800;cursor:pointer;margin-right:8px;box-shadow:2px 2px 0 var(--black);font-family:'Inter',sans-serif;text-transform:uppercase;color:var(--text);" title="Back to daily tasks"><i data-lucide="arrow-left"></i> Back</button><i data-lucide="trophy"></i> ${escHtml(window._currentMemberName)}'s Achievements`;
  const backBtn = document.getElementById('btn-back-to-tasks');
  if (backBtn) backBtn.addEventListener('click', () => openMemberTasks(window._currentMemberId, window._currentMemberName, window._currentMemberUsername));
  bodyEl.innerHTML = `<div class="loading-spinner"><div class="spinner-ring"></div><p>Loading...</p></div>`;
  try {
    let achs = [];
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${window.API}/api/achievements/user/${window._currentMemberId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (resp.status === 403) {
        bodyEl.innerHTML = `<div class="empty-state" style="padding:40px 0">
          <span class="empty-icon"><i data-lucide="lock"></i></span>
          <h3>Achievements are Private</h3>
          <p>${escHtml(window._currentMemberName)} has chosen to hide their achievements.</p>
        </div>`;
        return;
      }
      achs = await resp.json();
    } catch (_) {}
    if (!achs.length) {
      bodyEl.innerHTML = `<div class="empty-state" style="padding:40px 0"><span class="empty-icon"><i data-lucide="trophy"></i></span><h3>No achievements yet</h3><p>${escHtml(window._currentMemberName)} hasn't logged any wins yet.</p></div>`;
      return;
    }
    let html = '<div class="member-days-list">';
    for (const a of achs) {
      const linksHTML = buildLinksHTML(a.links || [], 'ach-page-link');
      const descHTML  = a.description ? `<p class="ach-page-desc">${escHtml(a.description)}</p>` : '';
      html += `
        <div class="achievement-page-card">
          <div class="ach-page-top">
            <div>
              <span class="ach-date-badge">${formatDisplayDate(a.date)}</span>
              <h3 class="ach-page-title">🎖️ ${escHtml(a.title)}</h3>
            </div>
          </div>
          ${descHTML}
          <div class="ach-links-row">${linksHTML}</div>
        </div>`;
    }
    html += '</div>';
    bodyEl.innerHTML = html;
    if (window.lucide) {
      lucide.createIcons({ root: bodyEl });
      lucide.createIcons({ root: titleEl });
    }
  } catch (err) {
    bodyEl.innerHTML = `<p style="color:#ef4444;text-align:center"><i data-lucide="alert-triangle"></i> Failed to load achievements.</p>`;
  }
}


// [Achievements extracted to achievements.js]


// ── Modal helpers ──────────────────────────────────────────
function openModal(id) {
  const overlay = document.getElementById(id);
  const modalEl = overlay.querySelector('.modal');

  // Kill any in-flight tweens on both overlay and modal elements
  if (window.gsap) {
    gsap.killTweensOf([overlay, modalEl]);
    gsap.set([overlay, modalEl], { clearProps: 'all' });
  }

  overlay.classList.add('open');

  if (window.gsap) {
    // Fade overlay in smoothly to prevent heavy layout thrashing with backdrop filters
    gsap.fromTo(overlay,
      { opacity: 0 },
      { opacity: 1, duration: 0.28, ease: 'power2.out' }
    );

    // Defer the GSAP tween by one rAF so the browser finishes the
    // display:flex paint before animating — prevents the "invisible flash" on mobile
    requestAnimationFrame(() => {
      gsap.fromTo(modalEl,
        { opacity: 0, y: 28, scale: 0.94 },
        { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'back.out(1.4)', clearProps: 'all' }
      );
    });
  }
}

function closeModal(id) {
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }
  // Block closing the day card modal while an image scan is in progress
  if (window.isScanInProgress && id === 'modal-add-day') {
    const banner = document.getElementById('scan-lock-banner');
    if (banner) {
      // Shake the banner to draw attention
      banner.style.animation = 'none';
      requestAnimationFrame(() => { banner.style.animation = 'scan-lock-shake 0.4s ease'; });
    }
    return;
  }
  const overlay = document.getElementById(id);
  const modalEl = overlay.querySelector('.modal');

  if (window.gsap) {
    // Kill any in-flight tweens before closing
    gsap.killTweensOf([overlay, modalEl]);
    
    // Sync the fade out of overlay and transition of modal
    const tl = gsap.timeline({
      onComplete: () => {
        overlay.classList.remove('open');
        gsap.set([overlay, modalEl], { clearProps: 'all' });
        if (id === 'modal-add-leetcode') {
          resetLeetCodeModalState();
        }
      }
    });

    tl.to(modalEl, {
      opacity: 0,
      y: 16,
      scale: 0.96,
      duration: 0.22,
      ease: 'power2.in'
    }, 0);

    tl.to(overlay, {
      opacity: 0,
      duration: 0.22,
      ease: 'power2.in'
    }, 0);
  } else {
    overlay.classList.remove('open');
    if (id === 'modal-add-leetcode') {
      resetLeetCodeModalState();
    }
  }
}

function closeModalOnOverlay(e, id) {
  if (window.isScanInProgress && id === 'modal-add-day') {
    const banner = document.getElementById('scan-lock-banner');
    if (banner) {
      banner.style.animation = 'none';
      requestAnimationFrame(() => { banner.style.animation = 'scan-lock-shake 0.4s ease'; });
    }
    return;
  }
  if (e.target === e.currentTarget) closeModal(id);
}


// [LeetCode reset/verify extracted to leetcode.js]

// Fallback close function for emergencies
function forceCloseModal(id) {
  try {
    const overlay = document.getElementById(id);
    if (overlay) {
      overlay.classList.remove('open');
      // IMPORTANT: remove the inline property instead of setting display:none.
      // Setting style.display='none' creates an invisible full-screen overlay that
      // blocks all subsequent clicks because position:fixed;inset:0 still applies.
      overlay.style.removeProperty('display');

      // Reset LeetCode modal state if closing LeetCode modal
      if (id === 'modal-add-leetcode') {
        resetLeetCodeModalState();
      }
    }
  } catch (error) {
    console.error('Error force closing modal:', error);
  }
}


// [Profile & Settings extracted to profile.js]

// [Templates, Theme, Init extracted to app.js]

// [Lightbox, Audio, Search extracted to app.js]

// [Quick View, Public Profile extracted to profile.js]

// [PWA, Native Update, Feedback, Share, Leaderboard extracted to app.js]

// ── Quota limit display helper ────────────────────────────
function updateGroupQuotaUI(limits) {
  const badge = document.getElementById('group-quota-badge');
  const btnPrivate = document.getElementById('btn-create-private-team');
  const btnPublic = document.getElementById('btn-create-public-group');
  
  if (!badge) return;

  if (!limits) {
    badge.style.display = 'none';
    if (btnPrivate) { btnPrivate.disabled = false; btnPrivate.title = ''; btnPrivate.style.removeProperty('opacity'); btnPrivate.style.removeProperty('cursor'); }
    if (btnPublic) { btnPublic.disabled = false; btnPublic.title = ''; btnPublic.style.removeProperty('opacity'); btnPublic.style.removeProperty('cursor'); }
    return;
  }

  const current = limits.dailyGroupCreationsCount || 0;
  const limit = limits.dailyGroupCreationsLimit || 5;

  badge.textContent = `Creations Today: ${current} / ${limit}`;
  badge.style.display = 'inline-block';

  if (current >= limit) {
    if (btnPrivate) {
      btnPrivate.disabled = true;
      btnPrivate.title = 'Daily group creation limit reached';
      btnPrivate.style.opacity = '0.5';
      btnPrivate.style.cursor = 'not-allowed';
    }
    if (btnPublic) {
      btnPublic.disabled = true;
      btnPublic.title = 'Daily group creation limit reached';
      btnPublic.style.opacity = '0.5';
      btnPublic.style.cursor = 'not-allowed';
    }
  } else {
    if (btnPrivate) {
      btnPrivate.disabled = false;
      btnPrivate.title = '';
      btnPrivate.style.removeProperty('opacity');
      btnPrivate.style.removeProperty('cursor');
    }
    if (btnPublic) {
      btnPublic.disabled = false;
      btnPublic.title = '';
      btnPublic.style.removeProperty('opacity');
      btnPublic.style.removeProperty('cursor');
    }
  }
}

// ── Groups Module Bindings ───────────────────────────────
window.openModal = openModal;
window.closeModal = closeModal;
window.closeModalOnOverlay = closeModalOnOverlay;
window.forceCloseModal = forceCloseModal;
window.loadGroups = loadGroups;
window.renderGroups = renderGroups;
window.renderGroupSection = renderGroupSection;
window.renderSingleGroupCard = renderSingleGroupCard;
window.updateCharCount = updateCharCount;
window.openRequestsModal = openRequestsModal;
window.handleRequest = handleRequest;
window.cancelJoinRequest = cancelJoinRequest;
window.loadMoreMembers = loadMoreMembers;
window.joinPublicGroup = joinPublicGroup;
window.confirmJoinPublicGroup = confirmJoinPublicGroup;
window.buildMembersHTML = buildMembersHTML;
window.memberAvatarColor = memberAvatarColor;
window.copyTeamCode = copyTeamCode;
window.openCreateGroupModal = openCreateGroupModal;
window.submitCreateGroup = submitCreateGroup;
window.openJoinGroupModal = openJoinGroupModal;
window.submitJoinGroup = submitJoinGroup;
window.openEditGroupModal = openEditGroupModal;
window.submitEditGroup = submitEditGroup;
window.deleteGroup = deleteGroup;
window.leaveGroup = leaveGroup;
window.removeMember = removeMember;
window.openMemberTasks = openMemberTasks;
window.loadMemberDays = loadMemberDays;
window.loadMoreMemberDays = loadMoreMemberDays;
window.openMemberAllAchievements = openMemberAllAchievements;
window.updateGroupQuotaUI = updateGroupQuotaUI;
window.finalizeGroupCreation = finalizeGroupCreation;
console.log("[Module] groups.js loaded and Groups functions bound to window");
