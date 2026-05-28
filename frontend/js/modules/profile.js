// ── Profile Module ───────────────────────────────────────────
console.log("[Module] profile.js initializing...");

// ── Profile & Settings ─────────────────────────────────────
async function openProfileModal() {
  document.getElementById('profile-pic-dataurl').value = '';
  openModal('modal-profile');
  // Clear sensitive fields
  document.getElementById('profile-old-password').value = '';
  document.getElementById('profile-new-password').value = '';
  document.getElementById('profile-confirm-password').value = '';

  // Reset password collapse section
  const pwdSection = document.getElementById('password-change-section');
  if (pwdSection) pwdSection.style.display = 'none';
  const pwdIcon = document.getElementById('toggle-pwd-icon');
  if (pwdIcon) pwdIcon.textContent = '▼';

  // Synchronous baseline population from localStorage to ensure instant loading of username, email, photo, showcase status, and LeetCode details on refresh/offline
  const storedName = localStorage.getItem('window.userName') || '';
  const storedEmail = localStorage.getItem('userEmail') || '';
  const storedUsername = localStorage.getItem('userUsername') || '';
  const storedPic = localStorage.getItem('window.userProfilePicture') || '';
  const storedShowcase = localStorage.getItem('showOnLeaderboard');

  const storedLcUsername = localStorage.getItem('leetcodeUsername') || '';
  const storedLcPending = localStorage.getItem('leetcodePendingUsername') || '';
  const storedLcCode = localStorage.getItem('leetcodeVerificationCode') || '';
  const storedLcStatus = localStorage.getItem('leetcodeVerificationStatus') || 'none';
  const storedLcPic = localStorage.getItem('leetcodeProfilePicture') || '';

  const baselineUser = {
    name: storedName,
    email: storedEmail,
    username: storedUsername,
    profilePicture: storedPic,
    showOnLeaderboard: storedShowcase !== 'false',
    emailNotifications: true,
    isPublicProfile: true,
    leetcodeUsername: storedLcUsername,
    leetcodePendingUsername: storedLcPending,
    leetcodeVerificationCode: storedLcCode,
    leetcodeVerificationStatus: storedLcStatus,
    leetcodeProfilePicture: storedLcPic,
    leetcodeUsernameChangeCount: 0,
    leetcodeLastVerifiedAt: storedLcStatus === 'verified' ? new Date().toISOString() : null
  };
  renderProfileData(baselineUser);

  // 1. STALE: Load from cache instantly
  const userId = localStorage.getItem('window.userId');
  try {
    const cached = await window.localDb.userProfile.get(window.userId);
    if (cached) renderProfileData(cached);
  } catch (e) {}

  // 2. REVALIDATE: Load from server
  try {
    const res = await apiFetch(`${window.API}/api/auth/settings`);
    res.userId = window.userId;
    await cacheProfileImagesOffline(res);
    await window.localDb.userProfile.put(res);
    renderProfileData(res);
    // Confirmed real internet — safe to enable the leaderboard showcase toggles
    setLeaderboardTogglesEnabled(true);
  } catch (err) {
    console.error('Error loading profile:', err);
    if (!navigator.onLine) showToast('Showing offline profile data.', 'info');
  }
}

/** Helper to populate profile fields from a user object */
function renderProfileData(user) {
  if (!user) return;
  
  if (user.profilePicture) {
    window.userProfilePicture = user.profilePicture;
    localStorage.setItem('window.userProfilePicture', window.userProfilePicture);
    updateNavAvatar();
  }

  const avatarImg = document.getElementById('profile-avatar-img');
  const avatarInit = document.getElementById('profile-avatar-initial');
  if (user.profilePicture) {
    avatarImg.src = user.profilePicture;
    avatarImg.style.display = 'block';
    avatarInit.style.display = 'none';
    avatarImg.onerror = () => {
      avatarImg.style.display = 'none';
      avatarInit.style.display = 'block';
    };
  } else {
    avatarImg.src = '';
    avatarImg.style.display = 'none';
    avatarInit.style.display = 'block';
    avatarInit.textContent = (user.name || window.userName || 'U').charAt(0).toUpperCase();
  }

  const emailInput = document.getElementById('profile-email');
  if (emailInput) emailInput.value = user.email || '';
  
  const toggle = document.getElementById('email-notif-toggle');
  if (toggle) toggle.checked = user.emailNotifications;
  const publicToggle = document.getElementById('public-profile-toggle');
  if (publicToggle) publicToggle.checked = user.isPublicProfile !== false;
  
  const showcaseToggle = document.getElementById('leaderboard-showcase-settings-toggle');
  if (showcaseToggle) {
    showcaseToggle.checked = user.showOnLeaderboard !== false;
    // Never re-enable here — enabling is handled only by confirmed window.API success or window 'online' event
    if (!navigator.onLine) {
      showcaseToggle.disabled = true;
      showcaseToggle.title = 'Cannot change settings while offline';
    }
  }
  const lbShowcaseToggle = document.getElementById('leaderboard-showcase-toggle');
  if (lbShowcaseToggle) {
    lbShowcaseToggle.checked = user.showOnLeaderboard !== false;
    // Never re-enable here — enabling is handled only by confirmed window.API success or window 'online' event
    if (!navigator.onLine) {
      lbShowcaseToggle.disabled = true;
      lbShowcaseToggle.title = 'Cannot change settings while offline';
    }
  }
  
  const unameInput = document.getElementById('profile-username');
  if (unameInput) {
    unameInput.value = user.username || '';
    if (user.username) {
      unameInput.readOnly = true;
      const hint = document.getElementById('profile-username-hint');
      if (hint) hint.innerHTML = '<i data-lucide="check-circle" style="width:14px;height:14px;color:var(--green)"></i> Username is locked.';
      if (window.lucide) lucide.createIcons({ root: hint });
    }
  }
  
  loadClaimedBadges();
  
  // Also load LeetCode status
  if (typeof loadLeetCodeProfileStatus === 'function') {
    loadLeetCodeProfileStatus();
  }
}

