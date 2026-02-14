/**
 * Graph Styling Module
 * 
 * Provides comprehensive visual styling, effects, and appearance management for graphs.
 * Self-contained module with clean external interfaces.
 * 
 * DEPENDENCIES:
 * - Cytoscape instance (passed via constructor)
 * - UI notification system (passed via constructor)
 * 
 * PROVIDES:
 * - getDefaultStyles() - returns performance-optimized default styles
 * - applyGlowEffect() - applies glow effects to nodes
 * - removeGlowEffect() - removes glow effects from nodes
 * - toggleGlowEffect() - toggles glow effect state
 * - updateNodeStyle() - updates individual node styling
 * - updateEdgeStyle() - updates individual edge styling
 * - applyTheme() - applies predefined visual themes
 * - refreshAllStyles() - refreshes all visual styles
 * - getStylePresets() - returns available style presets
 * - exportStyles() - exports current styling configuration
 * - importStyles() - imports styling configuration
 * 
 * FEATURES:
 * - Performance-optimized default styles
 * - Dynamic glow effects with customization
 * - Theme system with presets
 * - Individual element styling
 * - Style import/export
 * - Animation and transition support
 * - Visual effect management
 * - Color and size management
 */

class GraphStylingModule {
    constructor(dependencies) {
        // Required dependencies injected via constructor
        this.cy = dependencies.cytoscape;
        this.notifications = dependencies.notifications;
        this.supportsShadowStyles = typeof dependencies.supportsShadowStyles === 'boolean'
            ? dependencies.supportsShadowStyles
            : ((typeof window !== 'undefined'
                && window.GraphRenderer
                && typeof window.GraphRenderer.supportsShadowStyles === 'boolean'
                    ? window.GraphRenderer.supportsShadowStyles
                    : true));
        
        // Styling state
        this.glowEnabled = false;
        this.currentTheme = 'default';
        this.customStyles = new Map();
        this.animationsEnabled = true;
        
        // Configuration (must be set before generating styles)
        this.config = {
            // Glow effect settings
            glowIntensity: 15,
            glowColor: '#ffffff',
            glowSpread: 3,
            
            // Animation settings
            animationDuration: 300,
            transitionEasing: 'ease-in-out',
            
            // Performance settings
            enableTextEvents: false,
            optimizeForLargeDatasets: true,
            
            // Visual settings
            defaultNodeColor: window.QuantickleConfig?.defaultNodeColor || '#ffffff',
            defaultEdgeColor: '#cccccc',
            selectionColor: '#ff0000',
            defaultNodeSize: 20,
            defaultEdgeWidth: 1
        };
        
        // Default style configurations (after config is set)
        this.defaultStyles = this.generateDefaultStyles();
        this.themes = this.generateThemes();
        this.stylePresets = this.generateStylePresets();
        
        this.init();
    }
    
    /**
     * Initialize the graph styling module
     */
    init() {

        if (!this.cy) {
            return;
        }

        // Apply default styles
        this.applyDefaultStyles();

        // Ensure newly added container nodes immediately show their border
        this._ensureContainerBorder = (evt) => {
            if (evt.target.hasClass('export-temp-container')) {
                return;
            }

            evt.target.style({
                'border-width': 1,
                'border-color': '#000000'
            });
        };
        this.cy.on('add', 'node.container', this._ensureContainerBorder);
    }
    
    /**
     * PUBLIC INTERFACE: Get performance-optimized default styles
     */
    getDefaultStyles() {
        return this.defaultStyles;
    }
    
    /**
     * PUBLIC INTERFACE: Apply glow effect to nodes
     */
    applyGlowEffect(options = {}) {
        if (!this.cy) {
            return false;
        }
        
        const timelineFilter = '[type^="timeline"]';
        const glowOptions = {
            intensity: options.intensity || this.config.glowIntensity,
            color: options.color || this.config.glowColor,
            spread: options.spread || this.config.glowSpread,
            nodes: options.nodes
                ? options.nodes.not(timelineFilter)
                : this.cy.nodes().not(timelineFilter)
        };
        
        let appliedCount = 0;
        
        glowOptions.nodes.forEach(node => {
            const color = node.data('color') || this.config.defaultNodeColor;
            const size = node.data('size') || this.config.defaultNodeSize;
            
            // Apply glow styling
            const styleUpdate = {
                'border-width': glowOptions.spread,
                'border-color': glowOptions.color,
                'border-opacity': 0.8,
                'background-color': color,
                'width': size,
                'height': size,
                'z-index': 10
            };

            if (this.supportsShadowStyles) {
                Object.assign(styleUpdate, {
                    'shadow-blur': glowOptions.intensity,
                    'shadow-color': glowOptions.color,
                    'shadow-opacity': 0.8,
                    'shadow-offset-x': 0,
                    'shadow-offset-y': 0
                });
            }

            node.style(styleUpdate);
            
            appliedCount++;
        });
        
        this.glowEnabled = true;
        
        if (this.notifications && this.notifications.show) {
            this.notifications.show(`Glow effect applied to ${appliedCount} nodes`, 'info');
        }
        
        return true;
    }
    
