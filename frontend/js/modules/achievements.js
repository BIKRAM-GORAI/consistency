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

/** Ensure thumbnail URL preserves the full aspect ratio without cropping sides */
function getSafeThumbUrl(thumbUrl, fullUrl) {
  const url = thumbUrl || fullUrl;
  if (!url) return '';
  // If Cloudinary URL has c_fill,w_400,h_400 (which crops into square), replace with uncropped c_limit,w_800
  return url.replace(/\/upload\/c_fill,w_\d+,h_\d+[^/]*\//, '/upload/c_limit,w_800,q_auto,f_auto/');
}

/** Build HTML for a list of links (used in both inline and page cards) */
function buildLinksHTML(links, cls = 'ach-link') {
  if (!links || !links.length) return '';
  return links.map((l, i) =>
    `<a class="${cls}" href="${escHtml(l)}" target="_blank" rel="noopener noreferrer">${links.length > 1 ? `Open ${i + 1}` : 'Open'} <i data-lucide="arrow-up-right"></i></a>`
  ).join('');
}

function renderDayAchievements(dayId, achievements, cardEl, isOwner = null) {
  // Remove any existing sections first
  const existingSec = cardEl.querySelector('.achievements-section');
  if (existingSec) existingSec.remove();
  const existingPhotos = cardEl.querySelector('.day-photos-strip');
  if (existingPhotos) existingPhotos.remove();
  const existingBox = cardEl.querySelector('.day-achievements-container');
  if (existingBox) existingBox.remove();

  if (!achievements || achievements.length === 0) return;

  const currentUserId = window.userId || localStorage.getItem('userId');
  const achOwnerId = achievements[0]?.userId;
  const userIsOwner = isOwner !== null ? isOwner : (!achOwnerId || String(achOwnerId) === String(currentUserId));

  // Milestone Day UI transformation if card has 0 tasks
  const dayObj = (window.allDays || []).find(d => String(d._id) === String(dayId));
  const totalTasks = (dayObj?.categories || []).reduce((acc, cat) => acc + (cat.tasks || []).length, 0);
  if (totalTasks === 0) {
    const progSec = cardEl.querySelector('.progress-section');
    if (progSec) {
      progSec.className = 'progress-section milestone-progress-section';
      progSec.style.padding = '4px 0 10px 0';
      progSec.innerHTML = `
        <div class="progress-meta" style="justify-content: flex-start;">
          <span class="milestone-day-badge" style="font-size: 11px; font-weight: 900; background: linear-gradient(135deg, #ec4899, #8b5cf6); color: #ffffff; padding: 4px 10px; border-radius: 6px; border: 2px solid var(--black); box-shadow: 2px 2px 0 var(--black); text-transform: uppercase; letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 6px;">
            <i data-lucide="trophy" style="width: 14px; height: 14px;"></i> Goal Milestone Day
          </span>
        </div>
      `;
      if (window.lucide) lucide.createIcons({ root: progSec });
    }
    const catList = cardEl.querySelector('.categories-list');
    if (catList && catList.innerHTML.includes('No categories yet.')) {
      catList.innerHTML = '';
    }
  }

  const addRow = cardEl.querySelector('.ach-add-row');

  // 1. Separate Photo Proof from Text Achievements
  const photoAchs = achievements.filter(a => a.type === 'photo' || (a.photos && a.photos.length > 0));
  const textAchs = achievements.filter(a => a.type !== 'photo' && (!a.photos || a.photos.length === 0));

  if (photoAchs.length === 0 && textAchs.length === 0) return;

  // 2. Build Unified Sub-Transparent Container with "Achievements" Heading
  const container = document.createElement('div');
  container.className = 'day-achievements-container';

  let html = `
    <div class="day-achievements-header" style="display: flex; align-items: center; justify-content: center; margin-bottom: 10px;">
      <span style="font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; display: flex; align-items: center; gap: 7px; color: var(--text);">
        <i data-lucide="trophy" style="width: 16px; height: 16px; color: var(--yellow);"></i> Achievements
      </span>
    </div>
  `;

  // Render Landscape Photos without cropping sides
  if (photoAchs.length > 0) {
    const allPhotos = [];
    photoAchs.forEach(a => {
      (a.photos || []).forEach(p => {
        const cleanCaption = (p.caption && !/photo(\s*proof)?/i.test(p.caption.trim())) ? p.caption.trim() : '';
        const rawTitle = (a.title && a.title !== 'Photos' && !/photo(\s*proof)?/i.test(a.title.trim())) ? a.title.trim() : '';
        const displayTitle = (rawTitle || cleanCaption || 'Photo').slice(0, 30);
        allPhotos.push({
          ...p,
          achId: a._id,
          date: a.date,
          achTitle: a.title,
          caption: cleanCaption,
          displayTitle: displayTitle
        });
      });
    });
    // Sort chronologically so Photo 1 is first, Photo 2 is second
    allPhotos.sort((a, b) => new Date(a.uploadedAt || 0) - new Date(b.uploadedAt || 0));

    // Calculate columns for laptop screen: up to 8 max per row.
    // If >= 4 photos (e.g. 6 in current test), divide the card width equally into pCount parts so it fills 100% width evenly.
    // If > 8 photos, wrap to next row with 8 columns per row.
    // If < 4 photos, use 6 columns so 1-3 photos have balanced, proportional widths instead of being gigantic.
    const pCount = allPhotos.length;
    const desktopCols = pCount > 8 ? 8 : (pCount >= 4 ? pCount : 6);

    html += `<div class="day-photos-strip" style="--photo-cols: ${desktopCols}; margin-bottom: ${textAchs.length > 0 ? '8px' : '0'};">`;
    allPhotos.forEach(p => {
      const safeThumb = getSafeThumbUrl(p.thumbnailUrl, p.url);
      html += `
        <div class="day-photo-chip" onclick="window.openPhotoLightbox('${escHtml(p.url)}', '${escHtml(safeThumb)}', '', '${escHtml(p.date)}', '${p.achId}', '${p._id}', ${userIsOwner ? 'true' : 'false'})" title="Click to view full photo">
          <img src="${escHtml(safeThumb)}" alt="Photo" loading="lazy" decoding="async" />
        </div>
      `;
    });
    html += `</div>`;
  }

  // Render Text Achievements inside the container with clean, symmetrical alignment
  if (textAchs.length > 0) {
    html += `<div class="day-achievements-list" style="margin-top: ${photoAchs.length > 0 ? '10px' : '0'};">`;
    for (const a of textAchs) {
      const linksHTML = buildLinksHTML(a.links || []);
      const descHTML  = a.description ? `<div class="ach-desc-wrap"><p class="ach-desc">${escHtml(a.description)}</p></div>` : '';
      html += `
        <div class="achievement-item" id="ach-item-${a._id}">
          <div class="achievement-item-main">
            <div class="ach-icon-badge">
              <i data-lucide="medal" style="width: 14px; height: 14px;"></i>
            </div>
            <span class="achievement-item-title">${escHtml(a.title)}</span>
            <div class="achievement-item-actions">
              ${linksHTML}
              ${userIsOwner ? `
                <button class="btn-edit-ach" onclick="openEditAchievementModal('${a._id}')" title="Edit"><i data-lucide="edit-3" style="width: 12px; height: 12px;"></i></button>
                <button class="btn-del-ach" onclick="deleteAchievement('${a._id}', '${dayId}')" title="Delete"><i data-lucide="trash-2" style="width: 12px; height: 12px;"></i></button>
              ` : ''}
            </div>
          </div>
          ${descHTML}
        </div>`;
    }
    html += `</div>`;
  }

  container.innerHTML = html;
  if (addRow) cardEl.insertBefore(container, addRow);
  else cardEl.appendChild(container);
  if (window.lucide) lucide.createIcons({ root: container });
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

/** Pick a pastel clay color deterministically from an id string */
function getClayAchColor(id) {
  const palette = [
    { bg: '#fde68a', text: '#78350f' }, // Amber
    { bg: '#c4b5fd', text: '#1e1b4b' }, // Lavender
    { bg: '#86efac', text: '#14532d' }, // Mint
    { bg: '#f9a8d4', text: '#831843' }, // Pink
    { bg: '#93c5fd', text: '#1e3a5f' }, // Sky Blue
    { bg: '#fca5a5', text: '#7f1d1d' }, // Rose
    { bg: '#6ee7b7', text: '#064e3b' }, // Teal
    { bg: '#fdba74', text: '#7c2d12' }, // Peach
  ];
  let hash = 0;
  const str = String(id || '');
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function buildAchievementPageCard(a) {
  const card = document.createElement('div');
  card.className = 'achievement-page-card';
  card.id = `ach-page-${a._id}`;

  // Apply clay color as CSS custom property (only visible in claymorphism theme)
  const clayColor = getClayAchColor(a._id);
  card.style.setProperty('--clay-card-bg', clayColor.bg);
  card.style.setProperty('--clay-card-text', clayColor.text);

  const linksHTML = buildLinksHTML(a.links || [], 'ach-page-link');

  const isGoalAch = a.title && a.title.startsWith('Goal Achieved:');
  const badgeHTML = isGoalAch
    ? `<span class="ach-badge ach-badge-goal"><i data-lucide="target" style="width:12px; height:12px;"></i> Goal Accomplished</span>`
    : `<span class="ach-badge ach-badge-daily"><i data-lucide="award" style="width:12px; height:12px;"></i> Achievement of the Day</span>`;

  let photosHTML = '';
  const hasPhotos = a.photos && a.photos.length > 0;
  const isGenericPhotoTitle = !a.title || /photo(\s*proof)?/i.test(a.title.trim());
  const showTitle = !hasPhotos || !isGenericPhotoTitle;

  if (hasPhotos) {
    photosHTML = `
      <div class="ach-page-photos-strip" style="display: flex; gap: 10px; margin: 8px 0 4px 0; flex-wrap: wrap;">
        ${a.photos.map(p => {
          const safeThumb = getSafeThumbUrl(p.thumbnailUrl, p.url);
          const cleanCaption = (p.caption && !/photo(\s*proof)?/i.test(p.caption.trim())) ? p.caption : '';
          const pTitle = (a.title && a.title !== 'Photos' && !/photo(\s*proof)?/i.test(a.title)) ? a.title : (cleanCaption || 'Photo');
          return `
          <div class="ach-card-photo-thumb" onclick="window.openPhotoLightbox('${escHtml(p.url)}', '${escHtml(safeThumb)}', '${escHtml(cleanCaption)}', '${escHtml(a.date)}', '${a._id}', '${p._id}', true, '${escHtml(pTitle)}')" title="Click to view full photo" style="position: relative; width: 116px; height: 72px; border-radius: 8px; border: 1.5px solid var(--black); overflow: hidden; cursor: pointer; background: #ffffff; box-shadow: 2px 2px 0 var(--black); flex-shrink: 0; transition: transform 0.15s ease;">
            <img src="${escHtml(safeThumb)}" alt="Photo" loading="lazy" decoding="async" style="width: 100%; height: 100%; object-fit: cover; background: #ffffff; display: block;" />
            <span style="position: absolute; bottom: 2px; right: 2px; background: rgba(0,0,0,0.65); color: #fff; font-size: 8px; font-weight: 900; padding: 1px 3px; border-radius: 3px; line-height: 1;">🔍</span>
          </div>
        `;}).join('')}
      </div>
    `;
  }

  const cleanDesc = (a.description && !/photo(\s*proof)?/i.test(a.description.trim())) ? a.description : '';
  const descHTML  = cleanDesc ? `<p class="ach-page-desc">${escHtml(cleanDesc)}</p>` : '';

  card.innerHTML = `
    <div class="ach-page-top">
      <div style="flex: 1; min-width: 0;">
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px; flex-wrap:wrap;">
          <span class="ach-date-badge">${formatDisplayDate(a.date)}</span>
          ${badgeHTML}
        </div>
        ${showTitle ? `<h3 class="ach-page-title"><i data-lucide="${isGoalAch ? 'target' : (a.type === 'photo' ? 'camera' : 'medal')}"></i> ${escHtml(a.title)}</h3>` : ''}
      </div>
      <div class="ach-page-actions">
        ${!hasPhotos ? `<button class="btn-edit-ach" onclick="openEditAchievementModal('${a._id}')" title="Edit"><i data-lucide="edit-3"></i></button>` : ''}
        <button class="btn-del-ach" onclick="deleteAchievement('${a._id}', null)" title="Delete"><i data-lucide="trash-2"></i></button>
      </div>
    </div>
    ${descHTML}
    ${photosHTML}
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

// ── Photo Proof & Tab State ────────────────────────────────
let currentAchModalTab = 'text';
let selectedAchPhotoFiles = []; // Array of { file: File, previewUrl: string, origSize: number, compSize: number }
let achPhotoQuota = { used: 0, limit: 3, remaining: 3 };
let activeLightboxData = null;

/**
 * Compresses an image file in-browser to guaranteed under 1MB using HTML5 Canvas.
 * Supports input files up to 10MB while maintaining crisp high resolution.
 */
async function compressImageFile(file, maxBytes = 1000000) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('Invalid image file'));
    }
    // If already under 700KB and JPEG/WebP, preserve as-is
    if (file.size <= 700000 && (file.type === 'image/jpeg' || file.type === 'image/webp')) {
      return resolve(file);
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const maxDimension = 1920; // Crisp full-HD boundary

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const tryQuality = (q) => {
          return new Promise((resBlob) => {
            canvas.toBlob((blob) => resBlob(blob), 'image/jpeg', q);
          });
        };

        (async () => {
          let quality = 0.84;
          let blob = await tryQuality(quality);

          if (blob && blob.size > maxBytes) {
            quality = 0.72;
            blob = await tryQuality(quality);
          }
          if (blob && blob.size > maxBytes) {
            // Downscale dimensions slightly to safely meet 1MB cap
            canvas.width = Math.round(width * 0.8);
            canvas.height = Math.round(height * 0.8);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            quality = 0.68;
            blob = await tryQuality(quality);
          }

          if (!blob) return reject(new Error('Image compression failed'));
          const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve(compressedFile);
        })().catch(reject);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

let _lastQuotaFetchTime = 0;
let _lastQuotaDayId = null;
const QUOTA_CACHE_TTL_MS = 60000; // 60s cache TTL to prevent redundant network requests on tab switch

function isCardWithinPhotoWindow(day) {
  if (!day) return true;
  const currentToday = window.todayStr ? window.todayStr() : new Date().toISOString().split('T')[0];
  const cardDateNormalized = (day.date || '').split('T')[0];
  if (!cardDateNormalized) return true;

  // Future cards are strictly not allowed for photo uploads
  if (cardDateNormalized > currentToday) return false;

  // Present day card is always allowed
  if (cardDateNormalized === currentToday) return true;

  // Cards with grace applied are allowed
  if (day.graceApplied) return true;

  // 36-hour window check: from 00:00:00 local time of the card date until 12:00 noon next day
  const [y, m, d] = cardDateNormalized.split('-').map(Number);
  const cardStartLocal = new Date(y, m - 1, d, 0, 0, 0, 0);
  const diffHours = (new Date() - cardStartLocal) / (1000 * 60 * 60);
  return diffHours <= 36;
}

async function fetchAchievementPhotoQuota(force = false) {
  if (!navigator.onLine) return;
  const dayId = window.activeDayIdForAchievement;
  // If we have cached quota for this active card and it was fetched within TTL and force is not true, reuse cache
  if (!force && _lastQuotaDayId === dayId && achPhotoQuota && (Date.now() - _lastQuotaFetchTime < QUOTA_CACHE_TTL_MS)) {
    updatePhotoQuotaUI();
    return;
  }

  try {
    const today = window.todayStr ? window.todayStr() : new Date().toISOString().split('T')[0];
    const day = (window.allDays || []).find(d => String(d._id) === String(dayId));
    const cardDate = day ? (day.date ? day.date.split('T')[0] : today) : today;
    const offset = new Date().getTimezoneOffset();
    const res = await apiFetch(`${window.API}/api/achievements/photo-quota?cardDate=${encodeURIComponent(cardDate)}&dayId=${encodeURIComponent(dayId || '')}`, {
      headers: {
        'x-client-date': today,
        'x-card-date': cardDate,
        'x-day-id': dayId || '',
        'x-client-timezone-offset': String(offset)
      }
    });
    if (res && typeof res.remaining === 'number') {
      achPhotoQuota = res;
      _lastQuotaFetchTime = Date.now();
      _lastQuotaDayId = dayId;
      updatePhotoQuotaUI();
    }
  } catch (err) {
    console.warn('Failed to fetch achievement photo quota:', err);
  }
}

function updatePhotoQuotaUI() {
  const pillEl = document.getElementById('ach-tab-quota-pill');
  const textEl = document.getElementById('ach-photo-quota-text');
  const submitBtn = document.getElementById('submit-ach-btn');

  const currentLimit = achPhotoQuota.limit || 3;
  const uploadedPhotos = getTodayUploadedPhotosForActiveCard();
  const used = uploadedPhotos.length;
  const remaining = Math.max(0, currentLimit - used);

  if (pillEl) {
    pillEl.textContent = `${remaining} left`;
    pillEl.style.background = remaining > 0 ? '#16a34a' : '#ef4444';
  }
  if (textEl) {
    textEl.textContent = `${used}/${currentLimit} used (${remaining} remaining for this card)`;
    textEl.style.background = remaining > 0 ? '#16a34a' : '#dc2626';
  }
  if (submitBtn && currentAchModalTab === 'photo') {
    submitBtn.disabled = remaining <= 0;
  }
  renderAchSelectedPhotosPreview();
}

function getTodayUploadedPhotosForActiveCard() {
  const currentToday = window.todayStr ? window.todayStr() : new Date().toISOString().split('T')[0];
  const dayId = window.activeDayIdForAchievement;
  const day = (window.allDays || []).find(d => String(d._id) === String(dayId));
  const cardDate = day ? (day.date ? day.date.split('T')[0] : currentToday) : currentToday;

  const photoAchs = (window.allAchievements || []).filter(a => {
    const aDateStr = (a.date || '').split('T')[0];
    if (dayId && a.dayId) {
      return String(a.dayId) === String(dayId) && (a.type === 'photo' || (a.photos && a.photos.length > 0));
    }
    return aDateStr === cardDate && (a.type === 'photo' || (a.photos && a.photos.length > 0));
  });

  const photos = [];
  photoAchs.forEach(a => {
    (a.photos || []).forEach(p => photos.push({ ...p, achId: a._id, dayId: a.dayId, date: a.date }));
  });
  // Sort chronologically so slot 0 is Photo 1, slot 1 is Photo 2!
  photos.sort((a, b) => new Date(a.uploadedAt || 0) - new Date(b.uploadedAt || 0));
  return photos;
}

function switchAchTab(tab) {
  currentAchModalTab = tab;
  const btnText = document.getElementById('ach-tab-btn-text');
  const btnPhoto = document.getElementById('ach-tab-btn-photo');
  const paneText = document.getElementById('ach-pane-text');
  const panePhoto = document.getElementById('ach-pane-photo');
  const submitBtn = document.getElementById('submit-ach-btn');

  if (tab === 'text') {
    if (btnText) {
      btnText.style.background = 'var(--yellow)';
      btnText.style.color = 'var(--black)';
      btnText.style.border = '2px solid var(--black)';
      btnText.style.boxShadow = '2px 2px 0 var(--black)';
      btnText.style.fontWeight = '900';
      btnText.classList.add('active');
    }
    if (btnPhoto) {
      btnPhoto.style.background = '#ffffff';
      btnPhoto.style.color = 'var(--black)';
      btnPhoto.style.border = '2px solid var(--black)';
      btnPhoto.style.boxShadow = '2px 2px 0 var(--black)';
      btnPhoto.style.fontWeight = '800';
      btnPhoto.classList.remove('active');
    }
    if (paneText) paneText.style.display = 'block';
    if (panePhoto) panePhoto.style.display = 'none';
    if (submitBtn) {
      submitBtn.textContent = 'Save Achievement';
      submitBtn.disabled = false;
    }
  } else {
    if (btnText) {
      btnText.style.background = '#ffffff';
      btnText.style.color = 'var(--black)';
      btnText.style.border = '2px solid var(--black)';
      btnText.style.boxShadow = '2px 2px 0 var(--black)';
      btnText.style.fontWeight = '800';
      btnText.classList.remove('active');
    }
    if (btnPhoto) {
      btnPhoto.style.background = 'var(--yellow)';
      btnPhoto.style.color = 'var(--black)';
      btnPhoto.style.border = '2px solid var(--black)';
      btnPhoto.style.boxShadow = '2px 2px 0 var(--black)';
      btnPhoto.style.fontWeight = '900';
      btnPhoto.classList.add('active');
    }
    if (paneText) paneText.style.display = 'none';
    if (panePhoto) panePhoto.style.display = 'block';
    if (submitBtn) {
      submitBtn.textContent = 'Upload Photos';
      submitBtn.disabled = achPhotoQuota.remaining <= 0;
    }
    fetchAchievementPhotoQuota(false);
    renderAchSelectedPhotosPreview();
  }
  if (window.lucide) lucide.createIcons({ root: document.getElementById('modal-add-achievement') });
}

async function handleAchPhotoSelection(event) {
  const input = event.target;
  const files = Array.from(input.files || []);
  if (!files.length) return;

  const currentLimit = achPhotoQuota.limit || 3;
  const todayUploaded = getTodayUploadedPhotosForActiveCard();
  const usedCount = todayUploaded.length;
  const remainingQuota = Math.max(0, currentLimit - usedCount);
  const maxAllowed = Math.max(0, remainingQuota - selectedAchPhotoFiles.length);

  if (maxAllowed <= 0) {
    showToast(`You have reached today's photo limit (${currentLimit} photos).`, 'warn');
    input.value = '';
    return;
  }

  if (files.length > maxAllowed) {
    showToast(`Only ${maxAllowed} more photo(s) can be added within today's quota.`, 'info');
  }

  const toProcess = files.slice(0, maxAllowed);
  const statusEl = document.getElementById('ach-photo-compression-status');
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.textContent = '⚡ Compressing photo(s)...';
  }

  for (const f of toProcess) {
    if (f.size > 10 * 1024 * 1024) {
      showToast(`"${f.name}" exceeds 10MB limit. Skipping.`, 'error');
      continue;
    }
    try {
      const compressed = await compressImageFile(f, 1000000);
      const previewUrl = URL.createObjectURL(compressed);
      selectedAchPhotoFiles.push({
        file: compressed,
        previewUrl,
        origSize: f.size,
        compSize: compressed.size
      });
    } catch (err) {
      console.error('Compression error:', err);
      showToast(`Failed to compress ${f.name}.`, 'error');
    }
  }

  input.value = '';
  if (statusEl) statusEl.style.display = 'none';
  renderAchSelectedPhotosPreview();
}

function triggerPhotoSlotClick(slotIdx) {
  const currentLimit = achPhotoQuota.limit || 3;
  const todayUploaded = getTodayUploadedPhotosForActiveCard();
  const usedCount = todayUploaded.length;

  if (slotIdx < usedCount) {
    const up = todayUploaded[slotIdx];
    if (up && (up.thumbnailUrl || up.url)) {
      window.openPhotoLightbox(up.url, up.thumbnailUrl || up.url, up.caption || '', up.date, up.achId, up._id);
    } else {
      showToast(`Photo ${slotIdx + 1} was already uploaded for today.`, 'info');
    }
    return;
  }

  const pendingIndex = slotIdx - usedCount;
  if (selectedAchPhotoFiles[pendingIndex]) {
    const p = selectedAchPhotoFiles[pendingIndex];
    window.openPhotoLightbox(p.previewUrl, p.previewUrl, `Photo ${slotIdx + 1} Preview (${Math.round(p.compSize / 1024)}KB compressed)`, window.todayStr ? window.todayStr() : 'Today');
    return;
  }

  const remainingQuota = Math.max(0, currentLimit - usedCount);
  const maxAllowed = Math.max(0, remainingQuota - selectedAchPhotoFiles.length);
  if (maxAllowed <= 0) {
    showToast(`You have reached today's photo limit (${currentLimit} photos).`, 'warn');
    return;
  }

  const fileInput = document.getElementById('ach-photo-file-input');
  if (fileInput) fileInput.click();
}

function renderAchSelectedPhotosPreview() {
  const currentLimit = achPhotoQuota.limit || 3;
  const todayUploaded = getTodayUploadedPhotosForActiveCard();
  const usedCount = todayUploaded.length;

  // The number of boxes displayed is equivalent to the env limit,
  // but if the user has uploaded more than the limit (e.g. limit was 6 and now reduced to 3),
  // it shows all uploaded photos, coming down as photos are deleted until reaching the limit.
  const totalBoxes = Math.max(currentLimit, usedCount + selectedAchPhotoFiles.length);

  const gridEl = document.getElementById('ach-photo-slots-grid');
  if (!gridEl) return;

  const labelEl = document.getElementById('ach-select-photos-label');
  if (labelEl) {
    labelEl.textContent = `Select Photos (Up to ${currentLimit}):`;
  }

  // Use 3 columns for balanced rows on both desktop and mobile
  gridEl.style.display = 'grid';
  gridEl.style.gridTemplateColumns = totalBoxes <= 2 ? `repeat(${totalBoxes}, 1fr)` : 'repeat(3, 1fr)';
  gridEl.style.gap = '12px';
  gridEl.style.marginBottom = '16px';

  let html = '';

  for (let i = 0; i < totalBoxes; i++) {
    if (i < usedCount) {
      // 🔒 Slot is LOCKED because it was already uploaded earlier today!
      const up = todayUploaded[i];
      const safeThumb = (up && (up.thumbnailUrl || up.url)) ? getSafeThumbUrl(up.thumbnailUrl, up.url) : null;
      if (safeThumb) {
        html += `
          <div id="ach-photo-slot-${i}" class="ach-photo-slot locked" onclick="window.triggerPhotoSlotClick(${i})" title="Photo already uploaded for today (click to review or delete)" style="border: 2.5px solid var(--black); box-shadow: 2px 2px 0 var(--black); cursor: pointer;">
            <img src="${escHtml(safeThumb)}" alt="Uploaded Photo" style="width: 100%; height: 100%; object-fit: cover; background: #ffffff; opacity: 0.65; display: block;" />
            <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.38); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 4px;">
              <div style="width: 28px; height: 28px; border-radius: 50%; background: #fef3c7; border: 1.5px solid var(--black); display: flex; align-items: center; justify-content: center; box-shadow: 1px 1px 0 var(--black);">
                <i data-lucide="lock" style="width: 14px; height: 14px; color: #b45309;"></i>
              </div>
              <span style="font-size: 9.5px; font-weight: 900; color: #ffffff; text-shadow: 0 1px 3px rgba(0,0,0,0.9); text-transform: uppercase; letter-spacing: 0.3px;">Photo ${i + 1} · Locked</span>
            </div>
          </div>
        `;
      } else {
        html += `
          <div id="ach-photo-slot-${i}" class="ach-photo-slot locked" onclick="window.triggerPhotoSlotClick(${i})" title="Photo already uploaded for today" style="border: 2.5px solid var(--black); box-shadow: 2px 2px 0 var(--black); cursor: pointer;">
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 8px; text-align: center; width: 100%; height: 100%; background: var(--bg-body);">
              <div style="width: 30px; height: 30px; border-radius: 50%; background: #fef3c7; border: 1.5px solid var(--black); display: flex; align-items: center; justify-content: center; box-shadow: 1.5px 1.5px 0 var(--black);">
                <i data-lucide="lock" style="width: 15px; height: 15px; color: #b45309;"></i>
              </div>
              <span style="font-size: 10.5px; font-weight: 900; color: var(--text);">Photo ${i + 1} · Locked</span>
            </div>
          </div>
        `;
      }
    } else {
      // Slot is beyond uploaded photos: could be pending file or empty slot
      const pendingIndex = i - usedCount;
      const pendingItem = selectedAchPhotoFiles[pendingIndex];

      if (pendingItem) {
        const compKB = Math.round(pendingItem.compSize / 1024);
        html += `
          <div id="ach-photo-slot-${i}" class="ach-photo-slot filled" onclick="window.triggerPhotoSlotClick(${i})" title="Click to review compressed photo preview" style="border: 2.5px solid var(--black); box-shadow: 2px 2px 0 var(--black); cursor: pointer;">
            <img src="${pendingItem.previewUrl}" alt="Compressed Preview" style="width: 100%; height: 100%; object-fit: cover; background: #ffffff; display: block;" />
            <span style="position: absolute; bottom: 4px; left: 4px; background: rgba(0,0,0,0.85); color: #4ade80; font-size: 9.5px; font-weight: 900; padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2);">${compKB}KB</span>
            <button type="button" onclick="event.stopPropagation(); window.removeSelectedAchPhoto(${pendingIndex})" title="Remove photo" style="position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; border-radius: 50%; background: #ef4444; color: #fff; border: 1.5px solid var(--black); font-size: 13px; font-weight: 900; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; box-shadow: 1px 1px 0 var(--black); z-index: 2;">&times;</button>
          </div>
        `;
      } else {
        // Empty available slot
        html += `
          <div id="ach-photo-slot-${i}" class="ach-photo-slot empty" onclick="window.triggerPhotoSlotClick(${i})" title="Click to choose Photo ${i + 1}" style="border: 2.5px dashed var(--black); box-shadow: 2px 2px 0 var(--black); cursor: pointer;">
            <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--bg-body); border: 1.5px dashed var(--black); display: flex; align-items: center; justify-content: center; margin-bottom: 4px;">
              <i data-lucide="${pendingIndex === 0 ? 'camera' : 'plus'}" style="width: 16px; height: 16px; color: var(--text-muted);"></i>
            </div>
            <span style="font-size: 11px; font-weight: 800; color: var(--text-muted);">+ Photo ${i + 1}</span>
          </div>
        `;
      }
    }
  }

  gridEl.innerHTML = html;

  const statusEl = document.getElementById('ach-photo-compression-status');
  if (statusEl) {
    if (selectedAchPhotoFiles.length > 0) {
      statusEl.style.display = 'block';
      const count = selectedAchPhotoFiles.length;
      statusEl.textContent = `✓ ${count} photo${count > 1 ? 's' : ''} selected`;
    } else {
      statusEl.style.display = 'none';
    }
  }

  const modalEl = document.getElementById('modal-add-achievement');
  if (modalEl && window.lucide) lucide.createIcons({ root: modalEl });
}

function removeSelectedAchPhoto(index) {
  if (selectedAchPhotoFiles[index]) {
    URL.revokeObjectURL(selectedAchPhotoFiles[index].previewUrl);
    selectedAchPhotoFiles.splice(index, 1);
  }
  renderAchSelectedPhotosPreview();
}

function submitActiveAchievement() {
  if (currentAchModalTab === 'photo') {
    submitPhotoAchievement();
  } else {
    submitAddAchievement();
  }
}

// ── Add Achievement ────────────────────────────────────────
let _achAddLinkPending = false;

function openAddAchievementModal(dayId) {
  window.activeDayIdForAchievement = dayId;
  _achAddLinkPending = false;
  selectedAchPhotoFiles = [];
  renderAchSelectedPhotosPreview();

  // Sync day achievements into memory so photo slots have exact uploaded photos
  if (dayId && navigator.onLine) {
    apiFetch(`${window.API}/api/achievements/day/${dayId}?own=1`).then(dayAchs => {
      if (Array.isArray(dayAchs)) {
        const dayObj = (window.allDays || []).find(d => String(d._id) === String(dayId));
        const dayDateStr = dayObj ? (dayObj.date || '').split('T')[0] : '';
        const isTarget = a => String(a.dayId) === String(dayId) || (dayDateStr && (a.date || '').split('T')[0] === dayDateStr);

        window.allAchievements = (window.allAchievements || []).filter(a => !isTarget(a));
        window.allAchievements.unshift(...dayAchs);
        if (window.localDb) {
          for (const a of dayAchs) window.localDb.achievements.put(a);
        }
        renderAchSelectedPhotosPreview();

        // Also update the day card on the page immediately!
        const cardEl = document.getElementById(`day-card-${dayId}`);
        if (cardEl) {
          renderDayAchievements(dayId, dayAchs, cardEl);
        }
      }
    }).catch(() => {});
  }

  const day = (window.allDays || []).find(d => String(d._id) === String(dayId));
  const currentToday = window.todayStr ? window.todayStr() : new Date().toISOString().split('T')[0];
  const cardDateNormalized = day ? (day.date ? day.date.split('T')[0] : currentToday) : currentToday;
  const isPhotoAllowed = isCardWithinPhotoWindow(day);

  // Clear text inputs
  const titleInput = document.getElementById('ach-title-input');
  const descInput = document.getElementById('ach-desc-input');
  const photoTitleInput = document.getElementById('ach-photo-title-input');
  const photoDescInput = document.getElementById('ach-photo-desc-input');
  if (titleInput) titleInput.value = '';
  if (descInput) descInput.value = '';
  if (photoTitleInput) photoTitleInput.value = '';
  if (photoDescInput) photoDescInput.value = '';

  const linksBuilder = document.getElementById('ach-links-builder');
  if (linksBuilder) {
    linksBuilder.innerHTML = '';
    addAchLinkField('ach-links-builder');
  }
  const warnEl = document.getElementById('ach-link-warning');
  if (warnEl) warnEl.style.display = 'none';

  const pastNotice = document.getElementById('ach-photo-past-notice');
  const offlineNotice = document.getElementById('ach-photo-offline-notice');
  const activeUI = document.getElementById('ach-photo-active-ui');
  const photoTabBtn = document.getElementById('ach-tab-btn-photo');

  if (!isPhotoAllowed) {
    if (pastNotice) {
      pastNotice.style.display = 'block';
      const isFuture = cardDateNormalized > currentToday;
      pastNotice.innerHTML = isFuture
        ? '<p style="margin: 0; font-size: 13px; font-weight: 800; color: #dc2626;">🔒 Photo proof is unavailable for future cards</p><p style="margin: 4px 0 0; font-size: 11.5px; color: var(--text-muted);">Photos can only be logged for today\'s card or active past cards within the 36-hour window.</p>'
        : '<p style="margin: 0; font-size: 13px; font-weight: 800; color: #dc2626;">🔒 Photo proof is locked for this card</p><p style="margin: 4px 0 0; font-size: 11.5px; color: var(--text-muted);">The 36-hour editable window (until 12:00 noon the next day) has ended. You can still log text and link proof in the "Links & Text" tab.</p>';
    }
    if (offlineNotice) offlineNotice.style.display = 'none';
    if (activeUI) activeUI.style.display = 'none';
    if (photoTabBtn) photoTabBtn.title = 'Photo proof is locked for this card';
    switchAchTab('text');
  } else if (!navigator.onLine) {
    if (pastNotice) pastNotice.style.display = 'none';
    if (offlineNotice) offlineNotice.style.display = 'block';
    if (activeUI) activeUI.style.display = 'none';
    if (photoTabBtn) photoTabBtn.title = '';
    switchAchTab('text');
  } else {
    if (pastNotice) pastNotice.style.display = 'none';
    if (offlineNotice) offlineNotice.style.display = 'none';
    if (activeUI) activeUI.style.display = 'block';
    if (photoTabBtn) photoTabBtn.title = '';
    fetchAchievementPhotoQuota(true);
    switchAchTab('text');
  }

  const btn = document.getElementById('submit-ach-btn');
  if (btn) btn.textContent = currentAchModalTab === 'photo' ? 'Upload Photos' : 'Save Achievement';
  openModal('modal-add-achievement');
  if (window.lucide) lucide.createIcons({ root: document.getElementById('modal-add-achievement') });
}

async function submitAddAchievement() {
  if (window.checkEmailVerificationBlocked && window.checkEmailVerificationBlocked()) {
    return;
  }
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
  const day   = (window.allDays || []).find(d => d._id === dayId);
  const date  = day ? day.date : todayStr();

  const tempId = `temp_${Date.now()}`;
  const localAch = { _id: tempId, userId: window.userId, dayId, date, title, description: desc, links, type: 'text', photos: [] };

  try {
    window.allAchievements.unshift(localAch);
    if (window.localDb) await window.localDb.achievements.add(localAch);
    closeModal('modal-add-achievement');

    const cardEl = document.getElementById(`day-card-${dayId}`);
    if (cardEl) {
      const dayAchs = window.allAchievements.filter(a => a.dayId === dayId);
      renderDayAchievements(dayId, dayAchs, cardEl);
    }
    showToast(`Achievement logged locally! <i data-lucide="party-popper"></i>`, 'success');

    window.syncManager.addToQueue('POST', 'achievements', null, { userId: window.userId, dayId, date, title, description: desc, links, type: 'text' }, tempId);
  } catch (err) {
    console.error('Offline achievement write error:', err);
  } finally {
    btn.disabled = false; btn.textContent = 'Save Achievement';
  }
}

async function submitPhotoAchievement() {
  if (window.checkEmailVerificationBlocked && window.checkEmailVerificationBlocked()) return;

  if (!navigator.onLine) {
    showToast('Photo proof uploads require an active internet connection.', 'warn');
    return;
  }

  const dayId = window.activeDayIdForAchievement;
  const day = (window.allDays || []).find(d => String(d._id) === String(dayId));
  const currentToday = window.todayStr ? window.todayStr() : new Date().toISOString().split('T')[0];
  const cardDate = day ? (day.date ? day.date.split('T')[0] : currentToday) : currentToday;

  if (!isCardWithinPhotoWindow(day)) {
    showToast('Photo proof can only be uploaded for active cards within the 36-hour window (until 12:00 noon the next day).', 'error');
    return;
  }

  if (selectedAchPhotoFiles.length === 0) {
    showToast('Please select at least 1 photo to upload.', 'warn');
    return;
  }

  const titleInput = document.getElementById('ach-photo-title-input');
  const descInput = document.getElementById('ach-photo-desc-input');
  const title = (titleInput?.value || '').trim() || 'Photos';
  const desc = (descInput?.value || '').trim();

  const submitBtn = document.getElementById('submit-ach-btn');
  const banner = document.getElementById('ach-upload-progress-banner');
  const statusText = document.getElementById('ach-upload-status-text');
  const subText = document.getElementById('ach-upload-sub-text');

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;display:inline-block;animation:spin 0.8s linear infinite;margin-right:6px;"></span> Uploading...';

  if (banner) banner.style.display = 'flex';
  const totalPhotos = selectedAchPhotoFiles.length;
  let lastAchievementData = null;

  try {
    for (let idx = 0; idx < totalPhotos; idx++) {
      const item = selectedAchPhotoFiles[idx];
      const photoNum = idx + 1;

      // Realtime progressive feedback for each photo
      if (totalPhotos > 1) {
        if (statusText) statusText.textContent = `Uploading photo ${photoNum} of ${totalPhotos}...`;
        if (subText) {
          subText.textContent = idx === 0
            ? `Transferring photo 1 of ${totalPhotos} to cloud`
            : `Photo ${idx} of ${totalPhotos} uploaded • Transferring photo ${photoNum} of ${totalPhotos}`;
        }
        if (submitBtn && submitBtn.disabled) {
          submitBtn.innerHTML = `<span class="spinner" style="width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;display:inline-block;animation:spin 0.8s linear infinite;margin-right:6px;"></span> ${photoNum} of ${totalPhotos}...`;
        }
      } else {
        if (statusText) statusText.textContent = 'Uploading photo...';
        if (subText) subText.textContent = 'Transferring photo proof to cloud';
        if (submitBtn && submitBtn.disabled) {
          submitBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;display:inline-block;animation:spin 0.8s linear infinite;margin-right:6px;"></span> Uploading...';
        }
      }

      const formData = new FormData();
      formData.append('dayId', dayId);
      formData.append('date', cardDate);
      formData.append('title', idx === 0 ? title : '');
      formData.append('description', idx === 0 ? desc : '');
      formData.append('photos', item.file);

      const token = localStorage.getItem('token');
      const offset = new Date().getTimezoneOffset();
      const res = await fetch(`${window.API}/api/achievements/photo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-client-date': currentToday,
          'x-card-date': cardDate,
          'x-day-id': dayId || '',
          'x-client-timezone-offset': String(offset)
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || `Failed to upload photo ${photoNum} of ${totalPhotos}`);
      }

      lastAchievementData = data;
    }

    // Finalizing state
    if (statusText) statusText.textContent = 'Almost done...';
    if (subText) subText.textContent = 'Saving achievement';
    if (submitBtn) {
      submitBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;display:inline-block;animation:spin 0.8s linear infinite;margin-right:6px;"></span> Saving...';
    }

    // Success! Update local state
    if (lastAchievementData) {
      const existingIdx = (window.allAchievements || []).findIndex(a => String(a._id) === String(lastAchievementData._id));
      if (existingIdx >= 0) {
        window.allAchievements[existingIdx] = lastAchievementData;
      } else {
        window.allAchievements.unshift(lastAchievementData);
      }
      if (window.localDb) {
        await window.localDb.achievements.put(lastAchievementData);
      }
    }

    selectedAchPhotoFiles.forEach(i => URL.revokeObjectURL(i.previewUrl));
    selectedAchPhotoFiles = [];
    if (titleInput) titleInput.value = '';
    if (descInput) descInput.value = '';

    closeModal('modal-add-achievement');

    // Fetch the fresh achievements for this day to guarantee card and state are 100% complete
    let dayAchs = [];
    try {
      dayAchs = await apiFetch(`${window.API}/api/achievements/day/${dayId}?own=1`);
      if (Array.isArray(dayAchs)) {
        window.allAchievements = (window.allAchievements || []).filter(a => String(a.dayId) !== String(dayId));
        window.allAchievements.unshift(...dayAchs);
        if (window.localDb) {
          for (const a of dayAchs) await window.localDb.achievements.put(a);
        }
      }
    } catch (_) {
      dayAchs = (window.allAchievements || []).filter(a => String(a.dayId) === String(dayId));
    }

    const cardEl = document.getElementById(`day-card-${dayId}`);
    if (cardEl) {
      renderDayAchievements(dayId, dayAchs, cardEl);
    }

    if (document.getElementById('page-achievements')?.classList.contains('active')) {
      renderAchievements();
    }

    showToast(totalPhotos > 1 ? `${totalPhotos} photos uploaded successfully! 📸` : 'Photo uploaded successfully! 📸', 'success');
    await fetchAchievementPhotoQuota(true);
  } catch (err) {
    console.error('Photo upload error:', err);
    showToast(err.message || 'Failed to upload photo achievement', 'error');
    if (lastAchievementData) {
      const cardEl = document.getElementById(`day-card-${dayId}`);
      if (cardEl) {
        const dayAchs = (window.allAchievements || []).filter(a => String(a.dayId) === String(dayId));
        renderDayAchievements(dayId, dayAchs, cardEl);
      }
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Upload Photos';
    if (banner) banner.style.display = 'none';
  }
}

// ── Persistent Media Cache Helpers (IndexedDB localDb.mediaCache) ──
let currentLightboxBlobUrl = null;

function revokeLightboxBlobUrl() {
  if (currentLightboxBlobUrl) {
    try { URL.revokeObjectURL(currentLightboxBlobUrl); } catch (_) {}
    currentLightboxBlobUrl = null;
  }
}

async function getPersistentMediaBlob(url) {
  if (!url || !window.localDb || !window.localDb.mediaCache) return null;
  try {
    const record = await window.localDb.mediaCache.get(url);
    if (record && record.blob) return record.blob;
  } catch (err) {
    console.warn('[MediaCache] Read error:', err);
  }
  return null;
}

async function savePersistentMediaBlob(url, blob) {
  if (!url || !blob || !window.localDb || !window.localDb.mediaCache) return;
  try {
    await window.localDb.mediaCache.put({ url, blob });
  } catch (err) {
    console.warn('[MediaCache] Store error:', err);
  }
}

// ── Photo Lightbox Modal Handler ───────────────────────────
function openPhotoLightbox(photoUrl, thumbUrl, caption, dateStr, achId, photoId, isOwner = true) {
  activeLightboxData = { photoUrl, thumbUrl, dateStr, achId, photoId, isOwner };

  const imgEl = document.getElementById('ach-lightbox-img');
  const titleTextEl = document.getElementById('lightbox-title-text');
  const captionEl = document.getElementById('lightbox-caption');
  const dateEl = document.getElementById('lightbox-date');
  const offlineBanner = document.getElementById('lightbox-offline-banner');
  const delBtn = document.getElementById('lightbox-delete-btn');
  const editBtn = document.getElementById('lightbox-edit-btn');
  const editPanel = document.getElementById('lightbox-edit-panel');

  if (editPanel) editPanel.style.display = 'none';
  if (editBtn) editBtn.style.display = 'none';

  if (titleTextEl) {
    titleTextEl.textContent = 'Photo';
  }
  if (captionEl) {
    captionEl.style.display = 'none';
  }
  if (dateEl) {
    const formatted = dateStr ? (window.formatDisplayDate ? window.formatDisplayDate(dateStr) : (typeof formatDisplayDate === 'function' ? formatDisplayDate(dateStr) : dateStr)) : '';
    dateEl.innerHTML = formatted ? `<i data-lucide="calendar" style="width: 13px; height: 13px; display: inline-block; vertical-align: -1px; margin-right: 4px;"></i> Logged on ${escHtml(formatted)}` : '';
    if (window.lucide) lucide.createIcons({ root: dateEl });
  }

  if (delBtn) {
    delBtn.style.display = (achId && photoId && isOwner !== false) ? 'inline-flex' : 'none';
  }

  const safeThumb = getSafeThumbUrl(thumbUrl, photoUrl);
  if (offlineBanner) offlineBanner.style.display = 'none';

  revokeLightboxBlobUrl();

  if (imgEl) {
    imgEl.decoding = 'async';
    imgEl.crossOrigin = 'anonymous';

    imgEl.onerror = () => {
      if (safeThumb && imgEl.src !== safeThumb) {
        imgEl.src = safeThumb;
      }
    };

    // 1. Instantly display safeThumb (already in memory/disk cache from day card) so UI is snappy
    imgEl.src = safeThumb || photoUrl;

    if (photoUrl && photoUrl !== safeThumb) {
      // 2. Check persistent IndexedDB media cache first (fast, works offline across app restarts)
      getPersistentMediaBlob(photoUrl).then((cachedBlob) => {
        if (cachedBlob && activeLightboxData && activeLightboxData.photoUrl === photoUrl) {
          const blobUrl = URL.createObjectURL(cachedBlob);
          currentLightboxBlobUrl = blobUrl;
          imgEl.src = blobUrl;
          if (offlineBanner) offlineBanner.style.display = 'none';
          return;
        }

        // 3. Not in persistent cache yet: if online, fetch as Blob and save into IndexedDB mediaCache
        if (navigator.onLine) {
          fetch(photoUrl, { mode: 'cors' })
            .then(async (res) => {
              if (!res.ok) throw new Error('Fetch failed: ' + res.status);
              const blob = await res.blob();
              await savePersistentMediaBlob(photoUrl, blob);
              if (activeLightboxData && activeLightboxData.photoUrl === photoUrl) {
                const blobUrl = URL.createObjectURL(blob);
                currentLightboxBlobUrl = blobUrl;
                imgEl.src = blobUrl;
                if (offlineBanner) offlineBanner.style.display = 'none';
              }
            })
            .catch(() => {
              // Fallback to standard Image loading if fetch mode cors encounters any issues
              const fullImg = new Image();
              fullImg.crossOrigin = 'anonymous';
              fullImg.src = photoUrl;
              fullImg.onload = () => {
                if (activeLightboxData && activeLightboxData.photoUrl === photoUrl && fullImg.naturalWidth > 0) {
                  imgEl.src = photoUrl;
                  if (offlineBanner) offlineBanner.style.display = 'none';
                }
              };
              fullImg.onerror = () => {
                if (activeLightboxData && activeLightboxData.photoUrl === photoUrl) {
                  if (!navigator.onLine && offlineBanner) {
                    offlineBanner.style.display = 'flex';
                  }
                }
              };
            });
        } else {
          // Device is offline and photo was not cached in full resolution yet
          if (offlineBanner) {
            offlineBanner.style.display = 'flex';
          }
        }
      });
    }
  }

  openModal('modal-photo-lightbox');
}

// ── Fullscreen Photo Pinch-to-Zoom & Pan Engine ──
const fullscreenZoomState = {
  scale: 1,
  translateX: 0,
  translateY: 0,
  isDragging: false,
  isPinching: false,
  startX: 0,
  startY: 0,
  initialPinchDistance: 0,
  initialScale: 1,
  lastTapTime: 0
};

let hasFullscreenZoomInited = false;

function applyFullscreenTransform(disableTransition = false) {
  const imgEl = document.getElementById('photo-fullscreen-img');
  if (!imgEl) return;
  if (disableTransition) {
    imgEl.style.transition = 'none';
  } else {
    imgEl.style.transition = 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)';
  }
  if (fullscreenZoomState.scale <= 1) {
    imgEl.style.transform = 'none';
    imgEl.style.cursor = 'default';
  } else {
    imgEl.style.transform = `translate3d(${fullscreenZoomState.translateX}px, ${fullscreenZoomState.translateY}px, 0px) scale(${fullscreenZoomState.scale})`;
    imgEl.style.cursor = fullscreenZoomState.isDragging ? 'grabbing' : 'grab';
  }
}

function resetFullscreenPhotoZoom() {
  fullscreenZoomState.scale = 1;
  fullscreenZoomState.translateX = 0;
  fullscreenZoomState.translateY = 0;
  fullscreenZoomState.isDragging = false;
  fullscreenZoomState.isPinching = false;
  fullscreenZoomState.initialPinchDistance = 0;
  fullscreenZoomState.initialScale = 1;
  applyFullscreenTransform(true);
}

function initFullscreenPhotoZoom() {
  if (hasFullscreenZoomInited) return;
  const overlay = document.getElementById('photo-fullscreen-overlay');
  const imgEl = document.getElementById('photo-fullscreen-img');
  if (!overlay || !imgEl) return;

  hasFullscreenZoomInited = true;

  // Prevent browser native image dragging
  imgEl.addEventListener('dragstart', (e) => e.preventDefault());

  const getTouchDist = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  // Touch start: handle 2-finger pinch and 1-finger pan / double-tap
  overlay.addEventListener('touchstart', (e) => {
    if (e.target.closest('#photo-fullscreen-back-btn, #photo-fullscreen-download-btn')) {
      return;
    }

    if (e.touches.length === 2) {
      fullscreenZoomState.isPinching = true;
      fullscreenZoomState.isDragging = false;
      fullscreenZoomState.initialPinchDistance = getTouchDist(e.touches);
      fullscreenZoomState.initialScale = fullscreenZoomState.scale;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - fullscreenZoomState.lastTapTime < 320) {
        // Double-tap detected: toggle between 1x and 2.5x
        fullscreenZoomState.lastTapTime = 0;
        if (fullscreenZoomState.scale > 1.15) {
          resetFullscreenPhotoZoom();
        } else {
          fullscreenZoomState.scale = 2.5;
          fullscreenZoomState.translateX = 0;
          fullscreenZoomState.translateY = 0;
          applyFullscreenTransform(false);
        }
        return;
      }
      fullscreenZoomState.lastTapTime = now;

      // If already zoomed in, single touch begins panning
      if (fullscreenZoomState.scale > 1) {
        fullscreenZoomState.isDragging = true;
        fullscreenZoomState.startX = e.touches[0].clientX - fullscreenZoomState.translateX;
        fullscreenZoomState.startY = e.touches[0].clientY - fullscreenZoomState.translateY;
      }
    }
  }, { passive: true });

  // Touch move: handle pinch scaling or panning
  overlay.addEventListener('touchmove', (e) => {
    if (e.target.closest('#photo-fullscreen-back-btn, #photo-fullscreen-download-btn')) {
      return;
    }

    if (fullscreenZoomState.isPinching && e.touches.length === 2) {
      if (e.cancelable) e.preventDefault();
      const currentDist = getTouchDist(e.touches);
      if (fullscreenZoomState.initialPinchDistance > 0) {
        const ratio = currentDist / fullscreenZoomState.initialPinchDistance;
        let newScale = fullscreenZoomState.initialScale * ratio;
        newScale = Math.min(5, Math.max(0.85, newScale));
        fullscreenZoomState.scale = newScale;

        if (newScale <= 1) {
          fullscreenZoomState.translateX = 0;
          fullscreenZoomState.translateY = 0;
        } else {
          const maxMoveX = Math.max(0, (imgEl.offsetWidth * newScale - imgEl.offsetWidth) / 2);
          const maxMoveY = Math.max(0, (imgEl.offsetHeight * newScale - imgEl.offsetHeight) / 2);
          fullscreenZoomState.translateX = Math.min(maxMoveX, Math.max(-maxMoveX, fullscreenZoomState.translateX));
          fullscreenZoomState.translateY = Math.min(maxMoveY, Math.max(-maxMoveY, fullscreenZoomState.translateY));
        }
        applyFullscreenTransform(true);
      }
    } else if (fullscreenZoomState.isDragging && e.touches.length === 1 && fullscreenZoomState.scale > 1) {
      if (e.cancelable) e.preventDefault();
      const maxMoveX = Math.max(0, (imgEl.offsetWidth * fullscreenZoomState.scale - imgEl.offsetWidth) / 2);
      const maxMoveY = Math.max(0, (imgEl.offsetHeight * fullscreenZoomState.scale - imgEl.offsetHeight) / 2);
      const newX = e.touches[0].clientX - fullscreenZoomState.startX;
      const newY = e.touches[0].clientY - fullscreenZoomState.startY;

      fullscreenZoomState.translateX = Math.min(maxMoveX, Math.max(-maxMoveX, newX));
      fullscreenZoomState.translateY = Math.min(maxMoveY, Math.max(-maxMoveY, newY));
      applyFullscreenTransform(true);
    }
  }, { passive: false });

  // Touch end: finalize gestures and snap back if needed
  overlay.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      fullscreenZoomState.isPinching = false;
    }
    if (e.touches.length === 0) {
      fullscreenZoomState.isDragging = false;
      if (fullscreenZoomState.scale < 1.05) {
        resetFullscreenPhotoZoom();
      } else {
        applyFullscreenTransform(false);
      }
    } else if (e.touches.length === 1 && fullscreenZoomState.scale > 1) {
      fullscreenZoomState.isDragging = true;
      fullscreenZoomState.startX = e.touches[0].clientX - fullscreenZoomState.translateX;
      fullscreenZoomState.startY = e.touches[0].clientY - fullscreenZoomState.translateY;
    }
  });

  overlay.addEventListener('touchcancel', () => {
    fullscreenZoomState.isPinching = false;
    fullscreenZoomState.isDragging = false;
  });

  // Desktop Mouse Drag / Panning
  imgEl.addEventListener('mousedown', (e) => {
    if (fullscreenZoomState.scale <= 1) return;
    fullscreenZoomState.isDragging = true;
    fullscreenZoomState.startX = e.clientX - fullscreenZoomState.translateX;
    fullscreenZoomState.startY = e.clientY - fullscreenZoomState.translateY;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!fullscreenZoomState.isDragging || overlay.style.display === 'none') return;
    const maxMoveX = Math.max(0, (imgEl.offsetWidth * fullscreenZoomState.scale - imgEl.offsetWidth) / 2);
    const maxMoveY = Math.max(0, (imgEl.offsetHeight * fullscreenZoomState.scale - imgEl.offsetHeight) / 2);
    fullscreenZoomState.translateX = Math.min(maxMoveX, Math.max(-maxMoveX, e.clientX - fullscreenZoomState.startX));
    fullscreenZoomState.translateY = Math.min(maxMoveY, Math.max(-maxMoveY, e.clientY - fullscreenZoomState.startY));
    applyFullscreenTransform(true);
  });

  window.addEventListener('mouseup', () => {
    if (fullscreenZoomState.isDragging) {
      fullscreenZoomState.isDragging = false;
      applyFullscreenTransform(false);
    }
  });

  // Desktop trackpad / Ctrl+wheel zoom
  overlay.addEventListener('wheel', (e) => {
    if (overlay.style.display === 'none') return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = 0.08;
      const delta = -e.deltaY;
      let newScale = fullscreenZoomState.scale + (delta > 0 ? zoomFactor : -zoomFactor) * fullscreenZoomState.scale;
      newScale = Math.min(5, Math.max(1, newScale));
      fullscreenZoomState.scale = newScale;
      if (newScale === 1) {
        fullscreenZoomState.translateX = 0;
        fullscreenZoomState.translateY = 0;
      } else {
        const maxMoveX = Math.max(0, (imgEl.offsetWidth * newScale - imgEl.offsetWidth) / 2);
        const maxMoveY = Math.max(0, (imgEl.offsetHeight * newScale - imgEl.offsetHeight) / 2);
        fullscreenZoomState.translateX = Math.min(maxMoveX, Math.max(-maxMoveX, fullscreenZoomState.translateX));
        fullscreenZoomState.translateY = Math.min(maxMoveY, Math.max(-maxMoveY, fullscreenZoomState.translateY));
      }
      applyFullscreenTransform(false);
    }
  }, { passive: false });
}

// ── Fullscreen Photo Overlay Handlers (Long Screenshot Scroll & Pinch-Zoom) ──
function openPhotoFullscreen() {
  const lightboxImg = document.getElementById('ach-lightbox-img');
  const originalUrl = activeLightboxData?.photoUrl;
  const safeThumb = getSafeThumbUrl(activeLightboxData?.thumbUrl, originalUrl);

  // Reliable working preview source:
  // If lightboxImg has rendered dimensions, use its currentSrc/src; otherwise fall back to safe thumbnail
  const currentPreviewSrc = (lightboxImg && lightboxImg.naturalWidth > 0)
    ? (lightboxImg.currentSrc || lightboxImg.src)
    : (safeThumb || originalUrl);

  const overlay = document.getElementById('photo-fullscreen-overlay');
  const imgEl = document.getElementById('photo-fullscreen-img');
  if (!overlay || !imgEl) return;

  // Set consistent CORS policy
  imgEl.crossOrigin = 'anonymous';

  // Determine starting source:
  // Check if the original high-resolution image is already present in memory/disk cache
  let initialSrc = currentPreviewSrc;
  if (originalUrl && originalUrl !== currentPreviewSrc) {
    const testImg = new Image();
    testImg.crossOrigin = 'anonymous';
    testImg.src = originalUrl;
    if (testImg.complete && testImg.naturalWidth > 0) {
      initialSrc = originalUrl;
    }
  }

  // Fallback handler: if initialSrc fails (e.g. offline and uncached high-res),
  // immediately fall back to the preview image so it NEVER shows a blank screen
  imgEl.onerror = () => {
    console.warn('[Fullscreen Photo] Failed to load:', imgEl.src, 'falling back to preview.');
    imgEl.onerror = null; // Prevent recursion
    if (currentPreviewSrc && imgEl.src !== currentPreviewSrc) {
      imgEl.src = currentPreviewSrc;
    } else if (safeThumb && imgEl.src !== safeThumb) {
      imgEl.src = safeThumb;
    } else {
      // Last-resort fallback: directly copy pixels from rendered lightboxImg
      try {
        if (lightboxImg && lightboxImg.naturalWidth > 0) {
          const c = document.createElement('canvas');
          c.width = lightboxImg.naturalWidth;
          c.height = lightboxImg.naturalHeight;
          const ctx = c.getContext('2d');
          ctx.drawImage(lightboxImg, 0, 0);
          imgEl.src = c.toDataURL('image/jpeg', 0.95);
        }
      } catch (e) {
        // Tainted canvas, ignore
      }
    }
  };

  imgEl.src = initialSrc;

  // If we loaded the preview thumbnail initially, check persistent media cache first, then network
  if (originalUrl && initialSrc !== originalUrl && !initialSrc.startsWith('blob:')) {
    getPersistentMediaBlob(originalUrl).then((cachedBlob) => {
      if (cachedBlob && overlay.style.display !== 'none') {
        const blobUrl = URL.createObjectURL(cachedBlob);
        imgEl.src = blobUrl;
        return;
      }
      if (navigator.onLine) {
        const bgImg = new Image();
        bgImg.crossOrigin = 'anonymous';
        bgImg.src = originalUrl;
        bgImg.onload = () => {
          if (overlay.style.display !== 'none' && bgImg.naturalWidth > 0) {
            imgEl.src = originalUrl;
          }
        };
      }
    });
  }

  resetFullscreenPhotoZoom();
  initFullscreenPhotoZoom();

  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  overlay.scrollTop = 0;
  overlay.scrollLeft = 0;

  if (window.lucide) {
    lucide.createIcons({ root: overlay });
  }
}

function closePhotoFullscreen() {
  const overlay = document.getElementById('photo-fullscreen-overlay');
  if (!overlay) return;
  resetFullscreenPhotoZoom();
  overlay.style.display = 'none';
  document.body.style.overflow = '';
  const imgEl = document.getElementById('photo-fullscreen-img');
  if (imgEl) imgEl.onerror = null;
}

// ── Achievement Photo Download Handler (Cached/Direct Memory, APK Gallery & Desktop) ──
async function downloadAchievementPhoto() {
  const isFullscreen = document.getElementById('photo-fullscreen-overlay')?.style.display !== 'none';
  const imgEl = isFullscreen
    ? document.getElementById('photo-fullscreen-img')
    : document.getElementById('ach-lightbox-img');

  const photoUrl = imgEl?.src || activeLightboxData?.photoUrl;
  if (!photoUrl) {
    if (typeof showToast === 'function') showToast('No photo available to download.', 'warn');
    return;
  }

  if (typeof showToast === 'function') showToast('Saving photo...', 'info');

  try {
    let dataUrl = null;
    let rawBlob = null;
    let mimeType = 'image/jpeg';
    if (photoUrl.toLowerCase().includes('.png')) mimeType = 'image/png';
    else if (photoUrl.toLowerCase().includes('.webp')) mimeType = 'image/webp';

    // 1. First attempt: draw directly from the already-rendered DOM image to canvas (instant, 0 network transfer)
    try {
      if (imgEl && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = imgEl.naturalWidth;
        canvas.height = imgEl.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgEl, 0, 0);
        dataUrl = canvas.toDataURL(mimeType, 0.95);
      }
    } catch (e) {
      dataUrl = null;
    }

    // 2. Fallback: retrieve from persistent IndexedDB cache or browser disk/memory cache
    if (!dataUrl) {
      let cachedBlob = await getPersistentMediaBlob(photoUrl);
      if (!cachedBlob && activeLightboxData?.photoUrl) {
        cachedBlob = await getPersistentMediaBlob(activeLightboxData.photoUrl);
      }

      if (cachedBlob) {
        rawBlob = cachedBlob;
      } else {
        const res = await fetch(photoUrl, { cache: 'force-cache' });
        rawBlob = await res.blob();
      }

      if (rawBlob && rawBlob.type) mimeType = rawBlob.type;
      dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(rawBlob);
      });
    }

    const ext = mimeType.includes('png') ? 'png' : (mimeType.includes('webp') ? 'webp' : 'jpg');
    const datePart = (activeLightboxData?.dateStr || (window.todayStr ? window.todayStr() : new Date().toISOString().split('T')[0])).replace(/-/g, '');
    const filename = `achievement_${datePart}_${Date.now()}.${ext}`;

    // 3. Android APK Native wrapper handling:
    // In Capacitor Android, window.isAndroidNative is true. Trigger link click on the data: URI.
    // MainActivity.java's WebView DownloadListener intercepts data: URIs and writes them directly
    // to the device's Downloads/Gallery via MediaStore!
    if (window.isAndroidNative) {
      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (typeof showToast === 'function') showToast('Photo saved to device Gallery / Downloads!', 'success');
      return;
    }

    // Helper to turn dataUrl to Blob purely in memory
    const toBlobPure = (dUrl) => {
      try {
        const parts = dUrl.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || mimeType;
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        return new Blob([u8arr], { type: mime });
      } catch (e) {
        return null;
      }
    };

    // 4. Standard Browser File Download (triggers browser download pop-up)
    const blobToDownload = rawBlob || (dataUrl ? toBlobPure(dataUrl) : null);
    const link = document.createElement('a');
    link.download = filename;
    if (blobToDownload && window.URL && window.URL.createObjectURL) {
      const blobUrl = URL.createObjectURL(blobToDownload);
      link.href = blobUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    } else {
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    if (typeof showToast === 'function') showToast('Photo downloaded successfully!', 'success');
  } catch (err) {
    console.error('Download photo error:', err);
    // Direct URL fallback
    const link = document.createElement('a');
    link.href = photoUrl;
    link.download = `achievement_${Date.now()}.jpg`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (typeof showToast === 'function') showToast('Download started.', 'info');
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('photo-fullscreen-overlay');
    if (overlay && overlay.style.display !== 'none') {
      closePhotoFullscreen();
      e.stopImmediatePropagation();
    }
  }
});

function toggleLightboxEdit(show) {
  const panel = document.getElementById('lightbox-edit-panel');
  const titleInput = document.getElementById('lightbox-edit-title-input');
  const titleCounter = document.getElementById('lightbox-title-counter');
  const captionInput = document.getElementById('lightbox-edit-caption-input');
  if (!panel) return;
  const isOpening = show !== undefined ? show : panel.style.display === 'none';
  panel.style.display = isOpening ? 'block' : 'none';
  if (isOpening && activeLightboxData) {
    const curTitle = (activeLightboxData.title && activeLightboxData.title !== 'Photo') ? activeLightboxData.title : '';
    if (titleInput) {
      titleInput.value = curTitle;
      if (titleCounter) titleCounter.textContent = `${curTitle.length}/30`;
      titleInput.focus();
    }
    if (captionInput) {
      captionInput.value = activeLightboxData.caption || '';
    }
  }
}

async function saveLightboxDetails() {
  if (!activeLightboxData || !activeLightboxData.achId) return;
  const titleInput = document.getElementById('lightbox-edit-title-input');
  const captionInput = document.getElementById('lightbox-edit-caption-input');
  const saveBtn = document.getElementById('lightbox-save-caption-btn');
  const title = (titleInput?.value || '').trim().slice(0, 30);
  const caption = (captionInput?.value || '').trim();

  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

  try {
    const updated = await apiFetch(`${window.API}/api/achievements/${activeLightboxData.achId}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: title || undefined,
        caption,
        description: caption,
        photoId: activeLightboxData.photoId
      })
    });

    activeLightboxData.title = updated.title || title || 'Photo';
    activeLightboxData.caption = caption;

    const titleTextEl = document.getElementById('lightbox-title-text');
    if (titleTextEl) {
      titleTextEl.textContent = activeLightboxData.title;
    }
    const captionEl = document.getElementById('lightbox-caption');
    if (captionEl) {
      captionEl.textContent = caption;
      captionEl.style.display = caption ? 'block' : 'none';
    }

    const idx = (window.allAchievements || []).findIndex(x => String(x._id) === String(activeLightboxData.achId));
    if (idx !== -1) {
      window.allAchievements[idx] = updated;
    }
    if (window.localDb) {
      await window.localDb.achievements.put(updated);
    }

    if (updated.dayId) {
      const cardEl = document.getElementById(`day-card-${updated.dayId}`);
      if (cardEl) {
        const dayAchs = (window.allAchievements || []).filter(a => String(a.dayId) === String(updated.dayId));
        renderDayAchievements(updated.dayId, dayAchs, cardEl);
      }
    }

    if (document.getElementById('page-achievements')?.classList.contains('active')) {
      renderAchievements();
    }

    toggleLightboxEdit(false);
    showToast('Details updated! ✍️', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to update details', 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
  }
}

