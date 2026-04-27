/* ============================================================
   CONSISTENCY TRACKER — Frontend Script
   GSAP-powered animations · Ripple effects · Smooth UX
   Groups feature · Mobile-optimised
   ============================================================ */

const API = '';  // Same origin

// ── Auth ───────────────────────────────────────────────────
const userId   = localStorage.getItem('userId')   || '';
const userName = localStorage.getItem('userName') || 'User';
let userProfilePicture = localStorage.getItem('userProfilePicture') || '';

function logout() {
  localStorage.clear();
  window.location.replace('landing.html');
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

// ── Mobile detection ───────────────────────────────────────
const isMobile = () => window.innerWidth <= 768;

// ── Motivation quotes ──────────────────────────────────────
const MOTIVATIONS = [
  { icon: '💪', text: 'Keep pushing!' },
  { icon: '🚀', text: 'You\'re on fire!' },
  { icon: '🌟', text: 'Unstoppable!' },
  { icon: '⚡', text: 'Small steps win!' },
  { icon: '🎯', text: 'Stay locked in.' },
  { icon: '🔥', text: 'Don\'t break the chain!' },
  { icon: '✨', text: 'Progress = Success.' },
  { icon: '🏆', text: 'Champions show up!' },
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

  const icons = { success: '✅', error: '❌', warn: '⚠️', info: '💡' };
  iconEl.textContent = icons[type] || icons.info;
  msgEl.textContent  = msg;

  toast.className = 'toast';
  if (type === 'graph') toast.classList.add('graph');
  toast.classList.add('show');
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
}

// ── API ────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      localStorage.clear();
      window.location.replace('landing.html');
      throw new Error('Session expired. Please log in again.');
    }
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || 'Too many requests. Please try again later.');
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Days ───────────────────────────────────────────────────
async function loadDays(page = 1) {
  try {
    const data = await apiFetch(`${API}/api/days?page=${page}&limit=${daysPerPage}`);
    
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      if (page === 1) allDays = data.days;
      else allDays.push(...data.days);
      
      backendStreak = data.streak || 0;
      hasMoreDays = data.hasMore || false;
    } else {
      // Fallback for non-paginated API
      if (page === 1) allDays = data;
      else allDays.push(...data);
      hasMoreDays = false;
    }

    currentPage = page;
    renderDays();
    updateStreak();
  } catch (err) {
    console.error('Error loading days:', err);
    let errorMessage = '⚠️ Failed to load days. Please check your connection.';

    // Check for rate limiting or specific error messages
    if (err.message) {
      if (err.message.includes('Too many requests') || err.message.includes('rate limit') || err.message.includes('429')) {
        errorMessage = '⚠️ Too many requests. Please try again later.';
      } else if (err.message.includes('Server offline') || err.message.includes('fetch')) {
        errorMessage = '⚠️ Server offline. Please check your connection.';
      } else {
        errorMessage = `⚠️ ${err.message}`;
      }
    }

    document.getElementById('loading-days').innerHTML =
      `<p style="color:#ef4444;text-align:center">${errorMessage}</p>`;
  }
}

function loadMoreDays() {
  loadDays(currentPage + 1);
}

function updateStreak() {
  const { todayDone } = calculateStreak(allDays);
  const streak = backendStreak;
  const el = document.getElementById('streak-display');
  const fireEl = document.querySelector('.streak-fire');

  // Show exclamation mark if streak > 0 but today is not done yet
  if (fireEl) {
    fireEl.textContent = (streak > 0 && !todayDone) ? '❕' : '🔥';
  }

  // Animate streak number with GSAP counter
  if (window.gsap) {
    gsap.to({ val: parseInt(el.textContent) || 0 }, {
      val: streak,
      duration: 0.8,
      ease: 'power2.out',
      onUpdate() { el.textContent = Math.round(this.targets()[0].val); },
    });
    // Pulse the streak pill if streak > 0 and today is complete
    if (streak > 0 && todayDone) {
      gsap.fromTo('#nav-streak', { scale: 1 }, { scale: 1.06, duration: 0.2, yoyo: true, repeat: 1, ease: 'power1.inOut' });
    }
  } else {
    el.textContent = streak;
  }
}

function renderDays() {
  const container = document.getElementById('cards-container');
  container.innerHTML = '';

  // ── "New Day Card" button always pinned at the top ──────
  const addBtnRow = document.createElement('div');
  addBtnRow.className = 'add-day-inline-row';
  addBtnRow.innerHTML = `
    <button class="add-day-inline-btn ripple" onclick="openAddDayModal()" id="add-day-inline-btn">
      <span class="plus-icon">＋</span>
      <span>New Day Card</span>
    </button>`;
  container.appendChild(addBtnRow);

  if (!allDays.length) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'empty-state';
    emptyEl.innerHTML = `
      <span class="empty-icon">📅</span>
      <h3>No days yet</h3>
      <p>Click the button above to start your first day card.</p>`;
    container.appendChild(emptyEl);
    if (window.gsap) {
      gsap.from('.empty-state', { opacity: 0, y: 20, duration: 0.5, ease: 'power2.out' });
    }
    return;
  }

  // Sort newest-first then build all cards (no layout thrash)
  const sorted = [...allDays].sort((a, b) => b.date.localeCompare(a.date));
  const fragment = document.createDocumentFragment();
  for (const day of sorted) {
    fragment.appendChild(buildDayCard(day));
  }
  container.appendChild(fragment);

  if (hasMoreDays) {
    const loadMoreRow = document.createElement('div');
    loadMoreRow.style.textAlign = 'center';
    loadMoreRow.style.marginTop = '20px';
    loadMoreRow.style.marginBottom = '40px';
    loadMoreRow.innerHTML = `
      <button class="btn-ghost ripple btn-load-more" onclick="loadMoreDays()">
        Load More Days ⬇️
      </button>
    `;
    container.appendChild(loadMoreRow);
  }

  // ── Mobile-aware GSAP entrance ──────────────────────────
  // On mobile: single quick fade-in (no stagger = no lag)
  // On desktop: original elegant stagger
  if (window.gsap) {
    if (isMobile()) {
      gsap.from('.day-card', {
        opacity: 0,
        duration: 0.3,
        ease: 'power2.out',
        clearProps: 'all',
      });
    } else {
      gsap.from('.day-card', {
        opacity: 0,
        y: 30,
        duration: 0.5,
        stagger: 0.08,
        ease: 'power3.out',
        clearProps: 'all',
      });
    }
  }
}