function togglePasswordSection() {
  const sec = document.getElementById('password-change-section');
  const icon = document.getElementById('toggle-pwd-icon');
  if (sec.style.display === 'none') {
    sec.style.display = 'block';
    icon.textContent = '▲';
  } else {
    sec.style.display = 'none';
    icon.textContent = '▼';
  }
}

async function submitProfileSettings() {
  const usernameInput = document.getElementById('profile-username');
  const username = usernameInput.value.trim();
  const emailNotifications = document.getElementById('email-notif-toggle').checked;
  const isPublicProfile = document.getElementById('public-profile-toggle').checked;
  const showOnLeaderboard = document.getElementById('leaderboard-showcase-settings-toggle').checked;

  const currentSavedShowcase = localStorage.getItem('showOnLeaderboard') !== 'false';
  if (!navigator.onLine && showOnLeaderboard !== currentSavedShowcase) {
    showToast('Leaderboard showcase settings cannot be changed while offline.', 'error');
    const settingsToggle = document.getElementById('leaderboard-showcase-settings-toggle');
    if (settingsToggle) settingsToggle.checked = currentSavedShowcase;
    return;
  }

  if (username && !usernameInput.readOnly) {
    const usernameRegex = /^[!-~]{4,20}$/;
    if (!usernameRegex.test(username)) {
      showToast('Username must be 4-20 chars, alphanumeric/special, no spaces.', 'warn');
      return;
    }
  }

  const btn = document.getElementById('submit-profile-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const profilePicture = document.getElementById('profile-pic-dataurl').value;
    const payload = { emailNotifications, isPublicProfile, showOnLeaderboard };
    if (!usernameInput.readOnly && username) {
      payload.username = username;
    }
    if (profilePicture) {
      payload.profilePicture = profilePicture;
    }

    // 1. Update Locally First (Offline-First) - This is INSTANT
    if (window.localDb) {
      const userId = localStorage.getItem('window.userId');
      await window.localDb.userProfile.put({ ...payload, userId: window.userId });
      
      // 2. Queue for Sync
      window.syncManager.addToQueue('PATCH', 'auth/settings', null, payload);
    }
    localStorage.setItem('showOnLeaderboard', showOnLeaderboard.toString());

    // 3. SHOW SUCCESS INSTANTLY
    showToast('Settings saved!', 'success');
    
    // Sync the other toggle
    const lbShowcaseToggle = document.getElementById('leaderboard-showcase-toggle');
    if (lbShowcaseToggle) lbShowcaseToggle.checked = showOnLeaderboard;
    
    closeModal('modal-profile');

    // 4. Background Sync (Don't await it for the UI)
    apiFetch(`${window.API}/api/auth/settings`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }).then(async res => {
      // Pre-cache new profile image as base64 to prevent broken images offline
      await cacheProfileImagesOffline(res);
      if (window.localDb) {
        const cached = await window.localDb.userProfile.get(window.userId) || {};
        await window.localDb.userProfile.put({ ...cached, ...res, userId: window.userId });
      }
      // Update local storage and UI if pic/username changed (Server confirmation)
      if (res.profilePicture) {
        window.userProfilePicture = res.profilePicture;
        localStorage.setItem('window.userProfilePicture', window.userProfilePicture);
        updateNavAvatar();
      }
      if (res.username) {
        localStorage.setItem('userUsername', res.username);
      }
      // Reload leaderboard to reflect visibility settings changes instantly in-place!
      const activePage = document.querySelector('.page.active');
      if (activePage && activePage.id === 'page-leaderboard') {
        loadLeaderboard(true);
      }
    }).catch(err => {
      console.warn('Background profile sync failed (expected if offline):', err);
    });

  } catch (err) {
    console.error('Profile save error:', err);
    showToast('Error saving settings.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
}

async function submitPasswordChange() {
  const oldPassword = document.getElementById('profile-old-password').value;
  const newPassword = document.getElementById('profile-new-password').value;
  const confirmPassword = document.getElementById('profile-confirm-password').value;

  if (!oldPassword || !newPassword || !confirmPassword) {
    showToast('Please fill all password fields.', 'warn');
    return;
  }
  
  // 1. FRONTEND VALIDATION (Aligned with Backend Rules)
  // Rules: 5+ chars, 1 uppercase, 1 lowercase, 1 special char, no spaces
  const hasMinLength = newPassword.length >= 5;
  const hasNoSpaces  = !/\s/.test(newPassword);
  const hasUpper     = /[A-Z]/.test(newPassword);
  const hasLower     = /[a-z]/.test(newPassword);
  const hasSpecial   = /[^a-zA-Z0-9]/.test(newPassword);

  if (!hasMinLength || !hasNoSpaces || !hasUpper || !hasLower || !hasSpecial) {
    showToast('Password must be 5+ characters with 1 uppercase, 1 lowercase, 1 special char, and no spaces.', 'warn');
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match.', 'warn');
    return;
  }

  const btn = document.getElementById('submit-pwd-btn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Updating...';

  try {
    const payload = { oldPassword, newPassword };
    // 2. OFFLINE QUEUING
    if (!navigator.onLine) {
      window.syncManager.addToQueue('PATCH', 'auth/settings', 'current', payload);
      showToast('Password change queued! Will sync when online.', 'success');
      closeModal('modal-profile');
      return;
    }

    await apiFetch(`${window.API}/api/auth/settings`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    showToast('Password updated successfully!', 'success');
    
    document.getElementById('profile-old-password').value = '';
    document.getElementById('profile-new-password').value = '';
    document.getElementById('profile-confirm-password').value = '';
    togglePasswordSection(); // collapse it
  } catch (err) {
    showToast(err.message || 'Failed to update password', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ── Account Deletion ───────────────────────────────────────
let targetDeletionString = '';

function openDeleteWarning() {
  closeModal('modal-profile');
  document.getElementById('modal-delete-warning').classList.add('open');
}

function proceedToDeleteConfirm() {
  closeModal('modal-delete-warning');
  
  const unameInput = document.getElementById('profile-username');
  const localEmail = localStorage.getItem('userEmail');
  
  if (unameInput && unameInput.value.trim()) {
    targetDeletionString = unameInput.value.trim();
  } else if (localEmail && localEmail.trim() !== '') {
    targetDeletionString = localEmail; // From local storage
  } else {
    targetDeletionString = 'DELETE'; // Fallback if no email or username
  }

  document.getElementById('delete-username-hint').textContent = targetDeletionString;
  document.getElementById('delete-username-input').value = '';
  document.getElementById('btn-final-delete').disabled = true;
  document.getElementById('btn-final-delete').style.opacity = '0.5';
  document.getElementById('btn-final-delete').style.cursor = 'not-allowed';
  
  document.getElementById('modal-delete-confirm').classList.add('open');
}

function checkDeleteConfirmation() {
  const inputVal = document.getElementById('delete-username-input').value.trim();
  const btn = document.getElementById('btn-final-delete');
  
  // Ensure the input matches and is NOT empty
  if (inputVal === targetDeletionString && inputVal !== '') {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
  } else {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
  }
}

async function verifyAndDeleteAccount() {
  if (document.getElementById('delete-username-input').value.trim() !== targetDeletionString) return;
  
  const btn = document.getElementById('btn-final-delete');
  btn.disabled = true;
  
  // Hide footer buttons to prevent cancellation
  const modalFooter = document.querySelector('#modal-delete-confirm .modal-footer');
  if (modalFooter) modalFooter.style.display = 'none';

  // Show loading animation and warning
  const modalBody = document.querySelector('#modal-delete-confirm .modal-body');
  const originalBodyHTML = modalBody.innerHTML; // Save in case of failure
  
  modalBody.innerHTML = `
    <style>
      @keyframes spin { 100% { transform: rotate(360deg); } }
      .spinner { font-size: 40px; display: inline-block; animation: spin 2s linear infinite; }
    </style>
    <div style="text-align: center; padding: 20px 0;">
      <div class="spinner"><i data-lucide="loader-2" class="animate-spin"></i></div>
      <h3 style="color: var(--red); margin-top: 16px; margin-bottom: 8px; font-weight: 800;">DELETING ACCOUNT...</h3>
      <p style="color: var(--text); font-weight: 700; background: var(--bg-muted); padding: 8px; border: 2px solid var(--black); border-radius: 4px; display: inline-block;"><i data-lucide="alert-triangle"></i> DO NOT CLOSE OR REFRESH THIS PAGE <i data-lucide="alert-triangle"></i></p>
      <p style="font-size: 14px; color: var(--text); margin-top: 12px; font-weight: 600;">Interrupting this process may cause data to not get deleted completely.</p>
    </div>
  `;

  try {
    await apiFetch(`${window.API}/api/auth/account`, {
      method: 'DELETE'
    });
    
    // Clear all local data
    localStorage.clear();
    
    // Redirect to landing
    window.location.replace('landing.html');
  } catch (err) {
    showToast(err.message || 'Failed to delete account', 'error');
    // Restore UI if it failed so they can try again or cancel
    modalBody.innerHTML = originalBodyHTML;
    if (modalFooter) modalFooter.style.display = 'flex';
    document.getElementById('delete-username-input').value = targetDeletionString;
    checkDeleteConfirmation();
  }
}


// ── Profile Picture Upload (Canvas Compression) ───────────────────
async function handleProfilePictureSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    showToast('File is too large. Max 5MB.', 'warn');
    event.target.value = '';
    return;
  }

  showToast('Compressing image...', 'info');
  const btn = document.getElementById('submit-profile-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Processing...';
  }

  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (e) => {
    const img = new Image();
    img.src = e.target.result;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      // Compress to 70% quality
      canvas.toBlob(async (blob) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          const base64data = reader.result;
          document.getElementById('profile-pic-dataurl').value = base64data;
          
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Save Changes';
          }

          // Update UI Preview
          const avatarImg = document.getElementById('profile-avatar-img');
          const avatarInit = document.getElementById('profile-avatar-initial');
          avatarImg.src = base64data;
          avatarImg.style.display = 'block';
          avatarInit.style.display = 'none';

          showToast('Image ready to save!', 'success');
          event.target.value = '';
        };
      }, 'image/jpeg', 0.7);
    };
  };
}

