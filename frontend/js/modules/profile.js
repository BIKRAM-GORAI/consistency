// ── Profile Module ───────────────────────────────────────────
import { syncDeviceReminders } from './reminders.js';
console.log("[Module] profile.js initializing...");

// Local toast reference delegation to bypass strict module scope reference errors
const showToast = (...args) => window.showToast(...args);

// ── Profile & Settings ─────────────────────────────────────
async function openProfileModal() {
  document.getElementById('profile-pic-dataurl').value = '';
  openModal('modal-profile');
  
  if (latestChangelogDate) {
    localStorage.setItem('dismissedOuterChangelogDot', latestChangelogDate);
    const outerDot = document.getElementById('profile-red-dot');
    if (outerDot) outerDot.style.display = 'none';
  }

  // Clear sensitive fields
  document.getElementById('profile-old-password').value = '';
  document.getElementById('profile-new-password').value = '';
  document.getElementById('profile-confirm-password').value = '';

  // Reset password collapse section
  const pwdSection = document.getElementById('password-change-section');
  if (pwdSection) pwdSection.style.display = 'none';
  const pwdIcon = document.getElementById('toggle-pwd-icon');
  if (pwdIcon) pwdIcon.textContent = '▼';

  // Initialize temporary state for app limits and theme select dropdown
  window.tempAppLimits = JSON.parse(JSON.stringify(window.currentAppLimits || { enabled: false, apps: [] }));
  const themeSelect = document.getElementById('theme-select');
  if (themeSelect) {
    themeSelect.value = localStorage.getItem('theme') || 'claymorphism';
  }

  // Synchronous baseline population from localStorage to ensure instant loading of username, email, photo, showcase status, and LeetCode details on refresh/offline
  const storedName = localStorage.getItem('window.userName') || localStorage.getItem('userName') || '';
  const storedEmail = localStorage.getItem('userEmail') || '';
  const storedUsername = localStorage.getItem('userUsername') || '';
  const storedPic = localStorage.getItem('window.userProfilePicture') || localStorage.getItem('userProfilePicture') || '';
  const storedShowcase = localStorage.getItem('showOnLeaderboard');
  const storedEmailVerified = localStorage.getItem('isEmailVerified') === 'true';

  const storedLcUsername = localStorage.getItem('leetcodeUsername') || '';
  const storedLcPending = localStorage.getItem('leetcodePendingUsername') || '';
  const storedLcCode = localStorage.getItem('leetcodeVerificationCode') || '';
  const storedLcStatus = localStorage.getItem('leetcodeVerificationStatus') || 'none';
  const storedLcRetryScheduled = localStorage.getItem('leetcodeRetryScheduledAt') || null;
  const storedLcPic = localStorage.getItem('leetcodeProfilePicture') || '';

  const baselineUser = {
    name: storedName,
    email: storedEmail,
    username: storedUsername,
    profilePicture: storedPic,
    showOnLeaderboard: storedShowcase !== 'false',
    isEmailVerified: storedEmailVerified,
    emailNotifications: true,
    isPublicProfile: true,
    leetcodeUsername: storedLcUsername,
    leetcodePendingUsername: storedLcPending,
    leetcodeVerificationCode: storedLcCode,
    leetcodeVerificationStatus: storedLcStatus,
    leetcodeRetryScheduledAt: storedLcRetryScheduled,
    leetcodeProfilePicture: storedLcPic,
    leetcodeUsernameChangeCount: 0,
    leetcodeLastVerifiedAt: storedLcStatus === 'verified' ? new Date().toISOString() : null
  };
  renderProfileData(baselineUser);

  // 1. INSTANT: Show in-memory cache first (already loaded at startup by loadDays)
  if (window.currentAppLimits && typeof loadAppLimits === 'function') {
    // Show app limits section immediately without any async wait
    const card = document.getElementById('android-usage-stats-card');
    if (card && window.isAndroidNative) {
      card.style.display = 'block';
      renderAppLimitsUI(window.currentAppLimits);
    }
  }

  // 2. STALE: Load full profile from IndexedDB cache instantly (sync-like)
  try {
    const cached = await window.localDb.userProfile.get(window.userId);
    if (cached) renderProfileData(cached);
  } catch (e) {}

  // 3. REVALIDATE: Fetch from server in the background — never blocks the UI
  if (navigator.onLine) {
    (async () => {
      try {
        const res = await apiFetch(`${window.API}/api/auth/settings`);
        res.userId = window.userId;
        // Only fetch and cache the image if it is not already a base64 data URI
        if (res.profilePicture && !res.profilePicture.startsWith('data:')) {
          await cacheProfileImagesOffline(res);
        } else if (!res.profilePicture) {
          // Preserve the cached base64 so we don't lose the offline copy
          const existing = await window.localDb.userProfile.get(window.userId).catch(() => null);
          if (existing && existing.profilePicture && existing.profilePicture.startsWith('data:')) {
            res.profilePicture = existing.profilePicture;
          }
        }
        await window.localDb.userProfile.put(res);
        if (res.isPremium !== undefined) {
          localStorage.setItem('isPremium', res.isPremium.toString());
          localStorage.setItem('subscriptionTier', res.isPremium ? 'premium' : 'free');
        }
        renderProfileData(res);
        setLeaderboardTogglesEnabled(true);
        // Sync reminders with fresh settings
        syncDeviceReminders(window.allDays || [], res);
        // Background-refresh app limits too (non-blocking)
        if (typeof loadAppLimits === 'function') loadAppLimits();
      } catch (err) {
        console.error('Error loading profile:', err);
      }
    })();
  }

  // Dynamic App version rendering logic
  const versionContainer = document.getElementById('app-version-info');
  if (versionContainer) {
    versionContainer.innerHTML = `
      <div style="font-size: 11px; font-weight: 800; color: var(--text-muted); text-align: center; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.85;">
        Version Running: v${window.runningAppVersion || '2.0'} (checking...)
      </div>
    `;
    fetch('https://consistency-daily.vercel.app/app-version.json?t=' + Date.now())
      .then(r => r.json())
      .then(data => {
        const latest = data.latestVersion;
        const current = window.runningAppVersion || '2.0';
        
        let updateText = '';
        if (latest !== current) {
          updateText = ` <span style="color: var(--pink); font-weight: 900;">(v${latest} available)</span>`;
        } else {
          updateText = ` <span style="color: var(--green); font-weight: 900;">(Up to date)</span>`;
        }
        
        versionContainer.innerHTML = `
          <div style="font-size: 11px; font-weight: 800; color: var(--text-muted); text-align: center; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.85;">
            Version Running: v${current} &nbsp;&nbsp;|&nbsp;&nbsp; Latest Release: v${latest}${updateText}
          </div>
        `;
      })
      .catch(() => {
        versionContainer.innerHTML = `
          <div style="font-size: 11px; font-weight: 800; color: var(--text-muted); text-align: center; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.85;">
            Version Running: v${window.runningAppVersion || '2.0'}
          </div>
        `;
      });
  }

  // Load premium subscription & limits status
  // loadSubscriptionStatus(); // Managed in subscription.html
}

