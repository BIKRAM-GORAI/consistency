console.log("[Module] state.js initializing...");

// Detect if running inside Capacitor Android native wrapper
const isAndroidNative = navigator.userAgent.includes("CapacitorNative/Android");
if (isAndroidNative) {
  document.body.classList.add('native-android');
}
window.isAndroidNative = isAndroidNative;

// Extract Android version if present: e.g. "CapacitorNative/Android/1.0"
let runningAppVersion = "1.6";
if (isAndroidNative) {
  const parts = navigator.userAgent.split("CapacitorNative/Android/");
  if (parts.length > 1) {
    runningAppVersion = parts[1].split(" ")[0].trim();
  }
}
window.runningAppVersion = runningAppVersion;

// ── Offline detection: apply SYNCHRONOUSLY before any async work ──────────
if (!navigator.onLine) {
  document.body.classList.add('is-offline');
}

const API = isAndroidNative ? 'https://consistency-daily.vercel.app' : '';
window.API = API;

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
    localStorage.clear();
    window.location.replace('auth.html');
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

console.log("[Module] state.js loaded and state variables bound to window");
