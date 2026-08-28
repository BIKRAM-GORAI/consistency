/**
 * Consistency App - Offline Reminders and Alarm System Manager
 */

const isAndroidNative = navigator.userAgent.includes("CapacitorNative/Android");

// In-memory timers for standard web fallback
const activeWebTimers = {};

/**
 * Schedule a local reminder/alarm for a specific day checklist
 * @param {string} dayId - MongoDB ID of the Day card
 * @param {string} time - HH:MM format (e.g. "18:30")
 * @param {string} type - "notification" | "alarm"
 * @param {string} title - Alarm title
 * @param {Array<string>} selectedTasks - List of task titles selected for this reminder
 */
export async function scheduleLocalReminder(dayId, time, type, title, selectedTasks = [], date = null) {
  const id = `day_${dayId}`;
  
  if (isAndroidNative && window.Capacitor && window.Capacitor.Plugins.CustomAlarmPlugin) {
    try {
      await window.Capacitor.Plugins.CustomAlarmPlugin.scheduleAlarm({
        id,
        time,
        type,
        title,
        selectedTasks,
        date
      });
      console.log(`[Native Reminder] Scheduled alarm ${id} for ${time} on ${date} (${type})`);
    } catch (err) {
      console.error("[Native Reminder] Error scheduling alarm:", err);
    }
  } else {
    // Web Fallback
    cancelLocalReminder(dayId);
    scheduleWebNotificationFallback(id, time, title, selectedTasks, date);
  }
}

/**
 * Cancel a scheduled reminder/alarm
 * @param {string} dayId - MongoDB ID of the Day card
 */
export async function cancelLocalReminder(dayId) {
  const id = `day_${dayId}`;

  if (isAndroidNative && window.Capacitor && window.Capacitor.Plugins.CustomAlarmPlugin) {
    try {
      await window.Capacitor.Plugins.CustomAlarmPlugin.cancelAlarm({ id });
      console.log(`[Native Reminder] Cancelled alarm ${id}`);
    } catch (err) {
      console.error("[Native Reminder] Error cancelling alarm:", err);
    }
  } else {
    // Web Fallback cleanup
    if (activeWebTimers[id]) {
      clearTimeout(activeWebTimers[id]);
      delete activeWebTimers[id];
      console.log(`[Web Reminder] Cancelled timer ${id}`);
    }
  }
}

/**
 * Cache today's checklist status to native shared preferences
 * so the receiver can inspect it offline.
 * @param {string} date - YYYY-MM-DD
 * @param {boolean} isListMade - Has checklist been created
 * @param {Array<string>} pendingTasks - List of uncompleted task titles
 */
export async function updateTodayStatusCache(date, isListMade, pendingTasks = []) {
  if (isAndroidNative && window.Capacitor && window.Capacitor.Plugins.CustomAlarmPlugin) {
    try {
      await window.Capacitor.Plugins.CustomAlarmPlugin.updateTodayStatus({
        date,
        isListMade,
        pendingTasks
      });
      console.log(`[Native Cache] Cached status for ${date}. Pending tasks: ${pendingTasks.length}`);
    } catch (err) {
      console.error("[Native Cache] Error caching status:", err);
    }
  }
}

import { syncMotivationAlarms } from './motivation.js';

export { syncMotivationAlarms };

/**
 * Synchronize all alarms on device launch or settings update
 * @param {Array} daysList - Array of Day cards
 * @param {Object} globalSettings - User settings containing globalStreakReminderEnabled, globalStreakReminderTime, globalStreakReminderType, motivation settings
 */
export async function syncDeviceReminders(daysList, globalSettings = {}) {
  console.log("[Reminder Sync] Starting device reminder synchronization...");

  // 1. Sync motivation alarms
  try {
    await syncMotivationAlarms(globalSettings);
  } catch (err) {
    console.error("[Reminder Sync] Error syncing motivation alarms:", err);
  }

  // 2. Sync global streak saver alarm
  if (isAndroidNative && window.Capacitor && window.Capacitor.Plugins.CustomAlarmPlugin) {
    try {
      if (globalSettings.globalStreakReminderEnabled) {
        await window.Capacitor.Plugins.CustomAlarmPlugin.scheduleAlarm({
          id: "global_streak_saver",
          time: globalSettings.globalStreakReminderTime || "21:00",
          type: globalSettings.globalStreakReminderType || "notification",
          title: "Daily Streak Warning",
          selectedTasks: [] // Handled dynamically on trigger
        });
        console.log(`[Reminder Sync] Scheduled global streak saver for ${globalSettings.globalStreakReminderTime}`);
      } else {
        await window.Capacitor.Plugins.CustomAlarmPlugin.cancelAlarm({ id: "global_streak_saver" });
        console.log("[Reminder Sync] Disabled global streak saver");
      }
    } catch (err) {
      console.error("[Reminder Sync] Error syncing global settings:", err);
    }
  }

  // 3. Sync individual day cards
  const todayStr = new Date().toISOString().split('T')[0];
  for (const day of daysList) {
    const cardDate = (day.date || '').split('T')[0];
    if (day.reminder && day.reminder.enabled && cardDate >= todayStr) {
      // Collect selected tasks names from mongoose categories
      const selectedTaskNames = [];
      const selectedIds = new Set(day.reminder.selectedTasks || []);
      
      if (day.categories) {
        for (const cat of day.categories) {
          for (const t of cat.tasks) {
            if (selectedIds.has(t._id)) {
              selectedTaskNames.push(t.title);
            }
          }
        }
      }

      await scheduleLocalReminder(
        day._id,
        day.reminder.time,
        day.reminder.type,
        "Daily Reminder",
        selectedTaskNames,
        cardDate
      );
    } else {
      await cancelLocalReminder(day._id);
    }
  }
}

/**
 * Web Fallback scheduling using Client-side setTimeout
 */
function scheduleWebNotificationFallback(id, time, title, tasks, date = null) {
  try {
    const [hours, minutes] = time.split(":").map(Number);
    const target = new Date();
    
    if (date) {
      const [year, month, day] = date.split("-").map(Number);
      target.setFullYear(year, month - 1, day);
    }
    
    target.setHours(hours, minutes, 0, 0);

    if (target.getTime() <= Date.now()) {
      if (!date) {
        target.setDate(target.getDate() + 1); // tomorrow
      } else {
        console.log(`[Web Reminder] Not scheduling ${id} because the target date/time ${date} has passed.`);
        return;
      }
    }

    const delay = target.getTime() - Date.now();
    console.log(`[Web Reminder] Scheduling standard web timer in ${Math.round(delay / 1000)}s`);

    activeWebTimers[id] = setTimeout(() => {
      showWebNotification(title, tasks);
      delete activeWebTimers[id];
    }, delay);

  } catch (err) {
    console.error("[Web Reminder] Failed scheduling web timer:", err);
  }
}

function showWebNotification(title, tasks) {
  if (!("Notification" in window)) return;
  
  if (Notification.permission === "granted") {
    let body = "Time to check your tasks!";
    if (tasks && tasks.length > 0) {
      body = "Pending tasks:\n" + tasks.map(t => `• ${t}`).join("\n");
    }
    
    new Notification(title, {
      body: body,
      icon: "/icon-192.png"
    });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission();
  }
}
