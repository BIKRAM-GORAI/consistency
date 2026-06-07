/**
 * AI Agentic Canvas Module
 * Handles drawing, panning, zooming, node dragging, manual modifications, and AI generation
 */

// Module State
let activeCanvasId = null;
let canvasData = { name: '', nodes: [], edges: [] };
let canvasLimit = 30;
let canvasesList = [];

// Pan & Zoom state
let panX = 0;
let panY = 0;
let scale = 1;
let isPanning = false;
let startPanX = 0;
let startPanY = 0;

// Drag state
let draggedNodeId = null;
let dragStartX = 0;
let dragStartY = 0;
let dragNodeStartX = 0;
let dragNodeStartY = 0;

// Action state
let isDirty = false;
let mode = 'design'; // 'design' or 'execute'
let undoStack = [];
let redoStack = [];
let isLinking = false;
let linkSourceNodeId = null;
let linkSourceSide = null;
let autoSaveInterval = null;

// DOM references
let viewportContainer = null;
let workspace = null;
let nodesContainer = null;
let svgPathsContainer = null;
let saveIndicator = null;
let btnSend = null;
let aiPromptInput = null;

/**
 * Coordinate Sanitization Utility
 */
function sanitizeNodeCoordinates(nodes) {
  if (!nodes) return;
  nodes.forEach(n => {
    n.x = Number(n.x);
    if (isNaN(n.x) || !isFinite(n.x)) n.x = 0;
    n.y = Number(n.y);
    if (isNaN(n.y) || !isFinite(n.y)) n.y = 0;
  });
}

/**
 * Toast Utility
 */
function showToast(message, type = 'success') {
  const toast = document.getElementById('canvas-toast');
  const icon = document.getElementById('canvas-toast-icon');
  const text = document.getElementById('canvas-toast-text');
  
  if (!toast) return;

  toast.className = `active ${type}`;
  text.textContent = message;

  if (type === 'success') icon.innerHTML = '✅';
  else if (type === 'warn') icon.innerHTML = '⚠️';
  else icon.innerHTML = '❌';

  setTimeout(() => {
    toast.classList.remove('active');
  }, 3500);
}

/**
 * Help Modal
 */
function openHelpModal() {
  const overlay = document.getElementById('help-modal-overlay');
  if (overlay) {
    overlay.classList.add('active');
    if (window.lucide) lucide.createIcons({ root: overlay });
  }
}

function closeHelpModal() {
  const overlay = document.getElementById('help-modal-overlay');
  if (overlay) overlay.classList.remove('active');
}

/**
 * Premium Upgrade Modal and Status Checks
 */
function openPremiumModal() {
  const modal = document.getElementById('modal-premium-upgrade');
  if (modal) {
    modal.classList.add('active');
    if (window.lucide) lucide.createIcons({ root: modal });
  }
}

function closePremiumModal() {
  const modal = document.getElementById('modal-premium-upgrade');
  if (modal) modal.classList.remove('active');
}

function checkPremiumStatus() {
  const isPremium = localStorage.getItem('isPremium') === 'true' || localStorage.getItem('subscriptionTier') === 'premium';
  if (!isPremium) {
    openPremiumModal();
    return false;
  }
  return true;
}

function checkPremiumStatusSilent() {
  return localStorage.getItem('isPremium') === 'true' || localStorage.getItem('subscriptionTier') === 'premium';
}

function copyWebAppLink(btnEl) {
  const url = 'https://consistency-daily.vercel.app/';
  navigator.clipboard.writeText(url).then(() => {
    const span = btnEl.querySelector('span');
    const originalText = span ? span.textContent : 'Copy';
    
    if (span) span.textContent = 'Copied!';
    btnEl.style.background = 'var(--lime)';
    
    showToast('Web App URL copied to clipboard!', 'success');
    
    setTimeout(() => {
      if (span) span.textContent = originalText;
      btnEl.style.background = 'var(--teal)';
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy text: ', err);
    showToast('Failed to copy link', 'error');
  });
}

window.openPremiumModal = openPremiumModal;
window.closePremiumModal = closePremiumModal;
window.copyWebAppLink = copyWebAppLink;

/**
 * Initialization of Canvas Module
 */
function initCanvasModule() {
  // Bind references
  viewportContainer = document.getElementById('canvas-viewport-container');
  workspace = document.getElementById('canvas-workspace');
  nodesContainer = document.getElementById('canvas-nodes-container');
  svgPathsContainer = document.getElementById('svg-paths-container');
  saveIndicator = document.getElementById('save-status-indicator');
  btnSend = document.getElementById('send-prompt-btn');
  aiPromptInput = document.getElementById('ai-prompt-input');

  // Handle routing based on URL search query
  handleRouting();

  // Keyboard shortcut listener
  window.addEventListener('keydown', handleGlobalKeydowns);
  
  if (aiPromptInput) {
    aiPromptInput.addEventListener('keydown', handlePromptInputKeydown);
  }

  // Setup Sidebar width resizer
  setupSidebarResizer();

  // Set initial floating button visibility based on screen width on load
  const floatBtn = document.getElementById('canvas-ai-float-btn');
  if (floatBtn) {
    if (window.innerWidth <= 768) {
      floatBtn.style.setProperty('display', 'flex', 'important');
    } else {
      floatBtn.style.setProperty('display', 'none', 'important');
    }
  }

  // Register click outside modals
  window.addEventListener('click', (e) => {
    const createModal = document.getElementById('modal-create-canvas');
    if (e.target === createModal) {
      closeCreateModal();
    }
    const helpModal = document.getElementById('help-modal-overlay');
    if (e.target === helpModal) {
      closeHelpModal();
    }
    const premiumModal = document.getElementById('modal-premium-upgrade');
    if (e.target === premiumModal) {
      closePremiumModal();
    }
    const downloadModal = document.getElementById('modal-download-canvas');
    if (e.target === downloadModal) {
      closeDownloadModal();
    }
  });

  // Render static icons on load
  if (window.lucide) {
    setTimeout(() => {
      lucide.createIcons();
    }, 50);
  }
}

// Run robust load check to prevent race conditions on module execution
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initCanvasModule();
} else {
  window.addEventListener('DOMContentLoaded', initCanvasModule);
}

function handlePromptInputKeydown(e) {
  if (e.key === 'Enter') {
    if (e.shiftKey) {
      e.preventDefault(); // Prevent newline insertion
      sendPromptToAgent();
    }
    // Normal Enter without Shift just inserts a newline (default behavior)
  }
}

function setupSidebarResizer() {
  const resizer = document.getElementById('sidebar-resizer');
  const sidebar = document.getElementById('canvas-sidebar-panel');
  if (!resizer || !sidebar) return;

  let startX = 0;
  let startWidth = 0;
  let isResizing = false;

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    startX = e.clientX;
    startWidth = parseInt(document.defaultView.getComputedStyle(sidebar).width, 10);
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  });

  function handleMouseMove(e) {
    if (!isResizing) return;
    const dx = e.clientX - startX;
    // Sidebar is on the right side, so dragging left (negative dx) increases sidebar width
    const newWidth = Math.max(280, Math.min(600, startWidth - dx));
    sidebar.style.width = `${newWidth}px`;
  }

  function handleMouseUp() {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
  }
}

/**
 * URL query listener for Single Page Dashboard/Designer View
 */
function handleRouting() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  // Cancel any existing autosave timers
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
  }

  // Load remaining daily canvas AI message limit
  loadCanvasMsgLimits();

  if (id) {
    activeCanvasId = id;
    document.getElementById('canvas-dashboard-view').style.display = 'none';
    document.getElementById('canvas-designer-view').style.display = 'flex';
    loadCanvasDetails(id);
    setupDesignerInteraction();
    
    // Auto-save check every 30 seconds
    autoSaveInterval = setInterval(() => {
      if (isDirty) {
        saveCanvasCurrentState(true); // silent auto-save
      }
    }, 30000);
  } else {
    activeCanvasId = null;
    document.getElementById('canvas-dashboard-view').style.display = 'flex';
    document.getElementById('canvas-designer-view').style.display = 'none';
    loadCanvases();
  }
}

/**
 * Listen to window history state back/forward
 */
window.addEventListener('popstate', () => {
  handleRouting();
});

function navigateTo(url) {
  window.history.pushState(null, '', url);
  handleRouting();
}

/**
 * ============================================================
 * DASHBOARD CONTROLLERS
 * ============================================================
 */

async function loadCanvases() {
  const isPremium = checkPremiumStatusSilent();
  if (!isPremium) {
    canvasesList = [{
      _id: 'demo-preview-canvas',
      name: '✨ Interactive Demo Canvas (Premium Teaser)',
      createdAt: new Date().toISOString()
    }];
    canvasLimit = 0;
    
    // Update limit indicators
    const fractionText = document.getElementById('canvas-limit-fraction');
    const bar = document.getElementById('canvas-limit-bar');
    if (fractionText) {
      fractionText.textContent = `0 / 0 Canvases (Upgrade to Unlock)`;
    }
    if (bar) {
      bar.style.width = `0%`;
    }

    // Set message limit bars
    updateMsgLimitPill(0, 0);

    renderCanvases(canvasesList);
    return;
  }

  try {
    const data = await window.apiFetch(`${window.API || ''}/api/canvas-workflows`);
    canvasesList = data.canvases || [];
    canvasLimit = data.limit || 30;
    
    // Update limit indicators
    const fractionText = document.getElementById('canvas-limit-fraction');
    const bar = document.getElementById('canvas-limit-bar');
    if (fractionText) {
      fractionText.textContent = `${canvasesList.length} / ${canvasLimit} Canvases`;
    }
    if (bar) {
      const pct = Math.min(100, (canvasesList.length / canvasLimit) * 100);
      bar.style.width = `${pct}%`;
    }

    renderCanvases(canvasesList);
  } catch (err) {
    console.error('Failed to load canvases list:', err);
    showToast('Failed to load canvases list', 'error');
  }
}

function renderCanvases(list) {
  const container = document.getElementById('canvas-grid-list');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; grid-column: 1 / -1; padding: 60px 20px; background: var(--bg-card); border: var(--border); border-radius: var(--r-lg); box-shadow: var(--shadow);">
        <div style="font-size: 48px; margin-bottom: 16px;">🎨</div>
        <h3 style="font-size: 20px; font-weight: 900; text-transform: uppercase; margin-bottom: 8px;">No canvases created yet</h3>
        <p style="font-family: 'Inter', sans-serif; font-size: 14px; color: var(--text-muted); max-width: 400px; margin: 0 auto 24px;">
          Unleash your productivity! Click "+ Create Canvas" above to construct your first agentic workflow mapping goals, actions, and decision points.
        </p>
        <button class="btn-brutal btn-yellow" onclick="openCreateModal()">Create Your First Canvas</button>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  list.forEach(canvas => {
    const card = document.createElement('div');
    card.className = 'canvas-card';
    
    // Capture details inside closure
    const formattedDate = new Date(canvas.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    card.innerHTML = `
      <div class="canvas-card-header">
        <h3 class="canvas-card-title">${window.escapeHTML(canvas.name)}</h3>
        <button class="btn-delete-canvas" title="Delete Canvas">
          <i data-lucide="trash-2" style="width: 18px; height: 18px;"></i>
        </button>
      </div>
      <div class="canvas-card-meta">
        <i data-lucide="calendar" style="width: 14px; height: 14px;"></i>
        <span>Created: ${formattedDate}</span>
      </div>
    `;

    // Click on trash button deletes it
    const deleteBtn = card.querySelector('.btn-delete-canvas');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCanvas(canvas._id, canvas.name);
    });

    // Click anywhere else opens the canvas designer
    card.addEventListener('click', () => {
      navigateTo(`canvas.html?id=${canvas._id}`);
    });

    container.appendChild(card);
  });

  if (window.lucide) {
    lucide.createIcons({ root: container });
  }
}

