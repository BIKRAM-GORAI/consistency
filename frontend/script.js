/* ============================================================
   CONSISTENCY TRACKER — Frontend Script
   GSAP-powered animations · Ripple effects · Smooth UX
   ============================================================ */

const API = '';  // Same origin

// ── Auth ───────────────────────────────────────────────────
const userId   = localStorage.getItem('userId')   || '';
const userName = localStorage.getItem('userName') || 'User';

function logout() {
  localStorage.clear();
  window.location.replace('landing.html');
}

// ── State ──────────────────────────────────────────────────
let allDays  = [];
let allGoals = [];
let activeDayIdForCategory = null;

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
  if (!days.length) return 0;
  const sorted = [...days].sort((a, b) => b.date.localeCompare(a.date));
  const today = todayStr();
  let streak = 0;
  let checkDate = today;
  for (const day of sorted) {
    if (day.date !== checkDate) break;
    const { completed } = countTasks(day.categories);
    if (completed > 0) {
      streak++;
      const [y, m, d] = checkDate.split('-').map(Number);
      const prev = new Date(y, m-1, d-1);
      checkDate = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}-${String(prev.getDate()).padStart(2,'0')}`;
    } else break;
  }
  return streak;
}

/** Enhanced toast with GSAP */
function showToast(msg, type = 'info') {
  const toast   = document.getElementById('toast');
  const iconEl  = document.getElementById('toast-icon');
  const msgEl   = document.getElementById('toast-msg');

  const icons = { success: '✅', error: '❌', warn: '⚠️', info: '💡' };
  iconEl.textContent = icons[type] || icons.info;
  msgEl.textContent  = msg;

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

// ── Page switch ────────────────────────────────────────────
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.getElementById(`btn-${page}`).classList.add('active');

  // Sync bottom nav bar active state (mobile)
  document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
  const bnavBtn = document.getElementById(`bnav-${page}`);
  if (bnavBtn) bnavBtn.classList.add('active');

  if (page === 'goals') loadGoals();
}

// ── API ────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Days ───────────────────────────────────────────────────
async function loadDays() {
  try {
    allDays = await apiFetch(`${API}/api/days?userId=${encodeURIComponent(userId)}`);
    renderDays();
    updateStreak();
  } catch (err) {
    console.error('Error loading days:', err);
    document.getElementById('loading-days').innerHTML =
      `<p style="color:#ef4444;text-align:center">⚠️ Server offline. Start your backend first.</p>`;
  }
}

function updateStreak() {
  const streak = calculateStreak(allDays);
  const el = document.getElementById('streak-display');

  // Animate streak number with GSAP counter
  if (window.gsap) {
    gsap.to({ val: parseInt(el.textContent) || 0 }, {
      val: streak,
      duration: 0.8,
      ease: 'power2.out',
      onUpdate() { el.textContent = Math.round(this.targets()[0].val); },
    });
    // Pulse the streak pill
    if (streak > 0) {
      gsap.fromTo('#nav-streak', { scale: 1 }, { scale: 1.06, duration: 0.2, yoyo: true, repeat: 1, ease: 'power1.inOut' });
    }
  } else {
    el.textContent = streak;
  }
}

function renderDays() {
  const container = document.getElementById('cards-container');
  container.innerHTML = '';

  if (!allDays.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📅</span>
        <h3>No days yet</h3>
        <p>Click the + button below to start your first day card.</p>
      </div>`;
    if (window.gsap) {
      gsap.from('.empty-state', { opacity: 0, y: 20, duration: 0.5, ease: 'power2.out' });
    }
    return;
  }

  // Build all cards first
  const fragment = document.createDocumentFragment();
  for (const day of allDays) {
    fragment.appendChild(buildDayCard(day));
  }
  container.appendChild(fragment);

  // GSAP stagger entrance animation
  if (window.gsap) {
    gsap.from('.day-card', {
      opacity: 0,
      y: 30,
      duration: 0.5,
      stagger: 0.08,
      ease: 'power3.out',
      clearProps: 'all',
    });
  }

  // Auto scroll to latest card
  setTimeout(() => {
    const cards = container.querySelectorAll('.day-card');
    if (cards.length) {
      cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, 200);
}

function buildDayCard(day) {
  const today   = todayStr();
  const isToday = day.date === today;
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
    categoriesHTML += `
      <div class="category-block">
        <div class="category-header">
          <span class="category-name">${escHtml(cat.name)}</span>
          <span class="category-count">${completedCount}/${cat.tasks.length}</span>
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
      <span class="card-badge ${isToday ? 'badge-today' : 'badge-past'}">${isToday ? '✨ Today' : 'Past'}</span>
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
  `;

  // Animate progress bar in after card is inserted into DOM
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      animateProgressBar(`pct-fill-${day._id}`, pct);
    });
  });

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
      body: JSON.stringify({ userId, date, categories, summary }),
    });
    allDays.push(newDay);
    allDays.sort((a, b) => a.date.localeCompare(b.date));
    closeModal('modal-add-day');
    renderDays();
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