function buildDayCard(day) {
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
          </div>`;
      } else {
        const lockClass = task.completed ? 'locked-complete' : 'locked-incomplete';
        tasksHTML += `
          <div class="task-item ${lockClass}">
            <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} disabled />
            <span class="task-title">${escHtml(task.title)}</span>
          </div>`;
      }
    }

    const completedCount = cat.tasks.filter(t => t.completed).length;
    const editCatBtn = isToday
      ? `<button class="btn-edit-cat ripple" onclick="openEditCategoryModal('${day._id}','${cat._id}')" title="Edit category">✏️</button>`
      : '';
    categoriesHTML += `
      <div class="category-block">
        <div class="category-header">
          <span class="category-name">${escHtml(cat.name)}</span>
          <div class="category-header-right">
            <span class="category-count">${completedCount}/${cat.tasks.length}</span>
            ${editCatBtn}
          </div>
        </div>
        <div class="tasks-list">${tasksHTML || '<p style="padding:8px 14px;font-size:13px;color:var(--text-3)">No tasks added.</p>'}</div>
      </div>`;
  }

  // Summary
  const summaryInner = isToday
    ? `<textarea class="summary-edit" id="summary-edit-${day._id}" rows="3">${escHtml(day.summary || '')}</textarea>
       <button class="summary-save-btn ripple" onclick="saveSummary('${day._id}')">💾 Save Note</button>`
    : `<p class="summary-text">${escHtml(day.summary || '(no notes for this day)')}</p>`;

  // Add category button (today only)
  const addCatBtn = isToday
    ? `<div class="add-category-row"><button class="btn-add-cat ripple" onclick="openAddCategoryModal('${day._id}')">＋ Add Category</button></div>`
    : '';

  card.innerHTML = `
    <div class="card-header">
      <div class="card-date-wrap">
        <span class="card-date">${formatDisplayDate(day.date)}</span>
        <span class="card-day-name">${getDayName(day.date)}</span>
      </div>
      <span class="card-badge ${isToday ? 'badge-today' : (isFuture ? 'badge-future' : 'badge-past')}">${isToday ? '✨ Today' : (isFuture ? '⏳ Future' : 'Past')}</span>
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
      <span>📝</span>
      <span>Notes</span>
      <span class="summary-chevron">▼</span>
    </button>
    <div class="summary-content" id="summary-content-${day._id}">
      <div class="summary-inner">${summaryInner}</div>
    </div>

    <!-- Always-visible Log Win and Save Template buttons -->
    <div class="ach-add-row">
      <div style="display:flex; gap:10px; align-items:center;">
        <button class="btn-add-ach ripple" onclick="openAddAchievementModal('${day._id}')">🏆 Log a Acheivement</button>
        <span class="ach-no-progress-note">doesn't affect progress</span>
      </div>
      <button class="btn-save-template ripple" onclick="openSaveTemplateModal('${day._id}')">💾 Save Template</button>
    </div>
  `;

  // Animate progress bar after card is inserted into DOM
  // Using double-rAF to guarantee the element is painted before animating
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      animateProgressBar(`pct-fill-${day._id}`, pct);
    });
  });

  // Load achievements for this card asynchronously (non-blocking)
  loadDayAchievements(day._id, card);

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
    await apiFetch(`${API}/api/days/${dayId}`, {
      method: 'PUT',
      body: JSON.stringify({ categories: day.categories }),
    });
    updateStreak();
  } catch (err) {
    task.completed = !checked;
    const checkbox = document.getElementById(`chk-${taskId}`);
    if (checkbox) checkbox.checked = !checked;
    updateProgressBar(dayId, day.categories);
    showToast('Failed to save. Check connection.', 'error');
  }
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
  try {
    await apiFetch(`${API}/api/days/${dayId}`, {
      method: 'PUT',
      body: JSON.stringify({ summary }),
    });
    const day = allDays.find(d => d._id === dayId);
    if (day) day.summary = summary;
    showToast('Notes saved!', 'success');
  } catch (err) {
    showToast('Failed to save notes.', 'error');
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
      <button class="btn-remove" onclick="removeCategoryField(${idx})" title="Remove">✕</button>
    </div>
    <div class="tasks-builder" id="tasks-build-${idx}"></div>
    <button class="btn-ghost ripple" style="font-size:12px;padding:6px 12px;border-radius:8px;" onclick="addTaskField(${idx})">＋ Add Task</button>
  `;
  builder.appendChild(item);
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
    <button class="btn-remove" onclick="this.parentElement.remove()" title="Remove">✕</button>
  `;
  builder.appendChild(row);
}

async function submitAddDay() {
  const date    = document.getElementById('day-date-input').value.trim();
  const summary = document.getElementById('day-summary-input').value.trim();
  if (!date) { showToast('Please select a date.', 'warn'); return; }

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

  const btn = document.getElementById('submit-day-btn');
  btn.disabled = true;
  btn.textContent = 'Creating...';

  try {
    const newDay = await apiFetch(`${API}/api/days`, {
      method: 'POST',
      body: JSON.stringify({ date, categories, summary }),
    });
    allDays.push(newDay);
    closeModal('modal-add-day');

    // ── On mobile, just prepend the new card (newest-first) without
    //    re-rendering all cards (avoids GSAP stagger lag on modal close)
    if (isMobile()) {
      const container = document.getElementById('cards-container');
      // Remove empty state if present
      const emptyState = container.querySelector('.empty-state');
      if (emptyState) emptyState.remove();

      const newCard = buildDayCard(newDay);
      // Start invisible, then fade in — no translateY to avoid bounce
      newCard.style.opacity = '0';
      // Insert right after the inline add-button row (index 1)
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
          // Clean up inline style after transition
          setTimeout(() => { newCard.style.transition = ''; newCard.style.opacity = ''; }, 300);
        });
      });
    } else {
      renderDays();
    }

    updateStreak();
    showToast('Day card created!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
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
    <button class="btn-remove" onclick="this.parentElement.remove()" title="Remove">✕</button>
  `;
  builder.appendChild(row);
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

  const day = allDays.find(d => d._id === dayId);
  if (!day) return;
  const updatedCategories = [...day.categories, { name: catName, tasks }];

  const btn = document.getElementById('submit-cat-btn');
  btn.disabled = true; btn.textContent = 'Adding...';

  try {
    const updatedDay = await apiFetch(`${API}/api/days/${dayId}`, {
      method: 'PUT',
      body: JSON.stringify({ categories: updatedCategories }),
    });
    const idx = allDays.findIndex(d => d._id === dayId);
    if (idx !== -1) allDays[idx] = updatedDay;
    closeModal('modal-add-category');
    const oldCard = document.getElementById(`day-card-${dayId}`);
    if (oldCard) {
      const newCard = buildDayCard(updatedDay);
      if (window.gsap) gsap.set(newCard, { opacity: 0, y: 10 });
      oldCard.replaceWith(newCard);
      if (window.gsap) gsap.to(newCard, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', clearProps: 'all' });
      requestAnimationFrame(() => requestAnimationFrame(() => animateProgressBar(`pct-fill-${dayId}`, calcProgress(updatedDay.categories))));
    }
    showToast('Category added!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
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
    <button class="btn-remove" onclick="this.parentElement.remove()" title="Remove">✕</button>
  `;
  builder.appendChild(row);
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
  const newTasks = [];
  for (const row of taskRows) {
    const title = row.querySelector('input').value.trim();
    if (!title) continue;
    const tId  = row.dataset.taskId;
    const existing = origCat ? origCat.tasks.find(t => t._id === tId) : null;
    newTasks.push({ ...(tId ? { _id: tId } : {}), title, completed: existing ? existing.completed : false });
  }

  const updatedCategories = day.categories.map(cat =>
    String(cat._id) === String(catId)
      ? { ...cat, name: catName, tasks: newTasks }
      : cat
  );

  const btn = document.getElementById('submit-edit-cat-btn');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    const updatedDay = await apiFetch(`${API}/api/days/${dayId}`, {
      method: 'PUT',
      body: JSON.stringify({ categories: updatedCategories }),
    });
    const idx = allDays.findIndex(d => d._id === dayId);
    if (idx !== -1) allDays[idx] = updatedDay;
    closeModal('modal-edit-category');
    const oldCard = document.getElementById(`day-card-${dayId}`);
    if (oldCard) {
      const newCard = buildDayCard(updatedDay);
      if (window.gsap) gsap.set(newCard, { opacity: 0, y: 10 });
      oldCard.replaceWith(newCard);
      if (window.gsap) gsap.to(newCard, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', clearProps: 'all' });
      requestAnimationFrame(() => requestAnimationFrame(() => animateProgressBar(`pct-fill-${dayId}`, calcProgress(updatedDay.categories))));
    }
    showToast('Category updated!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Changes';
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
  document.getElementById('edit-goal-deadline-display').textContent =
    `📅 Deadline: ${formatDisplayDate(goal.deadline.split('T')[0])}`;

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
    <button class="btn-remove" onclick="this.parentElement.remove()" title="Remove">✕</button>
  `;
  builder.appendChild(row);
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
async function loadGoals() {
  const container = document.getElementById('goals-container');
  container.innerHTML = `<div class="loading-spinner"><div class="spinner-ring"></div><p>Loading...</p></div>`;
  try {
    allGoals = await apiFetch(`${API}/api/goals`);
    renderGoals();
  } catch (err) {
    console.error('Error loading goals:', err);
    let errorMessage = '⚠️ Failed to load goals. Please check your connection.';

    if (err.message) {
      if (err.message.includes('Too many requests') || err.message.includes('rate limit') || err.message.includes('429')) {
        errorMessage = '⚠️ Too many requests. Please try again later.';
      } else if (err.message.includes('Server offline') || err.message.includes('fetch')) {
        errorMessage = '⚠️ Server offline. Please check your connection.';
      } else {
        errorMessage = `⚠️ ${err.message}`;
      }
    }

    container.innerHTML = `<p style="color:#ef4444;text-align:center">${errorMessage}</p>`;
  }
}

function renderGoals() {
  const container = document.getElementById('goals-container');
  container.innerHTML = '';

  if (!allGoals.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🎯</span>
        <h3>No goals yet</h3>
        <p>Set a long-term goal to stay focused on what matters.</p>
      </div>`;
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
    dlText  = `⚠️ Overdue by ${Math.abs(dl)}d`;
  } else if (dl <= 2) {
    dlClass = 'days-danger';
    dlText  = `🚨 ${dl}d left!`;
  } else if (dl <= 5) {
    dlClass = 'days-warn';
    dlText  = `⏰ ${dl} days left`;
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
      ${dl >= 0 ? `<button class="btn-ghost ripple" onclick="openEditGoalModal('${goal._id}')" style="padding:7px 14px;font-size:13px;">✏️ Edit</button>` : ''}
      <button class="btn-delete ripple" onclick="deleteGoal('${goal._id}')">🗑 Delete</button>
    </div>`;

  card.innerHTML = `
    <div class="goal-header">
      <span class="goal-title">${escHtml(goal.title)}</span>
      <div class="goal-meta">
        <span class="days-left-badge ${dlClass}">${dlText}</span>
        <span class="goal-deadline">📅 ${formatDisplayDate(goal.deadline.split('T')[0])}</span>
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
    await apiFetch(`${API}/api/goals/${goalId}`, {
      method: 'PUT',
      body: JSON.stringify({ tasks: goal.tasks }),
    });

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
    task.completed = !checked;
    if (label) { label.style.textDecoration = !checked ? 'line-through' : 'none'; label.style.color = !checked ? 'var(--lt-green)' : ''; }
    const checkbox = document.getElementById(`gtask-${taskId}`);
    if (checkbox) checkbox.checked = !checked;
    updateGoalProgressBar(goalId, goal.tasks);
    showToast('Failed to save task.', 'error');
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
    await apiFetch(`${API}/api/goals/${goalId}`, { method: 'DELETE' });
    allGoals = allGoals.filter(g => g._id !== goalId);
    const card = document.getElementById(`goal-card-${goalId}`);
    if (card) {
      if (window.gsap) {
        gsap.to(card, { opacity: 0, y: -10, scale: 0.95, duration: 0.3, ease: 'power2.in', onComplete: () => { card.remove(); if (!allGoals.length) renderGoals(); } });
      } else {
        card.remove();
        if (!allGoals.length) renderGoals();
      }
    }
    showToast('Goal deleted.', 'info');
  } catch(err) {
    showToast('Failed to delete goal.', 'error');
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
    <button class="btn-remove" onclick="this.parentElement.remove()" title="Remove">✕</button>
  `;
  builder.appendChild(row);
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

  try {
    const newGoal = await apiFetch(`${API}/api/goals`, {
      method: 'POST',
      body: JSON.stringify({ userId, title, deadline, tasks }),
    });
    allGoals.push(newGoal);
    allGoals.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    closeModal('modal-add-goal');
    renderGoals();
    showToast('Goal created!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Create Goal';
  }
}

// ══════════════════════════════════════════════════════════
//  GROUPS
// ══════════════════════════════════════════════════════════

let allGroups = [];

async function loadGroups() {
  const container = document.getElementById('groups-container');
  container.innerHTML = `<div class="loading-spinner"><div class="spinner-ring"></div><p>Loading groups...</p></div>`;
  try {
    allGroups = await apiFetch(`${API}/api/groups/mine`);
    renderGroups();
  } catch (err) {
    console.error('Error loading groups:', err);
    let errorMessage = '⚠️ Failed to load groups. Please check your connection.';

    if (err.message) {
      if (err.message.includes('Too many requests') || err.message.includes('rate limit') || err.message.includes('429')) {
        errorMessage = '⚠️ Too many requests. Please try again later.';
      } else if (err.message.includes('Server offline') || err.message.includes('fetch')) {
        errorMessage = '⚠️ Server offline. Please check your connection.';
      } else {
        errorMessage = `⚠️ ${err.message}`;
      }
    }

    container.innerHTML = `<p style="color:#ef4444;text-align:center">${errorMessage}</p>`;
  }
}

function renderGroups() {
  const container = document.getElementById('groups-container');
  container.innerHTML = '';

  // Separate my owned teams from joined groups
  const myTeams      = allGroups.filter(g => String(g.owner._id || g.owner) === String(userId));
  const joinedGroups = allGroups.filter(g => String(g.owner._id || g.owner) !== String(userId));

  // ── My Teams section ──────────────────────────────────
  const myTeamSection = document.createElement('div');
  myTeamSection.className = 'groups-section';

  const myTeamHeader = `
    <div class="groups-section-header">
      <h2 class="groups-section-title">👑 My Teams</h2>
      <button class="btn-ghost ripple groups-join-btn" onclick="openCreateGroupModal()">
        <span>＋</span> Create a Team
      </button>
    </div>
  `;

  if (myTeams.length > 0) {
    let teamsHTML = myTeamHeader + '<div class="groups-list">';
    for (const myTeam of myTeams) {
      teamsHTML += `
        <div class="group-card my-team-card">
          <div class="group-card-top">
            <div class="group-name-wrap">
              <span class="group-emoji">⚡</span>
              <span class="group-name">${escHtml(myTeam.name)}</span>
              <button class="btn-ghost" style="padding:4px;font-size:12px;margin-left:4px;" onclick="openEditGroupModal('${myTeam._id}', '${escJs(myTeam.name)}')">✏️</button>
              <button class="btn-ghost" style="padding:4px;font-size:12px;color:#ef4444;margin-left:4px;" onclick="deleteGroup('${myTeam._id}')">🗑️</button>
            </div>
            <div class="team-code-wrap">
              <span class="team-code-label">Join Code</span>
              <button class="team-code-pill" onclick="copyTeamCode('${myTeam.code}')" title="Click to copy">
                <span class="team-code-text">${myTeam.code}</span>
                <span class="team-code-copy">📋</span>
              </button>
            </div>
          </div>
          <p class="group-meta">${myTeam.members.length} member${myTeam.members.length !== 1 ? 's' : ''}</p>
          <div class="members-row" id="members-row-${myTeam._id}">
            ${buildMembersHTML(myTeam.members, myTeam._id, true)}
          </div>
        </div>
      `;
    }
    teamsHTML += '</div>';
    myTeamSection.innerHTML = teamsHTML;
  } else {
    myTeamSection.innerHTML = myTeamHeader + `
      <div class="group-empty-card">
        <span class="group-empty-icon">🏗️</span>
        <p>You haven't created a team yet.</p>
      </div>
    `;
  }
  container.appendChild(myTeamSection);

  // ── Divider ───────────────────────────────────────────
  const divider = document.createElement('hr');
  divider.className = 'groups-divider';
  container.appendChild(divider);

  // ── Joined Groups section ─────────────────────────────
  const joinedSection = document.createElement('div');
  joinedSection.className = 'groups-section';

  const joinedHeader = `
    <div class="groups-section-header">
      <h2 class="groups-section-title">🔗 Joined Teams</h2>
      <button class="btn-ghost ripple groups-join-btn" onclick="openJoinGroupModal()">
        <span>＋</span> Join a Team
      </button>
    </div>
  `;

  if (!joinedGroups.length) {
    joinedSection.innerHTML = joinedHeader + `
      <div class="group-empty-card">
        <span class="group-empty-icon">👫</span>
        <p>You haven't joined any teams yet.<br>Ask a friend for their team code!</p>
      </div>
    `;
  } else {
    let groupsHTML = joinedHeader + '<div class="groups-list">';
    for (const group of joinedGroups) {
      groupsHTML += `
        <div class="group-card" id="group-card-${group._id}">
          <div class="group-card-top">
            <div class="group-name-wrap">
              <span class="group-emoji">👥</span>
              <span class="group-name">${escHtml(group.name)}</span>
            </div>
            <span class="group-owner-badge">by ${escHtml(group.owner.name || 'Unknown')}</span>
          </div>
          <p class="group-meta">${group.members.length} member${group.members.length !== 1 ? 's' : ''}</p>
          <div class="members-row">
            ${buildMembersHTML(group.members, group._id, false)}
          </div>
          <div style="margin-top:12px;text-align:right;">
            <button class="btn-ghost ripple" style="color:#ef4444;font-size:13px;padding:6px 12px;" onclick="leaveGroup('${group._id}')">🚪 Leave Team</button>
          </div>
        </div>
      `;
    }
    groupsHTML += '</div>';
    joinedSection.innerHTML = groupsHTML;
  }
  container.appendChild(joinedSection);

  // GSAP entrance
  if (window.gsap) {
    gsap.from('.group-card, .group-empty-card', {
      opacity: 0,
      y: 20,
      duration: 0.45,
      stagger: 0.07,
      ease: 'power2.out',
      clearProps: 'all',
    });
  }
}

function buildMembersHTML(members, groupId, isOwner = false) {
  if (!members || !members.length) return '<p class="no-members">No members yet.</p>';

  return members.map(member => {
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

    return `
      <div class="member-pill">
        <div class="member-avatar" style="background:${memberAvatarColor(memberName)}" ${avatarClick}>${avatarContent}</div>
        <span class="member-name">${escHtml(memberName)}${isSelf ? ' (you)' : ''}</span>
        ${!isSelf ? `<button class="member-view-btn ripple" onclick="openMemberTasks('${memberId}', '${escJs(memberName)}')">View Tasks</button>` : ''}
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
    showToast(`Code "${code}" copied to clipboard!`, 'success');
  }).catch(() => {
    showToast(`Your code: ${code}`, 'info');
  });
}

// ── Create Group Modal ─────────────────────────────────────
function openCreateGroupModal() {
  document.getElementById('group-name-input').value = '';
  openModal('modal-create-group');
}

async function submitCreateGroup() {
  const name = document.getElementById('group-name-input').value.trim();
  if (!name) { showToast('Team name is required.', 'warn'); return; }

  const btn = document.getElementById('submit-create-group-btn');
  btn.disabled = true; btn.textContent = 'Creating...';

  try {
    const group = await apiFetch(`${API}/api/groups/create`, {
      method: 'POST',
      body: JSON.stringify({ userId, name }),
    });
    closeModal('modal-create-group');
    showToast(`Team "${group.name}" created! Code: ${group.code}`, 'success');
    loadGroups(); // refresh
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Create Team';
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
    showToast(`Joined "${group.name}"! 🎉`, 'success');
    loadGroups(); // refresh
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Join Team';
  }
}

// ── Manage Groups ──────────────────────────────────────────
let editingGroupId = null;

function openEditGroupModal(id, name) {
  editingGroupId = id;
  document.getElementById('edit-group-name-input').value = name;
  openModal('modal-edit-group');
}

async function submitEditGroup() {
  const name = document.getElementById('edit-group-name-input').value.trim();
  if (!name) { showToast('Team name is required.', 'warn'); return; }

  const btn = document.getElementById('submit-edit-group-btn');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    await apiFetch(`${API}/api/groups/${editingGroupId}`, {
      method: 'PUT',
      body: JSON.stringify({ userId, name }),
    });
    closeModal('modal-edit-group');
    showToast('Team name updated!', 'success');
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
    await apiFetch(`${API}/api/groups/${groupId}`, {
      method: 'DELETE',
      body: JSON.stringify({ userId }),
    });
    showToast('Team deleted.', 'info');
    loadGroups();
  } catch (err) {
    showToast(err.message, 'error');
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

async function openMemberTasks(memberId, memberName) {
  const titleEl = document.getElementById('member-tasks-title');
  const bodyEl  = document.getElementById('member-tasks-body');

  titleEl.innerHTML = `📋 ${escHtml(memberName)}'s Tasks`;
  bodyEl.innerHTML = `<div class="loading-spinner"><div class="spinner-ring"></div><p>Loading...</p></div>`;
  openModal('modal-member-tasks');
  _currentMemberId   = memberId;
  _currentMemberName = memberName;
  memberDaysPage = 1;
  memberDaysData = [];
  memberDaysHasMore = false;

  await loadMemberDays();
}

async function loadMemberDays() {
  const titleEl = document.getElementById('member-tasks-title');
  const bodyEl  = document.getElementById('member-tasks-body');

  try {
    const response = await apiFetch(`${API}/api/groups/member-days?memberId=${encodeURIComponent(_currentMemberId)}&page=${memberDaysPage}&limit=10`);

    // Handle both old format (array) and new format (object with days)
    const days = response.days || response;
    memberDaysData = memberDaysData.concat(days);
    memberDaysHasMore = response.pagination ? response.pagination.hasMore : false;

    // Calculate member's streak and update the modal title
    const streakInfo = calculateStreak(memberDaysData);
    const memberStreak = streakInfo.count;
    const isTodayDone = streakInfo.todayDone;
    const icon = isTodayDone ? '🔥' : (memberStreak > 0 ? '❕' : '🌱');
    const streakBadge = memberStreak > 0
      ? ` <span class="member-streak-badge">${icon} ${memberStreak} day streak</span>`
      : ` <span class="member-streak-badge member-streak-zero">${icon} No streak yet</span>`;
    titleEl.innerHTML = `📋 ${escHtml(_currentMemberName)}'s Tasks${streakBadge}`;

    if (!memberDaysData.length) {
      bodyEl.innerHTML = `
        <div class="empty-state" style="padding:40px 0">
          <span class="empty-icon">📭</span>
          <h3>No cards yet</h3>
          <p>${escHtml(_currentMemberName)} hasn't created any day cards yet.</p>
        </div>`;
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
            Load More Days ⬇️
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
          let achHtml = `<div class="achievements-section" style="margin-top:10px;"><div class="achievements-section-header"><span class="achievements-section-label">🏆 Wins</span></div>`;
          for (const a of achs) {
            const linksHTML = buildLinksHTML(a.links || []);
            const descHTML  = a.description ? `<p class="ach-desc">${escHtml(a.description)}</p>` : '';
            achHtml += `<div class="achievement-item"><span class="achievement-item-title">🎖️ ${escHtml(a.title)}</span>${descHTML}<div class="ach-links-row">${linksHTML}</div></div>`;
          }
          achHtml += '</div>';
          dayCard.insertAdjacentHTML('beforeend', achHtml);
        } catch (_) {}
      })();
    }
  } catch (err) {
    bodyEl.innerHTML = `<p style="color:#ef4444;text-align:center">⚠️ Failed to load tasks.</p>`;
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
  titleEl.innerHTML = `<button id="btn-back-to-tasks" style="background:var(--bg-card);border:var(--border-2);border-radius:var(--r-sm);padding:4px 10px;font-size:11px;font-weight:800;cursor:pointer;margin-right:8px;box-shadow:2px 2px 0 var(--black);font-family:'Inter',sans-serif;text-transform:uppercase;color:var(--text);" title="Back to daily tasks">← Back</button>🏆 ${escHtml(_currentMemberName)}'s Achievements`;
  const backBtn = document.getElementById('btn-back-to-tasks');
  if (backBtn) backBtn.addEventListener('click', () => openMemberTasks(_currentMemberId, _currentMemberName));
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
          <span class="empty-icon">\uD83D\uDD12</span>
          <h3>Achievements are Private</h3>
          <p>${escHtml(_currentMemberName)} has chosen to hide their achievements.</p>
        </div>`;
        return;
      }
      achs = await resp.json();
    } catch (_) {}
    if (!achs.length) {
      bodyEl.innerHTML = `<div class="empty-state" style="padding:40px 0"><span class="empty-icon">🏆</span><h3>No achievements yet</h3><p>${escHtml(_currentMemberName)} hasn't logged any wins yet.</p></div>`;
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
  } catch (err) {
    bodyEl.innerHTML = `<p style="color:#ef4444;text-align:center">⚠️ Failed to load achievements.</p>`;
  }
}

// ══════════════════════════════════════════════════════════
//  ACHIEVEMENTS
// ══════════════════════════════════════════════════════════

// Track which memberId is currently open in the member-tasks modal
let _currentMemberId   = null;
let _currentMemberName = null;

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
    `<a class="${cls}" href="${escHtml(l)}" target="_blank" rel="noopener noreferrer">🔗 Link ${links.length > 1 ? i + 1 : 'Proof'}</a>`
  ).join('');
}

function renderDayAchievements(dayId, achievements, cardEl) {
  // Remove any existing section first
  const existing = cardEl.querySelector('.achievements-section');
  if (existing) existing.remove();

  if (achievements.length === 0) return;

  const section = document.createElement('div');
  section.className = 'achievements-section';

  let html = `<div class="achievements-section-header"><span class="achievements-section-label">🏆 Wins Logged</span></div>`;

  for (const a of achievements) {
    const linksHTML = buildLinksHTML(a.links || []);
    const descHTML  = a.description ? `<p class="ach-desc">${escHtml(a.description)}</p>` : '';
    html += `
      <div class="achievement-item" id="ach-item-${a._id}">
        <div class="achievement-item-top">
          <span class="achievement-item-title">🎖️ ${escHtml(a.title)}</span>
          <div class="achievement-item-actions">
            <button class="btn-edit-ach" onclick="openEditAchievementModal('${a._id}')" title="Edit">✏️</button>
            <button class="btn-del-ach" onclick="deleteAchievement('${a._id}', '${dayId}')" title="Delete">🗑</button>
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
}

// ── Achievements Page ──────────────────────────────────────
async function loadAchievements() {
  const container = document.getElementById('achievements-container');
  container.innerHTML = `<div class="loading-spinner"><div class="spinner-ring"></div><p>Loading...</p></div>`;
  try {
    const [privacyRes, achs] = await Promise.all([
      apiFetch(`${API}/api/auth/achievements-privacy`),
      apiFetch(`${API}/api/achievements`),
    ]);
    achievementsPublic = privacyRes.achievementsPublic !== false;
    allAchievements    = achs.achievements || [];
    renderAchievements();
  } catch (err) {
    console.error('Error loading achievements:', err);
    let errorMessage = '⚠️ Failed to load achievements. Please check your connection.';

    if (err.message) {
      if (err.message.includes('Too many requests') || err.message.includes('rate limit') || err.message.includes('429')) {
        errorMessage = '⚠️ Too many requests. Please try again later.';
      } else if (err.message.includes('Server offline') || err.message.includes('fetch')) {
        errorMessage = '⚠️ Server offline. Please check your connection.';
      } else {
        errorMessage = `⚠️ ${err.message}`;
      }
    }

    container.innerHTML = `<p style="color:#ef4444;text-align:center">${errorMessage}</p>`;
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
      <span class="ach-privacy-icon" id="ach-privacy-icon">${achievementsPublic ? '\uD83D\uDC41\uFE0F' : '\uD83D\uDD12'}</span>
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
        <span class="empty-icon">🏆</span>
        <h3>No achievements yet</h3>
        <p>Log your first win from any Daily Card!</p>
      </div>`;
    if (window.gsap) gsap.from('.empty-state', { opacity: 0, y: 20, duration: 0.5, ease: 'power2.out' });
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const a of allAchievements) fragment.appendChild(buildAchievementPageCard(a));
  container.appendChild(fragment);

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
    if (iconEl)   iconEl.textContent  = achievementsPublic ? '\uD83D\uDC41\uFE0F' : '\uD83D\uDD12';
    if (labelEl)  labelEl.textContent = achievementsPublic ? 'Visible to group members' : 'Hidden from group members';
    showToast(
      achievementsPublic
        ? '\uD83D\uDC41\uFE0F Achievements visible to your groups'
        : '\uD83D\uDD12 Achievements hidden from group members',
      'info'
    );
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
        <h3 class="ach-page-title">🎖️ ${escHtml(a.title)}</h3>
      </div>
      <div class="ach-page-actions">
        <button class="btn-edit-ach" onclick="openEditAchievementModal('${a._id}')" title="Edit">✏️</button>
        <button class="btn-del-ach" onclick="deleteAchievement('${a._id}', null)" title="Delete">🗑</button>
      </div>
    </div>
    ${descHTML}
    <div class="ach-links-row">${linksHTML}</div>
  `;
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
    <button class="btn-remove" onclick="this.parentElement.remove()" title="Remove">✕</button>
  `;
  builder.appendChild(row);
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

  const warnEl = document.getElementById('ach-link-warning');
  const btn    = document.getElementById('submit-ach-btn');

  if (links.length > 0 && hasInvalidLinks('ach-links-builder') && !_achAddLinkPending) {
    warnEl.style.display = 'block';
    _achAddLinkPending = true;
    btn.textContent = '⚠️ Confirm & Save';
    return;
  }
  warnEl.style.display = 'none';
  _achAddLinkPending = false;

  const dayId = activeDayIdForAchievement;
  const day   = allDays.find(d => d._id === dayId);
  const date  = day ? day.date : todayStr();

  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    const newAch = await apiFetch(`${API}/api/achievements`, {
      method: 'POST',
      body: JSON.stringify({ userId, dayId, date, title, description: desc, links }),
    });
    allAchievements.unshift(newAch);
    closeModal('modal-add-achievement');
    const cardEl = document.getElementById(`day-card-${dayId}`);
    if (cardEl) {
      const dayAchs = await apiFetch(`${API}/api/achievements/day/${dayId}`);
      renderDayAchievements(dayId, dayAchs, cardEl);
    }
    showToast('Achievement logged! 🎉', 'success');
  } catch (err) {
    showToast(err.message, 'error');
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
    btn.textContent = '⚠️ Confirm & Save';
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
    await apiFetch(`${API}/api/achievements/${achId}`, { method: 'DELETE' });
    allAchievements = allAchievements.filter(x => x._id !== achId);

    // Remove from inline card if dayId is known
    const knownDayId = dayId || allAchievements.find(x => x._id === achId)?.dayId;
    if (knownDayId) {
      const cardEl = document.getElementById(`day-card-${knownDayId}`);
      if (cardEl) {
        const dayAchs = await apiFetch(`${API}/api/achievements/day/${knownDayId}`);
        renderDayAchievements(knownDayId, dayAchs, cardEl);
      }
    }
    // If achievements page is open, re-render it
    if (document.getElementById('page-achievements').classList.contains('active')) {
      renderAchievements();
    }
    showToast('Achievement deleted.', 'info');
  } catch (err) {
    showToast('Failed to delete achievement.', 'error');
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
      },
    });
  } else {
    overlay.classList.remove('open');
  }
}