function filterCanvases(query) {
  const filtered = canvasesList.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));
  renderCanvases(filtered);
}

function openCreateModal() {
  if (!checkPremiumStatus()) return;
  if (canvasesList.length >= canvasLimit) {
    showToast(`Limit reached. You can only create up to ${canvasLimit} canvases in your lifetime.`, 'warn');
    return;
  }
  const modal = document.getElementById('modal-create-canvas');
  modal.classList.add('active');
  const input = document.getElementById('new-canvas-name-input');
  input.value = `Canvas ${canvasesList.length + 1}`;
  input.focus();
  input.select();
}

function closeCreateModal() {
  const modal = document.getElementById('modal-create-canvas');
  modal.classList.remove('active');
}

async function submitCreateCanvas() {
  const input = document.getElementById('new-canvas-name-input');
  const name = input.value.trim() || 'Untitled Flow';

  closeCreateModal();

  try {
    const data = await window.apiFetch(`${window.API || ''}/api/canvas-workflows`, {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    
    showToast('New canvas created successfully!', 'success');
    
    // Instantly navigate into editor
    navigateTo(`canvas.html?id=${data._id}`);
  } catch (err) {
    console.error('Failed to create canvas:', err);
    showToast(err.message || 'Error creating canvas', 'error');
  }
}

async function deleteCanvas(id, name) {
  if (!checkPremiumStatus()) return;
  if (!confirm(`Are you sure you want to permanently delete "${name}"?`)) return;

  try {
    await window.apiFetch(`${window.API || ''}/api/canvas-workflows/${id}`, {
      method: 'DELETE'
    });
    showToast('Canvas deleted successfully.', 'success');
    loadCanvases();
  } catch (err) {
    console.error('Failed to delete canvas:', err);
    showToast('Failed to delete canvas.', 'error');
  }
}

/**
 * ============================================================
 * DESIGNER VIEW LOADERS & RENDERERS
 * ============================================================
 */

async function loadCanvasDetails(id) {
  if (id === 'demo-preview-canvas') {
    activeCanvasId = 'demo-preview-canvas';
    document.getElementById('canvas-dashboard-view').style.display = 'none';
    document.getElementById('canvas-designer-view').style.display = 'flex';
    
    // Populate demo flow data
    canvasData = {
      _id: 'demo-preview-canvas',
      name: '✨ Interactive Demo Canvas',
      nodes: [
        {
          id: 'node_demo_1',
          label: '🚀 Launch Learning Platform',
          type: 'goal',
          status: 'pending',
          x: 100,
          y: 200,
          checklist: ['Complete marketing campaigns', 'Finalize courses list'],
          completedSubtasks: []
        },
        {
          id: 'node_demo_2',
          label: '📝 Collect Student Feedback',
          type: 'action',
          status: 'completed',
          x: 450,
          y: 100,
          checklist: ['Create feedback survey', 'Share on social media'],
          completedSubtasks: ['Create feedback survey', 'Share on social media']
        },
        {
          id: 'node_demo_3',
          label: '❓ Satisfies Demand?',
          type: 'condition',
          status: 'pending',
          x: 800,
          y: 200,
          checklist: ['Over 70% positive feedback?'],
          completedSubtasks: []
        },
        {
          id: 'node_demo_4',
          label: '📚 Create Course Content',
          type: 'action',
          status: 'pending',
          x: 1150,
          y: 100,
          checklist: ['Record video lessons', 'Edit & publish'],
          completedSubtasks: []
        },
        {
          id: 'node_demo_5',
          label: '🔄 Adjust Course Scope',
          type: 'action',
          status: 'pending',
          x: 1150,
          y: 350,
          checklist: ['Refine topics', 'Re-survey audience'],
          completedSubtasks: []
        }
      ],
      edges: [
        {
          id: 'edge_demo_1',
          from: 'node_demo_2',
          fromSide: 'right',
          to: 'node_demo_3',
          toSide: 'left',
          label: 'feedback received'
        },
        {
          id: 'edge_demo_2',
          from: 'node_demo_3',
          fromSide: 'top',
          to: 'node_demo_4',
          toSide: 'left',
          label: 'yes'
        },
        {
          id: 'edge_demo_3',
          from: 'node_demo_3',
          fromSide: 'bottom',
          to: 'node_demo_5',
          toSide: 'left',
          label: 'no'
        },
        {
          id: 'edge_demo_4',
          from: 'node_demo_4',
          fromSide: 'right',
          to: 'node_demo_1',
          toSide: 'top',
          label: 'courses ready'
        }
      ]
    };
    
    document.getElementById('designer-canvas-title').value = canvasData.name;
    
    // Clear stacks
    undoStack = [];
    redoStack = [];
    isDirty = false;

    // Reset pan/zoom
    panX = 120;
    panY = 150;
    scale = 0.85;
    applyViewportTransform();

    renderCanvas();
    setIndicatorState('saved');
    
    // Log helpful system instructions inside sidebar chat
    const log = document.getElementById('chat-history-log');
    if (log) {
      log.innerHTML = `
        <div class="chat-msg agent">
          Welcome to the Interactive Demo! You are viewing a premium canvas teaser. Feel free to zoom, pan, and drag cards to experience the layout engine.
        </div>
        <div class="chat-msg system">
          ⭐ Premium Feature: Instruct the AI Agent to build entire workflows instantly from your text prompts.
        </div>
      `;
    }
    return;
  }

  try {
    setIndicatorState('saving', 'Loading canvas...');
    const data = await window.apiFetch(`${window.API || ''}/api/canvas-workflows/${id}`);
    
    canvasData = data;
    sanitizeNodeCoordinates(canvasData.nodes);
    document.getElementById('designer-canvas-title').value = canvasData.name;
    
    // Clear stacks
    undoStack = [];
    redoStack = [];
    isDirty = false;

    // Reset pan/zoom
    panX = 100;
    panY = 100;
    scale = 0.95;
    applyViewportTransform();

    renderCanvas();
    setIndicatorState('saved');
    
    // Log helpful system instructions inside sidebar chat
    const log = document.getElementById('chat-history-log');
    log.innerHTML = `
      <div class="chat-msg agent">
        Welcome to the editor! Instruct the AI to structure your workflows, or drag cards and link them manually.
      </div>
    `;
  } catch (err) {
    console.error('Error loading canvas:', err);
    showToast('Error loading canvas details.', 'error');
    navigateTo('canvas.html');
  }
}

function renderCanvas() {
  // Clear HTML container
  nodesContainer.innerHTML = '';
  
  if (!canvasData.nodes || canvasData.nodes.length === 0) {
    nodesContainer.innerHTML = `
      <div style="position: absolute; left: 150px; top: 150px; width: 340px; text-align: center; border: var(--border-2); border-style: dashed; padding: 24px; border-radius: var(--r-md); background: var(--bg-card); color: var(--text-muted); font-weight: 800; font-size: 13px; text-transform: uppercase;">
        👋 Blank Canvas. Type in the AI agent text box to build a roadmap, or use "+ Action" buttons to populate cards!
      </div>
    `;
  } else {
    canvasData.nodes.forEach(node => {
      const card = buildNodeCardElement(node);
      nodesContainer.appendChild(card);
    });
  }

  // Draw lines
  drawConnections();
}

/**
 * Generates DOM element for a Node card
 */
function buildNodeCardElement(node) {
  const card = document.createElement('div');
  card.className = `flow-node-card node-type-${node.type}`;
  card.id = `node-${node.id}`;
  card.style.left = `${node.x}px`;
  card.style.top = `${node.y}px`;

  // Determine icon
  let typeIcon = 'play';
  if (node.type === 'condition') typeIcon = 'git-branch';
  else if (node.type === 'goal') typeIcon = 'target';

  // Build checklist HTML
  let checklistHtml = '';
  if (node.checklist && node.checklist.length > 0) {
    const completedList = node.completedSubtasks || [];
    const items = node.checklist.map((item, idx) => {
      const isDone = completedList.includes(item);
      const checkedAttr = isDone ? 'checked' : '';
      
      const deleteBtn = (mode === 'design') 
        ? `<button class="btn-delete-subtask" onclick="deleteSubtask('${node.id}', ${idx})" title="Remove item">×</button>` 
        : '';
        
      return `
        <div class="node-checklist-item">
          <label class="node-checkbox-label">
            <input type="checkbox" ${checkedAttr} onchange="toggleSubtaskDone('${node.id}', '${window.escapeHTML(item)}', this.checked)">
            <span class="node-checklist-text" title="${window.escapeHTML(item)}">${window.escapeHTML(item)}</span>
          </label>
          ${deleteBtn}
        </div>
      `;
    }).join('');
    
    checklistHtml = `<div class="node-checklist">${items}</div>`;
  }

  // Add subtask form (only in design mode)
  let addSubtaskForm = '';
  if (mode === 'design') {
    addSubtaskForm = `
      <div class="add-subtask-container">
        <input type="text" class="add-subtask-input" placeholder="+ Subtask" onkeydown="if(event.key==='Enter') submitAddSubtask('${node.id}', this)" />
        <button class="btn-add-subtask" onclick="submitAddSubtask('${node.id}', this.previousElementSibling)">+</button>
      </div>
    `;
  }

  const isCompleted = node.status === 'completed';
  const statusBadgeClass = isCompleted ? 'status-completed' : 'status-pending';

  card.innerHTML = `
    <div class="node-header">
      <h3><i data-lucide="${typeIcon}"></i> ${node.type}</h3>
      ${mode === 'design' ? `
        <button class="node-action-btn delete" onclick="deleteNode('${node.id}')" title="Delete Card">
          <i data-lucide="x" style="width: 14px; height: 14px;"></i>
        </button>
      ` : ''}
    </div>
    <div class="node-content">
      <div class="node-text-editable" ${mode === 'design' ? 'contenteditable="true"' : ''} onblur="updateNodeLabel('${node.id}', this.textContent)">
        ${window.escapeHTML(node.label || 'New step')}
      </div>
      ${checklistHtml}
      ${addSubtaskForm}
    </div>
    <div class="node-footer">
      <span class="node-status-badge ${statusBadgeClass}" onclick="toggleNodeStatus('${node.id}')">
        ${node.status || 'pending'}
      </span>
    </div>
    ${mode === 'design' ? `
      <div class="node-connector connector-top ${isLinking && linkSourceNodeId === node.id && linkSourceSide === 'top' ? 'active-link' : ''}" onclick="handleConnectorClick(event, '${node.id}', 'top')">+</div>
      <div class="node-connector connector-right ${isLinking && linkSourceNodeId === node.id && linkSourceSide === 'right' ? 'active-link' : ''}" onclick="handleConnectorClick(event, '${node.id}', 'right')">+</div>
      <div class="node-connector connector-bottom ${isLinking && linkSourceNodeId === node.id && linkSourceSide === 'bottom' ? 'active-link' : ''}" onclick="handleConnectorClick(event, '${node.id}', 'bottom')">+</div>
      <div class="node-connector connector-left ${isLinking && linkSourceNodeId === node.id && linkSourceSide === 'left' ? 'active-link' : ''}" onclick="handleConnectorClick(event, '${node.id}', 'left')">+</div>
    ` : ''}
  `;

  // Bind drag-and-drop listener to the header
  const header = card.querySelector('.node-header');
  header.addEventListener('mousedown', (e) => startDragNode(e, node.id));
  header.addEventListener('touchstart', (e) => startDragNodeTouch(e, node.id), { passive: true });

  // Visual highlight if selected in linking mode
  if (isLinking && linkSourceNodeId === node.id) {
    card.classList.add('selected');
  }

  if (window.lucide) {
    setTimeout(() => lucide.createIcons({ root: card }), 10);
  }

  return card;
}

/**
 * Draws connecting bezier paths on the SVG layer
 */
function drawConnections() {
  if (!svgPathsContainer) return;
  svgPathsContainer.innerHTML = '';

  if (!canvasData.edges || canvasData.edges.length === 0) return;

  canvasData.edges.forEach(edge => {
    const elFrom = document.getElementById(`node-${edge.from}`);
    const elTo = document.getElementById(`node-${edge.to}`);
    
    // Find node definitions
    const nFrom = canvasData.nodes.find(n => n.id === edge.from);
    const nTo = canvasData.nodes.find(n => n.id === edge.to);

    if (nFrom && nTo) {
      // Calculate coordinates dynamically using elements heights (for variable checklist sizes)
      const hFrom = elFrom ? elFrom.offsetHeight : 150;
      const hTo = elTo ? elTo.offsetHeight : 150;
      
      const width = 270; // fixed width of node card in CSS
      
      const fromSide = edge.fromSide || 'right';
      const toSide = edge.toSide || 'left';
      
      // Calculate start coordinates based on side
      let x1, y1;
      if (fromSide === 'top') {
        x1 = nFrom.x + width / 2;
        y1 = nFrom.y;
      } else if (fromSide === 'right') {
        x1 = nFrom.x + width;
        y1 = nFrom.y + hFrom / 2;
      } else if (fromSide === 'bottom') {
        x1 = nFrom.x + width / 2;
        y1 = nFrom.y + hFrom;
      } else { // left
        x1 = nFrom.x;
        y1 = nFrom.y + hFrom / 2;
      }
      
      // Calculate end coordinates based on side
      let x2, y2;
      if (toSide === 'top') {
        x2 = nTo.x + width / 2;
        y2 = nTo.y;
      } else if (toSide === 'right') {
        x2 = nTo.x + width;
        y2 = nTo.y + hTo / 2;
      } else if (toSide === 'bottom') {
        x2 = nTo.x + width / 2;
        y2 = nTo.y + hTo;
      } else { // left
        x2 = nTo.x;
        y2 = nTo.y + hTo / 2;
      }

      // Organic bezier curvature based on port directions
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const offset = Math.max(50, dist * 0.35); // dynamic offset based on distance

      let cp1x = x1;
      let cp1y = y1;
      if (fromSide === 'top') cp1y -= offset;
      else if (fromSide === 'right') cp1x += offset;
      else if (fromSide === 'bottom') cp1y += offset;
      else if (fromSide === 'left') cp1x -= offset;

      let cp2x = x2;
      let cp2y = y2;
      if (toSide === 'top') cp2y -= offset;
      else if (toSide === 'right') cp2x += offset;
      else if (toSide === 'bottom') cp2y += offset;
      else if (toSide === 'left') cp2x -= offset;

      const d = `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;

      // Create SVG Path
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'flow-edge-path interactive');
      path.setAttribute('data-id', edge.id);
      path.setAttribute('marker-end', 'url(#arrow)');

      // In design mode, click deletes connections
      if (mode === 'design') {
        path.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm('Delete this connection path?')) {
            deleteEdge(edge.id);
          }
        });
      }

      svgPathsContainer.appendChild(path);

      // Render Label if defined
      if (edge.label) {
        // Approximate center of bezier path at t=0.5
        const mx = 0.125 * x1 + 0.375 * cp1x + 0.375 * cp2x + 0.125 * x2;
        const my = 0.125 * y1 + 0.375 * cp1y + 0.375 * cp2y + 0.125 * y2;

        const gLabel = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('class', 'edge-label-bg');
        
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('class', 'edge-label-text');
        text.setAttribute('x', mx);
        text.setAttribute('y', my);
        text.textContent = edge.label;
        
        gLabel.appendChild(rect);
        gLabel.appendChild(text);
        svgPathsContainer.appendChild(gLabel);
        
        // Auto position text bg rect size
        setTimeout(() => {
          try {
            const bbox = text.getBBox();
            rect.setAttribute('x', bbox.x - 6);
            rect.setAttribute('y', bbox.y - 3);
            rect.setAttribute('width', bbox.width + 12);
            rect.setAttribute('height', bbox.height + 6);
          } catch(e) {}
        }, 10);
      }
    }
  });
}

/**
 * ============================================================
 * INTERACTIVE VIEWPORT ENGINE (ZOOMING & PANNING)
 * ============================================================
 */

function setupDesignerInteraction() {
  // Panning event listeners
  viewportContainer.addEventListener('mousedown', handleViewportMouseDown);
  window.addEventListener('mousemove', handleViewportMouseMove);
  window.addEventListener('mouseup', handleViewportMouseUp);
  
  // Touch panning and zooming listeners
  viewportContainer.addEventListener('touchstart', handleViewportTouchStart, { passive: true });
  window.addEventListener('touchmove', handleViewportTouchMove, { passive: false });
  window.addEventListener('touchend', handleViewportTouchEnd);
  
  // Zooming listener
  viewportContainer.addEventListener('wheel', handleViewportWheel, { passive: false });
}

function handleViewportMouseDown(e) {
  // Prevent panning if click occurs inside a card, sidebar, or viewport overlays
  if (e.target.closest('.flow-node-card') || 
      e.target.closest('#canvas-sidebar-panel') || 
      e.target.closest('.viewport-controls') ||
      e.target.closest('#canvas-node-toolbox') ||
      e.target.closest('.designer-toolbar')) {
    return;
  }
  
  isPanning = true;
  viewportContainer.style.cursor = 'grabbing';
  startPanX = e.clientX - panX;
  startPanY = e.clientY - panY;
}

function handleViewportMouseMove(e) {
  if (isPanning) {
    panX = e.clientX - startPanX;
    panY = e.clientY - startPanY;
    applyViewportTransform();
  }
}

function handleViewportMouseUp() {
  if (isPanning) {
    isPanning = false;
    if (viewportContainer) viewportContainer.style.cursor = 'grab';
  }
}

let lastTouchDist = null;

function handleViewportTouchStart(e) {
  // Prevent panning if touch occurs inside a card, sidebar, etc.
  if (e.target.closest('.flow-node-card') || 
      e.target.closest('#canvas-sidebar-panel') || 
      e.target.closest('.viewport-controls') ||
      e.target.closest('#canvas-node-toolbox') ||
      e.target.closest('.designer-toolbar') ||
      e.target.closest('#mobile-sidebar-toggle')) {
    return;
  }
  
  if (e.touches.length === 1) {
    isPanning = true;
    const touch = e.touches[0];
    startPanX = touch.clientX - panX;
    startPanY = touch.clientY - panY;
    lastTouchDist = null;
  } else if (e.touches.length === 2) {
    isPanning = false;
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    lastTouchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
  }
}

function handleViewportTouchMove(e) {
  if (isPanning && e.touches.length === 1) {
    e.preventDefault();
    const touch = e.touches[0];
    panX = touch.clientX - startPanX;
    panY = touch.clientY - startPanY;
    applyViewportTransform();
  } else if (e.touches.length === 2 && lastTouchDist) {
    e.preventDefault();
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    
    const factor = dist / lastTouchDist;
    lastTouchDist = dist;
    
    const midX = (t1.clientX + t2.clientX) / 2;
    const midY = (t1.clientY + t2.clientY) / 2;
    
    const containerRect = viewportContainer.getBoundingClientRect();
    const relativeX = midX - containerRect.left;
    const relativeY = midY - containerRect.top;
    
    const lastScale = scale;
    scale *= factor;
    scale = Math.max(0.15, Math.min(2.2, scale));
    
    const scaleRatio = scale / lastScale;
    panX = relativeX - (relativeX - panX) * scaleRatio;
    panY = relativeY - (relativeY - panY) * scaleRatio;
    
    applyViewportTransform();
  }
}

function handleViewportTouchEnd() {
  if (isPanning) {
    isPanning = false;
  }
  lastTouchDist = null;
}

function handleViewportWheel(e) {
  e.preventDefault();

  const containerRect = viewportContainer.getBoundingClientRect();
  const mouseX = e.clientX - containerRect.left;
  const mouseY = e.clientY - containerRect.top;

  const zoomIntensity = 0.06;
  const lastScale = scale;

  if (e.deltaY < 0) {
    scale += zoomIntensity * scale;
  } else {
    scale -= zoomIntensity * scale;
  }
  
  // Clamping scale between 0.15 and 2.2
  scale = Math.max(0.15, Math.min(2.2, scale));

  // Shift pans to zoom towards mouse cursor center
  panX = mouseX - (mouseX - panX) * (scale / lastScale);
  panY = mouseY - (mouseY - panY) * (scale / lastScale);

  applyViewportTransform();
}

function applyViewportTransform() {
  if (workspace) {
    workspace.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }
  if (viewportContainer) {
    const bgSize = 30 * scale;
    const offset = bgSize / 2;
    viewportContainer.style.backgroundSize = `${bgSize}px ${bgSize}px`;
    viewportContainer.style.backgroundPosition = `${panX}px ${panY}px, ${panX + offset}px ${panY + offset}px`;
  }
}

// Control buttons
window.zoomIn = function() {
  scale = Math.min(2.2, scale * 1.15);
  applyViewportTransform();
};

window.zoomOut = function() {
  scale = Math.max(0.15, scale / 1.15);
  applyViewportTransform();
};

window.resetZoom = function() {
  scale = 1.0;
  panX = 100;
  panY = 100;
  applyViewportTransform();
};

/**
 * ============================================================
 * CARD DRAGGING ENGINE
 * ============================================================
 */

function startDragNode(e, nodeId) {
  if (mode !== 'design') return; // locked in execution mode
  
  // Stop event bubbling (prevents viewport panning)
  e.stopPropagation();
  
  draggedNodeId = nodeId;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  
  const node = canvasData.nodes.find(n => n.id === nodeId);
  if (node) {
    dragNodeStartX = node.x;
    dragNodeStartY = node.y;
    
    // Select this card visually
    document.querySelectorAll('.flow-node-card').forEach(c => c.classList.remove('selected'));
    document.getElementById(`node-${nodeId}`).classList.add('selected');
  }

  window.addEventListener('mousemove', dragNodeMove);
  window.addEventListener('mouseup', dragNodeEnd);
}

function dragNodeMove(e) {
  if (!draggedNodeId) return;

  const dx = (e.clientX - dragStartX) / scale;
  const dy = (e.clientY - dragStartY) / scale;

  const node = canvasData.nodes.find(n => n.id === draggedNodeId);
  if (node) {
    node.x = dragNodeStartX + dx;
    node.y = dragNodeStartY + dy;

    // Apply styles to card immediately
    const el = document.getElementById(`node-${draggedNodeId}`);
    if (el) {
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
    }

    // Refresh connections instantly
    drawConnections();
  }
}

function dragNodeEnd() {
  window.removeEventListener('mousemove', dragNodeMove);
  window.removeEventListener('mouseup', dragNodeEnd);
  
  if (draggedNodeId) {
    draggedNodeId = null;
    if (checkPremiumStatusSilent()) {
      markDirty();
      pushHistory();
    }
  }
}

function startDragNodeTouch(e, nodeId) {
  if (mode !== 'design') return;
  
  // Stop event bubbling (prevents viewport panning)
  e.stopPropagation();
  
  const touch = e.touches[0];
  draggedNodeId = nodeId;
  dragStartX = touch.clientX;
  dragStartY = touch.clientY;
  
  const node = canvasData.nodes.find(n => n.id === nodeId);
  if (node) {
    dragNodeStartX = node.x;
    dragNodeStartY = node.y;
    
    // Select this card visually
    document.querySelectorAll('.flow-node-card').forEach(c => c.classList.remove('selected'));
    const cardEl = document.getElementById(`node-${nodeId}`);
    if (cardEl) cardEl.classList.add('selected');
  }
 
  window.addEventListener('touchmove', dragNodeMoveTouch, { passive: false });
  window.addEventListener('touchend', dragNodeEndTouch);
}

function dragNodeMoveTouch(e) {
  if (!draggedNodeId) return;
  
  // Prevent screen scrolling while dragging
  e.preventDefault();

  const touch = e.touches[0];
  const dx = (touch.clientX - dragStartX) / scale;
  const dy = (touch.clientY - dragStartY) / scale;

  const node = canvasData.nodes.find(n => n.id === draggedNodeId);
  if (node) {
    node.x = dragNodeStartX + dx;
    node.y = dragNodeStartY + dy;

    // Apply styles to card immediately
    const el = document.getElementById(`node-${draggedNodeId}`);
    if (el) {
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
    }

    // Refresh connections instantly
    drawConnections();
  }
}

function dragNodeEndTouch() {
  window.removeEventListener('touchmove', dragNodeMoveTouch);
  window.removeEventListener('touchend', dragNodeEndTouch);
  
  if (draggedNodeId) {
    draggedNodeId = null;
    if (checkPremiumStatusSilent()) {
      markDirty();
      pushHistory();
    }
  }
}

/**
 * ============================================================
 * DESIGN VS EXECUTION CONTROLS
 * ============================================================
 */

window.setMode = function(m) {
  if (m === mode) return;
  mode = m;

  document.getElementById('btn-mode-design').classList.toggle('active', mode === 'design');
  document.getElementById('btn-mode-execute').classList.toggle('active', mode === 'execute');

  // Show/hide the node toolbox (only visible in design mode)
  const toolbox = document.getElementById('canvas-node-toolbox');
  if (toolbox) {
    if (mode === 'design') {
      toolbox.classList.remove('hidden');
    } else {
      toolbox.classList.add('hidden');
    }
  }

  // Cancel linking mode if active
  if (isLinking) {
    isLinking = false;
    linkSourceNodeId = null;
    const btnLink = document.getElementById('btn-manual-link');
    if (btnLink) {
      btnLink.style.background = '';
      btnLink.innerHTML = '<i data-lucide="link"></i> Connect';
    }
  }

  showToast(`Switched to ${mode} mode`, 'success');
  renderCanvas();
};

/**
 * ============================================================
 * MANUAL NODE EDITING & CREATION
 * ============================================================
 */

window.addNodeManually = function(type) {
  if (!checkPremiumStatus()) return;
  if (mode !== 'design') {
    showToast('Switched to design mode to add nodes', 'warn');
    setMode('design');
  }

  // Create node details
  const randomId = 'node_' + Math.random().toString(36).substring(2, 9);
  
  // Calculate center of screen inside viewport container relative to workspace
  const containerRect = viewportContainer.getBoundingClientRect();
  const centerX = (containerRect.width / 2 - panX) / scale;
  const centerY = (containerRect.height / 2 - panY) / scale;

  // Add random offset so they don't overlay
  const offsetRange = 60;
  const x = centerX - 135 + (Math.random() - 0.5) * offsetRange;
  const y = centerY - 75 + (Math.random() - 0.5) * offsetRange;

  const newNode = {
    id: randomId,
    label: `NEW ${type.toUpperCase()}`,
    type: type,
    status: 'pending',
    x: Math.round(x),
    y: Math.round(y),
    checklist: [],
    completedSubtasks: []
  };

  canvasData.nodes.push(newNode);
  
  markDirty();
  pushHistory();
  renderCanvas();

  // Focus and select name immediately
  setTimeout(() => {
    const card = document.getElementById(`node-${randomId}`);
    if (card) {
      card.classList.add('selected');
      const editable = card.querySelector('.node-text-editable');
      if (editable) {
        editable.focus();
        // Select all text in contenteditable
        const range = document.createRange();
        range.selectNodeContents(editable);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }, 100);
};

window.deleteNode = function(nodeId) {
  if (!checkPremiumStatus()) return;
  if (mode !== 'design') return;
  if (!confirm('Are you sure you want to delete this node? All connections to it will be removed.')) return;

  // Remove node
  canvasData.nodes = canvasData.nodes.filter(n => n.id !== nodeId);

  // Remove corresponding edges
  canvasData.edges = canvasData.edges.filter(e => e.from !== nodeId && e.to !== nodeId);

  markDirty();
  pushHistory();
  renderCanvas();
};

window.updateNodeLabel = function(nodeId, newLabel) {
  if (!checkPremiumStatus()) {
    renderCanvas();
    return;
  }
  const node = canvasData.nodes.find(n => n.id === nodeId);
  if (node) {
    const cleanLabel = newLabel.trim();
    if (node.label !== cleanLabel) {
      node.label = cleanLabel;
      markDirty();
      pushHistory();
      // Only draw connections to fix height differences
      drawConnections();
    }
  }
};

window.toggleNodeStatus = function(nodeId) {
  if (!checkPremiumStatus()) return;
  const node = canvasData.nodes.find(n => n.id === nodeId);
  if (node) {
    node.status = (node.status === 'completed') ? 'pending' : 'completed';
    
    // Auto-toggle checklist items if completed
    if (node.status === 'completed') {
      node.completedSubtasks = [...node.checklist];
    } else {
      node.completedSubtasks = [];
    }

    markDirty();
    pushHistory();
    renderCanvas();
  }
};

// Checklist management
window.submitAddSubtask = function(nodeId, inputEl) {
  if (!checkPremiumStatus()) {
    inputEl.value = '';
    return;
  }
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';

  const node = canvasData.nodes.find(n => n.id === nodeId);
  if (node) {
    if (!node.checklist) node.checklist = [];
    node.checklist.push(text);

    markDirty();
    pushHistory();
    renderCanvas();
  }
};

window.deleteSubtask = function(nodeId, itemIdx) {
  if (!checkPremiumStatus()) return;
  const node = canvasData.nodes.find(n => n.id === nodeId);
  if (node) {
    const itemText = node.checklist[itemIdx];
    node.checklist.splice(itemIdx, 1);
    
    // Also remove from completed subtasks list
    if (node.completedSubtasks) {
      node.completedSubtasks = node.completedSubtasks.filter(t => t !== itemText);
    }

    markDirty();
    pushHistory();
    renderCanvas();
  }
};

window.toggleSubtaskDone = function(nodeId, itemText, isChecked) {
  if (!checkPremiumStatus()) {
    renderCanvas(); // Re-render to reset visual checked state
    return;
  }
  const node = canvasData.nodes.find(n => n.id === nodeId);
  if (node) {
    if (!node.completedSubtasks) node.completedSubtasks = [];
    
    if (isChecked) {
      if (!node.completedSubtasks.includes(itemText)) {
        node.completedSubtasks.push(itemText);
      }
      // Auto complete node if all checklist items are completed
      if (node.checklist.every(item => node.completedSubtasks.includes(item))) {
        node.status = 'completed';
      }
    } else {
      node.completedSubtasks = node.completedSubtasks.filter(t => t !== itemText);
      // Revert status to pending
      node.status = 'pending';
    }

    markDirty();
    pushHistory();
    renderCanvas();
  }
};

/**
 * ============================================================
 * MANUAL EDGES LINKING MODE
 * ============================================================
 */

function cancelLinkingState() {
  isLinking = false;
  linkSourceNodeId = null;
  linkSourceSide = null;
  const btnLink = document.getElementById('btn-manual-link');
  if (btnLink) {
    btnLink.style.background = '';
    btnLink.innerHTML = '<i data-lucide="link"></i> Connect';
    if (window.lucide) {
      lucide.createIcons({ root: btnLink });
    }
  }
}

window.startManualLinkMode = function() {
  if (!checkPremiumStatus()) return;
  if (mode !== 'design') {
    showToast('Switched to design mode to connect nodes', 'warn');
    setMode('design');
  }

  if (isLinking) {
    cancelLinkingState();
    showToast('Connection mode cancelled.', 'warn');
    renderCanvas();
  } else {
    isLinking = true;
    linkSourceNodeId = null;
    linkSourceSide = null;
    const btnLink = document.getElementById('btn-manual-link');
    if (btnLink) {
      btnLink.style.background = 'var(--yellow)';
      btnLink.innerHTML = '<i data-lucide="x"></i> Linking...';
      if (window.lucide) {
        lucide.createIcons({ root: btnLink });
      }
    }
    showToast('Click a starting node plus port to connect.', 'success');
  }
};

window.handleConnectorClick = function(event, nodeId, side) {
  if (event) event.stopPropagation();
  
  if (!checkPremiumStatus()) return;
  if (mode !== 'design') return;

  if (!isLinking) {
    // Start linking
    isLinking = true;
    linkSourceNodeId = nodeId;
    linkSourceSide = side;
    
    const btnLink = document.getElementById('btn-manual-link');
    if (btnLink) {
      btnLink.style.background = 'var(--yellow)';
      btnLink.innerHTML = '<i data-lucide="x"></i> Linking...';
      if (window.lucide) {
        lucide.createIcons({ root: btnLink });
      }
    }
    
    showToast('Select a target plus port to finish connection.', 'success');
    renderCanvas();
  } else {
    // Already linking
    if (linkSourceNodeId === nodeId && linkSourceSide === side) {
      cancelLinkingState();
      showToast('Connection cancelled.', 'warn');
      renderCanvas();
      return;
    }

    // Check if edge already exists
    const exists = canvasData.edges.some(e => 
      e.from === linkSourceNodeId && 
      e.fromSide === linkSourceSide && 
      e.to === nodeId && 
      e.toSide === side
    );

    if (exists) {
      showToast('Connection already exists.', 'warn');
    } else {
      const label = prompt('Optional connector label (e.g. Yes, No, 10 minutes) - Leave blank if none:');
      
      const newEdge = {
        id: 'edge_' + Math.random().toString(36).substring(2, 9),
        from: linkSourceNodeId,
        fromSide: linkSourceSide,
        to: nodeId,
        toSide: side,
        label: label ? label.trim() : undefined
      };

      canvasData.edges.push(newEdge);
      markDirty();
      pushHistory();
    }

    cancelLinkingState();
    renderCanvas();
  }
};

window.deleteEdge = function(edgeId) {
  if (!checkPremiumStatus()) return;
  canvasData.edges = canvasData.edges.filter(e => e.id !== edgeId);
  markDirty();
  pushHistory();
  renderCanvas();
};

/**
 * ============================================================
 * UNDO / REDO HISTORY ENGINE
 * ============================================================
 */

function pushHistory() {
  const currentSnapshot = JSON.stringify({
    nodes: canvasData.nodes,
    edges: canvasData.edges
  });

  // Limit stack size to 25 steps
  if (undoStack.length >= 25) {
    undoStack.shift();
  }

  undoStack.push(currentSnapshot);
  // Clear redo stack on new operation
  redoStack = [];
}

window.triggerUndo = function() {
  if (!checkPremiumStatus()) return;
  if (undoStack.length === 0) {
    showToast('Nothing to undo', 'warn');
    return;
  }

  // Save current for redo
  const currentSnapshot = JSON.stringify({
    nodes: canvasData.nodes,
    edges: canvasData.edges
  });
  redoStack.push(currentSnapshot);

  // Load popped state
  const prevSnapshot = JSON.parse(undoStack.pop());
  canvasData.nodes = prevSnapshot.nodes;
  canvasData.edges = prevSnapshot.edges;

  markDirty();
  renderCanvas();
  showToast('Undo completed', 'success');
};

window.triggerRedo = function() {
  if (!checkPremiumStatus()) return;
  if (redoStack.length === 0) {
    showToast('Nothing to redo', 'warn');
    return;
  }

  // Save current for undo
  const currentSnapshot = JSON.stringify({
    nodes: canvasData.nodes,
    edges: canvasData.edges
  });
  undoStack.push(currentSnapshot);

  // Load popped state
  const nextSnapshot = JSON.parse(redoStack.pop());
  canvasData.nodes = nextSnapshot.nodes;
  canvasData.edges = nextSnapshot.edges;

  markDirty();
  renderCanvas();
  showToast('Redo completed', 'success');
};

function handleGlobalKeydowns(e) {
  // Check if inside input or text area
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true') {
    return;
  }

  // Ctrl+Z
  if (e.ctrlKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    triggerUndo();
  }
  // Ctrl+Y
  if (e.ctrlKey && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    triggerRedo();
  }
}

/**
 * ============================================================
 * MANUAL & AUTO-SAVE MANAGEMENT
 * ============================================================
 */

function markDirty() {
  isDirty = true;
  setIndicatorState('unsaved');
}

function setIndicatorState(state, customText = '') {
  if (!saveIndicator) return;
  saveIndicator.className = `save-status ${state}`;
  
  const span = saveIndicator.querySelector('span');
  const icon = saveIndicator.querySelector('.lucide');
  
  if (state === 'saved') {
    span.textContent = 'Saved';
    if (icon) icon.setAttribute('data-lucide', 'check-circle');
  } else if (state === 'unsaved') {
    span.textContent = 'Unsaved changes';
    if (icon) icon.setAttribute('data-lucide', 'alert-circle');
  } else if (state === 'saving') {
    span.textContent = customText || 'Saving...';
    if (icon) icon.setAttribute('data-lucide', 'refresh-cw');
  }
  
  if (window.lucide) {
    lucide.createIcons({ root: saveIndicator });
  }
}

window.renameCanvas = async function(newName) {
  if (!checkPremiumStatus()) {
    const input = document.getElementById('designer-canvas-title');
    if (input) input.value = canvasData.name;
    return;
  }
  const clean = newName.trim();
  if (!clean || clean === canvasData.name) return;

  canvasData.name = clean;
  markDirty();
  saveCanvasCurrentState();
};

window.saveCanvasCurrentState = async function(isAutoSave = false) {
  if (!checkPremiumStatus()) return;
  if (!activeCanvasId) return;

  if (!isAutoSave) {
    setIndicatorState('saving', 'Saving...');
  }

  try {
    const response = await window.apiFetch(`${window.API || ''}/api/canvas-workflows/${activeCanvasId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: canvasData.name,
        nodes: canvasData.nodes,
        edges: canvasData.edges
      })
    });

    canvasData = response;
    sanitizeNodeCoordinates(canvasData.nodes);
    isDirty = false;
    setIndicatorState('saved');
    if (!isAutoSave) {
      showToast('Canvas saved successfully.', 'success');
    }
  } catch (err) {
    console.error('Failed to save canvas:', err);
    setIndicatorState('unsaved');
    if (!isAutoSave) {
      showToast('Error saving canvas. Please check network connection.', 'error');
    }
  }
};

window.clearCanvasFlow = function() {
  if (!checkPremiumStatus()) return;
  if (!confirm('Reset canvas? This will clear all nodes and edges. This action can be undone.')) return;
  
  canvasData.nodes = [];
  canvasData.edges = [];
  
  markDirty();
  pushHistory();
  renderCanvas();
};

/**
 * ============================================================
 * CANVAS EXPORT (DOWNLOAD)
 * ============================================================
 */

window.openDownloadModal = function() {
  const modal = document.getElementById('modal-download-canvas');
  if (modal) {
    modal.classList.add('active');
    const progressMsg = document.getElementById('download-progress-msg');
    if (progressMsg) progressMsg.style.display = 'none';
    // Re-enable all format buttons
    modal.querySelectorAll('.download-format-btn').forEach(btn => { btn.disabled = false; });
  }
};

window.closeDownloadModal = function() {
  const modal = document.getElementById('modal-download-canvas');
  if (modal) modal.classList.remove('active');
};

/**
 * Utility to save or share a generated file (especially on native apps like Capacitor Android/iOS)
 */
async function saveOrShareFile(dataUrl, filename, mimeType) {
  try {
    // If it's the native Android App wrapper, bypass Web Share and trigger link click
    // so that the WebView's DownloadListener intercepts it and saves it natively.
    if (window.isAndroidNative) {
      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return true;
    }

    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobileDevice && navigator.canShare) {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], filename, { type: mimeType });
      
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
        });
        return true;
      }
    }
  } catch (err) {
    console.error('Web Share failed, falling back to download:', err);
  }
  
  // Standard fallback download link
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return false;
}

