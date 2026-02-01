/**
 * Debug Tools Module
 * 
 * Provides comprehensive debugging utilities for graph development.
 * Self-contained module with clean external interfaces.
 * 
 * DEPENDENCIES:
 * - Cytoscape instance (passed via constructor)
 * - UI notification system (passed via constructor)
 * 
 * PROVIDES:
 * - debugContainerHierarchy() - analyzes DOM container structure
 * - debugNodeVisibility() - tests node rendering and visibility
 * - debugPerformance() - analyzes performance metrics
 * - forceRefresh() - forces complete graph re-render
 * - testRendering() - validates rendering capabilities
 * - exposeGlobalFunctions() - exposes debug functions globally
 * - getDebugInfo() - comprehensive system information
 * 
 * FEATURES:
 * - Container hierarchy analysis
 * - Node visibility testing and fixing
 * - Performance diagnostics
 * - Rendering validation
 * - Memory usage monitoring
 * - Global function exposure for console debugging
 */

class DebugToolsModule {
    constructor(dependencies) {
        // Required dependencies injected via constructor
        this.cy = dependencies.cytoscape;
        this.notifications = dependencies.notifications;
        
        // Internal state
        this.debugMode = false;
        this.logLevel = 'info'; // 'debug', 'info', 'warn', 'error'
        this.performanceMetrics = {
            lastRenderTime: 0,
            averageRenderTime: 0,
            renderCount: 0,
            memoryUsage: 0,
            nodeCount: 0,
            edgeCount: 0
        };
        
        // Configuration
        this.config = {
            enableGlobalFunctions: true,
            enablePerformanceMonitoring: true,
            enableConsoleLogging: true,
            maxLogHistory: 100
        };
        
        // Log history for debugging
        this.logHistory = [];
        
        this.init();
    }
    
    /**
     * Initialize the debug tools module
     */
    init() {
        this.log('Initializing Debug Tools Module...', 'info');
        
        if (!this.cy) {
            this.log('No Cytoscape instance provided', 'warn');
            return;
        }
        
        // Setup performance monitoring
        if (this.config.enablePerformanceMonitoring) {
            this.setupPerformanceMonitoring();
        }
        
        // Expose global functions
        if (this.config.enableGlobalFunctions) {
            this.exposeGlobalFunctions();
        }

        this.log('Debug Tools Module initialized', 'info');
    }
    
    /**
     * PUBLIC INTERFACE: Debug container hierarchy
     */
    debugContainerHierarchy() {
        if (!this.cy) {
            this.log('Cannot debug container hierarchy: No Cytoscape instance', 'error');
            return null;
        }
        
        const container = this.cy.container();
        this.log('=== CONTAINER HIERARCHY DEBUG ===', 'debug');
        
        const hierarchy = [];
        let currentElement = container;
        let level = 0;
        
        while (currentElement && level < 10) {
            const computedStyle = window.getComputedStyle(currentElement);
            const elementInfo = {
                level: level,
                element: currentElement,
                tagName: currentElement.tagName,
                id: currentElement.id,
                className: currentElement.className,
                display: computedStyle.display,
                position: computedStyle.position,
                width: computedStyle.width,
                height: computedStyle.height,
                flex: computedStyle.flex,
                offsetWidth: currentElement.offsetWidth,
                offsetHeight: currentElement.offsetHeight,
                clientWidth: currentElement.clientWidth,
                clientHeight: currentElement.clientHeight
            };
            
            hierarchy.push(elementInfo);
            this.log(`Level ${level}:`, 'debug', elementInfo);
            
            currentElement = currentElement.parentElement;
            level++;
        }
        
        this.log('=== END CONTAINER HIERARCHY ===', 'debug');
        return hierarchy;
    }
    
