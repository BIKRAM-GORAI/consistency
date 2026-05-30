// ── Achievements Module ────────────────────────────────────
console.log("[Module] achievements.js initializing...");

// Local toast reference delegation to bypass strict module scope reference errors
const showToast = (...args) => window.showToast(...args);

// ══════════════════════════════════════════════════════════
//  ACHIEVEMENTS
// ══════════════════════════════════════════════════════════

// ── Inline day card: load + render achievements ────────────
async function loadDayAchievements(dayId, cardEl) {
  try {
    // Pass ?own=1 so the backend bypasses the privacy check for the owner
    const achievements = await apiFetch(`${window.API}/api/achievements/day/${dayId}?own=1`);
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
      window.allAchievements = cached;
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
  if (now - _lastAchsLoad < 30000 && window.allAchievements.length > 0) return;

  if (!navigator.onLine) {
    if (window.allAchievements.length > 0) {
      showToast('Offline Mode: Using cached wins.', 'info');
    } else {
      renderAchievements();
    }
    return;
  }
  _lastAchsLoad = now;

  try {
    const [privacyRes, achs] = await Promise.all([
      apiFetch(`${window.API}/api/auth/achievements-privacy`),
      apiFetch(`${window.API}/api/achievements`),
    ]);
    
    window.achievementsPublic = privacyRes.achievementsPublic !== false;
    const serverAchs = achs.achievements || [];
    
    // Preserve local-only changes (those not yet synced) — don't overwrite them
    const pendingAchItems = await localDb.syncQueue
      .filter(x => x.entity === 'achievements')
      .toArray();
    const pendingIds = new Set(pendingAchItems.map(q => q.targetId).filter(Boolean));
    const pendingLocalIds = new Set(pendingAchItems.map(q => q.localId).filter(Boolean));

    const safeToUpdate = serverAchs.filter(a => !pendingIds.has(a._id));
    const localAchs = await localDb.achievements.toArray();
    const toDelete = localAchs
      .filter(a => !pendingIds.has(a._id) && !pendingLocalIds.has(a._id))
      .map(a => a._id);
    
    await localDb.achievements.bulkDelete(toDelete);
    await localDb.achievements.bulkPut(safeToUpdate);

    // Reconstruct final window.allAchievements in memory: server data + locally modified achievements
    const localPendingAchs = await Promise.all(
      [...pendingIds, ...pendingLocalIds].map(id => localDb.achievements.get(id))
    );
    const localPendingMap = new Map();
    localPendingAchs.filter(Boolean).forEach(a => localPendingMap.set(a._id, a));

    window.allAchievements = serverAchs.map(sa => localPendingMap.get(sa._id) || sa);
    for (const [id, ach] of localPendingMap) {
      if (!window.allAchievements.find(a => a._id === id)) {
        window.allAchievements.push(ach);
      }
    }
    
    renderAchievements();
  } catch (err) {
    console.warn('Background achievements refresh failed:', err);
    if (window.allAchievements.length === 0) {
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
      <span class="ach-privacy-icon" id="ach-privacy-icon">${window.achievementsPublic ? '<i data-lucide="eye"></i>' : '<i data-lucide="lock"></i>'}</span>
      <div>
        <p class="ach-privacy-title">Achievement Visibility</p>
        <p class="ach-privacy-label" id="ach-privacy-label">${window.achievementsPublic ? 'Visible to group members' : 'Hidden from group members'}</p>
      </div>
    </div>
    <label class="toggle-switch" title="Toggle achievement visibility">
      <input type="checkbox" id="ach-privacy-toggle" ${window.achievementsPublic ? 'checked' : ''} onchange="toggleAchievementPrivacy()" />
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
    </label>
  `;
  container.appendChild(privacyBanner);

  if (!window.allAchievements.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon"><i data-lucide="trophy"></i></span>
        <h3>No achievements yet</h3>
        <p>Log your first win from any Daily Card!</p>
      </div>`;
    if (window.gsap) {
      const emptyEl = container.querySelector('.empty-state');
      if (emptyEl) gsap.fromTo(emptyEl, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', clearProps: 'all' });
    }
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const a of window.allAchievements) fragment.appendChild(buildAchievementPageCard(a));
  container.appendChild(fragment);
  if (window.lucide) lucide.createIcons({ root: container });

  if (window.gsap) {
    gsap.from('.achievement-page-card', { opacity: 0, y: 30, duration: 0.5, stagger: 0.07, ease: 'power3.out', clearProps: 'all' });
  }
}

async function toggleAchievementPrivacy() {
  const newVal   = !window.achievementsPublic;
  const toggleEl = document.getElementById('ach-privacy-toggle');
  const iconEl   = document.getElementById('ach-privacy-icon');
  const labelEl  = document.getElementById('ach-privacy-label');
  if (toggleEl) toggleEl.disabled = true;
  try {
    const res = await apiFetch(`${window.API}/api/auth/achievements-privacy`, {
      method: 'PATCH',
      body: JSON.stringify({ achievementsPublic: newVal }),
    });
    window.achievementsPublic = res.achievementsPublic;
    if (toggleEl) { toggleEl.checked = window.achievementsPublic; toggleEl.disabled = false; }
    if (iconEl)   iconEl.innerHTML  = window.achievementsPublic ? '<i data-lucide="eye"></i>' : '<i data-lucide="lock"></i>';
    if (labelEl)  labelEl.textContent = window.achievementsPublic ? 'Visible to group members' : 'Hidden from group members';
    showToast(
      window.achievementsPublic
        ? 'Achievements visible to your groups'
        : 'Achievements hidden from group members',
      'info'
    );
    if (window.lucide) lucide.createIcons({ root: iconEl });
  } catch (err) {
    if (toggleEl) { toggleEl.checked = window.achievementsPublic; toggleEl.disabled = false; }
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
  window.activeDayIdForAchievement = dayId;
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

  const dayId = window.activeDayIdForAchievement;
  const day   = window.allDays.find(d => d._id === dayId);
  const date  = day ? day.date : todayStr();

  const tempId = `temp_${Date.now()}`;
  const localAch = { _id: tempId, userId: window.userId, dayId, date, title, description: desc, links };

  try {
    // 1. Update UI and Local DB instantly
    window.allAchievements.unshift(localAch);
    await window.localDb.achievements.add(localAch);
    closeModal('modal-add-achievement');

    const cardEl = document.getElementById(`day-card-${dayId}`);
    if (cardEl) {
      // Filter locally instead of fetching
      const dayAchs = window.allAchievements.filter(a => a.dayId === dayId);
      renderDayAchievements(dayId, dayAchs, cardEl);
    }
    showToast(`Achievement logged locally! <i data-lucide="party-popper"></i>`, 'success');

    // 2. Queue for sync
    window.syncManager.addToQueue('POST', 'achievements', null, { userId: window.userId, dayId, date, title, description: desc, links }, tempId);
  } catch (err) {
    console.error('Offline achievement write error:', err);
  } finally {
    btn.disabled = false; btn.textContent = 'Save Achievement';
  }
}

// ── Edit Achievement ───────────────────────────────────────
let _achEditLinkPending = false;

function openEditAchievementModal(achId) {
  const a = window.allAchievements.find(x => x._id === achId);
  window.editingAchievementId = achId;
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
    const updated = await apiFetch(`${window.API}/api/achievements/${window.editingAchievementId}`, {
      method: 'PUT',
      body: JSON.stringify({ title, description: desc, links }),
    });
    const idx = window.allAchievements.findIndex(x => x._id === window.editingAchievementId);
    if (idx !== -1) window.allAchievements[idx] = updated;
    closeModal('modal-edit-achievement');
    const cardEl = document.getElementById(`day-card-${updated.dayId}`);
    if (cardEl) {
      const dayAchs = await apiFetch(`${window.API}/api/achievements/day/${updated.dayId}`);
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
    const knownDayId = dayId || window.allAchievements.find(x => x._id === achId)?.dayId;

    // 1. Update UI and Local DB instantly
    window.allAchievements = window.allAchievements.filter(x => x._id !== achId);
    await window.localDb.achievements.delete(achId);

    if (knownDayId) {
      const cardEl = document.getElementById(`day-card-${knownDayId}`);
      if (cardEl) {
        const dayAchs = window.allAchievements.filter(a => a.dayId === knownDayId);
        renderDayAchievements(knownDayId, dayAchs, cardEl);
      }
    }
    if (document.getElementById('page-achievements')?.classList.contains('active')) {
      renderAchievements();
    }
    showToast('Achievement deleted locally.', 'success');

    // 2. Queue for sync
    window.syncManager.addToQueue('DELETE', 'achievements', achId);
  } catch (err) {
    console.error('Offline delete error:', err);
  }
}

// ── Achievements Module Bindings ───────────────────────────
window.loadDayAchievements = loadDayAchievements;
window.buildLinksHTML = buildLinksHTML;
window.renderDayAchievements = renderDayAchievements;
window.loadAchievements = loadAchievements;
window.renderAchievements = renderAchievements;
window.toggleAchievementPrivacy = toggleAchievementPrivacy;
window.buildAchievementPageCard = buildAchievementPageCard;
window.addAchLinkField = addAchLinkField;
window.getLinksFromBuilder = getLinksFromBuilder;
window.hasInvalidLinks = hasInvalidLinks;
window.openAddAchievementModal = openAddAchievementModal;
window.submitAddAchievement = submitAddAchievement;
window.openEditAchievementModal = openEditAchievementModal;
window.submitEditAchievement = submitEditAchievement;
window.deleteAchievement = deleteAchievement;
console.log("[Module] achievements.js loaded and Achievements bound to window");
