const fs = require('fs');

const extraCode = `
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
    }
  });
}

async function performSearch(query) {
  try {
    const res = await fetch(\`\${API}/api/users/search?q=\${encodeURIComponent(query)}\`);
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
        
        let avatarHtml = \`<div style="width:30px; height:30px; border-radius:50%; background:var(--primary); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:14px; flex-shrink:0;">\${u.username.charAt(0).toUpperCase()}</div>\`;
        if (u.profilePicture) {
          avatarHtml = \`<img src="\${u.profilePicture}" style="width:30px; height:30px; border-radius:50%; object-fit:cover; flex-shrink:0; border:1px solid #ccc;" />\`;
        }
        
        item.innerHTML = \`
          \${avatarHtml}
          <div style="font-weight:600; font-size:14px; color:var(--text);">\${u.username}</div>
        \`;
        
        item.onclick = () => {
          searchDropdown.style.display = 'none';
          if (searchInput) searchInput.value = '';
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
    const res = await fetch(\`\${API}/api/users/\${encodeURIComponent(targetUsername)}\`);
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
    document.getElementById('public-profile-username').textContent = \`@\${profile.username}\`;
    document.getElementById('public-profile-streak').textContent = profile.currentStreak;
    
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
  container.innerHTML = '';
  
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
  
  const cells = [];
  let curr = new Date(startDate);
  
  while (curr <= today) {
    const y = curr.getFullYear();
    const m = String(curr.getMonth() + 1).padStart(2, '0');
    const d = String(curr.getDate()).padStart(2, '0');
    const dateStr = \`\${y}-\${m}-\${d}\`;
    
    const completed = dateMap[dateStr] || 0;
    
    const cell = document.createElement('div');
    cell.style.width = '12px';
    cell.style.height = '12px';
    cell.style.borderRadius = '2px';
    
    if (completed > 0) {
      // Completed day (green)
      cell.style.background = 'var(--lime)';
      cell.style.border = '1px solid rgba(0,0,0,0.2)';
    } else {
      // Empty day
      cell.style.background = '#ebedf0';
      cell.style.border = '1px solid rgba(27,31,35,0.06)';
    }
    
    cell.title = \`\${dateStr}: \${completed} tasks completed\`;
    cells.push(cell);
    curr.setDate(curr.getDate() + 1);
  }
  
  cells.forEach(c => container.appendChild(c));
}

function buildReadOnlyDayCard(day) {
  const card = document.createElement('div');
  card.className = 'card neo-card';
  card.style.padding = '16px';
  card.style.marginBottom = '0';
  
  let totalTasks = 0, completedTasks = 0;
  day.categories.forEach(cat => {
    cat.tasks.forEach(t => {
      totalTasks++;
      if (t.completed) completedTasks++;
    });
  });
  
  card.innerHTML = \`
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <h4 style="margin:0; font-size:16px;">\${formatDisplayDate(day.date)}</h4>
      <span style="font-size:14px; font-weight:600; padding:2px 8px; border-radius:12px; background:\${completedTasks === totalTasks && totalTasks > 0 ? 'var(--lime)' : 'var(--bg-muted)'}; color:var(--text);">
        \${completedTasks}/\${totalTasks} Tasks
      </span>
    </div>
    \${day.summary ? \`<p style="margin:0; font-size:14px; color:var(--text-muted);">\${day.summary}</p>\` : ''}
  \`;
  return card;
}

function buildReadOnlyAchievementCard(ach) {
  const card = document.createElement('div');
  card.className = 'card neo-card';
  card.style.padding = '16px';
  card.style.marginBottom = '0';
  card.style.borderLeft = '4px solid var(--pink)';
  
  card.innerHTML = \`
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
      <h4 style="margin:0; font-size:16px;">🏆 \${ach.title}</h4>
      <span style="font-size:12px; color:var(--text-muted);">\${new Date(ach.date).toLocaleDateString()}</span>
    </div>
    \${ach.description ? \`<p style="margin:0; font-size:14px; color:var(--text-muted);">\${ach.description}</p>\` : ''}
  \`;
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
`;

fs.appendFileSync('frontend/script.js', extraCode, 'utf-8');
console.log('Appended to script.js');
