// Configuration file for Quantickle
// Contains layout options, extension settings, and other configuration data

// Global configuration
window.QuantickleConfig = {
    // Default settings
    defaultNodeSize: 30,
    defaultNodeColor: '#ccccff',
    defaultNodeShape: 'round-rectangle',
    maxNodes: 15000,

    // Logging controls
    debugSelectionLogging: false,
    
    // Performance settings
    renderTimeout: 100,
    animationDuration: 500,
    
    // Layout configurations
    layoutOptions: {
        'grid': {
            name: 'grid',
            fit: true,
            animate: true,
            animationDuration: 500,
            padding: 50,
            nodeDimensionsIncludeLabels: true
        },
        'circle': {
            name: 'circle',
            fit: true,
            animate: true,
            animationDuration: 500,
            radius: 200,
            startAngle: 0,
            sweep: 360,
            clockwise: true,
            nodeDimensionsIncludeLabels: true
        },
        'breadthfirst': {
            name: 'breadthfirst',
            fit: true,
            animate: true,
            animationDuration: 500,
            directed: false,
            padding: 50,
            spacingFactor: 1.5,
            nodeDimensionsIncludeLabels: true
        },
        'concentric': {
            name: 'concentric',
            fit: true,
            animate: true,
            animationDuration: 500,
            nodeDimensionsIncludeLabels: true,
            padding: 50
        },
        'cose': {
            name: 'cose',
            fit: true,
            animate: true,
            animationDuration: 2000,
            randomize: false,
            nodeDimensionsIncludeLabels: true,
            refresh: 20,
            tilingPaddingVertical: 10,
            tilingPaddingHorizontal: 10,
            initialTemp: 100,
            coolingFactor: 0.98,
            minTemp: 1.0,
            nodeRepulsion: 6000,
            nodeOverlap: 10,
            idealEdgeLength: 100,
            edgeElasticity: 0.45,
            nestingFactor: 0.1,
            gravity: 50,
            numIter: 500,
            tile: true,
            initialEnergyOnIncremental: 0.3
        },
        'random': {
            name: 'random',
            fit: true,
            animate: true,
            animationDuration: 500,
            padding: 50,
            nodeDimensionsIncludeLabels: true
        },
        'preset': {
            name: 'preset',
            fit: true,
            animate: true,
            animationDuration: 500,
            padding: 50
        }
    },
    
    // Extension-based layout configurations
    extensionLayouts: {
        'cola': {
            name: 'cola',
            fit: true,
            animate: true,
            animationDuration: 1000,
            refresh: 10,
            maxSimulationTime: 1500,
            nodeDimensionsIncludeLabels: true,
            randomize: false,
            avoidOverlap: true,
            handleDisconnected: true,
            nodeSpacing: 50,
            edgeLength: 200,
            edgeSymDiffLength: 0.2,
            edgeJaccardLength: 0.2,
            nestingFactor: 0.1,
            gravity: 5,
            scaling: 1.1,
            padding: 50
        },
        'dagre': {
            name: 'dagre',
            fit: true,
            animate: true,
            animationDuration: 500,
            nodeDimensionsIncludeLabels: true,
            rankDir: 'TB',
            rankSep: 50,
            nodeSep: 20,
            edgeSep: 10,
            ranker: 'network-simplex',
            padding: 50
        },
        'klay': {
            name: 'klay',
            nodeDimensionsIncludeLabels: false,
            fit: true,
            padding: 20,
            animate: false,
            animationDuration: 500,
            klay: {
                addUnnecessaryBendpoints: false,
                aspectRatio: 1.6,
                borderSpacing: 20,
                crossingMinimization: 'LAYER_SWEEP',
                cycleBreaking: 'GREEDY',
                direction: 'DOWN',
                edgeRouting: 'ORTHOGONAL',
                edgeSpacingFactor: 0.5,
                feedbackEdges: false,
                fixedAlignment: 'NONE',
                inLayerSpacingFactor: 1.0,
                layoutHierarchy: false,
                linearSegmentsDeflectionDampening: 0.3,
                mergeEdges: false,
                mergeHierarchyCrossingEdges: true,
                nodeLayering: 'NETWORK_SIMPLEX',
                nodePlacement: 'BRANDES_KOEPF',
                randomizationSeed: 1,
                routeSelfLoopInside: false,
                separateConnectedComponents: true,
                spacing: 20,
                thoroughness: 7
            }
        },
        'euler': {
            name: 'euler',
            fit: true,
            animate: true,
            animationDuration: 1000,
            refresh: 10,
            maxSimulationTime: 1500,
            nodeDimensionsIncludeLabels: true,
            randomize: false,
            avoidOverlap: true,
            handleDisconnected: true,
            nodeSpacing: 50,
            edgeLength: 200,
            edgeSymDiffLength: 0.2,
            edgeJaccardLength: 0.2,
            nestingFactor: 0.1,
            gravity: 5,
            scaling: 1.1,
            padding: 50,
            // Euler-specific parameters
            springLength: 200,
            springCoeff: 0.0008,
            drag: 0.2,
            mass: 4
        },
        'cose-bilkent': {
            name: 'cose-bilkent',
            fit: true,
            animate: true,
            animationDuration: 2000,
            randomize: false,
            nodeDimensionsIncludeLabels: true,
            refresh: 20,
            tilingPaddingVertical: 20,
            tilingPaddingHorizontal: 20,
            initialTemp: 100,
            coolingFactor: 0.98,
            minTemp: 1.0,
            nodeRepulsion: 8000, // Increased repulsion for better separation
            nodeOverlap: 20, // Increased overlap prevention
            idealEdgeLength: 150, // Longer ideal edge length
            edgeElasticity: 0.45,
            nestingFactor: 0.1,
            gravity: 30, // Reduced gravity to allow more spread
            numIter: 600, // More iterations for better convergence
            tile: true,
            initialEnergyOnIncremental: 0.3,
            nodeRepulsionRange: 2.0, // Extended repulsion range
            gravityRange: 2.0 // Extended gravity range
        },
        
        // Custom layouts
        'spiral': {
            name: 'spiral',
            fit: true,
            animate: true,
            animationDuration: 500,
            spacing: 50
        },
        'hexagonal': {
            name: 'hexagonal',
            fit: true,
            animate: true,
            animationDuration: 500,
            size: 60
        },
        'circle-packing': {
            name: 'circle-packing',
            fit: true,
            animate: true,
            animationDuration: 500
        },
        'weighted-force': {
            name: 'weighted-force',
            fit: true,
            animate: true,
            animationDuration: 500,
            iterations: 100,
            temperature: 100,
            coolingFactor: 0.95
        },
        'radial-recency': {
            name: 'radial-recency',
            fit: true,
            animate: true,
            animationDuration: 500,
            ringThickness: 140,
            minSeparation: 80,
            angleJitter: 0,
            angleStrategy: 'grouped',
            innerRadius: 90
        },
        'timeline-scatter': {
            name: 'timeline-scatter',
            fit: true,
            animate: true,
            animationDuration: 500,
            xScale: null,
            yScale: 60,
            jitter: 4
        },
        'temporal-attraction': {
            name: 'temporal-attraction',
            fit: true,
            animate: true,
            animationDuration: 500,
            iterations: 50,
            timeMode: 'gaussian',
            timeSigma: 24 * 60 * 60 * 1000, // 1 day in ms
            bucketSize: 60 * 60 * 1000, // 1 hour in ms
            repulsionStrength: 15,
            baseAttraction: 0.002
        },
        'bulbous': {
            name: 'bulbous',
            fit: true,
            animate: true,
            animationDuration: 500,
            maxNodeSize: 40,
            minNodeSize: 5,
            nodeSpacing: 20
        }
    },
    
    // Node appearance settings
    nodeAppearanceSettings: {},
    
    // 3D Plotting Space Configuration
    plottingSpace: {
        // Fixed 3D space dimensions (in pixels)
        width: 1000,      // X-axis width (matches absolute layout)
        height: 1000,     // Y-axis height (matches absolute layout)
        depth: 1000,      // Z-axis depth (matches absolute layout)
        
        // Origin point (center of the 3D space)
        origin: {
            x: 500,       // width / 2
            y: 500,       // height / 2
            z: 500        // depth / 2
        },
        
        // Margin from edges (percentage of space)
        margin: 0.1,      // 10% margin
        
        // Default rotation center (same as origin)
        rotationCenter: {
            x: 500,
            y: 500,
            z: 500
        },
        
        // Coordinate system type
        type: 'cartesian', // 'cartesian' or 'spherical'
        
        // Enable automatic scaling to fit this space
        autoScale: true,
        
        // Preserve aspect ratio when scaling
        preserveAspectRatio: true
    },
    
    // Available extensions tracking
    availableExtensions: {
        cola: false,
        dagre: false,
        klay: false,
        euler: false,
        coseBilkent: false
    },
    
    // Validation settings
    validation: {
        enabled: false, // Temporarily disable validation to fix loading issues
        lenientMode: true, // Use lenient validation for CSV imports
        maxErrorsToShow: 10, // Limit number of validation errors shown
        skipValidationForCSV: true // Option to completely skip validation for CSV
    },
    
    // Node size settings
    nodeSizeSettings: {
        preserveRelativeSizes: true, // Preserve relative sizes from CSV data
        allowSizeOverride: false, // Prevent automatic size normalization
        minSize: 1, // Minimum allowed node size
        maxSize: 200 // Maximum allowed node size
    },
    
    // Graph area settings management
    graphAreaSettings: {
        // Create default graph area settings
        createDefault: function() {
            const parentConfig = window.QuantickleConfig;
            return {
                plottingSpace: {
                    width: parentConfig.plottingSpace.width,
                    height: parentConfig.plottingSpace.height,
                    depth: parentConfig.plottingSpace.depth,
                    origin: { ...parentConfig.plottingSpace.origin },
                    margin: parentConfig.plottingSpace.margin,
                    rotationCenter: { ...parentConfig.plottingSpace.rotationCenter },
                    type: parentConfig.plottingSpace.type,
                    autoScale: parentConfig.plottingSpace.autoScale,
                    preserveAspectRatio: parentConfig.plottingSpace.preserveAspectRatio
                },
                viewport: {
                    zoom: 1.0,
                    pan: { x: 0, y: 0 },
                    minZoom: 0.1,
                    maxZoom: 10
                },
                rendering: {
                    preferWebGL: true,
                    depthEffects: true,
                    autoRotate: false,
                    rotationSpeed: 0.001
                },
                background: {
                    backgroundColor: '#2a2a2a',
                    backgroundImage: '/assets/backgrounds/network1.png'

                },
                labels: {
                    labelSize: 10,
                    labelColor: '#333333',
                    defaultNodeSize: 1.0
                },
                preferredLayout: 'cose',
                saved: false // Track if these are saved settings or defaults
            };
        },
        
        // Merge local settings with global defaults
        mergeWithDefaults: function(localSettings) {
            const defaultSettings = this.createDefault();
            if (!localSettings) return defaultSettings;
            
            const localBackground = localSettings.background;
            const mergedBackground = (() => {
                if (localBackground) {
                    const combined = { ...defaultSettings.background, ...localBackground };

                    const backgroundImageProvided = Object.prototype.hasOwnProperty.call(
                        localBackground,
                        'backgroundImage'
                    );

                    if (!backgroundImageProvided) {
                        combined.backgroundImage = null;
                    } else if (combined.backgroundImage === '' || combined.backgroundImage === undefined) {
                        combined.backgroundImage = null;
                    }

                    return combined;
                }
                return { ...defaultSettings.background };
            })();

            return {
                plottingSpace: { ...defaultSettings.plottingSpace, ...localSettings.plottingSpace },
                viewport: { ...defaultSettings.viewport, ...localSettings.viewport },
                rendering: { ...defaultSettings.rendering, ...localSettings.rendering },
                background: mergedBackground,
                labels: { ...defaultSettings.labels, ...localSettings.labels },
                preferredLayout: localSettings.preferredLayout || defaultSettings.preferredLayout,
                saved: true
            };
        },
        
        // Extract current graph area settings from active components
        extractCurrentSettings: function() {
            const settings = this.createDefault();
            
            // Extract viewport settings from Cytoscape if available
            if (window.GraphRenderer && window.GraphRenderer.cy) {
                const cy = window.GraphRenderer.cy;
                settings.viewport.zoom = cy.zoom();
                settings.viewport.pan = cy.pan();
            }
            
            // Extract plotting space from DataManager if available
            if (window.DataManager && window.DataManager.plottingSpace) {
                settings.plottingSpace = { ...window.DataManager.plottingSpace };
                
                // Include transformation parameters if available (critical for 3D absolute layouts)
                if (window.DataManager.lastTransformationParams) {
                    settings.plottingSpace.transformationParams = { ...window.DataManager.lastTransformationParams };
                }
            }
            
            // Extract rendering settings from current state
            if (window.GraphRenderer) {
                settings.rendering.preferWebGL = window.GraphRenderer.isWebGLEnabled;
            }
            
            // Extract 3D settings
            if (window.GlobeLayout3D && window.GlobeLayout3D.isActive) {
                settings.rendering.depthEffects = window.GlobeLayout3D.config.depthEffect;
                settings.rendering.autoRotate = window.GlobeLayout3D.config.autoRotate;
                settings.rendering.rotationSpeed = window.GlobeLayout3D.config.rotationSpeed;
            }
            
            // Extract background settings from GraphAreaEditor
            if (window.GraphAreaEditor && window.GraphAreaEditor.getSettings) {
                const gaSettings = window.GraphAreaEditor.getSettings();
                settings.background.backgroundColor = gaSettings.backgroundColor;
                settings.background.backgroundImage = gaSettings.backgroundImage;

            }

            // Extract label settings from GraphAreaEditor
            if (window.GraphAreaEditor && window.GraphAreaEditor.getSettings) {
                const gaSettings = window.GraphAreaEditor.getSettings();
                settings.labels.labelSize = gaSettings.labelSize;
                settings.labels.labelColor = gaSettings.labelColor;
                settings.labels.defaultNodeSize = gaSettings.defaultNodeSize;
            }
            
            settings.saved = true;
            return settings;
        },
        
        // Apply graph area settings to active components
        applySettings: function(settings) {
            if (!settings) return;
            
            // Apply plotting space settings
            if (settings.plottingSpace && window.DataManager) {
                // Restore the exact plotting space dimensions and settings
                window.DataManager.plottingSpace = { ...window.DataManager.plottingSpace, ...settings.plottingSpace };
                
                // Restore transformation parameters if they exist (critical for 3D layouts)
                if (settings.plottingSpace.transformationParams) {
                    window.DataManager.lastTransformationParams = { ...settings.plottingSpace.transformationParams };
                    
                    // The plotting space from transformation params takes precedence for 3D accuracy
                    const savedPlottingSpace = settings.plottingSpace.transformationParams.plottingSpace;
                    if (savedPlottingSpace) {
                        // Check for potential aspect ratio issues
                        const currentPS = window.DataManager.plottingSpace;
                        const aspectRatioChanged = 
                            Math.abs((currentPS.width / currentPS.height) - (savedPlottingSpace.width / savedPlottingSpace.height)) > 0.01 ||
                            Math.abs((currentPS.width / currentPS.depth) - (savedPlottingSpace.width / savedPlottingSpace.depth)) > 0.01;
                            
                        if (aspectRatioChanged) {
                        }
                        
                        window.DataManager.plottingSpace = { ...window.DataManager.plottingSpace, ...savedPlottingSpace };
                    }
                }
            }
            
            // Apply viewport settings using GraphRenderer methods
            if (settings.viewport && window.GraphRenderer) {
                window.GraphRenderer.applyViewportSettings(settings.viewport);
            }
            
            // Apply rendering settings using GraphRenderer methods
            if (settings.rendering && window.GraphRenderer) {
                window.GraphRenderer.applyRenderingSettings(settings.rendering);
            }
            
            // Apply background settings to GraphAreaEditor
            if (settings.background && window.GraphAreaEditor) {
                this.applyBackgroundSettings(settings.background);
            }
            
            // Apply label settings to GraphAreaEditor
            if (settings.labels && window.GraphAreaEditor) {
                this.applyLabelSettings(settings.labels);
            }
            
            // Apply preferred layout if specified and different from current
            if (settings.preferredLayout && window.LayoutManager) {
                // Only apply if no layout is currently active or if explicitly requested
                // Note: We don't automatically apply the layout here to avoid disrupting user workflow
                // This information is available for the UI to suggest or auto-apply if desired
            }
        },
        
        // Apply background settings to GraphAreaEditor
        applyBackgroundSettings: function(backgroundSettings) {
            if (!window.GraphAreaEditor || !backgroundSettings) return;

            try {
                const newSettings = {};
                if (backgroundSettings.backgroundColor) {
                    newSettings.backgroundColor = backgroundSettings.backgroundColor;
                }
                if (Object.prototype.hasOwnProperty.call(backgroundSettings, 'backgroundImage')) {
                    const imageSetting = backgroundSettings.backgroundImage;
                    newSettings.backgroundImage =
                        imageSetting === undefined || imageSetting === null || imageSetting === ''
                            ? null
                            : imageSetting;

                }
                if (window.GraphAreaEditor.applySettings) {
                    window.GraphAreaEditor.applySettings(newSettings, { save: false });
                } else {
                }

            } catch (error) {
            }
        },

        // Apply label settings to GraphAreaEditor
        applyLabelSettings: function(labelSettings) {
            if (!window.GraphAreaEditor || !labelSettings) return;

            try {
                const newSettings = {};
                if (labelSettings.labelSize !== undefined) {
                    newSettings.labelSize = labelSettings.labelSize;
                }
                if (labelSettings.labelColor) {
                    newSettings.labelColor = labelSettings.labelColor;
                }
                if (labelSettings.defaultNodeSize !== undefined) {
                    newSettings.defaultNodeSize = labelSettings.defaultNodeSize;
                }

                if (window.GraphAreaEditor.applySettings) {
                    window.GraphAreaEditor.applySettings(newSettings);
                } else {
                }

            } catch (error) {
            }
        }
    }
};

