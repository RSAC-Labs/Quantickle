/**
 * Graph Area Editor Module
 * 
 * Handles graph-wide styling and appearance settings.
 * Self-contained module with clean external interfaces.
 * 
 * DEPENDENCIES:
 * - Cytoscape instance (passed via constructor)
 * - UI notification system (passed via constructor)
 * 
 * PROVIDES:
 * - showEditor() - opens the graph area editor modal
 * - hideEditor() - closes the editor modal
 * - applySettings(config) - programmatically applies settings
 * - applySettingsDebounced(config) - batches settings updates into a single apply
 * - getSettings() - returns current settings
 * - resetToDefaults() - resets all settings to defaults
 * 
 * FEATURES:
 * - Background styling (color, border)
 * - Node appearance (size, labels, glow effects)
 * - Edge styling (thickness, color, format, arrows)
 * - Dynamic background effects
 * - Settings persistence via localStorage
 */

class GraphAreaEditorModule {
    constructor(dependencies) {
        // Required dependencies injected via constructor
        this.cy = dependencies.cytoscape;
        this.notifications = dependencies.notifications;

        // Internal state
        this.isVisible = false;
        this.modal = null;
        this.modalOverlay = null;
        this.applySettingsFrameId = null;
        this.pendingSettingsSave = null;
        // Configuration
        this.config = {
            modalId: 'graph-area-editor-modal',
            overlayId: 'graph-area-editor-overlay',
            stylesId: 'graph-area-editor-styles'
        };
        
        // Grid configuration
        this.gridSize = 50;
        this.gridSnapHandler = null;
        this.gridSnapAddHandler = null;

        // Default settings
        this.defaultSettings = {
            // Background settings
            backgroundColor: '#2a2a2a',
            backgroundImage: '/assets/backgrounds/network1.png',
            backgroundImageMode: 'fit',

            showBorder: true,
            borderColor: '#666666',
            borderWidth: 1,
            
            // Node settings
            defaultNodeSize: 1.0,
            labelSize: 10,
            labelColor: '#333333',
            nodeGlow: false,
            nodeGlowColor: '#ffffff',
            nodeGlowWidth: 2,
            nodeGlowOpacity: 0.5,
            timeColorNodes: false,
            snapToGrid: false,
            gridSize: 50,

            // Edge settings
            edgeThickness: 1,
            edgeColor: '#cccccc',
            edgeFormat: 'solid',
            edgeShape: 'bezier',
            showArrows: true,
            arrowSize: 6,
            edgeGlow: false,
            edgeGlowColor: '#ffffff',
            edgeGlowWidth: 1,
            edgeGlowOpacity: 0.3,
            
            // Dynamic background
            dynamicBackground: false,
            backgroundDensityColor: '#1a1a1a',
            backgroundDensityOpacity: 0.8
        };
        
        // Current settings (starts as copy of defaults)
        this.settings = { ...this.defaultSettings };
        
        // Initialize the module
        this.init();
    }
    
    /**
     * Initialize the graph area editor module
     */
    init() {
        this.loadSettings();
        this.addStyles();
        this.createEditorUI();
        this.applyAllSettings();
    }
    
    /**
     * PUBLIC INTERFACE: Show the graph area editor
     */
    showEditor() {
        this.isVisible = true;
        
        if (this.modal) {
            this.populateEditor();
            this.modal.style.display = 'block';
            this.modalOverlay.style.display = 'block';
        }
    }
    
    /**
     * PUBLIC INTERFACE: Hide the graph area editor
     */
    hideEditor() {
        if (this.modal) {
            this.modal.style.display = 'none';
            this.modalOverlay.style.display = 'none';
        }
        this.isVisible = false;
    }
    
    /**
     * PUBLIC INTERFACE: Check if editor is currently visible
     */
    isEditorVisible() {
        return this.isVisible;
    }
    
    /**
     * PUBLIC INTERFACE: Get current settings
     */
    getSettings() {
        return { ...this.settings };
    }
    
    /**
     * PUBLIC INTERFACE: Apply settings programmatically
     * @param {Object} newSettings - Settings to apply
     */
    applySettings(newSettings, options = {}) {
        const updatedSettings = { ...this.settings, ...newSettings };
        const hasChanges = Object.keys(updatedSettings).some(
            (key) => this.settings[key] !== updatedSettings[key]
        );

        if (!hasChanges) {
            return;
        }

        this.settings = updatedSettings;
        this.applyAllSettings();
        if (options.save !== false) {
            this.saveSettings();
        }
    }

    /**
     * PUBLIC INTERFACE: Apply settings with a scheduled, batched update pass
     * @param {Object} newSettings - Settings to apply
     */
    applySettingsDebounced(newSettings = {}, options = {}) {
        const updatedSettings = { ...this.settings, ...newSettings };
        const hasChanges = Object.keys(updatedSettings).some(
            (key) => this.settings[key] !== updatedSettings[key]
        );

        if (hasChanges) {
            this.settings = updatedSettings;
            if (options.save !== false) {
                this.pendingSettingsSave = true;
            } else if (this.pendingSettingsSave === null) {
                this.pendingSettingsSave = false;
            }
        }

        if (this.applySettingsFrameId) {
            return;
        }

        const schedule = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
            ? window.requestAnimationFrame
            : (callback) => setTimeout(callback, 50);

        this.applySettingsFrameId = schedule(() => {
            this.applySettingsFrameId = null;
            this.applyAllSettings();

            if (this.pendingSettingsSave) {
                this.saveSettings();
            }
            this.pendingSettingsSave = null;
        });
    }

