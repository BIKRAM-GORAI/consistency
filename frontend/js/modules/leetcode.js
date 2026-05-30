// ── LeetCode Module ────────────────────────────────────────
console.log("[Module] leetcode.js initializing...");

// Reset LeetCode modal state
function resetLeetCodeModalState() {
  // Don't clear window.currentLeetCodeDayId here - it should persist for the current session
  window.currentLeetCodeValidation = null; // Clear cached validation result
  const problemUrlInput = document.getElementById('leetcode-problem-url');
  if (problemUrlInput) {
    problemUrlInput.value = '';
  }
  const previewDiv = document.getElementById('leetcode-problem-preview');
  if (previewDiv) {
    previewDiv.style.display = 'none';
  }
  const resultDiv = document.getElementById('leetcode-validation-result');
  if (resultDiv) {
    resultDiv.style.display = 'none';
  }
  const addBtn = document.getElementById('add-leetcode-btn');
  if (addBtn) {
    addBtn.disabled = true; // Start with disabled button
  }
}

// Reset LeetCode profile modal state
function resetLeetCodeProfileModalState() {
  const leetcodeUsernameInput = document.getElementById('leetcode-username');
  if (leetcodeUsernameInput) {
    leetcodeUsernameInput.value = '';
  }
  document.getElementById('leetcode-verification-code').style.display = 'none';
  document.getElementById('leetcode-code-expiry').style.display = 'none';
  document.getElementById('leetcode-code-generated').style.display = 'none';
  document.getElementById('leetcode-code-expired').style.display = 'none';
  document.getElementById('leetcode-connected').style.display = 'none';
  document.getElementById('leetcode-not-connected').style.display = 'block';

  const leetcodeStatus = document.getElementById('leetcode-status');
  setLcStatus(leetcodeStatus, 'error', '❌ Not connected');
}


// ── LeetCode Integration ──────────────────────────────────────────

// Generate verification code for LeetCode profile
async function generateLeetCodeCode() {
  const leetcodeUsernameInput = document.getElementById('leetcode-username');
  const leetcodeUsername = leetcodeUsernameInput.value.trim();

  if (!leetcodeUsername) {
    showToast('Please enter your LeetCode username', 'error');
    return;
  }

  try {
    const data = await apiFetch(`${window.API}/api/leetcode/generate-code`, {
      method: 'POST',
      body: JSON.stringify({ leetcodeUsername })
    });

    // Display verification code
    const codeDisplay = document.getElementById('leetcode-verification-code');
    const codeExpiry = document.getElementById('leetcode-code-expiry');
    const remainingChanges = document.getElementById('leetcode-remaining-changes');

    codeDisplay.textContent = data.verificationCode;
    codeDisplay.style.display = 'block';

    const expiryTime = new Date(data.expiry);
    const now = new Date();
    const timeLeft = Math.max(0, Math.floor((expiryTime - now) / (1000 * 60))); // minutes left

    let timeMessage = `Expires: ${expiryTime.toLocaleString()}`;
    if (timeLeft > 0 && timeLeft < 60) {
      timeMessage += ` (${timeLeft} minutes left)`;
    }

    codeExpiry.textContent = timeMessage;
    codeExpiry.style.display = 'block';
    remainingChanges.textContent = `Remaining changes: ${data.remainingChanges}`;

    // Show code generated section
    document.getElementById('leetcode-not-connected').style.display = 'none';
    document.getElementById('leetcode-code-expired').style.display = 'none';
    document.getElementById('leetcode-code-generated').style.display = 'block';

    // Update status
    const leetcodeStatus = document.getElementById('leetcode-status');
    setLcStatus(leetcodeStatus, 'waiting', '<i data-lucide="clock"></i> Pending verification');

    showToast('Verification code generated! Add it to your LeetCode bio.', 'success');
  } catch (error) {
    console.error('Error generating LeetCode code:', error);

    // Always reload profile status after a failure.
    // If a pending retry is active, loadLeetCodeProfileStatus() will show the
    // Check Status section automatically (pending_retry is checked before isVerified).
    // For any other error (bad username, change limit etc.) it shows the correct state too.
    const isPendingRetry = error.data && error.data.retryAvailableAt;
    showToast(
      isPendingRetry
        ? 'A verification is already in progress — use the Check Status button below'
        : (error.message || 'Failed to generate verification code'),
      isPendingRetry ? 'warn' : 'error'
    );
    await loadLeetCodeProfileStatus();
  }
}