    /**
     * PUBLIC INTERFACE: Remove glow effect from nodes
     */
    removeGlowEffect(nodes = null) {
        if (!this.cy) {
            return false;
        }
        
        const timelineFilter = '[type^="timeline"]';
        const targetNodes = (nodes || this.cy.nodes()).not(timelineFilter);
        let removedCount = 0;

        targetNodes.forEach(node => {
            const color = node.data('color') || this.config.defaultNodeColor;
            const size = node.data('size') || this.config.defaultNodeSize;

            // Restore original styling and preserve container borders
            const isContainer = node.hasClass('container');
            const styleUpdate = {
                'border-width': isContainer ? 1 : 0,
                'border-color': '#000000',
                'border-opacity': 1,
                'background-color': color,
                'width': size,
                'height': size,
                'z-index': 1
            };

            if (this.supportsShadowStyles) {
                Object.assign(styleUpdate, {
                    'shadow-blur': 0,
                    'shadow-color': '#000000',
                    'shadow-opacity': 0,
                    'shadow-offset-x': 0,
                    'shadow-offset-y': 0
                });
            }

            node.style(styleUpdate);
            
            removedCount++;
        });
        
        this.glowEnabled = false;
        
        if (this.notifications && this.notifications.show) {
            this.notifications.show(`Glow effect removed from ${removedCount} nodes`, 'info');
        }
        
        return true;
    }
    
    /**
     * PUBLIC INTERFACE: Toggle glow effect
     */
    toggleGlowEffect(options = {}) {
        if (this.glowEnabled) {
            return this.removeGlowEffect(options.nodes);
        } else {
            return this.applyGlowEffect(options);
        }
    }
    
    /**
     * PUBLIC INTERFACE: Update individual node styling
     */
    updateNodeStyle(nodeId, styleOptions) {
        if (!this.cy) {
            return false;
        }
        
        const node = this.cy.getElementById(nodeId);
        if (
            node.length === 0 ||
            (node.data('type') && node.data('type').startsWith('timeline'))
        ) {
            return false;
        }
        
        const currentStyle = this.getNodeCurrentStyle(node);
        const newStyle = { ...currentStyle, ...styleOptions };
        
        // Apply style with animation if enabled
        if (this.animationsEnabled) {
            node.animate({
                style: newStyle,
                duration: this.config.animationDuration,
                easing: this.config.transitionEasing
            });
        } else {
            node.style(newStyle);
        }
        
        // Store custom style
        this.customStyles.set(nodeId, newStyle);
        return true;
    }
    
    /**
     * PUBLIC INTERFACE: Update individual edge styling
     */
    updateEdgeStyle(edgeId, styleOptions) {
        if (!this.cy) {
            return false;
        }
        
        const edge = this.cy.getElementById(edgeId);
        if (edge.length === 0) {
            return false;
        }
        
        const currentStyle = this.getEdgeCurrentStyle(edge);
        const newStyle = { ...currentStyle, ...styleOptions };
        
        // Apply style with animation if enabled
        if (this.animationsEnabled) {
            edge.animate({
                style: newStyle,
                duration: this.config.animationDuration,
                easing: this.config.transitionEasing
            });
        } else {
            edge.style(newStyle);
        }
        
        // Store custom style
        this.customStyles.set(edgeId, newStyle);
        return true;
    }
    
    /**
     * PUBLIC INTERFACE: Apply predefined theme
     */
    applyTheme(themeName, options = {}) {
        if (!this.cy) {
            return false;
        }

        if (!this.themes[themeName]) {
            return false;
        }

        return this._applyThemeWithLayeredStyles(themeName, options);
    }
    
