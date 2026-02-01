// UI module for Quantickle
// Handles user interface interactions and notifications

window.UI = {
    cheatSheetPreferenceKey: 'quantickle_cheat_sheet_visibility',
    helpPanelConfigs: {
        'importing-data': {
            title: 'Importing Data',
            partialPath: '/assets/help/partials/importing-data.html',
            closeLabel: 'Close importing data help',
        },
        'node-domains': {
            title: 'Node Domains',
            partialPath: '/assets/help/partials/node-domains.html',
            closeLabel: 'Close node domain help',
        },
        containers: {
            title: 'Using Containers',
            partialPath: '/assets/help/partials/containers.html',
            closeLabel: 'Close container help',
        },
        'external-content': {
            title: 'Using External Content',
            partialPath: '/assets/help/partials/external-content.html',
            closeLabel: 'Close external content help',
        },
        'proxy-allowlist': {
            title: 'Proxy Allowlist',
            partialPath: '/assets/help/partials/proxy-allowlist.html',
            closeLabel: 'Close proxy allowlist help',
        },
        'linking-graphs': {
            title: 'Linking Graphs',
            partialPath: '/assets/help/partials/linking-graphs.html',
            closeLabel: 'Close linking graphs help',
        },
        about: {
            title: 'About Quantickle',
            partialPath: '/assets/help/partials/about.html',
            closeLabel: 'Close about dialog',
            bodyClass: 'about-body',
        },
    },
    helpPanelCache: {},
    helpPanelContainer: null,
    helpPanelBody: null,
    helpPanelContent: null,
    helpPanelTitle: null,
    helpPanelsInitialized: false,
    activeHelpPanelKey: null,
    graphActivity: {
        overlay: null,
        messageEl: null,
        subtextEl: null,
        activeTasks: new Map()
    },
    // Initialize UI module
    init: function() {
        this.setupNotificationSystem();
        this.setupErrorReporting();
        this.setupLODControls();
        this.setupGlobe3DControls();
        this.setupCheatSheet();
        this.restoreCheatSheetPreference();
        this.setupHelpPanels();
        this.ensureGraphActivityElements();
        const initialName = window.DataManager ? window.DataManager.currentGraphName : 'Unsaved graph';
        this.updateGraphFileName(initialName);
    },

    // Set up notification system
    setupNotificationSystem: function() {
        // Create notification container if it doesn't exist
        if (!document.getElementById('notification-container')) {
            const container = document.createElement('div');
            container.id = 'notification-container';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                left: 20px;
                z-index: 9999;
                max-width: 400px;
            `;
            document.body.appendChild(container);
        }
    },

    // Set up error reporting
    setupErrorReporting: function() {
        // Create error report modal if it doesn't exist
        if (!document.getElementById('error-report-modal')) {
            const modal = document.createElement('div');
            modal.id = 'error-report-modal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Error Details</h2>
                        <span class="close">&times;</span>
                    </div>
                    <div class="modal-body">
                        <div id="error-report-content"></div>
                    </div>
                    <div class="modal-footer">
                        <button id="copy-error-report">Copy to Clipboard</button>
                        <button id="close-error-report">Close</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Add event listeners
            const closeBtn = modal.querySelector('.close');
            const copyBtn = modal.querySelector('#copy-error-report');
            const closeModalBtn = modal.querySelector('#close-error-report');

            closeBtn.onclick = () => this.hideErrorReport();
            copyBtn.onclick = () => this.copyErrorReport();
            closeModalBtn.onclick = () => this.hideErrorReport();
        }
    },

    updateGraphFileName: function(name) {
        const el = document.getElementById('graphFileName');
        if (el) {
            el.textContent = name;
        }
    },

    // Show notification in status bar
    showNotification: function(message, type = 'status', duration = 10000) {
        const statusInfo = document.getElementById('statusInfo');
        if (!statusInfo) return;

        // Clear any existing timeout so the latest message controls the bar
        if (statusInfo.clearTimer) {
            clearTimeout(statusInfo.clearTimer);
        }

        // Set color based on type
        switch (type) {
            case 'error':
                statusInfo.style.color = 'red';
                break;
            case 'success':
                statusInfo.style.color = 'green';
                break;
            default:
                statusInfo.style.color = 'white';
        }

        // Update status message
        statusInfo.textContent = message;

        // Clear message after duration
        statusInfo.clearTimer = setTimeout(() => {
            statusInfo.textContent = '';
            statusInfo.style.color = '';
            statusInfo.clearTimer = null;
        }, duration);

        return 'status-notification';
    },

    // Remove notification (for status bar compatibility)
    removeNotification: function(id) {
        const statusInfo = document.getElementById('statusInfo');
        if (statusInfo) {
            if (statusInfo.clearTimer) {
                clearTimeout(statusInfo.clearTimer);
                statusInfo.clearTimer = null;
            }
            statusInfo.textContent = '';
            statusInfo.style.color = '';
        }
    },

    // Show error report modal
    showErrorReport: function(errors) {
        const modal = document.getElementById('error-report-modal');
        const content = document.getElementById('error-report-content');
        
        // Format error report
        let report = '<h3>Validation Errors</h3>';
        report += '<pre>';
        
        if (Array.isArray(errors)) {
            errors.forEach((error, index) => {
                report += `Error ${index + 1}:\n`;
                if (typeof error === 'string') {
                    report += `  ${error}\n`;
                } else {
                    if (error.row) report += `  Row: ${error.row}\n`;
                    if (error.type) report += `  Type: ${error.type}\n`;
                    if (error.errors) {
                        if (Array.isArray(error.errors)) {
                            error.errors.forEach(err => {
                                report += `  - ${err}\n`;
                            });
                        } else {
                            report += `  - ${error.errors}\n`;
                        }
                    }
                }
                report += '\n';
            });
        } else if (typeof errors === 'object') {
            Object.entries(errors).forEach(([key, value]) => {
                report += `${key}:\n`;
                if (Array.isArray(value)) {
                    value.forEach(err => {
                        report += `  - ${err}\n`;
                    });
                } else {
                    report += `  ${value}\n`;
                }
            });
        } else {
            report += errors.toString();
        }
        
        report += '</pre>';

        content.innerHTML = window.DOMPurify ? DOMPurify.sanitize(report) : report;
        modal.style.display = 'block';

        // Store for clipboard copy
        window.lastErrorReport = report;
    },

    // Hide error report modal
    hideErrorReport: function() {
        const modal = document.getElementById('error-report-modal');
        modal.style.display = 'none';
        // Clear stored report to avoid retaining large strings
        window.lastErrorReport = null;
    },

    // Copy error report to clipboard
    copyErrorReport: function() {
        if (window.lastErrorReport) {
            const textArea = document.createElement('textarea');
            textArea.value = window.lastErrorReport.replace(/<[^>]*>/g, '');
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showNotification('Error report copied to clipboard', 'success', 2000);
            // Clear stored report after copying to free memory
            window.lastErrorReport = null;
        }
    },

    // Report validation error
    reportValidationError: function(error, type = 'error') {
        console.error('Validation error:', error);
        window.lastValidationErrors = error;
        
        let message;
        if (Array.isArray(error)) {
            message = `${error.length} validation error(s) found`;
        } else if (typeof error === 'object') {
            message = error.message || 'Validation failed';
        } else {
            message = error.toString();
        }
        
        this.showNotification(message, type);
    },

    // Update validation status display
    updateValidationStatus: function(isValid, context = '') {
        const statusIndicator = document.getElementById('validation-status');
        if (!statusIndicator) return;

        statusIndicator.className = isValid ? 'valid' : 'invalid';
        statusIndicator.title = isValid ? 
            `${context} validation passed` : 
            `${context} validation failed`;
    },

    ensureGraphActivityElements: function() {
        if (this.graphActivity.overlay && document.body.contains(this.graphActivity.overlay)) {
            return this.graphActivity.overlay;
        }

        const wrapper = document.getElementById('cy-wrapper') || document.body;
        const overlay = document.createElement('div');
        overlay.id = 'graph-activity-overlay';
        overlay.className = 'graph-activity-overlay';
        overlay.setAttribute('role', 'status');
        overlay.setAttribute('aria-live', 'polite');
        overlay.style.display = 'none';
        overlay.innerHTML = `
            <div class="graph-activity-card">
                <div class="graph-activity-spinner" aria-hidden="true"></div>
                <div>
                    <div class="graph-activity-text">Working...</div>
                    <div class="graph-activity-subtext">Graph actions are temporarily locked.</div>
                </div>
            </div>
        `;

        wrapper.appendChild(overlay);

        this.graphActivity.overlay = overlay;
        this.graphActivity.messageEl = overlay.querySelector('.graph-activity-text');
        this.graphActivity.subtextEl = overlay.querySelector('.graph-activity-subtext');

        return overlay;
    },

    updateGraphActivityOverlay: function() {
        const overlay = this.ensureGraphActivityElements();
        const activeCount = this.graphActivity.activeTasks.size;
        const wrapper = document.getElementById('cy-wrapper');

        if (wrapper) {
            wrapper.classList.toggle('graph-blocked', activeCount > 0);
        }

        if (activeCount === 0) {
            overlay.style.display = 'none';
            return;
        }

        const activeTasks = Array.from(this.graphActivity.activeTasks.values());
        const latestTask = activeTasks[activeTasks.length - 1];

        if (this.graphActivity.messageEl) {
            this.graphActivity.messageEl.textContent = latestTask?.message || 'Working...';
        }

        if (this.graphActivity.subtextEl) {
            this.graphActivity.subtextEl.textContent = activeCount > 1
                ? `${activeCount} tasks are running; graph actions are paused`
                : 'Graph actions are temporarily locked.';
        }

        overlay.style.display = 'flex';
    },

    beginGraphActivity: function(taskId, message) {
        const id = taskId || `graph-task-${Date.now()}`;
        this.graphActivity.activeTasks.set(id, { message: message || 'Working...' });
        this.updateGraphActivityOverlay();
        return id;
    },

    updateGraphActivity: function(taskId, message) {
        if (!taskId || !this.graphActivity.activeTasks.has(taskId)) {
            return false;
        }

        const current = this.graphActivity.activeTasks.get(taskId) || {};
        this.graphActivity.activeTasks.set(taskId, {
            ...current,
            message: message || current.message || 'Working...'
        });

        this.updateGraphActivityOverlay();
        return true;
    },

    endGraphActivity: function(taskId) {
        if (!taskId) {
            this.graphActivity.activeTasks.clear();
        } else if (this.graphActivity.activeTasks.has(taskId)) {
            this.graphActivity.activeTasks.delete(taskId);
        }

        this.updateGraphActivityOverlay();
    },

    // Add CSS styles
    addStyles: function() {
        const styles = `
            .modal {
                display: none;
                position: fixed;
                z-index: 10000;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0,0,0,0.4);
            }

            .modal-content {
                background-color: #fefefe;
                margin: 15% auto;
                padding: 20px;
                border: 1px solid #888;
                width: 80%;
                max-width: 800px;
                border-radius: 4px;
            }

            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }

            .modal-header h2 {
                margin: 0;
            }

            .close {
                color: #aaa;
                font-size: 28px;
                font-weight: bold;
                cursor: pointer;
            }

            .close:hover {
                color: black;
            }

            #cy-wrapper.graph-blocked {
                position: relative;
            }

            .graph-activity-overlay {
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(15, 23, 42, 0.6);
                backdrop-filter: blur(2px);
                z-index: 1600;
                pointer-events: auto;
            }

            .graph-activity-card {
                display: flex;
                align-items: center;
                gap: 12px;
                background: rgba(23, 23, 23, 0.92);
                border: 1px solid #6366f1;
                color: #e5e7eb;
                padding: 14px 16px;
                border-radius: 12px;
                box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
                max-width: 380px;
            }

            .graph-activity-text {
                font-weight: 600;
                margin-bottom: 2px;
            }

            .graph-activity-subtext {
                font-size: 12px;
                opacity: 0.85;
            }

            .graph-activity-spinner {
                width: 26px;
                height: 26px;
                border-radius: 999px;
                border: 3px solid rgba(99, 102, 241, 0.25);
                border-top-color: #a5b4fc;
                animation: graph-activity-spin 0.9s linear infinite;
                flex-shrink: 0;
            }

            @keyframes graph-activity-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }

            .modal-body {
                max-height: 400px;
                overflow-y: auto;
            }

            .modal-footer {
                margin-top: 20px;
                text-align: right;
            }

            .modal-footer button {
                margin-left: 10px;
                padding: 8px 16px;
                border-radius: 4px;
                border: none;
                cursor: pointer;
            }

            #copy-error-report {
                background-color: #4CAF50;
                color: white;
            }

            #close-error-report {
                background-color: #f44336;
                color: white;
            }

            .notification {
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            }

            .notification:hover {
                opacity: 0.9 !important;
            }

            #validation-status {
                display: inline-block;
                width: 10px;
                height: 10px;
                border-radius: 50%;
                margin-left: 10px;
            }

            #validation-status.valid {
                background-color: #4CAF50;
            }

            #validation-status.invalid {
                background-color: #f44336;
            }

            pre {
                background-color: #f5f5f5;
                padding: 10px;
                border-radius: 4px;
                overflow-x: auto;
                white-space: pre-wrap;
                word-wrap: break-word;
            }
        `;

        const styleSheet = document.createElement('style');
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    },

    // Setup LOD system controls
    setupLODControls: function() {
        const lodToggle = document.getElementById('lodToggle');
        const lodLevel = document.getElementById('lodLevel');
        
        if (!lodToggle || !lodLevel) {
            return;
        }

        const formatLODStatusText = () => {
            if (!window.LODSystem) {
                return;
            }

            const enabled = window.LODSystem.config.enabled !== false;
            if (!enabled) {
                lodLevel.textContent = 'Disabled';
                lodLevel.style.color = '#ff6b6b';
                return;
            }

            const currentLevel = window.LODSystem.getCurrentLevel();
            const formattedLevel = currentLevel
                ? currentLevel.charAt(0).toUpperCase() + currentLevel.slice(1)
                : 'Fine';

            lodLevel.textContent = `Auto (${formattedLevel})`;

            switch (currentLevel) {
                case 'coarse':
                    lodLevel.style.color = '#ff6b6b';
                    break;
                case 'medium':
                    lodLevel.style.color = '#feca57';
                    break;
                case 'fine':
                default:
                    lodLevel.style.color = '#667eea';
                    break;
            }
        };

        // Set initial state
        if (window.LODSystem) {
            lodToggle.checked = window.LODSystem.config.enabled !== false;
            formatLODStatusText();
        }

        // Handle toggle changes
        lodToggle.addEventListener('change', (event) => {
            if (window.LODSystem) {
                window.LODSystem.setEnabled(event.target.checked);

                if (event.target.checked) {
                    formatLODStatusText();
                    this.showNotification('LOD system enabled - large graphs will auto-optimize detail levels', 'success', 3000);
                } else {
                    formatLODStatusText();
                    this.showNotification('LOD system disabled - showing full detail', 'info', 3000);
                }
            }
        });

        // Update LOD level display periodically
        setInterval(() => {
            if (window.LODSystem && lodLevel) {
                formatLODStatusText();
            }
        }, 1000);
    },

    // Setup 3D Globe controls
    setupGlobe3DControls: function() {
        const globe3dToggle = document.getElementById('globe3dToggle');
        const globe3dStatus = document.getElementById('globe3dStatus');
        const globe3dAutoRotate = document.getElementById('globe3dAutoRotate');
        
        if (!globe3dToggle || !globe3dStatus || !globe3dAutoRotate) {
            return;
        }

        // Set initial state
        if (window.GlobeLayout3D) {
            globe3dToggle.checked = window.GlobeLayout3D.config.depthEffect;
            globe3dAutoRotate.checked = window.GlobeLayout3D.config.autoRotate;
            globe3dStatus.textContent = window.GlobeLayout3D.config.depthEffect ? 'On' : 'Off';
            
            // Enable/disable controls based on current layout
            this.update3DControlsState();
        }

                        // Handle depth effects toggle
                globe3dToggle.addEventListener('change', (event) => {
                    if (window.GlobeLayout3D) {
                        window.GlobeLayout3D.setConfig({ depthEffect: event.target.checked });
                        
                        if (event.target.checked) {
                            // Enable 3D effects for any 3D-capable layout
                            if (window.LayoutManager && window.LayoutManager.is3DLayout && window.LayoutManager.is3DLayout(window.LayoutManager.currentLayout)) {
                                const layoutName = window.LayoutManager.currentLayout;
                                this.showNotification(`3D depth effects enabled for ${layoutName} layout`, 'success', 3000);
                                globe3dStatus.textContent = 'On';
                                
                                // Apply 3D effects to current 3D layout
                                if (window.GraphRenderer && window.GraphRenderer.cy) {
                                    window.GlobeLayout3D.init(window.GraphRenderer.cy);
                                    
                                    // Apply appropriate 3D effects based on layout type
                                    if (layoutName === 'true-3d-globe') {
                                        window.GlobeLayout3D.applyTrue3DGlobeLayout({
                                            depthEffect: true,
                                            autoRotate: globe3dAutoRotate.checked
                                        });
                                    } else if (layoutName === 'absolute') {
                                        // For Absolute layout, just apply depth effects without changing positions
                                        window.GlobeLayout3D.applyGlobeEffects({
                                            depthEffect: true,
                                            autoRotate: globe3dAutoRotate.checked
                                        });
                                    }
                                    
                                    // Force immediate depth effects application
                                    setTimeout(() => {
                                        if (window.GlobeLayout3D && window.GlobeLayout3D.isActive) {
                                            window.GlobeLayout3D.applyDepthEffects();
                                        }
                                    }, 100);
                                }
                            } else {
                                // Disable toggle and show warning for 2D layouts
                                event.target.checked = false;
                                this.showNotification('3D effects only work with 3D layouts (True 3D Globe, Absolute, etc.). Switch to a 3D layout first.', 'warning', 4000);
                                return;
                            }
                        } else {
                            this.showNotification('3D depth effects disabled', 'info', 3000);
                            globe3dStatus.textContent = 'Off';
                            // Reset visual effects
                            window.GlobeLayout3D.resetVisualEffects();
                        }
                    }
                });

                        // Handle auto-rotation toggle
                globe3dAutoRotate.addEventListener('change', (event) => {
                    if (window.GlobeLayout3D) {
                        // Allow auto-rotation for any 3D-capable layout
                        if (window.LayoutManager && window.LayoutManager.is3DLayout && window.LayoutManager.is3DLayout(window.LayoutManager.currentLayout)) {
                            const layoutName = window.LayoutManager.currentLayout;
                            window.GlobeLayout3D.setConfig({ autoRotate: event.target.checked });
                            
                            if (event.target.checked) {
                                this.showNotification(`3D auto-rotation enabled for ${layoutName} layout`, 'success', 3000);
                                if (window.GlobeLayout3D.isActive) {
                                    window.GlobeLayout3D.startAutoRotation();
                                }
                            } else {
                                this.showNotification('3D auto-rotation disabled', 'info', 3000);
                                window.GlobeLayout3D.stopAutoRotation();
                            }
                        } else {
                            // Disable toggle and show warning for 2D layouts
                            event.target.checked = false;
                            this.showNotification('Auto-rotation only works with 3D layouts (True 3D Globe, Absolute, etc.). Switch to a 3D layout first.', 'warning', 4000);
                            return;
                        }
                    }
                });
    },

    setupCheatSheet: function() {
        if (this.cheatSheetInitialized) {
            return;
        }

        const panel = document.getElementById('cheatSheetPanel');
        const toggle = document.getElementById('viewCheatSheetToggle');

        if (!panel || !toggle) {
            return;
        }

        this.cheatSheetPanel = panel;
        this.cheatSheetToggle = toggle;

        const closeButton = panel.querySelector('[data-action="close-cheat-sheet"]');
        if (closeButton) {
            this.cheatSheetCloseButton = closeButton;
            closeButton.addEventListener('click', () => this.hideCheatSheet());
            closeButton.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    this.hideCheatSheet();
                }
            });
        }

        toggle.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.toggleCheatSheet();
            }
        });

        panel.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.hideCheatSheet();
            }
        });

        this.cheatSheetInitialized = true;
    },

    restoreCheatSheetPreference: function() {
        if (!this.cheatSheetPanel || !this.cheatSheetToggle) {
            this.setupCheatSheet();
        }

        if (!this.cheatSheetPanel || !this.cheatSheetToggle) {
            return;
        }

        const preference = this.getCheatSheetPreference();
        if (preference === 'hidden') {
            this.hideCheatSheet();
        } else {
            this.showCheatSheet({ suppressFocus: true });
        }
    },

    getCheatSheetPreference: function() {
        if (typeof localStorage === 'undefined') {
            return null;
        }

        try {
            return localStorage.getItem(this.cheatSheetPreferenceKey);
        } catch (error) {
            return null;
        }
    },

    persistCheatSheetPreference: function(visible) {
        if (typeof localStorage === 'undefined') {
            return;
        }

        try {
            localStorage.setItem(this.cheatSheetPreferenceKey, visible ? 'visible' : 'hidden');
        } catch (error) {
            // Ignore storage failures; visibility will reset to default
        }
    },

    showCheatSheet: function(options = {}) {
        if (!this.cheatSheetPanel || !this.cheatSheetToggle) {
            this.setupCheatSheet();
        }

        if (!this.cheatSheetPanel || !this.cheatSheetToggle) {
            return;
        }

        this.cheatSheetPanel.classList.remove('hidden');
        this.cheatSheetPanel.setAttribute('aria-hidden', 'false');
        this.cheatSheetToggle.setAttribute('aria-checked', 'true');

        if (!options.suppressFocus) {
            requestAnimationFrame(() => {
                if (this.cheatSheetPanel) {
                    this.cheatSheetPanel.focus({ preventScroll: true });
                }
            });
        }

        this.persistCheatSheetPreference(true);
    },

    hideCheatSheet: function() {
        if (!this.cheatSheetPanel || !this.cheatSheetToggle) {
            return;
        }

        if (this.cheatSheetPanel.classList.contains('hidden')) {
            this.persistCheatSheetPreference(false);
            return;
        }

        this.cheatSheetPanel.classList.add('hidden');
        this.cheatSheetPanel.setAttribute('aria-hidden', 'true');
        this.cheatSheetToggle.setAttribute('aria-checked', 'false');

        if (document.activeElement === this.cheatSheetPanel || (this.cheatSheetPanel.contains(document.activeElement))) {
            this.cheatSheetToggle.focus();
        }

        this.persistCheatSheetPreference(false);
    },

    setupHelpPanels: function() {
        if (this.helpPanelsInitialized) {
            return;
        }

        this.helpPanelContainer = document.querySelector('[data-help-panel-container]');
        this.helpPanelBody = this.helpPanelContainer ? this.helpPanelContainer.querySelector('[data-help-panel-body]') : null;
        this.helpPanelContent = this.helpPanelContainer ? this.helpPanelContainer.querySelector('[data-help-panel-content]') : null;
        this.helpPanelTitle = this.helpPanelContainer ? this.helpPanelContainer.querySelector('[data-help-panel-title]') : null;
        const closeButton = this.helpPanelContainer
            ? this.helpPanelContainer.querySelector('[data-action="close-help-panel"]')
            : null;

        if (!this.helpPanelContainer || !this.helpPanelBody || !this.helpPanelContent || !this.helpPanelTitle || !closeButton) {
            return;
        }

        closeButton.addEventListener('click', () => this.hideHelpPanel());
        closeButton.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.hideHelpPanel();
            }
        });

        this.helpPanelContainer.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.hideHelpPanel();
            }
        });

        this.helpPanelsInitialized = true;
    },

    setHelpPanelBodyClass: function(bodyClass) {
        if (!this.helpPanelBody) {
            return;
        }

        this.helpPanelBody.className = 'cheat-sheet-body';
        if (bodyClass) {
            bodyClass
                .split(' ')
                .filter(Boolean)
                .forEach((cls) => this.helpPanelBody.classList.add(cls));
        }
    },

    renderHelpPanelContent: function(html) {
        if (!this.helpPanelContent) {
            return;
        }

        const safeHtml = window.DOMPurify ? DOMPurify.sanitize(html) : html;
        this.helpPanelContent.innerHTML = safeHtml;
    },

    loadHelpPanelContent: async function(key) {
        const config = this.helpPanelConfigs[key];
        if (!config || !this.helpPanelContent) {
            return;
        }

        this.setHelpPanelBodyClass(config.bodyClass);
        this.renderHelpPanelContent('<p class="help-loading" role="status">Loading…</p>');

        const cached = this.helpPanelCache[key];

        try {
            const response = await fetch(config.partialPath, { cache: 'no-cache' });
            if (!response.ok) {
                throw new Error(`Failed to fetch help panel: ${response.status}`);
            }

            const html = await response.text();
            this.helpPanelCache[key] = html;
            this.renderHelpPanelContent(html);
        } catch (error) {
            if (cached) {
                this.renderHelpPanelContent(cached);
                this.showNotification('Loaded cached help content', 'status', 3000);
            } else {
                this.renderHelpPanelContent(
                    '<p class="help-error" role="alert">Unable to load help content right now. Please try again.</p>',
                );
            }
        }
    },

    showHelpPanel: function(key, options = {}) {
        if (!key) {
            return;
        }

        if (!this.helpPanelsInitialized) {
            this.setupHelpPanels();
        }

        const config = this.helpPanelConfigs[key];
        const panel = this.helpPanelContainer;
        const closeButton = panel ? panel.querySelector('[data-action="close-help-panel"]') : null;
        if (!panel || !config || !this.helpPanelTitle || !closeButton) {
            return;
        }

        if (this.activeHelpPanelKey && this.activeHelpPanelKey !== key) {
            this.hideHelpPanel(this.activeHelpPanelKey, { suppressFocusRestore: true });
        }

        this.helpPanelTitle.textContent = config.title;
        if (config.closeLabel) {
            closeButton.setAttribute('aria-label', config.closeLabel);
        }

        panel.classList.remove('hidden');
        panel.setAttribute('aria-hidden', 'false');
        this.activeHelpPanelKey = key;

        this.loadHelpPanelContent(key);

        if (!options.suppressFocus) {
            requestAnimationFrame(() => {
                if (panel && typeof panel.focus === 'function') {
                    panel.focus({ preventScroll: true });
                }
            });
        }
    },

    hideHelpPanel: function(key, options = {}) {
        const targetKey = key || this.activeHelpPanelKey;
        if (!targetKey) {
            return;
        }

        if (!this.helpPanelsInitialized) {
            this.setupHelpPanels();
        }

        const panel = this.helpPanelContainer;
        if (!panel || panel.classList.contains('hidden')) {
            if (this.activeHelpPanelKey === targetKey) {
                this.activeHelpPanelKey = null;
            }
            return;
        }

        panel.classList.add('hidden');
        panel.setAttribute('aria-hidden', 'true');

        if (this.activeHelpPanelKey === targetKey) {
            this.activeHelpPanelKey = null;
        }

        if (!options.suppressFocusRestore) {
            const helpMenuOption = document.querySelector(`.menu-option[onclick*="${targetKey}"]`);
            if (helpMenuOption && typeof helpMenuOption.focus === 'function') {
                helpMenuOption.focus();
            }
        }
    },

    toggleCheatSheet: function() {
        if (!this.cheatSheetPanel || !this.cheatSheetToggle) {
            this.setupCheatSheet();
        }

        if (!this.cheatSheetPanel || !this.cheatSheetToggle) {
            return;
        }

        if (this.cheatSheetPanel.classList.contains('hidden')) {
            this.showCheatSheet();
        } else {
            this.hideCheatSheet();
        }
    },

    // Update 3D controls state based on current layout
    update3DControlsState: function() {
        const globe3dToggle = document.getElementById('globe3dToggle');
        const globe3dAutoRotate = document.getElementById('globe3dAutoRotate');

        if (!globe3dToggle || !globe3dAutoRotate) return;
        
        const is3DLayout = window.LayoutManager && window.LayoutManager.is3DLayout && 
                          window.LayoutManager.is3DLayout(window.LayoutManager.currentLayout);
        
        // Enable/disable controls based on layout type
        globe3dToggle.disabled = !is3DLayout;
        globe3dAutoRotate.disabled = !is3DLayout;
        
        // If switching to 2D layout, disable 3D effects
        if (!is3DLayout && window.GlobeLayout3D) {
            window.GlobeLayout3D.stopAutoRotation();
            window.GlobeLayout3D.resetVisualEffects();
            globe3dToggle.checked = false;
            globe3dAutoRotate.checked = false;
            window.GlobeLayout3D.setConfig({ depthEffect: false, autoRotate: false });
            
            const globe3dStatus = document.getElementById('globe3dStatus');
            if (globe3dStatus) {
                globe3dStatus.textContent = 'Off';
            }
        }
    },

    // Toggle 3D depth effects (called from menu)
    toggle3DDepthEffects: function() {
        if (!window.GlobeLayout3D) {
            this.showNotification('3D Globe layout not available', 'warning');
            return;
        }

        const currentDepthEffect = window.GlobeLayout3D.config.depthEffect;
        const newDepthEffect = !currentDepthEffect;

        if (newDepthEffect) {
            // Enable 3D effects for any layout
            const layoutName = window.LayoutManager ? window.LayoutManager.currentLayout : 'current';
            window.GlobeLayout3D.setConfig({ depthEffect: true });
            this.showNotification(`3D depth effects enabled for ${layoutName} layout`, 'success', 3000);
            
            // Apply 3D effects to current layout
            if (window.GraphRenderer && window.GraphRenderer.cy) {
                // Ensure 3D Globe layout is properly initialized and active
                window.GlobeLayout3D.init(window.GraphRenderer.cy);
                window.GlobeLayout3D.isActive = true;
                
                // Apply depth effects to any layout
                window.GlobeLayout3D.applyGlobeEffects({
                    depthEffect: true,
                    autoRotate: window.GlobeLayout3D.config.autoRotate
                });
                
                // Force immediate depth effects application
                setTimeout(() => {
                    if (window.GlobeLayout3D && window.GlobeLayout3D.isActive) {
                        window.GlobeLayout3D.applyDepthEffects();
                    }
                }, 100);
            }
        } else {
            this.showNotification('3D depth effects disabled', 'info', 3000);
            // Reset visual effects
            window.GlobeLayout3D.resetVisualEffects();
        }
    },

    // Toggle 3D auto-rotation (called from menu)
    toggle3DAutoRotation: function() {
        if (!window.GlobeLayout3D) {
            this.showNotification('3D Globe layout not available', 'warning');
            return;
        }

        // Check if auto-rotation is currently running
        const isCurrentlyRunning = window.GlobeLayout3D.animationId !== null;

        if (isCurrentlyRunning) {
            // Stop auto-rotation
            window.GlobeLayout3D.stopAutoRotation();
            this.showNotification('3D auto-rotation disabled', 'info', 3000);
        } else {
            // Start auto-rotation for any layout
            const layoutName = window.LayoutManager ? window.LayoutManager.currentLayout : 'current';
            
            // Ensure 3D Globe layout is active and has captured positions
            if (window.GraphRenderer && window.GraphRenderer.cy) {
                if (!window.GlobeLayout3D.isActive) {
                    window.GlobeLayout3D.init(window.GraphRenderer.cy);
                    window.GlobeLayout3D.isActive = true;
                }
                
                // Capture positions if not already done
                if (window.GlobeLayout3D.nodePositions.size === 0) {
                    window.GlobeLayout3D.captureAbsolutePositions();
                }
            }
            
            window.GlobeLayout3D.startAutoRotation();
            this.showNotification(`3D auto-rotation enabled for ${layoutName} layout`, 'success', 3000);
        }
    }
};

// Initialize UI when the page loads
window.addEventListener('load', function() {
    window.UI.init();
    window.UI.addStyles();
});
