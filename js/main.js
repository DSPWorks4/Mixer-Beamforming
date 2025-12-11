/**
 * main.js - Application Entry Point
 * 
 * This file handles only initialization.
 * All logic is delegated to the AppController.
 */

import { AppController } from './AppController.js';

// Application instance
let app = null;

/**
 * Initialize the application when DOM is ready
 */
function init() {
    console.log('🚀 Initializing Beamforming Simulator...');

    // Create and initialize the application controller
    app = new AppController();
    app.init();

    console.log('✅ Beamforming Simulator initialized successfully');
    console.log('📖 Use the controls on the right to adjust parameters');
    console.log('📡 Select different scenarios to see various beamforming applications');
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Export for debugging
window.beamformingApp = {
    get controller() { return app; },
    get context() { return app?.context; }
};
