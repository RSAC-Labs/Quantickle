/**
 * Data Manager Module
 * 
 * Handles graph data storage, processing, transformation, and optimization.
 * Self-contained module with clean external interfaces.
 * 
 * DEPENDENCIES:
 * - Cytoscape instance (passed via constructor)
 * - UI notification system (passed via constructor)
 * - Configuration object (passed via constructor)
 * 
 * PROVIDES:
 * - setGraphData(data) - sets and processes graph data
 * - getGraphData() - gets current graph data
 * - transformCoordinates(nodes) - transforms 3D coordinates to plotting space
 * - analyzeDataStructure(data) - analyzes data patterns and suggests layouts
 * - buildOptimizedIndexes(data) - creates performance indexes
 * - handleLargeDatasets(data) - optimizes for large data
 * - performanceMetrics() - gets current performance info
 * 
 * FEATURES:
 * - 3D coordinate transformation and plotting space management
 * - Performance optimization for large datasets
 * - Data structure analysis and layout recommendations
 * - Indexed data structures for fast lookups
 * - Memory-efficient data processing
 * - Coordinate system transformations
 */

class DataManagerModule {
    constructor(dependencies) {
        // Required dependencies injected via constructor
        this.cy = dependencies.cytoscape;
        this.notifications = dependencies.notifications;
        this.config = dependencies.config;
        
        // Internal state
        this.graphData = { nodes: [], edges: [] };
        this.currentView = 'graph';
        this.currentTable = 'nodeTypes';
        this.currentDataTable = 'nodes';
        this.currentGraphName = 'Unsaved graph';
        this.currentGraphFileName = 'Unsaved graph.qut';
        this.unsavedChanges = false;
        this.isLoading = false;
        this.lastTransformationParams = null;
        this.nodeLimit = 15000;

        this.relationshipsCache = [];
        this.relationshipIndex = new Map();

        this.graphIdentity = {
            id: null,
            title: 'Unsaved graph',
            metadata: { source: 'Manually added' }
        };
        
        // Performance optimization structures
        this.nodeIndex = new Map();
        this.edgeIndex = new Map();
        this.typeIndex = new Map();
        this.spatialIndex = new Map();
        
        // 3D plotting space configuration
        this.plottingSpace = {
            width: 1000,
            height: 1000,
            depth: 1000,
            origin: { x: 500, y: 500, z: 500 },
            margin: 0.1,
            rotationCenter: { x: 500, y: 500, z: 500 },
            type: 'cartesian',
            autoScale: true,
            preserveAspectRatio: true,
            transformationEnabled: false
        };
        
        // Performance metrics
        this.metrics = {
            lastProcessingTime: 0,
            nodeCount: 0,
            edgeCount: 0,
            indexingTime: 0,
            memoryUsage: 0
        };
        
        this.init();
    }
    
    /**
     * Initialize the data manager module
     */
    init() {
        this.setupDataOptimizations();
        this.initializePlottingSpace();
        this.attachUnsavedListeners();
        this.updateFileNameDisplay();
    }

    attachUnsavedListeners() {
        if (!this.cy) return;
        const handler = () => {
            if (this.isLoading) return;
            this.markUnsaved();
        };
        this.cy.on('add remove data', handler);
    }

    setGraphName(name, options = {}) {
        const extension = (this.config && this.config.fileExtension) || '.qut';
        const settings = {
            source: options.source || null,
            ensureExtension: options.ensureExtension === true,
            fallbackUnsaved: options.fallbackUnsaved || 'Unsaved graph'
        };

        const original = typeof name === 'string' ? name.trim() : '';
        let resolved = original;

        if (resolved && settings.ensureExtension && extension) {
            const lowerExt = extension.toLowerCase();
            if (!resolved.toLowerCase().endsWith(lowerExt)) {
                resolved = `${resolved}${extension}`;
            }
        }

        if (!resolved) {
            this.currentGraphName = settings.fallbackUnsaved;
            this.currentGraphFileName = `${settings.fallbackUnsaved}.qut`;
        } else {
            this.currentGraphName = resolved;
            this.currentGraphFileName = resolved;
        }

        this.unsavedChanges = false;

        if (this.graphIdentity && typeof this.graphIdentity === 'object') {
            const metadata = { ...(this.graphIdentity.metadata || {}) };
            if (resolved) {
                metadata.title = resolved;
                metadata.name = resolved;
                metadata.graphId = resolved;
                if (settings.source) {
                    metadata.saveSource = settings.source;
                }
            }
            this.graphIdentity = {
                ...this.graphIdentity,
                title: resolved || settings.fallbackUnsaved,
                metadata
            };
        }

        this.updateFileNameDisplay();
        return this.currentGraphName;
    }

    markUnsaved() {
        if (this.currentGraphName === 'Unsaved graph') return;
        if (!this.unsavedChanges) {
            this.unsavedChanges = true;
            this.updateFileNameDisplay();
        }
    }

