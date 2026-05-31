// ── Goals Module ─────────────────────────────────────────
console.log("[Module] goals.js initializing...");

// ── Goals ──────────────────────────────────────────────────
let _lastGoalsLoad = 0;
async function loadGoals() {
  window.visibleGoalsCount = 10;
  const localDb = window.localDb;
  if (!localDb) return;
  const container = document.getElementById('goals-container');

  // 1. STALE: Load from IndexedDB
  try {
    const cached = await localDb.goals.toArray();
    if (cached.length > 0) {
      window.allGoals = cached;
      renderGoals();
    } else {
      container.innerHTML = `
        <div style="text-align:center; padding:40px; color:var(--text-muted);">
          <p style="font-weight:700; margin-bottom:10px;">No local data found.</p>
          <p style="font-size:12px;">Syncing with server...</p>
          <div class="loading-spinner" style="margin:20px auto; transform:scale(0.8);"><div class="spinner-ring"></div></div>
        </div>`;
    }
  } catch (err) {
    console.warn('Dexie read error:', err);
  }

  // 2. REVALIDATE: Load from Server (Throttled & Only if online)
  const now = Date.now();
  if (now - _lastGoalsLoad < 30000 && window.allGoals.length > 0) {
    return; // Don't re-fetch if loaded in last 30s
  }

  if (!navigator.onLine) {
    if (window.allGoals.length > 0) {
      window.showToast('Offline Mode: Using cached goals.', 'info');
    } else {
      renderGoals();
    }
    return;
  }
  _lastGoalsLoad = now;

  try {
    const data = await window.apiFetch(`${window.API}/api/goals`);
    if (data) {
      // Preserve local-only changes (those not yet synced) — don't overwrite them
      const pendingGoalItems = await localDb.syncQueue
        .filter(x => x.entity === 'goals')
        .toArray();
      const pendingIds = new Set(pendingGoalItems.map(q => q.targetId).filter(Boolean));
      const pendingLocalIds = new Set(pendingGoalItems.map(q => q.localId).filter(Boolean));

      const serverGoals = data;
      const safeToUpdate = serverGoals.filter(g => !pendingIds.has(g._id));
      const localGoals = await localDb.goals.toArray();
      const toDelete = localGoals
        .filter(g => !pendingIds.has(g._id) && !pendingLocalIds.has(g._id))
        .map(g => g._id);
      
      await localDb.goals.bulkDelete(toDelete);
      const validGoals = (safeToUpdate || []).filter(g => g && typeof g === 'object' && g._id);
      await localDb.goals.bulkPut(validGoals);

      // Reconstruct final window.allGoals in memory: server data + locally modified goals
      const localPendingGoals = await Promise.all(
        [...pendingIds, ...pendingLocalIds].map(id => localDb.goals.get(id))
      );
      const localPendingMap = new Map();
      localPendingGoals.filter(Boolean).forEach(g => localPendingMap.set(g._id, g));

      window.allGoals = serverGoals.map(sg => localPendingMap.get(sg._id) || sg);
      for (const [id, goal] of localPendingMap) {
        if (!window.allGoals.find(g => g._id === id)) {
          window.allGoals.push(goal);
        }
      }
      
      // Sort goals using unified utility
      window.sortGoals();

      renderGoals();
    }
  } catch (err) {
    console.warn('Background goal refresh failed:', err);
    // If we have cached data, we stay silent or show a small toast
    if (window.allGoals.length === 0) {
      let errorMessage = '<i data-lucide="alert-triangle"></i> Failed to load goals.';
      if (err.message && err.message.includes('timed out')) {
        errorMessage = '<i data-lucide="clock"></i> Server unreachable. Using offline mode.';
      }
      container.innerHTML = `<p style="color:#ef4444;text-align:center">${errorMessage}</p>`;
    }
  }
}

