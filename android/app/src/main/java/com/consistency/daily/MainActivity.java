package com.consistency.daily;

import android.os.Bundle;
import android.os.Message;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
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
                String launchUrl = "https://consistency-daily.vercel.app/index.html?openChat=" + coldStartGroupId + "&t=" + System.currentTimeMillis();
                this.bridge.getWebView().loadUrl(launchUrl);
            }
        }

        // Bypasses Google's WebView OAuth block by setting a standard mobile Chrome User-Agent
        String versionName = BuildConfig.VERSION_NAME;
        this.bridge.getWebView().getSettings().setUserAgentString(
            "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 CapacitorNative/Android/" + versionName
        );

        // Must be true so that onCreateWindow fires — we intercept it below instead of blocking it
        this.bridge.getWebView().getSettings().setSupportMultipleWindows(true);
        this.bridge.getWebView().getSettings().setJavaScriptEnabled(true);
        this.bridge.getWebView().getSettings().setJavaScriptCanOpenWindowsAutomatically(true);

        // Accept third-party cookies so Razorpay session cookies work cross-origin
        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(this.bridge.getWebView(), true);

        // ─── SOLID STATUS BAR STYLING & FIT SYSTEM WINDOWS ───
        // We set the system status bar to be solid and color it purple (#a855f7) to match the brand.
        // By setting fitsSystemWindows to true on the WebView, the Android OS natively offsets
        // the WebView below the status bar, preventing any headers (including Razorpay) from ever overlapping.
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            getWindow().setStatusBarColor(android.graphics.Color.parseColor("#a855f7")); // Match premium purple theme
            
            if (this.bridge != null && this.bridge.getWebView() != null) {
                this.bridge.getWebView().setFitsSystemWindows(true);
            }
        }

        // When Razorpay redirects to the bank's 3D-Secure page via window.open(),
        // Android fires a system Intent → "Open with" browser picker appears.
        // We override onCreateWindow here, extract the target URL from the popup
        // WebView transport, and load it directly in the main WebView instead.
        // By extending BridgeWebChromeClient instead of standard WebChromeClient, we preserve
        // all native file chooser, gallery picker, and permission request hooks.
        this.bridge.getWebView().setWebChromeClient(new com.getcapacitor.BridgeWebChromeClient(this.bridge) {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                // Temporary WebView used only to receive the popup URL via the transport
                WebView popupWebView = new WebView(MainActivity.this);
                popupWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView popupView, WebResourceRequest request) {
                        String url = request.getUrl().toString();
                        
                        // If the popup target is an APK download, launch it via native intent in the system browser
                        if (url.endsWith(".apk") || url.contains("Consistency.Daily.apk")) {
                            android.util.Log.d("PaymentPopup", "Intercepted APK download popup → launching system browser: " + url);
                            try {
                                android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url));
                                MainActivity.this.startActivity(intent);
                            } catch (Exception e) {
                                android.util.Log.e("PaymentPopup", "Failed to launch native intent for APK download", e);
                            }
                            return true;
                        }
                        
                        // Redirect the URL into the main app WebView (for Razorpay popup redirects)
                        android.util.Log.d("PaymentPopup", "Intercepted popup → loading in main WebView: " + url);
                        MainActivity.this.bridge.getWebView().loadUrl(url);
                        return true;
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popupWebView);
                resultMsg.sendToTarget();
                return true;
            }
        });

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
