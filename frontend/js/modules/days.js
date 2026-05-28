// ── Days Module ────────────────────────────────────────────
console.log("[Module] days.js initializing...");

// ── Days ───────────────────────────────────────────────────
async function loadDays(page = 1) {
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
        if (loadingEl) loadingEl.innerHTML = '';
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
            await window.localDb.weeklySummaries.bulkPut(freshSummaries);
          }
        }
      } catch (err) {
        console.warn('Failed to load weekly summaries from server:', err);
      }
    }

    if (data && typeof data === 'object' && !Array.isArray(data)) {
      if (page === 1) {
        // Preserve local-only changes (those not yet synced) — don't overwrite them
        const pendingDayItems = await localDb.syncQueue
          .filter(x => x.entity === 'days')
          .toArray();
        const pendingIds = new Set(pendingDayItems.map(q => q.targetId).filter(Boolean));
        const pendingLocalIds = new Set(pendingDayItems.map(q => q.localId).filter(Boolean));

        // Merge: use server data for synced days, keep local data for pending days
        const serverDays = data.days;
        const safeToUpdate = serverDays.filter(d => !pendingIds.has(d._id));
        await localDb.days.bulkPut(safeToUpdate);

        // Build final allDays: server data + locally modified days
        const localPendingDays = await Promise.all(
          [...pendingIds, ...pendingLocalIds].map(id => localDb.days.get(id))
        );
        const localPendingMap = new Map();
        localPendingDays.filter(Boolean).forEach(d => localPendingMap.set(d._id, d));

        window.allDays = serverDays.map(sd => localPendingMap.get(sd._id) || sd);
        // Also include any locally-created days (temp IDs) not on server
        for (const [id, day] of localPendingMap) {
          if (!window.allDays.find(d => d._id === id)) {
            window.allDays.push(day);
          }
        }
      } else {
        window.allDays.push(...data.days);
        await localDb.days.bulkPut(data.days);
      }
      
      window.backendStreak = data.streak || 0;
      window.hasMoreDays = data.hasMore || false;
      window.totalDaysCountInDb = data.total || window.allDays.length;
    } else {
      // Fallback for non-paginated window.API
      if (page === 1) {
        window.allDays = data;
        await localDb.days.clear();
         await localDb.days.bulkAdd(data);
      } else {
        window.allDays.push(...data);
        await localDb.days.bulkPut(data);
      }
      window.hasMoreDays = false;
    }

    const isLoadMore = page > 1;
    window.currentPage = page;
    renderDays(isLoadMore);
    updateStreak();
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

