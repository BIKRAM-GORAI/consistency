// ── Days Module ────────────────────────────────────────────
import { scheduleLocalReminder, cancelLocalReminder, updateTodayStatusCache } from './reminders.js';
console.log("[Module] days.js initializing...");

// ── Days ───────────────────────────────────────────────────
async function loadDays(page = 1) {
  if (window.syncManager && window.syncManager.isProcessing) {
    await window.syncManager.processQueue();
  }

  const localDb = window.localDb;
  if (!localDb) {
    console.warn('Local database not initialized');
    return;
  }

  // Pre-load app limits on page 1 startup to make limit evaluations and settings responsive on login
  if (page === 1) {
    (async () => {
      try {
        let limits = await localDb.appLimits.get(window.userId);
        if (limits) {
          window.currentAppLimits = limits;
          if (typeof evaluateDaysDistractions === 'function') {
            evaluateDaysDistractions();
          }
        }
        if (navigator.onLine) {
          const fresh = await window.apiFetch(`${window.API}/api/applimits`);
          if (fresh) {
            window.currentAppLimits = { ...fresh, userId: window.userId };
            await localDb.appLimits.put(window.currentAppLimits);
            if (typeof evaluateDaysDistractions === 'function') {
              evaluateDaysDistractions();
            }
          }
        }
      } catch (err) {
        console.warn('Startup appLimits pre-load failed:', err);
      }
    })();
  }

  const loadingEl = document.getElementById('loading-days');

  // 1. STALE: Load from IndexedDB instantly (including weekly summaries, so they render offline too)
  if (page === 1) {
    try {
      const cached = await localDb.days.toArray();

      // Always pre-load weekly/monthly summaries from Dexie so they show in the feed immediately
      // This runs whether online or offline — server will overwrite with fresh data if online
      try {
        window.allWeeklySummaries = await localDb.weeklySummaries.toArray();
      } catch (dexieErr) {
        console.warn('Failed to read weekly summaries from Dexie cache:', dexieErr);
      }

      if (cached.length > 0) {
        window.allDays = cached;
        renderDays();
        updateStreak();
        
        // Cache today's status offline
        const today = window.todayStr();
        const todayCard = cached.find(d => (d.date || '').split('T')[0] === today);
        if (todayCard) {
          const pendingTasks = [];
          if (todayCard.categories) {
            todayCard.categories.forEach(cat => {
              if (cat.tasks) {
                cat.tasks.forEach(t => {
                  if (!t.completed) pendingTasks.push(t.title);
                });
              }
            });
          }
          updateTodayStatusCache(today, true, pendingTasks);
        } else {
          updateTodayStatusCache(today, false, []);
        }

        if (loadingEl) loadingEl.innerHTML = '';
      } else {
        updateTodayStatusCache(window.todayStr(), false, []);
      }
    } catch (err) {
      console.warn('Dexie read error:', err);
    }
  }

  // 2. REVALIDATE: Load from Server (Only if online)
  if (!navigator.onLine) {
    if (window.allDays.length > 0) {
      window.showToast('Offline: Using cached data.', 'info');
    } else {
      // Offline with no days present — render the empty state so user can create cards offline
      renderDays();
      updateStreak();
    }
    // Ensure all network-dependent buttons are disabled in offline mode
    updateOfflineButtonState();
    if (loadingEl) loadingEl.innerHTML = '';
    return;
  }


  const fetchStartTime = Date.now();
  try {
    const data = await window.apiFetch(`${window.API}/api/days?page=${page}&limit=${window.daysPerPage}`);
    
    // Sync fresh Weekly & Monthly Summaries from server on page 1 load
    // (Dexie was already loaded above in the stale-cache step)
    if (page === 1) {
      try {
        const freshSummaries = await window.apiFetch(`${window.API}/api/ai/weekly-summaries`);
        if (freshSummaries && Array.isArray(freshSummaries)) {
          window.allWeeklySummaries = freshSummaries;
          if (window.localDb) {
            await window.localDb.weeklySummaries.clear();
            const validSummaries = (freshSummaries || []).filter(s => s && typeof s === 'object' && s._id);
            await window.localDb.weeklySummaries.bulkPut(validSummaries);
          }
        }
      } catch (err) {
        console.warn('Failed to load weekly summaries from server:', err);
      }
    }

    if (data && typeof data === 'object' && !Array.isArray(data)) {
      if (page === 1) {
        // Get cached days map first to evaluate if they have a newer lastLocalEdit
        const cachedDays = await localDb.days.toArray();
        const cachedDaysMap = new Map(cachedDays.map(d => [d._id, d]));

        // Preserve local-only changes (those not yet synced) — don't overwrite them
        const pendingDayItems = await localDb.syncQueue
          .filter(x => x.entity === 'days')
          .toArray();
        const pendingIds = new Set(pendingDayItems.map(q => q.targetId).filter(Boolean));
        const pendingLocalIds = new Set(pendingDayItems.map(q => q.localId).filter(Boolean));

        const serverDays = data.days;
        const validDaysToUpdate = [];
        const mergedDays = [];

        for (const sd of serverDays) {
          const cached = cachedDaysMap.get(sd._id);
          const hasPending = pendingIds.has(sd._id);
          const isLocallyEditedNewer = cached && cached.lastLocalEdit && cached.lastLocalEdit > fetchStartTime;

          if ((hasPending || isLocallyEditedNewer) && cached) {
            // Keep the local cached version
            mergedDays.push(cached);
          } else {
            // Use the server version
            validDaysToUpdate.push(sd);
            mergedDays.push(sd);
          }
        }

        if (validDaysToUpdate.length > 0) {
          const validDays = validDaysToUpdate.filter(d => d && typeof d === 'object' && d._id);
          await localDb.days.bulkPut(validDays);
        }

        // Build final allDays: mergedDays + locally modified days not in server list
        const localPendingDays = await Promise.all(
          [...pendingIds, ...pendingLocalIds].map(id => localDb.days.get(id))
        );
        const localPendingMap = new Map();
        localPendingDays.filter(Boolean).forEach(d => localPendingMap.set(d._id, d));

        window.allDays = mergedDays;
        // Also include any locally-created days (temp IDs) not on server
        for (const [id, day] of localPendingMap) {
          if (!window.allDays.find(d => d._id === id)) {
            window.allDays.push(day);
          }
        }
      } else {
        window.allDays.push(...data.days);
        const validDays = (data.days || []).filter(d => d && typeof d === 'object' && d._id);
        await localDb.days.bulkPut(validDays);
      }
      
      window.backendStreak = data.streak || 0;
      window.hasMoreDays = data.hasMore || false;
      window.totalDaysCountInDb = data.total || window.allDays.length;
    } else {
      // Fallback for non-paginated window.API
      if (page === 1) {
        const cachedDays = await localDb.days.toArray();
        const cachedDaysMap = new Map(cachedDays.map(d => [d._id, d]));

        const pendingDayItems = await localDb.syncQueue
          .filter(x => x.entity === 'days')
          .toArray();
        const pendingIds = new Set(pendingDayItems.map(q => q.targetId).filter(Boolean));
        const pendingLocalIds = new Set(pendingDayItems.map(q => q.localId).filter(Boolean));

        const serverDays = data || [];
        const validDaysToUpdate = [];
        const mergedDays = [];

        for (const sd of serverDays) {
          const cached = cachedDaysMap.get(sd._id);
          const hasPending = pendingIds.has(sd._id);
          const isLocallyEditedNewer = cached && cached.lastLocalEdit && cached.lastLocalEdit > fetchStartTime;

          if ((hasPending || isLocallyEditedNewer) && cached) {
            mergedDays.push(cached);
          } else {
            validDaysToUpdate.push(sd);
            mergedDays.push(sd);
          }
        }

        window.allDays = mergedDays;
        await localDb.days.clear();
        const validDays = validDaysToUpdate.filter(d => d && typeof d === 'object' && d._id);
        await localDb.days.bulkPut(validDays);

        // Include locally-created pending days not in server list
        const localPendingDays = await Promise.all(
          [...pendingIds, ...pendingLocalIds].map(id => localDb.days.get(id))
        );
        const localPendingMap = new Map();
        localPendingDays.filter(Boolean).forEach(d => localPendingMap.set(d._id, d));
        for (const [id, day] of localPendingMap) {
          if (!window.allDays.find(d => d._id === id)) {
            window.allDays.push(day);
          }
        }
      } else {
        window.allDays.push(...data);
        const validDays = (data || []).filter(d => d && typeof d === 'object' && d._id);
        await localDb.days.bulkPut(validDays);
      }
      window.hasMoreDays = false;
    }

    const isLoadMore = page > 1;
    window.currentPage = page;
    renderDays(isLoadMore);
    updateStreak();
    
    if (page === 1) {
      const today = window.todayStr();
      const todayCard = window.allDays.find(d => (d.date || '').split('T')[0] === today);
      if (todayCard) {
        const pendingTasks = [];
        if (todayCard.categories) {
          todayCard.categories.forEach(cat => {
            if (cat.tasks) {
              cat.tasks.forEach(t => {
                if (!t.completed) pendingTasks.push(t.title);
              });
            }
          });
        }
        updateTodayStatusCache(today, true, pendingTasks);
      } else {
        updateTodayStatusCache(today, false, []);
      }
    }

    if (loadingEl) loadingEl.innerHTML = '';
    // Confirmed server reachable — enable the leaderboard toggles
    setLeaderboardTogglesEnabled(true);
  } catch (err) {
    console.error('Error loading days:', err);

    // Detect real offline (fetch failure = no internet even if navigator.onLine was true)
    const isNetworkError = err instanceof TypeError && err.message.includes('fetch');
    if (isNetworkError) {
      // Actual connectivity lost — disable all network-dependent buttons
      updateOfflineButtonState(true);
    }
    
    // If we have cached data, don't show a big error, just a small notice
    if (window.allDays.length > 0) {
      if (loadingEl) loadingEl.innerHTML = '<p style="color:var(--text-muted);font-size:11px;text-align:center;">Showing offline data</p>';
      return;
    }

    let errorMessage = '⚠️ Failed to load days. Please check your connection.';
    if (err.message) {
      if (err.message.includes('Too many requests') || err.message.includes('rate limit') || err.message.includes('429')) {
        errorMessage = '⚠️ Too many requests. Please try again later.';
      } else if (err.message.includes('Server offline') || err.message.includes('fetch')) {
        errorMessage = '⚠️ Server offline. Please check your connection.';
      } else {
        errorMessage = `⚠️ ${err.message}`;
      }
    }

    if (loadingEl) {
      loadingEl.innerHTML = `<p style="color:#ef4444;text-align:center">${errorMessage}</p>`;
    }
  }
}

function loadMoreDays() {
  const btn = document.querySelector('.btn-load-more');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner-ring" style="width:16px;height:16px;border-width:2px;margin:0 auto;"></div>';
  }
  loadDays(window.currentPage + 1);
}

function updateStreak() {
  // Use a IIFE to get full local data for streak calculation without affecting global window.allDays
  (async () => {
    const fullLocalDays = await window.localDb.days.toArray();
    const { count, todayDone } = window.calculateStreak(fullLocalDays);
    
    // Use local count if offline or if local count is higher (unsynced wins)
    const streak = (!navigator.onLine || count > window.backendStreak) ? count : window.backendStreak;
    
    // Persist to localStorage for consistency across the app (e.g., Leaderboard spotlight)
    localStorage.setItem('userCurrentStreak', streak);
    const storedHighest = parseInt(localStorage.getItem('userHighestStreak')) || 0;
    if (streak > storedHighest) {
      localStorage.setItem('userHighestStreak', streak);
    }
    
    const el = document.getElementById('streak-display');
    const fireEl = document.querySelector('.streak-fire');

    // Update all streak displays (Main UI, Quick View, etc.)
    const allDisplays = document.querySelectorAll('#streak-display, #qp-current-streak, #public-profile-streak');
    allDisplays.forEach(display => {
      if (display && display !== el) display.textContent = streak;
    });

    // Show exclamation mark if streak > 0 but today is not done yet
    if (fireEl) {
      fireEl.innerHTML = (streak > 0 && !todayDone) ? '<i data-lucide="alert-circle"></i>' : '🔥';
      if (window.lucide) lucide.createIcons({ root: fireEl });
    }
    
    // Define streak warning dismissal handler globally
    window.dismissStreakWarning = function() {
      const warningBanner = document.getElementById('streak-warning-banner');
      if (warningBanner) {
        warningBanner.style.display = 'none';
      }
      const todayDate = typeof window.todayStr === 'function' ? window.todayStr() : new Date().toISOString().split('T')[0];
      localStorage.setItem('streakWarningLastDismissedDate', todayDate);
    };

    // Manage dynamic streak rescue warning banner
    const warningBanner = document.getElementById('streak-warning-banner');
    if (warningBanner) {
      const todayDate = typeof window.todayStr === 'function' ? window.todayStr() : new Date().toISOString().split('T')[0];
      const lastDismissedDate = localStorage.getItem('streakWarningLastDismissedDate');
      
      if (streak > 0 && !todayDone && lastDismissedDate !== todayDate) {
        warningBanner.style.display = 'flex';
        const warningText = document.getElementById('streak-warning-text');
        if (warningText) {
          warningText.textContent = `Streak Rescue: Complete today's card to lock in your ${streak}-day streak!`;
        }
        if (window.lucide) {
          lucide.createIcons({ root: warningBanner });
        }
      } else {
        warningBanner.style.display = 'none';
      }
    }
    
    if (el) {
      if (window.gsap) {
        gsap.to({ val: parseInt(el.textContent) || 0 }, {
          val: streak,
          duration: 0.8,
          ease: 'power2.out',
          onUpdate() { el.textContent = Math.round(this.targets()[0].val); },
        });
      } else {
        el.textContent = streak;
      }
      if (streak >= 100) el.classList.add('legendary');
      else el.classList.remove('legendary');

      // Pulse the streak pill if streak > 0 and today is complete
      if (streak > 0 && todayDone && window.gsap) {
        gsap.fromTo('#nav-streak', { scale: 1 }, { scale: 1.06, duration: 0.2, yoyo: true, repeat: 1, ease: 'power1.inOut' });
      }
    }
  })();
}


