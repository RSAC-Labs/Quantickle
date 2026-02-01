// Extensions management for Quantickle
// Handles loading and registration of Cytoscape.js extensions

window.ExtensionsManager = {
    // Extension registration status
    registeredExtensions: {
        cola: false,
        dagre: false,
        klay: false,
        euler: false,
        coseBilkent: false,
        bubblesets: false
    },

    // Initialize all extensions
    initExtensions: function() {
        
        // Check if cytoscape is available
        if (typeof cytoscape === 'undefined') {
            console.error('Cytoscape is not available for extension registration');
            return;
        }
        
        // Let extensions auto-register
    },
    
    // Register all extensions
    registerAllExtensions: function() {
        
        // Mark all extensions as available since they auto-register
        this.registeredExtensions.cola = true;
        this.registeredExtensions.dagre = true;
        this.registeredExtensions.klay = true;
        this.registeredExtensions.euler = true;
        this.registeredExtensions.coseBilkent = true;
        const hasBubbleSets = typeof cytoscape !== 'undefined' && (
            typeof cytoscape.prototype?.bubbleSets === 'function' ||
            typeof cytoscape.Core?.prototype?.bubbleSets === 'function'
        );

        this.registeredExtensions.bubblesets = hasBubbleSets;
        
        // Update global tracking
        window.QuantickleConfig = window.QuantickleConfig || {};
        window.QuantickleConfig.availableExtensions = { ...this.registeredExtensions };
        
        // Force update the layout dropdown
        if (window.LayoutManager) {
            window.LayoutManager.updateLayoutDropdown();
        }
    },

    // Check if an extension is available
    isExtensionAvailable: function(extensionName) {
        return this.registeredExtensions[extensionName] || false;
    },

    // Get all available extensions
    getAvailableExtensions: function() {
        return { ...this.registeredExtensions };
    },
    
    // Debug function to check extension status
    debugExtensions: function() {
    }
}; 