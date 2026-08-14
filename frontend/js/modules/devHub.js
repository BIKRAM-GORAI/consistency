function _getContrastTextColor(hex) {
  if (!hex) return '#000000';
  const clean = hex.replace('#','');
  const r = parseInt(clean.substr(0,2), 16) || 0;
  const g = parseInt(clean.substr(2,2), 16) || 0;
  const b = parseInt(clean.substr(4,2), 16) || 0;
  const yiq = ((r*299)+(g*587)+(b*114))/1000;
  return (yiq >= 128) ? '#000000' : '#ffffff';
}
// ── Developer Hub Module ────────────────────────────────────────
console.log("[Module] devHub.js initializing...");

// Local toast reference delegation
const showToast = (...args) => window.showToast(...args);

// API URL Resolution
const getResolvedAPI = () => {
  const API = window.API || '';
  const isAndroidNative = navigator.userAgent.includes("CapacitorNative/Android");
  return isAndroidNative ? 'https://consistency-daily.vercel.app' : API;
};

// Initiate OAuth flow by redirecting the browser
window.initiateOAuth = function (service) {
  const token = localStorage.getItem('token');
  if (!token) {
    showToast('You must be logged in to connect integrations.', 'error');
    return;
  }
  const backendUrl = getResolvedAPI();
  window.location.href = `${backendUrl}/api/integrations/${service}/auth?token=${token}`;
};

// Disconnect an integration
window.disconnectService = async function (service) {
  if (!confirm(`Are you sure you want to disconnect ${service.toUpperCase()}?`)) return;
  try {
    const backendUrl = getResolvedAPI();
    await apiFetch(`${backendUrl}/api/integrations/disconnect`, {
      method: 'POST',
      body: JSON.stringify({ service })
    });
    showToast(`${service.toUpperCase()} disconnected successfully!`, 'success');
    window.loadDevHub();
  } catch (error) {
    console.error('Error disconnecting service:', error);
    showToast(error.message || 'Failed to disconnect service.', 'error');
  }
};

// Connect Medium using Username
window.connectMedium = async function () {
  const usernameInput = document.getElementById('medium-username');
  const username = usernameInput.value.trim();
  if (!username) {
    showToast('Please enter a Medium username.', 'warn');
    return;
  }
  try {
    const backendUrl = getResolvedAPI();
    await apiFetch(`${backendUrl}/api/integrations/config`, {
      method: 'POST',
      body: JSON.stringify({ mediumUsername: username })
    });
    showToast('Medium publications connected!', 'success');
    usernameInput.value = '';
    window.loadDevHub();
  } catch (error) {
    console.error('Error connecting Medium:', error);
    showToast('Failed to connect Medium.', 'error');
  }
};

// Connect Stack Overflow using User ID
window.connectStackOverflow = async function () {
  const idInput = document.getElementById('stackoverflow-user-id');
  const id = idInput.value.trim();
  if (!id) {
    showToast('Please enter a Stack Overflow User ID.', 'warn');
    return;
  }
  try {
    const backendUrl = getResolvedAPI();
    await apiFetch(`${backendUrl}/api/integrations/config`, {
      method: 'POST',
      body: JSON.stringify({ stackOverflowId: id })
    });
    showToast('Stack Overflow integrated successfully!', 'success');
    idInput.value = '';
    window.loadDevHub();
  } catch (error) {
    console.error('Error connecting Stack Overflow:', error);
    showToast('Failed to connect Stack Overflow.', 'error');
  }
};

// Connect Dev.to using Username
window.connectDevTo = async function () {
  const usernameInput = document.getElementById('devto-username');
  const username = usernameInput.value.trim();
  if (!username) {
    showToast('Please enter a Dev.to username.', 'warn');
    return;
  }
  try {
    const backendUrl = getResolvedAPI();
    await apiFetch(`${backendUrl}/api/integrations/config`, {
      method: 'POST',
      body: JSON.stringify({ devtoUsername: username })
    });
    showToast('Dev.to articles feed connected!', 'success');
    usernameInput.value = '';
    window.loadDevHub();
  } catch (error) {
    console.error('Error connecting Dev.to:', error);
    showToast('Failed to connect Dev.to.', 'error');
  }
};

// Google/DuckDuckGo Doc Search Bar
window.runDevSearch = async function () {
  const queryInput = document.getElementById('devhub-search-input');
  const query = queryInput.value.trim();
  if (!query) return;

  const resultsDiv = document.getElementById('devhub-search-results');
  const resText = document.getElementById('search-res-text');
  const sourceBtn = document.getElementById('search-res-link-btn');
  const googleBtn = document.getElementById('search-google-fallback-btn');

  // Hide initially
  resultsDiv.style.display = 'none';

  try {
    // DuckDuckGo Instant Answer API (No CORS block for JSONP/JSON query params)
    const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
    if (!response.ok) throw new Error('Search failed');

    const data = await response.json();
    const answer = data.AbstractText || data.Definition;

    if (answer) {
      resText.textContent = answer;
      resultsDiv.style.display = 'block';

      if (data.AbstractURL) {
        sourceBtn.style.display = 'inline-flex';
        sourceBtn.setAttribute('onclick', `window.open('${data.AbstractURL}', '_blank')`);
      } else {
        sourceBtn.style.display = 'none';
      }

      googleBtn.setAttribute('onclick', `window.open('https://www.google.com/search?q=${encodeURIComponent(query)}', '_blank')`);
    } else {
      // Fallback directly to Google search popup if no instant definition is found
      window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
    }
  } catch (error) {
    console.error('Search error:', error);
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
  }
};

// Switch between horizontal tabs in the Developer Hub
window.switchDevHubTab = function (tabName) {
  if (tabName === 'studymode') {
    tabName = 'universal';
  }
  // Update active tab buttons
  document.querySelectorAll('.devhub-tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.getElementById(`devhub-tab-${tabName}`);
  if (activeBtn) activeBtn.classList.add('active');

  // Toggle active card visibility
  document.querySelectorAll('.devhub-card').forEach(card => {
    card.style.display = 'none';
  });
  const activeCard = document.getElementById(`hub-card-${tabName}`);
  if (activeCard) {
    activeCard.style.display = 'flex';
  }

  // Ensure active sub-tab button within the selected card is properly highlighted
  if (tabName === 'stackoverflow') {
    const activeSub = document.querySelector('#hub-card-stackoverflow .github-sub-tab-btn.active');
    if (!activeSub && typeof window.switchStackOverflowSubTab === 'function') {
      window.switchStackOverflowSubTab('public');
    }
  } else if (tabName === 'devto') {
    const activeSub = document.querySelector('#hub-card-devto .github-sub-tab-btn.active');
    if (!activeSub && typeof window.switchDevToSubTab === 'function') {
      window.switchDevToSubTab('public');
    }
  } else if (tabName === 'medium') {
    const activeSub = document.querySelector('#hub-card-medium .github-sub-tab-btn.active');
    if (!activeSub && typeof window.switchMediumSubTab === 'function') {
      window.switchMediumSubTab('public');
    }
  }

  // Save selected tab in local storage
  localStorage.setItem('activeDevHubTab', tabName);
};

// Global toggle helper between setup and content panels
function toggleWidgetState(service, connected, details) {
  const setupEl = document.getElementById(`${service}-setup`);
  const contentEl = document.getElementById(`${service}-content`);
  const badgeEl = document.getElementById(`${service}-badge`);

  if (!setupEl || !contentEl || !badgeEl) return;

  if (connected) {
    setupEl.style.display = 'none';
    contentEl.style.display = 'block';
    badgeEl.textContent = details ? `Connected: ${details}` : 'Connected';
    badgeEl.className = 'status-badge connected';
  } else {
    setupEl.style.display = 'block';
    contentEl.style.display = 'none';
    badgeEl.textContent = 'Disconnected';
    badgeEl.className = 'status-badge disconnected';
  }
}

// ── MAIN CORE LOAD FUNCTION ────────────────────────────────────
window.loadDevHub = async function () {
  console.log('[DevHub] Synchronizing tab UI state...');
  
  // Set default tab immediately so UI is cleanly tabbed before any API call resolves
  const activeTab = localStorage.getItem('activeDevHubTab') || 'universal';
  window.switchDevHubTab(activeTab);

  // Setup auto-clear search inputs with 1 second delay
  const setupAutoClearSearch = (inputId, filterFn) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    let debounceTimeout = null;
    input.addEventListener('input', () => {
      if (debounceTimeout) clearTimeout(debounceTimeout);
      if (input.value.trim() === '') {
        debounceTimeout = setTimeout(() => {
          filterFn('');
        }, 1000);
      }
    });
  };

  setupAutoClearSearch('so-tag-search-input', window.filterSOTag);
  setupAutoClearSearch('devto-tag-search-input', window.filterDevToTag);
  setupAutoClearSearch('medium-tag-search-input', window.filterMediumTag);

  try {
    const backendUrl = getResolvedAPI();
    const status = await apiFetch(`${backendUrl}/api/integrations/status`);

    // 1. Process GitHub widget
    toggleWidgetState('github', status.github.connected);
    if (status.github.connected && status.github.accessToken) {
      loadGitHubData(status.github.accessToken);
    }

    // 3. Process Medium widget — public feed always loads; personal feed loads if connected
    toggleWidgetState('medium', status.medium && status.medium.connected, status.medium ? status.medium.username : null);
    if (status.medium && status.medium.connected && status.medium.username) {
      loadMediumData(status.medium.username);
    } else {
      loadMediumPublicFeedFiltered();
    }
    // Always default to public feed subtab on load
    window.switchMediumSubTab('public');

    // 4. Process Stack Overflow widget
    toggleWidgetState('stackoverflow', status.stackoverflow.connected, status.stackoverflow.id);
    if (status.stackoverflow.connected && status.stackoverflow.id) {
      loadStackOverflowData(status.stackoverflow.id);
    }
    // Always load public questions feed and set default subtab to public
    loadStackOverflowPublicFeed();
    window.switchStackOverflowSubTab('public');

    // 5. Process Dev.to widget
    toggleWidgetState('devto', status.devto.connected, status.devto.username);
    // Always call loadDevToData (it handles loading public feed + personal feed if username exists)
    loadDevToData(status.devto.connected ? status.devto.username : null);
    // Always default to public feed subtab on load
    window.switchDevToSubTab('public');

    // Refresh lucide icons for any dynamic elements
    setTimeout(() => {
      if (window.lucide) window.lucide.createIcons();
    }, 200);

  } catch (error) {
    console.error('Error loading Dev Hub:', error);
    showToast('Failed to load integration states.', 'error');
  }
};

// ── DATA WIDGET FETCHERS ───────────────────────────────────────

// 1. GitHub Direct-to-Browser Developer Dashboard Controller

let githubAccessTokenCached = null;
let currentRepoPage = 1;
const reposPerPage = 5;
let activeRepoFilter = 'all';

// Main Sub-Tab switcher
window.switchGithubSubTab = function (tabName) {
  // Hide all panels
  document.querySelectorAll('.github-panel').forEach(panel => {
    panel.style.display = 'none';
  });
  
  // Show active panel
  const activePanel = document.getElementById(`github-panel-${tabName}`);
  if (activePanel) {
    activePanel.style.display = 'block';
  }

  // STRICTLY CONTROL BUTTON VISIBILITY: Only show Refresh Analytics & Disconnect GitHub when tabName is 'overview'
  document.querySelectorAll('.devhub-control-buttons').forEach(ctrlBtns => {
    ctrlBtns.style.display = (tabName === 'overview') ? 'flex' : 'none';
  });

  // Set active tab button style — scoped strictly to GitHub sub-tabs
  document.querySelectorAll('#hub-card-github .github-sub-tab-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    }
  });

  // Lazy load actions repository selector when opening DevOps panel
  if (tabName === 'devops') {
    populateActionsRepoSelect();
  }

  // Re-layout Lucide icons
  if (window.lucide) window.lucide.createIcons();
};

// Populate the CI/CD repository select box
function populateActionsRepoSelect() {
  const select = document.getElementById('github-actions-repo-select');
  if (!select || !window.githubReposList || select.options.length > 1) return;

  // Filter only original or non-fork active repositories
  const sourceRepos = window.githubReposList.filter(r => !r.isFork);
  sourceRepos.forEach(repo => {
    const opt = document.createElement('option');
    opt.value = repo.nameWithOwner;
    opt.textContent = repo.name;
    select.appendChild(opt);
  });
}

