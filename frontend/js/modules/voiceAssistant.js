/**
 * Centralized AI Voice Assistant Frontend Module
 * Speech-to-Text via Groq Whisper API + Gemini AI Goal & Daily Card Extraction
 * Interactive Confirmation & Edit View prior to database commitment
 */

let mediaRecorder = null;
let audioChunks = [];
let recordingInterval = null;
let recordingSeconds = 0;
const MAX_RECORDING_SECONDS = 300; // 5 minutes max
let currentAudioBlob = null;
let currentAudioUrl = null;

// Draft Data State before User Approval & DB Commit
let draftVoiceData = {
  transcription: '',
  goals: [],
  dailyCards: [],
  summary: '',
  ticketToken: '',
  aiServiceUrl: ''
};

// Track remaining quota
let voiceAssistantQuota = { generationsLeft: 5, limit: 5, tier: 'free' };

/**
 * Initializes the AI Voice Assistant module
 */
export function initVoiceAssistant() {
  console.log('[VoiceAssistant] Initializing Centralized AI Voice Assistant...');
  fetchVoiceAssistantLimits();
}

/**
 * Fetches remaining daily quota from backend
 */
export async function fetchVoiceAssistantLimits() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return;
    const res = await fetch('/api/ai/voice-assistant-limits', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      voiceAssistantQuota = await res.json();
      updateQuotaBadge();
    }
  } catch (err) {
    console.warn('[VoiceAssistant] Limit check failed:', err.message);
  }
}

/**
 * Updates the remaining usage badge in the modal and UI
 */
function updateQuotaBadge() {
  const badge = document.getElementById('va-quota-badge');
  if (badge) {
    badge.textContent = `${voiceAssistantQuota.generationsLeft}/${voiceAssistantQuota.limit} left today`;
    if (voiceAssistantQuota.generationsLeft <= 0) {
      badge.style.background = 'var(--red, #ef4444)';
      badge.style.color = '#ffffff';
    } else {
      badge.style.background = 'rgba(0,0,0,0.08)';
      badge.style.color = 'var(--text)';
    }
  }
}

/**
 * Pauses active audio playback
 */
function stopAudioPlayback() {
  const player = document.getElementById('va-audio-player');
  if (player) {
    player.pause();
    player.currentTime = 0;
  }
}

/**
 * Opens the Voice Assistant Modal
 */
export function openVoiceAssistantModal() {
  const modal = document.getElementById('voice-assistant-modal');
  if (!modal) return;
  modal.style.display = 'flex';

  fetchVoiceAssistantLimits();
  resetVoiceAssistantUI();

  // Attach textarea auto-expand logic
  setTimeout(() => {
    const txtEl = document.getElementById('va-text-input');
    if (txtEl && !txtEl.dataset.autoExpandBound) {
      txtEl.dataset.autoExpandBound = 'true';
      txtEl.addEventListener('input', () => {
        txtEl.style.height = 'auto';
        txtEl.style.height = Math.min(txtEl.scrollHeight, 140) + 'px';
        const counterEl = document.getElementById('va-char-counter');
        if (counterEl) {
          const len = txtEl.value.length;
          counterEl.textContent = `${len} / 5000`;
          if (len >= 4800) {
            counterEl.style.color = '#ff0000';
          } else {
            counterEl.style.color = 'var(--text-muted)';
          }
        }
      });
      txtEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          sendTextVoiceCommand();
        }
      });
    }
  }, 50);
}

/**
 * Closes the Voice Assistant Modal
 */
export function closeVoiceAssistantModal() {
  stopAudioPlayback();
  stopRecording(false);
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
  }
  const modal = document.getElementById('voice-assistant-modal');
  if (modal) modal.style.display = 'none';

  // Automatically refresh active views (Daily Cards & Goals)
  if (typeof window.loadDays === 'function') window.loadDays(1);
  if (typeof window.loadGoals === 'function') window.loadGoals();
  if (typeof window.fetchDashboardData === 'function') window.fetchDashboardData();
}

/**
 * Resets the modal UI state to IDLE
 */