// ── Goals ──────────────────────────────────────────────────
async function loadGoals() {
  const container = document.getElementById('goals-container');
  container.innerHTML = `<div class="loading-spinner"><div class="spinner-ring"></div><p>Loading...</p></div>`;
  try {
    allGoals = await apiFetch(`${API}/api/goals?userId=${encodeURIComponent(userId)}`);
    renderGoals();
  } catch (err) {
    container.innerHTML = `<p style="color:#ef4444;text-align:center">Failed to load goals.</p>`;
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
  const pct = calcProgress([{ tasks: goal.tasks }]);
  const dl  = daysLeft(goal.deadline);

  let dlClass = 'days-safe';
  let dlText  = `${dl} days left`;
  if (dl < 0)        { dlClass = 'days-overdue'; dlText = `⚠️ Overdue by ${Math.abs(dl)}d`; }
  else if (dl <= 2)  { dlClass = 'days-danger';  dlText = `🚨 ${dl}d left!`; }
  else if (dl <= 5)  { dlClass = 'days-warn';    dlText = `⏰ ${dl} days left`; }

  const card = document.createElement('div');
  card.className = 'goal-card';
  card.id = `goal-card-${goal._id}`;

  let tasksHTML = '';
  for (const task of goal.tasks) {
    const doneStyle = task.completed ? 'text-decoration:line-through;color:var(--lt-green);' : '';
    tasksHTML += `
      <div class="task-item">
        <input type="checkbox" class="task-checkbox"
          ${task.completed ? 'checked' : ''}
          onchange="toggleGoalTask('${goal._id}','${task._id}',this.checked)"
          id="gtask-${task._id}" />
        <label class="task-title" for="gtask-${task._id}" style="${doneStyle}">${escHtml(task.title)}</label>
      </div>`;
  }

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

    <div class="goal-actions">
      <button class="btn-delete ripple" onclick="deleteGoal('${goal._id}')">🗑 Delete</button>
    </div>
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

// ── Modal helpers ──────────────────────────────────────────
function openModal(id) {
  const overlay = document.getElementById(id);
  const modalEl = overlay.querySelector('.modal');

  // Kill any in-flight tween on this modal to prevent opacity getting stuck
  if (window.gsap) gsap.killTweensOf(modalEl);

  // Ensure the modal starts fully visible (clear any stale inline styles)
  if (window.gsap) gsap.set(modalEl, { clearProps: 'all' });

  overlay.classList.add('open');

  if (window.gsap) {
    gsap.fromTo(modalEl,
      { opacity: 0, y: 28, scale: 0.94 },
      { opacity: 1, y: 0, scale: 1, duration: 0.38, ease: 'back.out(1.5)', clearProps: 'all' }
    );
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

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Today's date subtitle
  const display = document.getElementById('today-date-display');
  if (display) {
    display.textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  }

  // Populate user chip in navbar
  const chipName   = document.getElementById('user-chip-name');
  const chipAvatar = document.getElementById('user-chip-avatar');
  if (chipName)   chipName.textContent   = userName;
  if (chipAvatar) chipAvatar.textContent = userName.charAt(0).toUpperCase();

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
    gsap.from('.add-day-section', { opacity: 0, y: 20, duration: 0.5, delay: 0.4, ease: 'power2.out' });
  }

  // Escape key closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      ['modal-add-day', 'modal-add-goal', 'modal-add-category'].forEach(id => {
        if (document.getElementById(id).classList.contains('open')) closeModal(id);
      });
    }
  });

  loadDays();
});
