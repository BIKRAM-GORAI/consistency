const API = window.location.origin.includes('localhost') 
  ? (window.location.port === '5001' ? '' : 'http://localhost:5001') 
  : '';

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

  try {
    const code = urlParams.get('code');
    const data = await fetchPublicProfile(username, code);
    renderProfile(data);
    document.getElementById('loading-overlay').style.display = 'none';
    document.getElementById('profile-layout').style.display = 'flex';
  } catch (err) {
    showError(err.message || 'Failed to load profile. This user might have a private account or doesn\'t exist.');
  }
});

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
    document.getElementById('prof-achievements-section').style.display = 'block';
    renderAchievements(data.achievements);
    if (data.achievements.length >= 10) {
      document.getElementById('load-more-ach').style.display = 'block';
    }
  }

  // Days
  renderDays(data.days);
  if (data.days.length < totalDays) {
    document.getElementById('load-more-days').style.display = 'block';
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

function renderAchievements(achievements, append = false) {
  const container = document.getElementById('prof-achievements-list');
  const html = achievements.map(ach => `
    <div class="stat-pill" style="flex-direction:column; align-items:flex-start; background:var(--bg-card); padding:16px;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
        <span style="font-size:20px;">🎉</span>
        <span style="font-weight:900; font-family:'Space Grotesk'; font-size:16px;">${ach.title}</span>
      </div>
      <p style="font-size:12px; color:var(--text-muted); margin:0;">${new Date(ach.date).toLocaleDateString()}</p>
      ${ach.description ? `<p style="font-size:13px; margin-top:8px; line-height:1.4;">${ach.description}</p>` : ''}
    </div>
  `).join('');

  if (append) container.innerHTML += html;
  else container.innerHTML = html;
}

function renderDays(days, append = false) {
  const container = document.getElementById('prof-days-list');
  const html = days.map(day => {
    let total = 0, done = 0;
    day.categories.forEach(c => {
      total += c.tasks.length;
      done += c.tasks.filter(t => t.completed).length;
    });

    return `
      <div class="day-item">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <h3 style="font-family:'Space Grotesk'; font-weight:900; font-size:18px;">${new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</h3>
            <p style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">${new Date(day.date).toLocaleDateString('en-US', { weekday: 'long' })}</p>
          </div>
          <div style="background:var(--bg-muted); border:2px solid var(--black); border-radius:12px; padding:4px 12px; font-weight:900; font-size:13px;">
            ${done}/${total} Tasks
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${day.categories.map(cat => `
            <div style="font-size:13px; font-weight:700; border-bottom:1px solid var(--bg-muted); padding-bottom:4px; margin-top:8px;">${cat.name}</div>
            ${cat.tasks.map(t => `
              <div style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--text-muted);">
                <span style="color:${t.completed ? '#22c55e' : '#ccc'}; font-weight:bold;">${t.completed ? '✓' : '○'}</span>
                <span>${t.title}</span>
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
    if (data.length < 7 || (currentDaysPage + 1) * 7 >= totalDays) {
      btn.style.display = 'none';
    }
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
