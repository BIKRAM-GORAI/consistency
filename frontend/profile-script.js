const isAndroidNative = navigator.userAgent.includes("CapacitorNative/Android");
const API = isAndroidNative 
  ? 'https://consistency-daily.vercel.app' 
  : (window.location.origin.includes('localhost') 
      ? (window.location.port === '5001' ? '' : 'http://localhost:5001') 
      : '');

let currentUser = null;
let currentDaysPage = 0;
let currentAchPage = 0;
let totalDays = 0;

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const username = urlParams.get('u');

  if (!username) {
    showError('No username provided. Please check the link and try again.');
    return;
  }

  const isOwnUsername = username.toLowerCase() === (localStorage.getItem('userUsername') || '').toLowerCase();

  // If offline and requested username is the own logged in user, fetch profile details offline!
  if (!navigator.onLine && isOwnUsername) {
    try {
      const data = await loadOwnProfileOffline();
      renderProfile(data);
      document.getElementById('loading-overlay').style.display = 'none';
      document.getElementById('profile-layout').style.display = 'flex';

      const btnViewProgress = document.getElementById('btn-view-progress');
      if (btnViewProgress) {
        btnViewProgress.setAttribute('onclick', 'viewProgressOffline()');
      }
      return;
    } catch (err) {
      console.error('Failed to load offline own profile:', err);
    }
  }

  try {
    const code = urlParams.get('code');
    const data = await fetchPublicProfile(username, code);
    renderProfile(data);
    document.getElementById('loading-overlay').style.display = 'none';
    document.getElementById('profile-layout').style.display = 'flex';
  } catch (err) {
    // If online fetch fails (e.g. server down or connection drops) but it's own profile, try offline loading!
    if (isOwnUsername) {
      try {
        console.warn('Online profile load failed, falling back to offline Dexie load...');
        const data = await loadOwnProfileOffline();
        renderProfile(data);
        document.getElementById('loading-overlay').style.display = 'none';
        document.getElementById('profile-layout').style.display = 'flex';

        const btnViewProgress = document.getElementById('btn-view-progress');
        if (btnViewProgress) {
          btnViewProgress.setAttribute('onclick', 'viewProgressOffline()');
        }
        return;
      } catch (offlineErr) {
        console.error('Offline profile fallback failed:', offlineErr);
      }
    }
    showError(err.message || 'Failed to load profile. This user might have a private account or doesn\'t exist.');
  }
});

async function loadOwnProfileOffline() {
  if (typeof Dexie === 'undefined') {
    throw new Error('Dexie is not loaded');
  }
  const dbLocal = new Dexie("ConsistencyDb");
  dbLocal.version(10).stores({
    days: "_id, date, status, tasks, userId",
    goals: "_id, title, targetDate, status, userId",
    groups: "_id, name, code, isPublic",
    achievements: "_id, title, date, userId, dayId",
    syncQueue: "++id, action, entity, targetId, localId, timestamp",
    leaderboard: "sort",
    userProfile: "userId",
    badges: "_id",
    templates: "_id, name",
    mediaCache: "url",
    scratchpads: "dayId",
    weeklySummaries: "_id, date, userId, daysCount",
    appLimits: "userId"
  });

  const userId = localStorage.getItem('userId');
  if (!userId) throw new Error('User not logged in');

  const profile = await dbLocal.userProfile.get(userId);
  if (!profile) {
    throw new Error('No offline profile found in local database');
  }

  // Fetch local achievements
  const localAch = await dbLocal.achievements.where('userId').equals(userId).toArray();
  localAch.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Fetch local days to compute contribution graph and tasks count
  const localDays = await dbLocal.days.where('userId').equals(userId).toArray();
  const totalDays = localDays.length;

  const contributionData = localDays.map(day => {
    let completedCount = 0;
    if (day.categories) {
      day.categories.forEach(c => {
        if (c.tasks) {
          completedCount += c.tasks.filter(t => t.completed).length;
        }
      });
    }
    return {
      date: day.date,
      completedCount: completedCount
    };
  });

  const currentStreak = parseInt(localStorage.getItem('userCurrentStreak') || profile.currentStreak || '0', 10);
  const highestStreak = parseInt(localStorage.getItem('userHighestStreak') || profile.highestStreak || '0', 10);

  const localBadges = await dbLocal.badges.toArray();

  return {
    name: profile.name || localStorage.getItem('userName') || 'User',
    username: profile.username || localStorage.getItem('userUsername') || '',
    profilePicture: profile.profilePicture || localStorage.getItem('userProfilePicture') || '',
    currentStreak,
    highestStreak,
    groupCount: 0,
    totalDays,
    achievements: localAch,
    claimedBadges: localBadges,
    contributionData,
    showPrivateDetails: true
  };
}

