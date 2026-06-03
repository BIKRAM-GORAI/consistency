console.log("[Module] utils.js initializing...");

// ── Mobile detection ───────────────────────────────────────
const isMobile = () => window.innerWidth <= 768;
window.isMobile = isMobile;

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
window.MOTIVATIONS = MOTIVATIONS;

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
window.todayStr = todayStr;

function formatDisplayDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m-1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
window.formatDisplayDate = formatDisplayDate;

function getDayName(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m-1, d).toLocaleDateString('en-US', { weekday: 'long' });
}
window.getDayName = getDayName;

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
window.countTasks = countTasks;

function calcProgress(categories) {
  const { total, completed } = countTasks(categories);
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}
window.calcProgress = calcProgress;

function progressClass(pct) {
  if (pct <= 40) return 'prog-red';
  if (pct <= 80) return 'prog-yellow';
  if (pct < 100) return 'prog-ltgreen';
  return 'prog-green';
}
window.progressClass = progressClass;

function progressColor(pct) {
  if (pct <= 40)  return '#ef4444';
  if (pct <= 80)  return '#eab308';
  if (pct < 100)  return '#34d399';
  return '#10b981';
}
window.progressColor = progressColor;

function calculateStreak(days) {
  if (!days.length) return { count: 0, todayDone: false };

  // Group duplicate dates robustly to ensure multiple cards on same day don't disrupt calculations
  const dayMap = {};
  for (const d of days) {
    const completed = countTasks(d.categories).completed > 0;
    if (dayMap[d.date] !== undefined) {
      dayMap[d.date] = dayMap[d.date] || completed;
    } else {
      dayMap[d.date] = completed;
    }
  }
  const uniqueDays = Object.keys(dayMap).map(date => ({
    date,
    completed: dayMap[date]
  }));

  const sorted = uniqueDays.sort((a, b) => b.date.localeCompare(a.date));
  const today = todayStr();
  let streak = 0;
  let checkDate = today;
  let todayDone = false;

  // Check if today has any tasks completed
  const todayDay = sorted.find(d => d.date === today);
  if (todayDay && todayDay.completed) {
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

    if (day.completed) {
      streak++;
      const [y, m, d] = checkDate.split('-').map(Number);
      const prev = new Date(y, m-1, d-1);
      checkDate = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}-${String(prev.getDate()).padStart(2,'0')}`;
    } else break;
  }
  return { count: streak, todayDone };
}
window.calculateStreak = calculateStreak;

/** Enhanced toast with GSAP */
function showToast(msg, type = 'info') {
  const toast   = document.getElementById('toast');
  const iconEl  = document.getElementById('toast-icon');
  const msgEl   = document.getElementById('toast-msg');

  const icons = { success: 'check-circle', error: 'x-circle', warn: 'alert-triangle', info: 'info' };
  if (iconEl) iconEl.innerHTML = `<i data-lucide="${icons[type] || 'info'}"></i>`;
  if (msgEl) msgEl.innerHTML = msg;

  if (toast) {
    toast.className = 'toast';
    if (type === 'graph') toast.classList.add('graph');
    toast.classList.add('show');
  }
  
  if (window.lucide && iconEl) lucide.createIcons({ props: { width: 20, height: 20 }, nameAttr: 'data-lucide', root: iconEl });

  clearTimeout(showToast._timer);
  if (toast) {
    showToast._timer = setTimeout(() => toast.classList.remove('show'), 3200);
  }
}
window.showToast = showToast;

/** Slim push notification banner — used instead of showToast for foreground FCM messages */
let _pushBannerTimer = null;
function showPushBanner(title, body, groupId) {
  const banner = document.getElementById('push-banner');
  if (!banner) return;
  const titleEl = document.getElementById('push-banner-title');
  const bodyEl  = document.getElementById('push-banner-body');
  if (titleEl) titleEl.textContent = title || 'New Message';
  if (bodyEl)  bodyEl.textContent  = body  || '';

  if (groupId) {
    banner.dataset.groupId = groupId;
    banner.style.cursor = 'pointer';
  } else {
    delete banner.dataset.groupId;
    banner.style.cursor = 'default';
  }

  banner.classList.add('show');
  if (window.lucide) lucide.createIcons({ root: banner });
  clearTimeout(_pushBannerTimer);
  _pushBannerTimer = setTimeout(() => closePushBanner(), 5500);
}
window.showPushBanner = showPushBanner;

function closePushBanner() {
  const banner = document.getElementById('push-banner');
  if (banner) banner.classList.remove('show');
  clearTimeout(_pushBannerTimer);
}
window.closePushBanner = closePushBanner;

function handlePushBannerClick(event) {
  if (event.target.closest('.push-banner-close')) {
    return;
  }
  const banner = document.getElementById('push-banner');
  if (banner && banner.dataset.groupId) {
    const groupId = banner.dataset.groupId;
    closePushBanner();
    showPage('groups');
    openGroupChatFromDeepLink(groupId);
  }
}
window.handlePushBannerClick = handlePushBannerClick;

async function openGroupChatFromDeepLink(groupId) {
  let attempts = 0;
  const maxAttempts = 75; // 15 seconds max polling (75 * 200ms)
  const interval = 200;

  const checkAndOpen = () => {
    const group = (typeof window.allJoinedGroups !== 'undefined' && window.allJoinedGroups)
      ? window.allJoinedGroups.find(g => String(g._id) === String(groupId))
      : null;

    if (group) {
      if (typeof window.openGroupChat === 'function') {
        window.openGroupChat(group._id, group.name, group.icon || '');
      }
      return true;
    }
    return false;
  };

  if (checkAndOpen()) return;

  const timer = setInterval(() => {
    attempts++;
    if (checkAndOpen() || attempts >= maxAttempts) {
      clearInterval(timer);
    }
  }, interval);
}
window.openGroupChatFromDeepLink = openGroupChatFromDeepLink;

function daysLeft(deadlineStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const dl = new Date(deadlineStr); dl.setHours(0,0,0,0);
  return Math.round((dl - today) / (1000 * 60 * 60 * 24));
}
window.daysLeft = daysLeft;

function sortGoals() {
  window.allGoals.sort((a, b) => {
    const aPct = calcProgress([{ tasks: a.tasks }]);
    const aComplete = a.completedAt ? true : (aPct === 100);
    const aDl = daysLeft(a.deadline);

    const bPct = calcProgress([{ tasks: b.tasks }]);
    const bComplete = b.completedAt ? true : (bPct === 100);
    const bDl = daysLeft(b.deadline);

    // Compute priority scores (1 to 4)
    let aPriority = 4;
    if (window.goalsSortOption === 'opposite') {
      if (aComplete) aPriority = 1;
      else if (aDl >= 0) aPriority = 2;
      else if (aDl >= -5) aPriority = 3;
    } else {
      if (!aComplete && aDl < 0 && aDl >= -5) aPriority = 1;
      else if (!aComplete && aDl >= 0) aPriority = 2;
      else if (aComplete) aPriority = 3;
    }

    let bPriority = 4;
    if (window.goalsSortOption === 'opposite') {
      if (bComplete) bPriority = 1;
      else if (bDl >= 0) bPriority = 2;
      else if (bDl >= -5) bPriority = 3;
    } else {
      if (!bComplete && bDl < 0 && bDl >= -5) bPriority = 1;
      else if (!bComplete && bDl >= 0) bPriority = 2;
      else if (bComplete) bPriority = 3;
    }

    // Sort by category priority score first
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    // Sort by deadline date ascending within categories
    return new Date(a.deadline) - new Date(b.deadline);
  });
}
window.sortGoals = sortGoals;

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
window.escHtml = escHtml;

function escJs(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
window.escJs = escJs;

// ── Page switch ────────────────────────────────────────────
function showPage(page) {
  localStorage.setItem('activePage', page);
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

  if (page === 'goals' && typeof window.loadGoals === 'function')             window.loadGoals();
  if (page === 'groups') {
    if (typeof window.loadGroups === 'function') window.loadGroups();
    // Clear notification dots when user navigates to Groups
    const gDot = document.getElementById('groups-notif-dot');
    const bDot = document.getElementById('bnav-groups-notif-dot');
    if (gDot) gDot.style.display = 'none';
    if (bDot) bDot.style.display = 'none';
  }
  if (page === 'achievements' && typeof window.loadAchievements === 'function') window.loadAchievements();
  if (page === 'leaderboard' && typeof window.loadLeaderboard === 'function')   window.loadLeaderboard(true);
}
window.showPage = showPage;

// Listen to push banner clicks
window.addEventListener('DOMContentLoaded', () => {
  const banner = document.getElementById('push-banner');
  if (banner) {
    banner.addEventListener('click', handlePushBannerClick);
  }
});

// Dynamic WebRTC Camera Capture with fallback to standard input
async function startCameraCapture(onSuccess) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn("navigator.mediaDevices.getUserMedia not supported. Falling back to native file input.");
    fallbackToFileInput(onSuccess);
    return;
  }

  // Create modal markup dynamically
  const overlay = document.createElement('div');
  overlay.id = 'custom-camera-modal-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    background: rgba(0,0,0,0.85);
    backdrop-filter: blur(5px);
    z-index: 21000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: 'Space Grotesk', 'Inter', sans-serif;
    color: #fff;
    box-sizing: border-box;
    padding: 16px;
  `;

  // Modal Container
  const container = document.createElement('div');
  container.style.cssText = `
    width: 100%;
    max-width: 480px;
    background: var(--bg-card, #ffffff);
    border: 4px solid var(--black, #0a0a0a);
    border-radius: 16px;
    box-shadow: 8px 8px 0 var(--black, #0a0a0a);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    box-sizing: border-box;
    color: var(--black, #0a0a0a);
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 20px;
    background: var(--pink, #ffb3d9);
    color: #1a0008;
    border-bottom: 4px solid var(--black, #0a0a0a);
    font-weight: 900;
    text-transform: uppercase;
    font-size: 14px;
    letter-spacing: 0.5px;
  `;
  header.innerHTML = `
    <span style="display:flex;align-items:center;gap:6px;">
      <i data-lucide="camera" style="width:16px;height:16px;"></i> Capture Photo
    </span>
    <button id="cam-close-btn" style="
      background: none;
      border: none;
      font-size: 20px;
      font-weight: 900;
      color: #1a0008;
      cursor: pointer;
      padding: 0 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    ">✕</button>
  `;

  // Video wrapper
  const videoWrapper = document.createElement('div');
  videoWrapper.style.cssText = `
    position: relative;
    width: 100%;
    max-height: 55vh;
    max-height: 55dvh;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    align-self: center;
  `;

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
  `;
  video.onloadedmetadata = () => {
    if (video.videoWidth && video.videoHeight) {
      const aspect = video.videoWidth / video.videoHeight;
      videoWrapper.style.aspectRatio = aspect;
    }
  };

  // Camera guides or target frame
  const targetGuide = document.createElement('div');
  targetGuide.style.cssText = `
    position: absolute;
    top: 8%;
    left: 8%;
    right: 8%;
    bottom: 8%;
    border: 3px dashed rgba(255,255,255,0.45);
    border-radius: 12px;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  targetGuide.innerHTML = `
    <span style="color: rgba(255,255,255,0.6); font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; background: rgba(0,0,0,0.5); padding: 4px 10px; border-radius: 6px;">
      Align subject here
    </span>
  `;

  videoWrapper.appendChild(video);
  videoWrapper.appendChild(targetGuide);

  // Footer Actions
  const footer = document.createElement('div');
  footer.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background: var(--bg-muted, #f7f7f7);
    border-top: 4px solid var(--black, #0a0a0a);
    gap: 12px;
  `;

  // Shutter Snap Button (Middle)
  const snapBtn = document.createElement('button');
  snapBtn.id = 'cam-snap-btn';
  snapBtn.className = 'ripple';
  snapBtn.style.cssText = `
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: #fff;
    border: 4px solid var(--black, #0a0a0a);
    cursor: pointer;
    box-shadow: 4px 4px 0 var(--black, #0a0a0a);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.1s ease, box-shadow 0.1s ease;
    outline: none;
    padding: 0;
  `;
  snapBtn.innerHTML = `<div style="width: 32px; height: 32px; border-radius: 50%; background: #ef4444; border: 3px solid var(--black, #0a0a0a);"></div>`;

  // Switch Camera Button
  const switchBtn = document.createElement('button');
  switchBtn.id = 'cam-switch-btn';
  switchBtn.className = 'btn-ghost ripple';
  switchBtn.style.cssText = `
    border: 3px solid #000000 !important;
    color: #000000 !important;
    padding: 8px 14px !important;
    border-radius: 8px !important;
    cursor: pointer !important;
    font-weight: 800 !important;
    font-size: 11px !important;
    text-transform: uppercase !important;
    box-shadow: 2px 2px 0 #000000 !important;
    background: #ffffff !important;
    display: none; /* Only show if multiple video devices exist */
  `;
  switchBtn.innerHTML = `<span style="display:flex;align-items:center;gap:4px;color:#000000 !important;"><i data-lucide="refresh-cw" style="width:12px;height:12px;stroke:#000000 !important;"></i> Flip</span>`;

  // Back / Cancel
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-ghost ripple';
  cancelBtn.style.cssText = `
    border: 3px solid #000000 !important;
    color: #000000 !important;
    padding: 8px 14px !important;
    border-radius: 8px !important;
    cursor: pointer !important;
    font-weight: 800 !important;
    font-size: 11px !important;
    text-transform: uppercase !important;
    box-shadow: 2px 2px 0 #000000 !important;
    background: #ffffff !important;
  `;
  cancelBtn.textContent = 'Cancel';

  footer.appendChild(cancelBtn);
  footer.appendChild(snapBtn);
  footer.appendChild(switchBtn);

  container.appendChild(header);
  container.appendChild(videoWrapper);
  container.appendChild(footer);
  overlay.appendChild(container);
  document.body.appendChild(overlay);

  // Flash element
  const flash = document.createElement('div');
  flash.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: #fff;
    opacity: 0;
    pointer-events: none;
    z-index: 10;
    transition: opacity 0.15s ease-out;
  `;
  videoWrapper.appendChild(flash);

  if (window.lucide) {
    lucide.createIcons({ root: container, props: { width: 14, height: 14 } });
  }

  let currentStream = null;
  let useRearCamera = true;

  // Stop camera tracks
  function stopCamera() {
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      currentStream = null;
    }
  }

  // Close modal
  function closeModal() {
    stopCamera();
    overlay.remove();
  }

  cancelBtn.onclick = closeModal;
  header.querySelector('#cam-close-btn').onclick = closeModal;

  // Start Camera Function
  async function startCamera() {
    stopCamera();

    const constraints = {
      video: {
        facingMode: useRearCamera ? { ideal: 'environment' } : 'user',
        width: { ideal: 1920, max: 3840 },
        height: { ideal: 1080, max: 2160 }
      },
      audio: false
    };

    try {
      currentStream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = currentStream;
    } catch (err) {
      console.warn("Error accessing camera with constraints:", err);
      // Try fallback to any video source
      try {
        currentStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        video.srcObject = currentStream;
      } catch (fallbackErr) {
        console.error("Camera access completely failed:", fallbackErr);
        window.showToast("Could not access camera. Falling back to files.", "error");
        closeModal();
        fallbackToFileInput(onSuccess);
      }
    }
  }

  // Snap photo
  snapBtn.onclick = () => {
    if (!video.videoWidth) return;

    // Trigger flash animation
    flash.style.opacity = '1';
    setTimeout(() => {
      flash.style.opacity = '0';
    }, 100);

    setTimeout(() => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      
      // Draw video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert to Blob
      canvas.toBlob((blob) => {
        if (!blob) {
          window.showToast("Capture failed.", "error");
          closeModal();
          return;
        }

        // Convert Blob to File object
        const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
        closeModal();
        onSuccess(file);
      }, 'image/jpeg', 0.95);
    }, 150); // slight delay to let flash render
  };

  // Switch camera event
  switchBtn.onclick = () => {
    useRearCamera = !useRearCamera;
    startCamera();
  };

  // Enumerate cameras to show Switch button if there's more than one camera
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    if (videoDevices.length > 1) {
      switchBtn.style.display = 'block';
      if (window.lucide) lucide.createIcons({ root: switchBtn });
    }
  } catch (e) {
    console.warn("Could not enumerate devices:", e);
  }

  // Start the video
  await startCamera();
}
window.startCameraCapture = startCameraCapture;

// Fallback: programmatically open file input with capture environment
function fallbackToFileInput(onSuccess) {
  const tempInput = document.createElement('input');
  tempInput.type = 'file';
  tempInput.accept = 'image/*';
  tempInput.capture = 'environment';
  tempInput.onchange = (event) => {
    const file = event.target.files[0];
    if (file) {
      onSuccess(file);
    }
  };
  tempInput.click();
}

console.log("[Module] utils.js loaded and utility helpers bound to window");
