/* ============================================================
   CONSISTENCY TRACKER — Frontend Script
   GSAP-powered animations · Ripple effects · Smooth UX
   Groups feature · Mobile-optimised
   ============================================================ */

const API = '';  // Same origin

// ── Security Helpers ──────────────────────────────────────
/** Escapes HTML special characters to prevent XSS */
function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ── Auth ───────────────────────────────────────────────────
const userId   = localStorage.getItem('userId')   || '';
let   userName = localStorage.getItem('userName') || 'User';
let userProfilePicture = localStorage.getItem('userProfilePicture') || '';

// ── Sync Username if missing ───────────────────────────────
if (userId && !localStorage.getItem('userUsername')) {
  (async () => {
    try {
      const res = await apiFetch(`${API}/api/auth/settings`);
      if (res && res.username) {
        localStorage.setItem('userUsername', res.username);
        console.log('✅ Username synchronized');
      }
    } catch (e) { console.error('Failed to sync username', e); }
  })();
}

function logout() {
  localStorage.clear();
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

// ── State ──────────────────────────────────────────────────
let allDays  = [];
let currentPage = 1;
const daysPerPage = 10;
let hasMoreDays = false;
let backendStreak = 0;
let allGoals = [];
let activeDayIdForCategory = null;

// Edit-modal state
let editingDayId  = null;
let editingCatId  = null;
let editingGoalId = null;

// Achievement state
let allAchievements           = [];
let activeDayIdForAchievement = null;
let editingAchievementId      = null;
let achievementsPublic        = true; // mirrors the DB setting

// Template state
let allTemplates = [];
let activeDayIdForTemplate = null;
let editingTemplateId = null;

// LeetCode configuration
const MAX_USERNAME_CHANGES = 3;

// Current day ID for LeetCode problem addition
let currentLeetCodeDayId = null;

// Leaderboard state
let lbPage = 1;
let lbSort = 'current'; // 'current' or 'highest'
let lbHasMore = false;
let lbIsLoading = false;
let globalConfig = {
  maxRankingsShown: 100,
  chatReadThresholdPct: 10
};

async function fetchConfig() {
  try {
    const config = await apiFetch(`${API}/api/users/config`);
    if (config) {
      if (config.maxRankingsShown) {
        globalConfig.maxRankingsShown = config.maxRankingsShown;
        const lbTitleExtra = document.getElementById('lb-title-extra');
        if (lbTitleExtra) lbTitleExtra.textContent = ` (Top ${globalConfig.maxRankingsShown})`;
      }
      if (config.chatReadThresholdPct !== undefined) {
        globalConfig.chatReadThresholdPct = config.chatReadThresholdPct;
      }
    }
  } catch (err) {
    console.error('Failed to fetch config:', err);
  }
}



// Cached validation result — reused in addLeetCodeProblem to avoid a second API call
let currentLeetCodeValidation = null;

// setInterval reference for the pending-retry countdown timer
let leetcodeRetryTimerInterval = null;

/**
 * Sets the LeetCode status badge class (theme-aware, no inline colours).
 * @param {HTMLElement} el  - the #leetcode-status element
 * @param {'verified'|'pending'|'waiting'|'error'} state
 * @param {string} text     - display text
 */
function setLcStatus(el, state, text) {
  if (!el) return;
  el.className = `lc-status-badge lc-status-${state}`;
  el.textContent = text;
}


// ── Mobile detection ───────────────────────────────────────
const isMobile = () => window.innerWidth <= 768;

// ── Motivation quotes ──────────────────────────────────────
const MOTIVATIONS = [
  { icon: 'biceps-flexed', text: 'Keep pushing!' },
  { icon: 'rocket',        text: 'You\'re on fire!' },
  { icon: 'star',          text: 'Unstoppable!' },
  { icon: 'zap',           text: 'Small steps win!' },
  { icon: 'target',        text: 'Stay locked in.' },
  { icon: '🔥',          text: 'Don\'t break the chain!' },
  { icon: 'sparkles',      text: 'Progress = Success.' },
  { icon: 'trophy',        text: 'Champions show up!' },
];

// ── Ripple Effect ──────────────────────────────────────────
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.ripple');
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 1.5;
  const x = e.clientX - rect.left - size / 2;
  const y = e.clientY - rect.top  - size / 2;
  const ripple = document.createElement('span');
  ripple.className = 'ripple-effect';
  ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;`;
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
});

// ── Utility helpers ────────────────────────────────────────

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDisplayDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m-1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function getDayName(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m-1, d).toLocaleDateString('en-US', { weekday: 'long' });
}

function countTasks(categories) {
  let total = 0, completed = 0;
  for (const cat of categories) {
    for (const task of cat.tasks) {
      total++;
      if (task.completed) completed++;
    }
  }
  return { total, completed };
}

function calcProgress(categories) {
  const { total, completed } = countTasks(categories);
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

function progressClass(pct) {
  if (pct <= 40) return 'prog-red';
  if (pct <= 80) return 'prog-yellow';
  if (pct < 100) return 'prog-ltgreen';
  return 'prog-green';
}

function progressColor(pct) {
  if (pct <= 40)  return '#ef4444';
  if (pct <= 80)  return '#eab308';
  if (pct < 100)  return '#34d399';
  return '#10b981';
}

function calculateStreak(days) {
  if (!days.length) return { count: 0, todayDone: false };
  const sorted = [...days].sort((a, b) => b.date.localeCompare(a.date));
  const today = todayStr();
  let streak = 0;
  let checkDate = today;
  let todayDone = false;

  // Check if today has any tasks completed
  const todayDay = sorted.find(d => d.date === today);
  if (todayDay && countTasks(todayDay.categories).completed > 0) {
    todayDone = true;
  } else {
    // Start counting from yesterday since today is pending
    const [y, m, d] = checkDate.split('-').map(Number);
    const prev = new Date(y, m-1, d-1);
    checkDate = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}-${String(prev.getDate()).padStart(2,'0')}`;
  }

  for (const day of sorted) {
    if (day.date > checkDate) continue;
    if (day.date < checkDate) break;

    const { completed } = countTasks(day.categories);
    if (completed > 0) {
      streak++;
      const [y, m, d] = checkDate.split('-').map(Number);
      const prev = new Date(y, m-1, d-1);
      checkDate = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}-${String(prev.getDate()).padStart(2,'0')}`;
    } else break;
  }
  return { count: streak, todayDone };
}

/** Enhanced toast with GSAP */
function showToast(msg, type = 'info') {
  const toast   = document.getElementById('toast');
  const iconEl  = document.getElementById('toast-icon');
  const msgEl   = document.getElementById('toast-msg');

  const icons = { success: 'check-circle', error: 'x-circle', warn: 'alert-triangle', info: 'info' };
  iconEl.innerHTML = `<i data-lucide="${icons[type] || 'info'}"></i>`;
  msgEl.innerHTML = msg;

  toast.className = 'toast';
  if (type === 'graph') toast.classList.add('graph');
  toast.classList.add('show');
  
  if (window.lucide) lucide.createIcons({ props: { width: 20, height: 20 }, nameAttr: 'data-lucide', root: iconEl });

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function daysLeft(deadlineStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const dl = new Date(deadlineStr); dl.setHours(0,0,0,0);
  return Math.round((dl - today) / (1000 * 60 * 60 * 24));
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escJs(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Page switch ────────────────────────────────────────────
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  const btnEl  = document.getElementById(`btn-${page}`);
  if (pageEl) pageEl.classList.add('active');
  if (btnEl)  btnEl.classList.add('active');

  // Sync bottom nav bar active state (mobile)
  document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
  const bnavBtn = document.getElementById(`bnav-${page}`);
  if (bnavBtn) bnavBtn.classList.add('active');

  if (page === 'goals')        loadGoals();
  if (page === 'groups')       loadGroups();
  if (page === 'achievements') loadAchievements();
  if (page === 'leaderboard')  loadLeaderboard(true);
}

// ── API ────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...(options.headers || {}) };
  
  // If body is NOT FormData, default to JSON
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Default 30s timeout, but can be overridden
  const timeoutMs = options.timeout || 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...options, headers, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      if (res.status === 401) {
        localStorage.clear();
        window.location.replace('landing.html');
        throw new Error('Session expired. Please log in again.');
      }
      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(body.message || 'Too many requests. Please try again later.');
        err.status = 429;
        err.data = body;
        throw err;
      }
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = body;
      throw err;
    }
    return res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('Request timed out. Please check your connection.');
    throw err;
  }
}

// ── Days ───────────────────────────────────────────────────
async function loadDays(page = 1) {
  const localDb = window.localDb;
  if (!localDb) {
    console.warn('Local database not initialized');
    return;
  }
  const loadingEl = document.getElementById('loading-days');

  // 1. STALE: Load from IndexedDB instantly
  if (page === 1) {
    try {
      const cached = await localDb.days.toArray();
      if (cached.length > 0) {
        allDays = cached;
        renderDays();
        updateStreak();
        if (loadingEl) loadingEl.innerHTML = '';
      }
    } catch (err) {
      console.warn('Dexie read error:', err);
    }
  }

  // 2. REVALIDATE: Load from Server (Only if online)
  if (!navigator.onLine) {
    if (allDays.length > 0) showToast('Offline: Using cached days.', 'info');
    return;
  }

  try {
    const data = await apiFetch(`${API}/api/days?page=${page}&limit=${daysPerPage}`);
    
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      if (page === 1) {
        allDays = data.days;
        // Update Local Cache (Merge instead of clear to preserve offline history)
        await localDb.days.bulkPut(data.days);
      } else {
        allDays.push(...data.days);
        await localDb.days.bulkPut(data.days);
      }
      
      backendStreak = data.streak || 0;
      hasMoreDays = data.hasMore || false;
    } else {
      // Fallback for non-paginated API
      if (page === 1) {
        allDays = data;
        await localDb.days.clear();
        await localDb.days.bulkAdd(data);
      } else {
        allDays.push(...data);
        await localDb.days.bulkPut(data);
      }
      hasMoreDays = false;
    }

    const isLoadMore = page > 1;
    currentPage = page;
    renderDays(isLoadMore);
    updateStreak();
    if (loadingEl) loadingEl.innerHTML = '';
  } catch (err) {
    console.error('Error loading days:', err);
    
    // If we have cached data, don't show a big error, just a small notice
    if (allDays.length > 0) {
      if (loadingEl) loadingEl.innerHTML = '<p style="color:var(--text-muted);font-size:11px;text-align:center;">Showing offline data</p>';
      return;
    }

    let errorMessage = '⚠️ Failed to load days. Please check your connection.';
    if (err.message) {
      if (err.message.includes('Too many requests') || err.message.includes('rate limit') || err.message.includes('429')) {
        errorMessage = '⚠️ Too many requests. Please try again later.';
      } else if (err.message.includes('Server offline') || err.message.includes('fetch')) {
        errorMessage = '⚠️ Server offline. Please check your connection.';
      } else {
        errorMessage = `⚠️ ${err.message}`;
      }
    }

    if (loadingEl) {
      loadingEl.innerHTML = `<p style="color:#ef4444;text-align:center">${errorMessage}</p>`;
    }
  }
}

function loadMoreDays() {
  const btn = document.querySelector('.btn-load-more');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner-ring" style="width:16px;height:16px;border-width:2px;margin:0 auto;"></div>';
  }
  loadDays(currentPage + 1);
}

function updateStreak() {
  // Use a IIFE to get full local data for streak calculation without affecting global allDays
  (async () => {
    const fullLocalDays = await window.localDb.days.toArray();
    const { count, todayDone } = calculateStreak(fullLocalDays);
    
    // Use local count if offline or if local count is higher (unsynced wins)
    const streak = (!navigator.onLine || count > backendStreak) ? count : backendStreak;
    
    const el = document.getElementById('streak-display');
    const fireEl = document.querySelector('.streak-fire');

    // Update all streak displays (Main UI, Quick View, etc.)
    const allDisplays = document.querySelectorAll('#streak-display, #qp-current-streak, #public-profile-streak');
    allDisplays.forEach(display => {
      if (display && display !== el) display.textContent = streak;
    });

    // Show exclamation mark if streak > 0 but today is not done yet
    if (fireEl) {
      fireEl.innerHTML = (streak > 0 && !todayDone) ? '<i data-lucide="alert-circle"></i>' : '🔥';
      if (window.lucide) lucide.createIcons({ root: fireEl });
    }
    
    if (el) {
      if (window.gsap) {
        gsap.to({ val: parseInt(el.textContent) || 0 }, {
          val: streak,
          duration: 0.8,
          ease: 'power2.out',
          onUpdate() { el.textContent = Math.round(this.targets()[0].val); },
        });
      } else {
        el.textContent = streak;
      }
      if (streak >= 100) el.classList.add('legendary');
      else el.classList.remove('legendary');

      // Pulse the streak pill if streak > 0 and today is complete
      if (streak > 0 && todayDone && window.gsap) {
        gsap.fromTo('#nav-streak', { scale: 1 }, { scale: 1.06, duration: 0.2, yoyo: true, repeat: 1, ease: 'power1.inOut' });
      }
    }
  })();
}


async function renderDays(appendOnly = false) {
  const container = document.getElementById('cards-container');
  
  // Remove existing Load More row if it exists
  const existingLoadMore = container.querySelector('.load-more-row');
  if (existingLoadMore) existingLoadMore.remove();

  if (!appendOnly) {
    container.innerHTML = '';
  }

  // ── "New Day Card" button always pinned at the top (only if not appending) ──────
  if (!appendOnly) {
    const addBtnRow = document.createElement('div');
    addBtnRow.className = 'add-day-inline-row';
    addBtnRow.innerHTML = `
      <button class="add-day-inline-btn ripple" onclick="openAddDayModal()" id="add-day-inline-btn">
        <span class="plus-icon">＋</span>
        <span>New Day Card</span>
      </button>`;
    container.appendChild(addBtnRow);
  }

  if (!allDays.length) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'empty-state';
    emptyEl.innerHTML = `
      <span class="empty-icon"><i data-lucide="calendar"></i></span>
      <h3>No days yet</h3>
      <p>Click the button above to start your first day card.</p>`;
    container.appendChild(emptyEl);
    if (window.gsap) {
      gsap.from('.empty-state', { opacity: 0, y: 20, duration: 0.5, ease: 'power2.out' });
    }
    return;
  }

  // Filter for only the new days if appending
  let daysToRender = [...allDays];
  if (appendOnly) {
    const existingCards = container.querySelectorAll('.day-card');
    const existingIds = new Set(Array.from(existingCards).map(c => c.id.replace('day-card-', '')));
    daysToRender = daysToRender.filter(d => !existingIds.has(String(d._id)));
  }

  // Sort newest-first then build all cards (no layout thrash)
  const sorted = daysToRender.sort((a, b) => b.date.localeCompare(a.date));

  // Optimization: Fetch all achievements for these days in ONE batch request
  const dayIds = allDays.map(d => d._id).filter(id => !String(id).startsWith('temp_'));
  let batchAchievements = [];
  if (dayIds.length > 0) {
    if (navigator.onLine) {
      try {
        batchAchievements = await apiFetch(`${API}/api/achievements/days-batch`, {
          method: 'POST',
          body: JSON.stringify({ dayIds })
        });
      } catch (err) {
        console.warn('Batch achievements load failed. Falling back to local cache.');
        if (window.localDb) {
          batchAchievements = await window.localDb.achievements.where('dayId').anyOf(dayIds).toArray();
        }
      }
    } else if (window.localDb) {
      // Offline Mode: Use local cache
      batchAchievements = await window.localDb.achievements.where('dayId').anyOf(dayIds).toArray();
    }
  }

  const fragment = document.createDocumentFragment();
  for (const day of sorted) {
    const dayAchs = (batchAchievements || []).filter(a => a.dayId === day._id);
    const card = buildDayCard(day, dayAchs);
    // Mark as new for animation if we are appending
    if (appendOnly) {
      card.classList.add('is-new-card');
    }
    fragment.appendChild(card);
  }
  container.appendChild(fragment);

  if (hasMoreDays) {
    const loadMoreRow = document.createElement('div');
    loadMoreRow.className = 'load-more-row';
    loadMoreRow.style.textAlign = 'center';
    loadMoreRow.style.marginTop = '20px';
    loadMoreRow.style.marginBottom = '40px';
    loadMoreRow.innerHTML = `
      <button class="btn-ghost ripple btn-load-more" onclick="loadMoreDays()" style="display:flex; align-items:center; gap:8px; margin:0 auto; padding:12px 24px;">
        <span>Load More Days</span>
        <i data-lucide="chevron-down"></i>
      </button>
    `;
    container.appendChild(loadMoreRow);
    if (window.lucide) lucide.createIcons({ root: loadMoreRow });
  }

  // ── Mobile-aware GSAP entrance ──────────────────────────
  // If appendOnly, we only animate the newly added cards
  const animTarget = appendOnly ? '.is-new-card' : '.day-card';
  
  if (window.gsap) {
    if (isMobile()) {
      gsap.from(animTarget, {
        opacity: 0,
        duration: 0.3,
        ease: 'power2.out',
        clearProps: 'all',
        onComplete: () => {
          if (appendOnly) document.querySelectorAll('.is-new-card').forEach(el => el.classList.remove('is-new-card'));
        }
      });
    } else {
      gsap.from(animTarget, {
        opacity: 0,
        y: 30,
        duration: 0.5,
        stagger: 0.08,
        ease: 'power3.out',
        clearProps: 'all',
        onComplete: () => {
          if (appendOnly) document.querySelectorAll('.is-new-card').forEach(el => el.classList.remove('is-new-card'));
        }
      });
    }
  }
}

function buildDayCard(day, preLoadedAchievements = null) {
  const today   = todayStr();
  const isToday = day.date === today;
  const isFuture = day.date > today;
  const pct     = calcProgress(day.categories);

  const card = document.createElement('div');
  card.className = 'day-card';
  card.id = `day-card-${day._id}`;

  // Build categories HTML
  let categoriesHTML = '';
  for (const cat of day.categories) {
    let tasksHTML = '';
    for (const task of cat.tasks) {
      if (isToday) {
        tasksHTML += `
          <div class="task-item">
            <input type="checkbox" class="task-checkbox"
              ${task.completed ? 'checked' : ''}
              onchange="toggleTask('${day._id}','${cat._id}','${task._id}',this.checked)"
              id="chk-${task._id}" />
            <label class="task-title" for="chk-${task._id}">${escHtml(task.title)}</label>
            <button class="btn-del-task" onclick="deleteTask('${day._id}','${cat._id}','${task._id}')" title="Delete task"><i data-lucide="trash-2"></i></button>
          </div>`;
      } else {
        const lockClass = task.completed ? 'locked-complete' : 'locked-incomplete';
        tasksHTML += `
          <div class="task-item ${lockClass}">
            <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} disabled />
            <span class="task-title">${escHtml(task.title)}</span>
            <button class="btn-del-task" onclick="deleteTask('${day._id}','${cat._id}','${task._id}')" title="Delete task"><i data-lucide="trash-2"></i></button>
          </div>`;
      }
    }

    const completedCount = cat.tasks.filter(t => t.completed).length;
    const editCatBtn = isToday
      ? `<button class="btn-edit-cat ripple" onclick="openEditCategoryModal('${day._id}','${cat._id}')" title="Edit category"><i data-lucide="edit-3"></i></button>`
      : '';
    const delCatBtn = `<button class="btn-del-cat" onclick="deleteCategory('${day._id}','${cat._id}')" title="Delete category"><i data-lucide="trash-2"></i></button>`;
    categoriesHTML += `
      <div class="category-block">
        <div class="category-header">
          <span class="category-name">${escHtml(cat.name)}</span>
          <div class="category-header-right">
            <span class="category-count">${completedCount}/${cat.tasks.length}</span>
            ${editCatBtn}
            ${delCatBtn}
          </div>
        </div>
        <div class="tasks-list">${tasksHTML || '<p style="padding:8px 14px;font-size:13px;color:var(--text-3)">No tasks added.</p>'}</div>
      </div>`;
  }

  // Summary
  const summaryInner = isToday
    ? `<textarea class="summary-edit" id="summary-edit-${day._id}" rows="3">${escHtml(day.summary || '')}</textarea>
       <button class="summary-save-btn ripple" onclick="saveSummary('${day._id}')"><i data-lucide="save"></i> Save Note</button>`
    : `<p class="summary-text">${escHtml(day.summary || '(no notes for this day)')}</p>`;

  // Add category button (today only)
  const addCatBtn = isToday
    ? `<div class="add-category-row"><button class="btn-add-cat ripple" onclick="openAddCategoryModal('${day._id}')"><i data-lucide="plus-circle"></i> Add Category</button></div>`
    : '';

  card.innerHTML = `
    <div class="card-header">
      <div class="card-date-wrap">
        <span class="card-date">${formatDisplayDate(day.date)}</span>
        <span class="card-day-name">${getDayName(day.date)}</span>
      </div>
      <span class="card-badge ${isToday ? 'badge-today' : (isFuture ? 'badge-future' : 'badge-past')}">${isToday ? '<i data-lucide="sparkles"></i> Today' : (isFuture ? '<i data-lucide="clock"></i> Future' : 'Past')}</span>
    </div>

    <div class="progress-section">
      <div class="progress-meta">
        <span class="progress-label">Progress</span>
        <span class="progress-pct" id="pct-text-${day._id}" style="color:${progressColor(pct)}">${pct}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill ${progressClass(pct)}" id="pct-fill-${day._id}" style="width:0%"></div>
      </div>
    </div>

    <div class="categories-list" id="cat-list-${day._id}">
      ${categoriesHTML || '<p style="color:var(--text-3);font-size:14px;padding:4px 0">No categories yet.</p>'}
    </div>

    ${addCatBtn}

    <button class="summary-toggle" id="summary-toggle-${day._id}" onclick="toggleSummary('${day._id}')">
      <span><i data-lucide="file-text"></i></span>
      <span>Notes</span>
      <span class="summary-chevron"><i data-lucide="chevron-down"></i></span>
    </button>
    <div class="summary-content" id="summary-content-${day._id}">
      <div class="summary-inner">${summaryInner}</div>
    </div>

    <!-- Always-visible Log Win and Save Template buttons -->
    <div class="ach-add-row">
      <div style="display:flex; gap:10px; align-items:center;">
        <button class="btn-add-ach ripple" onclick="openAddAchievementModal('${day._id}')"><i data-lucide="trophy"></i> Log a Acheivement</button>
        <span class="ach-no-progress-note">doesn't affect progress</span>
      </div>
      <div style="display:flex; gap:10px;">
        <button class="btn-add-leetcode ripple" onclick="openLeetCodeProblemModal('${day._id}','${day.date}')" title="Add LeetCode problem" id="leetcode-btn-${day._id}"><i data-lucide="target"></i> LeetCode</button>
        <button class="btn-save-template ripple" onclick="openSaveTemplateModal('${day._id}')"><i data-lucide="save"></i> Save Template</button>
      </div>
    </div>
  `;

  // Animate progress bar after card is inserted into DOM
  // Using double-rAF to guarantee the element is painted before animating
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      animateProgressBar(`pct-fill-${day._id}`, pct);
    });
  });

  // Load achievements for this card (batch first)
  if (!String(day._id).startsWith('temp_')) {
    if (preLoadedAchievements && preLoadedAchievements.length > 0) {
      renderDayAchievements(day._id, preLoadedAchievements, card);
    }
    // Removed individual load fallback to prevent 429 rate limiting
  } else {
    // For temp days, achievements are only in memory/local until synced
    renderDayAchievements(day._id, allAchievements.filter(a => a.dayId === day._id), card);
  }

  // Initialize Lucide icons after building the card content
  if (window.lucide) {
    setTimeout(() => {
      lucide.createIcons({ root: card });
    }, 10);
  }

  return card;
}

/** Animate progress fill using GSAP or CSS transition */
function animateProgressBar(fillId, targetPct) {
  const fill = document.getElementById(fillId);
  if (!fill) return;
  if (window.gsap) {
    gsap.fromTo(fill, { width: '0%' }, { width: `${targetPct}%`, duration: 0.9, ease: 'power2.out' });
  } else {
    fill.style.width = `${targetPct}%`;
  }
}

async function toggleTask(dayId, catId, taskId, checked) {
  const day  = allDays.find(d => d._id === dayId);
  if (!day) return;
  const cat  = day.categories.find(c => c._id === catId);
  if (!cat) return;
  const task = cat.tasks.find(t => t._id === taskId);
  if (!task) return;

  task.completed = checked;
  updateProgressBar(dayId, day.categories);

  // Micro animation on checkbox
  if (window.gsap && checked) {
    const chk = document.getElementById(`chk-${taskId}`);
    if (chk) gsap.fromTo(chk, { scale: 1.35 }, { scale: 1, duration: 0.3, ease: 'back.out(2)' });
  }

  try {
    // 1. Update Local DB immediately
    await window.localDb.days.put(day);
    
    // 2. Add to Sync Queue
    syncManager.addToQueue('PUT', 'days', dayId, { categories: day.categories });
    
    updateStreak();
  } catch (err) {
    console.error('Offline write error:', err);
    // Even if local write fails, we try to keep going
  }
}

const syncManager = {
  async addToQueue(method, entity, id, data, localId = null) {
    const db = window.localDb;
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
    if (!navigator.onLine) return;
    
    const localDb = window.localDb;
    if (!localDb) return;
    const queue = await localDb.syncQueue.orderBy('timestamp').toArray();
    if (queue.length === 0) return;

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

    for (const item of queue) {
      try {
        let url = '';
        if (item.entity === 'days') url = `${API}/api/days/${item.targetId || ''}`;
        else if (item.entity === 'goals') url = `${API}/api/goals/${item.targetId || ''}`;
        else if (item.entity === 'achievements') url = `${API}/api/achievements/${item.targetId || ''}`;
        else if (item.entity === 'groups') url = `${API}/api/groups/${item.targetId || ''}`;
        else if (item.entity === 'auth/settings') url = `${API}/api/auth/settings`;

        const response = await apiFetch(url, {
          method: item.method,
          body: JSON.stringify(stripTempIds(item.data))
        });

        // SUCCESS: Remove from queue
        await localDb.syncQueue.delete(item.id);
        
        // ... rest of response logic
        // Check if there are newer pending updates for this same record in the queue
        const remainingForThis = await localDb.syncQueue
          .filter(x => x.entity === item.entity && (x.targetId === item.targetId || x.localId === item.localId))
          .count();

        if (response && response._id) {
          // If this was a POST for a temp item, we MUST swap the ID everywhere
          if (item.localId && item.localId !== response._id) {
            await localDb[item.entity].delete(item.localId);
            // Update memory references
            if (item.entity === 'days') {
              const idx = allDays.findIndex(d => d._id === item.localId);
              if (idx !== -1) allDays[idx] = response;
            } else if (item.entity === 'goals') {
              const idx = allGoals.findIndex(g => g._id === item.localId);
              if (idx !== -1) allGoals[idx] = response;
            }

            // [FIX] Update other items in the queue that refer to this temp ID
            // This ensures subsequent updates (PUT/DELETE) use the real server ID
            await localDb.syncQueue
              .where('targetId')
              .equals(item.localId)
              .modify({ targetId: response._id });

            await localDb.syncQueue
              .where('localId')
              .equals(item.localId)
              .modify({ localId: response._id });
          }

          // ONLY overwrite local if this was the LAST update in the queue for this item
          // This prevents "Reversion" where a mid-sync server response overwrites local work
          if (remainingForThis === 0) {
            await localDb[item.entity].put(response);
          }
        }
      } catch (err) {
        console.warn('Sync failed for item:', item.id, err);
        if (err.message && !err.message.includes('fetch')) {
          await localDb.syncQueue.delete(item.id);
          if (item.entity === 'days') loadDays();
          else if (item.entity === 'goals') loadGoals();
        }
        break; 
      }
    }
  }
};

// Also listen for online event to trigger sync
window.addEventListener('online', () => syncManager.processQueue());

// ── Delete category ────────────────────────────────────────
async function deleteCategory(dayId, catId) {
  const day = allDays.find(d => d._id === dayId);
  if (!day) return;
  const catIndex = day.categories.findIndex(c => c._id === catId);
  if (catIndex < 0) return;

  const catName = day.categories[catIndex].name;
  if (!confirm(`Delete the "${catName}" category and all its tasks?`)) return;

  // 1. Update UI and Local DB instantly
  const removed = day.categories.splice(catIndex, 1)[0];
  updateProgressBar(dayId, day.categories);
  await window.localDb.days.put(day);

  // 2. Queue for sync
  syncManager.addToQueue('PUT', 'days', dayId, { categories: day.categories });

  // Re-render only this card
  const cardEl = document.getElementById(`day-card-${dayId}`);
  if (cardEl) cardEl.replaceWith(buildDayCard(day));
  showToast(`"${catName}" deleted locally`, 'success');
}

// ── Delete individual task ──────────────────────────────────
async function deleteTask(dayId, catId, taskId) {
  const day = allDays.find(d => d._id === dayId);
  if (!day) return;
  const cat = day.categories.find(c => c._id === catId);
  if (!cat) return;
  const taskIndex = cat.tasks.findIndex(t => t._id === taskId);
  if (taskIndex < 0) return;

  const taskTitle = cat.tasks[taskIndex].title;
  if (!confirm(`Delete task "${taskTitle}"?`)) return;

  // 1. Update UI and Local DB instantly
  const removed = cat.tasks.splice(taskIndex, 1)[0];
  updateProgressBar(dayId, day.categories);
  await window.localDb.days.put(day);

  // 2. Queue for sync
  syncManager.addToQueue('PUT', 'days', dayId, { categories: day.categories });

  const cardEl = document.getElementById(`day-card-${dayId}`);
  if (cardEl) cardEl.replaceWith(buildDayCard(day));
  showToast('Task deleted locally', 'success');
}

function updateProgressBar(dayId, categories) {
  const pct  = calcProgress(categories);
  const fill = document.getElementById(`pct-fill-${dayId}`);
  const text = document.getElementById(`pct-text-${dayId}`);
  if (fill) {
    if (window.gsap) {
      gsap.to(fill, { width: `${pct}%`, duration: 0.5, ease: 'power2.out' });
    } else {
      fill.style.width = `${pct}%`;
    }
    fill.className = `progress-fill ${progressClass(pct)}`;
  }
  if (text) {
    text.textContent = `${pct}%`;
    text.style.color  = progressColor(pct);
    if (window.gsap) gsap.fromTo(text, { scale: 1.15 }, { scale: 1, duration: 0.25, ease: 'back.out(2)' });
  }
}

function toggleSummary(dayId) {
  const toggle  = document.getElementById(`summary-toggle-${dayId}`);
  const content = document.getElementById(`summary-content-${dayId}`);
  toggle.classList.toggle('expanded');
  content.classList.toggle('expanded');
}

async function saveSummary(dayId) {
  const textarea = document.getElementById(`summary-edit-${dayId}`);
  if (!textarea) return;
  const summary = textarea.value.trim();
  const day = allDays.find(d => d._id === dayId);
  if (day) day.summary = summary;

  try {
    // 1. Update Local
    await window.localDb.days.put(day);
    // 2. Queue Sync
    syncManager.addToQueue('PUT', 'days', dayId, { summary });
    showToast('Notes saved locally!', 'success');
  } catch (err) {
    console.error('Offline save error:', err);
  }
}

/* ============================================================
   BADGE LOGIC (User Side)
   ============================================================ */
let userClaimedBadges = [];
let allAvailableBadges = [];

async function loadClaimedBadges() {
  // 1. STALE: Load from cache
  try {
    const cached = await window.localDb.badges.toArray();
    if (cached.length > 0) {
      userClaimedBadges = cached;
      renderClaimedBadges();
    }
  } catch (e) {}

  // 2. REVALIDATE: Fetch fresh (Only if online)
  if (!navigator.onLine) return;

  try {
    const badges = await apiFetch(`${API}/api/users/badges/claimed`);
    if (badges) {
      userClaimedBadges = badges;
      // Cache for next time
      await window.localDb.badges.clear();
      await window.localDb.badges.bulkAdd(badges);
      renderClaimedBadges();
    }
  } catch (err) {
    console.warn('Background badges refresh failed:', err);
  }
}

function renderClaimedBadges() {
  const container = document.getElementById('claimed-badges-container');
  const noMsg = document.getElementById('no-badges-msg');
  if (!container) return;

  container.innerHTML = '';
  if (userClaimedBadges.length === 0) {
    if (noMsg) noMsg.style.display = 'block';
    return;
  }

  if (noMsg) noMsg.style.display = 'none';

  userClaimedBadges.forEach(b => {
    const badgeEl = document.createElement('div');
    badgeEl.style.cssText = `
      width: 60px; 
      height: 60px; 
      border: 2px solid var(--black); 
      background: var(--bg-card); 
      border-radius: 8px; 
      box-shadow: 3px 3px 0 var(--black); 
      overflow: hidden; 
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    badgeEl.title = `${b.name} (${b.requiredDays} Days)`;
    badgeEl.innerHTML = `<img src="${b.image}" style="width: 100%; height: 100%; object-fit: contain;">`;
    
    badgeEl.onclick = () => {
      openLightbox(b.image);
      showToast(`<strong>${b.name}</strong><br>${b.requiredDays} Day Streak Badge`, 'info');
    };

    container.appendChild(badgeEl);
  });
}