// Fetch and render CI/CD Workflow runs for selected repository
window.loadWorkflowRunsForSelectedRepo = async function () {
  const select = document.getElementById('github-actions-repo-select');
  const container = document.getElementById('github-actions-runs-list');
  if (!select || !container) return;

  const nameWithOwner = select.value;
  if (!nameWithOwner) {
    container.innerHTML = '<p style="text-align:center; font-size:12px; color:var(--text-muted); padding:30px 0;">Please select a repository above to load workflow runs.</p>';
    return;
  }

  container.innerHTML = `
    <div style="text-align:center; padding: 40px; color: var(--text-muted); font-size: 13px;">
      <div class="spinner-ring" style="width:24px;height:24px;border-width:2.5px;margin:0 auto 10px;border-color:var(--purple) #0000 #0000 #0000;"></div>
      Querying GitHub Actions...
    </div>
  `;

  try {
    const [owner, repoName] = nameWithOwner.split('/');
    const runs = await window.githubService.fetchWorkflowRuns(owner, repoName);
    
    // Refresh diagnostics statistics visualizer
    renderDiagnosticsQuota();

    container.innerHTML = '';
    if (runs.length === 0) {
      container.innerHTML = '<p style="text-align:center; font-size:12px; color:var(--text-muted); padding:30px 0;">No workflow runs found or Actions are disabled on this repository.</p>';
      return;
    }

    runs.forEach(run => {
      const item = document.createElement('div');
      item.className = 'repo-card-minimal';
      item.style.padding = '12px';
      item.style.marginBottom = '8px';
      item.style.background = 'linear-gradient(135deg, var(--bg-card) 0%, rgba(230, 230, 235, 0.4) 100%)';
      item.style.display = 'flex';
      item.style.flexDirection = 'column';
      item.style.gap = '6px';
      item.style.textDecoration = 'none';

      // Status indicator style
      let statusColor = 'var(--text-muted)';
      let statusSymbol = '⚪';
      if (run.conclusion === 'success') {
        statusColor = 'var(--green)';
        statusSymbol = '🟢';
      } else if (run.conclusion === 'failure') {
        statusColor = 'var(--red)';
        statusSymbol = '🔴';
      } else if (run.status === 'in_progress') {
        statusColor = 'var(--yellow)';
        statusSymbol = '🟡';
      }

      const durationStr = run.duration ? `${Math.floor(run.duration / 60)}m ${run.duration % 60}s` : 'N/A';
      
      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <a href="${run.url}" target="_blank" style="font-weight:900; font-family:Space Grotesk; font-size:13px; color:var(--text); text-decoration:none;">
            ${run.name} <span style="font-weight:600; color:var(--text-muted); font-size:11px;">#${run.commitSha.substring(0, 7)}</span>
          </a>
          <span style="font-size:11px; font-weight:800; color:${statusColor};">${statusSymbol} ${run.conclusion || run.status}</span>
        </div>
        <div style="display:flex; gap:12px; font-size:11px; font-weight:700; color:var(--text-muted);">
          <span>Branch: <b>${run.branch}</b></span>
          <span>Duration: <b>${durationStr}</b></span>
          <span>Event: <b>${run.trigger}</b></span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; margin-top:4px; border-top:1px dashed #ddd; padding-top:4px;">
          <span>Triggered ${new Date(run.startedAt).toLocaleString()}</span>
          <a href="${run.url}" target="_blank" style="color:var(--purple); font-weight:800; text-decoration:none;">View Workflow ↗</a>
        </div>
      `;
      container.appendChild(item);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p style="text-align:center; font-size:12px; color:var(--red); padding:30px 0;">Error fetching runs: ${err.message}</p>`;
  }
};

// Fetch and toggle traffic data display inline inside repository card
window.toggleRepoTraffic = async function (owner, repo, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (container.style.display === 'block') {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  container.innerHTML = `
    <div style="display:flex; align-items:center; gap:6px;">
      <div class="spinner-ring" style="width:14px;height:14px;border-width:2px;border-color:var(--purple) #0000 #0000 #0000;"></div>
      Loading traffic statistics...
    </div>
  `;

  try {
    const traffic = await window.githubService.fetchRepoTraffic(owner, repo);
    
    // Refresh diagnostics quota
    renderDiagnosticsQuota();

    if (!traffic.available) {
      container.innerHTML = `<span style="color:var(--red); font-size:11px; font-weight:700;"><i data-lucide="shield-alert" style="width:11px;height:11px;display:inline;"></i> Access Denied: Traffic metrics are restricted to users with write access to this repository.</span>`;
      if (window.lucide) window.lucide.createIcons({ root: container });
      return;
    }

    let referrersHtml = '';
    if (traffic.referrers && traffic.referrers.length > 0) {
      referrersHtml = `
        <div style="margin-top:8px; border-top:1px dashed #ccc; padding-top:6px;">
          <div style="font-weight:800; font-size:10px; text-transform:uppercase; color:var(--text-muted); margin-bottom:4px;">Top Referrers</div>
          ${traffic.referrers.map(r => `<div style="display:flex; justify-content:space-between; font-size:10px; margin-bottom:2px;"><span>${r.source}</span><span><b>${r.count}</b> views (<b>${r.uniques}</b> unique)</span></div>`).join('')}
        </div>
      `;
    }

    container.innerHTML = `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; font-size:11px;">
        <div>Views (14d): <b>${traffic.viewsCount}</b> (<b>${traffic.uniquesCount}</b> unique)</div>
        <div>Clones (14d): <b>${traffic.clonesCount}</b> (<b>${traffic.clonersCount}</b> unique)</div>
      </div>
      ${referrersHtml}
    `;
  } catch (err) {
    container.innerHTML = `<span style="color:var(--red); font-size:11px;">Failed to load traffic stats: ${err.message}</span>`;
  }
};

// Filter, Search, Sort & Paginate repositories listing
window.filterAndRenderRepos = function () {
  const searchInput = document.getElementById('github-repo-search');
  const sortSelect = document.getElementById('github-repo-sort-select');
  const langSelect = document.getElementById('github-repo-lang-select');
  const container = document.getElementById('github-repos-board');
  const pageLabel = document.getElementById('repo-page-label');

  if (!container || !window.githubReposList) return;

  const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const sortBy = sortSelect ? sortSelect.value : 'updated';
  const filterLang = langSelect ? langSelect.value : 'all';

  // 1. Apply Filtering
  let filtered = window.githubReposList.filter(repo => {
    // Search query filter
    const matchesSearch = repo.name.toLowerCase().includes(searchQuery) || 
                          repo.description.toLowerCase().includes(searchQuery);

    // Type filter
    let matchesType = true;
    if (activeRepoFilter === 'original') {
      matchesType = !repo.isFork;
    } else if (activeRepoFilter === 'forked') {
      matchesType = repo.isFork;
    } else if (activeRepoFilter === 'archived') {
      matchesType = repo.isArchived;
    }

    // Language filter
    let matchesLanguage = true;
    if (filterLang !== 'all') {
      matchesLanguage = repo.languages.some(l => l.name === filterLang);
    }

    return matchesSearch && matchesType && matchesLanguage;
  });

  // 2. Apply Sorting
  filtered.sort((a, b) => {
    if (sortBy === 'updated') {
      return new Date(b.pushedAt) - new Date(a.pushedAt);
    } else if (sortBy === 'created') {
      return new Date(b.createdAt) - new Date(a.createdAt);
    } else if (sortBy === 'stars') {
      return b.stars - a.stars;
    } else if (sortBy === 'forks') {
      return b.forks - a.forks;
    } else if (sortBy === 'commits') {
      return (b.commitCount || 0) - (a.commitCount || 0);
    } else if (sortBy === 'size') {
      return b.sizeKb - a.sizeKb;
    } else if (sortBy === 'original') {
      // Original repos first (non-forks), then alphabetical within groups
      if (a.isFork !== b.isFork) return a.isFork ? 1 : -1;
      return a.name.localeCompare(b.name);
    }
    return 0;
  });

  // 3. Paginate
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / reposPerPage));
  
  if (currentRepoPage > totalPages) currentRepoPage = totalPages;
  if (currentRepoPage < 1) currentRepoPage = 1;

  const startIdx = (currentRepoPage - 1) * reposPerPage;
  const pageItems = filtered.slice(startIdx, startIdx + reposPerPage);

  // Render page details
  if (pageLabel) pageLabel.textContent = `Page ${currentRepoPage} of ${totalPages} (${totalItems} total)`;

  // Toggle prev/next buttons
  const prevBtn = document.getElementById('repo-page-prev');
  const nextBtn = document.getElementById('repo-page-next');
  if (prevBtn) prevBtn.disabled = currentRepoPage === 1;
  if (nextBtn) nextBtn.disabled = currentRepoPage === totalPages;

  // 4. Render Repository Cards
  container.innerHTML = '';
  if (pageItems.length === 0) {
    container.innerHTML = '<p style="text-align:center; font-size:12px; color:var(--text-muted); padding:30px 0;">No repositories matched the selected filters.</p>';
    return;
  }

  pageItems.forEach(repo => {
    const card = document.createElement('div');
    card.className = 'repo-card-minimal';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '10px';
    card.style.padding = '16px';
    card.style.borderRadius = '12px';
    card.style.border = '2.5px solid var(--black)';
    card.style.boxShadow = '3px 3px 0 var(--black)';
    card.style.background = 'var(--bg-card)';
    card.style.color = 'var(--text)';
    card.style.position = 'relative';
    card.style.transition = 'transform 0.15s ease, box-shadow 0.15s ease';
    card.onmouseenter = () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = '4px 4px 0 var(--black)'; };
    card.onmouseleave = () => { card.style.transform = ''; card.style.boxShadow = '3px 3px 0 var(--black)'; };

    const sizeMb = (repo.sizeKb / 1024).toFixed(1);
    const languagesStr = repo.languages.slice(0, 2).map(l => l.name).join(' / ') || 'Code';
    const descriptionStr = repo.description.length > 100 ? `${repo.description.substring(0, 100)}...` : repo.description;

    const repoOwner = (repo.owner && typeof repo.owner === 'object' && repo.owner.login) 
      ? repo.owner.login 
      : (typeof repo.owner === 'string' ? repo.owner : (repo.nameWithOwner ? repo.nameWithOwner.split('/')[0] : ''));

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%; gap:12px;">
        <div style="display:flex; flex-direction:column; gap:4px; flex-grow:1;">
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <a href="${repo.url}" onclick="event.preventDefault(); window.openGitHubRepoByName('${repoOwner}', '${repo.name}', '${repo.url}')" style="font-family:Space Grotesk, sans-serif; font-weight:900; font-size:15px; color:var(--text); text-decoration:none; display:inline-flex; align-items:center; gap:4px; cursor:pointer;" title="Click to view repository in-app">
              ${repo.isFork ? '🍴' : '📁'} ${repo.name}
            </a>
            ${repo.isPrivate ? '<span style="font-size:9px; background:var(--red); color:white; border-radius:4px; padding:1px 5px; font-weight:800; text-transform:uppercase; border:1px solid var(--black);">Private</span>' : ''}
            ${repo.isArchived ? '<span style="font-size:9px; background:var(--text-muted); color:white; border-radius:4px; padding:1px 5px; font-weight:800; text-transform:uppercase; border:1px solid var(--black);">Archived</span>' : ''}
          </div>
          <span style="font-size:12px; line-height:1.4; color:var(--text-muted); font-weight:600;">${descriptionStr}</span>
        </div>
        <span class="repo-card-lang" style="flex-shrink:0; background:var(--bg-body); border:1.5px solid var(--black); color:var(--text); font-weight:800; font-size:11px; padding:2px 8px; border-radius:6px;">${languagesStr}</span>
      </div>
      
      <div class="repo-card-stats" style="display:flex; gap:10px; flex-wrap:wrap; font-size:11px; font-weight:800; color:var(--text-muted); border-top:1.5px dashed rgba(255,255,255,0.15); padding-top:8px;">
        <span style="display:inline-flex; align-items:center; gap:3px; background:rgba(255,214,10,0.15); border:1.5px solid var(--black); border-radius:6px; padding:2px 6px; color:var(--text);"><i data-lucide="star" style="width:11px;height:11px;"></i> ${repo.stars}</span>
        <span style="display:inline-flex; align-items:center; gap:3px; background:var(--bg-body); border:1.5px solid var(--black); border-radius:6px; padding:2px 6px; color:var(--text);"><i data-lucide="git-fork" style="width:11px;height:11px;"></i> ${repo.forks}</span>
        <span style="display:inline-flex; align-items:center; gap:3px; background:var(--bg-body); border:1.5px solid var(--black); border-radius:6px; padding:2px 6px; color:var(--text);"><i data-lucide="eye" style="width:11px;height:11px;"></i> ${repo.watchers}</span>
        ${repo.commitCount !== null ? `<span style="display:inline-flex; align-items:center; gap:3px; background:rgba(124,58,237,0.18); border:1.5px solid var(--black); border-radius:6px; padding:2px 6px; color:var(--text);"><i data-lucide="git-commit" style="width:11px;height:11px;"></i> ${repo.commitCount} commits</span>` : ''}
        <span style="display:inline-flex; align-items:center; gap:3px; background:var(--bg-body); border:1.5px solid var(--black); border-radius:6px; padding:2px 6px; color:var(--text);"><i data-lucide="hard-drive" style="width:11px;height:11px;"></i> ${sizeMb} MB</span>
        <span style="display:inline-flex; align-items:center; gap:3px; background:var(--bg-body); border:1.5px solid var(--black); border-radius:6px; padding:2px 6px; color:var(--text);"><i data-lucide="clock" style="width:11px;height:11px;"></i> ${new Date(repo.pushedAt).toLocaleDateString()}</span>
      </div>

      <div style="border-top:1.5px dashed var(--black); padding-top:8px; display:flex; gap:6px; align-items:stretch; margin-top:6px;">
        <button onclick="window.openGitHubRepoByName('${repoOwner}', '${repo.name}', '${repo.url}')" style="flex:1; padding:8px 12px; border:2.5px solid var(--black); border-radius:8px; background:var(--yellow); color:var(--black); font-weight:900; font-size:12px; cursor:pointer; box-shadow:2px 2px 0 var(--black); display:flex; align-items:center; justify-content:center; gap:6px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📖 Open In-App</button>
        <button class="btn-ghost" onclick="window.toggleRepoTraffic('${repoOwner}', '${repo.name}', 'traffic-${repo.id}')" title="Traffic Stats" style="padding:8px 10px; font-size:11px; font-weight:800; border:2.5px solid var(--black); box-shadow:2px 2px 0 var(--black); cursor:pointer; background:var(--bg-card); display:inline-flex; align-items:center; justify-content:center; gap:4px; border-radius:8px; flex-shrink:0;">📊 Stats</button>
        <a href="${repo.url}" target="_blank" rel="noopener" title="Open on GitHub (External Tab) ↗" style="align-self:stretch; width:38px; flex-shrink:0; padding:0; border:2.5px solid var(--black); border-radius:8px; background:var(--bg-card); color:var(--text); text-decoration:none; display:inline-flex; align-items:center; justify-content:center; box-shadow:2px 2px 0 var(--black);" onmouseenter="this.style.background='var(--yellow)';this.style.color='var(--black)';" onmouseleave="this.style.background='var(--bg-card)';this.style.color='var(--text)';"><span style="font-size:18px;font-weight:900;line-height:1;">↗</span></a>
      </div>
      
      <div id="traffic-${repo.id}" style="display:none; margin-top:6px; padding:10px; border:2.5px solid var(--black); border-radius:8px; background:var(--bg-muted); font-size:11px; font-weight:700;">
        Loading traffic details...
      </div>
    `;
    container.appendChild(card);
  });

  if (window.lucide) window.lucide.createIcons({ root: container });
};

// Set repository active type filter from buttons
window.setRepoFilter = function (filterType) {
  activeRepoFilter = filterType;
  currentRepoPage = 1;

  // Toggle active styling on buttons
  const buttons = ['all', 'original', 'forked', 'archived'];
  buttons.forEach(btn => {
    const el = document.getElementById(`repo-filter-${btn}`);
    if (el) {
      el.style.background = btn === filterType ? 'var(--yellow)' : 'var(--bg-card)';
      el.style.color = btn === filterType ? 'var(--black)' : 'var(--text)';
    }
  });

  window.filterAndRenderRepos();
};

// Change repositories active page index
window.changeRepoPage = function (delta) {
  currentRepoPage += delta;
  window.filterAndRenderRepos();
};

// Load fresh GitHub data directly from backend credentials token
async function loadGitHubData(accessToken) {
  githubAccessTokenCached = accessToken;
  window.githubService.setToken(accessToken);

  // ── Stale-While-Revalidate ─────────────────────────────────────
  // 1. Try to render cached data immediately so the UI never shows zeros
  const cached = window.githubService.getCachedData();
  if (cached) {
    renderFullGitHubDashboard(cached);
    showRefreshingBanner(true);      // show subtle "Updating..." indicator
  } else {
    showSkeletonDashboard();         // no cache at all → show skeletons
  }

  // 2. Fetch fresh data silently in the background
  await window.refreshGithubAnalyticsData();
}

// Show a thin non-intrusive banner while fresh data is loading
function showRefreshingBanner(show) {
  let banner = document.getElementById('github-refreshing-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'github-refreshing-banner';
    banner.style.cssText = `
      display:flex; align-items:center; gap:8px;
      background:rgba(100,180,100,0.08); border:1.5px solid rgba(100,180,100,0.3);
      border-radius:8px; padding:7px 14px; font-size:11px; font-weight:700;
      color:var(--text-muted); margin-bottom:14px;
      transition: opacity 0.4s ease;
    `;
    banner.innerHTML = `
      <div class="spinner-ring" style="width:12px;height:12px;border-width:2px;border-color:var(--green) #0000 #0000 #0000;flex-shrink:0;"></div>
      <span>Fetching latest data from GitHub…</span>
    `;
    // Insert before the first github panel
    const firstPanel = document.getElementById('github-panel-overview');
    if (firstPanel && firstPanel.parentNode) {
      firstPanel.parentNode.insertBefore(banner, firstPanel);
    }
  }
  banner.style.display = show ? 'flex' : 'none';
}

// Inject skeleton placeholders across overview panel so nothing looks broken
function showSkeletonDashboard() {
  // Avatar + name skeleton
  const avatarEl = document.getElementById('github-avatar');
  if (avatarEl) {
    avatarEl.style.visibility = 'hidden';
  }
  const usernameEl = document.getElementById('github-username');
  if (usernameEl) {
    usernameEl.innerHTML = '<span class="gh-skeleton" style="width:120px;height:18px;display:inline-block;"></span>';
  }
  const bioEl = document.getElementById('github-bio');
  if (bioEl) {
    bioEl.innerHTML = '<span class="gh-skeleton" style="width:200px;height:13px;display:inline-block;margin-top:4px;"></span>';
  }

  // Streak numbers
  ['github-current-streak','github-longest-streak','github-avg-contribs'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<span class="gh-skeleton" style="width:60px;height:20px;display:inline-block;"></span>';
  });

  // KPI cells
  ['kpi-total-repos','kpi-stars-received','kpi-forks-received','kpi-total-prs','kpi-total-issues','kpi-total-releases'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<span class="gh-skeleton" style="width:40px;height:28px;display:inline-block;"></span>';
  });

  // Metadata rows
  ['meta-location','meta-company','meta-age','meta-website','meta-email'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<span class="gh-skeleton" style="width:90px;height:13px;display:inline-block;"></span>';
  });

  // Contribution graph
  const graphImg = document.getElementById('github-contrib-graph');
  if (graphImg) {
    graphImg.style.visibility = 'hidden';
    graphImg.parentElement.innerHTML += '<div class="gh-skeleton" id="gh-graph-skeleton" style="width:100%;height:90px;border-radius:8px;margin:8px 0;"></div>';
  }

  // Repos board placeholder
  const board = document.getElementById('github-repos-board');
  if (board) {
    board.innerHTML = [1,2,3].map(() => `
      <div style="padding:14px; border-radius:10px; border:1.5px solid rgba(0,0,0,0.08); display:flex; flex-direction:column; gap:8px;">
        <span class="gh-skeleton" style="width:55%;height:15px;display:block;"></span>
        <span class="gh-skeleton" style="width:80%;height:11px;display:block;"></span>
        <div style="display:flex;gap:8px;margin-top:4px;">
          <span class="gh-skeleton" style="width:50px;height:11px;display:inline-block;"></span>
          <span class="gh-skeleton" style="width:60px;height:11px;display:inline-block;"></span>
          <span class="gh-skeleton" style="width:70px;height:11px;display:inline-block;"></span>
        </div>
      </div>
    `).join('');
  }

  showRefreshingBanner(true);
}

// Loads cached data when offline or network fails
function loadCachedOfflineData() {
  const cached = window.githubService.getCachedData();
  const warning = document.getElementById('github-offline-warning');
  const cacheTimeSpan = document.getElementById('github-cache-time');

  if (cached) {
    if (warning) warning.style.display = 'flex';
    if (cacheTimeSpan) {
      const date = new Date(cached.diagnostics.lastUpdate);
      cacheTimeSpan.textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }
    renderFullGitHubDashboard(cached);
    showToast('Offline Mode: Loaded cached GitHub data.', 'warning');
  } else {
    document.getElementById('github-panel-overview').innerHTML = `
      <div style="text-align:center; padding: 60px 20px; font-weight:700; color:var(--text-muted);">
        <i data-lucide="wifi-off" style="width:48px;height:48px;margin:0 auto 12px;color:var(--red);display:block;"></i>
        <h3>Connection Offline</h3>
        <p>No internet connection and no cached GitHub profile data is available. Please check your connectivity and retry.</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  }
}

// Master refresh method that pulls fresh data from APIs, caches them, and updates panels
window.refreshGithubAnalyticsData = async function () {
  if (!githubAccessTokenCached) return;

  const refreshBtn = document.getElementById('github-refresh-btn');
  const refreshIcon = document.getElementById('github-refresh-icon');
  
  if (refreshBtn) refreshBtn.disabled = true;
  if (refreshIcon) refreshIcon.style.animation = 'spin 1.2s infinite linear';

  try {
    const payload = await window.githubService.fetchFullAnalytics();
    
    // Hide offline warning banner since fetch was successful
    const warning = document.getElementById('github-offline-warning');
    if (warning) warning.style.display = 'none';

    // Restore avatar visibility if it was hidden during skeleton
    const avatarEl = document.getElementById('github-avatar');
    if (avatarEl) avatarEl.style.visibility = '';

    renderFullGitHubDashboard(payload);
    showRefreshingBanner(false);
    showToast('GitHub analytics refreshed!', 'success');
  } catch (err) {
    console.error('Error refreshing GitHub analytics:', err);
    showRefreshingBanner(false);
    showToast('Could not refresh GitHub data — showing cached version.', 'warning');
    loadCachedOfflineData();
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
    if (refreshIcon) refreshIcon.style.animation = 'none';
  }
};

// Render full panels dashboard from normalized payload
function renderFullGitHubDashboard(payload) {
  // Save repositories globally for searching/sorting queries
  window.githubReposList = payload.repos;

  // Render individual sub-sections
  renderOverviewPanel(payload);
  renderRepositoriesPanel(payload);
  renderCollabPanel(payload);
  renderDevOpsPanel(payload);
  renderActivityPanel(payload);
  renderDiagnosticsQuota();
}

// 1. Overview Panel Renderer
function renderOverviewPanel(payload) {
  // Bind profile avatar links
  document.getElementById('github-avatar').src = payload.user.avatarUrl;
  document.getElementById('github-username').textContent = payload.user.name;
  document.getElementById('github-bio').textContent = payload.user.bio;
  document.getElementById('github-profile-link').href = payload.user.profileUrl;

  // Streak counters
  document.getElementById('github-current-streak').textContent = `${payload.contributions.currentStreak} days`;
  document.getElementById('github-longest-streak').textContent = `${payload.contributions.longestStreak} days`;
  document.getElementById('github-avg-contribs').textContent = `${payload.contributions.dailyAverage} / day`;
  document.getElementById('github-total-contribs-badge').textContent = `${payload.contributions.totalContributions} contributions`;

  // Heatmap image
  const graphImg = document.getElementById('github-contrib-graph');
  if (graphImg) {
    graphImg.src = `https://ghchart.rshah.org/40c463/${payload.user.login}`;
  }

  // KPIs scores
  document.getElementById('kpi-total-repos').textContent = payload.analytics.totalRepos;
  document.getElementById('kpi-stars-received').textContent = payload.analytics.totalStars;
  document.getElementById('kpi-forks-received').textContent = payload.analytics.totalForks;
  document.getElementById('kpi-total-prs').textContent = payload.prs.totalPrs;
  document.getElementById('kpi-total-issues').textContent = payload.issues.totalIssues;
  document.getElementById('kpi-total-releases').textContent = payload.analytics.totalReleases;

  // Profile Metadata list
  document.getElementById('meta-location').textContent = payload.user.location;
  document.getElementById('meta-company').textContent = payload.user.company;
  
  const website = document.getElementById('meta-website');
  website.textContent = payload.user.websiteUrl;
  if (payload.user.websiteUrl !== 'Not Specified') {
    website.innerHTML = `<a href="${payload.user.websiteUrl.startsWith('http') ? payload.user.websiteUrl : 'http://' + payload.user.websiteUrl}" target="_blank" style="color:var(--purple); text-decoration:none;">${payload.user.websiteUrl} ↗</a>`;
  }
  
  document.getElementById('meta-age').textContent = `${payload.user.accountAgeYears} years`;

  // Email: masked display with eye-icon toggle
  const emailEl = document.getElementById('meta-email');
  if (emailEl) {
    const rawEmail = payload.user.email;
    if (rawEmail) {
      const parts = rawEmail.split('@');
      const masked = parts[0].slice(0, 3) + '•••@' + parts[1];
      // Named global function avoids all inline escaping issues
      window._toggleEmail = function(btn) {
        const span = btn.previousElementSibling;
        const isHidden = btn.dataset.vis === '0';
        span.textContent = isHidden ? rawEmail : masked;
        btn.dataset.vis = isHidden ? '1' : '0';
        // eye-off when visible (click to hide), eye when hidden (click to show)
        btn.innerHTML = isHidden
          ? '<i data-lucide="eye-off" style="width:13px;height:13px;"></i>'
          : '<i data-lucide="eye" style="width:13px;height:13px;"></i>';
        if (window.lucide) window.lucide.createIcons({ root: btn });
      };
      emailEl.innerHTML = `
        <span>${masked}</span>
        <button onclick="window._toggleEmail(this)" data-vis="0" title="Toggle email visibility" style="background:none;border:none;cursor:pointer;padding:2px 3px;color:var(--text-muted);display:inline-flex;align-items:center;border-radius:4px;transition:color 0.15s;" onmouseenter="this.style.color='var(--purple)'" onmouseleave="this.style.color='var(--text-muted)'">
          <i data-lucide="eye" style="width:13px;height:13px;"></i>
        </button>`;
      if (window.lucide) window.lucide.createIcons({ root: emailEl });
    } else {
      emailEl.textContent = 'Not Specified';
    }
  }

  // Social accounts
  const socialsEl = document.getElementById('meta-socials');
  if (socialsEl) {
    const providerIcon = { TWITTER: '🐦', LINKEDIN: '💼', YOUTUBE: '▶', TWITCH: '🟣', GENERIC: '🔗', INSTAGRAM: '📸', FACEBOOK: '📘', MASTODON: '🐘', REDDIT: '🔴' };
    if (payload.user.socialAccounts && payload.user.socialAccounts.length > 0) {
      socialsEl.innerHTML = payload.user.socialAccounts.map(s =>
        `<a href="${s.url}" target="_blank" title="${s.provider}" style="display:inline-flex;align-items:center;gap:4px;color:var(--purple);text-decoration:none;font-size:11px;font-weight:700;background:rgba(100,100,220,0.07);border:1.5px solid rgba(100,100,220,0.25);border-radius:8px;padding:4px 9px;transition:background 0.15s;" onmouseenter="this.style.background='rgba(100,100,220,0.14)'" onmouseleave="this.style.background='rgba(100,100,220,0.07)'">${providerIcon[s.provider] || '🔗'} ${s.displayName}</a>`
      ).join('');
    } else {
      socialsEl.innerHTML = '<span style="color:var(--text-muted);font-size:11px;">No social links added</span>';
    }
  }
}

// 2. Repositories Panel Renderer
function renderRepositoriesPanel(payload) {
  // Populate Language Filter dropdown options
  const langSelect = document.getElementById('github-repo-lang-select');
  if (langSelect) {
    langSelect.innerHTML = '<option value="all">All Languages</option>';
    payload.analytics.languagesDistribution.forEach(lang => {
      const opt = document.createElement('option');
      opt.value = lang.name;
      opt.textContent = `${lang.name} (${lang.repoCount})`;
      langSelect.appendChild(opt);
    });
  }

  // Languages distribution bars card
  const breakdownContainer = document.getElementById('github-languages-breakdown');
  if (breakdownContainer) {
    breakdownContainer.innerHTML = '';
    if (payload.analytics.languagesDistribution.length === 0) {
      breakdownContainer.innerHTML = '<p style="text-align:center; font-size:11px; color:var(--text-muted); padding:20px 0;">No coding languages detected.</p>';
    } else {
      payload.analytics.languagesDistribution.forEach(lang => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.gap = '4px';

        const barColor = lang.color || 'var(--purple)';

        row.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; font-weight:800;">
            <span style="display:inline-flex; align-items:center; gap:5px;">
              <span style="width:8px; height:8px; border-radius:50%; background:${barColor}; display:inline-block;"></span>
              ${lang.name}
            </span>
            <span>${lang.percentage}% (${lang.repoCount} repos)</span>
          </div>
          <div style="width:100%; height:8px; background:var(--bg-muted); border:1.5px solid var(--black); border-radius:4px; overflow:hidden;">
            <div style="width:${lang.percentage}%; height:100%; background:${barColor}; border-radius:3px;"></div>
          </div>
        `;
        breakdownContainer.appendChild(row);
      });
    }
  }

  // Set default sorting parameters and draw cards list
  currentRepoPage = 1;
  activeRepoFilter = 'all';
  
  const sortSelect = document.getElementById('github-repo-sort-select');
  if (sortSelect) sortSelect.value = 'updated';

  const searchInput = document.getElementById('github-repo-search');
  if (searchInput) searchInput.value = '';

  window.setRepoFilter('all');
}

// 3. PRs & Issues Panel Renderer
function renderCollabPanel(payload) {
  // Counts badges
  document.getElementById('github-prs-count-badge').textContent = `${payload.prs.totalPrs} PRs`;
  document.getElementById('github-issues-count-badge').textContent = `${payload.issues.totalIssues} Issues`;

  // PR Merge progress stats
  document.getElementById('pr-merge-rate-value').textContent = `${payload.prs.mergeRate}%`;
  document.getElementById('pr-merge-rate-bar').style.width = `${payload.prs.mergeRate}%`;
  
  document.getElementById('pr-stats-open').textContent = `🟢 ${payload.prs.openCount} Open`;
  document.getElementById('pr-stats-merged').textContent = `💜 ${payload.prs.mergedCount} Merged`;
  document.getElementById('pr-stats-closed').textContent = `🔴 ${payload.prs.closedCount} Closed`;

  // Issues status
  document.getElementById('issue-stats-open').textContent = `${payload.issues.openCount} Open Issues`;
  document.getElementById('issue-stats-closed').textContent = `${payload.issues.closedCount} Closed Issues`;

  // Pull Requests List
  const prsContainer = document.getElementById('github-prs-list');
  if (prsContainer) {
    prsContainer.innerHTML = '';
    if (payload.prs.items.length === 0) {
      prsContainer.innerHTML = '<p style="text-align:center; font-size:11px; color:var(--text-muted); padding:30px 0;">No pull requests authored.</p>';
    } else {
      payload.prs.items.forEach(pr => {
        const item = document.createElement('a');
        item.href = pr.url;
        item.target = '_blank';
        item.className = 'devhub-list-item';
        item.style.textDecoration = 'none';

        let statusText = 'Draft';
        let statusClass = 'background:var(--bg-muted); color:var(--text-muted); border:1px solid var(--black);';
        if (pr.merged) {
          statusText = 'Merged';
          statusClass = 'background:var(--purple); color:white;';
        } else if (pr.state === 'OPEN') {
          statusText = 'Open';
          statusClass = 'background:var(--green); color:white;';
        } else if (pr.state === 'CLOSED') {
          statusText = 'Closed';
          statusClass = 'background:var(--red); color:white;';
        }

        item.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:2px; flex-grow:1; min-width:0;">
            <span class="item-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${pr.title}</span>
            <span class="item-meta">${pr.repository} #${pr.number} • ${new Date(pr.createdAt).toLocaleDateString()}</span>
          </div>
          <span style="font-size:10px; font-weight:800; text-transform:uppercase; border:1.5px solid var(--black); border-radius:5px; padding:2px 6px; box-shadow:1px 1px 0 var(--black); ${statusClass}">${statusText}</span>
        `;
        prsContainer.appendChild(item);
      });
    }
  }

  // Issues List
  const issuesContainer = document.getElementById('github-issues-list');
  if (issuesContainer) {
    issuesContainer.innerHTML = '';
    if (payload.issues.items.length === 0) {
      issuesContainer.innerHTML = '<p style="text-align:center; font-size:11px; color:var(--text-muted); padding:30px 0;">No authored issues found.</p>';
    } else {
      payload.issues.items.forEach(issue => {
        const item = document.createElement('a');
        item.href = issue.url;
        item.target = '_blank';
        item.className = 'devhub-list-item';
        item.style.textDecoration = 'none';

        const isOpen = issue.state === 'OPEN';
        const statusText = isOpen ? 'Open' : 'Closed';
        const statusClass = isOpen ? 'background:var(--green); color:white;' : 'background:var(--text-muted); color:white;';

        const labelsHtml = issue.labels.map(l => `<span style="font-size:9px; background:#${l.color}; color:${_getContrastTextColor(l.color)}; border:1px solid var(--black); border-radius:4px; padding:1px 4px; font-weight:700;">${l.name}</span>`).join(' ');

        item.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:2px; flex-grow:1; min-width:0;">
            <span class="item-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${issue.title}</span>
            <span class="item-meta">${issue.repository} #${issue.number} • ${new Date(issue.createdAt).toLocaleDateString()}</span>
            <div style="margin-top:2px; display:flex; gap:3px; flex-wrap:wrap;">${labelsHtml}</div>
          </div>
          <span style="font-size:10px; font-weight:800; text-transform:uppercase; border:1.5px solid var(--black); border-radius:5px; padding:2px 6px; box-shadow:1px 1px 0 var(--black); ${statusClass}">${statusText}</span>
        `;
        issuesContainer.appendChild(item);
      });
    }
  }
}

// 4. CI/CD & DevOps Panel Renderer
function renderDevOpsPanel(payload) {
  // Clear Actions Workflow runs card view
  const select = document.getElementById('github-actions-repo-select');
  if (select) select.value = '';

  const runsList = document.getElementById('github-actions-runs-list');
  if (runsList) runsList.innerHTML = '<p style="text-align:center; font-size:12px; color:var(--text-muted); padding:30px 0;">Please select a repository above to load workflow runs.</p>';

  // Releases timeline list
  const releasesContainer = document.getElementById('github-releases-list');
  if (releasesContainer) {
    releasesContainer.innerHTML = '';
    if (payload.releases.length === 0) {
      releasesContainer.innerHTML = '<p style="text-align:center; font-size:11px; color:var(--text-muted); padding:20px 0;">No published version releases detected.</p>';
    } else {
      payload.releases.slice(0, 10).forEach(rel => {
        const item = document.createElement('a');
        item.href = rel.url;
        item.target = '_blank';
        item.className = 'devhub-list-item';
        item.style.textDecoration = 'none';

        item.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:2px; flex-grow:1;">
            <span class="item-title">${rel.repo} • <b>${rel.tagName}</b></span>
            <span class="item-meta">${rel.name} • By @${rel.author}</span>
          </div>
          <span style="font-size:10px; font-weight:800; color:var(--text-muted);">${new Date(rel.publishedAt).toLocaleDateString()}</span>
        `;
        releasesContainer.appendChild(item);
      });
    }
  }

  // Deployments timeline list
  const deploymentsContainer = document.getElementById('github-deployments-list');
  if (deploymentsContainer) {
    deploymentsContainer.innerHTML = '';
    if (payload.deployments.length === 0) {
      deploymentsContainer.innerHTML = '<p style="text-align:center; font-size:11px; color:var(--text-muted); padding:20px 0;">No environment deployments detected.</p>';
    } else {
      payload.deployments.slice(0, 10).forEach(dep => {
        const item = document.createElement('div');
        item.className = 'devhub-list-item';
        item.style.pointerEvents = 'none';

        let statusClass = 'background:#ccc; color:#333;';
        if (dep.status === 'ACTIVE' || dep.status === 'success') {
          statusClass = 'background:var(--green); color:white;';
        } else if (dep.status === 'INACTIVE' || dep.status === 'inactive') {
          statusClass = 'background:var(--text-muted); color:white;';
        }

        item.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:2px; flex-grow:1;">
            <span class="item-title">${dep.repo} • <b>${dep.environment}</b></span>
            <span class="item-meta">By @${dep.creator} • ${new Date(dep.createdAt).toLocaleString()}</span>
          </div>
          <span style="font-size:10px; font-weight:800; text-transform:uppercase; border:1.5px solid var(--black); border-radius:5px; padding:2px 6px; box-shadow:1px 1px 0 var(--black); ${statusClass}">${dep.status}</span>
        `;
        deploymentsContainer.appendChild(item);
      });
    }
  }
}

// 5. Activity Panel Renderer
function renderActivityPanel(payload) {
  // Activity Feed Events timeline
  const feedContainer = document.getElementById('github-activity-timeline');
  if (feedContainer) {
    feedContainer.innerHTML = '';
    if (payload.timelineEvents.length === 0) {
      feedContainer.innerHTML = '<p style="text-align:center; font-size:11px; color:var(--text-muted); padding:30px 0;">No recent public activities detected.</p>';
    } else {
      payload.timelineEvents.forEach(ev => {
        const item = document.createElement('a');
        item.href = ev.url;
        item.target = '_blank';
        item.className = 'devhub-list-item';
        item.style.textDecoration = 'none';

        // Select timeline icons
        let iconName = ev.icon || 'activity';

        item.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px; width:100%;">
            <i data-lucide="${iconName}" style="width:16px; height:16px; flex-shrink:0; color:var(--purple);"></i>
            <div style="display:flex; flex-direction:column; gap:2px; flex-grow:1; min-width:0;">
              <span class="item-title" style="font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${ev.description}</span>
              <span class="item-meta">${ev.repo} • ${new Date(ev.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
            <span style="font-size:10px; font-weight:800; color:var(--text-muted); flex-shrink:0;">${new Date(ev.timestamp).toLocaleDateString()}</span>
          </div>
        `;
        feedContainer.appendChild(item);
      });
      if (window.lucide) window.lucide.createIcons({ root: feedContainer });
    }
  }

  // Organizations list cards
  const orgsContainer = document.getElementById('github-orgs-grid');
  if (orgsContainer) {
    orgsContainer.innerHTML = '';
    if (payload.orgs.length === 0) {
      orgsContainer.innerHTML = '<p style="text-align:center; font-size:11px; color:var(--text-muted); padding:30px 0; grid-column:1/-1;">No organization memberships detected.</p>';
    } else {
      payload.orgs.forEach(org => {
        const card = document.createElement('a');
        card.href = org.url;
        card.target = '_blank';
        card.className = 'repo-card-minimal';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'center';
        card.style.textAlign = 'center';
        card.style.padding = '12px 8px';
        card.style.borderRadius = '10px';
        card.style.border = '2.5px solid var(--black)';
        card.style.boxShadow = '3px 3px 0 var(--black)';
        card.style.textDecoration = 'none';

        card.innerHTML = `
          <img src="${org.avatarUrl}" alt="${org.name}" style="width:40px; height:40px; border-radius:8px; border:2px solid var(--black); box-shadow:1.5px 1.5px 0 var(--black); margin-bottom:8px;" />
          <span style="font-weight:900; font-family:Space Grotesk; font-size:11px; color:var(--text); line-height:1.2; word-break:break-word;">${org.name}</span>
          <span style="font-size:9px; color:var(--text-muted); font-weight:600; margin-top:2px; height:24px; overflow:hidden;">${org.description.substring(0, 30)}</span>
        `;
        orgsContainer.appendChild(card);
      });
    }
  }
}