    /**
     * PUBLIC INTERFACE: Apply settings to a specific set of nodes without refreshing the entire graph
     * @param {Array|Object} targetNodes - Cytoscape collection or array of nodes
     */
    applyIncrementalNodeSettings(targetNodes) {
        if (!this.cy || !targetNodes) return;

        const nodes = Array.isArray(targetNodes)
            ? this.cy.collection(targetNodes)
            : targetNodes;

        if (!nodes || nodes.length === 0) return;

        this.applyNodeSettings(nodes);

        if (this.settings.timeColorNodes && window.LayoutManager && window.LayoutManager.applyTimeColorOverlay) {
            window.LayoutManager.applyTimeColorOverlay(this.cy, nodes);
        }

        if (this.settings.snapToGrid && !this.isTimelineGraph()) {
            this.snapNodesToGrid(nodes);
        }
    }
    
    /**
     * PUBLIC INTERFACE: Reset all settings to defaults
     */
    resetToDefaults() {
        this.settings = { ...this.defaultSettings };
        this.applyAllSettings();
        this.saveSettings();
        if (this.isVisible) {
            this.populateEditor();
        }
        this.notifications.show('Settings reset to defaults', 'info');
    }
    
    // === PRIVATE METHODS BELOW ===
    
    /**
     * Add CSS styles for the editor
     */
    addStyles() {
        if (document.getElementById(this.config.stylesId)) return;
        
        const style = document.createElement('style');
        style.id = this.config.stylesId;
        style.textContent = `
            .graph-area-editor {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 600px;
                max-width: 95vw;
                max-height: 85vh;
                background: white;
                border: 1px solid #ddd;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                z-index: 1000;
                display: none;
                font-family: Arial, sans-serif;
                font-size: 13px;
            }
            
            .graph-area-editor-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                z-index: 999;
                display: none;
            }
            
            .editor-header {
                padding: 15px 20px;
                border-bottom: 1px solid #eee;
                background: #f8f9fa;
                border-radius: 8px 8px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .editor-title {
                margin: 0;
                font-size: 16px;
                font-weight: bold;
                color: #333;
            }
            
            .close-button {
                background: none;
                border: none;
                font-size: 20px;
                cursor: pointer;
                color: #666;
                padding: 0;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .close-button:hover {
                color: #000;
            }
            
            .editor-content {
                padding: 15px;
                max-height: 70vh;
                overflow-y: auto;
            }
            
            .settings-section {
                margin-bottom: 20px;
                border: 1px solid #e0e0e0;
                border-radius: 6px;
                padding: 15px;
            }
            
            .section-title {
                font-size: 14px;
                font-weight: bold;
                color: #333;
                margin-bottom: 12px;
                padding-bottom: 5px;
                border-bottom: 1px solid #e0e0e0;
            }
            
            .setting-row {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 10px;
                min-height: 32px;
            }
            
            .setting-label {
                min-width: 120px;
                font-size: 12px;
                color: #555;
                flex-shrink: 0;
            }
            
            .setting-control {
                flex: 1;
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }
            
            .setting-control input,
            .setting-control select {
                padding: 4px 8px;
                border: 1px solid #ddd;
                border-radius: 3px;
                font-size: 12px;
            }
            
            .setting-control input[type="color"] {
                width: 40px;
                height: 28px;
                padding: 1px;
                border-radius: 3px;
                cursor: pointer;
            }
            
            .setting-control input[type="range"] {
                flex: 1;
                min-width: 100px;
            }
            
            .setting-control input[type="checkbox"] {
                width: 16px;
                height: 16px;
            }

            .checkbox-option {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                color: #444;
            }
            
            .range-value {
                min-width: 40px;
                text-align: center;
                font-size: 11px;
                color: #666;
            }
            
            .editor-buttons {
                padding: 15px 20px;
                border-top: 1px solid #eee;
                display: flex;
                gap: 10px;
                justify-content: flex-end;
            }
            
            .editor-buttons button {
                padding: 8px 16px;
                border: 1px solid #ddd;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            }
            
            .reset-button {
                background: #6c757d;
                color: white;
                border-color: #6c757d;
            }
            
            .reset-button:hover {
                background: #545b62;
            }
            
            .cancel-button {
                background: #f8f9fa;
                color: #333;
            }

            .cancel-button:hover {
                background: #e2e6ea;
            }

            .apply-button {
                background: #007bff;
                color: white;
                border-color: #007bff;
            }

            .apply-button:hover {
                background: #0069d9;
            }
            
            .disabled {
                opacity: 0.5;
                pointer-events: none;
            }

            .file-input-group {
                display: flex;
                align-items: center;
                gap: 8px;
                width: 100%;
            }

            .file-input-group input[type="text"] {
                flex: 1;
                min-width: 0;
            }

            .file-input-button {
                padding: 4px 10px;
                border: 1px solid #cbd5f5;
                border-radius: 6px;
                background: #eef2ff;
                color: #4338ca;
                cursor: pointer;
                font-size: 12px;
                white-space: nowrap;
            }

            .file-input-button:hover {
                background: #e0e7ff;
            }
        `;
        
        document.head.appendChild(style);
    }
    