// ── Group Icon Upload (Canvas Compression) ───────────────────
async function handleGroupIconSelect(event, isEdit = false) {
  const file = event.target.files[0];
  if (!file) return;

  const prefix = isEdit ? 'edit-' : '';

  if (file.size > 5 * 1024 * 1024) {
    showToast('File is too large. Max 5MB.', 'warn');
    event.target.value = '';
    return;
  }

  showToast('Compressing icon...', 'info');
  const btn = document.getElementById(isEdit ? 'submit-edit-group-btn' : 'submit-create-group-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Processing...';
  }

  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (e) => {
    const img = new Image();
    img.src = e.target.result;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const MAX_WIDTH = 400; // Smaller for icons
      const MAX_HEIGHT = 400;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(async (blob) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          const base64data = reader.result;
          document.getElementById(prefix + 'group-icon-url').value = base64data;
          
          if (btn) {
            btn.disabled = false;
            const isPub = document.getElementById('group-is-public-hidden')?.value === 'true';
            btn.textContent = isEdit ? 'Save Changes' : (isPub ? 'Make the Group' : 'Create Team');
          }
          
          const previewImg = document.getElementById(prefix + 'group-icon-img');
          const placeholder = document.getElementById(prefix + 'group-icon-placeholder');
          
          previewImg.src = base64data;
          previewImg.style.display = 'block';
          placeholder.style.display = 'none';

          showToast('Icon ready!', 'success');
          event.target.value = '';
        };
      }, 'image/jpeg', 0.7);
    };
  };
}