async function renderDays(appendOnly = false) {
  const container = document.getElementById('cards-container');
  if (!container) return;
  
  // Filter for only the new days if appending
  let daysToRender = [...window.allDays];
  if (appendOnly) {
    const existingCards = container.querySelectorAll('.day-card');
    const existingIds = new Set(Array.from(existingCards).map(c => c.id.replace('day-card-', '')));
    daysToRender = daysToRender.filter(d => !existingIds.has(String(d._id)));
  }

  // Sort newest-first then build all cards (no layout thrash)
  const sorted = daysToRender.sort((a, b) => b.date.localeCompare(a.date));

  // Optimization: Fetch all achievements for these days in ONE batch request
  const dayIds = window.allDays.map(d => d._id).filter(id => !String(id).startsWith('temp_'));
  let batchAchievements = [];
  if (dayIds.length > 0) {
    if (window.localDb) {
      try {
        batchAchievements = await window.localDb.achievements.where('dayId').anyOf(dayIds).toArray();
      } catch (err) {
        console.warn('Batch achievements load from local cache failed. Falling back to server.');
        if (navigator.onLine) {
          try {
            batchAchievements = await window.apiFetch(`${window.API}/api/achievements/days-batch`, {
              method: 'POST',
              body: JSON.stringify({ dayIds })
            });
          } catch (apiErr) {
            console.warn('Fallback server achievements fetch failed:', apiErr);
          }
        }
      }
    } else if (navigator.onLine) {
      try {
        batchAchievements = await window.apiFetch(`${window.API}/api/achievements/days-batch`, {
          method: 'POST',
          body: JSON.stringify({ dayIds })
        });
      } catch (err) {
        console.warn('Batch achievements load from server failed:', err);
      }
    }
  }

  // ── ALL DOM MANIPULATION IS SYNCHRONOUS AND ATOMIC FROM HERE ON ──
  // This guarantees there is never a blank flash or disappearing cards on refresh/sync.

  // Remove existing Load More row if it exists
  const existingLoadMore = container.querySelector('.load-more-row');
  if (existingLoadMore) existingLoadMore.remove();

  if (!appendOnly) {
    container.innerHTML = '';
  }

  // ── "New Day Card" button always pinned at the top (only if not appending) ──────
  if (!appendOnly) {
    const addBtnRow = document.createElement('div');
    addBtnRow.className = 'add-day-inline-row';
    addBtnRow.innerHTML = `
      <button class="add-day-inline-btn ripple" onclick="openAddDayModal()" id="add-day-inline-btn">
        <span class="plus-icon">＋</span>
        <span>New Day Card</span>
      </button>
      <p class="streak-info-text" style="font-size: 11px; font-weight: 800; color: var(--text-muted); margin-top: 10px; text-align: center; text-transform: uppercase; letter-spacing: 0.5px;">
        <i data-lucide="flame" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px; color: var(--coral);"></i>
        Maintain your streak! Complete at least 1 task daily.
      </p>
`;
    container.appendChild(addBtnRow);
  }

  if (!window.allDays.length) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'empty-state';
    emptyEl.innerHTML = `
      <span class="empty-icon"><i data-lucide="calendar"></i></span>
      <h3>No days yet</h3>
      <p>Click the button above to start your first day card.</p>`;
    container.appendChild(emptyEl);
    if (window.gsap) {
      gsap.fromTo(emptyEl, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', clearProps: 'all' });
    }
    return;
  }

  const fragment = document.createDocumentFragment();
  const totalDaysCount = sorted.length;
  const baseCountForChrono = window.totalDaysCountInDb || window.allDays.length;
  const sortedAllDays = [...window.allDays].sort((a, b) => b.date.localeCompare(a.date));

  for (let i = 0; i < totalDaysCount; i++) {
    const day = sorted[i];
    const globalIndex = sortedAllDays.findIndex(d => d._id === day._id);
    const chronoIndex = globalIndex >= 0 ? (baseCountForChrono - globalIndex) : (baseCountForChrono - i);

    // Inject 30-Day or 7-Day AI Summary cards/generate-buttons chronologically in between daily cards
    if (chronoIndex > 0 && chronoIndex % 30 === 0) {
      const summary = window.allWeeklySummaries.find(s => s.date === day.date && s.daysCount === 30);
      if (summary) {
        const summaryCard = buildMonthlySummaryCard(summary);
        fragment.appendChild(summaryCard);
      } else {
        const generateBtnCard = buildMonthlySummaryButtonCard(day._id, day.date);
        fragment.appendChild(generateBtnCard);
      }
    } else if (chronoIndex > 0 && chronoIndex % 7 === 0) {
      const summary = window.allWeeklySummaries.find(s => s.date === day.date && (s.daysCount === 7 || !s.daysCount));
      if (summary) {
        const summaryCard = buildWeeklySummaryCard(summary);
        fragment.appendChild(summaryCard);
      } else {
        const generateBtnCard = buildWeeklySummaryButtonCard(day._id, day.date);
        fragment.appendChild(generateBtnCard);
      }
    }

    const dayAchs = (batchAchievements || []).filter(a => a.dayId === day._id);
    const card = buildDayCard(day, dayAchs);
    // Mark as new for animation if we are appending
    if (appendOnly) {
      card.classList.add('is-new-card');
    }
    fragment.appendChild(card);
  }
  container.appendChild(fragment);

  if (window.hasMoreDays) {
    const loadMoreRow = document.createElement('div');
    loadMoreRow.className = 'load-more-row';
    loadMoreRow.style.textAlign = 'center';
    loadMoreRow.style.marginTop = '20px';
    loadMoreRow.style.marginBottom = '40px';
    loadMoreRow.innerHTML = `
      <button class="btn-ghost ripple btn-load-more" onclick="loadMoreDays()" style="display:flex; align-items:center; gap:8px; margin:0 auto; padding:12px 24px;">
        <span>Load More Days</span>
        <i data-lucide="chevron-down"></i>
      </button>
    `;
    container.appendChild(loadMoreRow);
    if (window.lucide) lucide.createIcons({ root: loadMoreRow });
  }

  // ── Mobile-aware GSAP entrance ──────────────────────────
  // If appendOnly, we only animate the newly added cards
  const animTarget = appendOnly ? '.is-new-card, .weekly-summary-card, .weekly-summary-button-card' : '.day-card';
  
  if (window.gsap) {
    if (window.isMobile()) {
      gsap.from(animTarget, {
        opacity: 0,
        duration: 0.3,
        ease: 'power2.out',
        clearProps: 'opacity,transform',
        onComplete: () => {
          if (appendOnly) document.querySelectorAll('.is-new-card').forEach(el => el.classList.remove('is-new-card'));
        }
      });
    } else {
      gsap.from(animTarget, {
        opacity: 0,
        y: 30,
        duration: 0.5,
        stagger: 0.08,
        ease: 'power3.out',
        clearProps: 'opacity,transform,y',
        onComplete: () => {
          if (appendOnly) document.querySelectorAll('.is-new-card').forEach(el => el.classList.remove('is-new-card'));
        }
      });
    }
  }

  // Apply correct offline/online button state for all newly rendered network-dependent buttons
  updateOfflineButtonState();
  
  if (typeof evaluateDaysDistractions === 'function') {
    evaluateDaysDistractions();
  }
}

function isDayEditable(day) {
  if (!day) return false;
  const today = window.todayStr();
  const cardDateNormalized = (day.date || '').split('T')[0];
  const isToday = cardDateNormalized === today;
  const isFuture = cardDateNormalized > today;
  let isWithinWindow = false;
  if (cardDateNormalized < today) {
    const [y, m, d] = cardDateNormalized.split('-').map(Number);
    const cardStartLocal = new Date(y, m - 1, d, 0, 0, 0, 0);
    const diffHours = (new Date() - cardStartLocal) / (1000 * 60 * 60);
    isWithinWindow = diffHours <= 36;
  }
  return isToday || isFuture || isWithinWindow || !!day.graceApplied;
}

function buildDayCard(day, preLoadedAchievements = null) {
  const today   = window.todayStr();
  const cardDateNormalized = (day.date || '').split('T')[0];
  const isToday = cardDateNormalized === today;
  const isFuture = cardDateNormalized > today;
  let isWithinWindow = false;
  if (cardDateNormalized < today) {
    const [y, m, d] = cardDateNormalized.split('-').map(Number);
    const cardStartLocal = new Date(y, m - 1, d, 0, 0, 0, 0);
    const diffHours = (new Date() - cardStartLocal) / (1000 * 60 * 60);
    isWithinWindow = diffHours <= 36;
  }
  const isEditable = isDayEditable(day);
  const pct     = window.calcProgress(day.categories);

  const card = document.createElement('div');
  card.className = isToday ? 'day-card today-card' : 'day-card';
  card.id = `day-card-${day._id}`;
  card.setAttribute('data-date', cardDateNormalized);

  // Build categories HTML
  let categoriesHTML = '';
  for (const cat of day.categories) {
    let tasksHTML = '';
    const isLeetCode = cat.name === 'LeetCode';
    const isGoalCat = cat.name && cat.name.startsWith('🎯 Goal:');
    for (const task of cat.tasks) {
      if (isLeetCode) {
        tasksHTML += `
          <div class="task-item locked-complete leetcode-task-locked" style="opacity: 0.95;">
            <input type="checkbox" class="task-checkbox" checked disabled style="accent-color: var(--teal);" />
            <span class="task-title" style="font-weight: 600; color: var(--text);">${window.escHtml(task.title)}</span>
            <span class="lc-badge-pill" style="margin-left:auto; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:700; background:var(--bg-muted); border:1px solid var(--black); text-transform:uppercase;">${window.escHtml(task.metadata?.difficulty || 'Medium')}</span>
          </div>`;
      } else if (isGoalCat) {
        tasksHTML += `
          <div class="task-item locked-complete" style="opacity: 0.95;">
            <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} disabled style="accent-color: var(--emerald, #10b981);" />
            <span class="task-title" style="font-weight: 600; color: var(--text);">${window.escHtml(task.title)}</span>
            <span class="goal-task-lock-badge" style="margin-left:auto; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:700; background:rgba(16,185,129,0.12); color:#10b981; border:1px solid #10b981; text-transform:uppercase;">Goal Task</span>
          </div>`;
      } else if (isEditable) {
        if (isFuture) {
          tasksHTML += `
            <div class="task-item">
              <span class="task-title" style="padding-left: 0;">${window.escHtml(task.title)}</span>
              <button class="btn-del-task" onclick="deleteTask('${day._id}','${cat._id}','${task._id}')" title="Delete task"><i data-lucide="trash-2"></i></button>
            </div>`;
        } else {
          tasksHTML += `
            <div class="task-item">
              <input type="checkbox" class="task-checkbox"
                ${task.completed ? 'checked' : ''}
                onchange="toggleTask('${day._id}','${cat._id}','${task._id}',this.checked)"
                id="chk-${task._id}" />
              <label class="task-title" for="chk-${task._id}">${window.escHtml(task.title)}</label>
              <button class="btn-del-task" onclick="deleteTask('${day._id}','${cat._id}','${task._id}')" title="Delete task"><i data-lucide="trash-2"></i></button>
            </div>`;
        }
      } else {
        const lockClass = task.completed ? 'locked-complete' : 'locked-incomplete';
        tasksHTML += `
          <div class="task-item ${lockClass}">
            <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} disabled />
            <span class="task-title">${window.escHtml(task.title)}</span>
          </div>`;
      }
    }

    const completedCount = cat.tasks.filter(t => t.completed).length;
    const editCatBtn = (isEditable && !isLeetCode && !isGoalCat)
      ? `<button class="btn-edit-cat ripple" onclick="openEditCategoryModal('${day._id}','${cat._id}')" title="Edit category"><i data-lucide="edit-3"></i></button>`
      : '';
    const delCatBtn = (isEditable && !isLeetCode)
      ? `<button class="btn-del-cat" onclick="deleteCategory('${day._id}','${cat._id}')" title="Delete category"><i data-lucide="trash-2"></i></button>`
      : '';
    categoriesHTML += `
      <div class="category-block category-section" data-cat-id="${cat._id}">
        <div class="category-header">
          <span class="category-name">${window.escHtml(cat.name)}</span>
          <div class="category-header-right">
            <span class="category-count">${completedCount}/${cat.tasks.length}</span>
            ${editCatBtn}
            ${delCatBtn}
          </div>
        </div>
        <div class="tasks-list">${tasksHTML || '<p style="padding:8px 14px;font-size:13px;color:var(--text-3)">No tasks added.</p>'}</div>
      </div>`;
  }

  // Summary
  const summaryInner = isEditable
    ? `<textarea class="summary-edit" id="summary-edit-${day._id}" rows="3">${window.escHtml(day.summary || '')}</textarea>
       <button class="summary-save-btn ripple" onclick="saveSummary('${day._id}')"><i data-lucide="save"></i> Save Note</button>`
    : `<p class="summary-text">${window.escHtml(day.summary || '(no notes for this day)')}</p>`;

  // Add category button (today/graced only)
  const addCatBtn = isEditable
    ? `<div class="add-category-row"><button class="btn-add-cat ripple" onclick="openAddCategoryModal('${day._id}')"><i data-lucide="plus-circle"></i> Add Category</button></div>`
    : '';

  // Scratchpad section (small header button)
  let scratchpadHeaderBtnHTML = '';
  if (day.hasScratchpad) {
    scratchpadHeaderBtnHTML = `
      <button class="card-scratchpad-btn card-scratchpad-view ripple" onclick="openScratchpad('${day._id}')" title="View Scratchpad">
        <i data-lucide="palette"></i>
      </button>
    `;
  } else if (isEditable) {
    scratchpadHeaderBtnHTML = `
      <button class="card-scratchpad-btn card-scratchpad-create ripple" onclick="openScratchpad('${day._id}')" title="Add Scratchpad">
        <i data-lucide="paintbrush"></i>
      </button>
    `;
  }

  // AI Daily Recap Section HTML
  let aiRecapHTML = '';
  const daySummary = day.aiSummary || '';
  if (daySummary) {
    aiRecapHTML = `
      <div class="ai-recap-block" id="ai-recap-block-${day._id}" style="margin-top: 15px; padding: 14px; background: linear-gradient(135deg, rgba(34, 197, 94, 0.07) 0%, rgba(16, 185, 129, 0.07) 100%), var(--bg-muted); border: 2px solid var(--black); border-radius: 8px; box-shadow: 3px 3px 0 var(--black); font-size: 13px; line-height: 1.6; position: relative; cursor: pointer;" onclick="toggleAiRecapExpansion(this, event)">
        <div style="display: flex; align-items: center; gap: 6px; font-weight: 800; font-family: 'Space Grotesk', sans-serif; text-transform: uppercase; margin-bottom: 8px; font-size: 11px; letter-spacing: 0.5px;">
          <span>✨</span> <span>AI Daily Insights</span>
          <div style="display: flex; align-items: center; gap: 8px; margin-left: auto;" onclick="event.stopPropagation()">
            <button class="btn-refresh-recap" data-requires-network="true" onclick="generateDailySummary('${day._id}', '${cardDateNormalized}')" style="background: none; border: none; cursor: pointer; display: flex; align-items: center; color: var(--text-muted);" title="Regenerate Summary"><i data-lucide="refresh-cw" style="width: 13px; height: 13px;"></i></button>
            <button class="btn-delete-recap" data-requires-network="true" onclick="deleteDailySummary('${day._id}')" style="background: none; border: none; cursor: pointer; display: flex; align-items: center; color: var(--red);" title="Delete Summary"><i data-lucide="trash-2" style="width: 13px; height: 13px;"></i></button>
          </div>
        </div>
        <p class="ai-recap-text" id="ai-recap-text-${day._id}" style="color: var(--text); font-weight: 600; white-space: pre-wrap; margin: 0; display: -webkit-box; overflow: hidden; -webkit-line-clamp: 3; -webkit-box-orient: vertical;">${window.escHtml(daySummary)}</p>
      </div>
    `;
  } else {
    aiRecapHTML = `
      <div class="ai-recap-block empty-recap" id="ai-recap-block-${day._id}" style="display: none; margin-top: 0;"></div>
    `;
  }

  // Grace streak-protection control display
  let graceBadgeHTML = '';
  if (day.graceApplied) {
    graceBadgeHTML = `<span class="card-badge" style="background:#c3ffb3;color:#000;border:2px solid #000;box-shadow:1.5px 1.5px 0 #000;padding:2px 8px;font-size:10px;font-weight:900;text-transform:uppercase;border-radius:4px;display:inline-flex;align-items:center;gap:4px;height:24px;box-sizing:border-box;"><i data-lucide="shield-check" style="width:12px;height:12px;"></i> GRACED</span>`;
  } else if (!isToday && !isFuture) {
    const currentMonthPrefix = today.substring(0, 7);
    const cardMonthPrefix = cardDateNormalized.substring(0, 7);
    const isCurrentMonth = cardMonthPrefix === currentMonthPrefix;

    if (isCurrentMonth) {
      graceBadgeHTML = `
        <button class="btn-primary ripple" data-requires-network="true" onclick="applyGrace('${day._id}')" style="background:#ffb3d9;color:#000;border:2px solid #000;box-shadow:2px 2px 0 #000;padding:4px 10px;font-size:10px;font-weight:900;text-transform:uppercase;border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;height:24px;box-sizing:border-box;" title="Protect your streak with a Grace Day"><i data-lucide="shield-alert" style="width:12px;height:12px;"></i> Apply Grace</button>
        <span class="card-badge badge-past">Past</span>
      `;
    } else {
      graceBadgeHTML = `
        <span class="card-badge badge-past">Past</span>
      `;
    }
  } else {
    graceBadgeHTML = `<span class="card-badge ${isToday ? 'badge-today' : 'badge-future'}">${isToday ? '<i data-lucide="sparkles"></i> Today' : '<i data-lucide="clock"></i> Future'}</span>`;
  }

  let reminderBtnHTML = '';
  if (isEditable) {
    const hasReminder = day.reminder && day.reminder.enabled;
    reminderBtnHTML = `
      <button class="card-reminder-btn ripple" onclick="openReminderModal('${day._id}')" title="Set Reminder / Alarm" style="background: none; border: none; cursor: pointer; display: flex; align-items: center; color: ${hasReminder ? 'var(--pink)' : 'var(--text-muted)'}; margin-right: 4px;">
        <i data-lucide="${hasReminder ? 'bell-ring' : 'bell'}"></i>
      </button>
    `;
  }

  const totalTasks = (day.categories || []).reduce((acc, cat) => acc + (cat.tasks || []).length, 0);
  const dayAchsList = (preLoadedAchievements && preLoadedAchievements.length > 0)
    ? preLoadedAchievements
    : (window.allAchievements || []).filter(a => a.dayId === day._id);
  const isMilestoneOnlyDay = totalTasks === 0 && dayAchsList.length > 0;

  let progressSectionHTML = '';
  if (isMilestoneOnlyDay) {
    progressSectionHTML = `
      <div class="progress-section milestone-progress-section" style="padding: 4px 0 10px 0;">
        <div class="progress-meta" style="justify-content: flex-start;">
          <span class="milestone-day-badge" style="font-size: 11px; font-weight: 900; background: linear-gradient(135deg, #ec4899, #8b5cf6); color: #ffffff; padding: 4px 10px; border-radius: 6px; border: 2px solid var(--black); box-shadow: 2px 2px 0 var(--black); text-transform: uppercase; letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 6px;">
            <i data-lucide="trophy" style="width: 14px; height: 14px;"></i> Goal Milestone Day
          </span>
        </div>
      </div>
    `;
  } else {
    progressSectionHTML = `
      <div class="progress-section">
        <div class="progress-meta">
          <span class="progress-label">Progress</span>
          <span class="progress-pct" id="pct-text-${day._id}" style="color:${window.progressColor(pct)}">${pct}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${window.progressClass(pct)}" id="pct-fill-${day._id}" style="width:0%"></div>
        </div>
      </div>
    `;
  }

  card.innerHTML = `
    <div class="card-header">
      <div class="card-date-wrap">
        <span class="card-date">${window.formatDisplayDate(day.date)}</span>
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <span class="card-day-name">${window.getDayName(day.date)}</span>
          ${(!isToday && isWithinWindow) ? `<span class="editable-until-badge" style="font-size: 10px; font-weight: 800; color: var(--text-muted); opacity: 0.65; background: var(--bg-muted); padding: 1px 6px; border: 1.5px dashed var(--black); border-radius: 4px; text-transform: uppercase; font-family: 'Space Grotesk', sans-serif; white-space: nowrap;">Editable till 12 noon</span>` : ''}
        </div>
      </div>
      <div class="card-header-actions" style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
        ${reminderBtnHTML}
        ${scratchpadHeaderBtnHTML}
        ${graceBadgeHTML}
      </div>
    </div>

    ${progressSectionHTML}

    <div class="categories-list" id="cat-list-${day._id}">
      ${categoriesHTML || (isMilestoneOnlyDay ? '' : '<p style="color:var(--text-3);font-size:14px;padding:4px 0">No categories yet.</p>')}
    </div>

    ${addCatBtn}
    
    ${aiRecapHTML}

    <div style="display: flex; align-items: center; gap: 10px; margin-top: 15px; margin-left: 14px;">
      <button class="summary-toggle" id="summary-toggle-${day._id}" onclick="toggleSummary('${day._id}')" style="margin-top: 0; margin-left: 0; padding: 0 12px; font-size: 9px; font-weight: 700; height: 28px; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; text-transform: uppercase; letter-spacing: 0.3px;">
        <span style="display: inline-flex; align-items: center; margin-right: 4px;"><i data-lucide="file-text" style="width: 13px; height: 13px;"></i></span>
        <span>Notes</span>
        <span class="summary-chevron" style="display: inline-flex; align-items: center; margin-left: 4px;"><i data-lucide="chevron-down" style="width: 13px; height: 13px;"></i></span>
      </button>
      ${daySummary ? '' : `
        <button class="summary-toggle ripple" data-requires-network="true" onclick="generateDailySummary('${day._id}', '${cardDateNormalized}')" style="margin-top: 0; margin-left: 0; padding: 0 10px; font-size: 9px; font-weight: 700; height: 28px; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; text-transform: uppercase; letter-spacing: 0.3px; background: linear-gradient(135deg, rgba(167, 139, 250, 0.12) 0%, rgba(139, 92, 246, 0.12) 100%); color: var(--text); border-color: var(--black);" title="Generate AI Insights for today">
          <span>✨ AI Insights (<span class="ai-limit-badge">⚡ ${window.generationsLeft} left</span>)</span>
        </button>
      `}
    </div>
    <div class="summary-content" id="summary-content-${day._id}">
      <div class="summary-inner">${summaryInner}</div>
    </div>

    <!-- Always-visible Log Win and Save Template buttons -->
    <div class="ach-add-row">
      <div style="display:flex; gap:10px; align-items:center;">
        <button class="btn-add-ach ripple" onclick="openAddAchievementModal('${day._id}')"><i data-lucide="trophy"></i> Log a Acheivement</button>
        <span class="ach-no-progress-note">doesn't affect progress</span>
      </div>
      <div style="display:flex; gap:10px;">
        <button class="btn-add-leetcode ripple" onclick="openLeetCodeProblemModal('${day._id}','${day.date}')" title="Add LeetCode problem" id="leetcode-btn-${day._id}"><i data-lucide="target"></i> LeetCode</button>
        <button class="btn-save-template ripple" onclick="openSaveTemplateModal('${day._id}')"><i data-lucide="save"></i> Save Template</button>
      </div>
    </div>
  `;

  // Animate progress bar after card is inserted into DOM
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      animateProgressBar(`pct-fill-${day._id}`, pct);
    });
  });

  // Load achievements for this card (batch first)
  if (!String(day._id).startsWith('temp_')) {
    if (preLoadedAchievements && preLoadedAchievements.length > 0) {
      renderDayAchievements(day._id, preLoadedAchievements, card);
    }
  } else {
    renderDayAchievements(day._id, window.allAchievements.filter(a => a.dayId === day._id), card);
  }

  // Initialize Lucide icons after building the card content
  if (window.lucide) {
    setTimeout(() => {
      lucide.createIcons({ root: card });
    }, 10);
  }

  return card;
}