    updateFileNameDisplay() {
        const name = this.currentGraphName || 'Unsaved graph';
        const display = this.unsavedChanges && name !== 'Unsaved graph'
            ? `${name} (unsaved)`
            : name;
        if (window.UI && typeof window.UI.updateGraphFileName === 'function') {
            window.UI.updateGraphFileName(display);
        }
    }
    
    /**
     * PUBLIC INTERFACE: Set and process graph data
     * @param {Object} data - Graph data with nodes and edges arrays
     */
    setGraphData(data) {
        const startTime = performance.now();

        try {
            if (!this.validateGraphData(data)) {
                throw new Error('Invalid graph data structure');
            }

            let normalizedData = data;
            if (window.QuantickleUtils && typeof window.QuantickleUtils.normalizeGraphIdentity === 'function') {
                normalizedData = window.QuantickleUtils.normalizeGraphIdentity(data, {
                    defaultTitle: data?.title || data?.graphName || data?.graphId || this.currentGraphName || 'Untitled graph',
                    defaultSource: () => data?.metadata?.source || this.graphIdentity?.metadata?.source || 'Manually added'
                });
            }

            const identityMetadata = normalizedData.metadata && typeof normalizedData.metadata === 'object'
                ? { ...normalizedData.metadata }
                : {};
            this.graphIdentity = {
                id: normalizedData.id || identityMetadata.id || window.QuantickleUtils?.generateUuid?.() || null,
                title: normalizedData.title || identityMetadata.title || identityMetadata.name || this.currentGraphName || 'Untitled graph',
                metadata: identityMetadata
            };

            // Store original data, normalizing format if needed
            this.graphData = {
                nodes: normalizedData.nodes.map(node => this.normalizeNodeFormat(node)),
                edges: normalizedData.edges.map(edge => this.normalizeEdgeFormat(edge))
            };

            this.relationshipsCache = [];
            this.relationshipIndex.clear();

            // Apply performance optimizations for large datasets
            if (normalizedData.nodes.length > this.nodeLimit) {
                this.notifications.show(`Large dataset detected (${normalizedData.nodes.length} nodes). Applying optimizations...`, 'warning');
                this.graphData = this.handleLargeDatasets(this.graphData);
            }
            
            // Build performance indexes
            this.buildOptimizedIndexes(this.graphData);
            
            // Transform coordinates if 3D data is present
            if (this.plottingSpace.transformationEnabled) {
                this.transformCoordinates(this.graphData.nodes);
            }
            
            // Update metrics
            this.updatePerformanceMetrics();
            this.metrics.lastProcessingTime = performance.now() - startTime;

        } catch (error) {
            console.error('Data processing failed:', error);
            this.notifications.show(`Data processing failed: ${error.message}`, 'error');
        }
    }

    /**
     * PUBLIC INTERFACE: Incrementally add a single node
     * @param {Object} node - Node to add
     * @returns {Object|null} Normalized node or null if invalid
     */
    addNode(node) {
        const startTime = performance.now();

        if (!node) return null;
        const normalized = this.normalizeNodeFormat(node);
        if (!normalized.id) return null;

        const existing = this.nodeIndex.get(normalized.id);
        if (existing) {
            this.replaceNodeInGraphData(normalized);
            this.removeFromTypeIndex(existing);
            this.removeFromSpatialIndex(existing);
        } else {
            this.graphData.nodes.push(normalized);
        }

        this.nodeIndex.set(normalized.id, normalized);
        this.addToTypeIndex(normalized);
        this.addToSpatialIndex(normalized);

        this.metrics.indexingTime = performance.now() - startTime;
        this.updateIncrementalMetrics();
        return normalized;
    }

    /**
     * PUBLIC INTERFACE: Incrementally add a single edge
     * @param {Object} edge - Edge to add
     * @returns {Object|null} Normalized edge or null if invalid
     */
    addEdge(edge) {
        const startTime = performance.now();

        if (!edge) return null;
        const normalized = this.normalizeEdgeFormat(edge);
        if (!normalized.id) return null;

        const existing = this.edgeIndex.get(normalized.id);
        if (existing) {
            this.replaceEdgeInGraphData(normalized);
        } else {
            this.graphData.edges.push(normalized);
        }

        this.edgeIndex.set(normalized.id, normalized);

        this.metrics.indexingTime = performance.now() - startTime;
        this.updateIncrementalMetrics();
        return normalized;
    }

    /**
     * PUBLIC INTERFACE: Apply incremental graph changes
     * @param {Object} delta - Graph delta with optional nodes and edges arrays
     * @returns {Object} Applied nodes and edges
     */
    applyDelta(delta = {}) {
        const startTime = performance.now();
        const nodes = Array.isArray(delta.nodes) ? delta.nodes : [];
        const edges = Array.isArray(delta.edges) ? delta.edges : [];

        const addedNodes = nodes
            .map(node => this.addNode(node))
            .filter(Boolean);
        const addedEdges = edges
            .map(edge => this.addEdge(edge))
            .filter(Boolean);

        const hasEdgesToProcess = addedEdges.length > 0;
        const shouldUpdateRelationships = hasEdgesToProcess
            || (this.relationshipsCache.length > 0 && addedNodes.length > 0);

        if (shouldUpdateRelationships) {
            this.updateRelationshipsDelta({ nodes: addedNodes, edges: addedEdges });
        }

        this.metrics.lastProcessingTime = performance.now() - startTime;
        return { nodes: addedNodes, edges: addedEdges };
    }
    
