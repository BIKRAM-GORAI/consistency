package com.consistency.daily;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Bypasses Google's WebView OAuth block by setting a standard mobile Chrome User-Agent
        this.bridge.getWebView().getSettings().setUserAgentString(
            "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
        );
    }

    @Override
    public void onBackPressed() {
        WebView webView = this.bridge.getWebView();
        String currentUrl = webView.getUrl() != null ? webView.getUrl() : "";
        
        boolean isOnOAuthPage = currentUrl.contains("accounts.google.com")
            || currentUrl.contains("github.com/login")
            || currentUrl.contains("github.com/session")
            || currentUrl.contains("facebook.com/login")
            || currentUrl.contains("facebook.com/dialog")
            || currentUrl.contains("firebaseapp.com/__/auth");
        
        if (isOnOAuthPage) {
            // Cancel OAuth flow → go back to auth page cleanly
            webView.loadUrl("https://consistency-daily.vercel.app/auth.html");
        } else if (webView.canGoBack()) {
            webView.goBack();
        } else {
            // Minimize instead of closing (better UX)
            moveTaskToBack(true);
        }
    }
}