    /**
     * Create the editor UI elements
     */
    createEditorUI() {
        // Create modal overlay
        this.modalOverlay = document.createElement('div');
        this.modalOverlay.id = this.config.overlayId;
        this.modalOverlay.className = 'graph-area-editor-overlay';
        document.body.appendChild(this.modalOverlay);
        
        // Create modal
        this.modal = document.createElement('div');
        this.modal.id = this.config.modalId;
        this.modal.className = 'graph-area-editor';
        
        this.modal.innerHTML = `
            <div class="editor-header">
                <h3 class="editor-title">Graph Area Editor</h3>
                <button class="close-button">&times;</button>
            </div>
            <div class="editor-content">
                <!-- Background Settings -->
                <div class="settings-section">
                    <div class="section-title">Background</div>
                    <div class="setting-row">
                        <label class="setting-label">Background Color:</label>
                        <div class="setting-control">
                            <input type="color" id="backgroundColor">
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Background Image:</label>
                        <div class="setting-control">
                            <div class="file-input-group">
                                <input type="text" id="backgroundImage" placeholder="Image URL or path">
                                <button type="button" class="file-input-button" id="backgroundImagePicker">Browse…</button>
                            </div>
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Image Display:</label>
                        <div class="setting-control">
                            <select id="backgroundImageMode">
                                <option value="fit">Fill</option>
                                <option value="contain">Fit (no crop)</option>
                                <option value="center">Center</option>
                                <option value="repeat">Repeat</option>
                            </select>
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Show Border:</label>
                        <div class="setting-control">
                            <input type="checkbox" id="showBorder">
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Border Color:</label>
                        <div class="setting-control">
                            <input type="color" id="borderColor">
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Border Width:</label>
                        <div class="setting-control">
                            <input type="range" id="borderWidth" min="0" max="10" step="1">
                            <span class="range-value" id="borderWidth-value">1</span>
                        </div>
                    </div>
                </div>
                
                <!-- Node Settings -->
                <div class="settings-section">
                    <div class="section-title">Nodes</div>
                    <div class="setting-row">
                        <label class="setting-label">Default Size:</label>
                        <div class="setting-control">
                            <input type="range" id="defaultNodeSize" min="0.1" max="5" step="0.1">
                            <span class="range-value" id="defaultNodeSize-value">1.0</span>
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Label Size:</label>
                        <div class="setting-control">
                            <input type="range" id="labelSize" min="0" max="20" step="1">
                            <span class="range-value" id="labelSize-value">10</span>
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Label Color:</label>
                        <div class="setting-control">
                            <input type="color" id="labelColor">
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Node Glow:</label>
                        <div class="setting-control">
                            <input type="checkbox" id="nodeGlow">
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Glow Color:</label>
                        <div class="setting-control">
                            <input type="color" id="nodeGlowColor">
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Glow Width:</label>
                        <div class="setting-control">
                            <input type="range" id="nodeGlowWidth" min="1" max="10" step="1">
                            <span class="range-value" id="nodeGlowWidth-value">2</span>
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Glow Opacity:</label>
                        <div class="setting-control">
                            <input type="range" id="nodeGlowOpacity" min="0" max="1" step="0.1">
                            <span class="range-value" id="nodeGlowOpacity-value">0.5</span>
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Node Toggles:</label>
                        <div class="setting-control">
                            <label class="checkbox-option">
                                <input type="checkbox" id="timeColorNodes">
                                <span>Color by Time</span>
                            </label>
                            <label class="checkbox-option">
                                <input type="checkbox" id="snapToGrid">
                                <span>Snap to Grid</span>
                            </label>
                        </div>
                    </div>
                </div>
                
                <!-- Edge Settings -->
                <div class="settings-section">
                    <div class="section-title">Edges</div>
                    <div class="setting-row">
                        <label class="setting-label">Thickness:</label>
                        <div class="setting-control">
                            <input type="range" id="edgeThickness" min="0.5" max="10" step="0.5">
                            <span class="range-value" id="edgeThickness-value">1</span>
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Color:</label>
                        <div class="setting-control">
                            <input type="color" id="edgeColor">
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Format:</label>
                        <div class="setting-control">
                            <select id="edgeFormat">
                                <option value="solid">Solid</option>
                                <option value="dotted">Dotted</option>
                                <option value="dashed">Dashed</option>
                            </select>
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Shape:</label>
                        <div class="setting-control">
                            <select id="edgeShape">
                                <option value="straight">Straight</option>
                                <option value="bezier">Bezier</option>
                                <option value="unbundled-bezier">Unbundled Bezier</option>
                                <option value="taxi">Taxi</option>
                                <option value="round-taxi">Rounded Taxi</option>
                            </select>
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Show Arrows:</label>
                        <div class="setting-control">
                            <input type="checkbox" id="showArrows">
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Arrow Size:</label>
                        <div class="setting-control">
                            <input type="range" id="arrowSize" min="1" max="20" step="1">
                            <span class="range-value" id="arrowSize-value">6</span>
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Edge Glow:</label>
                        <div class="setting-control">
                            <input type="checkbox" id="edgeGlow">
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Glow Color:</label>
                        <div class="setting-control">
                            <input type="color" id="edgeGlowColor">
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Glow Width:</label>
                        <div class="setting-control">
                            <input type="range" id="edgeGlowWidth" min="1" max="10" step="1">
                            <span class="range-value" id="edgeGlowWidth-value">1</span>
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Glow Opacity:</label>
                        <div class="setting-control">
                            <input type="range" id="edgeGlowOpacity" min="0" max="1" step="0.1">
                            <span class="range-value" id="edgeGlowOpacity-value">0.3</span>
                        </div>
                    </div>
                </div>
                
                <!-- Dynamic Background -->
                <div class="settings-section">
                    <div class="section-title">Dynamic Background</div>
                    <div class="setting-row">
                        <label class="setting-label">Enable:</label>
                        <div class="setting-control">
                            <input type="checkbox" id="dynamicBackground">
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Density Color:</label>
                        <div class="setting-control">
                            <input type="color" id="backgroundDensityColor">
                        </div>
                    </div>
                    <div class="setting-row">
                        <label class="setting-label">Density Opacity:</label>
                        <div class="setting-control">
                            <input type="range" id="backgroundDensityOpacity" min="0" max="1" step="0.1">
                            <span class="range-value" id="backgroundDensityOpacity-value">0.8</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="editor-buttons">
                <button class="reset-button">Reset</button>
                <button class="cancel-button">Cancel</button>
                <button class="apply-button">Apply</button>
            </div>
        `;
        
        document.body.appendChild(this.modal);
        this.setupEventListeners();
    }
    
    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Close on overlay click
        if (this.modalOverlay) {
            this.modalOverlay.addEventListener('click', () => this.hideEditor());
        }