// Verify LeetCode profile ownership
async function verifyLeetCodeProfile() {
  try {
    const data = await apiFetch(`${window.API}/api/leetcode/verify-profile`, {
      method: 'POST',
      body: JSON.stringify({})
    });

    if (data.pendingRetry) {
      // First attempt failed — could be a caching issue, start retry window
      showPendingRetryUI(data.retryAvailableAt, data.retryExpiresAt);
      showToast('Code not found yet — check again in 5 minutes', 'warn');
      return;
    }

    if (data.finalFailure) {
      // Check Status also failed — reset to State 1 so user can try fresh
      showToast(data.message || 'Verification failed', 'error');
      await loadLeetCodeProfileStatus();
      return;
    }

    // ── SUCCESS ──
    const leetcodeStatus          = document.getElementById('leetcode-status');
    const leetcodeUsernameDisplay = document.getElementById('leetcode-username-display');
    const leetcodeProfilePic      = document.getElementById('leetcode-profile-pic');
    const remainingChanges        = document.getElementById('leetcode-remaining-changes');

    setLcStatus(leetcodeStatus, 'verified', '<i data-lucide="check-circle"></i> Verified');
    leetcodeUsernameDisplay.textContent = data.leetcodeUsername;
    remainingChanges.textContent = `Remaining changes: ${data.remainingChanges}`;

    if (data.profilePicture) {
      leetcodeProfilePic.src = data.profilePicture;
      leetcodeProfilePic.style.display = 'block';
    }

    document.getElementById('leetcode-verification-code').style.display = 'none';
    document.getElementById('leetcode-code-expiry').style.display = 'none';
    document.getElementById('leetcode-code-generated').style.display = 'none';
    document.getElementById('leetcode-pending-retry').style.display = 'none';
    document.getElementById('leetcode-connected').style.display = 'block';
    document.getElementById('leetcode-connected-username').textContent = data.leetcodeUsername;
    document.getElementById('leetcode-changes-remaining').textContent = data.remainingChanges;
    const maxChanges = document.getElementById('leetcode-changes-max');
    if (maxChanges) maxChanges.textContent = window.MAX_USERNAME_CHANGES;

    updateLeetCodeButtonsStatus(true);
    showToast('LeetCode profile verified successfully!', 'success');

    // Sync settings locally and fetch profile picture for offline cache
    try {
      const userId = localStorage.getItem('window.userId');
      const res = await apiFetch(`${window.API}/api/auth/settings`);
      res.userId = window.userId;
      await cacheProfileImagesOffline(res);
      if (window.localDb) {
        await window.localDb.userProfile.put(res);
      }
      renderProfileData(res);
    } catch (e) {
      console.warn('Failed to sync LeetCode status to profile cache:', e);
    }
  } catch (error) {
    console.error('Error verifying LeetCode profile:', error);
    showToast(error.message || 'Failed to verify profile', 'error');
  }
}

// Show the pending-retry UI section and start both countdown timers
function showPendingRetryUI(retryAvailableAt, retryExpiresAt) {
  // Hide all other LeetCode sections
  document.getElementById('leetcode-not-connected').style.display = 'none';
  document.getElementById('leetcode-code-generated').style.display = 'none';
  document.getElementById('leetcode-code-expired').style.display = 'none';
  document.getElementById('leetcode-connected').style.display = 'none';
  document.getElementById('leetcode-pending-retry').style.display = 'block';

  // Status badge
  const leetcodeStatus = document.getElementById('leetcode-status');
  setLcStatus(leetcodeStatus, 'pending', '<i data-lucide="refresh-cw"></i> Verification pending');

  // Show the verification code in the pending section so user can double-check their bio
  const codeText = document.getElementById('leetcode-verification-code').textContent;
  document.getElementById('leetcode-pending-code-display').textContent = codeText || '(your code)';

  startRetryCountdown(retryAvailableAt, retryExpiresAt);
}

