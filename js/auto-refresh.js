// Auto-refresh functionality for Quantickle
// Automatically redraws the graph when new data is detected

window.AutoRefresh = {
    enabled: true,
    checkInterval: 2000, // Check for updates every 2 seconds
    redrawDelay: 10000, // Wait 10 seconds after last update before redrawing
    currentGraphId: null,
    lastKnownStats: { nodes: 0, edges: 0 },
    lastUpdateTime: null,
    redrawTimeout: null,
    isPolling: false,
    
    // Initialize auto-refresh functionality
    init: function() {
        this.startPolling();
        
        // Add UI controls for auto-refresh
        this.addUIControls();
    },
    
    // Add UI controls to enable/disable auto-refresh
    addUIControls: function() {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            const refreshSection = document.createElement('div');
            refreshSection.className = 'control-group';
            refreshSection.innerHTML = `
                <label class="control-label">Auto-Refresh</label>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" id="autoRefreshToggle" ${this.enabled ? 'checked' : ''} 
                           style="margin: 0;">
                    <label for="autoRefreshToggle" style="margin: 0; font-size: 12px;">
                        Auto-redraw graph
                    </label>
                </div>
                <div id="refreshStatus" style="font-size: 11px; color: #888; margin-top: 5px;">
                    Status: Monitoring...
                </div>
                <button id="manualRefreshBtn" class="control" style="margin-top: 5px; font-size: 12px;">
                    🔄 Refresh Now
                </button>
            `;
            
            // Insert after the graph management section
            const graphSection = sidebar.querySelector('.control-group');
            if (graphSection && graphSection.nextSibling) {
                graphSection.parentNode.insertBefore(refreshSection, graphSection.nextSibling);
            } else if (graphSection) {
                graphSection.parentNode.appendChild(refreshSection);
            }
            
            // Add event listeners
            document.getElementById('autoRefreshToggle').addEventListener('change', (e) => {
                this.enabled = e.target.checked;
                this.updateStatus(this.enabled ? 'Auto-refresh enabled' : 'Auto-refresh disabled');
                
                if (this.enabled && !this.isPolling) {
                    this.startPolling();
                } else if (!this.enabled && this.redrawTimeout) {
                    clearTimeout(this.redrawTimeout);
                    this.redrawTimeout = null;
                }
            });
            
            document.getElementById('manualRefreshBtn').addEventListener('click', () => {
                this.forceRedraw();
            });
        }
    },
    
    // Start polling for changes
    startPolling: function() {
        if (this.isPolling) return;
        
        this.isPolling = true;
        
        const poll = () => {
            if (!this.enabled) {
                this.isPolling = false;
                return;
            }
            
            this.checkForUpdates();
            setTimeout(poll, this.checkInterval);
        };
        
        poll();
    },
    
    // Check for graph updates

    checkForUpdates: function() {
        const stats = this.fetchLocalGraphStats();
        if (!stats) {
            this.updateStatus('No local graph data');
            return;
        }

        if (this.lastUpdateTime !== stats.lastUpdated) {
            this.lastUpdateTime = stats.lastUpdated;
            this.lastKnownStats = { nodes: stats.nodes, edges: stats.edges };
            this.updateStatus(`Update detected: ${stats.nodes} nodes, ${stats.edges} edges`);
            this.scheduleRedraw();
        } else {
            const timeSinceUpdate = this.lastUpdateTime ? Math.floor((Date.now() - this.lastUpdateTime) / 1000) : null;
            const shouldLog = !this.lastStatusLog || (Date.now() - this.lastStatusLog) > 30000;
            if (shouldLog) {
                if (timeSinceUpdate) {
                    this.updateStatus(`No changes (${timeSinceUpdate}s since last update)`);
                } else {
                    this.updateStatus(`Monitoring: ${stats.nodes} nodes, ${stats.edges} edges`);
                }
                this.lastStatusLog = Date.now();
            }
        }
    },
    
    fetchLocalGraphStats: function() {
        try {
            const key = 'quantickle-local-graph';
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const data = JSON.parse(raw);
            return {
                nodes: data.nodeCount || (data.nodes ? data.nodes.length : 0),
                edges: data.edgeCount || (data.edges ? data.edges.length : 0),
                lastUpdated: data.lastUpdated || 0
            };
        } catch (e) {
            return null;
        }
    },
    
    // Handle stats update
    handleStatsUpdate: function(newStats) {
        const hasChanges = (
            newStats.nodes !== this.lastKnownStats.nodes ||
            newStats.edges !== this.lastKnownStats.edges
        );
        
        if (hasChanges) {
            
            this.lastKnownStats = newStats;
            this.lastUpdateTime = Date.now();
            
            this.updateStatus(`Update detected: ${newStats.nodes} nodes, ${newStats.edges} edges`);
            
            // Schedule redraw
            this.scheduleRedraw();
        } else {
            // No changes, only update status occasionally to reduce noise
            const timeSinceUpdate = this.lastUpdateTime ? 
                Math.floor((Date.now() - this.lastUpdateTime) / 1000) : null;
            
            // Only log status updates every 30 seconds to reduce console noise
            const shouldLog = !this.lastStatusLog || (Date.now() - this.lastStatusLog) > 30000;
            
            if (shouldLog) {
                if (timeSinceUpdate) {
                    this.updateStatus(`No changes (${timeSinceUpdate}s since last update)`);
                } else {
                    this.updateStatus(`Monitoring: ${newStats.nodes} nodes, ${newStats.edges} edges`);
                }
                this.lastStatusLog = Date.now();
            }
        }
    },
    
    // Schedule a redraw after the delay
    scheduleRedraw: function() {
        // Clear any existing redraw timeout
        if (this.redrawTimeout) {
            clearTimeout(this.redrawTimeout);
        }
        
        this.updateStatus(`Redraw scheduled in ${this.redrawDelay / 1000}s...`);
        
        // Schedule new redraw
        this.redrawTimeout = setTimeout(() => {
            this.performRedraw();
            this.redrawTimeout = null;
        }, this.redrawDelay);
    },
    
    // Perform the actual redraw
    performRedraw: function() {
        const layoutManager = window.LayoutManager;
        const graphRenderer = window.GraphRenderer;

        if (layoutManager?.currentLayout === 'timeline') {
            const cy = graphRenderer?.cy;
            if (cy && cy.edges('[type="timeline-link"]').length > 0) {
                this.updateStatus('Redraw skipped: timeline connectors active');
                return;
            }
        }

        this.updateStatus('Redrawing graph...');

        this.updateStatus('Auto-refresh disabled: API loader unavailable');
    },
    
    // Force immediate redraw
    forceRedraw: function() {
        
        // Clear any pending redraw
        if (this.redrawTimeout) {
            clearTimeout(this.redrawTimeout);
            this.redrawTimeout = null;
        }
        
        this.performRedraw();
    },
    
    // Update status display
    updateStatus: function(message) {
        const statusElement = document.getElementById('refreshStatus');
        if (statusElement) {
            const timestamp = new Date().toLocaleTimeString();
            statusElement.textContent = `${timestamp}: ${message}`;
        }
        
        // Also log to console with timestamp
    },
    
    // Enable/disable auto-refresh
    setEnabled: function(enabled) {
        this.enabled = enabled;
        const toggle = document.getElementById('autoRefreshToggle');
        if (toggle) {
            toggle.checked = enabled;
        }
        
        if (enabled && !this.isPolling) {
            this.startPolling();
        } else if (!enabled && this.redrawTimeout) {
            clearTimeout(this.redrawTimeout);
            this.redrawTimeout = null;
        }
        
        this.updateStatus(enabled ? 'Auto-refresh enabled' : 'Auto-refresh disabled');
    },
    
    // Get current configuration
    getConfig: function() {
        return {
            enabled: this.enabled,
            checkInterval: this.checkInterval,
            redrawDelay: this.redrawDelay,
            currentGraphId: this.currentGraphId,
            lastKnownStats: this.lastKnownStats,
            isPolling: this.isPolling
        };
    },
    
    // Update configuration
    updateConfig: function(config) {
        if (config.checkInterval) this.checkInterval = config.checkInterval;
        if (config.redrawDelay) this.redrawDelay = config.redrawDelay;
        if (config.enabled !== undefined) this.setEnabled(config.enabled);
    }
};

// Initialize auto-refresh when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Wait for other modules to initialize
    setTimeout(() => {
        if (window.AutoRefresh) {
            window.AutoRefresh.init();
        }
    }, 1500); // Wait a bit longer than the API loader
});
