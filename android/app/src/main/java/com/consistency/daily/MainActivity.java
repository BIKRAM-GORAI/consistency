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
            
            // Set download listener to intercept and handle downloads natively (including Base64 export data)
            this.bridge.getWebView().setDownloadListener(new android.webkit.DownloadListener() {
                @Override
                public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                    handleNativeDownload(url, mimetype);
                }
            });

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

        // Enable database and DOM storage cache
        this.bridge.getWebView().getSettings().setDomStorageEnabled(true);
        this.bridge.getWebView().getSettings().setDatabaseEnabled(true);

        // Dynamically adjust cache mode based on internet connectivity to allow offline launches of remote URL
        android.net.ConnectivityManager cm = (android.net.ConnectivityManager) getSystemService(android.content.Context.CONNECTIVITY_SERVICE);
        android.net.NetworkInfo activeNetwork = cm.getActiveNetworkInfo();
        boolean isConnected = activeNetwork != null && activeNetwork.isConnectedOrConnecting();
        if (isConnected) {
            this.bridge.getWebView().getSettings().setCacheMode(android.webkit.WebSettings.LOAD_DEFAULT);
        } else {
            this.bridge.getWebView().getSettings().setCacheMode(android.webkit.WebSettings.LOAD_CACHE_ELSE_NETWORK);
        }

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

        // Intercept navigation inside the main WebView to handle deep links safely (PhonePe, GPay, Paytm, etc.)
        this.bridge.getWebView().setWebViewClient(new com.getcapacitor.BridgeWebViewClient(this.bridge) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (handleCustomScheme(url)) {
                    return true;
                }
                return super.shouldOverrideUrlLoading(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (handleCustomScheme(url)) {
                    return true;
                }
                return super.shouldOverrideUrlLoading(view, url);
            }
        });

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
                        
                        // Handle native deep-link schemes (PhonePe, GPay, Paytm, etc.) gracefully
                        if (handleCustomScheme(url)) {
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
                    // Cancel external OAuth flow → go back to Vercel remote auth page cleanly
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
                    String launchUrl = "https://consistency-daily.vercel.app/index.html?openChat=" + groupId + "&t=" + System.currentTimeMillis();
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

    private void handleNativeDownload(final String url, final String mimetype) {
        if (url == null) return;

        if (url.startsWith("data:")) {
            // Handle Base64 Data URL (e.g. data:image/png;base64,...)
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        int commaIndex = url.indexOf(",");
                        if (commaIndex == -1) return;
                        
                        String base64Data = url.substring(commaIndex + 1);
                        final byte[] decodedBytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT);
                        
                        // Extract file extension and construct filename
                        String ext = "bin";
                        if (mimetype != null) {
                            if (mimetype.contains("png")) ext = "png";
                            else if (mimetype.contains("jpeg") || mimetype.contains("jpg")) ext = "jpg";
                            else if (mimetype.contains("pdf")) ext = "pdf";
                        } else {
                            // Guess mimetype from data: uri header
                            String header = url.substring(0, commaIndex);
                            if (header.contains("png")) ext = "png";
                            else if (header.contains("jpeg") || header.contains("jpg")) ext = "jpg";
                            else if (header.contains("pdf")) ext = "pdf";
                        }
                        
                        final String fileName = "exported_canvas_" + System.currentTimeMillis() + "." + ext;
                        
                        boolean success = false;
                        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                            // Use MediaStore for Android 10+ (no permissions required for Downloads)
                            android.content.ContentResolver resolver = getContentResolver();
                            android.content.ContentValues contentValues = new android.content.ContentValues();
                            contentValues.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                            contentValues.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, mimetype);
                            contentValues.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS);
                            
                            android.net.Uri uri = resolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues);
                            if (uri != null) {
                                android.os.ParcelFileDescriptor pfd = resolver.openFileDescriptor(uri, "w");
                                if (pfd != null) {
                                    java.io.FileOutputStream fos = new java.io.FileOutputStream(pfd.getFileDescriptor());
                                    fos.write(decodedBytes);
                                    fos.close();
                                    pfd.close();
                                    success = true;
                                }
                            }
                        } else {
                            // Fallback for older Android versions using standard file storage
                            java.io.File path = android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS);
                            if (!path.exists()) {
                                path.mkdirs();
                            }
                            java.io.File file = new java.io.File(path, fileName);
                            java.io.FileOutputStream fos = new java.io.FileOutputStream(file);
                            fos.write(decodedBytes);
                            fos.close();
                            success = true;
                        }
                        
                        final boolean isSuccess = success;
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                if (isSuccess) {
                                    android.widget.Toast.makeText(MainActivity.this, "File saved to Downloads: " + fileName, android.widget.Toast.LENGTH_LONG).show();
                                } else {
                                    android.widget.Toast.makeText(MainActivity.this, "Failed to save file", android.widget.Toast.LENGTH_SHORT).show();
                                }
                            }
                        });
                    } catch (final Exception e) {
                        e.printStackTrace();
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                android.widget.Toast.makeText(MainActivity.this, "Error: " + e.getMessage(), android.widget.Toast.LENGTH_SHORT).show();
                            }
                        });
                    }
                }
            }).start();
        } else {
            // Handle standard HTTP/HTTPS URLs via DownloadManager or system intent
            try {
                android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url));
                startActivity(intent);
            } catch (Exception e) {
                android.widget.Toast.makeText(this, "Cannot open download URL", android.widget.Toast.LENGTH_SHORT).show();
            }
        }
    }

    private boolean handleCustomScheme(String url) {
        if (url == null) return false;

        // If it is a standard web or local URL, do not intercept it
        if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("about:") || url.startsWith("javascript:") || url.startsWith("file://") || url.startsWith("data:")) {
            return false;
        }

        android.util.Log.d("CustomSchemeHandler", "Intercepted custom scheme: " + url);

        // Handle intent:// schemes
        if (url.startsWith("intent://")) {
            try {
                android.content.Intent intent = android.content.Intent.parseUri(url, android.content.Intent.URI_INTENT_SCHEME);
                if (intent != null) {
                    try {
                        startActivity(intent);
                    } catch (android.content.ActivityNotFoundException e) {
                        // Fallback handling if target app is not installed
                        String fallbackUrl = intent.getStringExtra("browser_fallback_url");
                        if (fallbackUrl != null && !fallbackUrl.isEmpty()) {
                            android.util.Log.d("CustomSchemeHandler", "Target app not installed. Loading fallback URL: " + fallbackUrl);
                            this.bridge.getWebView().loadUrl(fallbackUrl);
                        } else {
                            String packageName = intent.getPackage();
                            if (packageName != null) {
                                android.util.Log.d("CustomSchemeHandler", "Target app not installed. Opening Play Store for: " + packageName);
                                try {
                                    android.content.Intent marketIntent = new android.content.Intent(
                                        android.content.Intent.ACTION_VIEW,
                                        android.net.Uri.parse("market://details?id=" + packageName)
                                    );
                                    startActivity(marketIntent);
                                } catch (Exception ex) {
                                    android.widget.Toast.makeText(MainActivity.this, "This application is not installed on your device.", android.widget.Toast.LENGTH_LONG).show();
                                }
                            } else {
                                android.widget.Toast.makeText(MainActivity.this, "This application is not installed on your device.", android.widget.Toast.LENGTH_LONG).show();
                            }
                        }
                    }
                    return true;
                }
            } catch (Exception e) {
                android.util.Log.e("CustomSchemeHandler", "Failed to parse/handle intent URI: " + url, e);
            }
            return true;
        }

        // Direct custom scheme (gpay://, phonepe://, paytm://, upi://)
        try {
            android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url));
            startActivity(intent);
        } catch (Exception e) {
            android.util.Log.e("CustomSchemeHandler", "Failed to start activity for custom scheme: " + url, e);
            
            // Detect user-friendly payment name
            String appName = "payment app";
            if (url.startsWith("gpay://")) appName = "Google Pay";
            else if (url.startsWith("phonepe://")) appName = "PhonePe";
            else if (url.startsWith("paytm://")) appName = "Paytm";
            else if (url.startsWith("bhim://")) appName = "BHIM UPI";
            
            final String finalAppName = appName;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    android.widget.Toast.makeText(
                        MainActivity.this, 
                        "The " + finalAppName + " app is not installed. Please choose another payment method.", 
                        android.widget.Toast.LENGTH_LONG
                    ).show();
                }
            });
        }
        return true;
    }
}