// Dual countdown: enables button after 5 min, resets to State 1 after 15 min
function startRetryCountdown(retryAvailableAt, retryExpiresAt) {
  // Clear any existing timer first
  if (window.leetcodeRetryTimerInterval) {
    clearInterval(window.leetcodeRetryTimerInterval);
    window.leetcodeRetryTimerInterval = null;
  }

  const btn        = document.getElementById('leetcode-check-status-btn');
  const timerEl   = document.getElementById('leetcode-retry-timer');
  const windowEl  = document.getElementById('leetcode-window-countdown');
  const availMs   = new Date(retryAvailableAt).getTime();
  const expiresMs = new Date(retryExpiresAt).getTime();

  function tick() {
    const now = Date.now();

    // 15-min window expired → auto-reset to State 1
    if (now >= expiresMs) {
      clearInterval(window.leetcodeRetryTimerInterval);
      window.leetcodeRetryTimerInterval = null;
      loadLeetCodeProfileStatus(); // DB was auto-cleared by next generateVerificationCode call or we show generate code state
      return;
    }

    // Window remaining (shown in footer text)
    const winMs   = expiresMs - now;
    const wMins   = Math.floor(winMs / 60000);
    const wSecs   = Math.floor((winMs % 60000) / 1000);
    if (windowEl) windowEl.textContent = `${wMins}:${wSecs.toString().padStart(2, '0')}`;

    if (now < availMs) {
      // Phase 1: button disabled, show enable countdown
      const remMs  = availMs - now;
      const rMins  = Math.floor(remMs / 60000);
      const rSecs  = Math.floor((remMs % 60000) / 1000);
      if (timerEl) timerEl.innerHTML = `<i data-lucide="clock"></i> Check available in ${rMins}:${rSecs.toString().padStart(2, '0')}`;
      if (btn) btn.disabled = true;
    } else {
      // Phase 2: button enabled
      if (timerEl) timerEl.innerHTML = '<i data-lucide="check-circle"></i> Ready — click Check Status below';
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="refresh-cw"></i> Check Status'; }
    }
  }

  tick();
  window.leetcodeRetryTimerInterval = setInterval(tick, 1000);
}

// Called when user clicks "Check Status" button (re-uses the same verify endpoint)
async function checkLeetCodeVerificationStatus() {
  const btn = document.getElementById('leetcode-check-status-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="clock"></i> Checking...'; }

  try {
    const data = await apiFetch(`${window.API}/api/leetcode/verify-profile`, {
      method: 'POST',
      body: JSON.stringify({})
    });

    if (data.verified) {
      // SUCCESS — clear timer, show verified state
      if (window.leetcodeRetryTimerInterval) {
        clearInterval(window.leetcodeRetryTimerInterval);
        window.leetcodeRetryTimerInterval = null;
      }
      showToast('LeetCode profile verified!', 'success');
      await loadLeetCodeProfileStatus();
    } else if (data.finalFailure) {
      // FAIL — clear timer, reset to State 1
      if (window.leetcodeRetryTimerInterval) {
        clearInterval(window.leetcodeRetryTimerInterval);
        window.leetcodeRetryTimerInterval = null;
      }
      showToast(data.message || 'Verification failed. Please check your bio and try again.', 'error');
      await loadLeetCodeProfileStatus();
    }
  } catch (error) {
    // Re-enable button so user can try again
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="refresh-cw"></i> Check Status'; }
    if (error.status === 429 || (error.message && error.message.includes('429'))) {
      showToast('Please wait for the timer before retrying', 'warn');
    } else {
      showToast(error.message || 'Check failed', 'error');
    }
  }
}