export function resetVoiceAssistantUI() {
  stopAudioPlayback();
  stopRecording(false);
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
  }
  currentAudioBlob = null;
  draftVoiceData = {
    transcription: '',
    goals: [],
    dailyCards: [],
    summary: '',
    ticketToken: '',
    aiServiceUrl: ''
  };

  setViewState('idle');
}

/**
 * Controls visible UI view state inside the modal
 */
function setViewState(state) {
  if (state !== 'review') {
    stopAudioPlayback();
  }

  const idleView = document.getElementById('va-view-idle');
  const recordingView = document.getElementById('va-view-recording');
  const reviewView = document.getElementById('va-view-review');
  const processingView = document.getElementById('va-view-processing');
  const draftView = document.getElementById('va-view-draft');
  const successView = document.getElementById('va-view-success');

  if (idleView) idleView.style.display = state === 'idle' ? 'flex' : 'none';
  if (recordingView) recordingView.style.display = state === 'recording' ? 'flex' : 'none';
  if (reviewView) reviewView.style.display = state === 'review' ? 'flex' : 'none';
  if (processingView) processingView.style.display = state === 'processing' ? 'flex' : 'none';
  if (draftView) draftView.style.display = state === 'draft' ? 'flex' : 'none';
  if (successView) successView.style.display = state === 'success' ? 'flex' : 'none';

  updateQuotaBadge();
}

/**
 * Starts audio recording with MediaRecorder
 */
export async function startRecording() {
  stopAudioPlayback();
  if (voiceAssistantQuota.generationsLeft <= 0) {
    alert(`You have reached your daily AI Voice Assistant limit of ${voiceAssistantQuota.limit} commands. Please try again tomorrow!`);
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];

    // Choose preferred mimeType
    let mimeType = 'audio/webm';
    if (!MediaRecorder.isTypeSupported('audio/webm')) {
      if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
      else if (MediaRecorder.isTypeSupported('audio/wav')) mimeType = 'audio/wav';
      else mimeType = '';
    }

    mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop());

      if (audioChunks.length > 0) {
        const actualType = mediaRecorder.mimeType || 'audio/webm';
        currentAudioBlob = new Blob(audioChunks, { type: actualType });
        if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
        currentAudioUrl = URL.createObjectURL(currentAudioBlob);

        const player = document.getElementById('va-audio-player');
        if (player) {
          player.pause();
          player.src = currentAudioUrl;

          // WebM duration calibration fix for Chrome/Safari live MediaRecorder blobs
          player.onloadedmetadata = function() {
            if (player.duration === Infinity || isNaN(player.duration)) {
              player.currentTime = 1e101;
              player.ontimeupdate = function() {
                this.ontimeupdate = null;
                this.currentTime = 0;
              };
            }
          };

          player.load();
        }

        setViewState('review');
      }
    };

    mediaRecorder.start(250); // Slice every 250ms
    recordingSeconds = 0;
    updateTimerDisplay();

    recordingInterval = setInterval(() => {
      recordingSeconds += 1;
      updateTimerDisplay();

      if (recordingSeconds >= MAX_RECORDING_SECONDS) {
        // Auto-stop at 5 minutes
        stopRecording(true);
      }
    }, 1000);

    setViewState('recording');

  } catch (err) {
    console.error('[VoiceAssistant] Permission / microphone error:', err);
    alert('Microphone permission is required to use the AI Voice Assistant.');
  }
}

/**
 * Updates recording timer UI (00:00 / 05:00)
 */
function updateTimerDisplay() {
  const timerEl = document.getElementById('va-recording-timer');
  if (!timerEl) return;
  const mins = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
  const secs = (recordingSeconds % 60).toString().padStart(2, '0');
  timerEl.textContent = `${mins}:${secs} / 05:00`;
}

/**
 * Stops audio recording
 */
export function stopRecording(shouldProcess = true) {
  if (recordingInterval) {
    clearInterval(recordingInterval);
    recordingInterval = null;
  }

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    if (!shouldProcess) {
      // Discard recording
      mediaRecorder.onstop = () => {
        if (mediaRecorder.stream) {
          mediaRecorder.stream.getTracks().forEach(t => t.stop());
        }
      };
    }
    mediaRecorder.stop();
  }
}