/** Animate progress fill using GSAP or CSS transition */
function animateProgressBar(fillId, targetPct) {
  const fill = document.getElementById(fillId);
  if (!fill) return;
  if (window.gsap) {
    gsap.fromTo(fill, { width: '0%' }, { width: `${targetPct}%`, duration: 0.9, ease: 'power2.out' });
  } else {
    fill.style.width = `${targetPct}%`;
  }
}

async function toggleTask(dayId, catId, taskId, checked) {
  if (window.checkEmailVerificationBlocked && window.checkEmailVerificationBlocked()) {
    const chk = document.getElementById(`chk-${taskId}`);
    if (chk) chk.checked = !checked;
    return;
  }
  let day = window.allDays.find(d => d._id === dayId);
  if (day) {
    const cardDateNormalized = (day.date || '').split('T')[0];
    if (cardDateNormalized > window.todayStr()) {
      console.warn('Cannot complete tasks on future daily cards');
      const chk = document.getElementById(`chk-${taskId}`);
      if (chk) chk.checked = !checked;
      return;
    }
  }
  let cat, task;

  if (day) {
    cat = day.categories.find(c => c._id === catId);
    if (cat) {
      if (cat.name && cat.name.startsWith('🎯 Goal:')) {
        console.warn('Cannot toggle goal tasks on daily cards');
        const chk = document.getElementById(`chk-${taskId}`);
        if (chk) chk.checked = !checked;
        window.showToast('Goal tasks on Daily Cards are locked snapshots.', 'warn');
        return;
      }
      task = cat.tasks.find(t => t._id === taskId);
    }
  }

  // Fallback: If not found by ID (e.g., temporary IDs were transitioned to server MongoDB IDs in memory, but DOM still has temp IDs)
  if (!day || !cat || !task) {
    // 1. Locate the correct day by matching card's date
    const cardEl = document.getElementById(`day-card-${dayId}`);
    if (cardEl) {
      const cardDate = cardEl.getAttribute('data-date');
      if (cardDate) {
        day = window.allDays.find(d => {
          const dDate = (d.date || '').split('T')[0];
          return dDate === cardDate;
        });
      }
    }

    if (day) {
      // 2. Locate the correct category by index in the DOM card
      const cardEl = document.getElementById(`day-card-${dayId}`);
      if (cardEl) {
        const catBlocks = Array.from(cardEl.querySelectorAll('.category-block'));
        const catIndex = catBlocks.findIndex(el => el.getAttribute('data-cat-id') === catId);
        if (catIndex !== -1 && catIndex < day.categories.length) {
          cat = day.categories[catIndex];
          
          // 3. Locate the correct task by index in the category block
          if (cat) {
            const catBlock = catBlocks[catIndex];
            const checkboxes = Array.from(catBlock.querySelectorAll('.task-checkbox'));
            const taskIndex = checkboxes.findIndex(chk => chk.id === `chk-${taskId}`);
            if (taskIndex !== -1 && taskIndex < cat.tasks.length) {
              task = cat.tasks[taskIndex];
            }
          }
        }
      }

      // Secondary fallback: match category by name and task by title if index matching failed
      if (!cat) {
        const cardEl = document.getElementById(`day-card-${dayId}`);
        if (cardEl) {
          const catBlock = cardEl.querySelector(`[data-cat-id="${catId}"]`);
          if (catBlock) {
            const catNameEl = catBlock.querySelector('.category-name');
            if (catNameEl) {
              const catName = catNameEl.textContent.trim().toLowerCase();
              cat = day.categories.find(c => (c.name || '').trim().toLowerCase() === catName);
            }
          }
        }
      }

      if (cat && !task) {
        const chkEl = document.getElementById(`chk-${taskId}`);
        if (chkEl) {
          const labelEl = chkEl.nextElementSibling;
          if (labelEl && labelEl.classList.contains('task-title')) {
            const taskTitle = labelEl.textContent.trim().toLowerCase();
            task = cat.tasks.find(t => (t.title || '').trim().toLowerCase() === taskTitle);
          }
        }
      }
    }
  }

  // If even with fallbacks we cannot locate the day/cat/task, exit early
  if (!day || !cat || !task) {
    console.warn('Unable to toggle task: element not found in memory/fallbacks', { dayId, catId, taskId });
    return;
  }

  task.completed = checked;

  // Satisfying tactile vibration feedback (natively supported on Android WebViews via navigator.vibrate)
  try {
    if (navigator.vibrate) {
      navigator.vibrate(15); // Crisp 15ms haptic vibration tick
    } else if (window.Capacitor && window.Capacitor.isPluginAvailable('Haptics')) {
      window.Capacitor.Plugins.Haptics.impact({ style: 'LIGHT' });
    }
  } catch (vibrateErr) {
    // Ignore vibration errors silently
  }

  // Use the ID that actually corresponds to elements currently in the DOM
  const targetDomId = document.getElementById(`pct-fill-${dayId}`) ? dayId : day._id;
  updateProgressBar(targetDomId, day.categories);

  // Micro animation on checkbox
  if (window.gsap && checked) {
    const chk = document.getElementById(`chk-${taskId}`);
    if (chk) {
      // 1. Tactile checkbox snap back bounce
      gsap.fromTo(chk, { scale: 1.35 }, { scale: 1, duration: 0.3, ease: 'back.out(2)' });

      // 2. Elastic spring row expansion bounce
      const taskItem = chk.closest('.task-item');
      if (taskItem) {
        gsap.fromTo(taskItem, 
          { scale: 0.96, transformOrigin: 'left center' }, 
          { scale: 1, duration: 0.45, ease: 'elastic.out(1.2, 0.4)', clearProps: 'transform,transformOrigin' }
        );
      }

      // 3. Erupt outlined Neo-Brutalist Confetti
      const rect = chk.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      triggerNeoConfetti(x, y);
    }
  }

  try {
    // 1. Update Local DB immediately
    day.lastLocalEdit = Date.now();
    await window.localDb.days.put(day);
    
    // 2. Add to Sync Queue (using the resolved real ID)
    window.syncManager.addToQueue('PUT', 'days', day._id, { categories: day.categories });
    
    updateStreak();
    
    // Update offline cache for today's status if modified card is today's card
    updateTodayCacheIfMatches(day);
  } catch (err) {
    console.error('Offline write error:', err);
    // Even if local write fails, we try to keep going
  }
}

// [Phase 3 Migrated: Lines 774-929 moved to api.js]

// [Phase 3 Migrated: Lines 931-969 moved to api.js]

// ── Delete Day Card Completely ──────────────────────────────
async function deleteDayCard(dayId) {
  if (window.checkEmailVerificationBlocked && window.checkEmailVerificationBlocked()) {
    return;
  }
  const day = window.allDays.find(d => d._id === dayId);
  if (day) {
    const today = window.todayStr();
    const cardDate = (day.date || '').split('T')[0];
    if (cardDate === today) {
      updateTodayStatusCache(today, false, []);
    }
  }
  
  // 1. Memory update
  window.allDays = window.allDays.filter(d => d._id !== dayId);

  // 2. DOM Animation and removal
  const cardEl = document.getElementById(`day-card-${dayId}`);
  if (cardEl) {
    if (window.gsap) {
      gsap.to(cardEl, {
        opacity: 0,
        height: 0,
        scale: 0.9,
        marginBottom: 0,
        paddingTop: 0,
        paddingBottom: 0,
        marginTop: 0,
        duration: 0.35,
        ease: 'power2.inOut',
        onComplete: () => {
          cardEl.remove();
          if (window.allDays.length === 0) renderDays();
        }
      });
    } else {
      cardEl.remove();
      if (window.allDays.length === 0) renderDays();
    }
  }

  try {
    // 3. Local IndexedDB deletion
    await window.localDb.days.delete(dayId);
    
    if (window.localDb && window.localDb.scratchpads) {
      await window.localDb.scratchpads.delete(dayId);
    }

    // 4. Sync / Offline Queue Logic
    if (String(dayId).startsWith('temp_')) {
      // If it is a local-only offline day card, clear all queued operations for it.
      const pendingItems = await window.localDb.syncQueue
        .filter(x => x.entity === 'days' && (x.localId === dayId || x.targetId === dayId))
        .toArray();
      
      for (const item of pendingItems) {
        await window.localDb.syncQueue.delete(item.id);
      }
      console.log('Cleaned up sync queue for offline temp day:', dayId);
    } else {
      // If it is an existing server-synced day card, clear any pending PUTs/POSTs for this day card
      const pendingItems = await window.localDb.syncQueue
        .filter(x => x.entity === 'days' && x.targetId === dayId)
        .toArray();
      
      for (const item of pendingItems) {
        await window.localDb.syncQueue.delete(item.id);
      }

      // Add a DELETE action to the sync queue
      window.syncManager.addToQueue('DELETE', 'days', dayId);
    }

    // 5. Update Streak and notifications
    updateStreak();
    window.showToast('Day card deleted completely', 'success');
  } catch (err) {
    console.error('Error deleting day card:', err);
    window.showToast('Failed to delete card completely', 'error');
  }
}

// ── Delete category ────────────────────────────────────────
async function deleteCategory(dayId, catId) {
  const day = window.allDays.find(d => d._id === dayId);
  if (!day) return;

  // Check if day card is editable (today, future, grace window)
  if (!isDayEditable(day)) {
    window.showToast('Cannot modify locked past days', 'error');
    return;
  }

  const catIndex = day.categories.findIndex(c => c._id === catId);
  if (catIndex < 0) return;

  const catName = day.categories[catIndex].name;
  const isGoalCat = catName && catName.startsWith('🎯 Goal:');
  const confirmMsg = isGoalCat
    ? `Remove "${catName}" from today's Daily Card?\n\n(Note: Your Goal in Goals tab and Achievement in Wins tab will remain completely safe.)`
    : `Delete the "${catName}" category and all its tasks?`;

  if (!confirm(confirmMsg)) return;

  // 1. Update UI and Local DB instantly
  day.categories.splice(catIndex, 1);

  if (day.categories.length === 0) {
    // If no categories left, delete the card completely!
    await deleteDayCard(dayId);
    return;
  }

  updateProgressBar(dayId, day.categories);
  day.lastLocalEdit = Date.now();
  await window.localDb.days.put(day);

  // 2. Queue for sync
  window.syncManager.addToQueue('PUT', 'days', dayId, { categories: day.categories });

  // Re-render only this card
  const cardEl = document.getElementById(`day-card-${dayId}`);
  if (cardEl) cardEl.replaceWith(buildDayCard(day));
  window.showToast(`"${catName}" deleted locally`, 'success');
}

// ── Delete individual task ──────────────────────────────────
async function deleteTask(dayId, catId, taskId) {
  const day = window.allDays.find(d => d._id === dayId);
  if (!day) return;

  // Check if day card is editable (today, future, grace window)
  if (!isDayEditable(day)) {
    window.showToast('Cannot modify locked past days', 'error');
    return;
  }

  const cat = day.categories.find(c => c._id === catId);
  if (!cat) return;
  const taskIndex = cat.tasks.findIndex(t => t._id === taskId);
  if (taskIndex < 0) return;

  const taskTitle = cat.tasks[taskIndex].title;
  if (!confirm(`Delete task "${taskTitle}"?`)) return;

  // 1. Update UI and Local DB instantly
  cat.tasks.splice(taskIndex, 1);
  updateProgressBar(dayId, day.categories);
  day.lastLocalEdit = Date.now();
  await window.localDb.days.put(day);

  // 2. Queue for sync
  window.syncManager.addToQueue('PUT', 'days', dayId, { categories: day.categories });

  // Update today cache if matches today's card
  updateTodayCacheIfMatches(day);

  const cardEl = document.getElementById(`day-card-${dayId}`);
  if (cardEl) cardEl.replaceWith(buildDayCard(day));
  window.showToast('Task deleted locally', 'success');
}

function updateProgressBar(dayId, categories) {
  const pct  = window.calcProgress(categories);
  const fill = document.getElementById(`pct-fill-${dayId}`);
  const text = document.getElementById(`pct-text-${dayId}`);
  if (fill) {
    if (window.gsap) {
      gsap.to(fill, { width: `${pct}%`, duration: 0.5, ease: 'power2.out' });
    } else {
      fill.style.width = `${pct}%`;
    }
    fill.className = `progress-fill ${window.progressClass(pct)}`;
  }
  if (text) {
    text.textContent = `${pct}%`;
    text.style.color  = window.progressColor(pct);
    if (window.gsap) gsap.fromTo(text, { scale: 1.15 }, { scale: 1, duration: 0.25, ease: 'back.out(2)' });
  }
}