function renderGoals() {
  const container = document.getElementById('goals-container');
  container.innerHTML = '';

  if (!window.allGoals.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon"><i data-lucide="target"></i></span>
        <h3>No goals yet</h3>
        <p>Set a long-term goal to stay focused on what matters.</p>
      </div>`;
    if (window.lucide) lucide.createIcons({ root: container });
    if (window.gsap) {
      const emptyEl = container.querySelector('.empty-state');
      if (emptyEl) gsap.fromTo(emptyEl, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', clearProps: 'all' });
    }
    const loadMoreBtn = document.getElementById('btn-load-more-goals');
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    return;
  }

  // Slice array for client-side pagination
  const slicedGoals = window.allGoals.slice(0, window.visibleGoalsCount);

  const fragment = document.createDocumentFragment();
  for (const goal of slicedGoals) fragment.appendChild(buildGoalCard(goal));
  container.appendChild(fragment);

  // Toggle Load More button based on remaining paginated items
  const loadMoreBtn = document.getElementById('btn-load-more-goals');
  if (loadMoreBtn) {
    loadMoreBtn.style.display = window.allGoals.length > window.visibleGoalsCount ? 'block' : 'none';
  }

  if (window.gsap) {
    gsap.from('.goal-card', { opacity: 0, y: 30, duration: 0.5, stagger: 0.09, ease: 'power3.out', clearProps: 'all' });
  }

  // Animate progress bars after insert
  for (const goal of slicedGoals) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      animateProgressBar(`gpct-fill-${goal._id}`, window.calcProgress([{ tasks: goal.tasks }]));
    }));
  }
}

function buildGoalCard(goal) {
  const pct        = window.calcProgress([{ tasks: goal.tasks }]);
  const dl         = window.daysLeft(goal.deadline);
  
  // A goal is completed if goal.completedAt is present OR if all tasks are complete
  const isComplete = goal.completedAt ? true : (pct === 100);

  // Determine whether it was completed after overdue
  let completedOverdue = false;
  let diffDays = 0;
  if (isComplete) {
    if (goal.completedAt) {
      const dlDate = new Date(goal.deadline); dlDate.setHours(0,0,0,0);
      const compDate = new Date(goal.completedAt); compDate.setHours(0,0,0,0);
      completedOverdue = compDate > dlDate;
      if (completedOverdue) {
        diffDays = Math.round((compDate - dlDate) / (1000 * 60 * 60 * 24));
      }
    } else {
      // Fallback for legacy completed goals: default to completed on-time (Green)
      completedOverdue = false;
      diffDays = 0;
    }
  }

  // ── Badge logic ──
  let dlClass, dlText;
  let cardClass = 'goal-card';

  if (isComplete) {
    if (completedOverdue) {
      dlClass = 'days-completed-overdue';
      dlText  = `Completed ${diffDays} day${diffDays === 1 ? '' : 's'} late`;
      cardClass = 'goal-card goal-completed-overdue';
    } else {
      dlClass = 'days-completed';
      dlText  = '✅ Completed!';
      cardClass = 'goal-card goal-completed';
    }
  } else if (dl < 0) {
    dlClass = 'days-overdue';
    const daysOverdue = -dl;
    if (daysOverdue > 5) {
      dlText  = 'Deadline passed. Not completed';
    } else {
      const graceLeft = 5 - daysOverdue;
      dlText  = `Grace: ${graceLeft} day${graceLeft === 1 ? '' : 's'} left`;
    }
    cardClass = 'goal-card goal-overdue';
  } else if (dl <= 2) {
    dlClass = 'days-danger';
    dlText  = `<i data-lucide="alert-circle"></i> ${dl}d left!`;
  } else if (dl <= 5) {
    dlClass = 'days-warn';
    dlText  = `<i data-lucide="clock"></i> ${dl} days left`;
  } else {
    dlClass = 'days-safe';
    dlText  = `${dl} days left`;
  }

  const card = document.createElement('div');
  card.className = cardClass;
  card.id = `goal-card-${goal._id}`;

  // Locking rules:
  // 1. Fully completed goals are locked.
  // 2. Uncompleted goals past the 5-day grace period (daysOverdue > 5, i.e. dl < -5) are completely locked.
  const isLocked = isComplete || (dl < -5);

  let tasksHTML = '';
  for (const task of goal.tasks) {
    let doneColor = 'var(--green)';
    if (isComplete && completedOverdue) {
      doneColor = 'var(--orange)';
    } else if (dl < 0 && !isComplete) {
      doneColor = 'var(--red)';
    }

    const doneStyle = task.completed ? `text-decoration:line-through;color:${doneColor};` : '';
    
    const checkboxAttrs = isLocked
      ? `${task.completed ? 'checked' : ''} disabled`
      : `${task.completed ? 'checked' : ''} onchange="toggleGoalTask('${goal._id}','${task._id}',this.checked)"`;

    tasksHTML += `
      <div class="task-item">
        <input type="checkbox" class="task-checkbox"
          ${checkboxAttrs}
          id="gtask-${task._id}" />
        <label class="task-title" for="gtask-${task._id}" style="${doneStyle}">${window.escHtml(task.title)}</label>
      </div>`;
  }

  // Show actions (Edit & Delete) only when not completed and before deadline
  const actionsHTML = (isComplete || dl < 0) ? '' : `
    <div class="goal-actions">
      <button class="btn-ghost ripple" onclick="openEditGoalModal('${goal._id}')" style="padding:7px 14px;font-size:13px;"><i data-lucide="edit-3"></i> Edit</button>
      <button class="btn-delete ripple" onclick="deleteGoal('${goal._id}')"><i data-lucide="trash-2"></i> Delete</button>
    </div>`;

  card.innerHTML = `
    <div class="goal-header">
      <span class="goal-title">${window.escHtml(goal.title)}</span>
      <div class="goal-meta">
        <span class="days-left-badge ${dlClass}">${dlText}</span>
        <span class="goal-deadline"><i data-lucide="calendar"></i> ${window.formatDisplayDate(goal.deadline.split('T')[0])}</span>
      </div>
    </div>

    <div class="progress-section">
      <div class="progress-meta">
        <span class="progress-label">Progress</span>
        <span class="progress-pct" id="gpct-text-${goal._id}" style="color:${window.progressColor(pct)}">${pct}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill ${window.progressClass(pct)}" id="gpct-fill-${goal._id}" style="width:0%"></div>
      </div>
    </div>

    <div class="categories-list">
      <div class="category-block">
        <div class="category-header">
          <span class="category-name">Subtasks</span>
          <span class="category-count">${goal.tasks.filter(t=>t.completed).length}/${goal.tasks.length}</span>
        </div>
        <div class="tasks-list" id="goal-tasks-list-${goal._id}">
          ${tasksHTML || '<p style="padding:8px 14px;font-size:13px;color:var(--text-3)">No subtasks</p>'}
        </div>
      </div>
    </div>

    ${actionsHTML}
  `;

  // Initialize Lucide icons after building the goal card
  if (window.lucide) {
    setTimeout(() => {
      lucide.createIcons({ root: card });
    }, 10);
  }

  return card;
}

async function toggleGoalTask(goalId, taskId, checked) {
  const goal = window.allGoals.find(g => g._id === goalId);
  if (!goal) return;
  const task = goal.tasks.find(t => t._id === taskId);
  if (!task) return;

  const dl = window.daysLeft(goal.deadline);

  // 1. Lockout check (if grace is over: overdue by more than 5 days, i.e., dl < -5)
  if (dl < -5 && !goal.completedAt) {
    window.showToast('The 5-day grace period has expired. No more ticking is allowed.', 'warn');
    const chk = document.getElementById(`gtask-${taskId}`);
    if (chk) chk.checked = !checked;
    return;
  }

  // Proceed with marking completion
  task.completed = checked;

  // Set/unset completedAt field
  const pctNow = window.calcProgress([{ tasks: goal.tasks }]);
  const isNowComplete = pctNow === 100;
  if (isNowComplete) {
    if (!goal.completedAt) {
      goal.completedAt = new Date().toISOString();
    }
  } else {
    goal.completedAt = null;
  }

  updateGoalProgressBar(goalId, goal.tasks);

  const label = document.querySelector(`label[for="gtask-${taskId}"]`);
  if (label) {
    label.style.textDecoration = checked ? 'line-through' : 'none';
    let doneColor = 'var(--green)';
    if (isNowComplete && dl < 0) {
      doneColor = 'var(--orange)';
    } else if (dl < 0 && !isNowComplete) {
      doneColor = 'var(--red)';
    }
    label.style.color = checked ? doneColor : '';
  }

  if (window.gsap && checked) {
    const chk = document.getElementById(`gtask-${taskId}`);
    if (chk) gsap.fromTo(chk, { scale: 1.35 }, { scale: 1, duration: 0.3, ease: 'back.out(2)' });
  }

  try {
    // 1. Update Local DB
    await window.localDb.goals.put(goal);
    // 2. Queue Sync with completedAt included
    window.syncManager.addToQueue('PUT', 'goals', goalId, { tasks: goal.tasks, completedAt: goal.completedAt });

    // Re-sort and re-render goals list dynamically to maintain sorting and animations
    window.sortGoals();
    renderGoals();

    if (isNowComplete) {
      window.showToast('🎉 Goal completed! Amazing work!', 'success');
    } else {
      window.showToast('Goal task updated locally!', 'success');
    }
  } catch (err) {
    console.error('Offline goal task toggle error:', err);
  }
}

function updateGoalProgressBar(goalId, tasks) {
  const pct  = window.calcProgress([{ tasks }]);
  const fill = document.getElementById(`gpct-fill-${goalId}`);
  const text = document.getElementById(`gpct-text-${goalId}`);
  if (fill) {
    if (window.gsap) gsap.to(fill, { width: `${pct}%`, duration: 0.5, ease: 'power2.out' });
    else fill.style.width = `${pct}%`;
    fill.className = `progress-fill ${window.progressClass(pct)}`;
  }
  if (text) {
    text.textContent = `${pct}%`;
    text.style.color  = window.progressColor(pct);
    if (window.gsap) gsap.fromTo(text, { scale: 1.15 }, { scale: 1, duration: 0.25, ease: 'back.out(2)' });
  }
}

async function deleteGoal(goalId) {
  if (!confirm('Are you sure you want to delete this goal? This will permanently delete the entire goal card and all of its tasks.')) return;
  try {
    // 1. Update UI and Local DB instantly
    window.allGoals = window.allGoals.filter(g => g._id !== goalId);
    await window.localDb.goals.delete(goalId);

    const card = document.getElementById(`goal-card-${goalId}`);
    if (card) {
      if (window.gsap) {
        gsap.to(card, { opacity: 0, y: -10, scale: 0.95, duration: 0.3, ease: 'power2.in', onComplete: () => { card.remove(); if (!window.allGoals.length) renderGoals(); } });
      } else {
        card.remove();
        if (!window.allGoals.length) renderGoals();
      }
    }
    window.showToast('Goal deleted locally.', 'info');

    // 2. Queue for sync
    window.syncManager.addToQueue('DELETE', 'goals', goalId);
  } catch (err) {
    console.error('Offline delete error:', err);
    window.showToast('Failed to delete goal locally.', 'error');
  }
}

// ── Add Goal Modal ─────────────────────────────────────────
function openAddGoalModal() {
  document.getElementById('goal-title-input').value    = '';
  document.getElementById('goal-deadline-input').value = '';
  document.getElementById('goal-tasks-builder').innerHTML = '';
  addGoalTaskField();
  openModal('modal-add-goal');
}

function addGoalTaskField() {
  const builder = document.getElementById('goal-tasks-builder');
  const row = document.createElement('div');
  row.className = 'task-input-row';
  row.innerHTML = `
    <input type="text" class="form-control" placeholder="Subtask title..." />
    <button class="btn-remove" onclick="this.parentElement.remove()" title="Remove"><i data-lucide="trash-2"></i></button>
  `;
  builder.appendChild(row);
  if (window.lucide) lucide.createIcons({ root: row });
}

async function submitAddGoal() {
  const title    = document.getElementById('goal-title-input').value.trim();
  const deadline = document.getElementById('goal-deadline-input').value.trim();
  if (!title)    { window.showToast('Goal title is required.', 'warn'); return; }
  if (!deadline) { window.showToast('Deadline is required.', 'warn'); return; }

  const taskInputs = document.querySelectorAll('#goal-tasks-builder .task-input-row input');
  const tasks = [];
  let taskIndex = 0;
  for (const inp of taskInputs) {
    const t = inp.value.trim();
    if (t) {
      tasks.push({
        _id: `temp_gtask_${Date.now()}_${taskIndex++}_${Math.random().toString(36).substring(2, 6)}`,
        title: t,
        completed: false
      });
    }
  }

  const btn = document.getElementById('submit-goal-btn');
  btn.disabled = true; btn.textContent = 'Creating...';

  const tempId = `temp_${Date.now()}`;
  const localGoal = { _id: tempId, title, deadline, tasks, userId, status: 'active', createdAt: new Date().toISOString() };

  try {
    // 1. Update UI and Local DB instantly
    window.allGoals.push(localGoal);
    window.sortGoals();
    await window.localDb.goals.add(localGoal);
    closeModal('modal-add-goal');
    renderGoals();
    window.showToast('Goal created locally!', 'success');

    // 2. Queue for sync
    window.syncManager.addToQueue('POST', 'goals', null, { title, deadline, tasks }, tempId);
  } catch (err) {
    console.error('Offline write error:', err);
  } finally {
    btn.disabled = false; btn.textContent = 'Create Goal';
  }
}

function loadMoreGoals() {
  window.visibleGoalsCount += 10;
  renderGoals();
}

function changeGoalsSort(option) {
  if (!navigator.onLine) {
    window.showToast('Sorting is disabled in offline mode.', 'warn');
    const goalsSortSelect = document.getElementById('goals-sort-select');
    if (goalsSortSelect) goalsSortSelect.value = 'default';
    return;
  }
  window.goalsSortOption = option;
  window.sortGoals();
  renderGoals();
}



// ── Goals Module Bindings ──────────────────────────────────
window.loadGoals = loadGoals;
window.renderGoals = renderGoals;
window.buildGoalCard = buildGoalCard;
window.toggleGoalTask = toggleGoalTask;
window.updateGoalProgressBar = updateGoalProgressBar;
window.deleteGoal = deleteGoal;
window.openAddGoalModal = openAddGoalModal;
window.addGoalTaskField = addGoalTaskField;
window.submitAddGoal = submitAddGoal;
window.loadMoreGoals = loadMoreGoals;
window.changeGoalsSort = changeGoalsSort;
console.log("[Module] goals.js loaded and Goals functions bound to window");