// Validate LeetCode problem submission (for modal UI)
async function validateLeetCodeProblemForModal() {
  const problemUrlInput = document.getElementById('leetcode-problem-url');
  const problemUrl = problemUrlInput.value.trim();

  if (!problemUrl) {
    showToast('Please enter a LeetCode problem URL', 'error');
    return;
  }

  // Validate URL format
  if (!problemUrl.includes('leetcode.com/problems/')) {
    showToast('Please enter a valid LeetCode problem URL', 'error');
    return;
  }

  try {
    // Extract problem title from URL for preview
    const problemTitle = extractProblemTitleFromUrl(problemUrl);
    if (!problemTitle) {
      showToast('Could not extract problem title from URL', 'error');
      return;
    }

    // Show preview with basic info
    const previewDiv = document.getElementById('leetcode-problem-preview');
    const titleElement = document.getElementById('leetcode-problem-title');
    const difficultyElement = document.getElementById('leetcode-problem-difficulty');

    titleElement.textContent = problemTitle.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    difficultyElement.textContent = 'Validating...';
    previewDiv.style.display = 'block';

    // Get the day date for validation
    if (!window.currentLeetCodeDayId) {
      showToast('No day selected. Please try again.', 'error');
      difficultyElement.textContent = 'Error';
      difficultyElement.style.color = '#ef4444';
      return;
    }

    const dayData = await apiFetch(`${window.API}/api/days/id/${window.currentLeetCodeDayId}`);

    // Validate the problem using backend window.API
    const validation = await validateLeetCodeProblem(problemUrl, dayData.date);

    // Get problem details for display
    const problemDetails = await getProblemDetailsFromAPI(problemTitle);

    if (problemDetails) {
      difficultyElement.textContent = problemDetails.difficulty || 'Unknown';
      difficultyElement.style.color = getDifficultyColor(problemDetails.difficulty);
    } else {
      difficultyElement.textContent = 'Unknown';
      difficultyElement.style.color = '#666';
    }

    // Show validation result
    const resultDiv = document.getElementById('leetcode-validation-result');
    resultDiv.style.display = 'block';

    if (validation.valid) {
      // Format the submission time
      const submissionTime = new Date(validation.acceptedDate);
      const formattedTime = submissionTime.toLocaleString();

      resultDiv.style.background = '#d1fae5';
      resultDiv.style.color = '#10b981';
      resultDiv.innerHTML = `
        <div style="margin-bottom: 8px;"><i data-lucide="check-circle"></i> <strong>Validation Successful!</strong></div>
        <div style="font-size: 13px; margin-bottom: 4px;">Problem: <strong>${validation.problemTitle || problemDetails.title}</strong></div>
        <div style="font-size: 13px; margin-bottom: 4px;">Difficulty: <strong>${validation.difficulty || problemDetails.difficulty}</strong></div>
        <div style="font-size: 13px; margin-bottom: 4px;">Accepted on: <strong>${formattedTime}</strong></div>
        <div style="font-size: 12px; color: #065f46; margin-top: 8px;">You can now add this to your daily tasks</div>
      `;

      // Cache the validation result so addLeetCodeProblem can reuse it without a second window.API call
      window.currentLeetCodeValidation = validation;

      // Enable add button only after successful validation
      document.getElementById('add-leetcode-btn').disabled = false;
    } else {
      resultDiv.style.background = '#fee2e2';
      resultDiv.style.color = '#ef4444';
      resultDiv.innerHTML = `
        <div style="margin-bottom: 8px;">❌ <strong>Validation Failed</strong></div>
        <div style="font-size: 13px;">${validation.message}</div>
        <div style="font-size: 12px; color: #991b1b; margin-top: 8px;">Please try a different problem or check if you solved it on this date</div>
      `;

      // Disable add button if validation failed
      document.getElementById('add-leetcode-btn').disabled = true;
    }
  } catch (error) {
    console.error('Error validating problem:', error);
    showToast('Error validating problem. Please try again.', 'error');

    // Show error message
    const resultDiv = document.getElementById('leetcode-validation-result');
    resultDiv.style.display = 'block';
    resultDiv.style.background = '#fee2e2';
    resultDiv.style.color = '#ef4444';
    resultDiv.innerHTML = `
      <div style="margin-bottom: 8px;">❌ <strong>Error</strong></div>
      <div style="font-size: 13px;">Failed to validate problem. Please try again.</div>
      <div style="font-size: 12px; color: #991b1b; margin-top: 8px;">Error: ${error.message || 'Unknown error'}</div>
    `;

    // Disable add button on error
    document.getElementById('add-leetcode-btn').disabled = true;
  }
}

// Validate LeetCode problem submission (for window.API validation)
async function validateLeetCodeProblem(problemUrl, dayDate) {
  try {
    const data = await apiFetch(`${window.API}/api/leetcode/validate-problem`, {
      method: 'POST',
      body: JSON.stringify({ problemUrl, dayDate })
    });

    return {
      valid: true,
      problemTitle: data.problemTitle,
      difficulty: data.difficulty,
      acceptedDate: data.acceptedDate,
      submissionCount: data.submissionCount
    };
  } catch (error) {
    console.error('Error validating LeetCode problem:', error);
    return {
      valid: false,
      message: error.message || 'Failed to validate problem'
    };
  }
}

// Get daily LeetCode problem
async function getDailyLeetCodeProblem() {
  try {
    const data = await apiFetch(`${window.API}/api/leetcode/daily-problem`);
    return data;
  } catch (error) {
    console.error('Error getting daily LeetCode problem:', error);
    return null;
  }
}

