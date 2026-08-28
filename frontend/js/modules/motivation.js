/**
 * Consistency App - Daily Dose of Motivation Engine
 * 100% Offline Local Notification & Sequential Quote Rotation System
 */

export const BRUTAL_MOTIVATION_QUOTES = [
  "Are you actually trying, or just pretending to?",
  "You don’t need more motivation. You need to stop making excuses.",
  "Be honest: are you tired, or are you avoiding the work?",
  "You say you want it. Your actions say otherwise.",
  "How badly do you want it if you won’t work for it?",
  "Stop planning the life you want. Start building it.",
  "Nobody is coming to save your future. Get up.",
  "You know what to do. So why aren’t you doing it?",
  "Your potential means nothing without execution.",
  "Dreaming about it isn’t progress.",
  "You’re not stuck. You’re hesitating.",
  "Every day you delay is a day someone else gets ahead.",
  "Discipline is doing it when you don’t feel like it.",
  "If you keep choosing comfort, don’t complain about the results.",
  "You can make excuses, or you can make progress. Not both.",
  "Your future self is watching what you do today.",
  "Stop negotiating with the version of you that wants to quit.",
  "You’ve spent enough time thinking. Now execute.",
  "Wanting it is easy. Proving it is hard.",
  "Are you building your future, or distracting yourself from it?",
  "You’re not lazy by accident. You’re practicing it every day.",
  "Imagine wasting your potential because comfort felt better.",
  "One day, you’ll wish you had started today.",
  "You keep saying ‘tomorrow’ like you own it.",
  "Nobody cares about your excuses. Neither should you.",
  "You’re capable of more. Act like it.",
  "If you keep doing what you’re doing, you’ll keep getting what you’re getting.",
  "Your competition is working while you’re waiting to feel motivated.",
  "Stop being impressed by the person you could become. Become them.",
  "The life you want is hidden behind the work you keep avoiding."
];

const isAndroidNative = navigator.userAgent.includes("CapacitorNative/Android");
const MAX_POSSIBLE_SLOTS = 24;

/**
 * Get all available motivation quotes (default + any custom stored ones)
 */