function toggleSummary(dayId) {
  const toggle  = document.getElementById(`summary-toggle-${dayId}`);
  const content = document.getElementById(`summary-content-${dayId}`);
  toggle.classList.toggle('expanded');
  content.classList.toggle('expanded');
}

async function saveSummary(dayId) {
  const textarea = document.getElementById(`summary-edit-${dayId}`);
  if (!textarea) return;
  const summary = textarea.value.trim();
  const day = window.allDays.find(d => d._id === dayId);
  if (day) {
    day.summary = summary;
    day.lastLocalEdit = Date.now();
  }

  try {
    // 1. Update Local
    await window.localDb.days.put(day);
    // 2. Queue Sync
    window.syncManager.addToQueue('PUT', 'days', dayId, { summary });
    window.showToast('Notes saved locally!', 'success');
  } catch (err) {
    console.error('Offline save error:', err);
  }
}

/* ============================================================
   BADGE LOGIC (User Side)
   ============================================================ */
let userClaimedBadges = [];
let allAvailableBadges = [];

async function loadClaimedBadges() {
  // 1. STALE: Load from cache
  try {
    const cached = await window.localDb.badges.toArray();
    if (cached.length > 0) {
      userClaimedBadges = cached;
      renderClaimedBadges();
    }
  } catch (e) {}

  // 2. REVALIDATE: Fetch fresh (Only if online)
  if (!navigator.onLine) return;

  try {
    const badges = await window.apiFetch(`${window.API}/api/users/badges/claimed`);
    if (badges) {
      userClaimedBadges = badges;
      await window.localDb.badges.clear();
      const validBadges = (badges || []).filter(b => b && typeof b === 'object' && b._id);
      await window.localDb.badges.bulkPut(validBadges);
      renderClaimedBadges();
    }
  } catch (err) {
    console.warn('Background badges refresh failed:', err);
  }
}