// Add LeetCode problem to daily card
async function addLeetCodeProblem() {
  if (!window.currentLeetCodeDayId) {
    showToast('No day selected', 'error');
    return;
  }

  // Reuse the cached validation result — no second window.API call needed
  if (!window.currentLeetCodeValidation || !window.currentLeetCodeValidation.valid) {
    showToast('Please validate the problem first before adding', 'error');
    return;
  }

  const validation = window.currentLeetCodeValidation;

  // Build a safe title: prefer backend-returned title, fall back to the URL slug
  const problemUrlInput = document.getElementById('leetcode-problem-url');
  const problemUrl = (problemUrlInput && problemUrlInput.value.trim()) || '';
  const slugFallback = problemUrl
    ? (extractProblemTitleFromUrl(problemUrl) || '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    : 'Unknown Problem';
  const taskTitle = validation.problemTitle || slugFallback;

  try {
    // Add LeetCode problem as a task under the LeetCode category
    const taskData = {
      title: `\uD83E\uDDE0 LeetCode: ${taskTitle}`,
      completed: true,
      metadata: {
        problemUrl: problemUrl,
        difficulty: validation.difficulty,
        acceptedDate: validation.acceptedDate,
        submissionCount: validation.submissionCount,
        verified: true
      }
    };

    await apiFetch(`${window.API}/api/days/${window.currentLeetCodeDayId}`, {
      method: 'PUT',
      body: JSON.stringify({ tasks: [taskData] })
    });

    showToast(`LeetCode: "${taskTitle}" added to daily tasks!`, 'success');
  } catch (error) {
    console.error('Error adding LeetCode problem:', error);
    showToast(error.message || 'Failed to add problem', 'error');
    return; // Keep modal open so user can try again
  }

  // Clean up and close modal only after successful save
  try {
    if (problemUrlInput) problemUrlInput.value = '';
    document.getElementById('leetcode-problem-preview').style.display = 'none';
    document.getElementById('leetcode-validation-result').style.display = 'none';
    document.getElementById('add-leetcode-btn').disabled = true;
    window.currentLeetCodeValidation = null;
    closeModal('modal-add-leetcode');

    // Refresh the days display
    await loadDays();

    // Update LeetCode button states after reload
    try {
      const user = await apiFetch(`${window.API}/api/auth/settings`);
      updateLeetCodeButtonsStatus(!!user.leetcodeLastVerifiedAt);
    } catch (e) {
      console.error('Error updating LeetCode button status:', e);
    }
  } catch (error) {
    console.error('Error cleaning up after adding problem:', error);
    try { closeModal('modal-add-leetcode'); } catch (e) { /* ignore */ }
  }
}

// Open LeetCode problem modal for a specific day
async function openLeetCodeProblemModal(dayId, dayDate) {
  // Check if user has verified LeetCode profile first
  try {
    const user = await apiFetch(`${window.API}/api/auth/settings`);
    if (!user.leetcodeLastVerifiedAt) {
      showToast('Please verify your LeetCode profile first', 'error');
      // Open profile modal to guide user
      openProfileModal();
      return;
    }
  } catch (error) {
    console.error('Error checking profile verification:', error);
    showToast('Unable to verify profile status', 'error');
    return;
  }

  const modal = document.getElementById('modal-add-leetcode');
  if (!modal) {
    console.error('LeetCode modal not found');
    return;
  }

  // Clear previous data and reset state (but don't clear day ID yet)
  resetLeetCodeModalState();

  // Set the day ID AFTER resetting state
  window.currentLeetCodeDayId = dayId;

  // Show the modal using the proper function
  openModal('modal-add-leetcode');
}

// Load LeetCode profile status
async function loadLeetCodeProfileStatus() {
  try {
    // 1. STALE: Try cache first
    const userId = localStorage.getItem('window.userId');
    if (window.userId && window.localDb) {
      const cached = await window.localDb.userProfile.get(window.userId);
      if (cached) renderLeetCodeUI(cached);
    }

    // 2. REVALIDATE: Fetch fresh if online
    if (navigator.onLine) {
      const user = await apiFetch(`${window.API}/api/auth/settings`);
      renderLeetCodeUI(user);
    }
  } catch (error) {
    console.error('Error loading LeetCode profile status:', error);
  }
}

/** Helper to render LeetCode UI components from user data */
function renderLeetCodeUI(user) {
  if (!user) return;

  if (user.leetcodeUsername !== undefined) localStorage.setItem('leetcodeUsername', user.leetcodeUsername || '');
  if (user.leetcodePendingUsername !== undefined) localStorage.setItem('leetcodePendingUsername', user.leetcodePendingUsername || '');
  if (user.leetcodeVerificationCode !== undefined) localStorage.setItem('leetcodeVerificationCode', user.leetcodeVerificationCode || '');
  if (user.leetcodeVerificationStatus !== undefined) localStorage.setItem('leetcodeVerificationStatus', user.leetcodeVerificationStatus || 'none');
  if (user.leetcodeProfilePicture !== undefined) localStorage.setItem('leetcodeProfilePicture', user.leetcodeProfilePicture || '');
  
  const leetcodeUsernameDisplay = document.getElementById('leetcode-username-display');
  const leetcodeStatus         = document.getElementById('leetcode-status');
  const leetcodeProfilePic     = document.getElementById('leetcode-profile-pic');
  const leetcodeUsernameInput  = document.getElementById('leetcode-username');
  const remainingChanges       = document.getElementById('leetcode-remaining-changes');
  
  if (!leetcodeUsernameDisplay || !leetcodeStatus) return;

  // Derived state
  const isVerified  = !!(user.leetcodeUsername && user.leetcodeLastVerifiedAt);
  const hasPending  = !!(user.leetcodePendingUsername && user.leetcodeVerificationCode);
  const displayName = user.leetcodeUsername || user.leetcodePendingUsername || null;
  const inputName   = user.leetcodePendingUsername || user.leetcodeUsername || '';

  if (leetcodeUsernameInput) leetcodeUsernameInput.value = inputName;
  if (displayName) leetcodeUsernameDisplay.textContent = displayName;

  // Helper — hides all sub-sections
  function hideAllSections() {
    ['leetcode-not-connected', 'leetcode-code-generated', 'leetcode-code-expired', 'leetcode-pending-retry', 'leetcode-connected'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  const isPendingRetryActive = user.leetcodeVerificationStatus === 'pending_retry' && 
                               user.leetcodeRetryScheduledAt && 
                               Date.now() < (new Date(user.leetcodeRetryScheduledAt).getTime() + 15 * 60 * 1000);

  if (isPendingRetryActive) {
    const scheduledMs    = new Date(user.leetcodeRetryScheduledAt).getTime();
    const retryAvailMs   = scheduledMs + 5  * 60 * 1000;
    const retryExpiresMs = scheduledMs + 15 * 60 * 1000;

    setLcStatus(leetcodeStatus, 'pending', '🔄 Verification pending');

    if (user.leetcodeVerificationCode) {
      const vCode = document.getElementById('leetcode-verification-code');
      const pCode = document.getElementById('leetcode-pending-code-display');
      if (vCode) vCode.textContent = user.leetcodeVerificationCode;
      if (pCode) pCode.textContent = user.leetcodeVerificationCode;
    }

    hideAllSections();
    const prSec = document.getElementById('leetcode-pending-retry');
    if (prSec) prSec.style.display = 'block';
    
    // Only start countdown if we are in the active window
    if (typeof startRetryCountdown === 'function') {
      startRetryCountdown(
        new Date(retryAvailMs).toISOString(),
        new Date(retryExpiresMs).toISOString()
      );
    }
    updateLeetCodeButtonsStatus(false);

  } else if (isVerified) {
    setLcStatus(leetcodeStatus, 'verified', '✅ Verified');

    hideAllSections();
    const connSec = document.getElementById('leetcode-connected');
    if (connSec) {
      connSec.style.display = 'block';
      const connUser = document.getElementById('leetcode-connected-username');
      const remChanges = document.getElementById('leetcode-changes-remaining');
      const maxChanges = document.getElementById('leetcode-changes-max');
      if (connUser) connUser.textContent = user.leetcodeUsername;
      if (remChanges) remChanges.textContent = window.MAX_USERNAME_CHANGES - (user.leetcodeUsernameChangeCount || 0);
      if (maxChanges) maxChanges.textContent = window.MAX_USERNAME_CHANGES;
    }

    if (user.leetcodeProfilePicture && leetcodeProfilePic) {
      leetcodeProfilePic.src = user.leetcodeProfilePicture;
      leetcodeProfilePic.style.display = 'block';
      leetcodeProfilePic.onerror = () => {
        leetcodeProfilePic.style.display = 'none';
      };
    } else if (leetcodeProfilePic) {
      leetcodeProfilePic.style.display = 'none';
    }
    updateLeetCodeButtonsStatus(true);

  } else if (hasPending) {
    const isExpired = user.leetcodeVerificationExpiry &&
                      new Date() > new Date(user.leetcodeVerificationExpiry);

    if (isExpired) {
      setLcStatus(leetcodeStatus, 'error', '<i data-lucide="alert-circle"></i> Code expired');
      hideAllSections();
      const expSec = document.getElementById('leetcode-code-expired');
      if (expSec) expSec.style.display = 'block';
    } else {
      setLcStatus(leetcodeStatus, 'waiting', '<i data-lucide="clock"></i> Pending verification');

      const vCode = document.getElementById('leetcode-verification-code');
      if (vCode) {
        vCode.textContent = user.leetcodeVerificationCode;
        vCode.style.display = 'block';
      }

      if (user.leetcodeVerificationExpiry) {
        const expiryTime = new Date(user.leetcodeVerificationExpiry);
        const timeLeft   = Math.max(0, Math.floor((expiryTime - new Date()) / 60000));
        let msg = `Expires: ${expiryTime.toLocaleString()}`;
        if (timeLeft > 0 && timeLeft < 60) msg += ` (${timeLeft} min left)`;
        const expEl = document.getElementById('leetcode-code-expiry');
        if (expEl) {
          expEl.textContent = msg;
          expEl.style.display = 'block';
        }
      }

      hideAllSections();
      const genSec = document.getElementById('leetcode-code-generated');
      if (genSec) genSec.style.display = 'block';
    }
    updateLeetCodeButtonsStatus(false);

  } else {
    if (leetcodeUsernameDisplay) leetcodeUsernameDisplay.textContent = 'Not connected';
    setLcStatus(leetcodeStatus, 'error', '❌ Not connected');
    if (leetcodeProfilePic) leetcodeProfilePic.style.display = 'none';
    hideAllSections();
    const ncSec = document.getElementById('leetcode-not-connected');
    if (ncSec) ncSec.style.display = 'block';
    updateLeetCodeButtonsStatus(false);
  }

  if (remainingChanges) {
    remainingChanges.textContent =
      `Remaining changes: ${window.MAX_USERNAME_CHANGES - (user.leetcodeUsernameChangeCount || 0)}`;
  }
}

// Update all LeetCode buttons to show verification status
function updateLeetCodeButtonsStatus(isVerified) {
  const leetcodeButtons = document.querySelectorAll('[id^="leetcode-btn-"]');
  leetcodeButtons.forEach(button => {
    if (isVerified) {
      button.style.opacity = '1';
      button.style.cursor = 'pointer';
      button.style.pointerEvents = 'auto';
      button.title = 'Add LeetCode problem';
    } else {
      button.style.opacity = '0.5';
      button.style.cursor = 'not-allowed';
      button.style.pointerEvents = 'none';
      button.title = 'Verify your LeetCode profile first';
    }
  });
}

// Copy LeetCode verification code to clipboard
function copyLeetCodeCode() {
  const codeElement = document.getElementById('leetcode-verification-code');
  const code = codeElement.textContent;

  navigator.clipboard.writeText(code).then(() => {
    showToast('Verification code copied to clipboard!', 'success');
  }).catch(err => {
    console.error('Failed to copy code:', err);
    showToast('Failed to copy code', 'error');
  });
}

// Change LeetCode username
function changeLeetCodeUsername() {
  const leetcodeUsernameInput = document.getElementById('leetcode-username');
  const newUsername = leetcodeUsernameInput.value.trim();

  if (!newUsername) {
    showToast('Please enter a new LeetCode username', 'error');
    return;
  }

  // Reset the UI to show the not connected state
  document.getElementById('leetcode-not-connected').style.display = 'block';
  document.getElementById('leetcode-code-generated').style.display = 'none';
  document.getElementById('leetcode-code-expired').style.display = 'none';
  document.getElementById('leetcode-pending-retry').style.display = 'none';
  document.getElementById('leetcode-connected').style.display = 'none';

  // Reset status
  const leetcodeStatus = document.getElementById('leetcode-status');
  setLcStatus(leetcodeStatus, 'error', '❌ Not connected');

  showToast('Enter your new username and generate a new verification code', 'info');
}

// Disconnect LeetCode profile
async function disconnectLeetCodeProfile() {
  if (!navigator.onLine) {
    showToast('You must be online to disconnect your LeetCode profile', 'error');
    return;
  }

  if (!confirm('Are you sure you want to disconnect your LeetCode profile? This will unlink it from your account.')) {
    return;
  }

  try {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/leetcode/disconnect', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.message || 'Failed to disconnect profile');
    }

    // Clear local storage fields
    localStorage.removeItem('leetcodeUsername');
    localStorage.removeItem('leetcodePendingUsername');
    localStorage.removeItem('leetcodeVerificationCode');
    localStorage.removeItem('leetcodeVerificationStatus');
    localStorage.removeItem('leetcodeProfilePicture');

    // Update Dexie localDb
    if (window.localDb && window.localDb.userProfile) {
      const profiles = await window.localDb.userProfile.toArray();
      if (profiles.length > 0) {
        const profile = profiles[0];
        profile.leetcodeUsername = '';
        profile.leetcodePendingUsername = '';
        profile.leetcodeVerificationCode = '';
        profile.leetcodeVerificationStatus = 'none';
        profile.leetcodeLastVerifiedAt = null;
        profile.leetcodeProfilePicture = '';
        await window.localDb.userProfile.put(profile);
      }
    }

    // Reset UI using existing resetLeetCodeProfileModalState helper
    resetLeetCodeProfileModalState();
    
    // Also call renderLeetCodeUI to update any status badges/buttons on cards immediately
    renderLeetCodeUI({
      leetcodeUsername: '',
      leetcodePendingUsername: '',
      leetcodeVerificationCode: '',
      leetcodeVerificationStatus: 'none',
      leetcodeLastVerifiedAt: null,
      leetcodeProfilePicture: ''
    });

    showToast('LeetCode profile disconnected successfully!', 'success');
  } catch (err) {
    console.error('Error disconnecting LeetCode profile:', err);
    showToast(err.message || 'Error disconnecting LeetCode profile', 'error');
  }
}

// Helper functions for LeetCode integration

// Extract problem title from URL
function extractProblemTitleFromUrl(url) {
  try {
    const patterns = [
      /leetcode\.com\/problems\/([^\/\?]+)/,  // Matches problem-title or problem-title/description
      /leetcode\.com\/problems\/([^\/\?]+)\/?/,  // Matches with optional trailing slash
      /leetcode\.com\/problems\/([^\/\?]+)\/?[^\/]*\/?/  // Matches with additional path segments
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        // If the matched part contains a slash, take only the first part (the problem title)
        const problemTitle = match[1].split('/')[0];
        return problemTitle;
      }
    }

    return null;
  } catch (error) {
    console.error('Error extracting problem title:', error);
    return null;
  }
}

// Get problem details from window.API
async function getProblemDetailsFromAPI(problemTitle) {
  // Try REST window.API first
  try {
    const LEETCODE_API_BASE_URL = 'https://alfa-leetcode-api.onrender.com';
    const response = await fetch(`${LEETCODE_API_BASE_URL}/select?titleSlug=${problemTitle}`, {
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
      console.error('window.API response not ok:', response.status, response.statusText);
      throw new Error('Failed to fetch problem details');
    }

    const problemData = await response.json();

    // Handle different window.API response formats
    const title = problemData.title || problemData.questionTitle || problemData.question_title;
    const difficulty = problemData.difficulty || problemData.difficulty_level;

    if (title) {
      return {
        title: title,
        difficulty: difficulty || 'Unknown',
        topicTags: problemData.topicTags || problemData.tags || []
      };
    }
  } catch (error) {
    console.error('REST window.API failed, trying GraphQL:', error.message);
  }

  // Fallback to GraphQL window.API
  try {
    const graphqlQuery = {
      query: `
        query getQuestionDetail($titleSlug: String!) {
          question(titleSlug: $titleSlug) {
            title
            difficulty
            topicTags {
              name
            }
          }
        }
      `,
      variables: {
        titleSlug: problemTitle
      }
    };

    const response = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(graphqlQuery),
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
      throw new Error('GraphQL window.API failed');
    }

    const data = await response.json();

    if (data.data && data.data.question) {
      const question = data.data.question;
      return {
        title: question.title,
        difficulty: question.difficulty,
        topicTags: question.topicTags || []
      };
    }
  } catch (error) {
    console.error('GraphQL window.API failed:', error.message);
  }

  // If both APIs fail, return null
  return null;
}

// Get color based on difficulty
function getDifficultyColor(difficulty) {
  switch (difficulty?.toLowerCase()) {
    case 'easy':
      return '#10b981'; // green
    case 'medium':
      return '#f59e0b'; // orange
    case 'hard':
      return '#ef4444'; // red
    default:
      return '#666'; // gray
  }
}


// ── LeetCode Module Bindings ───────────────────────────────
window.resetLeetCodeModalState = resetLeetCodeModalState;
window.resetLeetCodeProfileModalState = resetLeetCodeProfileModalState;
window.generateLeetCodeCode = generateLeetCodeCode;
window.verifyLeetCodeProfile = verifyLeetCodeProfile;
window.showPendingRetryUI = showPendingRetryUI;
window.startRetryCountdown = startRetryCountdown;
window.checkLeetCodeVerificationStatus = checkLeetCodeVerificationStatus;
window.validateLeetCodeProblemForModal = validateLeetCodeProblemForModal;
window.validateLeetCodeProblem = validateLeetCodeProblem;
window.getDailyLeetCodeProblem = getDailyLeetCodeProblem;
window.addLeetCodeProblem = addLeetCodeProblem;
window.openLeetCodeProblemModal = openLeetCodeProblemModal;
window.loadLeetCodeProfileStatus = loadLeetCodeProfileStatus;
window.renderLeetCodeUI = renderLeetCodeUI;
window.updateLeetCodeButtonsStatus = updateLeetCodeButtonsStatus;
window.copyLeetCodeCode = copyLeetCodeCode;
window.changeLeetCodeUsername = changeLeetCodeUsername;
window.disconnectLeetCodeProfile = disconnectLeetCodeProfile;
window.extractProblemTitleFromUrl = extractProblemTitleFromUrl;
window.getProblemDetailsFromAPI = getProblemDetailsFromAPI;
window.getDifficultyColor = getDifficultyColor;
console.log("[Module] leetcode.js loaded and LeetCode bound to window");