export function getMotivationQuotes() {
  try {
    const customQuotes = localStorage.getItem('customMotivationQuotes');
    if (customQuotes) {
      const parsed = JSON.parse(customQuotes);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Failed to parse custom motivation quotes from localStorage:", e);
  }
  return BRUTAL_MOTIVATION_QUOTES;
}

/**
 * Fetch latest dynamic motivation quotes from server and cache locally
 */
export async function fetchDynamicMotivationQuotes() {
  try {
    const baseUrl = window.API || 'https://consistency-daily.vercel.app';
    const res = await fetch(`${baseUrl}/api/motivation/quotes?t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.quotes) && data.quotes.length > 0) {
        localStorage.setItem('customMotivationQuotes', JSON.stringify(data.quotes));
        console.log(`[Motivation Engine] Dynamically updated ${data.quotes.length} motivation quotes from server.`);
        return data.quotes;
      }
    }
  } catch (err) {
    console.warn("[Motivation Engine] Network unavailable for dynamic quotes fetch, using cached library:", err.message);
  }
  return getMotivationQuotes();
}

/**
 * Get a random quote for previews / interactive shuffle
 */
export function getRandomMotivationQuote() {
  const quotes = getMotivationQuotes();
  const index = Math.floor(Math.random() * quotes.length);
  return quotes[index];
}

/**
 * Get current quote pointer and advance sequential counter
 */
export function getNextSequentialQuote() {
  const quotes = getMotivationQuotes();
  let currentIndex = parseInt(localStorage.getItem('motivationQuoteCurrentIndex') || '0', 10);
  if (isNaN(currentIndex) || currentIndex < 0 || currentIndex >= quotes.length) {
    currentIndex = 0;
  }
  
  const quote = quotes[currentIndex];
  
  // Advance index for next call
  const nextIndex = (currentIndex + 1) % quotes.length;
  localStorage.setItem('motivationQuoteCurrentIndex', nextIndex.toString());
  
  return quote;
}

/**
 * Generate HH:MM time slots across the active window based on interval
 * @param {string} startTime - HH:MM (e.g. "09:00")
 * @param {string} endTime - HH:MM (e.g. "21:00")
 * @param {number} intervalHours - e.g. 1, 2, 3, 4, 6, 12, 24
 */
export function calculateMotivationTimeSlots(startTime = "09:00", endTime = "21:00", intervalHours = 3) {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  
  const startMinutes = startH * 60 + (startM || 0);
  let endMinutes = endH * 60 + (endM || 0);
  
  // If end time is earlier or equal to start time, assume next day or full day span
  if (endMinutes <= startMinutes) {
    endMinutes = startMinutes + 12 * 60; // default 12-hour span
  }
  
  const stepMinutes = Math.max(30, Math.round((intervalHours || 3) * 60));
  const slots = [];
  
  for (let m = startMinutes; m <= endMinutes; m += stepMinutes) {
    const totalH = Math.floor(m / 60) % 24;
    const totalM = m % 60;
    const hh = String(totalH).padStart(2, '0');
    const mm = String(totalM).padStart(2, '0');
    slots.push(`${hh}:${mm}`);
  }
  
  // Ensure at least one slot
  if (slots.length === 0) {
    slots.push(startTime);
  }
  
  return slots;
}

/**
 * Check if notifications are granted / allowed on this device
 */
export async function checkDeviceNotificationStatus() {
  if (isAndroidNative && window.Capacitor && window.Capacitor.Plugins) {
    // In native Android APK, notifications are enabled by default on standard channels
    if (window.Capacitor.Plugins.PushNotifications) {
      try {
        const perm = await window.Capacitor.Plugins.PushNotifications.checkPermissions();
        return perm.receive === 'granted';
      } catch (e) {
        return true;
      }
    }
    return true;
  }
  
  if ('Notification' in window) {
    return Notification.permission === 'granted';
  }
  
  return false;
}

/**
 * Request notification permissions from the user
 */
export async function requestDeviceNotificationPermission() {
  if (isAndroidNative && window.Capacitor && window.Capacitor.Plugins) {
    if (window.Capacitor.Plugins.PushNotifications) {
      try {
        const result = await window.Capacitor.Plugins.PushNotifications.requestPermissions();
        return result.receive === 'granted';
      } catch (e) {
        console.warn("Native push permission request fallback:", e);
      }
    }
    return true;
  }
  
  if ('Notification' in window) {
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (e) {
      console.warn("Web notification permission request error:", e);
    }
  }
  
  return false;
}

/**
 * Synchronize and schedule all offline motivation alarms on device
 * @param {Object} settings - { motivationRemindersEnabled, motivationIntervalHours, motivationStartTime, motivationEndTime }
 */
export async function syncMotivationAlarms(settings = {}) {
  // Always fetch latest dynamic quotes from server if network is available
  await fetchDynamicMotivationQuotes().catch(() => {});

  const enabled = !!settings.motivationRemindersEnabled;
  const intervalHours = parseFloat(settings.motivationIntervalHours) || 3;
  const startTime = settings.motivationStartTime || "09:00";
  const endTime = settings.motivationEndTime || "21:00";

  console.log(`[Motivation Engine] Syncing alarms. Enabled: ${enabled}, Interval: ${intervalHours}h (${startTime} -> ${endTime})`);

  if (isAndroidNative && window.Capacitor && window.Capacitor.Plugins.CustomAlarmPlugin) {
    const plugin = window.Capacitor.Plugins.CustomAlarmPlugin;

    if (!enabled) {
      // Cancel all existing scheduled motivation slots
      for (let i = 0; i < MAX_POSSIBLE_SLOTS; i++) {
        try {
          await plugin.cancelAlarm({ id: `motivation_slot_${i}` });
        } catch (e) {
          // ignore
        }
      }
      console.log("[Motivation Engine] Cancelled all motivation alarms.");
      return;
    }

    // Enabled: Generate slots across the active window
    const slots = calculateMotivationTimeSlots(startTime, endTime, intervalHours);
    console.log(`[Motivation Engine] Scheduling ${slots.length} time slots:`, slots);

    for (let i = 0; i < slots.length; i++) {
      const slotTime = slots[i];
      const quote = getNextSequentialQuote();
      const alarmId = `motivation_slot_${i}`;

      try {
        await plugin.scheduleAlarm({
          id: alarmId,
          time: slotTime,
          type: "notification",
          title: "Daily Dose of Motivation 🔥",
          selectedTasks: [quote]
        });
        console.log(`[Motivation Engine] Scheduled ${alarmId} at ${slotTime} -> "${quote}"`);
      } catch (err) {
        console.error(`[Motivation Engine] Error scheduling slot ${alarmId}:`, err);
      }
    }

    // Cancel any leftover slots from previous wider interval
    for (let i = slots.length; i < MAX_POSSIBLE_SLOTS; i++) {
      try {
        await plugin.cancelAlarm({ id: `motivation_slot_${i}` });
      } catch (e) {
        // ignore
      }
    }
  } else {
    // Non-native / Web environment fallback
    scheduleWebMotivationTimers(enabled, startTime, endTime, intervalHours);
  }
}

// In-memory web timers for browser fallback
const activeWebMotivationTimers = {};

function clearAllWebMotivationTimers() {
  Object.keys(activeWebMotivationTimers).forEach(key => {
    clearTimeout(activeWebMotivationTimers[key]);
    delete activeWebMotivationTimers[key];
  });
}

function scheduleWebMotivationTimers(enabled, startTime, endTime, intervalHours) {
  clearAllWebMotivationTimers();
  if (!enabled) return;

  const slots = calculateMotivationTimeSlots(startTime, endTime, intervalHours);
  const now = new Date();

  slots.forEach((slotTime, idx) => {
    const [hh, mm] = slotTime.split(':').map(Number);
    const target = new Date();
    target.setHours(hh, mm, 0, 0);

    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1); // schedule for tomorrow's slot
    }

    const delay = target.getTime() - now.getTime();
    const timerId = `web_slot_${idx}`;

    activeWebMotivationTimers[timerId] = setTimeout(() => {
      const quote = getNextSequentialQuote();
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification("Daily Dose of Motivation 🔥", {
          body: quote,
          icon: "/checklist.png"
        });
      }
      if (typeof window.showToast === 'function') {
        window.showToast(`🔥 Motivation: "${quote}"`, 'info');
      }
      delete activeWebMotivationTimers[timerId];
    }, delay);
  });
  console.log(`[Motivation Engine] Scheduled ${slots.length} web browser in-memory timers.`);
}

/**
 * Send an immediate test motivation notification to preview how it looks
 */
export async function testMotivationNotification() {
  const quote = getRandomMotivationQuote();
  
  if (isAndroidNative && window.Capacitor && window.Capacitor.Plugins.CustomAlarmPlugin) {
    const now = new Date();
    // Schedule for 1 minute from now to test native receiver
    const testMinutes = now.getMinutes() + 1;
    const testH = now.getHours() + Math.floor(testMinutes / 60);
    const timeStr = `${String(testH % 24).padStart(2, '0')}:${String(testMinutes % 60).padStart(2, '0')}`;
    
    try {
      await window.Capacitor.Plugins.CustomAlarmPlugin.scheduleAlarm({
        id: "motivation_test_alert",
        time: timeStr,
        type: "notification",
        title: "Daily Dose of Motivation 🔥 (Test)",
        selectedTasks: [quote]
      });
      if (typeof window.showToast === 'function') {
        window.showToast(`Test alert scheduled for ${timeStr}: "${quote.substring(0, 32)}..."`, 'info');
      }
    } catch (e) {
      console.error("Failed to schedule test alarm:", e);
      if (typeof window.showToast === 'function') {
        window.showToast(`Motivation: "${quote}"`, 'info');
      }
    }
  } else {
    // Web test notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification("Daily Dose of Motivation 🔥", {
        body: quote,
        icon: "/checklist.png"
      });
    }
    if (typeof window.showToast === 'function') {
      window.showToast(`🔥 Motivation: "${quote}"`, 'info');
    }
  }
}

// Expose globally for inline DOM event handlers
window.testMotivationNotification = testMotivationNotification;
window.getRandomMotivationQuote = getRandomMotivationQuote;
window.getMotivationQuotes = getMotivationQuotes;
window.fetchDynamicMotivationQuotes = fetchDynamicMotivationQuotes;
window.syncMotivationAlarms = syncMotivationAlarms;