    /**
     * PUBLIC INTERFACE: Debug node visibility
     */
    debugNodeVisibility() {
        if (!this.cy) {
            this.log('Cannot debug node visibility: No Cytoscape instance', 'error');
            return null;
        }
        
        const nodes = this.cy.nodes();
        const nodeCount = nodes.length;
        
        this.log('=== NODE VISIBILITY DEBUG ===', 'debug');
        this.log(`Total nodes: ${nodeCount}`, 'info');
        
        if (nodeCount === 0) {
            this.log('No nodes found in graph', 'warn');
            return { nodeCount: 0, issues: ['No nodes in graph'] };
        }
        
        const issues = [];
        const nodeAnalysis = [];
        
        nodes.forEach((node, index) => {
            const nodeInfo = {
                index: index,
                id: node.id(),
                position: node.position(),
                renderedPosition: node.renderedPosition(),
                visible: node.visible(),
                style: {
                    display: node.style('display'),
                    visibility: node.style('visibility'),
                    opacity: node.style('opacity'),
                    backgroundColor: node.style('background-color'),
                    width: node.style('width'),
                    height: node.style('height')
                },
                boundingBox: node.boundingBox()
            };
            
            // Check for common visibility issues
            if (!nodeInfo.visible) {
                issues.push(`Node ${nodeInfo.id} is not visible`);
            }
            if (nodeInfo.style.display === 'none') {
                issues.push(`Node ${nodeInfo.id} has display:none`);
            }
            if (nodeInfo.style.opacity === '0') {
                issues.push(`Node ${nodeInfo.id} has opacity:0`);
            }
            if (nodeInfo.style.width === '0' || nodeInfo.style.height === '0') {
                issues.push(`Node ${nodeInfo.id} has zero size`);
            }
            
            nodeAnalysis.push(nodeInfo);
            
            // Log details for first few nodes to avoid spam
            if (index < 3) {
                this.log(`Node ${index}:`, 'debug', nodeInfo);
            }
        });
        
        if (nodeCount > 3) {
            this.log(`... and ${nodeCount - 3} more nodes`, 'debug');
        }
        
        const analysis = {
            nodeCount: nodeCount,
            issues: issues,
            nodes: nodeAnalysis,
            viewport: {
                zoom: this.cy.zoom(),
                pan: this.cy.pan(),
                extent: this.cy.extent()
            }
        };
        
        this.log('=== END NODE VISIBILITY DEBUG ===', 'debug');
        return analysis;
    }
    
    /**
     * PUBLIC INTERFACE: Debug performance metrics
     */
    debugPerformance() {
        this.updatePerformanceMetrics();
        
        this.log('=== PERFORMANCE DEBUG ===', 'debug');
        this.log('Performance Metrics:', 'info', this.performanceMetrics);
        
        const memoryInfo = this.getMemoryInfo();
        if (memoryInfo) {
            this.log('Memory Info:', 'info', memoryInfo);
        }
        
        const renderingInfo = this.getRenderingInfo();
        this.log('Rendering Info:', 'info', renderingInfo);
        
        this.log('=== END PERFORMANCE DEBUG ===', 'debug');
        
        return {
            performance: this.performanceMetrics,
            memory: memoryInfo,
            rendering: renderingInfo
        };
    }

    /**
     * PUBLIC INTERFACE: Watch a node or element for movement
     * Logs to the console whenever its position changes
     * @param {Object|HTMLElement} target - Cytoscape node or DOM element
     * @returns {Function|null} Stop function to cancel monitoring
     */
    watchNodeMovement(target) {
        if (!target) {
            this.log('watchNodeMovement: No target provided', 'warn');
            return null;
        }

        // Cytoscape node support
        if (target.on && typeof target.on === 'function') {
            const handler = event => {
                const node = event.target;
                const pos = node.position();

                const parent = node.parent && typeof node.parent === 'function' ? node.parent() : null;
                if (parent && parent.length > 0) {
                    const pPos = parent.position();
                }
            };
            target.on('position', handler);
            return () => target.off('position', handler);
        }

        // DOM element support
        if (target instanceof HTMLElement) {
            const getPos = () => {
                const rect = target.getBoundingClientRect();
                return { left: rect.left, top: rect.top };
            };
            let lastPos = getPos();
            this.log('Started watching element movement', 'info', lastPos);

            let frameId = null;
            const check = () => {
                const pos = getPos();
                if (pos.left !== lastPos.left || pos.top !== lastPos.top) {
                    lastPos = pos;
                }
                frameId = requestAnimationFrame(check);
            };
            frameId = requestAnimationFrame(check);

            return () => {
                if (frameId) {
                    cancelAnimationFrame(frameId);
                }
                this.log('Stopped watching element movement', 'info');
            };
        }

        this.log('watchNodeMovement: Unsupported target type', 'warn');
        return null;
    }
    