function updateNavAvatar() {
  const chipAvatar = document.getElementById('user-chip-avatar');
  const chipImg = document.getElementById('user-chip-img');
  
  if (window.userProfilePicture) {
    chipImg.src = window.userProfilePicture;
    chipImg.style.display = 'block';
    
    if (chipAvatar) chipAvatar.style.display = 'none';
  } else {
    chipImg.src = '';
    chipImg.style.display = 'none';
    chipImg.onclick = null;
    if (chipAvatar) {
      chipAvatar.style.display = 'flex';
      chipAvatar.textContent = window.userName.charAt(0).toUpperCase();
    }
  }
}

async function urlToBase64(url) {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('FileReader failed'));
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('Failed to convert image to base64 for offline cache:', url, err);
    return url;
  }
}

async function cacheProfileImagesOffline(profile) {
  if (!profile) return;
  if (profile.profilePicture && !profile.profilePicture.startsWith('data:')) {
    try {
      const base64 = await urlToBase64(profile.profilePicture);
      if (base64 && base64.startsWith('data:')) {
        profile.profilePicture = base64;
        localStorage.setItem('window.userProfilePicture', base64);
        window.userProfilePicture = base64;
      }
    } catch (e) {
      console.warn('Failed to cache profilePicture:', e);
    }
  }
  if (profile.leetcodeProfilePicture && !profile.leetcodeProfilePicture.startsWith('data:')) {
    try {
      const base64 = await urlToBase64(profile.leetcodeProfilePicture);
      if (base64 && base64.startsWith('data:')) {
        profile.leetcodeProfilePicture = base64;
        localStorage.setItem('leetcodeProfilePicture', base64);
      }
    } catch (e) {
      console.warn('Failed to cache leetcodeProfilePicture:', e);
    }
  }
}


