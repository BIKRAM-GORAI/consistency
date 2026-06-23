let isRefreshingToken = false;
let refreshSubscribers = [];

function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token) {
  refreshSubscribers.forEach(cb => cb(token));
  refreshSubscribers = [];
}

async function performTokenRefresh(refreshToken) {
  if (isRefreshingToken) {
    return new Promise(resolve => {
      subscribeTokenRefresh(token => {
        resolve(token);
      });
    });
  }

  isRefreshingToken = true;

  try {
    const API = window.API || '';
    const isAndroidNative = navigator.userAgent.includes("CapacitorNative/Android");
    const resolvedAPI = isAndroidNative ? 'https://consistency-daily.vercel.app' : API;

    const res = await fetch(`${resolvedAPI}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });

    if (!res.ok) {
      throw new Error('Refresh request failed');
    }

    const data = await res.json();
    localStorage.setItem('token', data.token);
    if (data.refreshToken) {
      localStorage.setItem('refreshToken', data.refreshToken);
    }
    
    isRefreshingToken = false;
    onRefreshed(data.token);
    return data.token;
  } catch (err) {
    isRefreshingToken = false;
    refreshSubscribers = [];
    throw err;
  }
}

// ── API Fetch Engine ───────────────────────────────────────
async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...(options.headers || {}) };
  
  // If body is NOT FormData, default to JSON
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  // Send the client's current local date string (YYYY-MM-DD) for timezone-safe calculations on the backend
  headers['X-Client-Date'] = typeof window.todayStr === 'function' ? window.todayStr() : '';

  // Default 30s timeout, but can be overridden
  const timeoutMs = options.timeout || 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { 
      cache: 'no-store', // Disable browser fetch cache explicitly to prevent stale dashboard/profile limits
      ...options, 
      headers, 
      signal: controller.signal 
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        // If the request itself was the refresh token request, fail immediately
        if (url.includes('/api/auth/refresh')) {
          throw new Error('Refresh token expired or invalid');
        }

        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          try {
            const newToken = await performTokenRefresh(refreshToken);
            
            // Retry the original request with the new access token
            const retryHeaders = { ...headers };
            retryHeaders['Authorization'] = `Bearer ${newToken}`;
            
            const retryController = new AbortController();
            const retryTimeoutId = setTimeout(() => retryController.abort(), timeoutMs);
            
            const retryRes = await fetch(url, {
              cache: 'no-store',
              ...options,
              headers: retryHeaders,
              signal: retryController.signal
            });
            clearTimeout(retryTimeoutId);
            
            if (!retryRes.ok) {
              const body = await retryRes.json().catch(() => ({}));
              throw new Error(body.message || `HTTP ${retryRes.status}`);
            }
            
            return retryRes.json().then(data => {
              if (window._wasOffline) {
                window._wasOffline = false;
                if (typeof window.updateOfflineButtonState === 'function') {
                  window.updateOfflineButtonState(false);
                }
              }
              return data;
            });
          } catch (refreshErr) {
            console.error('Token refresh failed:', refreshErr);
            const adminToken = localStorage.getItem('adminToken');
            localStorage.clear();
            if (adminToken) localStorage.setItem('adminToken', adminToken);
            window.location.replace('landing.html');
            throw new Error('Session expired. Please log in again.');
          }
        } else {
          const adminToken = localStorage.getItem('adminToken');
          localStorage.clear();
          if (adminToken) localStorage.setItem('adminToken', adminToken);
          window.location.replace('landing.html');
          throw new Error('Session expired. Please log in again.');
        }
      }
      if (res.status === 403) {
        if (body.isBlacklisted === true) {
          const adminToken = localStorage.getItem('adminToken');
          localStorage.clear();
          if (adminToken) localStorage.setItem('adminToken', adminToken);
          const reason = encodeURIComponent(body.message || 'Your account is blacklisted.');
          window.location.replace(`auth.html?blacklisted=true&reason=${reason}`);
          throw new Error(body.message || 'Your account is blacklisted.');
        }
        if (body.isEmailUnverified === true) {
          if (typeof window.showToast === 'function') {
            window.showToast(body.message || 'Email verification is required.', 'error');
          }
          if (typeof window.openProfileModal === 'function') {
            window.openProfileModal();
          }
          const err = new Error(body.message || 'Email verification required.');
          err.status = 403;
          err.data = body;
          throw err;
        }
      }
      if (res.status === 429) {
        const err = new Error(body.message || 'Too many requests. Please try again later.');
        err.status = 429;
        err.data = body;
        throw err;
      }
      const err = new Error(body.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = body;
      throw err;
    }
    return res.json().then(data => {
      // Any successful response → we are online. Re-enable buttons if they were disabled offline.
      if (window._wasOffline) {
        window._wasOffline = false;
        if (typeof window.updateOfflineButtonState === 'function') {
          window.updateOfflineButtonState(false); // false = not forced offline
        }
      }
      return data;
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('Request timed out. Please check your connection.');
    // Real network error (no internet) → disable all network-dependent buttons immediately
    if (err instanceof TypeError) {
      window._wasOffline = true;
      if (typeof window.updateOfflineButtonState === 'function') {
        window.updateOfflineButtonState(true); // forceOffline=true bypasses navigator.onLine
      }
    }
    throw err;
  }
}
window.apiFetch = apiFetch;

// ── Offline Sync Queue Manager (syncManager) ────────────────
const syncManager = {
  isProcessing: false,
  processingPromise: null,
  inFlightQueueIds: new Set(),

  async addToQueue(method, entity, id, data, localId = null) {
    if (window.checkEmailVerificationBlocked && window.checkEmailVerificationBlocked()) {
      return;
    }
    const db = window.localDb;
    if (!db) return;
    try {
      // ── SPECIAL CASE: If updating a temp item that hasn't synced yet ──
      if (method === 'PUT' && String(id).startsWith('temp_')) {
        const pending = await db.syncQueue
          .filter(x => x.entity === entity && x.localId === id && x.method === 'POST')
          .first();
        
        if (pending) {
          // Merge the update into the original creation request
          pending.data = { ...pending.data, ...data };
          await db.syncQueue.put(pending);
          console.log(`Merged update into pending ${entity} creation:`, id);
          return;
        }
      }

      // ── DEDUP: For PUTs on real IDs, replace any existing queued PUT ──
      if (method === 'PUT' && id && !String(id).startsWith('temp_')) {
        const existing = await db.syncQueue
          .filter(x => x.entity === entity && x.targetId === id && x.method === 'PUT' && !syncManager.inFlightQueueIds.has(x.id))
          .first();

        if (existing) {
          existing.data = { ...existing.data, ...data };
          existing.timestamp = Date.now();
          await db.syncQueue.put(existing);
          console.log(`Deduped PUT for ${entity}/${id}`);
          this.processQueue();
          return;
        }
      }

      await db.syncQueue.add({
        method,
        entity,
        targetId: id,
        data,
        localId,
        timestamp: Date.now()
      });
      this.processQueue();
    } catch (err) {
      console.warn('Sync queue add failed:', err);
    }
  },

  async processQueue() {
    if (this.isProcessing) {
      return this.processingPromise;
    }
    if (!navigator.onLine) return;

    let resolveProcessing;
    this.processingPromise = new Promise(resolve => {
      resolveProcessing = resolve;
    });
    this.isProcessing = true;

    try {
      const localDb = window.localDb;
      if (!localDb) return;

      // Helper to strip temp IDs so MongoDB doesn't reject them
      const stripTempIds = (data) => {
        if (Array.isArray(data)) return data.map(stripTempIds);
        if (data !== null && typeof data === 'object') {
          const cleaned = {};
          for (const key in data) {
            if (key === '_id' && String(data[key]).startsWith('temp_')) continue;
            cleaned[key] = stripTempIds(data[key]);
          }
          return cleaned;
        }
        return data;
      };

      while (true) {
        const queue = await localDb.syncQueue.orderBy('timestamp').toArray();
        if (queue.length === 0) break;

        const item = queue[0];
        this.inFlightQueueIds.add(item.id);
        try {
          let url = '';
          const API = window.API || '';
          if (item.entity === 'days') url = `${API}/api/days/${item.targetId || ''}`;
          else if (item.entity === 'goals') url = `${API}/api/goals/${item.targetId || ''}`;
          else if (item.entity === 'achievements') url = `${API}/api/achievements/${item.targetId || ''}`;
          else if (item.entity === 'groups') url = `${API}/api/groups/${item.targetId || ''}`;
          else if (item.entity === 'auth/settings') url = `${API}/api/auth/settings`;
          else if (item.entity === 'scratchpads') url = `${API}/api/days/${item.targetId || ''}/scratchpad`;
          else if (item.entity === 'appLimits') url = `${API}/api/applimits`;

          const response = await apiFetch(url, {
            method: item.method,
            body: JSON.stringify(stripTempIds(item.data))
          });

          // SUCCESS: Remove from queue
          await localDb.syncQueue.delete(item.id);
          this.inFlightQueueIds.delete(item.id);

          const remainingForThis = await localDb.syncQueue
            .filter(x => x.entity === item.entity && (x.targetId === item.targetId || x.localId === item.localId))
            .count();

          if (response && (response._id || response.dayId)) {
            const mainId = response._id || response.dayId;

            // Sync streak from server response if available
            if (typeof response.streak !== 'undefined') {
              window.backendStreak = response.streak;
              if (typeof window.updateStreak === 'function') {
                window.updateStreak();
              }
            }

            if (item.localId && item.localId !== mainId) {
              await localDb[item.entity].delete(item.localId);

              if (item.entity === 'days') {
                if (window.allDays) {
                  const idx = window.allDays.findIndex(d => d._id === item.localId);
                  if (idx !== -1) window.allDays[idx] = response;
                }

                if (localDb.scratchpads) {
                  const cachedScratchpad = await localDb.scratchpads.get(item.localId);
                  if (cachedScratchpad) {
                    await localDb.scratchpads.delete(item.localId);
                    cachedScratchpad.dayId = response._id;
                    await localDb.scratchpads.put(cachedScratchpad);
                  }
                }
                if (typeof window.renderDays === 'function') {
                  window.renderDays();
                }
              } else if (item.entity === 'goals') {
                if (window.allGoals) {
                  const idx = window.allGoals.findIndex(g => g._id === item.localId);
                  if (idx !== -1) window.allGoals[idx] = response;
                }
                if (typeof window.sortGoals === 'function') window.sortGoals();
                if (typeof window.renderGoals === 'function') window.renderGoals();
              }

              await localDb.syncQueue
                .where('targetId')
                .equals(item.localId)
                .modify({ targetId: response._id || mainId });

              await localDb.syncQueue
                .where('localId')
                .equals(item.localId)
                .modify({ localId: response._id || mainId });
            } else if (!item.localId && item.entity === 'days' && window.allDays) {
              // For existing days, update memory state but do NOT renderDays (UI is already in sync)
              if (remainingForThis === 0) {
                const idx = window.allDays.findIndex(d => d._id === item.targetId);
                if (idx !== -1) {
                  window.allDays[idx] = response;
                }
              }
            }

            if (remainingForThis === 0) {
              await localDb[item.entity].put(response);
            }
          }
        } catch (err) {
          this.inFlightQueueIds.delete(item.id);
          console.warn('Sync failed for item:', item.id, err);
          // Only delete if it is a permanent client/validation error (e.g. 400 Bad Request, 404 Not Found)
          // Do NOT delete for transient errors (network errors, rate limits 429, or 5xx server errors)
          if (err.status && err.status >= 400 && err.status < 500 && err.status !== 429) {
            await localDb.syncQueue.delete(item.id);
            if (item.entity === 'days' && typeof window.loadDays === 'function') window.loadDays();
            else if (item.entity === 'goals' && typeof window.loadGoals === 'function') window.loadGoals();
          } else {
            // Transient error (network down, rate limit, 5xx server error) -> break out of the loop and keep in queue
            break;
          }
        }
      }
    } finally {
      this.isProcessing = false;
      const resolveFn = resolveProcessing;
      this.processingPromise = null;
      if (resolveFn) resolveFn();
    }
  }
};
window.syncManager = syncManager;

// ── Online / Offline Listeners ─────────────────────────────
window.addEventListener('online', async () => {
  window._wasOffline = false;

  if (typeof window.showToast === 'function') {
    window.showToast('Back online! Syncing your progress...', 'info');
  }

  // 1. Process sync queue first and wait for completion
  await syncManager.processQueue();

  if (typeof window.updateOfflineButtonState === 'function') {
    window.updateOfflineButtonState(false);
  }
  if (typeof window.setLeaderboardTogglesEnabled === 'function') {
    window.setLeaderboardTogglesEnabled(true);
  }

  // Re-authenticate Firebase Auth when connection is restored
  if (typeof window.initFirebaseChat === 'function') {
    await window.initFirebaseChat();
  }

  // If a group chat is currently open, cleanly re-subscribe to pull online changes
  if (typeof window.activeChatGroupId !== 'undefined' && window.activeChatGroupId) {
    const chatModal = document.getElementById('modal-group-chat');
    if (chatModal && chatModal.classList.contains('active')) {
      const groupNameEl = document.getElementById('chat-group-name');
      const groupName = groupNameEl ? groupNameEl.textContent : 'Group';
      const groupIconWrap = document.getElementById('chat-group-icon-wrap');
      const img = groupIconWrap ? groupIconWrap.querySelector('img') : null;
      const groupIcon = img ? img.src : '';
      
      if (typeof window.chatUnsubscribe === 'function') {
        try { window.chatUnsubscribe(); } catch (e) {}
      }
      if (typeof window.openGroupChat === 'function') {
        window.openGroupChat(window.activeChatGroupId, groupName, groupIcon, false);
      }
    }
  }

  // Refresh data from server
  if (typeof window.proactiveSync === 'function') {
    await window.proactiveSync(true);
  } else {
    if (typeof window.fetchAiLimit === 'function') {
      window.fetchAiLimit();
    }
    if (typeof window.loadDays === 'function') {
      await window.loadDays(1);
    }
  }
});


window.addEventListener('offline', () => {
  window._wasOffline = true;
  if (typeof window.updateOfflineButtonState === 'function') {
    window.updateOfflineButtonState(true);
  }
  if (typeof window.setLeaderboardTogglesEnabled === 'function') {
    window.setLeaderboardTogglesEnabled(false);
  }
  if (typeof window.showToast === 'function') {
    window.showToast('You are offline. AI features are disabled.', 'warn');
  }
});

console.log("[Module] api.js loaded and network handlers bound to window");
