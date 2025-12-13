// main.js -> Entry Point for beamforming simulation

import { AppController } from './AppController.js';

let app = null;

function init() {
    console.log('Initializing');

    app = new AppController();
    app.init();

    console.log('Initialized');

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