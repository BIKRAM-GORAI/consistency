/**
 * Vercel Speed Insights initialization module
 * Tracks page load performance metrics and Web Vitals
 */

import { injectSpeedInsights } from '../../libs/speed-insights.js';

/**
 * Initialize Vercel Speed Insights for the application
 * This tracks Core Web Vitals and performance metrics automatically
 */
export function initSpeedInsights() {
  try {
    // Initialize Speed Insights with default configuration
    // Vercel automatically handles route detection and metric collection
    injectSpeedInsights({
      debug: false // Set to true to see logs in development
    });
    
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.log('[Speed Insights] Initialized in development mode');
    }
  } catch (error) {
    console.error('[Speed Insights] Failed to initialize:', error);
  }
}

// Auto-initialize when module is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSpeedInsights);
} else {
  initSpeedInsights();
}