function renderClaimedBadges() {
  const container = document.getElementById('claimed-badges-container');
  const noMsg = document.getElementById('no-badges-msg');
  if (!container) return;

  container.innerHTML = '';
  if (userClaimedBadges.length === 0) {
    if (noMsg) noMsg.style.display = 'block';
    return;
  }

  if (noMsg) noMsg.style.display = 'none';

  userClaimedBadges.forEach(b => {
    const badgeEl = document.createElement('div');
    badgeEl.style.cssText = `
      width: 60px; 
      height: 60px; 
      border: 2px solid var(--black); 
      background: var(--bg-card); 
      border-radius: 8px; 
      box-shadow: 3px 3px 0 var(--black); 
      overflow: hidden; 
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    badgeEl.title = `${b.name} (${b.requiredDays} Days)`;
    badgeEl.innerHTML = `<img src="${b.image}" style="width: 100%; height: 100%; object-fit: contain;">`;
    
    badgeEl.onclick = () => {
      openLightbox(b.image);
      window.showToast(`<strong>${b.name}</strong><br>${b.requiredDays} Day Streak Badge`, 'info');
    };

    container.appendChild(badgeEl);
  });
}

async function openBadgesModal() {
  openModal('modal-badges');
  await loadAllBadges();
}

async function loadAllBadges() {
  const grid = document.getElementById('all-badges-grid');
  grid.innerHTML = '<p style="text-align:center; grid-column: 1/-1;">Loading available badges...</p>';
  
  try {
    const badges = await window.apiFetch(`${window.API}/api/users/badges/all`);
    allAvailableBadges = badges;
    renderAllBadges();
  } catch (err) {
    console.error('Error loading all badges:', err);
    grid.innerHTML = '<p style="text-align:center; color: red; grid-column: 1/-1;">Failed to load badges.</p>';
  }
}

function renderAllBadges() {
  const grid = document.getElementById('all-badges-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const highestStreak = window.backendStreak; // Using window.backendStreak which is synced

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  allAvailableBadges.forEach(b => {
    const isClaimed = userClaimedBadges.some(cb => cb._id === b._id);
    const isEligible = highestStreak >= b.requiredDays;
    
    // Theme-aware backgrounds
    const cardBg = isClaimed 
      ? (isDark ? 'rgba(34, 197, 94, 0.15)' : '#f0fdf4') 
      : (isEligible ? 'var(--bg-card)' : (isDark ? 'rgba(255,255,255,0.05)' : '#f9fafb'));
    const borderCol = isClaimed ? (isDark ? '#22c55e' : 'var(--black)') : 'var(--black)';

    const card = document.createElement('div');
    card.style.cssText = `
      padding: 16px; 
      border: 3px solid ${borderCol}; 
      background: ${cardBg}; 
      border-radius: 12px; 
      box-shadow: 4px 4px 0 var(--black); 
      display: flex; 
      flex-direction: column; 
      align-items: center; 
      text-align: center;
      transition: all 0.2s;
    `;

    card.innerHTML = `
      <div style="width: 80px; height: 80px; border: 2px solid var(--black); border-radius: 8px; overflow: hidden; background: var(--bg-input); margin-bottom: 12px; box-shadow: 2px 2px 0 var(--black); cursor: pointer;" onclick="openLightbox('${b.image}')">
        <img src="${b.image}" style="width: 100%; height: 100%; object-fit: contain;">
      </div>
      <h4 style="font-size: 14px; font-weight: 800; margin-bottom: 4px; line-height: 1.2; color: var(--text);">${b.name}</h4>
      <div style="font-size: 11px; font-weight: 900; color: var(--text-muted); margin-bottom: 15px;">${b.requiredDays} DAYS STREAK</div>
      
      ${isClaimed ? `
        <div style="background: #22c55e; color: #fff; padding: 6px 12px; border-radius: 6px; border: 2px solid #000; font-size: 11px; font-weight: 900; text-transform: uppercase;">
          <i data-lucide="check"></i> Claimed
        </div>
      ` : (isEligible ? `
        <button class="btn-primary ripple" style="padding: 6px 16px; font-size: 12px; background: #a855f7; width: 100%; justify-content: center; box-shadow: 2px 2px 0 #000;" onclick="claimBadge('${b._id}')">
          Claim Now
        </button>
      ` : `
        <div style="background: #94a3b8; color: #fff; padding: 6px 12px; border-radius: 6px; border: 2px solid #000; font-size: 11px; font-weight: 900; text-transform: uppercase;">
          Locked
        </div>
      `)}
    `;

    grid.appendChild(card);
  });

  if (window.lucide) lucide.createIcons({ root: grid });
}

async function claimBadge(badgeId) {
  try {
    const res = await window.apiFetch(`${window.API}/api/users/badges/claim/${badgeId}`, {
      method: 'POST'
    });
    
    if (res.message) {
      window.showToast(res.message, 'success');
      // Refresh both lists
      await loadClaimedBadges();
      renderAllBadges();
      
      // Success animation on the profile section
      if (window.gsap) {
        gsap.from('#claimed-badges-container', { scale: 0.9, duration: 0.5, ease: 'back.out' });
      }
    }
  } catch (err) {
    window.showToast(err.message || 'Failed to claim badge', 'error');
  }
}

// ── Add Day Modal ──────────────────────────────────────────
window.categoryCount = 0;

function validateAddDayForm() {
  const btn = document.getElementById('submit-day-btn');
  if (!btn) return;
  
  const catItems = document.querySelectorAll('.category-builder-item');
  let hasValidCategoryAndTask = false;
  
  for (const item of catItems) {
    const nameInput = item.querySelector('input[type="text"]');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) continue;
    
    const taskInputs = item.querySelectorAll('.task-input-row input');
    for (const inp of taskInputs) {
      const title = inp.value.trim();
      if (title) {
        hasValidCategoryAndTask = true;
        break;
      }
    }
    if (hasValidCategoryAndTask) break;
  }
  
  btn.disabled = !hasValidCategoryAndTask;
}
window.validateAddDayForm = validateAddDayForm;

function openAddDayModal() {
  document.getElementById('day-date-input').value    = window.todayStr();
  document.getElementById('day-summary-input').value = '';
  const builder = document.getElementById('categories-builder');
  builder.innerHTML = '';
  window.categoryCount = 0;
  addCategoryField();
  openModal('modal-add-day');
  
  if (builder && !builder.hasAddDayValidationListener) {
    builder.addEventListener('input', validateAddDayForm);
    builder.hasAddDayValidationListener = true;
  }
  validateAddDayForm();

  // Fetch photo and voice limit credits remaining and update button texts
  (async () => {
    try {
      const scanBtn = document.getElementById('scan-list-btn');
      if (scanBtn) {
        if (!navigator.onLine) {
          scanBtn.innerHTML = `
            <span style="display:flex;align-items:center;gap:7px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
              <span style="font-weight:800;">Scan List from Photo</span>
            </span>
            <span style="display:inline-flex;align-items:center;font-size:10px;font-weight:900;background:#1a0008;color:#ffb3d9;padding:2px 10px;border-radius:3px;letter-spacing:0.5px;white-space:nowrap;text-transform:uppercase;">Offline</span>
          `;
          scanBtn.style.flexDirection = 'column';
          scanBtn.style.gap = '4px';
          scanBtn.disabled = true;
        } else {
          scanBtn.disabled = false;
          const res = await window.apiFetch(`${window.API}/api/ai/photo-limits`);
          if (res && typeof res.generationsLeft !== 'undefined') {
            window.photoGenerationsLeft = res.generationsLeft;
            window.photoLimit = res.limit;
            updateScanButtonText();
          }
        }
      }
    } catch (err) {
      console.warn('Failed to fetch photo limit credits:', err);
    }

    try {
      const voiceBtn = document.getElementById('voice-record-btn');
      if (voiceBtn) {
        if (!navigator.onLine) {
          voiceBtn.innerHTML = `
            <span style="display:flex;align-items:center;gap:7px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
              <span style="font-weight:800;">Voice-to-Daily-Task</span>
            </span>
            <span style="display:inline-flex;align-items:center;font-size:10px;font-weight:900;background:var(--black);color:#ff6b6b;padding:2px 10px;border-radius:3px;letter-spacing:0.5px;white-space:nowrap;text-transform:uppercase;">Offline</span>
          `;
          voiceBtn.style.flexDirection = 'column';
          voiceBtn.style.gap = '4px';
          voiceBtn.disabled = true;
        } else {
          voiceBtn.disabled = false;
          const vRes = await window.apiFetch(`${window.API}/api/ai/voice-limits`);
          if (vRes && typeof vRes.generationsLeft !== 'undefined') {
            window.voiceGenerationsLeft = vRes.generationsLeft;
            window.voiceLimit = vRes.limit;
            updateVoiceButtonText();
          }
        }
      }
    } catch (err) {
      console.warn('Failed to fetch voice limit credits:', err);
    }
  })();
}

function addCategoryField() {
  const idx = window.categoryCount++;
  const builder = document.getElementById('categories-builder');
  const item = document.createElement('div');
  item.className = 'category-builder-item';
  item.id = `cat-build-${idx}`;
  item.innerHTML = `
    <div class="cat-top-row">
      <input type="text" class="form-control" placeholder="Category name (e.g. Work, Fitness...)" id="cat-name-${idx}" />
      <button class="btn-remove" onclick="removeCategoryField(${idx})" title="Remove"><i data-lucide="trash-2"></i></button>
    </div>
    <div class="tasks-builder" id="tasks-build-${idx}"></div>
    <button class="btn-ghost ripple" style="font-size:12px;padding:6px 12px;border-radius:8px;" onclick="addTaskField(${idx})"><i data-lucide="plus"></i> Add Task</button>
  `;
  builder.appendChild(item);
  if (window.lucide) lucide.createIcons({ root: item });
  addTaskField(idx);
}

function removeCategoryField(idx) {
  const el = document.getElementById(`cat-build-${idx}`);
  if (!el) return;
  if (window.gsap) {
    gsap.to(el, { 
      opacity: 0, 
      height: 0, 
      marginBottom: 0, 
      duration: 0.2, 
      ease: 'power2.in', 
      onComplete: () => { 
        el.remove(); 
        validateAddDayForm(); 
      } 
    });
  } else {
    el.remove();
    validateAddDayForm();
  }
}

function addTaskField(catIdx) {
  const builder = document.getElementById(`tasks-build-${catIdx}`);
  const row = document.createElement('div');
  row.className = 'task-input-row';
  row.innerHTML = `
    <input type="text" class="form-control" placeholder="Task title..." />
    <button class="btn-remove" onclick="this.parentElement.remove(); if (window.validateAddDayForm) window.validateAddDayForm();" title="Remove"><i data-lucide="trash-2"></i></button>
  `;
  builder.appendChild(row);
  if (window.lucide) lucide.createIcons({ root: row });
  validateAddDayForm();
}

async function submitAddDay() {
  if (window.checkEmailVerificationBlocked && window.checkEmailVerificationBlocked()) {
    return;
  }
  const date    = document.getElementById('day-date-input').value.trim();
  const summary = document.getElementById('day-summary-input').value.trim();
  if (!date) { window.showToast('Please select a date.', 'warn'); return; }

  const btn = document.getElementById('submit-day-btn');
  btn.disabled = true;
  btn.textContent = 'Checking...';

  // ── Duplicity Guard: Bulletproof Normalized Check ──
  try {
    if (window.localDb) {
      const allLocal = await window.localDb.days.toArray();
      const normalizedInput = date.split('T')[0];
      
      const duplicate = allLocal.find(d => {
        const dDate = (d.date || "").split('T')[0];
        return dDate === normalizedInput;
      });

      if (duplicate) {
        window.showToast(`A card for ${window.formatDisplayDate(normalizedInput)} already exists!`, 'warn');
        btn.disabled = false;
        btn.textContent = 'Create Card';
        return;
      }
    }

    // Secondary Check: In-memory state
    const existsInMem = window.allDays.find(d => (d.date || "").split('T')[0] === date.split('T')[0]);
    if (existsInMem) {
      window.showToast(`A card for this date is already on your screen!`, 'warn');
      btn.disabled = false;
      btn.textContent = 'Create Card';
      return;
    }
  } catch (err) { console.error('Validation error:', err); }

  const catItems = document.querySelectorAll('.category-builder-item');
  const categories = [];
  let catIndex = 0;
  for (const item of catItems) {
    const nameInput = item.querySelector('input[type="text"]');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) continue;
    const taskInputs = item.querySelectorAll('.task-input-row input');
    const tasks = [];
    let taskIndex = 0;
    for (const inp of taskInputs) {
      const title = inp.value.trim();
      if (title) {
        tasks.push({
          _id: `temp_task_${Date.now()}_${catIndex}_${taskIndex++}_${Math.random().toString(36).substring(2, 6)}`,
          title,
          completed: false
        });
      }
    }
    if (tasks.length) {
      categories.push({
        _id: `temp_cat_${Date.now()}_${catIndex++}_${Math.random().toString(36).substring(2, 6)}`,
        name,
        tasks
      });
    }
  }

  if (categories.length === 0) {
    window.showToast('Please add at least one category and one task.', 'warn');
    btn.disabled = false;
    btn.textContent = 'Create Card';
    return;
  }

  btn.textContent = 'Creating...';
  const tempId = `temp_${Date.now()}`;
  const localDay = { _id: tempId, date, categories, summary, aiSummary: '', userId: localStorage.getItem('userId'), tasks: [] };

  try {
    // 1. Update UI and Local DB instantly (Optimistic)
    window.allDays.push(localDay);
    window.totalDaysCountInDb++;
    await window.localDb.days.add(localDay);
    closeModal('modal-add-day');
    renderDays();

    // 2. Queue for sync
    window.syncManager.addToQueue('POST', 'days', null, { date, categories, summary, aiSummary: '' }, tempId);

    // Update today cache if it is today's card
    const today = window.todayStr();
    if (date.split('T')[0] === today) {
      const pendingTasks = [];
      categories.forEach(cat => {
        cat.tasks.forEach(t => {
          if (!t.completed) pendingTasks.push(t.title);
        });
      });
      updateTodayStatusCache(today, true, pendingTasks);
    }

    // Reset button
    btn.disabled = false;
    btn.textContent = 'Create Card';
    
    // UI Animation for mobile
    if (window.isMobile()) {
      const container = document.getElementById('cards-container');
      const emptyState = container.querySelector('.empty-state');
      if (emptyState) emptyState.remove();

      const newCard = buildDayCard(localDay);
      newCard.style.opacity = '0';
      const addRow = container.querySelector('.add-day-inline-row');
      if (addRow && addRow.nextSibling) {
        container.insertBefore(newCard, addRow.nextSibling);
      } else {
        container.appendChild(newCard);
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          newCard.style.transition = 'opacity 0.25s ease';
          newCard.style.opacity = '1';
          setTimeout(() => { newCard.style.transition = ''; newCard.style.opacity = ''; }, 300);
        });
      });
    }
    window.showToast('Day card created!', 'success');
  } catch (err) {
    console.error('Failed to create card:', err);
    window.showToast('Failed to create card locally.', 'error');
    btn.disabled = false;
    btn.textContent = 'Create Card';
  }
}
// ── Add Category to existing day ───────────────────────────
function openAddCategoryModal(dayId) {
  window.activeDayIdForCategory = dayId;
  document.getElementById('new-cat-name').value = '';
  document.getElementById('new-cat-tasks-builder').innerHTML = '';
  addNewCatTaskField();
  openModal('modal-add-category');
}

function addNewCatTaskField() {
  const builder = document.getElementById('new-cat-tasks-builder');
  const row = document.createElement('div');
  row.className = 'task-input-row';
  row.innerHTML = `
    <input type="text" class="form-control" placeholder="Task title..." />
    <button class="btn-remove" onclick="this.parentElement.remove()" title="Remove"><i data-lucide="trash-2"></i></button>
  `;
  builder.appendChild(row);
  if (window.lucide) lucide.createIcons({ root: row });
}

async function submitAddCategory() {
  if (window.checkEmailVerificationBlocked && window.checkEmailVerificationBlocked()) {
    return;
  }
  const dayId   = window.activeDayIdForCategory;
  const catName = document.getElementById('new-cat-name').value.trim();
  if (!catName) { window.showToast('Category name is required.', 'warn'); return; }

  const taskInputs = document.querySelectorAll('#new-cat-tasks-builder .task-input-row input');
  const tasks = [];
  for (const inp of taskInputs) {
    const title = inp.value.trim();
    if (title) tasks.push({ title, completed: false });
  }

  const btn = document.getElementById('submit-cat-btn');
  btn.disabled = true; btn.textContent = 'Adding...';

  const day = window.allDays.find(d => d._id === dayId);
  if (!day) return;
  // Give temp IDs to the new category and tasks for local UI
  const tempCatId = `temp_cat_${Date.now()}`;
  const updatedCategories = [...day.categories, { _id: tempCatId, name: catName, tasks: tasks.map(t => ({...t, _id: `temp_task_${Math.random()}`})) }];
  day.categories = updatedCategories;

  try {
    // 1. Update Local
    day.lastLocalEdit = Date.now();
    await window.localDb.days.put(day);
    // 2. Queue Sync
    window.syncManager.addToQueue('PUT', 'days', dayId, { categories: updatedCategories });

    // Update today cache
    updateTodayCacheIfMatches(day);

    closeModal('modal-add-category');
    const oldCard = document.getElementById(`day-card-${dayId}`);
    if (oldCard) {
      const newCard = buildDayCard(day);
      if (window.gsap) gsap.set(newCard, { opacity: 0, y: 10 });
      oldCard.replaceWith(newCard);
      if (window.gsap) gsap.to(newCard, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', clearProps: 'all' });
      requestAnimationFrame(() => requestAnimationFrame(() => animateProgressBar(`pct-fill-${dayId}`, window.calcProgress(day.categories))));
    }
    window.showToast('Category added locally!', 'success');
  } catch (err) {
    console.error('Offline category add error:', err);
  } finally {
    btn.disabled = false; btn.textContent = 'Add Category';
  }
}

// ── Edit Category (today's card only) ────────────────────
function openEditCategoryModal(dayId, catId) {
  const day = window.allDays.find(d => d._id === dayId);
  if (!day || !isDayEditable(day)) {
    window.showToast('You can only edit editable cards.', 'warn');
    return;
  }
  const cat = day.categories.find(c => c._id === catId);
  if (!cat) return;
  if (cat.name && cat.name.startsWith('🎯 Goal:')) {
    window.showToast('Goal categories on Daily Cards are locked snapshots and cannot be edited.', 'warn');
    return;
  }

  window.editingDayId = dayId;
  window.editingCatId = catId;

  document.getElementById('edit-cat-name').value = cat.name;
  const builder = document.getElementById('edit-cat-tasks-builder');
  builder.innerHTML = '';
  for (const task of cat.tasks) {
    addEditCatTaskField(task.title, task._id, task.completed);
  }
  if (!cat.tasks.length) addEditCatTaskField();
  openModal('modal-edit-category');
}

function addEditCatTaskField(title = '', taskId = '', completed = false) {
  const builder = document.getElementById('edit-cat-tasks-builder');
  const row = document.createElement('div');
  row.className = 'task-input-row';
  row.dataset.taskId   = taskId;
  row.dataset.completed = completed ? 'true' : 'false';
  row.innerHTML = `
    <input type="text" class="form-control" placeholder="Task title..." value="${window.escHtml(title)}" />
    <button class="btn-remove" onclick="this.parentElement.remove()" title="Remove"><i data-lucide="trash-2"></i></button>
  `;
  builder.appendChild(row);
  if (window.lucide) lucide.createIcons({ root: row });
}

async function submitEditCategory() {
  if (window.checkEmailVerificationBlocked && window.checkEmailVerificationBlocked()) {
    return;
  }
  const dayId   = window.editingDayId;
  const catId   = window.editingCatId;
  const catName = document.getElementById('edit-cat-name').value.trim();
  if (!catName) { window.showToast('Category name is required.', 'warn'); return; }

  const day = window.allDays.find(d => d._id === dayId);
  if (!day) return;
  const origCat = day.categories.find(c => c._id === catId);

  const taskRows = document.querySelectorAll('#edit-cat-tasks-builder .task-input-row');
  const tasks = [];
  for (const row of taskRows) {
    const title = row.querySelector('input').value.trim();
    if (!title) continue;
    const tId = row.dataset.taskId;
    const existing = origCat ? origCat.tasks.find(t => t._id === tId) : null;
    tasks.push({ _id: tId || `temp_task_${Math.random()}`, title, completed: existing ? existing.completed : false });
  }

  day.categories = day.categories.map(cat =>
    String(cat._id) === String(catId) ? { ...cat, name: catName, tasks } : cat
  );

  const btn = document.getElementById('submit-edit-cat-btn');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    // 1. Update Local
    day.lastLocalEdit = Date.now();
    await window.localDb.days.put(day);
    // 2. Queue Sync
    window.syncManager.addToQueue('PUT', 'days', dayId, { categories: day.categories });

    // Update today cache
    updateTodayCacheIfMatches(day);

    closeModal('modal-edit-category');
    const oldCard = document.getElementById(`day-card-${dayId}`);
    if (oldCard) {
      const newCard = buildDayCard(day);
      oldCard.replaceWith(newCard);
      requestAnimationFrame(() => requestAnimationFrame(() => animateProgressBar(`pct-fill-${dayId}`, window.calcProgress(day.categories))));
    }
    window.showToast('Category updated locally!', 'success');
  } catch (err) {
    console.error('Offline category edit error:', err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
  }
}

// ── Edit Goal (before deadline only) ──────────────────────
function getObjectIdTimestamp(idStr) {
  if (!idStr || typeof idStr !== 'string' || idStr.length !== 24) return 0;
  const seconds = parseInt(idStr.substring(0, 8), 16);
  return isNaN(seconds) ? 0 : seconds * 1000;
}
window.getObjectIdTimestamp = getObjectIdTimestamp;

function getGoalCreationTimeMs(goal) {
  if (!goal) return 0;
  if (goal.createdAt) {
    const t = new Date(goal.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (goal._id) {
    const t = getObjectIdTimestamp(goal._id);
    if (t > 0) return t;
  }
  return 0;
}
window.getGoalCreationTimeMs = getGoalCreationTimeMs;

function isWithin15MinutesOfGoalCreation(goal) {
  const createdMs = getGoalCreationTimeMs(goal);
  if (!createdMs) return false;
  const nowMs = typeof window.getServerNow === 'function' ? window.getServerNow() : Date.now();
  const elapsed = nowMs - createdMs;
  return elapsed >= 0 && elapsed <= 15 * 60 * 1000;
}
window.isWithin15MinutesOfGoalCreation = isWithin15MinutesOfGoalCreation;

function openEditGoalModal(goalId) {
  const goal = window.allGoals.find(g => g._id === goalId);
  if (!goal || window.daysLeft(goal.deadline) < 0) {
    window.showToast('This goal is overdue and can no longer be edited.', 'warn');
    return;
  }

  window.editingGoalId = goalId;

  if (window.goalEditTimerInterval) {
    clearInterval(window.goalEditTimerInterval);
    window.goalEditTimerInterval = null;
  }

  const titleInput = document.getElementById('edit-goal-title');
  titleInput.value = goal.title;

  const deadlineInput = document.getElementById('edit-goal-deadline');
  const deadlineYMD = goal.deadline ? goal.deadline.split('T')[0] : '';
  if (deadlineInput) {
    deadlineInput.value = deadlineYMD;
  }

  function updateModalTimerState() {
    const isWithin15Min = isWithin15MinutesOfGoalCreation(goal);
    window.editingGoalIsWithin15Min = isWithin15Min;

    if (isWithin15Min) {
      if (titleInput.hasAttribute('readonly')) {
        titleInput.removeAttribute('readonly');
        titleInput.style.background = '';
        titleInput.style.cursor = 'text';
      }
      if (deadlineInput && deadlineInput.disabled) {
        deadlineInput.removeAttribute('readonly');
        deadlineInput.disabled = false;
        deadlineInput.style.background = '';
        deadlineInput.style.cursor = 'pointer';
      }
    } else {
      if (!titleInput.hasAttribute('readonly')) {
        titleInput.setAttribute('readonly', 'true');
        titleInput.style.background = 'var(--bg-readonly)';
        titleInput.style.cursor = 'not-allowed';
      }
      if (deadlineInput && !deadlineInput.disabled) {
        deadlineInput.setAttribute('readonly', 'true');
        deadlineInput.disabled = true;
        deadlineInput.style.background = 'var(--bg-readonly)';
        deadlineInput.style.cursor = 'not-allowed';
      }
    }

    const noticeEl = document.getElementById('edit-goal-window-notice');
    if (noticeEl) {
      if (isWithin15Min) {
        const createdMs = getGoalCreationTimeMs(goal);
        const nowMs = typeof window.getServerNow === 'function' ? window.getServerNow() : Date.now();
        const totalRemMs = Math.max(0, (15 * 60 * 1000) - (nowMs - createdMs));
        const remMins = Math.floor(totalRemMs / 60000);
        const remSecs = Math.floor((totalRemMs % 60000) / 1000);
        const timeStr = `${remMins}m ${remSecs.toString().padStart(2, '0')}s`;

        noticeEl.innerHTML = `
          <div style="padding:10px 12px; background:rgba(239,68,68,0.08); border-left:4px solid #ef4444; border-radius:6px; font-size:12px; line-height:1.5; color:var(--text);">
            <div style="font-weight:700; color:#ef4444; margin-bottom:2px; display:flex; align-items:center; gap:4px;">
              <i data-lucide="alert-triangle" style="width:14px; height:14px;"></i> 15-Minute Creation Edit Window Active (${timeStr} remaining)
            </div>
            You can edit the title, change the deadline, rename existing subtasks, or delete subtasks.
            <div style="margin-top:4px; color:#b91c1c; font-size:11px;">
              <em>Note: After 15 minutes, previous subtasks and goal details will be locked and cannot be edited or deleted (only new subtasks can be added).</em>
            </div>
          </div>`;
      } else {
        noticeEl.innerHTML = `
          <div style="padding:10px 12px; background:var(--bg-muted); border-left:4px solid var(--text-muted); border-radius:6px; font-size:12px; line-height:1.5; color:var(--text-muted);">
            <div style="font-weight:700; margin-bottom:2px; display:flex; align-items:center; gap:4px;">
              <i data-lucide="lock" style="width:14px; height:14px;"></i> 15-Minute Edit Window Expired
            </div>
            Previous subtasks, goal title, and deadline are locked and cannot be edited or deleted. You can only add new subtasks below.
          </div>`;
        if (window.goalEditTimerInterval) {
          clearInterval(window.goalEditTimerInterval);
          window.goalEditTimerInterval = null;
        }
      }
      if (window.lucide) lucide.createIcons({ root: noticeEl });
    }
  }

  updateModalTimerState();
  if (window.editingGoalIsWithin15Min) {
    window.goalEditTimerInterval = setInterval(updateModalTimerState, 1000);
  }

  const deadlineDisplay = document.getElementById('edit-goal-deadline-display');
  if (deadlineDisplay) {
    deadlineDisplay.innerHTML = `<i data-lucide="calendar"></i> Current Deadline: ${window.formatDisplayDate(deadlineYMD)}`;
    if (window.lucide) lucide.createIcons({ root: deadlineDisplay });
  }

  const isWithin15Min = isWithin15MinutesOfGoalCreation(goal);

  const builder = document.getElementById('edit-goal-tasks-builder');
  builder.innerHTML = '';
  for (const task of goal.tasks) {
    addEditGoalTaskField(task.title, task._id, task.completed, isWithin15Min);
  }
  if (!goal.tasks.length) addEditGoalTaskField('', '', false, isWithin15Min);
  openModal('modal-edit-goal');
}

function addEditGoalTaskField(title = '', taskId = '', completed = false, forceIsWithin15Min = null) {
  const builder = document.getElementById('edit-goal-tasks-builder');
  const row = document.createElement('div');
  row.className = 'task-input-row';
  row.dataset.taskId    = taskId;
  row.dataset.completed = completed ? 'true' : 'false';

  const isExisting = taskId !== '';
  const isWithin15Min = forceIsWithin15Min !== null ? forceIsWithin15Min : (window.editingGoalIsWithin15Min ?? true);
  const isEditable = !isExisting || isWithin15Min;

  const inputAttrs = isEditable ? '' : 'readonly style="background:var(--bg-readonly); cursor:not-allowed;"';
  const removeBtn  = isEditable ? `<button class="btn-remove" onclick="this.parentElement.remove()" title="Remove"><i data-lucide="trash-2"></i></button>` : '';

  row.innerHTML = `
    <input type="text" class="form-control" placeholder="Subtask title..." value="${window.escHtml(title)}" ${inputAttrs} />
    ${removeBtn}
  `;
  builder.appendChild(row);
  if (window.lucide) lucide.createIcons({ root: row });
}

async function submitEditGoal() {
  const goalId = window.editingGoalId;
  const title  = document.getElementById('edit-goal-title').value.trim();
  const deadline = document.getElementById('edit-goal-deadline').value;

  if (!title) { window.showToast('Goal title is required.', 'warn'); return; }
  if (!deadline) { window.showToast('Goal deadline is required.', 'warn'); return; }

  const goal = window.allGoals.find(g => g._id === goalId);
  if (!goal) return;

  const taskRows = document.querySelectorAll('#edit-goal-tasks-builder .task-input-row');
  const newTasks = [];
  for (const row of taskRows) {
    const t = row.querySelector('input').value.trim();
    if (!t) continue;
    const tId  = row.dataset.taskId;
    const existing = goal.tasks.find(tk => tk._id === tId);
    newTasks.push({ ...(tId ? { _id: tId } : {}), title: t, completed: existing ? existing.completed : false });
  }

  if (newTasks.length === 0) {
    window.showToast('At least one subtask is required for a goal.', 'warn');
    return;
  }

  const btn = document.getElementById('submit-edit-goal-btn');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    const updated = await window.apiFetch(`${window.API}/api/goals/${goalId}`, {
      method: 'PUT',
      body: JSON.stringify({ title, deadline, tasks: newTasks }),
    });
    const idx = window.allGoals.findIndex(g => g._id === goalId);
    if (idx !== -1) window.allGoals[idx] = updated;
    closeModal('modal-edit-goal');
    if (window.goalEditTimerInterval) {
      clearInterval(window.goalEditTimerInterval);
      window.goalEditTimerInterval = null;
    }
    const oldCard = document.getElementById(`goal-card-${goalId}`);
    if (oldCard) {
      const newCard = buildGoalCard(updated);
      if (window.gsap) gsap.set(newCard, { opacity: 0, y: 10 });
      oldCard.replaceWith(newCard);
      if (window.gsap) gsap.to(newCard, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', clearProps: 'all' });
      requestAnimationFrame(() => requestAnimationFrame(() => animateProgressBar(`gpct-fill-${goalId}`, window.calcProgress([{ tasks: updated.tasks }]))));
    }
    window.showToast('Goal updated!', 'success');
  } catch (err) {
    window.showToast(err.message || 'Failed to update goal', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Changes';
  }
}

function updateTodayCacheIfMatches(day) {
  if (!day) return;
  const today = window.todayStr();
  const cardDate = (day.date || '').split('T')[0];
  if (cardDate === today) {
    const pendingTasks = [];
    if (day.categories) {
      day.categories.forEach(c => {
        if (c.tasks) {
          c.tasks.forEach(t => {
            if (!t.completed) {
              pendingTasks.push(t.title);
            }
          });
        }
      });
    }
    updateTodayStatusCache(today, true, pendingTasks);
  }
}

function openReminderModal(dayId) {
  const day = window.allDays.find(d => d._id === dayId);
  if (!day) return;

  document.getElementById("reminder-modal-day-id").value = dayId;
  const r = day.reminder || { enabled: false, time: "20:00", type: "notification", selectedTasks: [] };
  
  const toggle = document.getElementById("reminder-enabled-toggle");
  if (toggle) toggle.checked = r.enabled;
  toggleReminderTimeFields(r.enabled);

  const timeInput = document.getElementById("reminder-time-input");
  if (timeInput) timeInput.value = r.time || "20:00";

  const radios = document.querySelectorAll('input[name="reminder-type-radio"]');
  radios.forEach(rad => {
    rad.checked = (rad.value === (r.type || "notification"));
  });

  const checklistContainer = document.getElementById("reminder-tasks-checklist");
  if (checklistContainer) {
    checklistContainer.innerHTML = "";
    if (!day.categories || day.categories.length === 0 || day.categories.every(c => c.tasks.length === 0)) {
      checklistContainer.innerHTML = '<p style="color:var(--text-muted);font-size:12px;margin:0;">No tasks on this day card.</p>';
    } else {
      const selectedIds = new Set(r.selectedTasks || []);
      day.categories.forEach((cat, catIdx) => {
        // Build category header block
        const catDiv = document.createElement("div");
        catDiv.className = "reminder-cat-block";
        
        // Neo-brutalist "gift box" styling
        const accentColors = [
          'var(--teal)',
          'var(--pink)',
          'var(--lime)',
          'var(--yellow)',
          'var(--orange)',
          'var(--purple)'
        ];
        const accentColor = accentColors[catIdx % accentColors.length];
        
        catDiv.style.background = "var(--bg-muted)";
        catDiv.style.border = "2px solid var(--black)";
        catDiv.style.borderRadius = "8px";
        catDiv.style.padding = "10px";
        catDiv.style.boxShadow = "2px 2px 0 var(--black)";
        catDiv.style.marginBottom = "12px";
        catDiv.style.borderLeft = `6px solid ${accentColor}`;
        
        // Check if all tasks in this category are checked
        const allTasksChecked = cat.tasks.length > 0 && cat.tasks.every(t => selectedIds.has(t._id));
        
        catDiv.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px dashed var(--black);">
            <input type="checkbox" class="reminder-cat-select-all" data-cat-idx="${catIdx}" ${allTasksChecked ? "checked" : ""} style="width: 16px; height: 16px; cursor: pointer; accent-color: var(--black);" />
            <span style="font-family: 'Space Grotesk', sans-serif; font-weight: 800; font-size: 13px; text-transform: uppercase; color: var(--text);">${window.escHtml(cat.name)}</span>
          </div>
          <div class="reminder-cat-tasks" style="padding-left: 8px; display: flex; flex-direction: column; gap: 6px;">
          </div>
        `;
        
        const tasksContainer = catDiv.querySelector(".reminder-cat-tasks");
        
        cat.tasks.forEach(task => {
          const checked = selectedIds.has(task._id) ? "checked" : "";
          const itemDiv = document.createElement("div");
          itemDiv.style.display = "flex";
          itemDiv.style.alignItems = "center";
          itemDiv.style.gap = "8px";
          itemDiv.style.fontSize = "13px";
          itemDiv.innerHTML = `
            <input type="checkbox" class="reminder-task-chk" data-cat-idx="${catIdx}" value="${task._id}" data-title="${window.escHtml(task.title)}" ${checked} style="width: 16px; height: 16px; cursor: pointer; accent-color: var(--black);" />
            <span style="font-weight: 600;">${window.escHtml(task.title)}</span>
          `;
          tasksContainer.appendChild(itemDiv);
        });
        
        checklistContainer.appendChild(catDiv);
      });
      
      // Add event listeners to select-all-category checkboxes
      checklistContainer.querySelectorAll(".reminder-cat-select-all").forEach(catChk => {
        catChk.addEventListener("change", (e) => {
          const idx = catChk.getAttribute("data-cat-idx");
          const checked = catChk.checked;
          checklistContainer.querySelectorAll(`.reminder-task-chk[data-cat-idx="${idx}"]`).forEach(tChk => {
            tChk.checked = checked;
          });
        });
      });
      
      // Add event listeners to task checkboxes to update the category checkbox state
      checklistContainer.querySelectorAll(".reminder-task-chk").forEach(tChk => {
        tChk.addEventListener("change", (e) => {
          const idx = tChk.getAttribute("data-cat-idx");
          const catChk = checklistContainer.querySelector(`.reminder-cat-select-all[data-cat-idx="${idx}"]`);
          if (catChk) {
            const siblings = checklistContainer.querySelectorAll(`.reminder-task-chk[data-cat-idx="${idx}"]`);
            const allChecked = Array.from(siblings).every(sibling => sibling.checked);
            catChk.checked = allChecked;
          }
        });
      });
    }
  }

  window.openModal("modal-daily-reminder");
}