    /**
     * PUBLIC INTERFACE: Force complete refresh
     */
    forceRefresh() {
        if (!this.cy) {
            this.log('Cannot force refresh: No Cytoscape instance', 'error');
            return false;
        }
        
        this.log('Forcing complete Cytoscape refresh...', 'info');
        
        try {
            // Force resize and layout
            this.cy.resize();
            this.cy.fit();
            this.cy.center();
            
            // Force style update
            this.cy.style().update();
            
            // Force element re-render
            this.cy.elements().forEach(elem => {
                elem.style('display', 'element');
                elem.style('visibility', 'visible');
            });
            
            this.log('Complete refresh completed', 'info');
            return true;
        } catch (error) {
            this.log('Force refresh failed', 'error', error);
            return false;
        }
    }
    
    /**
     * PUBLIC INTERFACE: Force nodes to be visible
     */
    forceNodesVisible() {
        if (!this.cy) {
            this.log('Cannot force nodes visible: No Cytoscape instance', 'error');
            return false;
        }
        
        const nodes = this.cy.nodes();
        const nodeCount = nodes.length;
        
        this.log(`Forcing ${nodeCount} nodes to be visible...`, 'info');
        
        if (nodeCount === 0) {
            this.log('No nodes to make visible', 'warn');
            return false;
        }
        
        try {
            nodes.forEach((node, index) => {
                node.style({
                    'display': 'element',
                    'visibility': 'visible',
                    'opacity': '1',
                    'background-color': node.data('color') || '#666',
                    'width': node.data('size') || '30px',
                    'height': node.data('size') || '30px'
                });
            });
            
            // Force style update
            this.cy.style().update();
            this.cy.fit();
            this.cy.center();
            
            this.log(`Successfully forced ${nodeCount} nodes visible`, 'info');
            return true;
        } catch (error) {
            this.log('Force nodes visible failed', 'error', error);
            return false;
        }
    }
    
    /**
     * PUBLIC INTERFACE: Test rendering capabilities
     */
    testRendering() {
        if (!this.cy) {
            this.log('Cannot test rendering: No Cytoscape instance', 'error');
            return null;
        }
        
        this.log('=== TESTING RENDERING CAPABILITIES ===', 'debug');
        
        const container = this.cy.container();
        const results = {
            containerAvailable: !!container,
            containerDimensions: container ? {
                width: container.clientWidth,
                height: container.clientHeight,
                offsetWidth: container.offsetWidth,
                offsetHeight: container.offsetHeight
            } : null,
            cytoscapeInfo: {
                zoom: this.cy.zoom(),
                pan: this.cy.pan(),
                width: this.cy.width(),
                height: this.cy.height(),
                renderer: this.cy.renderer().name || 'unknown'
            },
            testElement: null
        };
        
        // Test if we can add a visible element to the container
        if (container) {
            try {
                const testDiv = document.createElement('div');
                testDiv.id = 'debug-test-element';
                testDiv.style.cssText = `
                    position: absolute;
                    top: 50px;
                    left: 50px;
                    width: 100px;
                    height: 100px;
                    background-color: red;
                    z-index: 1000;
                    pointer-events: none;
                    border: 2px solid yellow;
                `;
                testDiv.textContent = 'TEST';
                
                container.appendChild(testDiv);
                
                // Check if it's visible
                const rect = testDiv.getBoundingClientRect();
                results.testElement = {
                    created: true,
                    visible: rect.width > 0 && rect.height > 0,
                    boundingRect: rect
                };
                
                // Remove test element after a moment
                setTimeout(() => {
                    if (testDiv.parentNode) {
                        testDiv.parentNode.removeChild(testDiv);
                    }
                }, 2000);
                
            } catch (error) {
                results.testElement = { created: false, error: error.message };
                this.log('Test element creation failed', 'error', error);
            }
        }
        
        this.log('Rendering test results:', 'info', results);
        this.log('=== END RENDERING TEST ===', 'debug');
        
        return results;
    }
    
