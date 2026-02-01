/**
 * Graph Controls Bootstrap
 * Initializes the GraphControlsModule and exposes global helpers.
 */
window.GraphControlsModuleBootstrap = {
    initialized: false,
    moduleInstance: null,
    config: {
        defaultZoomStep: 1.2,
        minZoom: 0.1,
        maxZoom: 10,
        animationDuration: 400
    },

    init: function() {
        if (this.initialized) {
            return !!this.moduleInstance;
        }

        const cy = window.GraphRenderer?.cy;
        if (!window.GraphControlsModule || !cy) {
            return false;
        }

        try {
            this.moduleInstance = new window.GraphControlsModule({
                cytoscape: cy,
                notifications: {
                    show: (message, type = 'info') => {
                        if (window.UI && typeof window.UI.showNotification === 'function') {
                            window.UI.showNotification(message, type);
                        }
                    }
                },
                config: this.config
            });
            if (this.moduleInstance) {
                this.moduleInstance.exposeGlobalFunctions();
            }
        } catch (error) {
            console.error('GraphControlsModuleBootstrap: failed to initialize', error);
            this.moduleInstance = null;
        }

        this.initialized = true;
        return !!this.moduleInstance;
    }
};

if (window.GraphRenderer && !window.GraphControlsModuleBootstrap.initialized) {
    window.GraphControlsModuleBootstrap.init();
} else if (!window.GraphRenderer && !window.GraphControlsModuleBootstrap.initialized) {
    const checkGraphRenderer = setInterval(() => {
        if (window.GraphRenderer && !window.GraphControlsModuleBootstrap.initialized) {
            clearInterval(checkGraphRenderer);
            window.GraphControlsModuleBootstrap.init();
        }
    }, 100);
}
