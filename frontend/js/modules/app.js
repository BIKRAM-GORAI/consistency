// ── App Module ──────────────────────────────────────────────
console.log("[Module] app.js initializing...");

async function loadTemplates() {
  try {
    // 1. Try local cache first for instant load
    if (window.localDb) {
      window.allTemplates = await window.localDb.templates.toArray();
      if (window.allTemplates.length > 0) populateTemplateDropdown();
    }

    // 2. Fetch fresh from network if online
    if (navigator.onLine) {
      const fresh = await apiFetch(`${window.API}/api/templates`);
      window.allTemplates = fresh;
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
  for (const t of window.allTemplates) {
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
  const t = window.allTemplates.find(x => x._id === select.value);
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
        <button class="btn-remove" onclick="removeCategoryField(${idx})" title="Remove"><i data-lucide="trash-2"></i></button>
      </div>
      <div class="tasks-builder" id="tasks-build-${idx}"></div>
      <button class="btn-ghost ripple" style="font-size:12px;padding:6px 12px;border-radius:8px;" onclick="addTaskField(${idx})"><i data-lucide="plus"></i> Add Task</button>
    `;
    builder.appendChild(item);
    
    const tasksBuilder = document.getElementById(`tasks-build-${idx}`);
    for (const task of cat.tasks) {
      const row = document.createElement('div');
      row.className = 'task-input-row';
      row.innerHTML = `
        <input type="text" class="form-control" placeholder="Task title..." value="${escHtml(task.title)}" />
        <button class="btn-remove" onclick="this.parentElement.remove()" title="Remove"><i data-lucide="trash-2"></i></button>
      `;
      tasksBuilder.appendChild(row);
    }
  }
  if (window.lucide) lucide.createIcons({ root: document.getElementById('categories-builder') });
  showToast('Template imported! You can edit before creating.', 'success');
}

function openSaveTemplateModal(dayId) {
  window.activeDayIdForTemplate = dayId;
  document.getElementById('template-name-input').value = '';
  openModal('modal-save-template');
}

async function submitSaveTemplate() {
  const name = document.getElementById('template-name-input').value.trim();
  if (!name) { showToast('Please enter a template name.', 'warn'); return; }
  
  const day = window.allDays.find(d => d._id === window.activeDayIdForTemplate);
  if (!day) return;
  
  const categories = day.categories.map(c => ({
    name: c.name,
    tasks: c.tasks.map(t => ({ title: t.title, completed: false }))
  }));

  const btn = document.getElementById('submit-save-template-btn');
  btn.disabled = true; btn.textContent = 'Saving...';
  
  try {
    const newT = await apiFetch(`${window.API}/api/templates`, {
      method: 'POST',
      body: JSON.stringify({ userId: window.userId, name, categories })
    });
    window.allTemplates.unshift(newT);
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
  
  if (!window.allTemplates.length) {
    container.innerHTML = '<p style="text-align:center; color:var(--text-muted);">No templates saved yet.</p>';
    return;
  }
  
  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '10px';
  
  for (const t of window.allTemplates) {
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
  window.editingTemplateId = templateId;
  const t = window.allTemplates.find(x => x._id === templateId);
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
      <button class="btn-remove" onclick="this.parentElement.parentElement.remove()" title="Remove"><i data-lucide="trash-2"></i></button>
    </div>
    <div class="tasks-builder" id="edit-template-tasks-build-${idx}"></div>
    <button class="btn-ghost ripple" style="font-size:12px;padding:6px 12px;border-radius:8px;" onclick="addEditTemplateTaskField(${idx})"><i data-lucide="plus"></i> Add Task</button>
  `;
  builder.appendChild(item);
  if (window.lucide) lucide.createIcons({ root: item });
  
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
    <button class="btn-remove" onclick="this.parentElement.remove()" title="Remove"><i data-lucide="trash-2"></i></button>
  `;
  builder.appendChild(row);
  if (window.lucide) lucide.createIcons({ root: row });
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
    const res = await apiFetch(`${window.API}/api/templates/${window.editingTemplateId}`, {
      method: 'PUT',
      body: JSON.stringify({ name, categories })
    });
    const idx = window.allTemplates.findIndex(x => x._id === window.editingTemplateId);
    if (idx !== -1) window.allTemplates[idx] = res;
    
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
    await apiFetch(`${window.API}/api/templates/${templateId}`, { method: 'DELETE' });
    window.allTemplates = window.allTemplates.filter(x => x._id !== templateId);
    populateTemplateDropdown();
    renderTemplatesList();
    showToast('Template deleted', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleDarkTheme(isDark) {
  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme', 'light');
  }
  
  try {
    await apiFetch(`${window.API}/api/auth/settings`, {
      method: 'PATCH',
      body: JSON.stringify({ theme: isDark ? 'dark' : 'light' })
    });
  } catch(err) {
    console.error('Failed to sync theme preference:', err);
  }
}

async function toggleLeaderboardShowcase(checked) {
  if (!navigator.onLine) {
    showToast('Leaderboard showcase settings cannot be changed while offline.', 'error');
    const saved = localStorage.getItem('showOnLeaderboard') !== 'false';
    const settingsToggle = document.getElementById('leaderboard-showcase-settings-toggle');
    if (settingsToggle) settingsToggle.checked = saved;
    const mainToggle = document.getElementById('leaderboard-showcase-toggle');
    if (mainToggle) mainToggle.checked = saved;
    return;
  }

  const settingsToggle = document.getElementById('leaderboard-showcase-settings-toggle');
  if (settingsToggle) settingsToggle.checked = checked;
  const mainToggle = document.getElementById('leaderboard-showcase-toggle');
  if (mainToggle) mainToggle.checked = checked;

  const payload = { showOnLeaderboard: checked };
  const userId = localStorage.getItem('window.userId');

  try {
    if (window.localDb) {
      const cached = await window.localDb.userProfile.get(window.userId) || {};
      await window.localDb.userProfile.put({ ...cached, ...payload, userId: window.userId });
    }
    localStorage.setItem('showOnLeaderboard', checked.toString());

    if (window.syncManager) {
      window.syncManager.addToQueue('PATCH', 'auth/settings', null, payload);
    }
    showToast(checked ? 'Showcasing on leaderboard!' : 'Removed from leaderboard showcase.', 'success');
    
    // Await the server update so the backend has updated before we refresh!
    if (navigator.onLine) {
      try {
        await apiFetch(`${window.API}/api/auth/settings`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.warn('Background showcase sync failed (offline):', err);
      }
    }

    // Refresh leaderboard instantly in-place!
    loadLeaderboard(true);
  } catch (err) {
    console.error('Error saving leaderboard showcase settings:', err);
    showToast('Error saving settings.', 'error');
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
  // Restrict App Installation option to website view only
  const isInstalledPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isAndroidNative || isInstalledPWA) {
    const installContainer = document.getElementById('pwa-install-container');
    if (installContainer) {
      installContainer.style.setProperty('display', 'none', 'important');
    }
  }

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
  const storedName = localStorage.getItem('window.userName');
  if (chipName)   chipName.textContent = storedName || window.userName;
  updateNavAvatar();

  // Load showcase toggles' checked state from cached localStorage instantly.
  // Toggles are disabled by default in HTML — they get enabled only after a confirmed window.API success.
  const userId = localStorage.getItem('window.userId');
  if (window.userId) {
    const savedShowOnLeaderboard = localStorage.getItem('showOnLeaderboard');
    const showcaseToggle = document.getElementById('leaderboard-showcase-settings-toggle');
    const lbShowcaseToggle = document.getElementById('leaderboard-showcase-toggle');

    if (savedShowOnLeaderboard !== null) {
      const isShowcase = savedShowOnLeaderboard === 'true';
      if (showcaseToggle) showcaseToggle.checked = isShowcase;
      if (lbShowcaseToggle) lbShowcaseToggle.checked = isShowcase;
    } else {
      // Default to true instantly matching server-side default
      if (showcaseToggle) showcaseToggle.checked = true;
      if (lbShowcaseToggle) lbShowcaseToggle.checked = true;
      if (window.localDb) {
        window.localDb.userProfile.get(window.userId).then(cached => {
          if (cached) {
            const isShowcase = cached.showOnLeaderboard !== false;
            if (showcaseToggle) showcaseToggle.checked = isShowcase;
            if (lbShowcaseToggle) lbShowcaseToggle.checked = isShowcase;
            localStorage.setItem('showOnLeaderboard', isShowcase.toString());
          }
        }).catch(err => console.warn('Failed to load cached showcase settings:', err));
      }
    }
  }

  // Set goals sort disabled state based on current connection
  const goalsSortSelect = document.getElementById('goals-sort-select');
  if (goalsSortSelect) {
    goalsSortSelect.disabled = !navigator.onLine;
  }

  // Intercept click on the sort container when offline to show warning toast
  const sortContainer = document.getElementById('goals-sort-container');
  if (sortContainer) {
    sortContainer.addEventListener('click', (e) => {
      if (!navigator.onLine) {
        showToast('Sorting is disabled in offline mode.', 'warn');
      }
    });
  }

  // Real-time online/offline window listeners to enable/disable toggles instantly
  window.addEventListener('online',  () => {
    setLeaderboardTogglesEnabled(true);
    const sel = document.getElementById('goals-sort-select');
    if (sel) sel.disabled = false;
  });
  window.addEventListener('offline', () => {
    setLeaderboardTogglesEnabled(false);
    const sel = document.getElementById('goals-sort-select');
    if (sel) {
      sel.disabled = true;
      sel.value = 'default';
    }
    if (window.goalsSortOption !== 'default') {
      window.goalsSortOption = 'default';
      sortGoals();
      renderGoals();
    }
  });

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

  const lastPage = localStorage.getItem('activePage') || 'home';
  if (lastPage !== 'home') {
    showPage(lastPage);
  }

  proactiveSync(); // Syncs profile, goals, achievements, etc.
  loadDays();
  loadTemplates();
});

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
    const res = await fetch(`${window.API}/api/users/search?q=${encodeURIComponent(query)}`);
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


/* ==========================================================================
   PWA Installation Logic
   ========================================================================== */
let deferredPrompt;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // 1. Register the fresh worker with a version query to force-bypass cache
      const reg = await navigator.serviceWorker.register('/sw.js?v=57');
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
  if (isAndroidNative) return; // Skip completely in native app wrapper
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

async function triggerPwaInstallDirect() {
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

function installPWA() {
  // If the visitor is on an Android device, show the clean PWA vs APK choice screen!
  const isAndroidDevice = /android/i.test(navigator.userAgent);
  if (isAndroidDevice) {
    const modal = document.getElementById('pwa-modal-overlay');
    if (modal) modal.style.display = 'flex';
  } else {
    // If desktop or iOS, trigger standard PWA direct installation
    triggerPwaInstallDirect();
  }
}

/* ==========================================================================
   Capacitor Native APK Auto-Update System
   ========================================================================== */
async function checkNativeAppUpdates() {
  if (!isAndroidNative) return;
  
  try {
    const res = await fetch('/app-version.json');
    if (!res.ok) return;
    const data = await res.json();
    
    const latest = data.latestVersion;
    const current = window.runningAppVersion;
    
    // Simple helper to parse version blocks and compare (e.g. "1.1" > "1.0")
    const compareVersions = (v1, v2) => {
      const parts1 = String(v1).split('.').map(Number);
      const parts2 = String(v2).split('.').map(Number);
      const maxLen = Math.max(parts1.length, parts2.length);
      for (let i = 0; i < maxLen; i++) {
        const val1 = parts1[i] || 0;
        const val2 = parts2[i] || 0;
        if (val1 > val2) return 1;
        if (val1 < val2) return -1;
      }
      return 0;
    };
    
    if (compareVersions(latest, current) > 0) {
      console.log(`[Native APK Update] New version available: ${latest} (running: ${current})`);
      showUpdateModal(latest, data.apkUrl, data.forceUpdate, data.releaseNotes);
    } else {
      console.log(`[Native APK Update] App is up to date (running: ${current})`);
    }
  } catch (err) {
    console.warn('[Native APK Update] Failed to check for native updates:', err);
  }
}

function triggerApkDownload(apkUrl, forceUpdate) {
  const isNativeApp = (window.Capacitor && window.Capacitor.isNativePlatform()) || 
                      navigator.userAgent.includes("Capacitor");
  if (isNativeApp) {
    // Force opening in native system browser so it delegates the download cleanly
    if (window.Capacitor?.Plugins?.Browser) {
      window.Capacitor.Plugins.Browser.open({ url: apkUrl });
    } else {
      window.open(apkUrl, '_system');
    }
  } else {
    // PWA/Web: trigger standard direct download
    const link = document.createElement('a');
    link.href = apkUrl;
    link.download = 'Consistency.Daily.apk';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (!forceUpdate) {
    const modal = document.getElementById('native-update-modal');
    if (modal) modal.remove();
  }
}

function showUpdateModal(latestVersion, apkUrl, forceUpdate, releaseNotes) {
  const existing = document.getElementById('native-update-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'native-update-modal';
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.style.zIndex = '100000';
  overlay.style.backdropFilter = 'blur(10px)';
  overlay.style.background = 'rgba(10, 10, 10, 0.85)';
  overlay.style.overflowY = 'auto';
  overlay.style.alignItems = 'flex-start';
  overlay.style.justifyContent = 'center';
  overlay.style.padding = '20px 16px 40px 16px';

  const modalHtml = `
    <div class="modal" style="width: 100%; max-width: 450px; text-align: center; padding: 36px 24px; background: var(--yellow); border: 4px solid var(--black); border-radius: 12px; box-shadow: 10px 10px 0 var(--black); margin: auto; max-height: none; box-sizing: border-box; position: relative;" onclick="event.stopPropagation()">
      <h2 style="font-family: 'Space Grotesk', sans-serif; font-size: 26px; font-weight: 900; margin-bottom: 12px; text-transform: uppercase; color: var(--black); display: flex; align-items: center; justify-content: center; gap: 8px;">
        🚀 Update Available
      </h2>
      <p style="font-size: 13px; font-weight: 800; color: var(--black); margin-bottom: 18px; text-transform: uppercase; background: rgba(0,0,0,0.06); padding: 6px; border-radius: 6px; display: inline-block; box-sizing: border-box;">
        Version v${latestVersion} is out!
      </p>
      <div style="text-align: left; background: #fff; border: 3px solid var(--black); border-radius: 8px; padding: 16px; margin-bottom: 24px; max-height: 150px; overflow-y: auto; box-shadow: 3px 3px 0 var(--black); box-sizing: border-box;">
        <h4 style="font-family: 'Space Grotesk', sans-serif; font-weight: 800; font-size: 13px; text-transform: uppercase; margin-bottom: 6px; color: var(--black);">What's New:</h4>
        <p style="font-size: 13px; font-weight: 600; color: #444; line-height: 1.5; white-space: pre-wrap; margin: 0;">${releaseNotes || 'Bug fixes and performance improvements.'}</p>
      </div>
      <div style="display: flex; gap: 14px; flex-direction: column;">
        <button onclick="triggerApkDownload('${apkUrl}', ${forceUpdate})" class="btn-primary ripple" style="display: flex; align-items: center; justify-content: center; padding: 14px; font-size: 16px; text-transform: uppercase; font-weight: 900; letter-spacing: 0.5px; background: var(--pink); color: #fff; width: 100%; margin: 0; border: 3px solid var(--black); cursor: pointer; box-shadow: 4px 4px 0 var(--black); box-sizing: border-box;">
          Install Update
        </button>
        ${!forceUpdate ? `
          <button class="btn-ghost ripple" style="border: 2px solid #0a0a0a; background: #ffffff; color: #0a0a0a; font-size: 14px; padding: 12px; text-transform: uppercase; font-weight: 800; box-shadow: 3px 3px 0 #0a0a0a; cursor: pointer;" onclick="document.getElementById('native-update-modal').remove()">
            Maybe Later
          </button>
        ` : `
          <p style="font-size: 11px; font-weight: 700; color: rgba(0,0,0,0.6); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 0;">
            ⚠️ This is a critical update. Update is required to continue.
          </p>
        `}
      </div>
    </div>
  `;

  overlay.innerHTML = modalHtml;
  document.body.appendChild(overlay);
  
  if (window.lucide) lucide.createIcons({ root: overlay });
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
  if (nameEl) nameEl.value = localStorage.getItem('window.userName') || 'User';
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
    
    const res = await fetch(`${window.API}/api/reviews`, {
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
 * Share public profile link using Web Share window.API or Clipboard fallback
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
      text: `Check out my consistency journey on Consistency Daily! ${window.backendStreak} day streak and counting!`,
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
    return await apiFetch(`${window.API}/api/users/log-share`, {
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
  if (window.lbSort === type && window.lbPage > 1) return; 
  window.lbSort = type;
  
  // UI feedback for buttons
  const btnCurrent = document.getElementById('btn-sort-current');
  const btnHighest = document.getElementById('btn-sort-highest');
  if (btnCurrent) btnCurrent.classList.toggle('active', window.lbSort === 'current');
  if (btnHighest) btnHighest.classList.toggle('active', window.lbSort === 'highest');
  
  loadLeaderboard(true);
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
      const rank = ((window.lbPage - 1) * 10) + index + 1;
      listContainer.appendChild(renderLeaderboardItem(user, rank));
    });
  }
}

async function loadLeaderboard(reset = false) {
  if (window.lbIsLoading) return;
  if (reset) {
    window.lbPage = 1;
    const listContainer = document.getElementById('leaderboard-list');
    if (listContainer) listContainer.innerHTML = '';
    const myRankArea = document.getElementById('lb-my-rank-area');
    if (myRankArea) myRankArea.innerHTML = '';
  }

  window.lbIsLoading = true;
  const loadingEl = document.getElementById('lb-loading');
  if (loadingEl) loadingEl.style.display = 'block';
  const loadMoreWrap = document.getElementById('leaderboard-load-more-wrap');
  if (loadMoreWrap) loadMoreWrap.style.display = 'none';

  // 1. STALE: If first page, try loading from cache instantly
  if (reset) {
    try {
      const cached = await window.localDb.leaderboard.get(window.lbSort);
      if (cached && cached.users) {
        renderLeaderboardData(cached.users, true);
        if (loadingEl) loadingEl.style.display = 'none';
      }
    } catch (e) {}
  }

  // 2. REVALIDATE: Fetch from server
  try {
    const res = await apiFetch(`${window.API}/api/users/leaderboard?sort=${window.lbSort}&page=${window.lbPage}&limit=10`);
    if (!res) return;

    const { users, total, hasMore } = res;
    window.lbHasMore = hasMore;
    
    // Cache the first page for offline access
    if (reset && users.length > 0) {
      await window.localDb.leaderboard.put({ sort: window.lbSort, users, timestamp: Date.now() });
    }

    renderLeaderboardData(users, reset);

    const loadMoreWrapFinal = document.getElementById('leaderboard-load-more-wrap');
    if (loadMoreWrapFinal) loadMoreWrapFinal.style.display = window.lbHasMore ? 'block' : 'none';
    window.lbPage++;

    // My Rank Spotlight (if first page)
    if (reset) {
      const myUsername = localStorage.getItem('userUsername');
      const isMeInTop10 = users.some(u => u.username === myUsername);
      const myRankArea = document.getElementById('lb-my-rank-area');
      if (myRankArea) myRankArea.innerHTML = '';
      
      const myRankVal = res.myRank;
      
      if (!isMeInTop10 && myUsername && myRankVal !== null && myRankVal !== undefined) {
        const me = {
          name: localStorage.getItem('window.userName') || 'You',
          username: myUsername,
          profilePicture: localStorage.getItem('window.userProfilePicture'),
          currentStreak: (res.myCurrentStreak !== undefined && res.myCurrentStreak !== null) ? res.myCurrentStreak : (parseInt(localStorage.getItem('userCurrentStreak')) || 0),
          highestStreak: (res.myHighestStreak !== undefined && res.myHighestStreak !== null) ? res.myHighestStreak : (parseInt(localStorage.getItem('userHighestStreak')) || 0)
        };
        
        if (myRankArea) {
          const myRankCard = renderLeaderboardItem(me, myRankVal, true);
          myRankCard.classList.add('my-rank-card');
          myRankArea.appendChild(myRankCard);
        }
      }
    }

    // Refresh icons
    if (window.lucide) lucide.createIcons();
    // Confirmed server reachable — enable the leaderboard showcase toggle
    setLeaderboardTogglesEnabled(true);

  } catch (err) {
    console.error('Leaderboard load error:', err);
  } finally {
    window.lbIsLoading = false;
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



// ── TOP-LEVEL STARTUP DEEP-LINK CHECK ──
setTimeout(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const openChatGroupId = urlParams.get('openChat');
  const deepLinkTimeId = urlParams.get('t');
  
  if (openChatGroupId) {
    // If there is a unique timestamp token, ensure it has not been consumed yet (prevents WebView session restore duplicates)
    if (deepLinkTimeId) {
      const alreadyConsumed = localStorage.getItem('deeplink_consumed_' + deepLinkTimeId);
      if (alreadyConsumed) {
        console.log('[Startup Deep-Link] Deep-link token ' + deepLinkTimeId + ' already consumed. Suppressing duplicate modal trigger.');
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.pushState({ path: newUrl }, '', newUrl);
        return;
      }
      // Consume the deep-link token
      localStorage.setItem('deeplink_consumed_' + deepLinkTimeId, 'true');
    }

    console.log('[Startup Deep-Link] Detected openChat parameter after startup delay:', openChatGroupId);
    
    // Switch to groups page instantly so groups list is loaded
    showPage('groups');
    
    // Open the group chat modal using our robust deep-link helper
    openGroupChatFromDeepLink(openChatGroupId);
    
    // Clean up the URL search params so reloading doesn't open it again
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.pushState({ path: newUrl }, '', newUrl);
  }
  
  // Check for native app updates after deep-link check completes
  if (typeof checkNativeAppUpdates === 'function') {
    checkNativeAppUpdates();
  }
}, 800); // 800ms delay to let Dexie DB and Auth fully initialize



/* ============================================================
   AI INSIGHTS & WEEKLY WRAP-UP CARDS — FRONTEND OPERATIONS
   ============================================================ */

/**
 * Fetches the remaining daily AI generations count from the server.
 */
async function fetchAiLimit() {
  try {
    const res = await apiFetch(`${window.API}/api/ai/generations-left`);
    if (res && typeof res.generationsLeft !== 'undefined') {
      window.generationsLeft = res.generationsLeft;
      updateAllAiInsightButtons();
    }
  } catch (err) {
    console.warn('[AI Limit] Failed to fetch generations left:', err);
  } finally {
    // Always apply offline state after fetching (or failing to fetch) the limit
    updateOfflineButtonState();
  }
}

/**
 * Updates all dynamically visible AI recap and milestone buttons with the latest daily limits count.
 */
function updateAllAiInsightButtons() {
  const badges = document.querySelectorAll('.ai-limit-badge');
  badges.forEach(b => {
    b.textContent = `⚡ ${window.generationsLeft} left`;
  });
}

/**
 * Toggles the body.is-offline class to enable/disable all network-dependent buttons via CSS.
 * forceOffline=true bypasses navigator.onLine (used when a real network fetch failure occurs).
 * The CSS rule in index.html handles all the visual disabling — no per-button DOM walking needed.
 */
function updateOfflineButtonState(forceOffline = false) {
  const isOnline = !forceOffline && navigator.onLine;
  if (isOnline) {
    document.body.classList.remove('is-offline');
    // Also explicitly re-enable any buttons that had disabled=true set (belt + suspenders)
    document.querySelectorAll('[data-requires-network="true"]').forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '';
      btn.style.cursor = '';
      btn.style.pointerEvents = '';
    });
  } else {
    document.body.classList.add('is-offline');
    // Also explicitly set disabled to prevent keyboard/programmatic activation
    document.querySelectorAll('[data-requires-network="true"]').forEach(btn => {
      btn.disabled = true;
    });
  }
}

/**
 * Sends a POST request to generate a 2-sentence AI Daily Recap and updates the Day card.
 */
async function generateDailySummary(dayId, dateStr) {
  if (!navigator.onLine) {
    showToast('Offline: Cannot generate AI recap.', 'warn');
    return;
  }

  const container = document.getElementById(`ai-recap-block-${dayId}`);
  if (!container) return;

  const wasEmpty = container.classList.contains('empty-recap') || !container.innerHTML.trim();
  const originalHTML = container.innerHTML;

  // Make sure container is visible and styled properly
  container.style.display = 'block';
  container.style.marginTop = '15px';

  // Render glowing loader card
  container.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; gap: 10px; padding: 14px; background: var(--bg-muted); border: 2px solid var(--black); border-radius: 8px; box-shadow: 3px 3px 0 var(--black);">
      <div class="spinner-ring" style="width: 18px; height: 18px; border-width: 2.5px; border-color: var(--text) transparent transparent transparent;"></div>
      <span style="font-size: 12px; font-weight: 800; font-family: 'Space Grotesk', sans-serif; text-transform: uppercase;">AI is summarizing today's tasks...</span>
    </div>
  `;

  try {
    const res = await apiFetch(`${window.API}/api/ai/daily-summary/${dateStr}`, {
      method: 'POST'
    });

    if (res && res.summary) {
      if (typeof res.generationsLeft !== 'undefined') {
        window.generationsLeft = res.generationsLeft;
        updateAllAiInsightButtons();
      }
      // Find in memory array to update cache
      const day = window.allDays.find(d => d._id === dayId);
      if (day) {
        day.summary = res.summary;
        if (window.localDb) {
          await window.localDb.days.put(day);
        }
      }

      // Re-render only this Day card smoothly
      const cardEl = document.getElementById(`day-card-${dayId}`);
      if (cardEl) {
        const preLoadedAchs = (typeof batchAchievements !== 'undefined' && batchAchievements) 
          ? batchAchievements.filter(a => a.dayId === dayId) 
          : [];
        cardEl.replaceWith(buildDayCard(day, preLoadedAchs));
      }
      showToast(`Daily insights generated successfully! (⚡ ${window.generationsLeft} left today)`, 'success');
    }
  } catch (err) {
    console.error('Failed to generate daily summary:', err);
    showToast(err.message || 'Failed to generate recap.', 'error');
    container.innerHTML = originalHTML; // restore button
    if (wasEmpty) {
      container.style.display = 'none';
      container.style.marginTop = '0';
    }
  }
}

/**
 * Builds a beautiful standalone Weekly Summary Card element to place inline.
 */
function buildWeeklySummaryCard(summary) {
  const card = document.createElement('div');
  card.className = 'day-card weekly-summary-card';
  card.id = `weekly-summary-${summary._id}`;
  card.style.cssText = `
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%), var(--bg-card);
    border: 3.5px solid var(--black);
    border-radius: var(--r-lg);
    padding: 24px 28px;
    box-shadow: 7px 7px 0 var(--black);
    position: relative;
    margin-bottom: 24px;
  `;
  
  card.innerHTML = `
    <button onclick="deleteWeeklySummaryCard('${summary._id}')" data-requires-network="true" data-original-title="Delete wrap-up" style="position: absolute; top: 20px; right: 20px; background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 16px;" title="Delete wrap-up"><i data-lucide="trash-2" style="width: 18px; height: 18px;"></i></button>
    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 14px;">
      <span style="font-size: 26px;">🏆</span>
      <div>
        <h3 style="font-family: 'Space Grotesk', sans-serif; font-weight: 900; font-size: 16px; text-transform: uppercase; color: var(--text); letter-spacing: 0.5px; margin: 0; line-height: 1.2;">7-Day AI Wrap-Up</h3>
        <span style="font-size: 10px; font-weight: 900; color: var(--black); text-transform: uppercase; background: var(--lime); padding: 2px 8px; border: 1.5px solid var(--black); border-radius: 4px; box-shadow: 1.5px 1.5px 0 var(--black); display: inline-block; margin-top: 4px;">${escHtml(summary.rangeText)}</span>
      </div>
    </div>
    <p style="font-size: 13.5px; line-height: 1.65; color: var(--text); font-weight: 600; margin: 0; white-space: pre-wrap;">${escHtml(summary.summaryText)}</p>
  `;
  
  if (window.lucide) {
    setTimeout(() => lucide.createIcons({ root: card }), 10);
  }
  return card;
}

/**
 * Builds the glowing "Generate Weekly Wrap-Up" milestone card.
 */
function buildWeeklySummaryButtonCard(dayId, dateStr) {
  const card = document.createElement('div');
  card.className = 'day-card weekly-summary-button-card';
  card.id = `weekly-summary-btn-card-${dayId}`;
  card.style.cssText = `
    background: linear-gradient(135deg, var(--bg-card) 0%, rgba(139, 92, 246, 0.03) 100%);
    border: 3px dashed var(--black);
    border-radius: var(--r-lg);
    padding: 28px 24px;
    box-shadow: 5px 5px 0 var(--black);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    margin-bottom: 20px;
    position: relative;
  `;
  
  card.innerHTML = `
    <div style="margin-bottom: 10px; font-size: 26px;">✨</div>
    <h3 style="font-family: 'Space Grotesk', sans-serif; font-weight: 900; font-size: 14px; margin-bottom: 6px; text-transform: uppercase; color: var(--text); letter-spacing: 0.5px;">7-Card Milestone Achieved!</h3>
    <p style="font-size: 11.5px; font-weight: 600; color: var(--text-muted); max-width: 320px; margin: 0 auto 16px; line-height: 1.5;">Combine your past 7 logged cards into a single AI weekly productivity summary.</p>
    <button class="ripple" data-requires-network="true" data-original-title="Generate Weekly Wrap-Up" onclick="generateWeeklySummaryCard('${dayId}')" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 24px; background: var(--black); color: var(--yellow); border: 2px solid var(--black); border-radius: 8px; font-family: 'Space Grotesk', sans-serif; font-weight: 900; font-size: 11px; text-transform: uppercase; cursor: pointer; box-shadow: 3px 3px 0 var(--black); transition: all 0.2s;">
      <span>GENERATE WEEKLY WRAP-UP (<span class="ai-limit-badge">⚡ ${window.generationsLeft} left</span>)</span>
    </button>
  `;
  return card;
}

/**
 * Submits POST request to compile preceding 7 days of logs into a standalone WeeklySummary.
 */
async function generateWeeklySummaryCard(dayId) {
  if (!navigator.onLine) {
    showToast('Offline: Cannot generate AI wrap-up.', 'warn');
    return;
  }

  const container = document.getElementById(`weekly-summary-btn-card-${dayId}`);
  if (!container) return;

  const originalHTML = container.innerHTML;

  // Render loading state
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';
  container.style.textAlign = 'center';

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 16px 0; width: 100%;">
      <div class="spinner-ring" style="width: 28px; height: 28px; border-width: 3px; border-color: var(--text) transparent transparent transparent; margin-bottom: 16px;"></div>
      <h4 style="font-family: 'Space Grotesk', sans-serif; font-weight: 900; font-size: 14px; text-transform: uppercase; color: var(--text); letter-spacing: 0.5px; margin: 0 0 6px 0;">Analyzing Your Streak...</h4>
      <p style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin: 0; max-width: 320px;">Consolidating all completed tasks and streaks for the past 7 cards...</p>
    </div>
  `;

  try {
    const responseSummary = await apiFetch(`${window.API}/api/ai/weekly-summary/${dayId}`, {
      method: 'POST'
    });

    if (responseSummary && responseSummary._id) {
      if (typeof responseSummary.generationsLeft !== 'undefined') {
        window.generationsLeft = responseSummary.generationsLeft;
        updateAllAiInsightButtons();
      }
      window.allWeeklySummaries.push(responseSummary);
      
      // Save locally in Dexie for offline persistence
      if (window.localDb) {
        try {
          await window.localDb.weeklySummaries.put(responseSummary);
        } catch (dexieErr) {
          console.warn('Failed to cache weekly summary offline:', dexieErr);
        }
      }
      
      // Morphs/replaces the button card with the final AI summary card smoothly
      const freshCard = buildWeeklySummaryCard(responseSummary);
      container.replaceWith(freshCard);
      
      // GSAP entrance zoom
      if (window.gsap) {
        gsap.from(freshCard, { scale: 0.95, opacity: 0, duration: 0.4, ease: 'back.out(1.5)' });
      }
      showToast(`7-Day wrap-up generated successfully! (⚡ ${window.generationsLeft} left today)`, 'success');
    }
  } catch (err) {
    console.error('Failed to generate weekly summary:', err);
    showToast(err.message || 'Failed to generate wrap-up.', 'error');
    container.innerHTML = originalHTML; // restore button
  }
}

/**
 * Triggers DELETE request to delete a standalone WeeklySummary document.
 */
async function deleteWeeklySummaryCard(summaryId) {
  if (!navigator.onLine) {
    showToast('Offline: Cannot delete card.', 'warn');
    return;
  }

  if (!confirm('Are you sure you want to delete this Weekly Wrap-Up card?')) return;

  try {
    const res = await apiFetch(`${window.API}/api/ai/weekly-summary/${summaryId}`, {
      method: 'DELETE'
    });

    if (res && res.deletedId) {
      window.allWeeklySummaries = window.allWeeklySummaries.filter(s => s._id !== summaryId);
      
      // Delete locally from Dexie for offline persistence
      if (window.localDb) {
        try {
          await window.localDb.weeklySummaries.delete(summaryId);
        } catch (dexieErr) {
          console.warn('Failed to delete weekly summary from offline database:', dexieErr);
        }
      }
      
      const cardEl = document.getElementById(`weekly-summary-${summaryId}`);
      if (cardEl) {
        if (window.gsap) {
          gsap.to(cardEl, {
            opacity: 0,
            scale: 0.9,
            height: 0,
            paddingTop: 0,
            paddingBottom: 0,
            marginTop: 0,
            marginBottom: 0,
            duration: 0.35,
            ease: 'power2.inOut',
            onComplete: () => {
              cardEl.remove();
              renderDays(); // Triggers a complete feed rebuild to restore the Generate button at that index
            }
          });
        } else {
          cardEl.remove();
          renderDays();
        }
      }
      showToast('Weekly summary deleted successfully.', 'success');
    }
  } catch (err) {
    console.error('Failed to delete weekly summary:', err);
    showToast(err.message || 'Failed to delete summary.', 'error');
  }
}

/**
 * Builds a beautiful standalone 30-Day (Monthly) Summary Card element.
 */
function buildMonthlySummaryCard(summary) {
  const card = document.createElement('div');
  card.className = 'day-card weekly-summary-card monthly-summary-card';
  card.id = `weekly-summary-${summary._id}`;
  card.style.cssText = `
    background: linear-gradient(135deg, rgba(236, 72, 153, 0.12) 0%, rgba(139, 92, 246, 0.12) 50%, rgba(99, 102, 241, 0.12) 100%), var(--bg-card);
    border: 3.5px solid var(--black);
    border-radius: var(--r-lg);
    padding: 26px 30px;
    box-shadow: 7px 7px 0 var(--black);
    position: relative;
    margin-bottom: 24px;
  `;
  
  card.innerHTML = `
    <button onclick="deleteWeeklySummaryCard('${summary._id}')" data-requires-network="true" data-original-title="Delete wrap-up" style="position: absolute; top: 20px; right: 20px; background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 16px;" title="Delete wrap-up"><i data-lucide="trash-2" style="width: 18px; height: 18px;"></i></button>
    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">
      <span style="font-size: 28px;">👑</span>
      <div>
        <h3 style="font-family: 'Space Grotesk', sans-serif; font-weight: 900; font-size: 16px; text-transform: uppercase; color: var(--text); letter-spacing: 0.5px; margin: 0; line-height: 1.2;">30-Day Elite Summary</h3>
        <span style="font-size: 10px; font-weight: 900; color: #fff; text-transform: uppercase; background: var(--pink); padding: 2px 8px; border: 1.5px solid var(--black); border-radius: 4px; box-shadow: 1.5px 1.5px 0 var(--black); display: inline-block; margin-top: 4px;">${escHtml(summary.rangeText)}</span>
      </div>
    </div>
    <div class="monthly-summary-content" style="font-size: 13px; line-height: 1.65; color: var(--text); font-weight: 600; margin: 0; white-space: pre-wrap;">${escHtml(summary.summaryText)}</div>
  `;
  
  if (window.lucide) {
    setTimeout(() => lucide.createIcons({ root: card }), 10);
  }
  return card;
}

/**
 * Builds the glowing "Generate 30-Day Summary" milestone card.
 */
function buildMonthlySummaryButtonCard(dayId, dateStr) {
  const card = document.createElement('div');
  card.className = 'day-card weekly-summary-button-card monthly-summary-button-card';
  card.id = `weekly-summary-btn-card-${dayId}`;
  card.style.cssText = `
    background: linear-gradient(135deg, rgba(236, 72, 153, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%), var(--bg-card);
    border: 3.5px dashed var(--pink);
    border-radius: var(--r-lg);
    padding: 30px 24px;
    box-shadow: 6px 6px 0 var(--black);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    margin-bottom: 20px;
    position: relative;
  `;
  
  card.innerHTML = `
    <div style="margin-bottom: 10px; font-size: 28px;">💎</div>
    <h3 style="font-family: 'Space Grotesk', sans-serif; font-weight: 900; font-size: 14px; margin-bottom: 6px; text-transform: uppercase; color: var(--text); letter-spacing: 0.5px;">30-Card Diamond Milestone!</h3>
    <p style="font-size: 11.5px; font-weight: 600; color: var(--text-muted); max-width: 320px; margin: 0 auto 16px; line-height: 1.5;">Compile your past 30 days of consistent logging into a deep AI monthly productivity summary.</p>
    <button class="ripple" data-requires-network="true" data-original-title="Generate 30-Day Summary" onclick="generateMonthlySummaryCard('${dayId}')" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 24px; background: var(--pink); color: #fff; border: 2px solid var(--black); border-radius: 8px; font-family: 'Space Grotesk', sans-serif; font-weight: 900; font-size: 11px; text-transform: uppercase; cursor: pointer; box-shadow: 3px 3px 0 var(--black); transition: all 0.2s;">
      <span>GENERATE 30-DAY SUMMARY (<span class="ai-limit-badge">⚡ ${window.generationsLeft} left</span>)</span>
    </button>
  `;
  return card;
}

/**
 * Submits POST request to compile preceding 30 days of logs into a standalone Monthly summary.
 */
async function generateMonthlySummaryCard(dayId) {
  if (!navigator.onLine) {
    showToast('Offline: Cannot generate AI monthly summary.', 'warn');
    return;
  }

  const container = document.getElementById(`weekly-summary-btn-card-${dayId}`);
  if (!container) return;

  const originalHTML = container.innerHTML;

  // Render loading state
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';
  container.style.textAlign = 'center';

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 16px 0; width: 100%;">
      <div class="spinner-ring" style="width: 28px; height: 28px; border-width: 3px; border-color: var(--text) transparent transparent transparent; margin-bottom: 16px;"></div>
      <h4 style="font-family: 'Space Grotesk', sans-serif; font-weight: 900; font-size: 14px; text-transform: uppercase; color: var(--text); letter-spacing: 0.5px; margin: 0 0 6px 0;">Assembling Monthly Archive...</h4>
      <p style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin: 0; max-width: 320px;">Synthesizing your consistency metrics, habits, and highlights for the past 30 cards...</p>
    </div>
  `;

  try {
    const responseSummary = await apiFetch(`${window.API}/api/ai/monthly-summary/${dayId}`, {
      method: 'POST'
    });

    if (responseSummary && responseSummary._id) {
      if (typeof responseSummary.generationsLeft !== 'undefined') {
        window.generationsLeft = responseSummary.generationsLeft;
        updateAllAiInsightButtons();
      }
      window.allWeeklySummaries.push(responseSummary);
      
      // Morphs/replaces the button card with the final AI summary card smoothly
      const freshCard = buildMonthlySummaryCard(responseSummary);
      container.replaceWith(freshCard);
      
      // GSAP entrance zoom
      if (window.gsap) {
        gsap.from(freshCard, { scale: 0.95, opacity: 0, duration: 0.4, ease: 'back.out(1.5)' });
      }
      showToast(`30-Day elite insights generated! (⚡ ${window.generationsLeft} left today)`, 'success');
    }
  } catch (err) {
    console.error('Failed to generate monthly summary:', err);
    showToast(err.message || 'Failed to generate monthly summary.', 'error');
    container.innerHTML = originalHTML; // restore button
  }
}



// ── App Module Bindings ─────────────────────────────────────
window.loadTemplates = loadTemplates;
window.populateTemplateDropdown = populateTemplateDropdown;
window.applyTemplate = applyTemplate;
window.openSaveTemplateModal = openSaveTemplateModal;
window.submitSaveTemplate = submitSaveTemplate;
window.openManageTemplatesModal = openManageTemplatesModal;
window.renderTemplatesList = renderTemplatesList;
window.openEditTemplateModal = openEditTemplateModal;
window.addEditTemplateCategoryField = addEditTemplateCategoryField;
window.addEditTemplateTaskField = addEditTemplateTaskField;
window.submitEditTemplate = submitEditTemplate;
window.deleteTemplate = deleteTemplate;
window.toggleDarkTheme = toggleDarkTheme;
window.toggleLeaderboardShowcase = toggleLeaderboardShowcase;
window.togglePasswordVisibility = togglePasswordVisibility;
window.openLightbox = openLightbox;
window.formatDuration = formatDuration;
window.downloadAudio = downloadAudio;
window.checkAudioCache = checkAudioCache;
window.playAudioFromBlob = playAudioFromBlob;
window.closeLightbox = closeLightbox;
window.performSearch = performSearch;
window.dismissPwaPrompt = dismissPwaPrompt;
window.triggerPwaInstallDirect = triggerPwaInstallDirect;
window.installPWA = installPWA;
window.checkNativeAppUpdates = checkNativeAppUpdates;
window.triggerApkDownload = triggerApkDownload;
window.showUpdateModal = showUpdateModal;
window.openFeedbackModal = openFeedbackModal;
window.submitFeedback = submitFeedback;
window.sharePublicProfile = sharePublicProfile;
window.logShare = logShare;
window.setLeaderboardSort = setLeaderboardSort;
window.loadLeaderboard = loadLeaderboard;
window.renderLeaderboardItem = renderLeaderboardItem;
window.fetchAiLimit = fetchAiLimit;
window.updateAllAiInsightButtons = updateAllAiInsightButtons;
window.updateOfflineButtonState = updateOfflineButtonState;
window.generateDailySummary = generateDailySummary;
window.buildWeeklySummaryCard = buildWeeklySummaryCard;
window.buildWeeklySummaryButtonCard = buildWeeklySummaryButtonCard;
window.generateWeeklySummaryCard = generateWeeklySummaryCard;
window.deleteWeeklySummaryCard = deleteWeeklySummaryCard;
window.buildMonthlySummaryCard = buildMonthlySummaryCard;
window.buildMonthlySummaryButtonCard = buildMonthlySummaryButtonCard;
window.generateMonthlySummaryCard = generateMonthlySummaryCard;
console.log("[Module] app.js loaded and App bound to window");
