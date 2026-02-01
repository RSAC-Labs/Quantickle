/**
 * Data Manager Adapter
 *
 * Bridges the modular DataManagerModule with the rest of the application.
 * Provides a consistent interface so the rest of the application can interact
 * with `window.DataManager` using the modular implementation only.
 */

window.DataManagerAdapter = {
    moduleInstance: null,
    useModularVersion: true,
    preferredMode: 'modular',

    /**
     * Initialize the adapter and create the modular data manager instance.
     */
    init: function() {
        try {
            if (window.DataManagerModule && !this.moduleInstance) {
                const dependencies = {
                    cytoscape: window.GraphRenderer ? window.GraphRenderer.cy : null,
                    notifications: {
                        show: (message, type = 'info') => {
                            if (window.UI && window.UI.showNotification) {
                                window.UI.showNotification(message, type);
                            } else {
                            }
                        }
                    },
                    config: window.QuantickleConfig || {}
                };

                this.moduleInstance = new DataManagerModule(dependencies);
            }
        } catch (err) {
            console.error('Data Manager Adapter: failed to initialize modular version:', err);
            this.moduleInstance = null;
        }

        this.preferredMode = 'modular';
        this.useModularVersion = true;

        if (this.moduleInstance) {
            window.DataManager = this.moduleInstance;
        } else {
            console.error('Data Manager Adapter: modular implementation is required but unavailable.');
        }
    },

    /**
     * Switch to the modular data manager implementation.
     */
    enableModularVersion: function() {
        if (this.moduleInstance) {
            this.useModularVersion = true;
            window.DataManager = this.moduleInstance;
        }
    },

    /**
     * Get adapter status for debugging.
     */
    getStatus: function() {
        return {
            currentImplementation: this.useModularVersion ? 'modular' : 'legacy',
            preferredMode: this.preferredMode,
            hasModule: !!this.moduleInstance
        };
    },

    // === Proxy helpers to keep interface consistent ===
    setGraphData: function(data, options) {
        if (this.useModularVersion && this.moduleInstance) {
            return this.moduleInstance.setGraphData(data, options);
        }
    },

    getGraphData: function() {
        if (this.useModularVersion && this.moduleInstance) {
            return this.moduleInstance.getGraphData();
        }
        return { nodes: [], edges: [] };
    },

    generateSampleData: function(count) {
        if (this.useModularVersion && this.moduleInstance && typeof this.moduleInstance.generateSampleData === 'function') {
            return this.moduleInstance.generateSampleData(count);
        }
        return { nodes: [], edges: [] };
    },

    calculateRelationships: function() {
        if (this.useModularVersion && this.moduleInstance && typeof this.moduleInstance.calculateRelationships === 'function') {
            return this.moduleInstance.calculateRelationships();
        }
        return [];
    }
};
