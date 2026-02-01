// Level of Detail (LOD) System for Quantickle
// Implements hierarchical clustering for zoom-based graph simplification

window.LODSystem = {
    // Configuration
    config: {
        enabled: false, // Start with LOD disabled by default
        debounceTime: 300, // Increased debounce time for better performance
        minNodesForActivation: 10000, // Disable LOD entirely below this size
        // Size thresholds for LOD activation
        sizeThresholds: {
            small: 200,    // Graphs under this size never get LOD
            medium: 300,   // Graphs under this size get limited LOD (reduced from 500)
            large: 800     // Graphs over this size get full LOD (reduced from 1000)
        },
        clusterThresholds: {
            spatial: 100,    // Spatial cluster size
            connectivity: 50, // Connectivity cluster size
            type: 25        // Type cluster size
        },
        zoomLevels: {
            coarse: 0.5,    // Zoom level for coarse detail (increased for earlier activation)
            medium: 0.8,    // Zoom level for medium detail (increased for earlier activation)
            fine: 1.0       // Zoom level for fine detail
        }
    },

    // State
    hierarchicalClusters: null,
    currentLODLevel: 'fine',
    pendingLODLevel: null,
    isProcessing: false,
    sizeBasedDisabled: false,

    // Initialize LOD system
    init: function(cy) {
        if (!cy) {
            console.error('LOD System: Cytoscape instance required');
            return;
        }

        this.cy = cy;

        this.refreshActivationState();

        // Only set up LOD if enabled and not disabled due to graph size
        if (this.config.enabled && !this.sizeBasedDisabled) {
            // Set up zoom event listener
            this.setupZoomListener();

            // Build initial clusters
            this.buildHierarchicalClusters();
        }
    },

    // Set up zoom event listener with debouncing
    setupZoomListener: function() {
        if (!this.cy) return;

        // Only add zoom listener if LOD is enabled, active, and we don't already have one
        if (this.config.enabled && !this.sizeBasedDisabled && !this.zoomHandler) {
            this.zoomHandler = (evt) => {
                // Skip if processing
                if (this.isProcessing) return;
                
                // Debounce zoom events with longer delay for performance
                clearTimeout(this.zoomTimeout);
                this.zoomTimeout = setTimeout(() => {
                    // Use requestAnimationFrame to avoid blocking the main thread
                    requestAnimationFrame(() => {
                        this.adjustLODForZoom();
                    });
                }, this.config.debounceTime);
            };

            this.cy.on('zoom', this.zoomHandler);
        }
    },

    // Remove zoom event listener
    removeZoomListener: function() {
        if (this.cy && this.zoomHandler) {
            this.cy.off('zoom', this.zoomHandler);
            this.zoomHandler = null;
        }
    },

    // Build hierarchical clusters for LOD system
    buildHierarchicalClusters: function() {
        // Skip if LOD is disabled
        if (!this.config.enabled || this.sizeBasedDisabled) {
            return;
        }
        
        if (!this.cy) return;
        
        const nodes = this.cy.nodes();
        const edges = this.cy.edges();
        
        // Skip clustering for small graphs to avoid performance issues
        if (nodes.length < this.config.sizeThresholds.small) {
            this.hierarchicalClusters = {
                levels: [],
                nodeToCluster: new Map(),
                clusterToNodes: new Map()
            };
            return;
        }
        
        this.hierarchicalClusters = {
            levels: [],
            nodeToCluster: new Map(),
            clusterToNodes: new Map()
        };
        
        // Use requestAnimationFrame to avoid blocking the main thread
        requestAnimationFrame(() => {
            // Level 1: Spatial clustering (coarse) - only for large graphs
            const level1Clusters = nodes.length >= this.config.sizeThresholds.large ? 
                this.createSpatialClusters(nodes, this.config.clusterThresholds.spatial) : [];
            
            // Level 2: Connectivity clustering (medium) - only for medium+ graphs
            const level2Clusters = nodes.length >= this.config.sizeThresholds.medium ? 
                this.createConnectivityClusters(nodes, edges, this.config.clusterThresholds.connectivity) : [];
            
            // Level 3: Type-based clustering (fine) - only for medium+ graphs
            const level3Clusters = nodes.length >= this.config.sizeThresholds.medium ? 
                this.createTypeClusters(nodes, this.config.clusterThresholds.type) : [];
            
            this.hierarchicalClusters.levels = [
                { name: 'coarse', clusters: level1Clusters, threshold: this.config.zoomLevels.coarse },
                { name: 'medium', clusters: level2Clusters, threshold: this.config.zoomLevels.medium },
                { name: 'fine', clusters: level3Clusters, threshold: this.config.zoomLevels.fine }
            ];

            // Build lookup maps
            this.buildClusterLookups();

            if (this.pendingLODLevel) {
                const pendingLevel = this.pendingLODLevel;
                const applied = this.applyLODLevel(pendingLevel);
                if (applied) {
                    this.currentLODLevel = pendingLevel;
                    this.pendingLODLevel = null;
                }
            }
        });
    },

    // Create spatial clusters using grid-based approach
    createSpatialClusters: function(nodes, maxClusterSize) {
        const clusters = [];
        
        // Use larger grid size for better performance
        const gridSize = 300;
        const grid = new Map();
        
        // Process nodes in batches to avoid blocking
        const batchSize = 100;
        for (let i = 0; i < nodes.length; i += batchSize) {
            const batch = nodes.slice(i, i + batchSize);
            
            batch.forEach(node => {
                const pos = node.position();
                const gridX = Math.floor(pos.x / gridSize);
                const gridY = Math.floor(pos.y / gridSize);
                const key = `${gridX},${gridY}`;
                
                if (!grid.has(key)) {
                    grid.set(key, []);
                }
                grid.get(key).push(node);
            });
        }
        
        // Convert grid cells to clusters
        grid.forEach((cellNodes, key) => {
            if (cellNodes.length > 0) {
                const cluster = {
                    id: `spatial_${key}`,
                    type: 'spatial',
                    nodes: cellNodes,
                    size: cellNodes.length,
                    representative: cellNodes[0] // Use first node as representative for speed
                };
                clusters.push(cluster);
            }
        });
        
        return clusters;
    },

    // Create connectivity-based clusters using connected components
    createConnectivityClusters: function(nodes, edges, maxClusterSize) {
        const clusters = [];
        const visited = new Set();
        
        // Use connected components as clusters, but limit component size for performance
        nodes.forEach(node => {
            if (visited.has(node.id())) return;
            
            const component = this.findConnectedComponent(node, visited, maxClusterSize);
            if (component.length > 0) {
                const cluster = {
                    id: `connectivity_${clusters.length}`,
                    type: 'connectivity',
                    nodes: component,
                    size: component.length,
                    representative: component[0] // Use first node as representative for speed
                };
                clusters.push(cluster);
            }
        });
        
        return clusters;
    },

    // Create type-based clusters
    createTypeClusters: function(nodes, maxClusterSize) {
        const clusters = [];
        const typeGroups = new Map();
        
        // Group nodes by type
        nodes.forEach(node => {
            const type = node.data('type') || 'default';
            if (!typeGroups.has(type)) {
                typeGroups.set(type, []);
            }
            typeGroups.get(type).push(node);
        });
        
        // Create clusters for each type
        typeGroups.forEach((typeNodes, type) => {
            if (typeNodes.length > 0) {
                const cluster = {
                    id: `type_${type}`,
                    type: 'type',
                    nodes: typeNodes,
                    size: typeNodes.length,
                    representative: typeNodes[0] // Use first node as representative for speed
                };
                clusters.push(cluster);
            }
        });
        
        return clusters;
    },

    // Find connected component for a node
    findConnectedComponent: function(startNode, visited, maxSize = 100) {
        const component = [];
        const queue = [startNode];
        
        while (queue.length > 0 && component.length < maxSize) {
            const node = queue.shift();
            if (visited.has(node.id())) continue;
            
            visited.add(node.id());
            component.push(node);
            
            // Add connected nodes to queue (limit for performance)
            const connectedNodes = node.connectedNodes();
            for (let i = 0; i < Math.min(connectedNodes.length, 10); i++) {
                const connectedNode = connectedNodes[i];
                if (!visited.has(connectedNode.id())) {
                    queue.push(connectedNode);
                }
            }
        }
        
        return component;
    },

    // Calculate center of a cluster
    calculateClusterCenter: function(nodes) {
        if (nodes.length === 0) return { x: 0, y: 0 };
        
        const sumX = nodes.reduce((sum, n) => sum + n.x, 0);
        const sumY = nodes.reduce((sum, n) => sum + n.y, 0);
        
        return {
            x: sumX / nodes.length,
            y: sumY / nodes.length
        };
    },

    // Calculate bounds of a cluster
    calculateClusterBounds: function(nodes) {
        if (nodes.length === 0) return { x1: 0, y1: 0, x2: 0, y2: 0 };
        
        const xs = nodes.map(n => n.x);
        const ys = nodes.map(n => n.y);
        
        return {
            x1: Math.min(...xs),
            y1: Math.min(...ys),
            x2: Math.max(...xs),
            y2: Math.max(...ys)
        };
    },

    // Select representative node for cluster
    selectClusterRepresentative: function(nodes) {
        if (nodes.length === 0) return null;
        
        // Select node closest to center
        const center = this.calculateClusterCenter(nodes);
        let closestNode = nodes[0];
        let minDistance = Infinity;
        
        nodes.forEach(nodeData => {
            const node = nodeData.node || nodeData;
            const pos = node.position ? node.position() : node;
            const distance = Math.sqrt((pos.x - center.x) ** 2 + (pos.y - center.y) ** 2);
            
            if (distance < minDistance) {
                minDistance = distance;
                closestNode = node;
            }
        });
        
        return closestNode;
    },

    // Build lookup maps for efficient cluster queries
    buildClusterLookups: function() {
        if (!this.hierarchicalClusters) return;
        
        this.hierarchicalClusters.nodeToCluster.clear();
        this.hierarchicalClusters.clusterToNodes.clear();
        
        this.hierarchicalClusters.levels.forEach((level, levelIndex) => {
            level.clusters.forEach(cluster => {
                // Map cluster to nodes
                this.hierarchicalClusters.clusterToNodes.set(cluster.id, cluster.nodes);
                
                // Map nodes to clusters
                cluster.nodes.forEach(node => {
                    if (!this.hierarchicalClusters.nodeToCluster.has(node.id())) {
                        this.hierarchicalClusters.nodeToCluster.set(node.id(), {});
                    }
                    this.hierarchicalClusters.nodeToCluster.get(node.id())[level.name] = cluster;
                });
            });
        });
    },

    // Determine appropriate LOD level based on zoom and graph size
    determineLODLevel: function(zoom) {
        if (!this.cy) return 'fine';
        
        const nodeCount = this.cy.nodes().length;
        const edgeCount = this.cy.edges().length;

        if (this.sizeBasedDisabled) {
            return 'fine';
        }

        // Don't apply LOD for small graphs
        if (nodeCount < this.config.sizeThresholds.small) {
            return 'fine';
        }
        
        // For medium graphs, only apply medium LOD when very zoomed out
        if (nodeCount < this.config.sizeThresholds.medium) {
            if (zoom < 0.2) {
                return 'medium';
            } else {
                return 'fine';
            }
        } else if (nodeCount < this.config.sizeThresholds.large) {
            if (zoom < this.config.zoomLevels.medium) {
                return 'medium';
            }
            return 'fine';
        } else if (nodeCount >= this.config.sizeThresholds.large * 2) {
            // For very large graphs, be more aggressive with LOD
            if (zoom < 0.5) {
                return 'coarse';
            } else if (zoom < 0.8) {
                return 'medium';
            }
            return 'fine';
        } else if (nodeCount >= this.config.sizeThresholds.large) {
            // For large graphs, apply full LOD system
            if (zoom < this.config.zoomLevels.coarse) {
                return 'coarse';
            } else if (zoom < this.config.zoomLevels.medium) {
                return 'medium';
            }
            return 'fine';
        }

        // Default to fine detail
        return 'fine';
    },

    // Adjust LOD based on current zoom level
    adjustLODForZoom: function() {
        // This function should only be called when LOD is enabled
        if (!this.config.enabled || this.sizeBasedDisabled) {
            return;
        }
        
        if (!this.cy || !this.hierarchicalClusters) return;

        this.isProcessing = true;

        const zoom = this.cy.zoom();
        const newLODLevel = this.determineLODLevel(zoom);

        // Debug logging for LOD decisions
        if (newLODLevel !== this.currentLODLevel) {
            const applied = this.applyLODLevel(newLODLevel);
            if (applied) {
                this.currentLODLevel = newLODLevel;
                this.pendingLODLevel = null;
            } else {
                this.pendingLODLevel = newLODLevel;
            }
        }

        this.isProcessing = false;
    },

    // Apply LOD level to the graph
    applyLODLevel: function(level) {
        // Double-check that LOD is enabled
        if (!this.config.enabled || this.sizeBasedDisabled) {
            return;
        }

        if (!this.hierarchicalClusters || !Array.isArray(this.hierarchicalClusters.levels)) {
            return false;
        }

        const levelData = this.hierarchicalClusters.levels.find(l => l.name === level);
        if (!levelData) {
            return false;
        }

        const nodes = this.cy.nodes();
        const edges = this.cy.edges();

        const clusterEdgeCounts = level === 'coarse'
            ? this.buildClusterEdgeCounts(edges, level, levelData)

            : new Map();

        const membershipLookup = this.hierarchicalClusters?.nodeToCluster || new Map();

        // Use requestAnimationFrame to avoid blocking the main thread
        requestAnimationFrame(() => {
            // Apply visual simplifications based on level
            switch (level) {
                case 'coarse':
                    this.applyCoarseLOD(nodes, edges, levelData, clusterEdgeCounts);
                    break;
                case 'medium':
                    this.applyMediumLOD(nodes, edges, levelData, membershipLookup);
                    break;
                case 'fine':
                    this.applyFineLOD(nodes, edges, levelData);
                    break;
            }
        });

        return true;
    },

    // Apply coarse LOD (zoomed out) - show only cluster representatives
    applyCoarseLOD: function(nodes, edges, levelData, clusterEdgeCounts) {
        // Show only cluster representatives prominently
        nodes.forEach(node => {
            const cluster = this.findClusterInLevel(node, levelData.name, levelData);
            const isRepresentative = this.isRepresentativeNode(node, cluster, levelData);
            const isPinned = node.data('pinned') === true;

            if (isRepresentative) {
                // Show representative nodes with cluster size info
                const clusterSize = this.getClusterSize(cluster);

                const showLabel = node.data('labelVisible') !== false;
                const borderWidth = isPinned ? 6 : 3;
                const borderColor = isPinned ? '#1e90ff' : '#ffffff';
                node.style({
                    'width': Math.min(30, 10 + clusterSize * 0.5),
                    'height': Math.min(30, 10 + clusterSize * 0.5),
                    'label': showLabel
                        ? (clusterSize > 1
                            ? `${node.data('label')} (${clusterSize})`
                            : node.data('label'))
                        : '',
                    'font-size': 10,
                    'opacity': 1,
                    'z-index': 1000,
                    'background-color': '#ff6b6b',
                    'border-width': borderWidth,
                    'border-color': borderColor
                });
            } else {
                // Hide non-representative nodes
                node.style({
                    'opacity': 0.05,
                    'width': 3,
                    'height': 3,
                    'label': '',
                    'z-index': 1
                });
                if (isPinned) {
                    node.style({
                        'border-width': 6,
                        'border-color': '#1e90ff'
                    });
                }
            }
        });

        // Show only inter-cluster edges
        edges.forEach(edge => {
            const source = edge.source();
            const target = edge.target();
            const sourceCluster = this.findClusterInLevel(source, levelData.name, levelData);
            const targetCluster = this.findClusterInLevel(target, levelData.name, levelData);

            if (sourceCluster && targetCluster && sourceCluster.id !== targetCluster.id) {
                // Show inter-cluster edges with thickness based on connection count
                const connectionCount = this.countInterClusterConnections(
                    clusterEdgeCounts,
                    sourceCluster,
                    targetCluster
                );
                edge.style({
                    'opacity': 0.7,
                    'width': Math.min(5, 1 + connectionCount * 0.5),
                    'z-index': 500,
                    'line-color': '#4ecdc4'
                });
            } else {
                // Hide intra-cluster edges
                edge.style({
                    'opacity': 0.05,
                    'width': 0.5,
                    'z-index': 1
                });
            }
        });
    },

    // Apply medium LOD (medium zoom) - show more detail
    applyMediumLOD: function(nodes, edges, levelData, membershipLookup) {
        // Show representative nodes prominently, others with reduced detail
        const defaultColor = window.QuantickleConfig?.defaultNodeColor || '#ffffff';
        nodes.forEach(node => {
            const cluster = this.findClusterInLevel(node, levelData.name, levelData);
            const isRepresentative = this.isRepresentativeNode(node, cluster, levelData);
            const color = node.data('color') || defaultColor;
            const isPinned = node.data('pinned') === true;
            if (isRepresentative) {
                // Show representative nodes with full detail
                const nodeSize = node.data('size') || 30;
                node.style({
                    'width': nodeSize,
                    'height': nodeSize,
                    'text-opacity': 1,
                    'font-size': 10,
                    'opacity': 1,
                    'z-index': 1000,
                    'background-color': color,
                    'border-width': isPinned ? 6 : 2,
                    'border-color': isPinned ? '#1e90ff' : '#ffffff',
                    'label': node.data('labelVisible') === false ? '' : node.data('label')
                });
            } else {
                // Show other nodes with reduced detail
                node.style({
                    'opacity': 0.6,
                    'width': 8,
                    'height': 8,
                    'label': '',
                    'z-index': 100,
                    'background-color': color
                });
                if (isPinned) {
                    node.style({
                        'border-width': 6,
                        'border-color': '#1e90ff'
                    });
                }
            }
        });
        
        // Show more edges but with reduced opacity
        edges.forEach(edge => {
            edge.style({
                'opacity': 0.4,
                'width': 1,
                'z-index': 50,
                'line-color': '#333333'
            });
        });
    },

    // Apply fine LOD (zoomed in) - show full detail
    applyFineLOD: function(nodes, edges, levelData) {
        // For small graphs, just reset to default styles
        if (nodes.length < this.config.sizeThresholds.small) {
            const defaultColor = window.QuantickleConfig?.defaultNodeColor || '#ffffff';
            // Apply styles individually including color
            nodes.forEach(node => {
                const nodeSize = node.data('size') || 30;
                const color = node.data('color') || defaultColor;
                const isPinned = node.data('pinned') === true;
                node.style({
                    'width': nodeSize,
                    'height': nodeSize,
                    'text-opacity': 1,
                    'font-size': 10,
                    'opacity': 1,
                    'z-index': 100,
                    'background-color': color,
                    'border-width': isPinned ? 6 : 2,
                    'border-color': isPinned ? '#1e90ff' : '#ffffff'
                });
            });

            edges.style({
                'opacity': 0.9,
                'width': 1,
                'z-index': 50,
                'line-color': '#333333'
            });
        } else {
            // For larger graphs, apply styles individually
            const defaultColor = window.QuantickleConfig?.defaultNodeColor || '#ffffff';
            nodes.forEach(node => {
                const nodeSize = node.data('size') || 30;
                const color = node.data('color') || defaultColor;
                const isPinned = node.data('pinned') === true;
                node.style({
                    'width': nodeSize,
                    'height': nodeSize,
                    'text-opacity': 1,
                    'font-size': 10,
                    'opacity': 1,
                    'z-index': 100,
                    'background-color': color,
                    'border-width': isPinned ? 6 : 2,
                    'border-color': isPinned ? '#1e90ff' : '#ffffff'
                });
            });

            edges.forEach(edge => {
                edge.style({
                    'opacity': 0.9,
                    'width': 1,
                    'z-index': 50,
                    'line-color': '#333333'
                });
            });
        }

        // Apply label visibility after styling
        nodes.forEach(node => {
            const label = node.data('labelVisible') === false ? '' : node.data('label');
            node.style('label', label);
        });
    },

    // Get cached cluster membership for a node
    getNodeClusterMembership: function(nodeId) {
        if (!nodeId || !this.hierarchicalClusters || !this.hierarchicalClusters.nodeToCluster) {
            return null;
        }

        return this.hierarchicalClusters.nodeToCluster.get(nodeId) || null;
    },

    // Resolve cluster for a node at a specific level using cached membership with fallback
    findClusterInLevel: function(node, levelName, levelData) {
        if (!node) return null;

        const nodeId = this.getClusterMemberId(node);
        if (!nodeId) return null;

        const membership = this.getNodeClusterMembership(nodeId);
        if (membership && membership[levelName]) {
            return membership[levelName];
        }

        if (!levelData || !Array.isArray(levelData.clusters)) {
            return null;
        }

        for (const cluster of levelData.clusters) {
            if (!Array.isArray(cluster.nodes)) continue;
            if (cluster.nodes.some(member => this.getClusterMemberId(member) === nodeId)) {
                if (this.hierarchicalClusters && this.hierarchicalClusters.nodeToCluster) {
                    const entry = membership || {};
                    entry[levelName] = cluster;
                    this.hierarchicalClusters.nodeToCluster.set(nodeId, entry);
                }
                return cluster;
            }
        }

        return null;
    },

    // Normalize node references to a consistent ID string
    getClusterMemberId: function(member) {
        if (!member) return null;

        if (typeof member === 'string') {
            return member;
        }

        if (typeof member.id === 'function') {
            return member.id();
        }

        if (member.node) {
            const nodeRef = member.node;
            if (nodeRef) {
                if (typeof nodeRef.id === 'function') {
                    return nodeRef.id();
                }
                if (nodeRef.id) {
                    return `${nodeRef.id}`;
                }
            }
        }

        if (member.id) {
            return `${member.id}`;
        }

        return null;
    },

    // Determine if the provided node is the representative for the cluster
    isRepresentativeNode: function(node, cluster, levelData) {
        if (!node) return false;

        const nodeId = this.getClusterMemberId(node);
        if (!nodeId) return false;

        if (cluster && cluster.representative) {
            const representativeId = this.getClusterMemberId(cluster.representative);
            if (representativeId) {
                return representativeId === nodeId;
            }
        }

        if (cluster) {
            return false;
        }

        if (!levelData || !Array.isArray(levelData.clusters)) {
            return false;
        }

        return levelData.clusters.some(candidate => {
            if (!candidate || !candidate.representative) return false;
            const representativeId = this.getClusterMemberId(candidate.representative);
            return representativeId === nodeId;
        });
    },

    // Safely derive cluster size information
    getClusterSize: function(cluster) {
        if (!cluster) return 1;

        if (typeof cluster.size === 'number' && !Number.isNaN(cluster.size)) {
            return cluster.size;
        }

        if (Array.isArray(cluster.nodes)) {
            return cluster.nodes.length;
        }

        return 1;
    },

    // Count connections between two clusters
    countInterClusterConnections: function(clusterEdgeCounts, cluster1, cluster2) {
        if (!cluster1 || !cluster2) return 0;
        const key = this.getClusterEdgeKey(cluster1.id, cluster2.id);
        return clusterEdgeCounts.get(key) || 0;
    },

    // Build cached edge counts between clusters for current level
    buildClusterEdgeCounts: function(edges, levelName, levelData) {
        const edgeCounts = new Map();
        edges.forEach(edge => {
            const sourceCluster = this.findClusterInLevel(edge.source(), levelName, levelData);
            const targetCluster = this.findClusterInLevel(edge.target(), levelName, levelData);

            if (!sourceCluster || !targetCluster) return;
            if (sourceCluster.id === targetCluster.id) return;

            const key = this.getClusterEdgeKey(sourceCluster.id, targetCluster.id);
            edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
        });

        return edgeCounts;
    },

    // Normalize cluster pair key for adjacency lookups
    getClusterEdgeKey: function(clusterIdA, clusterIdB) {
        return clusterIdA < clusterIdB
            ? `${clusterIdA}|${clusterIdB}`
            : `${clusterIdB}|${clusterIdA}`;
    },

    // Enable/disable LOD system
    setEnabled: function(enabled) {
        this.config.enabled = enabled;

        if (!this.cy) {
            return;
        }

        if (!enabled) {
            this.removeZoomListener();
            this.hierarchicalClusters = null;
            this.restoreFullDetail();
            return;
        }

        this.refreshActivationState();

        if (this.sizeBasedDisabled) {
            return;
        }

        this.buildHierarchicalClusters();
        this.setupZoomListener();
        this.adjustLODForZoom();
    },

    // Update cluster data when graph changes
    updateClusters: function() {
        if (!this.config.enabled) {
            return;
        }

        this.refreshActivationState();

        if (this.sizeBasedDisabled) {
            return;
        }

        this.buildHierarchicalClusters();
    },

    // Get current LOD level
    getCurrentLevel: function() {
        return this.currentLODLevel;
    },

    // Expose whether LOD is temporarily disabled due to graph size
    isTemporarilyDisabledForSize: function() {
        return this.sizeBasedDisabled;
    },

    // Reset styles back to full-detail defaults
    restoreFullDetail: function() {
        if (!this.cy) return;

        this.currentLODLevel = 'fine';

        const nodes = this.cy.nodes();
        const edges = this.cy.edges();

        const defaultColor = window.QuantickleConfig?.defaultNodeColor || '#ffffff';
        nodes.forEach(node => {
            const nodeSize = node.data('size') || 30;
            const color = node.data('color') || defaultColor;
            const isPinned = node.data('pinned') === true;
            node.style({
                'width': nodeSize,
                'height': nodeSize,
                'text-opacity': 1,
                'font-size': 10,
                'opacity': 1,
                'z-index': 100,
                'background-color': color,
                'border-width': isPinned ? 6 : 2,
                'border-color': isPinned ? '#1e90ff' : '#ffffff'
            });
        });

        edges.style({
            'opacity': 0.9,
            'width': 1,
            'z-index': 50,
            'line-color': '#333333'
        });

        nodes.forEach(node => {
            const label = node.data('labelVisible') === false ? '' : node.data('label');
            node.style('label', label);
        });
    },

    // Refresh whether LOD should be active based on the current graph size
    refreshActivationState: function() {
        if (!this.cy) {
            this.sizeBasedDisabled = false;
            return;
        }

        const nodeCount = this.cy.nodes().length;
        const shouldDisable = nodeCount < this.config.minNodesForActivation;

        if (shouldDisable) {
            if (!this.sizeBasedDisabled) {
                this.sizeBasedDisabled = true;
                this.hierarchicalClusters = null;
                this.removeZoomListener();
                this.restoreFullDetail();
            }
        } else if (this.sizeBasedDisabled) {
            this.sizeBasedDisabled = false;
        }
    },

    // Get cluster information for debugging
    getClusterInfo: function() {
        if (!this.hierarchicalClusters) return null;
        
        return {
            levels: this.hierarchicalClusters.levels.map(level => ({
                name: level.name,
                clusterCount: level.clusters.length,
                totalNodes: level.clusters.reduce((sum, cluster) => sum + cluster.size, 0)
            })),
            currentLevel: this.currentLODLevel
        };
    }
};
