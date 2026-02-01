/**
 * Edge Creator Adapter
 * Exposes legacy edge creation functions from GraphRenderer
 */
class EdgeCreatorAdapter {
    constructor() {
        this.legacyInstance = null;
        this.globalFunctionsExposed = false;
        this.escapeKeyHandler = null;
        
        // Function mapping for consistent interface
        this.functionMap = {
            // Core edge creation functions
            'handleShiftClick': 'handleShiftClick',
            'startEdgeCreation': 'startEdgeCreation', 
            'completeEdgeCreation': 'completeEdgeCreation',
            'cancelEdgeCreation': 'cancelEdgeCreation',
            'startGroupEdgeCreation': 'startGroupEdgeCreation',
            'completeGroupEdgeCreation': 'completeGroupEdgeCreation',
            
            // Edge creation mode management
            'resetEdgeCreationMode': 'resetEdgeCreationMode',
            'isEdgeCreationMode': 'isEdgeCreationMode',
            'getEdgeCreationStatus': 'getEdgeCreationStatus',
            
            // Visual indicators
            'showEdgeCreationIndicator': 'showEdgeCreationIndicator',
            'showGroupEdgeCreationIndicator': 'showGroupEdgeCreationIndicator', 
            'hideEdgeCreationIndicator': 'hideEdgeCreationIndicator',
            
            // Reporting
            'edgeCreatorReport': 'generateEdgeCreatorReport'
        };
        
        this.init();
    }
    
    /**
     * Initialize the adapter
     */
    init() {
        
        // Initialize legacy instance (GraphRenderer)
        if (window.GraphRenderer) {
            this.legacyInstance = window.GraphRenderer;
        }

        // Start with legacy implementation
        this.enableLegacyVersion();

        // Ensure escape key uses the active implementation
        this.registerEscapeKeyHandler();
    }
    
    /**
     * Get current status
     */
    getStatus() {
        const status = {
            legacyAvailable: !!this.legacyInstance,
            globalFunctionsAvailable: this.getAvailableGlobalFunctions()
        };
        return status;
    }
    
    /**
     * Switch to legacy version
     */
    enableLegacyVersion() {
        if (!this.legacyInstance) {
            return false;
        }
        
        try {
            this.exposeGlobalFunctions();
            return true;
        } catch (error) {
            console.error('Edge Creator Adapter: Failed to switch to legacy version:', error);
            return false;
        }
    }
    
    /**
     * Expose global functions based on current implementation
     */
    exposeGlobalFunctions() {
        
        // Remove existing global functions
        Object.keys(this.functionMap).forEach(funcName => {
            if (window[funcName]) {
                delete window[funcName];
            }
        });
        
        if (this.legacyInstance) {
            this.exposeLegacyGlobalFunctions();
        }
        
        this.globalFunctionsExposed = true;
    }
    