    /**
     * PUBLIC INTERFACE: Refresh all styles
     */
    refreshAllStyles() {
        if (!this.cy) {
            return false;
        }
        
        // Force style update
        this.cy.style().update();
        
        // Reapply custom styles
        this.customStyles.forEach((style, elementId) => {
            const element = this.cy.getElementById(elementId);
            if (element.length > 0) {
                element.style(style);
            }
        });
        
        // Reapply glow effect if enabled
        if (this.glowEnabled) {
            this.applyGlowEffect();
        }
        return true;
    }
    
    /**
     * PUBLIC INTERFACE: Get available style presets
     */
    getStylePresets() {
        return this.stylePresets;
    }
    
    /**
     * PUBLIC INTERFACE: Export current styling configuration
     */
    exportStyles() {
        const config = {
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            theme: this.currentTheme,
            glowEnabled: this.glowEnabled,
            animationsEnabled: this.animationsEnabled,
            config: { ...this.config },
            customStyles: Object.fromEntries(this.customStyles),
            cytoscapeStyles: this.cy ? this.cy.style().json() : null
        };
        return config;
    }
    
    /**
     * PUBLIC INTERFACE: Import styling configuration
     */
    importStyles(styleConfig) {
        if (!styleConfig || typeof styleConfig !== 'object') {
            return false;
        }
        
        try {
            
            // Import configuration
            if (styleConfig.config) {
                Object.assign(this.config, styleConfig.config);
            }
            
            // Import custom styles
            if (styleConfig.customStyles) {
                this.customStyles = new Map(Object.entries(styleConfig.customStyles));
            }
            
            // Apply theme if specified
            if (styleConfig.theme && this.themes[styleConfig.theme]) {
                this.applyTheme(styleConfig.theme);
            }
            
            // Apply glow effect if enabled
            if (styleConfig.glowEnabled) {
                this.applyGlowEffect();
            }
            
            // Set animation state
            if (typeof styleConfig.animationsEnabled === 'boolean') {
                this.animationsEnabled = styleConfig.animationsEnabled;
            }
            
            // Apply Cytoscape styles if available
            if (styleConfig.cytoscapeStyles && this.cy) {
                this.cy.style(styleConfig.cytoscapeStyles).update();
            }
            
            if (this.notifications && this.notifications.show) {
                this.notifications.show('Style configuration imported', 'info');
            }
            
            return true;
        } catch (error) {
            console.error('[GraphStyling] Error importing styles:', error);
            return false;
        }
    }
    
    /**
     * PUBLIC INTERFACE: Set animation state
     */
    setAnimationsEnabled(enabled) {
        this.animationsEnabled = !!enabled;
        return this.animationsEnabled;
    }
    
    /**
     * PUBLIC INTERFACE: Get comprehensive styling report
     */
    getStyleReport() {
        const report = {
            timestamp: new Date().toISOString(),
            currentTheme: this.currentTheme,
            glowEnabled: this.glowEnabled,
            animationsEnabled: this.animationsEnabled,
            customStylesCount: this.customStyles.size,
            availableThemes: Object.keys(this.themes),
            availablePresets: Object.keys(this.stylePresets),
            config: { ...this.config }
        };
        
        if (this.cy) {
            report.elementCount = {
                nodes: this.cy.nodes().length,
                edges: this.cy.edges().length
            };
        }
        
        return report;
    }
    
    // === PRIVATE METHODS BELOW ===
    
    /**
     * Apply default styles to Cytoscape
     */
    applyDefaultStyles() {
        if (!this.cy) return;
        this.cy.style(this.defaultStyles).update();

        // Ensure container nodes always have a visible border
        this.cy.nodes('.container').forEach(node => {
            if (node.hasClass('export-temp-container')) {
                return;
            }

            node.style({
                'border-width': 1,
                'border-color': '#000000'
            });
        });
    }
    