window.downloadCanvas = async function(format) {
  const progressMsg = document.getElementById('download-progress-msg');
  const modal = document.getElementById('modal-download-canvas');

  // Show loading state
  if (progressMsg) {
    progressMsg.style.display = 'block';
    progressMsg.textContent = 'Saving canvas...';
  }
  // Disable buttons to prevent double-click
  if (modal) {
    modal.querySelectorAll('.download-format-btn').forEach(btn => { btn.disabled = true; });
  }

  try {
    // ── STEP 1: Auto-save current state before export ──────────────────
    if (isDirty && activeCanvasId && checkPremiumStatusSilent()) {
      try {
        await window.apiFetch(`${window.API || ''}/api/canvas-workflows/${activeCanvasId}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: canvasData.name,
            nodes: canvasData.nodes,
            edges: canvasData.edges
          })
        });
        isDirty = false;
        setIndicatorState('saved');
      } catch (saveErr) {
        console.warn('Pre-export save failed, continuing with current state:', saveErr);
      }
    }

    if (progressMsg) progressMsg.textContent = 'Rendering full canvas...';

    // ── STEP 2: Hide UI overlays so they don't appear in export ────────
    const toolbox = document.getElementById('canvas-node-toolbox');
    const viewportControls = document.querySelector('.viewport-controls');
    const mobileToggle = document.getElementById('mobile-sidebar-toggle');
    if (toolbox) toolbox.style.visibility = 'hidden';
    if (viewportControls) viewportControls.style.visibility = 'hidden';
    if (mobileToggle) mobileToggle.style.visibility = 'hidden';

    // Hide node connectors, action buttons, and subtask additions during export to prevent rendering artifacts (ghost black blocks)
    document.body.classList.add('exporting-canvas');

    const connectors = document.querySelectorAll('.node-connector');
    connectors.forEach(c => { c.style.display = 'none'; });

    const deleteBtns = document.querySelectorAll('.node-action-btn.delete');
    deleteBtns.forEach(b => { b.style.display = 'none'; });

    const addSubtaskContainers = document.querySelectorAll('.add-subtask-container');
    addSubtaskContainers.forEach(container => { container.style.display = 'none'; });

    if (!window.html2canvas) {
      throw new Error('html2canvas library not loaded. Please check your internet connection.');
    }

    // ── STEP 3: Calculate bounding box of all nodes and connections ─────
    const NODE_WIDTH = 270;
    const NODE_PADDING = 120; // generous padding so edge nodes are never clipped

    // Force parse coordinates strictly as numbers
    sanitizeNodeCoordinates(canvasData.nodes);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    if (canvasData.nodes && canvasData.nodes.length > 0) {
      canvasData.nodes.forEach(node => {
        // Estimate node height (checklist items add ~28px each, base ~180px)
        const estimatedH = 180 + ((node.checklist || []).length * 28);
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + NODE_WIDTH);
        maxY = Math.max(maxY, node.y + estimatedH);
      });
    } else {
      // Blank canvas — use a sensible default area
      minX = 0; minY = 0; maxX = 800; maxY = 500;
    }

    // Also expand bounds to cover any sweeping Bezier curves (connection lines)
    if (canvasData.edges && canvasData.edges.length > 0 && canvasData.nodes && canvasData.nodes.length > 0) {
      canvasData.edges.forEach(edge => {
        const nFrom = canvasData.nodes.find(n => n.id === edge.from);
        const nTo = canvasData.nodes.find(n => n.id === edge.to);
        if (nFrom && nTo) {
          const hFrom = document.getElementById(`node-${edge.from}`)?.offsetHeight || 180;
          const hTo = document.getElementById(`node-${edge.to}`)?.offsetHeight || 180;

          const fromSide = edge.fromSide || 'right';
          const toSide = edge.toSide || 'left';

          let x1, y1;
          if (fromSide === 'top') { x1 = nFrom.x + NODE_WIDTH / 2; y1 = nFrom.y; }
          else if (fromSide === 'right') { x1 = nFrom.x + NODE_WIDTH; y1 = nFrom.y + hFrom / 2; }
          else if (fromSide === 'bottom') { x1 = nFrom.x + NODE_WIDTH / 2; y1 = nFrom.y + hFrom; }
          else { x1 = nFrom.x; y1 = nFrom.y + hFrom / 2; }

          let x2, y2;
          if (toSide === 'top') { x2 = nTo.x + NODE_WIDTH / 2; y2 = nTo.y; }
          else if (toSide === 'right') { x2 = nTo.x + NODE_WIDTH; y2 = nTo.y + hTo / 2; }
          else if (toSide === 'bottom') { x2 = nTo.x + NODE_WIDTH / 2; y2 = nTo.y + hTo; }
          else { x2 = nTo.x; y2 = nTo.y + hTo / 2; }

          const dx = x2 - x1;
          const dy = y2 - y1;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const offset = Math.max(50, dist * 0.35);

          let cp1x = x1, cp1y = y1;
          if (fromSide === 'top') cp1y -= offset;
          else if (fromSide === 'right') cp1x += offset;
          else if (fromSide === 'bottom') cp1y += offset;
          else if (fromSide === 'left') cp1x -= offset;

          let cp2x = x2, cp2y = y2;
          if (toSide === 'top') cp2y -= offset;
          else if (toSide === 'right') cp2x += offset;
          else if (toSide === 'bottom') cp2y += offset;
          else if (toSide === 'left') cp2x -= offset;

          // Expand bounding box with the control points
          minX = Math.min(minX, cp1x, cp2x);
          minY = Math.min(minY, cp1y, cp2y);
          maxX = Math.max(maxX, cp1x, cp2x);
          maxY = Math.max(maxY, cp1y, cp2y);
        }
      });
    }

    // Fall back to safe bounds if calculations failed or resolved to non-finite values
    if (isNaN(minX) || !isFinite(minX)) minX = 0;
    if (isNaN(minY) || !isFinite(minY)) minY = 0;
    if (isNaN(maxX) || !isFinite(maxX)) maxX = 1000;
    if (isNaN(maxY) || !isFinite(maxY)) maxY = 800;

    // Apply padding
    minX -= NODE_PADDING;
    minY -= NODE_PADDING;
    maxX += NODE_PADDING;
    maxY += NODE_PADDING;

    let contentWidth  = maxX - minX;
    let contentHeight = maxY - minY;

    // Safety fallback for dimensions
    if (isNaN(contentWidth) || contentWidth <= 0) {
      contentWidth = 1200;
    } else if (contentWidth > 16000) {
      contentWidth = 16000;
    }

    if (isNaN(contentHeight) || contentHeight <= 0) {
      contentHeight = 900;
    } else if (contentHeight > 16000) {
      contentHeight = 16000;
    }

    // Calculate dynamic export scale to ensure the resulting canvas does not exceed the browser's 16,384px limit.
    // We aim for 4x scale for crispness, but scale down if the workflow is large.
    let exportScale = 4;
    const maxBrowserCanvasDim = 16384;
    if (contentWidth * exportScale > maxBrowserCanvasDim) {
      exportScale = maxBrowserCanvasDim / contentWidth;
    }
    if (contentHeight * exportScale > maxBrowserCanvasDim) {
      exportScale = Math.min(exportScale, maxBrowserCanvasDim / contentHeight);
    }
    // Ensure the scale is at least 1.0 for decent quality
    exportScale = Math.max(1.0, exportScale);

    // ── STEP 4: Temporarily shift all node coordinates and redraw paths to fit positive coordinate space ─
    const savedPanX  = panX;
    const savedPanY  = panY;
    const savedScale = scale;

    const origCoords = canvasData.nodes.map(n => ({ id: n.id, x: n.x, y: n.y }));
    const shiftX = -minX;
    const shiftY = -minY;

    // Mutate internal node coordinates temporarily to shift everything into positive space
    canvasData.nodes.forEach(n => {
      n.x += shiftX;
      n.y += shiftY;
    });

    // Update DOM positions of node cards temporarily
    canvasData.nodes.forEach(n => {
      const el = document.getElementById(`node-${n.id}`);
      if (el) {
        el.style.left = `${n.x}px`;
        el.style.top = `${n.y}px`;
      }
    });

    // Redraw edges with the new shifted coordinates
    drawConnections();

    // Set scale=1, pan so shifted (0, 0) is at the viewport origin
    panX  = 0;
    panY  = 0;
    scale = 1;
    applyViewportTransform();

    // Temporarily resize the viewport container to exactly fit the content
    const viewportContainer = document.getElementById('canvas-viewport-container');
    const origWidth  = viewportContainer.style.width;
    const origHeight = viewportContainer.style.height;
    const origOverflow = viewportContainer.style.overflow;

    viewportContainer.style.width   = `${contentWidth}px`;
    viewportContainer.style.height  = `${contentHeight}px`;
    viewportContainer.style.overflow = 'visible';

    // Temporarily adjust SVG overlay size to content size (at left: 0, top: 0 relative to workspace)
    const svgOverlay = document.getElementById('canvas-svg-overlay');
    let origSvgWidth = '', origSvgHeight = '';
    if (svgOverlay) {
      origSvgWidth = svgOverlay.style.width;
      origSvgHeight = svgOverlay.style.height;
      svgOverlay.style.width  = `${contentWidth}px`;
      svgOverlay.style.height = `${contentHeight}px`;
    }

    // Small delay to let the DOM repaint
    await new Promise(r => setTimeout(r, 120));

    // ── STEP 5: Capture node content with TRANSPARENT background ──────────
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgColor = isDark ? '#212121' : '#f5f2eb';

    // ── CRITICAL: html2canvas cannot resolve CSS custom properties (var() tokens)
    // for either HTML elements or SVG elements. We must inline all computed values.
    //
    // Strategy A — HTML elements: apply via el.style[prop]
    // Strategy B — SVG elements:  apply via el.setAttribute('fill'/'stroke')
    //
    // First, resolve the actual color values from the document root:
    const rootStyle = window.getComputedStyle(document.documentElement);
    const resolvedVars = {
      bgCard:   rootStyle.getPropertyValue('--bg-card').trim()   || (isDark ? '#2d2d2d' : '#ffffff'),
      text:     rootStyle.getPropertyValue('--text').trim()      || (isDark ? '#e0e0e0' : '#0a0a0a'),
      black:    rootStyle.getPropertyValue('--black').trim()     || '#0a0a0a',
      teal:     rootStyle.getPropertyValue('--teal').trim()      || '#64FFDA',
      pink:     rootStyle.getPropertyValue('--pink').trim()      || '#FF3EA5',
      lime:     rootStyle.getPropertyValue('--lime').trim()      || '#B5FF4D',
    };

    // Strategy A: HTML elements — use getComputedStyle to inline-resolve all CSS custom props
    const CSS_PROPS_TO_RESOLVE = [
      'backgroundColor', 'color', 'borderColor', 'borderTopColor', 'borderRightColor',
      'borderBottomColor', 'borderLeftColor', 'boxShadow', 'outlineColor'
    ];

    const allHtmlEls = Array.from(viewportContainer.querySelectorAll('*')).filter(el => !(el instanceof SVGElement));
    const inlineBackups = allHtmlEls.map(el => {
      const computed = window.getComputedStyle(el);
      const backup = {};
      CSS_PROPS_TO_RESOLVE.forEach(prop => {
        backup[prop] = el.style[prop];
        const computedVal = computed[prop];
        if (computedVal) el.style[prop] = computedVal;
      });
      return backup;
    });

    // Strategy B: SVG elements — set fill/stroke presentation attributes directly
    const edgeLabelBgs   = Array.from(viewportContainer.querySelectorAll('.edge-label-bg'));
    const edgeLabelTexts = Array.from(viewportContainer.querySelectorAll('.edge-label-text'));
    const svgPaths       = Array.from(viewportContainer.querySelectorAll('.flow-edge-path'));
    const svgArrowMarkers = Array.from(viewportContainer.querySelectorAll('marker path, marker polygon'));

    const svgAttrBackups = {
      labelBgFill:   edgeLabelBgs.map(el => el.getAttribute('fill')),
      labelBgStroke: edgeLabelBgs.map(el => el.getAttribute('stroke')),
      labelTextFill: edgeLabelTexts.map(el => el.getAttribute('fill')),
      pathStroke:    svgPaths.map(el => el.getAttribute('stroke')),
      markerFill:    svgArrowMarkers.map(el => el.getAttribute('fill')),
    };

    edgeLabelBgs.forEach(el => {
      el.setAttribute('fill', resolvedVars.bgCard);
      el.setAttribute('stroke', resolvedVars.black);
    });
    edgeLabelTexts.forEach(el => {
      el.setAttribute('fill', resolvedVars.text);
    });
    svgPaths.forEach(el => {
      const currentStroke = window.getComputedStyle(el).stroke;
      el.setAttribute('stroke', currentStroke || resolvedVars.black);
    });
    svgArrowMarkers.forEach(el => {
      el.setAttribute('fill', resolvedVars.black);
    });

    // Temporarily remove background patterns/colors from viewportContainer so html2canvas doesn't capture them
    const origBgImage = viewportContainer.style.backgroundImage;
    const origBgColor = viewportContainer.style.backgroundColor;
    viewportContainer.style.backgroundImage = 'none';
    viewportContainer.style.backgroundColor = 'transparent';

    const renderedCanvas = await window.html2canvas(viewportContainer, {
      backgroundColor: null,
      scale: exportScale,
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: contentWidth,
      height: contentHeight,
      scrollX: 0,
      scrollY: 0,
      windowWidth: contentWidth,
      windowHeight: contentHeight,
    });

    // Restore all inlined HTML computed styles immediately after capture
    allHtmlEls.forEach((el, i) => {
      const backup = inlineBackups[i];
      CSS_PROPS_TO_RESOLVE.forEach(prop => {
        el.style[prop] = backup[prop];
      });
    });

    // Restore all SVG attributes
    edgeLabelBgs.forEach((el, i) => {
      const v = svgAttrBackups.labelBgFill[i];
      if (v === null) el.removeAttribute('fill'); else el.setAttribute('fill', v);
      const vs = svgAttrBackups.labelBgStroke[i];
      if (vs === null) el.removeAttribute('stroke'); else el.setAttribute('stroke', vs);
    });
    edgeLabelTexts.forEach((el, i) => {
      const v = svgAttrBackups.labelTextFill[i];
      if (v === null) el.removeAttribute('fill'); else el.setAttribute('fill', v);
    });
    svgPaths.forEach((el, i) => {
      const v = svgAttrBackups.pathStroke[i];
      if (v === null) el.removeAttribute('stroke'); else el.setAttribute('stroke', v);
    });
    svgArrowMarkers.forEach((el, i) => {
      const v = svgAttrBackups.markerFill[i];
      if (v === null) el.removeAttribute('fill'); else el.setAttribute('fill', v);
    });

    // Restore original background patterns/colors immediately after capture
    viewportContainer.style.backgroundImage = origBgImage;
    viewportContainer.style.backgroundColor = origBgColor;


    // Restore original node coordinates
    origCoords.forEach(orig => {
      const node = canvasData.nodes.find(n => n.id === orig.id);
      if (node) {
        node.x = orig.x;
        node.y = orig.y;
        const el = document.getElementById(`node-${node.id}`);
        if (el) {
          el.style.left = `${node.x}px`;
          el.style.top = `${node.y}px`;
        }
      }
    });

    // Redraw connections to restore original path positions
    drawConnections();

    // Restore SVG overlay size
    if (svgOverlay) {
      svgOverlay.style.width  = origSvgWidth;
      svgOverlay.style.height = origSvgHeight;
    }

    // ── STEP 6: Restore original viewport state ─────────────────────────
    viewportContainer.style.width   = origWidth;
    viewportContainer.style.height  = origHeight;
    viewportContainer.style.overflow = origOverflow;

    panX  = savedPanX;
    panY  = savedPanY;
    scale = savedScale;
    applyViewportTransform();

    // Restore UI overlays and hidden elements
    if (toolbox) toolbox.style.visibility = '';
    if (viewportControls) viewportControls.style.visibility = '';
    if (mobileToggle) mobileToggle.style.visibility = '';

    connectors.forEach(c => { c.style.display = ''; });
    deleteBtns.forEach(b => { b.style.display = ''; });
    addSubtaskContainers.forEach(container => { container.style.display = ''; });

    document.body.classList.remove('exporting-canvas');

    // ── STEP 6.5: Build final composited canvas ────────────────────────────
    // Layer order: solid bg fill → dot grid → node content → watermark
    const EXPORT_SCALE = exportScale;
    const exportPixelWidth  = renderedCanvas.width;   // already × EXPORT_SCALE
    const exportPixelHeight = renderedCanvas.height;

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width  = exportPixelWidth;
    finalCanvas.height = exportPixelHeight;
    const ctx = finalCanvas.getContext('2d');

    // 1️⃣  Solid background fill — covers 100% of every pixel
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, exportPixelWidth, exportPixelHeight);

    // 2️⃣  Dot grid pattern — matches the CSS radial-gradient on the viewport
    //     dotSpacing and dotRadius must be scaled by EXPORT_SCALE since the
    //     canvas coordinate space is 4× the CSS pixel space.
    const dotSpacing = 30 * EXPORT_SCALE;    // 30 CSS-px → 120 canvas-px
    const dotRadius  = 1.5 * EXPORT_SCALE;   // 1.5 CSS-px → 6 canvas-px
    const dotColor   = isDark
      ? 'rgba(255, 255, 255, 0.12)'
      : 'rgba(0, 0, 0, 0.10)';

    ctx.fillStyle = dotColor;
    // Primary dots
    for (let gx = 0; gx < exportPixelWidth + dotSpacing; gx += dotSpacing) {
      for (let gy = 0; gy < exportPixelHeight + dotSpacing; gy += dotSpacing) {
        ctx.beginPath();
        ctx.arc(gx, gy, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Offset dots (CSS uses two background-position values: 0 0 and 15px 15px)
    const offset = dotSpacing / 2;
    for (let gx = offset; gx < exportPixelWidth + dotSpacing; gx += dotSpacing) {
      for (let gy = offset; gy < exportPixelHeight + dotSpacing; gy += dotSpacing) {
        ctx.beginPath();
        ctx.arc(gx, gy, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3️⃣  Node content (transparent bg, so dots show through the gaps)
    ctx.drawImage(renderedCanvas, 0, 0);

    // 4️⃣  "Consistency Daily" watermark — bottom-right corner
    const watermarkPad  = 32 * EXPORT_SCALE;
    const watermarkSize = 13 * EXPORT_SCALE;
    ctx.font = `900 ${watermarkSize}px "Space Grotesk", sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';

    const wmText = 'consistency-daily.vercel.app';
    // Subtle shadow/halo for legibility on any background
    ctx.shadowColor   = isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)';
    ctx.shadowBlur    = 6 * EXPORT_SCALE;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.28)';
    ctx.fillText(wmText, exportPixelWidth - watermarkPad, exportPixelHeight - watermarkPad);

    // Thin dot before the text as a brand indicator
    const dotBrandR = 3 * EXPORT_SCALE;
    const dotBrandX = exportPixelWidth - watermarkPad - ctx.measureText(wmText).width - dotBrandR * 2.5;
    const dotBrandY = exportPixelHeight - watermarkPad - watermarkSize / 2;
    ctx.shadowBlur = 0;
    ctx.fillStyle  = isDark ? 'rgba(100, 255, 218, 0.7)' : 'rgba(0, 120, 90, 0.55)'; // teal accent
    ctx.beginPath();
    ctx.arc(dotBrandX, dotBrandY, dotBrandR, 0, Math.PI * 2);
    ctx.fill();

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur  = 0;



    // ── STEP 7: Create download file ─────────────────────────────────────
    const canvasName = (canvasData.name || 'canvas').replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();
    const timestamp  = new Date().toISOString().slice(0, 10);
    const filename   = `${canvasName}_${timestamp}`;

    if (format === 'png') {
      const dataUrl = finalCanvas.toDataURL('image/png');
      await saveOrShareFile(dataUrl, `${filename}.png`, 'image/png');
      showToast('Canvas exported as high-quality PNG!', 'success');
    } else if (format === 'jpg') {
      const dataUrl = finalCanvas.toDataURL('image/jpeg', 1.0);
      await saveOrShareFile(dataUrl, `${filename}.jpg`, 'image/jpeg');
      showToast('Canvas exported as high-quality JPG!', 'success');
    } else if (format === 'pdf') {
      if (progressMsg) progressMsg.textContent = 'Generating PDF...';

      if (!window.jspdf) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
          script.crossOrigin = 'anonymous';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      const { jsPDF } = window.jspdf;
      // Use the actual canvas aspect ratio for the PDF page size
      const imgRatio   = finalCanvas.width / finalCanvas.height;
      const pdfW       = 1122; // A3 landscape width in points (approx) — gives more room
      const pdfH       = Math.round(pdfW / imgRatio);

      const pdf = new jsPDF({ orientation: imgRatio >= 1 ? 'landscape' : 'portrait', unit: 'pt', format: [pdfW, pdfH] });
      // Optimize: Use JPEG compression with quality 0.85 and FAST speed to reduce the file size from ~330 MB to ~2-3 MB
      pdf.addImage(finalCanvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, pdfW, pdfH, undefined, 'FAST');
      
      const dataUrl = pdf.output('datauristring');
      await saveOrShareFile(dataUrl, `${filename}.pdf`, 'application/pdf');
      showToast('Canvas exported as high-quality PDF!', 'success');
    }

    closeDownloadModal();
  } catch (err) {
    console.error('Canvas export failed:', err);
    showToast(`Export failed: ${err.message || 'Unknown error'}`, 'error');

    // Restore everything on error
    const toolbox = document.getElementById('canvas-node-toolbox');
    const viewportControls = document.querySelector('.viewport-controls');
    const mobileToggle = document.getElementById('mobile-sidebar-toggle');
    if (toolbox) toolbox.style.visibility = '';
    if (viewportControls) viewportControls.style.visibility = '';
    if (mobileToggle) mobileToggle.style.visibility = '';

    document.querySelectorAll('.node-connector').forEach(c => { c.style.display = ''; });
    document.querySelectorAll('.node-action-btn.delete').forEach(b => { b.style.display = ''; });
    document.querySelectorAll('.add-subtask-container').forEach(container => { container.style.display = ''; });
    document.body.classList.remove('exporting-canvas');

    // Also restore viewport if it was resized
    try {
      panX = savedPanX; panY = savedPanY; scale = savedScale;
      applyViewportTransform();
    } catch(_) {}

    if (progressMsg) progressMsg.style.display = 'none';
    if (modal) {
      modal.querySelectorAll('.download-format-btn').forEach(btn => { btn.disabled = false; });
    }
  }
};

window.backToDashboard = async function() {
  if (isDirty) {
    if (confirm('You have unsaved changes. Would you like to save before leaving?')) {
      await saveCanvasCurrentState();
    }
  }
  
  // Transition back to list dashboard
  navigateTo('canvas.html');
};

/**
 * ============================================================
 * AI AGENT INTERACTION ENGINE
 * ============================================================
 */

function appendChatMessage(sender, text) {
  const log = document.getElementById('chat-history-log');
  if (!log) return;

  const msg = document.createElement('div');
  msg.className = `chat-msg ${sender}`;
  msg.textContent = text;
  
  log.appendChild(msg);
  
  // Smooth scroll
  log.scrollTop = log.scrollHeight;
}

/**
 * Hierarchical Auto-Layout Engine
 * Places nodes in neat vertical columns based on their rank (dependency levels)
 */
function autoLayoutNodes() {
  if (!checkPremiumStatus()) return;
  if (!canvasData.nodes || canvasData.nodes.length === 0) return;

  // 1. Calculate in-degrees (number of incoming edges) to find roots
  const inDegree = {};
  const adj = {};
  canvasData.nodes.forEach(n => {
    inDegree[n.id] = 0;
    adj[n.id] = [];
  });

  canvasData.edges.forEach(e => {
    if (adj[e.from]) {
      adj[e.from].push(e.to);
    }
    if (inDegree[e.to] !== undefined) {
      inDegree[e.to]++;
    }
  });

  // 2. Assign ranks using a Breadth-First Search (BFS) starting from roots
  const ranks = {};
  const queue = [];
  
  // Find roots (nodes with 0 incoming edges)
  canvasData.nodes.forEach(n => {
    if (inDegree[n.id] === 0) {
      ranks[n.id] = 0;
      queue.push(n.id);
    }
  });

  // If no roots (cycle), assign first node as rank 0
  if (queue.length === 0 && canvasData.nodes.length > 0) {
    ranks[canvasData.nodes[0].id] = 0;
    queue.push(canvasData.nodes[0].id);
  }

  while (queue.length > 0) {
    const currId = queue.shift();
    const currRank = ranks[currId];
    
    adj[currId].forEach(toId => {
      const nextRank = currRank + 1;
      if (ranks[toId] === undefined || ranks[toId] < nextRank) {
        ranks[toId] = nextRank;
        queue.push(toId);
      }
    });
  }

  // Make sure all nodes have a rank
  canvasData.nodes.forEach(n => {
    if (ranks[n.id] === undefined) {
      ranks[n.id] = 0;
    }
  });

  // 3. Group nodes by rank
  const rankGroups = {};
  canvasData.nodes.forEach(n => {
    const r = ranks[n.id];
    if (!rankGroups[r]) rankGroups[r] = [];
    rankGroups[r].push(n);
  });

  // 4. Position nodes based on rank groups
  const startX = 120;
  const startY = 150;
  const gapX = 380; // Spacing in X (width is 270, so 110px gap)
  const gapY = 240; // Spacing in Y (height is ~180, so 60px gap)

  Object.keys(rankGroups).forEach(rankStr => {
    const rank = parseInt(rankStr, 10);
    const nodesInRank = rankGroups[rank];
    const x = startX + rank * gapX;
    
    // Center nodes vertically
    const totalHeight = (nodesInRank.length - 1) * gapY;
    const rankStartY = startY; // keep relative to top or adjust to fit

    nodesInRank.forEach((node, index) => {
      node.x = Math.round(x);
      node.y = Math.round(rankStartY + index * gapY);
    });
  });

  markDirty();
  pushHistory();
  renderCanvas();
  showToast('Nodes auto-aligned successfully', 'success');
}

window.useSuggestion = function(text) {
  if (aiPromptInput) {
    aiPromptInput.value = text;
    aiPromptInput.focus();
  }
};

window.sendPromptToAgent = async function() {
  if (!checkPremiumStatus()) {
    aiPromptInput.value = '';
    return;
  }
  const prompt = aiPromptInput.value.trim();
  if (!prompt) return;

  // Clear input area immediately
  aiPromptInput.value = '';
  
  // Disable submission & trigger spinner
  btnSend.disabled = true;
  const originalBtnContent = btnSend.innerHTML;
  btnSend.innerHTML = '<span class="spinner"></span>';

  // Log user message
  appendChatMessage('user', prompt);

  // Intercept local alignment command to execute instantly on the client
  const lower = prompt.toLowerCase();
  const wordCount = prompt.split(/\s+/).length;
  const isShortCommand = wordCount <= 6;
  const isLayoutRequest = lower.includes('align') || lower.includes('clean up') || lower.includes('auto-layout') || lower.includes('auto layout') || (lower.includes('layout') && isShortCommand);
  if (isLayoutRequest && isShortCommand) {
    appendChatMessage('system', 'Running layout optimization...');
    autoLayoutNodes();
    await saveCanvasCurrentState(true);
    appendChatMessage('agent', "I've optimized the layout and neatly aligned all nodes hierarchically from left to right in columns. This prevents overlapping and clarifies dependencies!");
    
    // Restore button controls
    btnSend.disabled = false;
    btnSend.innerHTML = originalBtnContent;
    return;
  }

  // 1. Mandatory Auto-Save current design layout before prompt to prevent state sync issues
  setIndicatorState('saving', 'Saving state...');
  try {
    await window.apiFetch(`${window.API || ''}/api/canvas-workflows/${activeCanvasId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: canvasData.name,
        nodes: canvasData.nodes,
        edges: canvasData.edges
      })
    });
    isDirty = false;
    setIndicatorState('saved');
  } catch (saveErr) {
    console.warn('Failed to pre-save before AI prompt:', saveErr);
    appendChatMessage('system', 'Warning: Pre-save failed. Prompting with last saved state instead.');
  }

  // Log system action
  appendChatMessage('system', 'Generating signed ticket...');

  try {
    // 2. Fetch single-use canvas AI ticket JWT
    const authRes = await window.apiFetch(`${window.API || ''}/api/ai/authorize-canvas`, {
      method: 'POST'
    });

    if (!authRes || !authRes.generationToken) {
      throw new Error('Failed to authorize canvas agent generation.');
    }

    const { generationToken, aiServiceUrl, msgsLeft, limit } = authRes;
    if (typeof msgsLeft === 'number') {
      updateMsgLimitPill(msgsLeft, limit);
    }

    appendChatMessage('system', 'Sending request to AI Service...');

    // 3. Post prompt and current graph state directly to standalone AI microservice
    const aiResponse = await fetch(`${aiServiceUrl}/api/ai/generate-canvas-flow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${generationToken}`
      },
      body: JSON.stringify({
        prompt: prompt,
        nodes: canvasData.nodes,
        edges: canvasData.edges
      })
    });

    if (!aiResponse.ok) {
      const errorBody = await aiResponse.json().catch(() => ({}));
      throw new Error(errorBody.details || errorBody.error || errorBody.message || `AI service returned status ${aiResponse.status}`);
    }

    const nextGraph = await aiResponse.json();

    if (!nextGraph || !nextGraph.nodes) {
      throw new Error('Invalid graph schema received from AI service.');
    }

    // 4. Update memory structures, trigger rendering and save immediately
    canvasData.nodes = nextGraph.nodes || [];
    canvasData.edges = nextGraph.edges || [];

    // Force refresh ID structure checks & coordinate parsing
    sanitizeNodeCoordinates(canvasData.nodes);
    canvasData.nodes.forEach(n => {
      if (!n.completedSubtasks) n.completedSubtasks = [];
    });

    appendChatMessage('agent', `I've successfully updated your workflow! Generated ${canvasData.nodes.length} nodes and ${canvasData.edges.length} connections based on your prompt.`);
    
    markDirty();
    pushHistory();
    renderCanvas();
    
    // Save updated flow automatically
    await saveCanvasCurrentState(true);

    // Commit one canvas message slot after successful AI generation
    try {
      const commitRes = await window.apiFetch(`${window.API || ''}/api/ai/commit-canvas-msg`, { method: 'POST' });
      if (commitRes && typeof commitRes.msgsLeft === 'number') {
        updateMsgLimitPill(commitRes.msgsLeft, commitRes.limit);
      }
    } catch (commitErr) {
      console.warn('Could not commit canvas message:', commitErr);
    }
  } catch (err) {
    console.error('AI canvas execution failed:', err);
    if (err.status === 429) {
      appendChatMessage('agent', `Daily limit reached. Resets at midnight.`);
      showToast('Daily AI message limit reached. Resets at midnight.', 'error');
      if (err.data && typeof err.data.msgsLeft === 'number') {
        updateMsgLimitPill(err.data.msgsLeft, err.data.limit);
      }
    } else {
      appendChatMessage('agent', `Sorry, I encountered an error while processing your request: "${err.message || 'Unknown server error'}". Please try again.`);
      showToast('AI Canvas generation failed.', 'error');
    }
  } finally {
    // Restore button controls
    btnSend.disabled = false;
    btnSend.innerHTML = originalBtnContent;
  }
};

// Bind module-scoped functions to window for HTML inline event handlers
window.openCreateModal = openCreateModal;
window.closeCreateModal = closeCreateModal;
window.submitCreateCanvas = submitCreateCanvas;
window.filterCanvases = filterCanvases;
window.deleteNode = deleteNode;
window.deleteSubtask = deleteSubtask;
window.toggleSubtaskDone = toggleSubtaskDone;
window.toggleNodeStatus = toggleNodeStatus;
window.updateNodeLabel = updateNodeLabel;
window.submitAddSubtask = submitAddSubtask;
window.handleConnectorClick = handleConnectorClick;
window.deleteCanvas = deleteCanvas;
window.autoLayoutNodes = autoLayoutNodes;
window.openHelpModal = openHelpModal;
window.closeHelpModal = closeHelpModal;
window.checkPremiumStatus = checkPremiumStatus;
window.openDownloadModal = openDownloadModal;
window.closeDownloadModal = closeDownloadModal;
window.downloadCanvas = downloadCanvas;

/**
 * Canvas AI Message limit loaders
 */
async function loadCanvasMsgLimits() {
  const isPremium = checkPremiumStatusSilent();
  if (!isPremium) {
    updateMsgLimitPill(0, 0);
    return;
  }
  try {
    const data = await window.apiFetch(`${window.API || ''}/api/ai/canvas-msg-limits`);
    if (data && typeof data.msgsLeft === 'number') {
      updateMsgLimitPill(data.msgsLeft, data.limit);
    }
  } catch (e) {
    console.warn('Could not load canvas message limits:', e);
  }
}

function updateMsgLimitPill(msgsLeft, limit) {
  const isPremium = checkPremiumStatusSilent();
  let text = `${msgsLeft} / ${limit} left`;
  let cls = msgsLeft === 0 ? 'empty' : msgsLeft <= 3 ? 'low' : 'ok';
  
  if (!isPremium) {
    text = 'Upgrade to Unlock';
    cls = 'empty';
  }
  
  ['sidebar-msg-limit-pill', 'dashboard-msg-limit-pill'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = text;
      el.className = `msg-limit-pill ${cls}`;
    }
  });
}

