package com.consistency.daily;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@CapacitorPlugin(name = "UsageStatsPlugin")
public class UsageStatsPlugin extends Plugin {
    private static final String TAG = "UsageStatsPlugin";

    @PluginMethod
    public void checkPermission(PluginCall call) {
        try {
            Context context = getContext();
            AppOpsManager appOps = (AppOpsManager) context.getSystemService(Context.APP_OPS_SERVICE);
            int mode = appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(),
                context.getPackageName()
            );
            boolean granted = (mode == AppOpsManager.MODE_ALLOWED);
            
            JSObject ret = new JSObject();
            ret.put("granted", granted);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Error checking permission", e);
            JSObject ret = new JSObject();
            ret.put("granted", false);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        try {
            Context context = getContext();
            Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            
            JSObject ret = new JSObject();
            ret.put("status", "opened");
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Error requesting permission", e);
            call.reject("Could not open Usage Access settings: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getInstalledApps(PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            Intent intent = new Intent(Intent.ACTION_MAIN, null);
            intent.addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> resolveInfos = pm.queryIntentActivities(intent, 0);
            
            JSArray apps = new JSArray();
            for (ResolveInfo ri : resolveInfos) {
                String appName = ri.loadLabel(pm).toString();
                String packageName = ri.activityInfo.packageName;
                
                // Skip our own app to avoid tracking loop
                if (packageName.equals(getContext().getPackageName())) {
                    continue;
                }
                
                Drawable icon = ri.loadIcon(pm);
                String base64Icon = drawableToBase64(icon);
                
                JSObject app = new JSObject();
                app.put("name", appName);
                app.put("package", packageName);
                app.put("icon", base64Icon);
                apps.put(app);
            }
            
            JSObject ret = new JSObject();
            ret.put("apps", apps);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Error getting installed apps", e);
            call.reject("Failed to retrieve installed apps: " + e.getMessage());
        }
    }

    private static class DayRange {
        String dateStr;
        long start;
        long end;
        DayRange(String dateStr, long start, long end) {
            this.dateStr = dateStr;
            this.start = start;
            this.end = end;
        }
    }

    private void recordSession(String pkg, long start, long end, List<DayRange> dayRanges, Map<String, Map<String, Long>> dailyStats) {
        if (pkg == null || start >= end) return;
        for (DayRange dr : dayRanges) {
            long overlapStart = Math.max(start, dr.start);
            long overlapEnd = Math.min(end, dr.end);
            if (overlapStart < overlapEnd) {
                long duration = overlapEnd - overlapStart;
                Map<String, Long> dayMap = dailyStats.get(dr.dateStr);
                if (dayMap != null) {
                    long existing = dayMap.containsKey(pkg) ? dayMap.get(pkg) : 0L;
                    dayMap.put(pkg, existing + duration);
                }
            }
        }
    }

    @PluginMethod
    public void getUsageStats(PluginCall call) {
        try {
            int days = call.getInt("days", 7);
            Context context = getContext();
            UsageStatsManager usm = (UsageStatsManager) context.getSystemService(Context.USAGE_STATS_SERVICE);
            
            if (usm == null) {
                call.reject("UsageStatsManager is not available on this device");
                return;
            }
            
            // Query user-facing launcher apps to filter out background processes & system UI
            PackageManager pm = context.getPackageManager();
            Intent launcherIntent = new Intent(Intent.ACTION_MAIN, null);
            launcherIntent.addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> resolveInfos = pm.queryIntentActivities(launcherIntent, 0);
            Set<String> launcherPackages = new HashSet<>();
            for (ResolveInfo ri : resolveInfos) {
                launcherPackages.add(ri.activityInfo.packageName);
            }
            launcherPackages.add(context.getPackageName()); // Include our own app in totals
            
            List<DayRange> dayRanges = new java.util.ArrayList<>();
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            
            Calendar cal = Calendar.getInstance();
            cal.set(Calendar.HOUR_OF_DAY, 0);
            cal.set(Calendar.MINUTE, 0);
            cal.set(Calendar.SECOND, 0);
            cal.set(Calendar.MILLISECOND, 0);
            sdf.setTimeZone(cal.getTimeZone());
            
            for (int d = 0; d < days; d++) {
                long startOfDay = cal.getTimeInMillis();
                long endOfDay = startOfDay + (24 * 60 * 60 * 1000L) - 1;
                String dateStr = sdf.format(cal.getTime());
                dayRanges.add(new DayRange(dateStr, startOfDay, endOfDay));
                cal.add(Calendar.DAY_OF_YEAR, -1);
            }
            
            long overallStart = dayRanges.get(dayRanges.size() - 1).start - 12 * 60 * 60 * 1000L;
            long overallEnd = System.currentTimeMillis();
            
            Map<String, Map<String, Long>> dailyStats = new HashMap<>();
            for (DayRange dr : dayRanges) {
                dailyStats.put(dr.dateStr, new HashMap<String, Long>());
            }
            
            UsageEvents events = usm.queryEvents(overallStart, overallEnd);
            
            String currentApp = null;
            long lastResumeTime = 0L;
            boolean isScreenInteractive = true;
            
            if (events != null) {
                UsageEvents.Event event = new UsageEvents.Event();
                while (events.hasNextEvent()) {
                    events.getNextEvent(event);
                    String pkg = event.getPackageName();
                    int type = event.getEventType();
                    long timestamp = event.getTimeStamp();
                    
                    if (type == 16 || type == 17) { // SCREEN_NON_INTERACTIVE or KEYGUARD_SHOWN
                        if (isScreenInteractive) {
                            if (currentApp != null) {
                                recordSession(currentApp, lastResumeTime, timestamp, dayRanges, dailyStats);
                            }
                            isScreenInteractive = false;
                        }
                    } else if (type == 15 || type == 18) { // SCREEN_INTERACTIVE or KEYGUARD_HIDDEN
                        if (!isScreenInteractive) {
                            isScreenInteractive = true;
                            if (currentApp != null) {
                                lastResumeTime = timestamp;
                            }
                        }
                    } else if (type == 1) { // ACTIVITY_RESUMED
                        if (launcherPackages.contains(pkg)) {
                            if (currentApp != null && isScreenInteractive) {
                                recordSession(currentApp, lastResumeTime, timestamp, dayRanges, dailyStats);
                            }
                            currentApp = pkg;
                            lastResumeTime = timestamp;
                        }
                    } else if (type == 2) { // ACTIVITY_PAUSED
                        if (pkg.equals(currentApp)) {
                            if (isScreenInteractive) {
                                recordSession(currentApp, lastResumeTime, timestamp, dayRanges, dailyStats);
                            }
                            currentApp = null;
                        }
                    }
                }
            }
            
            // Flush final session at the end of events
            if (currentApp != null && isScreenInteractive && lastResumeTime < overallEnd) {
                recordSession(currentApp, lastResumeTime, overallEnd, dayRanges, dailyStats);
            }
            
            // Convert millisecond totals to minutes for Javascript consumption
            JSObject result = new JSObject();
            for (DayRange dr : dayRanges) {
                JSObject dayStats = new JSObject();
                Map<String, Long> dayMap = dailyStats.get(dr.dateStr);
                if (dayMap != null) {
                    for (Map.Entry<String, Long> entry : dayMap.entrySet()) {
                        String pkg = entry.getKey();
                        long timeInMs = entry.getValue();
                        if (timeInMs > 0) {
                            long minutes = timeInMs / (1000 * 60);
                            if (minutes > 0) {
                                dayStats.put(pkg, (int) minutes);
                            }
                        }
                    }
                }
                result.put(dr.dateStr, dayStats);
            }
            
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error getting usage stats", e);
            call.reject("Failed to retrieve usage stats: " + e.getMessage());
        }
    }

    private String drawableToBase64(Drawable drawable) {
        if (drawable == null) return "";
        try {
            Bitmap bitmap;
            if (drawable instanceof BitmapDrawable) {
                bitmap = ((BitmapDrawable) drawable).getBitmap();
            } else {
                int width = drawable.getIntrinsicWidth();
                int height = drawable.getIntrinsicHeight();
                if (width <= 0) width = 48;
                if (height <= 0) height = 48;
                bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
                Canvas canvas = new Canvas(bitmap);
                drawable.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
                drawable.draw(canvas);
            }
            
            // Scaled down to 32x32 to be extremely lightweight and high performance for DB sync
            Bitmap scaledBitmap = Bitmap.createScaledBitmap(bitmap, 32, 32, true);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            scaledBitmap.compress(Bitmap.CompressFormat.PNG, 100, baos);
            byte[] bytes = baos.toByteArray();
            return "data:image/png;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP);
        } catch (Exception e) {
            Log.e(TAG, "Error converting drawable to base64", e);
            return "";
        }
    }
}