    /**
     * Generate performance-optimized default styles
     */
    generateDefaultStyles() {
        const resolveBackgroundFit = (value, fallback = 'contain') => {
            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (trimmed) {
                    return trimmed;
                }
            }
            return fallback;
        };
        const resolveBackgroundPosition = (value, fallback = '50%') => {
            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (trimmed) {
                    return trimmed;
                }
            }
            return fallback;
        };

        const baseNodeStyle = {
            'background-color': ele => ele.data('color') || this.config.defaultNodeColor || '#ffffff',
            'background-image': 'none',
            'background-fit': ele => resolveBackgroundFit(ele.data('backgroundFit'), 'contain'),
            'background-repeat': 'no-repeat',
            'background-position-x': ele => resolveBackgroundPosition(ele.data('backgroundPositionX'), '50%'),
            'background-position-y': ele => resolveBackgroundPosition(ele.data('backgroundPositionY'), '50%'),
            'background-width': ele => ele.data('backgroundWidth') || 'auto',
            'background-height': ele => ele.data('backgroundHeight') || 'auto',
            'background-opacity': 1.0,
            'width': ele => ele.data('size') || 30,
            'height': ele => ele.data('size') || 30,
            'shape': 'ellipse',
            'border-width': 0,
            'border-color': '#000000',
            'label': ele => ele.data('label') || '',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': ele => ele.data('size') || 80,
            'font-size': 10,
            'color': '#ffffff',
            'text-outline-width': 0,
            'text-outline-color': 'transparent',
            'text-events': this.config.enableTextEvents ? 'yes' : 'no',
            'events': 'yes'
        };

        if (this.supportsShadowStyles) {
            Object.assign(baseNodeStyle, {
                'shadow-blur': 0,
                'shadow-color': '#000000',
                'shadow-opacity': 0,
                'shadow-offset-x': 0,
                'shadow-offset-y': 0
            });
        }

        return [
            {
                selector: 'node',
                style: baseNodeStyle
            },
            {
                selector: 'node[backgroundImage]',
                style: {
                    'background-image': 'data(backgroundImage)'
                }
            },
            {
                selector: 'node[shape]',
                style: {
                    'shape': 'data(shape)'
                }
            },
            {
                selector: 'node.container',
                style: {
                    'border-width': 1,
                    'border-color': '#000000'
                }
            },
            {
                selector: 'node.container[width][height]',
                style: {
                    'shape': 'round-rectangle',
                    'background-color': ele => ele.data('color') || '#2e4a62',
                    'background-opacity': 0.2,
                    'border-width': 1,
                    'border-color': '#000000',
                    'width': 'data(width)',
                    'height': 'data(height)',
                    'label': 'data(label)',
                    'text-valign': 'top',
                    'text-halign': 'center',
                    'text-margin-y': 10
                }
            },
            {
                selector: 'node.export-temp-container',
                style: {
                    'background-opacity': 0,
                    'border-width': 0,
                    'text-opacity': 0,
                    'events': 'no'
                }
            },
            {
                selector: 'node[type="text"]',
                style: {
                    'shape': 'round-rectangle',
                    'background-opacity': 0,
                    'border-width': 0,
                    'label': '',
                    'opacity': 0
                }
            },
            {
                selector: 'node[type="text"][width]',
                style: {
                    'width': 'data(width)'
                }
            },
            {
                selector: 'node[type="text"][height]',
                style: {
                    'height': 'data(height)'
                }
            },
            {
                selector: 'node[type="image"]',
                style: {
                    'shape': 'round-rectangle',
                    'background-color': ele => ele.data('backgroundColor') || ele.data('color') || '#ffffff',
                    'background-opacity': 1,
                    'border-width': ele => ele.data('borderWidth') || 1,
                    'border-color': ele => ele.data('borderColor') || '#d1d5db',
                    'text-valign': 'bottom',
                    'text-halign': 'center',
                    'text-wrap': 'wrap',
                    'text-max-width': ele => {
                        const textWidth = ele.data('imageTextWidth');
                        if (Number.isFinite(textWidth)) {
                            return textWidth;
                        }
                        const width = ele.data('width');
                        return Number.isFinite(width) ? Math.max(40, width - 20) : 160;
                    },
                    'color': ele => ele.data('legendColor') || ele.data('labelColor') || '#111827',
                    'font-size': ele => ele.data('legendFontSize') || 13,
                    'font-family': ele => ele.data('legendFontFamily') || 'Inter, "Segoe UI", sans-serif',
                    'text-margin-y': ele => {
                        const margin = ele.data('legendMarginY');
                        return Number.isFinite(margin) ? margin : 10;
                    },
                    'text-background-color': ele => ele.data('legendBackgroundColor') || '#ffffff',
                    'text-background-opacity': ele => {
                        const opacity = ele.data('legendBackgroundOpacity');
                        return typeof opacity === 'number' ? Math.max(0, Math.min(1, opacity)) : 0.85;
                    },
                    'text-background-padding': ele => {
                        const padding = ele.data('legendBackgroundPadding');
                        if (Number.isFinite(padding) && padding > 0) {
                            return padding;
                        }
                        const fallback = ele.data('legendFontSize');
                        return Math.max(4, Math.round((fallback || 13) * 0.35));
                    },
                    'text-background-shape': 'roundrectangle',
                    'text-outline-width': 0,
                    'background-fit': ele => resolveBackgroundFit(ele.data('backgroundFit'), 'contain'),
                    'background-position-x': ele => resolveBackgroundPosition(ele.data('backgroundPositionX'), '50%'),
                    'background-position-y': ele => resolveBackgroundPosition(ele.data('backgroundPositionY'), '50%')
                }
            },
            {
                selector: 'node[type="image"][width]',
                style: {
                    'width': 'data(width)'
                }
            },
            {
                selector: 'node[type="image"][height]',
                style: {
                    'height': 'data(height)'
                }
            },
            {
                selector: 'node[type="image"][imageBackgroundHeight]',
                style: {
                    'background-height': ele => ele.data('imageBackgroundHeight') || '100%',
                    'background-width': '100%'
                }
            },
            {
                selector: '[type="timeline-bar"]',
                style: {
                    'shape': 'rectangle',
                    'background-color': ele => ele.data('color') || this.config.defaultNodeColor || '#ffffff',
                    'width': 'data(barLength)',
                    'height': 'data(size)',
                    'label': '',
                    'border-width': 0,
                    'z-index': -1
                }
            },
            {
                selector: '[type="timeline-tick"]',
                style: {
                    'shape': 'rectangle',
                    'width': 2,
                    'height': 8,
                    'background-color': '#666',
                    'label': 'data(label)',
                    'font-size': 10,
                    'color': '#666',
                    'text-halign': 'center',
                    'text-valign': 'bottom',
                    'text-margin-y': 2,
                    'z-index': 1
                }
            },
            {
                selector: '[type="timeline-anchor"]',
                style: {
                    'width': 0,
                    'height': 0,
                    'label': '',
                    'background-opacity': 0,
                    'border-width': 0,
                    'opacity': 0
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': ele => ele.data('width') || this.config.defaultEdgeWidth || 1,
                    'line-color': ele => ele.data('color') || this.config.defaultEdgeColor,
                    'target-arrow-color': ele => ele.data('color') || this.config.defaultEdgeColor,
                    'target-arrow-shape': ele => {
                        const show = ele.data('showArrows');
                        return show === false ? 'none' : 'triangle';
                    },
                    'curve-style': ele => ele.data('curveStyle') || 'bezier',
                    'line-style': ele => ele.data('lineStyle') || 'solid',
                    'arrow-scale': ele => {
                        const size = ele.data('arrowSize');
                        return size ? size / 6 : 1;
                    },
                    'opacity': 0.9,
                    'events': 'yes'
                }
            },
            {
                selector: 'edge[type="timeline-link"]',
                style: {
                    'width': 1,
                    'line-color': ele => ele.data('color') || '#666',
                    'opacity': 1,
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'straight',
                    'z-index': 1
                }
            },
            {
                selector: 'node:selected',
                style: {
                    'border-width': 4,
                    'border-color': this.config.selectionColor,
                    'border-opacity': 1,
                    'background-color': ele => ele.data('color') || this.config.defaultNodeColor || '#ffffff'
                }
            },
            {
                selector: 'edge:selected',
                style: {
                    'width': 2,
                    'line-color': this.config.selectionColor,
                    'target-arrow-color': this.config.selectionColor
                }
            },
            {
                selector: 'node[pinned]',
                style: {
                    'border-width': 6,
                    'border-color': '#1e90ff',
                    'border-opacity': 1
                }
            },
            {
                selector: 'node:selected[pinned]',
                style: {
                    'border-width': 6,
                    'border-color': this.config.selectionColor,
                    'border-opacity': 1
                }
            },
            {
                selector: 'node:grabbed',
                style: {
                    'z-index': 1000,
                    'opacity': 0.8
                }
            }
        ];
    }
    
    /**
     * Generate predefined themes
     */
    generateThemes() {
        return {
            default: {
                name: 'Default',
                description: 'Standard performance-optimized theme',
                styles: this.generateDefaultStyles(),
                config: {
                    defaultNodeColor: this.config.defaultNodeColor,
                    defaultEdgeColor: '#cccccc',
                    selectionColor: '#ff0000'
                }
            },
            
            dark: {
                name: 'Dark',
                description: 'Dark theme with high contrast',
                styles: [
                    {
                        selector: 'node',
                        style: {
                            'background-color': ele => ele.data('color') || '#444444',
                            'width': 'data(size)',
                            'height': 'data(size)',
                            'border-width': 0,
                            'border-color': '#ffffff',
                            'label': 'data(label)',
                            'color': '#ffffff',
                            'text-outline-width': 1,
                            'text-outline-color': '#000000'
                        }
                    },
                    {
                        selector: 'edge',
                        style: {
                            'line-color': '#888888',
                            'target-arrow-color': '#888888',
                            'opacity': 0.7
                        }
                    }
                ],
                config: {
                    defaultNodeColor: '#444444',
                    defaultEdgeColor: '#888888',
                    selectionColor: '#ff6b6b'
                }
            },
            
            vibrant: {
                name: 'Vibrant',
                description: 'Colorful theme with enhanced visuals',
                styles: [
                    {
                        selector: 'node',
                        style: {
                            'background-color': ele => ele.data('color') || '#4ecdc4',
                            'width': 'data(size)',
                            'height': 'data(size)',
                            'border-width': 0,
                            'border-color': '#ffffff',
                            'label': 'data(label)',
                            'color': '#000000',
                            'text-outline-width': 2,
                            'text-outline-color': '#ffffff'
                        }
                    },
                    {
                        selector: 'edge',
                        style: {
                            'line-color': '#ff6b6b',
                            'target-arrow-color': '#ff6b6b',
                            'width': 2,
                            'opacity': 0.8
                        }
                    }
                ],
                config: {
                    defaultNodeColor: '#4ecdc4',
                    defaultEdgeColor: '#ff6b6b',
                    selectionColor: '#45b7d1'
                }
            },
            
            pastel: {
                name: 'Pastel',
                description: 'Soft gentle colors for easy viewing',
                styles: [
                    {
                        selector: 'node',
                        style: {
                            'background-color': ele => ele.data('color') || '#fad5e4',
                            'width': 'data(size)',
                            'height': 'data(size)',
                            'border-width': 0,
                            'border-color': '#d4d4d4',
                            'label': 'data(label)',
                            'color': '#666666',
                            'text-outline-width': 1,
                            'text-outline-color': '#ffffff'
                        }
                    },
                    {
                        selector: 'edge',
                        style: {
                            'line-color': '#d4d4d4',
                            'target-arrow-color': '#d4d4d4',
                            'width': 1,
                            'opacity': 0.6
                        }
                    }
                ],
                config: {
                    defaultNodeColor: '#fad5e4',
                    defaultEdgeColor: '#d4d4d4',
                    selectionColor: '#fd79a8'
                }
            }
        };
    }
    
    /**
     * INTERNAL: Apply a theme using layered style merging
     */
    _applyThemeWithLayeredStyles(themeName, options = {}) {
        if (!this.cy) {
            return false;
        }

        const theme = this.themes[themeName];
        if (!theme) {
            return false;
        }
        
        try {
            const shouldAnimate = !!(options && options.animate && this.animationsEnabled);
            const animationDuration = shouldAnimate ? this.config.animationDuration : 0;
            const animationEasing = this.config.transitionEasing;

            const applyElementStyle = (element, style) => {
                if (!element || !style) {
                    return;
                }

                if (shouldAnimate && typeof element.animate === 'function') {
                    element.animate({
                        style,
                        duration: animationDuration,
                        easing: animationEasing
                    });
                } else if (typeof element.style === 'function') {
                    element.style(style);
                }
            };

            // Apply theme styles layered on top of the defaults
            if (theme.styles && Array.isArray(theme.styles)) {
                const cloneStyleEntry = (entry) => {
                    const cloned = { ...entry };
                    if (entry.style) {
                        cloned.style = { ...entry.style };
                    }
                    if (entry.css) {
                        cloned.css = { ...entry.css };
                    }
                    return cloned;
                };

                const mergedStyles = this.defaultStyles.map(cloneStyleEntry);

                theme.styles.forEach(themeEntry => {
                    if (!themeEntry || !themeEntry.selector) {
                        return;
                    }

                    const clonedEntry = cloneStyleEntry(themeEntry);
                    const existingEntry = mergedStyles.find(entry => entry.selector === clonedEntry.selector);

                    const mergeIntoExisting = (target, source) => {
                        if (source.style) {
                            target.style = { ...(target.style || {}), ...source.style };
                        }
                        if (source.css) {
                            target.css = { ...(target.css || {}), ...source.css };
                        }

                        Object.keys(source).forEach(key => {
                            if (key !== 'selector' && key !== 'style' && key !== 'css') {
                                target[key] = source[key];
                            }
                        });
                    };

                    if (existingEntry) {
                        mergeIntoExisting(existingEntry, clonedEntry);
                    } else {
                        mergedStyles.push(clonedEntry);
                    }
                });

                const timelineSelector = 'edge[type="timeline-link"]';
                let timelineEntry = mergedStyles.find(entry => entry.selector === timelineSelector);

                if (!timelineEntry) {
                    const defaultTimelineEntry = this.defaultStyles.find(entry => entry.selector === timelineSelector);
                    if (defaultTimelineEntry) {
                        timelineEntry = cloneStyleEntry(defaultTimelineEntry);
                        mergedStyles.push(timelineEntry);
                    }
                }

                if (timelineEntry) {
                    const styleObject = timelineEntry.style || timelineEntry.css || {};
                    styleObject['curve-style'] = 'straight';
                    styleObject['z-index'] = 1;

                    if (timelineEntry.style) {
                        timelineEntry.style = { ...timelineEntry.style, ...styleObject };
                    } else if (timelineEntry.css) {
                        timelineEntry.css = { ...timelineEntry.css, ...styleObject };
                    } else {
                        timelineEntry.style = { ...styleObject };
                    }
                }

                const applyMergedStyles = () => this.cy.style(mergedStyles);

                if (shouldAnimate && typeof this.cy.startBatch === 'function' && typeof this.cy.endBatch === 'function') {
                    this.cy.startBatch();
                    applyMergedStyles();
                    this.cy.endBatch();
                } else {
                    applyMergedStyles();
                }
            } else {
                this.cy.style(this.defaultStyles);
            }
            
            // Update configuration
            if (theme.config) {
                Object.assign(this.config, theme.config);
            }
            
            // Update current theme
            this.currentTheme = themeName;
            
            // FORCE VISUAL UPDATE: Apply theme colors directly to nodes and edges
            if (theme.config) {
                const isTimelineEdge = edge => {
                    const type = edge.data('type');
                    return typeof type === 'string' && type.startsWith('timeline-');
                };

                // Update all nodes with theme colors
                this.cy.nodes().forEach(node => {
                    const isContainer = node.hasClass('container');
                    applyElementStyle(node, {
                        'border-color': isContainer ? '#000000' : (theme.config.selectionColor || '#ff0000'),
                        'border-width': isContainer ? 1 : (themeName === 'vibrant' ? 1 : 0),
                        'color': themeName === 'dark' ? '#ffffff' :
                               themeName === 'pastel' ? '#666666' : '#ffffff',
                        'text-outline-color': themeName === 'dark' ? '#000000' :
                                            themeName === 'pastel' ? '#ffffff' : 'transparent',
                        'text-outline-width': themeName === 'dark' ? 1 :
                                            themeName === 'pastel' ? 1 : 0
                    });
                });

            // Update all edges with theme colors
                const timelineEdges = [];
                this.cy.edges().forEach(edge => {
                    if (isTimelineEdge(edge)) {
                        timelineEdges.push(edge);
                        return;
                    }
                    applyElementStyle(edge, {
                        'line-color': theme.config.defaultEdgeColor || '#cccccc',
                        'target-arrow-color': theme.config.defaultEdgeColor || '#cccccc',
                        'width': themeName === 'vibrant' ? 2 : 1,
                        'opacity': themeName === 'pastel' ? 0.6 :
                                 themeName === 'vibrant' ? 0.8 : 0.9
                    });
                });

                timelineEdges.forEach(edge => {
                    const timelineColor = edge.data('color') || '#666';
                    applyElementStyle(edge, {
                        'line-color': timelineColor,
                        'target-arrow-color': timelineColor,
                        'line-opacity': 1,
                        'opacity': 1
                    });
                });
            }

            // Force Cytoscape to re-render
            this.cy.style().update();
            
            if (this.notifications && this.notifications.show) {
                this.notifications.show(`Applied ${theme.name} theme`, 'success');
            }
            
            return true;
            
        } catch (error) {
            console.error(`[GraphStyling] Error applying theme '${themeName}':`, error);
            return false;
        }
    }
    
    /**
     * PUBLIC INTERFACE: Get available themes
     */
    getAvailableThemes() {
        return Object.keys(this.themes).map(key => ({
            id: key,
            name: this.themes[key].name,
            description: this.themes[key].description
        }));
    }
    
    /**
     * PUBLIC INTERFACE: Get current theme
     */
    getCurrentTheme() {
        return this.currentTheme;
    }
    
    /**
     * Generate style presets
     */
    generateStylePresets() {
        return {
            minimal: {
                name: 'Minimal',
                description: 'Clean, minimal styling',
                nodeStyle: {
                    'border-width': 0,
                    'background-color': '#f8f9fa',
                    'color': '#333333'
                },
                edgeStyle: {
                    'width': 1,
                    'line-color': '#dee2e6',
                    'opacity': 0.6
                }
            },
            
            bold: {
                name: 'Bold',
                description: 'Strong, prominent styling',
                nodeStyle: {
                    'border-width': 3,
                    'border-color': '#000000',
                    'font-size': 12,
                    'text-outline-width': 1
                },
                edgeStyle: {
                    'width': 3,
                    'opacity': 1
                }
            },
            
            subtle: {
                name: 'Subtle',
                description: 'Soft, understated styling',
                nodeStyle: {
                    'opacity': 0.8,
                    'border-width': 0,
                    'font-size': 8
                },
                edgeStyle: {
                    'width': 0.5,
                    'opacity': 0.4
                }
            }
        };
    }
    
    /**
     * Get current style of a node
     */
    getNodeCurrentStyle(node) {
        return {
            'background-color': node.style('background-color'),
            'width': node.style('width'),
            'height': node.style('height'),
            'border-width': node.style('border-width'),
            'border-color': node.style('border-color'),
            'opacity': node.style('opacity'),
            'color': node.style('color'),
            'font-size': node.style('font-size')
        };
    }
    
    /**
     * Get current style of an edge
     */
    getEdgeCurrentStyle(edge) {
        return {
            'width': edge.style('width'),
            'line-color': edge.style('line-color'),
            'target-arrow-color': edge.style('target-arrow-color'),
            'opacity': edge.style('opacity'),
            'line-style': edge.style('line-style')
        };
    }
    
    /**
     * Cleanup method for module destruction
     */
    destroy() {

        // Clear custom styles
        this.customStyles.clear();

        // Remove event listeners
        if (this.cy && this._ensureContainerBorder) {
            this.cy.off('add', 'node.container', this._ensureContainerBorder);
            this._ensureContainerBorder = null;
        }

        // Clear references
        this.cy = null;
        this.notifications = null;
    }
}

