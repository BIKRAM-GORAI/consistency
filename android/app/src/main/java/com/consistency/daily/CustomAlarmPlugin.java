package com.consistency.daily;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "CustomAlarmPlugin")
public class CustomAlarmPlugin extends Plugin {
    private static final String TAG = "CustomAlarmPlugin";
    private static final String PREFS_NAME = "ConsistencyAlarms";

    @PluginMethod
    public void scheduleAlarm(PluginCall call) {
        try {
            String id = call.getString("id");
            String time = call.getString("time"); // HH:MM
            String type = call.getString("type", "notification"); // notification or alarm
            String title = call.getString("title", "Consistency Reminder");
            JSArray selectedTasks = call.getArray("selectedTasks", new JSArray());
            String date = call.getString("date"); // YYYY-MM-DD

            if (id == null || time == null) {
                call.reject("id and time are required");
                return;
            }

            // Save alarm settings in SharedPreferences for the AlarmReceiver/Service to read
            Context context = getContext();
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();

            JSONObject alarmData = new JSONObject();
            alarmData.put("id", id);
            alarmData.put("time", time);
            alarmData.put("type", type);
            alarmData.put("title", title);
            alarmData.put("selectedTasks", selectedTasks);
            if (date != null) {
                alarmData.put("date", date);
            }

            editor.putString("alarm_" + id, alarmData.toString());
            editor.apply();

            // Register with the native AlarmManager system helper
            AlarmScheduler.schedule(context, id, time, date);

            JSObject ret = new JSObject();
            ret.put("status", "success");
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Error scheduling alarm", e);
            call.reject("Failed to schedule alarm: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancelAlarm(PluginCall call) {
        try {
            String id = call.getString("id");
            if (id == null) {
                call.reject("id is required");
                return;
            }

            Context context = getContext();
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();
            editor.remove("alarm_" + id);
            editor.apply();

            AlarmScheduler.cancel(context, id);

            JSObject ret = new JSObject();
            ret.put("status", "success");
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Error cancelling alarm", e);
            call.reject("Failed to cancel alarm: " + e.getMessage());
        }
    }

    @PluginMethod
    public void updateTodayStatus(PluginCall call) {
        try {
            String date = call.getString("date"); // YYYY-MM-DD
            boolean isListMade = call.getBoolean("isListMade", false);
            JSArray pendingTasks = call.getArray("pendingTasks", new JSArray());

            if (date == null) {
                call.reject("date is required");
                return;
            }

            Context context = getContext();
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();

            JSONObject todayStatus = new JSONObject();
            todayStatus.put("date", date);
            todayStatus.put("isListMade", isListMade);
            todayStatus.put("pendingTasks", pendingTasks);

            editor.putString("today_status", todayStatus.toString());
            editor.apply();

            JSObject ret = new JSObject();
            ret.put("status", "success");
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Error updating today status", e);
            call.reject("Failed to update status: " + e.getMessage());
        }
    }
}