function buildDayCard(day, preLoadedAchievements = null) {
  const today   = window.todayStr();
  const cardDateNormalized = (day.date || '').split('T')[0];
  const isToday = cardDateNormalized === today;
  const isFuture = cardDateNormalized > today;
  const pct     = window.calcProgress(day.categories);

  const card = document.createElement('div');
  card.className = isToday ? 'day-card today-card' : 'day-card';
  card.id = `day-card-${day._id}`;
  card.setAttribute('data-date', cardDateNormalized);

  // Build categories HTML
  let categoriesHTML = '';
  for (const cat of day.categories) {
    let tasksHTML = '';
    for (const task of cat.tasks) {
      if (isToday) {
        tasksHTML += `
          <div class="task-item">
            <input type="checkbox" class="task-checkbox"
              ${task.completed ? 'checked' : ''}
              onchange="toggleTask('${day._id}','${cat._id}','${task._id}',this.checked)"
              id="chk-${task._id}" />
            <label class="task-title" for="chk-${task._id}">${window.escHtml(task.title)}</label>
            <button class="btn-del-task" onclick="deleteTask('${day._id}','${cat._id}','${task._id}')" title="Delete task"><i data-lucide="trash-2"></i></button>
          </div>`;
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
    const editCatBtn = isToday
      ? `<button class="btn-edit-cat ripple" onclick="openEditCategoryModal('${day._id}','${cat._id}')" title="Edit category"><i data-lucide="edit-3"></i></button>`
      : '';
    const delCatBtn = isToday
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
  const summaryInner = isToday
    ? `<textarea class="summary-edit" id="summary-edit-${day._id}" rows="3">${window.escHtml(day.summary || '')}</textarea>
       <button class="summary-save-btn ripple" onclick="saveSummary('${day._id}')"><i data-lucide="save"></i> Save Note</button>`
    : `<p class="summary-text">${window.escHtml(day.summary || '(no notes for this day)')}</p>`;

  // Add category button (today only)
  const addCatBtn = isToday
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
  } else if (isToday) {
    scratchpadHeaderBtnHTML = `
      <button class="card-scratchpad-btn card-scratchpad-create ripple" onclick="openScratchpad('${day._id}')" title="Add Scratchpad">
        <i data-lucide="paintbrush"></i>
      </button>
    `;
  }

  // AI Daily Recap Section HTML
  let aiRecapHTML = '';
  const daySummary = day.summary || '';
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

  card.innerHTML = `
    <div class="card-header">
      <div class="card-date-wrap">
        <span class="card-date">${window.formatDisplayDate(day.date)}</span>
        <span class="card-day-name">${window.getDayName(day.date)}</span>
      </div>
      <div class="card-header-actions" style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
        ${scratchpadHeaderBtnHTML}
        <span class="card-badge ${isToday ? 'badge-today' : (isFuture ? 'badge-future' : 'badge-past')}">${isToday ? '<i data-lucide="sparkles"></i> Today' : (isFuture ? '<i data-lucide="clock"></i> Future' : 'Past')}</span>
      </div>
    </div>

    <div class="progress-section">
      <div class="progress-meta">
        <span class="progress-label">Progress</span>
        <span class="progress-pct" id="pct-text-${day._id}" style="color:${window.progressColor(pct)}">${pct}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill ${window.progressClass(pct)}" id="pct-fill-${day._id}" style="width:0%"></div>
      </div>
    </div>

    <div class="categories-list" id="cat-list-${day._id}">
      ${categoriesHTML || '<p style="color:var(--text-3);font-size:14px;padding:4px 0">No categories yet.</p>'}
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
  let day = window.allDays.find(d => d._id === dayId);
  let cat, task;

  if (day) {
    cat = day.categories.find(c => c._id === catId);
    if (cat) {
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

  // Use the ID that actually corresponds to elements currently in the DOM
  const targetDomId = document.getElementById(`pct-fill-${dayId}`) ? dayId : day._id;
  updateProgressBar(targetDomId, day.categories);

  // Micro animation on checkbox
  if (window.gsap && checked) {
    const chk = document.getElementById(`chk-${taskId}`);
    if (chk) gsap.fromTo(chk, { scale: 1.35 }, { scale: 1, duration: 0.3, ease: 'back.out(2)' });
  }

  try {
    // 1. Update Local DB immediately
    await window.localDb.days.put(day);
    
    // 2. Add to Sync Queue (using the resolved real ID)
    window.syncManager.addToQueue('PUT', 'days', day._id, { categories: day.categories });
    
    updateStreak();
  } catch (err) {
    console.error('Offline write error:', err);
    // Even if local write fails, we try to keep going
  }
}

// [Phase 3 Migrated: Lines 774-929 moved to api.js]

// [Phase 3 Migrated: Lines 931-969 moved to api.js]

// ── Delete Day Card Completely ──────────────────────────────
async function deleteDayCard(dayId) {
  const day = window.allDays.find(d => d._id === dayId);
  
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

  // Strict check to prevent past days editing
  if (day.date !== window.todayStr()) {
    window.showToast('Cannot modify past days', 'error');
    return;
  }

  const catIndex = day.categories.findIndex(c => c._id === catId);
  if (catIndex < 0) return;

  const catName = day.categories[catIndex].name;
  if (!confirm(`Delete the "${catName}" category and all its tasks?`)) return;

  // 1. Update UI and Local DB instantly
  day.categories.splice(catIndex, 1);

  if (day.categories.length === 0) {
    // If no categories left, delete the card completely!
    await deleteDayCard(dayId);
    return;
  }

  updateProgressBar(dayId, day.categories);
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

  // Strict check to prevent past days editing
  if (day.date !== window.todayStr()) {
    window.showToast('Cannot modify past days', 'error');
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
  await window.localDb.days.put(day);

  // 2. Queue for sync
  window.syncManager.addToQueue('PUT', 'days', dayId, { categories: day.categories });

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
  if (day) day.summary = summary;

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
      // Cache for next time
      await window.localDb.badges.clear();
      await window.localDb.badges.bulkAdd(badges);
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
let categoryCount = 0;

function openAddDayModal() {
  document.getElementById('day-date-input').value    = window.todayStr();
  document.getElementById('day-summary-input').value = '';
  document.getElementById('categories-builder').innerHTML = '';
  categoryCount = 0;
  addCategoryField();
  openModal('modal-add-day');
}

function addCategoryField() {
  const idx = categoryCount++;
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
    gsap.to(el, { opacity: 0, height: 0, marginBottom: 0, duration: 0.2, ease: 'power2.in', onComplete: () => el.remove() });
  } else {
    el.remove();
  }
}

function addTaskField(catIdx) {
  const builder = document.getElementById(`tasks-build-${catIdx}`);
  const row = document.createElement('div');
  row.className = 'task-input-row';
  row.innerHTML = `
    <input type="text" class="form-control" placeholder="Task title..." />
    <button class="btn-remove" onclick="this.parentElement.remove()" title="Remove"><i data-lucide="trash-2"></i></button>
  `;
  builder.appendChild(row);
  if (window.lucide) lucide.createIcons({ root: row });
}

async function submitAddDay() {
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

  btn.textContent = 'Creating...';
  const tempId = `temp_${Date.now()}`;
  const localDay = { _id: tempId, date, categories, summary, userId: localStorage.getItem('userId'), tasks: [] };

  try {
    // 1. Update UI and Local DB instantly (Optimistic)
    window.allDays.push(localDay);
    window.totalDaysCountInDb++;
    await window.localDb.days.add(localDay);
    closeModal('modal-add-day');
    renderDays();

    // 2. Queue for sync
    window.syncManager.addToQueue('POST', 'days', null, { date, categories, summary }, tempId);

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
    await window.localDb.days.put(day);
    // 2. Queue Sync
    window.syncManager.addToQueue('PUT', 'days', dayId, { categories: updatedCategories });

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
  if (!day || day.date !== window.todayStr()) {
    window.showToast('You can only edit today\'s card.', 'warn');
    return;
  }
  const cat = day.categories.find(c => c._id === catId);
  if (!cat) return;

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
    await window.localDb.days.put(day);
    // 2. Queue Sync
    window.syncManager.addToQueue('PUT', 'days', dayId, { categories: day.categories });

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
function openEditGoalModal(goalId) {
  const goal = window.allGoals.find(g => g._id === goalId);
  if (!goal || window.daysLeft(goal.deadline) < 0) {
    window.showToast('This goal is overdue and can no longer be edited.', 'warn');
    return;
  }

  window.editingGoalId = goalId;
  const titleInput = document.getElementById('edit-goal-title');
  titleInput.value = goal.title;
  titleInput.setAttribute('readonly', 'true');
  titleInput.style.background = 'var(--bg-readonly)';
  titleInput.style.cursor = 'not-allowed';

  document.getElementById('edit-goal-deadline-display').innerHTML =
    `<i data-lucide="calendar"></i> Deadline: ${window.formatDisplayDate(goal.deadline.split('T')[0])}`;
  if (window.lucide) lucide.createIcons({ root: document.getElementById('edit-goal-deadline-display') });

  const builder = document.getElementById('edit-goal-tasks-builder');
  builder.innerHTML = '';
  for (const task of goal.tasks) {
    addEditGoalTaskField(task.title, task._id, task.completed);
  }
  if (!goal.tasks.length) addEditGoalTaskField();
  openModal('modal-edit-goal');
}

function addEditGoalTaskField(title = '', taskId = '', completed = false) {
  const builder = document.getElementById('edit-goal-tasks-builder');
  const row = document.createElement('div');
  row.className = 'task-input-row';
  row.dataset.taskId    = taskId;
  row.dataset.completed = completed ? 'true' : 'false';

  const isExisting = taskId !== '';
  const inputAttrs = isExisting ? 'readonly style="background:var(--bg-readonly); cursor:not-allowed;"' : '';
  const removeBtn = isExisting ? '' : `<button class="btn-remove" onclick="this.parentElement.remove()" title="Remove"><i data-lucide="trash-2"></i></button>`;

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
  if (!title) { window.showToast('Goal title is required.', 'warn'); return; }

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

  const btn = document.getElementById('submit-edit-goal-btn');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    const updated = await window.apiFetch(`${window.API}/api/goals/${goalId}`, {
      method: 'PUT',
      body: JSON.stringify({ title, tasks: newTasks }),
    });
    const idx = window.allGoals.findIndex(g => g._id === goalId);
    if (idx !== -1) window.allGoals[idx] = updated;
    closeModal('modal-edit-goal');
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
    window.showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Changes';
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

  if (!limits || !limits.enabled || !limits.apps || limits.apps.length === 0) {
    document.querySelectorAll('.app-distraction-block').forEach(el => el.remove());
    return;
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

    const cardTime = new Date(cardDate).getTime();
    const todayTime = new Date(today).getTime();
    const diffDays = Math.round((todayTime - cardTime) / (24 * 60 * 60 * 1000));

    let top5 = [];
    let totalMinutes = 0;
    let showStats = false;
    let rawStats = null;

    if (cardDate === today) {
      // Exclude today's card from showing screen time stats (only display from yesterday onwards)
      showStats = false;
    } else if (diffDays >= 1 && diffDays <= 7) {
      // Last 7 days: display pre-saved stats if they exist to avoid redundant DB/network hits
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
          window.localDb.days.put(day).catch(err => console.error("Error saving raw stats:", err));
          window.syncManager.addToQueue('PUT', 'days', day._id, { screenTimeStats: rawStats });
        }
        showStats = true;
      }
    } else if (diffDays >= 8) {
      // 8th day and older: display frozen stats if they exist
      if (day.screenTimeStats) {
        showStats = true;
        if (Array.isArray(day.screenTimeStats)) {
          top5 = day.screenTimeStats;
          top5.forEach(app => {
            totalMinutes += app.actualMinutes || 0;
          });
        } else if (typeof day.screenTimeStats === 'object') {
          rawStats = day.screenTimeStats;
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
    showToast('Offline: Cannot delete AI recap.', 'warn');
    return;
  }
  if (!confirm("Are you sure you want to delete this AI Daily Insight?")) return;
  const day = window.allDays.find(d => d._id === dayId);
  if (day) {
    day.summary = "";
    try {
      // 1. Update Local DB
      await window.localDb.days.put(day);
      // 2. Queue Sync
      window.syncManager.addToQueue('PUT', 'days', dayId, { summary: "" });
      showToast('AI Daily Insights deleted successfully!', 'success');
      
      // Re-render only this Day card smoothly
      const cardEl = document.getElementById(`day-card-${dayId}`);
      if (cardEl) {
        const preLoadedAchs = (typeof batchAchievements !== 'undefined' && batchAchievements) 
          ? batchAchievements.filter(a => a.dayId === dayId) 
          : [];
        cardEl.replaceWith(buildDayCard(day, preLoadedAchs));
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

// Bind to window
window.evaluateDaysDistractions = evaluateDaysDistractions;
window.deleteDailySummary = deleteDailySummary;
window.toggleAiRecapExpansion = toggleAiRecapExpansion;

console.log("[Module] days.js loaded and Days functions bound to window");