// 6. Diagnostics Quota values display (removed — no longer shown to users)
function renderDiagnosticsQuota() {
  // Intentionally empty — diagnostics panel has been removed from the UI
}

// 2. Google Calendar Data Fetcher
async function loadGoogleCalendarData(accessToken) {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const timeMin = todayStart.toISOString();
    const timeMax = todayEnd.toISOString();

    const calRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!calRes.ok) throw new Error('Failed to fetch events');

    const data = await calRes.json();
    const container = document.getElementById('google-events');
    container.innerHTML = '';

    if (!data.items || data.items.length === 0) {
      container.innerHTML = '<p style="text-align:center; font-size:12px; color:var(--text-muted); padding:10px 0;">No calendar events scheduled for today.</p>';
      return;
    }

    data.items.forEach(event => {
      const start = event.start.dateTime ? new Date(event.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'All Day';
      const item = document.createElement('div');
      item.className = 'devhub-list-item';
      item.style.pointerEvents = 'none'; // simple display
      item.innerHTML = `
        <span class="item-title">${event.summary}</span>
        <span class="item-meta">${start}</span>
      `;
      container.appendChild(item);
    });

  } catch (err) {
    console.error('Google Calendar details fetch error:', err);
    document.getElementById('google-events').innerHTML = '<p style="text-align:center; font-size:12px; color:var(--red); padding:10px 0;">Failed to load events. Re-connect required.</p>';
  }
}

// 3. Medium Data Fetcher & Parser (Client-side XML to JSON)
// Article cache keyed by type+id for reader modal
const _articleCache = new Map();

function parseMediumRSS(xmlText) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const items = doc.querySelectorAll('item');
    return Array.from(items).map(item => {
      const title = item.querySelector('title')?.textContent?.trim() || '';
      const link  = item.querySelector('link')?.textContent?.trim() || '';
      const pubDate = item.querySelector('pubDate')?.textContent || '';

      let creator = '';
      const creatorNode = Array.from(item.childNodes).find(n => n.nodeName.toLowerCase().includes('creator'));
      if (creatorNode) creator = creatorNode.textContent.trim();

      const categories = Array.from(item.querySelectorAll('category')).map(c => c.textContent.trim());

      // Get full HTML content from content:encoded or description
      let contentHtml = '';
      const encodedNode = Array.from(item.childNodes).find(n => n.nodeName.includes('encoded'));
      contentHtml = encodedNode ? encodedNode.textContent : (item.querySelector('description')?.textContent || '');

      // Extract first cover image from content
      const imgMatch = /<img[^>]+src="([^">]+)"/.exec(contentHtml);
      const imageUrl = imgMatch ? imgMatch[1] : '';

      // Extract description: get first <p> that does NOT replicate the title
      let description = '';
      if (contentHtml) {
        const tmp = document.createElement('div');
        tmp.innerHTML = contentHtml;
        const paras = Array.from(tmp.querySelectorAll('p'));
        const cleanTitle = title.replace(/\s+/g, ' ').toLowerCase();
        for (const p of paras) {
          const t = p.textContent.trim();
          if (t.length > 30 && t.toLowerCase().replace(/\s+/g, ' ') !== cleanTitle) {
            description = t.substring(0, 160);
            break;
          }
        }
      }

      return { title, link, imageUrl, description, contentHtml, categories, author: creator || 'Medium Writer', date: pubDate };
    });
  } catch (err) {
    console.error('Error parsing Medium XML:', err);
    return [];
  }
}

async function fetchRawXMLViaProxies(targetUrl) {
  // Proxy 1: Codetabs (direct, fast proxy)
  try {
    const res = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`);
    if (res.ok) {
      const text = await res.text();
      if (text && text.includes('<rss')) {
        console.log('Medium XML fetched successfully via Codetabs');
        return text;
      }
    }
  } catch (e) {
    console.warn('Codetabs proxy failed for Medium, trying Allorigins raw...', e);
  }

  // Proxy 2: Allorigins raw endpoint (directly returns raw text)
  try {
    const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`);
    if (res.ok) {
      const text = await res.text();
      if (text && text.includes('<rss')) {
        console.log('Medium XML fetched successfully via Allorigins raw');
        return text;
      }
    }
  } catch (e) {
    console.warn('Allorigins raw proxy failed for Medium, trying Allorigins JSON...', e);
  }

  // Proxy 3: Allorigins json endpoint (standard JSON wrapped content)
  try {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`);
    if (res.ok) {
      const wrapper = await res.json();
      if (wrapper && wrapper.contents && wrapper.contents.includes('<rss')) {
        console.log('Medium XML fetched successfully via Allorigins JSON');
        return wrapper.contents;
      }
    }
  } catch (e) {
    console.warn('Allorigins JSON proxy failed for Medium', e);
  }

  throw new Error('All CORS proxies failed to retrieve the Medium RSS feed.');
}

async function loadMediumData(username) {
  const backendUrl = getResolvedAPI();

  // Load personal feed
  const personalContainer = document.getElementById('medium-posts');
  if (personalContainer && username) {
    personalContainer.innerHTML = '<p style="text-align:center;font-size:12px;color:var(--text-muted);padding:30px 0;">Loading your publications...</p>';
    try {
      const cleanUsername = username.replace(/^@/, '');
      const res = await fetch(`${backendUrl}/api/proxy/medium-rss?username=${encodeURIComponent(cleanUsername)}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Status ${res.status}`); }
      const xmlText = await res.text();
      if (!xmlText || !xmlText.includes('<rss')) throw new Error('Not XML');
      const articles = parseMediumRSS(xmlText);
      personalContainer.innerHTML = articles.length
        ? articles.map(a => renderArticleCard(a, 'Medium')).join('')
        : '<p style="text-align:center;font-size:12px;color:var(--text-muted);padding:30px 0;">No articles published yet.</p>';
    } catch (err) {
      console.error('Medium personal fetch error:', err);
      personalContainer.innerHTML = `<p style="text-align:center;font-size:12px;color:var(--red);padding:30px 0;">Failed: ${err.message}</p>`;
    }
  }

  await loadMediumPublicFeedFiltered();
}

const _mediumTags = ['programming', 'javascript', 'webdev', 'python', 'artificial-intelligence', 'career', 'data-science'];
let _mediumTagIndex = 0;
let _mediumCurrentTag = '';

window.filterMediumTag = function(tag) {
  _mediumCurrentTag = tag;
  const input = document.getElementById('medium-tag-search-input');
  if (input) input.value = tag;
  loadMediumPublicFeedFiltered(tag);
};

window.searchMediumTag = function() {
  const input = document.getElementById('medium-tag-search-input');
  const tag = input ? input.value.trim().toLowerCase().replace(/#/g, '') : '';
  _mediumCurrentTag = tag;
  loadMediumPublicFeedFiltered(tag);
};

async function loadMediumPublicFeedFiltered(tag = '') {
  const backendUrl = getResolvedAPI();
  const pubContainer = document.getElementById('medium-public-posts');
  if (!pubContainer) return;
  pubContainer.innerHTML = '<p style="text-align:center; font-size:15px; font-weight:800; color:var(--text-muted); padding:50px 0; grid-column:1/-1;">Loading public feed...</p>';
  
  try {
    let targetUrl = `${backendUrl}/api/proxy/medium-rss`;
    if (tag) {
      targetUrl += `?tag=${encodeURIComponent(tag)}`;
    } else {
      const defaultTag = _mediumTags[0];
      _mediumTagIndex = 0;
      targetUrl += `?tag=${encodeURIComponent(defaultTag)}`;
    }

    const res = await fetch(targetUrl);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const xmlText = await res.text();
    if (!xmlText || !xmlText.includes('<rss')) throw new Error('Not XML');
    const articles = parseMediumRSS(xmlText);
    
    if (articles.length) {
      pubContainer.innerHTML = articles.map(a => renderArticleCard(a, 'Medium')).join('');
      if (!tag) {
        // Show load more button for cycling
        pubContainer.insertAdjacentHTML('beforeend', `
          <div id="medium-load-more-wrap" style="grid-column:1/-1; display:flex; justify-content:center; padding:10px 0;">
            <button onclick="loadMoreMediumPublic()" style="padding:8px 24px; font-size:12px; font-weight:800; border:2px solid var(--black,#0a0a0a); border-radius:8px; background:var(--bg-card,#fff); color:var(--text); cursor:pointer; box-shadow:2px 2px 0 var(--black,#0a0a0a); transition:transform 0.1s;">
              Load More
            </button>
          </div>`);
      }
    } else {
      pubContainer.innerHTML = `<p style="text-align:center; font-size:15px; font-weight:800; color:var(--text-muted); padding:50px 0; grid-column:1/-1;">No articles found for tag #${tag}.</p>`;
    }
  } catch (err) {
    console.error('Medium public feed error:', err);
    pubContainer.innerHTML = `<p style="text-align:center; font-size:15px; font-weight:800; color:var(--red); padding:50px 0; grid-column:1/-1;">Failed to load public feed: ${err.message}</p>`;
  }
}

