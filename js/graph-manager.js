// Graph Manager for Quantickle
// Handles graph data operations and integrates with file manager

window.GraphManager = {
    // Current graph data
    currentGraph: null,
    
    // Initialize graph manager
    init: function() {
        this.setupGraphUI();
    },
    
    // Setup graph management UI
    setupGraphUI: function() {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            const graphSection = document.createElement('div');
            graphSection.className = 'control-group';
            graphSection.innerHTML = `
                <label class="control-label">Graph Operations</label>
                <button id="clearGraphBtn" class="control" style="margin-bottom: 5px;">🗑️ Clear Graph</button>
                <button id="exportGraphBtn" class="control" style="margin-bottom: 5px;">📤 Export Graph</button>
                <button id="importGraphBtn" class="control" style="margin-bottom: 10px;">📥 Import Data</button>
                <div id="graphStats" style="margin-top: 10px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 5px;">
                    <div><strong>Graph:</strong> <span id="graphName">-</span></div>
                    <div><strong>Nodes:</strong> <span id="nodeCount">0</span></div>
                    <div><strong>Edges:</strong> <span id="edgeCount">0</span></div>
                </div>
            `;
            
            // Insert after file management section
            const fileSection = sidebar.querySelector('.control-group');
            if (fileSection) {
                fileSection.parentNode.insertBefore(graphSection, fileSection.nextSibling);
            }
            
            // Add event listeners
            document.getElementById('clearGraphBtn').addEventListener('click', () => {
                this.clearCurrentGraph();
            });
            
            document.getElementById('exportGraphBtn').addEventListener('click', () => {
                this.showExportDialog();
            });
            
            document.getElementById('importGraphBtn').addEventListener('click', () => {
                this.showImportDialog();
            });
        }
    },
    
    // Loading state to prevent recursive calls
    _isLoading: false,
    _isRestoring: false,
    _pendingTimelineRestore: false,
    _restoreScheduled: false,
    _timelineRebuildTimers: null,
    _pendingTimelineLockTimer: null,

    _ensureTimelineRebuildTimerSet: function() {
        if (!this._timelineRebuildTimers) {
            this._timelineRebuildTimers = new Set();
        }
        return this._timelineRebuildTimers;
    },

    _registerTimelineRebuildTimer: function(callback, delayMs) {
        const timers = this._ensureTimelineRebuildTimerSet();
        const timeoutId = setTimeout(() => {
            try {
                timers.delete(timeoutId);
            } catch (deleteError) {
                console.warn('Error cleaning up timeline rebuild timer:', deleteError);
            }
            try {
                callback();
            } catch (callbackError) {
                console.warn('Error executing timeline rebuild timer callback:', callbackError);
            }
        }, delayMs);
        timers.add(timeoutId);
        return timeoutId;
    },

    _clearPendingTimelineRebuilds: function() {
        if (!this._timelineRebuildTimers || this._timelineRebuildTimers.size === 0) {
            this._timelineRebuildTimers = null;
            return;
        }

        this._timelineRebuildTimers.forEach(timeoutId => {
            try {
                clearTimeout(timeoutId);
            } catch (clearError) {
                console.warn('Error clearing pending timeline rebuild timer:', clearError);
            }
        });

        this._timelineRebuildTimers.clear();
        this._timelineRebuildTimers = null;
    },

    _refreshGraphReturnNodePlacement: function(delayMs = 0) {
        const renderer = window.GraphRenderer;
        if (renderer && typeof renderer.refreshGraphReturnNodePlacement === 'function') {
            renderer.refreshGraphReturnNodePlacement({ delay: delayMs });
            return;
        }

        const attemptRefresh = () => {
            try {
                if (!renderer || !renderer.cy || typeof renderer.cy.nodes !== 'function') {
                    return;
                }

                const returnNodes = renderer.cy.nodes('.graph-return-node');
                if (!returnNodes || !returnNodes.length) {
                    return;
                }

                const applyDimensions = typeof renderer.applyGraphReturnNodeDimensions === 'function'
                    ? renderer.applyGraphReturnNodeDimensions.bind(renderer)
                    : null;
                const calculateDimensions = typeof renderer.calculateGraphReturnNodeDimensions === 'function'
                    ? renderer.calculateGraphReturnNodeDimensions.bind(renderer)
                    : null;
                const calculatePosition = typeof renderer.calculateGraphReturnNodePosition === 'function'
                    ? renderer.calculateGraphReturnNodePosition.bind(renderer)
                    : null;

                let cachedDimensions = null;

                const adjustNode = (node) => {
                    if (!node) {
                        return;
                    }

                    if (applyDimensions) {
                        try {
                            applyDimensions(node);
                            return;
                        } catch (applyError) {
                        }
                    }

                    if (!calculatePosition) {
                        return;
                    }

                    if (!cachedDimensions && calculateDimensions) {
                        try {
                            cachedDimensions = calculateDimensions();
                        } catch (dimensionError) {
                            cachedDimensions = null;
                        }
                    }

                    let position = null;
                    try {
                        position = calculatePosition(cachedDimensions);
                    } catch (positionError) {
                        position = null;
                    }

                    if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
                        try {
                            if (typeof node.position === 'function') {
                                node.position(position);
                            }
                        } catch (setPositionError) {
                        }
                    }
                };

                if (typeof returnNodes.forEach === 'function') {
                    returnNodes.forEach(adjustNode);
                } else if (Array.isArray(returnNodes)) {
                    returnNodes.forEach(adjustNode);
                } else if (typeof returnNodes.length === 'number') {
                    for (let i = 0; i < returnNodes.length; i += 1) {
                        adjustNode(returnNodes[i]);
                    }
                } else {
                    adjustNode(returnNodes);
                }
            } catch (error) {
                console.warn('Unable to refresh graph return node placement:', error);
            }
        };

        if (delayMs && delayMs > 0) {
            setTimeout(attemptRefresh, delayMs);
        } else {
            attemptRefresh();
        }
    },

    _isHtmlLikeString: function(value) {
        if (typeof value !== 'string') {
            return false;
        }
        const trimmed = value.trim();
        if (!trimmed || !/[<>]/.test(trimmed)) {
            return false;
        }
        if (/<\s*\/?\s*[a-z][\s>]/i.test(trimmed) || /<\/\s*[a-z]/i.test(trimmed)) {
            return true;
        }
        if (typeof DOMParser !== 'undefined') {
            try {
                const parsed = new DOMParser().parseFromString(trimmed, 'text/html');
                return !!(parsed && parsed.body && parsed.body.children && parsed.body.children.length);
            } catch (error) {
                return false;
            }
        }
        return false;
    },

    _normalizeGraphLinkPayload: function(...candidates) {
        const resolver = (typeof window !== 'undefined' ? window.GraphReferenceResolver : null)
            || (typeof globalThis !== 'undefined' ? globalThis.GraphReferenceResolver : null);

        const normalizeSourceValue = (value) => {
            if (typeof value !== 'string') {
                return '';
            }
            const trimmed = value.trim().toLowerCase();
            if (!trimmed) {
                return '';
            }
            if (trimmed === 'auto') {
                return 'store';
            }
            if (['file', 'neo4j', 'url', 'store'].includes(trimmed)) {
                return trimmed;
            }
            return '';
        };

        const inferSourceFromKey = (key) => {
            if (typeof key !== 'string') {
                return 'store';
            }
            const trimmed = key.trim();
            if (!trimmed) {
                return 'store';
            }
            if (/^https?:\/\//i.test(trimmed)) {
                return 'url';
            }
            if (/[\\/]/.test(trimmed) || /\.qut$/i.test(trimmed)) {
                return 'file';
            }
            return 'store';
        };

        const normalizeWithResolver = (candidate) => {
            if (!resolver || typeof resolver.normalize !== 'function') {
                return null;
            }
            if (typeof candidate === 'string' && this._isHtmlLikeString(candidate)) {
                return null;
            }
            try {
                const normalized = resolver.normalize(candidate);
                if (normalized && normalized.key) {
                    const resolvedSource = normalizeSourceValue(normalized.source)
                        || inferSourceFromKey(normalized.key);
                    return { source: resolvedSource, key: normalized.key };
                }
            } catch (error) {
                console.debug('GraphReferenceResolver.normalize failed while upgrading graph link payload', error);
            }
            return null;
        };

        for (const candidate of candidates) {
            if (!candidate) {
                continue;
            }

            const resolverNormalized = normalizeWithResolver(candidate);
            if (resolverNormalized) {
                return resolverNormalized;
            }

            if (typeof candidate === 'string') {
                const trimmed = candidate.trim();
                if (trimmed) {
                    if (this._isHtmlLikeString(trimmed)) {
                        continue;
                    }
                    return { source: inferSourceFromKey(trimmed), key: trimmed };
                }
                continue;
            }

            if (typeof candidate !== 'object') {
                continue;
            }

            const potentialKeyFields = ['key', 'graphReference', 'reference', 'info'];
            let resolvedKey = '';
            for (const keyField of potentialKeyFields) {
                const value = candidate[keyField];
                if (typeof value === 'string') {
                    const trimmed = value.trim();
                    if (!trimmed || this._isHtmlLikeString(trimmed)) {
                        continue;
                    }
                    resolvedKey = trimmed;
                    break;
                }
            }

            if (!resolvedKey) {
                continue;
            }

            const normalizedSource = normalizeSourceValue(candidate.source);
            const source = normalizedSource || inferSourceFromKey(resolvedKey);
            return { source, key: resolvedKey };
        }

        return null;
    },

    _upgradeNodeGraphLink: function(data) {
        if (!data || typeof data !== 'object') {
            return;
        }

        const nodeType = data.type;
        const isContainer = nodeType === 'container' || data.isContainer;
        const allowsGraphLink = nodeType === 'graph' || isContainer;
        if (!allowsGraphLink) {
            if (data.graphLink !== undefined) {
                delete data.graphLink;
            }
            if (data.graphReference !== undefined) {
                delete data.graphReference;
            }
            if (data.reference !== undefined) {
                delete data.reference;
            }
            return;
        }

        let infoCandidate = data.info;
        if (typeof infoCandidate === 'string' && data.infoHtml && this._isHtmlLikeString(infoCandidate)) {
            infoCandidate = null;
        }

        const normalized = this._normalizeGraphLinkPayload(
            data.graphLink,
            data.graphReference,
            data.reference,
            infoCandidate
        );

        if (normalized) {
            data.graphLink = normalized;
            data.graphReference = normalized.key;
            if (typeof data.info !== 'string' || !data.info.trim()) {
                data.info = normalized.key;
            }
        } else if (data.graphLink !== undefined) {
            delete data.graphLink;
        }
    },


    // Remove timeline scaffolding and temporary locks from a graph object
    _stripTimelineArtifacts: function(graph, { clone = false } = {}) {
        if (!graph || typeof graph !== 'object') {
            return { graph: null, modified: false };
        }

        const resolveLayoutName = (payload) => {
            if (!payload || typeof payload !== 'object') {
                return null;
            }

            const layoutFromGraph = payload.layoutSettings?.currentLayout
                || payload.currentLayout
                || payload.layout;

            const layoutFromManager = (window.LayoutManager && typeof window.LayoutManager.getCurrentLayout === 'function')
                ? window.LayoutManager.getCurrentLayout()
                : (window.LayoutManager ? window.LayoutManager.currentLayout : null);

            return layoutFromGraph || layoutFromManager || null;
        };

        const layoutName = resolveLayoutName(graph);
        const isTimelineLayout = typeof layoutName === 'string'
            && layoutName.toLowerCase().includes('timeline');

        const duplicateEntry = entry => {
            if (!entry || typeof entry !== 'object') {
                return entry;
            }
            if (entry.data) {
                const cloned = { ...entry, data: { ...entry.data } };
                if (entry.position && typeof entry.position === 'object') {
                    cloned.position = { ...entry.position };
                }
                return cloned;
            }
            return { ...entry };
        };

        if (isTimelineLayout) {
            const preservedGraph = clone
                ? {
                    ...graph,
                    nodes: Array.isArray(graph.nodes) ? graph.nodes.map(duplicateEntry) : [],
                    edges: Array.isArray(graph.edges) ? graph.edges.map(duplicateEntry) : []
                }
                : graph;

            return { graph: preservedGraph, modified: false };
        }

        const workingGraph = clone
            ? {
                ...graph,
                nodes: Array.isArray(graph.nodes) ? graph.nodes.map(duplicateEntry) : [],
                edges: Array.isArray(graph.edges) ? graph.edges.map(duplicateEntry) : []
            }
            : graph;

        let nodes = Array.isArray(workingGraph.nodes) ? workingGraph.nodes : null;
        let edges = Array.isArray(workingGraph.edges) ? workingGraph.edges : null;
        let modified = false;

        if (!nodes) {
            nodes = [];
            workingGraph.nodes = nodes;
            modified = true;
        }

        if (!edges) {
            edges = [];
            workingGraph.edges = edges;
            modified = true;
        }

        const getPayload = entry => entry && (entry.data || entry);
        const isTimelineNode = data => {
            if (!data) {
                return false;
            }
            const type = data.type;
            return typeof type === 'string' && type.startsWith('timeline-');
        };

        for (let i = nodes.length - 1; i >= 0; i--) {
            const entry = nodes[i];
            const data = getPayload(entry);
            if (!data) {
                continue;
            }

            if (isTimelineNode(data)) {
                nodes.splice(i, 1);
                modified = true;
                continue;
            }

            if (Object.prototype.hasOwnProperty.call(data, 'lockedX')) {
                delete data.lockedX;
                modified = true;
            }
            if (Object.prototype.hasOwnProperty.call(data, '_savedGrabbable')) {
                delete data._savedGrabbable;
                modified = true;
            }
            if (Object.prototype.hasOwnProperty.call(data, '_savedLockedX')) {
                delete data._savedLockedX;
                modified = true;
            }
        }

        for (let i = edges.length - 1; i >= 0; i--) {
            const entry = edges[i];
            const data = getPayload(entry);
            if (!data) {
                continue;
            }

            if (data.type === 'timeline-link') {
                edges.splice(i, 1);
                modified = true;
            }
        }

        if (modified && workingGraph.metadata && typeof workingGraph.metadata === 'object') {
            try {
                workingGraph.metadata.nodeCount = nodes.length;
                workingGraph.metadata.edgeCount = edges.length;
            } catch (countError) {
                console.warn('Error updating metadata counts during timeline cleanup:', countError);
            }
        }

        return { graph: workingGraph, modified };
    },

    // Reset graph context before loading new data
    resetGraphContext: function() {
        this._pendingTimelineRestore = false;

        this._clearPendingTimelineRebuilds();


        const cy = window.GraphRenderer && window.GraphRenderer.cy;
        if (!cy || (typeof cy.destroyed === 'function' && cy.destroyed())) {
            return;
        }

        const hasTimelineArtifacts = (graph) => {
            if (!graph || typeof graph !== 'object') {
                return false;
            }

            const layoutName = (graph.layoutSettings && graph.layoutSettings.currentLayout)
                || (window.LayoutManager && typeof window.LayoutManager.getCurrentLayout === 'function'
                    ? window.LayoutManager.getCurrentLayout()
                    : (window.LayoutManager ? window.LayoutManager.currentLayout : null));

            const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
            const edges = Array.isArray(graph.edges) ? graph.edges : [];

            const layoutIsTimeline = typeof layoutName === 'string'
                && layoutName.toLowerCase().includes('timeline');

            const hasTimelineNodes = nodes.some(entry => {
                const data = entry && (entry.data || entry);
                return data && typeof data.type === 'string' && data.type.startsWith('timeline-');
            });

            const hasLockedX = nodes.some(entry => {
                const data = entry && (entry.data || entry);
                return data && Object.prototype.hasOwnProperty.call(data, 'lockedX');
            });

            const hasTimelineEdges = edges.some(entry => {
                const data = entry && (entry.data || entry);
                return data && data.type === 'timeline-link';
            });

            return layoutIsTimeline || hasTimelineNodes || hasTimelineEdges || hasLockedX;
        };

        const sanitizeGraphStore = (graph, options = {}, afterSanitize) => {
            if (!graph || typeof graph !== 'object') {
                return { graph: null, modified: false };
            }

            const preserveTimeline = options.preserveTimelineArtifacts || hasTimelineArtifacts(graph);
            if (preserveTimeline) {
                return { graph, modified: false };
            }

            try {
                const result = this._stripTimelineArtifacts(graph, options);
                if (result && result.modified && typeof afterSanitize === 'function') {
                    afterSanitize(result.graph);
                }
                return result;
            } catch (sanitizeError) {
                console.warn('Error stripping timeline artifacts from graph store:', sanitizeError);
                return { graph: null, modified: false };
            }
        };


        try {
            // Detach timeline-specific handlers
            if (cy._timelineResetX) {
                cy.off('grab drag position free', 'node[type!="timeline-bar"]', cy._timelineResetX);
                delete cy._timelineResetX;
            }

            if (cy._timelineContainerGrabHandler) {
                cy.off('grab', 'node', cy._timelineContainerGrabHandler);
                delete cy._timelineContainerGrabHandler;
            }

            if (cy._timelineContainerFreeHandler) {
                cy.off('free dragfree', 'node', cy._timelineContainerFreeHandler);
                delete cy._timelineContainerFreeHandler;
            }

            if (cy._timelineContainerLockedChildren && typeof cy._timelineContainerLockedChildren.clear === 'function') {
                cy._timelineContainerLockedChildren.clear();
            }
            delete cy._timelineContainerLockedChildren;

            if (cy._timelineContainerTimelineUnlocks && typeof cy._timelineContainerTimelineUnlocks.clear === 'function') {
                cy._timelineContainerTimelineUnlocks.clear();
            }
            delete cy._timelineContainerTimelineUnlocks;

            if (cy._timelineBarUnlockScheduler) {
                try {
                    cy._timelineBarUnlockScheduler.forEach(timeoutId => clearTimeout(timeoutId));
                } catch (timeoutError) {
                    console.warn('Error clearing timeline unlock scheduler:', timeoutError);
                }
                if (typeof cy._timelineBarUnlockScheduler.clear === 'function') {
                    cy._timelineBarUnlockScheduler.clear();
                }
                delete cy._timelineBarUnlockScheduler;
            }

            cy.off('resize.timeline pan.timeline zoom.timeline');
            if (window.CustomLayouts && typeof window.CustomLayouts.clearAllTimelineLayoutApplied === 'function') {
                window.CustomLayouts.clearAllTimelineLayoutApplied(cy);
            } else {
                cy.scratch('_timelineLayoutApplied', false);
            }

            // Restore node interaction defaults that may have been altered by the timeline layout
            cy.nodes().forEach(node => {
                if (!node || typeof node.data !== 'function') {
                    return;
                }

                try {
                    const savedGrab = node.data('_savedGrabbable');
                    if (savedGrab !== undefined && typeof node.grabbable === 'function') {
                        node.grabbable(!!savedGrab);
                    }
                    if (typeof node.removeData === 'function') {
                        node.removeData('_savedGrabbable');
                    } else {
                        node.data('_savedGrabbable', undefined);
                    }

                    const savedLockedX = node.data('_savedLockedX');
                    if (savedLockedX !== undefined) {
                        node.data('lockedX', savedLockedX);
                    } else if (node.data('lockedX') !== undefined) {
                        if (typeof node.removeData === 'function') {
                            node.removeData('lockedX');
                        } else {
                            node.data('lockedX', undefined);
                        }
                    }
                    if (typeof node.removeData === 'function') {
                        node.removeData('_savedLockedX');
                    } else {
                        node.data('_savedLockedX', undefined);
                    }

                    if (typeof node.removeScratch === 'function') {
                        node.removeScratch('_timelineSuppressResetX');
                    }
                } catch (nodeError) {
                    console.warn('Error resetting node timeline state:', nodeError);
                }
            });

            // Remove timeline scaffolding elements
            try {
                cy.nodes('[type="timeline-anchor"], [type="timeline-bar"], [type="timeline-tick"]').remove();
                cy.edges('[type="timeline-link"]').remove();
            } catch (removeError) {
                console.warn('Error removing timeline scaffolding:', removeError);
            }

            if (window.CustomLayouts && typeof window.CustomLayouts.removeTimelineTicks === 'function') {
                try {
                    window.CustomLayouts.removeTimelineTicks(cy);
                } catch (tickError) {
                    console.warn('Error clearing timeline tick overlays:', tickError);
                }
            }
        } catch (error) {
            console.error('Error resetting graph context:', error);
        }


        // Ensure cached graph data no longer carries timeline scaffolding
        sanitizeGraphStore(this.currentGraph);

        if (window.FileManager && window.FileManager.graphData) {
            sanitizeGraphStore(window.FileManager.graphData);
        }

        if (window.DataManager &&
            typeof window.DataManager.getGraphData === 'function' &&
            typeof window.DataManager.setGraphData === 'function') {
            const dmGraph = window.DataManager.getGraphData();
            sanitizeGraphStore(dmGraph, { clone: true, preserveTimelineArtifacts: true });
        }

    },

    // Load graph data
    loadGraphData: async function(graphData) {
        console.log('[Load] loadGraphData called');
        // Prevent recursive loading calls
        if (this._isLoading) {
            console.log('[Load] Already loading, aborting');
            return;
        }


        if (window.LayoutManager && typeof window.LayoutManager.ensureGridLayoutDefault === 'function') {
            window.LayoutManager.ensureGridLayoutDefault();
        }


        this._isLoading = true;
        const dm = window.DataManager || null;
        if (dm) dm.isLoading = true;
        console.log('[Load] Graph stats - nodes:', graphData?.nodes?.length || 0, 'edges:', graphData?.edges?.length || 0);

        this._pendingTimelineRestore = false;

        try {
            const menuAPI = window.ContextMenuAdapter || window.ContextMenu;
            if (menuAPI && typeof menuAPI.clearBubbleSets === 'function') {
                menuAPI.clearBubbleSets({ notify: false });
            }
        } catch (error) {
            console.warn('Error clearing bubble sets before graph load:', error);
        }

        if (graphData && window.QuantickleUtils && typeof window.QuantickleUtils.normalizeGraphIdentity === 'function') {
            window.QuantickleUtils.normalizeGraphIdentity(graphData, {
                defaultTitle: graphData.title || graphData.graphName || graphData.graphId || 'Imported graph',
                defaultSource: () => graphData?.metadata?.source || 'Manually added'
            });
        }

        // Reset 3D effects and auto-rotation to defaults
        try {
            if (typeof window.reset3DRotation === 'function') {
                const cyInstance = window.GraphRenderer ? window.GraphRenderer.cy : undefined;
                window.reset3DRotation(false, cyInstance);
            }

            if (window.GlobeLayout3D) {
                if (typeof window.GlobeLayout3D.stopAutoRotation === 'function') {
                    window.GlobeLayout3D.stopAutoRotation();
                }
                if (window.GlobeLayout3D.config) {
                    window.GlobeLayout3D.config.autoRotate = false;
                }
                if (typeof window.GlobeLayout3D.resetRotation === 'function') {
                    window.GlobeLayout3D.resetRotation();
                }
                if (typeof window.GlobeLayout3D.resetVisualEffects === 'function') {
                    window.GlobeLayout3D.resetVisualEffects();
                }
                window.GlobeLayout3D.isActive = false;
            }
        } catch (error) {
            console.error('Error resetting 3D state:', error);
        }

        try {
            // Auto-detect and load required domains before processing graph
            if (window.DomainLoader && typeof window.DomainLoader.autoLoadDomainsForGraph === 'function') {
                const loadedDomains = await window.DomainLoader.autoLoadDomainsForGraph(graphData);
                if (loadedDomains.length > 0) {
                    
                    // Update UI to show loaded domains
                    if (window.DomainLoader.updateActiveDomainsStatus) {
                        window.DomainLoader.updateActiveDomainsStatus();
                    }
                } else {
                }
            }
        } catch (domainError) {
            console.error('Error auto-loading domains:', domainError);
            // Continue with graph loading even if domain loading fails
        }
        
        // Store these for use in finally block
        let hasPositions, hasLayoutSettings;
        let savedLayout = null;
        let isTimelineLayout = false;

        try {
            // Ensure container nodes keep their styling when loading from a file
            if (graphData && Array.isArray(graphData.nodes)) {
                graphData.nodes.forEach(node => {
                    if (!node) return;

                    // Support both Cytoscape-style ({ data: {...} }) and flattened node objects
                    const data = node.data || node;

                    if (window.QuantickleUtils && typeof window.QuantickleUtils.normalizeNodeHtmlFields === 'function') {
                        window.QuantickleUtils.normalizeNodeHtmlFields(data);
                    }

                    if (data.info === undefined) data.info = '';
                    this._upgradeNodeGraphLink(data);
                    const isContainer = data.type === 'container' || data.isContainer;
                    if (isContainer) {
                        const classes = node.classes ? node.classes.split(/\s+/) : [];
                        if (!classes.includes('container')) {
                            classes.push('container');
                            node.classes = classes.join(' ');
                        }

                        data.shape = data.shape || 'round-rectangle';
                        if (data.width === undefined) data.width = 200;
                        if (data.height === undefined) data.height = 150;
                        if (data.color === undefined) data.color = '#d3d3d3';

                        // Ensure a visual indicator for collapsible containers
                        let baseLabel = data.baseLabel || data.label || '';
                        baseLabel = baseLabel.replace(/\s*[\u25B6\u25BC]\s*$/, '');
                        data.baseLabel = baseLabel;
                        const collapsed = !!data.collapsed;
                        if (collapsed) {
                            data.collapsed = true;
                        } else {
                            delete data.collapsed;
                        }
                        data.label = baseLabel;
                    }
                });
            }

            if (graphData && Array.isArray(graphData.edges)) {
                graphData.edges.forEach(edge => {
                    if (!edge) return;

                    const payload = edge.data || edge;
                    if (!payload || typeof payload !== 'object') {
                        return;
                    }

                    if (!Object.prototype.hasOwnProperty.call(payload, 'showArrows')) {
                        payload.showArrows = true;
                    }
                });
            }

            this.currentGraph = graphData;

            // Check if this is an enhanced save with positions and layout settings
            hasPositions = Array.isArray(graphData.nodes) && graphData.nodes.length > 0 &&
                          graphData.nodes.some(node => {
                              if (!node) return false;

                              const hasPositionObject = node.position &&
                                  node.position.x !== undefined &&
                                  node.position.y !== undefined;

                              const hasTopLevelCoords = node.x !== undefined &&
                                  node.y !== undefined;

                              const data = node.data || {};
                              const hasDataCoords = data.x !== undefined &&
                                  data.y !== undefined;

                              return hasPositionObject || hasTopLevelCoords || hasDataCoords;
                          });
            hasLayoutSettings = graphData.layoutSettings && graphData.metadata && graphData.metadata.version;

            savedLayout = graphData.layoutSettings?.currentLayout;
            isTimelineLayout = savedLayout === 'timeline';
            this._pendingTimelineRestore = isTimelineLayout;

            if (!hasLayoutSettings && window.LayoutManager) {
                const fallbackLayout = window.LayoutManager.defaultLayout || 'grid';
                if (window.LayoutManager.currentLayout !== fallbackLayout) {
                    window.LayoutManager.currentLayout = fallbackLayout;
                    if (typeof window.LayoutManager.updateLayoutDropdown === 'function') {
                        try {
                            window.LayoutManager.updateLayoutDropdown();
                        } catch (dropdownError) {
                            console.warn('Error updating layout dropdown during graph reset:', dropdownError);
                        }
                    }
                }
            }

            // Pre-set the layout BEFORE any rendering to prevent overrides
            if (hasLayoutSettings && graphData.layoutSettings && graphData.layoutSettings.currentLayout) {
                if (window.LayoutManager) {
                    window.LayoutManager.currentLayout = savedLayout;
                }
            }

            // Update data manager with the new graph data if available
            if (window.DataManager && typeof window.DataManager.setGraphData === 'function') {
                window.DataManager.setGraphData(graphData);
            } else {
            }
            
            // Update graph visualization
            if (window.GraphRenderer) {
                if (hasPositions || hasLayoutSettings) {
                    this._restoreScheduled = true;
                    this._isRestoring = true;
                    if ('suppressPostRenderLayout' in window.GraphRenderer) {
                        window.GraphRenderer.suppressPostRenderLayout = true;
                    }
                }
                // Flag to prevent automatic layout if we have saved positions
                if (hasPositions) {
                    // Skip the automatic layout pass triggered by GraphRenderer so saved
                    // coordinates stay intact until explicit layout changes are requested.
                    window.GraphRenderer.skipNextLayoutApplication = true;
                }

                window.GraphRenderer.renderGraph();

                // Restore positions and layout settings after rendering
                if (hasPositions || hasLayoutSettings) {
                    setTimeout(() => {
                        try {
                            this.restoreGraphLayout(graphData, hasPositions, hasLayoutSettings);
                        } catch (error) {
                            console.error('Error restoring graph layout:', error);
                        }
                    }, 300);
                }
            }
            
            // Update tables
            if (window.TableManager) {
                window.TableManager.updateTables(true);
                window.TableManager.updateTotalDataTable();

                // Ensure the currently visible data table redraws after the new graph
                // is set and any pending DOM work has a chance to settle.
                const refreshActiveDataTable = () => {
                    try {
                        window.TableManager.updateTotalDataTable();
                    } catch (refreshError) {
                        console.warn('Error refreshing active data table after graph load:', refreshError);
                    }
                };

                if (typeof window.requestAnimationFrame === 'function') {
                    window.requestAnimationFrame(refreshActiveDataTable);
                } else {
                    setTimeout(refreshActiveDataTable, 0);
                }
            }
            
            // Apply GraphAreaEditor settings after everything else
            if (window.GraphAreaEditor) {
                setTimeout(() => {
                    try {
                        if (typeof window.GraphAreaEditor.applySettingsDebounced === 'function') {
                            window.GraphAreaEditor.applySettingsDebounced();
                        } else {
                            window.GraphAreaEditor.applySettings();
                        }
                    } catch (error) {
                        console.error('Error applying GraphAreaEditor settings:', error);
                    }
                }, 600);
            }
            
            // Update UI
            this.updateGraphUI();
            if (dm && typeof dm.setGraphName === 'function') {
                const title = graphData && graphData.title ? graphData.title : 'Unsaved graph';
                const source = graphData && graphData.metadata && graphData.metadata.saveSource
                    ? graphData.metadata.saveSource
                    : null;
                dm.setGraphName(title, { source });
            }
            
        } catch (error) {
            console.error('Error in loadGraphData:', error);
            if (window.UI && window.UI.showNotification) {
                window.UI.showNotification('Error loading graph data', 'error');
            }
        } finally {
            // Reset loading flag after a delay to allow all async operations to complete
            setTimeout(() => {
                this._isLoading = false;
                if (dm) dm.isLoading = false;
                
                // Final verification of layout restoration
                if (hasLayoutSettings && graphData.layoutSettings && graphData.layoutSettings.currentLayout) {
                    const expectedLayout = graphData.layoutSettings.currentLayout;
                    const actualLayout = window.LayoutManager ? window.LayoutManager.currentLayout : null;
                    
                    if (actualLayout !== expectedLayout) {
                        if (window.LayoutManager) {
                            window.LayoutManager.currentLayout = expectedLayout;
                            if (window.LayoutManager.updateLayoutDropdown) {
                                window.LayoutManager.updateLayoutDropdown();
                            }
                        }
                    }
                }
            }, 1000);
        }
    },
    
    // Get current graph data, falling back to DataManager if needed
    getCurrentGraphData: function() {
        if (this.currentGraph) {
            return this.currentGraph;
        }

        if (window.DataManager && typeof window.DataManager.getGraphData === 'function') {
            const data = window.DataManager.getGraphData();
            // Store reference for consistency with API-loaded graphs
            this.currentGraph = data;
            return data;
        }
        return null;
    },
    
    // Clear current graph
    clearCurrentGraph: function() {
        if (!this.currentGraph) {
            alert('No graph to clear');
            return;
        }
        
        if (confirm('Are you sure you want to clear the current graph?')) {
            if (window.GraphRenderer && typeof window.GraphRenderer.resetGraphInstanceStack === 'function') {
                window.GraphRenderer.resetGraphInstanceStack();
            }

            const preservedId = this.currentGraph.id || window.QuantickleUtils?.generateUuid?.() || null;
            const preservedTitle = this.currentGraph.title || this.currentGraph.graphId || 'Unsaved graph';
            const preservedMetadata = this.currentGraph.metadata && typeof this.currentGraph.metadata === 'object'
                ? { ...this.currentGraph.metadata }
                : {};
            if (preservedId) preservedMetadata.id = preservedId;
            preservedMetadata.title = preservedMetadata.title || preservedTitle;
            preservedMetadata.name = preservedMetadata.name || preservedTitle;
            preservedMetadata.source = preservedMetadata.source || 'Manually added';

            this.currentGraph = {
                id: preservedId,
                title: preservedTitle,
                description: 'Empty Graph',
                nodes: [],
                edges: [],
                metadata: preservedMetadata
            };
            
            // Update data manager
            if (window.DataManager) {
                window.DataManager.setGraphData(this.currentGraph);
                if (typeof window.DataManager.setGraphName === 'function') {
                    window.DataManager.setGraphName('Unsaved graph');
                }
            }
            
            // Update visualization
            if (window.GraphRenderer) {
                window.GraphRenderer.renderGraph();
            }
            
            // Apply default GraphAreaEditor background after graph is rendered
            if (window.GraphAreaEditor) {
                // Small delay to ensure graph is fully rendered
                setTimeout(() => {
                    const defaults = window.GraphAreaEditor.defaultSettings || {};
                    window.GraphAreaEditor.applySettings({
                        backgroundColor: defaults.backgroundColor || '#2a2a2a',
                        backgroundImage: ''
                    });
                }, 100);
            }
            
            // Update tables
            if (window.TableManager) {
                window.TableManager.updateTables(true);
                window.TableManager.updateTotalDataTable();
            }
            
            // Update UI
            this.updateGraphUI();
        }
    },
    
    // Add node to graph
    // @param {Object} nodeData - Node attributes
    // @param {boolean} [skipRender=false] - Skip re-rendering when adding programmatically
    addNode: function(nodeData, skipRender = false) {
        const graph = this.getCurrentGraphData();
        if (!graph) {
            console.error('No graph loaded');
            return false;
        }

        console.log('[AddNode] Attempting to add node:', nodeData);

        // Check if node already exists
        const existingNode = graph.nodes.find(node => {
            const data = node.data || node;
            return data.id === nodeData.id;
        });
        if (existingNode) {
            console.log('[AddNode] Node already exists:', nodeData.id);
            return false;
        }

        // Add node
        const nodeType = nodeData.type || 'default';
        if (window.DomainLoader && typeof window.DomainLoader.ensureDomainForType === 'function') {
            window.DomainLoader.ensureDomainForType(nodeType);
        }

        const typeSettings = (window.NodeTypes && window.NodeTypes[nodeType]) ||
            (window.NodeTypes && window.NodeTypes.default) || {};

        // Apply type-based defaults directly to nodeData so callers like the
        // RAG pipeline receive the resolved styling values.
        if (!nodeData.color) {
            const defaultNodeColor = window.QuantickleConfig?.defaultNodeColor || '#ffffff';
            nodeData.color = typeSettings.color || defaultNodeColor;
        }
        if (!nodeData.size) nodeData.size = typeSettings.size || 20;
        if (!nodeData.shape) nodeData.shape = typeSettings.shape || 'round-rectangle';
        const iconHiddenDueToLOD = nodeData.iconHiddenDueToLOD === true;
        if ((!nodeData.icon || nodeData.icon === '') && !iconHiddenDueToLOD) {
            nodeData.icon = typeSettings.icon || '';
        }
        if (!nodeData.labelColor && typeSettings.labelColor) nodeData.labelColor = typeSettings.labelColor;
        if (!nodeData.labelPlacement && typeSettings.labelPlacement) nodeData.labelPlacement = typeSettings.labelPlacement;

        const nodePayload = {
            id: nodeData.id,
            label: nodeData.label || nodeData.id,
            type: nodeType,
            size: nodeData.size,
            shape: nodeData.shape,
            color: nodeData.color,
            icon: nodeData.icon,
            labelColor: nodeData.labelColor,
            labelPlacement: nodeData.labelPlacement,
            width: nodeData.width,
            height: nodeData.height,
            isContainer: nodeData.isContainer,
            ...nodeData.properties
        };

        let classes = nodeData.classes || '';

        if (nodeType === 'container') {
            nodeData.shape = nodeData.shape || 'round-rectangle';
            nodeData.width = nodeData.width || 200;
            nodeData.height = nodeData.height || 150;
            nodeData.color = nodeData.color || '#d3d3d3';
            nodeData.isContainer = nodeData.isContainer !== undefined ? nodeData.isContainer : true;

            nodePayload.shape = nodeData.shape;
            nodePayload.width = nodeData.width;
            nodePayload.height = nodeData.height;
            nodePayload.color = nodeData.color;
            nodePayload.isContainer = nodeData.isContainer;

            const classList = classes.split(/\s+/).filter(Boolean);
            if (!classList.includes('container')) classList.push('container');
            classes = classList.join(' ');
        }

        if (graph.nodes.some(n => n.data)) {
            const entry = { data: nodePayload };
            if (classes) entry.classes = classes;
            graph.nodes.push(entry);
        } else {
            if (classes) nodePayload.classes = classes;
            graph.nodes.push(nodePayload);
        }
        console.log('[AddNode] Node added:', nodeData.id);

        // Sync with DataManager when available
        let tableDelta = null;
        if (window.DataManager) {
            const { DataManager } = window;
            if (typeof DataManager.addNode === 'function') {
                const addedNode = DataManager.addNode(nodePayload);
                if (addedNode) {
                    tableDelta = { nodes: [addedNode] };
                }
            } else if (typeof DataManager.applyDelta === 'function') {
                tableDelta = DataManager.applyDelta({ nodes: [nodePayload] });
            } else if (typeof DataManager.setGraphData === 'function') {
                DataManager.setGraphData(graph);
            }
        }

        if (tableDelta) {
            if (!tableDelta.origin) {
                tableDelta.origin = 'node-add';
            }
        } else {
            tableDelta = { nodes: [nodePayload], origin: 'node-add' };
        }

        const renderDelta = tableDelta && (Array.isArray(tableDelta.nodes) || Array.isArray(tableDelta.edges))
            ? tableDelta
            : { nodes: [nodePayload], edges: [] };

        // Update visualization
        if (window.GraphRenderer && !skipRender) {
            window.GraphRenderer.renderGraph({ delta: renderDelta });
        }

        // Update UI
        this.updateGraphUI();

        // Refresh tables and apply global styles
        if (window.TableManager && window.TableManager.updateTables) {
            window.TableManager.updateTables(false, tableDelta);
            if (window.TableManager.updateTotalDataTable) {
                window.TableManager.updateTotalDataTable();
            }
        }

        if (window.GraphAreaEditor) {
            if (typeof window.GraphAreaEditor.applySettingsDebounced === 'function') {
                window.GraphAreaEditor.applySettingsDebounced();
            } else if (typeof window.GraphAreaEditor.applySettings === 'function') {
                window.GraphAreaEditor.applySettings();
            }
        }
        return true;
    },

    // Add edge to graph
    addEdge: function(edgeData) {
        const graph = this.getCurrentGraphData();
        if (!graph) {
            console.error('No graph loaded');
            return false;
        }

        console.log('[AddEdge] Attempting to add edge:', edgeData);

        // Check if edge already exists
        const existingEdge = graph.edges.find(edge => {
            const data = edge.data || edge;
            return data.source === edgeData.source && data.target === edgeData.target;
        });
        if (existingEdge) {
            console.log('[AddEdge] Edge already exists:', edgeData.source, '->', edgeData.target);
            return false;
        }

        // Add edge
        const edgePayload = {
            id: `${edgeData.source}-${edgeData.target}`,
            source: edgeData.source,
            target: edgeData.target,
            label: edgeData.label || `${edgeData.source} → ${edgeData.target}`,
            type: edgeData.type || 'default',
            ...edgeData.properties
        };

        if (graph.edges.some(e => e.data)) {
            graph.edges.push({ data: edgePayload });
        } else {
            graph.edges.push(edgePayload);
        }
        console.log('[AddEdge] Edge added:', edgeData.source, '->', edgeData.target);

        // Sync with DataManager when available
        let edgeDelta = null;
        if (window.DataManager) {
            const { DataManager } = window;
            if (typeof DataManager.addEdge === 'function') {
                const addedEdge = DataManager.addEdge(edgePayload);
                if (addedEdge) {
                    if (typeof DataManager.applyDelta === 'function') {
                        edgeDelta = DataManager.applyDelta({ edges: [addedEdge] }) || { edges: [addedEdge] };
                    } else {
                        edgeDelta = { edges: [addedEdge] };
                    }
                }
            } else if (typeof DataManager.applyDelta === 'function') {
                edgeDelta = DataManager.applyDelta({ edges: [edgePayload] });
            } else if (typeof DataManager.setGraphData === 'function') {
                DataManager.setGraphData(graph);
            }
        }

        // Update visualization
        if (window.GraphRenderer) {
            const renderDelta = edgeDelta && (Array.isArray(edgeDelta.nodes) || Array.isArray(edgeDelta.edges))
                ? edgeDelta
                : { edges: [edgePayload] };
            window.GraphRenderer.renderGraph({ delta: renderDelta });
        }
        
        // Update UI
        this.updateGraphUI();
        return true;
    },

    // Synchronize timeline anchors, links, and bars with the current graph data
    // @param {Array} anchors - Array of anchor descriptors ({ id, label, position, data })
    // @param {Array} links - Array of link descriptors ({ id, source, target, label, type, data })
    // @param {Array} bars - Array of bar descriptors ({ id, position, data })
    syncTimelineConnectors: function(anchors = [], links = [], bars = []) {
        const graph = this.getCurrentGraphData();
        if (!graph) {
            return;
        }

        if (!Array.isArray(graph.nodes)) {
            graph.nodes = [];
        }
        if (!Array.isArray(graph.edges)) {
            graph.edges = [];
        }

        const usesNodeWrapper = graph.nodes.some(node => node && typeof node === 'object' && 'data' in node);
        const usesEdgeWrapper = graph.edges.some(edge => edge && typeof edge === 'object' && 'data' in edge);

        const getNodeData = node => node && (node.data || node);
        const getEdgeData = edge => edge && (edge.data || edge);

        const validAnchors = anchors.filter(anchor => anchor && anchor.id);
        const validLinks = links.filter(link => link && link.id && link.source && link.target);
        const validBars = bars.filter(bar => bar && bar.id);

        const anchorIds = new Set(validAnchors.map(anchor => anchor.id));
        const linkIds = new Set(validLinks.map(link => link.id));
        const barIds = new Set(validBars.map(bar => bar.id));

        for (let i = graph.nodes.length - 1; i >= 0; i--) {
            const entry = graph.nodes[i];
            const data = getNodeData(entry);
            if (data && data.type === 'timeline-anchor' && !anchorIds.has(data.id)) {
                graph.nodes.splice(i, 1);
            }
        }

        for (let i = graph.edges.length - 1; i >= 0; i--) {
            const entry = graph.edges[i];
            const data = getEdgeData(entry);
            if (data && data.type === 'timeline-link' && !linkIds.has(data.id)) {
                graph.edges.splice(i, 1);
            }
        }

        // Only prune timeline bars when the caller provided bar descriptors so we don't
        // accidentally delete bars from callers that haven't been updated yet.
        if (validBars.length > 0) {
            for (let i = graph.nodes.length - 1; i >= 0; i--) {
                const entry = graph.nodes[i];
                const data = getNodeData(entry);
                if (data && data.type === 'timeline-bar' && !barIds.has(data.id)) {
                    graph.nodes.splice(i, 1);
                }
            }
        }

        validAnchors.forEach(anchor => {
            const hasExplicitLabel = Object.prototype.hasOwnProperty.call(anchor, 'label') && anchor.label !== undefined && anchor.label !== null;
            const label = hasExplicitLabel ? anchor.label : '';
            const position = anchor.position;
            const extraData = (anchor.data && typeof anchor.data === 'object') ? { ...anchor.data } : {};
            if (Object.prototype.hasOwnProperty.call(extraData, 'label')) {
                if (extraData.label === anchor.id && !hasExplicitLabel) {
                    extraData.label = '';
                }
            }

            const existing = graph.nodes.find(node => {
                const data = getNodeData(node);
                return data && data.id === anchor.id;
            });

            if (existing) {
                const data = getNodeData(existing);
                if (data.label === data.id) {
                    data.label = '';
                }
                data.type = 'timeline-anchor';
                Object.assign(data, extraData);
                data.label = label;
                if (position) {
                    data.position = position;
                    existing.position = position;
                }
            } else {
                const payload = {
                    id: anchor.id,
                    type: 'timeline-anchor',
                    ...extraData
                };
                payload.label = label;
                if (position) {
                    payload.position = position;
                }

                if (usesNodeWrapper) {
                    const entry = { data: payload };
                    if (position) {
                        entry.position = position;
                    }
                    graph.nodes.push(entry);
                } else {
                    graph.nodes.push(payload);
                }
            }
        });

        validLinks.forEach(link => {
            const extraData = link.data || {};
            const payload = {
                id: link.id,
                source: link.source,
                target: link.target,
                type: link.type || 'timeline-link',
                label: link.label !== undefined ? link.label : '',
                ...extraData
            };

            const existing = graph.edges.find(edge => {
                const data = getEdgeData(edge);
                return data && data.id === link.id;
            });

            if (existing) {
                const data = getEdgeData(existing);
                Object.assign(data, payload);
            } else {
                if (usesEdgeWrapper) {
                    graph.edges.push({ data: payload });
                } else {
                    graph.edges.push(payload);
                }
            }
        });

        validBars.forEach(bar => {
            const position = bar.position && typeof bar.position === 'object' ? { ...bar.position } : undefined;
            const extraData = (bar.data && typeof bar.data === 'object') ? { ...bar.data } : {};

            const existing = graph.nodes.find(node => {
                const data = getNodeData(node);
                return data && data.id === bar.id;
            });

            if (existing) {
                const data = getNodeData(existing);
                data.type = 'timeline-bar';
                Object.assign(data, extraData);
                if (position) {
                    data.position = position;
                    existing.position = position;
                }
            } else {
                const payload = { id: bar.id, type: 'timeline-bar', ...extraData };
                if (position) {
                    payload.position = position;
                }

                if (usesNodeWrapper) {
                    const entry = { data: payload };
                    if (position) {
                        entry.position = position;
                    }
                    graph.nodes.push(entry);
                } else {
                    graph.nodes.push(payload);
                }
            }
        });

        if (graph.metadata) {
            const safeNodeCount = graph.nodes.reduce((total, entry) => {
                const data = getNodeData(entry);
                if (!data) return total;
                const type = data.type;
                return (typeof type === 'string' && type.startsWith('timeline-')) ? total : total + 1;
            }, 0);

            const safeEdgeCount = graph.edges.reduce((total, entry) => {
                const data = getEdgeData(entry);
                if (!data) return total;
                return data.type === 'timeline-link' ? total : total + 1;
            }, 0);

            graph.metadata.nodeCount = safeNodeCount;
            graph.metadata.edgeCount = safeEdgeCount;
        }

        if (typeof this.updateGraphUI === 'function') {
            this.updateGraphUI();
        }
    },

    // Persist absolute positions for all timeline elements (nodes with lockedX and timeline scaffolding)
    storeTimelineAbsolutePositions: function(records = []) {
        if (!Array.isArray(records) || records.length === 0) {
            return;
        }

        const graphRefs = [];
        const addGraphRef = graph => {
            if (!graph || typeof graph !== 'object') {
                return;
            }
            if (!Array.isArray(graph.nodes)) {
                graph.nodes = [];
            }
            if (!graphRefs.includes(graph)) {
                graphRefs.push(graph);
            }
        };

        const currentGraph = this.getCurrentGraphData();
        if (!currentGraph) {
            return;
        }
        addGraphRef(currentGraph);

        if (window.DataManager && typeof window.DataManager.getGraphData === 'function') {
            const dmGraph = window.DataManager.getGraphData();
            if (dmGraph) {
                addGraphRef(dmGraph);
            }
        }

        if (window.FileManager && window.FileManager.graphData) {
            addGraphRef(window.FileManager.graphData);
        }

        if (graphRefs.length === 0) {
            return;
        }

        const applyRecordToGraph = (graph, record) => {
            if (!record || !record.id) {
                return;
            }

            const nodes = graph.nodes;
            const usesWrapper = nodes.some(node => node && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, 'data'));

            const ensureEntry = (id, dataTemplate) => {
                let entry = nodes.find(node => {
                    const payload = node && (node.data || node);
                    return payload && payload.id === id;
                });

                if (entry) {
                    return entry;
                }

                const payload = { id };
                if (dataTemplate && typeof dataTemplate === 'object') {
                    Object.keys(dataTemplate).forEach(key => {
                        const value = dataTemplate[key];
                        if (value !== undefined) {
                            payload[key] = value;
                        }
                    });
                }

                if (usesWrapper) {
                    entry = { data: payload };
                } else {
                    entry = payload;
                }

                nodes.push(entry);
                return entry;
            };

            const entry = ensureEntry(record.id, record.data);
            const data = entry.data || entry;

            if (record.data && typeof record.data === 'object') {
                Object.keys(record.data).forEach(key => {
                    const value = record.data[key];
                    if (value !== undefined) {
                        data[key] = value;
                    }
                });
            }

            if (record.parent !== undefined) {
                if (record.parent === null) {
                    delete data.parent;
                } else {
                    data.parent = record.parent;
                }
            }

            if (record.position && record.position.x !== undefined && record.position.y !== undefined) {
                const posX = Number(record.position.x);
                const posY = Number(record.position.y);
                if (Number.isFinite(posX) && Number.isFinite(posY)) {
                    const position = { x: posX, y: posY };
                    data.position = { ...position };
                    entry.position = { ...position };
                    data.x = posX;
                    data.y = posY;
                    entry.x = posX;
                    entry.y = posY;
                }
            }

            if (record.lockedX !== undefined) {
                const lockedX = Number(record.lockedX);
                if (Number.isFinite(lockedX)) {
                    data.lockedX = lockedX;
                }
            }

            if (record.classes !== undefined) {
                let classString = Array.isArray(record.classes)
                    ? record.classes.filter(Boolean).join(' ').trim()
                    : String(record.classes || '').trim();
                if (classString) {
                    entry.classes = classString;
                    data.classes = classString;
                }
            }
        };

        graphRefs.forEach(graph => {
            records.forEach(record => applyRecordToGraph(graph, record));
        });

        if (typeof this.updateGraphUI === 'function') {
            this.updateGraphUI();
        }
    },

    _restoreTimelineBarFromGraphData: function(graphData) {
        if (!graphData || !Array.isArray(graphData.nodes)) {
            return;
        }

        if (!window.GraphRenderer || !window.GraphRenderer.cy) {
            return;
        }

        const cy = window.GraphRenderer.cy;
        if (!cy || (typeof cy.destroyed === 'function' && cy.destroyed())) {
            return;
        }

        const unwrapNode = node => {
            if (!node || typeof node !== 'object') {
                return null;
            }
            if (node.data && typeof node.data === 'object') {
                return node.data;
            }
            return node;
        };

        const barDataList = graphData.nodes.reduce((bars, rawNode) => {
            const candidate = unwrapNode(rawNode);
            if (!candidate) {
                return bars;
            }

            const idValue = typeof candidate.id === 'string' ? candidate.id : '';
            if (candidate.type === 'timeline-bar' || (idValue && idValue.startsWith('timeline-bar'))) {
                if (!candidate.id) {
                    candidate.id = 'timeline-bar';
                }
                bars.push(candidate);
            }
            return bars;
        }, []);

        if (!barDataList.length) {
            return;
        }

        cy.batch(() => {
            barDataList.forEach(barData => {
                if (!barData || !barData.id) {
                    return;
                }

                const barCollection = cy.getElementById(barData.id);
                if (!barCollection || barCollection.length === 0) {
                    return;
                }

                const barNode = barCollection[0];
                if (!barNode) {
                    return;
                }

                const lengthValue = Number(barData.barLength);
                const sizeValue = Number(barData.size);
                const colorValue = typeof barData.color === 'string' && barData.color ? barData.color : null;
                const classValueRaw = typeof barData.className === 'string' ? barData.className.trim() : '';
                const classValue = classValueRaw ? classValueRaw : null;

                if (Number.isFinite(lengthValue) && lengthValue > 0) {
                    barNode.data('barLength', lengthValue);
                }

                if (Number.isFinite(sizeValue) && sizeValue > 0) {
                    barNode.data('size', sizeValue);
                }

                if (colorValue) {
                    barNode.data('color', colorValue);
                }

                if (barData.className !== undefined) {
                    barNode.data('className', barData.className);
                }

                const previousApplied = typeof barNode.data === 'function' ? barNode.data('appliedClass') : null;
                if (previousApplied && previousApplied !== classValue) {
                    barNode.removeClass(previousApplied);
                }

                if (classValue) {
                    barNode.addClass(classValue);
                    barNode.data('appliedClass', classValue);
                } else if (previousApplied) {
                    barNode.removeClass(previousApplied);
                    barNode.data('appliedClass', null);
                } else {
                    barNode.data('appliedClass', null);
                }

                const stylePayload = {
                    'shape': 'rectangle',
                    'z-index': -1
                };

                if (Number.isFinite(lengthValue) && lengthValue > 0) {
                    stylePayload.width = lengthValue;
                }

                if (Number.isFinite(sizeValue) && sizeValue > 0) {
                    stylePayload.height = sizeValue;
                }

                if (classValue) {
                    barNode.removeStyle('background-color');
                } else if (colorValue) {
                    stylePayload['background-color'] = colorValue;
                } else {
                    const storedColor = typeof barNode.data === 'function' ? barNode.data('color') : null;
                    if (storedColor) {
                        stylePayload['background-color'] = storedColor;
                    }
                }

                try {
                    barNode.style(stylePayload);
                } catch (styleError) {
                    console.warn('Unable to apply timeline bar style during restore:', styleError);
                }

                if (typeof barNode.ungrabify === 'function') {
                    barNode.ungrabify();
                } else if (typeof barNode.grabbable === 'function') {
                    barNode.grabbable(false);
                }

                if (typeof barNode.lock === 'function') {
                    barNode.lock();
                } else if (typeof barNode.locked === 'function') {
                    barNode.locked(true);
                }

                if (typeof barNode.selectable === 'function') {
                    barNode.selectable(true);
                }
                if (typeof barNode.selectify === 'function') {
                    barNode.selectify();
                }

                const barPosition = typeof barNode.position === 'function' ? barNode.position() : null;
                const centerX = barPosition && Number.isFinite(barPosition.x) ? barPosition.x : Number(barData.x);
                const centerY = barPosition && Number.isFinite(barPosition.y) ? barPosition.y : Number(barData.y);

                if (Number.isFinite(centerX) && Number.isFinite(lengthValue) && lengthValue > 0) {
                    const baselineStart = centerX - lengthValue / 2;
                    let existing;
                    if (window.CustomLayouts && typeof window.CustomLayouts.getTimelineBaselineInfo === 'function') {
                        existing = window.CustomLayouts.getTimelineBaselineInfo(cy, null);
                    } else if (typeof cy.scratch === 'function') {
                        existing = cy.scratch('_timelineBaselineInfo');
                    }

                    const nextInfo = existing && typeof existing === 'object' ? { ...existing } : {};
                    nextInfo.startX = baselineStart;
                    nextInfo.width = lengthValue;
                    nextInfo.barLength = lengthValue;
                    nextInfo.barStart = baselineStart;
                    if (Number.isFinite(centerY)) {
                        nextInfo.centerY = centerY;
                    }
                    if (!Number.isFinite(nextInfo.maxOffset)) {
                        nextInfo.maxOffset = 0;
                    }

                    if (window.CustomLayouts && typeof window.CustomLayouts.setTimelineBaselineInfo === 'function') {
                        window.CustomLayouts.setTimelineBaselineInfo(cy, null, nextInfo);
                    } else if (typeof cy.scratch === 'function') {
                        cy.scratch('_timelineBaselineInfo', nextInfo);
                    }
                }
            });
        });
    },

    _lockTimelineScaffoldingElements: function() {
        const cy = window?.GraphRenderer?.cy;
        if (!cy || (typeof cy.destroyed === 'function' && cy.destroyed())) {
            return;
        }

        const activeContainerIds = (() => {
            const ids = new Set();

            const addFrom = (collection) => {
                if (!collection) {
                    return;
                }

                if (typeof collection.forEach === 'function') {
                    collection.forEach((value, key) => {
                        ids.add(key);
                        if (value && typeof value === 'string') {
                            ids.add(value);
                        }
                    });
                } else if (Array.isArray(collection)) {
                    collection.forEach(id => ids.add(id));
                }
            };

            addFrom(cy._timelineContainerTimelineUnlocks);
            addFrom(cy._timelineContainerLockedChildren);
            addFrom(cy._timelineContainerDragSnapshots);

            return ids;
        })();

        let scaffolding;
        try {
            scaffolding = typeof cy.nodes === 'function'
                ? cy.nodes('[type="timeline-bar"], [type="timeline-anchor"], [type="timeline-tick"]')
                : [];
        } catch (queryError) {
            console.warn('Unable to query timeline scaffolding during restore:', queryError);
            return;
        }

        if (!scaffolding || scaffolding.length === 0) {
            return;
        }

        const shouldDeferForContainer = activeContainerIds && activeContainerIds.size > 0;
        let skippedLocking = false;

        cy.batch(() => {
            scaffolding.forEach(node => {
                if (!node || typeof node.data !== 'function') {
                    return;
                }

                const type = node.data('type');

                const scopeKey = node.data('_timelineScope');
                const parentId = node.data('parent');
                const parent = typeof node.parent === 'function' ? node.parent() : null;
                const parentMatches = (parent && parent.length > 0 && typeof parent.id === 'function' && activeContainerIds.has(parent.id()))
                    || (typeof parentId === 'string' && activeContainerIds.has(parentId));
                const scopeMatches = typeof scopeKey === 'string' && activeContainerIds.has(scopeKey);

                const containerScoped = (() => {
                    const resolveElement = id => {
                        if (!id || !cy || typeof cy.getElementById !== 'function') {
                            return null;
                        }
                        const collection = cy.getElementById(id);
                        return collection && collection.length > 0 ? collection[0] : null;
                    };

                    if (parent && parent.length > 0 && typeof parent.data === 'function' && parent.data('type') === 'container') {
                        return true;
                    }

                    const parentFromData = resolveElement(parentId);
                    if (parentFromData && typeof parentFromData.data === 'function' && parentFromData.data('type') === 'container') {
                        return true;
                    }

                    const scopeElement = resolveElement(scopeKey);
                    if (scopeElement && typeof scopeElement.data === 'function' && scopeElement.data('type') === 'container') {
                        return true;
                    }

                    return false;
                })();

                if (shouldDeferForContainer && (scopeMatches || parentMatches)) {
                    skippedLocking = true;
                    return;
                }

                if (containerScoped) {
                    if (typeof node.unlock === 'function') {
                        node.unlock();
                    } else if (typeof node.locked === 'function') {
                        node.locked(false);
                    }

                    if (typeof node.data === 'function' && node.data('pinned')) {
                        node.data('pinned', false);
                    }
                }

                if (typeof node.ungrabify === 'function') {
                    node.ungrabify();
                } else if (typeof node.grabbable === 'function') {
                    node.grabbable(false);
                }

                if (!containerScoped) {
                    if (typeof node.lock === 'function') {
                        node.lock();
                    } else if (typeof node.locked === 'function') {
                        node.locked(true);
                    }
                }

                if (typeof node.selectable === 'function') {
                    node.selectable(type === 'timeline-bar');
                }
                if (typeof node.selectify === 'function') {
                    node.selectify();
                }
            });
        });

        if (skippedLocking && shouldDeferForContainer) {
            if (this._pendingTimelineLockTimer) {
                clearTimeout(this._pendingTimelineLockTimer);
            }
            this._pendingTimelineLockTimer = setTimeout(() => {
                this._pendingTimelineLockTimer = null;
                this._lockTimelineScaffoldingElements();
            }, 75);
        }
    },

    // Remove node from graph
    removeNode: function(nodeId) {
        const graph = this.getCurrentGraphData();
        if (!graph) {
            console.error('No graph loaded');
            return false;
        }

        // Remove node
        graph.nodes = graph.nodes.filter(node => {
            const data = node.data || node;
            return data.id !== nodeId;
        });

        // Remove associated edges
        graph.edges = graph.edges.filter(edge => {
            const data = edge.data || edge;
            return data.source !== nodeId && data.target !== nodeId;
        });

        // Sync with DataManager when available
        if (window.DataManager && typeof window.DataManager.setGraphData === 'function') {
            window.DataManager.setGraphData(graph);
        }
        
        // Update visualization
        if (window.GraphRenderer) {
            window.GraphRenderer.renderGraph();
        }
        
        // Update UI
        this.updateGraphUI();
        return true;
    },
    
    // Remove edge from graph
    removeEdge: function(sourceId, targetId) {
        const graph = this.getCurrentGraphData();
        if (!graph) {
            console.error('No graph loaded');
            return false;
        }

        // Remove edge
        graph.edges = graph.edges.filter(edge => {
            const data = edge.data || edge;
            return !(data.source === sourceId && data.target === targetId);
        });

        // Sync with DataManager when available
        if (window.DataManager && typeof window.DataManager.setGraphData === 'function') {
            window.DataManager.setGraphData(graph);
        }
        
        // Update visualization
        if (window.GraphRenderer) {
            window.GraphRenderer.renderGraph();
        }
        
        // Update UI
        this.updateGraphUI();
        return true;
    },
    
    // Update graph UI
    updateGraphUI: function() {
        const graphName = document.getElementById('graphName');
        const nodeCount = document.getElementById('nodeCount');
        const edgeCount = document.getElementById('edgeCount');
        
        // Only update if elements exist (they may not in the new menu bar layout)
        if (this.currentGraph) {
            const nodes = Array.isArray(this.currentGraph.nodes) ? this.currentGraph.nodes : [];
            const edges = Array.isArray(this.currentGraph.edges) ? this.currentGraph.edges : [];

            const safeNodeCount = nodes.reduce((total, entry) => {
                const data = entry && (entry.data || entry);
                if (!data) return total;
                const type = data.type;
                return (typeof type === 'string' && type.startsWith('timeline-')) ? total : total + 1;
            }, 0);

            const safeEdgeCount = edges.reduce((total, entry) => {
                const data = entry && (entry.data || entry);
                if (!data) return total;
                const type = data.type;
                return type === 'timeline-link' ? total : total + 1;
            }, 0);

            if (graphName) graphName.textContent = this.currentGraph.title || this.currentGraph.graphId || 'Unsaved graph';
            if (nodeCount) nodeCount.textContent = safeNodeCount;
            if (edgeCount) edgeCount.textContent = safeEdgeCount;
        } else {
            if (graphName) graphName.textContent = '-';
            if (nodeCount) nodeCount.textContent = '0';
            if (edgeCount) edgeCount.textContent = '0';
        }
    },
    
    // Show export dialog
    showExportDialog: function() {
        if (!this.currentGraph) {
            alert('No graph to export');
            return;
        }
        
        const format = prompt('Export format (qut/json/csv):', 'qut');
        if (format) {
            if (window.FileManager) {
                window.FileManager.exportGraph(format);
            } else {
                this.exportGraph(format);
            }
        }
    },
    
    // Show import dialog
    showImportDialog: function() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,.edges,.qut,.json';
        input.multiple = false;

        input.onchange = (event) => {
            const file = event.target.files[0];
            if (file) {
                this.importGraphData(file);
            }
        };
        
        input.click();
    },
    
    // Import graph data from file
    importGraphData: function(file) {
        console.log('[Import] Starting import for', file.name);

        if (file.name.endsWith('.xlsx')) {
            const message = 'Excel imports are no longer supported. Please convert the file to CSV.';
            if (window.UI && typeof window.UI.showNotification === 'function') {
                window.UI.showNotification(message, 'error');
            } else {
                alert(message);
            }
            return;
        }

        const reader = new FileReader();

        reader.onload = (event) => {
            try {
                let graphData;
                const text = event.target.result;
                console.log('[Import] File read, length:', text.length);

                if (file.name.endsWith('.csv')) {
                    console.log('[Import] Detected CSV file');
                    graphData = this._buildGraphDataFromCsvText(file, text);
                } else if (file.name.endsWith('.edges')) {
                    console.log('[Import] Detected edge list file');
                    const processedData = this.parseEdgesData(text);
                    console.log('[Import] Edge list parsed:', processedData);
                    const baseTitle = file.name.replace(/\.[^/.]+$/, '') || 'Imported Graph';
                    graphData = {
                        id: window.QuantickleUtils?.generateUuid?.() || `graph-${Date.now()}`,
                        title: baseTitle,
                        description: 'Imported Graph',
                        nodes: processedData.nodes,
                        edges: processedData.edges,
                        metadata: {
                            source: 'Imported from file',
                            fileName: file.name,
                            title: baseTitle
                        }
                    };
                } else {
                    console.log('[Import] Attempting JSON parse');
                    graphData = JSON.parse(text);
                }

                const markCsvImport = file.name.endsWith('.csv') || file.name.endsWith('.edges');
                this._finalizeGraphImport(file, graphData, { markCsvImport });
            } catch (error) {
                console.error('Error importing graph data:', error);
                alert('Error importing graph data: ' + error.message);
            }
        };

        reader.readAsText(file);
    },

    _buildGraphDataFromCsvText: function(file, csvText) {
        const processedData = this.parseCSVData(csvText);
        if (!processedData) {
            throw new Error('Failed to process CSV data');
        }

        console.log('[Import] CSV parsed:', processedData);
        const baseTitle = file?.name ? file.name.replace(/\.[^/.]+$/, '') : 'Imported Graph';
        const safeTitle = baseTitle || 'Imported Graph';

        return {
            id: window.QuantickleUtils?.generateUuid?.() || `graph-${Date.now()}`,
            title: safeTitle,
            description: 'Imported Graph',
            nodes: processedData.nodes,
            edges: processedData.edges,
            metadata: {
                source: 'Imported from file',
                fileName: file?.name,
                title: safeTitle
            }
        };
    },

    _finalizeGraphImport: function(file, graphData, { markCsvImport = false } = {}) {
        console.log('[Import] Parsed graphData:', graphData);

        if (!this.validateGraphData(graphData)) {
            console.error('[Import] Validation failed for graph data');
            alert('Invalid graph data format');
            return;
        }

        if (markCsvImport) {
            graphData._isCSVImport = true;
        }

        // Merge with current graph or replace
        if (this.currentGraph && confirm('Replace current graph with imported data?')) {
            console.log('[Import] Replacing current graph');
            this.loadGraphData(graphData);
        } else if (this.currentGraph && confirm('Merge with current graph?')) {
            console.log('[Import] Merging with current graph');
            this.mergeGraphData(graphData);
        } else {
            console.log('[Import] Loading graph');
            this.loadGraphData(graphData);
        }
    },
    
    // Parse edge list data into graph format
    parseEdgesData: function(edgeText) {
        console.log('[Parser] parseEdgesData start');
        const lines = edgeText.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
        console.log('[Parser] Total lines:', lines.length);
        const nodes = new Map();
        const edges = [];
        let index = 0;

        for (const line of lines) {
            console.log('[Parser] Processing edge line:', line);
            const parts = line.trim().split(/[\s,]+/);
            if (parts.length < 2) {
                console.log('[Parser] Skipping invalid edge line');
                continue;
            }
            const source = parts[0];
            const target = parts[1];

            if (!nodes.has(source)) {
                console.log('[Parser] Adding source node:', source);
                nodes.set(source, { data: { id: source, type: 'default', label: source } });
            }
            if (!nodes.has(target)) {
                console.log('[Parser] Adding target node:', target);
                nodes.set(target, { data: { id: target, type: 'default', label: target } });
            }

            const edgeId = `${source}-${target}-${index++}`;
            console.log('[Parser] Adding edge:', edgeId);
            edges.push({
                data: {
                    id: edgeId,
                    source,
                    target,
                    type: 'default',
                    label: ''
                }
            });
        }

        const result = {
            nodes: Array.from(nodes.values()),
            edges: edges
        };
        console.log('[Parser] parseEdgesData result:', result);
        return result;
    },

    // Parse CSV data into graph format
    parseCSVData: function(csvText) {
        console.log('[Parser] parseCSVData start');
        const rawLines = csvText.split(/\r?\n/);
        const headerLineIndex = rawLines.findIndex(line => line && line.trim());
        if (headerLineIndex === -1) {
            const fallbackTitle = 'Imported Graph';
            return {
                id: window.QuantickleUtils?.generateUuid?.() || `graph-${Date.now()}`,
                title: fallbackTitle,
                description: 'Imported Graph',
                nodes: [],
                edges: [],
                metadata: {
                    source: 'Imported from file',
                    title: fallbackTitle
                }
            };
        }

        const lines = rawLines.slice(headerLineIndex);
        console.log('[Parser] Total lines (including blanks):', lines.length);

        const cleanCsvValue = (value) => {
            if (typeof value !== 'string') {
                return value;
            }

            const withoutBom = value.replace(/^\uFEFF/, '');
            const trimmed = withoutBom.trim();
            if ((trimmed.startsWith('"') && trimmed.endsWith('"'))
                || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
                return trimmed.slice(1, -1).trim();
            }
            return trimmed;
        };

        const normalizeHeader = (header) => {
            if (typeof header !== 'string') {
                return '';
            }
            return cleanCsvValue(header).toLowerCase().replace(/[\s-]+/g, '_');
        };

        const resolveLineStyleFromType = (edgeType) => {
            const normalized = typeof edgeType === 'string'
                ? edgeType.trim().toLowerCase()
                : '';

            if (['solid', 'dotted', 'dashed'].includes(normalized)) {
                return normalized;
            }

            return 'solid';
        };

        const findIndex = (headers, candidates) => {
            if (!Array.isArray(headers)) {
                return -1;
            }
            for (const candidate of candidates) {
                const normalizedCandidate = normalizeHeader(candidate);
                const idx = headers.indexOf(normalizedCandidate);
                if (idx !== -1) {
                    return idx;
                }
            }
            return -1;
        };

        const isEdgeHeader = (headers) => {
            if (!Array.isArray(headers) || headers.length === 0) {
                return false;
            }
            const hasSource = headers.some(h => ['source', 'source_id', 'from'].includes(h));
            const hasTarget = headers.some(h => ['target', 'target_id', 'to'].includes(h));
            return hasSource && hasTarget;
        };

        const isNodeHeader = (headers) => {
            if (!Array.isArray(headers) || headers.length === 0) {
                return false;
            }

            const nodeHeaderTokens = new Set([
                'node_id', 'id', 'nodeid',
                'node_label', 'label', 'name',
                'node_type', 'type',
                'node_size', 'size',
                'node_color', 'color',
                'node_x', 'x', 'pos_x', 'position_x',
                'node_y', 'y', 'pos_y', 'position_y'
            ]);

            let matchCount = 0;
            for (const header of headers) {
                if (nodeHeaderTokens.has(header)) {
                    matchCount += 1;
                }
            }

            return matchCount >= 2;
        };

        const getValue = (values, index) => {
            if (index < 0 || index >= values.length) {
                return '';
            }
            const value = values[index];
            return typeof value === 'string' ? value.trim() : value;
        };

        const defaultNodeColumns = { id: 0, label: 1, type: 2, size: 3, color: 4, x: 5, y: 6 };
        const defaultEdgeColumns = { source: 0, target: 1, type: 2, label: 3 };

        const nodes = [];
        const edges = [];

        const defaultNodeColor = window.QuantickleConfig?.defaultNodeColor || '#ffffff';
        const defaultNodeSize = Number.isFinite(window.QuantickleConfig?.defaultNodeSize)
            ? window.QuantickleConfig.defaultNodeSize
            : 30;

        const firstValues = lines[0].split(',').map(cleanCsvValue);
        const firstHeaders = firstValues.map(normalizeHeader);

        // Handle edge-only CSVs
        if (isEdgeHeader(firstHeaders)) {
            const edgeColumns = { ...defaultEdgeColumns };
            edgeColumns.source = findIndex(firstHeaders, ['source', 'source_id', 'from']);
            edgeColumns.target = findIndex(firstHeaders, ['target', 'target_id', 'to']);
            edgeColumns.type = findIndex(firstHeaders, ['edge_type', 'type']);
            edgeColumns.label = findIndex(firstHeaders, ['edge_label', 'label', 'name']);

            const nodeMap = new Map();

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(cleanCsvValue);
                if (values.length < 2) {
                    console.log('[Parser] Skipping malformed edge line');
                    continue;
                }

                const source = getValue(values, edgeColumns.source !== -1 ? edgeColumns.source : defaultEdgeColumns.source);
                const target = getValue(values, edgeColumns.target !== -1 ? edgeColumns.target : defaultEdgeColumns.target);
                const typeRaw = getValue(values, edgeColumns.type !== -1 ? edgeColumns.type : defaultEdgeColumns.type);
                const type = typeRaw || 'default';
                const label = getValue(values, edgeColumns.label !== -1 ? edgeColumns.label : defaultEdgeColumns.label) || '';
                const lineStyle = resolveLineStyleFromType(typeRaw);
                const customStyleOverrides = {};

                if (typeRaw) {
                    customStyleOverrides.lineStyle = true;
                }

                if (!source || !target) {
                    console.log('[Parser] Skipping edge with missing source/target');
                    continue;
                }

                const edgeData = {
                    id: `${source}-${target}`,
                    source,
                    target,
                    type,
                    lineStyle,
                    label,
                    showArrows: true
                };

                if (Object.keys(customStyleOverrides).length > 0) {
                    edgeData.customStyleOverrides = customStyleOverrides;
                }

                edges.push({ data: edgeData });

                if (!nodeMap.has(source)) {
                    nodeMap.set(source, {
                        data: {
                            id: source,
                            type: 'default',
                            label: source,
                            color: defaultNodeColor,
                            size: defaultNodeSize
                        }
                    });
                }
                if (!nodeMap.has(target)) {
                    nodeMap.set(target, {
                        data: {
                            id: target,
                            type: 'default',
                            label: target,
                            color: defaultNodeColor,
                            size: defaultNodeSize
                        }
                    });
                }
            }

            const fallbackTitle = 'Imported Graph';
            const result = {
                id: window.QuantickleUtils?.generateUuid?.() || `graph-${Date.now()}`,
                title: fallbackTitle,
                description: 'Imported Graph',
                nodes: Array.from(nodeMap.values()),
                edges: edges,
                metadata: {
                    source: 'Imported from file',
                    title: fallbackTitle
                }
            };
            console.log('[Parser] parseCSVData result:', result);
            return result;
        }

        let currentSection = 'nodes';
        let nodeColumns = { ...defaultNodeColumns };
        let edgeColumns = { ...defaultEdgeColumns };

        nodeColumns.id = findIndex(firstHeaders, ['node_id', 'id', 'nodeid']);
        nodeColumns.label = findIndex(firstHeaders, ['node_label', 'label', 'name']);
        nodeColumns.type = findIndex(firstHeaders, ['node_type', 'type']);
        nodeColumns.size = findIndex(firstHeaders, ['node_size', 'size']);
        nodeColumns.color = findIndex(firstHeaders, ['node_color', 'color']);
        nodeColumns.x = findIndex(firstHeaders, ['node_x', 'x', 'pos_x', 'position_x']);
        nodeColumns.y = findIndex(firstHeaders, ['node_y', 'y', 'pos_y', 'position_y']);

        nodeColumns.id = nodeColumns.id !== -1 ? nodeColumns.id : defaultNodeColumns.id;
        nodeColumns.label = nodeColumns.label !== -1 ? nodeColumns.label : defaultNodeColumns.label;
        nodeColumns.type = nodeColumns.type !== -1 ? nodeColumns.type : defaultNodeColumns.type;
        nodeColumns.size = nodeColumns.size !== -1 ? nodeColumns.size : defaultNodeColumns.size;
        nodeColumns.color = nodeColumns.color !== -1 ? nodeColumns.color : defaultNodeColumns.color;
        nodeColumns.x = nodeColumns.x !== -1 ? nodeColumns.x : defaultNodeColumns.x;
        nodeColumns.y = nodeColumns.y !== -1 ? nodeColumns.y : defaultNodeColumns.y;

        const startIndex = 1;
        let pendingEdgeHeader = false;

        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i];
            if (!line || !line.trim()) {
                if (currentSection === 'nodes') {
                    pendingEdgeHeader = true;
                }
                continue;
            }

            console.log(`[Parser] Processing ${currentSection} line:`, line);
            const values = line.split(',').map(cleanCsvValue);
            const normalizedValues = values.map(normalizeHeader);

            if (pendingEdgeHeader && currentSection === 'nodes') {
                currentSection = 'edges';
                pendingEdgeHeader = false;
                console.log('[Parser] Switching to edges section after blank line');

                edgeColumns.source = findIndex(normalizedValues, ['source', 'source_id', 'from']);
                edgeColumns.target = findIndex(normalizedValues, ['target', 'target_id', 'to']);
                edgeColumns.type = findIndex(normalizedValues, ['edge_type', 'type']);
                edgeColumns.label = findIndex(normalizedValues, ['edge_label', 'label', 'name']);

                edgeColumns.source = edgeColumns.source !== -1 ? edgeColumns.source : defaultEdgeColumns.source;
                edgeColumns.target = edgeColumns.target !== -1 ? edgeColumns.target : defaultEdgeColumns.target;
                edgeColumns.type = edgeColumns.type !== -1 ? edgeColumns.type : defaultEdgeColumns.type;
                edgeColumns.label = edgeColumns.label !== -1 ? edgeColumns.label : defaultEdgeColumns.label;

                continue;
            }

            if (currentSection === 'nodes' && isEdgeHeader(normalizedValues)) {
                currentSection = 'edges';
                console.log('[Parser] Switching to edges section');

                edgeColumns.source = findIndex(normalizedValues, ['source', 'source_id', 'from']);
                edgeColumns.target = findIndex(normalizedValues, ['target', 'target_id', 'to']);
                edgeColumns.type = findIndex(normalizedValues, ['edge_type', 'type']);
                edgeColumns.label = findIndex(normalizedValues, ['edge_label', 'label', 'name']);

                edgeColumns.source = edgeColumns.source !== -1 ? edgeColumns.source : defaultEdgeColumns.source;
                edgeColumns.target = edgeColumns.target !== -1 ? edgeColumns.target : defaultEdgeColumns.target;
                edgeColumns.type = edgeColumns.type !== -1 ? edgeColumns.type : defaultEdgeColumns.type;
                edgeColumns.label = edgeColumns.label !== -1 ? edgeColumns.label : defaultEdgeColumns.label;

                continue;
            }

            if (currentSection === 'nodes') {
                const nodeId = getValue(values, nodeColumns.id);
                if (!nodeId) {
                    console.log('[Parser] Skipping node with missing id');
                    continue;
                }

                const nodeLabel = getValue(values, nodeColumns.label) || nodeId;
                const nodeType = getValue(values, nodeColumns.type) || 'default';
                const nodeSizeRaw = getValue(values, nodeColumns.size);
                const nodeColor = getValue(values, nodeColumns.color);
                const nodeXRaw = getValue(values, nodeColumns.x);
                const nodeYRaw = getValue(values, nodeColumns.y);

                const resolvedSize = Number.isFinite(parseFloat(nodeSizeRaw))
                    ? parseFloat(nodeSizeRaw)
                    : defaultNodeSize;
                const resolvedColor = (typeof nodeColor === 'string' && nodeColor !== '')
                    ? nodeColor
                    : defaultNodeColor;

                const resolvedX = Number.isFinite(parseFloat(nodeXRaw)) ? parseFloat(nodeXRaw) : undefined;
                const resolvedY = Number.isFinite(parseFloat(nodeYRaw)) ? parseFloat(nodeYRaw) : undefined;

                const nodeData = {
                    id: nodeId,
                    type: nodeType,
                    label: nodeLabel,
                    color: resolvedColor,
                    size: resolvedSize
                };

                if (resolvedX !== undefined && resolvedY !== undefined) {
                    nodeData.x = resolvedX;
                    nodeData.y = resolvedY;
                    nodeData.position = { x: resolvedX, y: resolvedY };
                }

                console.log('[Parser] Adding node:', nodeData);
                nodes.push({ data: nodeData });
            } else if (currentSection === 'edges') {
                const source = getValue(values, edgeColumns.source);
                const target = getValue(values, edgeColumns.target);

                if (!source || !target) {
                    console.log('[Parser] Skipping edge with missing source/target');
                    continue;
                }

                const edgeTypeRaw = getValue(values, edgeColumns.type);
                const edgeType = edgeTypeRaw || 'default';
                const edgeLabel = getValue(values, edgeColumns.label) || '';
                const lineStyle = resolveLineStyleFromType(edgeTypeRaw);
                const customStyleOverrides = {};

                if (edgeTypeRaw) {
                    customStyleOverrides.lineStyle = true;
                }

                console.log('[Parser] Adding edge:', { source, target, type: edgeType, label: edgeLabel, lineStyle });
                const edgeData = {
                    id: `${source}-${target}`,
                    source,
                    target,
                    type: edgeType,
                    lineStyle,
                    label: edgeLabel,
                    showArrows: true
                };

                if (Object.keys(customStyleOverrides).length > 0) {
                    edgeData.customStyleOverrides = customStyleOverrides;
                }

                edges.push({ data: edgeData });
            } else {
                console.log('[Parser] Skipping malformed line');
            }
        }

        const fallbackTitle = 'Imported Graph';
        const result = {
            id: window.QuantickleUtils?.generateUuid?.() || `graph-${Date.now()}`,
            title: fallbackTitle,
            description: 'Imported Graph',
            nodes: nodes,
            edges: edges,
            metadata: {
                source: 'Imported from file',
                title: fallbackTitle
            }
        };
        console.log('[Parser] parseCSVData result:', result);
        return result;
    },
    
    // Validate graph data structure
    validateGraphData: function(data) {
        console.log('[Validate] Validating graph data');
        const valid = data &&
               Array.isArray(data.nodes) &&
               Array.isArray(data.edges);
        if (valid && window.QuantickleUtils && typeof window.QuantickleUtils.normalizeGraphIdentity === 'function') {
            window.QuantickleUtils.normalizeGraphIdentity(data, {
                defaultTitle: data.title || data.graphName || data.graphId || 'Imported graph',
                defaultSource: () => data?.metadata?.source || 'Manually added'
            });
        }
        console.log('[Validate] Validation result:', valid);
        return valid;
    },
    
    // Merge graph data with current graph
    mergeGraphData: function(newData) {
        if (!this.currentGraph) {
            this.loadGraphData(newData);
            return;
        }
        
        // Merge nodes
        for (const newNode of newData.nodes) {
            this.addNode(newNode.data);
        }
        
        // Merge edges
        for (const newEdge of newData.edges) {
            this.addEdge(newEdge.data);
        }
    },
    
    // Export graph to different formats
    exportGraph: function(format = 'qut') {
        if (!this.currentGraph) {
            alert('No graph to export');
            return;
        }

        const exportGraph = (typeof this._stripTimelineArtifacts === 'function')
            ? (this._stripTimelineArtifacts(this.currentGraph, { clone: true }).graph || this.currentGraph)
            : this.currentGraph;

        let dataStr, mimeType, extension;

        switch (format.toLowerCase()) {
            case 'json':
                dataStr = JSON.stringify(exportGraph, null, 2);
                mimeType = 'application/json';
                extension = '.json';
                break;
            case 'csv':
                dataStr = this.convertToCSV(exportGraph);
                mimeType = 'text/csv';
                extension = '.csv';
                break;
            case 'qut':
            default:
                dataStr = JSON.stringify(exportGraph, null, 2);
                mimeType = 'application/json';
                extension = '.qut';
                break;
        }
        
        const dataBlob = new Blob([dataStr], { type: mimeType });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        const downloadTitle = this.currentGraph.title || this.currentGraph.graphId || 'graph';
        link.download = downloadTitle + extension;
        link.click();
    },
    
    // Convert graph data to CSV format
    convertToCSV: function(graphData) {
        let csv = 'node_id,node_type,node_label\n';
        
        // Add nodes
        graphData.nodes.forEach(node => {
            csv += `${node.data.id},${node.data.type},${node.data.label}\n`;
        });
        
        csv += '\nsource_id,target_id,edge_type,edge_label\n';
        
        // Add edges
        graphData.edges.forEach(edge => {
            csv += `${edge.data.source},${edge.data.target},${edge.data.type},${edge.data.label}\n`;
        });
        
        return csv;
    },

    // Rebuild currentGraph from Cytoscape.js instance
    rebuildCurrentGraphFromCy: function(cy) {
        if (!cy) return;
        
        // Capture nodes with positions and classes
        const nodes = cy.nodes().map(ele => ({
            data: { ...ele.data() },
            position: { x: ele.position('x'), y: ele.position('y') },
            classes: ele.classes ? ele.classes().join(' ') : ''
        }));

        // Capture edges with data and classes
        const edges = cy.edges().map(ele => ({
            data: { ...ele.data() },
            classes: ele.classes ? ele.classes().join(' ') : ''
        }));
        
        // Capture current layout and view settings
        const layoutSettings = {
            currentLayout: window.LayoutManager ? window.LayoutManager.currentLayout : null,
            zoom: cy.zoom(),
            pan: cy.pan(),
            extent: cy.extent()
        };
        
        // Try to preserve identifiers and description if possible
        const preservedId = this.currentGraph?.id || window.QuantickleUtils?.generateUuid?.() || `graph-${Date.now()}`;
        const preservedTitle = this.currentGraph?.title || this.currentGraph?.graphId || 'Graph';
        const description = this.currentGraph && this.currentGraph.description ? this.currentGraph.description : 'Graph rebuilt from visualization';
        const metadata = this.currentGraph && this.currentGraph.metadata && typeof this.currentGraph.metadata === 'object'
            ? { ...this.currentGraph.metadata }
            : {};

        metadata.savedAt = new Date().toISOString();
        metadata.nodeCount = nodes.length;
        metadata.edgeCount = edges.length;
        metadata.version = metadata.version || '1.1';
        metadata.id = preservedId;
        metadata.title = metadata.title || preservedTitle;
        metadata.name = metadata.name || preservedTitle;
        metadata.source = metadata.source || 'Manually added';

        this.currentGraph = {
            id: preservedId,
            title: preservedTitle,
            description,
            nodes,
            edges,
            layoutSettings,
            metadata
        };
    },
    
    // Restore graph layout settings and node positions from saved data
    restoreGraphLayout: function(graphData, hasPositions, hasLayoutSettings) {
        const isScheduledRestore = this._restoreScheduled === true;

        // Prevent overlapping restoration cycles
        if (this._isRestoring && !isScheduledRestore) {
            return;
        }

        if (this._isLoading) {
            setTimeout(() => {
                this.restoreGraphLayout(graphData, hasPositions, hasLayoutSettings);
            }, 100);
            return;
        }

        this._restoreScheduled = false;
        this._isRestoring = true;

        const finishRestore = ({ keepPendingTimeline = false } = {}) => {
            if (!keepPendingTimeline) {
                this._pendingTimelineRestore = false;
            }
            this._restoreScheduled = false;
            this._isRestoring = false;
            if (window.GraphRenderer && 'suppressPostRenderLayout' in window.GraphRenderer) {
                window.GraphRenderer.suppressPostRenderLayout = false;
                if (typeof window.GraphRenderer.hideLoadingProgress === 'function') {
                    try {
                        window.GraphRenderer.hideLoadingProgress();
                    } catch (hideError) {
                    }
                }
            }
            if (window.GraphRenderer && window.GraphRenderer.skipNextLayoutApplication) {
                window.GraphRenderer.skipNextLayoutApplication = false;
            }
        };

        if (!window.GraphRenderer || !window.GraphRenderer.cy) {
            finishRestore();
            return;
        }

        let finalizeDeferred = false;

        try {
            const cy = window.GraphRenderer.cy;

            const isTimelineLayout = (() => {
                if (graphData?.layoutSettings?.currentLayout === 'timeline') {
                    return true;
                }
                if (this._pendingTimelineRestore) {
                    return true;
                }
                if (window.LayoutManager && window.LayoutManager.currentLayout === 'timeline') {
                    return true;
                }
                return false;
            })();

            // Restore layout settings FIRST to ensure they stick
            if (hasLayoutSettings && graphData.layoutSettings) {
                const settings = graphData.layoutSettings;
                
                // Restore current layout with strong persistence
                if (settings.currentLayout && window.LayoutManager) {
                    const savedLayout = settings.currentLayout;
                    window.LayoutManager.currentLayout = savedLayout;
                    
                    // Update the dropdown immediately and force it to stick
                    if (window.LayoutManager.updateLayoutDropdown) {
                        window.LayoutManager.updateLayoutDropdown();
                        
                        // Double-check that it stuck
                        setTimeout(() => {
                            if (window.LayoutManager.currentLayout !== savedLayout) {
                                window.LayoutManager.currentLayout = savedLayout;
                                window.LayoutManager.updateLayoutDropdown();
                            }
                        }, 50);
                    }
                }
            }
            
            // Restore node positions
            if (hasPositions && Array.isArray(graphData.nodes)) {
                let positionsRestored = 0;
                const resolveSavedPosition = (nodeData) => {
                    if (!nodeData) return null;
                    if (nodeData.position && nodeData.position.x !== undefined && nodeData.position.y !== undefined) {
                        return nodeData.position;
                    }
                    if (nodeData.x !== undefined && nodeData.y !== undefined) {
                        return { x: nodeData.x, y: nodeData.y };
                    }
                    const data = nodeData.data || {};
                    if (data.position && data.position.x !== undefined && data.position.y !== undefined) {
                        return data.position;
                    }
                    if (data.x !== undefined && data.y !== undefined) {
                        return { x: data.x, y: data.y };
                    }
                    return null;
                };

                graphData.nodes.forEach(nodeData => {
                    const data = nodeData && nodeData.data ? nodeData.data : nodeData;
                    const id = data && data.id;
                    if (!id) {
                        return;
                    }

                    const savedPosition = resolveSavedPosition(nodeData);
                    if (!savedPosition) {
                        return;
                    }

                    const cyNode = cy.getElementById(id);
                    if (cyNode.length > 0) {
                        cyNode.position(savedPosition);
                        positionsRestored++;
                    }
                });

                if (positionsRestored > 0) {
                    this._refreshGraphReturnNodePlacement();
                }
            }

            // Restore zoom and pan settings
            if (hasLayoutSettings && graphData.layoutSettings) {
                const settings = graphData.layoutSettings;
                if (settings.zoom !== undefined && settings.pan) {
                    setTimeout(() => {
                        try {
                            cy.zoom(settings.zoom);
                            cy.pan(settings.pan);
                        } catch (zoomError) {
                        }
                        this._refreshGraphReturnNodePlacement();
                    }, 200);
                }
            }

            // If we don't have layout settings, just fit and center without changing positions
            if (!hasLayoutSettings) {
                try {
                    cy.fit();
                    cy.center();
                } catch (fitError) {
                }
                this._refreshGraphReturnNodePlacement();
            }
            
            // Previously the timeline layout was reapplied after restore, which
            // stretched the timeline bar and disturbed saved positions. Skip any
            // timeline adjustments here so restored coordinates remain intact.
            if (isTimelineLayout) {
                this._restoreTimelineBarFromGraphData(graphData);
                this._lockTimelineScaffoldingElements();

                const activeCy = window?.GraphRenderer?.cy;
                const canScratch = typeof activeCy?.scratch === 'function';
                const isDestroyed = typeof activeCy?.destroyed === 'function'
                    ? activeCy.destroyed()
                    : false;

                if (activeCy && canScratch && !isDestroyed) {
                    try {
                        if (window.CustomLayouts && typeof window.CustomLayouts.setTimelineLayoutApplied === 'function') {
                            window.CustomLayouts.setTimelineLayoutApplied(activeCy, null, true);
                        } else {
                            activeCy.scratch('_timelineLayoutApplied', true);
                        }
                    } catch (scratchError) {
                    }
                }
            } else {
                this._lockTimelineScaffoldingElements();

                const activeCy = window?.GraphRenderer?.cy;
                const canScratch = typeof activeCy?.scratch === 'function';
                const isDestroyed = typeof activeCy?.destroyed === 'function'
                    ? activeCy.destroyed()
                    : false;

                if (activeCy && canScratch && !isDestroyed) {
                    try {
                        if (window.CustomLayouts && typeof window.CustomLayouts.setTimelineLayoutApplied === 'function') {
                            window.CustomLayouts.setTimelineLayoutApplied(activeCy, null, false);
                        } else {
                            activeCy.scratch('_timelineLayoutApplied', false);
                        }
                    } catch (scratchError) {
                    }
                }
            }

            if (this._pendingTimelineRestore) {
                const MAX_TIMELINE_RESTORE_ATTEMPTS = 10;

                this._clearPendingTimelineRebuilds();

                const scheduleRetry = (nextAttempt, delayMs = 0) => {
                    if (nextAttempt > MAX_TIMELINE_RESTORE_ATTEMPTS) {
                        return;
                    }
                    const safeDelay = Math.min(Math.max(delayMs, 0), 300);
                    this._registerTimelineRebuildTimer(
                        () => attemptTimelineConnectorRebuild(nextAttempt),
                        safeDelay
                    );
                };

                const attemptTimelineConnectorRebuild = (attempt = 0) => {
                    const resolveTimelineTargetCount = () => {
                        try {
                            let count = 0;
                            cy.nodes().forEach(node => {
                                if (!node || typeof node.data !== 'function') {
                                    return;
                                }
                                const type = node.data('type');
                                if (typeof type === 'string' && type.startsWith('timeline-')) {
                                    return;
                                }
                                count += 1;
                            });
                            return count;
                        } catch (countError) {
                            console.warn('Unable to count timeline connector targets during restore:', countError);
                            return 0;
                        }
                    };

                    if (!window.CustomLayouts || typeof window.CustomLayouts.rebuildTimelineConnectors !== 'function') {
                        scheduleRetry(attempt + 1, 15 * (attempt + 1));
                        return;
                    }

                    let rebuildSummary;
                    try {
                        rebuildSummary = window.CustomLayouts.rebuildTimelineConnectors(cy);
                    } catch (timelineError) {
                        console.error('Failed to rebuild timeline connectors during restore:', timelineError);
                        scheduleRetry(attempt + 1, 200 * (attempt + 1));
                        return;
                    }

                    const targetCount = resolveTimelineTargetCount();

                    if (targetCount === 0) {
                        if (attempt < MAX_TIMELINE_RESTORE_ATTEMPTS) {
                            scheduleRetry(attempt + 1, 10 * (attempt + 1));
                        }
                        return;
                    }

                    const measureConnectors = () => {
                        const anchorsFromSummary = rebuildSummary && typeof rebuildSummary.anchors === 'number'
                            ? rebuildSummary.anchors
                            : null;
                        const linksFromSummary = rebuildSummary && typeof rebuildSummary.links === 'number'
                            ? rebuildSummary.links
                            : null;

                        let anchorsCount = anchorsFromSummary;
                        let linksCount = linksFromSummary;

                        if (anchorsCount == null) {
                            try {
                                anchorsCount = cy.nodes('[type="timeline-anchor"]').length;
                            } catch (anchorError) {
                                console.warn('Unable to measure timeline anchors during restore:', anchorError);
                                anchorsCount = 0;
                            }
                        }

                        if (linksCount == null) {
                            try {
                                linksCount = cy.edges('[type="timeline-link"]').length;
                            } catch (edgeError) {
                                console.warn('Unable to measure timeline links during restore:', edgeError);
                                linksCount = 0;
                            }
                        }

                        return { anchorsCount: anchorsCount || 0, linksCount: linksCount || 0 };
                    };

                    const { anchorsCount, linksCount } = measureConnectors();
                    const connectorsSatisfied = anchorsCount >= targetCount && linksCount >= targetCount;

                    if (!connectorsSatisfied) {
                        if (attempt >= MAX_TIMELINE_RESTORE_ATTEMPTS) {
                            console.warn(
                                'Timeline restore reached maximum connector rebuild attempts without creating edges',
                                { anchorsCount, linksCount, targetCount }
                            );
                            this._clearPendingTimelineRebuilds();
                        } else {
                            scheduleRetry(attempt + 1, 15 * (attempt + 1));
                        }
                    }
                };

                attemptTimelineConnectorRebuild();
                this._pendingTimelineRestore = false;

            }

            // Show success notification
            const positionText = hasPositions ? 'positions' : '';
            const layoutText = hasLayoutSettings ? 'layout settings' : '';
            const restored = [positionText, layoutText].filter(Boolean).join(' and ');

            if (window.UI && window.UI.showNotification && restored) {
                window.UI.showNotification(`Restored ${restored}`, 'success');
            }

        } catch (error) {
            console.error('Error during layout restoration:', error);
        } finally {
            if (!finalizeDeferred) {
                finishRestore();
            }
        }
    }
};

// Initialize graph manager when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Give other modules a moment to initialize
    setTimeout(() => {
        window.GraphManager.init();
    }, 1500);
}); 
