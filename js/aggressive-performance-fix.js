/**
 * Aggressive Performance Fix for Large Graph Panning
 * 
 * This addresses the root cause: expensive style functions executing for every node
 * during rendering, causing 600-700ms requestAnimationFrame delays.
 */

window.AggressivePerformanceFix = {
    isApplied: false,
    originalStylesheet: null,
    debugModeEnabled: false,
    
    // Apply all aggressive optimizations
    applyAll() {
        if (this.isApplied) {
            console.log('🚀 Aggressive performance fix already applied');
            return;
        }
        
        console.log('🚀 Applying aggressive performance fix...');
        
        this.replaceExpensiveStyleFunctions();
        this.disableNonEssentialFeatures();
        this.optimizeEventHandlers();
        if (this.debugModeEnabled) {
            this.enableInteractionOptimizations();
        }
        
        this.isApplied = true;
        console.log('🚀 Aggressive performance fix applied');
    },
    
    // Replace expensive style functions with static values for large graphs
    replaceExpensiveStyleFunctions() {
        if (!window.GraphRenderer?.cy) {
            console.warn('🚀 Cytoscape not available for style optimization');
            return;
        }
        
        const cy = window.GraphRenderer.cy;
        const nodeCount = cy.nodes().length;
        
        // Only apply for large graphs where performance matters more than visual fidelity
        if (nodeCount < 1000) {
            console.log('🚀 Graph too small for aggressive optimization');
            return;
        }
        
        console.log(`🚀 Optimizing styles for ${nodeCount} nodes...`);
        
        // Store original stylesheet
        this.originalStylesheet = cy.style().json();
        
        // Create optimized stylesheet with static values instead of functions
        const defaultNodeColor = window.QuantickleConfig?.defaultNodeColor || '#ffffff';
        const optimizedStyle = [
            {
                selector: 'node',
                style: {
                    'background-color': defaultNodeColor, // Static color instead of function
                    'background-image': 'none',
                    'background-fit': 'data(backgroundFit)', 
                    'background-repeat': 'no-repeat',
                    'background-position-x': '50%',
                    'background-position-y': '50%',
                    'background-width': '100%',
                    'background-height': '100%',
                    'background-opacity': 1.0,
                    'width': 20, // Static size instead of data function
                    'height': 20,
                    'shape': 'ellipse', // Static shape instead of function
                    'border-width': 0,
                    'border-color': '#000000',
                    'label': '', // Hide labels for performance
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'text-wrap': 'wrap',
                    'text-max-width': 20,
                    'font-size': 8,
                    'color': '#ffffff',
                    'text-outline-width': 0, // Remove text outline
                    'text-outline-color': '#000000',
                    'text-events': 'no',
                    'events': 'yes',
                    'opacity': 0.8 // Slightly transparent for better performance
                }
            },
            {
                selector: 'node:selected',
                style: {
                    'border-width': 2,
                    'border-color': '#ff0000',
                    'border-opacity': 1,
                    'opacity': 1
                }
            },
            {
                selector: 'node[pinned]',
                style: {
                    'border-width': 3,
                    'border-color': '#1e90ff',
                    'border-opacity': 1,
                    'opacity': 1
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 1,
                    'line-color': '#cccccc',
                    'target-arrow-color': '#cccccc',
                    'target-arrow-shape': 'none', // Remove arrows for performance
                    'curve-style': 'straight', // Straight lines are faster than curves
                    'opacity': 0.3, // Lower opacity for better performance
                    'events': 'no' // Disable edge events for performance
                }
            },
            {
                selector: 'edge:selected',
                style: {
                    'width': 2,
                    'line-color': '#ff0000',
                    'opacity': 0.8
                }
            },
            // Hide containers for performance
            {
                selector: 'node.container',
                style: {
                    'opacity': 0.1,
                    'label': '',
                    'events': 'no'
                }
            }
        ];
        
        // Apply the optimized stylesheet
        cy.style().clear().fromJson(optimizedStyle).update();
        
        console.log('🚀 Style functions replaced with static values');
    },
    
    // Disable non-essential features that impact performance
    disableNonEssentialFeatures() {
        if (!window.GraphRenderer?.cy) return;
        
        const cy = window.GraphRenderer.cy;
        
        // Disable animations
        cy.animate({ duration: 0 });
        
        // Disable box selection during panning
        cy.boxSelectionEnabled(false);
        
        // Disable pan indicators and other visual feedback
        if (cy.panningEnabled) {
            // Keep panning enabled but optimize it
        }
        
        // Disable compound drag and drop
        cy.autoungrabify(true);
        cy.autolock(true);
        
        console.log('🚀 Non-essential features disabled');
    },
    
    // Optimize event handlers more aggressively
    optimizeEventHandlers() {
        if (!window.GraphRenderer?.cy) return;
        
        const cy = window.GraphRenderer.cy;
        
        // Remove ALL viewport event listeners temporarily
        cy.off('viewport');
        
        // Add single, highly throttled viewport handler
        let viewportThrottle = null;
        let lastViewportUpdate = 0;
        const VIEWPORT_THROTTLE_MS = 100; // Only update every 100ms
        
        cy.on('viewport', () => {
            const now = performance.now();
            
            // Skip if we updated recently
            if (now - lastViewportUpdate < VIEWPORT_THROTTLE_MS) {
                return;
            }
            
            // Cancel previous throttled update
            if (viewportThrottle) {
                cancelAnimationFrame(viewportThrottle);
            }
            
            // Schedule new update
            viewportThrottle = requestAnimationFrame(() => {
                lastViewportUpdate = performance.now();
                
                // Only update the most essential metrics
                if (window.GraphRenderer) {
                    // Update only cached node count, don't recalculate
                    // Most handlers should use cached values
                }
                
                viewportThrottle = null;
            });
        });
        
        console.log('🚀 Event handlers optimized');
    },
    
    // Enable aggressive interaction optimizations
    enableInteractionOptimizations() {
        if (!window.GraphRenderer?.cy) return;
        
        const cy = window.GraphRenderer.cy;
        
        // Immediately enter low detail mode for panning
        cy.on('panstart', () => {
            console.log('🚀 Pan started - entering ultra low detail mode');
            
            // Hide all labels
            cy.style()
                .selector('node')
                .style('label', '')
                .selector('edge')
                .style('opacity', 0.1)
                .update();
                
            // Reduce node opacity
            cy.nodes().style('opacity', 0.3);
            
            // Disable edge rendering temporarily
            cy.edges().style('display', 'none');
        });
        
        // Restore some detail after panning
        cy.on('panend', () => {
            console.log('🚀 Pan ended - restoring minimal detail');
            
            setTimeout(() => {
                cy.edges().style('display', 'element');
                cy.nodes().style('opacity', 0.8);
                cy.edges().style('opacity', 0.2);
            }, 100);
        });
        
        // Ultra-aggressive zoom optimizations
        cy.on('zoom', () => {
            const zoom = cy.zoom();
            
            if (zoom < 0.5) {
                // Very zoomed out - hide almost everything
                cy.nodes().style({
                    'width': 2,
                    'height': 2,
                    'opacity': 0.5
                });
                cy.edges().style('display', 'none');
            } else if (zoom < 1.0) {
                // Medium zoom - show small nodes
                cy.nodes().style({
                    'width': 8,
                    'height': 8,
                    'opacity': 0.7
                });
                cy.edges().style({
                    'display': 'element',
                    'opacity': 0.1
                });
            }
        });
        
        console.log('🚀 Aggressive interaction optimizations enabled');
    },

    enableDebugMode() {
        if (this.debugModeEnabled) {
            console.log('🚀 Aggressive performance debug mode already enabled');
            return;
        }

        this.debugModeEnabled = true;
        console.log('🚀 Aggressive performance debug mode enabled');

        if (this.isApplied) {
            this.enableInteractionOptimizations();
        }
    },

    disableDebugMode() {
        if (!this.debugModeEnabled) {
            console.log('🚀 Aggressive performance debug mode already disabled');
            return;
        }

        this.debugModeEnabled = false;
        console.log('🚀 Aggressive performance debug mode disabled');
    },
    
    // Restore original performance
    restore() {
        if (!this.isApplied || !this.originalStylesheet) {
            console.log('🚀 No aggressive fix to restore');
            return;
        }
        
        if (window.GraphRenderer?.cy) {
            const cy = window.GraphRenderer.cy;
            
            // Restore original stylesheet
            cy.style().clear().fromJson(this.originalStylesheet).update();
            
            // Re-enable features
            cy.boxSelectionEnabled(true);
            cy.autoungrabify(false);
            cy.autolock(false);
            
            console.log('🚀 Original performance restored');
        }
        
        this.isApplied = false;
        this.originalStylesheet = null;
    },
    
    // Check if the fix should be applied based on graph size
    shouldApply() {
        if (!window.GraphRenderer?.cy) return false;
        
        const nodeCount = window.GraphRenderer.cy.nodes().length;
        return nodeCount > 1000; // Apply for graphs with >1000 nodes
    }
};

// Auto-apply for large graphs
if (typeof window !== 'undefined') {
    // Also expose for manual control
    window.applyAggressiveFix = () => window.AggressivePerformanceFix.applyAll();
    window.restoreOriginalPerformance = () => window.AggressivePerformanceFix.restore();
    window.enableAggressivePerformanceFixDebug = () => window.AggressivePerformanceFix.enableDebugMode();
    window.disableAggressivePerformanceFixDebug = () => window.AggressivePerformanceFix.disableDebugMode();
}
