/**
 * Selection Manager Adapter
 * Manages legacy selection implementation
 */
window.SelectionManagerAdapter = {
    // State management
    initialized: false,
    
    // Instances
    legacyInstance: null,
    
    // Configuration
    config: {
        selectionColor: '#ff0000',
        selectionBorderWidth: 4,
        maxSelectableNodes: 10000,
        clearOnBackgroundClick: true
    },
    
    /**
     * Initialize the adapter
     */
    init: function() {
        
        // Initialize legacy instance (GraphRenderer)
        this.legacyInstance = window.GraphRenderer;

        this.initialized = true;
        
        // Expose global functions
        this.exposeGlobalFunctions();
        return true;
    },
    
    /**
     * Get selected nodes count
     */
    getSelectedNodesCount: function() {
        if (this.legacyInstance && this.legacyInstance.getSelectedNodesCount) {
            return this.legacyInstance.getSelectedNodesCount();
        }
        return 0;
    },
    
    /**
     * Get selected nodes
     */
    getSelectedNodes: function() {
        if (this.legacyInstance && this.legacyInstance.getSelectedNodes) {
            return this.legacyInstance.getSelectedNodes();
        }
        return [];
    },
    
    /**
     * Clear selection
     */
    clearSelection: function() {
        if (this.legacyInstance && this.legacyInstance.clearSelection) {
            this.legacyInstance.clearSelection();
            return true;
        }
        return false;
    },
    
    /**
     * Select nodes by type
     */
    selectNodesByType: function(type) {
        if (this.legacyInstance && this.legacyInstance.selectNodesByType) {
            return this.legacyInstance.selectNodesByType(type);
        }
        return 0;
    },
    
    /**
     * Select nodes by property
     */
    selectNodesByProperty: function(property, value) {
        return 0;
    },
    
    /**
     * Invert selection
     */
    invertSelection: function() {
        if (this.legacyInstance && this.legacyInstance.invertSelection) {
            return this.legacyInstance.invertSelection();
        }
        return 0;
    },
    
    /**
     * Select all nodes
     */
    selectAllNodes: function() {
        if (this.legacyInstance && this.legacyInstance.cy) {
            try {
                const nodes = this.legacyInstance.cy.nodes();
                nodes.select();
                return nodes.length;
            } catch (error) {
                return 0;
            }
        }
        return 0;
    },
    
    /**
     * Toggle selection mode
     */
    toggleSelectionMode: function() {
        if (this.legacyInstance && this.legacyInstance.toggleSelectionMode) {
            return this.legacyInstance.toggleSelectionMode();
        }
        return false;
    },
    
    /**
     * Enable selection mode
     */
    enableSelectionMode: function() {
        if (this.legacyInstance && this.legacyInstance.enableSelectionMode) {
            this.legacyInstance.enableSelectionMode();
            return true;
        }
        return false;
    },
    
    /**
     * Disable selection mode
     */
    disableSelectionMode: function() {
        if (this.legacyInstance && this.legacyInstance.disableSelectionMode) {
            this.legacyInstance.disableSelectionMode();
            return true;
        }
        return false;
    },
    
    /**
     * Get selection mode status
     */
    isSelectionModeEnabled: function() {
        if (this.legacyInstance) {
            return this.legacyInstance.selectionMode || false;
        }
        return false;
    },
    
    /**
     * Generate selection report
     */
    getSelectionReport: function() {
        return {
            timestamp: new Date().toISOString(),
            implementation: 'legacy',
            selectionMode: this.isSelectionModeEnabled(),
            counts: {
                nodes: this.getSelectedNodesCount(),
                edges: 0,
                total: this.getSelectedNodesCount()
            },
            capabilities: ['basic selection', 'type selection', 'invert'],
            note: 'Legacy implementation with basic functionality'
        };
    },
    
    /**
     * Expose global functions based on current implementation
     */
    exposeGlobalFunctions: function() {
        const functions = {
            getSelectedCount: () => this.getSelectedNodesCount(),
            getSelectedNodes: () => this.getSelectedNodes(),
            clearSelection: () => this.clearSelection(),
            selectByType: (type) => this.selectNodesByType(type),
            selectAll: () => this.selectAllNodes(),
            invertSelection: () => this.invertSelection(),
            toggleSelectionMode: () => this.toggleSelectionMode(),
            enableSelectionMode: () => this.enableSelectionMode(),
            disableSelectionMode: () => this.disableSelectionMode(),
            isSelectionMode: () => this.isSelectionModeEnabled(),
            selectionReport: () => this.getSelectionReport(),
            analyzeSelection: () => {
                const report = this.getSelectionReport();
                return report;
            }
        };
        
        // Expose functions globally
        Object.assign(window, functions);
    },
    
    /**
     * Compare implementations
     */
    compareImplementations: function() {
        const comparison = {
            legacy: {
                available: !!(this.legacyInstance && this.legacyInstance.getSelectedNodesCount),
                features: ['basic selection', 'type selection', 'invert', 'selection mode'],
                limitations: ['No history', 'No property selection', 'Limited box selection']
            }
        };
        return comparison;
    },
    
    /**
     * Get status of both implementations
     */
    getStatus: function() {
        return {
            legacyAvailable: !!(this.legacyInstance && this.legacyInstance.getSelectedNodesCount),
            currentImplementation: 'legacy',
            globalFunctionsAvailable: [
                'getSelectedCount', 'getSelectedNodes', 'clearSelection', 'selectByType',
                'selectAll', 'invertSelection', 'toggleSelectionMode', 'enableSelectionMode',
                'disableSelectionMode', 'isSelectionMode', 'selectionReport', 'analyzeSelection'
            ].map(name => ({ name, available: !!window[name] }))
        };
    }
};

// Auto-initialize when GraphRenderer is available
if (window.GraphRenderer) {
    window.SelectionManagerAdapter.init();
} else {
    // Wait for GraphRenderer to be available
    const checkGraphRenderer = setInterval(() => {
        if (window.GraphRenderer) {
            clearInterval(checkGraphRenderer);
            window.SelectionManagerAdapter.init();
        }
    }, 100);
}