function closeModalOnOverlay(e, id) { if (e.target === e.currentTarget) closeModal(id); }

// ── Profile & Settings ─────────────────────────────────────
async function openProfileModal() {
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

  const avatarImg = document.getElementById('profile-avatar-img');
  const avatarInit = document.getElementById('profile-avatar-initial');
  if (userProfilePicture) {
    avatarImg.src = userProfilePicture;
    avatarImg.style.display = 'block';
    avatarInit.style.display = 'none';
  } else {
    avatarImg.src = '';
    avatarImg.style.display = 'none';
    avatarInit.style.display = 'block';
    avatarInit.textContent = userName.charAt(0).toUpperCase();
  }

  try {
    const res = await apiFetch(`${API}/api/auth/settings`);
    document.getElementById('profile-email').value = res.email || '';
    
    const unameInput = document.getElementById('profile-username');
    const unameHint = document.getElementById('profile-username-hint');
    const unameWarn = document.getElementById('profile-username-warning');
    
    unameInput.value = res.username || '';
    if (res.username) {
      unameInput.readOnly = true;
      unameInput.style.background = '#f5f5f5';
      unameInput.style.color = '#666';
      unameInput.style.cursor = 'not-allowed';
      if(unameHint) unameHint.style.display = 'none';
      if(unameWarn) unameWarn.style.display = 'block';
    } else {
      unameInput.readOnly = false;
      unameInput.style.background = '#fff';
      unameInput.style.color = 'var(--black)';
      unameInput.style.cursor = 'text';
      if(unameHint) unameHint.style.display = 'block';
      if(unameWarn) unameWarn.style.display = 'none';
    }

    const toggle = document.getElementById('email-notif-toggle');
    if (toggle) toggle.checked = res.emailNotifications;
    const publicToggle = document.getElementById('public-profile-toggle');
    if (publicToggle) publicToggle.checked = res.isPublicProfile !== false;
  } catch (err) {
    console.error('Failed to load profile settings:', err);
    showToast('Failed to load profile', 'error');
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
    const payload = { emailNotifications, isPublicProfile };
    if (!usernameInput.readOnly && username) {
      payload.username = username;
    }

    const res = await apiFetch(`${API}/api/auth/settings`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    
    showToast('Profile updated successfully!', 'success');
    closeModal('modal-profile');
  } catch (err) {
    showToast(err.message || 'Failed to update profile', 'error');
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
  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match.', 'warn');
    return;
  }
  if (newPassword.length < 5) {
    showToast('New password must be at least 5 characters.', 'warn');
    return;
  }

  const btn = document.getElementById('submit-pwd-btn');
  btn.disabled = true;
  btn.textContent = 'Updating...';

  try {
    await apiFetch(`${API}/api/auth/settings`, {
      method: 'PATCH',
      body: JSON.stringify({ oldPassword, newPassword })
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
    btn.textContent = 'Update Password';
  }
}

// ── Templates Logic ────────────────────────────────────────
async function loadTemplates() {
  try {
    allTemplates = await apiFetch(`${API}/api/templates`);
    populateTemplateDropdown();
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
        <button class="btn-edit-ach ripple" onclick="openEditTemplateModal('${t._id}')">✏️</button>
        <button class="btn-del-ach ripple" onclick="deleteTemplate('${t._id}')">🗑️</button>
      </div>
    `;
    list.appendChild(item);
  }
  container.appendChild(list);
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
function toggleDarkTheme(isDark) {
  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme', 'light');
  }
}

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme');
  const themeToggle = document.getElementById('dark-theme-toggle');
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    if (themeToggle) themeToggle.checked = true;
  }

  // Today's date subtitle
  const display = document.getElementById('today-date-display');
  if (display) {
    display.textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  }

  // Populate user chip in navbar
  const chipName   = document.getElementById('user-chip-name');
  if (chipName)   chipName.textContent   = userName;
  updateNavAvatar();

  // Random motivation chip
  const chip = document.getElementById('motivation-chip');
  if (chip) {
    const m = MOTIVATIONS[Math.floor(Math.random() * MOTIVATIONS.length)];
    chip.querySelector('.motivation-icon').textContent = m.icon;
    chip.querySelector('.motivation-text').textContent = m.text;
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

  showToast('Compressing and uploading image...', 'info');

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
        const formData = new FormData();
        formData.append('image', blob, 'profile.jpg');

        try {
          const _tok = localStorage.getItem('token');
          const res = await fetch(`${API}/api/auth/profile-picture`, {
            method: 'POST',
            headers: _tok ? { Authorization: `Bearer ${_tok}` } : {},
            body: formData,
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Failed to upload profile picture');
          }

          const data = await res.json();
          userProfilePicture = data.profilePicture;
          localStorage.setItem('userProfilePicture', userProfilePicture);

          // Update UI
          const avatarImg = document.getElementById('profile-avatar-img');
          const avatarInit = document.getElementById('profile-avatar-initial');
          avatarImg.src = userProfilePicture;
          avatarImg.style.display = 'block';
          avatarInit.style.display = 'none';

          updateNavAvatar();

          showToast('Profile picture updated!', 'success');
        } catch (error) {
          showToast(error.message, 'error');
        } finally {
          event.target.value = '';
        }
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
        item.style.padding = '8px 12px';
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '12px';
        item.style.cursor = 'pointer';
        item.style.borderBottom = '1px solid #eee';
        item.onmouseover = () => item.style.background = '#f5f5f5';
        item.onmouseout = () => item.style.background = 'transparent';

        let avatarHtml = `<div style="width:30px; height:30px; border-radius:50%; background:var(--primary); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:14px; flex-shrink:0;">${u.username.charAt(0).toUpperCase()}</div>`;
        if (u.profilePicture) {
          avatarHtml = `<img src="${u.profilePicture}" style="width:30px; height:30px; border-radius:50%; object-fit:cover; flex-shrink:0; border:1px solid #ccc;" />`;
        }

        const streakBadge = u.highestStreak > 0
          ? `<span style="font-size:11px; background:#fef3c7; color:#d97706; padding:2px 6px; border-radius:10px; font-weight:600;">🔥 ${u.highestStreak}</span>`
          : '';

        item.innerHTML = `
          ${avatarHtml}
          <div style="flex:1;">
            <div style="font-weight:600; font-size:14px; color:#000;">${u.username}</div>
            ${streakBadge ? `<div style="margin-top:2px;">${streakBadge}</div>` : ''}
          </div>
        `;
        
        item.onclick = () => {
          searchDropdown.style.display = 'none';
          if (searchInput) searchInput.value = '';
          if (window.collapseSearchInput) window.collapseSearchInput();
          openPublicProfile(u.username);
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
async function openPublicProfile(targetUsername) {
  try {
    const res = await fetch(`${API}/api/users/${encodeURIComponent(targetUsername)}`);
    if (!res.ok) {
      if (res.status === 403) {
        showToast('This profile is private.', 'error');
        return;
      }
      throw new Error('Failed to fetch profile');
    }
    const profile = await res.json();
    
    // Header
    const imgEl = document.getElementById('public-profile-img');
    const initEl = document.getElementById('public-profile-init');
    if (profile.profilePicture) {
      imgEl.src = profile.profilePicture;
      imgEl.style.display = 'block';
      initEl.style.display = 'none';
    } else {
      imgEl.src = '';
      imgEl.style.display = 'none';
      initEl.style.display = 'block';
      initEl.textContent = profile.username.charAt(0).toUpperCase();
    }
    
    document.getElementById('public-profile-name').textContent = profile.name || profile.username;
    document.getElementById('public-profile-username').textContent = `@${profile.username}`;
    document.getElementById('public-profile-streak').textContent = profile.currentStreak;
    document.getElementById('public-profile-highest-streak').textContent = profile.highestStreak || 0;
    
    // Graph
    renderContributionGraph(profile.contributionData);
    
    // Activity (Cards & Achievements)
    const actContainer = document.getElementById('public-profile-activity');
    actContainer.innerHTML = '';
    
    // Mix days and achievements, sort by date desc
    const combined = [];
    if (profile.days) {
      profile.days.forEach(d => combined.push({ type: 'day', date: d.date, data: d }));
    }
    if (profile.achievements) {
      profile.achievements.forEach(a => {
        const dStr = new Date(a.date).toISOString().split('T')[0];
        combined.push({ type: 'achievement', date: dStr, data: a });
      });
    }
    combined.sort((a, b) => b.date.localeCompare(a.date));
    
    const maxItems = 15; // Limit recent activity
    const toRender = combined.slice(0, maxItems);
    
    if (toRender.length === 0) {
      actContainer.innerHTML = '<p style="color:var(--text-muted);">No recent activity.</p>';
    } else {
      toRender.forEach(item => {
        if (item.type === 'day') {
          actContainer.appendChild(buildReadOnlyDayCard(item.data));
        } else {
          actContainer.appendChild(buildReadOnlyAchievementCard(item.data));
        }
      });
    }
    
    openModal('modal-public-profile');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderContributionGraph(data) {
  const container = document.getElementById('public-profile-graph');
  
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
      monthLabels += `<text x="${col * (cellSize + gap) + extraX}" y="12" dx="16" font-size="11" fill="#000" font-family="Inter, sans-serif" font-weight="600">${monthNames[curr.getMonth()]}</text>`;
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
      const stroke = completed > 0 ? 'rgba(0,0,0,0.2)' : 'rgba(27,31,35,0.06)';
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
  card.className = 'card neo-card';
  card.style.padding = '16px';
  card.style.marginBottom = '0';
  
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
  card.className = 'card neo-card';
  card.style.padding = '16px';
  card.style.marginBottom = '0';
  card.style.borderLeft = '4px solid var(--pink)';
  
  card.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
      <h4 style="margin:0; font-size:16px;">🏆 ${ach.title}</h4>
      <span style="font-size:12px; color:var(--text-muted);">${new Date(ach.date).toLocaleDateString()}</span>
    </div>
    ${ach.description ? `<p style="margin:0; font-size:14px; color:var(--text-muted);">${ach.description}</p>` : ''}
  `;
  return card;
}

function previewOwnProfile() {
  const unameInput = document.getElementById('profile-username');
  if (!unameInput) return;
  const uname = unameInput.value.trim();
  if (!uname) {
    showToast('You must set a username first before previewing your profile.', 'warn');
    return;
  }
  closeModal('modal-profile');
  openPublicProfile(uname);
}