async function openBadgesModal() {
  openModal('modal-badges');
  await loadAllBadges();
}

async function loadAllBadges() {
  const grid = document.getElementById('all-badges-grid');
  grid.innerHTML = '<p style="text-align:center; grid-column: 1/-1;">Loading available badges...</p>';
  
  try {
    const badges = await apiFetch(`${API}/api/users/badges/all`);
    allAvailableBadges = badges;
    renderAllBadges();
  } catch (err) {
    console.error('Error loading all badges:', err);
    grid.innerHTML = '<p style="text-align:center; color: red; grid-column: 1/-1;">Failed to load badges.</p>';
  }
}

function renderAllBadges() {
  const grid = document.getElementById('all-badges-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const highestStreak = backendStreak; // Using backendStreak which is synced

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  allAvailableBadges.forEach(b => {
    const isClaimed = userClaimedBadges.some(cb => cb._id === b._id);
    const isEligible = highestStreak >= b.requiredDays;
    
    // Theme-aware backgrounds
    const cardBg = isClaimed 
      ? (isDark ? 'rgba(34, 197, 94, 0.15)' : '#f0fdf4') 
      : (isEligible ? 'var(--bg-card)' : (isDark ? 'rgba(255,255,255,0.05)' : '#f9fafb'));
    const borderCol = isClaimed ? (isDark ? '#22c55e' : 'var(--black)') : 'var(--black)';

    const card = document.createElement('div');
    card.style.cssText = `
      padding: 16px; 
      border: 3px solid ${borderCol}; 
      background: ${cardBg}; 
      border-radius: 12px; 
      box-shadow: 4px 4px 0 var(--black); 
      display: flex; 
      flex-direction: column; 
      align-items: center; 
      text-align: center;
      transition: all 0.2s;
    `;

    card.innerHTML = `
      <div style="width: 80px; height: 80px; border: 2px solid var(--black); border-radius: 8px; overflow: hidden; background: var(--bg-input); margin-bottom: 12px; box-shadow: 2px 2px 0 var(--black); cursor: pointer;" onclick="openLightbox('${b.image}')">
        <img src="${b.image}" style="width: 100%; height: 100%; object-fit: contain;">
      </div>
      <h4 style="font-size: 14px; font-weight: 800; margin-bottom: 4px; line-height: 1.2; color: var(--text);">${b.name}</h4>
      <div style="font-size: 11px; font-weight: 900; color: var(--text-muted); margin-bottom: 15px;">${b.requiredDays} DAYS STREAK</div>
      
      ${isClaimed ? `
        <div style="background: #22c55e; color: #fff; padding: 6px 12px; border-radius: 6px; border: 2px solid #000; font-size: 11px; font-weight: 900; text-transform: uppercase;">
          <i data-lucide="check"></i> Claimed
        </div>
      ` : (isEligible ? `
        <button class="btn-primary ripple" style="padding: 6px 16px; font-size: 12px; background: #a855f7; width: 100%; justify-content: center; box-shadow: 2px 2px 0 #000;" onclick="claimBadge('${b._id}')">
          Claim Now
        </button>
      ` : `
        <div style="background: #94a3b8; color: #fff; padding: 6px 12px; border-radius: 6px; border: 2px solid #000; font-size: 11px; font-weight: 900; text-transform: uppercase;">
          Locked
        </div>
      `)}
    `;

    grid.appendChild(card);
  });

  if (window.lucide) lucide.createIcons({ root: grid });
}

async function claimBadge(badgeId) {
  try {
    const res = await apiFetch(`${API}/api/users/badges/claim/${badgeId}`, {
      method: 'POST'
    });
    
    if (res.message) {
      showToast(res.message, 'success');
      // Refresh both lists
      await loadClaimedBadges();
      renderAllBadges();
      
      // Success animation on the profile section
      if (window.gsap) {
        gsap.from('#claimed-badges-container', { scale: 0.9, duration: 0.5, ease: 'back.out' });
      }
    }
  } catch (err) {
    showToast(err.message || 'Failed to claim badge', 'error');
  }
}

// ── Add Day Modal ──────────────────────────────────────────
let categoryCount = 0;

function openAddDayModal() {
  document.getElementById('day-date-input').value    = todayStr();
  document.getElementById('day-summary-input').value = '';
  document.getElementById('categories-builder').innerHTML = '';
  categoryCount = 0;
  addCategoryField();
  openModal('modal-add-day');
}

function addCategoryField() {
  const idx = categoryCount++;
  const builder = document.getElementById('categories-builder');
  const item = document.createElement('div');
  item.className = 'category-builder-item';
  item.id = `cat-build-${idx}`;
  item.innerHTML = `
    <div class="cat-top-row">
      <input type="text" class="form-control" placeholder="Category name (e.g. Work, Fitness...)" id="cat-name-${idx}" />
      <button class="btn-remove" onclick="removeCategoryField(${idx})" title="Remove"><i data-lucide="trash-2"></i></button>
    </div>
    <div class="tasks-builder" id="tasks-build-${idx}"></div>
    <button class="btn-ghost ripple" style="font-size:12px;padding:6px 12px;border-radius:8px;" onclick="addTaskField(${idx})"><i data-lucide="plus"></i> Add Task</button>
  `;
  builder.appendChild(item);
  if (window.lucide) lucide.createIcons({ root: item });
  addTaskField(idx);
}

function removeCategoryField(idx) {
  const el = document.getElementById(`cat-build-${idx}`);
  if (!el) return;
  if (window.gsap) {
    gsap.to(el, { opacity: 0, height: 0, marginBottom: 0, duration: 0.2, ease: 'power2.in', onComplete: () => el.remove() });
  } else {
    el.remove();
  }
}

function addTaskField(catIdx) {
  const builder = document.getElementById(`tasks-build-${catIdx}`);
  const row = document.createElement('div');
  row.className = 'task-input-row';
  row.innerHTML = `
    <input type="text" class="form-control" placeholder="Task title..." />
    <button class="btn-remove" onclick="this.parentElement.remove()" title="Remove"><i data-lucide="trash-2"></i></button>
  `;
  builder.appendChild(row);
  if (window.lucide) lucide.createIcons({ root: row });
}

async function submitAddDay() {
  const date    = document.getElementById('day-date-input').value.trim();
  const summary = document.getElementById('day-summary-input').value.trim();
  if (!date) { showToast('Please select a date.', 'warn'); return; }

  const btn = document.getElementById('submit-day-btn');
  btn.disabled = true;
  btn.textContent = 'Checking...';

  // ── Duplicity Guard: Bulletproof Normalized Check ──
  try {
    if (window.localDb) {
      const allLocal = await window.localDb.days.toArray();
      const normalizedInput = date.split('T')[0];
      
      const duplicate = allLocal.find(d => {
        const dDate = (d.date || "").split('T')[0];
        return dDate === normalizedInput;
      });

      if (duplicate) {
        showToast(`A card for ${formatDisplayDate(normalizedInput)} already exists!`, 'warn');
        btn.disabled = false;
        btn.textContent = 'Create Card';
        return;
      }
    }

    // Secondary Check: In-memory state
    const existsInMem = allDays.find(d => (d.date || "").split('T')[0] === date.split('T')[0]);
    if (existsInMem) {
      showToast(`A card for this date is already on your screen!`, 'warn');
      btn.disabled = false;
      btn.textContent = 'Create Card';
      return;
    }
  } catch (err) { console.error('Validation error:', err); }

  const catItems = document.querySelectorAll('.category-builder-item');
  const categories = [];
  for (const item of catItems) {
    const nameInput = item.querySelector('input[type="text"]');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) continue;
    const taskInputs = item.querySelectorAll('.task-input-row input');
    const tasks = [];
    for (const inp of taskInputs) {
      const title = inp.value.trim();
      if (title) tasks.push({ title, completed: false });
    }
    if (tasks.length) categories.push({ name, tasks });
  }

  btn.textContent = 'Creating...';
  const tempId = `temp_${Date.now()}`;
  const localDay = { _id: tempId, date, categories, summary, userId: localStorage.getItem('userId'), tasks: [] };

  try {
    // 1. Update UI and Local DB instantly (Optimistic)
    allDays.push(localDay);
    await window.localDb.days.add(localDay);
    closeModal('modal-add-day');
    renderDays();

    // 2. Queue for sync
    syncManager.addToQueue('POST', 'days', null, { date, categories, summary }, tempId);

    // Reset button
    btn.disabled = false;
    btn.textContent = 'Create Card';
    
    // UI Animation for mobile
    if (isMobile()) {
      const container = document.getElementById('cards-container');
      const emptyState = container.querySelector('.empty-state');
      if (emptyState) emptyState.remove();

      const newCard = buildDayCard(localDay);
      newCard.style.opacity = '0';
      const addRow = container.querySelector('.add-day-inline-row');
      if (addRow && addRow.nextSibling) {
        container.insertBefore(newCard, addRow.nextSibling);
      } else {
        container.appendChild(newCard);
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          newCard.style.transition = 'opacity 0.25s ease';
          newCard.style.opacity = '1';
          setTimeout(() => { newCard.style.transition = ''; newCard.style.opacity = ''; }, 300);
        });
      });
    }
    showToast('Day card created!', 'success');
  } catch (err) {
    console.error('Failed to create card:', err);
    showToast('Failed to create card locally.', 'error');
    btn.disabled = false;
    btn.textContent = 'Create Card';
  }
}
// ── Add Category to existing day ───────────────────────────
function openAddCategoryModal(dayId) {
  activeDayIdForCategory = dayId;
  document.getElementById('new-cat-name').value = '';
  document.getElementById('new-cat-tasks-builder').innerHTML = '';
  addNewCatTaskField();
  openModal('modal-add-category');
}

function addNewCatTaskField() {
  const builder = document.getElementById('new-cat-tasks-builder');
  const row = document.createElement('div');
  row.className = 'task-input-row';
  row.innerHTML = `
    <input type="text" class="form-control" placeholder="Task title..." />
    <button class="btn-remove" onclick="this.parentElement.remove()" title="Remove"><i data-lucide="trash-2"></i></button>
  `;
  builder.appendChild(row);
  if (window.lucide) lucide.createIcons({ root: row });
}