        // Prevent modal clicks from closing
        if (this.modal) {
            this.modal.addEventListener('click', (e) => e.stopPropagation());

            // Button actions
            const closeBtn = this.modal.querySelector('.close-button');
            const cancelBtn = this.modal.querySelector('.cancel-button');
            const applyBtn = this.modal.querySelector('.apply-button');
            const resetBtn = this.modal.querySelector('.reset-button');
            const backgroundPicker = this.modal.querySelector('#backgroundImagePicker');

            [closeBtn, cancelBtn].forEach(btn => {
                if (btn) btn.addEventListener('click', () => this.hideEditor());
            });

            if (applyBtn) {
                applyBtn.addEventListener('click', () => {
                    this.applyChanges();
                    this.hideEditor();
                });
            }

            if (resetBtn) {
                resetBtn.addEventListener('click', () => this.resetToDefaults());
            }

            if (backgroundPicker) {
                backgroundPicker.addEventListener('click', async () => {
                    const input = document.getElementById('backgroundImage');
                    if (!input || !window.QuantickleUtils?.pickImageFilePath) {
                        return;
                    }
                    const path = await window.QuantickleUtils.pickImageFilePath({ workspaceSubdir: 'assets' });
                    if (!path) {
                        return;
                    }
                    input.value = path;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                });
            }
        }

        // Set up range slider value updates
        const rangeInputs = this.modal.querySelectorAll('input[type="range"]');
        rangeInputs.forEach(input => {
            const valueSpan = document.getElementById(input.id + '-value');
            if (valueSpan) {
                input.addEventListener('input', (e) => {
                    valueSpan.textContent = e.target.value;
                });
            }
        });

