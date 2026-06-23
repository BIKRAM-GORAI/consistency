// ── Scratchpad Module ───────────────────────────────────────
console.log("[Module] scratchpad.js initializing...");

// Local toast reference delegation to bypass strict module scope reference errors
const showToast = (...args) => window.showToast(...args);

// ── DAILY SCRATCHPAD INTEGRATION ────────────────────────────
let scratchpadDayId = null;
let scratchpadStrokes = [];
let scratchpadRedoStack = [];
let isDrawing = false;
let activeColor = '#000000';
let activeSize = 3;
let isReadOnly = false;
let isDrawingBlocked = false;
let canvasAnimationId = null;
let currentStroke = null;

async function openScratchpad(dayId) {
  scratchpadDayId = dayId;
  scratchpadStrokes = [];
  scratchpadRedoStack = [];
  isDrawing = false;
  isDrawingBlocked = false;
  currentStroke = null;
  
  if (canvasAnimationId) {
    cancelAnimationFrame(canvasAnimationId);
    canvasAnimationId = null;
  }
  
  const day = window.allDays.find(d => d._id === dayId);
  if (!day) {
    showToast('Day card not found', 'error');
    return;
  }
  
  // Past day check
  const today = todayStr();
  isReadOnly = day.date < today;
  
  // Show modal
  openModal('modal-scratchpad');
  
  // Reset selected colors and brush size in UI
  const modal = document.getElementById('modal-scratchpad');
  if (modal) {
    const colorBtns = modal.querySelectorAll('.color-btn');
    colorBtns.forEach(btn => {
      if (btn.getAttribute('data-color') === '#000000') {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    
    const sizeBtns = modal.querySelectorAll('.size-btn');
    sizeBtns.forEach(btn => {
      if (btn.getAttribute('data-size') === '3') {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }
  
  activeColor = '#000000';
  activeSize = 3;
  
  // Setup visibility of notices/toolbars
  const loadingOverlay = document.getElementById('scratchpad-loading');
  const mainContent = document.getElementById('scratchpad-main-content');
  const pastDayNotice = document.getElementById('scratchpad-past-day-notice');
  const editTools = document.getElementById('scratchpad-edit-tools');
  const saveBtn = document.getElementById('btn-scratchpad-save');
  const actionButtons = document.getElementById('scratchpad-action-buttons');
  
  if (loadingOverlay) loadingOverlay.style.display = 'flex';
  if (mainContent) mainContent.style.display = 'none';
  if (pastDayNotice) pastDayNotice.style.display = isReadOnly ? 'flex' : 'none';
  if (editTools) editTools.style.display = isReadOnly ? 'none' : 'flex';
  if (saveBtn) saveBtn.style.display = isReadOnly ? 'none' : 'block';
  if (actionButtons) {
    const undoBtn = document.getElementById('btn-scratchpad-undo');
    const redoBtn = document.getElementById('btn-scratchpad-redo');
    const clearBtn = document.getElementById('btn-scratchpad-clear');
    if (undoBtn) undoBtn.style.display = isReadOnly ? 'none' : 'flex';
    if (redoBtn) redoBtn.style.display = isReadOnly ? 'none' : 'flex';
    if (clearBtn) clearBtn.style.display = isReadOnly ? 'none' : 'flex';
  }
  
  // Retrieve strokes
  let data = null;
  
  // 1. Try local IndexedDB
  try {
    if (window.localDb && window.localDb.scratchpads) {
      const cached = await window.localDb.scratchpads.get(dayId);
      if (cached) {
        data = cached;
      }
    }
  } catch (err) {
    console.warn('Failed to read scratchpad from local DB:', err);
  }
  
  // Check if there is a pending unsynced update for this scratchpad in the sync queue
  let hasPendingSync = false;
  try {
    if (window.localDb && window.localDb.syncQueue) {
      const pending = await window.localDb.syncQueue
        .filter(x => x.entity === 'scratchpads' && x.targetId === dayId)
        .first();
      if (pending) {
        hasPendingSync = true;
        console.log(`[Scratchpad] Skipping server fetch for day ${dayId} due to pending offline sync changes`);
      }
    }
  } catch (err) {
    console.warn('Failed to check sync queue for scratchpad:', err);
  }
  
  // 2. Try fetching from server if online, not a temp ID, no pending sync, and NO local cached data yet
  if (navigator.onLine && !String(dayId).startsWith('temp_') && !hasPendingSync && !data) {
    try {
      const response = await apiFetch(`${window.API}/api/days/${dayId}/scratchpad`);
      if (response && response.strokes) {
        data = response;
        // Save to local cache
        if (window.localDb && window.localDb.scratchpads) {
          await window.localDb.scratchpads.put({ dayId, strokes: response.strokes });
        }
      }
    } catch (err) {
      console.warn('Failed to fetch scratchpad from window.API, using cache:', err);
    }
  }
  
  if (data && data.strokes) {
    scratchpadStrokes = data.strokes;
  }
  
  // Hide loading spinner, show main content
  if (loadingOverlay) loadingOverlay.style.display = 'none';
  if (mainContent) mainContent.style.display = 'flex';
  
  // Initialize canvas size (High DPI) and play animation
  setTimeout(() => {
    resizeScratchpadCanvas();
    if (scratchpadStrokes.length > 0) {
      playTimeLapseAnimation();
    } else {
      drawStrokes(scratchpadStrokes);
    }
  }, 100);
}

function resizeScratchpadCanvas() {
  const canvas = document.getElementById('scratchpad-canvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  // Re-draw current strokes
  drawStrokes(scratchpadStrokes);
}

function drawStrokes(strokesList, elapsed = Infinity) {
  const canvas = document.getElementById('scratchpad-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  const rect = canvas.getBoundingClientRect();
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || document.body.getAttribute('data-theme') === 'dark';
  
  // Bulletproof absolute canvas clear to resolve high-DPI GPU black canvas glitches
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = isDark ? '#181824' : '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  
  if (strokesList.length === 0) return;
  
  // Calculate total number of points across all strokes to map indices uniformly over 2s
  let totalPoints = 0;
  strokesList.forEach(stroke => {
    totalPoints += (stroke.points || []).length;
  });
  
  let currentGlobalIndex = 0;
  let stopDrawing = false;
  
  strokesList.forEach(stroke => {
    if (stopDrawing) return;
    
    const points = stroke.points || [];
    if (points.length === 0) return;
    
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || document.body.getAttribute('data-theme') === 'dark';
    let strokeColor = stroke.color || '#000000';
    if (isDark && (strokeColor.toLowerCase() === '#000000' || strokeColor === 'black')) {
      strokeColor = '#ffffff';
    }
    
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = stroke.size || 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    let started = false;
    let renderedPointsCount = 0;
    let firstX = 0, firstY = 0;
    
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      let scaledTime = 0;
      if (totalPoints > 1) {
        scaledTime = (currentGlobalIndex / (totalPoints - 1)) * 2000;
      }
      
      if (scaledTime > elapsed) {
        stopDrawing = true;
        break;
      }
      
      const x = pt[0] * rect.width;
      const y = pt[1] * rect.height;
      
      if (!started) {
        ctx.moveTo(x, y);
        firstX = x;
        firstY = y;
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
      renderedPointsCount++;
      currentGlobalIndex++;
    }
    
    if (started) {
      ctx.stroke();
      if (renderedPointsCount === 1) {
        ctx.beginPath();
        ctx.fillStyle = strokeColor;
        ctx.arc(firstX, firstY, (stroke.size || 3) / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

function playTimeLapseAnimation() {
  if (canvasAnimationId) {
    cancelAnimationFrame(canvasAnimationId);
    canvasAnimationId = null;
  }
  
  const overlay = document.getElementById('scratchpad-replay-overlay');
  if (overlay) overlay.style.display = 'flex';
  isDrawingBlocked = true;
  
  const startTime = performance.now();
  const duration = 2000; // 2 seconds
  
  function animFrame(now) {
    const elapsed = now - startTime;
    if (elapsed >= duration) {
      drawStrokes(scratchpadStrokes, Infinity);
      if (overlay) overlay.style.display = 'none';
      isDrawingBlocked = false;
      canvasAnimationId = null;
    } else {
      drawStrokes(scratchpadStrokes, elapsed);
      canvasAnimationId = requestAnimationFrame(animFrame);
    }
  }
  
  canvasAnimationId = requestAnimationFrame(animFrame);
}

function handlePointerDown(e) {
  if (isReadOnly || isDrawingBlocked) return;
  
  const canvas = e.currentTarget;
  canvas.setPointerCapture(e.pointerId);
  isDrawing = true;
  
  const rect = canvas.getBoundingClientRect();
  const xNorm = (e.clientX - rect.left) / rect.width;
  const yNorm = (e.clientY - rect.top) / rect.height;
  
  currentStroke = {
    color: activeColor,
    size: activeSize,
    points: [[xNorm, yNorm, Date.now()]]
  };
  
  scratchpadStrokes.push(currentStroke);
  scratchpadRedoStack = [];
  
  drawStrokes(scratchpadStrokes);
}

function handlePointerMove(e) {
  if (!isDrawing || !currentStroke || isReadOnly || isDrawingBlocked) return;
  
  const canvas = e.currentTarget;
  const rect = canvas.getBoundingClientRect();
  const xNorm = (e.clientX - rect.left) / rect.width;
  const yNorm = (e.clientY - rect.top) / rect.height;
  
  currentStroke.points.push([xNorm, yNorm, Date.now()]);
  
  drawStrokes(scratchpadStrokes);
}

function handlePointerUp(e) {
  if (!isDrawing) return;
  isDrawing = false;
  if (currentStroke) {
    const canvas = e.currentTarget;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch(err) {}
  }
  currentStroke = null;
}

function handleUndo() {
  if (isReadOnly || isDrawingBlocked) return;
  if (scratchpadStrokes.length > 0) {
    const stroke = scratchpadStrokes.pop();
    scratchpadRedoStack.push(stroke);
    drawStrokes(scratchpadStrokes);
  }
}

function handleRedo() {
  if (isReadOnly || isDrawingBlocked) return;
  if (scratchpadRedoStack.length > 0) {
    const stroke = scratchpadRedoStack.pop();
    scratchpadStrokes.push(stroke);
    drawStrokes(scratchpadStrokes);
  }
}

function handleClear() {
  if (isReadOnly || isDrawingBlocked) return;
  if (confirm("Are you sure you want to clear the canvas?")) {
    scratchpadStrokes = [];
    scratchpadRedoStack = [];
    drawStrokes(scratchpadStrokes);
  }
}

async function saveScratchpadDrawing() {
  if (isReadOnly) {
    showToast('Cannot modify past day scratchpad', 'error');
    return;
  }
  
  if (!scratchpadDayId) {
    showToast('No day selected', 'error');
    return;
  }
  
  // Save locally in Dexie
  try {
    if (window.localDb && window.localDb.scratchpads) {
      await window.localDb.scratchpads.put({
        dayId: scratchpadDayId,
        strokes: scratchpadStrokes
      });
    }
  } catch (err) {
    console.warn('Failed to save to local Dexie cache:', err);
  }
  
  // Update hasScratchpad boolean locally
  const day = window.allDays.find(d => d._id === scratchpadDayId);
  if (day) {
    day.hasScratchpad = true;
    day.lastLocalEdit = Date.now();
    if (window.localDb && window.localDb.days) {
      await window.localDb.days.put(day);
    }
  }
  
  renderDays();
  
  // Sync
  if (navigator.onLine && !String(scratchpadDayId).startsWith('temp_')) {
    try {
      await apiFetch(`${window.API}/api/days/${scratchpadDayId}/scratchpad`, {
        method: 'PUT',
        body: JSON.stringify({ strokes: scratchpadStrokes })
      });
      showToast('Drawing saved successfully!', 'success');
    } catch (err) {
      console.warn('Failed to sync scratchpad with server, queued:', err);
      window.syncManager.addToQueue('PUT', 'scratchpads', scratchpadDayId, { strokes: scratchpadStrokes });
      showToast('Drawing saved locally (queued for sync)', 'info');
    }
  } else {
    window.syncManager.addToQueue('PUT', 'scratchpads', scratchpadDayId, { strokes: scratchpadStrokes });
    showToast('Drawing saved offline', 'info');
  }
  
  closeModal('modal-scratchpad');
}

function bindScratchpadToolbar() {
  const modal = document.getElementById('modal-scratchpad');
  if (!modal) return;
  
  const colorBtns = modal.querySelectorAll('.color-btn:not(.color-wheel-btn)');
  const colorWheelBtn = document.getElementById('btn-color-wheel');
  const customColorInput = document.getElementById('scratchpad-custom-color');
  
  colorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      colorBtns.forEach(b => b.classList.remove('active'));
      if (colorWheelBtn) {
        colorWheelBtn.classList.remove('active');
        colorWheelBtn.style.boxShadow = '';
        colorWheelBtn.style.outline = '';
        colorWheelBtn.style.background = 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)';
      }
      btn.classList.add('active');
      activeColor = btn.getAttribute('data-color') || '#000000';
    });
  });

  if (customColorInput && colorWheelBtn) {
    customColorInput.addEventListener('input', (e) => {
      const selectedColor = e.target.value;
      activeColor = selectedColor;
      
      // Deactivate normal color buttons
      colorBtns.forEach(b => b.classList.remove('active'));
      
      // Activate color wheel button
      colorWheelBtn.classList.add('active');
      colorWheelBtn.style.background = selectedColor;
      
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || document.body.getAttribute('data-theme') === 'dark';
      if (isDark) {
        colorWheelBtn.style.outline = `2px solid var(--yellow)`;
        colorWheelBtn.style.boxShadow = `0 0 10px ${selectedColor}`;
      } else {
        colorWheelBtn.style.outline = `2px solid var(--black)`;
        colorWheelBtn.style.boxShadow = `0 0 8px ${selectedColor}`;
      }
    });

    colorWheelBtn.addEventListener('click', () => {
      customColorInput.click();
    });
  }
  
  const sizeBtns = modal.querySelectorAll('.size-btn');
  sizeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sizeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeSize = parseInt(btn.getAttribute('data-size') || '3');
    });
  });
  
  const undoBtn = document.getElementById('btn-scratchpad-undo');
  if (undoBtn) undoBtn.addEventListener('click', handleUndo);
  
  const redoBtn = document.getElementById('btn-scratchpad-redo');
  if (redoBtn) redoBtn.addEventListener('click', handleRedo);
  
  const clearBtn = document.getElementById('btn-scratchpad-clear');
  if (clearBtn) clearBtn.addEventListener('click', handleClear);
  
  const replayBtn = document.getElementById('btn-scratchpad-replay');
  if (replayBtn) replayBtn.addEventListener('click', playTimeLapseAnimation);
  
  const canvas = document.getElementById('scratchpad-canvas');
  if (canvas) {
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
  }
  
  window.addEventListener('resize', () => {
    if (modal.classList.contains('open')) {
      resizeScratchpadCanvas();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindScratchpadToolbar);
} else {
  bindScratchpadToolbar();
}


// ── Scratchpad Module Bindings ──────────────────────────────
window.openScratchpad = openScratchpad;
window.resizeScratchpadCanvas = resizeScratchpadCanvas;
window.drawStrokes = drawStrokes;
window.playTimeLapseAnimation = playTimeLapseAnimation;
window.handlePointerDown = handlePointerDown;
window.handlePointerMove = handlePointerMove;
window.handlePointerUp = handlePointerUp;
window.handleUndo = handleUndo;
window.handleRedo = handleRedo;
window.handleClear = handleClear;
window.saveScratchpadDrawing = saveScratchpadDrawing;
window.bindScratchpadToolbar = bindScratchpadToolbar;
console.log("[Module] scratchpad.js loaded and Scratchpad bound to window");
