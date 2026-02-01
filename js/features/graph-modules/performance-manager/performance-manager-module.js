/**
 * Performance Manager Module
 * 
 * Provides comprehensive performance monitoring, optimization, and WebGL management.
 * Self-contained module with clean external interfaces.
 * 
 * DEPENDENCIES:
 * - Cytoscape instance (passed via constructor)
 * - UI notification system (passed via constructor)
 * 
 * PROVIDES:
 * - setupPerformanceMonitoring() - initializes performance tracking
 * - updatePerformanceMetrics() - updates real-time performance indicators
 * - checkMemoryUsage() - monitors and warns about memory consumption
 * - optimizeMemoryUsage() - applies memory optimization strategies
 * - checkWebGLSupport() - detects WebGL availability
 * - setupKeepAliveTick() - prevents browser unresponsive warnings
 * - applyAggressiveLOD() - applies Level of Detail optimizations
 * - getPerformanceReport() - comprehensive performance analysis
 * 
 * FEATURES:
 * - Real-time FPS monitoring
 * - Memory usage tracking and optimization
 * - WebGL detection and fallback
 * - Automatic LOD (Level of Detail) adjustments
 * - Performance-based visual optimization
 * - Keep-alive system for large datasets
 * - Comprehensive performance reporting
 */

class PerformanceManagerModule {
    constructor(dependencies) {
        // Required dependencies injected via constructor
        this.cy = dependencies.cytoscape;
        this.notifications = dependencies.notifications;
        
        // Performance state tracking
        this.isWebGLEnabled = false;
        this.performanceMetrics = {
            renderTime: 0,
            averageRenderTime: 0,
            renderCount: 0,
            fps: 60,
            frameCount: 0,
            lastFPSUpdate: 0,
            memoryUsage: 0,
            memoryLimit: 0,
            nodeCount: 0,
            edgeCount: 0,
            lodLevel: 0, // 0 = normal, 1 = light optimization, 2 = aggressive
            warnings: [],
            labelsHidden: false,
            edgesOpacityReduced: false,
            nodesScaledDown: false
        };
        
        // Keep-alive system state
        this.keepAliveState = {
            tickCount: 0,
            interval: null,
            isActive: false
        };
        
        const performanceConfig = dependencies.config?.performanceManager || {};

        // Configuration
        this.config = {
            // Performance thresholds
            memoryWarningThreshold: 0.8, // 80% of memory limit
            lowFPSThreshold: 15,
            largeDatasetThreshold: 5000,
            hugaDatasetThreshold: 15000,
            massiveDatasetThreshold: 50000,

            // Monitoring intervals
            memoryCheckInterval: 5000, // 5 seconds
            keepAliveTickInterval: 100, // 100ms
            fpsCalculationInterval: 1000, // 1 second

            // Optimization settings
            enableAutoLOD: performanceConfig.enableAutoLOD === true &&
                performanceConfig.enableLargeGraphOptimizations === true,
            enableMemoryOptimization: true,
            enableKeepAlive: true,
            enableLargeGraphOptimizations: performanceConfig.enableLargeGraphOptimizations === true,
            
            // Visual optimization thresholds
            hideLabelsThreshold: 500,
            reduceOpacityThreshold: 15000,
            aggressiveLODThreshold: 2000 // When FPS drops below threshold
        };
        
        this.init();
    }
    
    /**
     * Initialize the performance manager module
     */
    init() {
        
        if (!this.cy) {
            return;
        }
        
        // Check WebGL support
        this.isWebGLEnabled = this.checkWebGLSupport();
        
        // Setup performance monitoring
        this.setupPerformanceMonitoring();
        
        // Setup keep-alive system if enabled
        if (this.config.enableKeepAlive) {
            this.setupKeepAliveTick();
        }
    }
    
    /**
     * PUBLIC INTERFACE: Check WebGL support for better performance
     */
    checkWebGLSupport() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            const supported = !!gl;
            
            if (supported && gl) {
                // Get WebGL info for detailed reporting
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Unknown';
                const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unknown';
            }
            