async function submitAddCategory() {
  const dayId   = activeDayIdForCategory;
  const catName = document.getElementById('new-cat-name').value.trim();
  if (!catName) { showToast('Category name is required.', 'warn'); return; }

  const taskInputs = document.querySelectorAll('#new-cat-tasks-builder .task-input-row input');
  const tasks = [];
  for (const inp of taskInputs) {
    const title = inp.value.trim();
    if (title) tasks.push({ title, completed: false });
  }

  const btn = document.getElementById('submit-cat-btn');
  btn.disabled = true; btn.textContent = 'Adding...';

  const day = allDays.find(d => d._id === dayId);
  if (!day) return;
  // Give temp IDs to the new category and tasks for local UI
  const tempCatId = `temp_cat_${Date.now()}`;
  const updatedCategories = [...day.categories, { _id: tempCatId, name: catName, tasks: tasks.map(t => ({...t, _id: `temp_task_${Math.random()}`})) }];
  day.categories = updatedCategories;

  try {
    // 1. Update Local
    await window.localDb.days.put(day);
    // 2. Queue Sync
    syncManager.addToQueue('PUT', 'days', dayId, { categories: updatedCategories });

    closeModal('modal-add-category');
    const oldCard = document.getElementById(`day-card-${dayId}`);
    if (oldCard) {
      const newCard = buildDayCard(day);
      if (window.gsap) gsap.set(newCard, { opacity: 0, y: 10 });
      oldCard.replaceWith(newCard);
      if (window.gsap) gsap.to(newCard, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', clearProps: 'all' });
      requestAnimationFrame(() => requestAnimationFrame(() => animateProgressBar(`pct-fill-${dayId}`, calcProgress(day.categories))));
    }
    showToast('Category added locally!', 'success');
  } catch (err) {
    console.error('Offline category add error:', err);
  } finally {
    btn.disabled = false; btn.textContent = 'Add Category';
  }
}

// ── Edit Category (today's card only) ────────────────────
function openEditCategoryModal(dayId, catId) {
  const day = allDays.find(d => d._id === dayId);
  if (!day || day.date !== todayStr()) {
    showToast('You can only edit today\'s card.', 'warn');
    return;
  }
  const cat = day.categories.find(c => c._id === catId);
  if (!cat) return;

  editingDayId = dayId;
  editingCatId = catId;

  document.getElementById('edit-cat-name').value = cat.name;
  const builder = document.getElementById('edit-cat-tasks-builder');
  builder.innerHTML = '';
  for (const task of cat.tasks) {
    addEditCatTaskField(task.title, task._id, task.completed);
  }
  if (!cat.tasks.length) addEditCatTaskField();
  openModal('modal-edit-category');
}

function addEditCatTaskField(title = '', taskId = '', completed = false) {
  const builder = document.getElementById('edit-cat-tasks-builder');
  const row = document.createElement('div');
  row.className = 'task-input-row';
  row.dataset.taskId   = taskId;
  row.dataset.completed = completed ? 'true' : 'false';
  row.innerHTML = `
    <input type="text" class="form-control" placeholder="Task title..." value="${escHtml(title)}" />
    <button class="btn-remove" onclick="this.parentElement.remove()" title="Remove"><i data-lucide="trash-2"></i></button>
  `;
  builder.appendChild(row);
  if (window.lucide) lucide.createIcons({ root: row });
}

async function submitEditCategory() {
  const dayId   = editingDayId;
  const catId   = editingCatId;
  const catName = document.getElementById('edit-cat-name').value.trim();
  if (!catName) { showToast('Category name is required.', 'warn'); return; }

  const day = allDays.find(d => d._id === dayId);
  if (!day) return;
  const origCat = day.categories.find(c => c._id === catId);

  const taskRows = document.querySelectorAll('#edit-cat-tasks-builder .task-input-row');
  const tasks = [];
  for (const row of taskRows) {
    const title = row.querySelector('input').value.trim();
    if (!title) continue;
    const tId = row.dataset.taskId;
    const existing = origCat ? origCat.tasks.find(t => t._id === tId) : null;
    tasks.push({ _id: tId || `temp_task_${Math.random()}`, title, completed: existing ? existing.completed : false });
  }

  day.categories = day.categories.map(cat =>
    String(cat._id) === String(catId) ? { ...cat, name: catName, tasks } : cat
  );

  const btn = document.getElementById('submit-edit-cat-btn');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    // 1. Update Local
    await window.localDb.days.put(day);
    // 2. Queue Sync
    syncManager.addToQueue('PUT', 'days', dayId, { categories: day.categories });

    closeModal('modal-edit-category');
    const oldCard = document.getElementById(`day-card-${dayId}`);
    if (oldCard) {
      const newCard = buildDayCard(day);
      oldCard.replaceWith(newCard);
      requestAnimationFrame(() => requestAnimationFrame(() => animateProgressBar(`pct-fill-${dayId}`, calcProgress(day.categories))));
    }
    showToast('Category updated locally!', 'success');
  } catch (err) {
    console.error('Offline category edit error:', err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
  }
}

// ── Edit Goal (before deadline only) ──────────────────────
function openEditGoalModal(goalId) {
  const goal = allGoals.find(g => g._id === goalId);
  if (!goal || daysLeft(goal.deadline) < 0) {
    showToast('This goal is overdue and can no longer be edited.', 'warn');
    return;
  }

  editingGoalId = goalId;
  document.getElementById('edit-goal-title').value = goal.title;
  document.getElementById('edit-goal-deadline-display').innerHTML =
    `<i data-lucide="calendar"></i> Deadline: ${formatDisplayDate(goal.deadline.split('T')[0])}`;
  if (window.lucide) lucide.createIcons({ root: document.getElementById('edit-goal-deadline-display') });

  const builder = document.getElementById('edit-goal-tasks-builder');
  builder.innerHTML = '';
  for (const task of goal.tasks) {
    addEditGoalTaskField(task.title, task._id, task.completed);
  }
  if (!goal.tasks.length) addEditGoalTaskField();
  openModal('modal-edit-goal');
}

function addEditGoalTaskField(title = '', taskId = '', completed = false) {
  const builder = document.getElementById('edit-goal-tasks-builder');
  const row = document.createElement('div');
  row.className = 'task-input-row';
  row.dataset.taskId    = taskId;
  row.dataset.completed = completed ? 'true' : 'false';
  row.innerHTML = `
    <input type="text" class="form-control" placeholder="Subtask title..." value="${escHtml(title)}" />
    <button class="btn-remove" onclick="this.parentElement.remove()" title="Remove"><i data-lucide="trash-2"></i></button>
  `;
  builder.appendChild(row);
  if (window.lucide) lucide.createIcons({ root: row });
}

async function submitEditGoal() {
  const goalId = editingGoalId;
  const title  = document.getElementById('edit-goal-title').value.trim();
  if (!title) { showToast('Goal title is required.', 'warn'); return; }

  const goal = allGoals.find(g => g._id === goalId);
  if (!goal) return;

  const taskRows = document.querySelectorAll('#edit-goal-tasks-builder .task-input-row');
  const newTasks = [];
  for (const row of taskRows) {
    const t = row.querySelector('input').value.trim();
    if (!t) continue;
    const tId  = row.dataset.taskId;
    const existing = goal.tasks.find(tk => tk._id === tId);
    newTasks.push({ ...(tId ? { _id: tId } : {}), title: t, completed: existing ? existing.completed : false });
  }

  const btn = document.getElementById('submit-edit-goal-btn');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    const updated = await apiFetch(`${API}/api/goals/${goalId}`, {
      method: 'PUT',
      body: JSON.stringify({ title, tasks: newTasks }),
    });
    const idx = allGoals.findIndex(g => g._id === goalId);
    if (idx !== -1) allGoals[idx] = updated;
    closeModal('modal-edit-goal');
    const oldCard = document.getElementById(`goal-card-${goalId}`);
    if (oldCard) {
      const newCard = buildGoalCard(updated);
      if (window.gsap) gsap.set(newCard, { opacity: 0, y: 10 });
      oldCard.replaceWith(newCard);
      if (window.gsap) gsap.to(newCard, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', clearProps: 'all' });
      requestAnimationFrame(() => requestAnimationFrame(() => animateProgressBar(`gpct-fill-${goalId}`, calcProgress([{ tasks: updated.tasks }]))));
    }
    showToast('Goal updated!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Changes';
  }
}

// ── Goals ──────────────────────────────────────────────────
let _lastGoalsLoad = 0;
async function loadGoals() {
  const localDb = window.localDb;
  if (!localDb) return;
  const container = document.getElementById('goals-container');

  // 1. STALE: Load from IndexedDB
  try {
    const cached = await localDb.goals.toArray();
    if (cached.length > 0) {
      allGoals = cached;
      renderGoals();
    } else {
      container.innerHTML = `
        <div style="text-align:center; padding:40px; color:var(--text-muted);">
          <p style="font-weight:700; margin-bottom:10px;">No local data found.</p>
          <p style="font-size:12px;">Syncing with server...</p>
          <div class="loading-spinner" style="margin:20px auto; transform:scale(0.8);"><div class="spinner-ring"></div></div>
        </div>`;
    }
  } catch (err) {
    console.warn('Dexie read error:', err);
  }

  // 2. REVALIDATE: Load from Server (Throttled & Only if online)
  const now = Date.now();
  if (now - _lastGoalsLoad < 30000 && allGoals.length > 0) {
    return; // Don't re-fetch if loaded in last 30s
  }

  if (!navigator.onLine) {
    if (allGoals.length > 0) {
      showToast('Offline Mode: Using cached goals.', 'info');
    } else {
      container.innerHTML = `
        <div style="text-align:center; padding:40px; color:var(--text-muted);">
          <i data-lucide="wifi-off" style="width:48px;height:48px;margin-bottom:16px;opacity:0.5;"></i>
          <p style="font-weight:700; margin-bottom:10px;">Offline Mode</p>
          <p style="font-size:12px;">No cached goals found. Connect to sync.</p>
        </div>`;
      if (window.lucide) lucide.createIcons({ root: container });
    }
    return;
  }
  _lastGoalsLoad = now;

  try {
    const data = await apiFetch(`${API}/api/goals`);
    if (data) {
      allGoals = data;
      // Sync Local Cache
      await localDb.goals.clear();
      await localDb.goals.bulkAdd(allGoals);
      renderGoals();
    }
  } catch (err) {
    console.warn('Background goal refresh failed:', err);
    // If we have cached data, we stay silent or show a small toast
    if (allGoals.length === 0) {
      let errorMessage = '<i data-lucide="alert-triangle"></i> Failed to load goals.';
      if (err.message && err.message.includes('timed out')) {
        errorMessage = '<i data-lucide="clock"></i> Server unreachable. Using offline mode.';
      }
      container.innerHTML = `<p style="color:#ef4444;text-align:center">${errorMessage}</p>`;
    }
  }
}

function renderGoals() {
  const container = document.getElementById('goals-container');
  container.innerHTML = '';

  if (!allGoals.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon"><i data-lucide="target"></i></span>
        <h3>No goals yet</h3>
        <p>Set a long-term goal to stay focused on what matters.</p>
      </div>`;
    if (window.lucide) lucide.createIcons({ root: container });
    if (window.gsap) gsap.from('.empty-state', { opacity: 0, y: 20, duration: 0.5, ease: 'power2.out' });
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const goal of allGoals) fragment.appendChild(buildGoalCard(goal));
  container.appendChild(fragment);

  if (window.gsap) {
    gsap.from('.goal-card', { opacity: 0, y: 30, duration: 0.5, stagger: 0.09, ease: 'power3.out', clearProps: 'all' });
  }

  // Animate progress bars after insert
  for (const goal of allGoals) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      animateProgressBar(`gpct-fill-${goal._id}`, calcProgress([{ tasks: goal.tasks }]));
    }));
  }
}

function buildGoalCard(goal) {
  const pct        = calcProgress([{ tasks: goal.tasks }]);
  const dl         = daysLeft(goal.deadline);
  const isComplete = pct === 100;

  // ── Badge logic ──
  let dlClass, dlText;
  if (isComplete) {
    dlClass = 'days-completed';
    // Use the deadline date as a proxy for "completed by" date
    // (we don't have a separate completedAt field)
    dlText  = '✅ Completed!';
  } else if (dl < 0) {
    dlClass = 'days-overdue';
    dlText  = `<i data-lucide="alert-triangle"></i> Overdue by ${Math.abs(dl)}d`;
  } else if (dl <= 2) {
    dlClass = 'days-danger';
    dlText  = `<i data-lucide="alert-circle"></i> ${dl}d left!`;
  } else if (dl <= 5) {
    dlClass = 'days-warn';
    dlText  = `<i data-lucide="clock"></i> ${dl} days left`;
  } else {
    dlClass = 'days-safe';
    dlText  = `${dl} days left`;
  }

  const card = document.createElement('div');
  card.className = isComplete ? 'goal-card goal-completed' : 'goal-card';
  card.id = `goal-card-${goal._id}`;

  let tasksHTML = '';
  for (const task of goal.tasks) {
    const doneStyle = task.completed ? 'text-decoration:line-through;color:var(--lt-green);' : '';
    // Completed goals: checkboxes are locked (read-only)
    const checkboxAttrs = isComplete
      ? `checked disabled`
      : `${task.completed ? 'checked' : ''} onchange="toggleGoalTask('${goal._id}','${task._id}',this.checked)"`;
    tasksHTML += `
      <div class="task-item">
        <input type="checkbox" class="task-checkbox"
          ${checkboxAttrs}
          id="gtask-${task._id}" />
        <label class="task-title" for="gtask-${task._id}" style="${doneStyle}">${escHtml(task.title)}</label>
      </div>`;
  }

  // Show actions only when not completed
  const actionsHTML = isComplete ? '' : `
    <div class="goal-actions">
      ${dl >= 0 ? `<button class="btn-ghost ripple" onclick="openEditGoalModal('${goal._id}')" style="padding:7px 14px;font-size:13px;"><i data-lucide="edit-3"></i> Edit</button>` : ''}
      <button class="btn-delete ripple" onclick="deleteGoal('${goal._id}')"><i data-lucide="trash-2"></i> Delete</button>
    </div>`;

  card.innerHTML = `
    <div class="goal-header">
      <span class="goal-title">${escHtml(goal.title)}</span>
      <div class="goal-meta">
        <span class="days-left-badge ${dlClass}">${dlText}</span>
        <span class="goal-deadline"><i data-lucide="calendar"></i> ${formatDisplayDate(goal.deadline.split('T')[0])}</span>
      </div>
    </div>

    <div class="progress-section">
      <div class="progress-meta">
        <span class="progress-label">Progress</span>
        <span class="progress-pct" id="gpct-text-${goal._id}" style="color:${progressColor(pct)}">${pct}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill ${progressClass(pct)}" id="gpct-fill-${goal._id}" style="width:0%"></div>
      </div>
    </div>

    <div class="categories-list">
      <div class="category-block">
        <div class="category-header">
          <span class="category-name">Subtasks</span>
          <span class="category-count">${goal.tasks.filter(t=>t.completed).length}/${goal.tasks.length}</span>
        </div>
        <div class="tasks-list" id="goal-tasks-list-${goal._id}">
          ${tasksHTML || '<p style="padding:8px 14px;font-size:13px;color:var(--text-3)">No subtasks</p>'}
        </div>
      </div>
    </div>

    ${actionsHTML}
  `;

  // Initialize Lucide icons after building the goal card
  if (window.lucide) {
    setTimeout(() => {
      lucide.createIcons({ root: card });
    }, 10);
  }

  return card;
}

async function toggleGoalTask(goalId, taskId, checked) {
  const goal = allGoals.find(g => g._id === goalId);
  if (!goal) return;
  const task = goal.tasks.find(t => t._id === taskId);
  if (!task) return;

  task.completed = checked;
  updateGoalProgressBar(goalId, goal.tasks);

  const label = document.querySelector(`label[for="gtask-${taskId}"]`);
  if (label) {
    label.style.textDecoration = checked ? 'line-through' : 'none';
    label.style.color = checked ? 'var(--lt-green)' : '';
  }

  if (window.gsap && checked) {
    const chk = document.getElementById(`gtask-${taskId}`);
    if (chk) gsap.fromTo(chk, { scale: 1.35 }, { scale: 1, duration: 0.3, ease: 'back.out(2)' });
  }

  try {
    // 1. Update Local
    await window.localDb.goals.put(goal);
    // 2. Queue Sync
    syncManager.addToQueue('PUT', 'goals', goalId, { tasks: goal.tasks });

    // If now 100% complete, re-render the card to apply green theme
    const pct = calcProgress([{ tasks: goal.tasks }]);
    if (pct === 100) {
      const oldCard = document.getElementById(`goal-card-${goalId}`);
      if (oldCard) {
        const newCard = buildGoalCard(goal);
        if (window.gsap) gsap.set(newCard, { opacity: 0, scale: 0.97 });
        oldCard.replaceWith(newCard);
        if (window.gsap) gsap.to(newCard, { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(1.5)', clearProps: 'all' });
        requestAnimationFrame(() => requestAnimationFrame(() => animateProgressBar(`gpct-fill-${goalId}`, 100)));
        showToast('🎉 Goal completed! Amazing work!', 'success');
      }
    }
  } catch (err) {
    console.error('Offline goal write error:', err);
  }
}

function updateGoalProgressBar(goalId, tasks) {
  const pct  = calcProgress([{ tasks }]);
  const fill = document.getElementById(`gpct-fill-${goalId}`);
  const text = document.getElementById(`gpct-text-${goalId}`);
  if (fill) {
    if (window.gsap) gsap.to(fill, { width: `${pct}%`, duration: 0.5, ease: 'power2.out' });
    else fill.style.width = `${pct}%`;
    fill.className = `progress-fill ${progressClass(pct)}`;
  }
  if (text) {
    text.textContent = `${pct}%`;
    text.style.color  = progressColor(pct);
    if (window.gsap) gsap.fromTo(text, { scale: 1.15 }, { scale: 1, duration: 0.25, ease: 'back.out(2)' });
  }
}

async function deleteGoal(goalId) {
  if (!confirm('Delete this goal? This cannot be undone.')) return;
  try {
    // 1. Update UI and Local DB instantly
    allGoals = allGoals.filter(g => g._id !== goalId);
    await window.localDb.goals.delete(goalId);

    const card = document.getElementById(`goal-card-${goalId}`);
    if (card) {
      if (window.gsap) {
        gsap.to(card, { opacity: 0, y: -10, scale: 0.95, duration: 0.3, ease: 'power2.in', onComplete: () => { card.remove(); if (!allGoals.length) renderGoals(); } });
      } else {
        card.remove();
        if (!allGoals.length) renderGoals();
      }
    }
    showToast('Goal deleted locally.', 'info');

    // 2. Queue for sync
    syncManager.addToQueue('DELETE', 'goals', goalId);
  } catch (err) {
    console.error('Offline delete error:', err);
    showToast('Failed to delete goal locally.', 'error');
  }
}

// ── Add Goal Modal ─────────────────────────────────────────
function openAddGoalModal() {
  document.getElementById('goal-title-input').value    = '';
  document.getElementById('goal-deadline-input').value = '';
  document.getElementById('goal-tasks-builder').innerHTML = '';
  addGoalTaskField();
  openModal('modal-add-goal');
}

function addGoalTaskField() {
  const builder = document.getElementById('goal-tasks-builder');
  const row = document.createElement('div');
  row.className = 'task-input-row';
  row.innerHTML = `
    <input type="text" class="form-control" placeholder="Subtask title..." />
    <button class="btn-remove" onclick="this.parentElement.remove()" title="Remove"><i data-lucide="trash-2"></i></button>
  `;
  builder.appendChild(row);
  if (window.lucide) lucide.createIcons({ root: row });
}

async function submitAddGoal() {
  const title    = document.getElementById('goal-title-input').value.trim();
  const deadline = document.getElementById('goal-deadline-input').value.trim();
  if (!title)    { showToast('Goal title is required.', 'warn'); return; }
  if (!deadline) { showToast('Deadline is required.', 'warn'); return; }

  const taskInputs = document.querySelectorAll('#goal-tasks-builder .task-input-row input');
  const tasks = [];
  for (const inp of taskInputs) {
    const t = inp.value.trim();
    if (t) tasks.push({ title: t, completed: false });
  }

  const btn = document.getElementById('submit-goal-btn');
  btn.disabled = true; btn.textContent = 'Creating...';

  const tempId = `temp_${Date.now()}`;
  const localGoal = { _id: tempId, title, deadline, tasks, userId, status: 'active', createdAt: new Date().toISOString() };

  try {
    // 1. Update UI and Local DB instantly
    allGoals.push(localGoal);
    allGoals.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    await window.localDb.goals.add(localGoal);
    closeModal('modal-add-goal');
    renderGoals();
    showToast('Goal created locally!', 'success');

    // 2. Queue for sync
    syncManager.addToQueue('POST', 'goals', null, { title, deadline, tasks }, tempId);
  } catch (err) {
    console.error('Offline write error:', err);
  } finally {
    btn.disabled = false; btn.textContent = 'Create Goal';
  }
}

// ══════════════════════════════════════════════════════════
//  GROUPS
// ══════════════════════════════════════════════════════════

let allGroups = [];

let allJoinedGroups = [];
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
      allJoinedGroups = cached;
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
    if (allJoinedGroups.length > 0) showToast('Offline: Using cached groups.', 'info');
    return;
  }

  try {
    const [joined, public] = await Promise.all([
      apiFetch(`${API}/api/groups/mine`),
      apiFetch(`${API}/api/groups/public`)
    ]);
    
    if (joined && public) {
      allJoinedGroups = joined;
      availablePublicGroups = public;

      // Sync Local Cache
      await localDb.groups.clear();
      await localDb.groups.bulkAdd(allJoinedGroups);

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
  const myPrivateTeams = allJoinedGroups.filter(g => !g.isPublic && String(g.owner._id || g.owner) === String(userId));
  // 2. Joined Private Groups (owned by others)
  const joinedPrivate = allJoinedGroups.filter(g => !g.isPublic && String(g.owner._id || g.owner) !== String(userId));
  // 3. Joined Public Groups
  const joinedPublic = allJoinedGroups.filter(g => g.isPublic);

  // ── Section 1: My Private Teams ─────────────────────────
  renderGroupSection(container, '<i data-lucide="crown"></i> My Private Teams', myPrivateTeams, true, 'lock', 'You haven\'t created any private teams yet.');

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
        <p>You haven't joined any private teams yet.</p>
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
  renderGroupSection(container, '<i data-lucide="globe"></i> Joined Public Groups', joinedPublic, false, 'globe', 'You haven\'t joined any public groups yet.');

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
  const userId = localStorage.getItem('userId');
  const isMyOwned = String(group.owner._id || group.owner) === String(userId);
  const isPublic = group.isPublic;
  
  const iconHtml = group.icon 
    ? `<img src="${group.icon}" onerror="this.onerror=null; this.src='/checklist.png'; this.style.padding='8px'; this.style.background='var(--yellow)';" style="width:40px;height:40px;border-radius:50%;border:2px solid var(--black);object-fit:cover;box-shadow:2px 2px 0 var(--black);cursor:pointer;" onclick="openLightbox(this.src)" />`
    : `<span class="group-emoji"><i data-lucide="${emoji}"></i></span>`;

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
      
      <!-- Live Chat Button -->
      <div style="margin: 12px 0;">
        <button class="btn-primary ripple" style="width: 100%; justify-content: center; background: var(--pink); border-radius: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 4px 4px 0 var(--black);" onclick="openGroupChat('${group._id}', '${escJs(group.name)}', '${group.icon || ''}')">
          <i data-lucide="message-square" style="width: 18px; height: 18px;"></i> Live Chat
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
    const requests = await apiFetch(`${API}/api/groups/${groupId}/requests`);
    
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
    const res = await apiFetch(`${API}/api/groups/${groupId}/requests/${targetUserId}`, {
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
    const res = await apiFetch(`${API}/api/groups/${groupId}/requests`, {
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
    const data = await apiFetch(`${API}/api/groups/${groupId}/members?page=${groupMembersState[groupId].page}&limit=${groupMembersState[groupId].limit}`);
    const row = document.getElementById(`members-row-${groupId}`);
    
    // Check if we are the owner to show remove buttons
    const group = allJoinedGroups.find(g => g._id === groupId);
    const isOwner = group && String(group.owner._id || group.owner) === String(userId);
    
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
    const res = await apiFetch(`${API}/api/groups/${groupId}/join-public`, { 
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
    const isSelf     = String(memberId) === String(userId);
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

  const btn = document.getElementById('submit-create-group-btn');
  const originalText = btn.textContent;
  btn.disabled = true; btn.textContent = 'Creating...';

  try {
    const group = await apiFetch(`${API}/api/groups/create`, {
      method: 'POST',
      body: JSON.stringify({ userId, name, isPublic, description, icon }),
    });
    closeModal('modal-create-group');
    if (isPublic) {
      showToast(`Public Group "${group.name}" created!`, 'success');
    } else {
      showToast(`Team "${group.name}" created! Code: ${group.code}`, 'success');
    }
    loadGroups(); // refresh
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = originalText;
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
    const group = await apiFetch(`${API}/api/groups/join`, {
      method: 'POST',
      body: JSON.stringify({ userId, code }),
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
    await apiFetch(`${API}/api/groups/${editingGroupId}`, {
      method: 'PUT',
      body: JSON.stringify({ userId, name, description, icon }),
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
    allJoinedGroups = allJoinedGroups.filter(g => g._id !== groupId);
    await window.localDb.groups.delete(groupId);
    renderGroups();

    // 2. Queue for sync
    syncManager.addToQueue('DELETE', 'groups', groupId, { userId });
    
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
    await apiFetch(`${API}/api/groups/${groupId}/remove-member`, {
      method: 'POST',
      body: JSON.stringify({ userId, targetUserId: userId }),
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
    await apiFetch(`${API}/api/groups/${groupId}/remove-member`, {
      method: 'POST',
      body: JSON.stringify({ userId, targetUserId: memberId }),
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
  
  bodyEl.innerHTML = `<div class="loading-spinner"><div class="spinner-ring"></div><p>Loading journey...</p></div>`;
  insightsArea.style.display = 'none';
  insightsArea.innerHTML = '';
  
  openModal('modal-member-tasks');
  
  _currentMemberId   = memberId;
  _currentMemberName = memberName;
  memberDaysPage = 1;
  memberDaysData = [];
  memberDaysHasMore = false;
  memberCurrentStreak = 0;
  memberHighestStreak = 0;

  // If username is provided, fetch extra insights (graph, etc.)
  if (username) {
    (async () => {
      try {
        const res = await apiFetch(`${API}/api/users/${username}`);
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
          renderContributionGraph(res.user.contributionData, 'quick-profile-graph');
        }
      } catch (e) { console.error('Insights load fail', e); }
    })();
  }

  await loadMemberDays();
}

async function loadMemberDays() {
  const bodyEl  = document.getElementById('member-tasks-list-area');

  try {
    const response = await apiFetch(`${API}/api/groups/member-days?memberId=${encodeURIComponent(_currentMemberId)}&page=${memberDaysPage}&limit=10`);

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
          <p>${escHtml(_currentMemberName)} hasn't created any day cards yet.</p>
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
          const achs = await apiFetch(`${API}/api/achievements/day/${day._id}`);
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
  if (!_currentMemberId) return;
  const bodyEl = document.getElementById('member-tasks-body');
  const titleEl = document.getElementById('member-tasks-title');
  titleEl.innerHTML = `<button id="btn-back-to-tasks" style="background:var(--bg-card);border:var(--border-2);border-radius:var(--r-sm);padding:4px 10px;font-size:11px;font-weight:800;cursor:pointer;margin-right:8px;box-shadow:2px 2px 0 var(--black);font-family:'Inter',sans-serif;text-transform:uppercase;color:var(--text);" title="Back to daily tasks"><i data-lucide="arrow-left"></i> Back</button><i data-lucide="trophy"></i> ${escHtml(_currentMemberName)}'s Achievements`;
  const backBtn = document.getElementById('btn-back-to-tasks');
  if (backBtn) backBtn.addEventListener('click', () => openMemberTasks(_currentMemberId, _currentMemberName, _currentMemberUsername));
  bodyEl.innerHTML = `<div class="loading-spinner"><div class="spinner-ring"></div><p>Loading...</p></div>`;
  try {
    let achs = [];
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API}/api/achievements/user/${_currentMemberId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (resp.status === 403) {
        bodyEl.innerHTML = `<div class="empty-state" style="padding:40px 0">
          <span class="empty-icon"><i data-lucide="lock"></i></span>
          <h3>Achievements are Private</h3>
          <p>${escHtml(_currentMemberName)} has chosen to hide their achievements.</p>
        </div>`;
        return;
      }
      achs = await resp.json();
    } catch (_) {}
    if (!achs.length) {
      bodyEl.innerHTML = `<div class="empty-state" style="padding:40px 0"><span class="empty-icon"><i data-lucide="trophy"></i></span><h3>No achievements yet</h3><p>${escHtml(_currentMemberName)} hasn't logged any wins yet.</p></div>`;
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

// ══════════════════════════════════════════════════════════
//  ACHIEVEMENTS
// ══════════════════════════════════════════════════════════

// Track which memberId is currently open in the member-tasks modal
let _currentMemberId   = null;
let _currentMemberName = null;
let _currentMemberUsername = null;

// ── Inline day card: load + render achievements ────────────
async function loadDayAchievements(dayId, cardEl) {
  try {
    // Pass ?own=1 so the backend bypasses the privacy check for the owner
    const achievements = await apiFetch(`${API}/api/achievements/day/${dayId}?own=1`);
    renderDayAchievements(dayId, achievements, cardEl);
  } catch (_) {
    // silently fail — achievements are supplementary
  }
}

/** Build HTML for a list of links (used in both inline and page cards) */
function buildLinksHTML(links, cls = 'ach-link') {
  if (!links || !links.length) return '';
  return links.map((l, i) =>
    `<a class="${cls}" href="${escHtml(l)}" target="_blank" rel="noopener noreferrer"><i data-lucide="link"></i> Link ${links.length > 1 ? i + 1 : 'Proof'}</a>`
  ).join('');
}

function renderDayAchievements(dayId, achievements, cardEl) {
  // Remove any existing section first
  const existing = cardEl.querySelector('.achievements-section');
  if (existing) existing.remove();

  if (achievements.length === 0) return;

  const section = document.createElement('div');
  section.className = 'achievements-section';

  let html = `<div class="achievements-section-header"><span class="achievements-section-label"><i data-lucide="trophy"></i> Wins Logged</span></div>`;

  for (const a of achievements) {
    const linksHTML = buildLinksHTML(a.links || []);
    const descHTML  = a.description ? `<p class="ach-desc">${escHtml(a.description)}</p>` : '';
    html += `
      <div class="achievement-item" id="ach-item-${a._id}">
        <div class="achievement-item-top">
          <span class="achievement-item-title"><i data-lucide="medal"></i> ${escHtml(a.title)}</span>
          <div class="achievement-item-actions">
            <button class="btn-edit-ach" onclick="openEditAchievementModal('${a._id}')" title="Edit"><i data-lucide="edit-3"></i></button>
            <button class="btn-del-ach" onclick="deleteAchievement('${a._id}', '${dayId}')" title="Delete"><i data-lucide="trash-2"></i></button>
          </div>
        </div>
        ${descHTML}
        <div class="ach-links-row">${linksHTML}</div>
      </div>`;
  }

  section.innerHTML = html;
  const addRow = cardEl.querySelector('.ach-add-row');
  if (addRow) cardEl.insertBefore(section, addRow);
  else cardEl.appendChild(section);
  if (window.lucide) lucide.createIcons({ root: section });
}

// ── Achievements Page ──────────────────────────────────────
let _lastAchsLoad = 0;
async function loadAchievements() {
  const localDb = window.localDb;
  if (!localDb) return;
  const container = document.getElementById('achievements-container');

  // 1. STALE: Load from IndexedDB
  try {
    const cached = await localDb.achievements.toArray();
    if (cached.length > 0) {
      allAchievements = cached;
      renderAchievements();
    } else {
      container.innerHTML = `
        <div style="text-align:center; padding:40px; color:var(--text-muted);">
          <p style="font-weight:700; margin-bottom:10px;">No local data found.</p>
          <p style="font-size:12px;">Syncing with server...</p>
          <div class="loading-spinner" style="margin:20px auto; transform:scale(0.8);"><div class="spinner-ring"></div></div>
        </div>`;
    }
  } catch (err) {
    console.warn('Dexie read error:', err);
  }

  // 2. REVALIDATE: Throttled & Online
  const now = Date.now();
  if (now - _lastAchsLoad < 30000 && allAchievements.length > 0) return;

  if (!navigator.onLine) {
    if (allAchievements.length > 0) {
      showToast('Offline Mode: Using cached wins.', 'info');
    } else {
      container.innerHTML = `
        <div style="text-align:center; padding:40px; color:var(--text-muted);">
          <i data-lucide="wifi-off" style="width:48px;height:48px;margin-bottom:16px;opacity:0.5;"></i>
          <p style="font-weight:700; margin-bottom:10px;">Offline Mode</p>
          <p style="font-size:12px;">No cached wins found. Connect to sync.</p>
        </div>`;
      if (window.lucide) lucide.createIcons({ root: container });
    }
    return;
  }
  _lastAchsLoad = now;

  try {
    const [privacyRes, achs] = await Promise.all([
      apiFetch(`${API}/api/auth/achievements-privacy`),
      apiFetch(`${API}/api/achievements`),
    ]);
    
    achievementsPublic = privacyRes.achievementsPublic !== false;
    allAchievements    = achs.achievements || [];
    
    // Sync Cache
    await localDb.achievements.clear();
    await localDb.achievements.bulkAdd(allAchievements);
    
    renderAchievements();
  } catch (err) {
    console.warn('Background achievements refresh failed:', err);
    if (allAchievements.length === 0) {
      container.innerHTML = `<p style="color:#ef4444;text-align:center">⚠️ Failed to load wins. Check your connection.</p>`;
    }
  }
}

function renderAchievements() {
  const container = document.getElementById('achievements-container');
  container.innerHTML = '';

  // ─ Privacy toggle banner ─────────────────────────────────────────────
  const privacyBanner = document.createElement('div');
  privacyBanner.className = 'ach-privacy-banner';
  privacyBanner.innerHTML = `
    <div class="ach-privacy-info">
      <span class="ach-privacy-icon" id="ach-privacy-icon">${achievementsPublic ? '<i data-lucide="eye"></i>' : '<i data-lucide="lock"></i>'}</span>
      <div>
        <p class="ach-privacy-title">Achievement Visibility</p>
        <p class="ach-privacy-label" id="ach-privacy-label">${achievementsPublic ? 'Visible to group members' : 'Hidden from group members'}</p>
      </div>
    </div>
    <label class="toggle-switch" title="Toggle achievement visibility">
      <input type="checkbox" id="ach-privacy-toggle" ${achievementsPublic ? 'checked' : ''} onchange="toggleAchievementPrivacy()" />
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
    </label>
  `;
  container.appendChild(privacyBanner);

  if (!allAchievements.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon"><i data-lucide="trophy"></i></span>
        <h3>No achievements yet</h3>
        <p>Log your first win from any Daily Card!</p>
      </div>`;
    if (window.gsap) gsap.from('.empty-state', { opacity: 0, y: 20, duration: 0.5, ease: 'power2.out' });
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const a of allAchievements) fragment.appendChild(buildAchievementPageCard(a));
  container.appendChild(fragment);
  if (window.lucide) lucide.createIcons({ root: container });

  if (window.gsap) {
    gsap.from('.achievement-page-card', { opacity: 0, y: 30, duration: 0.5, stagger: 0.07, ease: 'power3.out', clearProps: 'all' });
  }
}

async function toggleAchievementPrivacy() {
  const newVal   = !achievementsPublic;
  const toggleEl = document.getElementById('ach-privacy-toggle');
  const iconEl   = document.getElementById('ach-privacy-icon');
  const labelEl  = document.getElementById('ach-privacy-label');
  if (toggleEl) toggleEl.disabled = true;
  try {
    const res = await apiFetch(`${API}/api/auth/achievements-privacy`, {
      method: 'PATCH',
      body: JSON.stringify({ achievementsPublic: newVal }),
    });
    achievementsPublic = res.achievementsPublic;
    if (toggleEl) { toggleEl.checked = achievementsPublic; toggleEl.disabled = false; }
    if (iconEl)   iconEl.innerHTML  = achievementsPublic ? '<i data-lucide="eye"></i>' : '<i data-lucide="lock"></i>';
    if (labelEl)  labelEl.textContent = achievementsPublic ? 'Visible to group members' : 'Hidden from group members';
    showToast(
      achievementsPublic
        ? 'Achievements visible to your groups'
        : 'Achievements hidden from group members',
      'info'
    );
    if (window.lucide) lucide.createIcons({ root: iconEl });
  } catch (err) {
    if (toggleEl) { toggleEl.checked = achievementsPublic; toggleEl.disabled = false; }
    showToast('Failed to update privacy setting.', 'error');
  }
}

function buildAchievementPageCard(a) {
  const card = document.createElement('div');
  card.className = 'achievement-page-card';
  card.id = `ach-page-${a._id}`;

  const linksHTML = buildLinksHTML(a.links || [], 'ach-page-link');
  const descHTML  = a.description ? `<p class="ach-page-desc">${escHtml(a.description)}</p>` : '';

  card.innerHTML = `
    <div class="ach-page-top">
      <div>
        <span class="ach-date-badge">${formatDisplayDate(a.date)}</span>
        <h3 class="ach-page-title"><i data-lucide="medal"></i> ${escHtml(a.title)}</h3>
      </div>
      <div class="ach-page-actions">
        <button class="btn-edit-ach" onclick="openEditAchievementModal('${a._id}')" title="Edit"><i data-lucide="edit-3"></i></button>
        <button class="btn-del-ach" onclick="deleteAchievement('${a._id}', null)" title="Delete"><i data-lucide="trash-2"></i></button>
      </div>
    </div>
    ${descHTML}
    <div class="ach-links-row">${linksHTML}</div>
  `;
  if (window.lucide) lucide.createIcons({ root: card });
  return card;
}

// ── Dynamic link builder (shared by add + edit modals) ─────────
function addAchLinkField(builderId, value = '') {
  const builder = document.getElementById(builderId);
  if (!builder) return;
  const row = document.createElement('div');
  row.className = 'task-input-row';
  row.innerHTML = `
    <input type="url" class="form-control" placeholder="https://..." value="${escHtml(value)}" />
    <button class="btn-remove" onclick="this.parentElement.remove()" title="Remove"><i data-lucide="trash-2"></i></button>
  `;
  builder.appendChild(row);
  if (window.lucide) lucide.createIcons({ root: row });
}

function getLinksFromBuilder(builderId) {
  const builder = document.getElementById(builderId);
  if (!builder) return [];
  return Array.from(builder.querySelectorAll('input')).map(i => i.value.trim()).filter(Boolean);
}

/** Check all links in a builder and return true if any is invalid */
function hasInvalidLinks(builderId) {
  return getLinksFromBuilder(builderId).some(l => {
    try { new URL(/^https?:\/\//i.test(l) ? l : `https://${l}`); return false; }
    catch (_) { return true; }
  });
}

// ── Add Achievement ────────────────────────────────────────
let _achAddLinkPending = false;

function openAddAchievementModal(dayId) {
  activeDayIdForAchievement = dayId;
  _achAddLinkPending = false;
  document.getElementById('ach-title-input').value = '';
  document.getElementById('ach-desc-input').value  = '';
  document.getElementById('ach-links-builder').innerHTML = '';
  addAchLinkField('ach-links-builder'); // start with one empty row
  document.getElementById('ach-link-warning').style.display = 'none';
  const btn = document.getElementById('submit-ach-btn');
  btn.textContent = 'Save Achievement';
  openModal('modal-add-achievement');
}

async function submitAddAchievement() {
  const title = document.getElementById('ach-title-input').value.trim();
  const desc  = document.getElementById('ach-desc-input').value.trim();
  const links = getLinksFromBuilder('ach-links-builder');

  if (!title) { showToast('Achievement title is required.', 'warn'); return; }

  const btn    = document.getElementById('submit-ach-btn');
  const warnEl = document.getElementById('ach-link-warning');

  if (links.length > 0 && hasInvalidLinks('ach-links-builder') && !_achAddLinkPending) {
    warnEl.style.display = 'block';
    _achAddLinkPending = true;
    btn.innerHTML = '<i data-lucide="alert-triangle"></i> Confirm & Save';
    if (window.lucide) lucide.createIcons({ root: btn });
    return;
  }
  warnEl.style.display = 'none';
  _achAddLinkPending = false;

  const dayId = activeDayIdForAchievement;
  const day   = allDays.find(d => d._id === dayId);
  const date  = day ? day.date : todayStr();

  const tempId = `temp_${Date.now()}`;
  const localAch = { _id: tempId, userId, dayId, date, title, description: desc, links };

  try {
    // 1. Update UI and Local DB instantly
    allAchievements.unshift(localAch);
    await window.localDb.achievements.add(localAch);
    closeModal('modal-add-achievement');

    const cardEl = document.getElementById(`day-card-${dayId}`);
    if (cardEl) {
      // Filter locally instead of fetching
      const dayAchs = allAchievements.filter(a => a.dayId === dayId);
      renderDayAchievements(dayId, dayAchs, cardEl);
    }
    showToast(`Achievement logged locally! <i data-lucide="party-popper"></i>`, 'success');

    // 2. Queue for sync
    syncManager.addToQueue('POST', 'achievements', null, { userId, dayId, date, title, description: desc, links }, tempId);
  } catch (err) {
    console.error('Offline achievement write error:', err);
  } finally {
    btn.disabled = false; btn.textContent = 'Save Achievement';
  }
}

// ── Edit Achievement ───────────────────────────────────────
let _achEditLinkPending = false;

function openEditAchievementModal(achId) {
  const a = allAchievements.find(x => x._id === achId);
  editingAchievementId = achId;
  _achEditLinkPending = false;

  document.getElementById('edit-ach-title').value = a ? a.title       : '';
  document.getElementById('edit-ach-desc').value  = a ? a.description : '';

  // Populate multi-link builder with existing links
  const builder = document.getElementById('edit-ach-links-builder');
  builder.innerHTML = '';
  const existingLinks = a ? (a.links || []) : [];
  if (existingLinks.length > 0) {
    existingLinks.forEach(l => addAchLinkField('edit-ach-links-builder', l));
  } else {
    addAchLinkField('edit-ach-links-builder'); // one empty row
  }

  document.getElementById('edit-ach-link-warning').style.display = 'none';
  const btn = document.getElementById('submit-edit-ach-btn');
  btn.textContent = 'Save Changes';
  openModal('modal-edit-achievement');
}

async function submitEditAchievement() {
  const title = document.getElementById('edit-ach-title').value.trim();
  const desc  = document.getElementById('edit-ach-desc').value.trim();
  const links = getLinksFromBuilder('edit-ach-links-builder');

  if (!title) { showToast('Title is required.', 'warn'); return; }

  const warnEl = document.getElementById('edit-ach-link-warning');
  const btn    = document.getElementById('submit-edit-ach-btn');
  if (links.length > 0 && hasInvalidLinks('edit-ach-links-builder') && !_achEditLinkPending) {
    warnEl.style.display = 'block';
    _achEditLinkPending = true;
    btn.innerHTML = '<i data-lucide="alert-triangle"></i> Confirm & Save';
    if (window.lucide) lucide.createIcons({ root: btn });
    return;
  }
  warnEl.style.display = 'none';
  _achEditLinkPending = false;

  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    const updated = await apiFetch(`${API}/api/achievements/${editingAchievementId}`, {
      method: 'PUT',
      body: JSON.stringify({ title, description: desc, links }),
    });
    const idx = allAchievements.findIndex(x => x._id === editingAchievementId);
    if (idx !== -1) allAchievements[idx] = updated;
    closeModal('modal-edit-achievement');
    const cardEl = document.getElementById(`day-card-${updated.dayId}`);
    if (cardEl) {
      const dayAchs = await apiFetch(`${API}/api/achievements/day/${updated.dayId}`);
      renderDayAchievements(updated.dayId, dayAchs, cardEl);
    }
    if (document.getElementById('page-achievements').classList.contains('active')) {
      renderAchievements();
    }
    showToast('Achievement updated!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Changes';
  }
}

// ── Delete Achievement ─────────────────────────────────────
async function deleteAchievement(achId, dayId) {
  if (!confirm('Delete this achievement? This cannot be undone.')) return;
  try {
    const knownDayId = dayId || allAchievements.find(x => x._id === achId)?.dayId;

    // 1. Update UI and Local DB instantly
    allAchievements = allAchievements.filter(x => x._id !== achId);
    await window.localDb.achievements.delete(achId);

    if (knownDayId) {
      const cardEl = document.getElementById(`day-card-${knownDayId}`);
      if (cardEl) {
        const dayAchs = allAchievements.filter(a => a.dayId === knownDayId);
        renderDayAchievements(knownDayId, dayAchs, cardEl);
      }
    }
    if (document.getElementById('page-achievements')?.classList.contains('active')) {
      renderAchievements();
    }
    showToast('Achievement deleted locally.', 'success');

    // 2. Queue for sync
    syncManager.addToQueue('DELETE', 'achievements', achId);
  } catch (err) {
    console.error('Offline delete error:', err);
  }
}

// ── Modal helpers ──────────────────────────────────────────
function openModal(id) {
  const overlay = document.getElementById(id);
  const modalEl = overlay.querySelector('.modal');

  // Kill any in-flight tween on this modal to prevent opacity getting stuck
  if (window.gsap) gsap.killTweensOf(modalEl);

  // Ensure the modal starts fully visible (clear any stale inline styles)
  if (window.gsap) gsap.set(modalEl, { clearProps: 'all' });

  overlay.classList.add('open');

  // Defer the GSAP tween by one rAF so the browser finishes the
  // display:flex paint before animating — prevents the "invisible flash" on mobile
  if (window.gsap) {
    requestAnimationFrame(() => {
      gsap.fromTo(modalEl,
        { opacity: 0, y: 28, scale: 0.94 },
        { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'back.out(1.4)', clearProps: 'all' }
      );
    });
  }
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  const modalEl = overlay.querySelector('.modal');

  if (window.gsap) {
    // Kill any in-flight open tween before closing
    gsap.killTweensOf(modalEl);
    gsap.to(modalEl, {
      opacity: 0,
      y: 16,
      scale: 0.96,
      duration: 0.22,
      ease: 'power2.in',
      onComplete: () => {
        overlay.classList.remove('open');
        gsap.set(modalEl, { clearProps: 'all' }); // clean up so next open starts fresh

        // Reset LeetCode modal state if closing LeetCode modal
        if (id === 'modal-add-leetcode') {
          resetLeetCodeModalState();
        }
      },
    });
  } else {
    overlay.classList.remove('open');

    // Reset LeetCode modal state if closing LeetCode modal
    if (id === 'modal-add-leetcode') {
      resetLeetCodeModalState();
    }
  }
}

function closeModalOnOverlay(e, id) { if (e.target === e.currentTarget) closeModal(id); }

// Reset LeetCode modal state
function resetLeetCodeModalState() {
  // Don't clear currentLeetCodeDayId here - it should persist for the current session
  currentLeetCodeValidation = null; // Clear cached validation result
  const problemUrlInput = document.getElementById('leetcode-problem-url');
  if (problemUrlInput) {
    problemUrlInput.value = '';
  }
  const previewDiv = document.getElementById('leetcode-problem-preview');
  if (previewDiv) {
    previewDiv.style.display = 'none';
  }
  const resultDiv = document.getElementById('leetcode-validation-result');
  if (resultDiv) {
    resultDiv.style.display = 'none';
  }
  const addBtn = document.getElementById('add-leetcode-btn');
  if (addBtn) {
    addBtn.disabled = true; // Start with disabled button
  }
}

// Reset LeetCode profile modal state
function resetLeetCodeProfileModalState() {
  const leetcodeUsernameInput = document.getElementById('leetcode-username');
  if (leetcodeUsernameInput) {
    leetcodeUsernameInput.value = '';
  }
  document.getElementById('leetcode-verification-code').style.display = 'none';
  document.getElementById('leetcode-code-expiry').style.display = 'none';
  document.getElementById('leetcode-code-generated').style.display = 'none';
  document.getElementById('leetcode-code-expired').style.display = 'none';
  document.getElementById('leetcode-connected').style.display = 'none';
  document.getElementById('leetcode-not-connected').style.display = 'block';

  const leetcodeStatus = document.getElementById('leetcode-status');
  setLcStatus(leetcodeStatus, 'error', '❌ Not connected');
}

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

  // 1. STALE: Load from cache instantly
  const userId = localStorage.getItem('userId');
  try {
    const cached = await window.localDb.userProfile.get(userId);
    if (cached) renderProfileData(cached);
  } catch (e) {}

  // 2. REVALIDATE: Load from server
  try {
    const res = await apiFetch(`${API}/api/auth/settings`);
    res.userId = userId;
    await window.localDb.userProfile.put(res);
    renderProfileData(res);
  } catch (err) {
    console.error('Error loading profile:', err);
    if (!navigator.onLine) showToast('Showing offline profile data.', 'info');
  }
}

/** Helper to populate profile fields from a user object */
function renderProfileData(user) {
  if (!user) return;
  
  if (user.profilePicture) {
    userProfilePicture = user.profilePicture;
    localStorage.setItem('userProfilePicture', userProfilePicture);
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
    avatarInit.textContent = (user.name || userName || 'U').charAt(0).toUpperCase();
  }

  const emailInput = document.getElementById('profile-email');
  if (emailInput) emailInput.value = user.email || '';
  
  const toggle = document.getElementById('email-notif-toggle');
  if (toggle) toggle.checked = user.emailNotifications;
  const publicToggle = document.getElementById('public-profile-toggle');
  if (publicToggle) publicToggle.checked = user.isPublicProfile !== false;
  
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
    const payload = { emailNotifications, isPublicProfile };
    if (!usernameInput.readOnly && username) {
      payload.username = username;
    }
    if (profilePicture) {
      payload.profilePicture = profilePicture;
    }

    // 1. Update Locally First (Offline-First) - This is INSTANT
    if (window.localDb) {
      const userId = localStorage.getItem('userId');
      await window.localDb.userProfile.put({ ...payload, userId });
      
      // 2. Queue for Sync
      syncManager.addToQueue('PATCH', 'auth/settings', null, payload);
    }

    // 3. SHOW SUCCESS INSTANTLY
    showToast('Settings saved!', 'success');
    closeModal('modal-profile');

    // 4. Background Sync (Don't await it for the UI)
    apiFetch(`${API}/api/auth/settings`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }).then(res => {
      // Update local storage and UI if pic/username changed (Server confirmation)
      if (res.profilePicture) {
        userProfilePicture = res.profilePicture;
        localStorage.setItem('userProfilePicture', userProfilePicture);
        updateNavAvatar();
      }
      if (res.username) {
        localStorage.setItem('userUsername', res.username);
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
      syncManager.addToQueue('PATCH', 'auth/settings', 'current', payload);
      showToast('Password change queued! Will sync when online.', 'success');
      closeModal('modal-profile');
      return;
    }

    await apiFetch(`${API}/api/auth/settings`, {
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
    await apiFetch(`${API}/api/auth/account`, {
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

// ── Templates Logic ────────────────────────────────────────
async function loadTemplates() {
  try {
    // 1. Try local cache first for instant load
    if (window.localDb) {
      allTemplates = await window.localDb.templates.toArray();
      if (allTemplates.length > 0) populateTemplateDropdown();
    }

    // 2. Fetch fresh from network if online
    if (navigator.onLine) {
      const fresh = await apiFetch(`${API}/api/templates`);
      allTemplates = fresh;
      populateTemplateDropdown();
      if (window.localDb) {
        await window.localDb.templates.clear();
        await window.localDb.templates.bulkPut(fresh);
      }
    }
  } catch (err) {
    console.error('Error loading templates:', err);
  }
}

function populateTemplateDropdown() {
  const select = document.getElementById('import-template-select');
  if (!select) return;
  select.innerHTML = '<option value="">-- Select a template to import --</option>';
  for (const t of allTemplates) {
    const opt = document.createElement('option');
    opt.value = t._id;
    opt.textContent = t.name;
    select.appendChild(opt);
  }
}

function applyTemplate() {
  const select = document.getElementById('import-template-select');
  if (!select || !select.value) {
    showToast('Please select a template first.', 'warn');
    return;
  }
  const t = allTemplates.find(x => x._id === select.value);
  if (!t) return;
  
  document.getElementById('categories-builder').innerHTML = '';
  categoryCount = 0;
  
  for (const cat of t.categories) {
    const idx = categoryCount++;
    const builder = document.getElementById('categories-builder');
    const item = document.createElement('div');
    item.className = 'category-builder-item';
    item.id = `cat-build-${idx}`;
    item.innerHTML = `
      <div class="cat-top-row">
        <input type="text" class="form-control" placeholder="Category name" id="cat-name-${idx}" value="${escHtml(cat.name)}" />
        <button class="btn-remove" onclick="removeCategoryField(${idx})" title="Remove">✕</button>
      </div>
      <div class="tasks-builder" id="tasks-build-${idx}"></div>
      <button class="btn-ghost ripple" style="font-size:12px;padding:6px 12px;border-radius:8px;" onclick="addTaskField(${idx})">＋ Add Task</button>
    `;
    builder.appendChild(item);
    
    const tasksBuilder = document.getElementById(`tasks-build-${idx}`);
    for (const task of cat.tasks) {
      const row = document.createElement('div');
      row.className = 'task-input-row';
      row.innerHTML = `
        <input type="text" class="form-control" placeholder="Task title..." value="${escHtml(task.title)}" />
        <button class="btn-remove" onclick="this.parentElement.remove()" title="Remove">✕</button>
      `;
      tasksBuilder.appendChild(row);
    }
  }
  showToast('Template imported! You can edit before creating.', 'success');
}

function openSaveTemplateModal(dayId) {
  activeDayIdForTemplate = dayId;
  document.getElementById('template-name-input').value = '';
  openModal('modal-save-template');
}

async function submitSaveTemplate() {
  const name = document.getElementById('template-name-input').value.trim();
  if (!name) { showToast('Please enter a template name.', 'warn'); return; }
  
  const day = allDays.find(d => d._id === activeDayIdForTemplate);
  if (!day) return;
  
  const categories = day.categories.map(c => ({
    name: c.name,
    tasks: c.tasks.map(t => ({ title: t.title, completed: false }))
  }));

  const btn = document.getElementById('submit-save-template-btn');
  btn.disabled = true; btn.textContent = 'Saving...';
  
  try {
    const newT = await apiFetch(`${API}/api/templates`, {
      method: 'POST',
      body: JSON.stringify({ userId, name, categories })
    });
    allTemplates.unshift(newT);
    populateTemplateDropdown();
    closeModal('modal-save-template');
    showToast('Template saved!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Template';
  }
}

function openManageTemplatesModal() {
  closeModal('modal-profile');
  openModal('modal-manage-templates');
  renderTemplatesList();
}

function renderTemplatesList() {
  const container = document.getElementById('templates-list-container');
  container.innerHTML = '';
  
  if (!allTemplates.length) {
    container.innerHTML = '<p style="text-align:center; color:var(--text-muted);">No templates saved yet.</p>';
    return;
  }
  
  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '10px';
  
  for (const t of allTemplates) {
    const item = document.createElement('div');
    item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:12px; background:var(--bg-muted); border:var(--border-2); border-radius:var(--r-sm); box-shadow:var(--shadow-sm);';
    item.innerHTML = `
      <div style="font-weight:800; font-size:14px; color:var(--text);">${escHtml(t.name)}</div>
      <div style="display:flex; gap:6px;">
        <button class="btn-edit-ach ripple" onclick="openEditTemplateModal('${t._id}')"><i data-lucide="edit-3"></i></button>
        <button class="btn-del-ach ripple" onclick="deleteTemplate('${t._id}')"><i data-lucide="trash-2"></i></button>
      </div>
    `;
    list.appendChild(item);
  }
  container.appendChild(list);
  if (window.lucide) lucide.createIcons({ root: container });
}

let editTemplateCategoryCount = 0;

function openEditTemplateModal(templateId) {
  editingTemplateId = templateId;
  const t = allTemplates.find(x => x._id === templateId);
  if (!t) return;
  
  document.getElementById('edit-template-name').value = t.name;
  const builder = document.getElementById('edit-template-categories-builder');
  builder.innerHTML = '';
  editTemplateCategoryCount = 0;
  
  for (const cat of t.categories) {
    addEditTemplateCategoryField(cat.name, cat.tasks);
  }
  if (!t.categories.length) addEditTemplateCategoryField();
  
  closeModal('modal-manage-templates');
  openModal('modal-edit-template');
}

function addEditTemplateCategoryField(name = '', tasks = []) {
  const idx = editTemplateCategoryCount++;
  const builder = document.getElementById('edit-template-categories-builder');
  const item = document.createElement('div');
  item.className = 'category-builder-item';
  item.id = `edit-template-cat-build-${idx}`;
  item.innerHTML = `
    <div class="cat-top-row">
      <input type="text" class="form-control" placeholder="Category name" value="${escHtml(name)}" />
      <button class="btn-remove" onclick="this.parentElement.parentElement.remove()" title="Remove">✕</button>
    </div>
    <div class="tasks-builder" id="edit-template-tasks-build-${idx}"></div>
    <button class="btn-ghost ripple" style="font-size:12px;padding:6px 12px;border-radius:8px;" onclick="addEditTemplateTaskField(${idx})">＋ Add Task</button>
  `;
  builder.appendChild(item);
  
  for (const task of tasks) {
    addEditTemplateTaskField(idx, task.title);
  }
}

function addEditTemplateTaskField(catIdx, title = '') {
  const builder = document.getElementById(`edit-template-tasks-build-${catIdx}`);
  const row = document.createElement('div');
  row.className = 'task-input-row';
  row.innerHTML = `
    <input type="text" class="form-control" placeholder="Task title..." value="${escHtml(title)}" />
    <button class="btn-remove" onclick="this.parentElement.remove()" title="Remove">✕</button>
  `;
  builder.appendChild(row);
}

async function submitEditTemplate() {
  const name = document.getElementById('edit-template-name').value.trim();
  if (!name) { showToast('Name is required', 'warn'); return; }
  
  const catItems = document.querySelectorAll('#edit-template-categories-builder .category-builder-item');
  const categories = [];
  for (const item of catItems) {
    const catName = item.querySelector('.cat-top-row input').value.trim();
    if (!catName) continue;
    const taskInputs = item.querySelectorAll('.task-input-row input');
    const tasks = [];
    for (const inp of taskInputs) {
      if (inp.value.trim()) tasks.push({ title: inp.value.trim(), completed: false });
    }
    categories.push({ name: catName, tasks });
  }
  
  const btn = document.getElementById('submit-edit-template-btn');
  btn.disabled = true; btn.textContent = 'Saving...';
  
  try {
    const res = await apiFetch(`${API}/api/templates/${editingTemplateId}`, {
      method: 'PUT',
      body: JSON.stringify({ name, categories })
    });
    const idx = allTemplates.findIndex(x => x._id === editingTemplateId);
    if (idx !== -1) allTemplates[idx] = res;
    
    populateTemplateDropdown();
    closeModal('modal-edit-template');
    openManageTemplatesModal(); // go back to list
    showToast('Template updated!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Changes';
  }
}

async function deleteTemplate(templateId) {
  if (!confirm('Delete this template?')) return;
  try {
    await apiFetch(`${API}/api/templates/${templateId}`, { method: 'DELETE' });
    allTemplates = allTemplates.filter(x => x._id !== templateId);
    populateTemplateDropdown();
    renderTemplatesList();
    showToast('Template deleted', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Theme Logic ──────────────────────────────────────────────
async function toggleDarkTheme(isDark) {
  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme', 'light');
  }
  
  try {
    await apiFetch(`${API}/api/auth/settings`, {
      method: 'PATCH',
      body: JSON.stringify({ theme: isDark ? 'dark' : 'light' })
    });
  } catch(err) {
    console.error('Failed to sync theme preference:', err);
  }
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.innerHTML = '<i data-lucide="eye-off"></i>';
  } else {
    input.type = 'password';
    btn.innerHTML = '<i data-lucide="eye"></i>';
  }
  if (window.lucide) lucide.createIcons({ root: btn });
}

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const savedTheme = localStorage.getItem('theme');
  const themeToggle = document.getElementById('dark-theme-toggle');
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    if (themeToggle) themeToggle.checked = true;
  }

  await fetchConfig();
  initFirebaseChat();

  // Today's date subtitle
  const display = document.getElementById('today-date-display');
  if (display) {
    display.textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  }

  // Populate user chip in navbar
  const chipName   = document.getElementById('user-chip-name');
  const storedName = localStorage.getItem('userName');
  if (chipName)   chipName.textContent = storedName || userName;
  updateNavAvatar();

  // Load badges into memory immediately for offline access
  loadClaimedBadges();

  // Random motivation chip
  const chip = document.getElementById('motivation-chip');
  if (chip) {
    const m = MOTIVATIONS[Math.floor(Math.random() * MOTIVATIONS.length)];
    if (m.icon === '🔥') {
      chip.querySelector('.motivation-icon').innerHTML = m.icon;
    } else {
      chip.querySelector('.motivation-icon').innerHTML = `<i data-lucide="${m.icon}"></i>`;
    }
    chip.querySelector('.motivation-text').textContent = m.text;
    if (window.lucide) lucide.createIcons({ root: chip });
  }

  // GSAP navbar entrance
  if (window.gsap) {
    gsap.from('.navbar', { y: -64, opacity: 0, duration: 0.6, ease: 'power3.out' });
    gsap.from('.page-header', { opacity: 0, y: 20, duration: 0.6, delay: 0.2, ease: 'power2.out' });
  }

  // Escape key closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      ['modal-profile', 'modal-add-day', 'modal-add-goal', 'modal-add-category',
       'modal-create-group', 'modal-join-group', 'modal-member-tasks',
       'modal-edit-category', 'modal-edit-goal', 'modal-edit-group',
       'modal-add-achievement', 'modal-edit-achievement',
       'modal-save-template', 'modal-manage-templates', 'modal-edit-template'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.classList.contains('open')) closeModal(id);
      });
    }
  });

  // Auto-uppercase the join code input as user types
  const joinCodeInput = document.getElementById('join-code-input');
  if (joinCodeInput) {
    joinCodeInput.addEventListener('input', () => {
      const pos = joinCodeInput.selectionStart;
      joinCodeInput.value = joinCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      joinCodeInput.setSelectionRange(pos, pos);
    });
  }

  proactiveSync(); // Syncs profile, goals, achievements, etc.
  loadDays();
  loadTemplates();
});

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
  
  if (userProfilePicture) {
    chipImg.src = userProfilePicture;
    chipImg.style.display = 'block';
    
    if (chipAvatar) chipAvatar.style.display = 'none';
  } else {
    chipImg.src = '';
    chipImg.style.display = 'none';
    chipImg.onclick = null;
    if (chipAvatar) {
      chipAvatar.style.display = 'flex';
      chipAvatar.textContent = userName.charAt(0).toUpperCase();
    }
  }
}

// ── Lightbox ────────────────────────────────────────────────
function openLightbox(url) {
  const overlay = document.getElementById('lightbox-modal');
  const img = document.getElementById('lightbox-img');
  img.src = url;
  overlay.classList.add('open');
}

/** --- AUDIO MESSAGE HELPERS --- **/
function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const audioCache = {}; // Cache for downloaded audio Blobs

async function downloadAudio(docId, url) {
  const btn = document.getElementById(`audio-btn-${docId}`);
  if (!btn) return;

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-inline"></span>';

  try {
    // Check IndexedDB cache first
    const cached = await localDb.mediaCache.get(url);
    if (cached) {
      btn.disabled = false;
      playAudioFromBlob(docId, cached.blob);
      return;
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob();

    // Store in persistent cache
    await localDb.mediaCache.put({ url, blob });

    btn.disabled = false;
    playAudioFromBlob(docId, blob);
  } catch (err) {
    console.error('Audio download error:', err);
    showToast('Failed to load audio.', 'error');
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="download" style="width:20px; height:20px;"></i>';
    if (window.lucide) lucide.createIcons({ root: btn });
  }
}

async function checkAudioCache(docId, url) {
  const btn = document.getElementById(`audio-btn-${docId}`);
  if (!btn) return;

  try {
    const cached = await localDb.mediaCache.get(url);
    if (cached) {
      btn.innerHTML = '<i data-lucide="play" style="width:20px; height:20px;"></i>';
      if (window.lucide) lucide.createIcons({ root: btn });
      btn.onclick = () => playAudioFromBlob(docId, cached.blob);
    }
  } catch (err) {
    console.error('Cache check error:', err);
  }
}

let activeAudio = null;
let activeAudioId = null;

function playAudioFromBlob(docId, blob) {
  const btn = document.getElementById(`audio-btn-${docId}`);
  if (!btn) return;

  // If clicking the same playing audio, toggle pause/play
  if (activeAudioId === docId && activeAudio) {
    if (!activeAudio.paused) {
      activeAudio.pause();
      btn.innerHTML = '<i data-lucide="play" style="width:20px; height:20px;"></i>';
      if (window.lucide) lucide.createIcons({ root: btn });
    } else {
      activeAudio.play();
      btn.innerHTML = '<i data-lucide="pause" style="width:20px; height:20px;"></i>';
      if (window.lucide) lucide.createIcons({ root: btn });
    }
    return;
  }

  // Stop any previously playing audio
  if (activeAudio) {
    activeAudio.pause();
    const oldBtn = document.getElementById(`audio-btn-${activeAudioId}`);
    if (oldBtn) {
      oldBtn.innerHTML = '<i data-lucide="play" style="width:20px; height:20px;"></i>';
      if (window.lucide) lucide.createIcons({ root: oldBtn });
    }
  }

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  activeAudio = audio;
  activeAudioId = docId;

  audio.play();
  btn.innerHTML = '<i data-lucide="pause" style="width:20px; height:20px;"></i>';
  if (window.lucide) lucide.createIcons({ root: btn });

  audio.ontimeupdate = () => {
    const pct = (audio.currentTime / audio.duration) * 100;
    const progressEl = document.getElementById(`audio-progress-${docId}`);
    if (progressEl) progressEl.style.width = `${pct}%`;
  };

  audio.onended = () => {
    btn.innerHTML = '<i data-lucide="play" style="width:20px; height:20px;"></i>';
    if (window.lucide) lucide.createIcons({ root: btn });
    const progressEl = document.getElementById(`audio-progress-${docId}`);
    if (progressEl) progressEl.style.width = '0%';
    URL.revokeObjectURL(url);
    activeAudio = null;
    activeAudioId = null;
  };
}

function closeLightbox(event, force = false) {
  if (force || event.target === event.currentTarget) {
    const overlay = document.getElementById('lightbox-modal');
    overlay.classList.remove('open');
    setTimeout(() => { document.getElementById('lightbox-img').src = ''; }, 300);
  }
}

// ── Search Logic ───────────────────────────────────────────
let searchTimeout;
const searchInput = document.getElementById('nav-search-input');
const searchDropdown = document.getElementById('nav-search-dropdown');

if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length < 1) {
      searchDropdown.style.display = 'none';
      return;
    }
    searchTimeout = setTimeout(() => performSearch(query), 350);
  });

  // Hide dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-search-container')) {
      if (searchDropdown) searchDropdown.style.display = 'none';
      if (searchInput && !searchInput.value.trim() && window.collapseSearchInput) window.collapseSearchInput();
    }
  });
}

