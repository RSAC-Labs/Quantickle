// Client-side API for Quantickle
// Provides REST-like endpoints for adding data to graphs

window.QuantickleAPI = {
    // In-memory storage for graph data
    graphData: new Map(),
    
    // Initialize the API
    init: function() {
        this.setupGlobalEndpoints();
    },
    
    // Setup global endpoints that can be called from anywhere
    setupGlobalEndpoints: function() {
        // Make API available globally
        window.addGraphData = this.addData.bind(this);
        window.addGraphDataBulk = this.addDataBulk.bind(this);
        window.getGraphData = this.getData.bind(this);
        window.listGraphs = this.listGraphs.bind(this);
        window.clearGraph = this.clearGraph.bind(this);
    },
    
    // Parse CSV-like data
    parseCSVRow: function(csvRow) {
        const values = csvRow.split(',').map(val => val.trim());
        
        // Expected format: source_id,source_type,source_label,target_id,target_type,target_label,relationship_type,relationship_label
        if (values.length >= 8) {
            return {
                source_id: values[0],
                source_type: values[1],
                source_label: values[2],
                target_id: values[3],
                target_type: values[4],
                target_label: values[5],
                relationship_type: values[6],
                relationship_label: values[7]
            };
        }
        
        // Fallback for simpler format: id,type,label
        if (values.length >= 3) {
            return {
                id: values[0],
                type: values[1],
                label: values[2]
            };
        }
        
        return null;
    },
    
    // Create node data compatible with Quantickle
    createNodeData: function(id, type, label) {
        return {
            data: {
                id: id,
                label: label,
                type: type,
                size: 20,
                shape: 'round-rectangle',
                color: window.QuantickleConfig?.defaultNodeColor || '#ffffff'
            }
        };
    },
    
    // Create edge data compatible with Quantickle
    createEdgeData: function(sourceId, targetId, relationshipType, relationshipLabel) {
        return {
            data: {
                id: `${sourceId}-${targetId}`,
                source: sourceId,
                target: targetId,
                label: relationshipLabel || relationshipType,
                type: relationshipType
            }
        };
    },
    
    // Add data to graph (main API endpoint)
    addData: function(graphId, csvRow, { skipUpdate = false } = {}) {
        
        // Initialize graph data if it doesn't exist
        if (!this.graphData.has(graphId)) {
            this.graphData.set(graphId, {
                nodes: [],
                edges: [],
                nodeMap: new Map(), // Track existing nodes to avoid duplicates
                edgeMap: new Map()   // Track existing edges to avoid duplicates
            });
        }
        
        const graph = this.graphData.get(graphId);
        const parsedData = this.parseCSVRow(csvRow);
        
        if (!parsedData) {
            console.error('Invalid CSV format:', csvRow);
            return { success: false, error: 'Invalid CSV format' };
        }
        
        // Handle full relationship data (source -> target)
        if (parsedData.source_id && parsedData.target_id) {
            // Add source node if it doesn't exist
            if (!graph.nodeMap.has(parsedData.source_id)) {
                const sourceNode = this.createNodeData(
                    parsedData.source_id,
                    parsedData.source_type,
                    parsedData.source_label
                );
                graph.nodes.push(sourceNode);
                graph.nodeMap.set(parsedData.source_id, sourceNode);
            }
            
            // Add target node if it doesn't exist
            if (!graph.nodeMap.has(parsedData.target_id)) {
                const targetNode = this.createNodeData(
                    parsedData.target_id,
                    parsedData.target_type,
                    parsedData.target_label
                );
                graph.nodes.push(targetNode);
                graph.nodeMap.set(parsedData.target_id, targetNode);
            }
            
            // Add edge if it doesn't exist
            const edgeId = `${parsedData.source_id}-${parsedData.target_id}`;
            if (!graph.edgeMap.has(edgeId)) {
                const edge = this.createEdgeData(
                    parsedData.source_id,
                    parsedData.target_id,
                    parsedData.relationship_type,
                    parsedData.relationship_label
                );
                graph.edges.push(edge);
                graph.edgeMap.set(edgeId, edge);
            }
        } else if (parsedData.id) {
            // Handle single node data
            if (!graph.nodeMap.has(parsedData.id)) {
                const node = this.createNodeData(
                    parsedData.id,
                    parsedData.type,
                    parsedData.label
                );
                graph.nodes.push(node);
                graph.nodeMap.set(parsedData.id, node);
            }
        }
        
        // Update the graph if DataManager is available
        if (!skipUpdate) {
            this.updateGraph(graphId);
        }
        
        return {
            success: true,
            graphId: graphId,
            addedNodes: graph.nodes.length,
            addedEdges: graph.edges.length,
            message: 'Data added successfully'
        };
    },

    // Add multiple rows of data and update once at the end
    addDataBulk: function(graphId, csvRows) {
        csvRows.forEach(row => this.addData(graphId, row, { skipUpdate: true }));
        this.updateGraph(graphId);

        const graph = this.graphData.get(graphId) || { nodes: [], edges: [] };
        return {
            success: true,
            graphId: graphId,
            addedNodes: graph.nodes.length,
            addedEdges: graph.edges.length,
            message: 'Bulk data added successfully'
        };
    },
    
    // Get graph data
    getData: function(graphId) {
        const data = this.graphData.get(graphId);

        if (!data) {
            return { error: 'Graph not found' };
        }

        return {
            graphId: graphId,
            nodes: data.nodes,
            edges: data.edges,
            nodeCount: data.nodes.length,
            edgeCount: data.edges.length,
            layoutSettings: data.layoutSettings,
            metadata: data.metadata,
            title: data.title,
            graphName: data.graphName,
            id: data.id
        };
    },
    
    // List all graphs
    listGraphs: function() {
        const graphs = Array.from(this.graphData.keys()).map(graphId => {
            const data = this.graphData.get(graphId);
            return {
                graphId: graphId,
                nodeCount: data.nodes.length,
                edgeCount: data.edges.length
            };
        });
        
        return { graphs };
    },
    
    // Clear graph data
    clearGraph: function(graphId) {
        if (this.graphData.has(graphId)) {
            this.graphData.delete(graphId);
            return { success: true, message: 'Graph cleared successfully' };
        } else {
            return { error: 'Graph not found' };
        }
    },
    
    // Update the graph visualization
    updateGraph: function(graphId) {
        const data = this.graphData.get(graphId);
        if (!data) return;

        // Apply graph updates after ensuring domains are loaded
        const applyGraph = () => {
            const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
            const edges = Array.isArray(data?.edges) ? data.edges : [];
            const layoutSettings = data?.layoutSettings || null;
            const savedLayout = layoutSettings?.currentLayout;
            const hasSavedLayout = typeof savedLayout === 'string' ? savedLayout.trim() !== '' : Boolean(savedLayout);
            const hasSavedPositions = nodes.length > 0 && nodes.some(node => {
                if (!node) {
                    return false;
                }

                const hasPositionObject = node.position &&
                    node.position.x !== undefined &&
                    node.position.y !== undefined;

                const hasTopLevelCoords = node.x !== undefined &&
                    node.y !== undefined;

                const dataEntry = node.data || {};
                const hasDataCoords = dataEntry.x !== undefined &&
                    dataEntry.y !== undefined;

                return hasPositionObject || hasTopLevelCoords || hasDataCoords;
            });
            const shouldRespectSavedLayout = hasSavedLayout || hasSavedPositions;

            if (window.LayoutManager) {
                if (hasSavedLayout) {
                    window.LayoutManager.currentLayout = savedLayout;
                    if (typeof window.LayoutManager.updateLayoutDropdown === 'function') {
                        try {
                            window.LayoutManager.updateLayoutDropdown();
                        } catch (dropdownError) {
                            console.warn('Error updating layout dropdown during API graph update:', dropdownError);
                        }
                    }
                } else if (typeof window.LayoutManager.ensureGridLayoutDefault === 'function') {
                    window.LayoutManager.ensureGridLayoutDefault();
                }
            }

            if (shouldRespectSavedLayout && window.GraphRenderer) {
                window.GraphRenderer.skipNextLayoutApplication = true;
            }

            if (window.DataManager) {
                const sanitizedGraph = {
                    nodes,
                    edges
                };

                if (layoutSettings) sanitizedGraph.layoutSettings = layoutSettings;
                if (data?.metadata) sanitizedGraph.metadata = data.metadata;
                if (data?.title) sanitizedGraph.title = data.title;
                if (data?.graphName) sanitizedGraph.graphName = data.graphName;
                if (data?.graphId) sanitizedGraph.graphId = data.graphId;
                if (data?.id) sanitizedGraph.id = data.id;

                window.DataManager.setGraphData(sanitizedGraph);

                if (window.GraphManager) {
                    window.GraphManager.currentGraph = sanitizedGraph;
                    if (typeof window.GraphManager.updateGraphUI === 'function') {
                        try {
                            window.GraphManager.updateGraphUI();
                        } catch (uiError) {
                            console.warn('Error updating GraphManager UI during API graph update:', uiError);
                        }
                    }
                }

                // Re-render the graph
                if (window.GraphRenderer) {
                    window.GraphRenderer.renderGraph();
                }

                // Update tables
                if (window.TableManager) {
                    window.TableManager.updateTables(true);
                    window.TableManager.updateTotalDataTable();
                }
            }
        };

        if (window.DomainLoader && typeof window.DomainLoader.autoLoadDomainsForGraph === 'function') {
            window.DomainLoader.autoLoadDomainsForGraph(data)
                .then(applyGraph)
                .catch(err => {
                    console.error('Error auto-loading domains:', err);
                    applyGraph();
                });
        } else {
            applyGraph();
        }
    },

    // Load graph data into the visualization
    loadGraph: function(graphId) {
        const data = this.getData(graphId);
        if (data.error) {
            console.error('Graph not found:', graphId);
            return false;
        }

        const applyGraph = () => {
            const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
            const edges = Array.isArray(data?.edges) ? data.edges : [];
            const layoutSettings = data?.layoutSettings || null;
            const savedLayout = layoutSettings?.currentLayout;
            const hasSavedLayout = typeof savedLayout === 'string' ? savedLayout.trim() !== '' : Boolean(savedLayout);
            const hasSavedPositions = nodes.length > 0 && nodes.some(node => {
                if (!node) {
                    return false;
                }

                const hasPositionObject = node.position &&
                    node.position.x !== undefined &&
                    node.position.y !== undefined;

                const hasTopLevelCoords = node.x !== undefined &&
                    node.y !== undefined;

                const dataEntry = node.data || {};
                const hasDataCoords = dataEntry.x !== undefined &&
                    dataEntry.y !== undefined;

                return hasPositionObject || hasTopLevelCoords || hasDataCoords;
            });
            const shouldRespectSavedLayout = hasSavedLayout || hasSavedPositions;

            if (window.LayoutManager) {
                if (hasSavedLayout) {
                    window.LayoutManager.currentLayout = savedLayout;
                    if (typeof window.LayoutManager.updateLayoutDropdown === 'function') {
                        try {
                            window.LayoutManager.updateLayoutDropdown();
                        } catch (dropdownError) {
                            console.warn('Error updating layout dropdown during API graph load:', dropdownError);
                        }
                    }
                } else if (typeof window.LayoutManager.ensureGridLayoutDefault === 'function') {
                    window.LayoutManager.ensureGridLayoutDefault();
                }
            }

            if (shouldRespectSavedLayout && window.GraphRenderer) {
                window.GraphRenderer.skipNextLayoutApplication = true;
            }

            if (window.DataManager) {
                const sanitizedGraph = {
                    nodes,
                    edges
                };

                if (layoutSettings) sanitizedGraph.layoutSettings = layoutSettings;
                if (data?.metadata) sanitizedGraph.metadata = data.metadata;
                if (data?.title) sanitizedGraph.title = data.title;
                if (data?.graphName) sanitizedGraph.graphName = data.graphName;
                if (data?.graphId) sanitizedGraph.graphId = data.graphId;
                if (data?.id) sanitizedGraph.id = data.id;

                window.DataManager.setGraphData(sanitizedGraph);

                if (window.GraphManager) {
                    window.GraphManager.currentGraph = sanitizedGraph;
                    if (typeof window.GraphManager.updateGraphUI === 'function') {
                        try {
                            window.GraphManager.updateGraphUI();
                        } catch (uiError) {
                            console.warn('Error updating GraphManager UI during API graph load:', uiError);
                        }
                    }
                }

                // Re-render the graph
                if (window.GraphRenderer) {
                    window.GraphRenderer.renderGraph();
                }

                // Update tables
                if (window.TableManager) {
                    window.TableManager.updateTables(true);
                    window.TableManager.updateTotalDataTable();
                }
                return true;
            }
            return false;
        };

        if (window.DomainLoader && typeof window.DomainLoader.autoLoadDomainsForGraph === 'function') {
            window.DomainLoader.autoLoadDomainsForGraph(data)
                .then(() => applyGraph())
                .catch(err => {
                    console.error('Error auto-loading domains:', err);
                    applyGraph();
                });
            return true;
        }

        return applyGraph();
    }
};

// Initialize API when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.QuantickleAPI.init();
}); 
