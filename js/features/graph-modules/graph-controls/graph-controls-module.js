/**
 * Graph Controls Module
 * Handles navigation, zoom, fit, center, and mouse wheel interactions
 */
class GraphControlsModule {
    constructor(dependencies = {}) {
        // Required dependencies
        this.cy = dependencies.cytoscape || null;
        this.notifications = dependencies.notifications || { show: () => {} };
        this.config = dependencies.config || {};
        
        // Module state
        this.initialized = false;
        this.mouseWheelEnabled = true;
        this.zoomIndicatorVisible = false;
        this.currentZoom = 1;
        this.minZoom = this.config.minZoom ?? 0.1;
        this.maxZoom = this.config.maxZoom ?? 10;
        this.zoomStep = this.config.defaultZoomStep ?? 1.2;
        this.animationDuration = this.config.animationDuration ?? 400;
        
        // Event handlers storage
        this.eventHandlers = new Map();
        
        this.init();
    }
    
    /**
     * Initialize the graph controls module
     */
    init() {
        
        if (!this.cy) {
            return false;
        }
        
        // Setup mouse wheel zoom functionality
        this.setupMouseWheelZoom();
        
        // Setup zoom limits
        this.setupZoomLimits();
        
        // Setup event listeners
        this.setupEventListeners();
        
        this.initialized = true;
        
        return true;
    }
    
    /**
     * PUBLIC INTERFACE: Fit graph to viewport
     */
    fitGraph(options = {}) {
        if (!this.cy) {
            return false;
        }
        
        try {
            const fitOptions = {
                padding: options.padding || 20,
                animate: options.animate !== false,
                animationDuration: options.duration || this.animationDuration,
                ...options
            };

            this.cy.fit(fitOptions);
            this.syncTextCalloutsWithViewport({ immediate: true });
            this.currentZoom = this.cy.zoom();
            
            if (this.notifications.show) {
                this.notifications.show('Graph fitted to viewport', 'info');
            }
            
            return true;
            
        } catch (error) {
            console.error('[GraphControls] Error fitting graph:', error);
            return false;
        }
    }

    syncTextCalloutsWithViewport(options = {}) {
        if (typeof window === 'undefined' || !window.TextCallout ||
            typeof window.TextCallout.syncViewport !== 'function') {
            return;
        }

        try {
            window.TextCallout.syncViewport({ immediate: options.immediate === true });
        } catch (error) {
            console.warn('[GraphControls] Unable to sync text callouts with viewport:', error);
        }
    }
    
    /**
     * PUBLIC INTERFACE: Center graph in viewport
     */
    centerGraph(options = {}) {
        if (!this.cy) {
            return false;
        }
        
        try {
            const centerOptions = {
                animate: options.animate !== false,
                animationDuration: options.duration || this.animationDuration,
                ...options
            };
            
            this.cy.center(centerOptions);
            
            if (this.notifications.show) {
                this.notifications.show('Graph centered', 'info');
            }
            
            return true;
            
        } catch (error) {
            console.error('[GraphControls] Error centering graph:', error);
            return false;
        }
    }
    
    /**
     * PUBLIC INTERFACE: Zoom in
     */
    zoomIn(options = {}) {
        if (!this.cy) {
            return false;
        }
        
        try {
            const currentZoom = this.cy.zoom();
            const newZoom = Math.min(currentZoom * (options.step || this.zoomStep), this.maxZoom);
            
            const zoomOptions = {
                level: newZoom,
                renderedPosition: options.center || { 
                    x: this.cy.width() / 2, 
                    y: this.cy.height() / 2 
                }
            };
            
            this.cy.zoom(zoomOptions);
            this.currentZoom = newZoom;
            
            this.showZoomIndicator(`Zoom: ${(newZoom * 100).toFixed(0)}%`);
            
            return true;
            
        } catch (error) {
            console.error('[GraphControls] Error zooming in:', error);
            return false;
        }
    }
    
