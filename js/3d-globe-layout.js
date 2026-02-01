// 3D Globe Layout System for Quantickle
// Creates spherical layouts with depth-based visual effects

window.GlobeLayout3D = {
    // Configuration
    config: {
        enabled: true,
        radius: 300,           // Sphere radius
        centerX: 500,          // Center X coordinate
        centerY: 500,          // Center Y coordinate
        centerZ: 500,          // Center Z coordinate (for depth calculations)
        rotationSpeed: 0.001, // Auto-rotation speed
        autoRotate: false,    // Enable auto-rotation
        rotationMode: 'y-axis', // 'y-axis', 'multi-axis', 'gentle'
        depthEffect: true,    // Enable depth-based visual effects
        depthRange: 600,      // Maximum depth range for effects
        saturationRange: 0.3, // How much saturation changes with depth
        brightnessRange: 0.4, // How much brightness changes with depth
        blurRange: 0.8,       // How much blur changes with depth
        sizeRange: 0.5        // How much size changes with depth
    },

    // State
    isActive: false,
    animationId: null,
    currentRotation: { x: 0, y: 0, z: 0 },
    nodePositions: new Map(), // Store 3D positions
    cameraPosition: { x: 0, y: 0, z: 500 }, // Virtual camera position
    activeNodes: null,       // Nodes currently affected by 3D layout
    rotationCenter: { x: 500, y: 500, z: 500 },

    // Helper to identify container nodes
    isContainerNode: function(node) {
        return node && (
            (node.data && node.data('type') === 'container') ||
            (typeof node.hasClass === 'function' && node.hasClass('container'))
        );
    },

    // Initialize the 3D globe layout
    init: function(cy) {
        this.cy = cy;
        this.isActive = false;
        this.nodePositions = new Map();
        this.currentRotation = { x: 0, y: 0, z: 0 };
        this.animationId = null;
        this.activeNodes = null;
        this.rotationCenter = { x: 500, y: 500, z: 500 };
        
        // Debug: Log actual viewport dimensions
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Initialize 3D rendering context
        this.init3DRendering();
    },

    // Capture 3D positions from Absolute layout
    captureAbsolutePositions: function() {
        if (!this.cy) return;
        const nodes = this.cy.nodes();

        nodes.forEach(node => {
            const position = node.position();
            const x = position.x;
            const y = position.y;
            const z = node.data('z') !== undefined ? parseFloat(node.data('z')) : 0;

            // Store original 3D position
            this.nodePositions.set(node.id(), {
                originalX: x,
                originalY: y,
                originalZ: z,
                x: x,
                y: y,
                z: z
            });
        });
    },

    // Refresh stored absolute positions for a container and its descendants
    refreshAbsolutePositions: function(root) {
        if (!root || !this.isContainerNode(root)) return;

        const getZ = (n) => n.data && n.data('z') !== undefined ? parseFloat(n.data('z')) : 0;

        const traverse = (container, base) => {
            const pos = container.position();
            const abs = {
                x: base.x + pos.x,
                y: base.y + pos.y,
                z: base.z + getZ(container)
            };

            this.nodePositions.set(container.id(), {
                x: abs.x,
                y: abs.y,
                z: abs.z,
                originalX: abs.x,
                originalY: abs.y,
                originalZ: abs.z
            });

            container.children().forEach(child => {
                const childPos = child.position();
                const childAbs = {
                    x: abs.x + childPos.x,
                    y: abs.y + childPos.y,
                    z: abs.z + getZ(child)
                };

                this.nodePositions.set(child.id(), {
                    x: childAbs.x,
                    y: childAbs.y,
                    z: childAbs.z,
                    originalX: childAbs.x,
                    originalY: childAbs.y,
                    originalZ: childAbs.z
                });

                if (this.isContainerNode(child)) {
                    traverse(child, childAbs);
                }
            });
        };

        let base = { x: 0, y: 0, z: 0 };
        const parent = root.parent();
        if (parent && parent.length > 0) {
            const pPos = this.nodePositions.get(parent.id());
            if (pPos) {
                base = { x: pPos.x, y: pPos.y, z: pPos.z };
            }
        }

        traverse(root, base);
    },

    // Set up event listeners for 3D interactions
    setupEventListeners: function() {
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

        // Track new containers and reparenting to maintain absolute positions
        this.cy.on('add', 'node[type="container"]', (evt) => {
            this.refreshAbsolutePositions(evt.target);
        });

        this.cy.on('parent', 'node', (evt) => {
            const parent = evt.target.parent();
            if (parent && this.isContainerNode(parent)) {
                this.refreshAbsolutePositions(parent);
            }
        });
    },

    // Initialize 3D rendering context
    init3DRendering: function() {
        // Create a virtual 3D space
        this.viewport = {
            width: this.cy.width(),
            height: this.cy.height(),
            depth: this.config.depthRange
        };
    },

    // Apply true 3D globe layout (bypasses 2D layouts)
    applyTrue3DGlobeLayout: function(options = {}, nodes = null) {
        if (!this.cy) return;

        // Merge options with default config
        const layoutOptions = { ...this.config, ...options };

        // Determine target nodes
        const targetNodes = nodes || this.activeNodes || this.cy.nodes();
        if (nodes) {
            // When explicit nodes are provided, restrict active nodes to them
            this.activeNodes = nodes;
        } else if (!this.activeNodes) {
            this.activeNodes = targetNodes;
        }

        // Set rotation center using provided options or default fixed point
        this.rotationCenter = {
            x: layoutOptions.centerX !== undefined ? layoutOptions.centerX : 500,
            y: layoutOptions.centerY !== undefined ? layoutOptions.centerY : 500,
            z: layoutOptions.centerZ !== undefined ? layoutOptions.centerZ : 500
        };

        this.isActive = true;
        const nodeCount = targetNodes.length;

        if (nodeCount === 0) {
            return;
        }

        // Check if nodes have depth data
        const hasDepthData = targetNodes.some(node => node.data('depth') !== undefined && node.data('depth') !== 0);

        if (hasDepthData) {
            this.applyTrue3DWithDepthData(targetNodes, layoutOptions);
        } else {
            this.applyTrue3DSphericalLayout(targetNodes, layoutOptions);
        }

        // Apply depth-based visual effects immediately
        if (layoutOptions.depthEffect) {
            this.applyDepthEffects(targetNodes);
        }

        // Start auto-rotation if enabled
        if (layoutOptions.autoRotate) {
            this.startAutoRotation();
        }
    },

    // Apply true 3D layout using depth data
    applyTrue3DWithDepthData: function(nodes, options) {
        this.nodePositions.clear();

        // Get depth bounds
        const depths = nodes.map(node => node.data('depth') || 0);
        const minZ = Math.min(...depths);
        const maxZ = Math.max(...depths);
        const depthRange = maxZ - minZ;

        // Calculate 2D positions in a circle/spiral pattern
        const centerX = options.centerX ?? this.rotationCenter.x;
        const centerY = options.centerY ?? this.rotationCenter.y;
        const radius = options.radius ?? Math.min(this.cy.width(), this.cy.height()) * 0.3;
        
        const parentContainers = new Set();

        nodes.forEach((node, index) => {
            // Calculate 2D position in a spiral pattern
            const angle = (index / nodes.length) * Math.PI * 2;
            const spiralRadius = radius * (0.3 + 0.7 * (index / nodes.length));

            const x = centerX + Math.cos(angle) * spiralRadius;
            const y = centerY + Math.sin(angle) * spiralRadius;
            const z = node.data('depth') || 0;

            // Store 3D position
            this.nodePositions.set(node.id(), {
                x: x,
                y: y,
                z: z,
                originalX: x,
                originalY: y,
                originalZ: z
            });

            // Apply position to Cytoscape (2D projection)
            node.position({ x: x, y: y });

            const parent = node.parent();
            if (this.isContainerNode(parent)) {
                parentContainers.add(parent);
            }
        });

        // Store positions for parent containers to keep their centers
        parentContainers.forEach(container => {
            const cPos = container.position();
            this.nodePositions.set(container.id(), {
                x: cPos.x,
                y: cPos.y,
                z: 0,
                originalX: cPos.x,
                originalY: cPos.y,
                originalZ: 0
            });
        });
    },

    // Apply true 3D spherical layout
    applyTrue3DSphericalLayout: function(nodes, options) {
        this.nodePositions.clear();

        // Use golden ratio spiral for even distribution on sphere
        const phi = Math.PI * (3 - Math.sqrt(5)); // Golden angle
        const centerX = options.centerX ?? this.rotationCenter.x;
        const centerY = options.centerY ?? this.rotationCenter.y;
        const radius = options.radius ?? Math.min(this.cy.width(), this.cy.height()) * 0.3;

        const parentContainers = new Set();

        nodes.forEach((node, index) => {
            // Calculate spherical coordinates
            const y = 1 - (index / (nodes.length - 1)) * 2; // y goes from 1 to -1
            const radius2D = Math.sqrt(1 - y * y); // radius at y
            const theta = phi * index; // golden angle increment

            const x = Math.cos(theta) * radius2D;
            const z = Math.sin(theta) * radius2D;

            // Scale to desired radius and center
            const scaledX = x * radius + centerX;
            const scaledY = y * radius + centerY;
            const scaledZ = z * radius;

            // Store 3D position
            this.nodePositions.set(node.id(), {
                x: scaledX,
                y: scaledY,
                z: scaledZ,
                originalX: scaledX,
                originalY: scaledY,
                originalZ: scaledZ
            });

            // Apply position to Cytoscape (2D projection)
            node.position({ x: scaledX, y: scaledY });

            const parent = node.parent();
            if (this.isContainerNode(parent)) {
                parentContainers.add(parent);
            }
        });

        // Store positions for parent containers to keep their centers
        parentContainers.forEach(container => {
            const cPos = container.position();
            this.nodePositions.set(container.id(), {
                x: cPos.x,
                y: cPos.y,
                z: 0,
                originalX: cPos.x,
                originalY: cPos.y,
                originalZ: 0
            });
        });
    },

    // Apply 3D globe effects to the graph (works with any layout)
    applyGlobeEffects: function(options = {}, nodes = null) {
        if (!this.cy) return;

        // Merge options with default config
        const effectOptions = { ...this.config, ...options };

        // Determine target nodes
        const targetNodes = nodes || this.activeNodes || this.cy.nodes();
        if (nodes) {
            // Restrict active nodes to provided collection
            this.activeNodes = nodes;
        } else if (!this.activeNodes) {
            this.activeNodes = targetNodes;
        }

        // Set rotation center using provided options or default fixed point
        this.rotationCenter = {
            x: effectOptions.centerX !== undefined ? effectOptions.centerX : 500,
            y: effectOptions.centerY !== undefined ? effectOptions.centerY : 500,
            z: effectOptions.centerZ !== undefined ? effectOptions.centerZ : 500
        };

        this.isActive = true;
        const nodeCount = targetNodes.length;

        if (nodeCount === 0) {
            return;
        }

        // Calculate 3D positions based on current 2D positions
        this.calculate3DPositionsFromCurrent(targetNodes, effectOptions);

        // Apply depth-based visual effects
        if (effectOptions.depthEffect) {
            this.applyDepthEffects(targetNodes);
        }

        // Start auto-rotation if enabled
        if (effectOptions.autoRotate) {
            this.startAutoRotation();
        }
    },

    // Calculate 3D positions from current layout positions and depth data
    calculate3DPositionsFromCurrent: function(nodes, options) {
        const nodeCount = nodes.length;
        this.nodePositions.clear();

        // Check if nodes have explicit x, y, z coordinates (from plotting space transformation)
        const hasExplicitCoords = nodes.some(node => 
            node.data('x') !== undefined && node.data('x') !== null &&
            node.data('y') !== undefined && node.data('y') !== null &&
            node.data('z') !== undefined && node.data('z') !== null
        );
        
        if (hasExplicitCoords) {
            
            nodes.forEach((node, index) => {
                const x = node.data('x') || 0;
                const y = node.data('y') || 0;
                const z = node.data('z') || 0;
                
                // Store 3D position using the transformed coordinates
                this.nodePositions.set(node.id(), {
                    x: x,
                    y: y,
                    z: z,
                    originalX: x,
                    originalY: y,
                    originalZ: z
                });

                // Update Cytoscape position to match
                node.position({ x: x, y: y });
            });
            return;
        }

        // Check if nodes have depth data
        const hasDepthData = nodes.some(node => node.data('depth') !== undefined && node.data('depth') !== 0);
        
        if (hasDepthData) {
            
            // Get current layout bounds
            const positions = nodes.map(node => node.position());
            const xs = positions.map(p => p.x);
            const ys = positions.map(p => p.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            
            // Get depth bounds
            const depths = nodes.map(node => node.data('depth') || 0);
            const minZ = Math.min(...depths);
            const maxZ = Math.max(...depths);
            const centerZ = (minZ + maxZ) / 2;
            
            nodes.forEach((node, index) => {
                const pos = node.position();
                const depth = node.data('depth') || 0;
                
                // Use actual depth data
                const scaledX = pos.x;
                const scaledY = pos.y;
                const scaledZ = depth;

                // Store 3D position
                this.nodePositions.set(node.id(), {
                    x: scaledX,
                    y: scaledY,
                    z: scaledZ,
                    originalX: scaledX,
                    originalY: scaledY,
                    originalZ: scaledZ
                });
            });
        } else {
            
            // Get current layout bounds
            const positions = nodes.map(node => node.position());
            const xs = positions.map(p => p.x);
            const ys = positions.map(p => p.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            const radius = Math.max(maxX - minX, maxY - minY) / 2;

            nodes.forEach((node, index) => {
                const pos = node.position();
                
                // Calculate normalized position (0-1)
                const normX = (pos.x - centerX) / radius;
                const normY = (pos.y - centerY) / radius;
                
                // Calculate Z position to create a sphere effect
                const distance2D = Math.sqrt(normX * normX + normY * normY);
                const normZ = distance2D <= 1 ? Math.sqrt(1 - distance2D * distance2D) : 0;
                
                // Scale to desired radius
                const scaledX = normX * options.radius + options.centerX;
                const scaledY = normY * options.radius + options.centerY;
                const scaledZ = normZ * options.radius + options.centerZ;

                // Store 3D position
                this.nodePositions.set(node.id(), {
                    x: scaledX,
                    y: scaledY,
                    z: scaledZ,
                    originalX: scaledX,
                    originalY: scaledY,
                    originalZ: scaledZ
                });
            });
        }
    },

    // Calculate spherical positions for nodes
    calculateSphericalPositions: function(nodes, options) {
        const nodeCount = nodes.length;
        this.nodePositions.clear();

        // Use golden ratio spiral for even distribution on sphere
        const phi = Math.PI * (3 - Math.sqrt(5)); // Golden angle

        nodes.forEach((node, index) => {
            // Calculate spherical coordinates
            const y = 1 - (index / (nodeCount - 1)) * 2; // y goes from 1 to -1
            const radius = Math.sqrt(1 - y * y); // radius at y
            const theta = phi * index; // golden angle increment

            const x = Math.cos(theta) * radius;
            const z = Math.sin(theta) * radius;

            // Scale to desired radius
            const scaledX = x * options.radius + options.centerX;
            const scaledY = y * options.radius + options.centerY;
            const scaledZ = z * options.radius + options.centerZ;

            // Store 3D position
            this.nodePositions.set(node.id(), {
                x: scaledX,
                y: scaledY,
                z: scaledZ,
                originalX: scaledX,
                originalY: scaledY,
                originalZ: scaledZ
            });

            // Apply position to node
            node.position({
                x: scaledX,
                y: scaledY
            });
        });
    },

    // Apply positions to Cytoscape elements
    applyPositionsToCytoscape: function(nodes) {
        nodes.forEach(node => {
            const position = this.nodePositions.get(node.id());
            if (position) {
                node.position({
                    x: position.x,
                    y: position.y
                });
            }
        });
    },

    // Apply depth-based visual effects
    applyDepthEffects: function(nodes = null) {
        if (!this.cy || !this.config.depthEffect) return; // Debug log

        try {
            const targetNodes = nodes || this.activeNodes || this.cy.nodes();
            const zoom = this.cy.zoom();
            const pan = this.cy.pan(); // Debug log
            
            // Collect all nodes with their Z coordinates for sorting
            const nodeDepthData = [];
            

            targetNodes.forEach(node => {
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
                        // Fallback: try to get Z from node data
                        zCoordinate = node.data('z') || 0;
                    }
                    
                    // For proper z-ordering relative to the origin, we want:
                    // - Z < originZ (closer to viewer) = higher priority (in front)
                    // - Z > originZ (deeper into screen) = lower priority (behind)
                    // - Z = originZ (at center) = middle priority
                    const originZ = this.rotationCenter.z;
                    const depthPriority = originZ - zCoordinate; // Invert so lower Z gets higher priority

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
                 
            // Apply z-index using Cytoscape's built-in system
            this.applyZIndexToNodes(nodeDepthData);
          
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
        
        // Also consider 2D distance from rotation center for additional depth perception
        const centerX = this.rotationCenter.x;
        const centerY = this.rotationCenter.y;
        const dx = position.x - centerX;
        const dy = position.y - centerY;
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
        // Use a more sensitive range for better distance perception
        const effectiveRange = this.config.depthRange * 0.5; // More sensitive
        const normalized = Math.max(0, Math.min(1, depth / effectiveRange));
        
        // Apply a curve to make closer nodes more distinct
        return Math.pow(normalized, 1.5);
    },

    // Apply depth-based visual effects to a node
    applyNodeDepthEffects: function(node, zCoordinate) {
        try {
            const baseColor = node.data('color') || (window.QuantickleConfig?.defaultNodeColor || '#ffffff');
            const baseSize = node.data('size') || 20;
            const position = node.position();

            // Validate position (handle both 2D and 3D positions)
            if (!position || typeof position.x !== 'number' || typeof position.y !== 'number' ||
                isNaN(position.x) || isNaN(position.y)) {
                return;
            }
            
            // Validate z-coordinate
            if (typeof zCoordinate !== 'number' || isNaN(zCoordinate)) {
                return;
            }

            // CORRECTED: Z-coordinate interpretation:
            // - Z < originZ = closer to viewer (in front)
            // - Z > originZ = deeper into screen (behind)
            // - Z = originZ = at center

            // Calculate distance from viewer (assume viewer is at z = -1000, looking into positive z)
            const viewerZ = -1000;
            const distanceFromViewer = Math.abs(zCoordinate - viewerZ);
            
            // Apply fog effect based on distance from viewer
            const fogThreshold = 500; // Start fog effect at 500 units from viewer
            
            if (distanceFromViewer <= fogThreshold) {
                // Close nodes - no fog effect
                node.style({
                    'background-color': baseColor,
                    'width': baseSize,
                    'height': baseSize,
                    'opacity': 1
                });
            } else {
                // Apply fog effect - distant nodes become lighter and more transparent
                const fogDistance = distanceFromViewer - fogThreshold;
                const maxFogDistance = 1000; // Maximum fog distance
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

                node.style({
                    'background-color': fogColor,
                    'width': baseSize * fogSize,
                    'height': baseSize * fogSize,
                    'opacity': fogOpacity
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

    // Start auto-rotation
    startAutoRotation: function() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }

        const animate = () => {
            // Rotate incrementally around the Y axis
            const delta = { x: 0, y: this.config.rotationSpeed, z: 0 };
            this.rotateGlobe(delta);
            this.animationId = requestAnimationFrame(animate);
        };
        
        animate();
    },

    // Stop auto-rotation
    stopAutoRotation: function() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    },

    // Reset rotation to prevent drift
    resetRotation: function() {
        this.currentRotation = { x: 0, y: 0, z: 0 };
    },

    // Rotate the globe
    rotateGlobe: function(rotation) {
        if (!this.cy || !this.isActive) return;

        const nodes = this.activeNodes || this.cy.nodes();

        // Use configured rotation center
        const centerX = this.rotationCenter.x;
        const centerY = this.rotationCenter.y;
        const centerZ = this.rotationCenter.z;

        // Debug: show rotation center relative to container and in absolute coords
        try {
            const rect = this.cy.container().getBoundingClientRect();
            const relativeX = (centerX - rect.left).toFixed(2);
            const relativeY = (centerY - rect.top).toFixed(2);
        } catch (e) {
        }

        let rotatedNodes = 0;
        const containers = [];

        nodes.forEach(node => {
            const position = this.nodePositions.get(node.id());
            if (!position) return;

            // Collect container nodes to reposition after children move
            if (node.data && node.data('type') === 'container') {
                containers.push({ node, position });
                return;
            }

            // Determine rotation center: container center if inside one, otherwise global center
            let rotCenterX = centerX;
            let rotCenterY = centerY;
            let rotCenterZ = centerZ;

            const parent = node.parent();
            if (parent && parent.data && parent.data('type') === 'container') {
                const cPos = this.nodePositions.get(parent.id());
                if (cPos) {
                    rotCenterX = cPos.x;
                    rotCenterY = cPos.y;
                    rotCenterZ = cPos.z;
                }
            }

            // Translate relative to rotation center using current positions
            const translatedX = position.x - rotCenterX;
            const translatedY = position.y - rotCenterY;
            const translatedZ = position.z - rotCenterZ;


            // Rotate point around origin with delta angles
            const rotated = this.rotatePoint(
                translatedX,
                translatedY,
                translatedZ,
                rotation.x,
                rotation.y,
                rotation.z
            );

            // Translate back to rotation center
            const finalX = rotated.x + rotCenterX;
            const finalY = rotated.y + rotCenterY;
            const finalZ = rotated.z + rotCenterZ;

            // Update stored position
            position.x = finalX;
            position.y = finalY;
            position.z = finalZ;

            // Update Cytoscape position
            node.position({ x: finalX, y: finalY });

            rotatedNodes++;
        });

        // Restore container positions after child rotations
        containers.forEach(({ node, position }) => {
            node.position({ x: position.x, y: position.y });
        });

        // Track cumulative rotation for info/debugging
        this.currentRotation.x += rotation.x;
        this.currentRotation.y += rotation.y;
        this.currentRotation.z += rotation.z;

        // Update depth effects with immediate application
        this.applyDepthEffects(nodes);
    },

    // Rotate a point in 3D space
    rotatePoint: function(x, y, z, rx, ry, rz) {
        // Apply rotations in order: X, Y, Z
        let px = x, py = y, pz = z;
        
        // Rotate around X axis
        const cosX = Math.cos(rx);
        const sinX = Math.sin(rx);
        const tempY = py * cosX - pz * sinX;
        const tempZ = py * sinX + pz * cosX;
        py = tempY;
        pz = tempZ;
        
        // Rotate around Y axis
        const cosY = Math.cos(ry);
        const sinY = Math.sin(ry);
        const tempX = px * cosY + pz * sinY;
        const tempZ2 = -px * sinY + pz * cosY;
        px = tempX;
        pz = tempZ2;
        
        // Rotate around Z axis
        const cosZ = Math.cos(rz);
        const sinZ = Math.sin(rz);
        const tempX2 = px * cosZ - py * sinZ;
        const tempY2 = px * sinZ + py * cosZ;
        px = tempX2;
        py = tempY2;
        
        return { x: px, y: py, z: pz };
    },

    // Set configuration
    setConfig: function(newConfig) {
        this.config = { ...this.config, ...newConfig };
    },

    // Enable/disable the layout
    setEnabled: function(enabled) {
        this.config.enabled = enabled;
        if (!enabled) {
            this.stopAutoRotation();
            this.resetVisualEffects();
        }
    },

    // Reset visual effects to default
    resetVisualEffects: function() {
        if (!this.cy) return;

        const nodes = this.activeNodes || this.cy.nodes();
        nodes.forEach(node => {
            node.style({
                'background-color': node.data('color') || (window.QuantickleConfig?.defaultNodeColor || '#ffffff'),
                'width': node.data('size') || 20,
                'height': node.data('size') || 20,
                'opacity': 1,
                'z-index': 100
            });
        });

        this.activeNodes = null;
    },

    // Get current layout information
    getLayoutInfo: function() {
        return {
            isActive: this.isActive,
            nodeCount: this.nodePositions.size,
            rotation: this.currentRotation,
            config: this.config
        };
    },

    // Clean up resources
    destroy: function() {
        this.stopAutoRotation();
        this.resetVisualEffects();
        this.isActive = false;
        this.nodePositions.clear();
    }
};

// 3D Globe Layout loaded successfully
