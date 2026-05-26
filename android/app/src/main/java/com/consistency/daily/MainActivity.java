package com.consistency.daily;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Intercept native notification click on cold start
        android.content.Intent intent = getIntent();
        if (intent != null && intent.getExtras() != null) {
            String groupId = intent.getExtras().getString("groupId");
            if (groupId != null && !groupId.isEmpty()) {
                // Construct launch URL with query parameters which will be forwarded to index.html after splash
                String launchUrl = "https://consistency-daily.vercel.app/?openChat=" + groupId + "&t=" + System.currentTimeMillis();
                intent.setData(android.net.Uri.parse(launchUrl));
            }
        }

        super.onCreate(savedInstanceState);
        
        // Bypasses Google's WebView OAuth block by setting a standard mobile Chrome User-Agent
        this.bridge.getWebView().getSettings().setUserAgentString(
            "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
        );

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
                    // Cancel external OAuth flow → go back to auth page cleanly
                    webView.loadUrl("https://consistency-daily.vercel.app/auth.html");
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
            String channelId = "consistency_chime_channel_v1";
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
                String launchUrl = "https://consistency-daily.vercel.app/index.html?openChat=" + groupId + "&t=" + System.currentTimeMillis();
                if (this.bridge != null && this.bridge.getWebView() != null) {
                    this.bridge.getWebView().loadUrl(launchUrl);
                }
            }
        }
    }
}
