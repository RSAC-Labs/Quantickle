/**
 * LOD Manager Adapter
 * Manages switching between legacy and modular LOD (Level of Detail) implementations
 */
class LODManagerAdapter {
    constructor() {
        this.legacyInstance = null;
        this.currentImplementation = 'legacy';
        this.globalFunctionsExposed = false;
        
        // Function mapping for consistent interface
        this.functionMap = {
            // Core LOD functions
            'determineLODLevel': 'determineLODLevel',
            'applyLODRendering': 'applyLODRendering',
            'getLODConfig': 'getLODConfig',
            
            // Sampling functions
            'sampleNodes': 'sampleNodes',
            'sampleEdges': 'sampleEdges',
            'calculateNodeDegree': 'calculateNodeDegree',
            
            // Clustering functions
            'buildHierarchicalClusters': 'buildHierarchicalClusters',
            'createSpatialClusters': 'createSpatialClusters',
            'createConnectivityClusters': 'createConnectivityClusters',
            'createTypeClusters': 'createTypeClusters',
            
            // Visual simplification
            'applyVisualSimplifications': 'applyVisualSimplifications',
            'applyEdgeSimplifications': 'applyEdgeSimplifications',
            'applyAggressiveLOD': 'applyAggressiveLOD',
            
            // LOD level management
            'applyLODLevel': 'applyLODLevel',
            'adjustLODForZoom': 'adjustLODForZoom',
            
            // Reporting
            'lodManagerReport': 'generateLODManagerReport'
        };
        
        this.init();
    }
    
    /**
     * Initialize the adapter
     */
    init() {
        
        // Initialize legacy instance (GraphRenderer)
        if (window.GraphRenderer) {
            this.legacyInstance = window.GraphRenderer;
        }

        // Start with legacy implementation
        this.enableLegacyVersion();
    }
    
    /**
     * Get current status
     */
    getStatus() {
        const status = {
            modularAvailable: false,
            legacyAvailable: !!this.legacyInstance,
            currentImplementation: this.currentImplementation,
            globalFunctionsAvailable: this.getAvailableGlobalFunctions()
        };
        return status;
    }
    
    /**
     * Switch to legacy version
     */
    enableLegacyVersion() {
        if (!this.legacyInstance) {
            return false;
        }
        
        try {
            this.currentImplementation = 'legacy';
            this.exposeGlobalFunctions();
            return true;
        } catch (error) {
            console.error('LOD Manager Adapter: Failed to switch to legacy version:', error);
            return false;
        }
    }
    
    /**
     * Expose global functions based on current implementation
     */
    exposeGlobalFunctions() {
        
        // Remove existing global functions
        Object.keys(this.functionMap).forEach(funcName => {
            if (window[funcName]) {
                delete window[funcName];
            }
        });
        
        if (this.currentImplementation === 'legacy' && this.legacyInstance) {
            this.exposeLegacyGlobalFunctions();
        }
        
        this.globalFunctionsExposed = true;
    }
    