    /**
     * PUBLIC INTERFACE: Zoom out
     */
    zoomOut(options = {}) {
        if (!this.cy) {
            return false;
        }
        
        try {
            const currentZoom = this.cy.zoom();
            const newZoom = Math.max(currentZoom / (options.step || this.zoomStep), this.minZoom);
            
            const zoomOptions = {
                level: newZoom,
                renderedPosition: options.center || { 
                    x: this.cy.width() / 2, 
                    y: this.cy.height() / 2 
                }
            };
            
            this.cy.zoom(zoomOptions);
            this.currentZoom = newZoom;
            
            this.showZoomIndicator(`Zoom: ${(newZoom * 100).toFixed(0)}%`);
            
            return true;
            
        } catch (error) {
            console.error('[GraphControls] Error zooming out:', error);
            return false;
        }
    }
    
    /**
     * PUBLIC INTERFACE: Set specific zoom level
     */
    setZoom(level, options = {}) {
        if (!this.cy) {
            return false;
        }
        
        try {
            const clampedLevel = Math.max(this.minZoom, Math.min(level, this.maxZoom));
            
            const zoomOptions = {
                level: clampedLevel,
                renderedPosition: options.center || { 
                    x: this.cy.width() / 2, 
                    y: this.cy.height() / 2 
                }
            };
            
            this.cy.zoom(zoomOptions);
            this.currentZoom = clampedLevel;
            
            this.showZoomIndicator(`Zoom: ${(clampedLevel * 100).toFixed(0)}%`);
            
            return true;
            
        } catch (error) {
            console.error('[GraphControls] Error setting zoom:', error);
            return false;
        }
    }
    
    /**
     * PUBLIC INTERFACE: Get current zoom level
     */
    getCurrentZoom() {
        if (!this.cy) {
            return this.currentZoom;
        }
        
        try {
            if (typeof this.cy.zoom === 'function') {
                this.currentZoom = this.cy.zoom();
            }
        } catch (error) {
            // Return cached zoom if Cytoscape is temporarily unavailable
        }
        
        return this.currentZoom;
    }
    
    /**
     * PUBLIC INTERFACE: Reset view (fit and center)
     */
    resetView(options = {}) {
        
        const success = this.fitGraph(options) && this.centerGraph(options);
        
        if (success && this.notifications.show) {
            this.notifications.show('View reset', 'success');
        }
        
        return success;
    }
    
    /**
     * Setup mouse wheel zoom functionality
     */
    setupMouseWheelZoom() {
        if (!this.cy) return;
        
        const container = this.cy.container();
        
        // Remove existing wheel event handler to prevent duplicates
        if (this.eventHandlers.has('wheel')) {
            const existingHandler = this.eventHandlers.get('wheel');
            container.removeEventListener('wheel', existingHandler);
            this.eventHandlers.delete('wheel');
        }
        
        // Disable Cytoscape's built-in zoom
        this.cy.userZoomingEnabled(false);
        
        // Create zoom indicator
        this.createZoomIndicator();
        
        // Add custom mouse wheel handler
        const wheelHandler = (event) => {
            event.preventDefault();
            
            const delta = event.deltaY;
            const zoomIn = delta < 0;
            const mousePos = this.getMousePosition(event, container);
            
            if (zoomIn) {
                this.zoomIn({ center: mousePos });
            } else {
                this.zoomOut({ center: mousePos });
            }
        };
        
        container.addEventListener('wheel', wheelHandler, { passive: false });
        this.eventHandlers.set('wheel', wheelHandler);
    }
    
    /**
     * Setup zoom limits
     */
    setupZoomLimits() {
        if (!this.cy) return;
        
        this.cy.minZoom(this.minZoom);
        this.cy.maxZoom(this.maxZoom);
    }
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        if (!this.cy) return;
        
        // Listen for zoom changes with null checks
        this.cy.on('zoom', () => {
            try {
                if (this.cy && typeof this.cy.zoom === 'function') {
                    this.currentZoom = this.cy.zoom();
                }
            } catch (error) {
                // Ignore zoom update errors during transitions
            }
        });
        