    /**
     * PUBLIC INTERFACE: Get current graph data
     * @returns {Object} Current graph data
     */
    getGraphData() {
        const identity = this.graphIdentity || {};
        const baseMetadata = identity.metadata ? { ...identity.metadata } : {};
        baseMetadata.nodeCount = this.graphData.nodes.length;
        baseMetadata.edgeCount = this.graphData.edges.length;
        baseMetadata.lastProcessed = new Date().toISOString();
        baseMetadata.hasCoordinates = this.hasCoordinateData();
        baseMetadata.plottingSpace = { ...this.plottingSpace };

        return {
            id: identity.id,
            title: identity.title,
            nodes: [...this.graphData.nodes],
            edges: [...this.graphData.edges],
            metadata: baseMetadata
        };
    }
    
    /**
     * PUBLIC INTERFACE: Transform coordinates to plotting space
     * @param {Array} nodes - Nodes with coordinate data
     * @returns {Array} Transformed nodes
     */
    transformCoordinates(nodes) {
        if (!nodes || nodes.length === 0) return nodes;
        
        const coordinateRanges = this.analyzeCoordinateRanges(nodes);
        if (!coordinateRanges) {
            return nodes;
        }
        
        return this.transformToPlottingSpace(nodes, coordinateRanges);
    }
    
    /**
     * PUBLIC INTERFACE: Analyze data structure and suggest optimal layout
     * @param {Object} data - Graph data to analyze
     * @returns {Object} Analysis results with layout recommendations
     */
    analyzeDataStructure(data) {
        const analysis = {
            nodeCount: data.nodes.length,
            edgeCount: data.edges.length,
            density: data.nodes.length > 0 ? (data.edges.length / data.nodes.length) : 0,
            hasCoordinates: this.hasCoordinateData(data.nodes),
            has3DCoordinates: this.has3DCoordinateData(data.nodes),
            isHierarchical: this.detectHierarchicalStructure(data),
            isNetwork: this.detectNetworkStructure(data),
            hasClusters: this.detectClusters(data),
            recommendedLayout: null,
            confidence: 0
        };
        
        // Determine optimal layout based on analysis
        analysis.recommendedLayout = this.recommendLayout(analysis);
        
        return analysis;
    }
    
    /**
     * PUBLIC INTERFACE: Build optimized indexes for fast data access
     * @param {Object} data - Graph data to index
     */
    buildOptimizedIndexes(data) {
        const startTime = performance.now();
        
        // Clear existing indexes
        this.clearIndexes();
        
        // Build node indexes
        data.nodes.forEach(node => {
            this.nodeIndex.set(node.id, node);
            
            // Type index
            const type = node.type || 'default';
            if (!this.typeIndex.has(type)) {
                this.typeIndex.set(type, []);
            }
            this.typeIndex.get(type).push(node);
            
            // Spatial index for coordinate-based queries
            if (node.x !== undefined && node.y !== undefined) {
                const spatialKey = this.getSpatialKey(node.x, node.y);
                if (!this.spatialIndex.has(spatialKey)) {
                    this.spatialIndex.set(spatialKey, []);
                }
                this.spatialIndex.get(spatialKey).push(node);
            }
        });
        
        // Build edge indexes
        data.edges.forEach(edge => {
            this.edgeIndex.set(edge.id, edge);
        });
        
        this.metrics.indexingTime = performance.now() - startTime;
    }

    addToTypeIndex(node) {
        const type = node.type || 'default';
        if (!this.typeIndex.has(type)) {
            this.typeIndex.set(type, []);
        }
        this.typeIndex.get(type).push(node);
    }

    removeFromTypeIndex(node) {
        const type = node.type || 'default';
        const collection = this.typeIndex.get(type);
        if (!collection) return;
        const index = collection.findIndex(entry => entry.id === node.id);
        if (index !== -1) {
            collection.splice(index, 1);
            if (collection.length === 0) {
                this.typeIndex.delete(type);
            }
        }
    }

    addToSpatialIndex(node) {
        if (node.x === undefined || node.y === undefined) return;
        const spatialKey = this.getSpatialKey(node.x, node.y);
        if (!this.spatialIndex.has(spatialKey)) {
            this.spatialIndex.set(spatialKey, []);
        }
        this.spatialIndex.get(spatialKey).push(node);
    }

    removeFromSpatialIndex(node) {
        if (node.x === undefined || node.y === undefined) return;
        const spatialKey = this.getSpatialKey(node.x, node.y);
        const collection = this.spatialIndex.get(spatialKey);
        if (!collection) return;
        const index = collection.findIndex(entry => entry.id === node.id);
        if (index !== -1) {
            collection.splice(index, 1);
            if (collection.length === 0) {
                this.spatialIndex.delete(spatialKey);
            }
        }
    }

