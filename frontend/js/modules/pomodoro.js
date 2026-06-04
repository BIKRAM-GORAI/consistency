console.log("[Module] pomodoro.js initializing...");

// ── localStorage key ──────────────────────────────────────────────────────────
const POMO_KEY = 'consistency_pomo_state';

function savePomoState() {
  try {
    const state = {
      mode:            pomoMode,
      secondsLeft:     pomoSecondsRemaining,
      totalDuration:   pomoTotalDuration,
      isRunning:       pomoIsRunning,
      savedAt:         Date.now(),
      // Custom cycling session
      customTotalMin,
      customWorkMin,
      customBreakMin,
      customSessionRemaining,
      customPhase,
      customPhaseRemaining,
      isCustomSession,
    };
    localStorage.setItem(POMO_KEY, JSON.stringify(state));
  } catch (e) {}
}

function clearPomoState() {
  try { localStorage.removeItem(POMO_KEY); } catch (e) {}
}

// ── Chime ─────────────────────────────────────────────────────────────────────
function playTimerFinishedChime() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.65);
  } catch (e) { console.warn('Chime failed:', e); }
}

// ── Regular timer state ───────────────────────────────────────────────────────
let pomoInterval         = null;
let pomoSecondsRemaining = 25 * 60;
let pomoTotalDuration    = 25 * 60;
let pomoIsRunning        = false;
let pomoMode             = 'work'; // 'work'|'break'|'long'|'custom'
let lastTickTime         = 0;

// ── Custom cycling session state ──────────────────────────────────────────────
let customTotalMin         = 60;  // total session budget (minutes)
let customWorkMin          = 25;  // each work interval
let customBreakMin         = 5;   // each break interval
let customSessionRemaining = 0;   // total seconds left in session
let customPhase            = 'work'; // 'work' | 'break'
let customPhaseRemaining   = 0;   // seconds left in current phase
let isCustomSession        = false;

// ── Phase badge helpers ───────────────────────────────────────────────────────
function showPhaseBadge(phase) {
  const badge = document.getElementById('pomo-phase-badge');
  const icon  = document.getElementById('pomo-phase-icon');
  const label = document.getElementById('pomo-phase-label');
  if (!badge) return;
  badge.style.display = 'flex';
  badge.className = phase; // 'work' or 'break' — drives CSS color
  if (icon)  icon.textContent  = phase === 'work' ? '🎯' : '☕';
  if (label) label.textContent = phase === 'work' ? 'Work Session' : 'Break Time';
}

function hidePhaseBadge() {
  const badge = document.getElementById('pomo-phase-badge');
  if (badge) badge.style.display = 'none';
}

function showTotalRemaining(seconds) {
  const el = document.getElementById('pomo-total-remaining');
  if (!el) return;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  el.style.display = 'block';
  el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')} total remaining`;
}

function hideTotalRemaining() {
  const el = document.getElementById('pomo-total-remaining');
  if (el) el.style.display = 'none';
}

