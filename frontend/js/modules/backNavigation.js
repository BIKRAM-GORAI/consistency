/**
 * backNavigation.js
 * Centralized Back Navigation Controller (100% OTA)
 * 
 * Manages:
 * 1. Physical / Hardware Android back button
 * 2. Mobile browser back button & gestures
 * 3. Multi-layer modal / sheet / drawer / lightbox dismissals (LIFO)
 * 4. Tab / page navigation history back to Home
 * 5. Clean app minimization when on Home with nothing open
 */

(function initBackNavigation() {
  const overlayStack = []; // [{ id, type, closeFn }]
  const pageHistory = [];  // ['home', 'goals', ...]
  let isProgrammaticBack = false;
  let isPopstateHandling = false;

  // Set initial page history state
  const initialPage = localStorage.getItem('activePage') || 'home';
  pageHistory.push(initialPage);

  // Replace initial state so root is identified
  if (window.history && window.history.replaceState) {
    window.history.replaceState({ isPage: true, page: initialPage, isRoot: true }, '', `#${initialPage}`);
  }

  /**
   * Register opening of an overlay (lightbox, modal, drawer, sheet)
   */
  function pushOverlay(id, closeFn, type = 'modal') {
    if (!id || typeof closeFn !== 'function') return;

    // Remove existing if already present to ensure it's at the top of LIFO stack
    const existingIdx = overlayStack.findIndex(item => item.id === id);
    if (existingIdx !== -1) {
      overlayStack.splice(existingIdx, 1);
    }

    overlayStack.push({ id, type, closeFn });

    // Push entry to browser history
    if (window.history && window.history.pushState) {
      window.history.pushState(
        { isOverlay: true, overlayId: id, type, timestamp: Date.now() },
        '',
        window.location.hash || ''
      );
    }
  }

  /**
   * Register closing of an overlay from the UI (✕ button, cancel, backdrop click)
   */
  function popOverlay(id) {
    if (!id) return;
    const existingIdx = overlayStack.findIndex(item => item.id === id);
    if (existingIdx === -1) return;

    overlayStack.splice(existingIdx, 1);

    // If closed via UI action (not via popstate / physical back), sync browser history
    if (!isPopstateHandling) {
      isProgrammaticBack = true;
      if (window.history && window.history.length > 1) {
        window.history.back();
      }
    }
  }

  /**
   * Record page/tab visit from showPage()
   */
  function recordPage(page) {
    if (!page) return;
    if (isPopstateHandling) return;

    const currentPage = pageHistory[pageHistory.length - 1];
    if (currentPage === page) return;

    pageHistory.push(page);

    if (window.history && window.history.pushState) {
      window.history.pushState(
        { isPage: true, page, timestamp: Date.now() },
        '',
        `#${page}`
      );
    }
  }

  /**
   * Core Back Dispatcher: handles physical back button or popstate
   * Returns true if back action was consumed, false if at root
   */
  function handleBack() {
    // 1. If search is open / focused, close search first
    if (document.body && document.body.classList.contains('search-active')) {
      const searchInput = document.getElementById('nav-search-input');
      const searchDropdown = document.getElementById('nav-search-dropdown');
      if (searchInput) searchInput.value = '';
      if (searchDropdown) searchDropdown.style.display = 'none';
      if (typeof window.collapseSearchInput === 'function') window.collapseSearchInput();
      document.body.classList.remove('search-active');
      return true;
    }

    // 2. If any overlay/modal/lightbox is open, close the topmost one (LIFO)
    if (overlayStack.length > 0) {
      const topOverlay = overlayStack.pop();
      isPopstateHandling = true;
      try {
        if (typeof topOverlay.closeFn === 'function') {
          topOverlay.closeFn();
        }
      } catch (err) {
        console.warn('[BackNav] Error closing overlay:', err);
      } finally {
        isPopstateHandling = false;
      }
      return true;
    }

    // 3. If no overlay is open, step back in tab/page history
    if (pageHistory.length > 1) {
      pageHistory.pop(); // Remove current page
      const prevPage = pageHistory[pageHistory.length - 1] || 'home';
      isPopstateHandling = true;
      try {
        if (typeof window.showPage === 'function') {
          window.showPage(prevPage);
        }
      } catch (err) {
        console.warn('[BackNav] Error navigating page:', err);
      } finally {
        isPopstateHandling = false;
      }
      return true;
    }

    // 4. Already on root ('home') with nothing open: allow native Android to minimize
    return false;
  }

  // Intercept HTML5 popstate events (fired by webView.goBack() or browser Back button)
  window.addEventListener('popstate', (e) => {
    if (isProgrammaticBack) {
      // Popstate was triggered programmatically by UI "✕" button close, ignore
      isProgrammaticBack = false;
      return;
    }

    handleBack();
  });

  // Also hook into Capacitor native App plugin if available in runtime
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    try {
      window.Capacitor.Plugins.App.addListener('backButton', ({ canGoBack }) => {
        const handled = handleBack();
        if (!handled && window.Capacitor.Plugins.App.exitApp) {
          // Clean exit / minimize on root
          window.Capacitor.Plugins.App.exitApp();
        }
      });
    } catch (e) {
      console.warn('[BackNav] Capacitor App plugin backButton listener skipped:', e);
    }
  }

  // ── Automatic 3-Button Navigation Bar Offset Detection ──
  function updateNavBarOffset() {
    const isMobile = window.innerWidth <= 1024;
    let offset = 0;

    if (isMobile) {
      // In 3-button navigation, screenDiff is typically 44px - 64px.
      // In full-screen gestures, screenDiff is <= 24px.
      const screenDiff = Math.max(0, window.screen.height - window.screen.availHeight);
      if (screenDiff >= 36) {
        offset = Math.min(56, Math.max(44, screenDiff));
      }
    }

    document.documentElement.style.setProperty(
      '--bnav-bottom-offset',
      offset > 0 ? `${offset}px` : '0px'
    );
  }

  updateNavBarOffset();
  window.addEventListener('resize', updateNavBarOffset, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(updateNavBarOffset, 200), { passive: true });

  // Expose global API
  window.BackNav = {
    pushOverlay,
    popOverlay,
    recordPage,
    handleBack,
    updateNavBarOffset,
    getStack: () => [...overlayStack],
    getHistory: () => [...pageHistory]
  };
})();