    /**
     * PUBLIC INTERFACE: Get comprehensive debug information
     */
    getDebugInfo() {
        const info = {
            timestamp: new Date().toISOString(),
            module: {
                version: '1.0.0',
                debugMode: this.debugMode,
                logLevel: this.logLevel,
                config: { ...this.config }
            },
            cytoscape: this.cy ? {
                available: true,
                elementCount: this.cy.elements().length,
                nodeCount: this.cy.nodes().length,
                edgeCount: this.cy.edges().length,
                zoom: this.cy.zoom(),
                pan: this.cy.pan(),
                extent: this.cy.extent(),
                renderer: this.cy.renderer().name || 'unknown'
            } : { available: false },
            container: null,
            performance: this.performanceMetrics,
            memory: this.getMemoryInfo(),
            logHistory: this.logHistory.slice(-10) // Last 10 log entries
        };
        
        if (this.cy && this.cy.container()) {
            const container = this.cy.container();
            info.container = {
                tagName: container.tagName,
                id: container.id,
                className: container.className,
                dimensions: {
                    clientWidth: container.clientWidth,
                    clientHeight: container.clientHeight,
                    offsetWidth: container.offsetWidth,
                    offsetHeight: container.offsetHeight
                }
            };
        }
        
        return info;
    }
    
    /**
     * PUBLIC INTERFACE: Expose debug functions globally
     */
    exposeGlobalFunctions() {
        const functions = {
            // Container and hierarchy debugging
            debugContainer: () => this.debugContainerHierarchy(),
            
            // Node visibility debugging
            debugNodes: () => this.debugNodeVisibility(),
            forceNodesVisible: () => this.forceNodesVisible(),
            testNodeVisibility: () => {
                const analysis = this.debugNodeVisibility();
                if (analysis && analysis.issues.length > 0) {
                    this.log('Node visibility issues found, attempting to fix...', 'warn');
                    return this.forceNodesVisible();
                }
                return true;
            },

            // Performance debugging
            debugPerformance: () => this.debugPerformance(),

            // Movement debugging
            watchNodeMovement: target => this.watchNodeMovement(target),

            // Rendering debugging
            forceRefresh: () => this.forceRefresh(),
            forceCompleteRerender: () => {
                this.forceRefresh();
                return this.forceNodesVisible();
            },
            testRendering: () => this.testRendering(),
            
            // Comprehensive debugging
            debugInfo: () => this.getDebugInfo(),
            debugAll: () => {
                const info = this.getDebugInfo();
                const container = this.debugContainerHierarchy();
                const nodes = this.debugNodeVisibility();
                const performance = this.debugPerformance();
                const rendering = this.testRendering();
                
                return {
                    info,
                    container,
                    nodes,
                    performance,
                    rendering
                };
            }
        };
        
        // Expose functions globally
        Object.keys(functions).forEach(name => {
            window[name] = functions[name];
        });
        
        this.log('Debug functions exposed globally:', 'info', Object.keys(functions));
        
        return functions;
    }
    
    /**
     * PUBLIC INTERFACE: Set debug configuration
     */
    setConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        if (newConfig.debugMode !== undefined) {
            this.debugMode = newConfig.debugMode;
        }
        if (newConfig.logLevel) {
            this.logLevel = newConfig.logLevel;
        }
        
