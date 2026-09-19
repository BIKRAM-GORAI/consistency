/**
 * deviceInsets.js
 * Dynamic Safe-Area & Viewport Inset Controller (100% OTA)
 * 
 * Automatically detects and applies:
 * 1. Top status bar / notification bar / camera punch hole insets (--safe-top)
 * 2. Bottom 3-button virtual navigation bar insets (--safe-bottom, --android-bottom-bar)
 * Ensures gestures remain edge-to-edge while 3-button navigation users get clean spacing.
 */

(function initDeviceInsets() {
  function updateInsets() {
    const isAndroid = /Android/i.test(navigator.userAgent) || document.body?.classList.contains('native-android');
    const isMobile = window.innerWidth <= 1024;
    
    // ── 1. BOTTOM SAFE-AREA INSET (3-Button Nav vs Gesture Navigation) ──
    let bottomInset = 0;
    
    if (isMobile) {
      // In Android, screen.availHeight excludes the system 3-button navigation bar.
      // If 3-button nav is enabled, (screen.height - screen.availHeight) is typically 44px - 64px.
      // If gestures are used, the difference is negligible (0px to 16px).
      const screenDiff = Math.max(0, window.screen.height - window.screen.availHeight);
      
      if (screenDiff > 20) {
        bottomInset = screenDiff;
      } else if (window.visualViewport) {
        // Fallback check against visualViewport offset
        const vvDiff = Math.max(0, window.innerHeight - window.visualViewport.height);
        if (vvDiff > 20 && vvDiff < 80) {
          bottomInset = vvDiff;
        }
      }
      
      // If on native Android APK and 3-button navigation difference is confirmed:
      if (isAndroid && bottomInset > 0) {
        // Cap to reasonable range (44px - 60px) to prevent abnormal layout shifts
        bottomInset = Math.min(60, Math.max(44, bottomInset));
      }
    }
    
    const bottomPx = bottomInset > 0 ? `${bottomInset}px` : '0px';
    document.documentElement.style.setProperty('--safe-bottom', bottomPx);
    document.documentElement.style.setProperty('--android-bottom-bar', bottomPx);
    
    // ── 2. TOP SAFE-AREA INSET (Status Bar / Notification Area / Camera Notch) ──
    let topInset = 0;
    if (isMobile) {
      if (isAndroid) {
        // Android status bar + camera punch hole baseline is 32px to 40px
        topInset = 36;
      }
    }
    
    const topPx = topInset > 0 ? `${topInset}px` : '0px';
    document.documentElement.style.setProperty('--safe-top', topPx);
  }

  // Initial calculation
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateInsets);
  } else {
    updateInsets();
  }

  // Update on screen resize / orientation change / visualViewport scroll
  window.addEventListener('resize', updateInsets, { passive: true });
  window.addEventListener('orientationchange', () => {
    setTimeout(updateInsets, 200);
  }, { passive: true });
  
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateInsets, { passive: true });
  }

  window.updateDeviceInsets = updateInsets;
})();