/** Helper to populate profile fields from a user object */
function renderProfileData(user) {
  if (!user) return;

  if (typeof checkChangelogNotifications === 'function') {
    checkChangelogNotifications(user);
  }
  
  if (user.profilePicture) {
    window.userProfilePicture = user.profilePicture;
    localStorage.setItem('window.userProfilePicture', window.userProfilePicture);
    updateNavAvatar();
  }

  const isPremium = localStorage.getItem('isPremium') === 'true' || user.isPremium === true;
  const profileAvatarContainer = document.querySelector('.profile-avatar-container');
  if (profileAvatarContainer) {
    if (isPremium) {
      profileAvatarContainer.classList.add('premium-avatar-ring');
    } else {
      profileAvatarContainer.classList.remove('premium-avatar-ring');
    }
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

  const leetcodeAutoSyncToggle = document.getElementById('leetcode-auto-sync-toggle');
  if (leetcodeAutoSyncToggle) {
    leetcodeAutoSyncToggle.checked = !!user.leetcodeAutoSync;
    leetcodeAutoSyncToggle.disabled = false;
    leetcodeAutoSyncToggle.parentElement.classList.remove('disabled');
    leetcodeAutoSyncToggle.title = '';
  }

  const globalReminderToggle = document.getElementById('global-streak-reminder-toggle');
  if (globalReminderToggle) {
    globalReminderToggle.checked = user.globalStreakReminderEnabled !== false;
    toggleGlobalStreakTimeFields(user.globalStreakReminderEnabled !== false);
  }
  const globalReminderTime = document.getElementById('global-streak-reminder-time');
  if (globalReminderTime) {
    globalReminderTime.value = user.globalStreakReminderTime || '21:00';
  }
  const globalReminderTypeRadios = document.querySelectorAll('input[name="global-streak-reminder-type-radio"]');
  globalReminderTypeRadios.forEach(rad => {
    rad.checked = (rad.value === (user.globalStreakReminderType || 'notification'));
  });
  
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
    } else {
      unameInput.readOnly = false;
      const hint = document.getElementById('profile-username-hint');
      if (hint) {
        hint.innerHTML = 'Must be 4-20 characters long. Alphanumeric and special characters only (no spaces).<br><i data-lucide="alert-triangle" style="width: 14px; height: 14px;"></i> Username can be set only once.';
        if (window.lucide) lucide.createIcons({ root: hint });
      }
    }
  }
  
  if (typeof window.loadClaimedBadges === 'function') {
    window.loadClaimedBadges();
  }
  
  // Also load LeetCode status
  if (typeof loadLeetCodeProfileStatus === 'function') {
    loadLeetCodeProfileStatus();
  }

  const themeSelect = document.getElementById('theme-select');
  if (typeof window.applyThemeConfigRules === 'function') {
    window.applyThemeConfigRules();
  }
  if (themeSelect && user.theme) {
    const isDarkAllowed = !!(window.globalConfig && window.globalConfig.enableDarkBrutalistTheme);
    const effectiveUserTheme = (user.theme === 'dark' && !isDarkAllowed) ? 'claymorphism' : (user.theme || 'claymorphism');
    themeSelect.value = effectiveUserTheme;
    
    // Automatically apply synced theme to the layout if it differs from current local theme
    const currentTheme = localStorage.getItem('theme') || 'claymorphism';
    if (effectiveUserTheme !== currentTheme && typeof window.toggleAppTheme === 'function') {
      window.toggleAppTheme(effectiveUserTheme);
    }
  }

  // Update Email Verification UI
  updateEmailVerificationUI(user);
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
  
  const globalStreakReminderEnabled = document.getElementById('global-streak-reminder-toggle').checked;
  const globalStreakReminderTime = document.getElementById('global-streak-reminder-time').value || '21:00';
  const globalStreakReminderType = document.querySelector('input[name="global-streak-reminder-type-radio"]:checked')?.value || 'notification';
  const leetcodeAutoSync = document.getElementById('leetcode-auto-sync-toggle')?.checked || false;

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
    const themeSelect = document.getElementById('theme-select');
    const selectedTheme = themeSelect ? themeSelect.value : 'light';
    const payload = { 
      emailNotifications, 
      isPublicProfile, 
      showOnLeaderboard,
      globalStreakReminderEnabled,
      globalStreakReminderTime,
      globalStreakReminderType,
      leetcodeAutoSync,
      theme: selectedTheme
    };
    if (!usernameInput.readOnly && username) {
      payload.username = username;
      localStorage.setItem('userUsername', username);
    }
    if (profilePicture) {
      payload.profilePicture = profilePicture;
    }

    // 1. Update Locally First (Offline-First) - This is INSTANT
    if (window.localDb) {
      const userId = window.userId;
      await window.localDb.userProfile.put({ ...payload, userId: window.userId });
      
      // 2. Queue for Sync ONLY if offline to avoid duplicate concurrent uploads online
      if (!navigator.onLine) {
        window.syncManager.addToQueue('PATCH', 'auth/settings', null, payload);
      }
    }
    localStorage.setItem('showOnLeaderboard', showOnLeaderboard.toString());

    // Sync device alerts with Capacitor Plugin
    syncDeviceReminders(window.allDays || [], {
      globalStreakReminderEnabled,
      globalStreakReminderTime,
      globalStreakReminderType
    });

    // Commit temporary app limits if they exist
    if (window.tempAppLimits) {
      window.currentAppLimits = JSON.parse(JSON.stringify(window.tempAppLimits));
      await persistAppLimits(window.currentAppLimits);
    }

    // Apply and sync theme if changed
    const currentTheme = localStorage.getItem('theme') || 'light';
    if (selectedTheme !== currentTheme) {
      if (typeof window.toggleAppTheme === 'function') {
        await window.toggleAppTheme(selectedTheme);
      } else {
          if (selectedTheme === 'dark') {
            await window.toggleDarkTheme(true);
          } else if (selectedTheme === 'light') {
            await window.toggleDarkTheme(false);
          } else if (selectedTheme === 'premium-aurora') {
            document.documentElement.setAttribute('data-theme', 'premium-aurora');
            localStorage.setItem('theme', 'premium-aurora');
            await apiFetch(`${window.API}/api/auth/settings`, {
              method: 'PATCH',
              body: JSON.stringify({ theme: 'premium-aurora' })
            });
          } else if (selectedTheme === 'minimalistic') {
            document.documentElement.setAttribute('data-theme', 'minimalistic');
            localStorage.setItem('theme', 'minimalistic');
            await apiFetch(`${window.API}/api/auth/settings`, {
              method: 'PATCH',
              body: JSON.stringify({ theme: 'minimalistic' })
            });
          }
        }
      }

    // 3. SHOW SUCCESS INSTANTLY
    showToast('Settings saved!', 'success');
    
    // Sync the other toggle
    const lbShowcaseToggle = document.getElementById('leaderboard-showcase-toggle');
    if (lbShowcaseToggle) lbShowcaseToggle.checked = showOnLeaderboard;
    
    closeModal('modal-profile');

    // 4. Background Sync (Don't await it for the UI) ONLY if online
    if (navigator.onLine) {
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
          if (typeof window.forceReloadLeaderboard === 'function') {
            window.forceReloadLeaderboard();
          } else if (typeof loadLeaderboard === 'function') {
            loadLeaderboard(true);
          }
        }
      }).catch(err => {
        console.warn('Background profile sync failed:', err);
      });
    }

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
  const finalBtn = document.getElementById('btn-final-delete');
  if (finalBtn) {
    finalBtn.disabled = true;
    finalBtn.style.opacity = '0.5';
    finalBtn.style.cursor = 'not-allowed';
    finalBtn.style.backgroundColor = 'var(--red)';
    finalBtn.style.color = '#ffffff';
  }
  
  document.getElementById('modal-delete-confirm').classList.add('open');
}

