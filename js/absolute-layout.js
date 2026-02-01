// Absolute Layout System for Quantickle
// Places nodes at their exact coordinates in a 1000x1000x1000 3D space

window.AbsoluteLayout = {
    // Configuration
    config: {
        enabled: true,
        spaceWidth: 1000,      // 3D space width
        spaceHeight: 1000,     // 3D space height
        spaceDepth: 1000,      // 3D space depth
        centerX: 500,          // Center X coordinate
        centerY: 500,          // Center Y coordinate
        centerZ: 500,          // Center Z coordinate
        randomSeed: null,      // Random seed for consistent random placement
        depthEffect: true,     // Enable depth-based visual effects
        depthRange: 1000,      // Maximum depth range for effects
        saturationRange: 0.3,  // How much saturation changes with depth
        brightnessRange: 0.4,  // How much brightness changes with depth
        sizeRange: 0.5         // How much size changes with depth
    },

    // State
    isActive: false,
    nodePositions: new Map(), // Store 3D positions
    randomGenerator: null,    // Seeded random number generator

    // Initialize the absolute layout
    init: function(cy) {
        if (!cy) {
            console.error('AbsoluteLayout: Cytoscape instance required');
            return;
        }

        this.cy = cy;
        
        // Initialize random generator
        this.initRandomGenerator();
        
        // Set up event listeners
        this.setupEventListeners();
    },

    // Initialize seeded random number generator
    initRandomGenerator: function() {
        if (this.config.randomSeed !== null) {
            // Simple seeded random generator
            let seed = this.config.randomSeed;
            this.randomGenerator = {
                next: function() {
                    seed = (seed * 9301 + 49297) % 233280;
                    return seed / 233280;
                }
            };
        } else {
            // Use Math.random
            this.randomGenerator = {
                next: function() {
                    return Math.random();
                }
            };
        }
    },

    // Set up event listeners for interactions
    setupEventListeners: function() {
        if (!this.cy) return;

        // Mouse wheel for zoom (affects depth perception)
        this.cy.on('mousewheel', (evt) => {
            if (this.config.depthEffect) {
                this.updateDepthEffects();
            }
        });

        // Zoom events for depth perception
        this.cy.on('zoom', (evt) => {
            if (this.config.depthEffect) {
                this.updateDepthEffects();
            }
        });
    },

    // Apply absolute layout
    applyAbsoluteLayout: function(options = {}) {
        if (!this.cy) return;

        // Merge options with default config
        const layoutOptions = { ...this.config, ...options };
        
        this.isActive = true;
        const nodes = this.cy.nodes();
        const nodeCount = nodes.length;

        if (nodeCount === 0) {
            return;
        }

        // Clear previous positions
        this.nodePositions.clear();

        // Use fixed logical center for rotation reference
        const viewportCenter = {
            x: layoutOptions.centerX,
            y: layoutOptions.centerY,
            z: layoutOptions.centerZ
        };

        const offset = { x: 0, y: 0, z: 0 };

        // Keep global origin fixed at the rotation center
        if (window.DataManager && window.DataManager.plottingSpace) {
            window.DataManager.plottingSpace.origin.x = layoutOptions.centerX;
            window.DataManager.plottingSpace.origin.y = layoutOptions.centerY;
            window.DataManager.plottingSpace.origin.z = layoutOptions.centerZ;
        }

        // Process each node
        nodes.forEach((node, index) => {
            const position = this.calculateNodePosition(node, layoutOptions, offset, viewportCenter);
            
            // Store 3D position
            this.nodePositions.set(node.id(), {
                x: position.x,
                y: position.y,
                z: position.z,
                originalX: position.x,
                originalY: position.y,
                originalZ: position.z
            });

            // Apply position to Cytoscape (2D projection)
            node.position({ x: position.x, y: position.y });
            
            // Debug logging for first few nodes
            if (index < 5) {
            }
        });

        // Apply depth-based visual effects
        if (layoutOptions.depthEffect) {
            this.applyDepthEffects();
            
            // Set up event listeners for dynamic depth reordering
            this.setupDepthEventListeners();
        }
    },

    // Calculate position for a single node
    calculateNodePosition: function(node, options, offset = { x: 0, y: 0, z: 0 }, viewportCenter = { x: 0, y: 0, z: 0 }) {
        // Check if node has absolute coordinates
        const hasX = node.data('x') !== undefined && node.data('x') !== null;
        const hasY = node.data('y') !== undefined && node.data('y') !== null;
        const hasZ = node.data('z') !== undefined && node.data('z') !== null;

        let x, y, z;

        if (hasX && hasY && hasZ) {
            // Use provided absolute coordinates and clamp to space bounds
            x = Math.max(0, Math.min(options.spaceWidth, node.data('x'))) + offset.x;
            y = Math.max(0, Math.min(options.spaceHeight, node.data('y'))) + offset.y;
            z = Math.max(0, Math.min(options.spaceDepth, node.data('z'))) + offset.z;
        } else {
            // Generate random coordinates and apply offset
            x = this.randomGenerator.next() * options.spaceWidth + offset.x;
            y = this.randomGenerator.next() * options.spaceHeight + offset.y;
            z = this.randomGenerator.next() * options.spaceDepth + offset.z;
        }

        return { x, y, z };
    },

    // Apply depth-based visual effects
    applyDepthEffects: function() {
        if (!this.cy || !this.config.depthEffect) return; // Debug log
        
        try {
            // Check if 3D Globe layout is active and has depth effects
            if (window.GlobeLayout3D && window.GlobeLayout3D.isActive && window.GlobeLayout3D.config.depthEffect) {
                window.GlobeLayout3D.applyDepthEffects();
                return;
            }
            
            // Fallback to local depth effects
            const nodes = this.cy.nodes();
            const zoom = this.cy.zoom();
            const pan = this.cy.pan(); // Debug log
            
            // Collect all nodes with their Z coordinates for sorting
            const nodeDepthData = [];
            nodes.forEach(node => {
                try {
                    const position = node.position();
                    
                    // Debug: Log the position object to understand its structure
                    if (!position || typeof position !== 'object') {
                        return; // Skip this node
                    }
                    
                    // Validate position has required properties
                    if (typeof position.x !== 'number' || typeof position.y !== 'number' || 
                        isNaN(position.x) || isNaN(position.y)) {
                        return; // Skip this node
                    }
                    
                    // Get the actual Z coordinate from stored positions or node data
                    const storedPosition = this.nodePositions.get(node.id());
                    let zCoordinate = 0;
                    
                    if (storedPosition && typeof storedPosition.z === 'number') {
                        zCoordinate = storedPosition.z;
                    } else {
                        // Fallback: use node data with same viewer position
                        zCoordinate = node.data('z') || 0;
                    }
                    
                    // For proper z-ordering relative to the origin, we want:
                    // - Z < originZ (closer to viewer) = higher priority (in front)
                    // - Z > originZ (deeper into screen) = lower priority (behind)
                    // - Z = originZ (center) = middle priority
                    const originZ = window.DataManager?.plottingSpace?.origin?.z ?? 300;
                    const depthPriority = originZ - zCoordinate; // Invert so lower Z gets higher priority

                    // Debug logging for all nodes
                    
                    nodeDepthData.push({
                        node: node,
                        depthPriority: depthPriority,
                        zCoordinate: zCoordinate
                    });
                    
                } catch (nodeError) {
                }
            });
            
            // Sort nodes by depth priority (highest priority first = closest to viewer)
            nodeDepthData.sort((a, b) => b.depthPriority - a.depthPriority);
            
            // Debug logging for sorting order
            nodeDepthData.forEach((nodeData, index) => {
            });
            
            // Apply z-index using Cytoscape's built-in system
            this.applyZIndexToNodes(nodeDepthData); // Debug log
        } catch (error) {
            console.error('Error in applyDepthEffects:', error);
        }
    },

    // Apply z-index to nodes using Cytoscape's built-in system
    applyZIndexToNodes: function(nodeDepthData) {
        try {
            
            // Calculate z-index range - ensure all values are positive
            const minZIndex = 1;
            const maxZIndex = 1000;
            const zIndexRange = maxZIndex - minZIndex;
            
            // Find the actual range of depth priorities to normalize properly
            const priorities = nodeDepthData.map(d => d.depthPriority);
            const minPriority = Math.min(...priorities);
            const maxPriority = Math.max(...priorities);
            const priorityRange = maxPriority - minPriority;
            
            // Apply z-index to each node based on its depth priority
            nodeDepthData.forEach((nodeData, index) => {
                try {
                    // Calculate z-index: normalize priority to 0-1 range, then map to z-index range
                    // Ensure all z-index values are positive
                    const normalizedPriority = priorityRange > 0 ? 
                        (nodeData.depthPriority - minPriority) / priorityRange : 0.5;
                    const zIndex = Math.floor(minZIndex + (normalizedPriority * zIndexRange));
                    
                    // Apply z-index using Cytoscape's style system
                    nodeData.node.style({
                        'z-index': zIndex
                    });
                    
                } catch (styleError) {
                }
            });
            const originZ = window.DataManager?.plottingSpace?.origin?.z ?? 300;
        } catch (error) {
            console.error('Error in applyZIndexToNodes:', error);
        }
    },

    // Calculate depth of a node from camera perspective
    calculateDepth: function(position, zoom, pan) {
        try {
            // Validate inputs
            if (!position || typeof position !== 'object') {
                return 0;
            }
            
            if (typeof position.x !== 'number' || typeof position.y !== 'number' || 
                isNaN(position.x) || isNaN(position.y)) {
                return 0;
            }
            
            // Handle missing or invalid z coordinate
            const z = (typeof position.z === 'number' && !isNaN(position.z)) ? position.z : 0;
            
            // Use Z position as primary depth indicator
            const zDepth = z;
            
            // Also consider 2D distance from center for additional depth perception
            const viewportCenterX = this.cy.width() / 2;
            const viewportCenterY = this.cy.height() / 2;
            const dx = position.x - viewportCenterX;
            const dy = position.y - viewportCenterY;
            const distance2D = Math.sqrt(dx * dx + dy * dy);
            
            // Combine Z depth (primary) with 2D distance (secondary)
            const normalizedZ = Math.max(0, 1 - (zDepth / this.config.depthRange));
            const normalized2D = Math.min(1, distance2D / (this.cy.width() * 0.3));
            
            // Weight Z depth more heavily than 2D distance
            const combinedDepth = (normalizedZ * 0.8) + (normalized2D * 0.2);
            
            const result = combinedDepth * this.config.depthRange;
            return isNaN(result) ? 0 : Math.max(0, result);
        } catch (error) {
            return 0;
        }
    },

    // Normalize depth to 0-1 range
    normalizeDepth: function(depth) {
        try {
            // Validate input
            if (typeof depth !== 'number' || isNaN(depth)) {
                return 0;
            }
            
            // Use a more sensitive range for better distance perception
            const effectiveRange = this.config.depthRange * 0.5; // More sensitive
            const normalized = Math.max(0, Math.min(1, depth / effectiveRange));
            
            // Apply a curve to make closer nodes more distinct
            const result = Math.pow(normalized, 1.5);
            return isNaN(result) ? 0 : Math.max(0, Math.min(1, result));
        } catch (error) {
            return 0;
        }
    },

    // Apply depth-based visual effects to a node
    applyNodeDepthEffects: function(node, depthFactor) {
        try {
            // Validate inputs
            if (typeof depthFactor !== 'number' || isNaN(depthFactor)) {
                depthFactor = 0;
            }
            
            const baseColor = node.data('color') || (window.QuantickleConfig?.defaultNodeColor || '#ffffff');
            const baseSize = parseInt(node.data('size')) || 20;
            const position = node.position();

            // Validate position (handle both 2D and 3D positions)
            if (!position || typeof position.x !== 'number' || typeof position.y !== 'number' ||
                isNaN(position.x) || isNaN(position.y)) {
                return;
            }
            
            // Handle missing z coordinate (default to 0 for 2D)
            const z = (typeof position.z === 'number' && !isNaN(position.z)) ? position.z : 0;

            // Use the actual viewport center for depth calculations
            let viewerPosition = {
                x: this.cy.width() / 2,
                y: this.cy.height() / 2,
                z: window.DataManager.plottingSpace.origin.z
            };

            // Calculate distance from viewer position
            const dx = position.x - viewerPosition.x;
            const dy = position.y - viewerPosition.y;
            const dz = z - viewerPosition.z;
            const distanceFromViewer = Math.sqrt(dx * dx + dy * dy + dz * dz);
            
            // Validate distance calculation
            if (isNaN(distanceFromViewer)) {
                return;
            }
            

            // Only apply fog effect to nodes that are far from the viewer
            const fogThreshold = 200; // Start fog effect at 200 pixels from viewer
            
            if (distanceFromViewer <= fogThreshold) {
                // Close nodes - no fog effect
                // Get the actual 3D position from our stored positions
                const storedPosition = this.nodePositions.get(node.id());
                let zDepth = z; // Use the z coordinate we calculated earlier as fallback
                
                if (storedPosition && typeof storedPosition.z === 'number') {
                    zDepth = storedPosition.z;
                } else {
                    // Fallback: try to get Z from node data
                    zDepth = node.data('z') || z;
                }
                
                // Debug logging for all nodes
                
                const style = {
                    'background-color': String(baseColor),
                    'width': Math.max(1, Math.round(baseSize)),
                    'height': Math.max(1, Math.round(baseSize)),
                    'opacity': 1
                };
                
                Object.keys(style).forEach(key => {
                    if (style[key] !== null && style[key] !== undefined && !isNaN(style[key])) {
                        node.style(key, style[key]);
                    }
                });
            } else {
                // Apply fog effect - distant nodes become lighter and more transparent
                const fogDistance = distanceFromViewer - fogThreshold;
                const maxFogDistance = 100; // Maximum fog distance (reduced from 300)
                const fogStrength = Math.min(1, Math.max(0, fogDistance / maxFogDistance));
                
                // Validate fog strength
                if (isNaN(fogStrength)) {
                    return;
                }
                
                
                // Fog effect: very subtle changes
                const fogColor = this.applyFogEffect(baseColor, fogStrength);
                const fogOpacity = Math.max(0.3, Math.min(1, 1 - (fogStrength * 0.3))); // Less transparent with distance
                const fogSize = Math.max(0.8, Math.min(1, 1 - (fogStrength * 0.1))); // Minimal size reduction

                // Validate all calculated values
                if (isNaN(fogOpacity) || isNaN(fogSize)) {
                    return;
                }

                const style = {
                    'background-color': String(fogColor),
                    'width': Math.max(1, Math.round(baseSize * fogSize)),
                    'height': Math.max(1, Math.round(baseSize * fogSize)),
                    'opacity': fogOpacity
                };
                
                Object.keys(style).forEach(key => {
                    if (style[key] !== null && style[key] !== undefined && !isNaN(style[key])) {
                        node.style(key, style[key]);
                    }
                });
            }
        } catch (error) {
        }
    },

    // Apply fog effect to color (makes it lighter and more washed out)
    applyFogEffect: function(color, fogStrength) {
        try {
            // Validate inputs
            if (!color || typeof color !== 'string') {
                color = window.QuantickleConfig?.defaultNodeColor || '#ffffff';
            }
            
            if (typeof fogStrength !== 'number' || isNaN(fogStrength)) {
                fogStrength = 0;
            }
            
            // Ensure fogStrength is between 0 and 1
            fogStrength = Math.max(0, Math.min(1, fogStrength));
            
            // Convert hex to HSL for easier manipulation
            const hsl = this.hexToHsl(color);
            
            // Validate HSL values
            if (!hsl || isNaN(hsl.h) || isNaN(hsl.s) || isNaN(hsl.l)) {
                return color; // Return original color if conversion fails
            }
            
            // Fog effect: very subtle changes - preserve original colors
            const newLightness = Math.min(100, Math.max(0, hsl.l + (fogStrength * 10))); // Slightly lighter (add up to 10% lightness)
            const newSaturation = Math.min(100, Math.max(0, hsl.s - (fogStrength * 15))); // Slightly less saturated (reduce up to 15% saturation)
            
            // Validate calculated values
            if (isNaN(newLightness) || isNaN(newSaturation)) {
                return color; // Return original color if calculations fail
            }
            
            // Convert back to hex
            const result = this.hslToHex(hsl.h, newSaturation, newLightness);
            
            // Validate result
            if (!result || result === '#NaNNaNNaN') {
                return color;
            }
            
            return result;
        } catch (error) {
            return color; // Return original color on error
        }
    },

    // Modify color based on saturation and brightness
    modifyColor: function(color, saturationMod, brightnessMod) {
        // Ensure color is valid
        if (!color || typeof color !== 'string') {
            color = window.QuantickleConfig?.defaultNodeColor || '#ffffff';
        }
        
        // Convert hex to HSL for easier manipulation
        const hsl = this.hexToHsl(color);
        
        // Apply modifications
        hsl.s = Math.max(0, Math.min(100, hsl.s * saturationMod));
        hsl.l = Math.max(0, Math.min(100, hsl.l * brightnessMod));
        
        // Convert back to hex
        return this.hslToHex(hsl.h, hsl.s, hsl.l);
    },

    // Convert hex color to HSL
    hexToHsl: function(hex) {
        // Ensure hex is a string and handle different color formats
        if (typeof hex !== 'string') {
            hex = window.QuantickleConfig?.defaultNodeColor || '#ffffff'; // Default color
        }
        
        // Remove # if present
        hex = hex.replace('#', '');
        
        // Parse RGB values
        const r = parseInt(hex.substr(0, 2), 16) / 255;
        const g = parseInt(hex.substr(2, 2), 16) / 255;
        const b = parseInt(hex.substr(4, 2), 16) / 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        
        if (max === min) {
            h = s = 0; // achromatic
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        
        return {
            h: h * 360,
            s: s * 100,
            l: l * 100
        };
    },

    // Convert HSL to hex color
    hslToHex: function(h, s, l) {
        h /= 360;
        s /= 100;
        l /= 100;
        
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        
        let r, g, b;
        
        if (s === 0) {
            r = g = b = l; // achromatic
        } else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        
        const toHex = (c) => {
            const hex = Math.round(c * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    },

    // Set up event listeners for dynamic depth reordering
    setupDepthEventListeners: function() {
        if (!this.cy) return;
        
        // Mouse wheel for zoom (affects depth perception)
        this.cy.on('mousewheel', (evt) => {
            if (this.config.depthEffect) {
                this.applyDepthEffects();
            }
        });

        // Zoom events for depth perception
        this.cy.on('zoom', (evt) => {
            if (this.config.depthEffect) {
                this.applyDepthEffects();
            }
        });
    },

    // Update depth effects (called on view changes)
    updateDepthEffects: function() {
        if (!this.isActive || !this.config.depthEffect) return;
        
        // Use requestAnimationFrame for smooth updates
        if (this.depthUpdateId) {
            cancelAnimationFrame(this.depthUpdateId);
        }
        
        this.depthUpdateId = requestAnimationFrame(() => {
            this.applyDepthEffects();
        });
    },

    // Handle 3D rotation for Absolute Layout
    handle3DRotation: function() {
        // Use the global 3D rotation system if available
        if (window.GlobeLayout3D && window.GlobeLayout3D.isActive && window.GlobeLayout3D.config.autoRotate) {
            // The global system will handle rotation automatically
            return;
        }
        
        // Fallback: no rotation for Absolute Layout by default
    },

    // Set configuration
    setConfig: function(newConfig) {
        this.config = { ...this.config, ...newConfig };
    },

    // Enable/disable the layout
    setEnabled: function(enabled) {
        this.config.enabled = enabled;
        if (!enabled) {
            this.resetVisualEffects();
        }
    },

    // Reset visual effects to default
    resetVisualEffects: function() {
        if (!this.cy) return;

        try {
            const nodes = this.cy.nodes();
            nodes.forEach(node => {
                try {
                    const baseColor = node.data('color') || (window.QuantickleConfig?.defaultNodeColor || '#ffffff');
                    const baseSize = parseInt(node.data('size')) || 20;
                    
                    const style = {
                        'background-color': String(baseColor),
                        'width': Math.max(1, Math.round(baseSize)),
                        'height': Math.max(1, Math.round(baseSize)),
                        'opacity': 1,
                        'z-index': 100
                    };
                    
                    // Only apply valid styles
                    Object.keys(style).forEach(key => {
                        if (style[key] !== null && style[key] !== undefined) {
                            node.style(key, style[key]);
                        }
                    });
                } catch (nodeError) {
                }
            });
        } catch (error) {
            console.error('Error in resetVisualEffects:', error);
        }
    },

    // Get current layout information
    getLayoutInfo: function() {
        return {
            isActive: this.isActive,
            nodeCount: this.nodePositions.size,
            config: this.config
        };
    },

    // Clean up resources
    destroy: function() {
        this.resetVisualEffects();
        this.isActive = false;
        this.nodePositions.clear();
    }
};

// Absolute Layout loaded successfully
