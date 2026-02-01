/**
 * Performance Manager Bootstrap
 * Initializes the PerformanceManagerModule and exposes global helpers.
 */
window.PerformanceManagerModuleBootstrap = {
    initialized: false,
    moduleInstance: null,

    init: function() {
        if (this.initialized) {
            return !!this.moduleInstance;
        }

        const cy = window.GraphRenderer?.cy;
        if (!window.PerformanceManagerModule || !cy) {
            return false;
        }

        try {
            this.moduleInstance = new window.PerformanceManagerModule({
                cytoscape: cy,
                notifications: {
                    show: (message, type = 'info') => {
                        if (window.UI && typeof window.UI.showNotification === 'function') {
                            window.UI.showNotification(message, type);
                        }
                    }
                },
                config: window.Config || {}
            });

            if (this.moduleInstance) {
                this.exposeGlobalFunctions();
            }
        } catch (error) {
            console.error('PerformanceManagerModuleBootstrap: failed to initialize', error);
            this.moduleInstance = null;
        }

        this.initialized = true;
        return !!this.moduleInstance;
    },

    exposeGlobalFunctions: function() {
        const instance = this.moduleInstance;
        if (!instance) {
            return;
        }

        window.setupPerformanceMonitoring = () => instance.setupPerformanceMonitoring();
        window.checkWebGLSupport = () => instance.checkWebGLSupport();
        window.updatePerformanceMetrics = (renderTime) => instance.updatePerformanceMetrics(renderTime);
        window.checkMemoryUsage = () => instance.checkMemoryUsage();
        window.optimizeMemoryUsage = () => instance.optimizeMemoryUsage();
        window.setupKeepAliveTick = () => instance.setupKeepAliveTick();
        window.applyAggressiveLOD = () => instance.applyAggressiveLOD();
        window.performanceReport = () => instance.getPerformanceReport();
    }
};

if (window.GraphRenderer && !window.PerformanceManagerModuleBootstrap.initialized) {
    window.PerformanceManagerModuleBootstrap.init();
} else if (!window.GraphRenderer && !window.PerformanceManagerModuleBootstrap.initialized) {
    const checkGraphRenderer = setInterval(() => {
        if (window.GraphRenderer && !window.PerformanceManagerModuleBootstrap.initialized) {
            clearInterval(checkGraphRenderer);
            window.PerformanceManagerModuleBootstrap.init();
        }
    }, 100);
}