// ── Public Profile ──────────────────────────────────────────
/**
 * Opens the high-fidelity Quick View modal for a user.
 * This is the standard "In-App" profile view.
 */
async function openQuickView(username) {
  if (!username) {
    showToast('Username not set for this user.', 'warn');
    return;
  }

  const myUsername = localStorage.getItem('userUsername');
  const myId = localStorage.getItem('window.userId');
  const isMe = (username === myUsername);

  // 1. OFFLINE HANDLING
  if (!navigator.onLine) {
    if (isMe) {
      // Reconstruct view from local data
      const qpName = document.getElementById('qp-name');
      const qpUsername = document.getElementById('qp-username');
      if (qpName) qpName.textContent = localStorage.getItem('window.userName') || 'You';
      if (qpUsername) qpUsername.textContent = `@${myUsername}`;
      
      const avatarImg = document.getElementById('qp-avatar-img');
      const avatarPlc = document.getElementById('qp-avatar-placeholder');
      const myPic = localStorage.getItem('window.userProfilePicture');
      if (avatarImg && avatarPlc) {
        if (myPic) {
          avatarImg.src = myPic;
          avatarImg.style.display = 'block';
          avatarPlc.style.display = 'none';
        } else {
          avatarImg.style.display = 'none';
          avatarPlc.style.display = 'flex';
          avatarPlc.textContent = (localStorage.getItem('window.userName') || 'U').charAt(0).toUpperCase();
        }
      }

      // Streaks (from memory/local)
      const qpCurr = document.getElementById('qp-current-streak');
      const qpHighest = document.getElementById('qp-highest-streak');
      if (qpCurr) qpCurr.textContent = window.backendStreak || 0;
      if (qpHighest) qpHighest.textContent = window.backendStreak || 0; // fallback

      // Badges (from cache)
      const badgeContainer = document.getElementById('qp-badges-container');
      const badgeSection = document.getElementById('qp-badges-section');
      if (badgeContainer && badgeSection) {
        badgeContainer.innerHTML = '';
        const cachedBadges = await window.localDb.badges.toArray();
        if (cachedBadges.length > 0) {
          badgeSection.style.display = 'block';
          cachedBadges.forEach(b => {
             const img = document.createElement('img');
             img.src = b.image;
             img.title = b.name;
             img.className = 'qp-badge-icon'; // assuming styles exist or use inline
             img.style.cssText = 'width:60px; height:60px; object-fit:contain; border:3px solid var(--black); border-radius:12px; padding:8px; box-shadow:4px 4px 0 var(--black);';
             img.onclick = () => openLightbox(b.image);
             badgeContainer.appendChild(img);
          });
        } else {
          badgeSection.style.display = 'none';
        }
      }

      // Activity Graph (Reconstruct from local data)
      const graphData = [];
      const allLocal = await window.localDb.days.toArray();
      allLocal.forEach(d => {
        const completed = (d.categories || []).reduce((acc, cat) => 
          acc + (cat.tasks || []).filter(t => t.completed).length, 0);
        if (completed > 0) graphData.push({ date: d.date, completedCount: completed });
      });
      renderContributionGraph(graphData, 'qp-graph-container');

      // Activity Feed (from local window.allDays)
      const activityList = document.getElementById('qp-activity-list');
      if (activityList) {
        activityList.innerHTML = '';
        const recentDays = [...allDays].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 5);
        if (recentDays.length === 0) {
          activityList.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-size:13px; padding:20px;">No recent activity offline.</p>';
        } else {
          recentDays.forEach(d => activityList.appendChild(buildReadOnlyDayCard(d)));
        }
      }

      openModal('modal-public-profile');
      if (window.lucide) lucide.createIcons();
      return;
    } else {
      showToast('Offline: Cannot view other profiles.', 'info');
      return;
    }
  }

  // 2. ONLINE HANDLING (Original logic)
  try {
    const u = await apiFetch(`${window.API}/api/users/${encodeURIComponent(username)}`);
    if (!u || !u.username) {
      showToast('Profile not found or private.', 'error');
      return;
    }

    window._currentMemberId = u._id;
    window._currentMemberName = u.name;
    window._currentMemberUsername = u.username;
    
    // 1. Identity
    const qpName = document.getElementById('qp-name');
    const qpUsername = document.getElementById('qp-username');
    if (qpName) qpName.textContent = u.name;
    if (qpUsername) qpUsername.textContent = `@${u.username}`;
    
    const avatarImg = document.getElementById('qp-avatar-img');
    const avatarPlc = document.getElementById('qp-avatar-placeholder');
    if (avatarImg && avatarPlc) {
      if (u.profilePicture) {
        avatarImg.src = u.profilePicture;
        avatarImg.style.display = 'block';
        avatarPlc.style.display = 'none';
      } else {
        avatarImg.style.display = 'none';
        avatarPlc.style.display = 'flex';
        avatarPlc.textContent = u.name.charAt(0).toUpperCase();
      }
    }

    // 2. Streaks
    const qpCurr = document.getElementById('qp-current-streak');
    const qpHighest = document.getElementById('qp-highest-streak');
    if (qpCurr) qpCurr.textContent = u.currentStreak;
    if (qpHighest) qpHighest.textContent = u.highestStreak;

    // 2.5 Badges
    const badgeSection = document.getElementById('qp-badges-section');
    const badgeContainer = document.getElementById('qp-badges-container');
    if (badgeSection && badgeContainer) {
      badgeContainer.innerHTML = '';
      if (u.claimedBadges && u.claimedBadges.length > 0) {
        badgeSection.style.display = 'block';
        u.claimedBadges.forEach(b => {
          const img = document.createElement('img');
          img.src = b.image;
          img.title = b.name;
          img.style.cssText = `
            width: 60px; 
            height: 60px; 
            object-fit: contain; 
            cursor: pointer;
            background: var(--bg-card); 
            border: 3px solid var(--black);
            border-radius: 12px;
            padding: 8px;
            box-shadow: 4px 4px 0 var(--black);
            transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          `;
          img.onmouseover = () => {
            img.style.transform = 'translateY(-4px) scale(1.05)';
            img.style.boxShadow = '6px 6px 0 var(--black)';
          };
          img.onmouseout = () => {
            img.style.transform = 'translateY(0) scale(1)';
            img.style.boxShadow = '4px 4px 0 var(--black)';
          };
          img.onclick = () => openLightbox(b.image);
          badgeContainer.appendChild(img);
        });
      } else {
        badgeSection.style.display = 'none';
      }
    }

    // 3. Graph
    renderContributionGraph(u.contributionData, 'qp-graph-container');

    // 4. Feed (Mixed Days & Achievements)
    const activityList = document.getElementById('qp-activity-list');
    if (activityList) {
      if (u.showPrivateDetails === false) {
        activityList.innerHTML = `
          <div style="padding: 24px; background: var(--bg-muted); border: 3px solid var(--black); border-radius: 12px; box-shadow: 4px 4px 0 var(--black); text-align: center; margin-top: 10px;">
            <div style="font-size: 32px; margin-bottom: 12px;">🔒</div>
            <h4 style="margin: 0 0 8px 0; font-family: 'Space Grotesk', sans-serif; font-size: 18px; font-weight: 800; text-transform: uppercase;">Private Profile Feed</h4>
            <p style="margin: 0; font-size: 13px; font-weight: 600; color: var(--text-muted); line-height: 1.5;">This user's detailed progress cards and recent achievements are private.</p>
          </div>
        `;
        openModal('modal-public-profile');
        if (window.lucide) lucide.createIcons();
        return;
      }
      
      activityList.innerHTML = '<div class="loading-spinner" style="padding:20px;"><div class="spinner-ring"></div></div>';
      
      try {
        // Fetch first page of days to show task progress in feed
        const days = await apiFetch(`${window.API}/api/users/${encodeURIComponent(username)}/days?page=1&limit=5`);
        
        const combined = [];
        if (days && days.length > 0) {
          days.forEach(d => combined.push({ type: 'day', date: d.date, data: d }));
        }
        if (u.achievements && u.achievements.length > 0) {
          u.achievements.forEach(a => combined.push({ type: 'achievement', date: a.date, data: a }));
        }
        
        // Sort newest first
        combined.sort((a, b) => b.date.localeCompare(a.date));
        
        activityList.innerHTML = '';
        const recent = combined.slice(0, 10);
        
        if (recent.length === 0) {
          activityList.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-size:13px; padding:20px;">No recent activity recorded yet.</p>';
        } else {
          recent.forEach(item => {
            if (item.type === 'day') {
              activityList.appendChild(buildReadOnlyDayCard(item.data));
            } else {
              activityList.appendChild(buildReadOnlyAchievementCard(item.data));
            }
          });
          
          if (u.achievements.length > 5) {
            const moreBtn = document.createElement('button');
            moreBtn.className = 'btn-ghost ripple';
            moreBtn.style.width = '100%';
            moreBtn.style.marginTop = '12px';
            moreBtn.style.fontSize = '12px';
            moreBtn.style.fontWeight = '800';
            moreBtn.innerHTML = `View All ${u.achievements.length} Wins <i data-lucide="chevron-right" style="width:14px;height:14px;"></i>`;
            moreBtn.onclick = () => {
              window._currentMemberId = u._id;
              window._currentMemberName = u.name;
              openMemberAllAchievements();
            };
            activityList.appendChild(moreBtn);
          }
        }
      } catch (err) {
        console.error('Error loading feed:', err);
        activityList.innerHTML = '<p style="text-align:center; color:var(--red); font-size:12px;">Failed to load recent activity.</p>';
      }
    }

    openModal('modal-public-profile');
    if (window.lucide) lucide.createIcons({ root: document.getElementById('modal-public-profile') });

  } catch (err) {
    console.error('Quick view error:', err);
    showToast('Failed to load profile summary.', 'error');
  }
}