        // Listen for viewport changes with null checks and throttling
        let zoomUpdateThrottle = null;
        this.cy.on('viewport', () => {
            // Throttle zoom updates for better performance during panning
            if (zoomUpdateThrottle) return;
            
            zoomUpdateThrottle = requestAnimationFrame(() => {
                try {
                    if (this.cy && typeof this.cy.zoom === 'function') {
                        this.currentZoom = this.cy.zoom();
                    }
                } catch (error) {
                    console.warn('Error updating zoom level:', error);
                }
                zoomUpdateThrottle = null;
            });
        });
    }
    
    /**
     * Create zoom indicator element
     */
    createZoomIndicator() {
        // Remove existing indicator
        const existing = document.getElementById('zoom-indicator');
        if (existing) {
            existing.remove();
        }
        
        const indicator = document.createElement('div');
        indicator.id = 'zoom-indicator';
        indicator.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(102, 126, 234, 0.9);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: bold;
            z-index: 10000;
            display: none;
            pointer-events: none;
            transition: opacity 0.3s ease;
        `;
        
        document.body.appendChild(indicator);
    }
    
    /**
     * Show zoom indicator with message
     */
    showZoomIndicator(message) {
        const indicator = document.getElementById('zoom-indicator');
        if (!indicator) return;
        
        indicator.textContent = message;
        indicator.style.display = 'block';
        indicator.style.opacity = '1';
        
        // Auto-hide after 2 seconds
        clearTimeout(this.zoomIndicatorTimeout);
        this.zoomIndicatorTimeout = setTimeout(() => {
            indicator.style.opacity = '0';
            setTimeout(() => {
                indicator.style.display = 'none';
            }, 300);
        }, 2000);
    }
    
    /**
     * Get mouse position relative to container
     */
    getMousePosition(event, container) {
        const rect = container.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }
    
    /**
     * PUBLIC INTERFACE: Reapply zoom settings
     */
    reapplyZoomSettings() {
        
        if (!this.cy) {
            return false;
        }
        
        // Ensure user zooming is disabled
        this.cy.userZoomingEnabled(false);
        
        // Re-setup mouse wheel zoom
        this.setupMouseWheelZoom();
        return true;
    }
    
    /**
     * PUBLIC INTERFACE: Generate controls report
     */
    generateControlsReport() {
        const report = {
            timestamp: new Date().toISOString(),
            initialized: this.initialized,
            currentZoom: this.getCurrentZoom(),
            zoomLimits: {
                min: this.minZoom,
                max: this.maxZoom,
                step: this.zoomStep
            },
            mouseWheelEnabled: this.mouseWheelEnabled,
            viewport: this.cy ? {
                width: this.cy.width(),
                height: this.cy.height(),
                pan: this.cy.pan()
            } : null,
            capabilities: [
                'fit', 'center', 'zoom', 'mouseWheel', 'resetView'
            ]
        };
        return report;
    }

    /**
     * Expose global functions for graph controls
     */
    exposeGlobalFunctions() {
        if (typeof window === 'undefined') {
            return;
        }

        const functions = {
            // Core navigation
            fitGraph: (options) => this.fitGraph(options),
            centerGraph: (options) => this.centerGraph(options),
            resetView: (options) => this.resetView(options),

            // Zoom controls
            zoomIn: (options) => this.zoomIn(options),
            zoomOut: (options) => this.zoomOut(options),
            setZoom: (level, options) => this.setZoom(level, options),
            getCurrentZoom: () => this.getCurrentZoom(),

            // Advanced features
            reapplyZoomSettings: () => this.reapplyZoomSettings(),
            controlsReport: () => this.generateControlsReport(),

            // Analysis
            analyzeControls: () => this.generateControlsReport()
        };

        Object.assign(window, functions);
    }
    
    /**
     * Cleanup method for module destruction
     */
    destroy() {
        
        // Remove event handlers
        if (this.cy && this.cy.container()) {
            const container = this.cy.container();
            this.eventHandlers.forEach((handler, event) => {
                container.removeEventListener(event, handler);
            });
        }
        
        // Remove zoom indicator
        const indicator = document.getElementById('zoom-indicator');
        if (indicator) {
            indicator.remove();
        }
        
        // Clear timeouts
        if (this.zoomIndicatorTimeout) {
            clearTimeout(this.zoomIndicatorTimeout);
        }
        
        // Clear references
        this.cy = null;
        this.notifications = null;
        this.eventHandlers.clear();
    }
}

// Export for use
window.GraphControlsModule = GraphControlsModule;