async function deleteActiveLightboxPhoto() {
  if (!activeLightboxData || !activeLightboxData.achId || !activeLightboxData.photoId) return;
  if (!confirm('Delete this photo? This cannot be undone.')) return;

  const { achId, photoId } = activeLightboxData;
  const delBtn = document.getElementById('lightbox-delete-btn');
  if (delBtn) { delBtn.disabled = true; delBtn.textContent = 'Deleting...'; }

  // Optimistically restore quota in UI immediately based on env limit
  const curLimit = achPhotoQuota.limit || 3;
  achPhotoQuota.used = Math.max(0, (achPhotoQuota.used || 0) - 1);
  achPhotoQuota.remaining = Math.max(0, curLimit - achPhotoQuota.used);
  updatePhotoQuotaUI();

  try {
    const res = await apiFetch(`${window.API}/api/achievements/${achId}/photos/${photoId}`, {
      method: 'DELETE'
    });

    closeModal('modal-photo-lightbox');

    if (res.deletedAchievementId) {
      window.allAchievements = window.allAchievements.filter(a => String(a._id) !== String(achId));
      if (window.localDb) await window.localDb.achievements.delete(achId);
    } else {
      const idx = window.allAchievements.findIndex(a => String(a._id) === String(achId));
      if (idx >= 0) {
        window.allAchievements[idx] = res;
        if (window.localDb) await window.localDb.achievements.put(res);
      }
    }

    // Refresh UI for all day cards
    (window.allDays || []).forEach(day => {
      const cardEl = document.getElementById(`day-card-${day._id}`);
      if (cardEl) {
        const achs = window.allAchievements.filter(a => String(a.dayId) === String(day._id));
        renderDayAchievements(day._id, achs, cardEl);
      }
    });

    if (document.getElementById('page-achievements')?.classList.contains('active')) {
      renderAchievements();
    }

    // Re-render photo slots preview so deleted box drops count until limit
    renderAchSelectedPhotosPreview();

    showToast(achPhotoQuota.remaining > 0 ? 'Photo deleted! Daily quota freed up. ♻️' : 'Photo deleted.', 'success');
    await fetchAchievementPhotoQuota(true);
  } catch (err) {
    showToast(err.message || 'Failed to delete photo.', 'error');
    fetchAchievementPhotoQuota(true);
  } finally {
    if (delBtn) { delBtn.disabled = false; delBtn.innerHTML = '<i data-lucide="trash-2" style="width: 14px; height: 14px;"></i> Delete Photo'; }
  }
}

