/* ============================================================
   CONSISTENCY TRACKER — Frontend Script
   GSAP-powered animations · Ripple effects · Smooth UX
   Groups feature · Mobile-optimised
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

// Edit-modal state
let editingDayId  = null;
let editingCatId  = null;
let editingGoalId = null;

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

  const pageEl = document.getElementById(`page-${page}`);
  const btnEl  = document.getElementById(`btn-${page}`);
  if (pageEl) pageEl.classList.add('active');
  if (btnEl)  btnEl.classList.add('active');

  // Sync bottom nav bar active state (mobile)
  document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
  const bnavBtn = document.getElementById(`bnav-${page}`);
  if (bnavBtn) bnavBtn.classList.add('active');

  if (page === 'goals')  loadGoals();
  if (page === 'groups') loadGroups();
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

  // Build all cards first using a fragment (no layout thrash)
  const fragment = document.createDocumentFragment();
  for (const day of allDays) {
    fragment.appendChild(buildDayCard(day));
  }
  container.appendChild(fragment);

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

  // ── Auto-scroll only on desktop ─────────────────────────
  // On mobile this causes the crawl effect (scroll fighting GSAP),
  // so we skip it entirely on touch screens.
  if (!isMobile()) {
    setTimeout(() => {
      const cards = container.querySelectorAll('.day-card');
      if (cards.length) {
        cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, 300);
  }
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

  // Animate progress bar after card is inserted into DOM
  // Using double-rAF to guarantee the element is painted before animating
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

    // ── On mobile, just prepend the card without re-rendering all cards
    //    (avoids the GSAP stagger lag when the modal closes)
    if (isMobile()) {
      const container = document.getElementById('cards-container');
      // Remove empty state if present
      const emptyState = container.querySelector('.empty-state');
      if (emptyState) emptyState.remove();

      const newCard = buildDayCard(newDay);
      // Start invisible, then fade in — no translateY to avoid bounce
      newCard.style.opacity = '0';
      container.appendChild(newCard);
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
      ${dl >= 0 ? `<button class="btn-ghost ripple" onclick="openEditGoalModal('${goal._id}')" style="padding:7px 14px;font-size:13px;">✏️ Edit</button>` : ''}
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

// ══════════════════════════════════════════════════════════
//  GROUPS
// ══════════════════════════════════════════════════════════

let allGroups = [];

async function loadGroups() {
  const container = document.getElementById('groups-container');
  container.innerHTML = `<div class="loading-spinner"><div class="spinner-ring"></div><p>Loading groups...</p></div>`;
  try {
    allGroups = await apiFetch(`${API}/api/groups/mine?userId=${encodeURIComponent(userId)}`);
    renderGroups();
  } catch (err) {
    container.innerHTML = `<p style="color:#ef4444;text-align:center">⚠️ Failed to load groups.</p>`;
  }
}

function renderGroups() {
  const container = document.getElementById('groups-container');
  container.innerHTML = '';

  // Separate my owned team from joined groups
  const myTeam       = allGroups.find(g => String(g.owner._id || g.owner) === String(userId));
  const joinedGroups = allGroups.filter(g => String(g.owner._id || g.owner) !== String(userId));

  // ── My Team section ───────────────────────────────────
  const myTeamSection = document.createElement('div');
  myTeamSection.className = 'groups-section';

  if (myTeam) {
    myTeamSection.innerHTML = `
      <div class="groups-section-header">
        <h2 class="groups-section-title">👑 My Team</h2>
      </div>
      <div class="group-card my-team-card">
        <div class="group-card-top">
          <div class="group-name-wrap">
            <span class="group-emoji">⚡</span>
            <span class="group-name">${escHtml(myTeam.name)}</span>
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
          ${buildMembersHTML(myTeam.members, myTeam._id)}
        </div>
      </div>
    `;
  } else {
    myTeamSection.innerHTML = `
      <div class="groups-section-header">
        <h2 class="groups-section-title">👑 My Team</h2>
      </div>
      <div class="group-empty-card">
        <span class="group-empty-icon">🏗️</span>
        <p>You haven't created a team yet.</p>
        <button class="btn-primary ripple" onclick="openCreateGroupModal()" id="create-team-btn">
          ＋ Create a Team
        </button>
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
            ${buildMembersHTML(group.members, group._id)}
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

function buildMembersHTML(members, groupId) {
  if (!members || !members.length) return '<p class="no-members">No members yet.</p>';

  return members.map(member => {
    const memberId   = member._id || member;
    const memberName = member.name || 'Unknown';
    const initial    = memberName.charAt(0).toUpperCase();
    const isSelf     = String(memberId) === String(userId);

    return `
      <div class="member-pill">
        <div class="member-avatar" style="background:${memberAvatarColor(memberName)}">${initial}</div>
        <span class="member-name">${escHtml(memberName)}${isSelf ? ' (you)' : ''}</span>
        ${!isSelf ? `<button class="member-view-btn ripple" onclick="openMemberTasks('${memberId}', '${escHtml(memberName)}')">View Tasks</button>` : ''}
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

// ── Member Tasks Modal (read-only) ─────────────────────────
async function openMemberTasks(memberId, memberName) {
  const titleEl = document.getElementById('member-tasks-title');
  const bodyEl  = document.getElementById('member-tasks-body');

  titleEl.textContent = `📋 ${memberName}'s Tasks`;
  bodyEl.innerHTML = `<div class="loading-spinner"><div class="spinner-ring"></div><p>Loading...</p></div>`;
  openModal('modal-member-tasks');

  try {
    const days = await apiFetch(`${API}/api/groups/member-days?memberId=${encodeURIComponent(memberId)}`);

    if (!days.length) {
      bodyEl.innerHTML = `
        <div class="empty-state" style="padding:40px 0">
          <span class="empty-icon">📭</span>
          <h3>No cards yet</h3>
          <p>${escHtml(memberName)} hasn't created any day cards yet.</p>
        </div>`;
      return;
    }

    // Sort newest-first for the viewer
    const sorted = [...days].sort((a, b) => b.date.localeCompare(a.date));

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
        <div class="member-day-card">
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
    bodyEl.innerHTML = html;
  } catch (err) {
    bodyEl.innerHTML = `<p style="color:#ef4444;text-align:center">⚠️ Failed to load tasks.</p>`;
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
      ['modal-add-day', 'modal-add-goal', 'modal-add-category',
       'modal-create-group', 'modal-join-group', 'modal-member-tasks',
       'modal-edit-category', 'modal-edit-goal'].forEach(id => {
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
});
