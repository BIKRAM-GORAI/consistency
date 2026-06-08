package com.consistency.daily;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

public class AlarmService extends Service {
    private static final String TAG = "AlarmService";
    private static final String CHANNEL_ID = "consistency_alarm_channel_v1";
    private static final int NOTIFICATION_ID = 9999;
    private MediaPlayer mediaPlayer;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if ("START_ALARM".equals(action)) {
                String title = intent.getStringExtra("title");
                String message = intent.getStringExtra("message");
                String alarmId = intent.getStringExtra("alarm_id");
                startAlarm(title, message, alarmId);
            } else if ("STOP_ALARM".equals(action)) {
                stopAlarm();
            }
        }
        return START_NOT_STICKY;
    }

    private void startAlarm(String title, String message, String alarmId) {
        Log.d(TAG, "Starting alarm service playback...");
        
        // 1. Create Notification Channel for alarms (required on Android Oreo+)
        createNotificationChannel();

        // 2. Intent to open main app on clicking notification
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent mainPendingIntent = PendingIntent.getActivity(this, 0, launchIntent, pendingFlags);

        // 3. Action intent to Dismiss the alarm
        Intent dismissIntent = new Intent(this, AlarmReceiver.class);
        dismissIntent.setAction("com.consistency.daily.ACTION_DISMISS_ALARM");
        dismissIntent.putExtra("alarm_id", alarmId);
        
        int dismissFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            dismissFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent dismissPendingIntent = PendingIntent.getBroadcast(this, 1, dismissIntent, dismissFlags);

        String collapsedText = getCollapsedSummary(message);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(collapsedText)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(message))
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setFullScreenIntent(mainPendingIntent, true)
                .setContentIntent(mainPendingIntent)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Dismiss Alarm", dismissPendingIntent)
                .setOngoing(true)
                .build();

        // Start as foreground service
        startForeground(NOTIFICATION_ID, notification);

        // 5. Play sound (ringtone.wav) in a loop
        try {
            if (mediaPlayer != null) {
                mediaPlayer.release();
            }

            int soundResId = getResources().getIdentifier("ringtone", "raw", getPackageName());
            if (soundResId != 0) {
                mediaPlayer = MediaPlayer.create(this, soundResId);
                if (mediaPlayer != null) {
                    mediaPlayer.setLooping(true);
                    
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_ALARM)
                                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                                .build());
                    }
                    
                    mediaPlayer.start();
                    Log.d(TAG, "Playing ringtone.wav looping.");
                }
            } else {
                Log.e(TAG, "Ringtone audio file not found in res/raw.");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error playing alarm sound", e);
        }
    }

    private void stopAlarm() {
        Log.d(TAG, "Stopping alarm service...");
        try {
            if (mediaPlayer != null) {
                mediaPlayer.stop();
                mediaPlayer.release();
                mediaPlayer = null;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error stopping media player", e);
        }
        stopForeground(true);
        stopSelf();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            CharSequence name = "Daily Alarms";
            String description = "Channel for daily consistency alarms and reminders";
            int importance = NotificationManager.IMPORTANCE_HIGH;
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, name, importance);
            channel.setDescription(description);
            channel.enableVibration(true);
            channel.setSound(null, null); // Sound handled independently via MediaPlayer in loop

            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        stopAlarm();
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
}