async function deletePhotoFromCard(achId, photoId, dayId) {
  if (window.checkEmailVerificationBlocked && window.checkEmailVerificationBlocked()) return;
  if (!confirm('Delete this photo? This cannot be undone.')) return;

  const targetAch = window.allAchievements.find(a => String(a._id) === String(achId));
  const remainingPhotos = (targetAch?.photos || []).filter(p => String(p._id) !== String(photoId));

  // Instantly restore quota count in UI based on env limit
  const curLimit = achPhotoQuota.limit || 3;
  achPhotoQuota.used = Math.max(0, (achPhotoQuota.used || 0) - 1);
  achPhotoQuota.remaining = Math.max(0, curLimit - achPhotoQuota.used);
  updatePhotoQuotaUI();

  if (remainingPhotos.length === 0) {
    window.allAchievements = window.allAchievements.filter(a => String(a._id) !== String(achId));
    if (window.localDb) await window.localDb.achievements.delete(achId);
  } else if (targetAch) {
    targetAch.photos = remainingPhotos;
    if (window.localDb) await window.localDb.achievements.put(targetAch);
  }

  const cardEl = document.getElementById(`day-card-${dayId}`);
  if (cardEl) {
    const dayAchs = window.allAchievements.filter(a => String(a.dayId) === String(dayId));
    renderDayAchievements(dayId, dayAchs, cardEl);
  }

  if (document.getElementById('page-achievements')?.classList.contains('active')) {
    renderAchievements();
  }

  // Re-render photo slots preview if modal is active
  renderAchSelectedPhotosPreview();

  showToast(achPhotoQuota.remaining > 0 ? 'Photo deleted! Daily quota freed up. ♻️' : 'Photo deleted.', 'success');

  try {
    if (navigator.onLine) {
      if (remainingPhotos.length === 0) {
        await apiFetch(`${window.API}/api/achievements/${achId}`, { method: 'DELETE' });
      } else {
        await apiFetch(`${window.API}/api/achievements/${achId}/photos/${photoId}`, { method: 'DELETE' });
      }
      await fetchAchievementPhotoQuota(true);
    }
  } catch (err) {
    console.warn('Delete photo server sync error:', err);
    fetchAchievementPhotoQuota(true);
  }
}