window.loadMoreMediumPublic = async function() {
  const backendUrl = getResolvedAPI();
  _mediumTagIndex = (_mediumTagIndex + 1) % _mediumTags.length;
  const tag = _mediumTags[_mediumTagIndex];
  const pubContainer = document.getElementById('medium-public-posts');
  if (!pubContainer) return;

  // Remove old load-more button
  const oldBtn = document.getElementById('medium-load-more-wrap');
  if (oldBtn) oldBtn.remove();

  const spinner = document.createElement('div');
  spinner.id = 'medium-load-more-wrap';
  spinner.style.cssText = 'grid-column:1/-1; text-align:center; padding:12px; font-size:12px; color:var(--text-muted); font-weight:700;';
  spinner.textContent = 'Loading more...';
  pubContainer.appendChild(spinner);

  try {
    const res = await fetch(`${backendUrl}/api/proxy/medium-rss?tag=${encodeURIComponent(tag)}`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const xmlText = await res.text();
    if (!xmlText || !xmlText.includes('<rss')) throw new Error('Not XML');
    const articles = parseMediumRSS(xmlText);
    spinner.remove();
    if (articles.length) {
      articles.forEach(a => { pubContainer.insertAdjacentHTML('beforeend', renderArticleCard(a, 'Medium')); });
      pubContainer.insertAdjacentHTML('beforeend', `
        <div id="medium-load-more-wrap" style="grid-column:1/-1; display:flex; justify-content:center; padding:10px 0;">
          <button onclick="loadMoreMediumPublic()" style="padding:8px 24px; font-size:12px; font-weight:800; border:2px solid var(--black,#0a0a0a); border-radius:8px; background:var(--bg-card,#fff); color:var(--text); cursor:pointer; box-shadow:2px 2px 0 var(--black,#0a0a0a); transition:transform 0.1s;">
            Load More
          </button>
        </div>`);
    }
  } catch(err) {
    spinner.textContent = 'Failed to load more. Try again.';
    console.error('Load more medium error:', err);
  }
};

window.switchMediumSubTab = function(tab) {
  document.querySelectorAll('#hub-card-medium .github-sub-tab-btn').forEach(btn => btn.classList.remove('active'));
  const btn = document.getElementById(`medium-subtab-${tab}`);
  if (btn) btn.classList.add('active');
  const personalPanel = document.getElementById('medium-personal-panel');
  const publicPanel   = document.getElementById('medium-public-panel');
  if (tab === 'personal') {
    if (personalPanel) personalPanel.style.display = 'block';
    if (publicPanel)   publicPanel.style.display   = 'none';
  } else {
    if (personalPanel) personalPanel.style.display = 'none';
    if (publicPanel)   publicPanel.style.display   = 'block';
  }
};

// 4. Stack Overflow Data Fetcher
async function loadStackOverflowData(userId) {
  try {
    // Fetch profile
    const profileRes = await fetch(`https://api.stackexchange.com/2.3/users/${userId}?site=stackoverflow`);
    if (!profileRes.ok) throw new Error('StackOverflow profile fetch failed');

    const profileJson = await profileRes.json();
    if (!profileJson.items || profileJson.items.length === 0) return;

    const user = profileJson.items[0];
    document.getElementById('so-reputation').textContent = user.reputation.toLocaleString();
    document.getElementById('so-gold-badges').textContent = `🥇 ${user.badge_counts.gold}`;
    document.getElementById('so-silver-badges').textContent = `🥈 ${user.badge_counts.silver}`;
    document.getElementById('so-bronze-badges').textContent = `🥉 ${user.badge_counts.bronze}`;

    // Fetch answers
    const answersRes = await fetch(`https://api.stackexchange.com/2.3/users/${userId}/answers?pagesize=5&order=desc&sort=activity&site=stackoverflow`);
    if (answersRes.ok) {
      const answersJson = await answersRes.json();
      const container = document.getElementById('so-answers');
      container.innerHTML = '';

      if (!answersJson.items || answersJson.items.length === 0) {
        container.innerHTML = '<p style="text-align:center; font-size:11px; color:var(--text-muted);">No recent answer activity found.</p>';
        return;
      }

      // Fetch corresponding question titles to display
      const questionIds = answersJson.items.map(a => a.question_id).join(';');
      const questionsRes = await fetch(`https://api.stackexchange.com/2.3/questions/${questionIds}?site=stackoverflow`);
      if (questionsRes.ok) {
        const questionsJson = await questionsRes.json();
        
        answersJson.items.forEach(answer => {
          const question = questionsJson.items.find(q => q.question_id === answer.question_id);
          if (!question) return;

          const item = document.createElement('a');
          item.href = `https://stackoverflow.com/a/${answer.answer_id}`;
          item.target = '_blank';
          item.className = 'devhub-list-item';
          item.innerHTML = `
            <span class="item-title">${question.title}</span>
            <span class="item-meta">${answer.is_accepted ? '✅ Accepted' : 'Score: ' + answer.score}</span>
          `;
          container.appendChild(item);
        });
      }
    }
  } catch (err) {
    console.error('StackOverflow fetch details error:', err);
  }
}

// Subtab switcher for Stack Overflow
let _soCurrentTag = '';
let _soCurrentPage = 1;

window.switchStackOverflowSubTab = function(tab) {
  document.querySelectorAll('#hub-card-stackoverflow .github-sub-tab-btn').forEach(btn => btn.classList.remove('active'));
  const btn = document.getElementById(`stackoverflow-subtab-${tab}`);
  if (btn) btn.classList.add('active');
  const personalPanel = document.getElementById('stackoverflow-personal-panel');
  const publicPanel   = document.getElementById('stackoverflow-public-panel');
  if (tab === 'personal') {
    if (personalPanel) personalPanel.style.display = 'block';
    if (publicPanel)   publicPanel.style.display   = 'none';
  } else {
    if (personalPanel) personalPanel.style.display = 'none';
    if (publicPanel)   publicPanel.style.display   = 'block';
  }
};

window.filterSOTag = function(tag) {
  _soCurrentTag = tag;
  const input = document.getElementById('so-tag-search-input');
  if (input) input.value = tag;
  loadStackOverflowPublicFeed(tag, 1);
};

window.searchSOTag = function() {
  const input = document.getElementById('so-tag-search-input');
  const tag = input ? input.value.trim().toLowerCase() : '';
  _soCurrentTag = tag;
  loadStackOverflowPublicFeed(tag, 1);
};

async function loadStackOverflowPublicFeed(tag = '', page = 1) {
  _soCurrentTag = tag;
  _soCurrentPage = page;
  const container = document.getElementById('so-public-questions');
  if (!container) return;

  if (page === 1) {
    container.innerHTML = '<p style="text-align:center; font-size:15px; font-weight:800; color:var(--text-muted); padding:50px 0; grid-column:1/-1;">Loading questions...</p>';
  }

  try {
    let url = `https://api.stackexchange.com/2.3/questions?pagesize=9&page=${page}&sort=hot&site=stackoverflow`;
    if (tag) {
      url += `&tagged=${encodeURIComponent(tag)}`;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    const questions = data.items || [];

    const oldBtn = document.getElementById('so-load-more-wrap');
    if (oldBtn) oldBtn.remove();

    if (page === 1) container.innerHTML = '';

    if (questions.length > 0) {
      questions.forEach(q => {
        container.insertAdjacentHTML('beforeend', renderSOQuestionCard(q));
      });

      if (data.has_more) {
        container.insertAdjacentHTML('beforeend', `
          <div id="so-load-more-wrap" style="grid-column:1/-1; display:flex; justify-content:center; padding:10px 0;">
            <button onclick="loadMoreStackOverflowPublic()" style="padding:8px 24px; font-size:12px; font-weight:800; border:2px solid var(--black,#0a0a0a); border-radius:8px; background:var(--bg-card,#fff); color:var(--text); cursor:pointer; box-shadow:2px 2px 0 var(--black,#0a0a0a); transition:transform 0.1s;">
              Load More
            </button>
          </div>`);
      }
    } else {
      if (page === 1) {
        container.innerHTML = `<p style="text-align:center; font-size:15px; font-weight:800; color:var(--text-muted); padding:50px 0; grid-column:1/-1;">No questions found ${tag ? 'for tag #' + tag : ''}.</p>`;
      }
    }
  } catch (err) {
    console.error('Stack Overflow public feed fetch error:', err);
    if (page === 1) {
      container.innerHTML = `<p style="text-align:center; font-size:15px; font-weight:800; color:var(--red); padding:50px 0; grid-column:1/-1;">Failed to load questions: ${err.message}</p>`;
    }
  }
}

window.loadMoreStackOverflowPublic = function() {
  _soCurrentPage++;
  const oldBtn = document.getElementById('so-load-more-wrap');
  if (oldBtn) {
    oldBtn.innerHTML = '<div style="font-size:12px;color:var(--text-muted);font-weight:700;">Loading more...</div>';
  }
  loadStackOverflowPublicFeed(_soCurrentTag, _soCurrentPage);
};

function renderSOQuestionCard(q) {
  const tagsHtml = (q.tags || []).slice(0, 3).map(t =>
    `<button onclick="filterSOTag('${t}')" style="display:inline-block; background:var(--bg-muted); border:1.5px solid var(--black); border-radius:12px; padding:2px 8px; font-size:10px; font-weight:800; color:var(--text); margin-right:4px; margin-bottom:4px; cursor:pointer;">#${t}</button>`
  ).join('');

  const dateStr = q.creation_date ? new Date(q.creation_date * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const ownerName = q.owner ? (q.owner.display_name || 'Anonymous') : 'Anonymous';

  const answerStyle = q.is_answered
    ? 'background:#22c55e;color:#fff;border-color:var(--black);'
    : 'background:rgba(0,0,0,0.06);color:var(--text-muted);';

  // Cache question for reader modal
  const cacheKey = `Stack Overflow__${q.question_id || Math.random()}`;
  _articleCache.set(cacheKey, { ...q, type: 'Stack Overflow', id: q.question_id, url: q.link });
  const safeKey = encodeURIComponent(cacheKey);

  return `
    <div class="article-card-box" style="display:flex;flex-direction:column;border:2.5px solid var(--black);border-radius:14px;overflow:hidden;background:#f8f5ee;box-shadow:3.5px 3.5px 0 var(--black);transition:transform 0.15s ease,box-shadow 0.15s ease;max-width:360px;width:100%;" onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='4.5px 4.5px 0 var(--black)'" onmouseleave="this.style.transform='';this.style.boxShadow='3.5px 3.5px 0 var(--black)'">
      <div style="padding:14px;display:flex;flex-direction:column;gap:8px;flex-grow:1;">
        <!-- Title -->
        <h4 style="margin:0;font-size:13px;font-weight:900;line-height:1.4;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">
          <a href="${q.link}" target="_blank" rel="noopener noreferrer" style="color:var(--text);text-decoration:none;">${q.title}</a>
        </h4>

        <!-- Badges (Score, Answers, Views) -->
        <div style="display:flex;gap:8px;align-items:center;font-size:10px;font-weight:800;margin-top:2px;">
          <span style="padding:2px 7px;border-radius:6px;background:rgba(0,0,0,0.06);color:var(--text);">👍 ${q.score}</span>
          <span style="padding:2px 7px;border-radius:6px;${answerStyle}">${q.is_answered ? '✓ ' : ''}${q.answer_count} answers</span>
          <span style="padding:2px 7px;border-radius:6px;background:rgba(0,0,0,0.06);color:var(--text-muted);">👁 ${q.view_count >= 1000 ? (q.view_count/1000).toFixed(1) + 'k' : q.view_count}</span>
        </div>

        <!-- Tags -->
        ${tagsHtml ? `<div style="margin-top:4px;">${tagsHtml}</div>` : ''}

        <!-- Footer Meta -->
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;font-weight:700;color:var(--text-muted);padding-top:8px;margin-top:auto;border-top:1px dashed rgba(0,0,0,0.08);">
          <span>👤 ${ownerName.slice(0, 20)}</span>
          <span>📅 ${dateStr}</span>
        </div>

        <!-- Action Buttons (Prioritize In-App Reading / Compact Square External ↗ Button) -->
        <div style="display:flex;gap:6px;margin-top:6px;align-items:center;">
          <button onclick="openArticleReader('${safeKey}')" style="flex:1;padding:8px 12px;font-size:12px;font-weight:900;border:2.5px solid var(--black);border-radius:8px;background:var(--yellow);color:var(--black);cursor:pointer;box-shadow:2px 2px 0 var(--black);display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            📖 Read Question
          </button>
          <button onclick="window.promptSaveBookmark('${encodeURIComponent(q.title)}', '${q.link}', 'Stack Overflow', '')" title="Bookmark Question" style="padding:8px 10px;border:2.5px solid var(--black);border-radius:8px;background:var(--bg-card);color:var(--text);cursor:pointer;box-shadow:2px 2px 0 var(--black);font-weight:900;font-size:12px;flex-shrink:0;">
            🔖
          </button>
          <a href="${q.link}" target="_blank" rel="noopener noreferrer" title="Open on Stack Overflow (External Tab) ↗" style="width:36px;height:36px;flex-shrink:0;padding:0;border:2.5px solid var(--black);border-radius:8px;background:var(--bg-card);color:var(--text);cursor:pointer;text-decoration:none;display:flex;align-items:center;justify-content:center;box-shadow:2px 2px 0 var(--black);" onmouseenter="this.style.background='var(--yellow)';this.style.color='var(--black)';" onmouseleave="this.style.background='var(--bg-card)';this.style.color='var(--text)';">
            <span style="font-size:18px;font-weight:900;line-height:1;">↗</span>
          </a>
        </div>
      </div>
    </div>
  `;
}

// Helper to render responsive article cards for Dev.to and Medium
function renderArticleCard(article, type) {
  const tagsList = article.tag_list || article.categories || [];
  const tagsHtml = tagsList.slice(0, 3).map(t => {
    const cleanT = t.replace(/[^a-zA-Z0-9-]/g,'');
    return `<button onclick="filter${type === 'Dev.to' ? 'DevTo' : 'Medium'}Tag('${cleanT}')" style="display:inline-block; background:var(--bg-muted); border:1.5px solid var(--black); border-radius:12px; padding:2px 8px; font-size:10px; font-weight:800; color:var(--text); margin-right:4px; margin-bottom:4px; cursor:pointer;">#${cleanT}</button>`;
  }).join('');

  // For dev.to: only use cover_image (NOT social_image which is auto-generated text art)
  const coverUrl = type === 'Dev.to' ? (article.cover_image || '') : (article.cover_image || article.imageUrl || '');
  const defaultBg = type === 'Medium'
    ? 'linear-gradient(135deg,#0284c7,#0369a1)'
    : 'linear-gradient(135deg,#1e293b,#0f172a)';

  const imageHtml = coverUrl
    ? `<div style="width:100%;aspect-ratio:16/9;background:rgba(0,0,0,0.03);display:flex;align-items:center;justify-content:center;overflow:hidden;border-bottom:1px solid rgba(0,0,0,0.08);"><img src="${coverUrl}" alt="" style="width:100%;height:100%;object-fit:contain;object-position:top center;" loading="lazy" /></div>`
    : `<div style="width:100%;height:80px;background:${defaultBg};display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.7);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${type}</div>`;

  const authorName = article.user ? article.user.name : (article.author || type);
  const publishDate = article.published_at || article.date;
  const dateStr = publishDate ? new Date(publishDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
  const description = article.description || '';

  // Cache article for the reader modal
  const cacheKey = `${type}__${article.id || article.link || article.url || Math.random()}`;
  _articleCache.set(cacheKey, { ...article, type });
  const safeKey = encodeURIComponent(cacheKey);

  return `
    <div class="article-card-box" style="display:flex;flex-direction:column;border:2.5px solid var(--black);border-radius:14px;overflow:hidden;background:#f8f5ee;box-shadow:3.5px 3.5px 0 var(--black);transition:transform 0.15s ease,box-shadow 0.15s ease;max-width:360px;width:100%;" onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='4.5px 4.5px 0 var(--black)'" onmouseleave="this.style.transform='';this.style.boxShadow='3.5px 3.5px 0 var(--black)'">
      ${imageHtml}
      <div style="padding:13px 14px 12px;display:flex;flex-direction:column;gap:6px;flex-grow:1;">
        <h4 style="margin:0;font-size:13px;font-weight:900;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--text);">${article.title}</h4>
        ${description ? `<p style="margin:0;font-size:11px;line-height:1.55;color:var(--text-muted);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${description}</p>` : ''}
        ${tagsHtml ? `<div style="margin-top:1px;">${tagsHtml}</div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;font-weight:700;color:var(--text-muted);padding-top:7px;margin-top:auto;border-top:1px dashed rgba(0,0,0,0.08);">
          <span>👤 ${authorName.slice(0,22)}${authorName.length>22?'…':''}</span>
          <span>📅 ${dateStr}</span>
        </div>
        <!-- Action buttons (Prioritize In-App Reading / Compact Square External ↗ Button) -->
        <div style="display:flex;gap:6px;margin-top:6px;align-items:center;">
          <button onclick="openArticleReader('${safeKey}')" style="flex:1;padding:8px 12px;font-size:12px;font-weight:900;border:2.5px solid var(--black);border-radius:8px;background:var(--yellow);color:var(--black);cursor:pointer;box-shadow:2px 2px 0 var(--black);display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            📖 Read Article
          </button>
          <button onclick="window.promptSaveBookmark('${encodeURIComponent(article.title)}', '${article.url || article.link}', '${type}', '${encodeURIComponent((description||'').slice(0,180))}')" title="Bookmark Article" style="padding:8px 10px;border:2.5px solid var(--black);border-radius:8px;background:var(--bg-card);color:var(--text);cursor:pointer;box-shadow:2px 2px 0 var(--black);font-weight:900;font-size:12px;flex-shrink:0;">
            🔖
          </button>
          <a href="${article.url || article.link}" target="_blank" rel="noopener" title="Open External Article (New Tab) ↗" style="width:36px;height:36px;flex-shrink:0;padding:0;border:2.5px solid var(--black);border-radius:8px;background:var(--bg-card);color:var(--text);cursor:pointer;text-decoration:none;display:flex;align-items:center;justify-content:center;box-shadow:2px 2px 0 var(--black);" onmouseenter="this.style.background='var(--yellow)';this.style.color='var(--black)';" onmouseleave="this.style.background='var(--bg-card)';this.style.color='var(--text)';">
            <span style="font-size:18px;font-weight:900;line-height:1;">↗</span>
          </a>
        </div>
      </div>
    </div>
  `;
}

window.openArticleReader = async function(safeKey) {
  const cacheKey = decodeURIComponent(safeKey);
  const article = _articleCache.get(cacheKey);
  if (!article) return;

  const overlay = document.getElementById('content-viewer-overlay');
  if (overlay) overlay.style.display = 'flex';
  _cvShowLoading();

  const sourceLabel = article.type || article.sourceLabel || (article.source ? article.source.toUpperCase() : 'ARTICLE');
  _cvSetHeader(article.title, sourceLabel, '#f59e0b', article.url || article.link, article);

  const aiBtn = document.getElementById('cv-ai-notes-btn');
  if (aiBtn) aiBtn.style.display = 'none';
  const treeBtn = document.getElementById('cv-tree-toggle-btn');
  if (treeBtn) treeBtn.style.display = 'none';

  const itemToRender = {
    ...article,
    questionId: article.question_id || article.id,
    url: article.url || article.link,
    source: article.type === 'Dev.to' ? 'devto' : (article.type === 'Stack Overflow' ? 'stackoverflow' : (article.source || 'medium'))
  };

  if (article.type === 'Stack Overflow' || article.question_id) {
    await _renderSOViewer(itemToRender);
  } else {
    await _renderArticleViewer(itemToRender);
  }
  setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 150);
};

// Helper: Fetch and render Dev.to comments
async function fetchAndRenderDevToComments(articleId, container) {
  try {
    const backendUrl = getResolvedAPI();
    const res = await fetch(`${backendUrl}/api/proxy/devto?endpoint=/api/comments&a_id=${articleId}`);
    if (!res.ok) return;
    const comments = await res.json();
    if (!Array.isArray(comments) || comments.length === 0) return;

    function buildCommentsHtml(list, depth = 0) {
      return list.map(c => {
        const author = c.user ? c.user.name : 'User';
        const avatar = c.user ? c.user.profile_image : '';
        const date = c.created_at ? new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        const indent = Math.min(depth * 16, 48);

        return `
          <div style="margin-left:${indent}px; margin-top:12px; padding:12px 14px; background:var(--bg-card,#fff); border:1.5px solid rgba(0,0,0,0.08); border-radius:10px; font-size:12px; line-height:1.5; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
              ${avatar ? `<img src="${avatar}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;" />` : '👤'}
              <span style="font-weight:800; color:var(--text);">${author}</span>
              <span style="font-size:10px; color:var(--text-muted);">${date}</span>
            </div>
            <div class="comment-body" style="color:var(--text); font-size:12px;">${c.body_html || ''}</div>
            ${c.children && c.children.length > 0 ? buildCommentsHtml(c.children, depth + 1) : ''}
          </div>
        `;
      }).join('');
    }

    const commentsDiv = document.createElement('div');
    commentsDiv.style.cssText = 'margin-top:32px; padding-top:20px; border-top:2px dashed rgba(0,0,0,0.12);';
    commentsDiv.innerHTML = `
      <h3 style="margin:0 0 16px; font-size:16px; font-weight:900; font-family:Space Grotesk,sans-serif;">
        💬 Discussion (${comments.length})
      </h3>
      ${buildCommentsHtml(comments)}
    `;
    container.appendChild(commentsDiv);
  } catch (err) {
    console.error('Error fetching Dev.to comments:', err);
  }
}

// Helper: Fetch and render Stack Overflow question body and community answers
async function fetchAndRenderSOQuestionAndAnswers(questionId, bodyEl, articleUrl) {
  try {
    // 1. Fetch Question Body
    const qRes = await fetch(`https://api.stackexchange.com/2.3/questions/${questionId}?site=stackoverflow&filter=withbody`);
    if (!qRes.ok) throw new Error(`Status ${qRes.status}`);
    const qData = await qRes.json();
    if (!qData.items || qData.items.length === 0) throw new Error('Question not found');
    const q = qData.items[0];

    // Render Question Body
    bodyEl.innerHTML = `
      <div style="margin-bottom:24px;">
        ${q.body}
      </div>
    `;

    // 2. Fetch Answers
    const aRes = await fetch(`https://api.stackexchange.com/2.3/questions/${questionId}/answers?site=stackoverflow&filter=withbody&sort=votes`);
    if (aRes.ok) {
      const aData = await aRes.json();
      const answers = aData.items || [];

      const answersDiv = document.createElement('div');
      answersDiv.style.cssText = 'margin-top:32px; padding-top:20px; border-top:2px dashed rgba(0,0,0,0.12);';

      let answersHtml = `
        <h3 style="margin:0 0 16px; font-size:16px; font-weight:900; font-family:Space Grotesk,sans-serif;">
          💡 Community Answers (${answers.length})
        </h3>
      `;

      if (answers.length > 0) {
        answersHtml += answers.map(ans => {
          const author = ans.owner ? (ans.owner.display_name || 'Anonymous') : 'Anonymous';
          const avatar = ans.owner ? ans.owner.profile_image : '';
          const date = ans.creation_date ? new Date(ans.creation_date * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
          const isAccepted = ans.is_accepted;
          const badgeBg = isAccepted ? 'background:#22c55e; color:#fff;' : 'background:rgba(0,0,0,0.06); color:var(--text);';

          return `
            <div style="margin-top:16px; padding:16px; background:var(--bg-card,#fff); border:2px solid ${isAccepted ? '#22c55e' : 'rgba(0,0,0,0.1)'}; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; font-size:11px; font-weight:800;">
                <div style="display:flex; align-items:center; gap:8px;">
                  ${avatar ? `<img src="${avatar}" style="width:26px; height:26px; border-radius:50%; object-fit:cover;" />` : '👤'}
                  <span>${author}</span>
                  <span style="font-weight:600; color:var(--text-muted);">· ${date}</span>
                </div>
                <div style="display:flex; gap:6px;">
                  ${isAccepted ? `<span style="padding:3px 9px; border-radius:12px; ${badgeBg}">✓ Accepted Answer</span>` : ''}
                  <span style="padding:3px 9px; border-radius:12px; background:rgba(0,0,0,0.06); color:var(--text);">👍 ${ans.score} votes</span>
                </div>
              </div>
              <div style="font-size:13px; line-height:1.7; color:var(--text); overflow-x:auto;">
                ${ans.body}
              </div>
            </div>
          `;
        }).join('');
      } else {
        answersHtml += `<p style="color:var(--text-muted); font-size:13px;">No answers posted yet for this question.</p>`;
      }

      answersDiv.innerHTML = answersHtml;
      bodyEl.appendChild(answersDiv);
    }
  } catch (err) {
    console.error('Stack Overflow reader fetch error:', err);
    bodyEl.innerHTML = `<p style="color:var(--red)">Failed to load question details (${err.message}). <a href="${articleUrl}" target="_blank">Open on Stack Overflow →</a></p>`;
  }
}

// Helper: Render Medium comments banner
function renderMediumCommentsBanner(container, url) {
  const banner = document.createElement('div');
  banner.style.cssText = 'margin-top:32px; padding:18px; background:rgba(0,0,0,0.03); border:2px dashed rgba(0,0,0,0.12); border-radius:12px; text-align:center;';
  banner.innerHTML = `
    <h4 style="margin:0 0 6px; font-size:14px; font-weight:900; font-family:Space Grotesk,sans-serif;">💬 Medium Responses & Discussion</h4>
    <p style="margin:0 0 12px; font-size:12px; color:var(--text-muted);">Responses and reader discussions for this publication are hosted directly on Medium.com.</p>
    <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-block; padding:8px 18px; font-size:12px; font-weight:800; border:2px solid var(--black); border-radius:8px; background:var(--yellow); color:var(--black); text-decoration:none; box-shadow:2px 2px 0 var(--black);">
      View Responses on Medium ↗
    </a>
  `;
  container.appendChild(banner);
}

window.closeArticleReader = function(e) {
  if (e && e.target !== document.getElementById('article-reader-overlay')) return;
  window.closeArticleReaderBtn();
};

window.closeArticleReaderBtn = function() {
  const overlay = document.getElementById('article-reader-overlay');
  if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = '';
  const bodyEl = document.getElementById('reader-body');
  if (bodyEl) bodyEl.innerHTML = '';
};

// Dev.to internal subtab panel toggler
window.switchDevToSubTab = function (subTabName) {
  document.querySelectorAll('#hub-card-devto .github-sub-tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.getElementById(`devto-subtab-${subTabName}`);
  if (activeBtn) activeBtn.classList.add('active');

  const publicPanel = document.getElementById('devto-public-panel');
  const personalPanel = document.getElementById('devto-personal-panel');
  if (subTabName === 'public') {
    if (publicPanel) publicPanel.style.display = 'block';
    if (personalPanel) personalPanel.style.display = 'none';
  } else {
    if (publicPanel) publicPanel.style.display = 'none';
    if (personalPanel) personalPanel.style.display = 'block';
  }
};

let devtoUsernameCached = null;
let _devtoPubPage = 1;
let _devtoCurrentTag = '';

window.filterDevToTag = function(tag) {
  _devtoCurrentTag = tag;
  const input = document.getElementById('devto-tag-search-input');
  if (input) input.value = tag;
  loadDevToPublicFeedFiltered(tag, 1);
};

window.searchDevToTag = function() {
  const input = document.getElementById('devto-tag-search-input');
  const tag = input ? input.value.trim().toLowerCase().replace(/#/g, '') : '';
  _devtoCurrentTag = tag;
  loadDevToPublicFeedFiltered(tag, 1);
};

async function loadDevToPublicFeedFiltered(tag = '', page = 1) {
  _devtoCurrentTag = tag;
  _devtoPubPage = page;
  const pubContainer = document.getElementById('devto-public-posts');
  if (!pubContainer) return;

  if (page === 1) {
    pubContainer.innerHTML = '<p style="text-align:center; font-size:15px; font-weight:800; color:var(--text-muted); padding:50px 0; grid-column:1/-1;">Loading trending articles...</p>';
  }

  const backendUrl = getResolvedAPI();
  try {
    let endpoint = `/api/articles?per_page=9&page=${page}`;
    if (tag) {
      endpoint += `&tag=${encodeURIComponent(tag)}`;
    }
    const response = await fetch(`${backendUrl}/api/proxy/devto?endpoint=${encodeURIComponent(endpoint)}`);
    if (response.ok) {
      const publicArticles = await response.json();
      const oldBtn = document.getElementById('devto-load-more-wrap');
      if (oldBtn) oldBtn.remove();

      if (page === 1) pubContainer.innerHTML = '';

      if (Array.isArray(publicArticles) && publicArticles.length > 0) {
        publicArticles.forEach(a => { pubContainer.innerHTML += renderArticleCard(a, 'Dev.to'); });
        pubContainer.insertAdjacentHTML('beforeend', `
          <div id="devto-load-more-wrap" style="grid-column:1/-1; display:flex; justify-content:center; padding:10px 0;">
            <button onclick="loadMoreDevToPublicFiltered()" style="padding:8px 24px; font-size:12px; font-weight:800; border:2px solid var(--black,#0a0a0a); border-radius:8px; background:var(--bg-card,#fff); color:var(--text); cursor:pointer; box-shadow:2px 2px 0 var(--black,#0a0a0a);">
              Load More Articles
            </button>
          </div>`);
      } else {
        if (page === 1) {
          pubContainer.innerHTML = `<p style="text-align:center; font-size:15px; font-weight:800; color:var(--text-muted); padding:50px 0; grid-column:1/-1;">No articles found ${tag ? 'for tag #' + tag : ''}.</p>`;
        }
      }
    } else {
      if (page === 1) {
        if (response.status === 404) {
          pubContainer.innerHTML = `<p style="text-align:center; font-size:15px; font-weight:800; color:var(--text-muted); padding:50px 0; grid-column:1/-1;">No articles found ${tag ? 'for tag #' + tag : ''}.</p>`;
        } else {
          pubContainer.innerHTML = `<p style="text-align:center; font-size:15px; font-weight:800; color:var(--red); padding:50px 0; grid-column:1/-1;">Error loading public feed (${response.status})</p>`;
        }
      }
    }
  } catch (err) {
    console.error('Dev.to feed error:', err);
    if (page === 1) {
      pubContainer.innerHTML = `<p style="text-align:center; font-size:15px; font-weight:800; color:var(--red); padding:50px 0; grid-column:1/-1;">Error loading public feed: ${err.message}</p>`;
    }
  }
}

window.loadMoreDevToPublicFiltered = function() {
  _devtoPubPage++;
  const oldBtn = document.getElementById('devto-load-more-wrap');
  if (oldBtn) {
    oldBtn.innerHTML = '<div style="font-size:12px;color:var(--text-muted);font-weight:700;">Loading more...</div>';
  }
  loadDevToPublicFeedFiltered(_devtoCurrentTag, _devtoPubPage);
};

// 5. Dev.to Data Fetcher — routes ALL calls through our own proxy
async function loadDevToData(username) {
  devtoUsernameCached = username;
  const backendUrl = getResolvedAPI();
  try {
    // 1. Fetch public feed
    await loadDevToPublicFeedFiltered('', 1);

    // 2. Fetch user's own articles via backend proxy
    if (username) {
      const personalContainer = document.getElementById('devto-posts');
      if (personalContainer) {
        personalContainer.innerHTML = '<p style="text-align:center;font-size:12px;color:var(--text-muted);padding:20px 0;">Loading your articles...</p>';
        const response = await fetch(`${backendUrl}/api/proxy/devto?endpoint=/api/articles&username=${encodeURIComponent(username)}&per_page=20`);
        if (response.ok) {
          const userArticles = await response.json();
          personalContainer.innerHTML = '';
          if (Array.isArray(userArticles) && userArticles.length > 0) {
            userArticles.forEach(a => { personalContainer.innerHTML += renderArticleCard(a, 'Dev.to'); });
          } else {
            personalContainer.innerHTML = '<p style="text-align:center;font-size:12px;color:var(--text-muted);padding:20px 0;">No articles published yet.</p>';
          }
        } else {
          personalContainer.innerHTML = `<p style="text-align:center;font-size:12px;color:var(--red);padding:20px 0;">Error loading articles (${response.status})</p>`;
        }
      }
    }
  } catch (err) {
    console.error('Dev.to fetch error:', err);
  }
}

// Dev.to Active Feed Refresher
window.refreshDevToActiveFeed = async function () {
  const icon = document.getElementById('devto-refresh-icon');
  if (icon) icon.style.animation = 'spin 1.2s infinite linear';
  
  // Reset tag if search input was cleared by user
  const input = document.getElementById('devto-tag-search-input');
  if (input && input.value.trim() === '') {
    _devtoCurrentTag = '';
  }

  try {
    const publicBtn = document.getElementById('devto-subtab-public');
    const isPublicActive = publicBtn && publicBtn.classList.contains('active');

    if (isPublicActive) {
      await loadDevToPublicFeedFiltered(_devtoCurrentTag, 1);
      showToast('Dev.to feed refreshed!', 'success');
    } else {
      if (devtoUsernameCached) {
        await loadDevToData(devtoUsernameCached);
        showToast('Dev.to profile refreshed!', 'success');
      } else {
        showToast('Dev.to profile is not connected.', 'warn');
      }
    }
  } catch (err) {
    console.error('Error refreshing Dev.to active feed:', err);
    showToast('Failed to refresh Dev.to feed.', 'error');
  } finally {
    if (icon) icon.style.animation = 'none';
  }
};

// Medium Active Feed Refresher
window.refreshMediumActiveFeed = async function () {
  const icon = document.getElementById('medium-refresh-icon');
  if (icon) icon.style.animation = 'spin 1.2s infinite linear';

  // Reset tag if search input was cleared by user
  const input = document.getElementById('medium-tag-search-input');
  if (input && input.value.trim() === '') {
    _mediumCurrentTag = '';
  }

  try {
    const publicBtn = document.getElementById('medium-subtab-public');
    const isPublicActive = publicBtn && publicBtn.classList.contains('active');

    if (isPublicActive) {
      await loadMediumPublicFeedFiltered(_mediumCurrentTag);
      showToast('Medium public feed refreshed!', 'success');
    } else {
      const inputVal = document.getElementById('medium-username');
      const username = inputVal ? inputVal.value.trim() : '';
      if (username) {
        await loadMediumData(username);
        showToast('Medium profile refreshed!', 'success');
      } else {
        showToast('Medium profile is not connected.', 'warn');
      }
    }
  } catch (err) {
    console.error('Error refreshing Medium active feed:', err);
    showToast('Failed to refresh Medium feed.', 'error');
  } finally {
    if (icon) icon.style.animation = 'none';
  }
};

// Stack Overflow Active Feed Refresher
window.refreshStackOverflowActiveFeed = async function () {
  const icon = document.getElementById('stackoverflow-refresh-icon');
  if (icon) icon.style.animation = 'spin 1.2s infinite linear';

  // Reset tag if search input was cleared by user
  const input = document.getElementById('so-tag-search-input');
  if (input && input.value.trim() === '') {
    _soCurrentTag = '';
  }

  try {
    const publicBtn = document.getElementById('stackoverflow-subtab-public');
    const isPublicActive = publicBtn && publicBtn.classList.contains('active');

    if (isPublicActive) {
      await loadStackOverflowPublicFeed(_soCurrentTag, 1);
      showToast('Stack Overflow feed refreshed!', 'success');
    } else {
      const inputVal = document.getElementById('stackoverflow-user-id');
      const userId = inputVal ? inputVal.value.trim() : '';
      if (userId) {
        await loadStackOverflowData(userId);
        showToast('Stack Overflow activity refreshed!', 'success');
      } else {
        showToast('Stack Overflow profile is not connected.', 'warn');
      }
    }
  } catch (err) {
    console.error('Error refreshing Stack Overflow active feed:', err);
    showToast('Failed to refresh Stack Overflow feed.', 'error');
  } finally {
    if (icon) icon.style.animation = 'none';
  }
};

// Helper colors for languages bar
function getRandomColor(lang) {
  const colors = {
    JavaScript: 'var(--yellow)',
    HTML: '#e34c26',
    CSS: '#563d7c',
    Python: '#3572A5',
    TypeScript: '#3178c6',
    PHP: '#4F5D95',
    Ruby: '#701516',
    Java: '#b07219',
    Go: '#00ADD8'
  };
  return colors[lang] || '#a855f7';
}

// ── FEATURE 1: TAB NAVIGATION & INITIALIZATION ─────────────────
let _currentDevHubTab = 'universal';
let _userBookmarks = [];
let _universalSourceFilter = 'all';

window.switchDevHubTab = function(tab) {
  _currentDevHubTab = tab;
  localStorage.setItem('activeDevHubTab', tab);

  // Update tab buttons
  document.querySelectorAll('.devhub-tab-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`devhub-tab-${tab}`);
  if (activeBtn) activeBtn.classList.add('active');

  // Hide all cards
  const cardIds = ['universal', 'toolbox', 'bookmarks', 'studymode', 'github', 'stackoverflow', 'devto', 'medium'];
  cardIds.forEach(id => {
    const card = document.getElementById(`hub-card-${id}`);
    if (card) card.style.display = 'none';
  });

  // Show target card
  const targetCard = document.getElementById(`hub-card-${tab}`);
  if (targetCard) targetCard.style.display = 'block';

  // Trigger lazy loading
  if (tab === 'bookmarks') window.fetchUserBookmarks();
  if (tab === 'studymode') window.loadUserKeyStatus();
};

// ── FEATURE 2: UNIVERSAL SEARCH ENGINE ─────────────────────────
window.filterUniversalSource = function(source) {
  _universalSourceFilter = source;
  document.querySelectorAll('.uni-filter-pill').forEach(btn => {
    btn.classList.remove('active');
    btn.style.background = 'var(--bg-card)';
    btn.style.color = 'var(--text)';
  });
  const activePill = document.getElementById(`uni-filter-${source}`);
  if (activePill) {
    activePill.classList.add('active');
    activePill.style.background = 'var(--yellow)';
    activePill.style.color = 'var(--black)';
  }
  const items = document.querySelectorAll('.uni-result-card');
  items.forEach(item => {
    const itemSource = item.getAttribute('data-source');
    if (source === 'all' || itemSource === source) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
};

window.executeUniversalSearch = async function() {
  const input = document.getElementById('uni-search-input');
  const query = input ? input.value.trim() : '';
  const container = document.getElementById('universal-results-container');
  if (!container) return;

  if (!query) {
    container.innerHTML = '<p style="text-align:center; font-size:15px; font-weight:800; color:var(--text-muted); padding:50px 0; grid-column:1/-1;">Please enter a search topic or keyword above!</p>';
    return;
  }

  container.innerHTML = '<p style="text-align:center; font-size:15px; font-weight:800; color:var(--text-muted); padding:50px 0; grid-column:1/-1;">Searching GitHub, Stack Overflow, Dev.to, Medium & your Saved Bookmarks...</p>';

  const backendUrl = getResolvedAPI();
  const results = [];

  const promises = [
    // 1. GitHub Repositories
    fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=6`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => {
        (data.items || []).forEach(repo => {
          results.push({
            title: repo.full_name || repo.name,
            description: repo.description || 'No description provided.',
            url: repo.html_url,
            author: repo.owner ? repo.owner.login : 'GitHub',
            tags: [repo.language || 'Code'],
            source: 'github',
            sourceLabel: 'GitHub Repo',
            badgeBg: '#1e293b',
            // Extra data for viewer
            repoOwner: repo.owner ? repo.owner.login : '',
            repoName: repo.name,
            stars: repo.stargazers_count || 0,
            forks: repo.forks_count || 0
          });
        });
      }).catch(err => console.warn('Universal GitHub search error:', err)),

    // 2. Stack Overflow Questions
    fetch(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&pagesize=6`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => {
        (data.items || []).forEach(q => {
          results.push({
            title: q.title,
            description: `Answers: ${q.answer_count} | Score: ${q.score} | Views: ${q.view_count}`,
            url: q.link,
            author: q.owner ? q.owner.display_name : 'Stack Overflow',
            tags: q.tags || [],
            source: 'stackoverflow',
            sourceLabel: 'Stack Overflow',
            badgeBg: '#f97316',
            questionId: q.question_id
          });
        });
      }).catch(err => console.warn('Universal SO search error:', err)),

    // 3. Dev.to Articles
    fetch(`${backendUrl}/api/proxy/devto?endpoint=${encodeURIComponent('/api/articles?per_page=6&tag=' + encodeURIComponent(query))}`)
      .then(r => r.ok ? r.json() : [])
      .then(articles => {
        if (Array.isArray(articles)) {
          articles.forEach(a => {
            results.push({
              title: a.title,
              description: a.description || '',
              url: a.url,
              author: a.user ? a.user.name : 'Dev.to',
              tags: a.tag_list || [],
              source: 'devto',
              sourceLabel: 'Dev.to Article',
              badgeBg: '#09090b'
            });
          });
        }
      }).catch(err => console.warn('Universal Dev.to search error:', err)),

    // 4. Medium Articles
    fetch(`${backendUrl}/api/proxy/medium-rss?tag=${encodeURIComponent(query)}`)
      .then(r => r.ok ? r.text() : '')
      .then(xml => {
        if (xml && xml.includes('<rss')) {
          const articles = parseMediumRSS(xml);
          articles.slice(0, 6).forEach(a => {
            results.push({
              title: a.title,
              description: a.description || '',
              url: a.url || a.link,
              author: a.author || 'Medium',
              tags: a.categories || [],
              source: 'medium',
              sourceLabel: 'Medium Article',
              badgeBg: '#0284c7'
            });
          });
        }
      }).catch(err => console.warn('Universal Medium search error:', err)),

    // 5. Saved Bookmarks
    (async () => {
      if (_userBookmarks.length === 0) await window.fetchUserBookmarks();
      const qLower = query.toLowerCase();
      _userBookmarks.forEach(b => {
        const matchesTitle = (b.title || '').toLowerCase().includes(qLower);
        const matchesDesc = (b.description || '').toLowerCase().includes(qLower);
        const matchesTag = (b.tags || []).some(t => t.toLowerCase().includes(qLower));
        if (matchesTitle || matchesDesc || matchesTag) {
          results.push({
            title: b.title,
            description: b.description ? `📝 Saved Note: ${b.description}` : 'Saved in your bookmarks',
            url: b.url,
            author: 'My Bookmarks',
            tags: b.tags || [],
            source: 'bookmarks',
            sourceLabel: 'Saved Bookmark',
            badgeBg: '#a855f7'
          });
        }
      });
    })()
  ];

  await Promise.allSettled(promises);

  container.innerHTML = '';
  if (results.length === 0) {
    container.innerHTML = `<p style="text-align:center; font-size:15px; font-weight:800; color:var(--text-muted); padding:50px 0; grid-column:1/-1;">No results found across developer sources for "${query}". Try another term!</p>`;
    return;
  }

  // Store results globally so viewer can access full data
  window._uniSearchResults = results;

  results.forEach((resItem, idx) => {
    const tagsHtml = (resItem.tags || []).slice(0, 3).map(t =>
      `<span style="display:inline-block; background:var(--bg-muted); border:1.5px solid var(--black); border-radius:12px; padding:2px 8px; font-size:10px; font-weight:800; color:var(--text); margin-right:4px;">#${t}</span>`
    ).join('');

    const cardHtml = `
      <div class="uni-result-card" data-source="${resItem.source}" style="display:flex; flex-direction:column; border:2px solid var(--black); border-radius:12px; padding:14px; background:var(--bg-card); box-shadow:3px 3px 0 var(--black); gap:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:10px; font-weight:900; padding:2px 8px; border-radius:6px; background:${resItem.badgeBg}; color:white; font-family:Space Grotesk,sans-serif;">${resItem.sourceLabel}</span>
          <button onclick="window.bookmarkUniversalResult(${idx})" title="Bookmark Link" class="uni-save-btn" style="padding:5px 12px; border:2px solid var(--black); border-radius:6px; background:var(--bg-card); color:var(--text); cursor:pointer; font-size:11px; font-weight:800; box-shadow:2px 2px 0 var(--black);">Save</button>
        </div>
        <h4 style="margin:0; font-size:13.5px; font-weight:900; line-height:1.4; color:var(--text);">${resItem.title}</h4>
        <p style="margin:0; font-size:11.5px; line-height:1.55; color:var(--text-muted); display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; word-break:break-word; overflow-wrap:anywhere; max-height:4.6em;">${resItem.description}</p>
        ${tagsHtml ? `<div style="margin-top:2px;">${tagsHtml}</div>` : ''}
        <div style="display:flex; gap:6px; margin-top:auto; padding-top:8px; border-top:1px dashed rgba(0,0,0,0.1); align-items:center;">
          <button onclick="window.openContentViewer(${idx})" style="flex:1; padding:8px 12px; border:2.5px solid var(--black); border-radius:8px; background:var(--yellow); color:var(--black); font-weight:900; font-size:12px; cursor:pointer; box-shadow:2px 2px 0 var(--black); display:flex; align-items:center; justify-content:center; gap:6px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📖 Open In-App</button>
          <a href="${resItem.url}" target="_blank" rel="noopener" title="Open External Tab ↗" style="width:36px; height:36px; flex-shrink:0; padding:0; border:2.5px solid var(--black); border-radius:8px; background:var(--bg-card); color:var(--text); text-decoration:none; display:flex; align-items:center; justify-content:center; box-shadow:2px 2px 0 var(--black);" onmouseenter="this.style.background='var(--yellow)';this.style.color='var(--black)';" onmouseleave="this.style.background='var(--bg-card)';this.style.color='var(--text)';"><span style="font-size:18px;font-weight:900;line-height:1;">↗</span></a>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', cardHtml);
  });

  window.filterUniversalSource(_universalSourceFilter);
};

// ── FEATURE 3: DEV TOOLBOX CLIENT-SIDE UTILITIES ───────────────
window.switchToolboxTab = function(tab) {
  document.querySelectorAll('#hub-card-toolbox .github-sub-tab-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`toolbox-tab-${tab}`);
  if (activeBtn) activeBtn.classList.add('active');

  document.querySelectorAll('.toolbox-panel').forEach(p => p.style.display = 'none');
  const activePanel = document.getElementById(`toolbox-panel-${tab}`);
  if (activePanel) activePanel.style.display = 'block';
};

window.copyToolboxOutput = function(targetId) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const val = el.value || el.innerText || '';
  if (!val) { showToast('Nothing to copy!', 'warn'); return; }
  navigator.clipboard.writeText(val);
  showToast('Copied to clipboard!', 'success');
};

window.runJSONPrettify = function() {
  const input = document.getElementById('json-input');
  const output = document.getElementById('json-output');
  const status = document.getElementById('json-status');
  try {
    const parsed = JSON.parse(input.value);
    output.value = JSON.stringify(parsed, null, 2);
    status.textContent = '✓ Valid JSON (Prettified)';
    status.style.color = 'var(--green)';
  } catch (err) {
    status.textContent = '❌ Syntax Error: ' + err.message;
    status.style.color = 'var(--red)';
  }
};

window.runJSONMinify = function() {
  const input = document.getElementById('json-input');
  const output = document.getElementById('json-output');
  const status = document.getElementById('json-status');
  try {
    const parsed = JSON.parse(input.value);
    output.value = JSON.stringify(parsed);
    status.textContent = '✓ Valid JSON (Minified)';
    status.style.color = 'var(--green)';
  } catch (err) {
    status.textContent = '❌ Syntax Error: ' + err.message;
    status.style.color = 'var(--red)';
  }
};

window.runJSONToTS = function() {
  const input = document.getElementById('jsontots-input');
  const output = document.getElementById('jsontots-output');
  try {
    const obj = JSON.parse(input.value);
    
    function getType(val) {
      if (val === null) return 'any';
      if (Array.isArray(val)) {
        if (val.length === 0) return 'any[]';
        return `${getType(val[0])}[]`;
      }
      if (typeof val === 'object') return 'Record<string, any>';
      return typeof val;
    }

    let ts = 'export interface RootObject {\n';
    for (const key in obj) {
      ts += `  ${key}: ${getType(obj[key])};\n`;
    }
    ts += '}';
    output.value = ts;
  } catch (err) {
    output.value = '// Error parsing JSON: ' + err.message;
  }
};

window.runRegexTest = function() {
  const patternVal = document.getElementById('regex-pattern').value;
  const flagsVal = document.getElementById('regex-flags').value || 'gi';
  const textVal = document.getElementById('regex-text').value;
  const output = document.getElementById('regex-output');

  if (!patternVal || !textVal) {
    output.innerHTML = '<span style="color:var(--text-muted);">Enter pattern & test string to view matches...</span>';
    return;
  }

  try {
    const regex = new RegExp(patternVal, flagsVal);
    const matches = [...textVal.matchAll(regex)];
    if (matches.length === 0) {
      output.innerHTML = '<span style="color:var(--red); font-weight:800;">No matches found.</span>';
      return;
    }

    let html = `<div style="color:var(--green); font-weight:800; margin-bottom:8px;">Found ${matches.length} match(es):</div>`;
    matches.forEach((m, idx) => {
      html += `<div style="padding:4px 8px; background:rgba(0,0,0,0.05); border-radius:4px; margin-bottom:4px;">Match #${idx+1}: <strong style="color:var(--purple);">${m[0]}</strong> (Index: ${m.index})</div>`;
    });
    output.innerHTML = html;
  } catch (err) {
    output.innerHTML = `<span style="color:var(--red);">Regex Error: ${err.message}</span>`;
  }
};

window.convertTimestamp = function() {
  const input = document.getElementById('timestamp-input').value.trim();
  const output = document.getElementById('timestamp-output');
  if (!input) return;
  let num = parseInt(input, 10);
  if (isNaN(num)) { output.innerHTML = '<span style="color:var(--red);">Invalid number!</span>'; return; }
  if (num < 10000000000) num *= 1000;
  const date = new Date(num);
  output.innerHTML = `
    <div>📅 Local Time: <strong>${date.toLocaleString()}</strong></div>
    <div>🌐 UTC Time: <strong>${date.toUTCString()}</strong></div>
    <div>⏱ Unix Epoch (sec): <strong>${Math.floor(num/1000)}</strong></div>
    <div>⏱ Unix Epoch (ms): <strong>${num}</strong></div>
  `;
};

window.useCurrentTimestamp = function() {
  const now = Date.now();
  document.getElementById('timestamp-input').value = Math.floor(now/1000);
  window.convertTimestamp();
};

window.runJWTDecode = function() {
  const input = document.getElementById('jwt-input').value.trim();
  const hOut = document.getElementById('jwt-header-out');
  const pOut = document.getElementById('jwt-payload-out');

  try {
    const parts = input.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT structure (must contain 3 parts separated by dots)');
    const header = JSON.parse(atob(parts[0]));
    const payload = JSON.parse(atob(parts[1]));

    hOut.value = JSON.stringify(header, null, 2);
    pOut.value = JSON.stringify(payload, null, 2);
  } catch (err) {
    hOut.value = 'Error: ' + err.message;
    pOut.value = '';
  }
};

window.runBase64Encode = function() {
  const input = document.getElementById('base64-input').value;
  const output = document.getElementById('base64-output');
  try {
    output.value = btoa(unescape(encodeURIComponent(input)));
  } catch (err) {
    output.value = 'Encoding Error: ' + err.message;
  }
};

window.runBase64Decode = function() {
  const input = document.getElementById('base64-input').value.trim();
  const output = document.getElementById('base64-output');
  try {
    output.value = decodeURIComponent(escape(atob(input)));
  } catch (err) {
    output.value = 'Decoding Error: ' + err.message;
  }
};

window.generateUUIDs = function() {
  const count = parseInt(document.getElementById('uuid-count').value || '5', 10);
  const output = document.getElementById('uuid-output');
  const list = [];
  for (let i = 0; i < Math.min(count, 50); i++) {
    if (crypto.randomUUID) {
      list.push(crypto.randomUUID());
    } else {
      list.push('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      }));
    }
  }
  output.value = list.join('\n');
};

window.runURLEncode = function() {
  const input = document.getElementById('url-input').value;
  document.getElementById('url-output').value = encodeURIComponent(input);
};

window.runURLDecode = function() {
  const input = document.getElementById('url-input').value;
  try {
    document.getElementById('url-output').value = decodeURIComponent(input);
  } catch (err) {
    document.getElementById('url-output').value = 'Decode Error: ' + err.message;
  }
};

// ── FEATURE 4: BOOKMARKS & NOTES CRUD ─────────────────────────
window.fetchUserBookmarks = async function() {
  const container = document.getElementById('user-bookmarks-grid');
  const badge = document.getElementById('bookmarks-quota-badge');
  const banner = document.getElementById('bookmark-limit-banner');
  if (!container) return;

  try {
    const backendUrl = getResolvedAPI();
    const token = localStorage.getItem('token');
    const res = await fetch(`${backendUrl}/api/devhub/bookmarks`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    _userBookmarks = data.bookmarks || [];

    if (badge && data.usage) {
      badge.textContent = `${data.usage.count} / ${data.usage.limit} Saved`;
      if (banner) {
        banner.style.display = data.usage.count >= data.usage.limit ? 'flex' : 'none';
      }
    }

    window.renderBookmarksGrid(_userBookmarks);
  } catch (err) {
    console.error('Error fetching bookmarks:', err);
    container.innerHTML = `<p style="text-align:center; font-size:15px; font-weight:800; color:var(--red); padding:50px 0; grid-column:1/-1;">Failed to load bookmarks: ${err.message}</p>`;
  }
};

window.renderBookmarksGrid = function(list) {
  const container = document.getElementById('user-bookmarks-grid');
  if (!container) return;
  container.innerHTML = '';
  window._savedBookmarksList = list || [];

  if (!list || list.length === 0) {
    container.innerHTML = '<p style="text-align:center; font-size:15px; font-weight:800; color:var(--text-muted); padding:50px 0; grid-column:1/-1;">No saved bookmarks found. Click Save on any article or add custom links!</p>';
    return;
  }

  list.forEach((b, bIdx) => {
    const tagsHtml = (b.tags || []).map(t =>
      `<span style="display:inline-block; background:rgba(0,0,0,0.06); border-radius:12px; padding:2px 8px; font-size:10px; font-weight:700; color:var(--purple); margin-right:4px;">#${t}</span>`
    ).join('');

    const dateStr = b.createdAt ? new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const descPreview = b.description ? (b.description.length > 110 ? `${b.description.slice(0, 110)}...` : b.description) : '';

    const itemHtml = `
      <div style="display:flex; flex-direction:column; border:2px solid var(--black); border-radius:12px; padding:14px; background:var(--bg-card); box-shadow:3px 3px 0 var(--black); gap:8px; overflow:hidden; word-break:break-word; max-width:100%;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:10px; font-weight:900; padding:2px 8px; border-radius:6px; background:var(--yellow); color:var(--black); font-family:Space Grotesk,sans-serif;">${b.serviceType || 'Custom'}</span>
          <button onclick="window.deleteBookmark('${b._id}')" title="Delete Bookmark" style="padding:2px 6px; border:1.5px solid var(--red); border-radius:6px; background:none; color:var(--red); font-weight:900; font-size:11px; cursor:pointer;">✕ Delete</button>
        </div>
        <h4 style="margin:0; font-size:14px; font-weight:900; line-height:1.4; word-break:break-word; overflow-wrap:anywhere;">
          <a href="${b.url}" onclick="event.preventDefault(); window.openBookmarkViewer(${bIdx})" style="color:var(--text); text-decoration:none; cursor:pointer;">${b.title}</a>
        </h4>
        ${descPreview ? `<p style="margin:0; font-size:11.5px; line-height:1.5; color:var(--text-muted); background:var(--bg-body); padding:8px; border-radius:6px; border:1px solid rgba(0,0,0,0.08); word-break:break-all; overflow-wrap:anywhere; max-width:100%;">📝 ${descPreview}</p>` : ''}
        ${tagsHtml ? `<div style="margin-top:2px;">${tagsHtml}</div>` : ''}
        <div style="display:flex; gap:6px; margin-top:auto; padding-top:8px; border-top:1px dashed rgba(0,0,0,0.1); align-items:stretch;">
          <button onclick="window.openBookmarkViewer(${bIdx})" style="flex:1; padding:8px 12px; border:2.5px solid var(--black); border-radius:8px; background:var(--yellow); color:var(--black); font-weight:900; font-size:12px; cursor:pointer; box-shadow:2px 2px 0 var(--black); display:flex; align-items:center; justify-content:center; gap:6px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📖 Read Note</button>
          <a href="${b.url}" target="_blank" rel="noopener" title="Open External Tab ↗" style="align-self:stretch; width:38px; flex-shrink:0; padding:0; border:2.5px solid var(--black); border-radius:8px; background:var(--bg-card); color:var(--text); text-decoration:none; display:inline-flex; align-items:center; justify-content:center; box-shadow:2px 2px 0 var(--black);" onmouseenter="this.style.background='var(--yellow)';this.style.color='var(--black)';" onmouseleave="this.style.background='var(--bg-card)';this.style.color='var(--text)';"><span style="font-size:18px;font-weight:900;line-height:1;">↗</span></a>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', itemHtml);
  });
};

window.openBookmarkViewer = function(bIdx) {
  const b = (window._savedBookmarksList || [])[bIdx];
  if (!b) return;
  const item = {
    title: b.title || 'Saved Bookmark',
    description: b.description || '',
    url: b.url || '#',
    source: 'bookmarks',
    sourceLabel: 'My Saved Bookmarks',
    badgeBg: '#ffd60a'
  };
  const overlay = document.getElementById('content-viewer-overlay');
  if (overlay) overlay.style.display = 'flex';
  _cvShowLoading();
  _cvSetHeader(item.title, item.sourceLabel, item.badgeBg, item.url, item);
  const aiBtn = document.getElementById('cv-ai-notes-btn');
  if (aiBtn) aiBtn.style.display = 'none';
  const treeBtn = document.getElementById('cv-tree-toggle-btn');
  if (treeBtn) treeBtn.style.display = 'none';
  _renderArticleViewer(item);
};

window.filterUserBookmarks = function() {
  const input = document.getElementById('bookmarks-search-input');
  const q = input ? input.value.trim().toLowerCase() : '';
  if (!q) { window.renderBookmarksGrid(_userBookmarks); return; }
  const filtered = _userBookmarks.filter(b => {
    return (b.title || '').toLowerCase().includes(q) ||
           (b.description || '').toLowerCase().includes(q) ||
           (b.tags || []).some(t => t.toLowerCase().includes(q));
  });
  window.renderBookmarksGrid(filtered);
};

let _githubSearchTimer = null;
window.onGitHubSearchInput = function(val) {
  if (_githubSearchTimer) clearTimeout(_githubSearchTimer);
  if (!val || val.trim() === '') {
    _githubSearchTimer = setTimeout(() => {
      const container = document.getElementById('github-search-results-grid');
      if (container) {
        container.innerHTML = '<p style="text-align:center; font-size:14px; font-weight:800; color:var(--text-muted); padding:40px 0; grid-column:1/-1;">Type a repository query above or click a tag to search open-source projects on GitHub!</p>';
      }
      window._githubSearchResults = [];
    }, 1000);
  }
};

let _uniSearchTimer = null;
window.onUniversalSearchInput = function(val) {
  if (_uniSearchTimer) clearTimeout(_uniSearchTimer);
  if (!val || val.trim() === '') {
    _uniSearchTimer = setTimeout(() => {
      const container = document.getElementById('universal-results-container');
      if (container) {
        container.innerHTML = '<p style="text-align:center; font-size:15px; font-weight:800; color:var(--text-muted); padding:50px 0; grid-column:1/-1;">Type a topic or keyword above to search all developer sources instantly!</p>';
      }
      window._uniSearchResults = [];
    }, 1000);
  }
};

let _studySearchTimer = null;
window.onStudySearchInput = function(val) {
  if (_studySearchTimer) clearTimeout(_studySearchTimer);
  if (!val || val.trim() === '') {
    _studySearchTimer = setTimeout(() => {
      const container = document.getElementById('study-videos-grid');
      if (container) {
        container.innerHTML = '<p style="text-align:center; font-size:15px; font-weight:800; color:var(--text-muted); padding:50px 0; grid-column:1/-1;">Type a tutorial topic above to discover & stream YouTube study courses!</p>';
      }
      window._studySearchResults = [];
    }, 1000);
  }
};

window.searchGitHubTag = function(tag) {
  const input = document.getElementById('github-global-search-input');
  if (input) input.value = tag;
  window.executeGitHubGlobalSearch();
};

window.executeGitHubGlobalSearch = async function() {
  const input = document.getElementById('github-global-search-input');
  const query = input ? input.value.trim() : '';
  const container = document.getElementById('github-search-results-grid');
  if (!container) return;

  if (!query) {
    container.innerHTML = '<p style="text-align:center; font-size:14px; font-weight:800; color:var(--text-muted); padding:40px 0; grid-column:1/-1;">Please enter a search topic or project name above!</p>';
    return;
  }

  container.innerHTML = '<p style="text-align:center; font-size:14px; font-weight:800; color:var(--text-muted); padding:40px 0; grid-column:1/-1;">Searching GitHub repositories...</p>';

  try {
    const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=30`);
    if (!res.ok) throw new Error(`GitHub API Status ${res.status}`);
    const data = await res.json();
    const repos = data.items || [];

    if (repos.length === 0) {
      container.innerHTML = `<p style="text-align:center; font-size:14px; font-weight:800; color:var(--text-muted); padding:40px 0; grid-column:1/-1;">No GitHub repositories found for "${query}".</p>`;
      return;
    }

    window._githubSearchResults = repos.map(r => ({
      title: `${r.owner.login} / ${r.name}`,
      description: r.description || 'No description provided.',
      url: r.html_url,
      author: r.owner.login,
      stars: r.stargazers_count,
      forks: r.forks_count,
      language: r.language || 'Code',
      source: 'github',
      sourceLabel: 'GitHub',
      badgeBg: '#24292e',
      repoOwner: r.owner.login,
      repoName: r.name
    }));

    container.innerHTML = '';
    window._githubSearchResults.forEach((item, idx) => {
      const cardHtml = `
        <div style="display:flex; flex-direction:column; border:2.5px solid var(--black); border-radius:12px; padding:16px; background:var(--bg-card); box-shadow:4px 4px 0 var(--black); gap:10px; overflow:hidden;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <img src="${item.repoOwner ? 'https://github.com/' + item.repoOwner + '.png?size=40' : ''}" style="width:36px; height:36px; border-radius:50%; border:2px solid var(--black);" onerror="this.style.display='none'" />
              <div>
                <h4 style="margin:0; font-size:14px; font-weight:900; line-height:1.3; color:var(--text); word-break:break-all;">${item.title}</h4>
                <span style="font-size:11px; font-weight:800; color:var(--text-muted);">⭐ ${item.stars.toLocaleString()} stars &nbsp;|&nbsp; 🍴 ${item.forks.toLocaleString()} forks</span>
              </div>
            </div>
            <span style="font-size:10px; font-weight:900; padding:2px 8px; border-radius:6px; background:var(--yellow); color:var(--black); border:1.5px solid var(--black);">${item.language}</span>
          </div>
          <p style="margin:0; font-size:12px; line-height:1.5; color:var(--text-muted); display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; word-break:break-word;">${item.description}</p>
          <div style="display:flex; gap:6px; margin-top:auto; padding-top:10px; border-top:1px dashed rgba(0,0,0,0.12); align-items:center;">
            <button onclick="window.openGitHubSearchResultViewer(${idx})" style="flex:1; padding:8px 12px; border:2.5px solid var(--black); border-radius:8px; background:var(--yellow); color:var(--black); font-weight:900; font-size:12.5px; cursor:pointer; box-shadow:2px 2px 0 var(--black); display:flex; align-items:center; justify-content:center; gap:6px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📖 Open In-App</button>
            <a href="${item.url}" target="_blank" rel="noopener" title="Open on GitHub (External Tab) ↗" style="width:36px; height:36px; flex-shrink:0; padding:0; border:2.5px solid var(--black); border-radius:8px; background:var(--bg-card); color:var(--text); text-decoration:none; display:flex; align-items:center; justify-content:center; box-shadow:2px 2px 0 var(--black);" onmouseenter="this.style.background='var(--yellow)';this.style.color='var(--black)';" onmouseleave="this.style.background='var(--bg-card)';this.style.color='var(--text)';"><span style="font-size:18px;font-weight:900;line-height:1;">↗</span></a>
          </div>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', cardHtml);
    });

  } catch(err) {
    console.error('GitHub global search error:', err);
    container.innerHTML = `<p style="text-align:center; font-size:14px; font-weight:800; color:var(--red); padding:40px 0; grid-column:1/-1;">Error searching GitHub: ${err.message}</p>`;
  }
};

window.openGitHubRepoByName = function(owner, repoName, url, stars = 0, forks = 0) {
  if (!owner || !repoName) {
    if (url && url.includes('github.com')) {
      const parts = url.replace(/\/$/, '').split('/');
      owner = owner || parts[parts.length - 2];
      repoName = repoName || parts[parts.length - 1];
    }
  }
  const syntheticItem = {
    title: `${owner || 'GitHub'} / ${repoName || 'Repository'}`,
    url: url || `https://github.com/${owner}/${repoName}`,
    source: 'github',
    sourceLabel: 'GitHub Repo',
    repoOwner: owner,
    repoName: repoName,
    stars: stars,
    forks: forks
  };
  if (!window._uniSearchResults) window._uniSearchResults = [];
  window._uniSearchResults.push(syntheticItem);
  window.openContentViewer(window._uniSearchResults.length - 1);
};

window.openGitHubSearchResultViewer = function(idx) {
  const item = (window._githubSearchResults || [])[idx];
  if (!item) return;
  if (!window._uniSearchResults) window._uniSearchResults = [];
  window._uniSearchResults.push(item);
  window.openContentViewer(window._uniSearchResults.length - 1);
};

window.detectServiceTypeFromUrl = function(url, defaultType = 'Custom') {
  if (!url) return defaultType || 'Custom';
  const u = url.toLowerCase();
  if (u.includes('github.com')) return 'GitHub';
  if (u.includes('stackoverflow.com') || u.includes('stackexchange.com')) return 'Stack Overflow';
  if (u.includes('dev.to')) return 'Dev.to';
  if (u.includes('medium.com')) return 'Medium';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
  return defaultType || 'Custom';
};

window.autoDetectServiceFromUrlInput = function(url) {
  const serviceSelect = document.getElementById('bm-input-service');
  if (serviceSelect && url) {
    const autoType = window.detectServiceTypeFromUrl(url, 'Custom');
    serviceSelect.value = autoType;
  }
};

window.promptSaveBookmark = function(titleEnc, url, serviceType, descEnc) {
  let title = '';
  let desc = '';
  try { title = decodeURIComponent(titleEnc || ''); } catch(e) { title = titleEnc || ''; }
  try { desc = decodeURIComponent(descEnc || ''); } catch(e) { desc = descEnc || ''; }

  const targetUrl = url || '';
  const autoType = window.detectServiceTypeFromUrl(targetUrl, serviceType || 'Custom');

  document.getElementById('bm-input-title').value = title;
  document.getElementById('bm-input-url').value = targetUrl;
  document.getElementById('bm-input-service').value = autoType;
  document.getElementById('bm-input-desc').value = desc;
  document.getElementById('bm-input-tags').value = '';
  document.getElementById('bookmark-modal-overlay').style.display = 'flex';
};

window.openAddCustomBookmarkModal = function() {
  document.getElementById('bm-input-title').value = '';
  document.getElementById('bm-input-url').value = '';
  document.getElementById('bm-input-service').value = 'Custom';
  document.getElementById('bm-input-desc').value = '';
  document.getElementById('bm-input-tags').value = '';
  document.getElementById('bookmark-modal-overlay').style.display = 'flex';
};

window.closeBookmarkModal = function() {
  document.getElementById('bookmark-modal-overlay').style.display = 'none';
};

window.submitBookmarkModal = async function() {
  const title = document.getElementById('bm-input-title').value.trim();
  const url = document.getElementById('bm-input-url').value.trim();
  const serviceType = document.getElementById('bm-input-service').value;
  const description = document.getElementById('bm-input-desc').value.trim();
  const tags = document.getElementById('bm-input-tags').value.trim();

  if (!title || !url) { showToast('Title and URL are required!', 'warn'); return; }

  try {
    const backendUrl = getResolvedAPI();
    const token = localStorage.getItem('token');
    const res = await fetch(`${backendUrl}/api/devhub/bookmarks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ title, url, serviceType, description, tags })
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.error === 'LIMIT_REACHED') {
        showToast(data.message, 'error');
        window.closeBookmarkModal();
        return;
      }
      throw new Error(data.message || `Status ${res.status}`);
    }

    showToast('Bookmark saved successfully!', 'success');
    window.closeBookmarkModal();
    window.fetchUserBookmarks();
  } catch (err) {
    console.error('Save bookmark error:', err);
    showToast('Failed to save bookmark: ' + err.message, 'error');
  }
};

window.deleteBookmark = async function(id) {
  if (!confirm('Are you sure you want to delete this bookmark?')) return;
  try {
    const backendUrl = getResolvedAPI();
    const token = localStorage.getItem('token');
    const res = await fetch(`${backendUrl}/api/devhub/bookmarks/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    showToast('Bookmark deleted!', 'success');
    window.fetchUserBookmarks();
  } catch (err) {
    console.error('Delete bookmark error:', err);
    showToast('Failed to delete bookmark.', 'error');
  }
};

// ── FEATURE 5: STUDY MODE & AI NOTES ───────────────────────────
window.loadUserKeyStatus = async function() {
  try {
    const backendUrl = getResolvedAPI();
    const token = localStorage.getItem('token');
    const res = await fetch(`${backendUrl}/api/devhub/keys`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const badge = document.getElementById('ai-notes-quota-badge');
    if (badge) {
      if (data.hasCustomGeminiKey) {
        badge.textContent = '✨ Unlimited AI Notes (Custom Key Active)';
      } else {
        badge.textContent = `${data.aiNotesUsed} / ${data.aiNotesQuota} AI Notes Used`;
      }
    }
  } catch (err) {
    console.error('Key status error:', err);
  }
};

window.executeStudySearch = async function() {
  const input = document.getElementById('study-search-input');
  const query = input ? input.value.trim() : '';
  const container = document.getElementById('study-videos-grid');
  if (!container) return;

  if (!query) {
    container.innerHTML = '<p style="text-align:center; font-size:15px; font-weight:800; color:var(--text-muted); padding:50px 0; grid-column:1/-1;">Please enter a tutorial topic or playlist above!</p>';
    return;
  }

  container.innerHTML = '<p style="text-align:center; font-size:15px; font-weight:800; color:var(--text-muted); padding:50px 0; grid-column:1/-1;">Searching YouTube study tutorials...</p>';

  try {
    const backendUrl = getResolvedAPI();
    const token = localStorage.getItem('token');
    const res = await fetch(`${backendUrl}/api/devhub/youtube-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ query })
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.error === 'NO_KEY') {
        container.innerHTML = `<div style="text-align:center; padding:40px 0; grid-column:1/-1;"><p style="font-size:14px; font-weight:800; color:var(--red);">${data.message}</p><button onclick="window.openBYOKeysModal()" style="margin-top:10px; padding:8px 16px; border:2px solid var(--black); border-radius:6px; background:var(--yellow); font-weight:900; cursor:pointer;">🔑 Open API Key Settings</button></div>`;
        return;
      }
      throw new Error(data.message || `Status ${res.status}`);
    }

    const videos = data.videos || [];
    window._studySearchResults = videos;

    container.innerHTML = '';
    if (videos.length === 0) {
      container.innerHTML = '<p style="text-align:center; font-size:15px; font-weight:800; color:var(--text-muted); padding:50px 0; grid-column:1/-1;">No videos found for this topic.</p>';
      return;
    }

    videos.forEach((v, idx) => {
      const videoCard = `
        <div style="display:flex; flex-direction:column; border:2px solid var(--black); border-radius:12px; overflow:hidden; background:var(--bg-card); box-shadow:3px 3px 0 var(--black); gap:8px;">
          <div style="width:100%; aspect-ratio:16/9; position:relative; overflow:hidden; border-bottom:2px solid var(--black);">
            <img src="${v.thumbnail}" alt="" style="width:100%; height:100%; object-fit:cover;" />
            <button onclick="window.playStudyVideo(${idx})" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); padding:10px 16px; border:2.5px solid var(--black); border-radius:30px; background:var(--red); color:white; font-weight:900; font-size:13px; cursor:pointer; box-shadow:3px 3px 0 var(--black); display:flex; align-items:center; gap:6px;">
              ▶ Play Stream
            </button>
          </div>
          <div style="padding:12px; display:flex; flex-direction:column; gap:6px; flex-grow:1;">
            <h4 style="margin:0; font-size:13px; font-weight:900; line-height:1.4; color:var(--text); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${v.title}</h4>
            <span style="font-size:11px; font-weight:800; color:var(--text-muted);">📺 ${v.channelTitle}</span>
            <div style="display:flex; gap:6px; margin-top:auto; padding-top:8px;">
              <button onclick="window.generateAINotesFromIndex(${idx})" style="flex:1; padding:7px 10px; border:2px solid var(--black); border-radius:6px; background:var(--yellow); color:var(--black); font-weight:900; font-size:11px; cursor:pointer; box-shadow:1.5px 1.5px 0 var(--black);">
                ✨ Generate AI Notes
              </button>
              <button onclick="window.bookmarkStudyVideoFromIndex(${idx})" title="Bookmark Video" style="padding:7px 10px; border:2px solid var(--black); border-radius:6px; background:var(--bg-body); font-weight:800; font-size:11px; cursor:pointer; box-shadow:1.5px 1.5px 0 var(--black);">
                🔖
              </button>
            </div>
          </div>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', videoCard);
    });
  } catch (err) {
    console.error('Study search error:', err);
    container.innerHTML = `<p style="text-align:center; font-size:15px; font-weight:800; color:var(--red); padding:50px 0; grid-column:1/-1;">Error loading tutorials: ${err.message}</p>`;
  }
};

window.playStudyVideo = function(idx) {
  const v = (window._studySearchResults || [])[idx];
  if (!v) return;
  const syntheticItem = {
    title: v.title || 'YouTube Tutorial',
    description: v.description || '',
    url: `https://www.youtube.com/watch?v=${v.videoId}`,
    author: v.channelTitle || '',
    source: 'youtube',
    sourceLabel: 'YouTube Tutorial',
    badgeBg: '#ff0000',
    videoId: v.videoId,
    channelTitle: v.channelTitle || ''
  };
  if (!window._uniSearchResults) window._uniSearchResults = [];
  window._uniSearchResults.push(syntheticItem);
  window.openContentViewer(window._uniSearchResults.length - 1);
};

window.generateAINotesFromIndex = function(idx) {
  const v = (window._studySearchResults || [])[idx];
  if (!v) return;
  window.generateAINotesForVideo(v.videoId, encodeURIComponent(v.title || ''), encodeURIComponent(v.description || ''));
};

window.bookmarkStudyVideoFromIndex = function(idx) {
  const v = (window._studySearchResults || [])[idx];
  if (!v) return;
  window.promptSaveBookmark(
    encodeURIComponent(v.title || ''),
    `https://www.youtube.com/watch?v=${v.videoId}`,
    'YouTube',
    encodeURIComponent(v.channelTitle || '')
  );
};

window.closeStudyPlayerModal = function() {
  document.getElementById('study-player-iframe').src = '';
  document.getElementById('study-player-overlay').style.display = 'none';
};

window.generateAINotesForVideo = async function(videoId, titleEnc, descEnc) {
  const videoTitle = decodeURIComponent(titleEnc);
  const videoDescription = decodeURIComponent(descEnc || '');
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  const notesContainer = document.getElementById('cv-yt-notes-container');
  if (notesContainer) {
    notesContainer.style.display = 'flex';
    notesContainer.innerHTML = '<div style="text-align:center; padding:24px; color:var(--text-muted); font-weight:900; font-size:14px;">✨ Generating AI Study Notes for tutorial...</div>';
  }
  showToast('Generating AI Study Notes...', 'info');

  try {
    const backendUrl = getResolvedAPI();
    const token = localStorage.getItem('token');
    const res = await fetch(`${backendUrl}/api/devhub/ai-notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ videoId, videoTitle, videoDescription })
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.error === 'QUOTA_EXCEEDED' || data.error === 'NO_GEMINI_KEY') {
        showToast(data.message, 'error');
        if (notesContainer) {
          notesContainer.innerHTML = `<div style="text-align:center; padding:20px; color:var(--red); font-weight:800;">${data.message}<br/><button onclick="window.openBYOKeysModal()" style="margin-top:12px; padding:8px 16px; border:2px solid var(--black); border-radius:6px; background:var(--yellow); font-weight:900; cursor:pointer;">🔑 Open API Key Settings</button></div>`;
        }
        window.openBYOKeysModal();
        return;
      }
      throw new Error(data.message || `Status ${res.status}`);
    }

    const notesText = data.notes || '';
    window._lastGeneratedAINote = { videoId, videoTitle, videoUrl, notesText };

    const renderedNotesHtml = _mdToHtml(notesText);

    if (notesContainer) {
      notesContainer.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2.5px dashed rgba(0,0,0,0.15); padding-bottom:12px; flex-wrap:wrap; gap:10px;">
          <h3 style="margin:0; font-family:'Space Grotesk',sans-serif; font-size:16px; font-weight:900; color:var(--text); display:flex; align-items:center; gap:6px;">
            ✨ Generated AI Study Notes
          </h3>
          <button onclick="window.copyAINotesText()" style="padding:6px 14px; border:2px solid var(--black); border-radius:6px; background:var(--bg-body); color:var(--text); font-weight:900; font-size:11.5px; cursor:pointer; box-shadow:1.5px 1.5px 0 var(--black);">
            📋 Copy Notes
          </button>
        </div>
        <div id="ai-notes-content" style="font-size:14px; line-height:1.85; color:var(--text); word-break:break-word; overflow-wrap:anywhere;">
          ${renderedNotesHtml}
        </div>
        <div style="display:flex; flex-direction:column; gap:10px; padding-top:16px; border-top:2.5px dashed rgba(0,0,0,0.15); margin-top:12px;">
          <label style="font-size:12px; font-weight:900; text-transform:uppercase; color:var(--text);">💾 Save Note Title & Link:</label>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <input type="text" id="cv-yt-note-title-input" value="${videoTitle.replace(/"/g, '&quot;')}" placeholder="Enter Note Title" style="flex:1; min-width:220px; padding:10px 14px; border:2.5px solid var(--black); border-radius:8px; font-size:13px; font-weight:800; background:var(--bg-body); color:var(--text);" />
            <button onclick="window.saveYTAINoteToBookmarks()" style="padding:10px 22px; border:2.5px solid var(--black); border-radius:8px; background:var(--yellow); color:var(--black); font-weight:900; font-size:13px; cursor:pointer; box-shadow:3px 3px 0 var(--black); display:inline-flex; align-items:center; gap:6px;">
              💾 Save to My Notes
            </button>
          </div>
          <span style="font-size:11.5px; font-weight:800; color:var(--text-muted);">
            🔗 Video Link: <a href="${videoUrl}" target="_blank" rel="noopener" style="color:var(--purple); font-weight:900;">${videoUrl}</a>
          </span>
        </div>
      `;
    }
    showToast('AI Study Notes generated below!', 'success');
    window.loadUserKeyStatus();
  } catch (err) {
    console.error('AI Notes error:', err);
    showToast(`AI Notes Error: ${err.message}`, 'error');
    if (notesContainer) {
      notesContainer.innerHTML = `<div style="text-align:center; padding:16px; color:var(--red); font-weight:800;">Failed to generate notes: ${err.message}</div>`;
    }
  }
};

window.saveYTAINoteToBookmarks = async function() {
  const noteData = window._lastGeneratedAINote;
  if (!noteData) {
    showToast('No generated note found to save.', 'error');
    return;
  }
  const titleInput = document.getElementById('cv-yt-note-title-input');
  const customTitle = titleInput ? titleInput.value.trim() : noteData.videoTitle;
  const fullTitle = customTitle || noteData.videoTitle;
  const videoUrl = noteData.videoUrl;
  const fullNoteText = `${noteData.notesText}\n\n🎥 Video Link: ${videoUrl}`;

  try {
    const backendUrl = getResolvedAPI();
    const token = localStorage.getItem('token');
    const res = await fetch(`${backendUrl}/api/devhub/bookmarks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        title: fullTitle,
        url: videoUrl,
        service: 'YouTube',
        author: noteData.videoTitle,
        note: fullNoteText
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `Status ${res.status}`);
    showToast('AI Note saved to your Bookmarks & Notes collection!', 'success');
    if (window.loadBookmarks) window.loadBookmarks();
  } catch (err) {
    console.error('Save AI Note error:', err);
    showToast(`Save Note Error: ${err.message}`, 'error');
  }
};

window.closeAINotesModal = function() {
  document.getElementById('ai-notes-overlay').style.display = 'none';
};

window.copyAINotesText = function() {
  const content = document.getElementById('ai-notes-content').innerText;
  navigator.clipboard.writeText(content);
  showToast('AI Notes copied to clipboard!', 'success');
};

window.loadUserKeyStatus = async function() {
  try {
    const backendUrl = getResolvedAPI();
    const token = localStorage.getItem('token');
    if (!token) return;
    const res = await fetch(`${backendUrl}/api/devhub/keys`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.customYouTubeKey) {
        localStorage.setItem('customYouTubeApiKey', data.customYouTubeKey);
      } else {
        localStorage.removeItem('customYouTubeApiKey');
      }
      if (data.customGeminiKey) {
        localStorage.setItem('customGeminiApiKey', data.customGeminiKey);
      } else {
        localStorage.removeItem('customGeminiApiKey');
      }
    }
  } catch (err) {
    console.error('Load user key status error:', err);
  }
};

window.deleteBYOKey = async function(service) {
  try {
    const backendUrl = getResolvedAPI();
    const token = localStorage.getItem('token');
    const res = await fetch(`${backendUrl}/api/devhub/keys/${service}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    if (service === 'youtube') {
      const input = document.getElementById('byo-yt-key-input');
      if (input) input.value = '';
      localStorage.removeItem('customYouTubeApiKey');
    } else if (service === 'gemini') {
      const input = document.getElementById('byo-gemini-key-input');
      if (input) input.value = '';
      localStorage.removeItem('customGeminiApiKey');
    }
    showToast(`${service.toUpperCase()} API Key removed successfully!`, 'info');
    window.loadUserKeyStatus();
  } catch (err) {
    console.error('Delete key error:', err);
    showToast(`Failed to remove ${service} API key.`, 'error');
  }
};

window.openBYOKeysModal = async function() {
  try {
    const backendUrl = getResolvedAPI();
    const token = localStorage.getItem('token');
    const res = await fetch(`${backendUrl}/api/devhub/keys`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      const ytInput = document.getElementById('byo-yt-key-input');
      const gemInput = document.getElementById('byo-gemini-key-input');
      if (ytInput) ytInput.value = data.customYouTubeKey || '';
      if (gemInput) gemInput.value = data.customGeminiKey || '';
      if (data.customYouTubeKey) localStorage.setItem('customYouTubeApiKey', data.customYouTubeKey);
      if (data.customGeminiKey) localStorage.setItem('customGeminiApiKey', data.customGeminiKey);
    }
  } catch (err) {
    console.error('Fetch keys error:', err);
  }
  const modal = document.getElementById('byo-keys-overlay');
  if (modal) modal.style.display = 'flex';
};

window.closeBYOKeysModal = function() {
  const modal = document.getElementById('byo-keys-overlay');
  if (modal) modal.style.display = 'none';
};

window.saveBYOKeys = async function() {
  const customYouTubeApiKey = document.getElementById('byo-yt-key-input').value.trim();
  const customGeminiApiKey = document.getElementById('byo-gemini-key-input').value.trim();

  try {
    const backendUrl = getResolvedAPI();
    const token = localStorage.getItem('token');
    const res = await fetch(`${backendUrl}/api/devhub/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ customYouTubeApiKey, customGeminiApiKey })
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);

    if (customYouTubeApiKey) localStorage.setItem('customYouTubeApiKey', customYouTubeApiKey);
    else localStorage.removeItem('customYouTubeApiKey');

    if (customGeminiApiKey) localStorage.setItem('customGeminiApiKey', customGeminiApiKey);
    else localStorage.removeItem('customGeminiApiKey');

    showToast('API Keys saved successfully! Permanent access active.', 'success');
    window.closeBYOKeysModal();
    window.loadUserKeyStatus();
  } catch (err) {
    console.error('Save keys error:', err);
    showToast('Failed to save API keys.', 'error');
  }
};

// Check redirection params on DOM load
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const connectedService = params.get('connected');
  if (connectedService) {
    showToast(`Successfully linked ${connectedService.toUpperCase()}!`, 'success');
    
    // Clean URL
    const url = new URL(window.location);
    url.searchParams.delete('connected');
    url.searchParams.delete('tab');
    window.history.replaceState({}, document.title, url);
    
    // Switch to devhub
    setTimeout(() => {
      if (typeof window.showPage === 'function') {
        window.showPage('devhub');
      }
    }, 100);
  }
});

// ── UNIVERSAL CONTENT VIEWER ─────────────────────────────────────
function _cvShowLoading() {
  document.getElementById('cv-loading').style.display = 'flex';
  document.getElementById('cv-content').style.display = 'none';
  document.getElementById('cv-youtube').style.display = 'none';
  document.getElementById('cv-sidebar').style.display = 'none';
}
function _cvShowContent() {
  document.getElementById('cv-loading').style.display = 'none';
  document.getElementById('cv-content').style.display = 'block';
  document.getElementById('cv-youtube').style.display = 'none';
}
function _cvShowYoutube() {
  document.getElementById('cv-loading').style.display = 'none';
  document.getElementById('cv-content').style.display = 'none';
  document.getElementById('cv-youtube').style.display = 'flex';
}
function _cvSetHeader(title, sourceLabel, badgeBg, url, item) {
  const tEl = document.getElementById('cv-title');
  if (tEl) tEl.textContent = title || '';
  const badge = document.getElementById('cv-source-badge');
  if (badge) {
    badge.textContent = sourceLabel || '';
    badge.style.background = badgeBg || '#1e293b';
  }
  const extLink = document.getElementById('cv-ext-link');
  if (extLink) {
    extLink.href = url || '#';
    const isGitHub = (item && item.source === 'github');
    extLink.style.display = isGitHub ? 'inline-flex' : 'none';
  }
  const bmBtn = document.getElementById('cv-bookmark-btn');
  if (bmBtn) {
    const isAlreadyBookmark = (item && (item.source === 'bookmarks' || (item.sourceLabel || '').toLowerCase().includes('bookmark')));
    bmBtn.style.display = isAlreadyBookmark ? 'none' : 'inline-flex';
    bmBtn.onclick = () => window.promptSaveBookmark(
      encodeURIComponent(title || ''), url || '', sourceLabel || 'Custom', encodeURIComponent(((item && item.description) || '').slice(0, 180))
    );
  }
}

window.bookmarkUniversalResult = function(idx) {
  const item = (window._uniSearchResults || [])[idx];
  if (!item) return;
  window.promptSaveBookmark(
    encodeURIComponent(item.title || ''),
    item.url || '',
    item.sourceLabel || 'Custom',
    encodeURIComponent((item.description || '').slice(0, 180))
  );
};
function _mdToHtml(md) {
  if (!md) return '';
  return md
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
      '<pre style="background:var(--bg-card);border:2px solid var(--black);border-radius:8px;padding:12px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;font-family:monospace;font-size:12px;line-height:1.6;max-width:100%;"><code>' + code.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</code></pre>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.07);padding:2px 5px;border-radius:3px;font-family:monospace;font-size:12px;word-break:break-all;">$1</code>')
    .replace(/^#{4}\s(.+)$/gm, '<h4 style="font-size:15px;font-weight:900;margin:20px 0 6px;font-family:Space Grotesk,sans-serif;word-break:break-word;">$1</h4>')
    .replace(/^#{3}\s(.+)$/gm, '<h3 style="font-size:18px;font-weight:900;margin:24px 0 8px;font-family:Space Grotesk,sans-serif;word-break:break-word;">$1</h3>')
    .replace(/^#{2}\s(.+)$/gm, '<h2 style="font-size:22px;font-weight:900;margin:28px 0 10px;font-family:Space Grotesk,sans-serif;word-break:break-word;">$1</h2>')
    .replace(/^#{1}\s(.+)$/gm, '<h1 style="font-size:25px;font-weight:900;margin:30px 0 12px;font-family:Space Grotesk,sans-serif;word-break:break-word;">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;height:auto;border-radius:8px;margin:8px 0;display:block;" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--purple);text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">$1</a>')
    .replace(/^[-*]\s(.+)$/gm, '<li style="margin:4px 0;word-break:break-word;">$1</li>')
    .replace(/^>\s(.+)$/gm, '<blockquote style="border-left:4px solid var(--yellow);padding:8px 14px;margin:12px 0;background:rgba(0,0,0,0.04);border-radius:0 6px 6px 0;word-break:break-word;"><em>$1</em></blockquote>')
    .replace(/\n\n/g, '</p><p style="margin:10px 0;line-height:1.75;word-break:break-word;">')
    .replace(/\n/g, '<br/>');
}
window.openContentViewer = async function(idx) {
  const item = (window._uniSearchResults || [])[idx];
  if (!item) return;
  const overlay = document.getElementById('content-viewer-overlay');
  if (overlay) overlay.style.display = 'flex';
  _cvShowLoading();
  _cvSetHeader(item.title, item.sourceLabel, item.badgeBg, item.url, item);
  const aiBtn = document.getElementById('cv-ai-notes-btn');
  if (aiBtn) aiBtn.style.display = 'none';
  const treeBtn = document.getElementById('cv-tree-toggle-btn');
  if (treeBtn) treeBtn.style.display = (item.source === 'github') ? 'inline-flex' : 'none';

  if (item.source === 'youtube') {
    await _renderYouTubeViewer(item);
  } else if (item.source === 'github') {
    await _renderGitHubViewer(item);
  } else if (item.source === 'stackoverflow') {
    await _renderSOViewer(item);
  } else {
    await _renderArticleViewer(item);
  }
  setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 150);
};
window.closeContentViewer = function() {
  const overlay = document.getElementById('content-viewer-overlay');
  if (overlay) overlay.style.display = 'none';
  const iframe = document.getElementById('cv-yt-iframe');
  if (iframe) iframe.src = '';
  const sb = document.getElementById('cv-sidebar');
  if (sb) sb.style.display = 'none';
  const treeBtn = document.getElementById('cv-tree-toggle-btn');
  if (treeBtn) treeBtn.style.display = 'none';
};
async function _renderYouTubeViewer(item) {
  const iframe = document.getElementById('cv-yt-iframe');
  if (iframe) iframe.src = `https://www.youtube.com/embed/${item.videoId}?autoplay=1&playsinline=1&enablejsapi=1&rel=0`;
  const titleEl = document.getElementById('cv-yt-title');
  if (titleEl) titleEl.textContent = item.title || '';
  const chEl = document.getElementById('cv-yt-channel');
  if (chEl) chEl.textContent = '📺 ' + (item.channelTitle || item.author || 'YouTube');

  const notesContainer = document.getElementById('cv-yt-notes-container');
  if (notesContainer) {
    notesContainer.style.display = 'none';
    notesContainer.innerHTML = '';
  }

  const metaEl = document.getElementById('cv-yt-meta');
  if (metaEl) {
    metaEl.innerHTML =
      (item.description ? '<p style="margin:0 0 10px 0; font-size:12.5px; line-height:1.6; color:var(--text-muted); text-align:center; max-height:110px; overflow-y:auto; word-break:break-word;">' + item.description + '</p>' : '') +
      '<div style="display:flex; justify-content:center; align-items:center;">' +
        '<button onclick="window.generateAINotesForVideo(\'' + item.videoId + '\',\'' + encodeURIComponent(item.title) + '\',\'' + encodeURIComponent(item.description||'') + '\')" style="padding:10px 24px; border:2.5px solid var(--black); border-radius:10px; background:var(--yellow); color:var(--black); font-weight:900; font-size:13px; cursor:pointer; box-shadow:3px 3px 0 var(--black); display:inline-flex; align-items:center; gap:6px;">✨ Generate AI Study Notes</button>' +
      '</div>';
  }
  _cvShowYoutube();
}
window._toggleCVSidebar = function() {
  const sb = document.getElementById('cv-sidebar');
  const btn = document.getElementById('cv-sidebar-toggle-btn');
  const headerBtn = document.getElementById('cv-tree-toggle-btn');
  if (!sb) return;
  const isHidden = (window.getComputedStyle(sb).display === 'none' || sb.style.display === 'none');
  if (isHidden) {
    sb.style.display = 'block';
    if (btn) btn.textContent = '◀ Hide';
    if (headerBtn) headerBtn.textContent = '✕ Files';
  } else {
    sb.style.display = 'none';
    if (btn) btn.textContent = '▶ Tree';
    if (headerBtn) headerBtn.textContent = '📁 Files';
  }
};

window._toggleTreeFolder = function(dirIdx) {
  const childContainer = document.getElementById('tree-folder-children-' + dirIdx);
  const arrowEl = document.getElementById('tree-folder-arrow-' + dirIdx);
  if (!childContainer) return;
  if (childContainer.style.display === 'none') {
    childContainer.style.display = 'block';
    if (arrowEl) arrowEl.textContent = '▼';
  } else {
    childContainer.style.display = 'none';
    if (arrowEl) arrowEl.textContent = '▶';
  }
};

window._closeGitHubFileView = function() {
  const fileDisplay = document.getElementById('cv-file-content-display');
  const readmeContainer = document.getElementById('cv-readme-container');
  if (fileDisplay) fileDisplay.style.display = 'none';
  if (readmeContainer) readmeContainer.style.display = 'block';
};

async function _renderGitHubViewer(item) {
  const owner = item.repoOwner;
  const repo = item.repoName;
  const content = document.getElementById('cv-content');
  const sidebar = document.getElementById('cv-sidebar');
  const fileTree = document.getElementById('cv-filetree');
  sidebar.style.display = 'block';
  fileTree.innerHTML = '<span style="color:var(--text-muted);font-size:11px;font-weight:800;">Loading repository tree...</span>';

  let readmeHtml = '';

  try {
    const readmeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`);
    if (readmeRes.ok) {
      const readmeData = await readmeRes.json();
      let rawMarkdown = '';
      if (readmeData.download_url) {
        try {
          const rawFetch = await fetch(readmeData.download_url);
          if (rawFetch.ok) rawMarkdown = await rawFetch.text();
        } catch(e) {}
      }
      if (!rawMarkdown && readmeData.content) {
        try {
          const cleanB64 = readmeData.content.replace(/\s/g, '');
          const binaryStr = atob(cleanB64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          rawMarkdown = new TextDecoder('utf-8').decode(bytes);
        } catch(e) {
          console.error('B64 decode error:', e);
        }
      }
      const renderedHtml = _mdToHtml(rawMarkdown || 'No readable README content found.');
      readmeHtml = `
        <div style="border:3.5px solid var(--black);border-radius:14px;padding:24px;background:var(--bg-card);box-shadow:6px 6px 0 var(--black);max-width:100%;box-sizing:border-box;word-break:break-word;overflow-wrap:anywhere;">
          <h3 style="margin:0 0 16px 0;font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:900;display:flex;align-items:center;gap:8px;border-bottom:2.5px dashed rgba(0,0,0,0.12);padding-bottom:12px;">
            <span>📋 README.md</span>
          </h3>
          <div class="github-readme-body">${renderedHtml}</div>
        </div>
      `;
    } else {
      readmeHtml = `
        <div style="border:3px dashed var(--black);border-radius:14px;padding:36px;text-align:center;background:var(--bg-card);box-shadow:4px 4px 0 var(--black);">
          <div style="font-size:32px;margin-bottom:8px;">📁</div>
          <h3 style="margin:0 0 6px 0;font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:900;">Repository File Explorer</h3>
          <p style="margin:0;font-size:13px;color:var(--text-muted);font-weight:700;">No README found in this repository. Select any file from the sidebar tree on the left to view its source code.</p>
        </div>
      `;
    }
  } catch(e) {
    readmeHtml = `<div style="padding:32px;border:3px solid var(--black);border-radius:14px;background:var(--bg-card);color:var(--red);font-weight:800;">Could not load README: ${e.message}</div>`;
  }

  content.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding:18px 24px;border:3px solid var(--black);border-radius:14px;background:var(--bg-card);box-shadow:4px 4px 0 var(--black);flex-wrap:wrap;gap:12px;">
      <div style="display:flex;align-items:center;gap:14px;">
        <img src="https://github.com/${owner}.png?size=56" style="width:52px;height:52px;border-radius:50%;border:3px solid var(--black);box-shadow:2px 2px 0 var(--black);" onerror="this.style.display='none'" />
        <div>
          <h2 style="margin:0;font-family:Space Grotesk,sans-serif;font-size:22px;font-weight:900;color:var(--text);">${owner} / ${repo}</h2>
          <span style="font-size:12px;font-weight:800;color:var(--text-muted);display:flex;align-items:center;gap:12px;margin-top:4px;">
            <span>⭐ ${item.stars || 0} Stars</span>
            <span>🍴 ${item.forks || 0} Forks</span>
          </span>
        </div>
      </div>
      <a href="${item.url}" target="_blank" rel="noopener" style="padding:8px 16px;border:2.5px solid var(--black);border-radius:8px;background:var(--yellow);color:var(--black);font-weight:900;font-size:12.5px;text-decoration:none;box-shadow:2.5px 2.5px 0 var(--black);">View on GitHub ↗</a>
    </div>

    <!-- Code File Viewer (Replaces README when a file is clicked) -->
    <div id="cv-file-content-display" style="display:none;background:var(--bg-card);border:3px solid var(--black);border-radius:14px;padding:20px;margin-bottom:24px;box-shadow:4px 4px 0 var(--black);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:12px;border-bottom:2.5px dashed rgba(0,0,0,0.12);flex-wrap:wrap;gap:10px;">
        <span style="font-size:12.5px;font-weight:900;padding:5px 12px;border-radius:6px;background:var(--yellow);color:var(--black);font-family:monospace;border:2px solid var(--black);max-width:100%;min-width:0;word-break:break-all;white-space:normal;overflow-wrap:anywhere;flex:1;">📄 <span id="cv-file-path"></span></span>
        <button onclick="window._closeGitHubFileView()" style="padding:6px 14px;border:2.5px solid var(--black);border-radius:8px;background:var(--bg-body);color:var(--text);font-weight:900;font-size:12px;cursor:pointer;box-shadow:2px 2px 0 var(--black);flex-shrink:0;">← Back to Overview</button>
      </div>
      <pre id="cv-file-code" style="font-family:monospace;font-size:12.5px;line-height:1.65;overflow-x:auto;white-space:pre;margin:0;max-height:540px;overflow-y:auto;background:var(--bg-body);padding:16px;border:2px solid var(--black);border-radius:8px;color:var(--text);"></pre>
    </div>

    <!-- README Container -->
    <div id="cv-readme-container">
      ${readmeHtml}
    </div>
  `;

  _cvShowContent();

  // Load Tree
  try {
    const treeRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/git/trees/HEAD?recursive=1');
    if (treeRes.ok) {
      const treeData = await treeRes.json();
      const items = (treeData.tree || []).filter(f => f.type === 'blob').slice(0, 250);
      const grouped = {};
      items.forEach(f => {
        const parts = f.path.split('/');
        const dirKey = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
        if (!grouped[dirKey]) grouped[dirKey] = [];
        grouped[dirKey].push({ name: parts[parts.length - 1], path: f.path });
      });

      let treeHtml = '';
      (grouped[''] || []).forEach(f => {
        treeHtml += `
          <div onclick="window._viewGitHubFile('${owner}','${repo}','${f.path}')" style="padding:4px 8px;cursor:pointer;border-radius:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;word-break:break-all;color:var(--text-muted);font-weight:700;margin:1px 0;transition:all 0.1s;" onmouseenter="this.style.background='var(--yellow)';this.style.color='var(--black)';" onmouseleave="this.style.background='';this.style.color='var(--text-muted)';" title="${f.path}">
            📄 ${f.name}
          </div>
        `;
      });

      Object.keys(grouped).filter(k => k !== '').sort().forEach((dir, dirIdx) => {
        treeHtml += `
          <div onclick="window._toggleTreeFolder(${dirIdx})" style="font-weight:900;font-size:11px;color:var(--text);margin-top:10px;margin-bottom:2px;padding:5px 8px;background:rgba(124,58,237,0.12);border-left:3.5px solid var(--purple,#7c3aed);border-radius:4px;display:flex;align-items:center;gap:6px;letter-spacing:0.3px;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;word-break:break-all;" title="${dir}">
            <span id="tree-folder-arrow-${dirIdx}" style="font-size:10px;flex-shrink:0;">▼</span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📁 ${dir}</span>
          </div>
          <div id="tree-folder-children-${dirIdx}" style="display:block;">
        `;
        (grouped[dir] || []).forEach(f => {
          treeHtml += `
            <div onclick="window._viewGitHubFile('${owner}','${repo}','${f.path}')" style="padding:4px 8px 4px 18px;cursor:pointer;border-radius:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;word-break:break-all;color:var(--text-muted);font-weight:700;margin:1px 0;transition:all 0.1s;" onmouseenter="this.style.background='var(--yellow)';this.style.color='var(--black)';" onmouseleave="this.style.background='';this.style.color='var(--text-muted)';" title="${f.path}">
              📄 ${f.name}
            </div>
          `;
        });
        treeHtml += `</div>`;
      });

      fileTree.innerHTML = treeHtml;
    } else {
      fileTree.innerHTML = '<span style="color:var(--red);font-size:11px;font-weight:800;">Could not load file tree.</span>';
    }
  } catch(e) {
    fileTree.innerHTML = `<span style="color:var(--red);font-size:11px;font-weight:800;">Error: ${e.message}</span>`;
  }
}

window._viewGitHubFile = async function(owner, repo, path) {
  const display = document.getElementById('cv-file-content-display');
  const readmeContainer = document.getElementById('cv-readme-container');
  const pathEl = document.getElementById('cv-file-path');
  const codeEl = document.getElementById('cv-file-code');

  if (!display) return;

  // HIDE README and SHOW File view
  if (readmeContainer) readmeContainer.style.display = 'none';
  display.style.display = 'block';

  pathEl.textContent = path;
  codeEl.textContent = 'Loading file code...';

  document.getElementById('cv-main').scrollTo({ top: 0, behavior: 'smooth' });

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.encoding === 'base64') {
      codeEl.textContent = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
    } else {
      codeEl.textContent = 'Binary file — preview not supported.';
    }
  } catch(e) {
    codeEl.textContent = `Error loading file: ${e.message}`;
  }
};
async function _renderSOViewer(item) {
  const content = document.getElementById('cv-content');
  const qId = item.questionId;
  if (!qId) {
    content.innerHTML = '<div style="padding:40px;text-align:center;"><a href="' + item.url + '" target="_blank" rel="noopener" style="font-weight:800;color:var(--purple);">Open on Stack Overflow &#8599;</a></div>';
    _cvShowContent(); return;
  }
  content.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);font-weight:800;">Loading Q&amp;A...</div>';
  _cvShowContent();
  try {
    const qRes = await fetch('https://api.stackexchange.com/2.3/questions/' + qId + '?site=stackoverflow&filter=withbody');
    const qData = await qRes.json();
    const q = (qData.items||[])[0];
    if (!q) throw new Error('Not found');
    const aRes = await fetch('https://api.stackexchange.com/2.3/questions/' + qId + '/answers?site=stackoverflow&filter=withbody&order=desc&sort=votes&pagesize=10');
    const aData = await aRes.json();
    const answers = aData.items||[];
    const tagsHtml = (q.tags||[]).map(t => '<span style="display:inline-block; background:var(--yellow,#f59e0b); border:1.5px solid #000000; border-radius:12px; padding:3px 10px; font-size:11px; font-weight:900; color:#000000 !important; margin-right:5px; margin-bottom:4px; box-shadow:1px 1px 0 #000000;">#'+t+'</span>').join('');
    let answersHtml = answers.length===0 ? '<p style="color:var(--text-muted);font-weight:800;text-align:center;padding:24px;">No answers yet.</p>' : '';
    answers.forEach(a => {
      const accepted = a.is_accepted ? '<span style="font-size:11px;font-weight:900;background:#22c55e;color:#fff;padding:2px 8px;border-radius:6px;margin-left:8px;">&#10003; Accepted</span>' : '';
      answersHtml += '<div style="border:2px solid ' + (a.is_accepted?'#22c55e':'rgba(0,0,0,0.1)') + ';border-radius:10px;padding:18px;margin-bottom:14px;background:var(--bg-card);">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">' +
          '<span style="font-size:13px;font-weight:900;background:rgba(0,0,0,0.06);padding:3px 10px;border-radius:6px;">&#9650; ' + a.score + '</span>' +
          '<span style="font-size:12px;font-weight:700;color:var(--text-muted);">by ' + (a.owner?a.owner.display_name:'Anonymous') + '</span>' + accepted +
        '</div>' +
        '<div style="font-size:13.5px;line-height:1.75;color:var(--text);">' + (a.body||'') + '</div></div>';
    });
    content.innerHTML =
      '<div style="margin-bottom:24px;padding-bottom:18px;border-bottom:3px solid var(--black);">' +
        '<h1 style="font-family:Space Grotesk,sans-serif;font-size:22px;font-weight:900;margin:0 0 10px 0;line-height:1.4;">' + q.title + '</h1>' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
          '<span style="font-size:12px;font-weight:800;background:rgba(0,0,0,0.06);padding:3px 10px;border-radius:6px;">&#9650; ' + q.score + '</span>' +
          '<span style="font-size:12px;font-weight:800;background:rgba(0,0,0,0.06);padding:3px 10px;border-radius:6px;">&#128172; ' + q.answer_count + ' answers</span>' +
          '<span style="font-size:12px;font-weight:800;background:rgba(0,0,0,0.06);padding:3px 10px;border-radius:6px;">&#128065; ' + (q.view_count>=1000?(q.view_count/1000).toFixed(1)+'k':q.view_count) + ' views</span>' +
        '</div>' +
        '<div style="margin-top:10px;">' + tagsHtml + '</div>' +
      '</div>' +
      '<div style="border:2.5px solid var(--black);border-radius:12px;padding:20px;background:var(--bg-card);margin-bottom:24px;">' +
        '<div style="font-size:13px;font-weight:900;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">&#10067; Question</div>' +
        '<div style="font-size:14px;line-height:1.75;color:var(--text);">' + (q.body||'') + '</div>' +
        '<div style="margin-top:14px;font-size:11px;color:var(--text-muted);font-weight:700;">Asked by ' + (q.owner?q.owner.display_name:'Anonymous') + '</div>' +
      '</div>' +
      '<h3 style="font-family:Space Grotesk,sans-serif;font-size:18px;font-weight:900;margin:0 0 14px 0;">&#128172; ' + answers.length + ' Answers</h3>' +
      answersHtml;
  } catch(e) {
    content.innerHTML = '<div style="text-align:center;padding:40px;"><p style="font-size:14px;font-weight:800;color:var(--red);">Could not load Q&A: ' + e.message + '</p><a href="' + item.url + '" target="_blank" rel="noopener" style="font-weight:800;color:var(--purple);">Open on Stack Overflow &#8599;</a></div>';
  }
}
async function _renderArticleViewer(item) {
  const content = document.getElementById('cv-content');
  content.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);font-weight:800;">Loading article...</div>';
  _cvShowContent();
  const backendUrl = getResolvedAPI();
  let articleBody = item.contentHtml || item.content || item.body_markdown || item.body || '', coverUrl = item.imageUrl || item.cover_image || '', authorName = item.author||'', publishDate = item.date || item.published_at || '';
  try {
    if (item.source === 'devto' && item.url && !articleBody) {
      const parts = item.url.replace(/\/$/, '').split('/');
      const slug = parts[parts.length-1];
      const username = parts[parts.length-2];
      if (slug && username && username !== 'dev.to') {
        const res = await fetch(backendUrl + '/api/proxy/devto?endpoint=' + encodeURIComponent('/api/articles/' + username + '/' + slug));
        if (res.ok) {
          const data = await res.json();
          articleBody = data.body_markdown || data.body_html || '';
          coverUrl = coverUrl || data.cover_image || '';
          publishDate = publishDate || data.published_at || '';
          authorName = authorName || (data.user ? data.user.name : item.author);
        }
      }
    }
  } catch(e) { console.warn('Article fetch:', e); }

  const isMedium = (item.source === 'medium' || (item.sourceLabel || '').toLowerCase().includes('medium') || (item.url || '').includes('medium.com'));
  const dateStr = publishDate ? new Date(publishDate).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : '';
  const tagsList = item.tag_list || item.categories || item.tags || [];
  const tagsHtml = tagsList.length > 0 ? ('<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:10px;">' + tagsList.slice(0, 6).map(t => '<span style="display:inline-block; background:var(--yellow,#f59e0b); border:1.5px solid #000000; border-radius:12px; padding:3px 10px; font-size:11px; font-weight:900; color:#000000 !important; box-shadow:1px 1px 0 #000000;">#'+String(t).replace(/[^a-zA-Z0-9]/g,'')+'</span>').join('') + '</div>') : '';

  const bodyToRender = articleBody || item.description || '';
  let renderedBodyHtml = (bodyToRender.includes('<p>') || bodyToRender.includes('<div') || bodyToRender.includes('<span') || bodyToRender.includes('<figure'))
    ? bodyToRender
    : _mdToHtml(bodyToRender);

  // Strictly deduplicate leading image if coverUrl is shown or for Medium articles
  if ((coverUrl || isMedium) && renderedBodyHtml) {
    const tmp = document.createElement('div');
    tmp.innerHTML = renderedBodyHtml;
    // Remove all leading figure/img tags before body text so photo is never duplicated
    const leadImgs = tmp.querySelectorAll('figure, img');
    leadImgs.forEach((el, idx) => {
      if (idx < 2) {
        const parentFig = el.closest('figure');
        if (parentFig) parentFig.remove();
        else el.remove();
      }
    });
    renderedBodyHtml = tmp.innerHTML;
  }

  const mediumNotice = isMedium ? `
    <div style="margin-top:28px; padding:20px; border:3px solid var(--black); border-radius:12px; background:#fff3c4; box-shadow:4px 4px 0 var(--black); text-align:center;">
      <div style="font-size:15px; font-weight:900; color:#000; margin-bottom:6px;">📖 Medium Feed Notice</div>
      <p style="font-size:13px; font-weight:700; color:#4b5563; margin-bottom:14px; line-height:1.5;">
        Medium RSS feeds provide a preview snippet for publication & member articles. Click below to read the full story directly on Medium!
      </p>
      <a href="${item.url || item.link || '#'}" target="_blank" rel="noopener" style="display:inline-flex; align-items:center; justify-content:center; gap:6px; padding:10px 24px; border:2.5px solid var(--black); border-radius:8px; background:var(--yellow); color:#000000; font-weight:900; font-size:13px; text-decoration:none; box-shadow:2.5px 2.5px 0 var(--black);">
        Continue Reading Full Story on Medium ↗
      </a>
    </div>
  ` : '';

  const openOriginalBtn = isMedium ? '' : `
    <div style="text-align:center;margin-top:28px;padding-top:20px;border-top:2px dashed rgba(0,0,0,0.1);">
      <a href="${item.url || item.link || '#'}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:12px 30px;border:3px solid var(--black);border-radius:10px;background:var(--yellow);color:#0f172a;font-weight:900;font-size:14px;font-family:Space Grotesk,sans-serif;text-decoration:none;box-shadow:3.5px 3.5px 0 var(--black);white-space:nowrap;">Open Original Article ↗</a>
    </div>
  `;

  content.innerHTML =
    '<div style="background:var(--bg-card);border:2.5px solid var(--black);border-radius:14px;padding:32px;box-shadow:4px 4px 0 var(--black);overflow:hidden;word-break:break-word;overflow-wrap:anywhere;">' +
      (coverUrl ? '<img src="' + coverUrl + '" alt="" style="width:100%;max-height:360px;object-fit:cover;border-radius:10px;border:2px solid var(--black);margin-bottom:24px;" />' : '') +
      '<h1 style="font-family:Space Grotesk,sans-serif;font-size:24px;font-weight:900;margin:0 0 16px 0;line-height:1.35;color:var(--text);text-align:center;word-break:break-word;overflow-wrap:anywhere;">' + item.title + '</h1>' +
      '<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:16px;padding-bottom:16px;border-bottom:2.5px dashed rgba(0,0,0,0.12);flex-wrap:wrap;">' +
        '<span style="font-size:13px;font-weight:800;color:var(--text-muted);">&#128100; ' + authorName + '</span>' +
        (dateStr ? '<span style="font-size:13px;font-weight:800;color:var(--text-muted);">&#128197; ' + dateStr + '</span>' : '') +
        '<span style="font-size:11px;font-weight:900;padding:2px 8px;border-radius:6px;background:var(--yellow);color:var(--black);">' + (item.sourceLabel || (item.source ? item.source.toUpperCase() : 'ARTICLE')) + '</span>' +
      '</div>' +
      tagsHtml +
      '<div class="article-body-content" style="margin-top:24px;font-size:15px;line-height:1.85;color:var(--text);word-break:break-word;overflow-wrap:anywhere;">' +
        (renderedBodyHtml || '<p style="text-align:center;color:var(--text-muted);font-weight:700;">Full article content not directly embeddable.</p>') +
      '</div>' +
      mediumNotice +
      openOriginalBtn +
    '</div>';
}
