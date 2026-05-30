package com.consistency.daily;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UsageStatsPlugin.class);
        
        // Intercept native notification click on cold start
        android.content.Intent intent = getIntent();
        final String coldStartGroupId = (intent != null && intent.getExtras() != null)
            ? intent.getExtras().getString("groupId")
            : null;

        super.onCreate(savedInstanceState);
        
        // Style the default WebView background color as yellow to seamlessly blend splash transition
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().setBackgroundColor(android.graphics.Color.parseColor("#FFD60A"));
            
            // If cold start came from a notification click, load it directly in the WebView
            if (coldStartGroupId != null && !coldStartGroupId.isEmpty()) {
                String localServerUrl = getLocalServerUrl();
                String launchUrl = localServerUrl + "/index.html?openChat=" + coldStartGroupId + "&t=" + System.currentTimeMillis();
                this.bridge.getWebView().loadUrl(launchUrl);
            }
        }

        // Bypasses Google's WebView OAuth block by setting a standard mobile Chrome User-Agent
        String versionName = BuildConfig.VERSION_NAME;
        this.bridge.getWebView().getSettings().setUserAgentString(
            "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 CapacitorNative/Android/" + versionName
        );

        // Forces all popups/window.open calls (like bank OTP pages) to open directly inside this app's WebView
        this.bridge.getWebView().getSettings().setSupportMultipleWindows(false);

        // Explicitly enable secure third-party cookies so Razorpay session cookies are accepted inside WebView
        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(this.bridge.getWebView(), true);

        // Register custom back press dispatcher to cleanly cancel OAuth redirects at Jetpack level
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = MainActivity.this.bridge.getWebView();
                String currentUrl = webView.getUrl() != null ? webView.getUrl() : "";
                
                boolean isInternalAppPage = currentUrl.contains("consistency-daily.vercel.app") 
                    || currentUrl.contains("localhost") 
                    || currentUrl.startsWith("file://");
                    
                if (!isInternalAppPage && !currentUrl.isEmpty()) {
                    // Cancel external OAuth flow → go back to local auth page cleanly
                    String localServerUrl = getLocalServerUrl();
                    webView.loadUrl(localServerUrl + "/auth.html");
                } else if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    // Minimize instead of closing (better UX)
                    MainActivity.this.moveTaskToBack(true);
                }
            }
        });

        // Create custom sound Notification Channel for high-priority chat alerts
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            String channelId = "consistency_chime_channel_v2";
            CharSequence name = "Chat Messages";
            String description = "Notifications with custom chime alert";
            int importance = android.app.NotificationManager.IMPORTANCE_HIGH;
            
            android.app.NotificationChannel channel = new android.app.NotificationChannel(channelId, name, importance);
            channel.setDescription(description);
            
            // Resolve the sound raw resource dynamically by name to be 100% compile-safe
            int soundResId = getResources().getIdentifier("notificationsound", "raw", getPackageName());
            if (soundResId != 0) {
                android.net.Uri soundUri = android.net.Uri.parse("android.resource://" + getPackageName() + "/" + soundResId);
                android.media.AudioAttributes audioAttributes = new android.media.AudioAttributes.Builder()
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION)
                    .build();
                channel.setSound(soundUri, audioAttributes);
            }
            channel.enableVibration(true);
            
            android.app.NotificationManager notificationManager = getSystemService(android.app.NotificationManager.class);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        
        // Intercept native notification click on app resume (background)
        if (intent != null && intent.getExtras() != null) {
            String groupId = intent.getExtras().getString("groupId");
            if (groupId != null && !groupId.isEmpty()) {
                // If running, load index.html directly to bypass splash screen and open chat instantly
                if (this.bridge != null && this.bridge.getWebView() != null) {
                    String localServerUrl = getLocalServerUrl();
                    String launchUrl = localServerUrl + "/index.html?openChat=" + groupId + "&t=" + System.currentTimeMillis();
                    this.bridge.getWebView().loadUrl(launchUrl);
                }
            }
        }
    }

    private String getLocalServerUrl() {
        if (this.bridge != null) {
            String serverUrl = this.bridge.getServerUrl();
            if (serverUrl != null && !serverUrl.isEmpty() && !serverUrl.equals("null") && !serverUrl.contains("null")) {
                return serverUrl;
            }
        }
        return "https://localhost";
    }
}