    /**
     * PUBLIC INTERFACE: Handle large datasets with performance optimizations
     * @param {Object} data - Large dataset to optimize
     * @returns {Object} Optimized dataset
     */
    handleLargeDatasets(data) {
        const optimized = {
            nodes: [...data.nodes],
            edges: [...data.edges]
        };
        
        // Apply node limit
        if (optimized.nodes.length > this.nodeLimit) {
            this.notifications.show(`Limiting nodes to ${this.nodeLimit} for performance`, 'info');
            optimized.nodes = optimized.nodes.slice(0, this.nodeLimit);
            
            // Filter edges to only include those with valid nodes
            const nodeIds = new Set(optimized.nodes.map(n => n.id));
            optimized.edges = optimized.edges.filter(e => 
                nodeIds.has(e.source) && nodeIds.has(e.target)
            );
        }
        
        // Optimize labels for large datasets
        this.handleLargeDatasetLabels(optimized.nodes);
        
        return optimized;
    }
    
    /**
     * PUBLIC INTERFACE: Get performance metrics
     * @returns {Object} Current performance metrics
     */
    getPerformanceMetrics() {
        this.updatePerformanceMetrics();
        return { ...this.metrics };
    }
    
    /**
     * PUBLIC INTERFACE: Set plotting space transformation
     * @param {boolean} enabled - Whether to enable coordinate transformation
     */
    setPlottingSpaceTransformation(enabled) {
        this.plottingSpace.transformationEnabled = enabled;
    }
    
    /**
     * PUBLIC INTERFACE: Get plotting space status
     * @returns {Object} Current plotting space configuration
     */
    getPlottingSpaceStatus() {
        return {
            ...this.plottingSpace,
            hasCoordinateData: this.hasCoordinateData(),
            viewport: this.getViewportDimensions()
        };
    }
    
    /**
     * PUBLIC INTERFACE: Set node limit for performance
     * @param {number} limit - Maximum number of nodes to process
     */
    setNodeLimit(limit) {
        this.nodeLimit = Math.max(100, Math.min(50000, limit));
    }
    
    /**
     * PUBLIC INTERFACE: Search nodes by criteria
     * @param {Object} criteria - Search criteria
     * @returns {Array} Matching nodes
     */
    searchNodes(criteria) {
        if (criteria.type) {
            return this.typeIndex.get(criteria.type) || [];
        }
        
        if (criteria.spatial && criteria.spatial.x !== undefined && criteria.spatial.y !== undefined) {
            const spatialKey = this.getSpatialKey(criteria.spatial.x, criteria.spatial.y);
            return this.spatialIndex.get(spatialKey) || [];
        }
        
        if (criteria.id) {
            const node = this.nodeIndex.get(criteria.id);
            return node ? [node] : [];
        }
        
        // Fallback to linear search
        return this.graphData.nodes.filter(node => {
            return Object.keys(criteria).every(key => {
                if (typeof criteria[key] === 'string') {
                    return node[key] && node[key].toString().includes(criteria[key]);
                }
                return node[key] === criteria[key];
            });
        });
    }

    generateSampleData(nodeCount = 50) {
        const nodes = [];
        const edges = [];
        const nodeTypes = ['server', 'client', 'database', 'service', 'container'];
        for (let i = 0; i < nodeCount; i++) {
            const type = nodeTypes[i % nodeTypes.length];
            const settings = window.NodeTypes ? window.NodeTypes[type] || {} : {};
            nodes.push({
                id: `node-${i}`,
                label: `${type.charAt(0).toUpperCase() + type.slice(1)} ${i}`,
                type,
                color: settings.color,
                size: settings.size || 20,
                shape: settings.shape,
                icon: settings.icon
            });
        }
        for (let i = 0; i < nodeCount; i++) {
            const connections = Math.floor(Math.random() * 3) + 2;
            const connected = new Set();
            for (let j = 0; j < connections; j++) {
                let target = Math.floor(Math.random() * nodeCount);
                while (target === i || connected.has(target)) {
                    target = Math.floor(Math.random() * nodeCount);
                }
                connected.add(target);
                edges.push({
                    id: `edge-${i}-${target}`,
                    source: `node-${i}`,
                    target: `node-${target}`,
                    weight: Math.floor(Math.random() * 5) + 1,
                    label: `${i} → ${target}`
                });
            }
        }
        return { nodes, edges };
    }

    calculateRelationships(force = false) {
        if (!this.relationshipsCache.length || force) {
            this.rebuildRelationships();
        }

        return [...this.relationshipsCache];
    }