// Minimal bootstrap helpers for global usage
const exposeGraphStylingGlobals = (instance) => {
    if (!instance) {
        return [];
    }

    const globals = {
        // Glow effects
        applyGlow: (options) => instance.applyGlowEffect(options),
        removeGlow: (nodes) => instance.removeGlowEffect(nodes),
        toggleGlow: (options) => instance.toggleGlowEffect(options),

        // Individual styling
        styleNode: (nodeId, style) => instance.updateNodeStyle(nodeId, style),
        styleEdge: (edgeId, style) => instance.updateEdgeStyle(edgeId, style),

        // Theme management
        applyTheme: (theme, options) => instance.applyTheme(theme, options),
        getThemes: () => Object.keys(instance.themes || {}),

        // Style management
        refreshStyles: () => instance.refreshAllStyles(),
        getStylePresets: () => instance.getStylePresets(),
        styleReport: () => instance.getStyleReport(),

        // Import/Export
        exportStyles: () => instance.exportStyles(),
        importStyles: (config) => instance.importStyles(config),

        // Animation control
        enableAnimations: () => instance.setAnimationsEnabled(true),
        disableAnimations: () => instance.setAnimationsEnabled(false),

        // Comprehensive styling analysis
        analyzeStyles: () => ({
            report: instance.getStyleReport(),
            presets: instance.getStylePresets()
        })
    };

    Object.keys(globals).forEach(name => {
        window[name] = globals[name];
    });

    return Object.keys(globals);
};

const initGraphStylingModule = (dependencies) => {
    const instance = new GraphStylingModule(dependencies);
    window.GraphStyling = instance;
    instance.exposedGlobals = exposeGraphStylingGlobals(instance);
    return instance;
};

// Export for use
window.GraphStylingModule = GraphStylingModule;
window.initGraphStylingModule = initGraphStylingModule;
window.exposeGraphStylingGlobals = exposeGraphStylingGlobals;