    /**
     * Expose legacy global functions
     */
    exposeLegacyGlobalFunctions() {
        const instance = this.legacyInstance;
        
        // Core edge creation functions
        window.handleShiftClick = (node) => {
            if (instance.handleShiftClick) {
                return instance.handleShiftClick(node);
            }
            return false;
        };
        
        window.startEdgeCreation = (sourceNode) => {
            if (instance.startEdgeCreation) {
                return instance.startEdgeCreation(sourceNode);
            }
            return false;
        };
        
        window.completeEdgeCreation = (targetNode) => {
            if (instance.completeEdgeCreation) {
                return instance.completeEdgeCreation(targetNode);
            }
            return false;
        };
        
        window.cancelEdgeCreation = () => {
            if (instance.cancelEdgeCreation) {
                return instance.cancelEdgeCreation();
            }
            return false;
        };
        
        window.startGroupEdgeCreation = (sourceNodes, clickedNode) => {
            if (instance.startGroupEdgeCreation) {
                return instance.startGroupEdgeCreation(sourceNodes, clickedNode);
            }
            return false;
        };
        
        window.completeGroupEdgeCreation = (targetNode) => {
            if (instance.completeGroupEdgeCreation) {
                return instance.completeGroupEdgeCreation(targetNode);
            }
            return false;
        };
        
        // Edge creation mode management
        window.resetEdgeCreationMode = () => {
            if (instance.resetEdgeCreationMode) {
                return instance.resetEdgeCreationMode();
            }
            return false;
        };
        
        window.isEdgeCreationMode = () => {
            if (instance.edgeCreationMode !== undefined) {
                return instance.edgeCreationMode;
            }
            return false;
        };
        
        window.getEdgeCreationStatus = () => {
            return {
                active: instance.edgeCreationMode || false,
                mode: instance.edgeSourceNodes ? 'group' : 'single',
                sourceCount: instance.edgeSourceNodes ? instance.edgeSourceNodes.length : (instance.edgeSourceNode ? 1 : 0),
                sourceNodeId: instance.edgeSourceNode ? instance.edgeSourceNode.id() : null
            };
        };
        
        // Visual indicators
        window.showEdgeCreationIndicator = (sourceCount) => {
            if (instance.showEdgeCreationIndicator) {
                return instance.showEdgeCreationIndicator(sourceCount);
            }
            return false;
        };
        
        window.showGroupEdgeCreationIndicator = (nodeCount) => {
            if (instance.showGroupEdgeCreationIndicator) {
                return instance.showGroupEdgeCreationIndicator(nodeCount);
            }
            return false;
        };
        
        window.hideEdgeCreationIndicator = () => {
            if (instance.hideEdgeCreationIndicator) {
                return instance.hideEdgeCreationIndicator();
            }
            return false;
        };
        
        // Reporting
        window.edgeCreatorReport = () => {
            const report = {
                timestamp: new Date().toISOString(),
                implementation: 'legacy',
                edgeCreationActive: instance.edgeCreationMode || false,
                currentMode: instance.edgeSourceNodes ? 'group' : 'single',
                sourceCount: instance.edgeSourceNodes ? instance.edgeSourceNodes.length : (instance.edgeSourceNode ? 1 : 0),
                capabilities: ['basicEdgeCreation', 'groupEdgeCreation', 'shiftClickHandling']
            };
            return report;
        };
    }
    
    /**
     * Get list of available global functions
     */
    getAvailableGlobalFunctions() {
        const availableFunctions = [];
        
        Object.keys(this.functionMap).forEach(funcName => {
            if (window[funcName] && typeof window[funcName] === 'function') {
                availableFunctions.push(funcName);
            }
        });
        
        return availableFunctions;
    }
    
    /**
     * Update global functions (force refresh)
     */
    updateGlobalFunctions() {
        this.exposeGlobalFunctions();
    }

    /**
     * Register escape key handler that uses the active implementation
     */
    registerEscapeKeyHandler() {
        if (typeof document === 'undefined') {
            return;
        }

        if (this.escapeKeyHandler) {
            document.removeEventListener('keydown', this.escapeKeyHandler);
        }

        this.escapeKeyHandler = (event) => {
            if (event.key !== 'Escape') {
                return;
            }

            const edgeCreationActive = typeof window.isEdgeCreationMode === 'function'
                ? window.isEdgeCreationMode()
                : false;

            if (edgeCreationActive && typeof window.cancelEdgeCreation === 'function') {
                window.cancelEdgeCreation();
            }
        };

        document.addEventListener('keydown', this.escapeKeyHandler);
    }
    
    /**
     * Test current implementation
     */
    testImplementation() {
        const status = this.getStatus();
        
        // Test basic function availability
        const testResults = {
            functionsExposed: this.getAvailableGlobalFunctions().length,
            edgeCreationSupported: typeof window.handleShiftClick === 'function',
            reportingSupported: typeof window.edgeCreatorReport === 'function',
            groupEdgeSupported: typeof window.startGroupEdgeCreation === 'function'
        };
        return testResults;
    }
}

// Auto-initialize if we have access to required dependencies
if (typeof window !== 'undefined') {
    window.EdgeCreatorAdapter = new EdgeCreatorAdapter();
    
    // Also expose the adapter globally for testing
    window.EdgeCreatorAdapter = window.EdgeCreatorAdapter;
}