    updateRelationshipsDelta(delta = {}) {
        if (!this.relationshipsCache.length) {
            this.rebuildRelationships();
        }

        const edges = Array.isArray(delta.edges) ? delta.edges : [];
        const nodes = Array.isArray(delta.nodes) ? delta.nodes : [];
        const updatedPairs = new Set();

        edges.forEach(edge => {
            if (!edge || !edge.source || !edge.target) return;
            const key = this.getRelationshipKey(edge.source, edge.target);
            updatedPairs.add(key);
        });

        if (nodes.length > 0 && this.relationshipsCache.length > 0) {
            this.relationshipsCache.forEach(rel => {
                if (nodes.some(node => node && (node.id === rel.sourceId || node.id === rel.targetId))) {
                    const key = this.getRelationshipKey(rel.sourceId, rel.targetId);
                    updatedPairs.add(key);
                }
            });
        }

        updatedPairs.forEach(key => {
            const updated = this.buildRelationshipForKey(key);
            if (!updated) {
                this.relationshipIndex.delete(key);
                this.relationshipsCache = this.relationshipsCache.filter(rel => this.getRelationshipKey(rel.sourceId, rel.targetId) !== key);
                return;
            }

            this.relationshipIndex.set(key, updated);
            const existingIndex = this.relationshipsCache.findIndex(rel => this.getRelationshipKey(rel.sourceId, rel.targetId) === key);
            if (existingIndex >= 0) {
                this.relationshipsCache[existingIndex] = updated;
            } else {
                this.relationshipsCache.push(updated);
            }
        });

        return { relationships: [...this.relationshipsCache], updatedPairs: Array.from(updatedPairs) };
    }

    rebuildRelationships() {
        const processedPairs = new Set();
        this.relationshipIndex.clear();
        this.relationshipsCache = [];

        this.graphData.edges.forEach(edge => {
            const key = this.getRelationshipKey(edge.source, edge.target);
            if (processedPairs.has(key)) return;
            const relationship = this.buildRelationshipForKey(key, edge);
            if (relationship) {
                this.relationshipIndex.set(key, relationship);
                this.relationshipsCache.push(relationship);
                processedPairs.add(key);
            }
        });
    }

    getRelationshipKey(sourceId, targetId) {
        if (!sourceId || !targetId) return '';
        return sourceId < targetId ? `${sourceId}::${targetId}` : `${targetId}::${sourceId}`;
    }

    buildRelationshipForKey(key, preferredEdge = null) {
        const [a, b] = key.split('::');
        if (!a || !b) return null;

        const edge = preferredEdge || this.graphData.edges.find(e => this.getRelationshipKey(e.source, e.target) === key);
        if (!edge) {
            return null;
        }

        const sourceNode = this.nodeIndex.get(edge.source);
        const targetNode = this.nodeIndex.get(edge.target);
        if (!sourceNode || !targetNode) return null;

        return {
            sourceId: edge.source,
            targetId: edge.target,
            source: sourceNode.label,
            target: targetNode.label,
            type: 'connection',
            weight: edge.weight || 1,
            distance: this.calculateShortestPath(edge.source, edge.target)
        };
    }

    calculateShortestPath(sourceId, targetId) {
        const sourceNode = this.nodeIndex.get(sourceId);
        const targetNode = this.nodeIndex.get(targetId);
        if (!sourceNode || !targetNode) {
            return Infinity;
        }
        const dx = (targetNode.x || 0) - (sourceNode.x || 0);
        const dy = (targetNode.y || 0) - (sourceNode.y || 0);
        return Math.sqrt(dx * dx + dy * dy);
    }

    // === PRIVATE METHODS BELOW ===
    
    /**
     * Setup data optimization structures
     */
    setupDataOptimizations() {
        this.clearIndexes();
        
        // Check for Web Workers support
        if (typeof Worker !== 'undefined') {
        }
        
        // Initialize viewport monitoring
        this.setupViewportMonitoring();
    }
    
    /**
     * Initialize 3D plotting space
     */
    initializePlottingSpace() {
        if (this.config && this.config.plottingSpace) {
            this.plottingSpace = { ...this.plottingSpace, ...this.config.plottingSpace };
        }
    }
    
    /**
     * Validate graph data structure
     */
    validateGraphData(data) {
        if (!data || typeof data !== 'object') {
            return false;
        }
        if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
            return false;
        }
        
        // Allow empty data
        if (data.nodes.length === 0 && data.edges.length === 0) {
            return true;
        }
        
        // Check nodes have required fields (handle both Cytoscape and internal formats)
        for (const node of data.nodes) {
            const nodeId = node.id || (node.data && node.data.id);
            if (!nodeId) {
                return false;
            }
        }
        
