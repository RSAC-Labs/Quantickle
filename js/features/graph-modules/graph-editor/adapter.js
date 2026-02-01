/**
 * Graph Editor Adapter
 * Provides a compatibility wrapper around the legacy graph editor implementation.
 */
window.GraphEditorAdapter = {
    // State management
    initialized: false,

    // Instances
    legacyInstance: null,

    // Configuration
    config: {
        defaultNodeColor: window.QuantickleConfig?.defaultNodeColor || '#ffffff',
        defaultNodeSize: 30,
        promptForDetails: false,
        doubleClickToAdd: true,
        enableUndoRedo: true
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
     * Toggle editing mode
     */
    toggleEditingMode: function() {
        if (this.legacyInstance && this.legacyInstance.toggleEditingMode) {
            return this.legacyInstance.toggleEditingMode();
        }
        return false;
    },

    /**
     * Check if editing mode is enabled
     */
    isEditingModeEnabled: function() {
        if (this.legacyInstance) {
            return this.legacyInstance.editingMode || false;
        }
        return false;
    },

    /**
     * Add node at position
     */
    addNode: function(x, y, options = {}) {
        if (this.legacyInstance && this.legacyInstance.addNode) {
            return this.legacyInstance.addNode(
                x,
                y,
                options.label,
                options.type,
                options.color,
                options.size,
                options.icon,
                options.shape,
                options.labelColor,
                options.info
            );
        }
        return null;
    },

    /**
     * Add node at center
     */
    addNodeAtCenter: function(options = {}) {
        if (this.legacyInstance && this.legacyInstance.addNodeAtCenter) {
            this.legacyInstance.addNodeAtCenter();
            return true;
        }
        return false;
    },

    /**
     * Add container at position
     */
    addContainer: function(x, y, options = {}) {
        const typeConfig = (window.NodeTypes && window.NodeTypes.container) || {};
        const mergedOptions = { ...typeConfig, ...options };
        mergedOptions.label = options.label || 'Container';

        if (this.legacyInstance && this.legacyInstance.addNode) {
            return this.legacyInstance.addNode(
                x,
                y,
                mergedOptions.label,
                'container',
                mergedOptions.color,
                mergedOptions.size,
                mergedOptions.icon,
                mergedOptions.shape
            );
        }
        return null;
    },

    /**
     * Copy selected nodes
     */
    copySelectedNodes: async function() {
        if (this.legacyInstance && this.legacyInstance.copySelectedNodes) {
            await this.legacyInstance.copySelectedNodes();
            return this.legacyInstance.clipboard ? this.legacyInstance.clipboard.length : 0;
        }
        return 0;
    },

    /**
     * Paste nodes from clipboard
     */
    pasteNodes: function(offsetX = null, offsetY = null) {
        if (this.legacyInstance && this.legacyInstance.pasteNodesFromText) {
            // Use pasteNodesFromText which handles both internal and external clipboard
            this.legacyInstance.pasteNodesFromText();
            return this.legacyInstance.clipboard ? this.legacyInstance.clipboard.length : 0;
        } else if (this.legacyInstance && this.legacyInstance.pasteNodes) {
            // Fallback to simple paste if pasteNodesFromText not available
            this.legacyInstance.pasteNodes(offsetX, offsetY);
            return this.legacyInstance.clipboard ? this.legacyInstance.clipboard.length : 0;
        }
        return 0;
    },

    /**
     * Delete selected elements
     */
    deleteSelectedElements: function() {
        if (this.legacyInstance && this.legacyInstance.deleteSelectedElements) {
            this.legacyInstance.deleteSelectedElements();
            return 1; // Legacy doesn't return count
        }
        return 0;
    },

    /**
     * Create edges from selection to node
     */
    createEdgesFromSelectionToNode: function(targetNode) {
        if (this.legacyInstance && this.legacyInstance.createEdgesFromSelectionToNode) {
            this.legacyInstance.createEdgesFromSelectionToNode(targetNode);
            return 1; // Legacy doesn't return count
        }
        return 0;
    },

    /**
     * Get clipboard contents
     */
    getClipboardContents: function() {
        if (this.legacyInstance && this.legacyInstance.clipboard) {
            return {
                count: this.legacyInstance.clipboard.length,
                nodes: this.legacyInstance.clipboard
            };
        }
        return { count: 0, nodes: [] };
    },

    /**
     * Clear clipboard
     */
    clearClipboard: function() {
        if (this.legacyInstance && this.legacyInstance.clipboard) {
            this.legacyInstance.clipboard = [];
            return true;
        }
        return false;
    },

    /**
     * Generate editor report
     */
    getEditorReport: function() {
        const clipboard = this.getClipboardContents();
        return {
            timestamp: new Date().toISOString(),
            implementation: 'legacy',
            editingMode: this.isEditingModeEnabled(),
            clipboard: clipboard,
            capabilities: ['basic editing', 'copy/paste', 'delete', 'add nodes'],
            note: 'Legacy implementation with basic functionality'
        };
    },

    /**
     * Expose global functions
     */
    exposeGlobalFunctions: function() {
        const functions = {
            toggleEditingMode: () => this.toggleEditingMode(),
            isEditingMode: () => this.isEditingModeEnabled(),
            addNode: (x, y, options) => this.addNode(x, y, options),
            addNodeAtCenter: (options) => this.addNodeAtCenter(options),
            addContainer: (x, y, options) => this.addContainer(x, y, options),
            copyNodes: () => this.copySelectedNodes(),
            pasteNodes: (x, y) => this.pasteNodes(x, y),
            clearClipboard: () => this.clearClipboard(),
            getClipboard: () => this.getClipboardContents(),
            deleteSelected: () => this.deleteSelectedElements(),
            createEdgesToNode: (node) => this.createEdgesFromSelectionToNode(node),
            editorReport: () => this.getEditorReport(),
            analyzeEditor: () => {
                const report = this.getEditorReport();
                return report;
            }
        };

        // Expose functions globally
        Object.assign(window, functions);
    },

    /**
     * Get status of the legacy implementation
     */
    getStatus: function() {
        return {
            legacyAvailable: !!(this.legacyInstance && this.legacyInstance.addNode),
            currentImplementation: 'legacy',
            editingMode: this.isEditingModeEnabled(),
            globalFunctionsAvailable: [
                'toggleEditingMode', 'isEditingMode', 'addNode', 'addNodeAtCenter',
                'copyNodes', 'pasteNodes', 'deleteSelected', 'createEdgesToNode',
                'getClipboard', 'editorReport', 'analyzeEditor'
            ].map(name => ({ name, available: !!window[name] }))
        };
    }
};

// Auto-initialize when GraphRenderer is available
if (window.GraphRenderer) {
    window.GraphEditorAdapter.init();
} else {
    // Wait for GraphRenderer to be available
    const checkGraphRenderer = setInterval(() => {
        if (window.GraphRenderer) {
            clearInterval(checkGraphRenderer);
            window.GraphEditorAdapter.init();
        }
    }, 100);
}