window.collapseSearchInput = function() {
  const inp = document.getElementById('nav-search-input');
  if (inp) {
    inp.style.width = '36px';
    inp.style.padding = '0';
    inp.style.textAlign = 'center';
    inp.style.cursor = 'pointer';
    inp.placeholder = '🔍';
  }
};

async function performSearch(query) {
  try {
    const res = await fetch(`${API}/api/users/search?q=${encodeURIComponent(query)}`);
    const users = await res.json();
    
    searchDropdown.innerHTML = '';
    
    if (!users || users.length === 0) {
      searchDropdown.innerHTML = '<div style="padding:12px; color:var(--text-muted); font-size:14px; text-align:center;">No users found</div>';
    } else {
      users.forEach(u => {
        const item = document.createElement('div');
        item.className = 'search-item';

        let avatarHtml = `<div class="search-avatar" style="background:var(--primary); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:14px; flex-shrink:0;">${u.username.charAt(0).toUpperCase()}</div>`;
        if (u.profilePicture) {
          avatarHtml = `<img src="${u.profilePicture}" class="search-avatar" />`;
        }

        const streakBadge = u.highestStreak > 0
          ? `<span style="font-size:11px; background:#fef3c7; color:#d97706; padding:2px 6px; border-radius:10px; font-weight:600;">🔥 ${u.highestStreak}</span>`
          : '';

        item.innerHTML = `
          ${avatarHtml}
          <div class="search-info">
            <div class="search-name">${u.username}</div>
            ${streakBadge ? `<div style="margin-top:2px;">${streakBadge}</div>` : ''}
          </div>
        `;
        
        item.onclick = () => {
          searchDropdown.style.display = 'none';
          if (searchInput) searchInput.value = '';
          if (window.collapseSearchInput) window.collapseSearchInput();
          openQuickView(u.username);
        };
        
        searchDropdown.appendChild(item);
      });
    }
    searchDropdown.style.display = 'flex';
  } catch (err) {
    console.error('Search failed', err);
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
  const myId = localStorage.getItem('userId');
  const isMe = (username === myUsername);

  // 1. OFFLINE HANDLING
  if (!navigator.onLine) {
    if (isMe) {
      // Reconstruct view from local data
      const qpName = document.getElementById('qp-name');
      const qpUsername = document.getElementById('qp-username');
      if (qpName) qpName.textContent = localStorage.getItem('userName') || 'You';
      if (qpUsername) qpUsername.textContent = `@${myUsername}`;
      
      const avatarImg = document.getElementById('qp-avatar-img');
      const avatarPlc = document.getElementById('qp-avatar-placeholder');
      const myPic = localStorage.getItem('userProfilePicture');
      if (avatarImg && avatarPlc) {
        if (myPic) {
          avatarImg.src = myPic;
          avatarImg.style.display = 'block';
          avatarPlc.style.display = 'none';
        } else {
          avatarImg.style.display = 'none';
          avatarPlc.style.display = 'flex';
          avatarPlc.textContent = (localStorage.getItem('userName') || 'U').charAt(0).toUpperCase();
        }
      }

      // Streaks (from memory/local)
      const qpCurr = document.getElementById('qp-current-streak');
      const qpHighest = document.getElementById('qp-highest-streak');
      if (qpCurr) qpCurr.textContent = backendStreak || 0;
      if (qpHighest) qpHighest.textContent = backendStreak || 0; // fallback

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

      // Activity Feed (from local allDays)
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
    const u = await apiFetch(`${API}/api/users/${encodeURIComponent(username)}`);
    if (!u || !u.username) {
      showToast('Profile not found or private.', 'error');
      return;
    }

    _currentMemberId = u._id;
    _currentMemberName = u.name;
    _currentMemberUsername = u.username;
    
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
      activityList.innerHTML = '<div class="loading-spinner" style="padding:20px;"><div class="spinner-ring"></div></div>';
      
      try {
        // Fetch first page of days to show task progress in feed
        const days = await apiFetch(`${API}/api/users/${encodeURIComponent(username)}/days?page=1&limit=5`);
        
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
              _currentMemberId = u._id;
              _currentMemberName = u.name;
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


// ── LeetCode Integration ──────────────────────────────────────────

// Generate verification code for LeetCode profile
async function generateLeetCodeCode() {
  const leetcodeUsernameInput = document.getElementById('leetcode-username');
  const leetcodeUsername = leetcodeUsernameInput.value.trim();

  if (!leetcodeUsername) {
    showToast('Please enter your LeetCode username', 'error');
    return;
  }

  try {
    const data = await apiFetch(`${API}/api/leetcode/generate-code`, {
      method: 'POST',
      body: JSON.stringify({ leetcodeUsername })
    });

    // Display verification code
    const codeDisplay = document.getElementById('leetcode-verification-code');
    const codeExpiry = document.getElementById('leetcode-code-expiry');
    const remainingChanges = document.getElementById('leetcode-remaining-changes');

    codeDisplay.textContent = data.verificationCode;
    codeDisplay.style.display = 'block';

    const expiryTime = new Date(data.expiry);
    const now = new Date();
    const timeLeft = Math.max(0, Math.floor((expiryTime - now) / (1000 * 60))); // minutes left

    let timeMessage = `Expires: ${expiryTime.toLocaleString()}`;
    if (timeLeft > 0 && timeLeft < 60) {
      timeMessage += ` (${timeLeft} minutes left)`;
    }

    codeExpiry.textContent = timeMessage;
    codeExpiry.style.display = 'block';
    remainingChanges.textContent = `Remaining changes: ${data.remainingChanges}`;

    // Show code generated section
    document.getElementById('leetcode-not-connected').style.display = 'none';
    document.getElementById('leetcode-code-expired').style.display = 'none';
    document.getElementById('leetcode-code-generated').style.display = 'block';

    // Update status
    const leetcodeStatus = document.getElementById('leetcode-status');
    setLcStatus(leetcodeStatus, 'waiting', '<i data-lucide="clock"></i> Pending verification');

    showToast('Verification code generated! Add it to your LeetCode bio.', 'success');
  } catch (error) {
    console.error('Error generating LeetCode code:', error);

    // Always reload profile status after a failure.
    // If a pending retry is active, loadLeetCodeProfileStatus() will show the
    // Check Status section automatically (pending_retry is checked before isVerified).
    // For any other error (bad username, change limit etc.) it shows the correct state too.
    const isPendingRetry = error.data && error.data.retryAvailableAt;
    showToast(
      isPendingRetry
        ? 'A verification is already in progress — use the Check Status button below'
        : (error.message || 'Failed to generate verification code'),
      isPendingRetry ? 'warn' : 'error'
    );
    await loadLeetCodeProfileStatus();
  }
}

// Verify LeetCode profile ownership
async function verifyLeetCodeProfile() {
  try {
    const data = await apiFetch(`${API}/api/leetcode/verify-profile`, {
      method: 'POST',
      body: JSON.stringify({})
    });

    if (data.pendingRetry) {
      // First attempt failed — could be a caching issue, start retry window
      showPendingRetryUI(data.retryAvailableAt, data.retryExpiresAt);
      showToast('Code not found yet — check again in 5 minutes', 'warn');
      return;
    }

    if (data.finalFailure) {
      // Check Status also failed — reset to State 1 so user can try fresh
      showToast(data.message || 'Verification failed', 'error');
      await loadLeetCodeProfileStatus();
      return;
    }

    // ── SUCCESS ──
    const leetcodeStatus          = document.getElementById('leetcode-status');
    const leetcodeUsernameDisplay = document.getElementById('leetcode-username-display');
    const leetcodeProfilePic      = document.getElementById('leetcode-profile-pic');
    const remainingChanges        = document.getElementById('leetcode-remaining-changes');

    setLcStatus(leetcodeStatus, 'verified', '<i data-lucide="check-circle"></i> Verified');
    leetcodeUsernameDisplay.textContent = data.leetcodeUsername;
    remainingChanges.textContent = `Remaining changes: ${data.remainingChanges}`;

    if (data.profilePicture) {
      leetcodeProfilePic.src = data.profilePicture;
      leetcodeProfilePic.style.display = 'block';
    }

    document.getElementById('leetcode-verification-code').style.display = 'none';
    document.getElementById('leetcode-code-expiry').style.display = 'none';
    document.getElementById('leetcode-code-generated').style.display = 'none';
    document.getElementById('leetcode-pending-retry').style.display = 'none';
    document.getElementById('leetcode-connected').style.display = 'block';
    document.getElementById('leetcode-connected-username').textContent = data.leetcodeUsername;
    document.getElementById('leetcode-changes-remaining').textContent = data.remainingChanges;

    updateLeetCodeButtonsStatus(true);
    showToast('LeetCode profile verified successfully!', 'success');
  } catch (error) {
    console.error('Error verifying LeetCode profile:', error);
    showToast(error.message || 'Failed to verify profile', 'error');
  }
}

// Show the pending-retry UI section and start both countdown timers
function showPendingRetryUI(retryAvailableAt, retryExpiresAt) {
  // Hide all other LeetCode sections
  document.getElementById('leetcode-not-connected').style.display = 'none';
  document.getElementById('leetcode-code-generated').style.display = 'none';
  document.getElementById('leetcode-code-expired').style.display = 'none';
  document.getElementById('leetcode-connected').style.display = 'none';
  document.getElementById('leetcode-pending-retry').style.display = 'block';

  // Status badge
  const leetcodeStatus = document.getElementById('leetcode-status');
  setLcStatus(leetcodeStatus, 'pending', '<i data-lucide="refresh-cw"></i> Verification pending');

  // Show the verification code in the pending section so user can double-check their bio
  const codeText = document.getElementById('leetcode-verification-code').textContent;
  document.getElementById('leetcode-pending-code-display').textContent = codeText || '(your code)';

  startRetryCountdown(retryAvailableAt, retryExpiresAt);
}

// Dual countdown: enables button after 5 min, resets to State 1 after 15 min
function startRetryCountdown(retryAvailableAt, retryExpiresAt) {
  // Clear any existing timer first
  if (leetcodeRetryTimerInterval) {
    clearInterval(leetcodeRetryTimerInterval);
    leetcodeRetryTimerInterval = null;
  }

  const btn        = document.getElementById('leetcode-check-status-btn');
  const timerEl   = document.getElementById('leetcode-retry-timer');
  const windowEl  = document.getElementById('leetcode-window-countdown');
  const availMs   = new Date(retryAvailableAt).getTime();
  const expiresMs = new Date(retryExpiresAt).getTime();

  function tick() {
    const now = Date.now();

    // 15-min window expired → auto-reset to State 1
    if (now >= expiresMs) {
      clearInterval(leetcodeRetryTimerInterval);
      leetcodeRetryTimerInterval = null;
      loadLeetCodeProfileStatus(); // DB was auto-cleared by next generateVerificationCode call or we show generate code state
      return;
    }

    // Window remaining (shown in footer text)
    const winMs   = expiresMs - now;
    const wMins   = Math.floor(winMs / 60000);
    const wSecs   = Math.floor((winMs % 60000) / 1000);
    if (windowEl) windowEl.textContent = `${wMins}:${wSecs.toString().padStart(2, '0')}`;

    if (now < availMs) {
      // Phase 1: button disabled, show enable countdown
      const remMs  = availMs - now;
      const rMins  = Math.floor(remMs / 60000);
      const rSecs  = Math.floor((remMs % 60000) / 1000);
      if (timerEl) timerEl.innerHTML = `<i data-lucide="clock"></i> Check available in ${rMins}:${rSecs.toString().padStart(2, '0')}`;
      if (btn) btn.disabled = true;
    } else {
      // Phase 2: button enabled
      if (timerEl) timerEl.innerHTML = '<i data-lucide="check-circle"></i> Ready — click Check Status below';
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="refresh-cw"></i> Check Status'; }
    }
  }

  tick();
  leetcodeRetryTimerInterval = setInterval(tick, 1000);
}

// Called when user clicks "Check Status" button (re-uses the same verify endpoint)
async function checkLeetCodeVerificationStatus() {
  const btn = document.getElementById('leetcode-check-status-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="clock"></i> Checking...'; }

  try {
    const data = await apiFetch(`${API}/api/leetcode/verify-profile`, {
      method: 'POST',
      body: JSON.stringify({})
    });

    if (data.verified) {
      // SUCCESS — clear timer, show verified state
      if (leetcodeRetryTimerInterval) {
        clearInterval(leetcodeRetryTimerInterval);
        leetcodeRetryTimerInterval = null;
      }
      showToast('LeetCode profile verified!', 'success');
      await loadLeetCodeProfileStatus();
    } else if (data.finalFailure) {
      // FAIL — clear timer, reset to State 1
      if (leetcodeRetryTimerInterval) {
        clearInterval(leetcodeRetryTimerInterval);
        leetcodeRetryTimerInterval = null;
      }
      showToast(data.message || 'Verification failed. Please check your bio and try again.', 'error');
      await loadLeetCodeProfileStatus();
    }
  } catch (error) {
    // Re-enable button so user can try again
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="refresh-cw"></i> Check Status'; }
    if (error.status === 429 || (error.message && error.message.includes('429'))) {
      showToast('Please wait for the timer before retrying', 'warn');
    } else {
      showToast(error.message || 'Check failed', 'error');
    }
  }
}

// Validate LeetCode problem submission (for modal UI)
async function validateLeetCodeProblemForModal() {
  const problemUrlInput = document.getElementById('leetcode-problem-url');
  const problemUrl = problemUrlInput.value.trim();

  if (!problemUrl) {
    showToast('Please enter a LeetCode problem URL', 'error');
    return;
  }

  // Validate URL format
  if (!problemUrl.includes('leetcode.com/problems/')) {
    showToast('Please enter a valid LeetCode problem URL', 'error');
    return;
  }

  try {
    // Extract problem title from URL for preview
    const problemTitle = extractProblemTitleFromUrl(problemUrl);
    if (!problemTitle) {
      showToast('Could not extract problem title from URL', 'error');
      return;
    }

    // Show preview with basic info
    const previewDiv = document.getElementById('leetcode-problem-preview');
    const titleElement = document.getElementById('leetcode-problem-title');
    const difficultyElement = document.getElementById('leetcode-problem-difficulty');

    titleElement.textContent = problemTitle.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    difficultyElement.textContent = 'Validating...';
    previewDiv.style.display = 'block';

    // Get the day date for validation
    if (!currentLeetCodeDayId) {
      showToast('No day selected. Please try again.', 'error');
      difficultyElement.textContent = 'Error';
      difficultyElement.style.color = '#ef4444';
      return;
    }

    const dayData = await apiFetch(`${API}/api/days/id/${currentLeetCodeDayId}`);

    // Validate the problem using backend API
    const validation = await validateLeetCodeProblem(problemUrl, dayData.date);

    // Get problem details for display
    const problemDetails = await getProblemDetailsFromAPI(problemTitle);

    if (problemDetails) {
      difficultyElement.textContent = problemDetails.difficulty || 'Unknown';
      difficultyElement.style.color = getDifficultyColor(problemDetails.difficulty);
    } else {
      difficultyElement.textContent = 'Unknown';
      difficultyElement.style.color = '#666';
    }

    // Show validation result
    const resultDiv = document.getElementById('leetcode-validation-result');
    resultDiv.style.display = 'block';

    if (validation.valid) {
      // Format the submission time
      const submissionTime = new Date(validation.acceptedDate);
      const formattedTime = submissionTime.toLocaleString();

      resultDiv.style.background = '#d1fae5';
      resultDiv.style.color = '#10b981';
      resultDiv.innerHTML = `
        <div style="margin-bottom: 8px;"><i data-lucide="check-circle"></i> <strong>Validation Successful!</strong></div>
        <div style="font-size: 13px; margin-bottom: 4px;">Problem: <strong>${validation.problemTitle || problemDetails.title}</strong></div>
        <div style="font-size: 13px; margin-bottom: 4px;">Difficulty: <strong>${validation.difficulty || problemDetails.difficulty}</strong></div>
        <div style="font-size: 13px; margin-bottom: 4px;">Accepted on: <strong>${formattedTime}</strong></div>
        <div style="font-size: 12px; color: #065f46; margin-top: 8px;">You can now add this to your daily tasks</div>
      `;

      // Cache the validation result so addLeetCodeProblem can reuse it without a second API call
      currentLeetCodeValidation = validation;

      // Enable add button only after successful validation
      document.getElementById('add-leetcode-btn').disabled = false;
    } else {
      resultDiv.style.background = '#fee2e2';
      resultDiv.style.color = '#ef4444';
      resultDiv.innerHTML = `
        <div style="margin-bottom: 8px;">❌ <strong>Validation Failed</strong></div>
        <div style="font-size: 13px;">${validation.message}</div>
        <div style="font-size: 12px; color: #991b1b; margin-top: 8px;">Please try a different problem or check if you solved it on this date</div>
      `;

      // Disable add button if validation failed
      document.getElementById('add-leetcode-btn').disabled = true;
    }
  } catch (error) {
    console.error('Error validating problem:', error);
    showToast('Error validating problem. Please try again.', 'error');

    // Show error message
    const resultDiv = document.getElementById('leetcode-validation-result');
    resultDiv.style.display = 'block';
    resultDiv.style.background = '#fee2e2';
    resultDiv.style.color = '#ef4444';
    resultDiv.innerHTML = `
      <div style="margin-bottom: 8px;">❌ <strong>Error</strong></div>
      <div style="font-size: 13px;">Failed to validate problem. Please try again.</div>
      <div style="font-size: 12px; color: #991b1b; margin-top: 8px;">Error: ${error.message || 'Unknown error'}</div>
    `;

    // Disable add button on error
    document.getElementById('add-leetcode-btn').disabled = true;
  }
}

// Validate LeetCode problem submission (for API validation)
async function validateLeetCodeProblem(problemUrl, dayDate) {
  try {
    const data = await apiFetch(`${API}/api/leetcode/validate-problem`, {
      method: 'POST',
      body: JSON.stringify({ problemUrl, dayDate })
    });

    return {
      valid: true,
      problemTitle: data.problemTitle,
      difficulty: data.difficulty,
      acceptedDate: data.acceptedDate,
      submissionCount: data.submissionCount
    };
  } catch (error) {
    console.error('Error validating LeetCode problem:', error);
    return {
      valid: false,
      message: error.message || 'Failed to validate problem'
    };
  }
}

// Get daily LeetCode problem
async function getDailyLeetCodeProblem() {
  try {
    const data = await apiFetch(`${API}/api/leetcode/daily-problem`);
    return data;
  } catch (error) {
    console.error('Error getting daily LeetCode problem:', error);
    return null;
  }
}

// Add LeetCode problem to daily card
async function addLeetCodeProblem() {
  if (!currentLeetCodeDayId) {
    showToast('No day selected', 'error');
    return;
  }

  // Reuse the cached validation result — no second API call needed
  if (!currentLeetCodeValidation || !currentLeetCodeValidation.valid) {
    showToast('Please validate the problem first before adding', 'error');
    return;
  }

  const validation = currentLeetCodeValidation;

  // Build a safe title: prefer backend-returned title, fall back to the URL slug
  const problemUrlInput = document.getElementById('leetcode-problem-url');
  const problemUrl = (problemUrlInput && problemUrlInput.value.trim()) || '';
  const slugFallback = problemUrl
    ? (extractProblemTitleFromUrl(problemUrl) || '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    : 'Unknown Problem';
  const taskTitle = validation.problemTitle || slugFallback;

  try {
    // Add LeetCode problem as a task under the LeetCode category
    const taskData = {
      title: `\uD83E\uDDE0 LeetCode: ${taskTitle}`,
      completed: true,
      metadata: {
        problemUrl: problemUrl,
        difficulty: validation.difficulty,
        acceptedDate: validation.acceptedDate,
        submissionCount: validation.submissionCount,
        verified: true
      }
    };

    await apiFetch(`${API}/api/days/${currentLeetCodeDayId}`, {
      method: 'PUT',
      body: JSON.stringify({ tasks: [taskData] })
    });

    showToast(`LeetCode: "${taskTitle}" added to daily tasks!`, 'success');
  } catch (error) {
    console.error('Error adding LeetCode problem:', error);
    showToast(error.message || 'Failed to add problem', 'error');
    return; // Keep modal open so user can try again
  }

  // Clean up and close modal only after successful save
  try {
    if (problemUrlInput) problemUrlInput.value = '';
    document.getElementById('leetcode-problem-preview').style.display = 'none';
    document.getElementById('leetcode-validation-result').style.display = 'none';
    document.getElementById('add-leetcode-btn').disabled = true;
    currentLeetCodeValidation = null;
    closeModal('modal-add-leetcode');

    // Refresh the days display
    await loadDays();

    // Update LeetCode button states after reload
    try {
      const user = await apiFetch(`${API}/api/auth/settings`);
      updateLeetCodeButtonsStatus(!!user.leetcodeLastVerifiedAt);
    } catch (e) {
      console.error('Error updating LeetCode button status:', e);
    }
  } catch (error) {
    console.error('Error cleaning up after adding problem:', error);
    try { closeModal('modal-add-leetcode'); } catch (e) { /* ignore */ }
  }
}

// Open LeetCode problem modal for a specific day
async function openLeetCodeProblemModal(dayId, dayDate) {
  // Check if user has verified LeetCode profile first
  try {
    const user = await apiFetch(`${API}/api/auth/settings`);
    if (!user.leetcodeLastVerifiedAt) {
      showToast('Please verify your LeetCode profile first', 'error');
      // Open profile modal to guide user
      openProfileModal();
      return;
    }
  } catch (error) {
    console.error('Error checking profile verification:', error);
    showToast('Unable to verify profile status', 'error');
    return;
  }

  const modal = document.getElementById('modal-add-leetcode');
  if (!modal) {
    console.error('LeetCode modal not found');
    return;
  }

  // Clear previous data and reset state (but don't clear day ID yet)
  resetLeetCodeModalState();

  // Set the day ID AFTER resetting state
  currentLeetCodeDayId = dayId;

  // Show the modal using the proper function
  openModal('modal-add-leetcode');
}

// Load LeetCode profile status
async function loadLeetCodeProfileStatus() {
  try {
    // 1. STALE: Try cache first
    const userId = localStorage.getItem('userId');
    if (userId && window.localDb) {
      const cached = await window.localDb.userProfile.get(userId);
      if (cached) renderLeetCodeUI(cached);
    }

    // 2. REVALIDATE: Fetch fresh if online
    if (navigator.onLine) {
      const user = await apiFetch(`${API}/api/auth/settings`);
      renderLeetCodeUI(user);
    }
  } catch (error) {
    console.error('Error loading LeetCode profile status:', error);
  }
}

/** Helper to render LeetCode UI components from user data */
function renderLeetCodeUI(user) {
  if (!user) return;
  
  const leetcodeUsernameDisplay = document.getElementById('leetcode-username-display');
  const leetcodeStatus         = document.getElementById('leetcode-status');
  const leetcodeProfilePic     = document.getElementById('leetcode-profile-pic');
  const leetcodeUsernameInput  = document.getElementById('leetcode-username');
  const remainingChanges       = document.getElementById('leetcode-remaining-changes');
  
  if (!leetcodeUsernameDisplay || !leetcodeStatus) return;

  // Derived state
  const isVerified  = !!(user.leetcodeUsername && user.leetcodeLastVerifiedAt);
  const hasPending  = !!(user.leetcodePendingUsername && user.leetcodeVerificationCode);
  const displayName = user.leetcodeUsername || user.leetcodePendingUsername || null;
  const inputName   = user.leetcodePendingUsername || user.leetcodeUsername || '';

  if (leetcodeUsernameInput) leetcodeUsernameInput.value = inputName;
  if (displayName) leetcodeUsernameDisplay.textContent = displayName;

  // Helper — hides all sub-sections
  function hideAllSections() {
    ['leetcode-not-connected', 'leetcode-code-generated', 'leetcode-code-expired', 'leetcode-pending-retry', 'leetcode-connected'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  const isPendingRetryActive = user.leetcodeVerificationStatus === 'pending_retry' && 
                               user.leetcodeRetryScheduledAt && 
                               Date.now() < (new Date(user.leetcodeRetryScheduledAt).getTime() + 15 * 60 * 1000);

  if (isPendingRetryActive) {
    const scheduledMs    = new Date(user.leetcodeRetryScheduledAt).getTime();
    const retryAvailMs   = scheduledMs + 5  * 60 * 1000;
    const retryExpiresMs = scheduledMs + 15 * 60 * 1000;

    setLcStatus(leetcodeStatus, 'pending', '🔄 Verification pending');

    if (user.leetcodeVerificationCode) {
      const vCode = document.getElementById('leetcode-verification-code');
      const pCode = document.getElementById('leetcode-pending-code-display');
      if (vCode) vCode.textContent = user.leetcodeVerificationCode;
      if (pCode) pCode.textContent = user.leetcodeVerificationCode;
    }

    hideAllSections();
    const prSec = document.getElementById('leetcode-pending-retry');
    if (prSec) prSec.style.display = 'block';
    
    // Only start countdown if we are in the active window
    if (typeof startRetryCountdown === 'function') {
      startRetryCountdown(
        new Date(retryAvailMs).toISOString(),
        new Date(retryExpiresMs).toISOString()
      );
    }
    updateLeetCodeButtonsStatus(false);

  } else if (isVerified) {
    setLcStatus(leetcodeStatus, 'verified', '✅ Verified');

    hideAllSections();
    const connSec = document.getElementById('leetcode-connected');
    if (connSec) {
      connSec.style.display = 'block';
      const connUser = document.getElementById('leetcode-connected-username');
      const remChanges = document.getElementById('leetcode-changes-remaining');
      if (connUser) connUser.textContent = user.leetcodeUsername;
      if (remChanges) remChanges.textContent = MAX_USERNAME_CHANGES - (user.leetcodeUsernameChangeCount || 0);
    }

    if (user.leetcodeProfilePicture && leetcodeProfilePic) {
      leetcodeProfilePic.src = user.leetcodeProfilePicture;
      leetcodeProfilePic.style.display = 'block';
    }
    updateLeetCodeButtonsStatus(true);

  } else if (hasPending) {
    const isExpired = user.leetcodeVerificationExpiry &&
                      new Date() > new Date(user.leetcodeVerificationExpiry);

    if (isExpired) {
      setLcStatus(leetcodeStatus, 'error', '<i data-lucide="alert-circle"></i> Code expired');
      hideAllSections();
      const expSec = document.getElementById('leetcode-code-expired');
      if (expSec) expSec.style.display = 'block';
    } else {
      setLcStatus(leetcodeStatus, 'waiting', '<i data-lucide="clock"></i> Pending verification');

      const vCode = document.getElementById('leetcode-verification-code');
      if (vCode) {
        vCode.textContent = user.leetcodeVerificationCode;
        vCode.style.display = 'block';
      }

      if (user.leetcodeVerificationExpiry) {
        const expiryTime = new Date(user.leetcodeVerificationExpiry);
        const timeLeft   = Math.max(0, Math.floor((expiryTime - new Date()) / 60000));
        let msg = `Expires: ${expiryTime.toLocaleString()}`;
        if (timeLeft > 0 && timeLeft < 60) msg += ` (${timeLeft} min left)`;
        const expEl = document.getElementById('leetcode-code-expiry');
        if (expEl) {
          expEl.textContent = msg;
          expEl.style.display = 'block';
        }
      }

      hideAllSections();
      const genSec = document.getElementById('leetcode-code-generated');
      if (genSec) genSec.style.display = 'block';
    }
    updateLeetCodeButtonsStatus(false);

  } else {
    if (leetcodeUsernameDisplay) leetcodeUsernameDisplay.textContent = 'Not connected';
    setLcStatus(leetcodeStatus, 'error', '❌ Not connected');
    if (leetcodeProfilePic) leetcodeProfilePic.style.display = 'none';
    hideAllSections();
    const ncSec = document.getElementById('leetcode-not-connected');
    if (ncSec) ncSec.style.display = 'block';
    updateLeetCodeButtonsStatus(false);
  }

  if (remainingChanges) {
    remainingChanges.textContent =
      `Remaining changes: ${MAX_USERNAME_CHANGES - (user.leetcodeUsernameChangeCount || 0)}`;
  }
}

// Update all LeetCode buttons to show verification status
function updateLeetCodeButtonsStatus(isVerified) {
  const leetcodeButtons = document.querySelectorAll('[id^="leetcode-btn-"]');
  leetcodeButtons.forEach(button => {
    if (isVerified) {
      button.style.opacity = '1';
      button.style.cursor = 'pointer';
      button.style.pointerEvents = 'auto';
      button.title = 'Add LeetCode problem';
    } else {
      button.style.opacity = '0.5';
      button.style.cursor = 'not-allowed';
      button.style.pointerEvents = 'none';
      button.title = 'Verify your LeetCode profile first';
    }
  });
}

// Copy LeetCode verification code to clipboard
function copyLeetCodeCode() {
  const codeElement = document.getElementById('leetcode-verification-code');
  const code = codeElement.textContent;

  navigator.clipboard.writeText(code).then(() => {
    showToast('Verification code copied to clipboard!', 'success');
  }).catch(err => {
    console.error('Failed to copy code:', err);
    showToast('Failed to copy code', 'error');
  });
}

// Change LeetCode username
function changeLeetCodeUsername() {
  const leetcodeUsernameInput = document.getElementById('leetcode-username');
  const newUsername = leetcodeUsernameInput.value.trim();

  if (!newUsername) {
    showToast('Please enter a new LeetCode username', 'error');
    return;
  }

  // Reset the UI to show the not connected state
  document.getElementById('leetcode-not-connected').style.display = 'block';
  document.getElementById('leetcode-code-generated').style.display = 'none';
  document.getElementById('leetcode-code-expired').style.display = 'none';
  document.getElementById('leetcode-pending-retry').style.display = 'none';
  document.getElementById('leetcode-connected').style.display = 'none';

  // Reset status
  const leetcodeStatus = document.getElementById('leetcode-status');
  setLcStatus(leetcodeStatus, 'error', '❌ Not connected');

  showToast('Enter your new username and generate a new verification code', 'info');
}

// Helper functions for LeetCode integration

// Extract problem title from URL
function extractProblemTitleFromUrl(url) {
  try {
    const patterns = [
      /leetcode\.com\/problems\/([^\/\?]+)/,  // Matches problem-title or problem-title/description
      /leetcode\.com\/problems\/([^\/\?]+)\/?/,  // Matches with optional trailing slash
      /leetcode\.com\/problems\/([^\/\?]+)\/?[^\/]*\/?/  // Matches with additional path segments
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        // If the matched part contains a slash, take only the first part (the problem title)
        const problemTitle = match[1].split('/')[0];
        return problemTitle;
      }
    }

    return null;
  } catch (error) {
    console.error('Error extracting problem title:', error);
    return null;
  }
}

// Get problem details from API
async function getProblemDetailsFromAPI(problemTitle) {
  // Try REST API first
  try {
    const LEETCODE_API_BASE_URL = 'https://alfa-leetcode-api.onrender.com';
    const response = await fetch(`${LEETCODE_API_BASE_URL}/select?titleSlug=${problemTitle}`, {
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
      console.error('API response not ok:', response.status, response.statusText);
      throw new Error('Failed to fetch problem details');
    }

    const problemData = await response.json();

    // Handle different API response formats
    const title = problemData.title || problemData.questionTitle || problemData.question_title;
    const difficulty = problemData.difficulty || problemData.difficulty_level;

    if (title) {
      return {
        title: title,
        difficulty: difficulty || 'Unknown',
        topicTags: problemData.topicTags || problemData.tags || []
      };
    }
  } catch (error) {
    console.error('REST API failed, trying GraphQL:', error.message);
  }

  // Fallback to GraphQL API
  try {
    const graphqlQuery = {
      query: `
        query getQuestionDetail($titleSlug: String!) {
          question(titleSlug: $titleSlug) {
            title
            difficulty
            topicTags {
              name
            }
          }
        }
      `,
      variables: {
        titleSlug: problemTitle
      }
    };

    const response = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(graphqlQuery),
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
      throw new Error('GraphQL API failed');
    }

    const data = await response.json();

    if (data.data && data.data.question) {
      const question = data.data.question;
      return {
        title: question.title,
        difficulty: question.difficulty,
        topicTags: question.topicTags || []
      };
    }
  } catch (error) {
    console.error('GraphQL API failed:', error.message);
  }

  // If both APIs fail, return null
  return null;
}

// Get color based on difficulty
function getDifficultyColor(difficulty) {
  switch (difficulty?.toLowerCase()) {
    case 'easy':
      return '#10b981'; // green
    case 'medium':
      return '#f59e0b'; // orange
    case 'hard':
      return '#ef4444'; // red
    default:
      return '#666'; // gray
  }
}

/* ==========================================================================
   PWA Installation Logic
   ========================================================================== */
let deferredPrompt;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // 1. Force unregister any old/stale workers to clear the "Not Supported" ghost code
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (let registration of registrations) {
        await registration.unregister();
        console.log('Old SW unregistered');
      }

      // 2. Register the fresh v15 worker with a version query to force-bypass cache
      const reg = await navigator.serviceWorker.register('sw.js?v=27');
      // console.log('Fresh SW registered (v13):', reg);
      
      // Force immediate takeover
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

    } catch (err) {
      console.error('ServiceWorker registration failed:', err);
    }
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  
  // Only start sequence if not already installed and not shown this session
  if (!isAppInstalled() && !sessionStorage.getItem('pwaPromptShown')) {
    initiatePwaPromptSequence();
  }
});

/** Check if the app is already running in standalone/installed mode */
function isAppInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

/** 
 * Logic to show the prompt only after SW is ready and user is engaged.
 * This prevents "shortcut" installs and ensures native PWA behavior.
 */
async function initiatePwaPromptSequence() {
  try {
    // 1. Wait for Service Worker to be fully ready
    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker.ready;
    }

    // 2. Wait for 20 seconds of engagement (thinking time for the browser)
    await new Promise(resolve => setTimeout(resolve, 20000));

    // 3. Wait for user engagement (Scroll)
    const triggerModal = () => {
      // Only show if the event was captured and hasn't been shown yet
      if (deferredPrompt && !sessionStorage.getItem('pwaPromptShown')) {
        const modal = document.getElementById('pwa-modal-overlay');
        if (modal) {
          modal.style.display = 'flex';
          sessionStorage.setItem('pwaPromptShown', 'true');
        }
      }
      window.removeEventListener('scroll', triggerModal);
    };

    window.addEventListener('scroll', triggerModal, { once: true });
    
    // Fallback: If they don't scroll but keep interacting, show it anyway after a bit more time
    setTimeout(triggerModal, 15000);

  } catch (err) {
    console.error('PWA Prompt Sequence failed:', err);
  }
}


function dismissPwaPrompt() {
  const modal = document.getElementById('pwa-modal-overlay');
  if (modal) modal.style.display = 'none';
}

async function installPWA() {
  const modal = document.getElementById('pwa-modal-overlay');
  if (modal) modal.style.display = 'none';

  if (!deferredPrompt) {
    showToast('App is already installed or your browser requires you to install it via the browser menu (e.g. Share > Add to Home Screen).', 'info');
    return;
  }
  
  // Show the install prompt
  deferredPrompt.prompt();
  
  // Wait for the user to respond to the prompt
  const { outcome } = await deferredPrompt.userChoice;
  console.log(`User response to the install prompt: ${outcome}`);
  
  // We've used the prompt, and can't use it again, throw it away
  deferredPrompt = null;
  
  // Hide profile container if installed
  if (outcome === 'accepted') {
    const profileContainer = document.getElementById('pwa-install-container');
    if (profileContainer) profileContainer.style.display = 'none';
  }
}

window.addEventListener('appinstalled', (evt) => {
  console.log('INSTALL: Success');
  const profileContainer = document.getElementById('pwa-install-container');
  if (profileContainer) profileContainer.style.display = 'none';
});

/**
 * Give Feedback / Review
 */
function openFeedbackModal() {
  const nameEl = document.getElementById('feedback-name');
  const emailEl = document.getElementById('feedback-email');
  
  // Fill with logged-in user data
  if (nameEl) nameEl.value = localStorage.getItem('userName') || 'User';
  if (emailEl) emailEl.value = localStorage.getItem('userEmail') || '';
  
  // Reset form
  document.getElementById('feedback-form').style.display = 'block';
  document.getElementById('feedback-success-msg').style.display = 'none';
  document.getElementById('feedback-text').value = '';
  
  openModal('modal-feedback');
}

async function submitFeedback(e) {
  e.preventDefault();
  
  const name = document.getElementById('feedback-name').value;
  const email = document.getElementById('feedback-email').value;
  const description = document.getElementById('feedback-text').value;
  const submitBtn = document.getElementById('btn-submit-feedback');
  
  // Auto-attach Verified badge
  const userBadges = ['Verified Account'];
  
  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    
    const res = await fetch(`${API}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, description, userBadges })
    });
    
    if (res.ok) {
      document.getElementById('feedback-form').style.display = 'none';
      document.getElementById('feedback-success-msg').style.display = 'block';
      
      // Auto close after 2 seconds
      setTimeout(() => {
        closeModal('modal-feedback');
      }, 2500);
    } else {
      const data = await res.json();
      showToast(data.message || 'Failed to submit review', 'error');
    }
  } catch (err) {
    console.error('Feedback error:', err);
    showToast('Network error while submitting feedback', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i data-lucide="rocket"></i> Submit Review';
    if (window.lucide) lucide.createIcons({ root: submitBtn });
  }
}

/**
 * Share public profile link using Web Share API or Clipboard fallback
 */
async function sharePublicProfile() {
  let username = localStorage.getItem('userUsername');
  
  // Fallback: try to get it from the profile modal input if it's open
  if (!username) {
    const input = document.getElementById('profile-username');
    if (input && input.value) {
      username = input.value.trim();
      if (username) localStorage.setItem('userUsername', username);
    }
  }

  if (!username) {
    showToast('Please set a username in settings first.', 'warn');
    return;
  }

  try {
    const logData = await logShare(navigator.share ? 'native' : 'clipboard');
    const shareCode = logData ? logData.shareCode : null;
    const shareUrl = shareCode 
      ? `${window.location.origin}/profile.html?u=${username}&code=${shareCode}`
      : `${window.location.origin}/profile.html?u=${username}`;

    const shareData = {
      title: 'Consistency Daily Profile',
      text: `Check out my consistency journey on Consistency Daily! ${backendStreak} day streak and counting!`,
      url: shareUrl
    };

    if (navigator.share) {
      await navigator.share(shareData);
      showToast('Profile shared successfully!', 'success');
    } else {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Profile link copied to clipboard!', 'success');
    }
  } catch (err) {
    console.error('Share failed:', err);
    if (err.name !== 'AbortError') {
      showToast('Could not share profile. Link copied to clipboard instead.', 'info');
      navigator.clipboard.writeText(shareUrl);
    }
  }
}

/**
 * Log the share event to the backend
 */
async function logShare(platform) {
  try {
    return await apiFetch(`${API}/api/users/log-share`, {
      method: 'POST',
      body: JSON.stringify({ platform })
    });
  } catch (err) {
    console.error('Failed to log share:', err);
    return null;
  }
}

/**
 * Open the public profile page in a new tab
 */
async function previewOwnProfile() {
  let username = localStorage.getItem('userUsername');
  if (!username) {
    const input = document.getElementById('profile-username');
    if (input && input.value) {
      username = input.value.trim();
      if (username) localStorage.setItem('userUsername', username);
    }
  }
  if (!username) {
    showToast('Please set a username in settings first.', 'warn');
    return;
  }
  
  try {
    const logData = await logShare('preview');
    const shareCode = logData ? logData.shareCode : null;
    const url = shareCode 
      ? `profile.html?u=${username}&code=${shareCode}`
      : `profile.html?u=${username}`;
    window.open(url, '_blank');
  } catch (err) {
    window.open(`profile.html?u=${username}`, '_blank');
  }
}


// ── Leaderboard ───────────────────────────────────────────

function setLeaderboardSort(type) {
  if (lbSort === type && lbPage > 1) return; 
  lbSort = type;
  
  // UI feedback for buttons
  const btnCurrent = document.getElementById('btn-sort-current');
  const btnHighest = document.getElementById('btn-sort-highest');
  if (btnCurrent) btnCurrent.classList.toggle('active', lbSort === 'current');
  if (btnHighest) btnHighest.classList.toggle('active', lbSort === 'highest');
  
  loadLeaderboard(true);
}

async function loadLeaderboard(reset = false) {
  if (lbIsLoading) return;
  if (reset) {
    lbPage = 1;
    const listContainer = document.getElementById('leaderboard-list');
    if (listContainer) listContainer.innerHTML = '';
    const myRankArea = document.getElementById('lb-my-rank-area');
    if (myRankArea) myRankArea.innerHTML = '';
  }

  lbIsLoading = true;
  const loadingEl = document.getElementById('lb-loading');
  if (loadingEl) loadingEl.style.display = 'block';
  const loadMoreWrap = document.getElementById('leaderboard-load-more-wrap');
  if (loadMoreWrap) loadMoreWrap.style.display = 'none';

  // 1. STALE: If first page, try loading from cache instantly
  if (reset) {
    try {
      const cached = await window.localDb.leaderboard.get(lbSort);
      if (cached && cached.users) {
        renderLeaderboardData(cached.users, true);
        if (loadingEl) loadingEl.style.display = 'none';
      }
    } catch (e) {}
  }

  // 2. REVALIDATE: Fetch from server
  try {
    const res = await apiFetch(`${API}/api/users/leaderboard?sort=${lbSort}&page=${lbPage}&limit=10`);
    if (!res) return;

    const { users, total, hasMore } = res;
    lbHasMore = hasMore;
    
    // Cache the first page for offline access
    if (reset && users.length > 0) {
      await window.localDb.leaderboard.put({ sort: lbSort, users, timestamp: Date.now() });
    }

    renderLeaderboardData(users, reset);

    const loadMoreWrapFinal = document.getElementById('leaderboard-load-more-wrap');
    if (loadMoreWrapFinal) loadMoreWrapFinal.style.display = lbHasMore ? 'block' : 'none';
    lbPage++;

    // My Rank Spotlight (if first page)
    if (reset) {
      const myUsername = localStorage.getItem('userUsername');
      const isMeInTop10 = users.some(u => u.username === myUsername);
      
      if (!isMeInTop10 && myUsername) {
        const me = {
          name: localStorage.getItem('userName') || 'You',
          username: myUsername,
          profilePicture: localStorage.getItem('userProfilePicture'),
          currentStreak: parseInt(localStorage.getItem('userCurrentStreak')) || 0,
          highestStreak: parseInt(localStorage.getItem('userHighestStreak')) || 0
        };
        
        const myRankArea = document.getElementById('lb-my-rank-area');
        if (myRankArea) {
          const myRankCard = renderLeaderboardItem(me, '?', true);
          myRankCard.classList.add('my-rank-card');
          myRankArea.appendChild(myRankCard);
        }
      }
    }

    // Refresh icons
    if (window.lucide) lucide.createIcons();

  } catch (err) {
    console.error('Leaderboard load error:', err);
  } finally {
    lbIsLoading = false;
    const loadingElFinal = document.getElementById('lb-loading');
    if (loadingElFinal) loadingElFinal.style.display = 'none';
  }
}

function renderLeaderboardItem(user, rank, isSpotlight = false) {
  const card = document.createElement('div');
  card.className = 'lb-card';
  
  let rankClass = '';
  if (rank === 1) {
    rankClass = 'rank-1';
    card.classList.add('card-rank-1');
  } else if (rank === 2) {
    rankClass = 'rank-2';
    card.classList.add('card-rank-2');
  } else if (rank === 3) {
    rankClass = 'rank-3';
    card.classList.add('card-rank-3');
  }

  const avatarHtml = user.profilePicture 
    ? `<img src="${user.profilePicture}" class="lb-avatar" onclick="event.stopPropagation(); openLightbox('${user.profilePicture}')" alt="${escapeHTML(user.username)}">`
    : `<div class="lb-avatar" style="display:flex; align-items:center; justify-content:center; font-weight:900; font-size:20px; background:var(--bg-muted); color:var(--text-muted);">${(user.username || '?').charAt(0).toUpperCase()}</div>`;

  card.innerHTML = `
    <div class="lb-rank ${rankClass}">${rank === '?' ? '<i data-lucide="user"></i>' : rank}</div>
    ${avatarHtml}
    <div class="lb-info">
      <div class="lb-name-row">
        <span class="lb-name">${escapeHTML(user.name)}</span>
        ${rank === 1 ? '<span>👑</span>' : ''}
      </div>
      <div class="lb-username">@${escapeHTML(user.username)}</div>
    </div>
    <div class="lb-stats">
      <div class="lb-streak-box current" title="Current Streak">
        <span class="lb-streak-val">${user.currentStreak}</span>
        <span class="lb-streak-label"><span class="lb-label-main">Current</span><span class="lb-label-extra"> Streak</span></span>
      </div>
      <div class="lb-streak-box highest" title="Highest Streak">
        <span class="lb-streak-val">${user.highestStreak || 0}</span>
        <span class="lb-streak-label"><span class="lb-label-main">Highest</span><span class="lb-label-extra"> Streak</span></span>
      </div>
    </div>
  `;

  card.onclick = () => {
    openQuickView(user.username);
  };

  return card;
}

// ── GROUP CHAT LOGIC ────────────────────────────────────────

let activeChatGroupId = null;
let chatUnsubscribe = null;
let videoCallUnsubscribe = null;
let jitsiApi = null;
let chatMessagesLimit = 30;
let activeReplyTo = null;
let isPaginating = false;
let prevScrollHeight = 0;
let selectedMediaBlobs = []; // Array of { blob, type }
let imageLimitRemaining = 20; 
let audioLimitRemaining = 20; // recordings
let audioFileLimitRemaining = 5; // manual uploads
let lastMessageSentAt = 0; // For anti-spam cooldown

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
    const res = await apiFetch(`${API}/api/auth/media-upload-limit`);
    imageLimitRemaining = res.imageRemaining;
    audioLimitRemaining = res.audioRemaining;
    audioFileLimitRemaining = (res.audioFileRemaining !== undefined) ? res.audioFileRemaining : 5;
    updateMediaLimitDisplay();
  } catch (err) {
    console.error('Failed to fetch media limit:', err);
  }
}

function updateMediaLimitDisplay() {
  const el = document.getElementById('media-limit-text');
  if (!el) return;
  
  const imgStr = imageLimitRemaining <= 0 ? '<span style="color:var(--red)">Images: 0</span>' : `Images: ${imageLimitRemaining}`;
  const recStr = audioLimitRemaining <= 0 ? '<span style="color:var(--red)">Voice: 0</span>' : `Voice: ${audioLimitRemaining}`;
  const fileStr = audioFileLimitRemaining <= 0 ? '<span style="color:var(--red)">Audio Files: 0</span>' : `Audio Files: ${audioFileLimitRemaining}`;
  
  el.innerHTML = `${imgStr} • ${recStr} • ${fileStr}`;
}
let lastReadUpdate = 0;
let myHighestReadTimestamp = 0;
let readStatusUnsubscribe = null;
let readObserver = null;
let presenceUnsubscribe = null;
let presenceHeartbeatInterval = null;

function openGroupChat(groupId, groupName, groupIcon, resetLimit = true) {
  activeChatGroupId = groupId;
  if (resetLimit) chatMessagesLimit = 30; 
  document.getElementById('chat-group-name').textContent = groupName;
  
  const modal = document.getElementById('modal-group-chat');
  openModal('modal-group-chat');
  fetchMediaLimit();

  // Check if current user is the owner of this group
  const group = (typeof allJoinedGroups !== 'undefined' && allJoinedGroups) 
    ? allJoinedGroups.find(g => g._id === groupId) 
    : null;
  const myUserId = localStorage.getItem('userId');
  
  // The group.owner can be an object with _id or just an ID string
  const isOwner = group && String(group.owner._id || group.owner) === String(myUserId);
  
  const bulkDeleteBtn = document.getElementById('chat-bulk-delete-btn');
  if (bulkDeleteBtn) {
    bulkDeleteBtn.style.display = isOwner ? 'flex' : 'none';
  }

  // Re-initialize all icons in the modal (Fixes missing Close/Send icons)
  if (window.lucide) lucide.createIcons({ root: modal });

  // Real-time Presence
  updatePresence(groupId, true);
  subscribeToPresence(groupId);

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

  // Subscribe to read receipts
  subscribeToReadStatuses(groupId);

  // Set up real-time listener
  const { firebaseDb, firestore } = window;
  if (!firebaseDb || !firestore) {
    container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--red); font-weight:900;">FIREBASE OFFLINE</div>';
    return;
  }

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
        renderChatMessage(msg, msgsList, false);
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
    container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--red); font-weight:900;">CONNECTION ERROR: ${err.code}</div>`;
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
  const callRef = rtdb.ref(firebaseRtdb, `video_calls/${groupId}/participants`);
  
  videoCallUnsubscribe = rtdb.onValue(callRef, (snapshot) => {
    const participants = snapshot.val() || {};
    updateVideoCallUI(participants);
  });
}

function updateVideoCallUI(participants) {
  const pList = Object.values(participants);
  
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
  const userId = localStorage.getItem('userId');
  const isSelf = String(msg.senderId) === String(userId);
  const timestamp = msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date();
  const time = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const docId = msg.id || '';

  const wrapper = document.createElement('div');
  wrapper.className = `chat-bubble-wrapper ${isSelf ? 'self' : 'other'}`;
  wrapper.id = `chat-msg-${docId}`;
  wrapper.dataset.ts = timestamp.getTime().toString();

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${isSelf ? 'self' : 'other'}`;
  
  // Calculate Blue Tick status based on threshold percentage
  let isBlue = false;
  if (isSelf) {
    const tsMillis = timestamp.getTime();
    const group = (typeof allJoinedGroups !== 'undefined' && allJoinedGroups) ? allJoinedGroups.find(g => g._id === activeChatGroupId) : null;
    const totalOthers = group ? Math.max(1, group.members.length - 1) : 1;
    const readCount = Object.values(memberReadStatuses).filter(lr => lr >= tsMillis).length;
    isBlue = (readCount / totalOthers) * 100 >= (globalConfig.chatReadThresholdPct || 10);
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

  if (msg.senderPhoto) {
    avatarHtml = `<div class="chat-avatar" style="margin-right: 8px; ${clickableStyle}" ${onclickHtml}><img src="${msg.senderPhoto}" alt="${escHtml(msg.senderName)}" /></div>`;
  } else {
    const colors = ['#FFD60A', '#FF3EA5', '#64FFDA', '#FF6B35', '#7B5EA7', '#B5FF4D', '#3B82F6'];
    const colorIdx = (msg.senderName || '?').charCodeAt(0) % colors.length;
    const initial = msg.senderName ? msg.senderName.charAt(0).toUpperCase() : '?';
    avatarHtml = `<div class="chat-avatar" style="margin-right: 8px; background: ${colors[colorIdx]}; color: #000; ${clickableStyle}" ${onclickHtml}>${initial}</div>`;
  }

  // Reply Snippet
  let replySnippetHtml = '';
    if (msg.replyTo) {
    replySnippetHtml = `
      <div class="chat-reply-snippet" onclick="scrollToMessage('${msg.replyTo.docId}')">
        ${msg.replyTo.mediaUrl ? `<img data-src="${msg.replyTo.mediaUrl}" class="chat-reply-thumbnail lazy-media" />` : ''}
        <div style="flex:1; min-width:0;">
          <span class="chat-reply-sender">${escHtml(msg.replyTo.senderName)}</span>
          <div class="chat-reply-text">${escHtml(msg.replyTo.text || (msg.replyTo.mediaUrl ? 'Photo' : ''))}</div>
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
      <button class="chat-edit-btn" onclick="setReplyTo('${docId}', '${escJs(msg.text)}', '${escJs(msg.senderName)}', '${msg.mediaUrl || ''}')" title="Reply"><i data-lucide="reply" style="width:16px;height:16px;"></i></button>
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
    <div class="chat-text" id="chat-text-${docId}" style="margin-top: 4px;">${escHtml(msg.text)}</div>
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
  
  if (isSelf) {
    wrapper.appendChild(buttonsHtmlToElement(buttonsHtml));
    wrapper.appendChild(bubble);
  } else {
    wrapper.appendChild(bubble);
    wrapper.appendChild(buttonsHtmlToElement(buttonsHtml));
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
        setReplyTo(msg.id, msg.text || '', msg.senderName, msg.mediaUrl || '');
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

  activeChatGroupId = null;
  closeModal('modal-group-chat');
  clearMediaPreview(); // Reset media selection
}

/** ── JITSI VIDEO CALL INTEGRATION ── **/
async function startGroupVideoCall() {
  const groupId = activeChatGroupId;
  if (!groupId) return;

  const { firebaseRtdb, rtdb } = window;
  const userId = localStorage.getItem('userId');
  const userName = localStorage.getItem('userName');
  const userPhoto = localStorage.getItem('userProfilePicture');

  const btn = document.getElementById('chat-video-call-btn');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-inline"></span>';

  try {
    const res = await apiFetch(`${API}/api/groups/${groupId}/meeting`);
    if (!res.roomId) throw new Error('No Room ID received');
    
    const { roomId } = res;
    
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
      userInfo: {
        displayName: localStorage.getItem('userName') || 'Consistency User',
        avatarUrl: (() => {
          const pic = localStorage.getItem('userProfilePicture');
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
        toolbarButtons: ['microphone', 'camera', 'desktop', 'hangup', 'tileview', 'chat', 'fullscreen']
      },
      interfaceConfigOverwrite: {
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
    const participantRef = rtdb.ref(firebaseRtdb, `video_calls/${groupId}/participants/${userId}`);
    const participantData = {
      name: userName || 'User',
      photo: (userPhoto && userPhoto !== 'undefined' && userPhoto !== 'null') ? userPhoto : null,
      joinedAt: rtdb.serverTimestamp()
    };
    
    console.log(`[VideoCall] Marking self as in-call:`, participantData);
    
    rtdb.set(participantRef, participantData);
    rtdb.onDisconnect(participantRef).remove();
    
    jitsiApi.addEventListener('videoConferenceLeft', () => {
      closeVideoCall();
    });

    jitsiApi.addEventListener('videoConferenceJoined', () => {
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
    });

    jitsiApi.addEventListener('screenSharingStatusChanged', (event) => {
      const indicator = document.getElementById('sharing-indicator');
      if (indicator) {
        indicator.style.display = event.on ? 'flex' : 'none';
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
  if (jitsiApi) {
    jitsiApi.dispose();
    jitsiApi = null;
  }

  // Remove from RTDB
  if (activeChatGroupId) {
    const { firebaseRtdb, rtdb } = window;
    const userId = localStorage.getItem('userId');
    const participantRef = rtdb.ref(firebaseRtdb, `video_calls/${activeChatGroupId}/participants/${userId}`);
    rtdb.remove(participantRef);
  }

  document.getElementById('modal-video-call').style.display = 'none';
  document.body.style.overflow = ''; // Restore scrolling
  document.getElementById('jitsi-container').innerHTML = '';
  
  // New: Force a read-receipt check now that the video call is hidden
  setTimeout(() => {
    if (typeof triggerManualReadCheck === 'function') {
      triggerManualReadCheck();
    }
  }, 300);
}

function updateExistingMessage(msg, el) {
  const bubble = el.querySelector('.chat-bubble');
  if (!bubble) return;
  
  // Update text
  const textEl = bubble.querySelector('.chat-text');
  if (textEl && textEl.textContent !== msg.text) {
    textEl.textContent = msg.text;
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
  const originalHtml = btn.innerHTML;
  
  // Only block the button if uploading media (needs wait)
  if (selectedMediaBlobs.length > 0) {
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="upload-cloud" class="loading-bounce"></i>';
    if (window.lucide) lucide.createIcons({ root: btn });
  }

  const { firebaseDb, firestore } = window;
  const userId = localStorage.getItem('userId');
  const userName = localStorage.getItem('userName');
  const userPhoto = localStorage.getItem('userProfilePicture');
  
  try {
    const msgsRef = firestore.collection(firebaseDb, 'group_chats', activeChatGroupId, 'messages');
    const baseMsgData = {
      senderId: userId || '',
      senderName: userName || 'User',
      senderUsername: localStorage.getItem('userUsername') || '',
      senderPhoto: userPhoto || null,
      timestamp: firestore.serverTimestamp()
    };

    if (activeReplyTo) {
      baseMsgData.replyTo = {
        docId: activeReplyTo.docId || '',
        text: activeReplyTo.text || '',
        senderName: activeReplyTo.senderName || '',
        mediaUrl: activeReplyTo.mediaUrl || null
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
      clearMediaPreview();
    }

  } catch (err) {
    console.error('Send error:', err);
    showToast(err.message || 'Failed to send message.', 'error');
    // If it's a rate limit error, refresh the limit count
    if (err.message && err.message.includes('limit')) {
      fetchMediaLimit();
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    if (window.lucide) lucide.createIcons({ root: btn });
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
  const userId = localStorage.getItem('userId');
  if (!activeChatGroupId) return;
  const docRef = firestore.doc(firebaseDb, 'group_chats', activeChatGroupId, 'messages', docId);
  
  try {
    const docSnap = await firestore.getDoc(docRef);
    if (!docSnap.exists()) return;
    const data = docSnap.data();
    const reactions = data.reactions || {};
    
    if (!reactions[emoji]) reactions[emoji] = [];
    const idx = reactions[emoji].indexOf(userId);
    if (idx > -1) reactions[emoji].splice(idx, 1);
    else reactions[emoji].push(userId);
    
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
  if (!activeChatGroupId) return;
  const docRef = firestore.doc(firebaseDb, 'group_chats', activeChatGroupId, 'messages', docId);
  
  try {
    // 1. Fetch document to check for media
    const snap = await firestore.getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data.mediaUrl) {
        await apiFetch(`${API}/api/auth/chat-media`, {
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
  const userId = localStorage.getItem('userId');
  let html = '<div class="chat-reactions">';
  for (const [emoji, users] of Object.entries(reactions)) {
    const isActive = users.includes(userId);
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
  if (!activeChatGroupId) return;
  
  const docRef = firestore.doc(firebaseDb, 'group_chats', activeChatGroupId, 'messages', docId);
  
  try {
    const docSnap = await firestore.getDoc(docRef);
    
    if (!docSnap.exists()) return;
    const reactions = docSnap.data().reactions || {};
    const userIds = reactions[emoji] || [];

    if (userIds.length === 0) return;

    // Get current user ID
    const myUserId = localStorage.getItem('userId');
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
    const group = (typeof allJoinedGroups !== 'undefined' && allJoinedGroups) 
      ? allJoinedGroups.find(g => g._id === activeChatGroupId) 
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

function setReplyTo(docId, text, senderName, mediaUrl) {
  activeReplyTo = { docId, text, senderName, mediaUrl };
  let preview = document.getElementById('chat-reply-preview');
  if (!preview) {
    const footer = document.querySelector('#modal-group-chat .modal-footer');
    preview = document.createElement('div');
    preview.id = 'chat-reply-preview';
    preview.className = 'chat-reply-preview';
    footer.parentNode.insertBefore(preview, footer);
  }
  
  preview.innerHTML = `
    ${mediaUrl ? `<img src="${mediaUrl}" class="chat-reply-thumbnail" />` : ''}
    <div class="chat-reply-preview-content">
      <div class="chat-reply-preview-name">Replying to ${escHtml(senderName)}</div>
      <div class="chat-reply-preview-text">${escHtml(text || (mediaUrl ? 'Photo' : ''))}</div>
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
  const userId = localStorage.getItem('userId');
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
    const userId = localStorage.getItem('userId');
    const readRef = firestore.doc(firebaseDb, 'group_chats', activeChatGroupId, 'last_reads', userId);
    
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
  const userId = localStorage.getItem('userId');
  const readsRef = firestore.collection(firebaseDb, 'group_chats', groupId, 'last_reads');
  
  readStatusUnsubscribe = firestore.onSnapshot(readsRef, (snapshot) => {
    // Process all docs to ensure we have the absolute latest state
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const uid = doc.id;
      if (uid !== userId) {
        memberReadStatuses[uid] = data.timestamp || 0;
      }
    });
    
    updateExistingTicks();
  });
}

function updateExistingTicks() {
  const group = allJoinedGroups.find(g => g._id === activeChatGroupId);
  if (!group) return;
  const totalOthers = Math.max(1, group.members.length - 1);
  
  const selfMessages = document.querySelectorAll('.chat-bubble-wrapper.self');
  selfMessages.forEach(msgEl => {
    const ts = parseInt(msgEl.dataset.ts || '0');
    const tick = msgEl.querySelector('.chat-tick');
    if (!tick || tick.classList.contains('blue')) return;

    const readCount = Object.values(memberReadStatuses).filter(lastRead => lastRead >= ts).length;
    const pct = (readCount / totalOthers) * 100;
    
    if (pct >= globalConfig.chatReadThresholdPct) {
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
  
  const userId = localStorage.getItem('userId');
  const isSelf = String(msg.senderId) === String(userId);
  
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
  const group = (typeof allJoinedGroups !== 'undefined' && allJoinedGroups) ? allJoinedGroups.find(g => g._id === activeChatGroupId) : null;
  const totalOthers = group ? Math.max(1, group.members.length - 1) : 1;
  const readCount = Object.values(memberReadStatuses).filter(lr => lr >= tsMillis).length;
  return (readCount / totalOthers) * 100 >= (globalConfig.chatReadThresholdPct || 10);
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

    // Handle Shift+Enter to send (as requested)
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        // Manually trigger the form submit handler
        handleChatSubmit(e); 
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
  const userId = localStorage.getItem('userId');
  const userName = localStorage.getItem('userName');
  
  const typingRef = rtdb.ref(firebaseRtdb, `typing/${activeChatGroupId}/${userId}`);
  
  try {
    if (isTyping) {
      await rtdb.set(typingRef, {
        name: userName,
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
  const userId = localStorage.getItem('userId');
  const typingRef = rtdb.ref(firebaseRtdb, `typing/${activeChatGroupId}`);
  
  typingUnsubscribe = rtdb.onValue(typingRef, (snapshot) => {
    const typers = [];
    snapshot.forEach(child => {
      if (child.key !== userId) {
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

async function initFirebaseChat() {
  const userId = localStorage.getItem('userId');
  const token = localStorage.getItem('token');
  if (!userId || !token) return;

  try {
    const res = await fetch(`${API}/api/auth/firebase-token`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.token) {
      const { firebaseAuth, signInWithFirebase } = window;
      if (firebaseAuth && signInWithFirebase) {
        await signInWithFirebase(firebaseAuth, data.token);
      }
    }
  } catch (err) {
    console.error('Firebase Auth Sync Error:', err);
  }
}

async function openQuickViewByMemberId(memberId, memberName) {
  try {
    const userId = localStorage.getItem('userId');
    if (memberId === userId) {
      const myUsername = localStorage.getItem('userUsername');
      if (myUsername) return openQuickView(myUsername);
    }
    if (typeof allJoinedGroups !== 'undefined' && allJoinedGroups) {
      const group = allJoinedGroups.find(g => g._id === activeChatGroupId);
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
      await apiFetch(`${API}/api/auth/chat-media`, {
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
  selectedMediaBlobs.push({ blob: file, type: 'audio', duration, source: 'upload' });
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
  const maxSize = 5 * 1024 * 1024; // 5MB

  // 3. Validate all files first
  for (const file of files) {
    if (!allowedTypes.includes(file.type)) {
      return showToast(`Invalid format in batch: ${file.name}`, 'warn');
    }
    if (file.size > maxSize) {
      return showToast(`File too large (>5MB): ${file.name}`, 'warn');
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

  const res = await apiFetch(`${API}/api/auth/chat-media`, {
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
      await apiFetch(`${API}/api/auth/chat-media`, {
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
  const userId = localStorage.getItem('userId');
  const userName = localStorage.getItem('userName');
  const userPic = localStorage.getItem('userProfilePicture');
  
  const presenceRef = rtdb.ref(firebaseRtdb, `presence/${groupId}/${userId}`);
  
  try {
    if (isOnline) {
      const updateData = {
        userId,
        name: userName,
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
  const presenceRef = rtdb.ref(firebaseRtdb, `presence/${groupId}`);
  const myId = localStorage.getItem('userId');
  
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
  if (activeChatGroupId) {
    const isVisible = document.visibilityState === 'visible';
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
  const userId = localStorage.getItem('userId');
  if (!userId) return false;

  console.log('🔄 Starting full sync reconciliation...');
  try {
    const serverAudit = await apiFetch(`${API}/api/sync/audit`);
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
  
  // Throttle: Only sync once every 5 minutes unless forced
  const now = Date.now();
  if (!force && (now - _lastSyncTime < 5 * 60 * 1000)) {
    return;
  }
  _lastSyncTime = now;
  localStorage.setItem('lastProactiveSyncTime', now.toString());

  const userId = localStorage.getItem('userId');
  if (!userId) return;

  try {
    const localDb = window.localDb;
    if (!localDb) return;

    // 0. Reconcile deleted data first
    const itemsDeleted = await reconcileAllData();

    // 1. Sync Profile & Config
    await fetchConfig();
    const profile = await apiFetch(`${API}/api/auth/settings`);
    if (profile) {
      profile.userId = userId;
      await localDb.userProfile.put(profile);

      // Apply profile updates to UI
      if (profile.theme && localStorage.getItem('theme') !== profile.theme) {
        localStorage.setItem('theme', profile.theme);
        if (profile.theme === 'dark') {
          document.documentElement.setAttribute('data-theme', 'dark');
          const themeToggle = document.getElementById('dark-theme-toggle');
          if (themeToggle) themeToggle.checked = true;
        } else {
          document.documentElement.removeAttribute('data-theme');
          const themeToggle = document.getElementById('dark-theme-toggle');
          if (themeToggle) themeToggle.checked = false;
        }
      }
      if (profile.profilePicture) {
        userProfilePicture = profile.profilePicture;
        localStorage.setItem('userProfilePicture', userProfilePicture);
      }
      if (profile.name) {
        userName = profile.name;
        localStorage.setItem('userName', profile.name);
        const chipName = document.getElementById('user-chip-name');
        if (chipName) chipName.textContent = profile.name;
      }
      if (profile.username) {
        localStorage.setItem('userUsername', profile.username);
      }
      updateNavAvatar();
    }

    // 2. Sync Leaderboard (Top 10 of each sort)
    const current = await apiFetch(`${API}/api/users/leaderboard?sort=current&page=1&limit=10`);
    if (current && current.users) {
      await window.localDb.leaderboard.put({ sort: 'current', users: current.users, timestamp: Date.now() });
    }
    const highest = await apiFetch(`${API}/api/users/leaderboard?sort=highest&page=1&limit=10`);
    if (highest && highest.users) {
      await window.localDb.leaderboard.put({ sort: 'highest', users: highest.users, timestamp: Date.now() });
    }

    // 3. Sync Days (for Streak calculation)
    const daysData = await apiFetch(`${API}/api/days?page=1&limit=100`);
    if (daysData && daysData.days) {
      // Preserve local-only changes (those not yet synced)
      const localOnly = await window.localDb.syncQueue.where('entity').equals('days').toArray();
      const localIds = localOnly.map(q => q.targetId);
      
      const toUpdate = daysData.days.filter(d => !localIds.includes(d._id));
      await window.localDb.days.bulkPut(toUpdate);
      
      // Update in-memory state if on first page
      if (currentPage === 1) {
        allDays = (await window.localDb.days.toArray()).sort((a,b) => b.date.localeCompare(a.date)).slice(0, daysPerPage);
        renderDays();
        updateStreak();
      }
    }

    // 4. Sync Goals
    const goals = await apiFetch(`${API}/api/goals`);
    if (goals) {
      await localDb.goals.clear();
      await localDb.goals.bulkAdd(goals);
    }

    // 5. Sync Achievements
    const achs = await apiFetch(`${API}/api/achievements`);
    if (achs && achs.achievements) {
      await localDb.achievements.clear();
      await localDb.achievements.bulkAdd(achs.achievements);
    }

    // Sync templates for offline task creation
    const templates = await apiFetch(`${API}/api/templates`);
    if (window.localDb) {
      await window.localDb.templates.clear();
      await window.localDb.templates.bulkPut(templates);
    }

    // If reconciliation or sync changed data, force a UI refresh
    if (itemsDeleted) {
      if (typeof renderDays === 'function') renderDays();
      if (typeof loadGoals === 'function') loadGoals();
      if (typeof loadAchievements === 'function') loadAchievements();
      if (typeof loadGroups === 'function') loadGroups();
      if (typeof loadTemplates === 'function') loadTemplates();
      updateStreak();
    }

    console.log('Proactive sync complete');
  } catch (err) {
    console.warn('Proactive sync partial fail:', err);
  }
}

/** Helper to render leaderboard rows */
function renderLeaderboardData(users, reset) {
  const listContainer = document.getElementById('leaderboard-list');
  if (!listContainer) return;
  
  if (reset) listContainer.innerHTML = '';
  
  if (users.length === 0 && reset) {
    listContainer.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted); font-weight:700;">No legends found yet. Be the first!</div>`;
  } else {
    users.forEach((user, index) => {
      const rank = ((lbPage - 1) * 10) + index + 1;
      listContainer.appendChild(renderLeaderboardItem(user, rank));
    });
  }
}

/** Handle automatic sync when connection returns */
window.addEventListener('online', async () => {
  showToast('Back online! Syncing your progress...', 'info');
  if (window.syncManager) {
    await syncManager.processQueue();
  }
  // Refresh data from server (Forced)
  proactiveSync(true); 
});