async function viewProgressOffline() {
  const ctaBox = document.getElementById('progress-cta-box');
  const daysList = document.getElementById('prof-days-list');
  const btn = document.getElementById('btn-view-progress');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner-ring" style="width:20px;height:20px;border-width:3px;"></div> Loading...';
  }

  try {
    const dbLocal = new Dexie("ConsistencyDb");
    dbLocal.version(10).stores({
      days: "_id, date, status, tasks, userId",
      goals: "_id, title, targetDate, status, userId",
      groups: "_id, name, code, isPublic",
      achievements: "_id, title, date, userId, dayId",
      syncQueue: "++id, action, entity, targetId, localId, timestamp",
      leaderboard: "sort",
      userProfile: "userId",
      badges: "_id",
      templates: "_id, name",
      mediaCache: "url",
      scratchpads: "dayId",
      weeklySummaries: "_id, date, userId, daysCount",
      appLimits: "userId"
    });
    
    const userId = localStorage.getItem('userId');
    const localDays = await dbLocal.days.where('userId').equals(userId).toArray();
    localDays.sort((a, b) => new Date(b.date) - new Date(a.date));

    currentDaysPage = 1;
    const paginatedDays = localDays.slice(0, 7);

    if (paginatedDays.length > 0) {
      ctaBox.style.display = 'none';
      daysList.style.display = 'flex';
      renderDays(paginatedDays);
      
      const loadMoreBtn = document.getElementById('load-more-days');
      if (localDays.length > 7) {
        if (loadMoreBtn) {
          loadMoreBtn.style.display = 'block';
          loadMoreBtn.setAttribute('onclick', 'loadMoreDaysOffline()');
        }
      } else {
        if (loadMoreBtn) loadMoreBtn.style.display = 'none';
      }
    }
  } catch (err) {
    console.error('Failed to load offline progress days:', err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.style.display = 'none';
    }
    if (window.lucide) lucide.createIcons({ root: daysList });
  }
}

async function loadMoreDaysOffline() {
  currentDaysPage++;
  const btn = document.getElementById('load-more-days');
  btn.disabled = true; btn.textContent = 'Loading...';
  try {
    const dbLocal = new Dexie("ConsistencyDb");
    dbLocal.version(10).stores({
      days: "_id, date, status, tasks, userId",
      goals: "_id, title, targetDate, status, userId",
      groups: "_id, name, code, isPublic",
      achievements: "_id, title, date, userId, dayId",
      syncQueue: "++id, action, entity, targetId, localId, timestamp",
      leaderboard: "sort",
      userProfile: "userId",
      badges: "_id",
      templates: "_id, name",
      mediaCache: "url",
      scratchpads: "dayId",
      weeklySummaries: "_id, date, userId, daysCount",
      appLimits: "userId"
    });
    const userId = localStorage.getItem('userId');
    const localDays = await dbLocal.days.where('userId').equals(userId).toArray();
    localDays.sort((a, b) => new Date(b.date) - new Date(a.date));

    const start = (currentDaysPage - 1) * 7;
    const paginatedDays = localDays.slice(start, start + 7);

    if (paginatedDays.length > 0) {
      renderDays(paginatedDays, true);
    }
    if (start + paginatedDays.length >= localDays.length) {
      btn.style.display = 'none';
    }
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error(err);
  } finally {
    btn.disabled = false; btn.textContent = 'Load More Days';
  }
}