// Node type configurations
window.NodeTypes = {
    default: {
        color: '#ffffff',
        size: 20,
        shape: 'ellipse',
        icon: '',
        labelColor: '#333333',
        backgroundFit: 'contain'
    },
    container: {
        color: '#d3d3d3',
        size: 28,
        shape: 'round-rectangle',
        icon: '',
        backgroundFit: 'contain',
        coordinateSpace: {
            x: 1000,
            y: 1000,
            z: 1000,
            origin: { x: 500, y: 500, z: 500 }
        }
    },
    graph: {
        color: '#ede9fe',
        size: 110,
        shape: 'round-rectangle',
        icon: '/assets/domains/symbols/graph.png',
        labelColor: '#312e81',
        backgroundFit: 'contain'
    },
    'graph-return': {
        color: '#ede9fe',
        size: 110,
        shape: 'round-rectangle',
        icon: '/assets/domains/symbols/graph.png',
        labelColor: '#312e81',
        backgroundFit: 'contain'
    },
    image: {
        color: '#ffffff',
        size: 240,
        shape: 'round-rectangle',
        icon: '',
        backgroundFit: 'contain',
        backgroundColor: '#ffffff',
        borderColor: '#d1d5db',
        borderWidth: 1,
        legendColor: '#111827',
        labelColor: '#111827',
        legendFontSize: 13,
        legendFontFamily: 'Inter, "Segoe UI", sans-serif',
        legendBackgroundColor: '#ffffff',
        legendBackgroundOpacity: 0.9,
        imagePadding: 16,
        defaultAspectRatio: 1.5,
        imageWidth: 240
    },
    text: {
        color: 'rgba(0,0,0,0)',
        size: 1,
        shape: 'round-rectangle',
        icon: '',
        backgroundFit: 'contain',
        fontFamily: 'Arial',
        fontSize: 14,
        fontColor: '#333333',
        bold: false,
        italic: false,
        backgroundColor: '#ffffff',
        backgroundOpacity: 1,
        borderColor: '#000000',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 4,
        boxShadow: 'none'
    },
    magnifier: {
        color: 'rgba(0,0,0,0)',
        size: 120,
        shape: 'round-rectangle',
        icon: '',
        backgroundFit: 'contain',
        borderColor: '#999999',
        borderWidth: 1,
        zoom: 2
    },
    'timeline-bar': {
        color: '#667eea',
        size: 10,
        shape: 'rectangle',
        icon: ''
    },
    'timeline-anchor': {
        color: 'rgba(0,0,0,0)',
        size: 1,
        shape: 'rectangle',
        icon: ''
    },
    'timeline-tick': {
        color: '#666666',
        size: 8,
        shape: 'rectangle',
        icon: ''
    }
};

// Icon configurations
window.IconConfigs = {
    server: 'assets/domains/components/server.png',
    database: 'assets/domains/components/database.png',
    user:'assets/domains/computing/user.png',
    network:'assets/domains/computing/network.png',
    cloud:'assets/domains/computing/cloud.png',
    lock:'assets/domains/symbols/sym_lock.png',
    star:'assets/domains/symbols/sym_star.png',
    heart:'assets/domains/symbols/sym_heart.png'
};
