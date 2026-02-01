/**
 * Progress Manager Adapter
 * Manages legacy progress management global exposure
 */
class ProgressManagerAdapter {
    constructor() {
        this.legacyInstance = null;
        this.globalFunctionsExposed = false;
        
        // Function mapping for consistent interface
        this.functionMap = {
            // Core progress functions
            'showLoadingProgress': 'showLoadingProgress',
            'updateLoadingProgress': 'updateLoadingProgress',
            'hideLoadingProgress': 'hideLoadingProgress',
            
            // Enhanced progress functions
            'showProgress': 'showProgress',
            'updateProgress': 'updateLoadingProgress', // Alias
            'hideProgress': 'hideLoadingProgress',     // Alias
            
            // Progress management
            'getActiveOperations': 'getActiveOperations',
            'cancelOperation': 'cancelOperation',
            'pauseOperation': 'pauseOperation',
            'resumeOperation': 'resumeOperation',
            
            // Theme and configuration
            'setProgressTheme': 'setProgressTheme',
            'getProgressConfig': 'getProgressConfig',
            
            // Reporting
            'progressManagerReport': 'generateProgressManagerReport'
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
        } else {
        }

        this.enableLegacyVersion();
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
            console.error('Progress Manager Adapter: Failed to switch to legacy version:', error);
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
        
        // Core progress functions
        window.showLoadingProgress = (operationId, options) => {
            if (instance.showLoadingProgress) {
                try {
                    instance.showLoadingProgress();
                    return true; // Convert undefined/void to boolean success
                } catch (error) {
                    console.error('Legacy showLoadingProgress error:', error);
                    return false;
                }
            }
            return false;
        };
        
        window.updateLoadingProgress = (operationIdOrPercent, progressOrText, text) => {
            // Handle both legacy and modern call patterns
            if (typeof operationIdOrPercent === 'number') {
                // Legacy call: updateLoadingProgress(percent, text)
                if (instance.updateLoadingProgress) {
                    try {
                        instance.updateLoadingProgress(operationIdOrPercent, progressOrText);
                        return true; // Convert undefined/void to boolean success
                    } catch (error) {
                        console.error('Legacy updateLoadingProgress error:', error);
                        return false;
                    }
                }
            }
            // Try to handle as modern call
            if (instance.updateLoadingProgress) {
                try {
                    instance.updateLoadingProgress(progressOrText, text);
                    return true; // Convert undefined/void to boolean success
                } catch (error) {
                    console.error('Legacy updateLoadingProgress error:', error);
                    return false;
                }
            }
            return false;
        };
        
        window.hideLoadingProgress = (operationId, options) => {
            if (instance.hideLoadingProgress) {
                try {
                    instance.hideLoadingProgress();
                    return true; // Convert undefined/void to boolean success
                } catch (error) {
                    console.error('Legacy hideLoadingProgress error:', error);
                    return false;
                }
            }
            return false;
        };
        
        // Enhanced functions (not available in legacy)
        window.showProgress = (templateId, operationId, customOptions) => {
            return window.showLoadingProgress();
        };
        
        // Aliases
        window.updateProgress = window.updateLoadingProgress;
        window.hideProgress = window.hideLoadingProgress;
        
        // Progress management (mock implementations for legacy)
        window.getActiveOperations = () => {
            return ['default']; // Legacy only supports one operation
        };
        
        window.cancelOperation = (operationId) => {
            return window.hideLoadingProgress();
        };
        
        window.pauseOperation = (operationId) => {
            return false;
        };
        
        window.resumeOperation = (operationId) => {
            return false;
        };
        
        // Theme and configuration (mock for legacy)
        window.setProgressTheme = (themeName) => {
            return false;
        };
        
        window.getProgressConfig = () => {
            return {
                legacy: true,
                animations: { enabled: false },
                themes: { current: 'default' }
            };
        };
        
        // Reporting
        window.progressManagerReport = () => {
            const report = {
                timestamp: new Date().toISOString(),
                implementation: 'legacy',
                activeOperations: 1,
                capabilities: ['basicProgress', 'loadingIndicators']
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
     * Test current implementation
     */
    testImplementation() {
        const status = this.getStatus();
        
        // Test basic function availability
        const testResults = {
            functionsExposed: this.getAvailableGlobalFunctions().length,
            progressShowSupported: typeof window.showLoadingProgress === 'function',
            progressUpdateSupported: typeof window.updateLoadingProgress === 'function',
            progressHideSupported: typeof window.hideLoadingProgress === 'function',
            enhancedFeaturesSupported: typeof window.showProgress === 'function',
            reportingSupported: typeof window.progressManagerReport === 'function'
        };
        return testResults;
    }
}

// Auto-initialize if we have access to required dependencies
if (typeof window !== 'undefined') {
    window.ProgressManagerAdapter = new ProgressManagerAdapter();
    
    // Also expose the adapter globally for testing
    window.ProgressManagerAdapter = window.ProgressManagerAdapter;
}
