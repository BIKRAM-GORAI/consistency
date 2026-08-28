const API = '';
const token = localStorage.getItem('adminToken');
let allReviews = []; // Global store to avoid JSON-in-attribute issues
let currentPages = {
  reviews: 1,
  users: 1,
  groups: 1,
  payments: 1
};

function getAdminTokenExpiry(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    const payload = JSON.parse(jsonPayload);
    return payload.exp ? payload.exp * 1000 : null;
  } catch (e) {
    console.error('Error decoding admin token:', e);
    return null;
  }
}

let sessionTimerInterval = null;

function initSessionTimer() {
  if (!token) return;
  const expiry = getAdminTokenExpiry(token);
  if (!expiry) {
    console.warn('Could not decode admin token expiration');
    return;
  }

  const timerEl = document.getElementById('session-timer');
  if (!timerEl) return;

  function updateTimer() {
    const remainingMs = expiry - Date.now();
    if (remainingMs <= 0) {
      clearInterval(sessionTimerInterval);
      timerEl.textContent = '⏳ Session: Expired';
      alert('Your admin session has expired. You will be logged out.');
      logout();
      return;
    }

    const remainingSecs = Math.floor(remainingMs / 1000);
    const mins = Math.floor(remainingSecs / 60);
    const secs = remainingSecs % 60;
    timerEl.textContent = `⏳ Session: ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  updateTimer();
  sessionTimerInterval = setInterval(updateTimer, 1000);
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('admin-dashboard.html')) {
    initSessionTimer();
  }
});

// Redirect if not logged in
if (!token && !window.location.pathname.includes('admin-login.html')) {
  window.location.replace('admin-login.html');
}

// Security: If user token is set in another tab, logout admin immediately
window.addEventListener('storage', (e) => {
  if (e.key === 'token' && e.newValue) {
    localStorage.removeItem('adminToken');
    window.location.replace('admin-login.html');
  }
  if (e.key === 'adminToken' && !e.newValue) {
    window.location.replace('admin-login.html');
  }
});

// Handle browser back button (caching issues)
window.onpageshow = function(event) {
  if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
    if (!localStorage.getItem('adminToken')) {
      window.location.replace('admin-login.html');
    }
  }
  // Prevent back navigation by pushing a new state
  if (localStorage.getItem('adminToken') && window.location.pathname.includes('admin-dashboard.html')) {
    history.pushState(null, null, location.href);
  }
};

// Trap the back button
window.onpopstate = function () {
  if (localStorage.getItem('adminToken') && window.location.pathname.includes('admin-dashboard.html')) {
    history.pushState(null, null, location.href);
    // Optionally show a small toast or message
  }
};

function openImagePreview(url) {
  if (!url) return;
  const modal = document.getElementById('image-modal');
  const img = document.getElementById('modal-img');
  img.src = url;
  modal.style.display = 'flex';
}

/**
 * SPA Navigation
 */
function showSection(section) {
  document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');
  document.getElementById(`section-${section}`).style.display = 'block';
  
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.id === `nav-${section}`);
  });

  if (section === 'reviews') loadReviews();
  if (section === 'users') loadUsers();
  if (section === 'groups') loadGroups();
  if (section === 'badges') loadBadges();
  if (section === 'coupons') loadCoupons();
  if (section === 'payments') loadPayments();
  if (section === 'refunds') loadRefunds();
  if (section === 'reports') loadReports();
  if (section === 'changelogs') loadChangelogs();
  if (section === 'motivation') loadAdminMotivationQuotes();
  if (section === 'bulk-email') loadUserEmailsOnly('desc');
}

/**
 * Fetch and render reviews
 */
async function loadReviews(sort = 'desc') {
  // Update UI active state
  if (document.getElementById('sort-desc')) {
    document.getElementById('sort-desc').classList.toggle('active', sort === 'desc');
    document.getElementById('sort-asc').classList.toggle('active', sort === 'asc');
  }

  try {
    const page = currentPages.reviews;
    const res = await fetch(`${API}/api/admin/reviews?sort=${sort}&page=${page}&limit=10`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 401 || res.status === 403) {
      logout();
      return;
    }

    const data = await res.json();
    allReviews = data.items || [];
    renderReviews(allReviews);
    renderPaginationControls(data, 'reviews-pagination', 'reviews', () => loadReviews(sort));
  } catch (err) {
    console.error('Error loading reviews:', err);
  }
}

/**
 * Render review cards
 */
function renderReviews(reviews) {
  const grid = document.getElementById('review-grid');
  if (!grid) return;
  grid.innerHTML = '';

  reviews.forEach((r, index) => {
    const date = new Date(r.createdAt).toLocaleString();
    const card = document.createElement('div');
    card.className = 'review-card';
    
    // Badge colors
    const badgeColors = {
      'Verified Account': '#4ade80',
      'Considered by Developer': '#facc15',
      'Helpful Review': '#60a5fa',
      'Early / Beta Tester': '#a78bfa',
      'Thanks from developer': '#fb923c',
      'Peak Productivity': '#4ade80',
      'Chaos Coordinator': '#fb7185',
      'Feature Hunter': '#f472b6',
      'Certified G.O.A.T': '#facc15',
      'Vibe Checker': '#22d3ee',
      'Professional Procrastinator': '#94a3b8',
      'Big Brain Energy': '#818cf8',
      'Hidden Genius': '#34d399',
      'Feature Now Live!': '#22d3ee',
      'Fixed': '#4ade80'
    };

    const badgesHtml = (r.userBadges || []).map(b => `
      <span class="badge" style="background: ${badgeColors[b] || '#eee'}">${b}</span>
    `).join('');

    card.innerHTML = `
      <div class="review-meta">
        <div style="display: flex; align-items: center; gap: 8px;">
          ${getAvatarHtml(r.userProfilePicture, r.name, 30)}
          <span>${r.name || '<span style="color:red">No Name</span>'}</span>
        </div>
        <span>${date}</span>
      </div>
      <div class="review-email">${r.email || 'no-email@provided.com'}</div>
      <div class="review-text">${r.description}</div>
      <div class="review-badges">${badgesHtml}</div>
      <div class="card-actions">
        <button class="btn-action btn-edit" onclick="openEditModal(${index})"><i data-lucide="edit-3"></i> Edit</button>
        <button class="btn-action btn-delete" onclick="deleteReview('${r._id}')"><i data-lucide="trash-2"></i> Delete</button>
      </div>
    `;
    grid.appendChild(card);
  });

  if (window.lucide) {
    lucide.createIcons({ root: grid });
  }
}

/**
 * Helper to format date for datetime-local input
 */
function formatForInput(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function openAddModal() {
  document.getElementById('modal-title').textContent = 'Add New Review';
  document.getElementById('btn-save-text').textContent = 'Create Review';
  document.getElementById('edit-id').value = '';
  document.getElementById('edit-name').value = '';
  document.getElementById('edit-email').value = '';
  document.getElementById('edit-text').value = '';
  document.getElementById('edit-date').value = formatForInput();

  document.querySelectorAll('input[name="badges"]').forEach(cb => cb.checked = false);
  document.getElementById('edit-modal').style.display = 'flex';
}

function openEditModal(index) {
  const review = allReviews[index];
  if (!review) return;

  document.getElementById('modal-title').textContent = 'Edit Review';
  document.getElementById('btn-save-text').textContent = 'Save Changes';
  document.getElementById('edit-id').value = review._id;
  document.getElementById('edit-name').value = review.name || '';
  document.getElementById('edit-email').value = review.email || '';
  document.getElementById('edit-text').value = review.description;
  document.getElementById('edit-date').value = formatForInput(review.createdAt);

  // Set checkboxes
  const checkboxes = document.querySelectorAll('input[name="badges"]');
  checkboxes.forEach(cb => {
    cb.checked = (review.userBadges || []).includes(cb.value);
  });

  document.getElementById('edit-modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('edit-modal').style.display = 'none';
}

/**
 * Form Submission (Handles both Create and Update)
 */
document.getElementById('edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('edit-id').value;
  const name = document.getElementById('edit-name').value;
  const email = document.getElementById('edit-email').value;
  const description = document.getElementById('edit-text').value;
  const createdAt = document.getElementById('edit-date').value;
  
  const userBadges = Array.from(document.querySelectorAll('input[name="badges"]:checked'))
    .map(cb => cb.value);

  const payload = { name, email, description, createdAt, userBadges };
  
  try {
    const url = id ? `${API}/api/admin/reviews/${id}` : `${API}/api/admin/reviews`;
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method: method,
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      closeModal();
      loadReviews();
    } else {
      const data = await res.json();
      alert(data.message || 'Action failed');
    }
  } catch (err) {
    console.error('Submit error:', err);
  }
});

/**
 * Delete logic
 */
async function deleteReview(id) {
  if (!confirm('Are you sure you want to delete this review?')) return;

  try {
    const res = await fetch(`${API}/api/admin/reviews/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      loadReviews();
    } else {
      alert('Failed to delete review');
    }
  } catch (err) {
    console.error('Delete error:', err);
  }
}

/* ============================================================
   GROUPS LOGIC
   ============================================================ */
