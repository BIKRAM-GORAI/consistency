package com.consistency.daily;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class AlarmReceiver extends BroadcastReceiver {
    private static final String TAG = "AlarmReceiver";
    private static final String PREFS_NAME = "ConsistencyAlarms";
    private static final String NOTIF_CHANNEL_ID = "consistency_reminder_channel_v1";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();
        Log.d(TAG, "AlarmReceiver received action: " + action);

        if ("com.consistency.daily.ACTION_TRIGGER_ALARM".equals(action)) {
            String alarmId = intent.getStringExtra("alarm_id");
            if (alarmId != null) {
                handleAlarmTrigger(context, alarmId);
            }
        } else if ("com.consistency.daily.ACTION_DISMISS_ALARM".equals(action)) {
            stopAlarmService(context);
        }
    }

    private void handleAlarmTrigger(Context context, String alarmId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        if ("global_streak_saver".equals(alarmId)) {
            handleGlobalStreakAlarm(context, prefs);
        } else {
            handlePerDayAlarm(context, prefs, alarmId);
        }
    }

    private void handleGlobalStreakAlarm(Context context, SharedPreferences prefs) {
        try {
            // Get today's local date string (YYYY-MM-DD)
            String todayStr = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());

            // Read the cached state saved by JS
            String todayStatusStr = prefs.getString("today_status", null);
            boolean isListMade = false;
            boolean hasPendingTasks = false;
            JSONArray pendingTasks = new JSONArray();

            if (todayStatusStr != null) {
                JSONObject todayStatus = new JSONObject(todayStatusStr);
                String savedDate = todayStatus.optString("date", "");

                // Only consider it today's status if dates match
                if (todayStr.equals(savedDate)) {
                    isListMade = todayStatus.optBoolean("isListMade", false);
                    pendingTasks = todayStatus.optJSONArray("pendingTasks");
                    if (pendingTasks == null) {
                        pendingTasks = new JSONArray();
                    }
                    hasPendingTasks = pendingTasks.length() > 0;
                }
            }

            // Read global configuration settings
            String globalSettingsStr = prefs.getString("alarm_global_streak_saver", null);
            String alertType = "notification";
            String title = "Streak Saver";

            if (globalSettingsStr != null) {
                JSONObject globalSettings = new JSONObject(globalSettingsStr);
                alertType = globalSettings.optString("type", "notification");
            }

            // Decide message and trigger criteria
            String message = "";
            boolean shouldTrigger = false;

            if (!isListMade) {
                message = "You haven't made your task list today! Write it down now to save your streak. 📝";
                shouldTrigger = true;
            } else if (hasPendingTasks) {
                StringBuilder sb = new StringBuilder();
                sb.append("You have ").append(pendingTasks.length()).append(" pending tasks today:\n");
                for (int i = 0; i < pendingTasks.length(); i++) {
                    sb.append("• ").append(pendingTasks.optString(i)).append("\n");
                }
                message = sb.toString();
                shouldTrigger = true;
            } else {
                Log.d(TAG, "Global Streak Saver: Checklist is fully completed! No alarm necessary.");
            }

            if (shouldTrigger) {
                triggerAlert(context, "global_streak_saver", alertType, "Streak Protection Alert", message);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error handling global streak alarm", e);
        }
    }

    private void handlePerDayAlarm(Context context, SharedPreferences prefs, String alarmId) {
        try {
            String alarmDataStr = prefs.getString("alarm_" + alarmId, null);
            if (alarmDataStr == null) {
                Log.w(TAG, "No cached data found for alarm ID: " + alarmId);
                return;
            }

            JSONObject alarmData = new JSONObject(alarmDataStr);
            String title = alarmData.optString("title", "Task Reminder");
            String alertType = alarmData.optString("type", "notification");
            JSONArray selectedTasks = alarmData.optJSONArray("selectedTasks");

            StringBuilder sb = new StringBuilder();
            if (selectedTasks != null && selectedTasks.length() > 0) {
                sb.append("Pending items:\n");
                for (int i = 0; i < selectedTasks.length(); i++) {
                    sb.append("• ").append(selectedTasks.optString(i)).append("\n");
                }
            } else {
                sb.append("Time to review your tasks for the day!");
            }

            triggerAlert(context, alarmId, alertType, title, sb.toString());
        } catch (Exception e) {
            Log.e(TAG, "Error handling per-day alarm", e);
        }
    }

    private void triggerAlert(Context context, String alarmId, String alertType, String title, String message) {
        Log.d(TAG, "Triggering alert (" + alertType + ") for alarm: " + alarmId);

        if ("alarm".equalsIgnoreCase(alertType)) {
            // Start the looping audio Foreground Service
            Intent serviceIntent = new Intent(context, AlarmService.class);
            serviceIntent.setAction("START_ALARM");
            serviceIntent.putExtra("title", title);
            serviceIntent.putExtra("message", message);
            serviceIntent.putExtra("alarm_id", alarmId);
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        } else {
            // Standard notification with single-play sound
            showNotification(context, title, message);
        }
    }

    private void showNotification(Context context, String title, String message) {
        NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null) return;

        createNotificationChannel(context, notificationManager);

        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentIntent = PendingIntent.getActivity(context, 0, launchIntent, pendingFlags);

        String collapsedText = getCollapsedSummary(message);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, NOTIF_CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(collapsedText)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(message))
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setContentIntent(contentIntent);

        notificationManager.notify((int) System.currentTimeMillis(), builder.build());
    }

    private String getCollapsedSummary(String message) {
        if (message == null) return "";
        if (!message.contains("\n")) return message;
        
        String clean = message.replace("• ", "");
        String[] lines = clean.split("\n");
        StringBuilder summary = new StringBuilder();
        
        String header = "";
        int startIdx = 0;
        
        if (lines.length > 0) {
            String firstLine = lines[0].trim();
            if (firstLine.contains("pending tasks today:") || firstLine.contains("Pending items:")) {
                header = "Pending: ";
                startIdx = 1;
            } else {
                header = firstLine + " ";
                startIdx = 1;
            }
        }
        
        summary.append(header);
        boolean firstTask = true;
        for (int i = startIdx; i < lines.length; i++) {
            String task = lines[i].trim();
            if (task.isEmpty()) continue;
            if (!firstTask) {
                summary.append(", ");
            }
            summary.append(task);
            firstTask = false;
        }
        
        return summary.toString().trim();
    }

    private void createNotificationChannel(Context context, NotificationManager manager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            CharSequence name = "Task Reminders";
            String description = "Silent or normal sound alerts for standard checklist times";
            int importance = NotificationManager.IMPORTANCE_HIGH;
            NotificationChannel channel = new NotificationChannel(NOTIF_CHANNEL_ID, name, importance);
            channel.setDescription(description);
            channel.enableVibration(true);

            // Optional: attach notificationsound.wav dynamically
            int soundResId = context.getResources().getIdentifier("notificationsound", "raw", context.getPackageName());
            if (soundResId != 0) {
                Uri soundUri = Uri.parse("android.resource://" + context.getPackageName() + "/" + soundResId);
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .build();
                channel.setSound(soundUri, audioAttributes);
            }

            manager.createNotificationChannel(channel);
        }
    }

    private void stopAlarmService(Context context) {
        Log.d(TAG, "Requesting service to stop alarm ringtone...");
        Intent stopIntent = new Intent(context, AlarmService.class);
        stopIntent.setAction("STOP_ALARM");
        context.startService(stopIntent);
    }
}