    /**
     * Expose legacy global functions
     */
    exposeLegacyGlobalFunctions() {
        const instance = this.legacyInstance;
        
        // Core LOD functions
        window.determineLODLevel = (nodeCount, edgeCount, performanceData) => {
            if (instance.determineLODLevel) {
                return instance.determineLODLevel(nodeCount, edgeCount);
            }
            return 'medium';
        };
        
        window.applyLODRendering = (graphData, lodLevel) => {
            if (instance.applyLODRendering) {
                return instance.applyLODRendering(graphData, lodLevel);
            }
            return { nodesToRender: graphData.nodes || [], edgesToRender: graphData.edges || [] };
        };
        
        window.getLODConfig = (level) => {
            if (instance.getLODConfig) {
                return instance.getLODConfig(level);
            }
            return { nodeSampling: 1.0, edgeSampling: 1.0 };
        };
        
        // Sampling functions
        window.sampleNodes = (nodes, sampleSize, strategy, allEdges) => {
            if (instance.sampleNodes) {
                return instance.sampleNodes(nodes, sampleSize, strategy, allEdges);
            }
            return nodes.slice(0, sampleSize);
        };
        
        window.sampleEdges = (edges, sampleSize) => {
            if (instance.sampleEdges) {
                return instance.sampleEdges(edges, sampleSize);
            }
            return edges.slice(0, sampleSize);
        };
        
        window.calculateNodeDegree = (node, allNodes, allEdges) => {
            if (instance.calculateNodeDegree) {
                return instance.calculateNodeDegree(node, allNodes, allEdges);
            }
            return 0;
        };
        
        // Clustering functions
        window.buildHierarchicalClusters = () => {
            if (instance.buildHierarchicalClusters) {
                return instance.buildHierarchicalClusters();
            }
            return null;
        };
        
        window.createSpatialClusters = (nodes, maxClusterSize) => {
            if (instance.createSpatialClusters) {
                return instance.createSpatialClusters(nodes, maxClusterSize);
            }
            return [];
        };
        
        window.createConnectivityClusters = (nodes, edges, maxClusterSize) => {
            if (instance.createConnectivityClusters) {
                return instance.createConnectivityClusters(nodes, edges, maxClusterSize);
            }
            return [];
        };
        
        window.createTypeClusters = (nodes, maxClusterSize) => {
            if (instance.createTypeClusters) {
                return instance.createTypeClusters(nodes, maxClusterSize);
            }
            return [];
        };
        
        // Visual simplification
        window.applyVisualSimplifications = (nodes, config) => {
            if (instance.applyVisualSimplifications) {
                return instance.applyVisualSimplifications(nodes, config);
            }
            return nodes;
        };
        
        window.applyEdgeSimplifications = (edges, config) => {
            if (instance.applyEdgeSimplifications) {
                return instance.applyEdgeSimplifications(edges, config);
            }
            return edges;
        };
        
        window.applyAggressiveLOD = () => {
            if (instance.applyAggressiveLOD) {
                return instance.applyAggressiveLOD();
            }
            return false;
        };
        
        // LOD level management
        window.applyLODLevel = (level) => {
            if (instance.applyLODLevel) {
                return instance.applyLODLevel(level);
            }
            return false;
        };
        
        window.adjustLODForZoom = () => {
            if (instance.adjustLODForZoom) {
                return instance.adjustLODForZoom();
            }
            return false;
        };
        
        // Reporting
        window.lodManagerReport = () => {
            const report = {
                timestamp: new Date().toISOString(),
                implementation: 'legacy',
                currentLODLevel: instance.currentLODLevel || 'unknown',
                hierarchicalClusters: !!instance.hierarchicalClusters,
                capabilities: ['basicLOD', 'nodeSampling', 'edgeFiltering', 'clustering', 'aggressiveLOD']
            };
            return report;
        };
    }
    
    /**
     * Get list of available global functions
     */
    getAvailableGlobalFunctions() {
        const availableFunctions = [];
        
        Object.keys(this.functionMap).forEach(funcName => {
            if (window[funcName] && typeof window[funcName] === 'function') {
                availableFunctions.push(funcName);
            }
        });
        
        return availableFunctions;
    }
    
    /**
     * Update global functions (force refresh)
     */
    updateGlobalFunctions() {
        this.exposeGlobalFunctions();
    }
    
    /**
     * Test current implementation
     */
    testImplementation() {
        const status = this.getStatus();
        
        // Test basic function availability
        const testResults = {
            functionsExposed: this.getAvailableGlobalFunctions().length,
            lodDeterminationSupported: typeof window.determineLODLevel === 'function',
            lodRenderingSupported: typeof window.applyLODRendering === 'function',
            clusteringSupported: typeof window.buildHierarchicalClusters === 'function',
            samplingSupported: typeof window.sampleNodes === 'function',
            reportingSupported: typeof window.lodManagerReport === 'function'
        };
        return testResults;
    }
}

// Auto-initialize if we have access to required dependencies
if (typeof window !== 'undefined') {
    window.LODManagerAdapter = new LODManagerAdapter();
    
    // Also expose the adapter globally for testing
    window.LODManagerAdapter = window.LODManagerAdapter;
}