// ── Mode management ───────────────────────────────────────────────────────────
function setPomoMode(mode, skipSave = false) {
  const panel = document.getElementById('pomo-custom-panel');

  if (mode === 'custom') {
    if (panel) {
      panel.classList.toggle('open');
    }
    return;
  }

  // Helper to switch mode after confirmation (or if not running)
  const proceedSwitch = () => {
    if (panel) panel.classList.remove('open');

    pomoMode = mode;
    isCustomSession = false;
    stopPomodoroTimer();

    hidePhaseBadge();
    hideTotalRemaining();

    if      (mode === 'work')   pomoSecondsRemaining = 25 * 60;
    else if (mode === 'break')  pomoSecondsRemaining = 5 * 60;
    else if (mode === 'long')   pomoSecondsRemaining = 15 * 60;

    pomoTotalDuration = pomoSecondsRemaining;

    document.querySelectorAll('.pomo-mode-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`pomo-mode-${mode}`);
    if (activeBtn) activeBtn.classList.add('active');

    updatePomoDisplay();
    if (!skipSave) savePomoState();
  };

  // If a session is currently running, ask for confirmation
  if (pomoIsRunning) {
    showCustomConfirm(
      "An active Pomodoro session is running. Do you want to reset the timer and switch modes?",
      proceedSwitch
    );
  } else {
    proceedSwitch();
  }
}

// ── Display ───────────────────────────────────────────────────────────────────
function updatePomoDisplay() {
  const display = document.getElementById('pomo-display');
  if (!display) return;
  const m = Math.floor(pomoSecondsRemaining / 60);
  const s = pomoSecondsRemaining % 60;
  display.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

  const modeText = (pomoMode === 'work' || isCustomSession) ? 'Focus' : 'Break';
  document.title = pomoIsRunning
    ? `(${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}) ${modeText} | Consistency Daily`
    : 'Consistency Daily | Dashboard';
}

// ── Regular timer controls ────────────────────────────────────────────────────
function togglePomodoroTimer() {
  if (isCustomSession) {
    pomoIsRunning ? stopCustomSession() : resumeCustomSession();
  } else {
    pomoIsRunning ? stopPomodoroTimer() : startPomodoroTimer();
  }
}

function handleTimerTick() {
  const now = Date.now();
  const elapsedMs = now - lastTickTime;
  if (elapsedMs < 1000) return;
  const elapsed = Math.floor(elapsedMs / 1000);
  lastTickTime += elapsed * 1000;

  if (pomoSecondsRemaining > elapsed) {
    pomoSecondsRemaining -= elapsed;
    updatePomoDisplay();
    savePomoState();
  } else {
    pomoSecondsRemaining = 0;
    updatePomoDisplay();
    clearPomoState();
    stopPomodoroTimer();
    playTimerFinishedChime();
    
    showCustomAlert(
      pomoMode === 'work'
        ? '⏰ Focus session complete! Time for a break.'
        : '⏰ Break over! Back to work.',
      '⏰ Focus Alert',
      () => {
        setPomoMode(pomoMode === 'work' ? 'break' : 'work');
      }
    );
  }
}

function startPomodoroTimer() {
  if (pomoIsRunning) return;
  pomoIsRunning = true;
  setBtnPaused(true);
  lastTickTime = Date.now();
  pomoInterval = setInterval(handleTimerTick, 200);
}

function stopPomodoroTimer() {
  if (pomoInterval) { clearInterval(pomoInterval); pomoInterval = null; }
  pomoIsRunning = false;
  setBtnPaused(false);
  updatePomoDisplay();
  savePomoState();
}

function resetPomodoroTimer() {
  if (isCustomSession) {
    stopCustomSession();
    isCustomSession = false;
    hidePhaseBadge();
    hideTotalRemaining();
  } else {
    stopPomodoroTimer();
  }
  clearPomoState();
  setPomoMode(pomoMode);
}

// ── Start/Pause button state ──────────────────────────────────────────────────
function setBtnPaused(paused) {
  const btn = document.getElementById('pomo-start-btn');
  if (!btn) return;
  if (paused) {
    btn.innerHTML = '<i data-lucide="pause" style="width:18px;height:18px;"></i> Pause';
    btn.classList.add('paused');
  } else {
    btn.innerHTML = '<i data-lucide="play" style="width:18px;height:18px;"></i> Start';
    btn.classList.remove('paused');
  }
  if (window.lucide) lucide.createIcons({ root: btn });
}

// ── Custom cycling session engine ─────────────────────────────────────────────
function applyCustomPomoMode() {
  const proceedCustom = () => {
    const totalInput = document.getElementById('custom-total-min');
    const workInput  = document.getElementById('custom-work-min');
    const breakInput = document.getElementById('custom-break-min');

    const rawT = parseInt(totalInput?.value);
    const rawW = parseInt(workInput?.value);
    const rawB = parseInt(breakInput?.value);

    // 1. Check for empty or NaN values
    if (isNaN(rawT) || isNaN(rawW) || isNaN(rawB)) {
      if (window.showToast) window.showToast('⚠️ Please enter valid numbers for all fields!', 'error');
      return;
    }

    // 2. Validate total session time limits
    if (rawT < 1) {
      if (window.showToast) window.showToast('⚠️ Total session time must be at least 1 minute!', 'error');
      return;
    }
    if (rawT > 480) {
      if (window.showToast) window.showToast('⚠️ Total session time cannot exceed 480 minutes!', 'error');
      return;
    }

    // 3. Validate work time limits
    if (rawW < 1) {
      if (window.showToast) window.showToast('⚠️ Work time must be at least 1 minute!', 'error');
      return;
    }
    if (rawW > 120) {
      if (window.showToast) window.showToast('⚠️ Work time cannot exceed 120 minutes!', 'error');
      return;
    }

    // 4. Validate break time limits
    if (rawB < 0) {
      if (window.showToast) window.showToast('⚠️ Break time cannot be negative!', 'error');
      return;
    }
    if (rawB === 0) {
      if (window.showToast) window.showToast('⚠️ Break time cannot be 0 minutes!', 'error');
      return;
    }
    if (rawB > 60) {
      if (window.showToast) window.showToast('⚠️ Break time cannot exceed 60 minutes!', 'error');
      return;
    }

    // 5. Validate that work + break fits in total session
    if (rawW + rawB > rawT) {
      if (window.showToast) window.showToast('⚠️ Work + Break time must be less than or equal to Total time!', 'error');
      return;
    }

    const t = rawT;
    const w = rawW;
    const b = rawB;

    if (totalInput)  totalInput.value  = t;
    if (workInput)   workInput.value   = w;
    if (breakInput)  breakInput.value  = b;

    customTotalMin = t;
    customWorkMin  = w;
    customBreakMin = b;

    // Init cycling session
    customSessionRemaining = t * 60;
    customPhase            = 'work';
    customPhaseRemaining   = Math.min(w * 60, customSessionRemaining);
    isCustomSession        = true;
    pomoMode               = 'custom';

    // Activate custom button
    document.querySelectorAll('.pomo-mode-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('pomo-mode-custom')?.classList.add('active');

    // Update display
    pomoSecondsRemaining = customPhaseRemaining;
    updatePomoDisplay();
    showPhaseBadge('work');
    showTotalRemaining(customSessionRemaining);

    // Close the config panel and start
    document.getElementById('pomo-custom-panel')?.classList.remove('open');
    stopCustomSession(); // clear any previous interval
    startCustomCycle();
  };

  if (pomoIsRunning) {
    showCustomConfirm(
      "An active Pomodoro session is running. Do you want to reset the timer and start a new custom session?",
      proceedCustom
    );
  } else {
    proceedCustom();
  }
}

function handleCustomTimerTick() {
  const now = Date.now();
  const elapsedMs = now - lastTickTime;
  if (elapsedMs < 1000) return;
  const elapsed = Math.floor(elapsedMs / 1000);
  lastTickTime += elapsed * 1000;

  let remainingElapsed = elapsed;
  while (remainingElapsed > 0 && customSessionRemaining > 0) {
    if (remainingElapsed < customPhaseRemaining) {
      customPhaseRemaining -= remainingElapsed;
      customSessionRemaining -= remainingElapsed;
      remainingElapsed = 0;
    } else {
      remainingElapsed -= customPhaseRemaining;
      customSessionRemaining -= customPhaseRemaining;
      customPhaseRemaining = 0;

      if (customSessionRemaining <= 0) break;

      // Current phase finished -> switch phase
      playTimerFinishedChime();
      customPhase = customPhase === 'work' ? 'break' : 'work';
      const nextSecs = (customPhase === 'work' ? customWorkMin : customBreakMin) * 60;
      customPhaseRemaining = Math.min(nextSecs, customSessionRemaining);
      showPhaseBadge(customPhase);
    }
  }

  // Total session exhausted
  if (customSessionRemaining <= 0) {
    customPhaseRemaining   = 0;
    customSessionRemaining = 0;
    pomoSecondsRemaining   = 0;
    updatePomoDisplay();
    showTotalRemaining(0);
    stopCustomSession();
    clearPomoState();
    isCustomSession = false;
    hidePhaseBadge();
    hideTotalRemaining();
    playTimerFinishedChime();
    
    showCustomAlert(
      '🎉 Session complete! Great work!',
      '🎉 Session Complete',
      () => {
        // Reset mode UI back to work
        document.querySelectorAll('.pomo-mode-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('pomo-mode-work')?.classList.add('active');
        pomoMode = 'work';
        pomoSecondsRemaining = 25 * 60;
        updatePomoDisplay();
      }
    );
    return;
  }

  pomoSecondsRemaining = customPhaseRemaining;
  updatePomoDisplay();
  showTotalRemaining(customSessionRemaining);
  savePomoState();
}

function startCustomCycle() {
  if (pomoIsRunning) return;
  pomoIsRunning = true;
  setBtnPaused(true);
  lastTickTime = Date.now();
  pomoInterval = setInterval(handleCustomTimerTick, 200);
}

function stopCustomSession() {
  if (pomoInterval) { clearInterval(pomoInterval); pomoInterval = null; }
  pomoIsRunning = false;
  setBtnPaused(false);
  savePomoState();
}

function resumeCustomSession() {
  startCustomCycle();
}

// ── Simulate elapsed time for custom session restore ─────────────────────────
function simulateCustomElapsed(elapsed, sessionRem, phase, phaseRem, workSecs, breakSecs) {
  while (elapsed > 0 && sessionRem > 0) {
    if (elapsed <= phaseRem) {
      phaseRem   -= elapsed;
      sessionRem -= elapsed;
      elapsed     = 0;
    } else {
      elapsed    -= phaseRem;
      sessionRem -= phaseRem;
      phaseRem    = 0;
      if (sessionRem <= 0) break;
      phase    = phase === 'work' ? 'break' : 'work';
      phaseRem = Math.min(phase === 'work' ? workSecs : breakSecs, sessionRem);
    }
  }
  return { sessionRem, phase, phaseRem };
}

// ── Stopwatch ─────────────────────────────────────────────────────────────────
let swInterval  = null;
let swStartTime = 0;
let swElapsedMs = 0;
let swIsRunning = false;

function toggleStopwatch() { swIsRunning ? stopStopwatch() : startStopwatch(); }

function startStopwatch() {
  if (swIsRunning) return;
  swIsRunning = true;
  swStartTime = Date.now() - swElapsedMs;
  const btn = document.getElementById('sw-start-btn');
  if (btn) {
    btn.innerHTML = '<i data-lucide="pause" style="width:18px;height:18px;"></i> Pause';
    btn.classList.add('paused');
    if (window.lucide) lucide.createIcons({ root: btn });
  }
  swInterval = setInterval(() => {
    swElapsedMs = Date.now() - swStartTime;
    updateStopwatchDisplay();
  }, 50);
}

function stopStopwatch() {
  if (swInterval) { clearInterval(swInterval); swInterval = null; }
  swIsRunning = false;
  const btn = document.getElementById('sw-start-btn');
  if (btn) {
    btn.innerHTML = '<i data-lucide="play" style="width:18px;height:18px;"></i> Start';
    btn.classList.remove('paused');
    if (window.lucide) lucide.createIcons({ root: btn });
  }
}

function resetStopwatch() { stopStopwatch(); swElapsedMs = 0; updateStopwatchDisplay(); }

function updateStopwatchDisplay() {
  const display = document.getElementById('sw-display');
  if (!display) return;
  const t  = swElapsedMs / 1000;
  const m  = Math.floor(t / 60);
  const s  = Math.floor(t % 60);
  const ms = Math.floor((swElapsedMs % 1000) / 100);
  display.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${ms}`;
}

// ── Sub-tab toggle ────────────────────────────────────────────────────────────
let activePomoSubTab = 'timer';

function switchPomoSubTab(tab) {
  activePomoSubTab = tab;
  const timerBlock     = document.getElementById('pomo-timer-block');
  const stopwatchBlock = document.getElementById('pomo-stopwatch-block');
  const btnTimer       = document.getElementById('pomo-subtab-timer');
  const btnStopwatch   = document.getElementById('pomo-subtab-stopwatch');
  if (tab === 'timer') {
    if (timerBlock)     timerBlock.style.display = 'block';
    if (stopwatchBlock) stopwatchBlock.style.display = 'none';
    if (btnTimer)       btnTimer.classList.add('active');
    if (btnStopwatch)   btnStopwatch.classList.remove('active');
  } else {
    if (timerBlock)     timerBlock.style.display = 'none';
    if (stopwatchBlock) stopwatchBlock.style.display = 'block';
    if (btnTimer)       btnTimer.classList.remove('active');
    if (btnStopwatch)   btnStopwatch.classList.add('active');
  }
}

// ── Restore persisted state ───────────────────────────────────────────────────
function restorePomoState() {
  let saved;
  try {
    const raw = localStorage.getItem(POMO_KEY);
    if (!raw) return false;
    saved = JSON.parse(raw);
  } catch (e) { return false; }

  if (!saved?.mode) return false;

  // Restore custom settings
  if (saved.customTotalMin)  customTotalMin  = saved.customTotalMin;
  if (saved.customWorkMin)   customWorkMin   = saved.customWorkMin;
  if (saved.customBreakMin)  customBreakMin  = saved.customBreakMin;

  // Update input fields
  const ti = document.getElementById('custom-total-min');
  const wi = document.getElementById('custom-work-min');
  const bi = document.getElementById('custom-break-min');
  if (ti) ti.value = customTotalMin;
  if (wi) wi.value = customWorkMin;
  if (bi) bi.value = customBreakMin;

  const elapsed = saved.savedAt ? Math.floor((Date.now() - saved.savedAt) / 1000) : 0;

  // ── Restore custom cycling session ──
  if (saved.isCustomSession && saved.mode === 'custom') {
    let { sessionRem, phase, phaseRem } = simulateCustomElapsed(
      saved.isRunning ? elapsed : 0,
      saved.customSessionRemaining || 0,
      saved.customPhase || 'work',
      saved.customPhaseRemaining || 0,
      customWorkMin * 60,
      customBreakMin * 60,
    );

    if (sessionRem <= 0) { clearPomoState(); return false; }

    isCustomSession        = true;
    pomoMode               = 'custom';
    customSessionRemaining = sessionRem;
    customPhase            = phase;
    customPhaseRemaining   = phaseRem;
    pomoSecondsRemaining   = phaseRem;

    document.querySelectorAll('.pomo-mode-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('pomo-mode-custom')?.classList.add('active');

    updatePomoDisplay();
    showPhaseBadge(phase);
    showTotalRemaining(sessionRem);

    if (saved.isRunning) {
      startCustomCycle();
      const m = Math.floor(sessionRem / 60), s = sessionRem % 60;
      if (window.showToast) window.showToast(`▶ Session resumed — ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')} total left`, 'success');
    }
    return true;
  }

  // ── Restore regular timer ──
  let secondsLeft = saved.secondsLeft || 0;
  if (saved.isRunning && saved.savedAt) secondsLeft -= elapsed;
  if (secondsLeft <= 0) { clearPomoState(); return false; }

  pomoMode             = saved.mode;
  pomoSecondsRemaining = secondsLeft;
  pomoTotalDuration    = saved.totalDuration || secondsLeft;

  document.querySelectorAll('.pomo-mode-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`pomo-mode-${pomoMode}`)?.classList.add('active');
  updatePomoDisplay();

  if (saved.isRunning) {
    startPomodoroTimer();
    const m = Math.floor(secondsLeft / 60), s = secondsLeft % 60;
    if (window.showToast) window.showToast(`▶ Resumed — ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')} left`, 'success');
  }
  return true;
}

// ── Custom Neo-Brutalist Dialogs ─────────────────────────────────────────────
function showCustomConfirm(message, onConfirm, onCancel) {
  const overlay = document.createElement('div');
  overlay.className = 'custom-dialog-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(4px);
    z-index: 30000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Space Grotesk', 'Inter', sans-serif;
    padding: 16px;
    box-sizing: border-box;
  `;

  const container = document.createElement('div');
  container.style.cssText = `
    width: 100%;
    max-width: 400px;
    background: var(--bg-card, #ffffff);
    border: 3px solid var(--black, #0a0a0a);
    border-radius: 12px;
    box-shadow: 6px 6px 0 var(--black, #0a0a0a);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    color: var(--text, #0a0a0a);
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    padding: 12px 18px;
    background: var(--yellow, #ffd60a);
    border-bottom: 3px solid var(--black, #0a0a0a);
    font-weight: 900;
    text-transform: uppercase;
    font-size: 13px;
    letter-spacing: 0.5px;
    color: var(--black, #0a0a0a) !important;
  `;
  header.textContent = '⚠️ Confirm Action';

  const body = document.createElement('div');
  body.style.cssText = `
    padding: 20px 18px;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.5;
    background: var(--bg-card, #ffffff);
  `;
  body.textContent = message;

  const footer = document.createElement('div');
  footer.style.cssText = `
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 14px 18px;
    background: var(--bg-muted, #f7f7f7);
    border-top: 2px dashed #ccc;
  `;

  const cancelBtn = document.createElement('button');
  cancelBtn.style.cssText = `
    border: 2px solid var(--black);
    color: var(--black);
    background: #ffffff;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 800;
    font-size: 12px;
    text-transform: uppercase;
    box-shadow: 2px 2px 0 var(--black);
    transition: transform 0.1s, box-shadow 0.1s;
  `;
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = () => {
    overlay.remove();
    if (onCancel) onCancel();
  };

  const confirmBtn = document.createElement('button');
  confirmBtn.style.cssText = `
    border: 2px solid var(--black);
    color: var(--black);
    background: var(--pink, #ffb3d9);
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 900;
    font-size: 12px;
    text-transform: uppercase;
    box-shadow: 2px 2px 0 var(--black);
    transition: transform 0.1s, box-shadow 0.1s;
  `;
  confirmBtn.textContent = 'Confirm';
  confirmBtn.onclick = () => {
    overlay.remove();
    if (onConfirm) onConfirm();
  };

  footer.appendChild(cancelBtn);
  footer.appendChild(confirmBtn);
  container.appendChild(header);
  container.appendChild(body);
  container.appendChild(footer);
  overlay.appendChild(container);
  document.body.appendChild(overlay);
}

function showCustomAlert(message, title = '⏰ Focus Alert', onOk) {
  const overlay = document.createElement('div');
  overlay.className = 'custom-dialog-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(4px);
    z-index: 30000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Space Grotesk', 'Inter', sans-serif;
    padding: 16px;
    box-sizing: border-box;
  `;

  const container = document.createElement('div');
  container.style.cssText = `
    width: 100%;
    max-width: 400px;
    background: var(--bg-card, #ffffff);
    border: 3px solid var(--black, #0a0a0a);
    border-radius: 12px;
    box-shadow: 6px 6px 0 var(--black, #0a0a0a);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    color: var(--text, #0a0a0a);
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    padding: 12px 18px;
    background: var(--teal, #34d399);
    border-bottom: 3px solid var(--black, #0a0a0a);
    font-weight: 900;
    text-transform: uppercase;
    font-size: 13px;
    letter-spacing: 0.5px;
    color: var(--black, #0a0a0a) !important;
  `;
  header.textContent = title;

  const body = document.createElement('div');
  body.style.cssText = `
    padding: 20px 18px;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.5;
    background: var(--bg-card, #ffffff);
  `;
  body.textContent = message;

  const footer = document.createElement('div');
  footer.style.cssText = `
    display: flex;
    justify-content: flex-end;
    padding: 14px 18px;
    background: var(--bg-muted, #f7f7f7);
    border-top: 2px dashed #ccc;
  `;

  const okBtn = document.createElement('button');
  okBtn.style.cssText = `
    border: 2px solid var(--black);
    color: var(--black);
    background: var(--teal, #34d399);
    padding: 8px 24px;
    border-radius: 6px;
    cursor: pointer;
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 900;
    font-size: 12px;
    text-transform: uppercase;
    box-shadow: 2px 2px 0 var(--black);
    transition: transform 0.1s, box-shadow 0.1s;
  `;
  okBtn.textContent = 'OK';
  okBtn.onclick = () => {
    overlay.remove();
    if (onOk) onOk();
  };

  footer.appendChild(okBtn);
  container.appendChild(header);
  container.appendChild(body);
  container.appendChild(footer);
  overlay.appendChild(container);
  document.body.appendChild(overlay);
}

// ── Screen Wake Lock API ──────────────────────────────────────────────────────
let wakeLock = null;

async function updateWakeLock() {
  const toggle = document.getElementById('pomo-wake-lock-toggle');
  if (!toggle) return;

  const isChecked = toggle.checked;
  localStorage.setItem('consistency_pomo_wake_lock', isChecked ? 'true' : 'false');

  if (isChecked) {
    if (!wakeLock && 'wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        console.log('Screen Wake Lock acquired successfully');
        wakeLock.addEventListener('release', () => {
          console.log('Screen Wake Lock was released');
          wakeLock = null;
        });
      } catch (err) {
        console.warn('Screen Wake Lock acquisition failed:', err);
      }
    }
  } else {
    if (wakeLock) {
      try {
        await wakeLock.release();
      } catch (err) {}
      wakeLock = null;
      console.log('Screen Wake Lock released manually');
    }
  }
}

function initWakeLock() {
  const toggle = document.getElementById('pomo-wake-lock-toggle');
  if (!toggle) return;

  const saved = localStorage.getItem('consistency_pomo_wake_lock');
  toggle.checked = (saved === 'true');
  
  toggle.addEventListener('change', updateWakeLock);

  if (toggle.checked) {
    updateWakeLock();
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
const restored = restorePomoState();
if (!restored) setPomoMode('work', true);
initWakeLock();

window.addEventListener('beforeunload', () => {
  if (pomoIsRunning || isCustomSession) savePomoState();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (pomoIsRunning) {
      if (isCustomSession) {
        handleCustomTimerTick();
      } else {
        handleTimerTick();
      }
    }
    updateWakeLock();
  }
});

// ── Window bindings ───────────────────────────────────────────────────────────
window.setPomoMode         = setPomoMode;
window.togglePomodoroTimer = togglePomodoroTimer;
window.resetPomodoroTimer  = resetPomodoroTimer;
window.toggleStopwatch     = toggleStopwatch;
window.resetStopwatch      = resetStopwatch;
window.switchPomoSubTab    = switchPomoSubTab;
window.applyCustomPomoMode = applyCustomPomoMode;

console.log("[Module] pomodoro.js loaded. State restored:", restored);