function toggleReminderTimeFields(enabled) {
  const fields = document.getElementById("reminder-config-fields");
  if (fields) {
    fields.style.display = enabled ? "flex" : "none";
  }
}

function selectAllReminderTasks(selectAll) {
  const checkboxes = document.querySelectorAll("#reminder-tasks-checklist input[type='checkbox']");
  checkboxes.forEach(chk => chk.checked = selectAll);
}

async function saveDailyReminderSettings() {
  const dayId = document.getElementById("reminder-modal-day-id").value;
  if (!dayId) return;

  const enabled = document.getElementById("reminder-enabled-toggle").checked;
  const time = document.getElementById("reminder-time-input").value;
  const type = document.querySelector('input[name="reminder-type-radio"]:checked')?.value || "notification";
  
  const chkElements = document.querySelectorAll("#reminder-tasks-checklist .reminder-task-chk");
  const selectedTasks = [];
  const selectedTaskNames = [];
  
  chkElements.forEach(chk => {
    if (chk.checked) {
      selectedTasks.push(chk.value);
      selectedTaskNames.push(chk.getAttribute("data-title"));
    }
  });

  const day = window.allDays.find(d => d._id === dayId);
  if (!day) return;

  day.reminder = {
    enabled,
    time,
    type,
    selectedTasks
  };

  try {
    // 1. Update Local DB immediately
    day.lastLocalEdit = Date.now();
    await window.localDb.days.put(day);
    
    // 2. Add to Sync Queue (so it pushes to server/mongo)
    window.syncManager.addToQueue('PUT', 'days', day._id, { reminder: day.reminder });

    // 3. Schedule or cancel local device alerts via Capacitor/Plugin
    if (enabled) {
      const cardDate = (day.date || '').split('T')[0];
      await scheduleLocalReminder(dayId, time, type, "Daily Reminder", selectedTaskNames, cardDate);
    } else {
      await cancelLocalReminder(dayId);
    }

    // Refresh UI to show updated bell icon status
    window.renderDays();
    window.closeModal("modal-daily-reminder");
    window.showToast("Reminder settings saved successfully!", "success");
  } catch (err) {
    console.error("Error saving reminder settings:", err);
    window.showToast("Failed to save reminder settings.", "error");
  }
}


// ── Days Module Bindings ──────────────────────────────────
window.loadDays = loadDays;
window.loadMoreDays = loadMoreDays;
window.updateStreak = updateStreak;
window.renderDays = renderDays;
window.buildDayCard = buildDayCard;
window.animateProgressBar = animateProgressBar;
window.toggleTask = toggleTask;
window.deleteDayCard = deleteDayCard;
window.deleteCategory = deleteCategory;
window.deleteTask = deleteTask;
window.updateProgressBar = updateProgressBar;
window.toggleSummary = toggleSummary;
window.saveSummary = saveSummary;
window.loadClaimedBadges = loadClaimedBadges;
window.renderClaimedBadges = renderClaimedBadges;
window.openReminderModal = openReminderModal;
window.toggleReminderTimeFields = toggleReminderTimeFields;
window.selectAllReminderTasks = selectAllReminderTasks;
window.saveDailyReminderSettings = saveDailyReminderSettings;
window.openBadgesModal = openBadgesModal;
window.loadAllBadges = loadAllBadges;
window.renderAllBadges = renderAllBadges;
window.claimBadge = claimBadge;
window.openAddDayModal = openAddDayModal;
window.addCategoryField = addCategoryField;
window.removeCategoryField = removeCategoryField;
window.addTaskField = addTaskField;
window.submitAddDay = submitAddDay;
window.openAddCategoryModal = openAddCategoryModal;
window.addNewCatTaskField = addNewCatTaskField;
window.submitAddCategory = submitAddCategory;
window.openEditCategoryModal = openEditCategoryModal;
window.addEditCatTaskField = addEditCatTaskField;
window.submitEditCategory = submitEditCategory;
window.openEditGoalModal = openEditGoalModal;
window.addEditGoalTaskField = addEditGoalTaskField;
window.submitEditGoal = submitEditGoal;
window.isDayEditable = isDayEditable;

// ── Screen Time Distractions Evaluation Engine ───────────────
window.cachedUsageStats = null;
window.cachedUsageStatsTime = 0;

async function evaluateDaysDistractions() {
  // 1. Get distraction limits config
  let limits = null;
  try {
    limits = await window.localDb.appLimits.get(window.userId);
  } catch (e) {
    console.error('Error fetching app limits for cards:', e);
  }

  // Determine if we can query native stats (must be native Android and permission must be granted)
  const isNative = !!(window.isAndroidNative && window.Capacitor && window.Capacitor.Plugins.UsageStatsPlugin);
  let permissionGranted = false;
  if (isNative) {
    permissionGranted = await window.checkAndroidPermissionStatus();
  }

  // 3. Query native foreground stats for the last 8 days if native and permission is active
  const now = Date.now();
  let usageStats = null;
  if (isNative && permissionGranted) {
    if (!window.cachedUsageStats || (now - window.cachedUsageStatsTime > 30000)) {
      try {
        window.cachedUsageStats = await window.Capacitor.Plugins.UsageStatsPlugin.getUsageStats({ days: 8 });
        window.cachedUsageStatsTime = now;
      } catch (err) {
        console.error('Failed to get usage stats from plugin:', err);
      }
    }
    usageStats = window.cachedUsageStats;
  }

  // 4. Iterate over rendered day cards to append distraction limit stats
  const cards = document.querySelectorAll('.day-card');
  const today = window.todayStr();

  cards.forEach(card => {
    const cardDate = card.getAttribute('data-date');
    if (!cardDate) return;

    // Find day in memory
    const day = window.allDays.find(d => (d.date || '').split('T')[0] === cardDate);
    if (!day) return;

    let top5 = [];
    let totalMinutes = 0;
    let showStats = false;
    let rawStats = null;

    // Retrieve last 7 available Day cards (strictly before today's card)
    const sortedPastDays = [...window.allDays]
      .filter(d => d.date < today)
      .sort((a, b) => b.date.localeCompare(a.date));
    const last7Days = sortedPastDays.slice(0, 7);
    const isOneOfLast7 = last7Days.some(d => d.date === day.date);

    if (cardDate >= today) {
      // Exclude today's and future cards from showing screen time stats (only display from yesterday onwards)
      showStats = false;
    } else if (isOneOfLast7) {
      // One of the last 7 available cards: display pre-saved stats or query dynamically (if limits are enabled)
      if (limits && limits.enabled && limits.apps && limits.apps.length > 0) {
        if (day.screenTimeStats && typeof day.screenTimeStats === 'object' && !Array.isArray(day.screenTimeStats) && Object.keys(day.screenTimeStats).length > 0) {
          rawStats = day.screenTimeStats;
          showStats = true;
        } else if (isNative && permissionGranted && usageStats) {
          // Otherwise, query dynamically for the first time and persist/sync
          rawStats = usageStats[cardDate] || {};
          const currentSavedStr = JSON.stringify(day.screenTimeStats || {});
          const newStatsStr = JSON.stringify(rawStats);
          if (Object.keys(rawStats).length > 0 && currentSavedStr !== newStatsStr) {
            day.screenTimeStats = rawStats;
            day.lastLocalEdit = Date.now();
            window.localDb.days.put(day).catch(err => console.error("Error saving raw stats:", err));
            window.syncManager.addToQueue('PUT', 'days', day._id, { screenTimeStats: rawStats });
          }
          showStats = true;
        }
      } else {
        showStats = false;
      }
    } else {
      // 8th card and older: display frozen stats permanently from IndexedDB if they exist
      if (day.screenTimeStats) {
        if (Array.isArray(day.screenTimeStats)) {
          top5 = day.screenTimeStats;
          top5.forEach(app => {
            totalMinutes += app.actualMinutes || 0;
          });
          showStats = true;
        } else if (typeof day.screenTimeStats === 'object' && Object.keys(day.screenTimeStats).length > 0) {
          // Convert raw stats object to a frozen snapshot array using limits app configuration
          const appLimitsApps = limits && limits.apps ? limits.apps : [];
          const appStats = appLimitsApps.map(app => {
            const actualMinutes = day.screenTimeStats[app.packageName] !== undefined ? day.screenTimeStats[app.packageName] : 0;
            return {
              packageName: app.packageName,
              appName: app.appName,
              limitMinutes: app.limitMinutes,
              iconBase64: app.iconBase64,
              actualMinutes,
              completed: actualMinutes <= app.limitMinutes
            };
          });

          // Save the frozen array back to IndexedDB and sync to MongoDB
          day.screenTimeStats = appStats;
          day.lastLocalEdit = Date.now();
          window.localDb.days.put(day).catch(err => console.error("Error freezing old day stats:", err));
          window.syncManager.addToQueue('PUT', 'days', day._id, { screenTimeStats: appStats });

          top5 = appStats;
          top5.forEach(app => {
            totalMinutes += app.actualMinutes || 0;
          });
          showStats = true;
        }
      }
    }

    if (!showStats) {
      const existing = card.querySelector('.app-distraction-block');
      if (existing) existing.remove();
      return;
    }

    // If rawStats is set, map limits to rawStats and get top 5
    if (rawStats) {
      const appStats = limits.apps.map(app => {
        const actualMinutes = rawStats[app.packageName] !== undefined ? rawStats[app.packageName] : 0;
        return {
          packageName: app.packageName,
          appName: app.appName,
          limitMinutes: app.limitMinutes,
          iconBase64: app.iconBase64,
          actualMinutes,
          completed: actualMinutes <= app.limitMinutes
        };
      });

      appStats.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return b.actualMinutes - a.actualMinutes;
      });

      top5 = appStats.slice(0, 5);

      for (const pkg in rawStats) {
        totalMinutes += rawStats[pkg] || 0;
      }
    }

    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMins = totalMinutes % 60;
    const totalScreenTimeStr = totalHours > 0 ? `${totalHours}h ${remainingMins}m` : `${remainingMins}m`;

    // 7. Compose HTML
    let listHtml = '';
    top5.forEach(app => {
      const iconSrc = app.iconBase64 || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      const rowStyle = app.completed
        ? 'background: var(--bg-distraction-green); border-color: var(--distraction-green);'
        : 'background: var(--bg-distraction-red); border-color: var(--distraction-red);';

      listHtml += `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; ${rowStyle} border: 2px solid; border-radius: 6px; box-shadow: 2px 2px 0 var(--black);">
          <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
            <img src="${iconSrc}" style="width: 22px; height: 22px; border-radius: 4px; flex-shrink: 0; object-fit: contain;" onerror="this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='" />
            <span style="font-weight: 700; font-size: 12px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${app.appName}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
            <span style="font-size: 11px; font-weight: 800; padding: 2px 6px; border: 1px solid var(--black); border-radius: 12px; font-family: 'Space Grotesk', sans-serif; text-transform: uppercase; background: var(--bg-card); color: var(--text); box-shadow: 1px 1px 0 var(--black);">
              ${app.actualMinutes}m / ${app.limitMinutes}m
            </span>
          </div>
        </div>
      `;
    });

    const blockHtml = `
      <div class="app-distraction-block category-section" style="margin-top: 16px; padding: 14px; background: rgba(168, 85, 247, 0.08); border: 2px solid #a855f7; border-radius: 8px; box-shadow: 3px 3px 0 var(--black);">
        <div style="display: flex; align-items: center; gap: 6px; font-weight: 900; font-family: 'Space Grotesk', sans-serif; text-transform: uppercase; margin-bottom: 10px; font-size: 11px; color: #a855f7; letter-spacing: 0.5px;">
          <i data-lucide="zap" style="width: 14px; height: 14px; fill: #a855f7;"></i>
          <span>Screen Time &amp; Limits</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px;">
          ${listHtml}
        </div>
        <div style="display: flex; align-items: center; gap: 6px; font-weight: 800; font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; border-top: 1px dashed rgba(168, 85, 247, 0.3); padding-top: 8px; margin-top: 6px;">
          <i data-lucide="smartphone" style="width: 14px; height: 14px;"></i>
          <span>Total Mobile Screen Time: <strong style="color: var(--text);">${totalScreenTimeStr}</strong></span>
        </div>
      </div>
    `;

    let existing = card.querySelector('.app-distraction-block');
    if (existing) {
      existing.outerHTML = blockHtml;
    } else {
      const insertionPoint = card.querySelector('.ach-add-row') || card.querySelector('.summary-content');
      if (insertionPoint) {
        const temp = document.createElement('div');
        temp.innerHTML = blockHtml;
        card.insertBefore(temp.firstElementChild, insertionPoint);
      } else {
        card.insertAdjacentHTML('beforeend', blockHtml);
      }
    }
  });

  if (window.lucide) {
    lucide.createIcons({ root: document.getElementById('cards-container') });
  }
}

