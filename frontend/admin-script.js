const API = '';
const token = localStorage.getItem('adminToken');
let allReviews = []; // Global store to avoid JSON-in-attribute issues

// Redirect if not logged in
if (!token && !window.location.pathname.includes('admin-login.html')) {
  window.location.href = 'admin-login.html';
}

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
    const res = await fetch(`${API}/api/admin/reviews?sort=${sort}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 401 || res.status === 403) {
      logout();
      return;
    }

    allReviews = await res.json();
    renderReviews(allReviews);
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
    const res = await fetch(`${API}/api/admin/groups`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      allGroups = await res.json();
      grid.innerHTML = allGroups.length ? allGroups.map(g => `
        <div style="padding:24px; border:3px solid #000; background:#fff; border-radius:12px; box-shadow: 6px 6px 0 #000; position: relative; display: flex; flex-direction: column; gap: 20px;">
          
          <!-- Header: Icon, Name, Buttons, Owner -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #eee; padding-bottom: 15px;">
             <!-- Left: Icon & Name -->
             <div style="display: flex; align-items: center; gap: 12px;">
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
             <div style="text-align: right; display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; gap: 6px; justify-content: flex-end;">
                  <button class="btn-control" style="padding: 6px 10px; font-size: 11px; box-shadow: 2px 2px 0 #000; background: var(--blue); color: #fff;" onclick="document.getElementById('admin-group-pic-input-${g._id}').click()">Change Icon</button>
                  <input type="file" id="admin-group-pic-input-${g._id}" style="display:none" accept="image/*" onchange="handleAdminGroupIconUpload(event, '${g._id}')">
                  <button class="btn-control" style="padding: 6px 10px; font-size: 11px; box-shadow: 2px 2px 0 #000;" onclick="openEditGroup('${g._id}')">Edit Info</button>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; justify-content: flex-end; background: #f8f8f8; padding: 6px 10px; border: 2px solid #000; border-radius: 8px;">
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
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px;">
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

const debouncedSearch = debounce(() => loadUsers());

async function loadUsers(sort = 'desc') {
  const query = document.getElementById('user-search').value;
  const sortBtnDesc = document.getElementById('user-sort-desc');
  const sortBtnAsc = document.getElementById('user-sort-asc');
  
  if (sortBtnDesc) {
    sortBtnDesc.classList.toggle('active', sort === 'desc');
    sortBtnAsc.classList.toggle('active', sort === 'asc');
  }

  try {
    const res = await fetch(`${API}/api/admin/users?sort=${sort}&query=${query}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      allUsers = await res.json();
      renderUsers(allUsers);
    }
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

function renderUsers(users) {
  const tbody = document.getElementById('user-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  users.forEach((u, index) => {
    const isBlacklisted = u.isBlacklisted && (!u.blacklistedUntil || new Date(u.blacklistedUntil) > new Date());
    const row = document.createElement('tr');
    row.style.borderBottom = '1px solid #eee';
    
    row.innerHTML = `
      <td style="padding: 12px; font-weight: 800;">${index + 1}</td>
      <td style="padding: 12px;">
        ${getAvatarHtml(u.profilePicture, u.name, 40, '8px')}
      </td>
      <td style="padding: 12px;">
        <div style="font-weight: 900; font-family: 'Space Grotesk';">${u.name}</div>
        <div style="font-size: 12px; color: #666;">@${u.username || 'no-username'}</div>
        <div style="font-size: 11px; color: var(--blue);">${u.email}</div>
      </td>
      <td style="padding: 12px; text-align: center;">
        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase;">
          Reviews: ${u.reviewCount || 0} <br>
          Groups: ${u.groupCount || 0}
        </div>
      </td>
      <td style="padding: 12px; text-align: center;">
        <span class="badge" style="background: ${isBlacklisted ? '#ef4444' : '#22c55e'}; color: white;">
          ${isBlacklisted ? 'BLACKLISTED' : 'ACTIVE'}
        </span>
      </td>
      <td style="padding: 12px; text-align: right;">
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
    case 'days':
      html = `
        <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px dashed #eee;">
          <button class="btn-control" style="width: 100%; background: var(--blue); color: white; padding: 12px; box-shadow: 4px 4px 0 #000;" onclick="prepareAddNewDay('${user._id}')">
            <i data-lucide="plus-circle"></i> + Add New Day Card
          </button>
        </div>
        <div id="new-day-placeholder"></div>
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
  }
  container.innerHTML = html;
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
  window.location.href = 'admin-login.html';
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