            return supported;
        } catch (e) {
            return false;
        }
    }
    
    /**
     * PUBLIC INTERFACE: Setup comprehensive performance monitoring
     */
    setupPerformanceMonitoring() {
        if (!this.cy) return;
        
        // Monitor rendering performance
        this.cy.on('render', () => {
            const renderTime = performance.now();
            this.updatePerformanceMetrics(renderTime);
        });
        
        // Monitor viewport changes for performance impact with throttling
        let viewportThrottle = null;
        this.cy.on('viewport', () => {
            // Throttle viewport updates to avoid performance bottlenecks
            if (viewportThrottle) return;
            
            viewportThrottle = requestAnimationFrame(() => {
                this.updateBasicMetrics();
                viewportThrottle = null;
            });
        });
        
        // Monitor element changes
        this.cy.on('add remove', () => {
            this.updateBasicMetrics();
            
            // Auto-optimize for large datasets
            if (this.config.enableAutoLOD) {
                this.checkAutoOptimization();
            }
        });
        
        // Setup periodic memory monitoring
        if (this.config.enableMemoryOptimization) {
            setInterval(() => {
                this.checkMemoryUsage();
            }, this.config.memoryCheckInterval);
        }
    }
    
    /**
     * PUBLIC INTERFACE: Update performance metrics
     */
    updatePerformanceMetrics(renderTime) {
        // Update render time tracking
        this.performanceMetrics.renderTime = renderTime;
        this.performanceMetrics.renderCount++;
        
        // Calculate average render time
        if (this.performanceMetrics.renderCount > 1) {
            this.performanceMetrics.averageRenderTime = 
                (this.performanceMetrics.averageRenderTime + renderTime) / 2;
        } else {
            this.performanceMetrics.averageRenderTime = renderTime;
        }
        
        // Update FPS calculation
        this.updateFPS();
        
        // Update DOM performance indicators if they exist
        this.updatePerformanceUI();
    }
    
    /**
     * PUBLIC INTERFACE: Check memory usage and warn if high
     */
    checkMemoryUsage() {
        if (!performance.memory) {
            return null;
        }
        
        const memoryInfo = {
            used: performance.memory.usedJSHeapSize / 1024 / 1024, // MB
            total: performance.memory.totalJSHeapSize / 1024 / 1024, // MB
            limit: performance.memory.jsHeapSizeLimit / 1024 / 1024 // MB
        };
        
        // Update internal metrics
        this.performanceMetrics.memoryUsage = memoryInfo.used;
        this.performanceMetrics.memoryLimit = memoryInfo.limit;
        
        // Check for high memory usage
        const usageRatio = memoryInfo.used / memoryInfo.limit;
        if (usageRatio > this.config.memoryWarningThreshold) {
            const warning = `High memory usage detected: ${memoryInfo.used.toFixed(2)}MB (${(usageRatio * 100).toFixed(1)}%)`;
            
            this.performanceMetrics.warnings.push({
                type: 'memory',
                message: warning,
                timestamp: Date.now(),
                data: memoryInfo
            });
            
            // Auto-optimize if enabled
            if (this.config.enableMemoryOptimization) {
                this.optimizeMemoryUsage();
            }
            
            // Notify user if notification system available
            if (this.notifications && this.notifications.show) {
                this.notifications.show(`Memory usage high: ${memoryInfo.used.toFixed(1)}MB`, 'warning');
            }
        }
        
        return memoryInfo;
    }
    
    /**
     * PUBLIC INTERFACE: Optimize memory usage for large datasets
     */
    optimizeMemoryUsage() {
        if (!this.cy) return false;

        // Respect feature flag for large graph optimizations
        if (!this.config.enableLargeGraphOptimizations) {
            return false;
        }
        
        const nodeCount = this.cy.nodes().length;
        const edgeCount = this.cy.edges().length;
        
        let optimizationsApplied = [];
        
        // Level 1: Light optimizations for medium datasets
        if (nodeCount > this.config.hugaDatasetThreshold && !this.performanceMetrics.edgesOpacityReduced) {
            // Reduce edge opacity
            this.cy.edges().forEach(edge => {
                edge.style('opacity', 0.3);
            });
            this.performanceMetrics.edgesOpacityReduced = true;
            optimizationsApplied.push('edge_opacity_reduction');
        }

        // Level 2: Medium optimizations for large datasets
        if (nodeCount > this.config.hideLabelsThreshold && !this.performanceMetrics.labelsHidden) {
            // Hide labels for large datasets
            this.cy.nodes().forEach(node => {
                node.style('label', '');
            });
            this.performanceMetrics.labelsHidden = true;
            optimizationsApplied.push('label_hiding');
        } else if (nodeCount <= this.config.hideLabelsThreshold && this.performanceMetrics.labelsHidden) {
            // Restore labels when dataset shrinks
            this.cy.nodes().forEach(node => {
                const label = node.data('label');
                node.style('label', label);
            });
            this.performanceMetrics.labelsHidden = false;
            optimizationsApplied.push('label_showing');
        }

        // Level 3: Aggressive optimizations for massive datasets
        if (nodeCount > this.config.massiveDatasetThreshold && !this.performanceMetrics.nodesScaledDown) {
            // Reduce node sizes and opacity
            this.cy.nodes().forEach(node => {
                const currentWidth = parseFloat(node.style('width')) || 30;
                const currentHeight = parseFloat(node.style('height')) || 30;

                node.style({
                    'width': Math.max(2, currentWidth * 0.7),
                    'height': Math.max(2, currentHeight * 0.7),
                    'opacity': 0.6
                });
            });
            this.performanceMetrics.nodesScaledDown = true;
            optimizationsApplied.push('node_size_reduction');
        }
        
        if (optimizationsApplied.length > 0) {
            
            // Update LOD level
            this.performanceMetrics.lodLevel = Math.max(1, this.performanceMetrics.lodLevel);
            
            // Notify user
            if (this.notifications && this.notifications.show) {
                this.notifications.show(`Applied memory optimizations: ${optimizationsApplied.join(', ')}`, 'info');
            }
            
            return true;
        }
        
        return false;
    }
    
    /**
     * PUBLIC INTERFACE: Setup keep-alive tick to prevent browser unresponsive warnings
     */
    setupKeepAliveTick() {
        
        if (this.keepAliveState.isActive) {
            this.stopKeepAliveTick(); // Stop existing tick
        }
        
        this.keepAliveState.lastFPSUpdate = performance.now();
        this.keepAliveState.frameCount = 0;
        this.keepAliveState.tickCount = 0;
        
        this.keepAliveState.interval = setInterval(() => {
            this.keepAliveState.tickCount++;
            
            // Calculate FPS
            this.updateFPS();
            
            // Update hidden keep-alive element
            this.updateKeepAliveElement();
            
            // Performance logging and auto-optimization
            if (this.keepAliveState.tickCount % 100 === 0) { // Every 10 seconds at 100ms interval
                this.logPerformanceStatus();
                
                // Auto-optimize if performance is poor
                if (this.config.enableAutoLOD &&
                    this.config.enableLargeGraphOptimizations &&
                    this.performanceMetrics.fps < this.config.lowFPSThreshold &&
                    this.performanceMetrics.nodeCount > this.config.aggressiveLODThreshold) {
                    
                    this.applyAggressiveLOD();
                }
            }
            
        }, this.config.keepAliveTickInterval);
        
        this.keepAliveState.isActive = true;
    }
    
    /**
     * PUBLIC INTERFACE: Apply aggressive Level of Detail optimizations
     */
    applyAggressiveLOD() {
        if (!this.cy) return false;
        
        const beforeNodeCount = this.cy.nodes().length;
        const beforeEdgeCount = this.cy.edges().length;
        
        // Hide all labels
        this.cy.nodes().forEach(node => {
            node.style({
                'label': '',
                'opacity': 0.4,
                'width': Math.max(2, (parseFloat(node.style('width')) || 30) * 0.7),
                'height': Math.max(2, (parseFloat(node.style('height')) || 30) * 0.7)
            });
        });
        
        // Hide most edges, keep only important ones
        this.cy.edges().forEach(edge => {
            edge.style({
                'opacity': 0.2,
                'width': 1
            });
        });
        
        // Update LOD level
        this.performanceMetrics.lodLevel = 2;
        
        // Notify user
        if (this.notifications && this.notifications.show) {
            this.notifications.show(`Applied aggressive LOD optimization`, 'info');
        }
        
        return true;
    }
    
    /**
     * PUBLIC INTERFACE: Get comprehensive performance report
     */
    getPerformanceReport() {
        const report = {
            timestamp: new Date().toISOString(),
            webgl: {
                supported: this.isWebGLEnabled,
                renderer: this.isWebGLEnabled ? 'webgl' : 'canvas'
            },
            metrics: { ...this.performanceMetrics },
            memory: null,
            recommendations: [],
            status: 'unknown'
        };
        
        // Add current memory info
        if (performance.memory) {
            report.memory = {
                used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
                total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
                limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024),
                usagePercent: Math.round((performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100)
            };
        }
        
        // Generate recommendations
        if (report.metrics.nodeCount > this.config.massiveDatasetThreshold) {
            report.recommendations.push('Consider using data sampling or clustering for better performance');
        }
        
        if (report.memory && report.memory.usagePercent > 70) {
            report.recommendations.push('High memory usage detected - consider reducing dataset size');
        }
        
        if (report.metrics.fps < 30) {
            report.recommendations.push('Low FPS detected - enable LOD optimizations');
        }
        
        if (!this.isWebGLEnabled) {
            report.recommendations.push('WebGL not available - performance may be limited');
        }
        
        // Determine overall status
        if (report.metrics.fps > 45 && (!report.memory || report.memory.usagePercent < 60)) {
            report.status = 'excellent';
        } else if (report.metrics.fps > 30 && (!report.memory || report.memory.usagePercent < 80)) {
            report.status = 'good';
        } else if (report.metrics.fps > 15) {
            report.status = 'fair';
        } else {
            report.status = 'poor';
        }
        
        return report;
    }
    
    /**
     * PUBLIC INTERFACE: Reset optimizations and restore full visual quality
     */
    resetOptimizations() {
        if (!this.cy) return false;
        
        // Restore node styles
        this.cy.nodes().forEach(node => {
            node.style({
                'label': node.data('label') || '',
                'opacity': 1,
                'width': node.data('size') || '30px',
                'height': node.data('size') || '30px'
            });
        });
        
        // Restore edge styles
        this.cy.edges().forEach(edge => {
            edge.style({
                'opacity': 0.9,
                'width': 2
            });
        });
        
        // Reset LOD level
        this.performanceMetrics.lodLevel = 0;
        
        if (this.notifications && this.notifications.show) {
            this.notifications.show('Visual optimizations reset', 'info');
        }
        
        return true;
    }
    
    /**
     * PUBLIC INTERFACE: Stop keep-alive system
     */
    stopKeepAliveTick() {
        if (this.keepAliveState.interval) {
            clearInterval(this.keepAliveState.interval);
            this.keepAliveState.interval = null;
            this.keepAliveState.isActive = false;
        }
    }
    
    // === PRIVATE METHODS BELOW ===
    
    /**
     * Update FPS calculation
     */
    updateFPS() {
        const currentTime = performance.now();
        this.performanceMetrics.frameCount++;
        
        if (currentTime - this.keepAliveState.lastFPSUpdate >= this.config.fpsCalculationInterval) {
            this.performanceMetrics.fps = Math.round(
                this.performanceMetrics.frameCount * 1000 / 
                (currentTime - this.keepAliveState.lastFPSUpdate)
            );
            
            this.performanceMetrics.frameCount = 0;
            this.keepAliveState.lastFPSUpdate = currentTime;
        }
    }
    
    /**
     * Update basic metrics (node count, edge count)
     */
    updateBasicMetrics() {
        if (this.cy) {
            this.performanceMetrics.nodeCount = this.cy.nodes().length;
            this.performanceMetrics.edgeCount = this.cy.edges().length;
        }
    }
    
    /**
     * Update performance UI indicators
     */
    updatePerformanceUI() {
        const perfIndicator = document.getElementById('perfIndicator');
        const renderTimeSpan = document.getElementById('renderTime');
        
        if (perfIndicator && renderTimeSpan) {
            const nodeCount = this.performanceMetrics.nodeCount;
            
            // Color code based on performance
            if (nodeCount > this.config.massiveDatasetThreshold) {
                perfIndicator.style.backgroundColor = '#ff4444'; // Red for massive datasets
            } else if (nodeCount > this.config.hugaDatasetThreshold) {
                perfIndicator.style.backgroundColor = '#ffaa00'; // Orange for large datasets
            } else {
                perfIndicator.style.backgroundColor = '#44ff44'; // Green for normal datasets
            }
            
            renderTimeSpan.textContent = `${Math.round(this.performanceMetrics.renderTime)}ms`;
        }
        
        // Update FPS indicator if it exists
        const fpsIndicator = document.getElementById('fpsIndicator');
        if (fpsIndicator) {
            fpsIndicator.textContent = `${this.performanceMetrics.fps} FPS`;
            
            // Color code FPS
            if (this.performanceMetrics.fps > 45) {
                fpsIndicator.style.color = '#44ff44'; // Green
            } else if (this.performanceMetrics.fps > 30) {
                fpsIndicator.style.color = '#ffaa00'; // Orange
            } else {
                fpsIndicator.style.color = '#ff4444'; // Red
            }
        }
    }
    
    /**
     * Update keep-alive element
     */
    updateKeepAliveElement() {
        const tickElement = document.getElementById('keep-alive-tick');
        if (tickElement) {
            tickElement.textContent = `Tick: ${this.keepAliveState.tickCount}`;
            tickElement.style.display = 'none'; // Keep hidden
        }
    }
    
    /**
     * Log performance status
     */
    logPerformanceStatus() {
        if (!this.cy) return;
        
        const memoryUsage = performance.memory ? 
            (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1) : 'N/A';
    }
    
    /**
     * Check if auto-optimization should be applied
     */
    checkAutoOptimization() {
        const nodeCount = this.performanceMetrics.nodeCount;

        // Auto-apply optimizations based on dataset size when enabled
        if (this.config.enableLargeGraphOptimizations &&
            (nodeCount > this.config.hideLabelsThreshold || this.performanceMetrics.labelsHidden)) {

            this.optimizeMemoryUsage();
        }
    }
    
    /**
     * Cleanup method for module destruction
     */
    destroy() {
        
        // Stop keep-alive system
        this.stopKeepAliveTick();
        
        // Clear references
        this.cy = null;
        this.notifications = null;
        
        // Reset state
        this.performanceMetrics = {};
        this.keepAliveState = {};
    }
}

// Export for use
window.PerformanceManagerModule = PerformanceManagerModule;