async function fetchPublicProfile(username, code = null) {
  const url = code 
    ? `${API}/api/users/${username}?code=${code}` 
    : `${API}/api/users/${username}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Profile not found');
  }
  return await res.json();
}

function renderProfile(data) {
  currentUser = data.username;
  totalDays = data.totalDays;

  // Sidebar
  document.getElementById('prof-name').textContent = data.name;
  document.getElementById('prof-username').textContent = `@${data.username}`;
  document.getElementById('stat-current-streak').textContent = data.currentStreak;
  document.getElementById('stat-highest-streak').textContent = data.highestStreak;
  document.getElementById('stat-groups').textContent = data.groupCount || 0;

  // Render Standalone AI Productivity Bio
  const bioCard = document.getElementById('ai-bio-card');
  const bioText = document.getElementById('ai-bio-text');
  const btnRefresh = document.getElementById('btn-refresh-bio');
  
  if (bioCard && bioText) {
    const isOwnUsername = data.username.toLowerCase() === (localStorage.getItem('userUsername') || '').toLowerCase();
    
    if (data.productivityBio || isOwnUsername) {
      bioCard.style.display = 'block';
      bioText.textContent = data.productivityBio || "Generate your custom AI Productivity Biography to showcase your active consistency streaks and task milestones on your public profile!";
      
      if (isOwnUsername) {
        btnRefresh.style.display = 'inline-flex';
        updateBioCooldownUI(data.lastBioGeneratedAt);
      } else {
        btnRefresh.style.display = 'none';
      }
    } else {
      bioCard.style.display = 'none';
    }
  }

  // Avatar
  const initial = data.name.charAt(0).toUpperCase();
  document.getElementById('prof-initial').textContent = initial;
  if (data.profilePicture) {
    const img = document.getElementById('prof-img');
    img.src = data.profilePicture;
    img.style.display = 'block';
    img.style.cursor = 'zoom-in';
    document.getElementById('prof-initial').style.display = 'none';
    
    img.onclick = () => {
      const modal = document.getElementById('image-modal');
      const modalImg = document.getElementById('modal-img');
      modalImg.src = data.profilePicture;
      modal.style.display = 'flex';
    };
  }

  // Graph
  renderContributionGraph(data.contributionData);

  // Achievements
  if (data.achievements && data.achievements.length > 0) {
    renderAchievements(data.achievements);
  } else {
    const noAch = document.getElementById('no-achievements-msg');
    if (noAch) noAch.style.display = 'block';
  }
  
  // Badges
  if (data.claimedBadges && data.claimedBadges.length > 0) {
    renderBadges(data.claimedBadges);
  } else {
    document.getElementById('no-badges-msg').style.display = 'block';
  }

  // Days Section (Optimized for on-demand loading)
  if (data.showPrivateDetails === false) {
    const ctaBox = document.getElementById('progress-cta-box');
    if (ctaBox) {
      ctaBox.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 20px;">🔒</div>
        <h3 style="font-family: 'Space Grotesk', sans-serif; font-weight: 900; font-size: 24px; margin-bottom: 12px; text-transform: uppercase;">Private Profile</h3>
        <p style="color: var(--text-muted); font-weight: 600; margin-bottom: 0; max-width: 400px; margin-left: auto; margin-right: auto;">This user's detailed progress cards and recent achievements are private.</p>
      `;
    }
    const viewProgressBtn = document.getElementById('btn-view-progress');
    if (viewProgressBtn) {
      viewProgressBtn.style.display = 'none';
    }
  } else if (totalDays === 0) {
    const ctaBox = document.getElementById('progress-cta-box');
    if (ctaBox) {
      ctaBox.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 20px;">🏜️</div>
        <h3 style="font-family: 'Space Grotesk', sans-serif; font-weight: 900; font-size: 24px; margin-bottom: 12px; text-transform: uppercase;">A Quiet Start</h3>
        <p style="color: var(--text-muted); font-weight: 600; margin-bottom: 0; max-width: 400px; margin-left: auto; margin-right: auto;">This user hasn't logged any daily progress cards yet.</p>
      `;
    }
  }

  if (window.lucide) lucide.createIcons();
}

function renderContributionGraph(data) {
  const container = document.getElementById('prof-contribution-graph');
  const dateMap = {};
  if (data) {
    data.forEach(d => { dateMap[d.date] = d.completedCount; });
  }

  const today = new Date();
  const startDate = new Date();
  startDate.setDate(today.getDate() - (52 * 7));
  while (startDate.getDay() !== 0) { startDate.setDate(startDate.getDate() - 1); }

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
      const dateStr = curr.toISOString().split('T')[0];
      const completed = dateMap[dateStr] || 0;
      const x = col * (cellSize + gap) + extraX;
      const y = row * (cellSize + gap) + topPadding;
      maxX = Math.max(maxX, x + cellSize);
      const fill = completed > 0 ? '#22c55e' : 'var(--graph-empty)';
      rectsHtml += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" ry="2" fill="${fill}" stroke="rgba(0,0,0,0.05)" stroke-width="1"><title>${dateStr}: ${completed} tasks</title></rect>`;
      curr.setDate(curr.getDate() + 1);
    }
  }

  const width = maxX;
  const height = rows * (cellSize + gap) - gap + topPadding + 10; // Added height buffer
  container.innerHTML = `<div class="graph-wrapper"><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="display:block;">${monthLabels}${rectsHtml}</svg></div>`;
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function buildLinksHTML(links) {
  if (!links || !links.length) return '';
  return links.map((l, i) =>
    `<a class="ach-link-pill" href="${escHtml(l)}" target="_blank" rel="noopener noreferrer">
      <i data-lucide="external-link"></i> 
      <span>${links.length > 1 ? `Link ${i + 1}` : 'View Proof'}</span>
    </a>`
  ).join('');
}