window.loadCanvasMsgLimits = loadCanvasMsgLimits;
window.updateMsgLimitPill = updateMsgLimitPill;

function closeSidebar() {
  const panel = document.getElementById('canvas-sidebar-panel');
  const floatBtn = document.getElementById('canvas-ai-float-btn');
  const designerView = document.getElementById('canvas-designer-view');

  if (window.innerWidth <= 768) {
    if (panel) panel.classList.remove('mobile-active');
    if (designerView) designerView.classList.remove('mobile-sidebar-open');
  } else {
    if (panel) panel.classList.add('desktop-hidden');
  }

  if (floatBtn) {
    floatBtn.style.setProperty('display', 'flex', 'important');
  }
}

function openSidebar() {
  const panel = document.getElementById('canvas-sidebar-panel');
  const floatBtn = document.getElementById('canvas-ai-float-btn');
  const designerView = document.getElementById('canvas-designer-view');

  if (window.innerWidth <= 768) {
    if (panel) panel.classList.add('mobile-active');
    if (designerView) designerView.classList.add('mobile-sidebar-open');
  } else {
    if (panel) panel.classList.remove('desktop-hidden');
  }

  if (floatBtn) {
    floatBtn.style.setProperty('display', 'none', 'important');
  }
}

function toggleMobileSidebar() {
  const panel = document.getElementById('canvas-sidebar-panel');
  if (panel && panel.classList.contains('mobile-active')) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

window.closeSidebar = closeSidebar;
window.openSidebar = openSidebar;
window.toggleMobileSidebar = toggleMobileSidebar;