/**
 * Re-records audio clip (discards review state and starts over)
 */
export function reRecordVoiceCommand() {
  stopRecording(false);
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
  }
  currentAudioBlob = null;
  startRecording();
}

/**
 * Sends recorded audio clip to backend authorization and Render ai-service to extract items (NO DB COMMITS YET)
 */
export async function sendVoiceCommand() {
  if (!currentAudioBlob) {
    alert('No audio recording found.');
    return;
  }

  const pTitle = document.getElementById('va-processing-title');
  const pSub = document.getElementById('va-processing-subtitle');
  if (pTitle) pTitle.textContent = 'Analyzing Your Speech';
  if (pSub) pSub.textContent = 'Structuring your goals and daily tasks... hang tight!';

  setViewState('processing');

  try {
    const mainToken = localStorage.getItem('token');
    if (!mainToken) {
      alert('Please log in to use the AI Voice Assistant.');
      resetVoiceAssistantUI();
      return;
    }

    // Step 1: Get 5-minute ticket authorization from Vercel backend
    const authRes = await fetch('/api/ai/authorize-voice-assistant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mainToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!authRes.ok) {
      const authErr = await authRes.json().catch(() => ({ message: 'Authorization failed.' }));
      alert(authErr.message || 'Daily limit reached or authorization failed.');
      resetVoiceAssistantUI();
      return;
    }

    const { token: ticketToken, aiServiceUrl } = await authRes.json();

    // Step 2: Upload audio file to ai-service on Render for extraction
    const formData = new FormData();
    const fileExt = currentAudioBlob.type.includes('mp4') ? 'mp4' : (currentAudioBlob.type.includes('wav') ? 'wav' : 'webm');
    formData.append('audio', currentAudioBlob, `voice_command.${fileExt}`);

    const processRes = await fetch(`${aiServiceUrl}/process-voice-command`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ticketToken}`
      },
      body: formData
    });

    if (!processRes.ok) {
      const processErr = await processRes.json().catch(() => ({ error: 'AI Service processing error.' }));
      throw new Error(processErr.error || processErr.details || 'AI Service processing failed.');
    }

    const data = await processRes.json();

    if (!data.success) {
      alert(data.message || 'No actionable goals or daily tasks found in speech.');
      resetVoiceAssistantUI();
      return;
    }

    if (typeof data.generationsLeft === 'number') {
      voiceAssistantQuota.generationsLeft = data.generationsLeft;
      updateQuotaBadge();
    }

    // Store in draft state for interactive user confirmation & editing
    draftVoiceData = {
      transcription: data.transcription || '',
      goals: data.goals || [],
      dailyCards: data.dailyCards || [],
      summary: data.summary || '',
      ticketToken: ticketToken,
      aiServiceUrl: aiServiceUrl
    };

    renderDraftConfirmationView();
    setViewState('draft');

  } catch (err) {
    console.error('[VoiceAssistant] Send command failed:', err);
    alert(`Failed to process voice command: ${err.message}`);
    resetVoiceAssistantUI();
  }
}

/**
 * Renders interactive draft goals and daily cards into draft container
 */
export function renderDraftConfirmationView() {
  const container = document.getElementById('va-draft-container');
  if (!container) return;

  const transcriptEl = document.getElementById('va-draft-transcript-text');
  if (transcriptEl) {
    transcriptEl.textContent = `"${draftVoiceData.transcription || ''}"`;
  }

  let html = '';

  // 1. GOALS DRAFT SECTION
  if (Array.isArray(draftVoiceData.goals) && draftVoiceData.goals.length > 0) {
    html += `<div style="display:flex; flex-direction:column; gap:12px;">
      <div style="font-size:13px; font-weight:900; color:#16a34a; display:flex; align-items:center; justify-content:space-between;">
        <span>🎯 Extracted Goals (${draftVoiceData.goals.length})</span>
      </div>`;

    draftVoiceData.goals.forEach((g, gIdx) => {
      let dStr = '';
      if (g.deadline) {
        try {
          dStr = new Date(g.deadline).toISOString().split('T')[0];
        } catch (_) {}
      }
      if (!dStr) {
        const twoMonths = new Date();
        twoMonths.setMonth(twoMonths.getMonth() + 2);
        dStr = twoMonths.toISOString().split('T')[0];
      }

      const tasksList = Array.isArray(g.tasks) ? g.tasks : [];

      html += `<div style="background:var(--bg-card); border:2.5px solid var(--black); border-radius:12px; padding:14px; box-shadow:3px 3px 0 var(--black); display:flex; flex-direction:column; gap:10px;">
        
        <!-- Goal Header & Remove Button -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div style="flex:1;">
            <span style="font-size:10px; font-weight:900; color:#16a34a; text-transform:uppercase;">Goal #${gIdx + 1}</span>
            <h4 style="margin:2px 0 0; font-size:14px; font-weight:900; color:var(--text);">${g.title || 'Untitled Goal'}</h4>
          </div>
          <button onclick="window.removeDraftGoal(${gIdx})" title="Remove entire goal" style="background:#ef4444; color:white; border:1.5px solid var(--black); border-radius:6px; width:26px; height:26px; font-weight:900; font-size:12px; cursor:pointer; flex-shrink:0; display:flex; align-items:center; justify-content:center;">✕</button>
        </div>

        <!-- Editable Deadline Date Picker -->
        <div style="display:flex; align-items:center; gap:8px; background:var(--bg-body); padding:8px 10px; border:1.5px solid var(--black); border-radius:8px;">
          <label style="font-size:11.5px; font-weight:800; color:var(--text); flex-shrink:0;">📅 Target Deadline:</label>
          <input type="date" value="${dStr}" onchange="window.updateDraftGoalDeadline(${gIdx}, this.value)" style="flex:1; border:1.5px solid var(--black); border-radius:6px; padding:4px 8px; font-size:12px; font-weight:700; background:var(--bg-card); color:var(--text);" />
        </div>

        <!-- Subtasks List -->
        <div>
          <div style="font-size:11.5px; font-weight:900; color:var(--text-muted); margin-bottom:6px;">
            Subtasks / Milestones (${tasksList.length}):
          </div>
          <div style="display:flex; flex-direction:column; gap:6px;">`;

      tasksList.forEach((st, stIdx) => {
        const stTitle = typeof st === 'string' ? st : (st.title || 'Subtask');
        html += `<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; background:var(--bg-body); padding:6px 10px; border:1px solid var(--black); border-radius:6px; font-size:11.5px; font-weight:700; color:var(--text);">
          <span style="flex:1; word-break:break-word;">• ${stTitle}</span>
          <button onclick="window.removeDraftSubtask(${gIdx}, ${stIdx})" title="Remove subtask" style="background:#ef4444; color:white; border:1px solid var(--black); border-radius:4px; padding:1px 6px; font-size:10px; font-weight:800; cursor:pointer; flex-shrink:0;">✕</button>
        </div>`;
      });

      html += `</div></div></div>`;
    });

    html += `</div>`;
  }

  // 2. DAILY CARDS DRAFT SECTION
  if (Array.isArray(draftVoiceData.dailyCards) && draftVoiceData.dailyCards.length > 0) {
    html += `<div style="display:flex; flex-direction:column; gap:8px; margin-top:6px;">
      <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1.5px solid rgba(0,0,0,0.1); padding-bottom:6px;">
        <span style="font-size:13px; font-weight:900; color:#2563eb;">📅 Daily Tasks (${draftVoiceData.dailyCards.length})</span>
        <button onclick="window.removeAllDraftDailyCards()" style="background:#ef4444; color:white; border:1.5px solid var(--black); border-radius:6px; padding:3px 8px; font-size:11px; font-weight:800; cursor:pointer;">✕ Remove All Daily Tasks</button>
      </div>

      <div style="display:flex; flex-direction:column; gap:6px;">`;

    draftVoiceData.dailyCards.forEach((c, cIdx) => {
      html += `<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; background:rgba(59,130,246,0.06); border:1.5px solid #3b82f6; border-radius:8px; padding:8px 10px; font-size:11.5px; font-weight:700; color:var(--text);">
        <div style="flex:1;">
          <span style="font-size:10px; font-weight:800; color:#2563eb; background:rgba(59,130,246,0.15); padding:1px 6px; border-radius:4px; margin-right:4px;">${c.date}</span>
          <strong>${c.category || 'Tasks'}</strong>: ${c.taskTitle}
        </div>
        <button onclick="window.removeDraftDailyCard(${cIdx})" title="Remove task" style="background:#ef4444; color:white; border:1px solid var(--black); border-radius:4px; padding:2px 6px; font-size:10px; font-weight:800; cursor:pointer; flex-shrink:0;">✕</button>
      </div>`;
    });

    html += `</div></div>`;
  }

  if ((!draftVoiceData.goals || draftVoiceData.goals.length === 0) && (!draftVoiceData.dailyCards || draftVoiceData.dailyCards.length === 0)) {
    html = `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px; font-weight:800;">
      ⚠️ All items have been removed. Click cancel or start over.
    </div>`;
  }

  container.innerHTML = html;
}

/**
 * Submits final user-approved and edited Goals and Daily Cards to Render ai-service to commit to DB
 */
export async function commitVoiceCommand() {
  if ((!draftVoiceData.goals || draftVoiceData.goals.length === 0) && (!draftVoiceData.dailyCards || draftVoiceData.dailyCards.length === 0)) {
    alert('No items remaining to create.');
    resetVoiceAssistantUI();
    return;
  }

  const pTitle = document.getElementById('va-processing-title');
  const pSub = document.getElementById('va-processing-subtitle');
  if (pTitle) pTitle.textContent = 'Saving Your Customized Goals & Tasks...';
  if (pSub) pSub.textContent = 'Inserting approved items into database...';

  setViewState('processing');

  try {
    const commitRes = await fetch(`${draftVoiceData.aiServiceUrl}/commit-voice-command`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${draftVoiceData.ticketToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        goals: draftVoiceData.goals,
        dailyCards: draftVoiceData.dailyCards
      })
    });

    if (!commitRes.ok) {
      const commitErr = await commitRes.json().catch(() => ({ error: 'Failed to commit items.' }));
      throw new Error(commitErr.error || commitErr.details || 'Commit failed.');
    }

    const data = await commitRes.json();

    renderSuccessResults({
      summary: data.summary,
      transcription: draftVoiceData.transcription,
      goals: data.goals,
      dailyCards: data.dailyCards
    });

    setViewState('success');

    // Trigger immediate UI & IndexedDB refresh for Daily Cards, Goals, and Dashboard
    try {
      const backendUrl = typeof window.API !== 'undefined' ? window.API : '';
      
      // 1. Fetch fresh Days from server & update localDb cache & UI
      if (typeof window.apiFetch === 'function') {
        const freshData = await window.apiFetch(`${backendUrl}/api/days?page=1&limit=${window.daysPerPage || 30}`);
        if (freshData && Array.isArray(freshData.days)) {
          if (window.localDb && window.localDb.days) {
            await window.localDb.days.bulkPut(freshData.days);
          }
          window.allDays = freshData.days;
          if (typeof window.renderDays === 'function') {
            window.renderDays();
          }
        }
      }
      
      // 2. Fetch fresh Goals & update Goals UI
      if (typeof window.loadGoals === 'function') {
        await window.loadGoals();
      }

      // 3. Update Dashboard
      if (typeof window.fetchDashboardData === 'function') {
        window.fetchDashboardData();
      }
    } catch (refreshErr) {
      console.warn('[VoiceAssistant] Post-commit sync error:', refreshErr);
      if (typeof window.loadDays === 'function') window.loadDays(1);
    }

  } catch (err) {
    console.error('[VoiceAssistant] Commit failed:', err);
    alert(`Failed to save items: ${err.message}`);
    resetVoiceAssistantUI();
  }
}

// Draft Edit Handlers
export function removeDraftGoal(gIdx) {
  if (draftVoiceData.goals && draftVoiceData.goals[gIdx]) {
    draftVoiceData.goals.splice(gIdx, 1);
    renderDraftConfirmationView();
  }
}

export function updateDraftGoalDeadline(gIdx, newDate) {
  if (draftVoiceData.goals && draftVoiceData.goals[gIdx]) {
    draftVoiceData.goals[gIdx].deadline = newDate;
  }
}

export function removeDraftSubtask(gIdx, stIdx) {
  if (draftVoiceData.goals && draftVoiceData.goals[gIdx] && draftVoiceData.goals[gIdx].tasks) {
    draftVoiceData.goals[gIdx].tasks.splice(stIdx, 1);
    renderDraftConfirmationView();
  }
}

export function removeDraftDailyCard(cIdx) {
  if (draftVoiceData.dailyCards && draftVoiceData.dailyCards[cIdx]) {
    draftVoiceData.dailyCards.splice(cIdx, 1);
    renderDraftConfirmationView();
  }
}

export function removeAllDraftDailyCards() {
  draftVoiceData.dailyCards = [];
  renderDraftConfirmationView();
}

/**
 * Renders created goals and daily cards into success view
 */
function renderSuccessResults(data) {
  const container = document.getElementById('va-success-content');
  if (!container) return;

  const transcriptEl = document.getElementById('va-transcript-text');
  if (transcriptEl) {
    transcriptEl.textContent = `"${data.transcription || ''}"`;
  }

  let html = `<p style="margin-bottom: 12px; font-weight: 800; color: var(--text);">${data.summary || 'Processing complete!'}</p>`;

  if (Array.isArray(data.goals) && data.goals.length > 0) {
    html += `<div style="margin-bottom: 14px; padding: 12px; background: rgba(34, 197, 94, 0.08); border: 2px solid #22c55e; border-radius: 10px;">
      <h4 style="margin: 0 0 6px; font-size: 13px; font-weight: 900; color: #16a34a;">🎯 Goals Created (${data.goals.length})</h4>
      <ul style="margin: 0; padding-left: 18px; font-size: 12px; font-weight: 700;">`;
    data.goals.forEach(g => {
      const dStr = g.deadline ? new Date(g.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '2 Months';
      const subtaskCount = Array.isArray(g.tasks) ? g.tasks.length : 0;
      html += `<li style="margin-bottom: 4px;"><strong>${g.title}</strong> (Target: ${dStr}, ${subtaskCount} subtasks)</li>`;
    });
    html += `</ul></div>`;
  }

  if (Array.isArray(data.dailyCards) && data.dailyCards.length > 0) {
    html += `<div style="padding: 12px; background: rgba(59, 130, 246, 0.08); border: 2px solid #3b82f6; border-radius: 10px;">
      <h4 style="margin: 0 0 6px; font-size: 13px; font-weight: 900; color: #2563eb;">📅 Daily Tasks Created (${data.dailyCards.length})</h4>
      <ul style="margin: 0; padding-left: 18px; font-size: 12px; font-weight: 700;">`;
    data.dailyCards.forEach(c => {
      html += `<li style="margin-bottom: 4px;">[${c.date}] <strong>${c.category}</strong>: ${c.taskTitle}</li>`;
    });
    html += `</ul></div>`;
  }

  container.innerHTML = html;
}

// Attach to window object for global onclick access in HTML
if (typeof window !== 'undefined') {
  window.openVoiceAssistantModal = openVoiceAssistantModal;
  window.closeVoiceAssistantModal = closeVoiceAssistantModal;
  window.startVoiceAssistantRecording = startRecording;
  window.stopVoiceAssistantRecording = stopRecording;
  window.sendVoiceCommand = sendVoiceCommand;
  window.sendTextVoiceCommand = sendTextVoiceCommand;
  window.reRecordVoiceCommand = reRecordVoiceCommand;
  window.resetVoiceAssistantUI = resetVoiceAssistantUI;

  window.commitVoiceCommand = commitVoiceCommand;
  window.removeDraftGoal = removeDraftGoal;
  window.updateDraftGoalDeadline = updateDraftGoalDeadline;
  window.removeDraftSubtask = removeDraftSubtask;
  window.removeDraftDailyCard = removeDraftDailyCard;
  window.removeAllDraftDailyCards = removeAllDraftDailyCards;
}

/**
 * Sends typed/pasted text prompt directly to AI processing pipeline (bypassing Groq Whisper API)
 */
export async function sendTextVoiceCommand() {
  const textInputEl = document.getElementById('va-text-input');
  const text = textInputEl ? textInputEl.value.trim() : '';

  if (!text) {
    alert('Please enter or paste your prompt text before submitting.');
    return;
  }

  if (voiceAssistantQuota.generationsLeft <= 0) {
    alert(`You have reached your daily AI Voice Assistant limit of ${voiceAssistantQuota.limit} commands. Please try again tomorrow!`);
    return;
  }

  const pTitle = document.getElementById('va-processing-title');
  const pSub = document.getElementById('va-processing-subtitle');
  if (pTitle) pTitle.textContent = 'Analyzing Your Input';
  if (pSub) pSub.textContent = 'Structuring your goals and daily tasks... hang tight!';

  setViewState('processing');

  try {
    const mainToken = localStorage.getItem('token');
    if (!mainToken) {
      alert('Please log in to use the AI Voice Assistant.');
      resetVoiceAssistantUI();
      return;
    }

    // Step 1: Get 5-minute ticket authorization from Vercel backend
    const authRes = await fetch('/api/ai/authorize-voice-assistant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mainToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!authRes.ok) {
      const authErr = await authRes.json().catch(() => ({ message: 'Authorization failed.' }));
      alert(authErr.message || 'Daily limit reached or authorization failed.');
      resetVoiceAssistantUI();
      return;
    }

    const { token: ticketToken, aiServiceUrl } = await authRes.json();

    // Step 2: Send textPrompt directly to ai-service on Render (skipping Groq Whisper)
    const processRes = await fetch(`${aiServiceUrl}/process-voice-command`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ticketToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ textPrompt: text })
    });

    if (!processRes.ok) {
      const processErr = await processRes.json().catch(() => ({ error: 'AI Service processing error.' }));
      throw new Error(processErr.error || processErr.details || 'AI Service processing failed.');
    }

    const data = await processRes.json();

    if (!data.success) {
      alert(data.message || 'No actionable goals or daily tasks found in prompt.');
      resetVoiceAssistantUI();
      return;
    }

    if (typeof data.generationsLeft === 'number') {
      voiceAssistantQuota.generationsLeft = data.generationsLeft;
      updateQuotaBadge();
    }

    // Store in draft state for interactive user confirmation & editing
    draftVoiceData = {
      transcription: data.transcription || text,
      goals: data.goals || [],
      dailyCards: data.dailyCards || [],
      summary: data.summary || '',
      ticketToken: ticketToken,
      aiServiceUrl: aiServiceUrl
    };

    // Clear input field
    if (textInputEl) textInputEl.value = '';

    renderDraftConfirmationView();
    setViewState('draft');

  } catch (err) {
    console.error('[VoiceAssistant] Send text prompt failed:', err);
    alert(`Failed to process text prompt: ${err.message}`);
    resetVoiceAssistantUI();
  }
}

// Initial page load visibility sync for Centralized AI Voice Assistant Mic button
if (typeof window !== 'undefined') {
  const syncVoiceBtnVisibility = () => {
    const activePage = localStorage.getItem('activePage') || 'home';
    const voiceBtnContainer = document.getElementById('central-voice-btn-container');
    if (voiceBtnContainer) {
      voiceBtnContainer.style.display = (activePage === 'home' || activePage === 'goals') ? 'flex' : 'none';
    }
  };
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', syncVoiceBtnVisibility);
  } else {
    syncVoiceBtnVisibility();
  }
}