function renderAchievements(achievements, append = false) {
  const container = document.getElementById('prof-achievements-list');
  const pastels = ['#E8F5E9', '#FCE4EC', '#FFF9C4', '#E3F2FD', '#F3E5F5', '#FFF3E0'];
  
  const html = achievements.map((ach, idx) => {
    const bgColor = pastels[idx % pastels.length];
    const linksHtml = buildLinksHTML(ach.links || []);
    
    return `
      <div class="stat-pill" style="flex-direction:column; align-items:flex-start; background:${bgColor} !important; padding:20px; border:3px solid #111111; box-shadow:6px 6px 0px #111111; border-radius:12px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
          <span style="font-size:22px;">🎉</span>
          <span style="font-weight:900; font-family:'Space Grotesk'; font-size:18px; color:#111111;">${escHtml(ach.title)}</span>
        </div>
        <p style="font-size:12px; color:#444444; margin:0; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">${new Date(ach.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
        ${ach.description ? `<p style="font-size:14px; margin-top:10px; line-height:1.5; color:#111111; font-weight:500;">${escHtml(ach.description)}</p>` : ''}
        ${linksHtml ? `<div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:12px;">${linksHtml}</div>` : ''}
      </div>
    `;
  }).join('');

  if (append) container.innerHTML += html;
  else container.innerHTML = html;
  if (window.lucide) lucide.createIcons({ root: container });
}

function renderBadges(badges) {
  const container = document.getElementById('streak-badges-grid');
  const noMsg = document.getElementById('no-badges-msg');
  if (!badges || badges.length === 0) {
    noMsg.style.display = 'block';
    return;
  }
  noMsg.style.display = 'none';
  container.innerHTML = badges.map(b => `
    <div style="width: 50px; height: 50px; border: 2px solid var(--black); background: #fff; border-radius: 6px; box-shadow: 2px 2px 0 var(--black); overflow: hidden; display: flex; align-items: center; justify-content: center; cursor: pointer;" title="${escHtml(b.name)} (${b.requiredDays} Days)" onclick="openBadgeLightbox('${b.image}')">
      <img src="${b.image}" style="width: 100%; height: 100%; object-fit: contain;">
    </div>
  `).join('');
}

function openBadgeLightbox(url) {
  const modal = document.getElementById('image-modal');
  const modalImg = document.getElementById('modal-img');
  if (modal && modalImg) {
    modalImg.src = url;
    modal.style.display = 'flex';
  }
}

function renderDays(days, append = false) {
  const container = document.getElementById('prof-days-list');
  const subtlePastels = ['#F9FAFB', '#F0FDF4', '#FDF2F8', '#F5F3FF', '#FFFBEB', '#EFF6FF', '#FFF7ED', '#F8FAFC'];

  const html = days.map((day, idx) => {
    const bgColor = subtlePastels[idx % subtlePastels.length];
    let total = 0, done = 0;
    day.categories.forEach(c => {
      total += c.tasks.length;
      done += c.tasks.filter(t => t.completed).length;
    });

    return `
      <div class="day-item" style="background:${bgColor} !important; border:3px solid #111111; box-shadow:6px 6px 0px rgba(0,0,0,0.05); transition:transform 0.2s ease;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <div>
            <h3 style="font-family:'Space Grotesk'; font-weight:900; font-size:20px; color:#111111;">${new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</h3>
            <p style="font-size:12px; font-weight:700; color:#666666; text-transform:uppercase; letter-spacing:1px;">${new Date(day.date).toLocaleDateString('en-US', { weekday: 'long' })}</p>
          </div>
          <div style="background:#ffffff; border:2px solid #111111; border-radius:10px; padding:6px 14px; font-weight:900; font-size:14px; color:#111111; box-shadow:3px 3px 0px #111111;">
            ${done}/${total} Tasks
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${day.categories.map(cat => `
            <div style="font-size:13px; font-weight:700; border-bottom:1px solid var(--bg-muted); padding-bottom:4px; margin-top:8px;">${cat.name}</div>
            ${cat.tasks.map(t => `
              <div style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--text-muted);">
                <span style="color:${t.completed ? '#22c55e' : '#ccc'}; font-weight:bold;">${t.completed ? '✓' : '○'}</span>
                <span>${escHtml(t.title)}</span>
              </div>
            `).join('')}
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  if (append) container.innerHTML += html;
  else container.innerHTML = html;
}

async function viewProgress() {
  const ctaBox = document.getElementById('progress-cta-box');
  const daysList = document.getElementById('prof-days-list');
  const btn = document.getElementById('btn-view-progress');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner-ring" style="width:20px;height:20px;border-width:3px;"></div> Loading...';
  }

  try {
    // Fetch first page (page 1)
    currentDaysPage = 1;
    const res = await fetch(`${API}/api/users/${currentUser}/days?page=${currentDaysPage}`);
    const data = await res.json();
    
    if (data.length > 0) {
      ctaBox.style.display = 'none';
      daysList.style.display = 'flex';
      renderDays(data);
      
      if (totalDays > 7) {
        document.getElementById('load-more-days').style.display = 'block';
      }
    }
    if (window.lucide) lucide.createIcons({ root: daysList });
  } catch (err) {
    console.error(err);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="eye"></i> Try Again';
      if (window.lucide) lucide.createIcons({ root: btn });
    }
  }
}

async function loadMoreDays() {
  currentDaysPage++;
  const btn = document.getElementById('load-more-days');
  btn.disabled = true; btn.textContent = 'Loading...';
  try {
    const res = await fetch(`${API}/api/users/${currentUser}/days?page=${currentDaysPage}`);
    const data = await res.json();
    if (data.length > 0) {
      renderDays(data, true);
    }
    if (data.length < 7 || currentDaysPage * 7 >= totalDays) {
      btn.style.display = 'none';
    }
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error(err);
  } finally {
    btn.disabled = false; btn.textContent = 'Load More Days';
  }
}

async function loadMoreAchievements() {
  currentAchPage++;
  const btn = document.getElementById('load-more-ach');
  btn.disabled = true; btn.textContent = 'Loading...';
  try {
    const res = await fetch(`${API}/api/users/${currentUser}/achievements?page=${currentAchPage}`);
    const data = await res.json();
    if (data.length > 0) {
      renderAchievements(data, true);
    }
    if (data.length < 10) {
      btn.style.display = 'none';
    }
  } catch (err) {
    console.error(err);
  } finally {
    btn.disabled = false; btn.textContent = 'Load More Achievements';
  }
}

function showError(msg) {
  document.getElementById('loading-overlay').style.display = 'none';
  const overlay = document.getElementById('error-overlay');
  overlay.style.display = 'flex';
  document.getElementById('error-msg').textContent = msg;
}

/**
 * Cooldown UI update logic for biography refreshes
 */
function updateBioCooldownUI(lastGeneratedAt) {
  const btn = document.getElementById('btn-refresh-bio');
  const cooldownMsg = document.getElementById('bio-cooldown-message');
  if (!btn || !cooldownMsg) return;

  if (!lastGeneratedAt) {
    btn.disabled = false;
    btn.style.display = 'inline-flex';
    cooldownMsg.style.display = 'none';
    return;
  }

  const lastGenTime = new Date(lastGeneratedAt).getTime();
  const cooldownMs = 24 * 60 * 60 * 1000; // 24-hour window
  const elapsed = Date.now() - lastGenTime;

  if (elapsed < cooldownMs) {
    btn.disabled = true;
    btn.style.display = 'none';
    cooldownMsg.style.display = 'block';
    
    const remainingMs = cooldownMs - elapsed;
    const hoursLeft = Math.ceil(remainingMs / (1000 * 60 * 60));
    cooldownMsg.innerHTML = `<span style="font-size: 13px;">⏳</span> Cooldown active. Refresh in <strong>${hoursLeft} hours</strong>`;
  } else {
    btn.disabled = false;
    btn.style.display = 'inline-flex';
    cooldownMsg.style.display = 'none';
  }
}

/**
 * Submits POST request to recalculate User productivity highlights
 */
async function refreshProductivityBio() {
  if (!navigator.onLine) {
    alert('Offline: Cannot refresh biography.');
    return;
  }

  const btn = document.getElementById('btn-refresh-bio');
  const bioText = document.getElementById('ai-bio-text');
  const cooldownMsg = document.getElementById('bio-cooldown-message');
  if (!btn || !bioText) return;

  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner-ring" style="width: 14px; height: 14px; border-width: 2px; border-color: var(--yellow) transparent transparent transparent;"></div> <span>Calculating...</span>';

  try {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API}/api/ai/productivity-bio`, {
      method: 'POST',
      headers
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Failed to refresh bio.');
    }

    const resData = await res.json();
    if (resData && resData.productivityBio) {
      bioText.textContent = resData.productivityBio;
      
      // Update cooldown timestamp dynamically
      updateBioCooldownUI(new Date().toISOString());
      
      // GSAP smooth recalculation zoom entrance
      if (window.gsap) {
        gsap.fromTo(bioText, { scale: 0.98, opacity: 0.7 }, { scale: 1, opacity: 1, duration: 0.45, ease: 'power2.out' });
      }
      
      // Update local storage in case they edit other things
      localStorage.setItem('userProductivityBio', resData.productivityBio);
    }
  } catch (err) {
    console.error('refreshProductivityBio error:', err);
    alert(err.message || 'Error occurred while generating biography.');
  } finally {
    btn.innerHTML = originalHTML;
  }
}