async function previewFullProfile() {
  const input = document.getElementById('profile-username');
  const username = input ? input.value.trim() : localStorage.getItem('userUsername');
  
  if (!username) {
    showToast('Please set a username in settings first.', 'warn');
    return;
  }
  
  try {
    const logData = await logShare('preview');
    const shareCode = logData ? logData.shareCode : null;
    
    closeModal('modal-profile');
    if (shareCode) {
      window.open(`profile.html?u=${username}&code=${shareCode}`, '_blank');
    } else {
      window.open(`profile.html?u=${username}`, '_blank');
    }
  } catch (err) {
    closeModal('modal-profile');
    window.open(`profile.html?u=${username}`, '_blank');
  }
}

function previewMinimalProfile() {
  const input = document.getElementById('profile-username');
  const username = input ? input.value.trim() : localStorage.getItem('userUsername');
  
  if (!username) {
    showToast('Please set a username in settings first.', 'warn');
    return;
  }
  
  // Close the settings modal first to avoid overlap
  closeModal('modal-profile');
  openQuickView(username);
}



function renderContributionGraph(data, targetId = 'public-profile-graph') {
  const container = document.getElementById(targetId);
  
  // Create a map of date -> completedCount
  const dateMap = {};
  if (data) {
    data.forEach(d => { dateMap[d.date] = d.completedCount; });
  }
  
  // We want to render 53 columns (roughly 1 year), ending on today
  const today = new Date();
  const startDate = new Date();
  startDate.setDate(today.getDate() - (52 * 7));
  
  // Align start date to Sunday
  while (startDate.getDay() !== 0) {
    startDate.setDate(startDate.getDate() - 1);
  }
  
  const cellSize = 12;
  const gap = 4;
  const cols = 53;
  const rows = 7;
  const topPadding = 20;
  const monthGap = 12;
  
  let curr = new Date(startDate);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let lastMonth = curr.getMonth();
  
  let rectsHtml = '';
  let monthLabels = '';
  let extraX = 0;
  let maxX = 0;
  
  for (let col = 0; col < cols; col++) {
    if (curr > today) break;
    
    if (curr.getMonth() !== lastMonth) {
      extraX += monthGap;
      monthLabels += `<text x="${col * (cellSize + gap) + extraX}" y="12" dx="16" font-size="11" fill="currentColor" style="color: var(--text);" font-family="Inter, sans-serif" font-weight="600">${monthNames[curr.getMonth()]}</text>`;
      lastMonth = curr.getMonth();
    }
    
    for (let row = 0; row < rows; row++) {
      if (curr > today) break;
      
      const yStr = curr.getFullYear();
      const mStr = String(curr.getMonth() + 1).padStart(2, '0');
      const dStr = String(curr.getDate()).padStart(2, '0');
      const dateStr = `${yStr}-${mStr}-${dStr}`;
      
      const completed = dateMap[dateStr] || 0;
      const x = col * (cellSize + gap) + extraX;
      const y = row * (cellSize + gap) + topPadding;
      
      maxX = Math.max(maxX, x + cellSize);
      
      const fill = completed > 0 ? '#22c55e' : 'var(--graph-empty)';
      const stroke = 'rgba(0,0,0,0.1)';
      const toastMsg = `${dateStr}\\n${completed} task${completed === 1 ? '' : 's'} completed`;
      const titleHover = `${dateStr}: ${completed} task${completed === 1 ? '' : 's'} completed`;
      
      rectsHtml += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" ry="2" fill="${fill}" stroke="${stroke}" stroke-width="1" onclick="showToast('${toastMsg}', 'graph')" style="cursor:pointer;"><title>${titleHover}</title></rect>`;
      
      curr.setDate(curr.getDate() + 1);
    }
  }
  
  const width = maxX;
  const height = rows * (cellSize + gap) - gap + topPadding;
  
  let svg = `<div style="width: ${width}px; height: ${height}px; flex-shrink: 0; padding-bottom: 16px;"><svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="display:block;">`;
  svg += monthLabels;
  svg += rectsHtml;
  svg += '</svg></div>';
  container.innerHTML = svg;
}