// Focus listener to refresh stats when returning to the app
window.addEventListener('focus', () => {
  if (typeof evaluateDaysDistractions === 'function') {
    evaluateDaysDistractions();
  }
});

async function deleteDailySummary(dayId) {
  if (!navigator.onLine) {
    window.showToast('Offline: Cannot delete AI recap.', 'warn');
    return;
  }
  if (!confirm("Are you sure you want to delete this AI Daily Insight?")) return;
  const day = window.allDays.find(d => d._id === dayId);
  if (day) {
    day.aiSummary = "";
    try {
      // 1. Update Local DB
      day.lastLocalEdit = Date.now();
      await window.localDb.days.put(day);
      // 2. Queue Sync
      window.syncManager.addToQueue('PUT', 'days', dayId, { aiSummary: "" });
      window.showToast('AI Daily Insights deleted successfully!', 'success');
      
      // Re-render only this Day card smoothly
      const cardEl = document.getElementById(`day-card-${dayId}`);
      if (cardEl) {
        const preLoadedAchs = (typeof batchAchievements !== 'undefined' && batchAchievements) 
          ? batchAchievements.filter(a => a.dayId === dayId) 
          : [];
        cardEl.replaceWith(buildDayCard(day, preLoadedAchs));
        if (typeof evaluateDaysDistractions === 'function') {
          evaluateDaysDistractions();
        }
      }
    } catch (err) {
      console.error('Offline delete error:', err);
    }
  }
}

function toggleAiRecapExpansion(el, event) {
  const textEl = el.querySelector('.ai-recap-text') || el;
  if (!textEl) return;
  
  if (textEl.style.webkitLineClamp === '3' || textEl.style.webkitLineClamp === '') {
    textEl.style.display = 'block';
    textEl.style.webkitLineClamp = 'none';
    textEl.style.overflow = 'visible';
  } else {
    textEl.style.display = '-webkit-box';
    textEl.style.webkitLineClamp = '3';
    textEl.style.overflow = 'hidden';
  }
}

async function triggerTaskImageScan(useCamera = false) {
  const dateInput = document.getElementById('day-date-input');
  const selectedDate = dateInput ? dateInput.value : '';
  if (!selectedDate) {
    window.showToast('Please select a date first before scanning.', 'warn');
    return;
  }

  // Check if a card already exists for this date in local cache / memory
  const exists = window.allDays && window.allDays.some(d => d.date === selectedDate);
  if (exists) {
    window.showToast(`A daily card for ${selectedDate} already exists! Please select a different date.`, 'error');
    return;
  }

  const processScannedFile = async (file, event = null) => {
    // Check size limit of 10MB in frontend
    if (file.size > 10 * 1024 * 1024) {
      window.showToast('Photo is too large (exceeds 10MB limit). Please select a compressed image.', 'error');
      if (event && event.target) event.target.value = '';
      return;
    }

    const scanBtn = document.getElementById('scan-list-btn');
    const scanContainer = document.getElementById('scan-list-btn-container') || scanBtn;
    const previewContainer = document.getElementById('scan-preview-container');
    const imgPreview = document.getElementById('scan-img-preview');
    const sizeText = document.getElementById('scan-file-size');

    if (scanBtn && previewContainer && imgPreview) {
      // Calculate file size string
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      const sizeKB = (file.size / 1024).toFixed(0);
      if (sizeText) {
        sizeText.textContent = file.size > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;
      }

      // Read image as Data URL and show preview
      const reader = new FileReader();
      reader.onload = (e) => {
        imgPreview.src = e.target.result;
        if (scanContainer) scanContainer.style.display = 'none'; // Hide scan buttons container
        previewContainer.style.display = 'block'; // Show preview area
      };
      reader.readAsDataURL(file);

      // Setup Cancel Button
      const cancelBtn = document.getElementById('scan-cancel-btn');
      if (cancelBtn) {
        cancelBtn.onclick = () => {
          previewContainer.style.display = 'none';
          imgPreview.src = '';
          if (scanContainer) scanContainer.style.display = 'flex';
          if (event && event.target) event.target.value = '';
        };
      }

      // Setup Confirm & Scan Button
      const confirmBtn = document.getElementById('scan-confirm-btn');
      if (confirmBtn) {
        confirmBtn.onclick = async () => {
          const originalHTML = scanBtn.innerHTML;
          // Hide preview and restore buttons to show loading spinner
          previewContainer.style.display = 'none';
          if (scanContainer) scanContainer.style.display = 'flex';
          
          await startActualScan(file, scanBtn, originalHTML, event);
        };
      }
    }
  };

  if (useCamera) {
    if (window.startCameraCapture) {
      window.startCameraCapture((file) => {
        processScannedFile(file);
      });
    } else {
      // Fallback if not loaded
      const tempInput = document.createElement('input');
      tempInput.type = 'file';
      tempInput.accept = 'image/*';
      tempInput.capture = 'environment';
      tempInput.onchange = (event) => {
        const file = event.target.files[0];
        if (file) processScannedFile(file, event);
      };
      tempInput.click();
    }
    return;
  }

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.onchange = async (event) => {
    const file = event.target.files[0];
    if (file) {
      processScannedFile(file, event);
    }
  };
  fileInput.click();
}

async function startActualScan(file, scanBtn, originalHTML, event) {
  // Lock the modal so the user cannot close it during the scan
  window.isScanInProgress = true;
  const lockBanner = document.getElementById('scan-lock-banner');
  if (lockBanner) lockBanner.style.display = 'flex';

  // Disable the modal's X close button visually
  const modalCloseBtn = document.querySelector('#modal-add-day .modal-close');
  if (modalCloseBtn) {
    modalCloseBtn.disabled = true;
    modalCloseBtn.style.opacity = '0.35';
    modalCloseBtn.style.cursor = 'not-allowed';
    modalCloseBtn.title = 'Cannot close while scan is in progress';
  }

  scanBtn.disabled = true;
  const cameraBtn = document.getElementById('scan-camera-btn');
  if (cameraBtn) cameraBtn.disabled = true;

  scanBtn.innerHTML = `
    <span style="display:flex;align-items:center;gap:8px;">
      <span class="spinner-ring" style="width:13px;height:13px;border-width:2px;border-color:#1a0008 transparent transparent transparent;flex-shrink:0;"></span>
      <span style="font-weight:800;">Scanning image...</span>
    </span>
  `;
  scanBtn.style.flexDirection = 'column';
  scanBtn.style.gap = '4px';

  try {
    // Step 1: Request token and AI service URL from Vercel backend
    const authRes = await window.apiFetch(`${window.API}/api/ai/authorize-task-extraction`, {
      method: 'POST'
    });

    if (!authRes || !authRes.generationToken) {
      throw new Error('Failed to obtain scan authorization from server.');
    }

    if (authRes && typeof authRes.generationsLeft !== 'undefined') {
      window.photoGenerationsLeft = authRes.generationsLeft;
    }

    const { generationToken, aiServiceUrl } = authRes;

    // Step 2: Upload photo directly to Render AI service
    const formData = new FormData();
    formData.append('image', file);

    const aiResponse = await fetch(`${aiServiceUrl}/api/ai/extract-tasks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${generationToken}`
      },
      body: formData
    });

    if (!aiResponse.ok) {
      const errorBody = await aiResponse.json().catch(() => ({}));
      const errorMsg = errorBody.details || errorBody.error || errorBody.message || `Render AI Service returned status ${aiResponse.status}`;
      throw new Error(errorMsg);
    }

    const extractedData = await aiResponse.json();

    // Verify extractedData is not empty/null and has actual task items
    if (!extractedData || !extractedData.categories || !Array.isArray(extractedData.categories) || extractedData.categories.length === 0 || extractedData.categories.every(c => !c.tasks || c.tasks.length === 0)) {
      throw new Error('No readable text or task lists were detected in this photo. Please ensure the image is clear and contains readable text.');
    }

    // Step 3: Populate modal UI
    const builder = document.getElementById('categories-builder');
    if (builder) {
      builder.innerHTML = '';
      window.categoryCount = 0;

      extractedData.categories.forEach(cat => {
        const idx = window.categoryCount++;
        const item = document.createElement('div');
        item.className = 'category-builder-item';
        item.id = `cat-build-${idx}`;
        item.innerHTML = `
          <div class="cat-top-row">
            <input type="text" class="form-control" placeholder="Category name (e.g. Work, Fitness...)" id="cat-name-${idx}" value="${window.escHtml ? window.escHtml(cat.name) : cat.name}" />
            <button class="btn-remove" onclick="removeCategoryField(${idx})" title="Remove"><i data-lucide="trash-2"></i></button>
          </div>
          <div class="tasks-builder" id="tasks-build-${idx}"></div>
          <button class="btn-ghost ripple" style="font-size:12px;padding:6px 12px;border-radius:8px;" onclick="addTaskField(${idx})"><i data-lucide="plus"></i> Add Task</button>
        `;
        builder.appendChild(item);
        if (window.lucide) lucide.createIcons({ root: item });

        const tasksBuilder = document.getElementById(`tasks-build-${idx}`);
        if (cat.tasks && cat.tasks.length > 0) {
          cat.tasks.forEach(taskTitle => {
            const row = document.createElement('div');
            row.className = 'task-input-row';
            row.innerHTML = `
              <input type="text" class="form-control" placeholder="Task title..." value="${window.escHtml ? window.escHtml(taskTitle) : taskTitle}" />
              <button class="btn-remove" onclick="this.parentElement.remove(); if (window.validateAddDayForm) window.validateAddDayForm();" title="Remove"><i data-lucide="trash-2"></i></button>
            `;
            tasksBuilder.appendChild(row);
            if (window.lucide) lucide.createIcons({ root: row });
          });
        } else {
          addTaskField(idx);
        }
      });

      if (typeof validateAddDayForm === 'function') {
        validateAddDayForm();
      }
      window.showToast('List scanned and populated successfully!', 'success');
    }
  } catch (err) {
    console.error('Failed to scan tasks image:', err);
    window.showToast(err.message || 'Failed to scan image.', 'error');
  } finally {
    // Clear file selection
    if (event && event.target) event.target.value = '';

    // Unlock the modal
    window.isScanInProgress = false;
    const lockBanner = document.getElementById('scan-lock-banner');
    if (lockBanner) lockBanner.style.display = 'none';

    // Re-enable the X close button
    const modalCloseBtn = document.querySelector('#modal-add-day .modal-close');
    if (modalCloseBtn) {
      modalCloseBtn.disabled = false;
      modalCloseBtn.style.opacity = '';
      modalCloseBtn.style.cursor = '';
      modalCloseBtn.title = '';
    }

    scanBtn.disabled = false;
    const cameraBtn = document.getElementById('scan-camera-btn');
    if (cameraBtn) cameraBtn.disabled = false;
    scanBtn.innerHTML = originalHTML;
    updateScanButtonText();
  }
}

function updateScanButtonText() {
  const scanBtn = document.getElementById('scan-list-btn');
  if (scanBtn) {
    const left = typeof window.photoGenerationsLeft !== 'undefined' ? window.photoGenerationsLeft : '?';
    const limit = typeof window.photoLimit !== 'undefined' ? window.photoLimit : '?';
    const isEmpty = left === 0;
    const badgeColor = isEmpty ? '#ff6b6b' : '#ffb3d9';
    scanBtn.innerHTML = `
      <span style="display:flex;align-items:center;gap:7px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
        <span style="font-weight:800;">Scan List from Photo</span>
      </span>
      <span id="scan-credits-badge" style="display:inline-flex;align-items:center;font-size:10px;font-weight:900;background:#1a0008;color:${badgeColor};padding:2px 10px;border-radius:3px;letter-spacing:0.5px;white-space:nowrap;text-transform:uppercase;">${left}/${limit} credits left today</span>
    `;
    scanBtn.style.flexDirection = 'column';
    scanBtn.style.gap = '4px';
  }
}

// ==========================================
// VOICE-TO-DAILY-TASK MODULE LOGIC
// ==========================================

function updateVoiceButtonText() {
  const voiceBtn = document.getElementById('voice-record-btn');
  if (voiceBtn) {
    const left = typeof window.voiceGenerationsLeft !== 'undefined' ? window.voiceGenerationsLeft : '?';
    const limit = typeof window.voiceLimit !== 'undefined' ? window.voiceLimit : '?';
    const isEmpty = left === 0;
    const badgeColor = isEmpty ? '#ff6b6b' : '#c3ffb3';
    voiceBtn.innerHTML = `
      <span style="display:flex;align-items:center;gap:7px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
        <span style="font-weight:800;">Voice-to-Daily-Task</span>
      </span>
      <span id="voice-credits-badge" style="display:inline-flex;align-items:center;font-size:10px;font-weight:900;background:var(--black);color:${badgeColor};padding:2px 10px;border-radius:3px;letter-spacing:0.5px;white-space:nowrap;text-transform:uppercase;">${left}/${limit} credits left today</span>
    `;
    voiceBtn.style.flexDirection = 'column';
    voiceBtn.style.gap = '4px';
  }
}

function triggerVoiceToTask() {
  const dateInput = document.getElementById('day-date-input');
  const selectedDate = dateInput ? dateInput.value : '';
  if (!selectedDate) {
    window.showToast('Please select a date first.', 'warn');
    return;
  }

  // Check if a card already exists for this date in local cache / memory
  const exists = window.allDays && window.allDays.some(d => d.date === selectedDate);
  if (exists) {
    window.showToast(`A daily card for ${selectedDate} already exists! Please select a different date.`, 'error');
    return;
  }

  const container = document.getElementById('voice-record-container');
  const recordBtn = document.getElementById('voice-record-btn');
  if (!container || !recordBtn) return;

  // Toggle container visibility
  if (container.style.display === 'none') {
    container.style.display = 'block';
    recordBtn.style.display = 'none';
    resetVoiceUI();
    
    // Bind buttons
    setupVoiceEventListeners();
  } else {
    container.style.display = 'none';
    recordBtn.style.display = 'flex';
    resetVoiceUI();
  }
}

function setupVoiceEventListeners() {
  const actionBtn = document.getElementById('voice-action-btn');
  const sendBtn = document.getElementById('voice-send-btn');
  const cancelBtn = document.getElementById('voice-cancel-btn');

  if (actionBtn) {
    actionBtn.onclick = () => {
      if (!window.mediaRecorder || window.mediaRecorder.state === 'inactive') {
        startVoiceRecording();
      } else if (window.mediaRecorder.state === 'recording') {
        stopVoiceRecording();
      }
    };
  }

  if (sendBtn) {
    sendBtn.onclick = async () => {
      await sendVoiceToAI();
    };
  }

  if (cancelBtn) {
    cancelBtn.onclick = () => {
      resetVoiceUI();
      document.getElementById('voice-record-container').style.display = 'none';
      document.getElementById('voice-record-btn').style.display = 'flex';
    };
  }
}

async function startVoiceRecording() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Your browser or device does not support audio recording.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    window.audioChunks = [];
    
    let options = { mimeType: 'audio/webm; codecs=opus' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: 'audio/webm' };
    }
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: 'audio/mp4' };
    }
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = {};
    }

    const recorder = new MediaRecorder(stream, options);
    window.mediaRecorder = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        window.audioChunks.push(event.data);
      }
    };

    recorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop());
      
      const mimeType = recorder.mimeType || 'audio/webm';
      window.voiceAudioBlob = new Blob(window.audioChunks, { type: mimeType });
      
      const sendBtn = document.getElementById('voice-send-btn');
      if (sendBtn) {
        sendBtn.style.display = 'flex';
      }
      
      const actionBtn = document.getElementById('voice-action-btn');
      if (actionBtn) {
        actionBtn.className = 'btn-primary ripple';
        actionBtn.style.background = '#00bcd4';
        actionBtn.style.color = 'black';
        actionBtn.innerHTML = `🎙️ Re-Record`;
      }
      
      const statusText = document.getElementById('voice-status-text');
      if (statusText) {
        statusText.textContent = 'RECORDING COMPLETE - READY TO SEND';
        statusText.style.color = '#00bcd4';
      }
      
      stopRecordingTimer();
      stopVisualizerAnimation();
    };

    recorder.start(100);
    window.recordingStartTime = Date.now();
    
    const actionBtn = document.getElementById('voice-action-btn');
    if (actionBtn) {
      actionBtn.className = 'btn-primary ripple';
      actionBtn.style.background = '#ff0000';
      actionBtn.style.color = 'white';
      actionBtn.innerHTML = `⏹️ Stop Recording`;
    }

    const statusText = document.getElementById('voice-status-text');
    if (statusText) {
      statusText.textContent = 'RECORDING LIVE... SPEAK NOW';
      statusText.style.color = '#ff4a4a';
    }

    const sendBtn = document.getElementById('voice-send-btn');
    if (sendBtn) sendBtn.style.display = 'none';

    startRecordingTimer();
    startVisualizerAnimation();

  } catch (err) {
    console.error('Failed to start voice recording:', err);
    window.showToast(err.message || 'Microphone access denied or not supported.', 'error');
    resetVoiceUI();
  }
}