// ── Edit Achievement ───────────────────────────────────────
let _achEditLinkPending = false;

async function openEditAchievementModal(achId) {
  let a = (window.allAchievements || []).find(x => String(x._id) === String(achId));
  if (!a && window.localDb) {
    try { a = await window.localDb.achievements.get(achId); } catch (e) {}
  }
  if (!a) {
    try { a = await apiFetch(`${window.API}/api/achievements/${achId}`); } catch (e) {}
  }
  window.editingAchievementId = achId;
  _achEditLinkPending = false;

  const rawTitle = a?.title || '';
  const currentTitle = (window.decodeEntities ? window.decodeEntities(rawTitle) : rawTitle).slice(0, 30);
  const rawDesc = a ? (a.description || a.photos?.[0]?.caption || '') : '';
  const currentDesc = window.decodeEntities ? window.decodeEntities(rawDesc) : rawDesc;
  const titleInput = document.getElementById('edit-ach-title');
  const descInput = document.getElementById('edit-ach-desc');
  const counter = document.getElementById('edit-ach-title-counter');

  if (titleInput) {
    titleInput.value = currentTitle;
  }
  if (counter) {
    counter.textContent = `${currentTitle.length}/30`;
  }
  if (descInput) {
    descInput.value = currentDesc;
  }

  // Populate multi-link builder with existing links
  const builder = document.getElementById('edit-ach-links-builder');
  if (builder) {
    builder.innerHTML = '';
    const existingLinks = a ? (a.links || []) : [];
    if (existingLinks.length > 0) {
      existingLinks.forEach(l => addAchLinkField('edit-ach-links-builder', l));
    } else {
      addAchLinkField('edit-ach-links-builder'); // one empty row
    }
  }

  const warnEl = document.getElementById('edit-ach-link-warning');
  if (warnEl) warnEl.style.display = 'none';
  const btn = document.getElementById('submit-edit-ach-btn');
  if (btn) btn.textContent = 'Save Changes';
  openModal('modal-edit-achievement');
}