function checkDeleteConfirmation() {
  const inputVal = document.getElementById('delete-username-input').value.trim();
  const btn = document.getElementById('btn-final-delete');
  if (!btn) return;
  
  // Ensure the input matches and is NOT empty
  if (inputVal === targetDeletionString && inputVal !== '') {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
    btn.style.backgroundColor = 'var(--red)';
    btn.style.color = '#ffffff';
  } else {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
    btn.style.backgroundColor = 'var(--red)';
    btn.style.color = '#ffffff';
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
    const adminToken = localStorage.getItem('adminToken');
    localStorage.clear();
    if (adminToken) localStorage.setItem('adminToken', adminToken);
    
    if (window.localDb) {
      window.localDb.delete().then(() => {
        window.location.replace('landing.html');
      }).catch(() => {
        window.location.replace('landing.html');
      });
    } else {
      window.location.replace('landing.html');
    }
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

  const isPremium = localStorage.getItem('isPremium') === 'true';
  const avatarContainer = document.querySelector('.nav-user-chip > div');
  if (avatarContainer) {
    if (isPremium) {
      avatarContainer.classList.add('premium-nav-ring');
    } else {
      avatarContainer.classList.remove('premium-nav-ring');
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
  const myId = window.userId;
  const isMe = (username === myUsername);

  // 1. OFFLINE HANDLING
  if (!navigator.onLine) {
    if (isMe) {
      // Reconstruct view from local data
      const qpName = document.getElementById('qp-name');
      const qpUsername = document.getElementById('qp-username');
      if (qpName) qpName.textContent = localStorage.getItem('window.userName') || localStorage.getItem('userName') || 'You';
      if (qpUsername) qpUsername.textContent = `@${myUsername}`;
      
      const isPremiumSelf = localStorage.getItem('isPremium') === 'true';
      const avatarWrap = document.getElementById('qp-avatar-wrap');
      let premiumBanner = document.getElementById('qp-premium-banner');
      if (!premiumBanner && avatarWrap) {
        premiumBanner = document.createElement('div');
        premiumBanner.id = 'qp-premium-banner';
        premiumBanner.className = 'premium-profile-banner';
        premiumBanner.textContent = '👑 Premium Builder';
        avatarWrap.parentNode.insertBefore(premiumBanner, avatarWrap);
      }
      if (isPremiumSelf) {
        if (premiumBanner) premiumBanner.style.display = 'inline-flex';
        if (avatarWrap) avatarWrap.classList.add('premium-avatar-ring');
        if (qpName) qpName.classList.add('premium-profile-name');
        const header = document.querySelector('#modal-public-profile .modal-header');
        const body = document.querySelector('#modal-public-profile .modal-body');
        if (header) header.style.background = 'linear-gradient(45deg, #fbbf24, #a855f7)';
        if (body) body.style.background = 'linear-gradient(135deg, var(--bg-card), rgba(168, 85, 247, 0.08))';
      } else {
        if (premiumBanner) premiumBanner.style.display = 'none';
        if (avatarWrap) avatarWrap.classList.remove('premium-avatar-ring');
        if (qpName) qpName.classList.remove('premium-profile-name');
        const header = document.querySelector('#modal-public-profile .modal-header');
        const body = document.querySelector('#modal-public-profile .modal-body');
        if (header) header.style.background = 'var(--yellow)';
        if (body) body.style.background = 'var(--bg-card)';
      }
      
      const avatarImg = document.getElementById('qp-avatar-img');
      const avatarPlc = document.getElementById('qp-avatar-placeholder');
      const myPic = localStorage.getItem('window.userProfilePicture') || localStorage.getItem('userProfilePicture');
      if (avatarImg && avatarPlc) {
        if (myPic) {
          avatarImg.src = myPic;
          avatarImg.style.display = 'block';
          avatarPlc.style.display = 'none';
        } else {
          avatarImg.style.display = 'none';
          avatarPlc.style.display = 'flex';
          avatarPlc.textContent = (localStorage.getItem('window.userName') || localStorage.getItem('userName') || 'U').charAt(0).toUpperCase();
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
      renderContributionGraph(graphData, 'qp-graph-container', localStorage.getItem('isPremium') === 'true');

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

    // Check friendship status and render actions if not me
    const actionsContainer = document.getElementById('qp-actions-container');
    if (actionsContainer) {
      if (isMe) {
        actionsContainer.style.display = 'none';
        actionsContainer.innerHTML = '';
      } else {
        actionsContainer.style.display = 'flex';
        actionsContainer.innerHTML = '<div class="loading-spinner-small" style="margin:0 auto; width:20px; height:20px; border:3px solid var(--black); border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite;"></div>';
        
        // Fetch status in background and render actions
        apiFetch(`${window.API}/api/friends/status/${u._id}`)
          .then(statusRes => {
            renderProfileActions(u, statusRes.status);
          })
          .catch(err => {
            console.error('Failed to load friendship status:', err);
            actionsContainer.innerHTML = '';
          });
      }
    }
    
    // 1. Identity
    const qpName = document.getElementById('qp-name');
    const qpUsername = document.getElementById('qp-username');
    if (qpName) qpName.textContent = u.name;
    if (qpUsername) qpUsername.textContent = `@${u.username}`;
    
    const avatarWrap = document.getElementById('qp-avatar-wrap');
    let premiumBanner = document.getElementById('qp-premium-banner');
    if (!premiumBanner && avatarWrap) {
      premiumBanner = document.createElement('div');
      premiumBanner.id = 'qp-premium-banner';
      premiumBanner.className = 'premium-profile-banner';
      premiumBanner.textContent = '👑 Premium Builder';
      avatarWrap.parentNode.insertBefore(premiumBanner, avatarWrap);
    }
    if (u.isPremium) {
      if (premiumBanner) premiumBanner.style.display = 'inline-flex';
      if (avatarWrap) avatarWrap.classList.add('premium-avatar-ring');
      if (qpName) qpName.classList.add('premium-profile-name');
      const header = document.querySelector('#modal-public-profile .modal-header');
      const body = document.querySelector('#modal-public-profile .modal-body');
      if (header) header.style.background = 'linear-gradient(45deg, #fbbf24, #a855f7)';
      if (body) body.style.background = 'linear-gradient(135deg, var(--bg-card), rgba(168, 85, 247, 0.08))';
    } else {
      if (premiumBanner) premiumBanner.style.display = 'none';
      if (avatarWrap) avatarWrap.classList.remove('premium-avatar-ring');
      if (qpName) qpName.classList.remove('premium-profile-name');
      const header = document.querySelector('#modal-public-profile .modal-header');
      const body = document.querySelector('#modal-public-profile .modal-body');
      if (header) header.style.background = 'var(--yellow)';
      if (body) body.style.background = 'var(--bg-card)';
    }

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
    renderContributionGraph(u.contributionData, 'qp-graph-container', u.isPremium);

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
      
      // Open the modal instantly first, allowing the UI to show immediately
      openModal('modal-public-profile');
      if (window.lucide) lucide.createIcons({ root: document.getElementById('modal-public-profile') });

      // Fetch first page of days to show task progress in feed asynchronously (non-blocking)
      apiFetch(`${window.API}/api/users/${encodeURIComponent(username)}/days?page=1&limit=5`)
        .then(days => {
          const combined = [];
          if (days && days.length > 0) {
            days.forEach(d => combined.push({ type: 'day', date: d.date, data: d }));
          }
          if ((u.achievementsPublic !== false || isMe) && u.achievements && u.achievements.length > 0) {
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
            
            if (u.achievementsPublic !== false && u.achievements && u.achievements.length > 5) {
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
              if (window.lucide) lucide.createIcons({ root: moreBtn });
            }
          }
        })
        .catch(err => {
          console.error('Error loading feed:', err);
          activityList.innerHTML = '<p style="text-align:center; color:var(--red); font-size:12px;">Failed to load recent activity.</p>';
        });
    } else {
      openModal('modal-public-profile');
      if (window.lucide) lucide.createIcons({ root: document.getElementById('modal-public-profile') });
    }

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



function renderContributionGraph(data, targetId = 'public-profile-graph', isPremium = false) {
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
      
      let fill = completed > 0 ? '#22c55e' : 'var(--graph-empty)';
      let rectStyle = 'cursor:pointer;';
      if (isPremium && completed > 0) {
        fill = 'url(#premiumGlowGradient)';
      }
      
      const stroke = 'rgba(0,0,0,0.1)';
      const toastMsg = `${dateStr}\\n${completed} task${completed === 1 ? '' : 's'} completed`;
      const titleHover = `${dateStr}: ${completed} task${completed === 1 ? '' : 's'} completed`;
      
      rectsHtml += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" ry="2" fill="${fill}" stroke="${stroke}" stroke-width="1" onclick="showToast('${toastMsg}', 'graph')" style="${rectStyle}"><title>${titleHover}</title></rect>`;
      
      curr.setDate(curr.getDate() + 1);
    }
  }
  
  const width = maxX;
  const height = rows * (cellSize + gap) - gap + topPadding;
  
  let svg = `<div style="width: ${width}px; height: ${height}px; flex-shrink: 0; padding-bottom: 16px;"><svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="display:block;">`;
  
  // Dynamic gradient definition for premium glowing effect (holographic sunset)
  svg += `
    <defs>
      <linearGradient id="premiumGlowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFD60A" />
        <stop offset="50%" stop-color="#FF2E93" />
        <stop offset="100%" stop-color="#8A2BE2" />
      </linearGradient>
    </defs>
  `;
  
  svg += monthLabels;
  svg += rectsHtml;
  svg += '</svg></div>';
  container.innerHTML = svg;
}

function buildReadOnlyDayCard(day, allAchievements = []) {
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
  (day.categories || []).forEach(cat => {
    if (cat.tasks && cat.tasks.length > 0) {
      tasksHtml += `<div style="font-size:13px; font-weight:700; color:var(--text); margin-top:4px;">${cat.name}</div>`;
      cat.tasks.forEach(t => {
        totalTasks++;
        if (t.completed) completedTasks++;
        
        tasksHtml += `
          <div style="display:flex; align-items:flex-start; gap:8px; font-size:13px; color:var(--text-muted);">
            <div style="margin-top:2px; font-weight:bold; color:${t.completed ? '#22c55e' : '#ccc'};">${t.completed ? '✓' : '○'}</div>
            <div style="flex:1;">${escHtml(t.title)}</div>
          </div>
        `;
      });
    }
  });
  tasksHtml += '</div>';
  
  const dayDateStr = (day.date || '').split('T')[0];
  const hasAchsOnDay = (allAchievements || []).some(a => (a.date || '').split('T')[0] === dayDateStr || String(a.dayId) === String(day._id));
  const isMilestoneOnly = totalTasks === 0 && (hasAchsOnDay || day.hasAchievement || day.isMilestoneDay || true);

  let statusPill = '';
  if (isMilestoneOnly && totalTasks === 0) {
    statusPill = `
      <span class="milestone-day-badge" style="font-size: 11px; font-weight: 900; background: linear-gradient(135deg, #ec4899, #8b5cf6); color: #ffffff; padding: 4px 10px; border-radius: 6px; border: 2px solid var(--black); box-shadow: 2px 2px 0 var(--black); text-transform: uppercase; letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 6px;">
        <i data-lucide="trophy" style="width: 14px; height: 14px;"></i> Goal Milestone Day
      </span>
    `;
  } else {
    statusPill = `
      <span style="font-size:14px; font-weight:600; padding:2px 8px; border-radius:12px; background:${completedTasks === totalTasks && totalTasks > 0 ? '#22c55e' : 'var(--bg-muted)'}; color:var(--text);">
        ${completedTasks}/${totalTasks} Tasks
      </span>
      <button class="btn-ghost ripple toggle-tasks-btn" style="padding:4px 8px; font-size:12px;" onclick="this.parentElement.parentElement.nextElementSibling.style.display = this.parentElement.parentElement.nextElementSibling.style.display === 'none' ? 'flex' : 'none'">▼</button>
    `;
  }

  card.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <h4 style="margin:0; font-size:16px;">${formatDisplayDate(day.date)}</h4>
      <div style="display:flex; gap:8px; align-items:center;">
        ${statusPill}
      </div>
    </div>
    ${totalTasks > 0 ? tasksHtml : ''}
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
  
  const isGoalAch = ach.title && ach.title.startsWith('Goal Achieved:');
  const badgeHTML = isGoalAch
    ? `<span style="background:rgba(16,185,129,0.15); color:#10b981; border:1px solid #10b981; padding:3px 8px; border-radius:12px; font-size:10px; font-weight:800; text-transform:uppercase; display:inline-flex; align-items:center; gap:4px;"><i data-lucide="target" style="width:11px; height:11px;"></i> Goal Accomplished</span>`
    : `<span style="background:rgba(236,72,153,0.15); color:#ec4899; border:1px solid #ec4899; padding:3px 8px; border-radius:12px; font-size:10px; font-weight:800; text-transform:uppercase; display:inline-flex; align-items:center; gap:4px;"><i data-lucide="award" style="width:11px; height:11px;"></i> Achievement of the Day</span>`;

  card.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
      ${badgeHTML}
      <span style="font-size:11px; font-weight:700; color:var(--text-muted);">${new Date(ach.date).toLocaleDateString()}</span>
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <h4 style="margin:0; font-size:15px; font-weight:800;"><i data-lucide="${isGoalAch ? 'target' : 'trophy'}"></i> ${window.escHtml(ach.title)}</h4>
    </div>
    ${ach.description ? `<p style="margin:6px 0 0 0; font-size:13px; color:var(--text-muted); line-height:1.4;">${window.escHtml(ach.description)}</p>` : ''}
  `;
  return card;
}

// ── Screen Time & App Limits Logic ───────────────────────────
async function loadAppLimits() {
  const card = document.getElementById('android-usage-stats-card');
  if (!card) return;

  if (!window.isAndroidNative) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';

  // 1. INSTANT: Use in-memory cache if already loaded (fastest path — no I/O at all)
  if (window.currentAppLimits) {
    renderAppLimitsUI(window.currentAppLimits);
  }

  // 2. FAST FALLBACK: Load from IndexedDB if not in memory yet
  let limits = window.currentAppLimits || null;
  if (!limits) {
    try {
      limits = await window.localDb.appLimits.get(window.userId);
      if (limits) {
        window.currentAppLimits = limits;
        renderAppLimitsUI(limits);
      }
    } catch (e) {
      console.error('Error loading local app limits:', e);
    }
  }

  // 3. BACKGROUND REVALIDATE: Refresh from server without blocking the UI
  if (navigator.onLine) {
    try {
      const res = await apiFetch(`${window.API}/api/applimits`);
      if (res) {
        limits = res;
        window.currentAppLimits = limits;
        await window.localDb.appLimits.put({ ...res, userId: window.userId });
        // Only re-render if something actually changed to avoid UI flicker
        renderAppLimitsUI(limits);
      }
    } catch (err) {
      console.error('Error loading app limits from server:', err);
    }
  }

  // Default fallback if nothing loaded
  if (!limits) {
    limits = { enabled: false, apps: [] };
    window.currentAppLimits = limits;
    renderAppLimitsUI(limits);
  }
}

function renderAppLimitsUI(limits) {
  const profileModal = document.getElementById('modal-profile');
  if (profileModal && profileModal.classList.contains('open')) {
    if (!window.tempAppLimits) {
      window.tempAppLimits = JSON.parse(JSON.stringify(limits || { enabled: false, apps: [] }));
    }
    limits = window.tempAppLimits;
  }

  const toggle = document.getElementById('distraction-limit-toggle');
  const config = document.getElementById('distraction-apps-configuration');
  if (toggle) toggle.checked = limits.enabled;

  if (limits.enabled) {
    config.style.display = 'block';
    
    // Check permission in background to prevent interface freezes
    checkAndroidPermissionStatus().then(granted => {
      if (!granted) {
        document.getElementById('selected-apps-limits-list').innerHTML = `
          <div style="padding: 12px; background: rgba(239, 68, 68, 0.15); border: 2px solid var(--red); border-radius: 8px; color: var(--text); font-size: 13px; font-weight: 600; text-align: center; margin-bottom: 12px;">
            ⚠️ Usage Access permission is not granted.
            <button class="btn-ghost ripple" style="margin-top: 8px; padding: 4px 8px; font-size: 11px; border: 1px solid var(--red); color: var(--red); text-transform: uppercase;" onclick="openUsageStatsPermissionModal()">Grant Permission</button>
          </div>
        `;
      } else {
        renderAppLimitsList(limits.apps);
      }
    });
  } else {
    config.style.display = 'none';
  }
}

async function checkAndroidPermissionStatus() {
  if (!window.isAndroidNative || !window.Capacitor || !window.Capacitor.Plugins.UsageStatsPlugin) {
    return false;
  }
  try {
    const res = await window.Capacitor.Plugins.UsageStatsPlugin.checkPermission();
    return res && res.granted;
  } catch (e) {
    console.error('Failed to check Android permission status:', e);
    return false;
  }
}

function renderAppLimitsList(apps) {
  const container = document.getElementById('selected-apps-limits-list');
  if (!container) return;

  if (!apps || apps.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 16px; color: var(--text-muted); font-size: 13px; font-weight: 600; border: 1px dashed var(--border-color); border-radius: 8px;">
        No apps added yet. Add up to 10 apps to start tracking.
      </div>
    `;
    return;
  }

  let html = '';
  apps.forEach(app => {
    const iconSrc = app.iconBase64 || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    html += `
      <div class="limit-app-item" style="display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg); border: var(--border-2); border-radius: 8px;" data-package="${app.packageName}">
        <img src="${iconSrc}" style="width: 32px; height: 32px; border-radius: 6px; object-fit: contain;" onerror="this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='" />
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 700; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text);">${app.appName}</div>
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
            <input type="range" min="5" max="240" step="5" value="${app.limitMinutes}" 
                   style="flex: 1; min-width: 0; width: 100%; height: 6px; background: var(--bg-muted); border-radius: 3px; accent-color: #a855f7; cursor: pointer;"
                   oninput="updateLimitLabel(this, '${app.packageName}')" 
                   onchange="saveLimitValue('${app.packageName}', parseInt(this.value, 10))" />
            <span class="limit-val" style="font-weight: 900; font-size: 12px; color: #a855f7; min-width: 42px; text-align: right; flex-shrink: 0; margin-left: 4px;">${app.limitMinutes}m</span>
          </div>
        </div>
        <button class="btn-ghost ripple" style="padding: 6px; border: 1px solid var(--red); color: var(--red); border-radius: 6px; flex-shrink: 0;" onclick="removeAppFromLimits('${app.packageName}')">
          <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
        </button>
      </div>
    `;
  });
  container.innerHTML = html;
  if (window.lucide) lucide.createIcons({ root: container });
}

function updateLimitLabel(slider, packageName) {
  const label = slider.nextElementSibling;
  if (label) {
    label.textContent = slider.value + 'm';
  }
}

async function saveLimitValue(packageName, minutes) {
  if (!window.tempAppLimits) {
    window.tempAppLimits = JSON.parse(JSON.stringify(window.currentAppLimits || { enabled: false, apps: [] }));
  }
  const app = window.tempAppLimits.apps.find(a => a.packageName === packageName);
  if (app) {
    app.limitMinutes = minutes;
  }
}

async function persistAppLimits(limits) {
  try {
    limits.userId = window.userId;
    await window.localDb.appLimits.put(limits);
    window.syncManager.addToQueue('PUT', 'appLimits', window.userId, {
      enabled: limits.enabled,
      apps: limits.apps
    });
    
    // Evaluate days distraction limits immediately to update day cards
    if (typeof evaluateDaysDistractions === 'function') {
      evaluateDaysDistractions();
    }
  } catch (err) {
    console.error('Failed to persist app limits:', err);
  }
}

async function openAddDistractingAppModal() {
  openModal('modal-add-distracting-app');
  const container = document.getElementById('installed-apps-list');
  const searchInput = document.getElementById('app-search-input');
  if (searchInput) searchInput.value = '';
  if (!container) return;

  container.innerHTML = `
    <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px; font-weight: 600;">
      <div class="spinner-ring" style="width: 24px; height: 24px; border-width: 3px; margin: 0 auto 12px; border-color: #a855f7 #0000 #0000 #0000;"></div>
      Querying installed apps...
    </div>
  `;

  try {
    if (!window.Capacitor || !window.Capacitor.Plugins.UsageStatsPlugin) {
      throw new Error('Capacitor UsageStatsPlugin is not available');
    }
    
    const res = await window.Capacitor.Plugins.UsageStatsPlugin.getInstalledApps();
    const apps = res.apps || [];
    apps.sort((a, b) => a.name.localeCompare(b.name));
    window.allInstalledApps = apps;
    
    renderInstalledAppsList(apps);
  } catch (err) {
    console.error('Failed to load installed apps:', err);
    container.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--red); font-size: 13px; font-weight: 600;">
        ⚠️ Failed to query installed apps: ${err.message || err}
      </div>
    `;
  }
}

function renderInstalledAppsList(apps) {
  const container = document.getElementById('installed-apps-list');
  if (!container) return;

  const limits = (document.getElementById('modal-profile')?.classList.contains('open') && window.tempAppLimits)
    ? window.tempAppLimits
    : (window.currentAppLimits || { enabled: false, apps: [] });
  const configured = limits.apps.map(a => a.packageName);
  const unconfigured = apps.filter(app => !configured.includes(app.package));

  if (unconfigured.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px; font-weight: 600;">
        No apps available to configure.
      </div>
    `;
    return;
  }

  let html = '';
  unconfigured.forEach(app => {
    const pkgSafe = app.package.replace(/'/g, "\\'");
    const nameSafe = app.name.replace(/'/g, "\\'");
    const iconSrc = app.icon || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    html += `
      <div class="installed-app-item" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px; background: var(--bg-card); border: var(--border-2); border-radius: 8px;">
        <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
          <img src="${iconSrc}" style="width: 28px; height: 28px; border-radius: 6px; object-fit: contain;" onerror="this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='" />
          <div style="min-width: 0;">
            <div style="font-weight: 700; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text);">${app.name}</div>
            <div style="font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${app.package}</div>
          </div>
        </div>
        <button class="btn-primary ripple" style="padding: 4px 10px; font-size: 11px; background: var(--teal); border-color: var(--black); box-shadow: 2px 2px 0 var(--black); color: var(--black); text-transform: uppercase; font-weight: 800;" onclick="addAppToLimits('${pkgSafe}', '${nameSafe}', '${app.icon || ''}')">
          Add
        </button>
      </div>
    `;
  });
  container.innerHTML = html;
}

function filterInstalledApps(query) {
  if (!window.allInstalledApps) return;
  const filtered = window.allInstalledApps.filter(app => 
    app.name.toLowerCase().includes(query.toLowerCase()) || 
    app.package.toLowerCase().includes(query.toLowerCase())
  );
  renderInstalledAppsList(filtered);
}

async function addAppToLimits(packageName, appName, iconBase64) {
  if (!window.tempAppLimits) {
    window.tempAppLimits = JSON.parse(JSON.stringify(window.currentAppLimits || { enabled: true, apps: [] }));
  }

  if (window.tempAppLimits.apps.length >= 10) {
    showToast('You can add a maximum of 10 distracting apps.', 'warn');
    return;
  }

  window.tempAppLimits.apps.push({
    packageName,
    appName,
    limitMinutes: 45,
    iconBase64: iconBase64 || ''
  });

  renderAppLimitsUI(window.tempAppLimits);
  
  // Keep the modal open and re-render the list immediately, preserving any active search query
  const searchInput = document.getElementById('app-search-input');
  const query = searchInput ? searchInput.value.trim() : '';
  if (query) {
    filterInstalledApps(query);
  } else if (window.allInstalledApps) {
    renderInstalledAppsList(window.allInstalledApps);
  }

  showToast(`${appName} added to limits!`, 'success');
}

async function removeAppFromLimits(packageName) {
  if (!window.tempAppLimits) {
    window.tempAppLimits = JSON.parse(JSON.stringify(window.currentAppLimits || { enabled: false, apps: [] }));
  }
  
  window.tempAppLimits.apps = window.tempAppLimits.apps.filter(app => app.packageName !== packageName);
  renderAppLimitsUI(window.tempAppLimits);
  showToast('App removed from limits.', 'info');
}

function openUsageStatsPermissionModal() {
  openModal('modal-usage-stats-permission');
}

async function confirmAndOpenUsageSettings() {
  closeModal('modal-usage-stats-permission');
  if (window.Capacitor && window.Capacitor.Plugins.UsageStatsPlugin) {
    try {
      await window.Capacitor.Plugins.UsageStatsPlugin.requestPermission();
    } catch (e) {
      console.error(e);
      showToast('Could not launch settings page.', 'error');
    }
  }
}

async function toggleDistractionTracking(checked) {
  if (!window.currentAppLimits) {
    window.currentAppLimits = { enabled: false, apps: [] };
  }

  if (checked) {
    const granted = await checkAndroidPermissionStatus();
    if (!granted) {
      document.getElementById('distraction-limit-toggle').checked = false;
      openUsageStatsPermissionModal();
      return;
    }

    window.currentAppLimits.enabled = true;
    await persistAppLimits(window.currentAppLimits);
    renderAppLimitsUI(window.currentAppLimits);
  } else {
    window.currentAppLimits.enabled = false;
    await persistAppLimits(window.currentAppLimits);
    renderAppLimitsUI(window.currentAppLimits);
  }
}

async function handleDistractionLimitToggle(checked) {
  if (!window.tempAppLimits) {
    window.tempAppLimits = JSON.parse(JSON.stringify(window.currentAppLimits || { enabled: false, apps: [] }));
  }

  if (checked) {
    const granted = await checkAndroidPermissionStatus();
    if (!granted) {
      const toggle = document.getElementById('distraction-limit-toggle');
      if (toggle) toggle.checked = false;
      openUsageStatsPermissionModal();
      return;
    }
    window.tempAppLimits.enabled = true;
  } else {
    window.tempAppLimits.enabled = false;
  }
  renderAppLimitsUI(window.tempAppLimits);
}

// Auto recheck permission when returning to focus in the settings modal
window.addEventListener('focus', () => {
  const profileModal = document.getElementById('modal-profile');
  if (profileModal && profileModal.classList.contains('open')) {
    // Add a 300ms delay to allow the Android OS to settle and register the granted permission before we query it
    setTimeout(async () => {
      const granted = await checkAndroidPermissionStatus();
      if (granted) {
        if (!window.tempAppLimits) {
          window.tempAppLimits = JSON.parse(JSON.stringify(window.currentAppLimits || { enabled: false, apps: [] }));
        }
        if (!window.tempAppLimits.enabled) {
          window.tempAppLimits.enabled = true;
        }
      }
      renderAppLimitsUI(window.tempAppLimits);
    }, 300);
  }
});


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

function toggleGlobalStreakTimeFields(enabled) {
  const fields = document.getElementById('global-streak-reminder-fields');
  if (fields) {
    fields.style.display = enabled ? 'flex' : 'none';
  }
}

window.toggleGlobalStreakTimeFields = toggleGlobalStreakTimeFields;

// Distraction limits bindings
window.loadAppLimits = loadAppLimits;
window.renderAppLimitsUI = renderAppLimitsUI;
window.checkAndroidPermissionStatus = checkAndroidPermissionStatus;
window.renderAppLimitsList = renderAppLimitsList;
window.updateLimitLabel = updateLimitLabel;
window.saveLimitValue = saveLimitValue;
window.persistAppLimits = persistAppLimits;
window.openAddDistractingAppModal = openAddDistractingAppModal;
window.renderInstalledAppsList = renderInstalledAppsList;
window.filterInstalledApps = filterInstalledApps;
window.addAppToLimits = addAppToLimits;
window.removeAppFromLimits = removeAppFromLimits;
window.openUsageStatsPermissionModal = openUsageStatsPermissionModal;
window.confirmAndOpenUsageSettings = confirmAndOpenUsageSettings;
window.toggleDistractionTracking = toggleDistractionTracking;
window.handleDistractionLimitToggle = handleDistractionLimitToggle;

// Premium Subscriptions and Coupon Bindings
window.loadSubscriptionStatus = loadSubscriptionStatus;
window.purchasePremium = purchasePremium;
window.redeemPromoCoupon = redeemPromoCoupon;


function applyDynamicUiLimits() {
  const status = window.subscriptionStatus;
  if (!status || !status.limitsComparison) return;

  const comp = status.limitsComparison;

  // 1. Update Template Save Modal Hint
  const saveHint = document.getElementById('template-save-hint');
  if (saveHint) {
    saveHint.innerHTML = `Free users can save up to <strong>${comp.template.base}</strong> templates.<br>Premium Builders can save up to <strong>${comp.template.premium}</strong> templates.`;
  }

  // 2. Update Template Manage Warning Box
  const warningBox = document.getElementById('template-premium-warning-box');
  const warningText = document.getElementById('template-warning-text');
  if (warningBox && warningText) {
    if (status.isPremium) {
      const excess = comp.template.premium - comp.template.base;
      warningText.innerHTML = `When your premium subscription expires, your oldest <strong>${excess}</strong> templates will be automatically removed (only the latest <strong>${comp.template.base}</strong> templates are retained on the free tier).`;
      warningBox.style.display = 'block';
    } else {
      warningBox.style.display = 'none';
    }
  }

  // 3. Update LeetCode changes limits
  if (status.limits && status.limits.leetcodeLimit !== undefined) {
    window.MAX_USERNAME_CHANGES = status.limits.leetcodeLimit;
    // Re-render LeetCode UI
    if (typeof window.loadLeetCodeProfileStatus === 'function') {
      window.loadLeetCodeProfileStatus();
    }
  }
}
window.applyDynamicUiLimits = applyDynamicUiLimits;

async function loadSubscriptionStatus() {
  try {
    const res = await apiFetch(`${window.API}/api/subscriptions/status`);
    window.subscriptionStatus = res;
    updateSubscriptionUI(res);
    applyDynamicUiLimits();
  } catch (err) {
    console.error('Failed to load subscription status:', err);
  }
}

function updateSubscriptionUI(data) {
  if (!data) return;

  const isPremium = data.isPremium;
  const tierDisplay = document.getElementById('sub-tier-display');
  const expiryDisplay = document.getElementById('sub-expiry-display');
  const badgeDisplay = document.getElementById('sub-badge-display');
  const purchaseArea = document.getElementById('subscription-purchase-area');

  // Limits elements
  const limitAiCurrent = document.getElementById('limit-ai-current');
  const limitAiBoost = document.getElementById('limit-ai-boost');
  const limitPhotoCurrent = document.getElementById('limit-photo-current');
  const limitPhotoBoost = document.getElementById('limit-photo-boost');
  const limitChatCurrent = document.getElementById('limit-chat-current');
  const limitChatBoost = document.getElementById('limit-chat-boost');
  const limitTemplateCurrent = document.getElementById('limit-template-current');
  const limitTemplateBoost = document.getElementById('limit-template-boost');
  const limitLeetcodeCurrent = document.getElementById('limit-leetcode-current');
  const limitLeetcodeBoost = document.getElementById('limit-leetcode-boost');

  if (isPremium) {
    if (tierDisplay) tierDisplay.textContent = 'Premium Builder';
    if (expiryDisplay) {
      if (data.expiresAt) {
        const dateStr = new Date(data.expiresAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        expiryDisplay.textContent = `Expires on: ${dateStr}`;
        expiryDisplay.style.display = 'block';
      } else {
        expiryDisplay.textContent = 'Lifetime Access';
        expiryDisplay.style.display = 'block';
      }
    }
    if (badgeDisplay) {
      badgeDisplay.innerHTML = `
        <span style="display: inline-block; padding: 6px 12px; background: linear-gradient(45deg, #fbbf24, #f59e0b); color: #fff; border: 2px solid var(--black); border-radius: 6px; font-size: 12px; font-weight: 900; text-transform: uppercase; box-shadow: 2px 2px 0 var(--black); animation: pulse 2s infinite;">Premium</span>
      `;
    }
    if (purchaseArea) purchaseArea.style.display = 'none';

    // Show boosts
    if (limitAiBoost) limitAiBoost.style.display = 'inline';
    if (limitPhotoBoost) limitPhotoBoost.style.display = 'inline';
    if (limitChatBoost) limitChatBoost.style.display = 'inline';
    if (limitTemplateBoost) limitTemplateBoost.style.display = 'inline';
    if (limitLeetcodeBoost) limitLeetcodeBoost.style.display = 'inline';
  } else {
    if (tierDisplay) tierDisplay.textContent = 'Free Tier';
    if (expiryDisplay) {
      expiryDisplay.style.display = 'none';
      expiryDisplay.textContent = '';
    }
    if (badgeDisplay) {
      badgeDisplay.innerHTML = `
        <span style="display: inline-block; padding: 6px 12px; background: #94a3b8; color: #1e293b; border: 2px solid var(--black); border-radius: 6px; font-size: 12px; font-weight: 900; text-transform: uppercase; box-shadow: 2px 2px 0 var(--black);">Free</span>
      `;
    }
    if (purchaseArea) purchaseArea.style.display = 'flex';

    // Hide boosts
    if (limitAiBoost) limitAiBoost.style.display = 'none';
    if (limitPhotoBoost) limitPhotoBoost.style.display = 'none';
    if (limitChatBoost) limitChatBoost.style.display = 'none';
    if (limitTemplateBoost) limitTemplateBoost.style.display = 'none';
    if (limitLeetcodeBoost) limitLeetcodeBoost.style.display = 'none';
  }

  // Update dynamic numbers
  if (data.limits) {
    if (limitAiCurrent) limitAiCurrent.textContent = data.limits.aiLimit;
    if (limitPhotoCurrent) limitPhotoCurrent.textContent = data.limits.photoLimit;
    if (limitChatCurrent) limitChatCurrent.textContent = data.limits.chatImageLimit;
    if (limitTemplateCurrent) limitTemplateCurrent.textContent = data.limits.templateLimit;
    if (limitLeetcodeCurrent) limitLeetcodeCurrent.textContent = data.limits.leetcodeLimit;
  }
}

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

async function purchasePremium(duration) {
  try {
    showToast('Starting secure payment checkout...', 'info');
    const loaded = await loadRazorpayScript();
    if (!loaded) {
      showToast('Failed to load payment gateway. Please check your network connection.', 'error');
      return;
    }
    
    const orderData = await apiFetch(`${window.API}/api/subscriptions/razorpay/create-order`, {
      method: 'POST',
      body: JSON.stringify({ duration })
    });
    
    if (!orderData.success) {
      showToast('Failed to initialize transaction.', 'error');
      return;
    }
    
    const options = {
      key: orderData.keyId,
      amount: orderData.amount,
      currency: orderData.currency,
      name: 'Consistency Daily Premium',
      description: duration === '1_month' ? 'Monthly Pass - 30 Days' : 'Annual Pass - 365 Days',
      image: '/favicon.ico',
      order_id: orderData.orderId,
      handler: async function (response) {
        showToast('Payment successful! Verifying...', 'info');
        try {
          const verifyData = await apiFetch(`${window.API}/api/subscriptions/razorpay/verify-payment`, {
            method: 'POST',
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              duration
            })
          });
          
          if (verifyData.success) {
            showToast('Premium unlocked successfully!', 'success');
            await loadSubscriptionStatus();
          } else {
            showToast('Payment verification failed.', 'error');
          }
        } catch (err) {
          showToast(err.message || 'Error verifying payment.', 'error');
        }
      },
      prefill: {
        name: localStorage.getItem('window.userName') || localStorage.getItem('userName') || '',
        email: localStorage.getItem('userEmail') || ''
      },
      theme: {
        color: '#a855f7'
      }
    };
    
    const rzp = new Razorpay(options);
    rzp.on('payment.failed', function (response) {
      showToast('Payment failed: ' + response.error.description, 'error');
    });
    rzp.open();
    
  } catch (err) {
    console.error('purchasePremium error:', err);
    showToast(err.message || 'Payment setup failed.', 'error');
  }
}

async function redeemPromoCoupon() {
  const input = document.getElementById('promo-coupon-input');
  const code = input.value.trim();
  if (!code) {
    showToast('Please enter a coupon code.', 'warn');
    return;
  }
  
  try {
    const res = await apiFetch(`${window.API}/api/subscriptions/apply-coupon`, {
      method: 'POST',
      body: JSON.stringify({ code })
    });
    
    if (res.success) {
      showToast(res.message, 'success');
      input.value = '';
      await loadSubscriptionStatus();
    } else {
      showToast(res.message || 'Failed to redeem coupon.', 'error');
    }
  } catch (err) {
    showToast(err.message || 'Error redeeming coupon.', 'error');
  }
}

// ── My Usage Limits Modal ──────────────────────────────────
async function openMyLimitsModal() {
  openModal('modal-my-limits');
  // Initialise Lucide icons in the static modal header (gauge + X close button)
  const modal = document.getElementById('modal-my-limits');
  if (modal && window.lucide) lucide.createIcons({ root: modal });

  const body = document.getElementById('my-limits-body');
  if (!body) return;

  // Show spinner
  body.innerHTML = `
    <div style="text-align:center; padding: 40px; color: var(--text-muted); font-size: 13px; font-weight: 600;">
      <div class="spinner-ring" style="width:28px;height:28px;border-width:3px;margin:0 auto 12px;border-color:#a855f7 #0000 #0000 #0000;"></div>
      Loading your limits...
    </div>
  `;

  try {
    const data = await apiFetch(`${window.API}/api/subscriptions/my-limits`);
    if (!data || !data.limits) throw new Error('No data returned');
    renderMyLimits(body, data);
  } catch (err) {
    body.innerHTML = `
      <div style="text-align:center; padding:32px; color:var(--red); font-size:13px; font-weight:700;">
        <i data-lucide="alert-circle" style="width:32px;height:32px;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;"></i>
        Failed to load limits. Please try again.
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: body });
    console.error('openMyLimitsModal error:', err);
  }
}

function renderMyLimits(container, data) {
  const { isPremium, limits } = data;

  const tierBadge = isPremium
    ? `<span style="display:inline-block;padding:3px 10px;background:linear-gradient(45deg,#fbbf24,#f59e0b);color:#000;font-size:11px;font-weight:900;text-transform:uppercase;border:2px solid var(--black);border-radius:4px;box-shadow:2px 2px 0 var(--black);">Premium</span>`
    : `<span style="display:inline-block;padding:3px 10px;background:#94a3b8;color:#1e293b;font-size:11px;font-weight:900;text-transform:uppercase;border:2px solid var(--black);border-radius:4px;box-shadow:2px 2px 0 var(--black);">Free Tier</span>`;

  const items = [
    {
      key: 'aiInsights',
      label: 'AI Daily Insights',
      icon: 'sparkles',
      color: 'var(--purple)',
      bg: 'rgba(168,85,247,0.08)',
      border: '#a855f7',
    },
    {
      key: 'photoScan',
      label: 'Handwriting / Photo Scan',
      icon: 'camera',
      color: 'var(--teal)',
      bg: 'rgba(20,184,166,0.08)',
      border: '#14b8a6',
    },
    {
      key: 'voiceToTask',
      label: 'Voice to Task',
      icon: 'mic',
      color: 'var(--pink)',
      bg: 'rgba(236,72,153,0.08)',
      border: '#ec4899',
    },
    {
      key: 'graceDays',
      label: 'Monthly Grace Days',
      icon: 'shield',
      color: 'var(--blue)',
      bg: 'rgba(59,130,246,0.08)',
      border: '#3b82f6',
    },
    {
      key: 'leetcode',
      label: 'LeetCode Name Changes',
      icon: 'target',
      color: 'var(--orange)',
      bg: 'rgba(249,115,22,0.08)',
      border: '#f97316',
    },
    {
      key: 'chatMedia',
      label: 'Chat Media / Hour',
      icon: 'message-square',
      color: 'var(--green)',
      bg: 'rgba(34,197,94,0.08)',
      border: '#22c55e',
    },
    {
      key: 'weeklySummary',
      label: '7-Day Summary (Weekly)',
      icon: 'sparkles',
      color: 'var(--yellow)',
      bg: 'rgba(250,204,21,0.08)',
      border: '#facc15',
    },
    {
      key: 'monthlySummaryDaily',
      label: '30-Day Summary (Daily)',
      icon: 'crown',
      color: 'var(--pink)',
      bg: 'rgba(236,72,153,0.08)',
      border: '#ec4899',
    },
    {
      key: 'monthlySummary',
      label: '30-Day Summary (Monthly)',
      icon: 'crown',
      color: 'var(--pink)',
      bg: 'rgba(236,72,153,0.08)',
      border: '#ec4899',
    },
  ];

  function formatReset(item) {
    if (item.resetPeriod === 'permanent') return 'Lifetime limit (no reset)';
    if (!item.resetsAt) return '—';
    const d = new Date(item.resetsAt);
    const now = new Date();
    const diffMs = d - now;
    if (diffMs <= 0) return 'Resets now';
    const diffH = Math.floor(diffMs / 3600000);
    const diffM = Math.floor((diffMs % 3600000) / 60000);
    if (item.resetPeriod === 'hourly') return `Resets in ${diffM}m`;
    if (item.resetPeriod === 'daily') return diffH > 0 ? `Resets in ${diffH}h ${diffM}m` : `Resets in ${diffM}m`;
    if (item.resetPeriod === 'monthly') {
      const diffD = Math.ceil(diffMs / 86400000);
      return `Resets in ${diffD} day${diffD !== 1 ? 's' : ''}`;
    }
    return d.toLocaleDateString();
  }

  const cards = items.map(cfg => {
    const lim = limits[cfg.key];
    if (!lim) return '';
    const pct = lim.total > 0 ? Math.round(((lim.total - lim.left) / lim.total) * 100) : 0;
    const barColor = lim.left === 0 ? '#ef4444' : lim.left <= Math.ceil(lim.total * 0.25) ? '#f97316' : cfg.border;
    return `
      <div style="background:${cfg.bg};border:2px solid ${cfg.border};border-radius:10px;padding:14px 16px;box-shadow:2px 2px 0 var(--black);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:var(--text);text-transform:uppercase;">
            <i data-lucide="${cfg.icon}" style="width:15px;height:15px;color:${cfg.color};flex-shrink:0;"></i>
            ${cfg.label}
          </div>
          <div style="font-family:monospace;font-size:18px;font-weight:900;color:${lim.left === 0 ? '#ef4444' : 'var(--text)'};">
            ${lim.left}<span style="font-size:12px;font-weight:600;color:var(--text-muted);">/${lim.total}</span>
          </div>
        </div>
        <div style="background:var(--bg-muted);border-radius:4px;height:6px;overflow:hidden;border:1px solid var(--black);margin-bottom:6px;">
          <div style="height:100%;width:${pct}%;background:${barColor};border-radius:4px;transition:width 0.4s ease;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:var(--text-muted);">
          <span>${lim.used} used</span>
          <span>⏱ ${formatReset(lim)}</span>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <span style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Your Tier</span>
      ${tierBadge}
    </div>
    <p style="font-size:12px;color:var(--text-muted);font-weight:600;margin:0 0 8px;">Limits reset automatically. Upgrade to Premium for higher quotas.</p>
    <hr style="border:none;border-top:2px solid var(--black);margin-bottom:4px;">
    ${cards}
    <a href="subscription.html" style="display:block;margin-top:4px;text-align:center;font-size:12px;font-weight:800;color:var(--purple);text-decoration:underline;text-transform:uppercase;letter-spacing:0.5px;">
      🚀 View Plans & Upgrade
    </a>
  `;

  if (window.lucide) lucide.createIcons({ root: container });
}

window.openMyLimitsModal = openMyLimitsModal;

// Accordion Toggle handler for Profile & Settings
async function toggleProfileCollapse(id, headerBtn) {
  const content = document.getElementById(id);
  if (!content) return;

  const isHidden = content.style.display === 'none' || !content.style.display;

  // Toggle display
  content.style.display = isHidden ? 'block' : 'none';

  // Toggle visual active state on the button to make it look active (yellow background, bold)
  if (isHidden) {
    headerBtn.classList.add('active');
    headerBtn.style.background = 'var(--yellow)';
    headerBtn.style.color = 'var(--black)';
    
    const icon = headerBtn.querySelector('.collapse-icon');
    if (icon) icon.textContent = '▼';
    
    // Load inline limits if limits accordion is opened
    if (id === 'profile-collapse-limits') {
      await loadProfileLimitsInline();
    }
  } else {
    headerBtn.classList.remove('active');
    headerBtn.style.background = 'var(--bg-muted)';
    headerBtn.style.color = 'var(--text)';
    
    const icon = headerBtn.querySelector('.collapse-icon');
    if (icon) icon.textContent = '▶';
  }

  // Refresh Lucide icons inside content container if present
  if (isHidden && window.lucide) {
    lucide.createIcons({ root: content });
  }
}

async function loadProfileLimitsInline() {
  const container = document.getElementById('profile-limits-inline-container');
  if (!container) return;

  // Render a sleek brutalist inline loading indicator
  container.innerHTML = `
    <div style="text-align:center; padding: 24px; color: var(--text-muted); font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">
      <div class="spinner-ring" style="width:24px;height:24px;border-width:3px;margin:0 auto 12px;border-color:#a855f7 #0000 #0000 #0000;"></div>
      Loading Live limits...
    </div>
  `;

  try {
    const data = await apiFetch(`${window.API}/api/subscriptions/my-limits`);
    if (!data || !data.limits) throw new Error('No limits data');
    renderMyLimits(container, data);
  } catch (err) {
    container.innerHTML = `
      <div style="text-align:center; padding:16px; color:var(--red); font-size:12px; font-weight:800; border: 2px dashed var(--red); border-radius: 8px; background: rgba(239, 68, 68, 0.05);">
        <i data-lucide="alert-circle" style="width:20px;height:20px;margin-bottom:6px;display:block;margin-left:auto;margin-right:auto;color:var(--red);"></i>
        Failed to load limits. Please check your connection.
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: container });
    console.error('loadProfileLimitsInline error:', err);
  }
}

// ── Report Issue Modal Handlers ────────────────────────────
function openReportIssueModal() {
  const modal = document.getElementById('modal-report-issue');
  if (!modal) return;

  // Reset form fields
  const form = document.getElementById('report-issue-form');
  if (form) form.reset();

  const successMsg = document.getElementById('report-issue-success-msg');
  if (successMsg) successMsg.style.display = 'none';

  const descField = document.getElementById('report-issue-desc');
  if (descField) descField.value = '';

  updateReportCharCount();

  openModal('modal-report-issue');

  if (window.lucide) {
    lucide.createIcons({ root: modal });
  }
}

function updateReportCharCount() {
  const descField = document.getElementById('report-issue-desc');
  const countLabel = document.getElementById('report-issue-char-count');
  const hintLabel = document.getElementById('report-issue-length-hint');
  const submitBtn = document.getElementById('btn-submit-report');

  if (!descField || !countLabel || !hintLabel || !submitBtn) return;

  const len = descField.value.trim().length;
  countLabel.textContent = `${len} / 20 characters minimum`;

  if (len >= 20) {
    countLabel.style.color = 'var(--green)';
    hintLabel.textContent = 'Looking good!';
    hintLabel.style.color = 'var(--green)';
    submitBtn.disabled = false;
  } else {
    countLabel.style.color = 'var(--coral)';
    hintLabel.textContent = 'Too short';
    hintLabel.style.color = 'var(--text-muted)';
    submitBtn.disabled = true;
  }
}

async function submitUserIssueReport(event) {
  if (event) event.preventDefault();

  const category = document.getElementById('report-issue-category').value;
  const description = document.getElementById('report-issue-desc').value;
  const submitBtn = document.getElementById('btn-submit-report');

  if (description.trim().length < 20) {
    showToast('Description must be at least 20 characters long.', 'error');
    return;
  }

  const originalHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `
    <div class="spinner-ring" style="width:20px;height:20px;border-width:2px;margin:0 auto;border-color:var(--black) #0000 #0000 #0000;"></div>
  `;

  try {
    const res = await apiFetch(`${window.API}/api/reports`, {
      method: 'POST',
      body: JSON.stringify({ category, description })
    });

    showToast('Report submitted successfully! Thank you.', 'success');

    const successMsg = document.getElementById('report-issue-success-msg');
    if (successMsg) successMsg.style.display = 'block';

    const descField = document.getElementById('report-issue-desc');
    if (descField) descField.value = '';

    updateReportCharCount();

    setTimeout(() => {
      closeModal('modal-report-issue');
    }, 2000);

  } catch (err) {
    console.error('submitUserIssueReport error:', err);
    showToast(err.message || 'Error submitting report.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalHtml;
  }
}

// Feature Changelog
let latestChangelogDate = null;
let allChangelogsList = [];

async function checkChangelogNotifications(user) {
  try {
    const res = await fetch(`${window.API}/api/auth/changelog`);
    if (!res.ok) return;
    const changelogs = await res.json();
    allChangelogsList = changelogs;
    
    const outerDot = document.getElementById('profile-red-dot');
    const innerDot = document.getElementById('changelog-btn-red-dot');
    
    if (changelogs.length === 0) {
      if (outerDot) outerDot.style.display = 'none';
      if (innerDot) innerDot.style.display = 'none';
      return;
    }
    
    const latest = changelogs[0];
    latestChangelogDate = latest.createdAt;
    
    const lastViewed = user.lastViewedChangelogAt ? new Date(user.lastViewedChangelogAt) : new Date(0);
    const latestTime = new Date(latest.createdAt);
    
    if (latestTime > lastViewed) {
      if (innerDot) innerDot.style.display = 'block';
      
      const dismissed = localStorage.getItem('dismissedOuterChangelogDot');
      if (dismissed === latest.createdAt) {
        if (outerDot) outerDot.style.display = 'none';
      } else {
        if (outerDot) outerDot.style.display = 'block';
      }
    } else {
      if (outerDot) outerDot.style.display = 'none';
      if (innerDot) innerDot.style.display = 'none';
    }
  } catch (err) {
    console.error('Error checking changelog notifications:', err);
  }
}

async function openChangelogModal() {
  const outerDot = document.getElementById('profile-red-dot');
  const innerDot = document.getElementById('changelog-btn-red-dot');
  if (outerDot) outerDot.style.display = 'none';
  if (innerDot) innerDot.style.display = 'none';
  
  if (latestChangelogDate) {
    localStorage.setItem('dismissedOuterChangelogDot', latestChangelogDate);
  }
  
  openModal('modal-changelog');
  renderChangelogList(allChangelogsList);
  
  try {
    const res = await apiFetch(`${window.API}/api/auth/changelog/view`, {
      method: 'POST'
    });
    if (res.lastViewedChangelogAt && window.localDb) {
      const cached = await window.localDb.userProfile.get(window.userId) || {};
      cached.lastViewedChangelogAt = res.lastViewedChangelogAt;
      await window.localDb.userProfile.put(cached);
    }
  } catch (err) {
    console.error('Error marking changelog as viewed:', err);
  }
}

function renderChangelogList(changelogs) {
  const container = document.getElementById('changelog-modal-body');
  if (!container) return;
  container.innerHTML = '';
  
  if (changelogs.length === 0) {
    container.innerHTML = '<p style="text-align:center; padding:20px; font-weight:800; color:#666;">No updates available yet.</p>';
    return;
  }
  
  changelogs.forEach(item => {
    const itemEl = document.createElement('div');
    itemEl.className = `changelog-item ${item.type}`;
    
    const dateStr = new Date(item.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    const badgeText = item.type === 'major' ? 'MAJOR UPDATE' : 'UPDATE';
    const badgeClass = `changelog-badge ${item.type}`;
    
    itemEl.innerHTML = `
      <div class="changelog-meta">
        <span class="${badgeClass}">${badgeText}</span>
        <span class="changelog-date">${dateStr}</span>
      </div>
      <div class="changelog-message">${window.escapeHTML(item.message)}</div>
    `;
    container.appendChild(itemEl);
  });
}

window.openReportIssueModal = openReportIssueModal;
window.updateReportCharCount = updateReportCharCount;
window.submitUserIssueReport = submitUserIssueReport;

window.toggleProfileCollapse = toggleProfileCollapse;
window.loadProfileLimitsInline = loadProfileLimitsInline;

window.checkChangelogNotifications = checkChangelogNotifications;
window.openChangelogModal = openChangelogModal;

function renderProfileActions(u, status) {
  const container = document.getElementById('qp-actions-container');
  if (!container) return;

  let btnHtml = '';
  if (status === 'none') {
    btnHtml = `
      <button class="btn ripple" onclick="window.DM.sendFriendRequest('${u._id}', '${window.escJs(u.username)}')" style="background:var(--purple); color:#fff; border:3px solid var(--black); box-shadow:4px 4px 0 var(--black); padding:10px 20px; border-radius:8px; font-weight:800; font-family:'Space Grotesk',sans-serif; text-transform:uppercase; font-size:12px; display:flex; align-items:center; gap:8px;">
        <i data-lucide="user-plus" style="width:16px; height:16px;"></i> Add Friend
      </button>
    `;
  } else if (status === 'requested_sent') {
    btnHtml = `
      <button class="btn ripple" onclick="window.DM.cancelFriendRequest('${u._id}', '${window.escJs(u.username)}')" style="background:var(--bg-muted); color:var(--text); border:3px solid var(--black); box-shadow:4px 4px 0 var(--black); padding:10px 20px; border-radius:8px; font-weight:800; font-family:'Space Grotesk',sans-serif; text-transform:uppercase; font-size:12px; display:flex; align-items:center; gap:8px;">
        <i data-lucide="x" style="width:16px; height:16px;"></i> Cancel Request
      </button>
    `;
  } else if (status === 'requested_received') {
    btnHtml = `
      <button class="btn ripple" onclick="window.DM.acceptFriendRequest('${u._id}', '${window.escJs(u.username)}')" style="background:var(--green); color:#000; border:3px solid var(--black); box-shadow:4px 4px 0 var(--black); padding:10px 20px; border-radius:8px; font-weight:800; font-family:'Space Grotesk',sans-serif; text-transform:uppercase; font-size:12px; display:flex; align-items:center; gap:8px; margin-right:8px;">
        <i data-lucide="user-check" style="width:16px; height:16px;"></i> Accept
      </button>
      <button class="btn ripple" onclick="window.DM.declineFriendRequest('${u._id}', '${window.escJs(u.username)}')" style="background:var(--red); color:#fff; border:3px solid var(--black); box-shadow:4px 4px 0 var(--black); padding:10px 20px; border-radius:8px; font-weight:800; font-family:'Space Grotesk',sans-serif; text-transform:uppercase; font-size:12px; display:flex; align-items:center; gap:8px;">
        <i data-lucide="user-x" style="width:16px; height:16px;"></i> Decline
      </button>
    `;
  } else if (status === 'friends') {
    btnHtml = `
      <button class="btn ripple" onclick="window.DM.openDMChat('${u._id}', '${window.escJs(u.name)}', '${u.profilePicture || ''}')" style="background:var(--yellow); color:#000; border:3px solid var(--black); box-shadow:4px 4px 0 var(--black); padding:10px 20px; border-radius:8px; font-weight:800; font-family:'Space Grotesk',sans-serif; text-transform:uppercase; font-size:12px; display:flex; align-items:center; gap:8px; margin-right:8px;">
        <i data-lucide="message-square" style="width:16px; height:16px;"></i> Message
      </button>
      <button class="btn ripple" onclick="window.DM.removeFriend('${u._id}', '${window.escJs(u.username)}')" style="background:var(--red); color:#fff; border:3px solid var(--black); box-shadow:4px 4px 0 var(--black); padding:10px 20px; border-radius:8px; font-weight:800; font-family:'Space Grotesk',sans-serif; text-transform:uppercase; font-size:12px; display:flex; align-items:center; gap:8px;">
        <i data-lucide="user-minus" style="width:16px; height:16px;"></i> Unfollow
      </button>
    `;
  }

  container.innerHTML = btnHtml;
  if (window.lucide) lucide.createIcons({ root: container });
}

window.renderProfileActions = renderProfileActions;

// ── Email Verification UI & Actions ───────────────────────────
function updateEmailVerificationUI(user) {
  const warningDot = document.getElementById('email-verify-warning-dot');
  const section = document.getElementById('email-verification-section');

  if (!user) return;

  const isVerified = user.isEmailVerified === true;
  localStorage.setItem('isEmailVerified', isVerified.toString());
  if (user.createdAt) localStorage.setItem('userCreatedAt', user.createdAt);
  
  if (typeof user.emailVerificationGraceDays === 'number') {
    localStorage.setItem('emailVerificationGraceDays', user.emailVerificationGraceDays.toString());
  }
  if (user.emailVerificationFeatureDeploymentDate) {
    localStorage.setItem('emailVerificationFeatureDeploymentDate', user.emailVerificationFeatureDeploymentDate);
  }

  // Toggle warning dot on nav chip
  if (warningDot) {
    warningDot.style.display = isVerified ? 'none' : 'block';
  }

  if (!section) return;

  if (isVerified) {
    section.innerHTML = `
      <div style="background: #f0fdf4; border: 2.5px solid var(--black); padding: 8px 12px; border-radius: 8px; font-weight: 800; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; color: #16a34a; box-shadow: 2px 2px 0 var(--black); text-transform: uppercase;">
        <i data-lucide="check-circle" style="width: 15px; height: 15px;"></i> Email Verified
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: section });
    return;
  }

  // Calculate Grace Period
  const graceDays = typeof user.emailVerificationGraceDays === 'number' ? user.emailVerificationGraceDays : 2;
  const deploymentDateStr = user.emailVerificationFeatureDeploymentDate || '2026-06-11';
  const deploymentDate = new Date(deploymentDateStr);
  const userCreatedAt = user.createdAt ? new Date(user.createdAt) : new Date();
  const graceStartTime = userCreatedAt > deploymentDate ? userCreatedAt : deploymentDate;
  const expiryTime = new Date(graceStartTime.getTime() + graceDays * 24 * 60 * 60 * 1000);
  const timeDiff = expiryTime.getTime() - Date.now();

  let statusHtml = '';
  if (timeDiff <= 0) {
    statusHtml = `
      <div style="background: #fdf2f2; border: 2.5px solid var(--black); padding: 10px 14px; border-radius: 8px; font-weight: 800; font-size: 12px; color: var(--red); box-shadow: 2px 2px 0 var(--black); margin-bottom: 12px; line-height: 1.4;">
        <i data-lucide="alert-triangle" style="width: 15px; height: 15px; vertical-align: middle; margin-right: 4px;"></i> 
        GRACE PERIOD EXPIRED. Please verify your email to unlock all features (creating cards, goals, and chatting). (Check your spam folder if you do not see the email.)<br><span style="font-weight: 700; font-size: 11px; margin-top: 4px; display: block; color: var(--text);">If you are having problems, you can file a report from the profile page below and your issue will be resolved within 1-2 days.</span>
      </div>
    `;
  } else {
    // Format remaining time
    const totalHours = Math.floor(timeDiff / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const remainingText = days > 0 ? `${days}d ${hours}h` : `${hours}h`;

    statusHtml = `
      <div style="background: #fffbeb; border: 2.5px solid var(--black); padding: 10px 14px; border-radius: 8px; font-weight: 800; font-size: 12px; color: #d97706; box-shadow: 2px 2px 0 var(--black); margin-bottom: 12px; line-height: 1.4;">
        <i data-lucide="clock" style="width: 15px; height: 15px; vertical-align: middle; margin-right: 4px;"></i> 
        UNVERIFIED: You have ${remainingText} remaining to verify your email before access is restricted. (Check your spam folder if you do not see the email.)<br><span style="font-weight: 700; font-size: 11px; margin-top: 4px; display: block; color: var(--text);">If you are having problems, you can file a report from the profile page below and your issue will be resolved within 1-2 days.</span>
      </div>
    `;
  }

  // Render OTP controls
  const isOtpActive = localStorage.getItem('emailOtpRequested') === 'true';

  let otpControlsHtml = '';
  if (isOtpActive) {
    otpControlsHtml = `
      <div style="border: 2px dashed var(--black); padding: 12px; border-radius: 8px; background: var(--bg-card); margin-top: 10px;">
        <label style="font-weight: 800; font-size: 11px; text-transform: uppercase; display: block; margin-bottom: 6px;">Enter 6-Digit Code</label>
        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
          <input type="text" id="email-verification-otp-input" class="form-control" placeholder="123456" maxlength="6" style="height: 38px; font-weight: 900; letter-spacing: 2px; text-align: center; font-size: 16px; border: 2px solid var(--black); box-shadow: 2px 2px 0 var(--black); width: 120px;" />
          <button class="btn-primary ripple" id="btn-email-verify-confirm" onclick="confirmEmailVerification()" style="height: 38px; padding: 0 16px; background: var(--lime); color: var(--black); border-color: var(--black); box-shadow: 2px 2px 0 var(--black); font-size: 12px; font-weight: 800; text-transform: uppercase;">Verify</button>
        </div>
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <button class="btn-ghost ripple" id="btn-email-verify-resend" onclick="sendEmailVerificationOtp()" style="height: 32px; padding: 0 12px; font-size: 11px; font-weight: 700; border-width: 2px; box-shadow: 2px 2px 0 var(--black); text-transform: uppercase;">Resend OTP</button>
          <span id="email-verify-resend-countdown" style="font-size: 11px; font-weight: 800; color: var(--text-muted);"></span>
        </div>
      </div>
    `;
  } else {
    otpControlsHtml = `
      <button class="btn-primary ripple" onclick="sendEmailVerificationOtp()" style="padding: 8px 16px; background: var(--yellow); color: var(--black); border-color: var(--black); box-shadow: 3px 3px 0 var(--black); font-size: 12px; font-weight: 800; text-transform: uppercase; width: 100%; justify-content: center; display: inline-flex; align-items: center; gap: 6px;">
        <i data-lucide="mail"></i> Verify Email Address
      </button>
    `;
  }

  section.innerHTML = statusHtml + otpControlsHtml;
  if (window.lucide) lucide.createIcons({ root: section });

  if (isOtpActive) {
    updateOtpResendTimer();
  }
}

async function sendEmailVerificationOtp() {
  const btn = document.getElementById('btn-email-verify-resend') || document.querySelector('[onclick="sendEmailVerificationOtp()"]');
  let originalHtml = '';
  if (btn) {
    btn.disabled = true;
    originalHtml = btn.innerHTML;
    const isResend = btn.id === 'btn-email-verify-resend';
    btn.innerHTML = `<span class="spinner-ring" style="width: 12px; height: 12px; border-width: 2px; border-color: var(--black) transparent transparent transparent; display: inline-block; vertical-align: middle; margin-right: 6px;"></span> ${isResend ? 'Resending...' : 'Sending OTP...'}`;
  }

  try {
    const res = await apiFetch(`${window.API}/api/auth/send-verification-otp`, { method: 'POST' });
    if (res && res.success === false) {
      throw new Error(res.message || 'Failed to send verification code.');
    }
    showToast(res.message || 'Verification code sent!', 'success');
    
    localStorage.setItem('emailOtpRequested', 'true');
    localStorage.setItem('emailOtpSentAt', Date.now().toString());
    
    const cached = await window.localDb.userProfile.get(window.userId);
    if (cached) updateEmailVerificationUI(cached);
  } catch (err) {
    console.error('Send OTP error:', err);
    if (err.status === 429 && err.data && err.data.retryAfter) {
      localStorage.setItem('emailOtpRequested', 'true');
      const timeRemaining = err.data.retryAfter * 1000;
      localStorage.setItem('emailOtpSentAt', (Date.now() - (60000 - timeRemaining)).toString());
      
      const cached = await window.localDb.userProfile.get(window.userId);
      if (cached) updateEmailVerificationUI(cached);
    } else {
      showToast(err.message || 'Failed to send verification code.', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    }
  }
}

async function confirmEmailVerification() {
  const input = document.getElementById('email-verification-otp-input');
  const btn = document.getElementById('btn-email-verify-confirm');
  if (!input || !input.value.trim()) {
    showToast('Please enter the 6-digit verification code.', 'warn');
    return;
  }
  
  let originalHtml = '';
  if (btn) {
    btn.disabled = true;
    originalHtml = btn.innerHTML;
    btn.innerHTML = `<span class="spinner-ring" style="width: 12px; height: 12px; border-width: 2px; border-color: var(--black) transparent transparent transparent; display: inline-block; vertical-align: middle; margin-right: 6px;"></span> Verifying...`;
  }

  try {
    const otp = input.value.trim();
    const res = await apiFetch(`${window.API}/api/auth/verify-email`, {
      method: 'POST',
      body: JSON.stringify({ otp })
    });
    
    if (res && res.success === false) {
      throw new Error(res.message || 'Verification failed. Please check the code.');
    }
    
    showToast(res.message || 'Email verified successfully!', 'success');
    
    localStorage.removeItem('emailOtpRequested');
    localStorage.removeItem('emailOtpSentAt');
    localStorage.setItem('isEmailVerified', 'true');
    
    if (window.otpCountdownInterval) {
      clearInterval(window.otpCountdownInterval);
      window.otpCountdownInterval = null;
    }

    if (navigator.onLine) {
      const freshUser = await apiFetch(`${window.API}/api/auth/settings`);
      freshUser.userId = window.userId;
      await window.localDb.userProfile.put(freshUser);
      renderProfileData(freshUser);
      if (typeof loadLeaderboard === 'function') loadLeaderboard(true);
    }
  } catch (err) {
    showToast(err.message || 'Verification failed. Please check the code.', 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

function updateOtpResendTimer() {
  const resendBtn = document.getElementById('btn-email-verify-resend');
  const countdownText = document.getElementById('email-verify-resend-countdown');
  if (!resendBtn) return;

  const sentAt = parseInt(localStorage.getItem('emailOtpSentAt') || '0', 10);
  const now = Date.now();
  const timePassed = now - sentAt;
  const timeRemaining = Math.max(0, Math.ceil((60 * 1000 - timePassed) / 1000));

  if (timeRemaining > 0) {
    resendBtn.disabled = true;
    resendBtn.style.opacity = '0.5';
    resendBtn.style.cursor = 'not-allowed';
    if (countdownText) countdownText.textContent = `Resend available in ${timeRemaining}s`;
    
    if (window.otpCountdownInterval) clearInterval(window.otpCountdownInterval);
    window.otpCountdownInterval = setInterval(() => {
      const currentSentAt = parseInt(localStorage.getItem('emailOtpSentAt') || '0', 10);
      const currentNow = Date.now();
      const currentPassed = currentNow - currentSentAt;
      const currentRemaining = Math.max(0, Math.ceil((60 * 1000 - currentPassed) / 1000));
      
      if (currentRemaining > 0) {
        if (countdownText) countdownText.textContent = `Resend available in ${currentRemaining}s`;
      } else {
        clearInterval(window.otpCountdownInterval);
        window.otpCountdownInterval = null;
        resendBtn.disabled = false;
        resendBtn.style.opacity = '1';
        resendBtn.style.cursor = 'pointer';
        if (countdownText) countdownText.textContent = '';
      }
    }, 1000);
  } else {
    resendBtn.disabled = false;
    resendBtn.style.opacity = '1';
    resendBtn.style.cursor = 'pointer';
    if (countdownText) countdownText.textContent = '';
  }
}

window.sendEmailVerificationOtp = sendEmailVerificationOtp;
window.confirmEmailVerification = confirmEmailVerification;
window.updateEmailVerificationUI = updateEmailVerificationUI;

console.log("[Module] profile.js loaded and Profile bound to window");
