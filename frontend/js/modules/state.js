console.log("[Module] state.js initializing...");

// Detect if running inside Capacitor Android native wrapper
const isAndroidNative = navigator.userAgent.includes("CapacitorNative/Android");
if (isAndroidNative) {
  document.body.classList.add('native-android');
}
window.isAndroidNative = isAndroidNative;

// Extract Android version if present: e.g. "CapacitorNative/Android/1.0"
let runningAppVersion = "2.6";
if (isAndroidNative) {
  const parts = navigator.userAgent.split("CapacitorNative/Android/");
  if (parts.length > 1) {
    runningAppVersion = parts[1].split(" ")[0].trim();
  }
}
window.runningAppVersion = runningAppVersion;

const API = isAndroidNative ? 'https://consistency-daily.vercel.app' : '';
window.API = API;

/**
 * Compares two semver strings (e.g. "1.7", "1.8", "2.0.1").
 * Returns -1, 0, or 1 (like strcmp).
 */
function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/**
 * Show a non-dismissible update dialog (blocks the user from using the old version).
 */
function showForceUpdateDialog(data) {
  // Remove any previous instance
  const prev = document.getElementById('__force-update-overlay');
  if (prev) prev.remove();

  const overlay = document.createElement('div');
  overlay.id = '__force-update-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(0,0,0,0.85); backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: 24px; box-sizing: border-box;
  `;

  overlay.innerHTML = `
    <div style="
      background: var(--bg-card, #1a1a2e); border: 3px solid var(--black, #111);
      border-radius: 16px; padding: 28px 24px; max-width: 340px; width: 100%;
      box-shadow: 6px 6px 0 var(--black, #111); text-align: center;
    ">
      <div style="font-size: 40px; margin-bottom: 12px;">🚀</div>
      <h2 style="
        font-family: 'Space Grotesk', sans-serif; font-weight: 900;
        font-size: 18px; text-transform: uppercase; letter-spacing: 0.5px;
        color: var(--text, #fff); margin: 0 0 8px;
      ">Update Required</h2>
      <p style="font-size: 12px; font-weight: 600; color: var(--text-muted, #aaa); margin: 0 0 14px; line-height: 1.5;">
        Version <strong style="color: var(--yellow, #FFD60A);">v${data.latestVersion}</strong> is available.<br>
        You are on <strong>v${runningAppVersion}</strong>.
      </p>
      <p style="font-size: 11.5px; color: var(--text-muted, #aaa); margin: 0 0 20px; line-height: 1.5; text-align: left; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 10px 12px;">
        ${data.releaseNotes || 'Bug fixes and improvements.'}
      </p>
      <a id="__update-download-btn" href="#" style="
        display: block; width: 100%; box-sizing: border-box;
        background: var(--yellow, #FFD60A); color: #111; border: 2px solid #111;
        border-radius: 10px; padding: 12px 16px; font-family: 'Space Grotesk', sans-serif;
        font-weight: 900; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;
        text-decoration: none; box-shadow: 3px 3px 0 #111; cursor: pointer;
        transition: transform 0.15s, box-shadow 0.15s;
      ">
        ⬇ Download Update
      </a>
    </div>
  `;

  // Redirect to download via external system browser
  const downloadBtn = overlay.querySelector('#__update-download-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isNativeApp = (window.Capacitor && window.Capacitor.isNativePlatform()) || 
                          navigator.userAgent.includes("Capacitor");
      if (isNativeApp) {
        if (window.Capacitor?.Plugins?.Browser) {
          window.Capacitor.Plugins.Browser.open({ url: data.apkUrl });
        } else {
          window.open(data.apkUrl, '_system');
        }
      } else {
        const link = document.createElement('a');
        link.href = data.apkUrl;
        link.download = 'Consistency.Daily.apk';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    });
  }

  // Prevent any touch/click on the backdrop from dismissing it
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) e.stopPropagation();
  });

  document.body.appendChild(overlay);
}

/**
 * Show a dismissible soft update dialog (does not block the user).
 */
function showSoftUpdateDialog(data) {
  // Remove any previous instance
  const prev = document.getElementById('__soft-update-overlay');
  if (prev) prev.remove();

  const overlay = document.createElement('div');
  overlay.id = '__soft-update-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(0,0,0,0.75); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    padding: 24px; box-sizing: border-box;
  `;

  overlay.innerHTML = `
    <div style="
      background: var(--bg-card, #1a1a2e); border: 3px solid var(--black, #111);
      border-radius: 16px; padding: 28px 24px; max-width: 340px; width: 100%;
      box-shadow: 6px 6px 0 var(--black, #111); text-align: center;
    ">
      <div style="font-size: 40px; margin-bottom: 12px;">🚀</div>
      <h2 style="
        font-family: 'Space Grotesk', sans-serif; font-weight: 900;
        font-size: 18px; text-transform: uppercase; letter-spacing: 0.5px;
        color: var(--text, #fff); margin: 0 0 8px;
      ">New Version Available</h2>
      <p style="font-size: 12px; font-weight: 600; color: var(--text-muted, #aaa); margin: 0 0 14px; line-height: 1.5;">
        Version <strong style="color: var(--yellow, #FFD60A);">v${data.latestVersion}</strong> is available.<br>
        You are running <strong>v${runningAppVersion}</strong>.
      </p>
      <p style="font-size: 11.5px; color: var(--text-muted, #aaa); margin: 0 0 20px; line-height: 1.5; text-align: left; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 10px 12px;">
        ${data.releaseNotes || 'Bug fixes and improvements.'}
      </p>
      <div style="display: flex; gap: 12px;">
        <button id="__update-later-btn" style="
          flex: 1; background: #333; color: #fff; border: 2px solid #111;
          border-radius: 10px; padding: 12px; font-family: 'Space Grotesk', sans-serif;
          font-weight: 900; font-size: 12px; text-transform: uppercase;
          box-shadow: 2px 2px 0 #111; cursor: pointer;
        ">
          Later
        </button>
        <a id="__update-download-btn" href="#" style="
          flex: 1.3; display: block; box-sizing: border-box;
          background: var(--yellow, #FFD60A); color: #111; border: 2px solid #111;
          border-radius: 10px; padding: 12px; font-family: 'Space Grotesk', sans-serif;
          font-weight: 900; font-size: 12px; text-transform: uppercase;
          text-decoration: none; box-shadow: 2px 2px 0 #111; cursor: pointer;
          text-align: center;
        ">
          ⬇ Update
        </a>
      </div>
    </div>
  `;

  // Redirect to download via external system browser
  const downloadBtn = overlay.querySelector('#__update-download-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isNativeApp = (window.Capacitor && window.Capacitor.isNativePlatform()) || 
                          navigator.userAgent.includes("Capacitor");
      if (isNativeApp) {
        if (window.Capacitor?.Plugins?.Browser) {
          window.Capacitor.Plugins.Browser.open({ url: data.apkUrl });
        } else {
          window.open(data.apkUrl, '_system');
        }
      } else {
        const link = document.createElement('a');
        link.href = data.apkUrl;
        link.download = 'Consistency.Daily.apk';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    });
  }

  // Dismiss button action
  const laterBtn = overlay.querySelector('#__update-later-btn');
  if (laterBtn) {
    laterBtn.addEventListener('click', () => {
      sessionStorage.setItem('dismissedUpdate', 'true');
      overlay.remove();
    });
  }

  document.body.appendChild(overlay);
}

/**
 * Fetches /app-version.json from the server and triggers a forced or soft update dialog
 * if the server version is newer than the currently running APK version.
 * Only runs on native Android builds.
 */
async function checkForAppUpdate() {
  if (!isAndroidNative) return;
  try {
    // Always fetch fresh (bypass cache) so the version file is never stale
    const res = await fetch(`${API || 'https://consistency-daily.vercel.app'}/app-version.json?t=${Date.now()}`, {
      cache: 'no-store'
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.latestVersion) return;

    const isOutdated = compareSemver(runningAppVersion, data.latestVersion) < 0;
    if (isOutdated) {
      if (data.forceUpdate) {
        // Wait for DOM to be ready before injecting the dialog
        const injectDialog = () => showForceUpdateDialog(data);
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', injectDialog, { once: true });
        } else {
          injectDialog();
        }
      } else {
        // Soft update dialog - check if already dismissed in this session
        if (!sessionStorage.getItem('dismissedUpdate')) {
          const injectDialog = () => showSoftUpdateDialog(data);
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', injectDialog, { once: true });
          } else {
            injectDialog();
          }
        }
      }
    }
  } catch (err) {
    console.warn('[UpdateCheck] Failed to check for app update:', err.message);
  }
}
// Run the update check immediately on page load
checkForAppUpdate();


// ── Offline detection: apply SYNCHRONOUSLY before any async work ──────────
if (!navigator.onLine) {
  document.body.classList.add('is-offline');
}

// ── Security Helpers ──────────────────────────────────────
function setLeaderboardTogglesEnabled(enabled) {
  const title = enabled ? 'Showcase on leaderboard' : 'Cannot change settings while offline';
  const st  = document.getElementById('leaderboard-showcase-settings-toggle');
  const lbt = document.getElementById('leaderboard-showcase-toggle');
  if (st)  { st.disabled  = !enabled; st.title  = title; }
  if (lbt) { lbt.disabled = !enabled; lbt.title = title; }
}
window.setLeaderboardTogglesEnabled = setLeaderboardTogglesEnabled;

function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
window.escapeHTML = escapeHTML;

// ── Auth ───────────────────────────────────────────────────
window.userId = localStorage.getItem('userId') || '';
window.userName = localStorage.getItem('userName') || 'User';
window.userProfilePicture = localStorage.getItem('userProfilePicture') || '';

// Sync premium status from IndexedDB cache immediately on boot
if (window.userId) {
  (async () => {
    try {
      if (window.localDb) {
        const cached = await window.localDb.userProfile.get(window.userId);
        if (cached && cached.isPremium !== undefined) {
          localStorage.setItem('isPremium', cached.isPremium.toString());
          localStorage.setItem('subscriptionTier', cached.isPremium ? 'premium' : 'free');
        }
      }
    } catch (e) {
      console.warn('Failed to load cached premium state on boot:', e);
    }
  })();
}

// ── Sync Username if missing ───────────────────────────────
if (window.userId && !localStorage.getItem('userUsername')) {
  window.addEventListener('DOMContentLoaded', () => {
    (async () => {
      try {
        const res = await window.apiFetch(`${window.API}/api/auth/settings`);
        if (res && res.username) {
          localStorage.setItem('userUsername', res.username);
          console.log('✅ Username synchronized');
        }
      } catch (e) { console.error('Failed to sync username', e); }
    })();
  });
}

function logout() {
  const token = localStorage.getItem('fcmToken');
  if (token) {
    window.apiFetch(`${window.API}/api/fcm/token`, {
      method: 'DELETE',
      body: JSON.stringify({ token })
    }).catch(err => console.warn('FCM unregister failed on logout:', err));
  }
  const fcmDisabled = localStorage.getItem('fcmNotificationsDisabled');
  localStorage.clear();
  if (fcmDisabled !== null) {
    localStorage.setItem('fcmNotificationsDisabled', fcmDisabled);
  }
  if (window.localDb) {
    window.localDb.delete().then(() => {
      window.location.replace('landing.html');
    }).catch(() => {
      window.location.replace('landing.html');
    });
  } else {
    window.location.replace('landing.html');
  }
}
window.logout = logout;

// Security: If admin token is set in another tab, logout user immediately
window.addEventListener('storage', (e) => {
  if (e.key === 'adminToken' && e.newValue) {
    // Clear user-specific credentials but preserve adminToken
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== 'adminToken') {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    
    if (window.localDb) {
      window.localDb.delete().catch(() => {}).finally(() => {
        window.location.replace('auth.html');
      });
    } else {
      window.location.replace('auth.html');
    }
  }
  if (e.key === 'token' && !e.newValue) {
    window.location.replace('auth.html');
  }
});

// Handle browser back button (caching issues)
window.onpageshow = function(event) {
  if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
    if (!localStorage.getItem('token') && !window.location.pathname.includes('landing.html') && !window.location.pathname.includes('auth.html')) {
      window.location.replace('auth.html');
    }
  }
};

// ── State ──────────────────────────────────────────────────
window.allDays = [];
window.allWeeklySummaries = [];
window.generationsLeft = 15;
window.weeklyGenerationsLeft = 2;
window.weeklyLimit = 2;
window.monthlyDailyLeft = 1;
window.monthlyDailyLimit = 1;
window.monthlyMonthlyLeft = 2;
window.monthlyMonthlyLimit = 2;
window.totalDaysCountInDb = 0;
window.currentPage = 1;
window.daysPerPage = 10;
window.hasMoreDays = false;
window.backendStreak = 0;
window._wasOffline = false;
window.allGoals = [];
window.goalsSortOption = 'default';
window.visibleGoalsCount = 10;
window.activeDayIdForCategory = null;

// Edit-modal state
window.editingDayId = null;
window.editingCatId = null;
window.editingGoalId = null;

// Achievement state
window.allAchievements = [];
window.activeDayIdForAchievement = null;
window.editingAchievementId = null;
window.achievementsPublic = true;
window._currentMemberId = null;
window._currentMemberName = null;
window._currentMemberUsername = null;

// Template state
window.allTemplates = [];
window.activeDayIdForTemplate = null;
window.editingTemplateId = null;

// LeetCode configuration
window.MAX_USERNAME_CHANGES = 3;
window.currentLeetCodeDayId = null;

// Leaderboard state
window.lbPage = 1;
window.lbSort = 'current';
window.lbHasMore = false;
window.lbIsLoading = false;
window.globalConfig = {
  maxRankingsShown: 100,
  chatReadThresholdPct: 10
};

async function fetchConfig() {
  try {
    const config = await window.apiFetch(`${window.API}/api/users/config`);
    if (config) {
      if (config.maxRankingsShown) {
        window.globalConfig.maxRankingsShown = config.maxRankingsShown;
        const lbTitleExtra = document.getElementById('lb-title-extra');
        if (lbTitleExtra) lbTitleExtra.textContent = ` (Top ${window.globalConfig.maxRankingsShown})`;
      }
      if (config.chatReadThresholdPct !== undefined) {
        window.globalConfig.chatReadThresholdPct = config.chatReadThresholdPct;
      }
    }
  } catch (err) {
    console.error('Failed to fetch config:', err);
  }
}
window.fetchConfig = fetchConfig;

window.currentLeetCodeValidation = null;
window.leetcodeRetryTimerInterval = null;

function setLcStatus(el, state, text) {
  if (!el) return;
  el.className = `lc-status-badge lc-status-${state}`;
  el.textContent = text;
}
window.setLcStatus = setLcStatus;

function handleManageSubscription(event) {
  if (event) event.preventDefault();
  window.location.href = 'subscription.html';
}
window.handleManageSubscription = handleManageSubscription;

console.log("[Module] state.js loaded and state variables bound to window");