function buildReadOnlyDayCard(day) {
  const card = document.createElement('div');
  card.className = 'qp-activity-item';
  card.style.background = 'var(--bg-muted)';
  card.style.border = 'var(--border-2)';
  card.style.borderRadius = 'var(--r-md)';
  card.style.padding = '16px';
  card.style.marginBottom = '12px';
  card.style.display = 'block';
  
  let totalTasks = 0, completedTasks = 0;
  let tasksHtml = '<div style="margin-top:12px; display:none; flex-direction:column; gap:8px;" class="public-day-tasks">';
  day.categories.forEach(cat => {
    if (cat.tasks.length > 0) {
      tasksHtml += `<div style="font-size:13px; font-weight:700; color:var(--text); margin-top:4px;">${cat.name}</div>`;
      cat.tasks.forEach(t => {
        totalTasks++;
        if (t.completed) completedTasks++;
        
        tasksHtml += `
          <div style="display:flex; align-items:flex-start; gap:8px; font-size:13px; color:var(--text-muted);">
            <div style="margin-top:2px; font-weight:bold; color:${t.completed ? '#22c55e' : '#ccc'};">${t.completed ? '✓' : '○'}</div>
            <div style="flex:1;">${t.title}</div>
          </div>
        `;
      });
    }
  });
  tasksHtml += '</div>';
  
  card.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <h4 style="margin:0; font-size:16px;">${formatDisplayDate(day.date)}</h4>
      <div style="display:flex; gap:8px; align-items:center;">
        <span style="font-size:14px; font-weight:600; padding:2px 8px; border-radius:12px; background:${completedTasks === totalTasks && totalTasks > 0 ? '#22c55e' : 'var(--bg-muted)'}; color:var(--text);">
          ${completedTasks}/${totalTasks} Tasks
        </span>
        <button class="btn-ghost ripple toggle-tasks-btn" style="padding:4px 8px; font-size:12px;" onclick="this.parentElement.parentElement.nextElementSibling.style.display = this.parentElement.parentElement.nextElementSibling.style.display === 'none' ? 'flex' : 'none'">▼</button>
      </div>
    </div>
    ${tasksHtml}
  `;
  return card;
}

function buildReadOnlyAchievementCard(ach) {
  const card = document.createElement('div');
  card.className = 'qp-activity-item';
  card.style.background = 'rgba(255, 62, 165, 0.08)';
  card.style.border = '2px solid var(--pink)';
  card.style.borderRadius = 'var(--r-md)';
  card.style.padding = '16px';
  card.style.marginBottom = '12px';
  card.style.display = 'block';
  card.style.borderLeftWidth = '6px';
  
  card.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
      <h4 style="margin:0; font-size:16px;"><i data-lucide="trophy"></i> ${ach.title}</h4>
      <span style="font-size:12px; color:var(--text-muted);">${new Date(ach.date).toLocaleDateString()}</span>
    </div>
    ${ach.description ? `<p style="margin:0; font-size:14px; color:var(--text-muted);">${ach.description}</p>` : ''}
  `;
  return card;
}


// ── Profile Module Bindings ──────────────────────────────────
window.openProfileModal = openProfileModal;
window.renderProfileData = renderProfileData;
window.togglePasswordSection = togglePasswordSection;
window.submitProfileSettings = submitProfileSettings;
window.submitPasswordChange = submitPasswordChange;
window.openDeleteWarning = openDeleteWarning;
window.proceedToDeleteConfirm = proceedToDeleteConfirm;
window.checkDeleteConfirmation = checkDeleteConfirmation;
window.verifyAndDeleteAccount = verifyAndDeleteAccount;
window.handleProfilePictureSelect = handleProfilePictureSelect;
window.handleGroupIconSelect = handleGroupIconSelect;
window.updateNavAvatar = updateNavAvatar;
window.urlToBase64 = urlToBase64;
window.cacheProfileImagesOffline = cacheProfileImagesOffline;
window.openQuickView = openQuickView;
window.previewFullProfile = previewFullProfile;
window.previewMinimalProfile = previewMinimalProfile;
window.renderContributionGraph = renderContributionGraph;
window.buildReadOnlyDayCard = buildReadOnlyDayCard;
window.buildReadOnlyAchievementCard = buildReadOnlyAchievementCard;
console.log("[Module] profile.js loaded and Profile bound to window");
