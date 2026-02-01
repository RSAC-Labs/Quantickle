/**
 * Layout Manager Adapter
 *
 * Provides a stable API that delegates to the legacy LayoutManager.
 */

window.LayoutManagerAdapter = {
    
    /**
     * Select and apply a layout
     */
    selectLayout: function(layoutName) {
        if (window.LayoutManager && window.LayoutManager.selectLayout) {
            return window.LayoutManager.selectLayout(layoutName);
        }
    },
    
    /**
     * Apply the current layout
     */
    applyLayout: function() {
        if (window.LayoutManager && window.LayoutManager.applyLayout) {
            return window.LayoutManager.applyLayout();
        }
    },

    /**
     * Fit elements into the current layout without recalculating everything
     */
    fitToCurrentLayout: function(context = {}) {
        if (window.LayoutManager && typeof window.LayoutManager.fitToCurrentLayout === 'function') {
            return window.LayoutManager.fitToCurrentLayout(context);
        }
        return false;
    },
    
    /**
     * Get current layout name
     */
    getCurrentLayout: function() {
        if (window.LayoutManager && window.LayoutManager.currentLayout) {
            return window.LayoutManager.currentLayout;
        }
        return 'grid';
    },
    
    /**
     * Get available layouts
     */
    getAvailableLayouts: function() {
        if (window.LayoutManager && window.LayoutManager.alwaysAvailable) {
            return window.LayoutManager.alwaysAvailable;
        }
        return ['grid', 'circle', 'random'];
    },
    
    /**
     * Calculate optimal sizing
     */
    calculateOptimalSizing: function(cy) {
        if (window.LayoutManager && window.LayoutManager.calculateOptimalSizing) {
            return window.LayoutManager.calculateOptimalSizing(cy);
        }
        return {
            nodeSize: 30,
            spacing: 50,
            fontSize: 12,
            edgeWidth: 1,
            shouldAnimate: true,
            nodeCount: cy ? cy.nodes().length : 0,
            performance: 'optimal'
        };
    },
    
    /**
     * Enable auto-update mode
     */
    enableAutoUpdate: function() {
        if (window.LayoutManager) {
            window.LayoutManager.autoUpdateEnabled = true;
        }
    },
    
    /**
     * Disable auto-update mode
     */
    disableAutoUpdate: function() {
        if (window.LayoutManager) {
            window.LayoutManager.autoUpdateEnabled = false;
        }
    },
    
    /**
     * Handle drag update
     */
    handleDragUpdate: function() {
        if (window.LayoutManager && window.LayoutManager.handleDragUpdate) {
            return window.LayoutManager.handleDragUpdate();
        }
    },
    
    /**
     * Update layout dropdown
     */
    updateLayoutDropdown: function() {
        if (window.LayoutManager && window.LayoutManager.updateLayoutDropdown) {
            return window.LayoutManager.updateLayoutDropdown();
        }
    }
};
