const API = '';
const token = localStorage.getItem('adminToken');
let allReviews = []; // Global store to avoid JSON-in-attribute issues

// Redirect if not logged in
if (!token && !window.location.pathname.includes('admin-login.html')) {
  window.location.href = 'admin-login.html';
}

/**
 * SPA Navigation
 */
function showSection(sectionId) {
  // Update nav links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.getAttribute('onclick').includes(`'${sectionId}'`));
  });

  // Update sections
  document.querySelectorAll('.admin-section').forEach(section => {
    section.style.display = section.id === `section-${sectionId}` ? 'block' : 'none';
  });

  if (sectionId === 'reviews') {
    loadReviews();
  }
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
      'Hidden Genius': '#34d399'
    };

    const badgesHtml = (r.userBadges || []).map(b => `
      <span class="badge" style="background: ${badgeColors[b] || '#eee'}">${b}</span>
    `).join('');

    card.innerHTML = `
      <div class="review-meta">
        <span>${r.name || '<span style="color:red">No Name</span>'}</span>
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

function logout() {
  localStorage.removeItem('adminToken');
  window.location.href = 'admin-login.html';
}

// Initial load
if (window.location.pathname.includes('admin-dashboard.html')) {
  loadReviews();
}
