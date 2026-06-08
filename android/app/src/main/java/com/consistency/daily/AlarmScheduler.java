package com.consistency.daily;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import java.util.Calendar;

public class AlarmScheduler {
    private static final String TAG = "AlarmScheduler";

    public static void schedule(Context context, String id, String time) {
        try {
            String[] parts = time.split(":");
            int hour = Integer.parseInt(parts[0]);
            int minute = Integer.parseInt(parts[1]);

            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarmManager == null) return;

            Intent intent = new Intent(context, AlarmReceiver.class);
            intent.setAction("com.consistency.daily.ACTION_TRIGGER_ALARM");
            intent.putExtra("alarm_id", id);

            // Use unique request code based on string hash code to allow scheduling multiple alarms
            int requestCode = id.hashCode();

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }

            PendingIntent pendingIntent = PendingIntent.getBroadcast(context, requestCode, intent, flags);

            Calendar calendar = Calendar.getInstance();
            calendar.set(Calendar.HOUR_OF_DAY, hour);
            calendar.set(Calendar.MINUTE, minute);
            calendar.set(Calendar.SECOND, 0);
            calendar.set(Calendar.MILLISECOND, 0);

            // If the time has already passed today, schedule it for tomorrow
            if (calendar.getTimeInMillis() <= System.currentTimeMillis()) {
                calendar.add(Calendar.DAY_OF_YEAR, 1);
            }

            long triggerAtMillis = calendar.getTimeInMillis();
            Log.d(TAG, "Scheduling alarm " + id + " for " + calendar.getTime().toString() + " (millis: " + triggerAtMillis + ")");

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
            } else {
                alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to schedule alarm: " + id, e);
        }
    }

    public static void cancel(Context context, String id) {
        try {
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarmManager == null) return;

            Intent intent = new Intent(context, AlarmReceiver.class);
            intent.setAction("com.consistency.daily.ACTION_TRIGGER_ALARM");
            int requestCode = id.hashCode();

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }

            PendingIntent pendingIntent = PendingIntent.getBroadcast(context, requestCode, intent, flags);
            alarmManager.cancel(pendingIntent);
            Log.d(TAG, "Cancelled alarm " + id);
        } catch (Exception e) {
            Log.e(TAG, "Failed to cancel alarm: " + id, e);
        }
    }
}