        // Check edges have required fields (handle both Cytoscape and internal formats)
        for (const edge of data.edges) {
            const edgeId = edge.id || (edge.data && edge.data.id);
            const edgeSource = edge.source || (edge.data && edge.data.source);
            const edgeTarget = edge.target || (edge.data && edge.data.target);
            
            if (!edgeId || !edgeSource || !edgeTarget) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Analyze coordinate ranges in the dataset
     */
    analyzeCoordinateRanges(nodes) {
        const ranges = {
            x: { min: Infinity, max: -Infinity, hasCoords: false },
            y: { min: Infinity, max: -Infinity, hasCoords: false },
            z: { min: Infinity, max: -Infinity, hasCoords: false }
        };
        
        nodes.forEach(node => {
            // Check X coordinates
            if (node.x !== null && node.x !== undefined && !isNaN(node.x)) {
                ranges.x.hasCoords = true;
                ranges.x.min = Math.min(ranges.x.min, node.x);
                ranges.x.max = Math.max(ranges.x.max, node.x);
            }
            
            // Check Y coordinates
            if (node.y !== null && node.y !== undefined && !isNaN(node.y)) {
                ranges.y.hasCoords = true;
                ranges.y.min = Math.min(ranges.y.min, node.y);
                ranges.y.max = Math.max(ranges.y.max, node.y);
            }
            
            // Check Z coordinates
            if (node.z !== null && node.z !== undefined && !isNaN(node.z)) {
                ranges.z.hasCoords = true;
                ranges.z.min = Math.min(ranges.z.min, node.z);
                ranges.z.max = Math.max(ranges.z.max, node.z);
            }
        });
        
        // If no coordinates found, return null
        if (!ranges.x.hasCoords && !ranges.y.hasCoords && !ranges.z.hasCoords) {
            return null;
        }
        
        return ranges;
    }
    
    /**
     * Transform coordinates to fit the 3D plotting space
     */
    transformToPlottingSpace(nodes, coordinateRanges) {
        
        // Calculate data ranges
        const dataRanges = {
            x: coordinateRanges.x.hasCoords ? coordinateRanges.x.max - coordinateRanges.x.min : 0,
            y: coordinateRanges.y.hasCoords ? coordinateRanges.y.max - coordinateRanges.y.min : 0,
            z: coordinateRanges.z.hasCoords ? coordinateRanges.z.max - coordinateRanges.z.min : 0
        };
        
        // Calculate available space in plotting space (with margin)
        const marginPixels = {
            x: this.plottingSpace.width * this.plottingSpace.margin,
            y: this.plottingSpace.height * this.plottingSpace.margin,
            z: this.plottingSpace.depth * this.plottingSpace.margin
        };
        
        const availableSpace = {
            x: this.plottingSpace.width - (marginPixels.x * 2),
            y: this.plottingSpace.height - (marginPixels.y * 2),
            z: this.plottingSpace.depth - (marginPixels.z * 2)
        };
        
        // Calculate scale factors
        const scaleFactors = {
            x: dataRanges.x > 0 ? availableSpace.x / dataRanges.x : 1,
            y: dataRanges.y > 0 ? availableSpace.y / dataRanges.y : 1,
            z: dataRanges.z > 0 ? availableSpace.z / dataRanges.z : 1
        };
        
        // Use the smallest scale factor to maintain aspect ratio
        const scaleFactor = this.plottingSpace.preserveAspectRatio ? 
            Math.min(scaleFactors.x, scaleFactors.y, scaleFactors.z) : 1;
        
        // Calculate data center
        const dataCenter = {
            x: coordinateRanges.x.hasCoords ? (coordinateRanges.x.min + coordinateRanges.x.max) / 2 : 0,
            y: coordinateRanges.y.hasCoords ? (coordinateRanges.y.min + coordinateRanges.y.max) / 2 : 0,
            z: coordinateRanges.z.hasCoords ? (coordinateRanges.z.min + coordinateRanges.z.max) / 2 : 0
        };
        
        // Get viewport dimensions
        const viewport = this.getViewportDimensions();
        const actualOrigin = {
            x: viewport.width / 2,
            y: viewport.height / 2,
            z: this.plottingSpace.origin.z
        };
        
        // Transform each node
        return nodes.map(node => {
            const transformed = { ...node };
            
            if (coordinateRanges.x.hasCoords && node.x !== undefined) {
                transformed.x = actualOrigin.x + (node.x - dataCenter.x) * scaleFactor;
            }
            
            if (coordinateRanges.y.hasCoords && node.y !== undefined) {
                transformed.y = actualOrigin.y + (node.y - dataCenter.y) * scaleFactor;
            }
            
            if (coordinateRanges.z.hasCoords && node.z !== undefined) {
                transformed.z = actualOrigin.z + (node.z - dataCenter.z) * scaleFactor;
            }
            
            return transformed;
        });
    }
    
    /**
     * Check if data has coordinate information
     */
    hasCoordinateData(nodes = this.graphData.nodes) {
        return nodes.some(node => 
            (node.x !== undefined && node.x !== null) || 
            (node.y !== undefined && node.y !== null)
        );
    }
    
    /**
     * Check if data has 3D coordinate information
     */
    has3DCoordinateData(nodes = this.graphData.nodes) {
        return nodes.some(node => 
            node.z !== undefined && node.z !== null && !isNaN(node.z)
        );
    }
    
    /**
     * Get viewport dimensions
     */
    getViewportDimensions() {
        const cyContainer = document.getElementById('cy');
        if (cyContainer) {
            return {
                width: cyContainer.clientWidth,
                height: cyContainer.clientHeight
            };
        }
        return { width: 800, height: 600 }; // Fallback
    }
    
    /**
     * Update performance metrics
     */
    updatePerformanceMetrics() {
        this.metrics.nodeCount = this.graphData.nodes.length;
        this.metrics.edgeCount = this.graphData.edges.length;
        
        // Estimate memory usage
        if (typeof performance !== 'undefined' && performance.memory) {
            this.metrics.memoryUsage = performance.memory.usedJSHeapSize;
        }
    }
    
    /**
     * Handle labels for large datasets
     */
    handleLargeDatasetLabels(nodes) {
        if (nodes.length > 5000) {
            // For very large datasets, truncate labels to save memory
            nodes.forEach(node => {
                if (node.label && node.label.length > 20) {
                    node.label = node.label.substring(0, 17) + '...';
                }
            });
        }
    }
    
    /**
     * Detect hierarchical structure in data
     */
    detectHierarchicalStructure(data) {
        // Simple heuristic: check for tree-like structure
        const inDegrees = new Map();
        const outDegrees = new Map();
        
        data.edges.forEach(edge => {
            inDegrees.set(edge.target, (inDegrees.get(edge.target) || 0) + 1);
            outDegrees.set(edge.source, (outDegrees.get(edge.source) || 0) + 1);
        });
        
        // Check if most nodes have at most one parent
        const nodesWithMultipleParents = Array.from(inDegrees.values()).filter(degree => degree > 1).length;
        return nodesWithMultipleParents < data.nodes.length * 0.2; // Less than 20% have multiple parents
    }
    
    /**
     * Detect network structure in data
     */
    detectNetworkStructure(data) {
        const avgDegree = data.edges.length * 2 / data.nodes.length;
        return avgDegree > 2; // Networks typically have higher connectivity
    }
    
    /**
     * Detect clusters in data
     */
    detectClusters(data) {
        // Simple clustering detection based on node types or edge density
        const types = new Set(data.nodes.map(n => n.type || 'default'));
        return types.size > 1 && types.size < data.nodes.length * 0.5;
    }
    
    /**
     * Recommend optimal layout based on data analysis
     */
    recommendLayout(analysis) {
        if (analysis.hasCoordinates) {
            return { name: 'preset', confidence: 0.9 };
        }
        
        if (analysis.isHierarchical) {
            return { name: 'dagre', confidence: 0.8 };
        }
        
        if (analysis.nodeCount > 1000) {
            return { name: 'grid', confidence: 0.7 };
        }
        
        if (analysis.hasClusters) {
            return { name: 'cose', confidence: 0.7 };
        }
        
        if (analysis.density < 1) {
            return { name: 'breadthfirst', confidence: 0.6 };
        }
        
        return { name: 'cose', confidence: 0.5 };
    }
    
    /**
     * Get spatial key for spatial indexing
     */
    getSpatialKey(x, y, gridSize = 100) {
        const gridX = Math.floor(x / gridSize);
        const gridY = Math.floor(y / gridSize);
        return `${gridX},${gridY}`;
    }

    /**
     * Replace an existing node in graphData by ID
     */
    replaceNodeInGraphData(node) {
        const index = this.graphData.nodes.findIndex(entry => entry.id === node.id);
        if (index !== -1) {
            this.graphData.nodes[index] = node;
        } else {
            this.graphData.nodes.push(node);
        }
    }

    /**
     * Replace an existing edge in graphData by ID
     */
    replaceEdgeInGraphData(edge) {
        const index = this.graphData.edges.findIndex(entry => entry.id === edge.id);
        if (index !== -1) {
            this.graphData.edges[index] = edge;
        } else {
            this.graphData.edges.push(edge);
        }
    }

    /**
     * Update performance metrics for incremental operations
     */
    updateIncrementalMetrics() {
        this.metrics.nodeCount = this.graphData.nodes.length;
        this.metrics.edgeCount = this.graphData.edges.length;

        if (typeof performance !== 'undefined' && performance.memory) {
            this.metrics.memoryUsage = performance.memory.usedJSHeapSize;
        }
    }

    /**
     * Clear all indexes
     */
    clearIndexes() {
        this.nodeIndex.clear();
        this.edgeIndex.clear();
        this.typeIndex.clear();
        this.spatialIndex.clear();
    }
    
    /**
     * Setup viewport monitoring
     */
    setupViewportMonitoring() {
        if (typeof window !== 'undefined') {
            window.addEventListener('resize', () => {
                // Keep plotting space origin fixed regardless of viewport size
                this.plottingSpace.origin.x = 500;
                this.plottingSpace.origin.y = 500;
            });
        }
    }
    
    /**
     * Normalize node format (handle Cytoscape vs internal format)
     */
    normalizeNodeFormat(node) {
        const ensureClassString = (normalized, classSources) => {
            const tokens = [];
            const addToken = token => {
                if (!token) return;
                tokens.push(String(token));
            };

            classSources.forEach(source => {
                if (source == null) return;
                if (typeof source === 'function') return;
                if (Array.isArray(source)) {
                    source.forEach(item => addToken(item));
                } else if (typeof source === 'string') {
                    source
                        .split(/\s+/)
                        .filter(Boolean)
                        .forEach(item => addToken(item));
                } else {
                    addToken(source);
                }
            });

            const isContainer = normalized.type === 'container' || Boolean(normalized.isContainer);
            if (isContainer && !tokens.includes('container')) {
                tokens.push('container');
            }

            const uniqueTokens = [...new Set(tokens)];
            if (uniqueTokens.length > 0) {
                normalized.classes = uniqueTokens.join(' ');
            } else if (isContainer) {
                normalized.classes = 'container';
            } else {
                delete normalized.classes;
            }
        };

        const resolveNodeColor = (data = {}, styleSource) => {
            if (typeof data.color === 'string' && data.color.trim() !== '') {
                return data.color;
            }

            const getColorFromStyle = style => {
                if (!style) return null;
                if (typeof style === 'function') {
                    try {
                        const fnColor = style('background-color') || style('backgroundColor');
                        if (fnColor) return fnColor;
                    } catch (error) {
                        // Ignore style resolution errors and fall back to default
                    }
                    return null;
                }
                if (typeof style === 'object') {
                    return style['background-color'] || style['backgroundColor'] || style.color || null;
                }
                return null;
            };

            const styleColor = getColorFromStyle(styleSource) || getColorFromStyle(data.style);
            if (styleColor) {
                return styleColor;
            }

            return window.QuantickleConfig?.defaultNodeColor || '#ffffff';
        };

        if (node.data) {
            // Cytoscape format: { data: { id: 'x', ... }, position: { x, y } }
            const normalized = {
                ...node.data, // Include any other properties first
                id: node.data.id,
                label: node.data.label || node.data.id,
                type: node.data.type || 'default',
                size: node.data.size || 30,
                color: resolveNodeColor(node.data, node.style),
                x: node.position ? node.position.x : node.data.x,
                y: node.position ? node.position.y : node.data.y,
                z: node.data.z
            };

            // Preserve icon opacity if present in style
            if (normalized.iconOpacity == null && node.style) {
                const iconOpacity = node.style['background-opacity'];
                if (iconOpacity !== undefined) normalized.iconOpacity = iconOpacity;
            }

            ensureClassString(normalized, [node.data ? node.data.classes : undefined, node.classes, normalized.classes]);

            if (normalized.type === 'text' && window.QuantickleUtils && typeof window.QuantickleUtils.ensureNodeCallout === 'function') {
                window.QuantickleUtils.ensureNodeCallout(normalized, { defaultFormat: 'text', syncLegacy: false });
            }
            return normalized;
        } else {
            // Already in internal format
            const normalized = {
                ...node, // Include any other properties first
                id: node.id,
                label: node.label || node.id,
                type: node.type || 'default',
                size: node.size || 30,
                color: resolveNodeColor(node, node.style),
                x: node.x,
                y: node.y,
                z: node.z
            };

            ensureClassString(normalized, [node.classes, normalized.classes]);
            if (normalized.type === 'text' && window.QuantickleUtils && typeof window.QuantickleUtils.ensureNodeCallout === 'function') {
                window.QuantickleUtils.ensureNodeCallout(normalized, { defaultFormat: 'text', syncLegacy: false });
            }
            return normalized;
        }
    }
    
    /**
     * Normalize edge format (handle Cytoscape vs internal format)
     */
    normalizeEdgeFormat(edge) {
        if (edge.data) {
            // Cytoscape format: { data: { id: 'x', source: 'a', target: 'b', ... } }
            const normalized = {
                id: edge.data.id,
                source: edge.data.source,
                target: edge.data.target,
                label: edge.data.label || '',
                weight: edge.data.weight || 1,
                type: edge.data.type || 'default',
                ...edge.data // Include any other properties
            };
            // Preserve edge label if only present in style
            if (normalized.label === '' && edge.style) {
                const styleLabel = edge.style['label'];
                if (styleLabel) normalized.label = styleLabel;
            }
            // Preserve edge color if only present in style
            if (normalized.color == null && edge.style) {
                const lineColor = edge.style['line-color'];
                if (lineColor) normalized.color = lineColor;
            }
            return normalized;
        } else {
            // Already in internal format
            return {
                id: edge.id,
                source: edge.source,
                target: edge.target,
                label: edge.label || '',
                weight: edge.weight || 1,
                type: edge.type || 'default',
                ...edge // Include any other properties
            };
        }
    }
    
    /**
     * Cleanup method for module destruction
     */
    destroy() {
        this.clearIndexes();
        this.graphData = { nodes: [], edges: [] };
        this.cy = null;
        this.notifications = null;
        this.config = null;
    }
}

// Export for use
window.DataManagerModule = DataManagerModule;