        this.log('Debug configuration updated', 'info', this.config);
    }
    
    // === PRIVATE METHODS BELOW ===
    
    /**
     * Setup performance monitoring
     */
    setupPerformanceMonitoring() {
        if (!this.cy) return;
        
        // Monitor render events
        this.cy.on('render', () => {
            this.performanceMetrics.lastRenderTime = performance.now();
            this.performanceMetrics.renderCount++;
            
            // Calculate average render time
            if (this.performanceMetrics.renderCount > 1) {
                this.performanceMetrics.averageRenderTime = 
                    (this.performanceMetrics.averageRenderTime + this.performanceMetrics.lastRenderTime) / 2;
            } else {
                this.performanceMetrics.averageRenderTime = this.performanceMetrics.lastRenderTime;
            }
        });
        
        // Monitor viewport changes with throttling to avoid performance issues
        let debugViewportThrottle = null;
        this.cy.on('viewport', () => {
            // Skip updates during rapid viewport changes for better performance
            if (debugViewportThrottle) return;
            
            debugViewportThrottle = requestAnimationFrame(() => {
                this.updatePerformanceMetrics();
                debugViewportThrottle = null;
            });
        });
        
        // Periodic memory monitoring
        setInterval(() => {
            this.updatePerformanceMetrics();
        }, 5000);
    }
    
    /**
     * Update performance metrics
     */
    updatePerformanceMetrics() {
        if (this.cy) {
            this.performanceMetrics.nodeCount = this.cy.nodes().length;
            this.performanceMetrics.edgeCount = this.cy.edges().length;
        }
        
        const memoryInfo = this.getMemoryInfo();
        if (memoryInfo) {
            this.performanceMetrics.memoryUsage = memoryInfo.used;
        }
    }
    
    /**
     * Get memory information
     */
    getMemoryInfo() {
        if (performance.memory) {
            return {
                used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024), // MB
                total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024), // MB
                limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024) // MB
            };
        }
        return null;
    }
    
    /**
     * Get rendering information
     */
    getRenderingInfo() {
        if (!this.cy) return null;
        
        return {
            renderer: this.cy.renderer().name || 'unknown',
            zoom: this.cy.zoom(),
            pan: this.cy.pan(),
            extent: this.cy.extent(),
            elementCount: this.cy.elements().length,
            viewport: {
                width: this.cy.width(),
                height: this.cy.height()
            }
        };
    }
    
    /**
     * Internal logging with history
     */
    log(message, level = 'info', data = null) {
        if (!this.config.enableConsoleLogging) return;
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: level,
            message: message,
            data: data
        };
        
        // Add to history
        this.logHistory.push(logEntry);
        
        // Limit history size
        if (this.logHistory.length > this.config.maxLogHistory) {
            this.logHistory = this.logHistory.slice(-this.config.maxLogHistory);
        }
        
        // Console output based on level
        const prefix = '[DebugTools]';
        switch (level) {
            case 'debug':
                break;
            case 'info':
                break;
            case 'warn':
                break;
            case 'error':
                console.error(prefix, message, data || '');
                break;
        }
    }
    
    /**
     * Cleanup method for module destruction
     */
    destroy() {
        // Remove global functions
        const globalFunctions = [
            'debugContainer', 'debugNodes', 'forceNodesVisible', 'testNodeVisibility',
            'debugPerformance', 'forceRefresh', 'forceCompleteRerender', 'testRendering',
            'debugInfo', 'debugAll'
        ];
        
        globalFunctions.forEach(name => {
            if (window[name]) {
                delete window[name];
            }
        });
        
        // Clear references
        this.cy = null;
        this.notifications = null;
        this.logHistory = [];
    }
}

// Export for use
window.DebugToolsModule = DebugToolsModule;

window.DebugTools = window.DebugTools || {
    moduleInstance: null,
    debugMode: false
};

window.DebugTools.init = function(options = {}) {
    if (this.moduleInstance) {
        return this.moduleInstance;
    }

    const notifications = options.notifications || {
        show: (message, type = 'info') => {
            if (window.UI && window.UI.showNotification) {
                window.UI.showNotification(message, type);
            }
        }
    };
    const cytoscape = options.cytoscape || (window.GraphRenderer ? window.GraphRenderer.cy : null);

    if (!cytoscape) {
        return null;
    }

    this.moduleInstance = new DebugToolsModule({
        cytoscape,
        notifications
    });

    this.debugMode = this.moduleInstance.debugMode;
    return this.moduleInstance;
};

// Auto-initialize when GraphRenderer is available
if (window.GraphRenderer) {
    window.DebugTools.init();
} else {
    // Wait for GraphRenderer to be available
    let checkCount = 0;
    const checkInterval = setInterval(() => {
        if (window.GraphRenderer || checkCount > 50) {
            clearInterval(checkInterval);
            if (window.GraphRenderer) {
                window.DebugTools.init();
            }
        }
        checkCount++;
    }, 100);
}