async function submitEditAchievement() {
  const titleInput = document.getElementById('edit-ach-title').value.trim();
  const a = window.allAchievements.find(x => String(x._id) === String(window.editingAchievementId));
  const isPhotoAch = a && (a.type === 'photo' || (a.photos && a.photos.length > 0));
  const title = (titleInput || (isPhotoAch ? (a.title || 'Photos') : '')).slice(0, 30);
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
      body: JSON.stringify({ title, description: desc, caption: desc, links }),
    });
    const idx = window.allAchievements.findIndex(x => String(x._id) === String(window.editingAchievementId));
    if (idx !== -1) window.allAchievements[idx] = updated;
    if (window.localDb) await window.localDb.achievements.put(updated);
    closeModal('modal-edit-achievement');
    const cardEl = document.getElementById(`day-card-${updated.dayId}`);
    if (cardEl) {
      const dayAchs = await apiFetch(`${window.API}/api/achievements/day/${updated.dayId}`);
      renderDayAchievements(updated.dayId, dayAchs, cardEl);
    }
    if (document.getElementById('page-achievements').classList.contains('active')) {
      renderAchievements();
    }
    showToast('Achievement updated! ✍️', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Changes';
  }
}

// ── Delete Achievement ─────────────────────────────────────
async function deleteAchievement(achId, dayId) {
  if (window.checkEmailVerificationBlocked && window.checkEmailVerificationBlocked()) {
    return;
  }
  if (!confirm('Delete this achievement? This cannot be undone.')) return;
  try {
    const targetAch = window.allAchievements.find(x => String(x._id) === String(achId));
    const knownDayId = dayId || targetAch?.dayId;
    const numPhotos = (targetAch?.photos || []).length;

    // 1. Immediately restore local quota in UI so the user sees it freed instantly!
    if (numPhotos > 0) {
      const curLimit = achPhotoQuota.limit || 3;
      achPhotoQuota.used = Math.max(0, (achPhotoQuota.used || 0) - numPhotos);
      achPhotoQuota.remaining = Math.max(0, curLimit - achPhotoQuota.used);
      updatePhotoQuotaUI();
      renderAchSelectedPhotosPreview();
    }

    // 2. Update UI and Local DB instantly
    window.allAchievements = window.allAchievements.filter(x => String(x._id) !== String(achId));
    if (window.localDb) await window.localDb.achievements.delete(achId);

    if (knownDayId) {
      const cardEl = document.getElementById(`day-card-${knownDayId}`);
      if (cardEl) {
        const dayAchs = window.allAchievements.filter(a => String(a.dayId) === String(knownDayId));
        renderDayAchievements(knownDayId, dayAchs, cardEl);
      }
    }
    if (document.getElementById('page-achievements')?.classList.contains('active')) {
      renderAchievements();
    }
    showToast('Achievement deleted! ♻️', 'success');

    // 3. If online, immediately call server so Cloudinary assets are cleaned and quota is restored
    if (navigator.onLine) {
      await apiFetch(`${window.API}/api/achievements/${achId}`, { method: 'DELETE' });
      await fetchAchievementPhotoQuota(true);
    } else {
      window.syncManager.addToQueue('DELETE', 'achievements', achId);
    }
  } catch (err) {
    console.error('Offline delete error:', err);
    fetchAchievementPhotoQuota(true);
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
window.submitActiveAchievement = submitActiveAchievement;
window.submitPhotoAchievement = submitPhotoAchievement;
window.switchAchTab = switchAchTab;
window.handleAchPhotoSelection = handleAchPhotoSelection;
window.removeSelectedAchPhoto = removeSelectedAchPhoto;
window.triggerPhotoSlotClick = triggerPhotoSlotClick;
window.openPhotoLightbox = openPhotoLightbox;
window.openPhotoFullscreen = openPhotoFullscreen;
window.closePhotoFullscreen = closePhotoFullscreen;
window.downloadAchievementPhoto = downloadAchievementPhoto;
window.toggleLightboxEdit = toggleLightboxEdit;
window.saveLightboxDetails = saveLightboxDetails;
window.deleteActiveLightboxPhoto = deleteActiveLightboxPhoto;
window.deletePhotoFromCard = deletePhotoFromCard;
window.getSafeThumbUrl = getSafeThumbUrl;
window.fetchAchievementPhotoQuota = fetchAchievementPhotoQuota;
window.compressImageFile = compressImageFile;
window.openEditAchievementModal = openEditAchievementModal;
window.submitEditAchievement = submitEditAchievement;
window.deleteAchievement = deleteAchievement;
console.log("[Module] achievements.js loaded and Achievements bound to window");


// ...