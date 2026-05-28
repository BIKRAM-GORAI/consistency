package com.consistency.daily;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
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
            
            JSObject result = new JSObject();
            Calendar cal = Calendar.getInstance();
            cal.set(Calendar.HOUR_OF_DAY, 0);
            cal.set(Calendar.MINUTE, 0);
            cal.set(Calendar.SECOND, 0);
            cal.set(Calendar.MILLISECOND, 0);
            
            for (int d = 0; d < days; d++) {
                long startOfDay = cal.getTimeInMillis();
                long endOfDay = startOfDay + (24 * 60 * 60 * 1000L) - 1;
                
                SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
                String dateStr = sdf.format(cal.getTime());
                
                // Query absolute events in this exact 24-hour interval
                UsageEvents events = usm.queryEvents(startOfDay, endOfDay);
                
                Map<String, Long> pkgForegroundMap = new HashMap<>();
                Map<String, Long> resumeTimeMap = new HashMap<>();
                
                if (events != null) {
                    UsageEvents.Event event = new UsageEvents.Event();
                    while (events.hasNextEvent()) {
                        events.getNextEvent(event);
                        String pkg = event.getPackageName();
                        
                        // Performance: Only track user-facing launcher applications
                        if (!launcherPackages.contains(pkg)) {
                            continue;
                        }
                        
                        int type = event.getEventType();
                        long timestamp = event.getTimeStamp();
                        
                        if (type == UsageEvents.Event.ACTIVITY_RESUMED) { // Value: 1 (Move to foreground)
                            resumeTimeMap.put(pkg, timestamp);
                        } else if (type == UsageEvents.Event.ACTIVITY_PAUSED) { // Value: 2 (Move to background)
                            if (resumeTimeMap.containsKey(pkg)) {
                                long resumeTime = resumeTimeMap.get(pkg);
                                long duration = timestamp - resumeTime;
                                if (duration > 0) {
                                    long total = pkgForegroundMap.containsKey(pkg) ? pkgForegroundMap.get(pkg) : 0L;
                                    pkgForegroundMap.put(pkg, total + duration);
                                }
                                resumeTimeMap.remove(pkg);
                            }
                            // Ignores ACTIVITY_PAUSED events that do not have a matching ACTIVITY_RESUMED today,
                            // completely eliminating false midnight-to-pause active duration inflation!
                        }
                    }
                }
                
                // Flush any active session open at endOfDay
                for (Map.Entry<String, Long> entry : resumeTimeMap.entrySet()) {
                    String pkg = entry.getKey();
                    long resumeTime = entry.getValue();
                    long duration = endOfDay - resumeTime;
                    if (duration > 0) {
                        long total = pkgForegroundMap.containsKey(pkg) ? pkgForegroundMap.get(pkg) : 0L;
                        pkgForegroundMap.put(pkg, total + duration);
                    }
                }
                
                // Convert millisecond totals to minutes for Javascript consumption
                JSObject dayStats = new JSObject();
                for (Map.Entry<String, Long> entry : pkgForegroundMap.entrySet()) {
                    String pkg = entry.getKey();
                    long timeInMs = entry.getValue();
                    if (timeInMs > 0) {
                        long minutes = timeInMs / (1000 * 60);
                        if (minutes > 0) {
                            dayStats.put(pkg, (int) minutes);
                        }
                    }
                }
                
                result.put(dateStr, dayStats);
                cal.add(Calendar.DAY_OF_YEAR, -1);
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