function stopVoiceRecording() {
  if (window.mediaRecorder && window.mediaRecorder.state === 'recording') {
    window.mediaRecorder.stop();
  }
}

function startRecordingTimer() {
  stopRecordingTimer();
  const timerText = document.getElementById('voice-timer');
  const maxDuration = 60; // 60 seconds (1 minute limit)

  window.voiceTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - window.recordingStartTime) / 1000);
    const remaining = maxDuration - elapsed;

    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    const maxMins = String(Math.floor(maxDuration / 60)).padStart(2, '0');
    const maxSecs = String(maxDuration % 60).padStart(2, '0');
    
    if (timerText) {
      timerText.textContent = `${mins}:${secs} / ${maxMins}:${maxSecs}`;
      if (remaining <= 10) {
        timerText.style.color = '#ff0000';
        timerText.style.fontWeight = '900';
      } else {
        timerText.style.color = '#ff4a4a';
      }
    }

    if (elapsed >= maxDuration) {
      console.log('[Voice] Reached 60s limit. Auto-stopping...');
      stopVoiceRecording();
    }
  }, 200);
}

function stopRecordingTimer() {
  if (window.voiceTimerInterval) {
    clearInterval(window.voiceTimerInterval);
    window.voiceTimerInterval = null;
  }
}

let visualizerInterval = null;

function startVisualizerAnimation() {
  stopVisualizerAnimation();
  const vizBars = document.getElementById('voice-visualizer-bars');
  if (!vizBars) return;
  
  vizBars.innerHTML = '';
  const numBars = 18;
  for (let i = 0; i < numBars; i++) {
    const bar = document.createElement('div');
    bar.style.width = '6px';
    bar.style.height = '10px';
    bar.style.background = '#ff4a4a';
    bar.style.borderRadius = '3px';
    bar.style.transition = 'height 0.08s ease';
    vizBars.appendChild(bar);
  }
  
  visualizerInterval = setInterval(() => {
    const bars = vizBars.querySelectorAll('div');
    bars.forEach(bar => {
      const heightPercent = Math.floor(Math.random() * 80) + 10;
      bar.style.height = `${heightPercent}%`;
      if (heightPercent > 70) {
        bar.style.background = '#ff0000';
      } else if (heightPercent > 40) {
        bar.style.background = '#ff7b00';
      } else {
        bar.style.background = '#ff4a4a';
      }
    });
  }, 100);
}

function stopVisualizerAnimation() {
  if (visualizerInterval) {
    clearInterval(visualizerInterval);
    visualizerInterval = null;
  }
  const vizBars = document.getElementById('voice-visualizer-bars');
  if (vizBars) {
    vizBars.innerHTML = '';
  }
}

async function sendVoiceToAI() {
  const dateInput = document.getElementById('day-date-input');
  const selectedDate = dateInput ? dateInput.value : '';
  const exists = window.allDays && window.allDays.some(d => d.date === selectedDate);
  if (exists) {
    window.showToast(`A daily card for ${selectedDate} already exists! Cannot parse audio.`, 'error');
    return;
  }

  if (!window.voiceAudioBlob) {
    window.showToast('Please record audio first.', 'error');
    return;
  }

  // Lock the modal so user cannot close during processing
  window.isScanInProgress = true;
  const lockBanner = document.getElementById('scan-lock-banner');
  if (lockBanner) {
    const textSpan = lockBanner.querySelector('span');
    if (textSpan) textSpan.innerHTML = `Voice parsing in progress — <strong>do not close</strong> or your credit will be lost.`;
    lockBanner.style.display = 'flex';
  }

  const modalCloseBtn = document.querySelector('#modal-add-day .modal-close');
  if (modalCloseBtn) {
    modalCloseBtn.disabled = true;
    modalCloseBtn.style.opacity = '0.35';
    modalCloseBtn.style.cursor = 'not-allowed';
  }

  const actionBtn = document.getElementById('voice-action-btn');
  const sendBtn = document.getElementById('voice-send-btn');
  const cancelBtn = document.getElementById('voice-cancel-btn');
  const statusText = document.getElementById('voice-status-text');

  if (actionBtn) actionBtn.disabled = true;
  if (cancelBtn) cancelBtn.disabled = true;
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = `
      <span style="display:flex;align-items:center;gap:8px;">
        <span class="spinner-ring" style="width:13px;height:13px;border-width:2px;border-color:#1a0008 transparent transparent transparent;flex-shrink:0;"></span>
        <span style="font-weight:800;">Parsing Speech...</span>
      </span>
    `;
  }
  if (statusText) {
    statusText.textContent = 'TRANSCRIBING & STRUCTURING CHECKLIST...';
    statusText.style.color = '#ffea00';
  }

  try {
    // Step 1: Request token and AI service URL from Vercel backend
    const authRes = await window.apiFetch(`${window.API}/api/ai/authorize-voice-to-task`, {
      method: 'POST'
    });

    if (!authRes || !authRes.generationToken) {
      throw new Error('Failed to obtain voice parse authorization from server.');
    }

    if (authRes && typeof authRes.generationsLeft !== 'undefined') {
      window.voiceGenerationsLeft = authRes.generationsLeft;
      window.voiceLimit = authRes.limit;
      updateVoiceButtonText();
    }

    const { generationToken, aiServiceUrl } = authRes;

    // Step 2: Upload audio directly to Render AI service
    const formData = new FormData();
    // Dynamically determine the correct extension based on the actual Blob MIME type
    let voiceExt = 'webm';
    if (window.voiceAudioBlob && window.voiceAudioBlob.type) {
      const mime = window.voiceAudioBlob.type.toLowerCase();
      if (mime.includes('mp4') || mime.includes('m4a')) {
        voiceExt = 'mp4';
      } else if (mime.includes('ogg')) {
        voiceExt = 'ogg';
      } else if (mime.includes('wav')) {
        voiceExt = 'wav';
      }
    }
    formData.append('audio', window.voiceAudioBlob, `voice-recording.${voiceExt}`);

    const aiResponse = await fetch(`${aiServiceUrl}/api/ai/voice-to-task`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${generationToken}`
      },
      body: formData
    });

    if (!aiResponse.ok) {
      const errorBody = await aiResponse.json().catch(() => ({}));
      const errorMsg = errorBody.details || errorBody.error || errorBody.message || `Render AI Service returned status ${aiResponse.status}`;
      throw new Error(errorMsg);
    }

    const parsedData = await aiResponse.json();

    if (!parsedData || !parsedData.categories || !Array.isArray(parsedData.categories) || parsedData.categories.length === 0 || parsedData.categories.every(c => !c.tasks || c.tasks.length === 0)) {
      throw new Error('No readable tasks or categories were detected in your voice recording. Please speak clearly and describe your tasks.');
    }

    // Step 3: Populate modal UI
    const builder = document.getElementById('categories-builder');
    if (builder) {
      builder.innerHTML = '';
      window.categoryCount = 0;

      parsedData.categories.forEach(cat => {
        const idx = window.categoryCount++;
        const item = document.createElement('div');
        item.className = 'category-builder-item';
        item.id = `cat-build-${idx}`;
        item.innerHTML = `
          <div class="cat-top-row">
            <input type="text" class="form-control" placeholder="Category name (e.g. Work, Fitness...)" id="cat-name-${idx}" value="${window.escHtml ? window.escHtml(cat.name) : cat.name}" />
            <button class="btn-remove" onclick="removeCategoryField(${idx})" title="Remove"><i data-lucide="trash-2"></i></button>
          </div>
          <div class="tasks-builder" id="tasks-build-${idx}"></div>
          <button class="btn-ghost ripple" style="font-size:12px;padding:6px 12px;border-radius:8px;" onclick="addTaskField(${idx})"><i data-lucide="plus"></i> Add Task</button>
        `;
        builder.appendChild(item);
        if (window.lucide) lucide.createIcons({ root: item });

        const tasksBuilder = document.getElementById(`tasks-build-${idx}`);
        if (cat.tasks && cat.tasks.length > 0) {
          cat.tasks.forEach(task => {
            const taskTitle = typeof task === 'object' ? task.title : task;
            const row = document.createElement('div');
            row.className = 'task-input-row';
            row.innerHTML = `
              <input type="text" class="form-control" placeholder="Task title..." value="${window.escHtml ? window.escHtml(taskTitle) : taskTitle}" />
              <button class="btn-remove" onclick="this.parentElement.remove(); if (window.validateAddDayForm) window.validateAddDayForm();" title="Remove"><i data-lucide="trash-2"></i></button>
            `;
            tasksBuilder.appendChild(row);
            if (window.lucide) lucide.createIcons({ root: row });
          });
        } else {
          addTaskField(idx);
        }
      });

      if (typeof validateAddDayForm === 'function') {
        validateAddDayForm();
      }
      window.showToast('Voice parsed and checklist populated!', 'success');
      
      document.getElementById('voice-record-container').style.display = 'none';
      document.getElementById('voice-record-btn').style.display = 'flex';
      resetVoiceUI();
    }
  } catch (err) {
    console.error('Failed to parse voice to tasks:', err);
    window.showToast(err.message || 'Failed to process audio.', 'error');
    if (statusText) {
      statusText.textContent = 'ERROR ENCOUNTERED';
      statusText.style.color = '#ff4a4a';
    }
  } finally {
    window.isScanInProgress = false;
    if (lockBanner) lockBanner.style.display = 'none';

    if (modalCloseBtn) {
      modalCloseBtn.disabled = false;
      modalCloseBtn.style.opacity = '';
      modalCloseBtn.style.cursor = '';
    }

    if (actionBtn) actionBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = `🚀 Send to AI`;
    }
  }
}

function resetVoiceUI() {
  const actionBtn = document.getElementById('voice-action-btn');
  const sendBtn = document.getElementById('voice-send-btn');
  const statusText = document.getElementById('voice-status-text');
  const timerText = document.getElementById('voice-timer');
  const vizBars = document.getElementById('voice-visualizer-bars');

  if (actionBtn) {
    actionBtn.className = 'btn-primary ripple';
    actionBtn.style.background = '#ff4a4a';
    actionBtn.style.color = 'white';
    actionBtn.innerHTML = `🔴 Start Recording`;
    actionBtn.disabled = false;
  }
  if (sendBtn) sendBtn.style.display = 'none';
  if (statusText) {
    statusText.textContent = 'READY TO RECORD';
    statusText.style.color = '#0f0';
  }
  if (timerText) {
    timerText.textContent = '00:00 / 01:00';
    timerText.style.color = 'var(--text)';
  }
  if (vizBars) vizBars.innerHTML = '';
  
  stopRecordingTimer();
  if (window.mediaRecorder && window.mediaRecorder.state !== 'inactive') {
    try {
      window.mediaRecorder.stop();
    } catch(e){}
  }
  window.mediaRecorder = null;
  window.audioChunks = [];
  window.voiceAudioBlob = null;
}

// ==========================================
// GRACE STREAK-PROTECTION SYSTEM LOGIC
// ==========================================

async function applyGrace(dayId) {
  const modal = document.getElementById('modal-confirm-grace');
  const quotaBadge = document.getElementById('grace-modal-quota-badge');
  const confirmBtn = document.getElementById('confirm-grace-submit-btn');
  
  if (!modal || !quotaBadge || !confirmBtn) return;

  // Set the confirm button's onclick to point to the resolved dayId
  confirmBtn.onclick = async () => {
    await confirmApplyGrace(dayId);
  };

  quotaBadge.textContent = 'checking...';
  quotaBadge.style.color = '#c3ffb3';
  confirmBtn.disabled = true;

  // Open the neobrutalist modal
  window.openModal('modal-confirm-grace');

  try {
    // Fetch fresh Grace limits from Vercel backend
    const res = await window.apiFetch(`${window.API}/api/days/grace-limits`);
    if (res && typeof res.graceLeft !== 'undefined') {
      window.graceLeft = res.graceLeft;
      window.graceLimit = res.limit;
      quotaBadge.textContent = `${res.graceLeft}/${res.limit} left`;
      
      if (res.graceLeft > 0) {
        confirmBtn.disabled = false;
        quotaBadge.style.color = '#c3ffb3';
      } else {
        confirmBtn.disabled = true;
        quotaBadge.style.color = '#ff6b6b';
        window.showToast('You have used all your monthly grace credits!', 'error');
      }
    } else {
      quotaBadge.textContent = 'Error fetching';
      quotaBadge.style.color = '#ff6b6b';
    }
  } catch (err) {
    console.error('Failed to fetch monthly grace limits:', err);
    quotaBadge.textContent = 'Offline';
    quotaBadge.style.color = '#ff6b6b';
  }
}

async function confirmApplyGrace(dayId) {
  const confirmBtn = document.getElementById('confirm-grace-submit-btn');
  const originalText = confirmBtn.innerHTML;
  
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = `
    <span style="display:flex;align-items:center;gap:6px;">
      <span class="spinner-ring" style="width:12px;height:12px;border-width:2px;border-color:#1a0008 transparent transparent transparent;flex-shrink:0;"></span>
      <span>Applying...</span>
    </span>
  `;

  try {
    // Post to the Vercel backend to apply Grace
    const res = await window.apiFetch(`${window.API}/api/days/${dayId}/apply-grace`, {
      method: 'POST'
    });

    if (!res || !res.day) {
      throw new Error(res.message || 'Failed to apply Grace streak protection.');
    }

    // Success! Update in-memory allDays list
    const dayIndex = window.allDays.findIndex(d => d._id === dayId);
    if (dayIndex !== -1) {
      window.allDays[dayIndex].graceApplied = true;
    }

    // Save in local database for offline persistence
    const localDay = window.allDays.find(d => d._id === dayId);
    if (localDay) {
      localDay.lastLocalEdit = Date.now();
      await window.localDb.days.put(localDay);
    }

    // Update global limits state
    if (typeof res.graceLeft !== 'undefined') {
      window.graceLeft = res.graceLeft;
      window.graceLimit = res.limit;
    }

    // Update streak on UI
    if (typeof res.streak !== 'undefined') {
      const streakVal = document.getElementById('current-streak-val');
      if (streakVal) {
        streakVal.textContent = res.streak;
      }
    }

    window.closeModal('modal-confirm-grace');
    window.showToast('Grace Day applied! Past card unlocked permanently.', 'success');

    // Trigger full rerender of the card list to immediately show "GRACED" status and make it editable!
    if (typeof renderDays === 'function') {
      renderDays();
    }

  } catch (err) {
    console.error('Failed to apply grace day:', err);
    window.showToast(err.message || 'Failed to apply Grace Day.', 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = originalText;
  }
}

function triggerNeoConfetti(x, y) {
  if (!window.gsap) return;
  const container = document.body;
  const colors = ['#facc15', '#f97316', '#ec4899', '#a855f7', '#14b8a6', '#22c55e', '#ef4444'];
  const particleCount = 28;

  for (let i = 0; i < particleCount; i++) {
    const p = document.createElement('div');
    p.style.position = 'fixed';
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.width = `${gsap.utils.random(8, 14)}px`;
    p.style.height = `${gsap.utils.random(8, 14)}px`;
    p.style.backgroundColor = gsap.utils.random(colors);
    p.style.border = '2px solid #0a0a0a';
    p.style.boxShadow = '2px 2px 0px #0a0a0a';
    p.style.borderRadius = gsap.utils.random(['0px', '3px', '50%']);
    p.style.pointerEvents = 'none';
    p.style.zIndex = '999999';
    container.appendChild(p);

    const angle = gsap.utils.random(0, Math.PI * 2);
    const velocity = gsap.utils.random(60, 160);
    const destX = Math.cos(angle) * velocity;
    const destY = Math.sin(angle) * velocity - gsap.utils.random(30, 70);

    gsap.fromTo(p,
      {
        scale: 0,
        rotation: 0,
        rotationX: 0,
        rotationY: 0,
        x: 0,
        y: 0
      },
      {
        scale: gsap.utils.random(0.7, 1.3),
        x: destX,
        y: destY,
        rotation: gsap.utils.random(180, 540),
        rotationX: gsap.utils.random(90, 360),
        rotationY: gsap.utils.random(90, 360),
        duration: gsap.utils.random(0.5, 0.9),
        ease: 'power2.out',
        onComplete: () => {
          gsap.to(p, {
            y: destY + gsap.utils.random(100, 180),
            opacity: 0,
            scale: 0.2,
            duration: 0.55,
            ease: 'power1.in',
            onComplete: () => p.remove()
          });
        }
      }
    );
  }
}

// Bind to window
window.evaluateDaysDistractions = evaluateDaysDistractions;
window.deleteDailySummary = deleteDailySummary;
window.toggleAiRecapExpansion = toggleAiRecapExpansion;
window.triggerTaskImageScan = triggerTaskImageScan;
window.triggerVoiceToTask = triggerVoiceToTask;
window.updateVoiceButtonText = updateVoiceButtonText;
window.applyGrace = applyGrace;

console.log("[Module] days.js loaded and Days functions bound to window");