        // Update checkbox dependencies
        this.setupCheckboxDependencies();
    }
    
    /**
     * Set up checkbox dependencies (enable/disable related controls)
     */
    setupCheckboxDependencies() {
        const dependencies = {
            'showBorder': ['borderColor', 'borderWidth'],
            'nodeGlow': ['nodeGlowColor', 'nodeGlowWidth', 'nodeGlowOpacity'],
            'showArrows': ['arrowSize'],
            'edgeGlow': ['edgeGlowColor', 'edgeGlowWidth', 'edgeGlowOpacity'],
            'dynamicBackground': ['backgroundDensityColor', 'backgroundDensityOpacity']
        };
        
        Object.keys(dependencies).forEach(checkboxId => {
            const checkbox = document.getElementById(checkboxId);
            const dependentIds = dependencies[checkboxId];
            
            if (checkbox) {
                const updateDependents = () => {
                    dependentIds.forEach(depId => {
                        const depElement = document.getElementById(depId);
                        if (depElement) {
                            depElement.disabled = !checkbox.checked;
                            const row = depElement.closest('.setting-row');
                            if (row) {
                                row.classList.toggle('disabled', !checkbox.checked);
                            }
                        }
                    });
                };
                
                checkbox.addEventListener('change', updateDependents);
                // Set initial state
                updateDependents();
            }
        });
    }
    
    /**
     * Populate the editor with current settings
     */
    populateEditor() {
        Object.keys(this.settings).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = this.settings[key];
                } else {
                    element.value = this.settings[key];
                }
                
                // Update range value displays
                if (element.type === 'range') {
                    const valueSpan = document.getElementById(key + '-value');
                    if (valueSpan) {
                        valueSpan.textContent = this.settings[key];
                    }
                }
            }
        });
        
        // Update checkbox dependencies
        this.setupCheckboxDependencies();
    }
    
    /**
     * Apply changes from the editor form
     */
    applyChanges() {
        // Collect all form values
        const newSettings = {};
        
        Object.keys(this.settings).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    newSettings[key] = element.checked;
                } else if (element.type === 'range') {
                    newSettings[key] = parseFloat(element.value);
                } else {
                    newSettings[key] = element.value;
                }
            }
        });
        
        // Apply the new settings
        this.settings = { ...this.settings, ...newSettings };
        this.applyAllSettings();
        this.saveSettings();
        
        this.notifications.show('Graph area settings applied', 'success');
    }

    /**
     * Safely get the Cytoscape container element
     * Ensures global UI elements are never affected by graph-wide styles
     */
    getContainer() {
        const cyContainer = this.cy && typeof this.cy.container === 'function'
            ? this.cy.container()
            : null;
        if (cyContainer && cyContainer.id === 'cy') {
            return cyContainer;
        }
        return document.getElementById('cy');
    }

    /**
     * Apply all current settings to the graph
     */
    applyAllSettings() {
        if (!this.cy) return;

        const graphManager = window.GraphManager;
        const shouldPauseHistory = graphManager
            && typeof graphManager.pauseHistory === 'function'
            && typeof graphManager.resumeHistory === 'function'
            && !graphManager.historyPaused;

        if (shouldPauseHistory) {
            graphManager.pauseHistory();
        }

        try {
        this.gridSize = this.settings.gridSize || this.gridSize || 50;
        this.updateGridSnapping();

        const containers = this.getSelectedContainers();
        if (containers.length > 0) {
            containers.forEach(container => {
                const childNodes = container.children();
                const internalEdges = childNodes.connectedEdges().filter(e =>
                    childNodes.contains(e.source()) && childNodes.contains(e.target())
                );
                this.applyNodeSettings(childNodes);
                this.applyEdgeSettings(internalEdges);

                if (this.settings.timeColorNodes && window.LayoutManager && window.LayoutManager.applyTimeColorOverlay) {
                    window.LayoutManager.applyTimeColorOverlay(this.cy, childNodes);
                } else if (window.LayoutManager && window.LayoutManager.clearTimeColorOverlay) {
                    window.LayoutManager.clearTimeColorOverlay(this.cy, childNodes);
                }

                if (this.settings.snapToGrid && !this.isTimelineGraph()) {
                    const nodesToSnap = childNodes.union(container);
                    this.snapNodesToGrid(nodesToSnap);
                }

                container.data('graphSettings', { ...this.settings });
            });
            return;
        }

        this.applyBackgroundSettings();
        this.applyNodeSettings();
        this.applyEdgeSettings();

        if (this.settings.timeColorNodes && window.LayoutManager && window.LayoutManager.applyTimeColorOverlay) {
            window.LayoutManager.applyTimeColorOverlay(this.cy);
        } else if (window.LayoutManager && window.LayoutManager.clearTimeColorOverlay) {
            window.LayoutManager.clearTimeColorOverlay(this.cy);
        }

        if (this.settings.snapToGrid && !this.isTimelineGraph()) {
            this.snapNodesToGrid();
        }

        // Reapply dynamic node styling such as label placement
        if (window.LayoutManager && typeof window.LayoutManager.calculateOptimalSizing === 'function' && typeof window.LayoutManager.updateNodeStyles === 'function') {
            const sizing = window.LayoutManager.calculateOptimalSizing(this.cy);
            window.LayoutManager.updateNodeStyles(this.cy, sizing);
        }
        } finally {
            if (shouldPauseHistory) {
                graphManager.resumeHistory();
                if (typeof graphManager.saveState === 'function') {
                    graphManager.saveState();
                }
            }
        }
    }
    
    /**
     * Apply background-related settings
     */
    applyBackgroundSettings() {
        const container = this.getContainer();
        if (!container) return;

        container.style.backgroundColor = this.settings.backgroundColor;

        const imageValue = typeof this.settings.backgroundImage === 'string'
            ? this.settings.backgroundImage.trim()
            : '';
        if (imageValue) {
            this.applyBackgroundImage(container, imageValue);
        } else {
            this.clearBackgroundImage(container);
        }

        this.applyBorder();
        this.applyDynamicBackground();
    }

    clearBackgroundImage(container) {
        if (!container) {
            return;
        }
        container.style.backgroundImage = 'none';
        container.style.backgroundSize = '';
        container.style.backgroundPosition = '';
        container.style.backgroundRepeat = '';
    }

    buildBackgroundImage(url) {
        if (typeof url !== 'string') {
            return null;
        }

        const trimmed = url.trim();
        if (!trimmed) {
            return null;
        }

        if (trimmed === 'none' || /^url\(/i.test(trimmed)) {
            return trimmed;
        }

        const escaped = trimmed.replace(/"/g, '\\"');
        return `url("${escaped}")`;
    }

    async resolveBackgroundImageSource(value) {
        if (typeof value !== 'string') {
            return null;
        }

        const trimmed = value.trim();
        if (!trimmed || trimmed === 'none') {
            return null;
        }

        const urlMatch = trimmed.match(/^url\((['"]?)(.+?)\1\)$/i);
        const rawValue = urlMatch ? urlMatch[2] : trimmed;
        if (!rawValue) {
            return null;
        }

        if (/^(data:|blob:)/i.test(rawValue)) {
            return rawValue;
        }

        const looksLikePath = /^(https?:|file:)/i.test(rawValue) ||
            rawValue.startsWith('/') ||
            rawValue.startsWith('./') ||
            rawValue.startsWith('../') ||
            /\.(png|jpe?g|gif|svg)$/i.test(rawValue);

        if (looksLikePath && window.WorkspaceManager && window.WorkspaceManager.handle) {
            const workspaceCandidates = [rawValue];
            if (rawValue.startsWith('/')) {
                workspaceCandidates.push(rawValue.replace(/^\/+/, ''));
            }
            for (const candidate of workspaceCandidates) {
                try {
                    console.debug('Workspace background image read attempt', candidate);
                    const file = await window.WorkspaceManager.readFile(candidate);
                    console.debug(
                        'Workspace background image read result',
                        candidate,
                        file instanceof File ? 'File' : 'null'
                    );
                    if (file && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
                        return URL.createObjectURL(file);
                    }
                    if (file) {
                        return candidate;
                    }
                } catch (error) {
                    console.debug('Workspace background image read failed', candidate, error);
                }
            }
        }

        if (looksLikePath && window.DomainLoader && typeof window.DomainLoader.resolveIcon === 'function') {
            console.debug('Background image resolved value before DomainLoader fallback', rawValue);
            try {
                const resolved = await window.DomainLoader.resolveIcon(rawValue);
                if (resolved) {
                    return resolved;
                }
            } catch (error) {
                console.warn('Failed to resolve background image via DomainLoader, using original value', error);
            }
        }

        return rawValue;
    }

    applyBackgroundImage(container, imageValue) {
        if (!container) {
            return;
        }

        if (!this._backgroundImageRequestId) {
            this._backgroundImageRequestId = 0;
        }
        const requestId = ++this._backgroundImageRequestId;

        const applyResolved = (resolved) => {
            if (requestId !== this._backgroundImageRequestId) {
                return;
            }

            const built = this.buildBackgroundImage(resolved);
            if (!built || built === 'none') {
                this.clearBackgroundImage(container);
                return;
            }
            container.style.backgroundImage = built;
            this.applyBackgroundImageMode(container);
        };

        Promise.resolve(this.resolveBackgroundImageSource(imageValue))
            .then(applyResolved)
            .catch(error => {
                console.warn('Failed to resolve background image', error);
                applyResolved(null);
            });
    }

    /**
     * Apply background image sizing/alignment rules
     * @param {HTMLElement} container
     */
    applyBackgroundImageMode(container) {
        const mode = this.settings.backgroundImageMode || 'fit';

        if (!container) return;

        switch (mode) {
            case 'center':
                container.style.backgroundSize = 'auto';
                container.style.backgroundPosition = 'center';
                container.style.backgroundRepeat = 'no-repeat';
                break;
            case 'repeat':
                container.style.backgroundSize = 'auto';
                container.style.backgroundPosition = 'top left';
                container.style.backgroundRepeat = 'repeat';
                break;
            case 'contain':
                // Preserve the full image without cropping while avoiding tiling
                container.style.backgroundSize = 'contain';
                container.style.backgroundPosition = 'center';
                container.style.backgroundRepeat = 'no-repeat';
                break;
            case 'fit':
            default:
                // Fill the container while maintaining aspect ratio (may crop)
                container.style.backgroundSize = 'cover';
                container.style.backgroundPosition = 'center';
                container.style.backgroundRepeat = 'no-repeat';
                break;
        }
    }

    /**
     * Apply border settings to Cytoscape container
     */
    applyBorder() {
        const container = this.getContainer();
        if (!container) return;

        if (this.settings.showBorder) {
            container.style.border = `${this.settings.borderWidth}px solid ${this.settings.borderColor}`;
        } else {
            container.style.border = 'none';
        }
    }

    /**
     * Apply dynamic background overlay
     */
    applyDynamicBackground() {
        const container = this.getContainer();
        if (!container) return;

        const existingBg = container.querySelector('.dynamic-background');
        if (existingBg) {
            existingBg.remove();
        }

        if (!this.settings.dynamicBackground) return;

        const dynamicBg = document.createElement('div');
        dynamicBg.className = 'dynamic-background';
        dynamicBg.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 0;
            background: radial-gradient(circle at center, transparent 30%, ${this.settings.backgroundDensityColor} 70%);
            opacity: ${this.settings.backgroundDensityOpacity};
        `;

        container.insertBefore(dynamicBg, container.firstChild);
    }
    
    /**
     * Apply node-related settings
     */
    applyNodeSettings(targetNodes) {
        const nodes = targetNodes || this.cy.nodes();
        nodes.forEach(node => {
            const type = node.data('type');
            if (type === 'text' || (type && type.startsWith('timeline-'))) return;
            const baseSizeRaw = Number(node.data('size'));
            const baseSize = Number.isFinite(baseSizeRaw) ? baseSizeRaw : 30;
            const sizeLocked = Boolean(node.data('sizeLocked'));
            const size = sizeLocked ? baseSize : baseSize * this.settings.defaultNodeSize;
            const style = {
                width: size,
                height: size,
                'font-size': this.settings.labelSize + 'px',
                color: this.settings.labelColor,
                'text-opacity': this.settings.labelSize > 0 ? 1 : 0,
                'outline-width': 0
            };

            if (this.settings.nodeGlow) {
                style['outline-width'] = this.settings.nodeGlowWidth;
                style['outline-color'] = this.settings.nodeGlowColor;
                style['outline-opacity'] = this.settings.nodeGlowOpacity;
            }

            node.style(style);
        });

        if (!targetNodes) {
            this.cy.style().update();
        }
    }
    
    /**
     * Apply edge-related settings
     */
    applyEdgeSettings(targetEdges) {
        if (!this.cy) return;

        const edges = targetEdges || this.cy.edges();
        const graphManager = window.GraphManager;
        const shouldPauseHistory = graphManager
            && typeof graphManager.pauseHistory === 'function'
            && typeof graphManager.resumeHistory === 'function'
            && !graphManager.historyPaused;

        if (shouldPauseHistory) {
            graphManager.pauseHistory();
        }

        try {
            this.cy.batch(() => {
                edges.forEach(edge => {
                    const type = edge.data('type');
                    if (type && type.startsWith('timeline-')) return;
                    const customOverrides = edge.data('customStyleOverrides') || {};
                    const shouldOverride = (prop) => !customOverrides[prop];
                    let dataChanged = false;
                    const setDataIfDifferent = (key, value) => {
                        if (edge.data(key) !== value) {
                            edge.data(key, value);
                            dataChanged = true;
                        }
                    };

                    if (shouldOverride('width')) {
                        setDataIfDifferent('width', this.settings.edgeThickness);
                    }
                    if (shouldOverride('color')) {
                        setDataIfDifferent('color', this.settings.edgeColor);
                    }
                    if (shouldOverride('lineStyle')) {
                        setDataIfDifferent('lineStyle', this.settings.edgeFormat);
                    }
                    const shape = this.settings.edgeShape;
                    if (shouldOverride('curveStyle')) {
                        setDataIfDifferent('curveStyle', shape);
                    }
                    if (shouldOverride('showArrows')) {
                        setDataIfDifferent('showArrows', this.settings.showArrows);
                    }
                    if (shouldOverride('arrowSize')) {
                        setDataIfDifferent('arrowSize', this.settings.arrowSize);
                    }

                    const width = edge.data('width') || this.settings.edgeThickness;
                    const color = edge.data('color') || this.settings.edgeColor;
                    const lineStyle = edge.data('lineStyle') || this.settings.edgeFormat;
                    const curveStyle = edge.data('curveStyle') || shape || 'bezier';
                    const showArrows = edge.data('showArrows');
                    const arrowSize = edge.data('arrowSize') || this.settings.arrowSize;

                    const style = {
                        'width': width,
                        'line-color': color,
                        'line-style': lineStyle,
                        'curve-style': curveStyle,
                        'target-arrow-shape': showArrows ? 'triangle' : 'none',
                        'target-arrow-color': color,
                        'arrow-scale': (arrowSize || this.settings.arrowSize) / 6,
                        'underlay-opacity': 0
                    };

                    if (this.settings.edgeGlow) {
                        style['underlay-opacity'] = this.settings.edgeGlowOpacity;
                        style['underlay-color'] = this.settings.edgeGlowColor;
                        style['underlay-padding'] = this.settings.edgeGlowWidth;
                    }

                    const styleChanged = Object.entries(style).some(([prop, value]) => {
                        const currentValue = edge.style(prop);
                        return currentValue !== value && String(currentValue) !== String(value);
                    });

                    if (dataChanged || styleChanged) {
                        edge.style(style);
                    }
                });
            });
        } finally {
            if (shouldPauseHistory) {
                graphManager.resumeHistory();
                if (typeof graphManager.saveState === 'function') {
                    graphManager.saveState();
                }
            }
        }

        if (!targetEdges) {
            this.cy.style().update();
        }
    }

    updateGridSnapping() {
        if (!this.cy) return;

        const shouldEnableSnap = this.settings.snapToGrid && !this.isTimelineGraph();

        if (shouldEnableSnap) {
            if (!this.gridSnapHandler) {
                this.gridSnapHandler = (evt) => {
                    if (!this.settings.snapToGrid || this.isTimelineGraph()) return;
                    this.snapNodeToGrid(evt.target);
                };
                this.cy.on('free dragfree', 'node', this.gridSnapHandler);
            }

            if (!this.gridSnapAddHandler) {
                this.gridSnapAddHandler = (evt) => {
                    if (!this.settings.snapToGrid || this.isTimelineGraph()) return;
                    this.snapNodeToGrid(evt.target);
                };
                this.cy.on('add', 'node', this.gridSnapAddHandler);
            }
        } else {
            if (this.gridSnapHandler) {
                this.cy.off('free dragfree', 'node', this.gridSnapHandler);
                this.gridSnapHandler = null;
            }

            if (this.gridSnapAddHandler) {
                this.cy.off('add', 'node', this.gridSnapAddHandler);
                this.gridSnapAddHandler = null;
            }
        }
    }

    snapNodesToGrid(nodes) {
        if (!this.cy || !this.settings.snapToGrid || this.isTimelineGraph()) return;

        const collection = nodes && typeof nodes.forEach === 'function'
            ? nodes
            : this.cy.nodes();

        if (!collection || collection.length === 0) return;

        this.cy.batch(() => {
            collection.forEach(node => this.snapNodeToGrid(node));
        });
    }

    snapNodeToGrid(node) {
        if (!node || !node.position || typeof node.position !== 'function') return;
        if (this.isTimelineGraph()) return;
        if (typeof node.locked === 'function' && node.locked()) return;
        if (typeof node.grabbed === 'function' && node.grabbed()) return;
        if (!this.shouldSnapNode(node)) return;

        const pos = node.position();
        if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;

        const dimensions = this.getNodeDimensions(node);
        if (!dimensions) {
            return;
        }

        const { width, height } = dimensions;

        const halfWidth = width / 2;
        const halfHeight = height / 2;

        const currentLeft = pos.x - halfWidth;
        const currentTop = pos.y - halfHeight;

        const gridSize = this.settings.gridSize || this.gridSize || 50;

        const snappedLeft = Math.round(currentLeft / gridSize) * gridSize;
        const snappedTop = Math.round(currentTop / gridSize) * gridSize;

        const newX = snappedLeft + halfWidth;
        const newY = snappedTop + halfHeight;

        if (Math.abs(newX - pos.x) < 0.1 && Math.abs(newY - pos.y) < 0.1) {
            return;
        }

        node.position({ x: newX, y: newY });
    }

    getNodeDimensions(node) {
        if (!node) return null;

        const widthFn = typeof node.width === 'function' ? node.width : null;
        const heightFn = typeof node.height === 'function' ? node.height : null;

        let width = widthFn ? Number(widthFn.call(node)) : NaN;
        let height = heightFn ? Number(heightFn.call(node)) : NaN;

        const needsWidth = !Number.isFinite(width) || width <= 0;
        const needsHeight = !Number.isFinite(height) || height <= 0;

        if (needsWidth || needsHeight) {
            const bb = typeof node.boundingBox === 'function'
                ? node.boundingBox({ includeLabels: false, includeOverlays: false })
                : null;
            if (bb) {
                if (needsWidth && Number.isFinite(bb.w) && bb.w > 0) {
                    width = bb.w;
                }
                if (needsHeight && Number.isFinite(bb.h) && bb.h > 0) {
                    height = bb.h;
                }
            }
        }

        if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
            return null;
        }

        return { width, height };
    }

    shouldSnapNode(node) {
        if (!node) return false;
        if (typeof node.removed === 'function' && node.removed()) return false;

        const type = typeof node.data === 'function' ? node.data('type') : null;
        if (type === 'text') return false;
        if (type && typeof type === 'string' && type.startsWith('timeline-')) return false;

        return true;
    }

    hasTimelineElements() {
        if (!this.cy) return false;

        let hasTimelineNodes = false;
        if (typeof this.cy.nodes === 'function') {
            try {
                const timelineNodes = this.cy.nodes('[type^="timeline-"]');
                if (timelineNodes && timelineNodes.length > 0) {
                    return true;
                }
            } catch (selectorError) {
                // Fallback to manual iteration when selector syntax isn't supported
                this.cy.nodes().forEach(node => {
                    if (hasTimelineNodes) return;
                    const type = typeof node.data === 'function' ? node.data('type') : null;
                    if (type && typeof type === 'string' && type.startsWith('timeline-')) {
                        hasTimelineNodes = true;
                    }
                });
                if (hasTimelineNodes) {
                    return true;
                }
            }
        }

        if (typeof this.cy.edges === 'function') {
            try {
                const timelineEdges = this.cy.edges('[type="timeline-link"]');
                if (timelineEdges && timelineEdges.length > 0) {
                    return true;
                }
            } catch (edgeSelectorError) {
                let hasTimelineEdges = false;
                this.cy.edges().forEach(edge => {
                    if (hasTimelineEdges) return;
                    const type = typeof edge.data === 'function' ? edge.data('type') : null;
                    if (type === 'timeline-link') {
                        hasTimelineEdges = true;
                    }
                });
                if (hasTimelineEdges) {
                    return true;
                }
            }
        }

        return false;
    }

    isTimelineGraph() {
        if (!this.cy) return false;

        if (window.LayoutManager && window.LayoutManager.currentLayout === 'timeline') {
            return true;
        }

        const hasTimelineElements = this.hasTimelineElements();

        if (typeof this.cy.scratch === 'function') {
            const timelineApplied = this.cy.scratch('_timelineLayoutApplied');
            if (timelineApplied === true) {
                if (hasTimelineElements) {
                    return true;
                }

                if (typeof this.cy.removeScratch === 'function') {
                    this.cy.removeScratch('_timelineLayoutApplied');
                } else {
                    this.cy.scratch('_timelineLayoutApplied', false);
                }
            }
        }

        if (hasTimelineElements) {
            return true;
        }

        return false;
    }

    hexToRgba(hex, alpha) {
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }
        const bigint = parseInt(hex, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    getSelectedContainers() {
        let containers = this.cy
            .nodes()
            .filter(n => n.selected() && this.isContainer(n));
        const selectedNodes = this.cy
            .nodes(':selected')
            .filter(n => !this.isContainer(n));
        const parentContainers = selectedNodes
            .parents()
            .filter(n => this.isContainer(n));
        if (parentContainers.length > 0) {
            containers = containers.union(parentContainers);
        }
        return containers;
    }

    /**
     * Determine if a Cytoscape node is a container
     * Supports legacy graphs lacking the container class
     */
    isContainer(node) {
        return !!(
            node && (
                (typeof node.hasClass === 'function' && node.hasClass('container')) ||
                (typeof node.data === 'function' &&
                    (node.data('type') === 'container' || node.data('isContainer')))
            )
        );

    }

    
    /**
     * Load settings from localStorage
     */
    loadSettings() {
        try {
            const saved = localStorage.getItem('quantickle_graph_area_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                const { backgroundColor, backgroundImage, ...rest } = parsed;
                this.settings = { ...this.settings, ...rest };
            }
        } catch (e) {
        }
    }
    
    /**
     * Save settings to localStorage
     */
    saveSettings() {
        try {
            localStorage.setItem('quantickle_graph_area_settings', JSON.stringify(this.settings));
        } catch (e) {
        }
    }
    
    /**
     * Cleanup method for module destruction
     */
    destroy() {
        if (this.cy) {
            if (this.gridSnapHandler) {
                this.cy.off('free dragfree', 'node', this.gridSnapHandler);
                this.gridSnapHandler = null;
            }

            if (this.gridSnapAddHandler) {
                this.cy.off('add', 'node', this.gridSnapAddHandler);
                this.gridSnapAddHandler = null;
            }
        }

        // Remove DOM elements
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }
        
        if (this.modalOverlay) {
            this.modalOverlay.remove();
            this.modalOverlay = null;
        }
        
        // Remove styles
        const styles = document.getElementById(this.config.stylesId);
        if (styles) {
            styles.remove();
        }
        
        // Clear references
        this.cy = null;
        this.notifications = null;
    }
}

// Export for use
window.GraphAreaEditorModule = GraphAreaEditorModule;