async function loadGroups() {
  const grid = document.getElementById('groups-grid');
  grid.innerHTML = '<p>Loading groups...</p>';
  try {
    const page = currentPages.groups;
    const res = await fetch(`${API}/api/admin/groups?page=${page}&limit=10`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      allGroups = data.items || [];
      grid.innerHTML = allGroups.length ? allGroups.map(g => `
        <div class="group-card">
          
          <!-- Header: Icon, Name, Buttons, Owner -->
          <div class="group-card-header">
             <!-- Left: Icon & Name -->
             <div class="group-card-left">
                <div id="group-icon-container-${g._id}">
                  ${getAvatarHtml(g.icon, g.name, 56, '10px')}
                </div>
                <div>
                  <div id="group-name-${g._id}" style="font-weight:900; font-size: 22px; font-family: 'Space Grotesk'; line-height: 1.1;">${g.name}</div>
                  <div style="font-size:12px; color: var(--blue); font-weight: 800; text-transform: uppercase; margin-top: 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 4px;">
                      <span style="width: 8px; height: 8px; border-radius: 50%; background: ${g.isPublic ? '#22c55e' : '#666'};"></span>
                      ${g.isPublic ? 'Public Group' : 'Private Group'}
                    </div>
                    <span style="color: #ccc;">|</span>
                    <div style="background: #000; color: #fff; padding: 2px 8px; border-radius: 4px; font-family: monospace; font-size: 11px; letter-spacing: 1px;">CODE: ${g.code}</div>
                  </div>
                </div>
             </div>
 
             <!-- Right: Actions & Owner -->
             <div class="group-card-right">
                <div class="group-card-actions">
                  <button class="btn-control" style="padding: 6px 10px; font-size: 11px; box-shadow: 2px 2px 0 #000; background: var(--blue); color: #fff;" onclick="document.getElementById('admin-group-pic-input-${g._id}').click()">Change Icon</button>
                  <input type="file" id="admin-group-pic-input-${g._id}" style="display:none" accept="image/*" onchange="handleAdminGroupIconUpload(event, '${g._id}')">
                  <button class="btn-control" style="padding: 6px 10px; font-size: 11px; box-shadow: 2px 2px 0 #000;" onclick="openEditGroup('${g._id}')">Edit Info</button>
                </div>
                <div class="group-owner-badge">
                  <div style="text-align: right;">
                    <div style="font-size: 9px; font-weight: 900; color: #666; text-transform: uppercase; line-height: 1;">Owner</div>
                    <div style="font-weight: 900; font-size: 13px;">${g.owner?.name || 'Unknown'}</div>
                  </div>
                  ${getAvatarHtml(g.owner?.profilePicture, g.owner?.name, 28)}
                </div>
             </div>
          </div>
          
          <!-- Content: Description & Members -->
          <div id="group-details-${g._id}" style="flex: 1;">
            <div style="font-size: 11px; font-weight: 900; text-transform: uppercase; margin-bottom: 8px; color: #666; display: flex; align-items: center; gap: 5px;">
              <i data-lucide="info" style="width: 14px;"></i> Description
            </div>
            <p style="font-size: 14px; font-weight: 600; color: #444; background: #fef9c3; padding: 12px; border: 2px solid #000; border-radius: 8px; margin-bottom: 20px; line-height: 1.4;">
              ${g.description || 'No description provided.'}
            </p>
            
            <div style="font-size: 11px; font-weight: 900; text-transform: uppercase; margin-bottom: 12px; color: #666; display: flex; align-items: center; gap: 5px;">
              <i data-lucide="users" style="width: 14px;"></i> Members (${g.members.length})
            </div>
            <div class="group-members-grid">
              ${g.members.map(m => {
                const isOwner = g.owner?._id === m._id;
                return `
                  <div style="position: relative;">
                    <div onclick="openSecureProfile('${m._id}')" style="display: flex; align-items: center; gap: 8px; padding: 8px; border: 2px solid #eee; border-radius: 10px; cursor: pointer; transition: all 0.2s; background: #fafafa;" onmouseover="this.style.borderColor='#000'; this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='#eee'; this.style.transform='none'">
                      ${getAvatarHtml(m.profilePicture, m.name, 28)}
                      <div style="font-size: 12px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">${m.name}</div>
                    </div>
                    ${!isOwner ? `
                      <button onclick="adminRemoveMember('${g._id}', '${m._id}')" title="Remove from group" style="position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; background: #ef4444; color: white; border: 2px solid #000; font-size: 12px; font-weight: 900; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 5; box-shadow: 2px 2px 0 rgba(0,0,0,0.2);">×</button>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
 
          <!-- Footer: Delete Action -->
          <button class="btn-delete" style="width: 100%; padding: 12px; font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; box-shadow: 4px 4px 0 #000; margin-top: 10px;" onclick="adminDeleteGroup('${g._id}')">
            Delete Group Permanently
          </button>
        </div>
      `).join('') : '<p>No groups found on the platform.</p>';
      
      renderPaginationControls(data, 'groups-pagination', 'groups', loadGroups);
    }
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<p style="color:red">Failed to load groups.</p>';
  }
}

async function adminDeleteGroup(id) {
  if (!confirm('DELETE GROUP: This will dissolve the team for all members. Continue?')) return;
  try {
    const res = await fetch(`${API}/api/admin/groups/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      loadGroups();
    }
  } catch (err) { console.error(err); }
}

async function adminRemoveMember(groupId, userId) {
  if (!confirm('Remove this member from the group?')) return;
  try {
    const res = await fetch(`${API}/api/admin/groups/${groupId}/members/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      loadGroups();
    } else {
      const data = await res.json();
      alert(data.message || 'Failed to remove member');
    }
  } catch (err) { console.error(err); }
}

let allGroups = []; // Cache for editing
async function openEditGroup(id) {
  const g = allGroups.find(x => x._id === id);
  if (!g) return;
  
  const detailBox = document.getElementById(`group-details-${id}`);
  const nameBox = document.getElementById(`group-name-${id}`);
  
  nameBox.innerHTML = `
    <input type="text" id="edit-group-name-${id}" value="${g.name}" style="font-family: inherit; font-weight: 900; font-size: 18px; border: 2px solid #000; padding: 4px; width: 100%; margin-bottom: 5px;">
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="font-size: 10px; font-weight: 900; color: #666; text-transform: uppercase;">Join Code:</span>
      <input type="text" id="edit-group-code-${id}" value="${g.code}" style="font-family: monospace; font-weight: 900; font-size: 12px; border: 2px solid #000; padding: 2px 6px; width: 100px; text-transform: uppercase; background: #fff;">
    </div>
  `;
  
  detailBox.innerHTML = `
    <textarea id="edit-group-desc-${id}" style="width: 100%; height: 80px; padding: 10px; border: 2px solid #000; border-radius: 8px; font-family: inherit; font-weight: 600; margin-bottom: 10px;">${g.description || ''}</textarea>
    <div style="display: flex; gap: 10px; margin-bottom: 20px;">
      <button class="btn-save" style="padding: 8px; font-size: 12px; flex: 1; box-shadow: 2px 2px 0 #000;" onclick="saveAdminGroup('${id}')">Save Group Details</button>
      <button class="btn-cancel" style="padding: 8px; font-size: 12px; flex: 1; box-shadow: 2px 2px 0 #000;" onclick="loadGroups()">Cancel</button>
    </div>
    <div style="font-size: 12px; font-weight: 900; text-transform: uppercase; margin-bottom: 12px; color: #666;">Members (${g.members.length})</div>
    <p style="font-size: 11px; color: #888;">(Member management disabled during edit)</p>
  `;
}

async function saveAdminGroup(id) {
  const name = document.getElementById(`edit-group-name-${id}`).value;
  const description = document.getElementById(`edit-group-desc-${id}`).value;
  const codeInput = document.getElementById(`edit-group-code-${id}`);
  const code = codeInput ? codeInput.value : undefined;
  
  try {
    const res = await fetch(`${API}/api/admin/groups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name, description, code })
    });
    if (res.ok) {
      loadGroups();
    } else {
      const data = await res.json();
      alert(data.message || 'Failed to update group');
    }
  } catch (err) { console.error(err); }
}

/* ============================================================
   USER MANAGEMENT LOGIC
   ============================================================ */
let allUsers = [];
let currentUserDetail = null;

// Helper for dynamic avatars (Initials vs Image)
function getAvatarHtml(pic, name, size = 40, borderRadius = '50%') {
  if (pic) {
    return `<img src="${pic}" onclick="openImagePreview('${pic}')" style="width: ${size}px; height: ${size}px; border-radius: ${borderRadius}; border: 2px solid #000; object-fit: cover; display: block; cursor: zoom-in;" title="Click to view full size">`;
  }
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  const colors = ['#facc15', '#f472b6', '#60a5fa', '#4ade80', '#a78bfa', '#fb923c'];
  const bgColor = colors[name ? name.length % colors.length : 0];
  
  return `
    <div class="avatar-initial" style="width: ${size}px; height: ${size}px; border-radius: ${borderRadius}; background: ${bgColor}; font-size: ${size * 0.4}px; display: flex; align-items: center; justify-content: center; font-weight: 800; border: 2px solid #000;">
      ${initial}
    </div>
  `;
}

// Debounce helper
function debounce(func, timeout = 500) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { func.apply(this, args); }, timeout);
  };
}

const debouncedSearch = debounce(() => {
  currentPages.users = 1; // Reset to page 1 on search
  loadUsers();
});

async function loadUsers(sort = 'desc') {
  const query = document.getElementById('user-search').value;
  const sortBtnDesc = document.getElementById('user-sort-desc');
  const sortBtnAsc = document.getElementById('user-sort-asc');
  
  if (sortBtnDesc) {
    sortBtnDesc.classList.toggle('active', sort === 'desc');
    sortBtnAsc.classList.toggle('active', sort === 'asc');
  }

  try {
    const page = currentPages.users;
    const res = await fetch(`${API}/api/admin/users?sort=${sort}&query=${query}&page=${page}&limit=10`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      allUsers = data.items || [];
      renderUsers(allUsers, page, data.limit);
      renderPaginationControls(data, 'users-pagination', 'users', () => loadUsers(sort));
    }
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

function renderUsers(users, page = 1, limit = 10) {
  const tbody = document.getElementById('user-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  users.forEach((u, index) => {
    const isBlacklisted = u.isBlacklisted && (!u.blacklistedUntil || new Date(u.blacklistedUntil) > new Date());
    const row = document.createElement('tr');
    row.style.borderBottom = '1px solid #eee';
    
    const serialNumber = (page - 1) * limit + index + 1;
    row.innerHTML = `
      <td data-label="S.No" style="padding: 12px; font-weight: 800;">${serialNumber}</td>
      <td data-label="Profile" style="padding: 12px;">
        ${getAvatarHtml(u.profilePicture, u.name, 40, '8px')}
      </td>
      <td data-label="User Info" style="padding: 12px;">
        <div style="font-weight: 900; font-family: 'Space Grotesk';">${u.name}</div>
        <div style="font-size: 12px; color: #666;">@${u.username || 'no-username'}</div>
        <div style="font-size: 11px; color: var(--blue);">${u.email}</div>
      </td>
      <td data-label="Stats" style="padding: 12px; text-align: center;">
        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase;">
          Reviews: ${u.reviewCount || 0} <br>
          Groups: ${u.groupCount || 0}
        </div>
      </td>
      <td data-label="Status" style="padding: 12px; text-align: center;">
        <span class="badge" style="background: ${isBlacklisted ? '#ef4444' : '#22c55e'}; color: white;">
          ${isBlacklisted ? 'BLACKLISTED' : 'ACTIVE'}
        </span>
      </td>
      <td data-label="Actions" style="padding: 12px; text-align: right;">
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button class="btn-action btn-edit" style="flex:none; padding: 6px 14px; border: 2px solid #000; box-shadow: 2px 2px 0 #000; background: var(--yellow); color: #000;" onclick="openUserModal('${u._id}')">Manage</button>
          <button class="btn-action ${isBlacklisted ? 'btn-save' : 'btn-delete'}" style="flex:none; padding: 6px 14px; border: 2px solid #000; box-shadow: 2px 2px 0 #000; background: ${isBlacklisted ? '#22c55e' : '#ef4444'};" onclick="promptBlacklist('${u._id}')">${isBlacklisted ? 'Unblock' : 'Blacklist'}</button>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });
}

async function openUserModal(userId) {
  try {
    const res = await fetch(`${API}/api/admin/users/${userId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      currentUserDetail = await res.json();
      document.getElementById('user-detail-title').textContent = `Manage: ${currentUserDetail.user.name}`;
      document.getElementById('user-detail-modal').classList.add('open');
      showUserTab('info');
    }
  } catch (err) {
    console.error('Error fetching user detail:', err);
  }
}

function closeUserModal() {
  document.getElementById('user-detail-modal').classList.remove('open');
  currentUserDetail = null;
}

function generateHeatmapHtml(days) {
  // Create a map of date string (YYYY-MM-DD) -> completion status
  const dateMap = {};
  days.forEach(d => {
    const dateObj = new Date(d.date);
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    
    let total = 0;
    let completed = 0;
    d.categories.forEach(c => {
      c.tasks.forEach(t => {
        total++;
        if (t.completed) completed++;
      });
    });
    
    dateMap[dateStr] = {
      total,
      completed,
      pct: total > 0 ? (completed / total) * 100 : 0
    };
  });
  
  // Generate grids for the last 12 months
  let monthsHtml = '';
  const now = new Date();
  
  // Loop for the past 12 months
  for (let i = 11; i >= 0; i--) {
    const mDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthName = mDate.toLocaleString(undefined, { month: 'short' });
    const year = mDate.getFullYear();
    
    const numDays = new Date(mDate.getFullYear(), mDate.getMonth() + 1, 0).getDate();
    const startDay = mDate.getDay();
    
    let dayBoxes = '';
    // Fill empty spaces for start offset
    for (let s = 0; s < startDay; s++) {
      dayBoxes += `<div style="width: 14px; height: 14px; background: transparent;"></div>`;
    }
    
    // Fill day boxes
    for (let d = 1; d <= numDays; d++) {
      const dateStr = `${year}-${String(mDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const activity = dateMap[dateStr];
      
      let bgColor = '#f3f4f6'; // Default grey
      let title = `${monthName} ${d}, ${year}: No card logged`;
      let border = '1px solid #e5e7eb';
      
      if (activity) {
        const { total, completed, pct } = activity;
        border = '1px solid #000';
        if (total === 0) {
          bgColor = '#e0e7ff'; // Indigo 50
          title = `${monthName} ${d}, ${year}: 0 tasks logged`;
        } else if (pct === 0) {
          bgColor = '#e0e7ff'; // Indigo 50
          title = `${monthName} ${d}, ${year}: 0/${total} completed (0%)`;
        } else if (pct < 50) {
          bgColor = '#c7d2fe'; // Indigo 200
          title = `${monthName} ${d}, ${year}: ${completed}/${total} completed (${Math.round(pct)}%)`;
        } else if (pct < 100) {
          bgColor = '#818cf8'; // Indigo 400
          title = `${monthName} ${d}, ${year}: ${completed}/${total} completed (${Math.round(pct)}%)`;
        } else {
          bgColor = '#4f46e5'; // Indigo 600
          title = `${monthName} ${d}, ${year}: All ${completed}/${total} completed (100%)!`;
        }
      }
      
      dayBoxes += `
        <div title="${title}" style="width: 14px; height: 14px; background: ${bgColor}; border: ${border}; border-radius: 3px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
        </div>
      `;
    }
    
    monthsHtml += `
      <div style="padding: 10px; border: 2px solid #000; border-radius: 8px; background: #fafafa; display: flex; flex-direction: column; align-items: center; min-width: 130px;">
        <div style="font-weight: 800; font-size: 12px; margin-bottom: 6px; font-family: 'Space Grotesk';">${monthName} ${year}</div>
        <div style="display: grid; grid-template-columns: repeat(7, 14px); gap: 4px;">
          ${dayBoxes}
        </div>
      </div>
    `;
  }
  
  return `
    <div style="font-weight: 900; font-family: 'Space Grotesk'; margin-bottom: 12px; font-size: 16px;">📅 Habit Consistency Heatmap (Past 12 Months)</div>
    <div style="display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; max-height: 280px; overflow-y: auto; padding: 4px;">
      ${monthsHtml}
    </div>
    <div style="display: flex; gap: 15px; margin-top: 15px; font-size: 11px; font-weight: 800; justify-content: center;">
      <div style="display: flex; align-items: center; gap: 4px;"><div style="width:12px; height:12px; background:#f3f4f6; border:1px solid #e5e7eb; border-radius:2px;"></div> No Card</div>
      <div style="display: flex; align-items: center; gap: 4px;"><div style="width:12px; height:12px; background:#e0e7ff; border:1px solid #000; border-radius:2px;"></div> 0% Completed</div>
      <div style="display: flex; align-items: center; gap: 4px;"><div style="width:12px; height:12px; background:#c7d2fe; border:1px solid #000; border-radius:2px;"></div> 1-49% Completed</div>
      <div style="display: flex; align-items: center; gap: 4px;"><div style="width:12px; height:12px; background:#818cf8; border:1px solid #000; border-radius:2px;"></div> 50-99% Completed</div>
      <div style="display: flex; align-items: center; gap: 4px;"><div style="width:12px; height:12px; background:#4f46e5; border:1px solid #000; border-radius:2px;"></div> 100% Completed</div>
    </div>
  `;
}

function showUserTab(tab) {
  const container = document.getElementById('user-modal-content');
  document.querySelectorAll('#user-detail-modal .nav-link').forEach(btn => {
    btn.classList.toggle('active', btn.id === `tab-${tab}`);
  });

  if (!currentUserDetail) return;
  const { user, days, achievements, goals, groups } = currentUserDetail;

  let html = '';
  switch (tab) {
    case 'info':
      html = `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 15px; padding-bottom: 24px; border-bottom: 2px dashed #eee; margin-bottom: 24px;">
          <div id="admin-user-avatar-container">
            ${getAvatarHtml(user.profilePicture, user.name, 120, '12px')}
          </div>
          <button class="btn-control" style="background: var(--yellow); font-size: 11px; padding: 8px 16px; box-shadow: 3px 3px 0 #000;" onclick="document.getElementById('admin-user-pic-input').click()">
            <i data-lucide="camera"></i> Change Profile Picture
          </button>
          <input type="file" id="admin-user-pic-input" style="display:none" accept="image/*" onchange="handleAdminUserPicUpload(event, '${user._id}')">
          <p style="font-size: 11px; color: #666; font-weight: 700;">Click to upload a new avatar for this user</p>
          
          <div style="width: 100%; max-width: 420px; padding: 16px; border: 3px solid #000; border-radius: 12px; background: #fff; box-shadow: 4px 4px 0 #000; font-size: 13px; text-align: left; line-height: 1.6;">
            <div>📅 <strong>Member Since:</strong> <span style="font-weight: 800; color: #000;">${new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
            <div>🔥 <strong>Current Streak:</strong> <span style="font-weight: 900; color: var(--red);">${user.currentStreak || 0} days</span> (Highest: ${user.highestStreak || 0} days)</div>
            <div>📧 <strong>Verification Status:</strong> ${user.isEmailVerified ? '<span style="color: #22c55e; font-weight: 800;">✔ Verified</span>' : '<span style="color: #ef4444; font-weight: 800;">⚠ Unverified (Grace Limit)</span>'}</div>
          </div>
        </div>

        <div class="user-subscription-box">
          <div>
            <div style="font-size: 11px; font-weight: 900; text-transform: uppercase; color: #666; margin-bottom: 6px;">Subscription Level</div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="badge" style="background: ${user.subscriptionTier === 'premium' ? 'var(--purple)' : '#ccc'}; color: ${user.subscriptionTier === 'premium' ? 'var(--white)' : 'var(--black)'}; font-size: 14px; padding: 6px 12px; border-radius: 6px;">
                ${user.subscriptionTier === 'premium' ? '👑 PREMIUM USER' : 'FREE TIER'}
              </span>
            </div>
            ${user.subscriptionTier === 'premium' && user.subscriptionExpiresAt ? `
              <div style="font-size: 12px; font-weight: 700; color: #555; margin-top: 8px;">
                📅 Validity Expiration: <span style="color: var(--black); font-weight: 800;">${new Date(user.subscriptionExpiresAt).toLocaleString()}</span>
              </div>
            ` : ''}
          </div>
          <button class="btn-control" style="background: var(--blue); color: white; padding: 10px 18px; box-shadow: 4px 4px 0 #000;" onclick="showUserTab('payments')">
            <i data-lucide="receipt"></i> View Payments History
          </button>
        </div>

        <div class="user-referral-box" style="margin-top: 24px; padding: 16px; border: 3px solid #000; border-radius: 12px; background: #fff; box-shadow: 4px 4px 0 #000; display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px;">
          <h4 style="margin: 0 0 4px 0; font-family:'Space Grotesk'; font-size: 16px;">👥 Referral &amp; Gamification Details</h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; font-size: 13px;">
            <div>🎟️ <strong>Referral Code:</strong> <span style="font-family: monospace; font-weight: 800;">${user.referralCode || 'N/A'}</span></div>
            <div>💰 <strong>Points Balance:</strong> <span style="font-weight: 900; color: var(--blue);">${user.pointsBalance || 0} pts</span></div>
            <div style="grid-column: 1 / -1; margin-top: 4px;">
              🔗 <strong>Referred By:</strong> 
              ${user.referredBy ? `
                <span onclick="openUserModal('${user.referredBy._id}')" style="color: var(--blue); font-weight: 800; cursor: pointer; text-decoration: underline;">
                  ${user.referredBy.name} (@${user.referredBy.username || 'user'})
                </span>
              ` : '<span style="color: #666;">Direct Signup / None</span>'}
            </div>
          </div>
        </div>

        <div class="user-ai-quotas" style="margin-top: 24px; padding: 16px; border: 3px solid #000; border-radius: 12px; background: #f9f9f9; box-shadow: 4px 4px 0 #000; margin-bottom: 24px;">
          <h4 style="margin: 0 0 12px 0; font-family:'Space Grotesk'; font-size: 16px;">🤖 Daily AI Usage Quota Tracking</h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; font-size: 12px; font-weight: 700;">
            <div style="padding: 10px; border: 2px dashed #ccc; border-radius: 8px; background: #fff;">
              <strong>Coach Reports:</strong> ${user.aiGenerationCount || 0}
            </div>
            <div style="padding: 10px; border: 2px dashed #ccc; border-radius: 8px; background: #fff;">
              <strong>Image OCR:</strong> ${user.aiPhotoExtractionCount || 0}
            </div>
            <div style="padding: 10px; border: 2px dashed #ccc; border-radius: 8px; background: #fff;">
              <strong>Voice Parses:</strong> ${user.voiceParseCount || 0}
            </div>
            <div style="padding: 10px; border: 2px dashed #ccc; border-radius: 8px; background: #fff;">
              <strong>Canvas Messages:</strong> ${user.canvasMsgCount || 0}
            </div>
            <div style="padding: 10px; border: 2px dashed #ccc; border-radius: 8px; background: #fff;">
              <strong>Weekly Summaries:</strong> ${user.weeklySummaryDailyCount || 0}
            </div>
            <div style="padding: 10px; border: 2px dashed #ccc; border-radius: 8px; background: #fff;">
              <strong>Monthly Summaries:</strong> ${user.monthlySummaryDailyCount || 0}
            </div>
          </div>
        </div>

        <div class="form-group">
          <label>Full Name</label>
          <input type="text" id="user-edit-name" value="${user.name}">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="user-edit-email" value="${user.email}" readonly style="background:#f0f0f0; cursor: not-allowed;">
        </div>
        <div class="form-group">
          <label>Username</label>
          <input type="text" id="user-edit-username" value="${user.username || ''}">
        </div>
        <button class="btn-save" style="width: 100%; padding: 14px; margin-top: 10px;" onclick="saveUserBasicInfo('${user._id}')">Save Account Details</button>
        
        <div class="danger-zone" style="margin-top: 40px; padding: 20px; border: 3px solid #ef4444; border-radius: 12px; background: #fff1f2;">
          <h4 style="color: #ef4444; margin-bottom: 12px; font-family:'Space Grotesk'; font-size: 18px;">🛑 DANGER ZONE</h4>
          <p style="font-size: 13px; color: #666; margin-bottom: 20px;">Once you delete this account, all their data (days, goals, achievements) will be permanently erased. This cannot be undone.</p>
          <button class="btn-delete" style="width:100%; padding: 14px; font-size: 14px;" onclick="adminDeleteUser('${user._id}')">Delete User Account Completely</button>
        </div>
      `;
      break;
    case 'payments':
      html = `
        <div style="padding: 20px;">
          <h4 style="margin-bottom: 20px; font-family: 'Space Grotesk';">Order &amp; Transaction History</h4>
          <div id="user-payments-list" style="display: flex; flex-direction: column; gap: 16px;">
            <p style="font-weight: 700; color: #666;">Querying real-time payment portal...</p>
          </div>
        </div>
      `;
      setTimeout(() => loadUserPayments(user._id), 100);
      break;
    case 'days':
      html = `
        <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px dashed #eee;">
          <button class="btn-control" style="width: 100%; background: var(--blue); color: white; padding: 12px; box-shadow: 4px 4px 0 #000;" onclick="prepareAddNewDay('${user._id}')">
            <i data-lucide="plus-circle"></i> + Add New Day Card
          </button>
        </div>
        <div id="new-day-placeholder"></div>
        <div style="margin-bottom: 24px; padding: 16px; border: 3px solid #000; border-radius: 12px; background: #fff; box-shadow: 4px 4px 0 #000;">
          ${generateHeatmapHtml(days)}
        </div>
        ${days.length ? days.map(d => `
          <div id="day-card-${d._id}" style="padding:16px; border:3px solid #000; margin-bottom:16px; background:#fff; border-radius:12px; box-shadow: 4px 4px 0 #000;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 2px solid #eee; padding-bottom: 12px; margin-bottom: 12px;">
              <div style="font-weight:900; font-size: 18px; font-family: 'Space Grotesk';">${new Date(d.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
              <div style="display:flex; gap:10px;">
                <button class="btn-save" style="padding:6px 16px; font-size:12px; flex:none; background: var(--yellow); color: #000; box-shadow: 2px 2px 0 #000;" onclick="openEditDay('${d._id}')">Edit Day</button>
                <button class="btn-delete" style="padding:6px 16px; font-size:12px; flex:none; box-shadow: 2px 2px 0 #000;" onclick="adminDeleteDay('${d._id}')">Delete</button>
              </div>
            </div>
            <div style="font-size:14px; font-weight: 700; color:#333;">${d.categories.length} Categories • ${d.categories.reduce((acc, c) => acc + c.tasks.length, 0)} Total Tasks</div>
          </div>
        `).join('') : '<p>No daily cards found.</p>'}
      `;
      break;
    case 'ach':
      html = achievements.length ? achievements.map(a => `
        <div id="ach-card-${a._id}" style="padding:16px; border:3px solid #000; margin-bottom:16px; background:#fff; border-radius:12px; box-shadow: 4px 4px 0 #000;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-weight:900; font-size: 16px;">${a.title}</div>
            <div style="display:flex; gap:10px;">
              <button class="btn-save" style="padding:6px 16px; font-size:12px; flex:none; background: var(--yellow); color: #000; box-shadow: 2px 2px 0 #000;" onclick="openEditAchievement('${a._id}')">Edit</button>
              <button class="btn-delete" style="padding:6px 16px; font-size:12px; flex:none; box-shadow: 2px 2px 0 #000;" onclick="adminDeleteAchievement('${a._id}')">Delete</button>
            </div>
          </div>
          <div style="font-size:12px; color:#666; margin-top: 8px; font-weight: 700;">${new Date(a.date).toLocaleDateString()}</div>
        </div>
      `).join('') : '<p>No achievements found.</p>';
      break;
    case 'goals':
      html = goals.length ? goals.map(g => `
        <div id="goal-card-${g._id}" style="padding:16px; border:3px solid #000; margin-bottom:16px; background:#fff; border-radius:12px; box-shadow: 4px 4px 0 #000;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 2px solid #eee; padding-bottom: 12px; margin-bottom: 12px;">
            <div style="font-weight:900; font-size: 16px;">${g.title}</div>
            <div style="display:flex; gap:10px;">
              <button class="btn-save" style="padding:6px 16px; font-size:12px; flex:none; background: var(--yellow); color: #000; box-shadow: 2px 2px 0 #000;" onclick="openEditGoal('${g._id}')">Edit</button>
              <button class="btn-delete" style="padding:6px 16px; font-size:12px; flex:none; box-shadow: 2px 2px 0 #000;" onclick="adminDeleteGoal('${g._id}')">Delete</button>
            </div>
          </div>
          <div style="font-size:13px; color:#333; margin-top:4px; font-weight: 600;">
            Deadline: ${new Date(g.deadline).toLocaleDateString()}
            <ul style="margin: 12px 0 0 16px; padding: 0; list-style: none;">
              ${g.tasks.map(t => `<li style="font-size:12px; margin-bottom: 4px;">${t.completed ? '✅' : '⬜'} ${t.title}</li>`).join('')}
            </ul>
          </div>
        </div>
      `).join('') : '<p>No goals found.</p>';
      break;
    case 'groups':
      html = groups.length ? groups.map(g => `
        <div style="padding:20px; border:3px solid #000; margin-bottom:20px; background:#fff; border-radius:12px; box-shadow: 6px 6px 0 #000;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; padding-bottom: 15px; margin-bottom: 15px;">
             <div>
               <div style="font-weight:900; font-size: 20px; font-family: 'Space Grotesk';">${g.name}</div>
               <div style="font-size:12px; color: var(--blue); font-weight: 800; text-transform: uppercase; margin-top: 4px;">${g.isPublic ? 'Public Group' : 'Private Group'}</div>
             </div>
             <div style="text-align: right;">
                <div style="font-size: 11px; font-weight: 800; color: #666;">OWNER</div>
                <div style="font-weight: 900; font-size: 14px;">${g.owner?.name || 'Unknown'}</div>
             </div>
          </div>
          
          <div>
            <div style="font-size: 12px; font-weight: 900; text-transform: uppercase; margin-bottom: 10px; color: #666;">Members (${g.members.length})</div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px;">
              ${g.members.map(m => `
                <div onclick="openSecureProfile('${m._id}')" style="display: flex; align-items: center; gap: 10px; padding: 8px; border: 2px solid #eee; border-radius: 8px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.borderColor='#000'; this.style.background='#f9f9f9'" onmouseout="this.style.borderColor='#eee'; this.style.background='transparent'">
                  ${getAvatarHtml(m.profilePicture, m.name, 30)}
                  <div style="font-size: 13px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${m.name}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `).join('') : '<p>User is not in any groups.</p>';
      break;
    case 'badges':
      const claimedBadges = user.claimedBadges || [];
      html = `
        <div style="padding: 20px;">
          <h4 style="margin-bottom: 20px; font-family: 'Space Grotesk';">Claimed Badges (${claimedBadges.length})</h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 20px;">
            ${claimedBadges.length ? claimedBadges.map(b => `
              <div style="display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 16px; border: 3px solid #000; border-radius: 12px; background: #fff; box-shadow: 4px 4px 0 #000; cursor: pointer; transition: all 0.2s;" 
                   onclick="openImagePreview('${b.image}')"
                   onmouseover="this.style.transform='translateY(-2px)'" 
                   onmouseout="this.style.transform='translateY(0)'">
                <img src="${b.image}" style="width: 80px; height: 80px; object-fit: contain;">
                <div style="font-size: 12px; font-weight: 900; text-align: center; line-height: 1.2;">${b.name}</div>
                <div style="font-size: 10px; font-weight: 700; color: #666;">${b.requiredDays} Days</div>
              </div>
            `).join('') : '<p style="grid-column: 1/-1; text-align: center; color: #666; font-weight: 700;">No badges claimed yet.</p>'}
          </div>
        </div>
      `;
      break;
    case 'email':
      html = `
        <div style="padding: 4px 0 20px;">
          <div style="background: #fffbeb; border: 2px dashed var(--yellow); padding: 12px 16px; margin-bottom: 20px; font-size: 13px; font-weight: 700; color: #92400e;">
            📧 Sending to: <strong>${user.email}</strong> &mdash; from <strong>${'(your Gmail)'}</strong>
          </div>

          <div class="form-group">
            <label>Subject *</label>
            <input type="text" id="user-email-subject" placeholder="e.g. Hello from Consistency Tracker" style="border: var(--border);">
          </div>

          <!-- Mode Toggle -->
          <div style="margin-bottom: 14px; display: flex; gap: 0; border: var(--border); width: fit-content;">
            <button id="user-email-mode-plain" onclick="setUserEmailMode('text')" style="padding: 8px 16px; font-family: inherit; font-weight: 900; font-size: 12px; text-transform: uppercase; border: none; background: var(--yellow); cursor: pointer; border-right: 2px solid #000;">Plain Text</button>
            <button id="user-email-mode-html" onclick="setUserEmailMode('html')" style="padding: 8px 16px; font-family: inherit; font-weight: 900; font-size: 12px; text-transform: uppercase; border: none; background: #eee; cursor: pointer;">HTML</button>
          </div>

          <div class="form-group">
            <label id="user-email-body-label">Message *</label>
            <textarea id="user-email-body" rows="10" placeholder="Type your message here..." style="border: var(--border); resize: vertical; font-family: inherit;"></textarea>
          </div>

          <div class="form-group">
            <label>Attachment (optional &bull; max ~5 MB)</label>
            <input type="file" id="user-email-attachment" onchange="handleAdminEmailAttachment(event)" style="border: var(--border); padding: 10px; width: 100%; font-family: inherit;">
            <div id="user-email-attach-info" style="font-size: 11px; color: #666; font-weight: 700; margin-top: 6px;"></div>
          </div>

          <div style="display: flex; gap: 10px; margin-top: 8px;">
            <button id="user-email-preview-btn" onclick="previewUserEmail()" style="display:none; flex:1; padding: 10px; background: var(--blue); color: white; border: var(--border); box-shadow: var(--shadow); font-family: inherit; font-weight: 900; text-transform: uppercase; font-size: 13px; cursor: pointer;">
              👁 Preview HTML
            </button>
            <button id="btn-send-user-email" onclick="sendAdminEmailToUser('${user._id}')" style="flex:2; padding: 12px; background: var(--black); color: white; border: var(--border); box-shadow: var(--shadow); font-family: inherit; font-weight: 900; text-transform: uppercase; font-size: 13px; cursor: pointer;">
              📤 Send Email
            </button>
          </div>

          <div id="user-email-result" style="display:none; margin-top: 16px; padding: 14px; border: var(--border); font-weight: 700; font-size: 13px;"></div>
        </div>
      `;
      break;
  }
  container.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function promptBlacklist(userId) {
  const user = allUsers.find(u => u._id === userId);
  if (user.isBlacklisted) {
    if (confirm(`Unblock ${user.name}?`)) {
      await updateBlacklist(userId, { isBlacklisted: false });
    }
  } else {
    const reason = prompt('Reason for blacklisting?');
    if (reason === null) return;
    const daysStr = prompt('Duration in days? (Leave empty for indefinite)');
    let blacklistedUntil = null;
    if (daysStr) {
      blacklistedUntil = new Date();
      blacklistedUntil.setDate(blacklistedUntil.getDate() + parseInt(daysStr));
    }
    await updateBlacklist(userId, { isBlacklisted: true, blacklistReason: reason, blacklistedUntil });
  }
}

async function updateBlacklist(userId, payload) {
  try {
    const res = await fetch(`${API}/api/admin/users/${userId}/blacklist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      loadUsers();
    }
  } catch (err) {
    console.error('Blacklist update error:', err);
  }
}

async function adminDeleteUser(userId) {
  if (!confirm('EXTREMELY PERMANENT: Delete this user and all their data forever?')) return;
  try {
    const res = await fetch(`${API}/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      closeUserModal();
      loadUsers();
    }
  } catch (err) { console.error(err); }
}

async function adminDeleteDay(dayId) {
  if (!confirm('Delete this day?')) return;
  try {
    const res = await fetch(`${API}/api/admin/days/${dayId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      currentUserDetail.days = currentUserDetail.days.filter(d => d._id !== dayId);
      showUserTab('days');
    }
  } catch (err) { console.error(err); }
}

async function adminDeleteAchievement(id) {
  if (!confirm('Delete this achievement?')) return;
  try {
    const res = await fetch(`${API}/api/admin/achievements/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      currentUserDetail.achievements = currentUserDetail.achievements.filter(a => a._id !== id);
      showUserTab('ach');
    }
  } catch (err) { console.error(err); }
}

async function adminDeleteGoal(id) {
  if (!confirm('Delete this goal?')) return;
  try {
    const res = await fetch(`${API}/api/admin/goals/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      currentUserDetail.goals = currentUserDetail.goals.filter(g => g._id !== id);
      showUserTab('goals');
    }
  } catch (err) { console.error(err); }
}

/* --- Admin Edit Functions --- */

function openEditDay(dayId) {
  const d = currentUserDetail.days.find(x => x._id === dayId);
  const card = document.getElementById(`day-card-${dayId}`);
  if (!card) return;
  card.innerHTML = `
    <div style="font-weight:900; margin-bottom:20px; font-size: 18px; font-family:'Space Grotesk'; text-align: center; border-bottom: 3px solid #000; padding-bottom: 10px;">
      EDITING: ${new Date(d.date).toLocaleDateString()}
    </div>
    <div id="edit-categories-list">
      ${d.categories.map((cat, cIdx) => `
        <div class="edit-cat-box" style="border:3px solid #000; padding:0; margin-bottom:20px; background:#fff; box-shadow: 4px 4px 0 #000; border-radius: 8px; overflow: hidden;">
          <div style="background: #fef9c3; padding: 10px; border-bottom: 2px solid #000; text-align: center;">
            <input type="text" class="cat-name-input" value="${cat.name}" style="font-weight:900; width:80%; text-align: center; background: transparent; border: none; font-size: 16px; text-transform: uppercase;">
          </div>
          <div style="padding: 15px;">
            <div class="edit-tasks-list">
              ${cat.tasks.map(t => `
                <div style="display:flex; gap:10px; margin-bottom:10px; align-items: center;">
                  <button class="boxy-toggle ${t.completed ? 'active' : ''}" onclick="toggleBoxy(this)" style="width: 32px; height: 32px; border: 2px solid #000; background: ${t.completed ? '#22c55e' : '#fff'}; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 18px;">
                    ${t.completed ? '✓' : ''}
                  </button>
                  <input type="hidden" class="task-comp-input" value="${t.completed}">
                  <input type="text" class="task-title-input" value="${t.title}" style="flex:1; padding: 8px; border: 2px solid #000; font-weight: 700; font-size: 14px;">
                  <button onclick="this.parentElement.remove()" style="width: 32px; height: 32px; background: #ef4444; color: white; border: 2px solid #000; cursor: pointer; font-weight: 900; font-size: 18px; display: flex; align-items: center; justify-content: center;">×</button>
                </div>
              `).join('')}
            </div>
            <div style="display: flex; gap: 10px; margin-top: 15px;">
              <button class="btn-action" onclick="addTaskLine(this)" style="flex: 1; background: #3b82f6; color: white; border: 2px solid #000; padding: 8px; font-weight: 800; font-size: 12px; box-shadow: 2px 2px 0 #000;">+ ADD TASK</button>
              <button class="btn-action" onclick="this.parentElement.parentElement.parentElement.remove()" style="flex: 1; background: #ef4444; color: white; border: 2px solid #000; padding: 8px; font-weight: 800; font-size: 12px; box-shadow: 2px 2px 0 #000;">REMOVE CATEGORY</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
    <button class="btn-action" onclick="addCategoryLine()" style="width: 100%; background: #22c55e; color: white; border: 3px solid #000; padding: 12px; font-weight: 900; font-size: 14px; box-shadow: 4px 4px 0 #000; margin-top: 10px;">+ ADD NEW CATEGORY</button>
    <div style="display:flex; gap:12px; margin-top:30px; padding-top: 20px; border-top: 2px dashed #000;">
      <button class="btn-save" style="padding:14px; flex:1; background: #22c55e; box-shadow: 4px 4px 0 #000;" onclick="saveAdminDay('${dayId}')">SAVE ALL UPDATES</button>
      <button class="btn-cancel" style="padding:14px; flex:1; background: #fff; box-shadow: 4px 4px 0 #000;" onclick="showUserTab('days')">CANCEL</button>
    </div>
  `;
}

function toggleBoxy(btn) {
  const hidden = btn.nextElementSibling;
  const isComp = hidden.value === 'true';
  hidden.value = !isComp;
  btn.style.background = !isComp ? '#22c55e' : '#fff';
  btn.textContent = !isComp ? '✓' : '';
  btn.classList.toggle('active');
}

function addTaskLine(btn) {
  const container = btn.parentElement.previousElementSibling;
  const div = document.createElement('div');
  div.style.display = 'flex';
  div.style.gap = '10px';
  div.style.marginBottom = '10px';
  div.style.alignItems = 'center';
  div.innerHTML = `
    <button class="boxy-toggle" onclick="toggleBoxy(this)" style="width: 32px; height: 32px; border: 2px solid #000; background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 18px;"></button>
    <input type="hidden" class="task-comp-input" value="false">
    <input type="text" class="task-title-input" placeholder="Enter task..." style="flex:1; padding: 8px; border: 2px solid #000; font-weight: 700; font-size: 14px;">
    <button onclick="this.parentElement.remove()" style="width: 32px; height: 32px; background: #ef4444; color: white; border: 2px solid #000; cursor: pointer; font-weight: 900; font-size: 18px; display: flex; align-items: center; justify-content: center;">×</button>
  `;
  container.appendChild(div);
}

function addCategoryLine() {
  const list = document.getElementById('edit-categories-list');
  const div = document.createElement('div');
  div.className = 'edit-cat-box';
  div.style.border = '3px solid #000';
  div.style.padding = '0';
  div.style.marginBottom = '20px';
  div.style.background = '#fff';
  div.style.boxShadow = '4px 4px 0 #000';
  div.style.borderRadius = '8px';
  div.style.overflow = 'hidden';
  div.innerHTML = `
    <div style="background: #fef9c3; padding: 10px; border-bottom: 2px solid #000; text-align: center;">
      <input type="text" class="cat-name-input" placeholder="NEW CATEGORY" style="font-weight:900; width:80%; text-align: center; background: transparent; border: none; font-size: 16px; text-transform: uppercase;">
    </div>
    <div style="padding: 15px;">
      <div class="edit-tasks-list"></div>
      <div style="display: flex; gap: 10px; margin-top: 15px;">
        <button class="btn-action" onclick="addTaskLine(this)" style="flex: 1; background: #3b82f6; color: white; border: 2px solid #000; padding: 8px; font-weight: 800; font-size: 12px; box-shadow: 2px 2px 0 #000;">+ ADD TASK</button>
        <button class="btn-action" onclick="this.parentElement.parentElement.parentElement.remove()" style="flex: 1; background: #ef4444; color: white; border: 2px solid #000; padding: 8px; font-weight: 800; font-size: 12px; box-shadow: 2px 2px 0 #000;">REMOVE CATEGORY</button>
      </div>
    </div>
  `;
  list.appendChild(div);
}

async function saveAdminDay(dayId, userId = null) {
  const cardId = dayId ? `day-card-${dayId}` : 'day-card-new';
  const card = document.getElementById(cardId);
  if (!card) return;

  const date = dayId ? null : document.getElementById('new-day-date').value;
  
  // Client-side duplicate check
  if (!dayId && date) {
    const exists = currentUserDetail.days.some(d => d.date === date);
    if (exists) {
      alert(`Conflict: A card for ${date} already exists for this user. Please edit the existing card instead.`);
      return;
    }
  }
  const catBoxes = card.querySelectorAll('.edit-cat-box');
  const categories = [];
  
  for (const box of catBoxes) {
    const nameInput = box.querySelector('.cat-name-input');
    const name = nameInput.value.trim();
    if (!name) {
      alert('Error: All categories must have a name.');
      nameInput.focus();
      box.style.borderColor = '#ef4444';
      return;
    }
    
    const taskLines = box.querySelectorAll('.edit-tasks-list > div');
    const tasks = Array.from(taskLines).map(line => ({
      title: line.querySelector('.task-title-input').value,
      completed: line.querySelector('.task-comp-input').value === 'true'
    }));
    categories.push({ name, tasks });
  }

  try {
    const url = dayId ? `${API}/api/admin/days/${dayId}` : `${API}/api/admin/users/${userId}/days`;
    const method = dayId ? 'PATCH' : 'POST';
    const payload = dayId ? { categories } : { date, categories };

    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      await openUserModal(currentUserDetail.user._id);
      showUserTab('days');
    } else {
      const data = await res.json();
      alert(data.message || 'Failed to save day card');
    }
  } catch (err) { console.error(err); }
}

function prepareAddNewDay(userId) {
  const placeholder = document.getElementById('new-day-placeholder');
  placeholder.innerHTML = `
    <div id="day-card-new" style="padding:20px; border:4px solid #000; margin-bottom:32px; background:#fff; border-radius:12px; box-shadow: 8px 8px 0 #000;">
      <div style="font-weight:900; margin-bottom:20px; font-size: 20px; font-family:'Space Grotesk'; text-align: center; border-bottom: 3px solid #000; padding-bottom: 10px;">
        CREATE NEW DAY CARD
      </div>
      <div class="form-group" style="margin-bottom: 20px;">
        <label>Select Date</label>
        <input type="date" id="new-day-date" value="${new Date().toISOString().split('T')[0]}" style="font-weight: 900; font-size: 16px; border: 3px solid #000; padding: 10px; width: 100%;">
      </div>
      <div id="edit-categories-list">
        <!-- New categories go here -->
      </div>
      <button class="btn-action" onclick="addCategoryLine()" style="width: 100%; background: #22c55e; color: white; border: 3px solid #000; padding: 12px; font-weight: 900; font-size: 14px; box-shadow: 4px 4px 0 #000; margin-top: 10px;">+ ADD NEW CATEGORY</button>
      <div style="display:flex; gap:12px; margin-top:30px; padding-top: 20px; border-top: 2px dashed #000;">
        <button class="btn-save" style="padding:14px; flex:1; background: #22c55e; box-shadow: 4px 4px 0 #000;" onclick="saveAdminDay(null, '${userId}')">CREATE CARD</button>
        <button class="btn-cancel" style="padding:14px; flex:1; background: #fff; box-shadow: 4px 4px 0 #000;" onclick="document.getElementById('new-day-placeholder').innerHTML = ''">CANCEL</button>
      </div>
    </div>
  `;
  if (window.lucide) lucide.createIcons({ root: placeholder });
}

function openEditGoal(goalId) {
  const g = currentUserDetail.goals.find(x => x._id === goalId);
  const card = document.getElementById(`goal-card-${goalId}`);
  if (!card) return;
  card.innerHTML = `
    <div class="form-group">
      <label>Goal Title</label>
      <input type="text" id="edit-goal-title" value="${g.title}">
    </div>
    <div class="form-group">
      <label>Deadline</label>
      <input type="date" id="edit-goal-deadline" value="${new Date(g.deadline).toISOString().split('T')[0]}">
    </div>
    <div id="edit-goal-tasks">
      ${g.tasks.map(t => `
        <div style="display:flex; gap:8px; margin-bottom:4px;">
          <input type="checkbox" class="goal-task-comp" ${t.completed ? 'checked' : ''}>
          <input type="text" class="goal-task-title" value="${t.title}" style="flex:1;">
          <button onclick="this.parentElement.remove()" style="color:red; background:none; border:none; cursor:pointer;">×</button>
        </div>
      `).join('')}
    </div>
    <button class="btn-edit" style="font-size:11px; margin-top:10px; width:100%; padding:8px;" onclick="addGoalTaskLine()">+ Add Sub-Task</button>
    <div style="display:flex; gap:12px; margin-top:20px;">
      <button class="btn-save" style="padding:10px 16px; flex:1;" onclick="saveAdminGoal('${goalId}')">Save Progress</button>
      <button class="btn-cancel" style="padding:10px 16px; flex:1;" onclick="showUserTab('goals')">Cancel</button>
    </div>
  `;
}

function addGoalTaskLine() {
  const list = document.getElementById('edit-goal-tasks');
  const div = document.createElement('div');
  div.style.display = 'flex';
  div.style.gap = '8px';
  div.style.marginBottom = '4px';
  div.innerHTML = `
    <input type="checkbox" class="goal-task-comp">
    <input type="text" class="goal-task-title" value="" style="flex:1;">
    <button onclick="this.parentElement.remove()" style="color:red; background:none; border:none; cursor:pointer;">×</button>
  `;
  list.appendChild(div);
}

async function saveAdminGoal(goalId) {
  const title = document.getElementById('edit-goal-title').value;
  const deadline = document.getElementById('edit-goal-deadline').value;
  const taskLines = document.querySelectorAll('#edit-goal-tasks > div');
  const tasks = Array.from(taskLines).map(line => ({
    title: line.querySelector('.goal-task-title').value,
    completed: line.querySelector('.goal-task-comp').checked
  }));

  try {
    const res = await fetch(`${API}/api/admin/goals/${goalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ title, deadline, tasks })
    });
    if (res.ok) {
      await openUserModal(currentUserDetail.user._id);
      showUserTab('goals');
    }
  } catch (err) { console.error(err); }
}

function openEditAchievement(achId) {
  const a = currentUserDetail.achievements.find(x => x._id === achId);
  const card = document.getElementById(`ach-card-${achId}`);
  if (!card) return;
  card.innerHTML = `
    <div class="form-group">
      <label>Title</label>
      <input type="text" id="edit-ach-title" value="${a.title}">
    </div>
    <div class="form-group">
      <label>Description</label>
      <input type="text" id="edit-ach-desc" value="${a.description || ''}">
    </div>
    <div class="form-group">
      <label>Proof URL</label>
      <input type="text" id="edit-ach-proof" value="${a.proofUrl || ''}">
    </div>
    <div class="form-group">
      <label>Date</label>
      <input type="date" id="edit-ach-date" value="${new Date(a.date).toISOString().split('T')[0]}">
    </div>
    <div style="display:flex; gap:12px; margin-top:24px;">
      <button class="btn-save" style="padding:10px 16px; flex:1;" onclick="saveAdminAchievement('${achId}')">Update Achievement</button>
      <button class="btn-cancel" style="padding:10px 16px; flex:1;" onclick="showUserTab('ach')">Cancel</button>
    </div>
  `;
}

async function saveAdminAchievement(achId) {
  const title = document.getElementById('edit-ach-title').value;
  const description = document.getElementById('edit-ach-desc').value;
  const proofUrl = document.getElementById('edit-ach-proof').value;
  const date = document.getElementById('edit-ach-date').value;

  try {
    const res = await fetch(`${API}/api/admin/achievements/${achId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ title, description, proofUrl, date })
    });
    if (res.ok) {
      await openUserModal(currentUserDetail.user._id);
      showUserTab('ach');
    }
  } catch (err) { console.error(err); }
}

async function saveUserBasicInfo(userId) {
  const name = document.getElementById('user-edit-name').value;
  const username = document.getElementById('user-edit-username').value;
  try {
    const res = await fetch(`${API}/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name, username })
    });
    const data = await res.json();
    if (res.ok) {
      alert('User info updated successfully');
      loadUsers();
    } else {
      alert(data.message || 'Error updating user info');
    }
  } catch (err) { 
    console.error(err);
    alert('Network error while updating user');
  }
}

async function openSecureProfile(userId) {
  try {
    const res = await fetch(`${API}/api/admin/users/${userId}/preview-link`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const { shareCode, username } = await res.json();
      window.open(`profile.html?u=${username}&code=${shareCode}`, '_blank');
    } else {
      alert('Failed to generate secure preview link.');
    }
  } catch (err) {
    console.error(err);
    alert('Network error while generating preview link.');
  }
}

async function logout() {
  localStorage.removeItem('adminToken');
  window.location.replace('admin-login.html');
}

async function handleAdminUserPicUpload(event, userId) {
  const file = event.target.files[0];
  if (!file) return;

  const container = document.getElementById('admin-user-avatar-container');
  const originalHtml = container.innerHTML;
  container.innerHTML = '<div style="width: 120px; height: 120px; display: flex; align-items: center; justify-content: center; background: #eee; border: 2px solid #000; border-radius: 12px;"><div class="spinner-ring" style="width:40px; height:40px;"></div></div>';

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const img = new Image();
      img.src = e.target.result;
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 400;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
        } else {
          if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
        }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

        const res = await fetch(`${API}/api/admin/users/${userId}/profile-picture`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ profilePicture: dataUrl })
        });

        if (res.ok) {
          const data = await res.json();
          currentUserDetail.user.profilePicture = data.profilePicture;
          container.innerHTML = getAvatarHtml(data.profilePicture, currentUserDetail.user.name, 120, '12px');
          loadUsers();
        } else {
          alert('Failed to update picture');
          container.innerHTML = originalHtml;
        }
      };
    } catch (err) {
      console.error(err);
      container.innerHTML = originalHtml;
    }
  };
  reader.readAsDataURL(file);
}

async function handleAdminGroupIconUpload(event, groupId) {
  const file = event.target.files[0];
  if (!file) return;

  const container = document.getElementById(`group-icon-container-${groupId}`);
  const originalHtml = container.innerHTML;
  container.innerHTML = '<div style="width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; background: #eee; border: 2px solid #000; border-radius: 8px;"><div class="spinner-ring" style="width:20px; height:20px;"></div></div>';

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const img = new Image();
      img.src = e.target.result;
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 400;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
        } else {
          if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
        }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

        const res = await fetch(`${API}/api/admin/groups/${groupId}/icon`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ icon: dataUrl })
        });

        if (res.ok) {
          const data = await res.json();
          container.innerHTML = getAvatarHtml(data.icon, 'Group', 48, '8px');
          // Update cached allGroups if needed
          const g = allGroups.find(x => x._id === groupId);
          if (g) g.icon = data.icon;
        } else {
          alert('Failed to update group icon');
          container.innerHTML = originalHtml;
        }
      };
    } catch (err) {
      console.error(err);
      container.innerHTML = originalHtml;
    }
  };
  reader.readAsDataURL(file);
}

// Initial load
if (window.location.pathname.includes('admin-dashboard.html')) {
  loadReviews();
}

/* ============================================================
   BADGE MANAGEMENT LOGIC
   ============================================================ */
let allBadges = [];
let selectedBadgeImage = null;

async function loadBadges() {
  const grid = document.getElementById('badges-grid');
  grid.innerHTML = '<p>Loading badges...</p>';
  try {
    const res = await fetch(`${API}/api/admin/badges`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      allBadges = await res.json();
      renderBadges(allBadges);
    }
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<p style="color:red">Failed to load badges.</p>';
  }
}

function renderBadges(badges) {
  const grid = document.getElementById('badges-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (badges.length === 0) {
    grid.innerHTML = '<p>No badges found. Create some to motivate users!</p>';
    return;
  }

  badges.forEach((b, index) => {
    const card = document.createElement('div');
    card.className = 'review-card';
    card.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; text-align: center; gap: 15px;">
        <div style="width: 100px; height: 100px; border: 3px solid var(--black); box-shadow: 4px 4px 0 var(--black); overflow: hidden; background: #fff;">
          <img src="${b.image}" style="width: 100%; height: 100%; object-fit: contain;">
        </div>
        <div>
          <h4 style="font-family: 'Space Grotesk'; font-weight: 900; font-size: 18px; margin-bottom: 5px;">${b.name}</h4>
          <span class="badge" style="background: var(--yellow); font-size: 12px; padding: 5px 10px;">${b.requiredDays} DAYS</span>
        </div>
        <div class="card-actions" style="width: 100%; margin-top: 10px;">
          <button class="btn-action btn-edit" onclick="openBadgeModal(${index})"><i data-lucide="edit-3"></i> Edit</button>
          <button class="btn-action btn-delete" onclick="deleteBadge('${b._id}')"><i data-lucide="trash-2"></i> Delete</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  if (window.lucide) {
    lucide.createIcons({ root: grid });
  }
}

function openBadgeModal(index = null) {
  const modal = document.getElementById('badge-modal');
  const title = document.getElementById('badge-modal-title');
  const form = document.getElementById('badge-form');
  const previewImg = document.getElementById('badge-preview-img');
  const placeholder = document.getElementById('badge-preview-placeholder');
  const statusEl = document.getElementById('badge-upload-status');

  if (statusEl) statusEl.textContent = '';
  form.reset();
  selectedBadgeImage = null;
  document.getElementById('badge-id').value = '';
  previewImg.src = '';
  previewImg.style.display = 'none';
  placeholder.style.display = 'block';

  if (index !== null) {
    const b = allBadges[index];
    title.textContent = 'Edit Streak Badge';
    document.getElementById('badge-id').value = b._id;
    document.getElementById('badge-name').value = b.name;
    document.getElementById('badge-days').value = b.requiredDays;
    previewImg.src = b.image;
    previewImg.style.display = 'block';
    placeholder.style.display = 'none';
  } else {
    title.textContent = 'Add Streak Badge';
  }

  modal.classList.add('open');
}

function closeBadgeModal() {
  document.getElementById('badge-modal').classList.remove('open');
}

function handleBadgeImageSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  const statusEl = document.getElementById('badge-upload-status');
  const saveBtn = document.getElementById('btn-save-badge');

  reader.onload = (e) => {
    selectedBadgeImage = e.target.result;
    const previewImg = document.getElementById('badge-preview-img');
    const placeholder = document.getElementById('badge-preview-placeholder');
    previewImg.src = selectedBadgeImage;
    previewImg.style.display = 'block';
    placeholder.style.display = 'none';

    if (statusEl) {
      statusEl.style.color = 'var(--green)';
      statusEl.textContent = '✅ Image ready for upload';
    }
  };
  reader.readAsDataURL(file);
}

document.getElementById('badge-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('badge-id').value;
  const name = document.getElementById('badge-name').value;
  const requiredDays = document.getElementById('badge-days').value;
  const statusEl = document.getElementById('badge-upload-status');
  const btn = document.getElementById('btn-save-badge');
  
  const payload = { 
    name, 
    requiredDays: parseInt(requiredDays), 
    image: selectedBadgeImage 
  };
  
  try {
    if (statusEl) {
      statusEl.style.color = 'var(--purple)';
      statusEl.textContent = '🚀 Uploading to Cloudinary...';
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Uploading...';
    }

    const url = id ? `${API}/api/admin/badges/${id}` : `${API}/api/admin/badges`;
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method: method,
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      if (statusEl) statusEl.textContent = '';
      closeBadgeModal();
      loadBadges();
    } else {
      const data = await res.json();
      alert(data.message || 'Action failed');
      if (statusEl) {
        statusEl.style.color = 'var(--red)';
        statusEl.textContent = '❌ Upload failed';
      }
    }
  } catch (err) {
    console.error('Submit error:', err);
    if (statusEl) {
      statusEl.style.color = 'var(--red)';
      statusEl.textContent = '❌ Network error';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save Badge';
    }
  }
});

async function deleteBadge(id) {
  if (!confirm('Are you sure you want to delete this badge?')) return;

  try {
    const res = await fetch(`${API}/api/admin/badges/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      loadBadges();
    } else {
      alert('Failed to delete badge');
    }
  } catch (err) {
    console.error('Delete error:', err);
  }
}

async function loadCoupons() {
  const tbody = document.getElementById('coupons-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="padding:16px; text-align:center; font-weight:800;">Loading coupons...</td></tr>';

  try {
    const res = await fetch(`${API}/api/admin/coupons`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 401 || res.status === 403) {
      logout();
      return;
    }

    const coupons = await res.json();
    tbody.innerHTML = '';

    if (!coupons || coupons.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding:16px; text-align:center; font-weight:800; color:#666;">No coupons generated yet.</td></tr>';
      return;
    }

    coupons.forEach((c) => {
      const redeemedBy = c.isUsed && c.usedBy 
        ? `<div style="font-weight:800;">${c.usedBy.name}</div><div style="font-size:11px; color:#666;">@${c.usedBy.username || ''}</div>`
        : '<span style="color:#888;">—</span>';
      
      const redeemedAt = c.isUsed && c.usedAt 
        ? new Date(c.usedAt).toLocaleString()
        : '<span style="color:#888;">—</span>';

      const statusHtml = c.isUsed 
        ? '<span class="badge" style="background:#ef4444; color:white;">REDEEMED</span>'
        : '<span class="badge" style="background:#22c55e; color:white;">UNUSED</span>';

      const durationLabel = c.duration === '1_month' ? '1 Month Premium' : '1 Year Premium';

      const row = document.createElement('tr');
      row.style.borderBottom = '1px solid #eee';
      row.innerHTML = `
        <td data-label="Promo Code" style="padding:12px; font-weight:900; font-family:monospace; font-size:14px; letter-spacing:0.5px;">
          ${c.code}
          <button onclick="navigator.clipboard.writeText('${c.code}'); alert('Coupon copied to clipboard!');" style="margin-left:8px; padding:2px 6px; font-size:10px; font-weight:800; background:#eee; border:1px solid #000; cursor:pointer; text-transform:uppercase;">Copy</button>
        </td>
        <td data-label="Duration" style="padding:12px; font-weight:800; font-size:13px;">${durationLabel}</td>
        <td data-label="Status" style="padding:12px; text-align:center;">${statusHtml}</td>
        <td data-label="Redeemed By" style="padding:12px; font-size:13px;">${redeemedBy}</td>
        <td data-label="Redeemed At" style="padding:12px; font-size:13px; color:#555;">${redeemedAt}</td>
        <td data-label="Actions" style="padding:12px; text-align:right;">
          <button class="btn-action btn-delete" style="flex:none; padding:6px 12px; border:2px solid #000; box-shadow:2px 2px 0 #000;" onclick="deleteCoupon('${c._id}')">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });

    if (window.lucide) {
      lucide.createIcons({ root: tbody });
    }
  } catch (err) {
    console.error('Error loading coupons:', err);
    tbody.innerHTML = '<tr><td colspan="6" style="padding:16px; text-align:center; font-weight:800; color:red;">Failed to load coupons.</td></tr>';
  }
}

async function generateCoupon() {
  const durationSelect = document.getElementById('coupon-duration-select');
  if (!durationSelect) return;
  const duration = durationSelect.value;

  try {
    const res = await fetch(`${API}/api/admin/coupons`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ duration })
    });

    if (res.ok) {
      const coupon = await res.json();
      alert(`Success! Generated coupon: ${coupon.code}`);
      loadCoupons();
    } else {
      const data = await res.json();
      alert(data.message || 'Failed to generate coupon.');
    }
  } catch (err) {
    console.error('Error generating coupon:', err);
    alert('Failed to generate coupon due to network error.');
  }
}

async function deleteCoupon(id) {
  if (!confirm('Are you sure you want to delete/revoke this coupon?')) return;

  try {
    const res = await fetch(`${API}/api/admin/coupons/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      loadCoupons();
    } else {
      alert('Failed to delete coupon.');
    }
  } catch (err) {
    console.error('Error deleting coupon:', err);
  }
}

/* ============================================================
   PAYMENTS & BILLING MANAGEMENT
   ============================================================ */

async function loadPayments() {
  const grid = document.getElementById('payments-grid');
  if (!grid) return;
  grid.innerHTML = '<p style="font-weight:800; color:#666;">Querying real-time payment portal...</p>';

  try {
    const page = currentPages.payments;
    const res = await fetch(`${API}/api/admin/payments?page=${page}&limit=10`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      const data = await res.json();
      const payments = data.items || [];
      renderPayments(payments, 'payments-grid');
      renderPaginationControls(data, 'payments-pagination', 'payments', loadPayments);
    } else {
      grid.innerHTML = '<p style="font-weight:800; color:red;">Failed to retrieve transaction records.</p>';
    }
  } catch (err) {
    console.error('loadPayments error:', err);
    grid.innerHTML = '<p style="font-weight:800; color:red;">Connection error while loading payments.</p>';
  }
}

function renderPayments(payments, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  if (!payments.length) {
    container.innerHTML = '<p style="font-weight:800; color:#666; padding: 20px; text-align:center;">No payment records found.</p>';
    return;
  }

  payments.forEach(p => {
    const amount = (p.amount / 100).toFixed(2);
    const date = new Date(p.created_at * 1000).toLocaleString();
    const card = document.createElement('div');
    card.className = 'review-card';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '12px';

    // Status colors
    let statusBg = '#ccc';
    let statusColor = '#000';
    if (p.status === 'captured') { statusBg = 'var(--green)'; statusColor = 'var(--black)'; }
    else if (p.status === 'failed') { statusBg = '#ef4444'; statusColor = '#fff'; }
    else if (p.status === 'refunded') { statusBg = 'var(--blue)'; statusColor = '#fff'; }

    // User section HTML
    let userHtml = `
      <div style="display:flex; align-items:center; gap:8px;">
        <div class="avatar-initial" style="width:30px; height:30px; font-size:12px; border-radius:50%; background:#eee; color:#666;">?</div>
        <div>
          <span style="font-weight:800;">Guest Payer</span>
          <span style="font-size:10px; color:#999; margin-left:6px;">(Not registered)</span>
        </div>
      </div>
    `;

    if (p.user) {
      userHtml = `
        <div style="display:flex; align-items:center; gap:8px;">
          ${getAvatarHtml(p.user.profilePicture, p.user.name, 30)}
          <div>
            <span style="font-weight:900; font-family:'Space Grotesk'; color:var(--black);">${p.user.name}</span>
            <button onclick="closeUserModal(); openUserModal('${p.user._id}')" style="background:none; border:none; text-decoration:underline; font-size:11px; font-weight:800; color:var(--blue); cursor:pointer; margin-left:8px;">Manage</button>
          </div>
        </div>
      `;
    }

    // Payment details helper
    let detailsStr = '';
    if (p.method === 'card' && p.card) {
      detailsStr = `💳 Card: ${p.card.network.toUpperCase()} ending in ${p.card.last4} (${p.card.type.toUpperCase()})`;
    } else if (p.method === 'netbanking') {
      detailsStr = `🏛️ Netbanking: ${p.bank || 'Unknown Bank'}`;
    } else if (p.method === 'upi') {
      detailsStr = `📱 UPI: ${p.vpa || 'VPA'}`;
    } else if (p.method === 'wallet') {
      detailsStr = `👜 Wallet: ${p.wallet || 'Wallet'}`;
    } else {
      detailsStr = `💰 Method: ${p.method.toUpperCase()}`;
    }

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 2px dashed #eee; padding-bottom: 8px;">
        ${userHtml}
        <span class="badge" style="background:${statusBg}; color:${statusColor};">${p.status.toUpperCase()}</span>
      </div>
      <div>
        <div style="font-size:13px; font-weight:700; color:#555; margin-bottom:4px;">Transaction ID: <span style="font-family:monospace; font-weight:800; color:#000;">${p.id}</span></div>
        <div style="font-size:13px; font-weight:700; color:#555; margin-bottom:4px;">Order ID: <span style="font-family:monospace; font-weight:800; color:#000;">${p.order_id || 'N/A'}</span></div>
        <div style="font-size:13px; font-weight:700; color:#555; margin-bottom:4px;">Paid Amount: <span style="font-weight:900; color:var(--purple); font-size:14px;">₹${amount} ${p.currency}</span></div>
      </div>
      <div style="background:#f9f9f9; border:2px solid #000; border-radius:8px; padding:10px; font-size:12px; font-weight:700; color:#333;">
        <div>${detailsStr}</div>
        <div style="margin-top:4px; font-size:11px; color:#666;">Date: ${date}</div>
        <div style="margin-top:4px; font-size:11px; color:#666;">Email: ${p.email || 'N/A'}</div>
        <div style="margin-top:4px; font-size:11px; color:#666;">Contact: ${p.contact || 'N/A'}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

async function loadUserPayments(userId) {
  const container = document.getElementById('user-payments-list');
  if (!container) return;

  try {
    const res = await fetch(`${API}/api/admin/users/${userId}/payments`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      const payments = await res.json();
      container.innerHTML = '';
      if (!payments.length) {
        container.innerHTML = '<p style="font-weight:800; color:#666; text-align:center; padding:10px;">No payments found for this user.</p>';
        return;
      }
      
      payments.forEach(p => {
        const amount = (p.amount / 100).toFixed(2);
        const date = new Date(p.created_at * 1000).toLocaleString();
        
        let statusBg = '#ccc';
        let statusColor = '#000';
        if (p.status === 'captured') { statusBg = 'var(--green)'; statusColor = 'var(--black)'; }
        else if (p.status === 'failed') { statusBg = '#ef4444'; statusColor = '#fff'; }
        
        const card = document.createElement('div');
        card.style.padding = '14px';
        card.style.border = '2px solid #000';
        card.style.borderRadius = '10px';
        card.style.background = '#fff';
        card.style.boxShadow = '2px 2px 0 #000';
        
        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:6px;">
            <span style="font-family:monospace; font-weight:800; font-size:12px;">ID: ${p.id}</span>
            <span class="badge" style="background:${statusBg}; color:${statusColor}; font-size:9px; padding:2px 6px;">${p.status.toUpperCase()}</span>
          </div>
          <div style="font-size:12px; font-weight:700; color:#444;">
            <div>Amount: <span style="font-weight:900; color:var(--purple);">₹${amount} ${p.currency}</span></div>
            <div style="margin-top:2px;">Method: ${p.method.toUpperCase()} ${p.card ? `(${p.card.network.toUpperCase()})` : ''}</div>
            <div style="margin-top:2px; font-size:11px; color:#666;">Date: ${date}</div>
          </div>
        `;
        container.appendChild(card);
      });
    } else {
      container.innerHTML = '<p style="font-weight:800; color:red; text-align:center; padding:10px;">Failed to load user transactions.</p>';
    }
  } catch (err) {
    console.error('loadUserPayments error:', err);
    container.innerHTML = '<p style="font-weight:800; color:red; text-align:center; padding:10px;">Connection error loading transactions.</p>';
  }
}

function renderPaginationControls(data, containerId, tabKey, fetchFunc) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  if (data.totalPages <= 1) return;

  // Prev Button
  const prevBtn = document.createElement('button');
  prevBtn.className = 'btn-control';
  prevBtn.innerHTML = '← Prev';
  prevBtn.disabled = data.page <= 1;
  prevBtn.style.boxShadow = data.page <= 1 ? 'none' : '2px 2px 0 #000';
  prevBtn.style.opacity = data.page <= 1 ? '0.5' : '1';
  prevBtn.style.cursor = data.page <= 1 ? 'not-allowed' : 'pointer';
  prevBtn.onclick = () => {
    currentPages[tabKey] = data.page - 1;
    fetchFunc();
  };

  // Indicator
  const indicator = document.createElement('span');
  indicator.style.fontWeight = '800';
  indicator.style.fontSize = '13px';
  indicator.style.textTransform = 'uppercase';
  indicator.textContent = `Page ${data.page} of ${data.totalPages}`;

  // Next Button
  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn-control';
  nextBtn.innerHTML = 'Next →';
  nextBtn.disabled = data.page >= data.totalPages;
  nextBtn.style.boxShadow = data.page >= data.totalPages ? 'none' : '2px 2px 0 #000';
  nextBtn.style.opacity = data.page >= data.totalPages ? '0.5' : '1';
  nextBtn.style.cursor = data.page >= data.totalPages ? 'not-allowed' : 'pointer';
  nextBtn.onclick = () => {
    currentPages[tabKey] = data.page + 1;
    fetchFunc();
  };

  container.appendChild(prevBtn);
  container.appendChild(indicator);
  container.appendChild(nextBtn);
}

/* ============================================================
   REFUNDS MANAGER
   ============================================================ */

// In-memory store for currently viewed refund requests
let _refundRequests = [];

async function loadRefunds() {
  const tbody = document.getElementById('refunds-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px; font-weight:800; color:#666;">Loading refund requests...</td></tr>';

  try {
    const res = await fetch(`${API}/api/admin/refunds`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 401 || res.status === 403) { logout(); return; }

    const data = await res.json();
    _refundRequests = data.refunds || data || [];
    renderRefunds(_refundRequests);
  } catch (err) {
    console.error('loadRefunds error:', err);
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px; font-weight:800; color:red;">Connection error loading refunds.</td></tr>';
  }
}

function renderRefunds(requests) {
  const tbody = document.getElementById('refunds-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  // ── Metrics ──────────────────────────────────────────────
  const pending = requests.filter(r => r.refundStatus === 'requested').length;
  const approved = requests.filter(r => r.refundStatus === 'approved').length;
  const rejected = requests.filter(r => r.refundStatus === 'rejected').length;
  const totalAmt = requests.filter(r => r.refundStatus === 'approved').reduce((sum, r) => sum + (r.payment ? r.payment.amount : 0), 0);

  const setPEl = id => { const el = document.getElementById(id); if (el) el.textContent = id === 'metric-total-amt' ? `₹${totalAmt}` : (id === 'metric-pending' ? pending : id === 'metric-approved' ? approved : rejected); };
  setPEl('metric-pending'); setPEl('metric-approved'); setPEl('metric-rejected');
  const amtEl = document.getElementById('metric-total-amt'); if (amtEl) amtEl.textContent = `₹${totalAmt}`;

  if (!requests.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:28px; font-weight:800; color:#666;">🎉 No pending refund requests found.</td></tr>';
    return;
  }

  requests.forEach(r => {
    const p = r.payment || {};
    const purchasedAt = p.purchasedAt ? new Date(p.purchasedAt) : null;
    const requestedAt = r.refundRequestedAt ? new Date(r.refundRequestedAt) : null;

    const purchasedStr = purchasedAt ? purchasedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
    const requestedStr = requestedAt ? requestedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

    // Elapsed time since purchase
    let elapsedStr = '—';
    let elapsedColor = 'var(--green)';
    if (purchasedAt) {
      const elapsedMs = Date.now() - purchasedAt.getTime();
      const elapsedHrs = Math.floor(elapsedMs / (1000 * 60 * 60));
      const elapsedMins = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
      elapsedStr = `${elapsedHrs}h ${elapsedMins}m`;
      if (elapsedHrs >= 36) elapsedColor = '#ef4444';
      else if (elapsedHrs >= 24) elapsedColor = 'var(--orange)';
    }

    // Abuse utilization summary
    const logs = r.premiumUsageLogs || [];
    const voiceParseLogs = logs.filter(l => l.actionType === 'voice_parse' && l.razorpayPaymentId === p.paymentId);
    const graceLogs = logs.filter(l => l.actionType === 'grace_apply' && l.razorpayPaymentId === p.paymentId);
    const photoLogs = logs.filter(l => l.actionType === 'photo_extract' && l.razorpayPaymentId === p.paymentId);
    const totalAbuseFlags = voiceParseLogs.length + graceLogs.length + photoLogs.length;

    let abuseBadgesHtml = '';
    if (voiceParseLogs.length) abuseBadgesHtml += `<span class="refund-abuse-pill" style="background:#fef9c3; color:#a16207;">🎤 Voice x${voiceParseLogs.length}</span> `;
    if (graceLogs.length) abuseBadgesHtml += `<span class="refund-abuse-pill" style="background:#fce7f3; color:#be185d;">🛡️ Grace x${graceLogs.length}</span> `;
    if (photoLogs.length) abuseBadgesHtml += `<span class="refund-abuse-pill" style="background:#e0f2fe; color:#0369a1;">📸 Photo x${photoLogs.length}</span> `;
    if (!abuseBadgesHtml) abuseBadgesHtml = '<span class="refund-abuse-pill" style="background:#dcfce7; color:#15803d;">✅ Clean</span>';

    // Status pill color
    let statusPill = '';
    if (r.refundStatus === 'requested') statusPill = `<span style="background: var(--orange); color:#000; font-size:10px; font-weight:900; padding:2px 8px; border:2px solid #000; border-radius:4px;">PENDING</span>`;
    else if (r.refundStatus === 'approved') statusPill = `<span style="background: var(--green); color:#000; font-size:10px; font-weight:900; padding:2px 8px; border:2px solid #000; border-radius:4px;">APPROVED</span>`;
    else if (r.refundStatus === 'rejected') statusPill = `<span style="background: #ef4444; color:#fff; font-size:10px; font-weight:900; padding:2px 8px; border:2px solid #000; border-radius:4px;">REJECTED</span>`;

    // Plan label
    const planLabel = p.duration === '1_month' ? 'Monthly Pass' : p.duration === '1_year' ? 'Annual Pass' : p.duration || 'Premium';
    const avatarSrc = r.profilePicture;
    const avatarHtml = avatarSrc
      ? `<img src="${avatarSrc}" style="width:32px; height:32px; border-radius:50%; border:2px solid #000; object-fit:cover;" onerror="this.outerHTML='<div class=\'avatar-initial\' style=\'width:32px;height:32px;font-size:12px;border-radius:50%;font-weight:900;\'>${(r.name||'?')[0].toUpperCase()}</div>'">`
      : `<div class="avatar-initial" style="width:32px; height:32px; font-size:13px; border-radius:50%; font-weight:900;">${(r.name||'?')[0].toUpperCase()}</div>`;

    // Action buttons — only show approve/reject if status is 'requested'
    let actionHtml = '';
    if (r.refundStatus === 'requested') {
      const safeId = String(r._id).replace(/'/g, '');
      const safePayId = String(p.paymentId || '').replace(/'/g, '');
      const safeName = String(r.name || r.username || '').replace(/'/g, '').replace(/"/g, '');
      actionHtml = `
        <div style="display:flex; gap:6px; justify-content:flex-end; flex-wrap:wrap;">
          <button class="btn-action btn-edit" style="background:var(--green);" title="Approve & trigger Razorpay payout" onclick="adminApproveRefund('${safeId}', '${safeName}')">
            ✓ Approve
          </button>
          <button class="btn-action btn-delete" title="Reject with reason" onclick="openRejectModal('${safeId}', '${safeName}', '${safePayId}')">
            ✗ Reject
          </button>
        </div>`;
    } else {
      actionHtml = `<span style="font-size:11px; font-weight:800; color:#999; text-transform:uppercase;">${r.refundStatus}</span>`;
    }

    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #eee';
    tr.innerHTML = `
      <td data-label="User" style="padding:12px;">
        <div style="display:flex; align-items:center; gap:8px;">
          ${avatarHtml}
          <div>
            <div style="font-weight:900; font-size:13px;">${r.name || r.username || 'Unknown'}</div>
            <div style="font-size:11px; color:#666;">${r.email || ''}</div>
            <div style="margin-top:2px;">${statusPill}</div>
          </div>
        </div>
      </td>
      <td data-label="Plan / Amount" style="padding:12px;">
        <div style="font-weight:900; font-size:13px;">${planLabel}</div>
        <div style="font-weight:900; color:var(--purple); font-size:16px;">₹${p.amount || '—'}</div>
      </td>
      <td data-label="Payment ID" style="padding:12px;">
        <span style="font-family:monospace; font-size:11px; color:#555; word-break:break-all;">${p.paymentId || '—'}</span>
      </td>
      <td data-label="Purchased At" style="padding:12px; text-align:center; font-size:12px; font-weight:700;">${purchasedStr}</td>
      <td data-label="Elapsed" style="padding:12px; text-align:center; font-weight:900; color:${elapsedColor};">${elapsedStr}</td>
      <td data-label="Requested At" style="padding:12px; text-align:center; font-size:12px; font-weight:700;">${requestedStr}</td>
      <td data-label="Abuse Flags" style="padding:12px; text-align:center;">
        <div style="display:flex; flex-wrap:wrap; gap:4px; justify-content:center;">${abuseBadgesHtml}</div>
        ${totalAbuseFlags > 0 ? `<div style="font-size:10px; color:#ef4444; font-weight:900; margin-top:4px;">⚠️ ${totalAbuseFlags} ACTION(S) FLAGGED</div>` : ''}
        <button class="btn-action" style="background:#e2e8f0; color:#000; font-size:10px; padding:4px 8px; margin-top:6px; font-weight:900; cursor:pointer;" onclick="toggleLogDrawer('${r._id}')">
          👁 View Logs
        </button>
      </td>
      <td data-label="Actions" style="padding:12px; text-align:right;">${actionHtml}</td>
    `;

    // Activity logs list or sub-table for the drawer
    let logsHtml = '';
    if (logs.length > 0) {
      logsHtml = `
        <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; background: #fff; font-size: 12px; text-align: left; box-shadow: 2px 2px 0 #000; margin-top: 5px;">
          <thead>
            <tr style="background: #f3f4f6; border-bottom: 2px solid #000;">
              <th style="padding: 6px 8px; border-right: 1px solid #000; font-weight: 900;">Timestamp</th>
              <th style="padding: 6px 8px; border-right: 1px solid #000; font-weight: 900;">Action Type</th>
              <th style="padding: 6px 8px; font-weight: 900;">Details</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(log => {
              let badgeBg = '#fef9c3';
              let badgeColor = '#a16207';
              let actionName = '🎤 Voice AI';
              if (log.actionType === 'grace_apply') {
                badgeBg = '#fce7f3';
                badgeColor = '#be185d';
                actionName = '🛡️ Grace Protect';
              } else if (log.actionType === 'photo_extract') {
                badgeBg = '#e0f2fe';
                badgeColor = '#0369a1';
                actionName = '📸 Photo Extract';
              }
              return `
                <tr style="border-bottom: 1px solid #000;">
                  <td style="padding: 6px 8px; border-right: 1px solid #000; font-family: monospace; white-space: nowrap;">
                    ${new Date(log.timestamp).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td style="padding: 6px 8px; border-right: 1px solid #000;">
                    <span style="display: inline-block; padding: 2px 6px; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid #000; border-radius: 4px; font-weight: 900; font-size: 10px;">
                      ${actionName}
                    </span>
                  </td>
                  <td style="padding: 6px 8px; font-weight: 700; color: #111;">${log.details || ''}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    } else {
      logsHtml = `
        <div style="padding: 12px; background: #f0fdf4; border: 2px dashed #16a34a; color: #16a34a; font-weight: 900; border-radius: 4px; text-align: center;">
          ✅ Clean Request: No premium features utilized since activation.
        </div>
      `;
    }

    const drawerTr = document.createElement('tr');
    drawerTr.id = `log-drawer-${r._id}`;
    drawerTr.style.display = 'none';
    drawerTr.style.background = '#f9fafb';
    drawerTr.innerHTML = `
      <td colspan="8" style="padding: 16px; border-bottom: 2px solid #000; border-top: 1px solid #ddd;">
        <div style="margin-bottom: 16px; padding: 14px; background: #fffbeb; border: 2px solid #000; border-radius: 6px; box-shadow: 2px 2px 0 #000; font-family: inherit;">
          <p style="margin: 0 0 6px 0; font-weight: 900; color: #b45309; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">✍️ Customer Cancellation Reason:</p>
          <p style="margin: 0; font-size: 13px; font-weight: 700; font-style: italic; color: #1f2937;">"${r.refundReason || 'No reason provided.'}"</p>
        </div>
        <div style="font-weight: 900; font-size: 13px; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px; color: #374151; display: flex; align-items: center; gap: 6px;">
          📋 Premium Utilization Activity Logs for Payment <span style="font-family: monospace; background: #e5e7eb; padding: 2px 6px; border: 1px solid #000; border-radius: 4px; font-size: 11px;">${p.paymentId || '—'}</span>
        </div>
        ${logsHtml}
      </td>
    `;

    tbody.appendChild(tr);
    tbody.appendChild(drawerTr);
  });
}

async function adminApproveRefund(userId, userName) {
  if (!confirm(`Approve refund for ${userName}? This will trigger an immediate Razorpay payout and downgrade their account to Free tier.`)) return;

  try {
    const res = await fetch(`${API}/api/admin/refunds/${userId}/approve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });

    const data = await res.json();
    if (res.ok) {
      alert(`✅ Refund approved! Razorpay payout initiated for ${userName}. User has been downgraded to Free tier.`);
      loadRefunds();
    } else {
      alert(`❌ Failed to approve refund: ${data.message || res.status}`);
    }
  } catch (err) {
    console.error('adminApproveRefund error:', err);
    alert('Connection error while approving refund.');
  }
}

function openRejectModal(userId, userName, paymentId) {
  document.getElementById('reject-user-id').value = userId;
  document.getElementById('reject-user-name').textContent = userName;
  document.getElementById('reject-payment-id').textContent = paymentId;
  document.getElementById('reject-reason-input').value = '';
  const modal = document.getElementById('refund-reject-modal');
  if (modal) modal.classList.add('open');
}

function closeRejectModal() {
  const modal = document.getElementById('refund-reject-modal');
  if (modal) modal.classList.remove('open');
}

async function submitRejectRefund() {
  const userId = document.getElementById('reject-user-id').value;
  const reason = document.getElementById('reject-reason-input').value.trim();
  const userName = document.getElementById('reject-user-name').textContent;

  if (!reason) {
    alert('Please provide a rejection reason before submitting.');
    return;
  }

  const btn = document.getElementById('btn-submit-reject');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const res = await fetch(`${API}/api/admin/refunds/${userId}/reject`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });

    const data = await res.json();
    if (res.ok) {
      closeRejectModal();
      alert(`✅ Rejection sent to ${userName}. Their Premium tier remains active until standard expiry.`);
      loadRefunds();
    } else {
      alert(`❌ Failed to reject refund: ${data.message || res.status}`);
    }
  } catch (err) {
    console.error('submitRejectRefund error:', err);
    alert('Connection error while submitting rejection.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Rejection';
  }
}

function toggleLogDrawer(userId) {
  const drawer = document.getElementById(`log-drawer-${userId}`);
  if (!drawer) return;
  const isHidden = drawer.style.display === 'none';
  drawer.style.display = isHidden ? 'table-row' : 'none';
}
window.toggleLogDrawer = toggleLogDrawer;

// ── Reports Manager Triage Logic ───────────────────────────
async function loadReports() {
  const searchInput = document.getElementById('report-search');
  const catFilter = document.getElementById('report-filter-category');
  const statusFilter = document.getElementById('report-filter-status');
  const tbody = document.getElementById('reports-table-body');

  if (!tbody) return;

  const search = searchInput ? searchInput.value.trim() : '';
  const category = catFilter ? catFilter.value : '';
  const status = statusFilter ? statusFilter.value : '';

  let queryStr = '';
  const params = [];
  if (search) params.push(`search=${encodeURIComponent(search)}`);
  if (category) params.push(`category=${category}`);
  if (status) params.push(`status=${status}`);
  if (params.length) queryStr = '?' + params.join('&');

  try {
    const res = await fetch(`${API}/api/admin/reports${queryStr}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 401 || res.status === 403) {
      logout();
      return;
    }

    const reports = await res.json();
    
    // Update metrics
    let pendingCount = 0;
    let progressCount = 0;
    let resolvedCount = 0;

    reports.forEach(r => {
      if (r.status === 'Pending') pendingCount++;
      else if (r.status === 'In Progress') progressCount++;
      else if (r.status === 'Resolved') resolvedCount++;
    });

    document.getElementById('report-metric-pending').textContent = pendingCount;
    document.getElementById('report-metric-progress').textContent = progressCount;
    document.getElementById('report-metric-resolved').textContent = resolvedCount;
    document.getElementById('report-metric-total').textContent = reports.length;

    if (!reports.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; font-weight:800; color:#666;">No reports found matching criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    reports.forEach(r => {
      const date = new Date(r.createdAt).toLocaleString();
      
      // Status pill
      let statusStyle = '';
      if (r.status === 'Pending') statusStyle = 'background: #facc15; border: 2px solid #000; color: #000;';
      else if (r.status === 'In Progress') statusStyle = 'background: #60a5fa; border: 2px solid #000; color: #fff;';
      else if (r.status === 'Resolved') statusStyle = 'background: #4ade80; border: 2px solid #000; color: #000;';

      const statusPill = `<span class="badge" style="padding: 4px 8px; font-size: 11px; font-weight: 800; border-radius: 4px; box-shadow: 2px 2px 0 #000; text-transform: uppercase; ${statusStyle}">${r.status}</span>`;

      // Category badge color
      let catBg = '#eee';
      if (r.category === 'Bug') catBg = '#fca5a5';
      else if (r.category === 'UI') catBg = '#fef08a';
      else if (r.category === 'Payment') catBg = '#86efac';
      else if (r.category === 'Feature') catBg = '#c084fc';
      
      const catBadge = `<span class="badge" style="background: ${catBg}; border: 2px solid #000; color: #000; font-weight: 800; box-shadow: 2px 2px 0 #000;">${r.category}</span>`;

      const row = document.createElement('tr');
      row.style.borderBottom = '1px solid #eee';
      row.innerHTML = `
        <td data-label="Category" style="padding: 12px; vertical-align: middle;">${catBadge}</td>
        <td data-label="Status" style="padding: 12px; text-align: center; vertical-align: middle;">${statusPill}</td>
        <td data-label="User Info" style="padding: 12px; vertical-align: middle;">
          <div style="font-weight: 800;">${r.username}</div>
          <div style="font-size: 11px; color: var(--blue); font-weight: 700;">${r.email}</div>
        </td>
        <td data-label="Description" style="padding: 12px; vertical-align: middle; max-width: 400px; white-space: normal; word-wrap: break-word; font-weight: 600;">
          ${r.description}
        </td>
        <td data-label="Created At" style="padding: 12px; text-align: center; vertical-align: middle; font-size: 12px; font-weight: 700; color: #666;">
          ${date}
        </td>
        <td data-label="Actions" style="padding: 12px; text-align: right; vertical-align: middle;">
          <div style="display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap;">
            ${r.status !== 'In Progress' && r.status !== 'Resolved' ? `
              <button class="btn-action" style="padding: 4px 8px; font-size: 11px; background: var(--blue); color: white; border: 2px solid #000; box-shadow: 2px 2px 0 #000; font-weight: 800;" onclick="updateReportStatus('${r._id}', 'In Progress')">Work On</button>
            ` : ''}
            ${r.status !== 'Resolved' ? `
              <button class="btn-action" style="padding: 4px 8px; font-size: 11px; background: var(--green); color: black; border: 2px solid #000; box-shadow: 2px 2px 0 #000; font-weight: 800;" onclick="updateReportStatus('${r._id}', 'Resolved')">Resolve</button>
            ` : ''}
            <button class="btn-action btn-delete" style="padding: 4px 8px; font-size: 11px; border: 2px solid #000; box-shadow: 2px 2px 0 #000; font-weight: 800; background: #ef4444; color: white;" onclick="deleteReport('${r._id}')">Delete</button>
          </div>
        </td>
      `;
      tbody.appendChild(row);
    });

  } catch (err) {
    console.error('Error loading reports:', err);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; font-weight:800; color: #ef4444;">Failed to load reports.</td></tr>`;
  }
}

async function updateReportStatus(id, newStatus) {
  try {
    const res = await fetch(`${API}/api/admin/reports/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status: newStatus })
    });

    if (res.ok) {
      loadReports();
    } else {
      const data = await res.json();
      alert(data.message || 'Failed to update report status.');
    }
  } catch (err) {
    console.error('updateReportStatus error:', err);
    alert('Connection error while updating status.');
  }
}

async function deleteReport(id) {
  if (!confirm('Are you sure you want to permanently delete this report?')) return;

  try {
    const res = await fetch(`${API}/api/admin/reports/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      loadReports();
    } else {
      const data = await res.json();
      alert(data.message || 'Failed to delete report.');
    }
  } catch (err) {
    console.error('deleteReport error:', err);
    alert('Connection error while deleting report.');
  }
}

window.loadReports = loadReports;
window.updateReportStatus = updateReportStatus;
window.deleteReport = deleteReport;

// ============================================================
// CHANGELOG MANAGEMENT
// ============================================================

let allChangelogs = [];
const escapeHTML = (str) => {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
};

async function loadChangelogs() {
  const tbody = document.getElementById('changelogs-table-body');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; font-weight:800; color:#666;">Loading changelogs...</td></tr>';
  }
  try {
    const res = await fetch(`${API}/api/admin/changelogs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      allChangelogs = await res.json();
      renderChangelogs(allChangelogs);
    } else {
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:red; font-weight:800;">Failed to load changelogs.</td></tr>';
      }
    }
  } catch (err) {
    console.error(err);
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:red; font-weight:800;">Connection error loading changelogs.</td></tr>';
    }
  }
}

function renderChangelogs(changelogs) {
  const tbody = document.getElementById('changelogs-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (changelogs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; font-weight:800; color:#666;">No changelogs found. Create one to notify users!</td></tr>';
    return;
  }

  changelogs.forEach(c => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #eee';

    const formattedDate = new Date(c.createdAt).toLocaleString();
    const typeBadge = c.type === 'major' 
      ? '<span class="badge" style="background: var(--blue); color: white; font-weight: 800; border-radius: 4px; padding: 2px 6px;">MAJOR</span>'
      : '<span class="badge" style="background: #e2e8f0; color: #475569; font-weight: 800; border-radius: 4px; padding: 2px 6px;">MINOR</span>';

    tr.innerHTML = `
      <td style="padding: 12px; font-size: 13px; font-weight: 700; color: #555;">${formattedDate}</td>
      <td style="padding: 12px; text-align: center;">${typeBadge}</td>
      <td style="padding: 12px; font-size: 14px; font-weight: 600; color: #333; line-height: 1.4; white-space: pre-wrap;">${escapeHTML(c.message)}</td>
      <td style="padding: 12px; text-align: right; white-space: nowrap;">
        <button class="btn-control" style="background: var(--yellow); color: var(--black); margin-right: 6px;" onclick="openEditChangelogModal('${c._id}')">Edit</button>
        <button class="btn-control" style="background: #ef4444; color: white;" onclick="deleteChangelog('${c._id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openAddChangelogModal() {
  document.getElementById('changelog-modal-title').textContent = 'Add Feature Changelog';
  document.getElementById('btn-save-changelog').textContent = 'Save Changelog';
  document.getElementById('changelog-id').value = '';
  document.getElementById('changelog-message').value = '';
  document.getElementById('changelog-type').value = 'minor';
  document.getElementById('changelog-date').value = formatForInput();
  
  document.getElementById('changelog-modal').style.display = 'flex';
}

function openEditChangelogModal(id) {
  const c = allChangelogs.find(item => item._id === id);
  if (!c) return;

  document.getElementById('changelog-modal-title').textContent = 'Edit Feature Changelog';
  document.getElementById('btn-save-changelog').textContent = 'Save Changes';
  document.getElementById('changelog-id').value = c._id;
  document.getElementById('changelog-message').value = c.message;
  document.getElementById('changelog-type').value = c.type;
  document.getElementById('changelog-date').value = formatForInput(c.createdAt);
  
  document.getElementById('changelog-modal').style.display = 'flex';
}

function closeChangelogModal() {
  document.getElementById('changelog-modal').style.display = 'none';
}

async function deleteChangelog(id) {
  if (!confirm('Are you sure you want to permanently delete this changelog?')) return;

  try {
    const res = await fetch(`${API}/api/admin/changelogs/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      loadChangelogs();
    } else {
      const data = await res.json();
      alert(data.message || 'Failed to delete changelog.');
    }
  } catch (err) {
    console.error('deleteChangelog error:', err);
    alert('Connection error while deleting changelog.');
  }
}

// Add event listener for changelog form submission
// Wrapped in DOMContentLoaded because the changelog modal HTML appears AFTER the <script> tag
document.addEventListener('DOMContentLoaded', () => {
  const changelogForm = document.getElementById('changelog-form');
  if (!changelogForm) return; // Guard: only runs on admin-dashboard.html

  changelogForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('changelog-id').value;
    const message = document.getElementById('changelog-message').value;
    const type = document.getElementById('changelog-type').value;
    const createdAt = document.getElementById('changelog-date').value;

    const payload = { message, type, createdAt };

    try {
      const url = id ? `${API}/api/admin/changelogs/${id}` : `${API}/api/admin/changelogs`;
      const method = id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method: method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        closeChangelogModal();
        loadChangelogs();
      } else {
        const data = await res.json();
        alert(data.message || 'Action failed');
      }
    } catch (err) {
      console.error('Submit changelog form error:', err);
      alert('Connection error while saving changelog.');
    }
  });
}); // end DOMContentLoaded

// Bind functions to window
window.loadChangelogs = loadChangelogs;
window.openAddChangelogModal = openAddChangelogModal;
window.openEditChangelogModal = openEditChangelogModal;
window.closeChangelogModal = closeChangelogModal;
window.deleteChangelog = deleteChangelog;

/* ============================================================
   ADMIN EMAIL — Individual User
   ============================================================ */

let _userEmailMode = 'text'; // current mode for user email tab
let _userEmailAttachment = null; // { filename, data (base64) } | null

function setUserEmailMode(mode) {
  _userEmailMode = mode;
  const plainBtn = document.getElementById('user-email-mode-plain');
  const htmlBtn  = document.getElementById('user-email-mode-html');
  const preview  = document.getElementById('user-email-preview-btn');
  const label    = document.getElementById('user-email-body-label');
  if (!plainBtn) return;
  if (mode === 'html') {
    plainBtn.style.background = '#eee';
    htmlBtn.style.background  = 'var(--yellow)';
    if (preview)  preview.style.display = 'block';
    if (label)    label.textContent = 'HTML Body *';
    document.getElementById('user-email-body').placeholder = '<h1>Hello!</h1>\n<p>Your message here...</p>';
  } else {
    plainBtn.style.background = 'var(--yellow)';
    htmlBtn.style.background  = '#eee';
    if (preview)  preview.style.display = 'none';
    if (label)    label.textContent = 'Message *';
    document.getElementById('user-email-body').placeholder = 'Type your message here...';
  }
}

function handleAdminEmailAttachment(event) {
  const file = event.target.files[0];
  if (!file) { _userEmailAttachment = null; return; }
  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    alert('Attachment too large. Max size is 5 MB.');
    event.target.value = '';
    _userEmailAttachment = null;
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    // Strip the data-url prefix (e.g. "data:application/pdf;base64,")
    const base64 = e.target.result.split(',')[1];
    _userEmailAttachment = { filename: file.name, data: base64 };
    const info = document.getElementById('user-email-attach-info');
    if (info) info.textContent = `✓ Ready to attach: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  };
  reader.readAsDataURL(file);
}

function previewUserEmail() {
  const body = document.getElementById('user-email-body')?.value || '';
  const iframe = document.getElementById('email-preview-iframe');
  if (!iframe) return;
  const modal = document.getElementById('email-preview-modal');
  iframe.srcdoc = body;
  modal.classList.add('open');
}

async function sendAdminEmailToUser(userId) {
  const subject = document.getElementById('user-email-subject')?.value?.trim();
  const body    = document.getElementById('user-email-body')?.value?.trim();
  const resultEl = document.getElementById('user-email-result');
  const btn      = document.getElementById('btn-send-user-email');

  if (!subject || !body) {
    alert('Subject and message body are required.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Sending...';
  if (resultEl) { resultEl.style.display = 'none'; }

  try {
    const payload = {
      subject,
      body,
      mode: _userEmailMode,
      attachments: _userEmailAttachment ? [_userEmailAttachment] : [],
    };
    const res = await fetch(`${API}/api/admin/users/${userId}/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.style.background = res.ok ? '#f0fdf4' : '#fff1f2';
      resultEl.style.borderColor = res.ok ? '#22c55e' : '#ef4444';
      resultEl.textContent = data.message || (res.ok ? 'Email sent!' : 'Failed to send.');
    }
  } catch (err) {
    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.style.background = '#fff1f2';
      resultEl.style.borderColor = '#ef4444';
      resultEl.textContent = 'Connection error: ' + err.message;
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '📤 Send Email';
  }
}

/* ============================================================
   ADMIN EMAIL — Bulk Sender
   ============================================================ */

let _bulkAllEmails    = []; // { _id, email, createdAt }
let _bulkSelectedSet  = new Set(); // selected email strings
let _bulkCurrentSort  = 'desc';
let _bulkMode         = 'text'; // 'text' | 'html'

async function loadUserEmailsOnly(sort = 'desc') {
  _bulkCurrentSort = sort;

  // Update sort button state
  const descBtn = document.getElementById('bulk-sort-desc');
  const ascBtn  = document.getElementById('bulk-sort-asc');
  if (descBtn) { descBtn.classList.toggle('active', sort === 'desc'); }
  if (ascBtn)  { ascBtn.classList.toggle('active',  sort === 'asc');  }

  const listEl = document.getElementById('bulk-email-list');
  if (!listEl) return;
  listEl.innerHTML = '<p style="font-weight:700;color:#888;font-size:13px;">Loading...</p>';

  try {
    const res = await fetch(`${API}/api/admin/user-emails?sort=${sort}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch emails');
    const data = await res.json();
    _bulkAllEmails = data.emails || [];
    _bulkSelectedSet.clear();
    _updateBulkSelectedCount();
    _renderBulkEmailList(_bulkAllEmails);
  } catch (err) {
    listEl.innerHTML = `<p style="color:red;font-weight:700;">${err.message}</p>`;
  }
}

function _renderBulkEmailList(emails) {
  const listEl = document.getElementById('bulk-email-list');
  if (!listEl) return;
  if (emails.length === 0) {
    listEl.innerHTML = '<p style="font-weight:700;color:#888;font-size:13px;">No emails match your filter.</p>';
    return;
  }
  listEl.innerHTML = emails.map(u => {
    const isSelected = _bulkSelectedSet.has(u.email);
    const date = new Date(u.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    return `
      <label onclick="toggleBulkEmail('${u.email}', this)" id="bulk-row-${CSS.escape(u.email)}" style="
        display: flex; align-items: center; gap: 12px; padding: 10px 12px;
        border: 2px solid ${isSelected ? '#000' : '#e5e7eb'};
        background: ${isSelected ? 'var(--yellow)' : '#fff'};
        cursor: pointer; transition: all 0.15s; user-select: none;
      ">
        <input type="checkbox" style="width: auto; flex-shrink:0; cursor:pointer;" ${isSelected ? 'checked' : ''}
          onclick="event.stopPropagation(); toggleBulkEmail('${u.email}', this.closest('label'))">
        <div style="flex:1; min-width:0;">
          <div style="font-size:13px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${u.email}</div>
          <div style="font-size:10px;color:#888;font-weight:700;">${date}</div>
        </div>
      </label>
    `;
  }).join('');
}

function toggleBulkEmail(email, labelEl) {
  if (_bulkSelectedSet.has(email)) {
    _bulkSelectedSet.delete(email);
    if (labelEl) {
      labelEl.style.background = '#fff';
      labelEl.style.borderColor = '#e5e7eb';
      const cb = labelEl.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = false;
    }
  } else {
    _bulkSelectedSet.add(email);
    if (labelEl) {
      labelEl.style.background = 'var(--yellow)';
      labelEl.style.borderColor = '#000';
      const cb = labelEl.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = true;
    }
  }
  _updateBulkSelectedCount();
}

function selectAllBulkEmails() {
  _bulkAllEmails.forEach(u => _bulkSelectedSet.add(u.email));
  _updateBulkSelectedCount();
  // Refresh visible filtered list to reflect state
  filterBulkEmails();
}

function deselectAllBulkEmails() {
  _bulkSelectedSet.clear();
  _updateBulkSelectedCount();
  filterBulkEmails();
}

function filterBulkEmails() {
  const query = (document.getElementById('bulk-email-search')?.value || '').toLowerCase();
  const filtered = query ? _bulkAllEmails.filter(u => u.email.toLowerCase().includes(query)) : _bulkAllEmails;
  _renderBulkEmailList(filtered);
}

function _updateBulkSelectedCount() {
  const el = document.getElementById('bulk-selected-count');
  if (el) el.textContent = `${_bulkSelectedSet.size} selected`;
}

function setBulkMode(mode) {
  _bulkMode = mode;
  const plainBtn  = document.getElementById('bulk-mode-plain');
  const htmlBtn   = document.getElementById('bulk-mode-html');
  const previewBtn = document.getElementById('bulk-preview-btn');
  const label      = document.getElementById('bulk-body-label');
  if (!plainBtn) return;
  if (mode === 'html') {
    plainBtn.style.background = '#eee';
    htmlBtn.style.background  = 'var(--yellow)';
    if (previewBtn) previewBtn.style.display = 'block';
    if (label)      label.textContent = 'HTML Body *';
    document.getElementById('bulk-body').placeholder = '<h1>Hello!</h1>\n<p>Your message here...</p>';
  } else {
    plainBtn.style.background = 'var(--yellow)';
    htmlBtn.style.background  = '#eee';
    if (previewBtn) previewBtn.style.display = 'none';
    if (label)      label.textContent = 'Message *';
    document.getElementById('bulk-body').placeholder = 'Type your message here...';
  }
}

function previewBulkEmail() {
  const body = document.getElementById('bulk-body')?.value || '';
  const iframe = document.getElementById('email-preview-iframe');
  if (!iframe) return;
  iframe.srcdoc = body;
  document.getElementById('email-preview-modal').classList.add('open');
}

function closeEmailPreviewModal() {
  document.getElementById('email-preview-modal').classList.remove('open');
}

async function sendBulkEmailFromAdmin() {
  const subject   = document.getElementById('bulk-subject')?.value?.trim();
  const body      = document.getElementById('bulk-body')?.value?.trim();
  const emails    = Array.from(_bulkSelectedSet);
  const resultEl  = document.getElementById('bulk-email-results');
  const btn       = document.getElementById('btn-send-bulk');

  if (!subject || !body) {
    alert('Subject and message body are required.');
    return;
  }
  if (emails.length === 0) {
    alert('Please select at least one recipient.');
    return;
  }
  if (!confirm(`Send this email to ${emails.length} recipient(s)?`)) return;

  btn.disabled = true;
  btn.textContent = `Sending to ${emails.length} recipients (sequentially)...`;
  if (resultEl) resultEl.style.display = 'none';

  try {
    const res = await fetch(`${API}/api/admin/bulk-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ subject, body, mode: _bulkMode, emails }),
    });
    const data = await res.json();

    if (resultEl) {
      resultEl.style.display = 'block';
      const ok = data.failed === 0;
      resultEl.style.background  = ok ? '#f0fdf4' : '#fffbeb';
      resultEl.style.borderColor = ok ? '#22c55e' : '#f59e0b';

      let html = `<div style="font-size:14px;margin-bottom:10px;">${data.message}</div>`;
      if (data.results && data.results.length > 0) {
        const failed = data.results.filter(r => r.status === 'failed');
        if (failed.length > 0) {
          html += `<div style="font-size:12px;color:#ef4444;font-weight:700;margin-top:8px;">Failed recipients:</div>`;
          html += failed.map(r => `<div style="font-size:11px;font-family:monospace;">✗ ${r.email} &mdash; ${r.error || 'unknown error'}</div>`).join('');
        }
      }
      resultEl.innerHTML = html;
    }
  } catch (err) {
    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.style.background  = '#fff1f2';
      resultEl.style.borderColor = '#ef4444';
      resultEl.textContent = 'Connection error: ' + err.message;
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '📤 Send to Selected';
  }
}

// Expose to global scope
window.loadUserEmailsOnly   = loadUserEmailsOnly;
window.setBulkMode          = setBulkMode;
window.filterBulkEmails     = filterBulkEmails;
window.selectAllBulkEmails  = selectAllBulkEmails;
window.deselectAllBulkEmails = deselectAllBulkEmails;
window.toggleBulkEmail      = toggleBulkEmail;
window.previewBulkEmail     = previewBulkEmail;
window.sendBulkEmailFromAdmin = sendBulkEmailFromAdmin;
window.closeEmailPreviewModal = closeEmailPreviewModal;
window.setUserEmailMode     = setUserEmailMode;
window.handleAdminEmailAttachment = handleAdminEmailAttachment;
window.previewUserEmail     = previewUserEmail;
window.sendAdminEmailToUser = sendAdminEmailToUser;

// ── Motivation Quote Management ──────────────────────────────
let allAdminMotivationQuotes = [];

async function loadAdminMotivationQuotes() {
  const grid = document.getElementById('motivation-quotes-grid');
  if (grid) grid.innerHTML = '<div style="font-weight:800; padding:20px; color:#666;">Loading motivation quotes...</div>';

  try {
    const res = await fetch(`${API}/api/admin/motivation-quotes`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 401 || res.status === 403) {
      logout();
      return;
    }

    const data = await res.json();
    allAdminMotivationQuotes = data.quotes || [];
    renderAdminMotivationQuotes(allAdminMotivationQuotes);
  } catch (err) {
    console.error('Error loading motivation quotes:', err);
    if (grid) grid.innerHTML = `<div style="color:red; font-weight:800; padding:20px;">Failed to load quotes: ${err.message}</div>`;
  }
}

function renderAdminMotivationQuotes(quotes) {
  const grid = document.getElementById('motivation-quotes-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const totalBadge = document.getElementById('motivation-total-badge');
  const activeBadge = document.getElementById('motivation-active-badge');
  const activeCount = quotes.filter(q => q.isActive).length;

  if (totalBadge) totalBadge.textContent = `Total Quotes: ${quotes.length}`;
  if (activeBadge) activeBadge.textContent = `Active: ${activeCount}`;

  if (quotes.length === 0) {
    grid.innerHTML = '<div style="font-weight:800; padding:20px; color:#666; grid-column: 1/-1;">No motivation quotes found. Click "+ Add New Quote" to create one!</div>';
    return;
  }

  quotes.forEach((q) => {
    const card = document.createElement('div');
    card.className = 'review-card';
    card.style.position = 'relative';
    card.style.borderLeft = q.isActive ? '6px solid #22c55e' : '6px solid #94a3b8';

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
        <span style="font-size:11px; font-weight:900; background: var(--yellow); padding: 2px 8px; border: 1.5px solid #000; border-radius: 4px;">Order: #${q.order || 0}</span>
        <span style="font-size:11px; font-weight:800; padding: 2px 8px; border-radius: 4px; border: 1.5px solid #000; background: ${q.isActive ? '#dcfce7' : '#f1f5f9'}; color: ${q.isActive ? '#166534' : '#64748b'};">
          ${q.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
      <p style="font-size: 14px; font-weight: 800; font-style: italic; color: #000; margin-bottom: 10px; line-height: 1.4;">
        “${escapeHtml(q.quoteText)}”
      </p>
      <div style="font-size: 12px; color: #666; font-weight: 700; margin-bottom: 14px;">
        Author: <span style="color:#000;">${escapeHtml(q.author || 'Consistency Daily')}</span>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn-control btn-edit" style="flex:1;" onclick="openMotivationQuoteModal('${q._id}')">✏️ Edit</button>
        <button class="btn-control" style="flex:1; background: ${q.isActive ? '#fef3c7' : '#dcfce7'}; color: #000;" onclick="toggleQuoteActive('${q._id}', ${!q.isActive})">
          ${q.isActive ? '⏸️ Deactivate' : '▶️ Activate'}
        </button>
        <button class="btn-control btn-delete" style="flex:1;" onclick="deleteMotivationQuote('${q._id}')">🗑️ Delete</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

function filterAdminQuotes() {
  const query = (document.getElementById('motivation-search')?.value || '').toLowerCase().trim();
  if (!query) {
    renderAdminMotivationQuotes(allAdminMotivationQuotes);
    return;
  }
  const filtered = allAdminMotivationQuotes.filter(q => 
    (q.quoteText || '').toLowerCase().includes(query) ||
    (q.author || '').toLowerCase().includes(query)
  );
  renderAdminMotivationQuotes(filtered);
}

function openMotivationQuoteModal(quoteId = null) {
  const modal = document.getElementById('motivation-quote-modal');
  const titleEl = document.getElementById('motivation-modal-title');
  const idEl = document.getElementById('motivation-quote-id');
  const textEl = document.getElementById('motivation-quote-text');
  const authorEl = document.getElementById('motivation-quote-author');
  const orderEl = document.getElementById('motivation-quote-order');
  const activeEl = document.getElementById('motivation-quote-active');

  if (quoteId) {
    const q = allAdminMotivationQuotes.find(item => item._id === quoteId);
    if (!q) return;
    titleEl.textContent = 'Edit Motivation Quote';
    idEl.value = q._id;
    textEl.value = q.quoteText || '';
    authorEl.value = q.author || 'Consistency Daily';
    orderEl.value = q.order || 1;
    activeEl.checked = q.isActive !== false;
  } else {
    titleEl.textContent = 'Add Motivation Quote';
    idEl.value = '';
    textEl.value = '';
    authorEl.value = 'Consistency Daily';
    orderEl.value = (allAdminMotivationQuotes.length + 1);
    activeEl.checked = true;
  }

  modal.classList.add('open');
}

function closeMotivationQuoteModal() {
  const modal = document.getElementById('motivation-quote-modal');
  if (modal) modal.classList.remove('open');
}

async function saveMotivationQuote(event) {
  if (event) event.preventDefault();
  const id = document.getElementById('motivation-quote-id').value;
  const quoteText = document.getElementById('motivation-quote-text').value.trim();
  const author = document.getElementById('motivation-quote-author').value.trim();
  const order = Number(document.getElementById('motivation-quote-order').value) || 1;
  const isActive = document.getElementById('motivation-quote-active').checked;

  if (!quoteText) {
    alert('Please enter quote text.');
    return;
  }

  const btn = document.getElementById('btn-save-motivation-quote');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }

  try {
    const url = id ? `${API}/api/admin/motivation-quotes/${id}` : `${API}/api/admin/motivation-quotes`;
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ quoteText, author, order, isActive })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      alert(`Error saving quote: ${data.message || 'Server error'}`);
      return;
    }

    closeMotivationQuoteModal();
    await loadAdminMotivationQuotes();
  } catch (err) {
    console.error('Error saving quote:', err);
    alert('Failed to save quote: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save & Broadcast Update';
    }
  }
}

async function toggleQuoteActive(id, newStatus) {
  try {
    const res = await fetch(`${API}/api/admin/motivation-quotes/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ isActive: newStatus })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      await loadAdminMotivationQuotes();
    } else {
      alert(`Error toggling quote status: ${data.message || 'Server error'}`);
    }
  } catch (err) {
    console.error('Error toggling quote status:', err);
  }
}

async function deleteMotivationQuote(id) {
  if (!confirm('Are you sure you want to delete this quote?')) return;

  try {
    const res = await fetch(`${API}/api/admin/motivation-quotes/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await res.json();
    if (res.ok && data.success) {
      await loadAdminMotivationQuotes();
    } else {
      alert(`Error deleting quote: ${data.message || 'Server error'}`);
    }
  } catch (err) {
    console.error('Error deleting quote:', err);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
}

window.showSection = showSection;
window.loadAdminMotivationQuotes = loadAdminMotivationQuotes;
window.filterAdminQuotes = filterAdminQuotes;
window.openMotivationQuoteModal = openMotivationQuoteModal;
window.closeMotivationQuoteModal = closeMotivationQuoteModal;
window.saveMotivationQuote = saveMotivationQuote;
window.toggleQuoteActive = toggleQuoteActive;
window.deleteMotivationQuote = deleteMotivationQuote;
