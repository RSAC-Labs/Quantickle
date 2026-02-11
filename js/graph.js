// Graph rendering and management for Quantickle
// Handles Cytoscape initialization, graph rendering, and interaction
//
// ========================================
// MODULARIZATION STATUS
// ========================================
// This file has been partially modularized. The following 10 modules have been extracted:
// 1. DebugTools, 2. PerformanceManager, 3. GraphStyling,
// 4. GraphControls, 5. SelectionManager, 6. GraphEditor, 7. EdgeCreator,
// 8. LODManager, 9. ProgressManager, 10. 3DRotationManager
//
// All modular versions are enabled by default. Legacy functions below are kept 
// for reference but the modular versions take precedence.
// ========================================

window.GraphRenderer = {
    cy: null,
    currentNodeIds: null,
    isWebGLEnabled: false,
    supportsShadowStyles: true,
    selectionMode: false, // Track if we're in selection mode
    edgeCreationMode: false, // Track if we're creating an edge
    edgeSourceNode: null, // Store the source node for edge creation
    labelsHidden: false, // Track if labels are currently hidden for performance
    labelsHiddenDueToVisibility: false,
    labelsHiddenDueToLOD: false,
    currentLODLevel: 'full',
    _labelVisibilityUpdateScheduled: false,
    _labelVisibilityTimeoutId: null,
    _labelVisibilityUpdateDelay: 180,
    _interactionLowDetailActive: false,
    _interactionLowDetailRestoreTimeoutId: null,
    _interactionLowDetailRestoreDelay: 180,
    _interactionLowDetailNodeThreshold: 200,
    _interactionLowDetailCooldownMs: 750,
    _lastInteractionLowDetailStart: 0,
    _interactionLowDetailCooldownUntil: 0,
    _imageDimensionCache: new Map(),
    _pendingImageDimensionRequests: new Map(),
    _labelIndex: null,
    _labelIndexListenersAttached: false,
    _bulkNodeDataBuffer: null,
    _bulkNodeDataDepth: 0,


    // Manual editing state
    editingMode: true, // Track if we're in editing mode - enabled by default for better UX
    clipboard: [], // Store copied nodes
    clipboardClearTimeout: null, // Timer for auto-clearing clipboard
    internalClipboardTimestamp: null, // Last time internal clipboard was updated
    lastExternalClipboardTimestamp: null, // Last time external clipboard was updated
    lastClipboardSource: null, // 'internal' or 'external' to track most recent copy
    lastExternalClipboardText: undefined, // Last known external clipboard text
    clipboardTransferStore: null, // Temporary clipboard store for graph reloads
    isInternalCopy: false, // Flag to ignore copy event from internal operations
    _pasteCatcher: null, // Hidden textarea for legacy paste support
    nextNodeId: 1, // Counter for new node IDs
    nodeResizeState: null, // Track node resizing state
    nodeResizeHoverNode: null, // Node currently hovered for resize
    nodeResizeHoverOnEdge: false, // Whether the cursor is on a resizable edge
    nodeResizeHoverPrevBoxSelection: undefined, // Previous box selection state during edge hover
    nodeResizeEdgeThreshold: 14, // Pixel threshold for detecting edge-based resizing
    lastPointerPosition: null, // Track the last known mouse position over the graph
    _pointerTrackingInitialized: false,
    _pointerTrackingContainer: null,

    _interactionBoundingBoxOptions: { includeLabels: false, includeOverlays: false },

    getNodeInteractionBoundingBox(element) {
        if (!element || typeof element.boundingBox !== 'function') {
            return null;
        }
        const opts = this._interactionBoundingBoxOptions;
        try {
            return element.boundingBox(opts);
        } catch (error) {
            try {
                return element.boundingBox();
            } catch (innerError) {
                return null;
            }
        }
    },

    isPositionNearNodeEdge(pos, bb, threshold) {
        if (!pos || !bb) {
            return false;
        }

        const effectiveThreshold = Number.isFinite(threshold)
            ? Math.max(0, threshold)
            : 10;

        const withinX = pos.x >= (bb.x1 - effectiveThreshold) && pos.x <= (bb.x2 + effectiveThreshold);
        const withinY = pos.y >= (bb.y1 - effectiveThreshold) && pos.y <= (bb.y2 + effectiveThreshold);

        const nearLeft = withinY && Math.abs(pos.x - bb.x1) <= effectiveThreshold;
        const nearRight = withinY && Math.abs(pos.x - bb.x2) <= effectiveThreshold;
        const nearTop = withinX && Math.abs(pos.y - bb.y1) <= effectiveThreshold;
        const nearBottom = withinX && Math.abs(pos.y - bb.y2) <= effectiveThreshold;

        return nearLeft || nearRight || nearTop || nearBottom;
    },

    resolveBackgroundFitValue(value, fallback = 'contain') {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed) {
                return trimmed;
            }
        }
        return fallback;
    },

    resolveBackgroundPositionValue(value, fallback = '50%') {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed) {
                return trimmed;
            }
        }
        return fallback;
    },

    resolveBackgroundFitForType(type) {
        const typeSettings = window.NodeTypes && type && window.NodeTypes[type]
            ? window.NodeTypes[type]
            : null;
        const defaultSettings = window.NodeTypes && window.NodeTypes.default
            ? window.NodeTypes.default
            : null;
        const typeFit = typeSettings && typeof typeSettings.backgroundFit === 'string'
            ? typeSettings.backgroundFit
            : '';
        const defaultFit = defaultSettings && typeof defaultSettings.backgroundFit === 'string'
            ? defaultSettings.backgroundFit
            : '';
        return this.resolveBackgroundFitValue(typeFit, this.resolveBackgroundFitValue(defaultFit, 'contain'));
    },

    // Graph instance navigation state
    graphInstanceStack: [],
    graphInstanceLoading: false,
    activeGraphInstance: null,
    graphReturnNodeIdSeed: 0,
    graphInstanceLayoutGuardToken: null,
    graphReturnOverlayElement: null,
    graphReturnOverlayCircleElement: null,
    graphReturnOverlayIconElement: null,
    graphReturnOverlayLabelElement: null,
    graphReturnOverlayContainerOriginalPosition: undefined,
    graphReturnOverlayContainerRef: null,
    graphReturnOverlayListeners: null,

    GraphPortal: {
        renderer: null,
        cy: null,
        overlay: null,
        portalCy: null,
        activeNodeId: null,
        originalState: null,
        escapeHandler: null,
        nodeRemovalHandler: null,

        init(renderer) {
            if (!renderer) {
                return;
            }

            this.renderer = renderer;
            this.setCy(renderer.cy);
        },

        setCy(cy) {
            if (this.cy === cy) {
                return;
            }

            if (this.cy && this.nodeRemovalHandler) {
                this.cy.off('remove', 'node', this.nodeRemovalHandler);
            }

            this.cy = cy;

            if (this.cy) {
                this.nodeRemovalHandler = (evt) => {
                    const node = evt.target;
                    if (!node || !node.id || !this.activeNodeId) {
                        return;
                    }
                    const matchesActive = typeof node.id === 'function'
                        ? node.id() === this.activeNodeId
                        : node.data && node.data('id') === this.activeNodeId;
                    if (matchesActive) {
                        this.collapse({ restoreOriginalState: false });
                    }
                };
                this.cy.on('remove', 'node', this.nodeRemovalHandler);
            }
        },

        supportsNode(node) {
            if (!node || typeof node.isNode !== 'function' || !node.isNode()) {
                return false;
            }

            if (typeof node.removed === 'function' && node.removed()) {
                return false;
            }

            if (typeof node.hasClass === 'function' && node.hasClass('container')) {
                return false;
            }

            const type = typeof node.data === 'function' ? node.data('type') : undefined;
            if (type === 'text') {
                return false;
            }

            return true;
        },

        isExpanded(node) {
            if (!node || typeof node.data !== 'function') {
                return false;
            }
            const state = node.data('portalState');
            return state === 'expanded' || (this.activeNodeId && node.id && node.id() === this.activeNodeId);
        },

        isActive() {
            return Boolean(this.activeNodeId);
        },

        getActiveNode() {
            if (!this.cy || !this.activeNodeId) {
                return null;
            }
            try {
                const node = this.cy.getElementById(this.activeNodeId);
                if (node && typeof node.removed === 'function' && node.removed()) {
                    return null;
                }
                return node && node.length ? node : null;
            } catch (error) {
                return null;
            }
        },

        ensureOverlay() {
            if (this.overlay) {
                return this.overlay;
            }

            const overlay = document.createElement('div');
            overlay.className = 'graph-portal-overlay';
            overlay.setAttribute('aria-hidden', 'true');

            overlay.innerHTML = `
                <div class="graph-portal-shell" role="dialog" aria-modal="true" aria-label="Graph portal">
                    <header class="graph-portal-header">
                        <div class="graph-portal-title"></div>
                        <div class="graph-portal-actions">
                            <button type="button" class="graph-portal-return" aria-label="Return to main graph">
                                <span class="graph-portal-return-icon">↩</span>
                                <span class="graph-portal-return-label">Return</span>
                            </button>
                        </div>
                    </header>
                    <section class="graph-portal-body">
                        <div class="graph-portal-viewport">
                            <div class="graph-portal-empty" hidden>Portal view unavailable</div>
                            <div class="graph-portal-canvas"></div>
                        </div>
                        <aside class="graph-portal-sidebar">
                            <h2 class="graph-portal-sidebar-title">Node details</h2>
                            <dl class="graph-portal-metadata"></dl>
                        </aside>
                    </section>
                </div>
            `;

            const returnButton = overlay.querySelector('.graph-portal-return');
            if (returnButton) {
                returnButton.setAttribute('title', 'Return to main graph');
                returnButton.setAttribute('aria-label', 'Return to main graph');
                const labelSpan = returnButton.querySelector('.graph-portal-return-label');
                if (labelSpan) {
                    labelSpan.textContent = 'Return';
                }

                returnButton.addEventListener('click', () => this.collapse({ focusGraph: true }));
            }

            overlay.addEventListener('click', (evt) => {
                if (evt.target === overlay) {
                    this.collapse({ focusGraph: true });
                }
            });

            this.escapeHandler = (evt) => {
                if (evt.key === 'Escape' && this.isActive()) {
                    this.collapse({ focusGraph: true });
                }
            };
            document.addEventListener('keydown', this.escapeHandler);

            document.body.appendChild(overlay);
            this.overlay = overlay;
            return overlay;
        },

        updateMetadata(node) {
            if (!node || !this.overlay) {
                return;
            }

            const metadata = this.overlay.querySelector('.graph-portal-metadata');
            if (!metadata) {
                return;
            }

            const label = typeof node.data === 'function' ? (node.data('label') || node.id()) : node.id();
            const type = typeof node.data === 'function' ? (node.data('type') || 'unknown') : 'unknown';
            const description = typeof node.data === 'function' ? (node.data('description') || node.data('info') || '') : '';

            const safeDescription = description ? description.toString() : '';

            metadata.innerHTML = `
                <div class="graph-portal-meta-item">
                    <dt>Label</dt>
                    <dd>${this.escapeHtml(label)}</dd>
                </div>
                <div class="graph-portal-meta-item">
                    <dt>Type</dt>
                    <dd>${this.escapeHtml(type)}</dd>
                </div>
                ${safeDescription ? `<div class="graph-portal-meta-item"><dt>Description</dt><dd>${this.escapeHtml(safeDescription)}</dd></div>` : ''}
            `;
        },

        escapeHtml(value) {
            if (value === null || value === undefined) {
                return '';
            }
            return value
                .toString()
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },

        expand(node) {
            if (!this.renderer || !this.supportsNode(node)) {
                return;
            }

            const overlay = this.ensureOverlay();

            if (this.activeNodeId && node && typeof node.id === 'function' && this.activeNodeId === node.id()) {
                return;
            }

            if (this.activeNodeId && (!node || node.id() !== this.activeNodeId)) {
                this.collapse({ restoreOriginalState: true });
            }

            if (node && typeof node.id === 'function') {
                this.originalState = {
                    nodeId: node.id(),
                    portalState: typeof node.data === 'function' ? node.data('portalState') : undefined
                };
                this.activeNodeId = node.id();
            } else {
                this.activeNodeId = null;
                this.originalState = null;
            }

            if (node && typeof node.data === 'function') {
                node.data('portalState', 'expanded');
            }

            if (node && typeof node.addClass === 'function') {
                node.addClass('portal-expanded');
            }

            const title = overlay.querySelector('.graph-portal-title');
            if (title && node) {
                const label = typeof node.data === 'function' ? (node.data('label') || node.id()) : node.id();
                title.textContent = label;
            }

            this.updateMetadata(node);

            overlay.classList.add('is-visible');
            overlay.setAttribute('aria-hidden', 'false');
            document.body.classList.add('graph-portal-open');

            const returnButton = overlay.querySelector('.graph-portal-return');
            if (returnButton) {
                setTimeout(() => {
                    returnButton.focus({ preventScroll: true });
                }, 0);
            }

            this.renderPortalGraph(node);
        },

        toggle(node) {
            if (!node) {
                return;
            }

            if (this.isExpanded(node)) {
                this.collapse({ focusGraph: true });
            } else {
                this.expand(node);
            }
        },

        collapse(options = {}) {
            const opts = {
                restoreOriginalState: true,
                focusGraph: false,
                ...options
            };

            const node = this.getActiveNode();

            if (node && typeof node.removeClass === 'function') {
                node.removeClass('portal-expanded');
            }

            if (node && typeof node.data === 'function') {
                const previousState = this.originalState && this.originalState.portalState !== undefined
                    ? this.originalState.portalState
                    : undefined;
                if (opts.restoreOriginalState && previousState && previousState !== 'expanded' && previousState !== 'collapsed') {
                    node.data('portalState', previousState);
                } else {
                    node.data('portalState', 'collapsed');
                }
            }

            this.originalState = null;
            this.activeNodeId = null;

            if (this.portalCy && typeof this.portalCy.destroy === 'function') {
                this.portalCy.destroy();
            }
            this.portalCy = null;

            if (this.overlay) {
                this.overlay.classList.remove('is-visible');
                this.overlay.setAttribute('aria-hidden', 'true');
            }

            document.body.classList.remove('graph-portal-open');

            if (opts.focusGraph && this.renderer && this.renderer.cy && this.renderer.cy.container) {
                const container = this.renderer.cy.container();
                if (container && typeof container.focus === 'function') {
                    container.focus({ preventScroll: true });
                }
            }
        },

        renderPortalGraph(node) {
            const overlay = this.overlay || this.ensureOverlay();
            if (!overlay) {
                return;
            }

            const viewport = overlay.querySelector('.graph-portal-viewport');
            const canvas = overlay.querySelector('.graph-portal-canvas');
            const emptyState = overlay.querySelector('.graph-portal-empty');

            if (canvas) {
                canvas.innerHTML = '';
            }

            if (!node || !this.renderer) {
                if (viewport) {
                    viewport.classList.add('graph-portal-viewport--empty');
                }
                if (emptyState) {
                    emptyState.hidden = false;
                    emptyState.textContent = 'Select a node to open the portal view';
                }
                return;
            }

            const cytoscapeFactory = typeof window !== 'undefined' && window.cytoscape
                ? window.cytoscape
                : (typeof cytoscape !== 'undefined' ? cytoscape : null);

            if (!cytoscapeFactory || !canvas) {
                if (viewport) {
                    viewport.classList.add('graph-portal-viewport--empty');
                }
                if (emptyState) {
                    emptyState.hidden = false;
                    emptyState.textContent = 'Portal view unavailable';
                }
                return;
            }

            viewport.classList.remove('graph-portal-viewport--empty');
            if (emptyState) {
                emptyState.hidden = true;
            }

            let collection = null;
            if (typeof node.closedNeighborhood === 'function') {
                try {
                    collection = node.closedNeighborhood();
                } catch (error) {
                    collection = null;
                }
            }

            let elements = [];
            if (collection && typeof collection.jsons === 'function') {
                elements = collection.jsons();
            } else if (collection && typeof collection.forEach === 'function') {
                const temp = [];
                collection.forEach(ele => {
                    if (ele && typeof ele.json === 'function') {
                        temp.push(ele.json());
                    }
                });
                elements = temp;
            }

            if (!Array.isArray(elements) || elements.length === 0) {
                if (typeof node.json === 'function') {
                    elements = [node.json()];
                } else {
                    elements = [{
                        group: 'nodes',
                        data: {
                            id: node.id(),
                            label: typeof node.data === 'function' ? node.data('label') || node.id() : node.id()
                        }
                    }];
                }
            }

            const seen = new Set();
            const deduped = [];
            elements.forEach(ele => {
                if (!ele || !ele.data) {
                    return;
                }
                const group = ele.group || (ele.data.source && ele.data.target ? 'edges' : 'nodes');
                const id = ele.data.id || `${ele.data.source || ''}_${ele.data.target || ''}`;
                const key = `${group}:${id}`;
                if (seen.has(key)) {
                    return;
                }
                seen.add(key);
                deduped.push(ele);
            });

            const portalStyles = this.cloneRendererStylesheet() || this.createFallbackStylesheet();

            this.portalCy = cytoscapeFactory({
                container: canvas,
                elements: deduped,
                layout: {
                    name: 'cose',
                    animate: false,
                    padding: 40,
                    idealEdgeLength: 120,
                    nodeOverlap: 20
                },
                style: portalStyles,
                userZoomingEnabled: true,
                userPanningEnabled: true,
                boxSelectionEnabled: false,
                wheelSensitivity: 0.25
            });

            setTimeout(() => {
                if (this.portalCy && typeof this.portalCy.resize === 'function') {
                    this.portalCy.resize();
                    this.portalCy.fit();
                }
            }, 50);
        },

        cloneRendererStylesheet() {
            if (!this.renderer || !this.renderer.cy || typeof this.renderer.cy.style !== 'function') {
                return null;
            }

            try {
                const style = this.renderer.cy.style();
                if (!style || typeof style.json !== 'function') {
                    return null;
                }

                const json = style.json();
                if (!json) {
                    return null;
                }

                const cloned = JSON.parse(JSON.stringify(json));
                return Array.isArray(cloned) && cloned.length > 0 ? cloned : null;
            } catch (error) {
                return null;
            }
        },

        createFallbackStylesheet() {
            const supportsShadows = this.renderer
                ? this.renderer.supportsShadowStyles
                : true;

            return [
                {
                    selector: 'node',
                    style: {
                        'background-color': '#63b3ed',
                        'border-width': 3,
                        'border-color': '#1d4ed8',
                        'color': '#0f172a',
                        'font-size': 14,
                        'font-weight': 'bold',
                        'label': 'data(label)',
                        'text-wrap': 'wrap',
                        'text-max-width': 140,
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'width': 70,
                        'height': 70,
                        ...(supportsShadows
                            ? {
                                  'shadow-blur': 18,
                                  'shadow-color': '#60a5fa',
                                  'shadow-opacity': 0.35
                              }
                            : {})
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 2,
                        'line-color': '#cbd5f5',
                        'curve-style': 'bezier',
                        'target-arrow-shape': 'triangle',
                        'target-arrow-color': '#cbd5f5',
                        'opacity': 0.9
                    }
                },
                {
                    selector: 'node:selected',
                    style: {
                        'border-color': '#facc15',
                        'border-width': 5
                    }
                }
            ];
        }
    },

    safeClone(value, seen = new WeakMap()) {
        if (value === null || value === undefined) {
            return value;
        }

        if (typeof structuredClone === 'function') {
            try {
                return structuredClone(value);
            } catch (error) {
                // Fall through to manual cloning when structuredClone fails
            }
        }

        const valueType = typeof value;

        if (valueType === 'function' || valueType === 'symbol') {
            return undefined;
        }

        if (valueType !== 'object') {
            return value;
        }

        if (seen.has(value)) {
            return seen.get(value);
        }

        if (Array.isArray(value)) {
            const clonedArray = [];
            seen.set(value, clonedArray);
            value.forEach(item => {
                const clonedItem = this.safeClone(item, seen);
                if (clonedItem !== undefined) {
                    clonedArray.push(clonedItem);
                }
            });
            return clonedArray;
        }

        if (value instanceof Date) {
            return new Date(value.getTime());
        }

        if (value instanceof Map) {
            const mapClone = new Map();
            seen.set(value, mapClone);
            value.forEach((mapValue, mapKey) => {
                const clonedKey = this.safeClone(mapKey, seen);
                const clonedValue = this.safeClone(mapValue, seen);
                if (clonedKey !== undefined && clonedValue !== undefined) {
                    mapClone.set(clonedKey, clonedValue);
                }
            });
            return mapClone;
        }

        if (value instanceof Set) {
            const setClone = new Set();
            seen.set(value, setClone);
            value.forEach(setValue => {
                const clonedValue = this.safeClone(setValue, seen);
                if (clonedValue !== undefined) {
                    setClone.add(clonedValue);
                }
            });
            return setClone;
        }

        const nodeType = value.nodeType || value?.ownerDocument?.nodeType;
        if (typeof nodeType === 'number') {
            return undefined;
        }

        const clonedObject = {};
        seen.set(value, clonedObject);

        Object.keys(value).forEach(key => {
            const property = value[key];
            if (typeof property === 'function' || typeof property === 'symbol') {
                return;
            }

            const clonedProperty = this.safeClone(property, seen);
            if (clonedProperty !== undefined) {
                clonedObject[key] = clonedProperty;
            }
        });

        return clonedObject;
    },

    sanitizeElementClasses(classes) {
        if (!classes) {
            return undefined;
        }

        if (Array.isArray(classes)) {
            const joined = classes.filter(Boolean).map(token => String(token).trim()).filter(Boolean);
            return joined.length ? joined.join(' ') : undefined;
        }

        if (typeof classes === 'string') {
            const trimmed = classes.trim();
            return trimmed || undefined;
        }

        if (typeof classes === 'function') {
            try {
                return this.sanitizeElementClasses(classes());
            } catch (error) {
                return undefined;
            }
        }

        return undefined;
    },

    cloneGraphData(graphData) {
        if (!graphData) {
            return null;
        }

        let cloned = this.safeClone(graphData);

        if (!cloned || typeof cloned !== 'object') {
            cloned = {};
        }

        if (!Array.isArray(cloned.nodes) && Array.isArray(graphData.nodes)) {
            const clonedNodes = graphData.nodes
                .map(node => this.safeClone(node))
                .filter(node => node !== null && node !== undefined);
            cloned.nodes = clonedNodes;
        }

        if (!Array.isArray(cloned.edges) && Array.isArray(graphData.edges)) {
            const clonedEdges = graphData.edges
                .map(edge => this.safeClone(edge))
                .filter(edge => edge !== null && edge !== undefined);
            cloned.edges = clonedEdges;
        }

        if (!cloned.nodes) {
            cloned.nodes = [];
        }

        if (!cloned.edges) {
            cloned.edges = [];
        }

        Object.keys(graphData).forEach(key => {
            if (key === 'nodes' || key === 'edges') {
                return;
            }

            if (Object.prototype.hasOwnProperty.call(cloned, key)) {
                return;
            }

            const clonedValue = this.safeClone(graphData[key]);
            if (clonedValue !== undefined) {
                cloned[key] = clonedValue;
            }
        });

        return cloned;
    },

    graphDataHasContent(graphData) {
        if (!graphData || typeof graphData !== 'object') {
            return false;
        }

        const hasNodes = Array.isArray(graphData.nodes) && graphData.nodes.length > 0;
        const hasEdges = Array.isArray(graphData.edges) && graphData.edges.length > 0;

        return hasNodes || hasEdges;
    },

    graphDataHasAbsolutePositions(graphData) {
        if (!graphData || !Array.isArray(graphData.nodes)) {
            return false;
        }

        return graphData.nodes.some(node => {
            if (!node || typeof node !== 'object') {
                return false;
            }

            const x = typeof node.x === 'number' ? node.x
                : (node.position && typeof node.position.x === 'number' ? node.position.x : null);
            const y = typeof node.y === 'number' ? node.y
                : (node.position && typeof node.position.y === 'number' ? node.position.y : null);

            return Number.isFinite(x) && Number.isFinite(y);
        });
    },

    graphDataHasLayoutSettings(graphData) {
        if (!graphData || typeof graphData !== 'object') {
            return false;
        }

        const layoutSettings = graphData.layoutSettings || graphData.metadata?.layoutSettings;
        if (!layoutSettings || typeof layoutSettings !== 'object') {
            return false;
        }

        return Object.keys(layoutSettings).length > 0;
    },

    hasUnsavedGraphChanges() {
        const dataManager = window.DataManager;
        if (dataManager) {
            if (dataManager.unsavedChanges) {
                return true;
            }

            if (typeof dataManager.getGraphData === 'function') {
                try {
                    const data = dataManager.getGraphData();
                    if (this.graphDataHasContent(data)) {
                        return true;
                    }
                } catch (error) {
                    console.warn('Failed to inspect DataManager graph data for unsaved changes', error);
                }
            }
        }

        const managerGraph = window.GraphManager && window.GraphManager.currentGraph
            ? window.GraphManager.currentGraph
            : null;
        if (this.graphDataHasContent(managerGraph)) {
            return true;
        }

        return false;
    },

    confirmGraphNavigation(context = {}) {
        if (!this.hasUnsavedGraphChanges()) {
            return true;
        }

        const targetLabel = typeof context.targetLabel === 'string' && context.targetLabel.trim()
            ? context.targetLabel.trim()
            : '';
        const actionDescription = typeof context.actionDescription === 'string' && context.actionDescription.trim()
            ? context.actionDescription.trim()
            : 'continue';

        const baseMessage = 'Changes you made may not be saved.';
        const formattedLabel = targetLabel ? `"${targetLabel}"` : '';
        const detail = formattedLabel
            ? `Do you still want to ${actionDescription} ${formattedLabel}?`
            : `Do you still want to ${actionDescription}?`;

        if (typeof window.confirm === 'function') {
            return window.confirm(`${baseMessage}\n\n${detail}`);
        }

        return true;
    },

    scheduleGraphInstanceLayoutRelease(token, previousState) {
        if (!token) {
            return;
        }

        const delay = 600;
        setTimeout(() => {
            if (this.graphInstanceLayoutGuardToken !== token) {
                return;
            }

            this.graphInstanceLayoutGuardToken = null;

            if (previousState) {
                if (Object.prototype.hasOwnProperty.call(previousState, 'suppressPostRenderLayout')) {
                    this.suppressPostRenderLayout = previousState.suppressPostRenderLayout;
                }

                if (Object.prototype.hasOwnProperty.call(previousState, 'skipNextLayoutApplication')) {
                    this.skipNextLayoutApplication = previousState.skipNextLayoutApplication;
                }
            }
        }, delay);
    },

    resetGraphInstanceStack() {
        this.graphInstanceStack = [];
        this.activeGraphInstance = null;
        this.graphInstanceLoading = false;
        this.graphReturnNodeIdSeed = 0;
        this.removeGraphReturnNodes();
    },

    isGraphReturnNode(node) {
        if (!node) {
            return false;
        }

        try {
            if (typeof node.hasClass === 'function' && node.hasClass('graph-return-node')) {
                return true;
            }
        } catch (error) {
            // Ignore class lookup errors and fall back to data inspection
        }

        let flag = false;
        try {
            if (typeof node.data === 'function') {
                flag = !!node.data('graphReturn');
            }
        } catch (error) {
            flag = false;
        }

        if (!flag && node.data) {
            flag = !!node.data.graphReturn;
        }

        return flag;
    },

    isGraphNode(node) {
        if (!node || this.isGraphReturnNode(node)) {
            return false;
        }

        const data = this._getElementDataObject(node);
        const type = typeof data.type === 'string' ? data.type.trim().toLowerCase() : '';

        if (type === 'text') {
            return false;
        }

        if (type === 'graph') {
            return true;
        }

        try {
            if (typeof node.hasClass === 'function') {
                if (node.hasClass('graph-node') || node.hasClass('graph')) {
                    return true;
                }
            }
        } catch (error) {
            // Ignore class lookup errors
        }

        return false;
    },

    generateGraphReturnNodeId() {
        this.graphReturnNodeIdSeed = (this.graphReturnNodeIdSeed || 0) + 1;
        return `__graph_return_${this.graphReturnNodeIdSeed}`;
    },

    getFirstGraphReturnNode() {
        if (!this.cy || typeof this.cy.nodes !== 'function') {
            return null;
        }

        try {
            const nodes = this.cy.nodes('.graph-return-node');
            if (nodes && nodes.length) {
                if (typeof nodes.first === 'function') {
                    const first = nodes.first();
                    if (first && first.length) {
                        return first[0] || null;
                    }
                }

                if (Array.isArray(nodes)) {
                    return nodes[0] || null;
                }

                return nodes[0] || null;
            }
        } catch (error) {
            // Ignore lookup failures and treat as missing
        }

        return null;
    },

    createBlankGraphData(options = {}) {
        const title = typeof options.title === 'string' && options.title.trim()
            ? options.title.trim()
            : 'New graph';

        const graphData = {
            id: window.QuantickleUtils?.generateUuid?.() || `graph-${Date.now()}`,
            title,
            nodes: [],
            edges: [],
            metadata: {
                source: 'Manually added',
                title,
                name: title
            }
        };

        try {
            if (window.QuantickleUtils && typeof window.QuantickleUtils.normalizeGraphIdentity === 'function') {
                window.QuantickleUtils.normalizeGraphIdentity(graphData, {
                    defaultTitle: title,
                    defaultSource: 'Manually added'
                });
            }
        } catch (error) {
            console.warn('Failed to normalize new graph identity', error);
        }

        return graphData;
    },

    getGraphReturnTargetFromStack() {
        if (!Array.isArray(this.graphInstanceStack) || this.graphInstanceStack.length === 0) {
            return null;
        }

        const snapshot = this.graphInstanceStack[this.graphInstanceStack.length - 1];
        const labelCandidates = [
            snapshot?.metadata?.label,
            snapshot?.graphData?.title,
            snapshot?.graphData?.graphId,
            snapshot?.graphData?.metadata?.title,
            snapshot?.graphData?.metadata?.name
        ];
        const label = labelCandidates.find(value => typeof value === 'string' && value.trim());

        return {
            snapshot,
            label: label || 'previous graph'
        };
    },

    calculateGraphReturnNodeDimensions(preferredSize = NaN) {
        const zoomValue = this.cy && typeof this.cy.zoom === 'function'
            ? this.cy.zoom()
            : 1;
        const zoom = Number.isFinite(zoomValue) && zoomValue > 0 ? zoomValue : 1;

        let containerHeight = 0;
        let viewportHeight = 0;
        let cyViewportHeight = 0;

        const container = this.cy && typeof this.cy.container === 'function' ? this.cy.container() : null;
        if (container) {
            const rect = typeof container.getBoundingClientRect === 'function'
                ? container.getBoundingClientRect()
                : null;
            if (rect && Number.isFinite(rect.height) && rect.height > 0) {
                containerHeight = rect.height;
            }

            if ((!Number.isFinite(containerHeight) || containerHeight <= 0)) {
                containerHeight = container.clientHeight || container.offsetHeight || 0;
            }
        }

        if (this.cy) {
            const cyHeight = typeof this.cy.height === 'function' ? this.cy.height() : NaN;
            if (Number.isFinite(cyHeight) && cyHeight > 0) {
                cyViewportHeight = cyHeight;
            }

            const renderer = this.cy.renderer && typeof this.cy.renderer === 'function'
                ? this.cy.renderer()
                : null;
            if (!Number.isFinite(cyViewportHeight) || cyViewportHeight <= 0) {
                const rendererContainer = renderer && renderer.cy && typeof renderer.cy.container === 'function'
                    ? renderer.cy.container()
                    : null;
                const renderedHeight = rendererContainer
                    ? rendererContainer.clientHeight || rendererContainer.offsetHeight || 0
                    : NaN;
                if (Number.isFinite(renderedHeight) && renderedHeight > 0) {
                    cyViewportHeight = renderedHeight;
                }
            }
        }

        if (typeof window !== 'undefined') {
            const innerHeight = Number.isFinite(window.innerHeight) ? window.innerHeight : NaN;
            const docElementHeight = window.document && window.document.documentElement
                && Number.isFinite(window.document.documentElement.clientHeight)
                ? window.document.documentElement.clientHeight
                : NaN;
            const visualViewportHeight = window.visualViewport && Number.isFinite(window.visualViewport.height)
                ? window.visualViewport.height
                : NaN;

            if (Number.isFinite(innerHeight) && innerHeight > 0) {
                viewportHeight = innerHeight;
            }
            if (Number.isFinite(docElementHeight) && docElementHeight > 0) {
                viewportHeight = viewportHeight > 0
                    ? Math.min(viewportHeight, docElementHeight)
                    : docElementHeight;
            }
            if (Number.isFinite(visualViewportHeight) && visualViewportHeight > 0) {
                viewportHeight = viewportHeight > 0
                    ? Math.min(viewportHeight, visualViewportHeight)
                    : visualViewportHeight;
            }
        }

        const positiveHeights = [containerHeight, viewportHeight, cyViewportHeight]
            .filter(value => Number.isFinite(value) && value > 0);
        const effectiveHeight = positiveHeights.length
            ? Math.min(...positiveHeights)
            : (Number.isFinite(containerHeight) && containerHeight > 0 ? containerHeight : NaN);

        const viewportBasedSize = Number.isFinite(effectiveHeight) && effectiveHeight > 0
            ? effectiveHeight * 0.1
            : NaN;

        const fallbackViewportSize = (() => {
            if (Number.isFinite(preferredSize) && preferredSize > 0) {
                return preferredSize * zoom;
            }
            return 90;
        })();

        let viewportSize = Number.isFinite(viewportBasedSize) && viewportBasedSize > 0
            ? viewportBasedSize
            : fallbackViewportSize;

        const minViewportSize = 28;
        if (!Number.isFinite(viewportSize) || viewportSize <= 0) {
            viewportSize = minViewportSize;
        }

        const clampedViewportSize = Math.max(minViewportSize, viewportSize);
        const graphSize = clampedViewportSize / zoom;

        return {
            width: graphSize,
            height: graphSize,
            halfWidth: graphSize / 2,
            halfHeight: graphSize / 2,
            renderedWidth: clampedViewportSize,
            renderedHeight: clampedViewportSize,
            zoom
        };
    },

    calculateGraphReturnNodePosition(dimensions = null) {
        if (!this.cy) {
            return { x: 0, y: 0 };
        }

        const sizing = dimensions && typeof dimensions === 'object'
            ? dimensions
            : this.calculateGraphReturnNodeDimensions();

        const zoomValue = this.cy && typeof this.cy.zoom === 'function'
            ? this.cy.zoom()
            : 1;
        const zoom = Number.isFinite(zoomValue) && zoomValue > 0 ? zoomValue : 1;

        let pan = { x: 0, y: 0 };
        try {
            if (typeof this.cy.pan === 'function') {
                const currentPan = this.cy.pan();
                if (currentPan && Number.isFinite(currentPan.x) && Number.isFinite(currentPan.y)) {
                    pan = currentPan;
                }
            }
        } catch (error) {
            pan = { x: 0, y: 0 };
        }

        const container = typeof this.cy.container === 'function' ? this.cy.container() : null;
        const containerWidth = container ? (container.clientWidth || container.offsetWidth || 0) : 0;
        const containerHeight = container ? (container.clientHeight || container.offsetHeight || 0) : 0;
        const cyWidth = typeof this.cy.width === 'function' ? this.cy.width() : NaN;
        const cyHeight = typeof this.cy.height === 'function' ? this.cy.height() : NaN;
        const windowWidth = Number.isFinite(window.innerWidth) ? window.innerWidth : NaN;
        const windowHeight = Number.isFinite(window.innerHeight) ? window.innerHeight : NaN;

        const viewportWidthCandidates = [containerWidth, cyWidth, windowWidth]
            .filter(value => Number.isFinite(value) && value > 0);
        const viewportHeightCandidates = [containerHeight, cyHeight, windowHeight]
            .filter(value => Number.isFinite(value) && value > 0);
        const viewportWidth = viewportWidthCandidates.length
            ? viewportWidthCandidates[0]
            : 800;
        const viewportHeight = viewportHeightCandidates.length
            ? viewportHeightCandidates[0]
            : 600;

        const renderedWidth = Number.isFinite(sizing?.renderedWidth) && sizing.renderedWidth > 0
            ? sizing.renderedWidth
            : (Number.isFinite(sizing?.width) ? sizing.width * zoom : 90);
        const renderedHeight = Number.isFinite(sizing?.renderedHeight) && sizing.renderedHeight > 0
            ? sizing.renderedHeight
            : (Number.isFinite(sizing?.height) ? sizing.height * zoom : 90);

        const marginX = Math.max(20, (renderedWidth / 2) + 24);
        const marginY = Math.max(20, (renderedHeight / 2) + 24);

        const targetRenderedX = Math.max(marginX, viewportWidth - marginX);
        const targetRenderedY = Math.min(marginY, viewportHeight - marginY);

        const graphX = (targetRenderedX - pan.x) / zoom;
        const graphY = (targetRenderedY - pan.y) / zoom;

        const finalX = Number.isFinite(graphX) ? graphX : 0;
        const finalY = Number.isFinite(graphY) ? graphY : 0;

        return {
            x: finalX,
            y: finalY,
            renderedX: targetRenderedX,
            renderedY: targetRenderedY,
            zoom,
            pan
        };
    },

    ensureGraphReturnNodeOverlay(container = null) {
        if (typeof document === 'undefined') {
            return null;
        }

        const cyContainer = container
            || (this.cy && typeof this.cy.container === 'function' ? this.cy.container() : null);
        if (!cyContainer) {
            return null;
        }

        if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
            try {
                const computed = window.getComputedStyle(cyContainer);
                if (computed && (!computed.position || computed.position === 'static')) {
                    if (this.graphReturnOverlayContainerOriginalPosition === undefined) {
                        this.graphReturnOverlayContainerOriginalPosition = cyContainer.style.position || '';
                    }
                    cyContainer.style.position = 'relative';
                }
            } catch (error) {
                // Ignore inability to compute styles
            }
        }

        this.graphReturnOverlayContainerRef = cyContainer;

        if (this.graphReturnOverlayElement && this.graphReturnOverlayElement.parentNode === cyContainer) {
            return this.graphReturnOverlayElement;
        }

        this.removeGraphReturnNodeOverlay();

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'graph-return-node-overlay';
        Object.assign(button.style, {
            position: 'absolute',
            zIndex: 40,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            background: 'transparent',
            border: 'none',
            padding: '0',
            margin: '0',
            cursor: 'pointer',
            userSelect: 'none',
            pointerEvents: 'auto'
        });
        button.setAttribute('aria-label', 'Return to previous graph');
        button.tabIndex = 0;

        const circle = document.createElement('div');
        circle.className = 'graph-return-node-overlay-circle';
        Object.assign(circle.style, {
            width: '96px',
            height: '96px',
            borderRadius: '24px',
            borderStyle: 'solid',
            borderWidth: '4px',
            borderColor: '#c4b5fd',
            backgroundColor: '#ede9fe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 18px 35px rgba(49, 46, 129, 0.35)',
            transition: 'transform 120ms ease, box-shadow 120ms ease',
            backgroundSize: '70%',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center center'
        });

        const icon = document.createElement('div');
        icon.className = 'graph-return-node-overlay-icon';
        Object.assign(icon.style, {
            fontSize: '0.95rem',
            fontWeight: '700',
            color: '#312e81',
            lineHeight: '1',
            letterSpacing: '0.08em',
            textTransform: 'uppercase'
        });
        icon.textContent = 'BACK';

        const label = document.createElement('div');
        label.className = 'graph-return-node-overlay-label';
        Object.assign(label.style, {
            marginTop: '6px',
            fontWeight: '700',
            fontSize: '0.75rem',
            lineHeight: '1.1',
            color: '#312e81',
            textShadow: '0 1px 0 rgba(255, 255, 255, 0.55)',
            textAlign: 'center',
            maxWidth: '160px',
            wordBreak: 'break-word',
            display: 'none'
        });
        label.setAttribute('aria-hidden', 'true');
        label.textContent = 'BACK';

        circle.appendChild(icon);
        button.appendChild(circle);
        button.appendChild(label);

        const handleTrigger = (event) => {
            this.triggerReturnNodeNavigationFromOverlay(event);
        };
        const handleStop = (event) => {
            if (!event) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
        };

        const handleKeyDown = (event) => {
            if (!event) {
                return;
            }
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.triggerReturnNodeNavigationFromOverlay(event);
            }
        };

        const touchOptions = { passive: false };
        let lastTouchTime = 0;

        const handleTouchEnd = (event) => {
            if (!event) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            const now = Date.now();
            if (now - lastTouchTime < 400) {
                this.triggerReturnNodeNavigationFromOverlay(event);
            }
            lastTouchTime = now;
        };

        button.addEventListener('click', handleStop, false);
        button.addEventListener('dblclick', handleTrigger, false);
        button.addEventListener('mousedown', handleStop, false);
        button.addEventListener('touchstart', handleStop, touchOptions);
        button.addEventListener('touchend', handleTouchEnd, false);
        button.addEventListener('keydown', handleKeyDown, false);

        this.graphReturnOverlayListeners = [
            { event: 'click', handler: handleStop, options: false },
            { event: 'dblclick', handler: handleTrigger, options: false },
            { event: 'mousedown', handler: handleStop, options: false },
            { event: 'touchstart', handler: handleStop, options: touchOptions },
            { event: 'touchend', handler: handleTouchEnd, options: false },
            { event: 'keydown', handler: handleKeyDown, options: false }
        ];

        cyContainer.appendChild(button);

        this.graphReturnOverlayElement = button;
        this.graphReturnOverlayCircleElement = circle;
        this.graphReturnOverlayIconElement = icon;
        this.graphReturnOverlayLabelElement = label;

        return button;
    },

    removeGraphReturnNodeOverlay() {
        if (this.graphReturnOverlayElement) {
            if (Array.isArray(this.graphReturnOverlayListeners)) {
                this.graphReturnOverlayListeners.forEach(listener => {
                    if (!listener || !listener.event || !listener.handler) {
                        return;
                    }
                    try {
                        this.graphReturnOverlayElement.removeEventListener(
                            listener.event,
                            listener.handler,
                            listener.options || false
                        );
                    } catch (error) {
                        // Ignore listener cleanup failures
                    }
                });
            }

            if (this.graphReturnOverlayElement.parentNode) {
                this.graphReturnOverlayElement.parentNode.removeChild(this.graphReturnOverlayElement);
            }
        }

        if (this.graphReturnOverlayContainerRef && this.graphReturnOverlayContainerOriginalPosition !== undefined) {
            try {
                this.graphReturnOverlayContainerRef.style.position = this.graphReturnOverlayContainerOriginalPosition || '';
            } catch (error) {
                // Ignore container restoration failures
            }
        }

        this.graphReturnOverlayElement = null;
        this.graphReturnOverlayCircleElement = null;
        this.graphReturnOverlayIconElement = null;
        this.graphReturnOverlayLabelElement = null;
        this.graphReturnOverlayListeners = null;
        this.graphReturnOverlayContainerRef = null;
        this.graphReturnOverlayContainerOriginalPosition = undefined;
    },

    triggerReturnNodeNavigationFromOverlay(event = null) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        const node = this.getFirstGraphReturnNode();
        if (node && typeof this.handleGraphNodeDoubleTap === 'function') {
            try {
                const handled = this.handleGraphNodeDoubleTap(node);
                if (handled) {
                    return;
                }
            } catch (error) {
                // Fall through to direct restore if the handler fails
            }
        }

        if (typeof this.restorePreviousGraphInstance === 'function') {
            const restored = this.restorePreviousGraphInstance({ focusGraph: true });
            if (
                restored === false
                && typeof window !== 'undefined'
                && window.UI
                && typeof window.UI.showNotification === 'function'
            ) {
                window.UI.showNotification('No previous graph available.', 'info');
            }
        }
    },

    updateGraphReturnNodeOverlay(node, dimensions = null, position = null) {
        if (typeof document === 'undefined') {
            return;
        }

        if (!node) {
            this.removeGraphReturnNodeOverlay();
            return;
        }

        const overlay = this.ensureGraphReturnNodeOverlay();
        if (!overlay || !this.graphReturnOverlayCircleElement) {
            return;
        }

        const circle = this.graphReturnOverlayCircleElement;
        const icon = this.graphReturnOverlayIconElement;
        const label = this.graphReturnOverlayLabelElement;
        const nodeData = this._getElementDataObject(node) || {};

        const renderedWidth = Number.isFinite(dimensions?.renderedWidth) && dimensions.renderedWidth > 0
            ? dimensions.renderedWidth
            : 90;
        const widthPx = Math.max(36, Math.round(renderedWidth));

        circle.style.width = `${widthPx}px`;
        circle.style.height = `${widthPx}px`;
        overlay.style.width = `${widthPx}px`;

        const labelColor = nodeData.labelColor || nodeData.fontColor || '#312e81';
        const backgroundColor = nodeData.backgroundColor || nodeData.color || '#ede9fe';
        const borderColor = nodeData.borderColor || '#c4b5fd';
        const borderWidthValue = parseFloat(nodeData.borderWidth);
        const borderWidth = Number.isFinite(borderWidthValue)
            ? Math.max(2, borderWidthValue)
            : 4;

        circle.style.backgroundColor = backgroundColor;
        circle.style.borderColor = borderColor;
        circle.style.borderWidth = `${borderWidth}px`;
        circle.style.boxShadow = '0 18px 35px rgba(49, 46, 129, 0.35)';
        overlay.style.color = labelColor;

        const labelText = typeof nodeData.label === 'string' && nodeData.label.trim()
            ? nodeData.label.trim()
            : 'BACK';

        if (label) {
            label.textContent = labelText;
            label.style.color = labelColor;
        }

        overlay.setAttribute('aria-label', labelText);
        overlay.title = labelText;

        if (icon) {
            icon.style.backgroundImage = 'none';
            icon.textContent = labelText;
            icon.style.color = labelColor;
        }

        const left = Number.isFinite(position?.renderedX)
            ? Math.round(position.renderedX - (widthPx / 2))
            : 0;
        const top = Number.isFinite(position?.renderedY)
            ? Math.round(position.renderedY - (widthPx / 2))
            : 0;

        overlay.style.left = `${Math.max(0, left)}px`;
        overlay.style.top = `${Math.max(0, top)}px`;
    },

    refreshGraphReturnNodePlacement(options = {}) {
        const delay = Number.isFinite(options?.delay) && options.delay > 0 ? options.delay : 0;
        const targetCy = options?.cy && typeof options.cy.nodes === 'function' ? options.cy : this.cy;

        const applyRefresh = () => {
            const cy = targetCy || this.cy;
            if (!cy || typeof cy.nodes !== 'function') {
                this.removeGraphReturnNodeOverlay();
                return;
            }

            let returnNodes = null;
            try {
                returnNodes = cy.nodes('.graph-return-node');
            } catch (error) {
                returnNodes = null;
            }

            if (!returnNodes || !returnNodes.length) {
                this.removeGraphReturnNodeOverlay();
                return;
            }

            const adjustNode = (node) => {
                if (!node) {
                    return;
                }

                try {
                    this.applyGraphReturnNodeDimensions(node);
                } catch (dimensionError) {
                    try {
                        const position = this.calculateGraphReturnNodePosition();
                        if (position && typeof node.position === 'function') {
                            node.position(position);
                        }
                    } catch (positionError) {
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
        };

        if (delay > 0 && typeof setTimeout === 'function') {
            setTimeout(applyRefresh, delay);
        } else {
            applyRefresh();
        }
    },

    applyGraphReturnNodeDimensions(node, preferredSize = NaN) {
        if (!node) {
            return;
        }

        const dimensions = this.calculateGraphReturnNodeDimensions(preferredSize);
        const widthFromDimensions = Number.isFinite(dimensions?.width) && dimensions.width > 0
            ? dimensions.width
            : NaN;
        const size = Number.isFinite(widthFromDimensions)
            ? widthFromDimensions
            : Number.isFinite(preferredSize) && preferredSize > 0
                ? preferredSize
                : NaN;

        if (!Number.isFinite(size) || size <= 0) {
            return;
        }

        const zoomValue = Number.isFinite(dimensions?.zoom) && dimensions.zoom > 0
            ? dimensions.zoom
            : this.cy && typeof this.cy.zoom === 'function'
                ? this.cy.zoom()
                : 1;
        const zoom = Number.isFinite(zoomValue) && zoomValue > 0 ? zoomValue : 1;

        const renderedWidth = Number.isFinite(dimensions?.renderedWidth) && dimensions.renderedWidth > 0
            ? dimensions.renderedWidth
            : size * zoom;
        const enforcedTextMaxWidth = Math.max(renderedWidth, 120) / zoom;
        const position = this.calculateGraphReturnNodePosition(dimensions);

        try {
            if (typeof node.data === 'function') {
                node.data('size', size);
                node.data('width', size);
                node.data('height', size);
            }
        } catch (dataError) {
            // Ignore data assignment issues
        }

        try {
            if (typeof node.style === 'function') {
                const styleUpdate = {
                    width: size,
                    height: size,
                    'text-max-width': enforcedTextMaxWidth
                };

                if (typeof document !== 'undefined') {
                    styleUpdate.display = 'none';
                    styleUpdate.opacity = 0;
                    styleUpdate['text-opacity'] = 0;
                    styleUpdate['background-opacity'] = 0;
                    styleUpdate['border-opacity'] = 0;
                    styleUpdate.events = 'no';
                }

                node.style(styleUpdate);
            }
        } catch (styleError) {
            // Ignore style assignment issues
        }

        if (position) {
            const shouldUpdateGraphPosition = Number.isFinite(position.x)
                && Number.isFinite(position.y);
            const shouldUpdateRenderedPosition = Number.isFinite(position.renderedX)
                && Number.isFinite(position.renderedY);

            if (shouldUpdateGraphPosition) {
                try {
                    const currentPosition = typeof node.position === 'function'
                        ? node.position()
                        : null;
                    const deltaGraphX = !currentPosition || !Number.isFinite(currentPosition.x)
                        ? Infinity
                        : Math.abs(currentPosition.x - position.x);
                    const deltaGraphY = !currentPosition || !Number.isFinite(currentPosition.y)
                        ? Infinity
                        : Math.abs(currentPosition.y - position.y);

                    if (deltaGraphX > 0.25 || deltaGraphY > 0.25) {
                        node.position({ x: position.x, y: position.y });
                    }
                } catch (positionError) {
                    // Ignore position update issues
                }
            }

            if (shouldUpdateRenderedPosition) {
                try {
                    const currentRendered = typeof node.renderedPosition === 'function'
                        ? node.renderedPosition()
                        : null;
                    const deltaRenderedX = !currentRendered || !Number.isFinite(currentRendered.x)
                        ? Infinity
                        : Math.abs(currentRendered.x - position.renderedX);
                    const deltaRenderedY = !currentRendered || !Number.isFinite(currentRendered.y)
                        ? Infinity
                        : Math.abs(currentRendered.y - position.renderedY);

                    if (deltaRenderedX > 0.25 || deltaRenderedY > 0.25) {
                        node.renderedPosition({ x: position.renderedX, y: position.renderedY });
                    }
                } catch (renderedError) {
                    // Ignore rendered position update issues
                }
            }
        }

        try {
            this.updateGraphReturnNodeOverlay(node, dimensions, position);
        } catch (overlayError) {
            // Ignore overlay update issues to avoid disrupting graph rendering
        }

        try {
            this.updateGraphReturnNodeOverlay(node, dimensions, position);
        } catch (overlayError) {
            // Ignore overlay update issues to avoid disrupting graph rendering
        }
    },

    syncTextCalloutsWithViewport(options = {}) {
        if (typeof window === 'undefined' || !window.TextCallout ||
            typeof window.TextCallout.syncViewport !== 'function') {
            return;
        }

        try {
            window.TextCallout.syncViewport({ immediate: options.immediate === true });
        } catch (error) {
            console.warn('Unable to sync text callouts with viewport:', error);
        }
    },

    fitViewportForGraphInstance(padding = 80) {
        if (!this.cy || typeof this.cy.fit !== 'function') {
            return;
        }

        try {
            let targets = null;
            let graphHasNodes = false;
            let graphHasNonReturnNodes = false;

            if (typeof this.cy.nodes === 'function') {
                const nodes = this.cy.nodes();
                if (nodes && nodes.length) {
                    graphHasNodes = true;
                    const filtered = nodes.filter(node => !this.isGraphReturnNode(node));
                    if (filtered && filtered.length) {
                        graphHasNonReturnNodes = true;
                        targets = filtered;
                    } else {
                        targets = nodes;
                    }
                }
            }

            if (!graphHasNodes) {
                try {
                    if (typeof this.cy.reset === 'function') {
                        this.cy.reset();
                    } else {
                        if (typeof this.cy.zoom === 'function') {
                            this.cy.zoom(1);
                        }
                        if (typeof this.cy.pan === 'function') {
                            this.cy.pan({ x: 0, y: 0 });
                        }
                    }
                } catch (resetError) {
                    // Ignore inability to reset trivial graph viewport
                }
                this.syncTextCalloutsWithViewport({ immediate: true });
                return;
            }

            if (graphHasNodes && !graphHasNonReturnNodes) {
                try {
                    if (typeof this.cy.reset === 'function') {
                        this.cy.reset();
                    } else {
                        if (typeof this.cy.zoom === 'function') {
                            this.cy.zoom(1);
                        }
                        if (typeof this.cy.pan === 'function') {
                            this.cy.pan({ x: 0, y: 0 });
                        }
                    }
                } catch (resetError) {
                    // Ignore inability to reset trivial graph viewport
                }
                this.syncTextCalloutsWithViewport({ immediate: true });
                return;
            }

            let fitPadding = Number.isFinite(padding) ? padding : 80;
            if (targets && targets.length) {
                try {
                    const bounds = targets.boundingBox?.();
                    if (bounds) {
                        const width = Number.isFinite(bounds.w) ? bounds.w : null;
                        const height = Number.isFinite(bounds.h) ? bounds.h : null;
                        const largestDimension = Math.max(width || 0, height || 0);
                        if (largestDimension > 0) {
                            const scaledPadding = largestDimension * 0.08;
                            const minPadding = 50;
                            const maxPadding = 140;
                            fitPadding = Math.max(minPadding, Math.min(maxPadding, scaledPadding));
                        }
                    }
                } catch (paddingError) {
                    // Ignore padding calculation errors and fall back to the base padding value
                }

                this.cy.fit(targets, fitPadding);
            } else {
                this.cy.fit(undefined, fitPadding);
            }
            this.syncTextCalloutsWithViewport({ immediate: true });
        } catch (error) {
            console.warn('Unable to fit graph viewport for linked instance', error);
        }
    },

    resetViewportBeforeGraphReload() {
        const cy = this.cy;
        if (!cy) {
            return;
        }

        try {
            if (typeof cy.zoom === 'function') {
                cy.zoom(1);
            }
        } catch (error) {
            console.warn('Unable to reset graph zoom before reload', error);
        }

        try {
            if (typeof cy.pan === 'function') {
                cy.pan({ x: 0, y: 0 });
            }
        } catch (error) {
            console.warn('Unable to reset graph pan before reload', error);
        }

        this.syncTextCalloutsWithViewport({ immediate: true });
    },

    removeGraphReturnNodes() {
        if (!this.cy || typeof this.cy.nodes !== 'function') {
            this.removeGraphReturnNodeOverlay();
            return;
        }

        try {
            const nodes = this.cy.nodes('.graph-return-node');
            if (nodes && nodes.length) {
                nodes.remove();
            }
        } catch (error) {
            // Ignore removal errors
        }

        this.removeGraphReturnNodeOverlay();
    },

    insertGraphReturnNodeForStackTop() {
        if (!this.cy) {
            return null;
        }

        const target = this.getGraphReturnTargetFromStack();
        if (!target) {
            this.removeGraphReturnNodes();
            return null;
        }

        this.removeGraphReturnNodes();

        const id = this.generateGraphReturnNodeId();
        const label = target.label;

        const nodeData = {
            id,
            label: 'BACK',
            type: 'graph-return',
            graphReturn: true,
            graphReturnLabel: label,
            selectable: true
        };

        const graphDefaults = window.NodeTypes?.graph || {};
        const graphReturnDefaults = window.NodeTypes?.['graph-return'] || {};
        const pickString = (...candidates) => {
            for (const candidate of candidates) {
                if (typeof candidate !== 'string') {
                    continue;
                }

                const trimmed = candidate.trim();
                if (trimmed) {
                    return trimmed;
                }
            }

            return '';
        };
        const parseNumeric = value => {
            if (typeof value === 'number') {
                return Number.isFinite(value) ? value : NaN;
            }

            if (typeof value === 'string') {
                const parsed = parseFloat(value);
                return Number.isFinite(parsed) ? parsed : NaN;
            }

            return NaN;
        };
        const pickNumeric = (...candidates) => {
            for (const candidate of candidates) {
                const parsed = parseNumeric(candidate);
                if (Number.isFinite(parsed)) {
                    return parsed;
                }
            }

            return NaN;
        };

        const fallbackColor = pickString(
            nodeData.color,
            graphReturnDefaults.color,
            graphDefaults.color,
            '#ede9fe'
        ) || '#ede9fe';
        const fallbackLabelColor = pickString(
            nodeData.labelColor,
            nodeData.fontColor,
            graphReturnDefaults.labelColor,
            graphReturnDefaults.fontColor,
            graphDefaults.labelColor,
            graphDefaults.fontColor,
            '#312e81'
        ) || '#312e81';
        const fallbackIcon = pickString(
            nodeData.icon,
            graphReturnDefaults.icon,
            graphDefaults.icon,
            '/assets/domains/symbols/graph.png'
        ) || '/assets/domains/symbols/graph.png';
        const fallbackSize = (() => {
            const candidate = pickNumeric(
                nodeData.size,
                graphReturnDefaults.size,
                graphDefaults.size,
                110
            );
            if (!Number.isFinite(candidate) || candidate <= 0) {
                return 90;
            }
            return candidate;
        })();
        const fallbackBorderWidth = (() => {
            const candidate = pickNumeric(
                nodeData.borderWidth,
                graphReturnDefaults.borderWidth,
                graphDefaults.borderWidth,
                4
            );
            return Number.isFinite(candidate) ? Math.max(candidate, 4) : 4;
        })();
        const fallbackBorderColor = pickString(
            nodeData.borderColor,
            graphReturnDefaults.borderColor,
            graphDefaults.borderColor,
            '#c4b5fd'
        ) || '#c4b5fd';
        const backgroundImage = (() => {
            if (!fallbackIcon || fallbackIcon.toLowerCase() === 'none') {
                return null;
            }

            return this.resolveBackgroundImage(fallbackIcon)
                || this.buildBackgroundImage(fallbackIcon)
                || null;
        })();
        const fallbackShadowColor = 'rgba(196, 181, 253, 0.45)';
        const dimensions = this.calculateGraphReturnNodeDimensions(fallbackSize);
        const position = this.calculateGraphReturnNodePosition(dimensions);
        const finalSize = Number.isFinite(dimensions?.width) && dimensions.width > 0
            ? dimensions.width
            : fallbackSize;
        const enforcedTextMaxWidth = Math.max(finalSize, 120);

        let node = null;
        try {
            node = this.cy.add({
                group: 'nodes',
                data: nodeData,
                position,
                selectable: true,
                grabbable: false,
                locked: true,
                classes: 'graph-return-node'
            });
        } catch (error) {
            console.warn('Failed to add graph return node', error);
            return null;
        }

        if (!node || !node.length) {
            return null;
        }

        const first = Array.isArray(node) ? node[0] : node;

        try {
            if (first && typeof first.lock === 'function') {
                first.lock();
            }
            if (first && typeof first.ungrabify === 'function') {
                first.ungrabify();
            }
            if (first && typeof first.addClass === 'function') {
                first.addClass('graph-return-node');
            }
            if (first && typeof first.selectify === 'function') {
                first.selectify();
            }
            if (first && typeof first.data === 'function') {
                first.data('color', fallbackColor);
                first.data('backgroundColor', fallbackColor);
                first.data('borderColor', fallbackBorderColor);
                first.data('borderWidth', fallbackBorderWidth);
                first.data('size', finalSize);
                first.data('width', finalSize);
                first.data('height', finalSize);
                first.data('shape', 'round-rectangle');
                first.data('labelColor', fallbackLabelColor);
                first.data('fontColor', fallbackLabelColor);
                first.data('textValign', 'center');
                first.data('textMarginY', 0);
                first.data('bold', true);
                first.data('icon', fallbackIcon);
                first.data('backgroundImage', backgroundImage || 'none');
                first.data('selectable', true);
                first.data('deletable', true);
                first.data('removable', true);
            }
            if (first && typeof first.style === 'function') {
                const styleUpdate = {
                    'background-color': fallbackColor,
                    'border-color': fallbackBorderColor,
                    'border-width': fallbackBorderWidth,
                    'color': fallbackLabelColor,
                    'font-weight': 'bold',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'text-wrap': 'wrap',
                    'text-max-width': enforcedTextMaxWidth,
                    'text-margin-y': 0,
                    'width': finalSize,
                    'height': finalSize,
                    'shape': 'round-rectangle',
                    'text-outline-width': 0,
                    'background-image': backgroundImage || 'none'
                };

                if (this.supportsShadowStyles) {
                    Object.assign(styleUpdate, {
                        'shadow-blur': 12,
                        'shadow-color': fallbackShadowColor,
                        'shadow-offset-x': 0,
                        'shadow-offset-y': 0
                    });
                }

                if (backgroundImage && backgroundImage !== 'none') {
                    const backgroundFit = this.resolveBackgroundFitValue(
                        typeof first.data === 'function' ? first.data('backgroundFit') : null,
                        this.resolveBackgroundFitForType('graph-return')
                    );
                    const backgroundPositionX = this.resolveBackgroundPositionValue(
                        typeof first.data === 'function' ? first.data('backgroundPositionX') : null,
                        '50%'
                    );
                    const backgroundPositionY = this.resolveBackgroundPositionValue(
                        typeof first.data === 'function' ? first.data('backgroundPositionY') : null,
                        '50%'
                    );
                    styleUpdate['background-fit'] = backgroundFit;
                    styleUpdate['background-position-x'] = backgroundPositionX;
                    styleUpdate['background-position-y'] = backgroundPositionY;
                    styleUpdate['background-repeat'] = 'no-repeat';
                    styleUpdate['background-width'] = '70%';
                    styleUpdate['background-height'] = '70%';
                }

                first.style(styleUpdate);
            }
            if (first && typeof first.position === 'function') {
                first.position(position);
            }
        } catch (error) {
            console.warn('Unable to finalize graph return node styling', error);
        }

        const applyResponsiveSizing = () => {
            try {
                this.applyGraphReturnNodeDimensions(first, fallbackSize);
            } catch (sizingError) {
                // Ignore responsive sizing issues
            }
        };

        applyResponsiveSizing();

        if (typeof window !== 'undefined') {
            const raf = typeof window.requestAnimationFrame === 'function'
                ? window.requestAnimationFrame.bind(window)
                : null;
            if (raf) {
                raf(() => {
                    applyResponsiveSizing();
                    raf(applyResponsiveSizing);
                });
            } else if (typeof window.setTimeout === 'function') {
                window.setTimeout(applyResponsiveSizing, 0);
                window.setTimeout(applyResponsiveSizing, 200);
            }
        }

        try {
            this.refreshGraphReturnNodePlacement();
        } catch (refreshError) {
        }

        return first;
    },

    initializeGraphInstanceSupport() {
        this.insertGraphReturnNodeForStackTop();
    },

    syncGraphDataNodePositionsFromCy(graphData) {
        if (!graphData || !Array.isArray(graphData.nodes) || !this.cy) {
            return graphData;
        }

        const getCyNodeById = (id) => {
            if (!id || !this.cy) {
                return null;
            }

            let cyNode = null;

            try {
                if (typeof this.cy.getElementById === 'function') {
                    cyNode = this.cy.getElementById(id);
                }
            } catch (error) {
                cyNode = null;
            }

            if (cyNode && typeof cyNode.length === 'number' && cyNode.length > 0) {
                return cyNode;
            }

            if (this.cy && typeof this.cy.$id === 'function') {
                try {
                    const fallback = this.cy.$id(id);
                    if (fallback && typeof fallback.length === 'number' && fallback.length > 0) {
                        return fallback;
                    }
                } catch (error) {
                    return null;
                }
            }

            return null;
        };

        const assignPositionValue = (target, key, value) => {
            if (!target || typeof target !== 'object') {
                return;
            }

            const numeric = typeof value === 'number' ? value : Number.parseFloat(value);
            if (!Number.isFinite(numeric)) {
                return;
            }

            target[key] = numeric;
        };

        graphData.nodes.forEach(node => {
            if (!node || typeof node !== 'object') {
                return;
            }

            const nodeId = typeof node.id === 'string' && node.id.trim()
                ? node.id.trim()
                : (node.data && typeof node.data.id === 'string' && node.data.id.trim()
                    ? node.data.id.trim()
                    : null);

            if (!nodeId) {
                return;
            }

            const cyNode = getCyNodeById(nodeId);
            if (!cyNode || (typeof cyNode.length === 'number' && cyNode.length === 0)) {
                return;
            }

            let position = null;
            try {
                if (typeof cyNode.position === 'function') {
                    position = cyNode.position();
                }
            } catch (error) {
                position = null;
            }

            if (!position || (!Number.isFinite(position.x) && !Number.isFinite(position.y))) {
                return;
            }

            if (!node.position || typeof node.position !== 'object') {
                node.position = {};
            }

            assignPositionValue(node, 'x', position.x);
            assignPositionValue(node, 'y', position.y);
            assignPositionValue(node.position, 'x', position.x);
            assignPositionValue(node.position, 'y', position.y);

            if (node.data && typeof node.data === 'object') {
                assignPositionValue(node.data, 'x', position.x);
                assignPositionValue(node.data, 'y', position.y);

                if (!node.data.position || typeof node.data.position !== 'object') {
                    node.data.position = {};
                }

                assignPositionValue(node.data.position, 'x', position.x);
                assignPositionValue(node.data.position, 'y', position.y);
            }
        });

        return graphData;
    },

    applyNodePositionsFromGraphData(graphData) {
        if (!this.cy || !graphData || !Array.isArray(graphData.nodes)) {
            return;
        }

        const parseCoordinate = (value) => {
            if (typeof value === 'number' && Number.isFinite(value)) {
                return value;
            }

            const parsed = Number.parseFloat(value);
            return Number.isFinite(parsed) ? parsed : null;
        };

        const extractPosition = (node) => {
            if (!node || typeof node !== 'object') {
                return null;
            }

            const sources = [];

            if (Object.prototype.hasOwnProperty.call(node, 'x')) {
                sources.push({ x: node.x, y: node.y });
            }

            if (node.position && typeof node.position === 'object') {
                sources.push({ x: node.position.x, y: node.position.y });
            }

            if (node.data && typeof node.data === 'object') {
                if (Object.prototype.hasOwnProperty.call(node.data, 'x')) {
                    sources.push({ x: node.data.x, y: node.data.y });
                }
                if (node.data.position && typeof node.data.position === 'object') {
                    sources.push({ x: node.data.position.x, y: node.data.position.y });
                }
            }

            for (const candidate of sources) {
                const x = parseCoordinate(candidate?.x);
                const y = parseCoordinate(candidate?.y);

                if (x !== null && y !== null) {
                    return { x, y };
                }
            }

            return null;
        };

        const extractNodeId = (node) => {
            if (!node || typeof node !== 'object') {
                return null;
            }

            if (typeof node.id === 'string' && node.id.trim()) {
                return node.id.trim();
            }

            if (node.data && typeof node.data.id === 'string' && node.data.id.trim()) {
                return node.data.id.trim();
            }

            return null;
        };

        const positions = new Map();

        graphData.nodes.forEach(node => {
            const nodeId = extractNodeId(node);
            if (!nodeId) {
                return;
            }

            const position = extractPosition(node);
            if (!position) {
                return;
            }

            positions.set(nodeId, position);
        });

        if (positions.size === 0) {
            return;
        }

        const updateNodePosition = (nodeId, position) => {
            if (!nodeId || !position) {
                return;
            }

            let cyNode = null;

            try {
                cyNode = this.cy.getElementById(nodeId);
            } catch (error) {
                cyNode = null;
            }

            if (!cyNode || (typeof cyNode.length === 'number' && cyNode.length === 0)) {
                return;
            }

            try {
                const node = Array.isArray(cyNode) ? cyNode[0] : cyNode;
                if (!node || typeof node.position !== 'function') {
                    return;
                }

                let relock = false;
                if (typeof node.locked === 'function' && node.locked()) {
                    if (typeof node.unlock === 'function') {
                        node.unlock();
                        relock = true;
                    }
                }

                node.position(position);

                if (relock && typeof node.lock === 'function') {
                    node.lock();
                }
            } catch (error) {
                console.warn('Unable to restore node position for', nodeId, error);
            }
        };

        try {
            this.cy.batch(() => {
                positions.forEach((position, nodeId) => {
                    updateNodePosition(nodeId, position);
                });
            });
        } catch (error) {
            positions.forEach((position, nodeId) => {
                updateNodePosition(nodeId, position);
            });
        }

        try {
            this.refreshGraphReturnNodePlacement();
        } catch (refreshError) {
        }
    },

    captureEdgesFromCy() {
        if (!this.cy || typeof this.cy.edges !== 'function') {
            return [];
        }

        const resolveEndpointId = (edge, key) => {
            const raw = edge && edge.data && edge.data[key];
            if (typeof raw === 'string' && raw.trim()) {
                return raw.trim();
            }

            try {
                if (typeof edge[key] === 'function') {
                    const endpoint = edge[key]();
                    if (endpoint) {
                        if (typeof endpoint.id === 'function') {
                            const resolved = endpoint.id();
                            if (typeof resolved === 'string' && resolved.trim()) {
                                return resolved.trim();
                            }
                        }

                        const fallbackId = endpoint.id;
                        if (typeof fallbackId === 'string' && fallbackId.trim()) {
                            return fallbackId.trim();
                        }
                    }
                }
            } catch (error) {
                // Ignore errors resolving endpoint ID and fall back to null
            }

            return null;
        };

        const edges = [];

        try {
            this.cy.edges().forEach(edge => {
                if (!edge) {
                    return;
                }

                let data = null;
                try {
                    if (typeof edge.data === 'function') {
                        data = edge.data();
                    } else {
                        data = edge.data;
                    }
                } catch (error) {
                    data = edge.data || null;
                }

                const normalized = data && typeof data === 'object'
                    ? { ...data }
                    : {};

                if (!normalized.id) {
                    try {
                        const rawId = typeof edge.id === 'function' ? edge.id() : edge.id;
                        if (typeof rawId === 'string' && rawId.trim()) {
                            normalized.id = rawId.trim();
                        }
                    } catch (error) {
                        // Ignore id resolution failures
                    }
                }

                const sourceId = resolveEndpointId(edge, 'source');
                const targetId = resolveEndpointId(edge, 'target');

                if (sourceId) {
                    normalized.source = sourceId;
                }
                if (targetId) {
                    normalized.target = targetId;
                }

                if (!normalized.source || !normalized.target) {
                    return;
                }

                if (!normalized.label && normalized.label !== '') {
                    normalized.label = '';
                }

                const classes = this.sanitizeElementClasses(
                    typeof edge.classes === 'function' ? edge.classes() : edge.classes
                );
                if (classes) {
                    normalized.classes = classes;
                }

                edges.push(this.safeClone(normalized));
            });
        } catch (error) {
            console.warn('Failed to capture edges from Cytoscape instance', error);
            return [];
        }

        return edges.filter(edge => edge && edge.source && edge.target);
    },

    captureGraphElementsFromCy() {
        if (!this.cy) {
            return null;
        }

        const result = {
            nodes: [],
            edges: [],
            metadata: null
        };

        try {
            if (typeof this.cy.nodes === 'function') {
                this.cy.nodes().forEach(node => {
                    if (!node || typeof node.data !== 'function') {
                        return;
                    }

                    const data = this.safeClone(node.data());
                    if (!data || typeof data !== 'object') {
                        return;
                    }

                    const position = typeof node.position === 'function'
                        ? this.safeClone(node.position())
                        : null;

                    const sanitizedNode = {
                        data,
                        position,
                        classes: this.sanitizeElementClasses(
                            typeof node.classes === 'function' ? node.classes() : node.classes
                        )
                    };

                    if (typeof node.locked === 'function') {
                        sanitizedNode.locked = node.locked();
                    }
                    if (typeof node.selectable === 'function') {
                        sanitizedNode.selectable = node.selectable();
                    }
                    if (typeof node.grabbable === 'function') {
                        sanitizedNode.grabbable = node.grabbable();
                    }

                    result.nodes.push(sanitizedNode);
                });
            }

            result.edges = this.captureEdgesFromCy();

            if (typeof this.cy.nodes === 'function' && typeof this.cy.edges === 'function') {
                result.metadata = {
                    nodeCount: this.cy.nodes().length,
                    edgeCount: this.cy.edges().length
                };
            }
        } catch (error) {
            console.warn('Failed to capture Cytoscape elements for snapshot fallback', error);
        }

        if (result.nodes.length === 0 && result.edges.length === 0) {
            return null;
        }

        return result;
    },

    hydrateGraphWithFallback(graph, fallback) {
        if (!graph || !fallback) {
            return graph;
        }

        const safeFallback = typeof fallback === 'object' ? this.safeClone(fallback) : null;
        if (!safeFallback) {
            return graph;
        }

        const fallbackNodes = Array.isArray(safeFallback.nodes) ? safeFallback.nodes : [];
        const fallbackEdges = Array.isArray(safeFallback.edges) ? safeFallback.edges : [];

        if (!Array.isArray(graph.nodes)) {
            graph.nodes = [];
        }
        if (!Array.isArray(graph.edges)) {
            graph.edges = [];
        }

        const extractNodeId = (node) => {
            if (!node || typeof node !== 'object') {
                return null;
            }
            if (typeof node.id === 'string' && node.id.trim()) {
                return node.id.trim();
            }
            if (node.data && typeof node.data.id === 'string' && node.data.id.trim()) {
                return node.data.id.trim();
            }
            return null;
        };

        const mergeObjects = (target, source) => {
            if (!target || !source || typeof target !== 'object' || typeof source !== 'object') {
                return;
            }

            Object.keys(source).forEach(key => {
                if (key === 'id') {
                    return;
                }

                const sourceValue = source[key];
                if (sourceValue === undefined) {
                    return;
                }

                const targetValue = target[key];

                const isEmptyString = (value) => typeof value === 'string' && value.trim() === '';

                if (targetValue === undefined || targetValue === null || isEmptyString(targetValue)) {
                    target[key] = this.safeClone(sourceValue);
                    return;
                }

                const bothObjects = typeof targetValue === 'object' && typeof sourceValue === 'object'
                    && targetValue !== null && sourceValue !== null
                    && !Array.isArray(targetValue) && !Array.isArray(sourceValue);

                if (bothObjects) {
                    mergeObjects(targetValue, sourceValue);
                }
            });
        };

        const nodeMap = new Map();
        graph.nodes.forEach(node => {
            const id = extractNodeId(node);
            if (id) {
                nodeMap.set(id, node);
            }
        });

        fallbackNodes.forEach(fallbackNode => {
            const fallbackId = extractNodeId(fallbackNode);
            if (!fallbackId) {
                return;
            }

            const existing = nodeMap.get(fallbackId);
            if (!existing) {
                const cloned = this.safeClone(fallbackNode);
                if (cloned) {
                    graph.nodes.push(cloned);
                    nodeMap.set(fallbackId, cloned);
                }
                return;
            }

            const existingData = existing.data && typeof existing.data === 'object'
                ? existing.data
                : existing;
            const fallbackData = fallbackNode.data && typeof fallbackNode.data === 'object'
                ? fallbackNode.data
                : fallbackNode;

            mergeObjects(existing, fallbackNode);
            mergeObjects(existingData, fallbackData);

            if (!existing.position && fallbackNode.position) {
                existing.position = this.safeClone(fallbackNode.position);
            }
        });

        const extractEdgeKey = (edge) => {
            if (!edge || typeof edge !== 'object') {
                return null;
            }

            const data = edge.data && typeof edge.data === 'object' ? edge.data : edge;
            const id = typeof edge.id === 'string' && edge.id.trim() ? edge.id.trim() : null;
            const dataId = typeof data.id === 'string' && data.id.trim() ? data.id.trim() : null;
            const source = typeof data.source === 'string' && data.source.trim() ? data.source.trim() : null;
            const target = typeof data.target === 'string' && data.target.trim() ? data.target.trim() : null;

            return dataId || id || (source && target ? `${source}->${target}` : null);
        };

        const edgeMap = new Map();
        graph.edges.forEach(edge => {
            const key = extractEdgeKey(edge);
            if (key) {
                edgeMap.set(key, edge);
            }
        });

        fallbackEdges.forEach(fallbackEdge => {
            const key = extractEdgeKey(fallbackEdge);
            if (!key) {
                return;
            }

            const existing = edgeMap.get(key);
            if (!existing) {
                const cloned = this.safeClone(fallbackEdge);
                if (cloned) {
                    graph.edges.push(cloned);
                    edgeMap.set(key, cloned);
                }
                return;
            }

            const existingData = existing.data && typeof existing.data === 'object'
                ? existing.data
                : existing;
            const fallbackData = fallbackEdge.data && typeof fallbackEdge.data === 'object'
                ? fallbackEdge.data
                : fallbackEdge;

            mergeObjects(existing, fallbackEdge);
            mergeObjects(existingData, fallbackData);
        });

        const fallbackMetadata = safeFallback.metadata && typeof safeFallback.metadata === 'object'
            ? safeFallback.metadata
            : null;

        if (fallbackMetadata) {
            if (!graph.metadata || typeof graph.metadata !== 'object') {
                graph.metadata = this.safeClone(fallbackMetadata);
            } else {
                mergeObjects(graph.metadata, fallbackMetadata);
            }
        }

        if (graph.metadata && typeof graph.metadata === 'object') {
            graph.metadata.nodeCount = graph.nodes.length;
            graph.metadata.edgeCount = graph.edges.length;
        }

        return graph;
    },

    captureCurrentGraphState() {
        let graphData = null;

        if (window.DataManager && typeof window.DataManager.getGraphData === 'function') {
            try {
                graphData = window.DataManager.getGraphData();
            } catch (error) {
                console.warn('Unable to capture DataManager graph data', error);
            }
        }

        if (!graphData && window.GraphManager && window.GraphManager.currentGraph) {
            graphData = this.cloneGraphData(window.GraphManager.currentGraph);
        }

        if (!graphData) {
            return null;
        }

        const clonedGraph = this.cloneGraphData(graphData);
        if (!clonedGraph) {
            return null;
        }

        const fallbackElements = this.captureGraphElementsFromCy();

        try {
            this.syncGraphDataNodePositionsFromCy(clonedGraph);
        } catch (error) {
            console.warn('Failed to capture live node positions for snapshot', error);
        }

        if (fallbackElements) {
            this.hydrateGraphWithFallback(clonedGraph, fallbackElements);
        }

        const ensureEdgesPresent = (graph) => {
            if (!graph || !Array.isArray(graph.edges) || graph.edges.length > 0) {
                return;
            }

            const fallbackEdges = (fallbackElements && Array.isArray(fallbackElements.edges))
                ? fallbackElements.edges
                : this.captureEdgesFromCy();
            if (fallbackEdges.length > 0) {
                graph.edges = this.safeClone(fallbackEdges);
                if (graph.metadata && typeof graph.metadata === 'object') {
                    graph.metadata.edgeCount = fallbackEdges.length;
                }
            }
        };

        ensureEdgesPresent(clonedGraph);

        const labelCandidates = [
            window.DataManager?.currentGraphName,
            clonedGraph.title,
            clonedGraph.graphId,
            clonedGraph?.metadata?.title,
            clonedGraph?.metadata?.name
        ];
        const label = labelCandidates.find(name => typeof name === 'string' && name.trim()) || 'Current graph';

        const state = {
            graphData: clonedGraph,
            dataManagerState: null,
            graphManagerState: null,
            viewport: null,
            metadata: {
                label,
                activeGraph: this.activeGraphInstance ? this.safeClone(this.activeGraphInstance) : null
            }
        };

        if (window.DataManager) {
            state.dataManagerState = {
                currentGraphName: window.DataManager.currentGraphName || '',
                currentGraphFileName: window.DataManager.currentGraphFileName || '',
                unsavedChanges: !!window.DataManager.unsavedChanges,
                graphIdentity: window.DataManager.graphIdentity
                    ? this.safeClone(window.DataManager.graphIdentity)
                    : null
            };
        }

        if (window.GraphManager && window.GraphManager.currentGraph) {
            state.graphManagerState = this.cloneGraphData(window.GraphManager.currentGraph);
            if (state.graphManagerState) {
                try {
                    this.syncGraphDataNodePositionsFromCy(state.graphManagerState);
                } catch (error) {
                    console.warn('Failed to capture GraphManager node positions for snapshot', error);
                }
                if (fallbackElements) {
                    this.hydrateGraphWithFallback(state.graphManagerState, fallbackElements);
                }
                ensureEdgesPresent(state.graphManagerState);
            }
        }

        if (this.cy && typeof this.cy.zoom === 'function' && typeof this.cy.pan === 'function') {
            try {
                state.viewport = {
                    zoom: this.cy.zoom(),
                    pan: this.safeClone(this.cy.pan())
                };
            } catch (error) {
                console.warn('Failed to capture graph viewport state', error);
                state.viewport = null;
            }
        }

        if (fallbackElements) {
            state.graphElementsFallback = this.safeClone(fallbackElements);
        }

        return state;
    },

    buildGraphFetchOptionsFromNode(node) {
        const fetchOptions = {};

        const neo4jCreds = window.IntegrationsManager?.getNeo4jCredentials?.() || {};
        const headers = {};
        const assignHeader = (key, value) => {
            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (trimmed) {
                    headers[key] = trimmed;
                }
            }
        };
        assignHeader('X-Neo4j-Url', neo4jCreds.url);
        assignHeader('X-Neo4j-Username', neo4jCreds.username);
        assignHeader('X-Neo4j-Password', neo4jCreds.password);
        assignHeader('X-Neo4j-Db', neo4jCreds.db);

        if (Object.keys(headers).length) {
            fetchOptions.headers = headers;
        }

        return fetchOptions;
    },

    _isHtmlLikeString(value) {
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

    extractGraphReferenceFromNode(node) {
        if (!node) {
            return null;
        }

        const getDataValue = (key) => {
            if (!node) {
                return undefined;
            }
            try {
                if (typeof node.data === 'function') {
                    return node.data(key);
                }
            } catch (error) {
                // Fall through to alternate lookup
            }
            return node?.data?.[key];
        };

        const graphLinkData = getDataValue('graphLink');
        const rawReferenceValue = getDataValue('graphReference');
        const rawInfoValue = getDataValue('info');
        const rawInfoHtml = getDataValue('infoHtml');
        const resolver = window.GraphReferenceResolver;

        const normalizeCandidate = (candidate) => {
            if (!candidate) {
                return null;
            }

            let normalized = null;

            if (resolver && typeof resolver.normalize === 'function') {
                try {
                    normalized = resolver.normalize(candidate);
                } catch (error) {
                    normalized = null;
                }
            }

            if (!normalized) {
                if (typeof candidate === 'string') {
                    const trimmed = candidate.trim();
                    if (!trimmed) {
                        return null;
                    }
                    if (this._isHtmlLikeString(trimmed)) {
                        return null;
                    }

                    if (/^https?:\/\//i.test(trimmed)) {
                        normalized = { source: 'url', key: trimmed };
                    } else if (trimmed.includes(':')) {
                        const [sourceCandidate, ...rest] = trimmed.split(':');
                        const keyCandidate = rest.join(':').trim();
                        if (keyCandidate) {
                            normalized = {
                                source: (sourceCandidate || '').trim() || 'store',
                                key: keyCandidate
                            };
                        }
                    } else if (/[\\/]|\.qut$/i.test(trimmed)) {
                        normalized = { source: 'file', key: trimmed };
                    } else {
                        normalized = { source: 'store', key: trimmed };
                    }
                } else if (typeof candidate === 'object') {
                    const source = typeof candidate.source === 'string' ? candidate.source.trim() : '';
                    const key = typeof candidate.key === 'string' ? candidate.key.trim() : '';
                    if (key) {
                        normalized = { source: source || 'store', key };
                    }
                }
            }

            return normalized && normalized.key ? normalized : null;
        };

        const candidateDescriptors = [];
        const pushCandidate = (value, priority, kind) => {
            if (value === undefined || value === null) {
                return;
            }

            let referenceString = '';
            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (!trimmed) {
                    return;
                }
                if (this._isHtmlLikeString(trimmed)) {
                    return;
                }
                referenceString = trimmed;
                candidateDescriptors.push({ value: trimmed, priority, kind, referenceString: trimmed });
                return;
            }

            if (typeof value === 'object') {
                if (typeof value.reference === 'string' && value.reference.trim()) {
                    referenceString = value.reference.trim();
                } else if (typeof value.key === 'string' && value.key.trim()) {
                    referenceString = value.key.trim();
                }
                candidateDescriptors.push({ value, priority, kind, referenceString });
                return;
            }

            candidateDescriptors.push({ value, priority, kind, referenceString });
        };

        pushCandidate(graphLinkData, 2, 'graphLink');
        pushCandidate(rawReferenceValue, 3, 'graphReference');
        if (!(rawInfoHtml && this._isHtmlLikeString(rawInfoValue))) {
            pushCandidate(rawInfoValue, 1, 'info');
        }

        const normalizedEntry = candidateDescriptors
            .map(descriptor => {
                const normalized = normalizeCandidate(descriptor.value);
                if (!normalized) {
                    return null;
                }
                return {
                    normalized,
                    priority: descriptor.priority,
                    referenceString: descriptor.referenceString
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.priority - a.priority)[0] || null;

        const normalizedLink = normalizedEntry ? normalizedEntry.normalized : null;

        const legacyReference = (() => {
            if (normalizedEntry && normalizedEntry.referenceString) {
                return normalizedEntry.referenceString;
            }

            return [rawReferenceValue, rawInfoValue]
                .map(value => (typeof value === 'string' ? value.trim() : ''))
                .find(value => value);
        })();

        if (!normalizedLink && !legacyReference) {
            return null;
        }

        const label = getDataValue('label') || (typeof node.id === 'function' ? node.id() : node.id);

        return {
            normalizedLink,
            legacyReference,
            label,
            fetchOptions: this.buildGraphFetchOptionsFromNode(node)
        };
    },

    handleGraphNodeDoubleTap(node) {
        if (this.isGraphReturnNode(node)) {
            const restored = this.restorePreviousGraphInstance({ focusGraph: true });
            if (restored === false && window.UI && typeof window.UI.showNotification === 'function') {
                window.UI.showNotification('No previous graph available.', 'info');
            }
            return true;
        }

        const nodeData = this._getElementDataObject(node);
        const nodeType = typeof nodeData.type === 'string' ? nodeData.type.trim().toLowerCase() : '';
        if (nodeType === 'text') {
            return false;
        }

        const referenceInfo = this.extractGraphReferenceFromNode(node);
        if (!referenceInfo) {
            if (!this.isGraphNode(node)) {
                return false;
            }

            Promise.resolve()
                .then(() => this.openNewGraphInstanceFromNode(node))
                .catch(error => {
                    console.error('Failed to open new graph from double-tap', error);
                });

            return true;
        }

        Promise.resolve()
            .then(() => this.openGraphInstanceFromNode(node, referenceInfo))
            .catch(error => {
                console.error('Failed to open linked graph from double-tap', error);
            });

        return true;
    },

    async openNewGraphInstanceFromNode(node) {
        if (!node || !this.isGraphNode(node)) {
            return false;
        }

        if (this.graphInstanceLoading) {
            return true;
        }

        const rawLabel = this.getNodeLabel ? this.getNodeLabel(node) : null;
        const label = typeof rawLabel === 'string' ? rawLabel.trim() : '';
        const nodeId = typeof node?.id === 'function' ? node.id() : node?.id || null;

        const navigationContext = label
            ? { targetLabel: label, actionDescription: 'open a new graph for' }
            : { targetLabel: '', actionDescription: 'create a new graph' };

        const navigationAllowed = this.confirmGraphNavigation(navigationContext);

        if (!navigationAllowed) {
            return true;
        }

        const snapshot = this.captureCurrentGraphState();
        const snapshotPushed = !!snapshot;
        if (snapshotPushed) {
            this.graphInstanceStack.push(snapshot);
        }

        const newGraphTitle = 'New graph';
        const graphData = this.createBlankGraphData({ title: newGraphTitle });

        this.graphInstanceLoading = true;
        try {
            const applied = await Promise.resolve(this.applyGraphInstance(graphData, {
                title: newGraphTitle,
                reference: null
            }));

            if (!applied) {
                if (snapshotPushed) {
                    this.graphInstanceStack.pop();
                }

                if (window.UI && typeof window.UI.showNotification === 'function') {
                    window.UI.showNotification('Failed to render the new graph.', 'warning');
                }

                return true;
            }

            this.activeGraphInstance = {
                label: newGraphTitle,
                reference: null,
                sourceNodeId: nodeId,
                sourceNodeLabel: label || null,
                type: 'new-graph'
            };

            if (window.UI && typeof window.UI.showNotification === 'function') {
                const context = label ? ` for ${label}` : '';
                window.UI.showNotification(`Opened a new graph${context}. Double-click the return node to go back.`, 'success');
            }

            return true;
        } catch (error) {
            console.error('Failed to open new graph instance from node', error);

            if (window.UI && typeof window.UI.showNotification === 'function') {
                window.UI.showNotification('Failed to create a new graph for this node.', 'error');
            }

            if (snapshotPushed) {
                this.graphInstanceStack.pop();
            }

            return true;
        } finally {
            this.graphInstanceLoading = false;
        }
    },

    async openGraphInstanceFromNode(node, referenceInfo = null) {
        if (!node) {
            return false;
        }

        const info = referenceInfo || this.extractGraphReferenceFromNode(node);
        if (!info) {
            return false;
        }

        if (this.graphInstanceLoading) {
            return true;
        }

        const referencePayload = info.normalizedLink || info.legacyReference;
        const descriptor = info.label || (
            referencePayload && typeof referencePayload === 'object'
                ? referencePayload.key
                : referencePayload
        ) || 'linked graph';

        const navigationAllowed = this.confirmGraphNavigation({
            targetLabel: descriptor,
            actionDescription: 'open'
        });
        if (!navigationAllowed) {
            return true;
        }

        this.graphInstanceLoading = true;

        try {
            const fetchOptions = info.fetchOptions || {};
            const result = await this.fetchGraphReference(referencePayload, fetchOptions);
            let graphData = result?.graphData;

            if (!graphData || !Array.isArray(graphData.nodes)) {
                if (window.UI && typeof window.UI.showNotification === 'function') {
                    window.UI.showNotification(`Unable to load graph for ${descriptor}`, 'warning');
                }
                return true;
            }

            try {
                graphData = this.normalizeGraphMetadataNodeTypeStyles(graphData) || graphData;
            } catch (styleError) {
                console.warn('Failed to normalize node type styles for linked graph', styleError);
            }

            try {
                if (window.DomainLoader && typeof window.DomainLoader.autoLoadDomainsForGraph === 'function') {
                    await window.DomainLoader.autoLoadDomainsForGraph(graphData);
                }
            } catch (domainError) {
                console.warn('Failed to auto-load domains for linked graph', domainError);
            }

            const snapshot = this.captureCurrentGraphState();
            if (snapshot) {
                this.graphInstanceStack.push(snapshot);
            }

            const linkDescription = result?.link || info.normalizedLink || info.legacyReference || null;
            const displayName = info.label || graphData.title || graphData.graphId || 'Linked graph';

            const applied = await Promise.resolve(this.applyGraphInstance(graphData, {
                title: displayName,
                reference: linkDescription
            }));

            if (applied) {
                this.activeGraphInstance = {
                    label: displayName,
                    reference: linkDescription
                };
                if (window.UI && typeof window.UI.showNotification === 'function') {
                    window.UI.showNotification(`Opened ${displayName}. Double-click the return node to go back.`, 'success');
                }
            } else if (snapshot) {
                // Restore stack entry if application failed
                this.graphInstanceStack.pop();
            }

            return true;
        } catch (error) {
            if (error?.name === 'AbortError') {
                console.warn('Graph reference fetch aborted');
            } else {
                console.error('Failed to open linked graph instance', error);
                if (window.UI && typeof window.UI.showNotification === 'function') {
                    window.UI.showNotification(`Failed to open linked graph: ${error.message}`, 'error');
                }
            }
            return true;
        } finally {
            this.graphInstanceLoading = false;
        }
    },

    normalizeGraphMetadataNodeTypeStyles(graphData) {
        if (!graphData || typeof graphData !== 'object') {
            return graphData;
        }

        const fileManager = window.FileManager;
        const applyFromFileManager = fileManager && typeof fileManager.applyMetadataNodeTypeStyles === 'function'
            ? fileManager.applyMetadataNodeTypeStyles.bind(fileManager)
            : null;

        if (applyFromFileManager) {
            return applyFromFileManager(graphData);
        }

        return this._fallbackApplyMetadataNodeTypeStyles(graphData);
    },

    _fallbackApplyMetadataNodeTypeStyles(graphData) {
        const metadata = graphData.metadata && typeof graphData.metadata === 'object'
            ? graphData.metadata
            : null;
        const rawStyles = metadata && typeof metadata.nodeTypeStyles === 'object'
            ? metadata.nodeTypeStyles
            : null;

        if (!rawStyles) {
            return graphData;
        }

        const normalizedStyles = {};
        Object.keys(rawStyles).forEach(typeName => {
            const entry = rawStyles[typeName];
            if (!entry || typeof entry !== 'object') {
                return;
            }

            const normalizedEntry = {};
            Object.keys(entry).forEach(rawKey => {
                if (!rawKey) {
                    return;
                }
                const canonicalKey = typeof rawKey === 'string' ? rawKey.trim() : rawKey;
                if (!canonicalKey) {
                    return;
                }
                const value = entry[rawKey];
                if (value === undefined) {
                    return;
                }
                normalizedEntry[canonicalKey] = this._cloneStyleValueFallback(value);
            });

            if (Object.keys(normalizedEntry).length > 0) {
                normalizedStyles[typeName] = normalizedEntry;
            }
        });

        if (!Object.keys(normalizedStyles).length) {
            return graphData;
        }

        const normalizedNodes = (graphData.nodes || []).map(node => {
            if (!node || typeof node !== 'object') {
                return node;
            }

            const updated = { ...node };
            const typeValue = typeof updated.type === 'string' ? updated.type.trim() : '';
            const type = typeValue || 'default';
            const defaults = normalizedStyles[type] || (type !== 'default' ? normalizedStyles.default : null);
            if (!defaults) {
                return updated;
            }

            Object.keys(defaults).forEach(key => {
                const existing = updated[key];
                if (existing !== undefined && existing !== null && existing !== '') {
                    return;
                }
                updated[key] = this._cloneStyleValueFallback(defaults[key]);
            });

            return updated;
        });

        const nextMetadata = metadata
            ? { ...metadata, nodeTypeStyles: normalizedStyles }
            : { nodeTypeStyles: normalizedStyles };

        if (!window.NodeTypes || typeof window.NodeTypes !== 'object') {
            window.NodeTypes = {};
        }

        Object.keys(normalizedStyles).forEach(typeName => {
            const defaults = normalizedStyles[typeName];
            if (!defaults) {
                return;
            }
            if (!window.NodeTypes[typeName] || typeof window.NodeTypes[typeName] !== 'object') {
                window.NodeTypes[typeName] = {};
            }
            Object.keys(defaults).forEach(key => {
                window.NodeTypes[typeName][key] = this._cloneStyleValueFallback(defaults[key]);
            });
        });

        return {
            ...graphData,
            metadata: nextMetadata,
            nodes: normalizedNodes
        };
    },

    _cloneStyleValueFallback(value) {
        if (value === null || typeof value !== 'object') {
            return value;
        }

        try {
            return this.safeClone(value);
        } catch (cloneError) {
            try {
                return JSON.parse(JSON.stringify(value));
            } catch (jsonError) {
                console.warn('GraphRenderer: Unable to clone style value, reusing reference', jsonError);
                return value;
            }
        }
    },

    _normalizeGraphTimestampValue(value) {
        if (value == null) {
            return null;
        }

        if (value instanceof Date) {
            const time = value.getTime();
            return Number.isNaN(time) ? null : value.toISOString();
        }

        if (typeof value === 'number' && Number.isFinite(value)) {
            const normalizedValue = value > 1e12 ? value : value * 1000;
            const date = new Date(normalizedValue);
            return Number.isNaN(date.getTime()) ? null : date.toISOString();
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) {
                return null;
            }

            const numericPattern = /^-?\d+(?:\.\d+)?$/;
            if (numericPattern.test(trimmed)) {
                const numeric = Number.parseFloat(trimmed);
                if (Number.isFinite(numeric)) {
                    return this._normalizeGraphTimestampValue(numeric);
                }
            }

            const date = new Date(trimmed);
            return Number.isNaN(date.getTime()) ? null : date.toISOString();
        }

        return null;
    },

    _extractGraphSavedTimestampFromGraphData(graphData) {
        if (!graphData || typeof graphData !== 'object') {
            return null;
        }

        const candidates = [
            graphData.savedAt,
            graphData.saved_at,
            graphData.saved_on,
            graphData.metadata && graphData.metadata.savedAt,
            graphData.metadata && graphData.metadata.saved_at
        ];

        for (const candidate of candidates) {
            const normalized = this._normalizeGraphTimestampValue(candidate);
            if (normalized) {
                return normalized;
            }
        }

        return null;
    },

    _extractGraphSavedTimestampFromDetails(details = {}) {
        if (!details || typeof details !== 'object') {
            return null;
        }

        const graphData = details.graphData || details.data;
        const graphDataTimestamp = this._extractGraphSavedTimestampFromGraphData(graphData);
        if (graphDataTimestamp) {
            return graphDataTimestamp;
        }

        const metadataTimestamp = details.metadata
            ? (details.metadata.savedAt || details.metadata.saved_at)
            : null;

        const directCandidates = [
            details.savedAt,
            details.saved_at,
            details.timestamp,
            metadataTimestamp
        ];

        for (const candidate of directCandidates) {
            const normalized = this._normalizeGraphTimestampValue(candidate);
            if (normalized) {
                return normalized;
            }
        }

        return null;
    },

    _assignTimestampToNode(element, timestamp) {
        const normalized = this._normalizeGraphTimestampValue(timestamp);
        if (!normalized || !element) {
            return false;
        }

        let applied = false;

        if (typeof element.data === 'function') {
            try {
                element.data('timestamp', normalized);
                applied = true;
            } catch (_) {
                // Ignore assignment issues and fall back to object mutation below.
            }
        }

        if (element.data && typeof element.data === 'object') {
            element.data.timestamp = normalized;
            applied = true;
        }

        if (typeof element === 'object' && element !== null && element.timestamp !== normalized) {
            element.timestamp = normalized;
            applied = true;
        }

        return applied;
    },

    _normalizeSavedGraphLinkPayload(details = {}) {
        if (!details || typeof details !== 'object') {
            return null;
        }

        const resolver = window.GraphReferenceResolver;
        const candidates = [];
        const seen = new Set();

        const pushCandidate = (candidate) => {
            if (!candidate) {
                return;
            }

            let key;
            if (typeof candidate === 'string') {
                key = candidate;
            } else if (typeof candidate === 'object') {
                const source = typeof candidate.source === 'string' ? candidate.source.trim() : '';
                const value = typeof candidate.key === 'string' ? candidate.key.trim() : '';
                if (!source && !value) {
                    return;
                }
                key = `${source}:${value}`;
            } else {
                return;
            }

            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            candidates.push(candidate);
        };

        pushCandidate(details.graphLink);
        pushCandidate(details.reference);
        pushCandidate(details.link);
        pushCandidate(details.normalizedLink);
        pushCandidate(details.referenceString);

        if (details.source && details.key) {
            pushCandidate({ source: details.source, key: details.key });
        }

        const inferredSource = typeof details.source === 'string' ? details.source.trim() : '';
        const addNamedCandidate = (value, fallbackSource) => {
            if (typeof value === 'string' && value.trim()) {
                pushCandidate({ source: inferredSource || fallbackSource, key: value.trim() });
            }
        };

        addNamedCandidate(details.graphName, details.graphSource || 'store');
        addNamedCandidate(details.filename, 'file');
        addNamedCandidate(details.name, 'store');
        addNamedCandidate(details.targetName, 'store');

        for (const candidate of candidates) {
            let normalized = null;

            if (resolver && typeof resolver.normalize === 'function') {
                try {
                    normalized = resolver.normalize(candidate);
                } catch (error) {
                    console.warn('Failed to normalize graph link candidate', error);
                    normalized = null;
                }
            }

            if (!normalized && candidate) {
                if (typeof candidate === 'string') {
                    const trimmed = candidate.trim();
                    if (trimmed) {
                        normalized = {
                            source: inferredSource || 'store',
                            key: trimmed
                        };
                    }
                } else if (typeof candidate === 'object') {
                    const rawSource = typeof candidate.source === 'string' ? candidate.source.trim() : '';
                    const rawKey = typeof candidate.key === 'string' ? candidate.key.trim() : '';
                    if (rawKey) {
                        normalized = {
                            source: rawSource || inferredSource || 'store',
                            key: rawKey
                        };
                    }
                }
            }

            if (normalized && normalized.key) {
                const source = normalized.source || inferredSource || 'store';
                const key = normalized.key;

                const link = { source, key };
                let reference = '';

                if (resolver && typeof resolver.stringify === 'function') {
                    try {
                        reference = resolver.stringify(link);
                    } catch (error) {
                        reference = source === 'url' ? key : `${source}:${key}`;
                    }
                } else {
                    reference = source === 'url' ? key : `${source}:${key}`;
                }

                return { link, reference };
            }
        }

        return null;
    },

    _applySavedGraphLinkToNode(node, nodeId, payload) {
        if (!node || !nodeId || !payload || !payload.link) {
            return false;
        }

        const data = this._getElementDataObject(node);
        if (!this._sanitizeNodeGraphLinkMetadata(data)) {
            return false;
        }

        const currentId = typeof data.id === 'string' ? data.id : (typeof node.id === 'string' ? node.id : null);
        if (!currentId || currentId !== nodeId) {
            return false;
        }

        const clearGraphLinkMetadata = (target) => {
            if (!target || typeof target !== 'object') {
                return;
            }
            if (target.graphLink !== undefined) {
                delete target.graphLink;
            }
            if (target.graphReference !== undefined) {
                delete target.graphReference;
            }
            if (target.reference !== undefined) {
                delete target.reference;
            }
        };

        const applyTo = (target) => {
            if (!target || typeof target !== 'object') {
                return false;
            }

            if (!this._sanitizeNodeGraphLinkMetadata(target)) {
                clearGraphLinkMetadata(target);
                return false;
            }

            if (target.type !== 'graph') {
                clearGraphLinkMetadata(target);
                return false;
            }

            target.graphLink = { source: payload.link.source, key: payload.link.key };
            if (payload.reference) {
                target.graphReference = payload.reference;
                target.info = payload.reference;
            }

            if (payload.savedAt) {
                this._assignTimestampToNode(target, payload.savedAt);
            }

            return true;
        };

        return applyTo(data);
    },

    _applySavedGraphLinkToSnapshot(nodeId, payload) {
        if (!nodeId || !payload || !payload.link) {
            return false;
        }

        if (!Array.isArray(this.graphInstanceStack) || this.graphInstanceStack.length === 0) {
            return false;
        }

        const snapshot = this.graphInstanceStack[this.graphInstanceStack.length - 1];
        if (!snapshot) {
            return false;
        }

        const applyToGraph = (graph) => {
            if (!graph || !Array.isArray(graph.nodes)) {
                return false;
            }

            let changed = false;
            graph.nodes.forEach(node => {
                const data = (node && node.data && typeof node.data === 'object') ? node.data : node;
                if (!this._sanitizeNodeGraphLinkMetadata(data)) {
                    changed = true;
                }
                if (this._applySavedGraphLinkToNode(node, nodeId, payload)) {
                    changed = true;
                }
            });
            return changed;
        };

        let updated = false;

        if (applyToGraph(snapshot.graphData)) {
            updated = true;
        }
        if (applyToGraph(snapshot.graphManagerState)) {
            updated = true;
        }

        const fallbackCollections = [
            snapshot.graphElementsFallback,
            snapshot.fallbackElements,
            snapshot.cyFallback
        ];

        fallbackCollections.forEach(collection => {
            if (!collection || !Array.isArray(collection.nodes)) {
                return;
            }

            collection.nodes.forEach(node => {
                const data = (node && node.data && typeof node.data === 'object') ? node.data : node;
                if (!this._sanitizeNodeGraphLinkMetadata(data)) {
                    updated = true;
                }
            });

            if (collection.nodes.some(node => this._applySavedGraphLinkToNode(node, nodeId, payload))) {
                updated = true;
            }
        });

        if (updated && snapshot.dataManagerState && typeof snapshot.dataManagerState === 'object') {
            snapshot.dataManagerState.unsavedChanges = true;
        }

        return updated;
    },

    _refreshSavedGraphCache(link, saveDetails = {}) {
        if (!link || !link.key) {
            return false;
        }

        const resolver = window.GraphReferenceResolver;
        if (!resolver || typeof resolver.cacheLocalGraph !== 'function') {
            return false;
        }

        const resolveGraphData = () => {
            const candidate = saveDetails.graphData || saveDetails.data;
            if (candidate && Array.isArray(candidate.nodes)) {
                return candidate;
            }

            if (window.DataManager && typeof window.DataManager.getGraphData === 'function') {
                try {
                    const dmGraph = window.DataManager.getGraphData();
                    if (dmGraph && Array.isArray(dmGraph.nodes)) {
                        return dmGraph;
                    }
                } catch (error) {
                    console.warn('Unable to capture DataManager graph data for cache refresh', error);
                }
            }

            if (window.GraphManager && window.GraphManager.currentGraph && Array.isArray(window.GraphManager.currentGraph.nodes)) {
                return window.GraphManager.currentGraph;
            }

            return null;
        };

        const graphData = resolveGraphData();
        if (!graphData || !Array.isArray(graphData.nodes)) {
            return false;
        }

        try {
            resolver.cacheLocalGraph({ source: link.source, key: link.key }, graphData);
            return true;
        } catch (error) {
            console.warn('Failed to refresh saved graph cache', error);
            return false;
        }
    },

    handleActiveGraphSaved(saveDetails = {}) {
        const normalized = this._normalizeSavedGraphLinkPayload(saveDetails);
        if (!normalized || !normalized.link) {
            return false;
        }

        const savedAt = this._extractGraphSavedTimestampFromDetails(saveDetails)
            || (new Date()).toISOString();
        let updatedOriginNode = false;

        if (this.activeGraphInstance && this.activeGraphInstance.type === 'new-graph') {
            const sourceNodeId = this.activeGraphInstance.sourceNodeId;
            if (sourceNodeId) {
                const labelCandidates = [
                    typeof saveDetails.graphName === 'string' ? saveDetails.graphName.trim() : '',
                    typeof saveDetails.title === 'string' ? saveDetails.title.trim() : '',
                    typeof saveDetails.name === 'string' ? saveDetails.name.trim() : '',
                    normalized.link.key
                ];
                const resolvedLabel = labelCandidates.find(value => value) || normalized.link.key;

                const payload = {
                    link: normalized.link,
                    reference: normalized.reference,
                    savedAt,
                    label: resolvedLabel
                };

                if (this._applySavedGraphLinkToSnapshot(sourceNodeId, payload)) {
                    this.activeGraphInstance.reference = { ...payload.link };
                    this.activeGraphInstance.referenceString = payload.reference;
                    if (payload.label) {
                        this.activeGraphInstance.label = payload.label;
                    }
                    updatedOriginNode = true;
                }
            }
        }

        const cacheUpdated = this._refreshSavedGraphCache(normalized.link, saveDetails);

        return updatedOriginNode || cacheUpdated;
    },

    async applyGraphInstance(graphData, options = {}) {
        const clonedGraph = this.cloneGraphData(graphData);
        if (!clonedGraph) {
            return false;
        }

        this._sanitizeGraphLinkMetadataInGraph(clonedGraph);

        this.resetViewportBeforeGraphReload();

        const hasAbsolutePositions = this.graphDataHasAbsolutePositions(clonedGraph);
        const hasLayoutSettings = this.graphDataHasLayoutSettings(clonedGraph);
        let layoutGuardToken = null;
        let previousLayoutState = null;

        if (hasAbsolutePositions || hasLayoutSettings) {
            layoutGuardToken = Symbol('graphInstanceLayoutGuard');
            this.graphInstanceLayoutGuardToken = layoutGuardToken;

            previousLayoutState = {
                suppressPostRenderLayout: this.suppressPostRenderLayout
            };

            this.suppressPostRenderLayout = true;

            if (hasAbsolutePositions) {
                previousLayoutState.skipNextLayoutApplication = this.skipNextLayoutApplication;
                this.skipNextLayoutApplication = true;
            }
        }

        let releaseScheduled = false;
        const ensureLayoutRelease = () => {
            if (!releaseScheduled && layoutGuardToken) {
                this.scheduleGraphInstanceLayoutRelease(layoutGuardToken, previousLayoutState);
                releaseScheduled = true;
            }
        };

        try {
            if (window.DataManager && typeof window.DataManager.setGraphData === 'function') {
                window.DataManager.setGraphData(clonedGraph);
                if (options.title) {
                    const inferredSource = options.graphLink && options.graphLink.source ? options.graphLink.source : null;
                    if (typeof window.DataManager.setGraphName === 'function') {
                        window.DataManager.setGraphName(options.title, {
                            source: inferredSource,
                            ensureExtension: inferredSource === 'file'
                        });
                    } else {
                        window.DataManager.currentGraphName = options.title;
                        window.DataManager.currentGraphFileName = options.title;
                        if (typeof window.DataManager.updateFileNameDisplay === 'function') {
                            window.DataManager.updateFileNameDisplay();
                        }
                    }
                }
            } else if (window.GraphManager) {
                window.GraphManager.currentGraph = this.cloneGraphData(clonedGraph);
            }

            if (window.GraphManager) {
                const managerGraph = this.cloneGraphData(graphData) || this.cloneGraphData(clonedGraph);
                this._sanitizeGraphLinkMetadataInGraph(managerGraph);
                window.GraphManager.currentGraph = managerGraph;
                if (typeof window.GraphManager.updateGraphUI === 'function') {
                    window.GraphManager.updateGraphUI();
                }
            }

            let renderSuccessful = true;
            try {
                const renderResult = this.renderGraph();
                if (renderResult && typeof renderResult.then === 'function') {
                    await renderResult;
                }
            } catch (error) {
                console.error('Error rendering graph while applying linked instance', error);
                renderSuccessful = false;
            }

            try {
                this.applyNodePositionsFromGraphData(clonedGraph);
            } catch (error) {
                console.warn('Failed to apply stored node positions for linked graph', error);
            }

            if (window.TableManager && typeof window.TableManager.updateTables === 'function') {
                window.TableManager.updateTables(true);
            }
            if (window.TableManager && typeof window.TableManager.updateTotalDataTable === 'function') {
                window.TableManager.updateTotalDataTable();
            }

            this.fitViewportForGraphInstance();
            this.insertGraphReturnNodeForStackTop();
            try {
                this.refreshGraphReturnNodePlacement({ delay: 150 });
            } catch (refreshError) {
            }
            ensureLayoutRelease();

            return renderSuccessful;
        } finally {
            ensureLayoutRelease();
        }
    },

    restorePreviousGraphInstance(options = {}) {
        if (!Array.isArray(this.graphInstanceStack) || this.graphInstanceStack.length === 0) {
            return false;
        }

        const pendingSnapshot = this.graphInstanceStack[this.graphInstanceStack.length - 1];
        const pendingLabel = pendingSnapshot?.metadata?.label || 'previous graph';

        const navigationAllowed = this.confirmGraphNavigation({
            targetLabel: pendingLabel,
            actionDescription: 'return to'
        });

        if (!navigationAllowed) {
            return 'cancelled';
        }

        const snapshot = this.graphInstanceStack.pop();
        const label = snapshot?.metadata?.label;

        Promise.resolve(this.applyGraphSnapshot(snapshot))
            .then(success => {
                if (!success) {
                    // Re-add snapshot if restoration failed
                    this.graphInstanceStack.push(snapshot);
                    return;
                }

                this.activeGraphInstance = snapshot?.metadata?.activeGraph || null;

                if (options.focusGraph && this.cy && typeof this.cy.container === 'function') {
                    const container = this.cy.container();
                    if (container && typeof container.focus === 'function') {
                        setTimeout(() => {
                            try {
                                container.focus({ preventScroll: true });
                            } catch (focusError) {
                                console.warn('Unable to focus graph container after restore', focusError);
                            }
                        }, 0);
                    }
                }

                if (options.notify !== false && window.UI && typeof window.UI.showNotification === 'function') {
                    let message = label ? `Returned to ${label}` : 'Returned to previous graph';
                    if (this.graphInstanceStack.length > 0) {
                        message += '. Double-click the return node to go back again.';
                    }
                    window.UI.showNotification(message, 'success');
                }
            })
            .catch(error => {
                console.error('Failed to restore previous graph instance', error);
                this.graphInstanceStack.push(snapshot);
            });

        return true;
    },

    async applyGraphSnapshot(snapshot) {
        if (!snapshot || !snapshot.graphData) {
            return false;
        }

        const clonedGraph = this.cloneGraphData(snapshot.graphData);
        if (!clonedGraph) {
            return false;
        }

        this._sanitizeGraphLinkMetadataInGraph(clonedGraph);

        this.resetViewportBeforeGraphReload();

        const fallbackElements = snapshot.graphElementsFallback
            || snapshot.fallbackElements
            || snapshot.cyFallback;

        if (fallbackElements) {
            this._sanitizeGraphLinkMetadataInGraph(fallbackElements);
            this.hydrateGraphWithFallback(clonedGraph, fallbackElements);
        }

        try {
            if (window.DomainLoader && typeof window.DomainLoader.autoLoadDomainsForGraph === 'function') {
                await window.DomainLoader.autoLoadDomainsForGraph(clonedGraph);
            }
        } catch (domainError) {
            console.warn('Failed to auto-load domains for restored graph', domainError);
        }

        const hasAbsolutePositions = this.graphDataHasAbsolutePositions(clonedGraph);
        const hasLayoutSettings = this.graphDataHasLayoutSettings(clonedGraph);
        let layoutGuardToken = null;
        let previousLayoutState = null;

        if (hasAbsolutePositions || hasLayoutSettings) {
            layoutGuardToken = Symbol('graphInstanceLayoutGuard');
            this.graphInstanceLayoutGuardToken = layoutGuardToken;

            previousLayoutState = {
                suppressPostRenderLayout: this.suppressPostRenderLayout
            };

            this.suppressPostRenderLayout = true;

            if (hasAbsolutePositions) {
                previousLayoutState.skipNextLayoutApplication = this.skipNextLayoutApplication;
                this.skipNextLayoutApplication = true;
            }
        }

        let releaseScheduled = false;
        const ensureLayoutRelease = () => {
            if (!releaseScheduled && layoutGuardToken) {
                this.scheduleGraphInstanceLayoutRelease(layoutGuardToken, previousLayoutState);
                releaseScheduled = true;
            }
        };

        try {
            if (window.DataManager && typeof window.DataManager.setGraphData === 'function') {
                window.DataManager.setGraphData(clonedGraph);
                if (snapshot.dataManagerState) {
                    if (snapshot.dataManagerState.graphIdentity) {
                        const identityClone = this.safeClone(snapshot.dataManagerState.graphIdentity);
                        if (identityClone) {
                            window.DataManager.graphIdentity = identityClone;
                        }
                    }
                    if (typeof snapshot.dataManagerState.currentGraphName === 'string') {
                        window.DataManager.currentGraphName = snapshot.dataManagerState.currentGraphName;
                    }
                    if (typeof snapshot.dataManagerState.currentGraphFileName === 'string') {
                        window.DataManager.currentGraphFileName = snapshot.dataManagerState.currentGraphFileName;
                    }
                    window.DataManager.unsavedChanges = !!snapshot.dataManagerState.unsavedChanges;
                    if (typeof window.DataManager.updateFileNameDisplay === 'function') {
                        window.DataManager.updateFileNameDisplay();
                    }
                }
            } else if (window.GraphManager) {
                window.GraphManager.currentGraph = this.cloneGraphData(clonedGraph);
            }

            if (window.GraphManager) {
                const managerGraph = snapshot.graphManagerState
                    ? this.cloneGraphData(snapshot.graphManagerState)
                    : (window.DataManager && typeof window.DataManager.getGraphData === 'function'
                        ? window.DataManager.getGraphData()
                        : this.cloneGraphData(clonedGraph));
                this._sanitizeGraphLinkMetadataInGraph(managerGraph);
                if (fallbackElements) {
                    this.hydrateGraphWithFallback(managerGraph, fallbackElements);
                }
                window.GraphManager.currentGraph = managerGraph;
                if (typeof window.GraphManager.updateGraphUI === 'function') {
                    window.GraphManager.updateGraphUI();
                }
            }

            let renderSuccessful = true;
            try {
                const renderResult = this.renderGraph();
                if (renderResult && typeof renderResult.then === 'function') {
                    await renderResult;
                }
            } catch (error) {
                console.error('Error rendering graph during restore', error);
                renderSuccessful = false;
            }

            try {
                this.applyNodePositionsFromGraphData(clonedGraph);
                if (snapshot.graphManagerState) {
                    this.applyNodePositionsFromGraphData(snapshot.graphManagerState);
                }
            } catch (positionError) {
                console.warn('Failed to restore node positions from snapshot', positionError);
            }

            if (snapshot.viewport && this.cy) {
                try {
                    if (typeof snapshot.viewport.zoom === 'number' && Number.isFinite(snapshot.viewport.zoom)) {
                        this.cy.zoom(snapshot.viewport.zoom);
                    }
                    if (snapshot.viewport.pan && typeof this.cy.pan === 'function') {
                        this.cy.pan(snapshot.viewport.pan);
                    }
                } catch (viewportError) {
                    console.warn('Failed to restore graph viewport', viewportError);
                }
            }

            if (window.TableManager && typeof window.TableManager.updateTables === 'function') {
                window.TableManager.updateTables(true);
            }
            if (window.TableManager && typeof window.TableManager.updateTotalDataTable === 'function') {
                window.TableManager.updateTotalDataTable();
            }

            this.insertGraphReturnNodeForStackTop();
            try {
                this.refreshGraphReturnNodePlacement({ delay: 150 });
            } catch (refreshError) {
            }
            ensureLayoutRelease();

            return renderSuccessful;
        } finally {
            ensureLayoutRelease();
        }
    },

    _sanitizeNodeGraphLinkMetadata(nodeData) {
        if (!nodeData || typeof nodeData !== 'object') {
            return false;
        }

        const nodeType = nodeData.type;
        const isContainer = nodeType === 'container' || nodeData.isContainer;
        const allowsGraphLink = nodeType === 'graph' || isContainer;

        if (!allowsGraphLink) {
            if (nodeData.graphLink !== undefined) {
                delete nodeData.graphLink;
            }
            if (nodeData.graphReference !== undefined) {
                delete nodeData.graphReference;
            }
            if (nodeData.reference !== undefined) {
                delete nodeData.reference;
            }
        }

        return allowsGraphLink;
    },

    _sanitizeGraphLinkMetadataInGraph(graph) {
        if (!graph || !Array.isArray(graph.nodes)) {
            return false;
        }

        let changed = false;
        graph.nodes.forEach(node => {
            const data = (node && node.data && typeof node.data === 'object') ? node.data : node;
            if (!this._sanitizeNodeGraphLinkMetadata(data)) {
                changed = true;
            }
        });

        return changed;
    },
    // Graph search state
    searchOverlay: null,
    searchInput: null,
    searchCountLabel: null,
    searchPrevButton: null,
    searchNextButton: null,
    searchCloseButton: null,
    searchMatches: [],
    searchMatchesCollection: null,
    searchActiveIndex: -1,
    searchLastTerm: '',

    queueIconResolution(iconKey, normalizedKey) {
        if (!iconKey) {
            return;
        }

        if (!this._pendingIconResolutions) {
            this._pendingIconResolutions = new Map();
        }

        const pendingKey = normalizedKey || iconKey;
        if (this._pendingIconResolutions.has(pendingKey)) {
            return;
        }

        const resolvePromise = window.DomainLoader.resolveIcon(iconKey)
            .then(resolved => {
                if (!resolved) {
                    return;
                }
                if (!window.IconConfigs || typeof window.IconConfigs !== 'object') {
                    window.IconConfigs = {};
                }
                if (!window.IconConfigs[iconKey]) {
                    window.IconConfigs[iconKey] = resolved;
                }
                if (normalizedKey && !window.IconConfigs[normalizedKey]) {
                    window.IconConfigs[normalizedKey] = resolved;
                }
                this.applyResolvedIconReference(iconKey, resolved, normalizedKey);
            })
            .catch(error => {
                console.warn('Failed to resolve workspace icon', iconKey, error);
            })
            .finally(() => {
                this._pendingIconResolutions.delete(pendingKey);
            });

        this._pendingIconResolutions.set(pendingKey, resolvePromise);
    },

    applyResolvedIconReference(iconKey, resolvedUrl, normalizedKey) {
        if (!this.cy || !resolvedUrl) {
            return;
        }

        const candidates = new Set([iconKey, normalizedKey].filter(Boolean));
        for (const candidate of Array.from(candidates)) {
            if (typeof candidate !== 'string') {
                candidates.delete(candidate);
            }
        }
        if (typeof iconKey === 'string') {
            const stripped = iconKey.replace(/^\/+/, '');
            if (stripped && stripped !== iconKey) {
                candidates.add(stripped);
            }
            if (!iconKey.startsWith('/')) {
                candidates.add(`/${iconKey}`);
            }
        }

        const escaped = resolvedUrl.replace(/"/g, '\\"');
        const resolvedCss = /^url\(/i.test(resolvedUrl) ? resolvedUrl : `url("${escaped}")`;

        this.cy.nodes().forEach(node => {
            let updated = false;
            const iconValue = typeof node.data === 'function' ? node.data('icon') : null;
            if (typeof iconValue === 'string' && candidates.has(iconValue.trim())) {
                node.data('backgroundImage', resolvedCss);
                updated = true;
            }

            const backgroundImage = typeof node.data === 'function' ? node.data('backgroundImage') : null;
            if (typeof backgroundImage === 'string') {
                const replaced = backgroundImage.replace(/url\((['"]?)([^'")]+)\1\)/gi, (match, quote, url) => {
                    if (candidates.has(url)) {
                        return resolvedCss;
                    }
                    return match;
                });
                if (replaced !== backgroundImage) {
                    node.data('backgroundImage', replaced);
                    updated = true;
                }
            }

            if (updated && typeof node.style === 'function') {
                node.style('background-image', resolvedCss);
            }
        });

        this.cy.style().update();
    },

    ensureIconUrl(iconValue) {
        if (typeof iconValue !== 'string') {
            return null;
        }

        const trimmed = iconValue.trim();
        if (!trimmed || trimmed === 'none') {
            return null;
        }

        if (/^url\(/i.test(trimmed)) {
            return trimmed;
        }

        if (window.IconConfigs && typeof window.IconConfigs === 'object') {
            const mapped = window.IconConfigs[trimmed];
            if (typeof mapped === 'string' && mapped.trim()) {
                return mapped.trim();
            }
        }

        let resolved = null;
        if (/^https?:\/\//i.test(trimmed)) {
            resolved = `/api/proxy?url=${encodeURIComponent(trimmed)}`;
        } else {
            resolved = window.DomainLoader.getIconProxyUrl(trimmed);
        }

        const isRemote = /^https?:\/\//i.test(trimmed);
        const isEmbedded = /^(data:|blob:)/i.test(trimmed);
        const looksLocal = !isRemote && !isEmbedded;
        if (looksLocal) {
            const normalizedKey = window.DomainLoader.normalizeIconSource(trimmed);
            const cached = normalizedKey ? window.DomainLoader.iconUrlCache.get(normalizedKey) : null;
            if (cached) {
                resolved = cached;
            } else if (window.WorkspaceManager && window.WorkspaceManager.handle) {
                this.queueIconResolution(trimmed, normalizedKey);
                resolved = window.DomainLoader.defaultIcon || resolved;
            }
        }

        if (!resolved) {
            return null;
        }

        if (!window.IconConfigs || typeof window.IconConfigs !== 'object') {
            window.IconConfigs = {};
        }

        if (!window.IconConfigs[trimmed]) {
            window.IconConfigs[trimmed] = resolved;
        }

        return resolved;
    },

    buildBackgroundImage(url) {
        if (typeof url !== 'string') {
            return null;
        }

        const trimmed = url.trim();
        if (!trimmed) {
            return null;
        }

        if (trimmed === 'none') {
            return 'none';
        }

        if (/^url\(/i.test(trimmed)) {
            return trimmed;
        }

        const escaped = trimmed.replace(/"/g, '\\"');
        return `url("${escaped}")`;
    },

    resolveBackgroundImage(iconValue) {
        if (typeof iconValue !== 'string') {
            return null;
        }

        const trimmed = iconValue.trim();
        if (!trimmed || trimmed === 'none') {
            return null;
        }

        const resolvedUrl = this.ensureIconUrl(trimmed) || trimmed;
        return this.buildBackgroundImage(resolvedUrl);
    },

    extractIconUrl(iconValue) {
        if (typeof iconValue !== 'string') {
            return null;
        }

        const trimmed = iconValue.trim();
        if (!trimmed || trimmed === 'none') {
            return null;
        }

        const urlMatch = trimmed.match(/^url\((['"]?)(.+?)\1\)$/i);
        const rawValue = urlMatch ? urlMatch[2] : trimmed;
        if (!rawValue) {
            return null;
        }

        const resolved = this.ensureIconUrl(rawValue) || rawValue;
        if (!resolved) {
            return null;
        }

        const nested = resolved.match(/^url\((['"]?)(.+?)\1\)$/i);
        return nested ? nested[2] : resolved;
    },

    // Docked container management
    dockSpacingConfig: { margin: 5, spacing: 5 },
    _dockedOrderCounters: { left: 0, right: 0, top: 0, bottom: 0 },
    _suppressContainerLockEvents: false,

    // Debug helper for selection actions
    debugSelection: function(...args) {
        if (window.QuantickleConfig?.debugSelectionLogging) {
            console.debug('[Selection]', ...args);
        }
    },

    /**
     * Move a Cytoscape collection of nodes into the provided container while
     * preserving the hierarchy of nested containers. Nodes that have another
     * selected ancestor are skipped so that their parent container carries
     * them into the new container intact.
     *
     * @param {import('cytoscape').Collection} nodes - Nodes selected for regrouping
     * @param {import('cytoscape').NodeSingular} containerNode - Target container
     */
    moveNodesIntoContainer(nodes, containerNode) {
        if (!nodes || !containerNode) {
            return;
        }

        let collection = nodes;
        if (typeof collection.filter !== 'function') {
            if (this.cy && typeof this.cy.collection === 'function') {
                collection = this.cy.collection(collection);
            } else {
                return;
            }
        }

        if (!collection || collection.length === 0) {
            return;
        }

        const supportsAnySame = typeof collection.anySame === 'function';

        const topLevelNodes = collection.filter(node => {
            if (!node || typeof node.ancestors !== 'function') {
                return true;
            }

            const ancestors = node.ancestors();
            if (!ancestors || ancestors.length === 0) {
                return true;
            }

            if (supportsAnySame) {
                return !collection.anySame(ancestors);
            }

            const ancestorIds = ancestors.toArray
                ? ancestors.toArray().map(ancestor => (typeof ancestor.id === 'function' ? ancestor.id() : ancestor.id))
                : [];
            const collectionIds = collection.toArray
                ? collection.toArray().map(n => (typeof n.id === 'function' ? n.id() : n.id))
                : [];

            return !ancestorIds.some(id => collectionIds.includes(id));
        });

        if (topLevelNodes.length === 0) {
            if (typeof collection.unselect === 'function') {
                collection.unselect();
            }
            return;
        }

        topLevelNodes.forEach(node => {
            if (typeof node.move === 'function') {
                node.move({ parent: containerNode.id() });
            }
            if (typeof node.data === 'function') {
                node.data('parent', containerNode.id());
            } else if (node && node.data) {
                node.data.parent = containerNode.id();
            }
            this.debugSelection('Unselecting node moved into container', typeof node.id === 'function' ? node.id() : node);
            if (typeof node.unselect === 'function') {
                node.unselect();
            }
        });

        if (typeof collection.unselect === 'function') {
            collection.unselect();
        }
    },

    // Undo/redo state
    undoStack: [],
    redoStack: [],
    maxHistorySize: 50,
    isRestoring: false,
    historyPaused: false,
    suppressPostRenderLayout: false,
    // Style properties to preserve in undo/redo history
    styleProperties: [
        'background-color',
        'background-image',
        'background-fit',
        'background-width',
        'background-height',
        'shape',
        'color',
        'text-halign',
        'text-valign',
        'font-size',
        'width',
        'height',
        'text-opacity',
        'border-width',
        'border-color',
        'border-opacity'
    ],

    // Initialize Cytoscape with performance optimizations
    initializeCytoscape: function() {
        
        // Check for WebGL support
        this.isWebGLEnabled = this.checkWebGLSupport();
        this.supportsShadowStyles = !this.isWebGLEnabled;
        
        // Performance-optimized style configuration
        const shadowStyles = (styles) => (this.supportsShadowStyles ? styles : {});

        const style = [
            {
                selector: 'node',
                style: {
                    'background-color': ele =>
                        ele.data('color') ||
                        (window.QuantickleConfig?.defaultNodeColor || '#ffffff'),
                    'background-image': 'none',
                    'background-fit': ele => this.resolveBackgroundFitValue(ele.data('backgroundFit'), 'contain'),
                    'background-repeat': 'no-repeat',
                    'background-position-x': ele => this.resolveBackgroundPositionValue(ele.data('backgroundPositionX'), '50%'),
                    'background-position-y': ele => this.resolveBackgroundPositionValue(ele.data('backgroundPositionY'), '50%'),
                    'background-width': '100%',
                    'background-height': '100%',
                    'background-opacity': 1.0, // Full opacity - icons will be applied directly via node.style()
                    'width': ele => ele.data('size') || 50,
                    'height': ele => ele.data('size') || 50,
                    'shape': function(node) {
                        const shape = node.data('shape');
                        return shape || 'round-rectangle';
                    },
                    'border-width': ele => {
                        if (!ele || typeof ele.data !== 'function') {
                            return 0;
                        }

                        const rawWidth = parseFloat(ele.data('borderWidth'));
                        if (Number.isFinite(rawWidth)) {
                            return Math.max(0, rawWidth);
                        }

                        const isContainer =
                            (typeof ele.hasClass === 'function' && ele.hasClass('container')) ||
                            ele.data('type') === 'container' ||
                            ele.data('isContainer');

                        return isContainer ? 1 : 0;
                    },
                    'border-color': ele => {
                        if (!ele || typeof ele.data !== 'function') {
                            return '#000000';
                        }

                        const rawWidth = parseFloat(ele.data('borderWidth'));
                        if (Number.isFinite(rawWidth) && rawWidth <= 0) {
                            return 'transparent';
                        }

                        const explicitColor = ele.data('borderColor');
                        if (explicitColor) {
                            return explicitColor;
                        }

                        return '#000000';
                    },
                    'border-opacity': ele => {
                        if (!ele || typeof ele.data !== 'function') {
                            return 1;
                        }

                        const isSelected = (() => {
                            try {
                                if (typeof ele.selected === 'function' && ele.selected()) {
                                    return true;
                                }

                                if (typeof ele.is === 'function' && ele.is(':selected')) {
                                    return true;
                                }
                            } catch (error) {
                                // Ignore selection introspection failures and fall back to data checks
                            }

                            return false;
                        })();

                        if (isSelected) {
                            return 1;
                        }

                        const pinnedRaw = ele.data('pinned');
                        const isPinned = (() => {
                            if (pinnedRaw === true || pinnedRaw === 1) {
                                return true;
                            }

                            if (typeof pinnedRaw === 'string') {
                                const normalized = pinnedRaw.trim().toLowerCase();
                                return normalized === 'true' || normalized === '1' || normalized === 'yes';
                            }

                            return false;
                        })();

                        if (isPinned) {
                            return 1;
                        }

                        const rawWidth = parseFloat(ele.data('borderWidth'));
                        if (Number.isFinite(rawWidth)) {
                            return rawWidth > 0 ? 1 : 0;
                        }

                        const isContainer =
                            (typeof ele.hasClass === 'function' && ele.hasClass('container')) ||
                            ele.data('type') === 'container' ||
                            ele.data('isContainer');

                        return isContainer ? 1 : 0;
                    },
                    'label': 'data(label)',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    //'text-margin-y': 12,
                    'text-wrap': 'wrap',
                    'text-max-width': ele => ele.data('size') || 80,
                    'font-size': 10,
                    'color': '#ffffff',
                    'text-outline-width': 1,
                    'text-outline-color': '#000000',
                    // Glow effect will be applied dynamically
                    // Performance optimizations
                    'text-events': 'no', // Disable text events for better performance
                    'events': 'yes'
                }
            },
            {
                selector: 'node[type = "graph"], node[type = "graph-return"], node.graph-return-node',
                style: {
                    'background-color': '#ede9fe',
                    'border-color': '#c4b5fd',
                    'border-width': ele => {
                        const rawValue = ele && typeof ele.data === 'function' ? ele.data('borderWidth') : undefined;
                        const raw = parseFloat(rawValue);
                        if (Number.isFinite(raw) && raw > 0) {
                            return Math.max(raw, 4);
                        }

                        return 4;
                    },
                    'color': '#312e81',
                    'font-weight': 'bold',
                    'text-outline-width': 0,
                    'shape': 'round-rectangle',
                    'width': ele => {
                        const rawValue = ele && typeof ele.data === 'function' ? ele.data('size') : undefined;
                        const raw = parseFloat(rawValue);
                        const isReturn = (() => {
                            if (!ele) {
                                return false;
                            }
                            try {
                                if (typeof ele.hasClass === 'function' && ele.hasClass('graph-return-node')) {
                                    return true;
                                }
                            } catch (classError) {
                                // Ignore class lookup errors
                            }
                            try {
                                if (typeof ele.data === 'function' && ele.data('graphReturn')) {
                                    return true;
                                }
                            } catch (dataError) {
                                // Ignore data lookup errors
                            }
                            return false;
                        })();
                        const minimumSize = isReturn ? 28 : 80;

                        if (Number.isFinite(raw)) {
                            return Math.max(raw, minimumSize);
                        }

                        return minimumSize;
                    },
                    'height': ele => {
                        const rawValue = ele && typeof ele.data === 'function' ? ele.data('size') : undefined;
                        const raw = parseFloat(rawValue);
                        const isReturn = (() => {
                            if (!ele) {
                                return false;
                            }
                            try {
                                if (typeof ele.hasClass === 'function' && ele.hasClass('graph-return-node')) {
                                    return true;
                                }
                            } catch (classError) {
                                // Ignore class lookup errors
                            }
                            try {
                                if (typeof ele.data === 'function' && ele.data('graphReturn')) {
                                    return true;
                                }
                            } catch (dataError) {
                                // Ignore data lookup errors
                            }
                            return false;
                        })();
                        const minimumSize = isReturn ? 28 : 80;

                        if (Number.isFinite(raw)) {
                            return Math.max(raw, minimumSize);
                        }

                        return minimumSize;
                    },
                    'text-max-width': 120,
                    ...shadowStyles({
                        'shadow-blur': 12,
                        'shadow-color': 'rgba(196, 181, 253, 0.45)',
                        'shadow-offset-x': 0,
                        'shadow-offset-y': 0
                    }),
                    'background-fit': ele => this.resolveBackgroundFitValue(ele.data('backgroundFit'), 'contain'),
                    'background-position-x': ele => this.resolveBackgroundPositionValue(ele.data('backgroundPositionX'), '50%'),
                    'background-position-y': ele => this.resolveBackgroundPositionValue(ele.data('backgroundPositionY'), '50%'),
                    'background-repeat': 'no-repeat',
                    'background-width': '70%',
                    'background-height': '70%'
                }
            },
            {
                selector: 'node[backgroundImage]',
                style: {
                    'background-image': 'data(backgroundImage)'
                }
            },
            {
                selector: 'node.container[width][height]',
                style: {
                    'shape': 'round-rectangle',
                    'background-color': '#2e4a62',
                    'background-opacity': 0.2,
                    'border-width': 1,
                    'border-color': '#000000',
                    'corner-radius': 12,
                    'width': ele => ele.data('width') || 100,
                    'height': ele => ele.data('height') || 100,
                    'padding': 10,
                    'label': 'data(label)',
                    'text-valign': 'top',
                    'text-halign': 'center'
                }
            },
            {
                selector: 'node[type="text"]',
                style: {
                    'shape': 'round-rectangle',
                    'background-color': ele => ele.data('backgroundColor') || ele.data('color') || '#2e4a62',
                    'background-opacity': ele => {
                        const explicit = parseFloat(ele.data('backgroundOpacity'));
                        if (Number.isFinite(explicit)) {
                            return Math.max(0, Math.min(1, explicit));
                        }
                        const legacy = parseFloat(ele.data('opacity'));
                        return Number.isFinite(legacy) ? Math.max(0, Math.min(1, legacy)) : 1;
                    },
                    'border-width': ele => {
                        const width = parseFloat(ele.data('borderWidth'));
                        return Number.isFinite(width) ? Math.max(0, width) : 1;
                    },
                    'border-color': ele => {
                        const width = parseFloat(ele.data('borderWidth'));
                        if (Number.isFinite(width) && width <= 0) {
                            return 'transparent';
                        }
                        const color = ele.data('borderColor');
                        if (color) {
                            const normalized = String(color).trim().toLowerCase();
                            if (normalized && normalized !== 'rgba(0,0,0,0)' && normalized !== 'transparent') {
                                return color;
                            }
                        }
                        return '#000000';
                    },
                    'corner-radius': ele => {
                        const radius = parseFloat(ele.data('cornerRadius'));
                        return Number.isFinite(radius) ? Math.max(0, radius) : 8;
                    },
                    'width': ele => ele.data('width') || 100,
                    'height': ele => ele.data('height') || 100,
                    'padding': ele => {
                        const padding = parseFloat(ele.data('padding'));
                        return Number.isFinite(padding) ? Math.max(0, padding) : 4;
                    },
                    'label': 'data(label)',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'text-wrap': 'wrap',
                    'text-max-width': ele => ele.data('width') || 100,
                    'color': 'data(fontColor)',
                    'font-family': 'data(fontFamily)',
                    'font-size': 'data(fontSize)',
                    'font-style': ele => ele.data('italic') ? 'italic' : 'normal',
                    'font-weight': ele => ele.data('bold') ? 'bold' : 'normal'
                }
            },
            {
                selector: 'node[type="image"]',
                style: {
                    'shape': 'round-rectangle',
                    'background-color': ele => ele.data('backgroundColor') || ele.data('color') || '#ffffff',
                    'background-opacity': 1,
                    'border-width': ele => {
                        const width = parseFloat(ele.data('borderWidth'));
                        return Number.isFinite(width) ? Math.max(0, width) : 1;
                    },
                    'border-color': ele => ele.data('borderColor') || '#d1d5db',
                    'width': ele => {
                        const width = parseFloat(ele.data('width'));
                        if (Number.isFinite(width)) {
                            return Math.max(20, width);
                        }
                        const size = parseFloat(ele.data('size'));
                        return Number.isFinite(size) ? Math.max(20, size) : 160;
                    },
                    'height': ele => {
                        const height = parseFloat(ele.data('height'));
                        if (Number.isFinite(height)) {
                            return Math.max(20, height);
                        }
                        const size = parseFloat(ele.data('size'));
                        return Number.isFinite(size) ? Math.max(20, size) : 120;
                    },
                    'background-fit': ele => this.resolveBackgroundFitValue(ele.data('backgroundFit'), 'contain'),
                    'background-position-x': ele => this.resolveBackgroundPositionValue(ele.data('backgroundPositionX'), '50%'),
                    'background-position-y': ele => this.resolveBackgroundPositionValue(ele.data('backgroundPositionY'), '50%'),
                    'text-valign': 'bottom',
                    'text-halign': 'center',
                    'text-wrap': 'wrap',
                    'text-max-width': ele => {
                        const explicit = parseFloat(ele.data('imageTextWidth'));
                        if (Number.isFinite(explicit)) {
                            return explicit;
                        }
                        const width = parseFloat(ele.data('width'));
                        if (Number.isFinite(width)) {
                            return Math.max(40, width - 20);
                        }
                        const size = parseFloat(ele.data('size'));
                        return Number.isFinite(size) ? Math.max(40, size - 20) : 160;
                    },
                    'color': ele => ele.data('legendColor') || ele.data('labelColor') || '#111827',
                    'font-size': ele => ele.data('legendFontSize') || 13,
                    'font-family': ele => ele.data('legendFontFamily') || 'Inter, "Segoe UI", sans-serif',
                    'text-margin-y': ele => {
                        const margin = parseFloat(ele.data('legendMarginY'));
                        if (Number.isFinite(margin)) {
                            return margin;
                        }
                        const fallback = parseFloat(ele.data('legendFontSize')) || 13;
                        return Math.max(4, Math.round(fallback * 0.75));
                    },
                    'text-background-color': ele => ele.data('legendBackgroundColor') || '#ffffff',
                    'text-background-opacity': ele => {
                        const opacity = parseFloat(ele.data('legendBackgroundOpacity'));
                        return Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 0.85;
                    },
                    'text-background-padding': ele => {
                        const padding = parseFloat(ele.data('legendBackgroundPadding'));
                        if (Number.isFinite(padding) && padding > 0) {
                            return padding;
                        }
                        const fallback = parseFloat(ele.data('legendFontSize')) || 13;
                        return Math.max(4, Math.round(fallback * 0.35));
                    },
                    'text-background-shape': 'roundrectangle',
                    'text-outline-width': 0
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
                selector: 'node.container[collapsed]',
                style: {
                    'font-weight': 'bold',
                    'font-family': 'Segoe UI',
                    'font-size': 14,
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'border-width': 2,
                    'border-color': '#000000',
                    'text-wrap': 'none',
                    'color': '#ffffff',
                    'background-color': '#000000',
                    'background-opacity': 1,
                    'label': 'data(label)',
                    'width': ele => ele.data('width') || 100,
                    'height': ele => ele.data('height') || 100
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': ele => ele.data('width') || 2,
                    'line-color': ele =>
                        ele.data('color') ||
                        (window.QuantickleConfig?.defaultEdgeColor || '#cccccc'),
                    'target-arrow-color': ele =>
                        ele.data('color') ||
                        (window.QuantickleConfig?.defaultEdgeColor || '#cccccc'),
                    'target-arrow-shape': ele => ele.data('showArrows') === false ? 'none' : 'triangle',
                    'curve-style': ele => ele.data('curveStyle') || 'bezier',
                    'opacity': 0.9,
                    'line-style': ele => ele.data('lineStyle') || 'solid',
                    'arrow-scale': ele => (ele.data('arrowSize') || 6) / 6,
                    // Performance optimizations
                    'events': 'yes'
                }
            },
            {
                selector: 'node.interaction-low-detail',
                style: {
                    'label': '',
                    'text-opacity': 0,
                    'background-image': 'none',
                    'background-opacity': 0.4,
                    'border-width': 0,
                    ...shadowStyles({ 'shadow-blur': 0 }),
                    'opacity': 0.6
                }
            },
            {
                selector: 'node.interaction-low-detail-text',
                style: {
                    'text-opacity': 0,
                    'background-opacity': 0.2,
                    'border-width': 0,
                    ...shadowStyles({ 'shadow-blur': 0 })
                }
            },
            {
                selector: 'edge.interaction-low-detail',
                style: {
                    'opacity': 0.1,
                    'target-arrow-shape': 'none',
                    'label': ''
                }
            },
            {
                selector: 'node:selected',
                style: {
                    'border-width': 4,
                    'border-color': '#ff0000',
                    'border-opacity': 1,
                    'background-color': ele =>
                        ele.data('color') ||
                        (window.QuantickleConfig?.defaultNodeColor || '#ffffff')
                }
            },
            {
                selector: 'edge:selected',
                style: {
                    'width': 2,
                    'line-color': '#ff0000',
                    'target-arrow-color': '#ff0000'
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
                    'border-color': '#ff0000',
                    'border-opacity': 1
                }
            },
            {
                selector: 'node:grabbed',
                style: {
                    'z-index': 1000,
                    'opacity': 0.8
                }
            },
            {
                selector: 'node.portal-expanded',
                style: {
                    'border-width': 6,
                    'border-color': '#f6ad55',
                    'border-opacity': 1,
                    ...shadowStyles({
                        'shadow-blur': 25,
                        'shadow-color': '#f6ad55',
                        'shadow-opacity': 0.6
                    })
                }
            },
            {
                selector: 'node.search-match',
                style: {
                    'border-color': '#22d3ee',
                    'border-width': 4,
                    'overlay-opacity': 0.12,
                    'overlay-color': '#22d3ee'
                }
            },
            {
                selector: 'node.search-match-current',
                style: {
                    'border-color': '#fbbf24',
                    'border-width': 6,
                    'overlay-opacity': 0.25,
                    'overlay-color': '#fbbf24'
                }
            },
            {
                selector: 'node.search-match-related',
                style: {
                    'border-color': '#fbbf24',
                    'border-width': 4,
                    'border-style': 'dashed',
                    'overlay-opacity': 0.18,
                    'overlay-color': '#fbbf24'
                }
            },
            {
                selector: 'edge.search-match',
                style: {
                    'line-color': '#22d3ee',
                    'target-arrow-color': '#22d3ee',
                    'source-arrow-color': '#22d3ee',
                    'width': 3
                }
            },
            {
                selector: 'edge.search-match-current',
                style: {
                    'line-color': '#fbbf24',
                    'target-arrow-color': '#fbbf24',
                    'source-arrow-color': '#fbbf24',
                    'width': 4
                }
            }
        ];

        // Performance-optimized configuration
        // Check for local graph area settings to override defaults
        let minZoom = 0.1;
        let maxZoom = 10;
        if (window.QuantickleConfig && window.QuantickleConfig.currentGraphSettings) {
            const viewport = window.QuantickleConfig.currentGraphSettings.viewport;
            if (viewport) {
                minZoom = viewport.minZoom || 0.1;
                maxZoom = viewport.maxZoom || 10;
            }
        }
        
        const config = {
            container: document.getElementById('cy'),
            style: style,
            elements: {
                nodes: [],
                edges: []
            },
            //
            minZoom: minZoom,
            maxZoom: maxZoom,
            // WebGL rendering if available
            renderer: this.isWebGLEnabled ? 'webgl' : 'canvas',
            // Memory management
            autoungrabify: false,
            autolock: false,
            autounselectify: false,
            // Batch operations for better performance
            batch: true,
            // Enable animations for smooth interactions
            animate: true,
            // Optimize for large datasets but keep edges visible during interactions
            hideEdgesOnViewport: false, // Keep edges visible during drag
            hideLabelsOnViewport: false, // Keep labels visible during drag
            textureOnViewport: false, // Disable texture for smoother interactions
            motionBlur: false,
            motionBlurOpacity: 0.2,
            pixelRatio: 'auto',
            // Additional performance optimizations
            selectionType: 'single',
            touchTapThreshold: 8,
            desktopTapThreshold: 4,
            userZoomingEnabled: false, // Disable default zoom to use our custom Ctrl+wheel zoom
            userPanningEnabled: true,
            boxSelectionEnabled: false // We'll handle box selection manually
        };

        // Reset label index tracking state for a new Cytoscape instance
        this._labelIndexListenersAttached = false;
        this._labelIndex = null;

        try {
            this.cy = cytoscape(config);
            if (this.GraphPortal && typeof this.GraphPortal.init === 'function') {
                this.GraphPortal.init(this);
            }
            if (typeof window !== 'undefined') {
                window.GraphPortal = this.GraphPortal;
            }
            // Initialize undo/redo handling
            this.setupUndoRedo();
            // Dynamic sun position based on actual viewport center
            const sunPosition = {
                x: this.cy.width() / 2,
                y: this.cy.height() / 2
            };
            
            // Set up performance monitoring (delegated to modular implementation)
            if (window.PerformanceManagerModuleBootstrap) {
                window.PerformanceManagerModuleBootstrap.init();
                this.performanceManager = window.PerformanceManagerModuleBootstrap.moduleInstance || null;
            }
            
            // Set up event handlers
            this.setupEventHandlers();
            this._setupLabelIndexTracking();

            // Enable linked graph navigation
            this.initializeGraphInstanceSupport();
            // Initialize graph search UI
            this.setupGraphSearch();

            // Propagate locking to container descendants
            this.setupContainerLocking();

            // Initialize magnifier feature
            this.initMagnifiers();

            // Set up keep-alive tick
            this.setupKeepAliveTick();
            
            // Initialize LOD system
            if (window.LODSystem) {
                window.LODSystem.init(this.cy);
            }

            if (window.TextCallout) {
                window.TextCallout.init(this.cy);
            }
            
            // Debug container hierarchy
            this.debugContainerHierarchy();
            
        } catch (error) {
            console.error('Error initializing Cytoscape:', error);
            console.error('Error stack:', error.stack);
        }
    },

    // Debug container hierarchy
    debugContainerHierarchy: function() {
        if (!this.cy) return;
        
        const container = this.cy.container();
        
        let currentElement = container;
        let level = 0;
        
        while (currentElement && level < 10) {
            const computedStyle = window.getComputedStyle(currentElement);
            
            currentElement = currentElement.parentElement;
            level++;
        }
    },


    // Check WebGL support for better performance
    checkWebGLSupport: function() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            return !!gl;
        } catch (e) {
            return false;
        }
    },

    // Setup undo/redo event tracking
    setupUndoRedo: function() {
        if (!this.cy) return;

        this.undoStack = [];
        this.redoStack = [];

        const saveHandler = () => {
            if (this.isRestoring || this.historyPaused) return;
            this.saveState();
        };

        // Debounced handler for position changes to avoid excessive history
        let positionTimeout = null;
        const positionHandler = () => {
            if (this.isRestoring || this.historyPaused) return;
            clearTimeout(positionTimeout);
            positionTimeout = setTimeout(() => {
                this.saveState();
            }, 100);
        };

        // Track structural changes
        this.cy.on('add remove', saveHandler);
        this.cy.on('data', 'edge', saveHandler);

        // Track node movement both via user drag and programmatic updates
        this.cy.on('dragfree', 'node', saveHandler);
        this.cy.on('position', 'node', positionHandler);

        // Capture initial empty state
        this.saveState();
    },

    // Save current graph state to history
    saveState: function(options = {}) {
        if (!this.cy) return;

        const delta = options.delta;
        let state = null;

        if (delta && this._canUseDeltaHistory(delta)) {
            state = this._createDeltaHistoryState(delta);
        }

        if (!state) {
            state = this._createFullHistoryState();
        }

        if (!state) {
            return;
        }

        // Avoid recording duplicate consecutive states
        const last = this.undoStack[this.undoStack.length - 1];
        if (last && JSON.stringify(last) === JSON.stringify(state)) {
            return;
        }

        this.undoStack.push(state);
        if (this.undoStack.length > this.maxHistorySize) {
            this.undoStack.shift();
        }
        // Clear redo stack on new action
        this.redoStack = [];
    },

    _createFullHistoryState: function() {
        if (!this.cy) {
            return null;
        }

        const elements = this.cy.elements().map(ele => {
            const json = ele.json();

            if (this.cy.styleEnabled && this.cy.styleEnabled()) {
                const style = {};
                this.styleProperties.forEach(prop => {
                    const val = ele.style(prop);
                    if (val && val !== '') {
                        style[prop] = val;
                    }
                });
                if (Object.keys(style).length > 0) {
                    json.style = style;
                }
            }

            return json;
        });

        return {
            elements: elements,
            pan: this.cy.pan(),
            zoom: this.cy.zoom()
        };
    },

    _createDeltaHistoryState: function(delta) {
        if (!this.cy || !delta) {
            return null;
        }

        const last = this.undoStack && this.undoStack[this.undoStack.length - 1];
        if (!last || !Array.isArray(last.elements)) {
            return null;
        }

        const deltaNodes = Array.isArray(delta.nodes) ? delta.nodes : [];
        const deltaEdges = Array.isArray(delta.edges) ? delta.edges : [];

        const toHistoryElement = (element, group) => {
            if (!element) {
                return null;
            }

            const data = element.data ? { ...element.data } : { ...element };
            const historyElement = { group, data };

            if (group === 'nodes') {
                const position = element.position || (data && data.x !== undefined && data.y !== undefined
                    ? { x: data.x, y: data.y }
                    : undefined);
                if (position) {
                    historyElement.position = position;
                }
                if (element.classes || data.classes) {
                    historyElement.classes = element.classes || data.classes;
                }
            }

            return historyElement;
        };

        const newElements = [];

        deltaNodes.forEach(node => {
            const historyNode = toHistoryElement(node, 'nodes');
            if (historyNode) {
                newElements.push(historyNode);
            }
        });

        deltaEdges.forEach(edge => {
            const historyEdge = toHistoryElement(edge, 'edges');
            if (historyEdge) {
                newElements.push(historyEdge);
            }
        });

        if (newElements.length === 0) {
            return null;
        }

        return {
            elements: [...last.elements, ...newElements],
            pan: this.cy.pan(),
            zoom: this.cy.zoom()
        };
    },

    _canUseDeltaHistory: function(delta) {
        if (!delta || !this.undoStack || this.undoStack.length === 0) {
            return false;
        }

        const nodes = Array.isArray(delta.nodes) ? delta.nodes : [];
        const edges = Array.isArray(delta.edges) ? delta.edges : [];

        // Only support small additive deltas to keep history light-weight
        if (nodes.length + edges.length !== 1) {
            return false;
        }

        return true;
    },

    // Undo last action
    undo: function() {
        if (!this.cy || this.undoStack.length <= 1) return;
        const currentView = { pan: this.cy.pan(), zoom: this.cy.zoom() };
        const current = this.undoStack.pop();
        this.redoStack.push(current);
        const previous = this.undoStack[this.undoStack.length - 1];
        this.isRestoring = true;
        this.cy.elements().remove();
        this.cy.add(previous.elements);
        // Reapply styles explicitly since Cytoscape JSON doesn't include computed styles
        previous.elements.forEach(el => {
            if (el.style) {
                const ele = this.cy.getElementById(el.data.id);
                if (ele) {
                    ele.style(el.style);
                }
            }
        });
        this.cy.pan(currentView.pan);
        this.cy.zoom(currentView.zoom);
        this.isRestoring = false;
    },

    // Redo previously undone action
    redo: function() {
        if (!this.cy || this.redoStack.length === 0) return;
        const currentView = { pan: this.cy.pan(), zoom: this.cy.zoom() };
        const state = this.redoStack.pop();
        this.undoStack.push(state);
        this.isRestoring = true;
        this.cy.elements().remove();
        this.cy.add(state.elements);
        state.elements.forEach(el => {
            if (el.style) {
                const ele = this.cy.getElementById(el.data.id);
                if (ele) {
                    ele.style(el.style);
                }
            }
        });
        this.cy.pan(currentView.pan);
        this.cy.zoom(currentView.zoom);
        this.isRestoring = false;
    },

    pauseHistory: function() {
        this.historyPaused = true;
    },

    resumeHistory: function() {
        this.historyPaused = false;
    },

    // Setup performance monitoring
    setupPerformanceMonitoring: function() {
        const performanceManager = this.performanceManager
            || window.PerformanceManagerModuleBootstrap?.moduleInstance;
        if (!performanceManager || typeof performanceManager.setupPerformanceMonitoring !== 'function') {
            return false;
        }
        return performanceManager.setupPerformanceMonitoring();
    },

    // Update performance metrics
    updatePerformanceMetrics: function(renderTime) {
        const performanceManager = this.performanceManager
            || window.PerformanceManagerModuleBootstrap?.moduleInstance;
        if (!performanceManager || typeof performanceManager.updatePerformanceMetrics !== 'function') {
            return false;
        }
        return performanceManager.updatePerformanceMetrics(renderTime);
    },

    // Check memory usage
    checkMemoryUsage: function() {
        const performanceManager = this.performanceManager
            || window.PerformanceManagerModuleBootstrap?.moduleInstance;
        if (!performanceManager || typeof performanceManager.checkMemoryUsage !== 'function') {
            return false;
        }
        return performanceManager.checkMemoryUsage();
    },

    // Optimize memory usage for large datasets
    optimizeMemoryUsage: function() {
        const performanceManager = this.performanceManager
            || window.PerformanceManagerModuleBootstrap?.moduleInstance;
        if (!performanceManager || typeof performanceManager.optimizeMemoryUsage !== 'function') {
            return false;
        }
        return performanceManager.optimizeMemoryUsage();
    },

    setupPointerTracking: function() {
        if (!this.cy) return;

        const container = this.cy.container();
        if (!container) return;

        if (this._pointerTrackingInitialized && this._pointerTrackingContainer === container) {
            return;
        }

        const updateFromClientCoordinates = (clientX, clientY) => {
            if (typeof clientX !== 'number' || typeof clientY !== 'number') {
                return;
            }

            const rect = container.getBoundingClientRect();
            const renderedX = clientX - rect.left;
            const renderedY = clientY - rect.top;
            const pan = this.cy.pan();
            const zoom = this.cy.zoom();

            const modelX = (renderedX - pan.x) / zoom;
            const modelY = (renderedY - pan.y) / zoom;

            this.lastPointerPosition = {
                model: { x: modelX, y: modelY },
                rendered: { x: renderedX, y: renderedY },
                screen: { x: clientX, y: clientY }
            };
        };

        const domEventHandler = (event) => {
            if (!event) return;

            if (typeof event.clientX === 'number' && typeof event.clientY === 'number') {
                updateFromClientCoordinates(event.clientX, event.clientY);
                return;
            }

            if (event.touches && event.touches.length > 0) {
                const touch = event.touches[0];
                updateFromClientCoordinates(touch.clientX, touch.clientY);
            }
        };

        const cyEventHandler = (evt) => {
            if (!evt) return;

            if (evt.position) {
                const model = evt.position;
                const pan = this.cy.pan();
                const zoom = this.cy.zoom();
                const renderedX = model.x * zoom + pan.x;
                const renderedY = model.y * zoom + pan.y;
                const rect = container.getBoundingClientRect();

                this.lastPointerPosition = {
                    model: { x: model.x, y: model.y },
                    rendered: { x: renderedX, y: renderedY },
                    screen: { x: renderedX + rect.left, y: renderedY + rect.top }
                };
                return;
            }

            if (evt.renderedPosition) {
                const rect = container.getBoundingClientRect();
                const clientX = evt.originalEvent && typeof evt.originalEvent.clientX === 'number'
                    ? evt.originalEvent.clientX
                    : evt.renderedPosition.x + rect.left;
                const clientY = evt.originalEvent && typeof evt.originalEvent.clientY === 'number'
                    ? evt.originalEvent.clientY
                    : evt.renderedPosition.y + rect.top;
                updateFromClientCoordinates(clientX, clientY);
                return;
            }

            if (evt.originalEvent) {
                domEventHandler(evt.originalEvent);
            }
        };

        container.addEventListener('pointermove', domEventHandler, { passive: true });
        container.addEventListener('pointerdown', domEventHandler, { passive: true });
        container.addEventListener('pointerup', domEventHandler, { passive: true });
        container.addEventListener('pointerenter', domEventHandler, { passive: true });
        container.addEventListener('mousemove', domEventHandler, { passive: true });

        this.cy.on('mousemove', cyEventHandler);
        this.cy.on('tapstart', cyEventHandler);
        this.cy.on('tapdrag', cyEventHandler);
        this.cy.on('tapend', cyEventHandler);

        this._pointerTrackingInitialized = true;
        this._pointerTrackingContainer = container;
    },

    getPasteAnchorPosition: function() {
        if (!this.cy) {
            return { x: 0, y: 0 };
        }

        if (this.lastPointerPosition && this.lastPointerPosition.model) {
            return { ...this.lastPointerPosition.model };
        }

        const pan = this.cy.pan();
        const zoom = this.cy.zoom();
        const container = this.cy.container();
        const width = container && container.clientWidth ? container.clientWidth : this.cy.width();
        const height = container && container.clientHeight ? container.clientHeight : this.cy.height();

        return {
            x: (width / 2 - pan.x) / zoom,
            y: (height / 2 - pan.y) / zoom
        };
    },

    // Update label visibility based on visible node count and LOD
    updateLabelVisibility: function() {
        if (!this.cy) return;

        const visibleNodeCount = this.getVisibleNodeCount();
        const currentLOD = this.getCurrentLODLevel();
        const isHighestLOD = this.isHighestDetailLOD(currentLOD);

        if (!isHighestLOD) {
            this.labelsHiddenDueToLOD = true;
            this.labelsHiddenDueToVisibility = false;
            this.labelsHidden = true;
            return;
        }

        const hideForVisibility = visibleNodeCount > 200;
        const hideForLOD = !isHighestLOD;
        const shouldHide = hideForVisibility || hideForLOD;

        this.labelsHiddenDueToVisibility = hideForVisibility;
        this.labelsHiddenDueToLOD = hideForLOD;

        if (shouldHide === this.labelsHidden) {
            return;
        }

        if (shouldHide) {
            this.cy.nodes().forEach(node => {
                if (!this.shouldManageNodeLabel(node)) return;
                node.style('label', '');
            });
            this.labelsHidden = true;
        } else {
            this.cy.nodes().forEach(node => {
                if (!this.shouldManageNodeLabel(node)) return;
                node.style('label', this.getNodeLabelForStyle(node));
            });
            this.labelsHidden = false;
        }
    },

    shouldManageNodeLabel: function(node) {
        if (!node || typeof node.data !== 'function') {
            return false;
        }

        const type = node.data('type');
        return type !== 'text';
    },

    getNodeLabelForStyle: function(node) {
        if (!node || typeof node.data !== 'function') {
            return '';
        }

        if (node.data('labelVisible') === false) {
            return '';
        }

        const label = node.data('label');
        if (label && typeof label === 'string') {
            return label;
        }

        const id = node.data('id');
        return typeof id === 'string' ? id : '';
    },

    getVisibleNodeCount: function() {
        if (!this.cy) return 0;

        const visibleNodes = typeof this.cy.nodes === 'function'
            ? this.cy.nodes(':visible')
            : this.cy.nodes();

        if (!visibleNodes || typeof visibleNodes.forEach !== 'function') {
            return 0;
        }

        let count = 0;
        visibleNodes.forEach(node => {
            if (!node) return;

            const type = node.data && typeof node.data === 'function'
                ? node.data('type')
                : node.data && node.data.type;

            if (type === 'text') {
                return;
            }

            count += 1;
        });

        return count;
    },

    getCurrentLODLevel: function() {
        if (window.LODSystem) {
            if (typeof window.LODSystem.getCurrentLevel === 'function') {
                return window.LODSystem.getCurrentLevel();
            }
            if (typeof window.LODSystem.currentLODLevel !== 'undefined') {
                return window.LODSystem.currentLODLevel;
            }
        }

        if (window.LODManagerAdapter && typeof window.LODManagerAdapter.getStatus === 'function') {
            const status = window.LODManagerAdapter.getStatus();
            if (status && status.currentLODLevel) {
                return status.currentLODLevel;
            }
        }

        return this.currentLODLevel || 'full';
    },

    isHighestDetailLOD: function(level) {
        if (!level || typeof level !== 'string') {
            return true;
        }

        const normalized = level.toLowerCase();
        return normalized === 'fine' || normalized === 'full';
    },

    getHighResolutionTimestamp: function() {
        if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
            return performance.now();
        }

        return Date.now();
    },

    shouldApplyInteractionLowDetail: function(nowTimestamp) {
        if (!this.cy) {
            return false;
        }

        if (this._interactionLowDetailActive) {
            return false;
        }

        const currentLevel = this.getCurrentLODLevel();
        if (!this.isHighestDetailLOD(currentLevel)) {
            return false;
        }

        const visibleNodes = this.getVisibleNodeCount();
        if (visibleNodes < this._interactionLowDetailNodeThreshold) {
            return false;
        }

        const now = typeof nowTimestamp === 'number' ? nowTimestamp : this.getHighResolutionTimestamp();

        if (this._interactionLowDetailCooldownUntil && now < this._interactionLowDetailCooldownUntil) {
            return false;
        }

        const lastStart = this._lastInteractionLowDetailStart || 0;
        if (lastStart > 0 && (now - lastStart) < this._interactionLowDetailCooldownMs) {
            return false;
        }

        return true;
    },

    shouldShowLabelsAsTooltips: function() {
        return this.labelsHiddenDueToVisibility || this.labelsHiddenDueToLOD;
    },

    enterInteractionLowDetail: function(restoreDelay) {
        if (!this.cy) return;

        if (!this._interactionLowDetailActive) {
            const now = this.getHighResolutionTimestamp();
            if (!this.shouldApplyInteractionLowDetail(now)) {
                return;
            }

            this._interactionLowDetailActive = true;
            this._lastInteractionLowDetailStart = now;
            this._interactionLowDetailCooldownUntil = now + this._interactionLowDetailCooldownMs;
            this.applyInteractionLowDetailState(true);
        }

        this.scheduleInteractionDetailRestore(restoreDelay);
    },

    scheduleInteractionDetailRestore: function(delay) {
        if (!this.cy) return;

        const effectiveDelay = typeof delay === 'number' && delay >= 0
            ? delay
            : this._interactionLowDetailRestoreDelay;

        if (this._interactionLowDetailRestoreTimeoutId) {
            clearTimeout(this._interactionLowDetailRestoreTimeoutId);
            this._interactionLowDetailRestoreTimeoutId = null;
        }

        this._interactionLowDetailRestoreTimeoutId = setTimeout(() => {
            this._interactionLowDetailRestoreTimeoutId = null;
            if (!this._interactionLowDetailActive) {
                return;
            }

            this._interactionLowDetailActive = false;
            this.applyInteractionLowDetailState(false);
            this._lastInteractionLowDetailStart = 0;

            const now = this.getHighResolutionTimestamp();
            if (this._interactionLowDetailCooldownUntil && now >= this._interactionLowDetailCooldownUntil) {
                this._interactionLowDetailCooldownUntil = 0;
            }
        }, effectiveDelay);
    },

    applyInteractionLowDetailState: function(enable) {
        if (!this.cy) return;

        const container = this.cy.container();
        if (container && typeof container.classList !== 'undefined') {
            if (enable) {
                container.classList.add('cy-interaction-low-detail');
            } else {
                container.classList.remove('cy-interaction-low-detail');
            }
        }

        this.cy.batch(() => {
            const nodes = this.cy.nodes();
            const edges = this.cy.edges();

            if (enable) {
                if (nodes && typeof nodes.addClass === 'function') {
                    nodes.addClass('interaction-low-detail');

                    const textNodes = nodes.filter('node[type="text"]');
                    if (textNodes && typeof textNodes.addClass === 'function') {
                        textNodes.addClass('interaction-low-detail-text');
                    }
                }

                if (edges && typeof edges.addClass === 'function') {
                    edges.addClass('interaction-low-detail');
                }
            } else {
                if (nodes && typeof nodes.removeClass === 'function') {
                    nodes.removeClass('interaction-low-detail');
                    nodes.removeClass('interaction-low-detail-text');
                }

                if (edges && typeof edges.removeClass === 'function') {
                    edges.removeClass('interaction-low-detail');
                }
            }
        });

        this.toggleHtmlLabelsForInteraction(enable);

        if (!enable) {
            this.updateLabelVisibility();
        }
    },

    toggleHtmlLabelsForInteraction: function(hide) {
        const htmlLabels = document.querySelectorAll('.cy-html-label');
        htmlLabels.forEach(el => {
            if (!el || !el.style) {
                return;
            }

            if (hide) {
                if (el.dataset.interactionLowDetailOpacity === undefined) {
                    el.dataset.interactionLowDetailOpacity = el.style.opacity || '';
                }
                if (el.dataset.interactionLowDetailPointerEvents === undefined) {
                    el.dataset.interactionLowDetailPointerEvents = el.style.pointerEvents || '';
                }

                el.style.opacity = '0';
                el.style.pointerEvents = 'none';
            } else {
                const originalOpacity = el.dataset.interactionLowDetailOpacity;
                const originalPointerEvents = el.dataset.interactionLowDetailPointerEvents;

                if (originalOpacity !== undefined) {
                    if (originalOpacity === '') {
                        el.style.removeProperty('opacity');
                    } else {
                        el.style.opacity = originalOpacity;
                    }
                    delete el.dataset.interactionLowDetailOpacity;
                } else {
                    el.style.removeProperty('opacity');
                }

                if (originalPointerEvents !== undefined) {
                    if (originalPointerEvents === '') {
                        el.style.removeProperty('pointer-events');
                    } else {
                        el.style.pointerEvents = originalPointerEvents;
                    }
                    delete el.dataset.interactionLowDetailPointerEvents;
                } else {
                    el.style.removeProperty('pointer-events');
                }
            }
        });
    },

    // Setup event handlers with performance optimizations
    setupEventHandlers: function() {
        if (!this.cy) return;

        this.setupPointerTracking();

        const scheduleLabelVisibilityUpdate = () => {
            if (this._labelVisibilityTimeoutId) {
                clearTimeout(this._labelVisibilityTimeoutId);
                this._labelVisibilityTimeoutId = null;
            }

            this._labelVisibilityUpdateScheduled = true;
            this._labelVisibilityTimeoutId = setTimeout(() => {
                this._labelVisibilityTimeoutId = null;
                this._labelVisibilityUpdateScheduled = false;
                this.updateLabelVisibility();
            }, this._labelVisibilityUpdateDelay);
        };

        // Automatically adjust label visibility as nodes are added or removed
        this.cy.on('add remove', scheduleLabelVisibilityUpdate);
        this.cy.on('resize', scheduleLabelVisibilityUpdate);
        scheduleLabelVisibilityUpdate();

        // Setup manual editing events
        this.setupManualEditingEvents();

        // Scale HTML-rendered text labels with zoom changes only
        const updateHtmlLabelScale = () => {
            const zoom = this.cy.zoom();
            const pan = this.cy.pan();
            document.querySelectorAll('.cy-html-label').forEach(el => {
                if (el.dataset.baseTransform === undefined) {
                    el.dataset.baseTransform = el.style.transform || '';
                }
                const base = el.dataset.baseTransform || '';
                const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
                el.style.transform = base ? `${transform} ${base}` : transform;
                el.style.transformOrigin = 'center center';
            });
        };
        let returnNodeViewportFramePending = false;
        const scheduleReturnNodeRefreshForViewport = () => {
            if (returnNodeViewportFramePending) {
                return;
            }

            returnNodeViewportFramePending = true;
            const runRefresh = () => {
                returnNodeViewportFramePending = false;
                try {
                    if (typeof this.refreshGraphReturnNodePlacement === 'function') {
                        this.refreshGraphReturnNodePlacement();
                    }
                } catch (error) {
                }
            };

            if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
                window.requestAnimationFrame(runRefresh);
            } else if (typeof setTimeout === 'function') {
                setTimeout(runRefresh, 0);
            } else {
                runRefresh();
            }
        };
        const handleZoomViewportChange = () => {
            this.enterInteractionLowDetail();
            scheduleLabelVisibilityUpdate();
            updateHtmlLabelScale();
            scheduleReturnNodeRefreshForViewport();
        };
        const handlePanViewportChange = () => {
            this.enterInteractionLowDetail();
            updateHtmlLabelScale();
            scheduleReturnNodeRefreshForViewport();
        };
        this.cy.on('zoom', handleZoomViewportChange);
        this.cy.on('pan', handlePanViewportChange);
        this.cy.on('resize', () => {
            scheduleReturnNodeRefreshForViewport();
            updateHtmlLabelScale();
        });
        updateHtmlLabelScale();

        // Tooltip for node info on hover when at most detailed LOD
        const hoverInfo = document.createElement('div');
        hoverInfo.id = 'node-hover-info';
        Object.assign(hoverInfo.style, {
            position: 'absolute',
            pointerEvents: 'none',
            padding: '4px 8px',
            background: '#fff',
            color: '#000',
            border: '1px solid #000',
            borderRadius: '4px',
            fontSize: '12px',
            display: 'none',
            zIndex: 1000,
            whiteSpace: 'normal'
        });
        document.body.appendChild(hoverInfo);
        let hoveredNodeId = null;

        const hasMeaningfulContent = (value) => {
            if (typeof value !== 'string') {
                return false;
            }

            const textContent = value
                .replace(/<[^>]*>/g, ' ')
                .replace(/&nbsp;/gi, ' ')
                .trim();

            return textContent.length > 0;
        };

        const sanitizeTooltipHtml = (content) => {
            const htmlString = content == null ? '' : String(content);
            if (window.DOMPurify && typeof DOMPurify.sanitize === 'function') {
                return DOMPurify.sanitize(htmlString);
            }
            const div = document.createElement('div');
            div.textContent = htmlString;
            return div.innerHTML;
        };

        const showNodeInfo = (evt) => {
            const node = evt.target;
            if (!node || typeof node.data !== 'function') {
                return;
            }

            const getNodeData = (key) => {
                if (typeof node.data === 'function') {
                    try {
                        return node.data(key);
                    } catch (error) {
                        return undefined;
                    }
                }

                if (node.data && typeof node.data === 'object') {
                    return node.data[key];
                }

                return undefined;
            };

            const isContainerClass = typeof node.hasClass === 'function' && node.hasClass('container');
            const containerFlag = getNodeData('isContainer');
            const hasContainerFlag = containerFlag === true || containerFlag === 1 ||
                (typeof containerFlag === 'string' && containerFlag.toLowerCase() === 'true');

            const containerDescriptorKeys = ['type', 'nodeType', 'category', 'group'];
            const hasContainerDescriptor = containerDescriptorKeys.some(key => {
                const value = getNodeData(key);
                return typeof value === 'string' && value.toLowerCase() === 'container';
            });

            if ((typeof node.isParent === 'function' && node.isParent()) ||
                isContainerClass ||
                hasContainerFlag ||
                hasContainerDescriptor) {
                return;
            }

            const showLabelsAsTooltip = this.shouldShowLabelsAsTooltips();
            const labelVisible = node.data('labelVisible') !== false;
            const rawLabel = labelVisible ? node.data('label') : '';
            const labelText = rawLabel !== undefined && rawLabel !== null
                ? String(rawLabel).trim()
                : '';
            const rawInfoHtml = node.data('infoHtml');
            const hasInfoHtml = hasMeaningfulContent(rawInfoHtml);
            const rawInfo = node.data('info');
            const hasInfo = hasMeaningfulContent(rawInfo);

            let tooltipContent = '';
            let useHtml = false;

            if (hasInfoHtml) {
                tooltipContent = String(rawInfoHtml);
                useHtml = true;
            } else if (hasInfo) {
                const infoString = String(rawInfo);
                tooltipContent = infoString;
                useHtml = /<[^>]+>/.test(infoString);
            } else if (showLabelsAsTooltip && labelText) {
                tooltipContent = labelText;
            } else {
                return;
            }

            hoveredNodeId = node.id();
            if (useHtml) {
                hoverInfo.innerHTML = sanitizeTooltipHtml(tooltipContent);
            } else {
                hoverInfo.textContent = tooltipContent;
            }

            const container = this.cy ? this.cy.container() : null;
            if (evt.originalEvent && evt.originalEvent.pageX !== undefined && evt.originalEvent.pageY !== undefined) {
                hoverInfo.style.left = evt.originalEvent.pageX + 10 + 'px';
                hoverInfo.style.top = evt.originalEvent.pageY + 10 + 'px';
            } else if (evt.renderedPosition && container) {
                const rect = container.getBoundingClientRect();
                const pageX = evt.renderedPosition.x + rect.left + window.scrollX;
                const pageY = evt.renderedPosition.y + rect.top + window.scrollY;
                hoverInfo.style.left = pageX + 10 + 'px';
                hoverInfo.style.top = pageY + 10 + 'px';
            }
            hoverInfo.style.display = 'block';
        };

        const hideNodeInfo = (evt) => {
            if (evt && hoveredNodeId) {
                const target = evt.target;
                const targetId = target && typeof target.id === 'function' ? target.id() : null;
                if (targetId && targetId !== hoveredNodeId) {
                    return;
                }
            }

            hoveredNodeId = null;
            hoverInfo.style.display = 'none';
            hoverInfo.textContent = '';
            hoverInfo.innerHTML = '';
        };

        this.cy.on('mouseover', 'node[type != "text"]', showNodeInfo);
        this.cy.on('mouseout', 'node[type != "text"]', hideNodeInfo);
        this.cy.on('mousemove', 'node[type != "text"]', (evt) => {
            if (!hoveredNodeId || evt.target.id() !== hoveredNodeId) {
                return;
            }

            const container = this.cy ? this.cy.container() : null;
            if (evt.originalEvent && evt.originalEvent.pageX !== undefined && evt.originalEvent.pageY !== undefined) {
                hoverInfo.style.left = evt.originalEvent.pageX + 10 + 'px';
                hoverInfo.style.top = evt.originalEvent.pageY + 10 + 'px';
            } else if (evt.renderedPosition && container) {
                const rect = container.getBoundingClientRect();
                const pageX = evt.renderedPosition.x + rect.left + window.scrollX;
                const pageY = evt.renderedPosition.y + rect.top + window.scrollY;
                hoverInfo.style.left = pageX + 10 + 'px';
                hoverInfo.style.top = pageY + 10 + 'px';
            }
        });

        // Resize container and text nodes with shift-drag on edges
        this.nodeResizeHoverNode = null;
        this.cy.on('mousedown', (evt) => {
            const shiftKey = Boolean(evt.originalEvent && evt.originalEvent.shiftKey);
            const pos = evt.position || evt.cyPosition;
            const edgeThreshold = Number.isFinite(this.nodeResizeEdgeThreshold)
                ? this.nodeResizeEdgeThreshold
                : 10;

            let node = null;
            if (evt.target && evt.target.isNode && evt.target.isNode()) {
                node = evt.target;
            } else if (pos) {
                node = this.cy.$('node.container, node[type="text"], node[type="image"]').filter(n => {
                    const bb = this.getNodeInteractionBoundingBox(n);
                    if (!bb) {
                        return false;
                    }
                    return this.isPositionNearNodeEdge(pos, bb, edgeThreshold);
                })[0];
            }

            if (!node || !pos) return;

            const nodeType = typeof node.data === 'function' ? node.data('type') : undefined;
            const isTextNode = nodeType === 'text';
            const isImageNode = nodeType === 'image';
            const isContainerNode = typeof node.hasClass === 'function' && node.hasClass('container');
            const requiresModifier = !isTextNode && !isImageNode;

            if (!shiftKey && requiresModifier) {
                return;
            }

            if (!isContainerNode && !isTextNode && !isImageNode) {
                return;
            }

            if (node.data('pinned')) return;

            const bb = this.getNodeInteractionBoundingBox(node);
            if (!bb) return;
            const onEdge = this.isPositionNearNodeEdge(pos, bb, edgeThreshold);
            if (!onEdge) return;

            const prevBoxSelection = this.nodeResizeHoverPrevBoxSelection !== undefined ? this.nodeResizeHoverPrevBoxSelection : this.cy.boxSelectionEnabled();
            this.debugSelection('Node resize start: disabling box selection. Previous:', prevBoxSelection);
            this.cy.boxSelectionEnabled(false);
            this.nodeResizeHoverPrevBoxSelection = undefined;
            const state = {
                node: node,
                startX: evt.originalEvent ? evt.originalEvent.clientX : 0,
                startY: evt.originalEvent ? evt.originalEvent.clientY : 0,
                startWidth: parseFloat(node.data('width')) || bb.w,
                startHeight: parseFloat(node.data('height')) || bb.h,
                preserveAspectRatio: isTextNode || isImageNode,
                nodePreserveAspectRatio: (isTextNode || isImageNode)
                    ? node.data('preserveAspectRatio') !== false
                    : false,
                aspectRatio: (() => {
                    const stored = parseFloat(node.data('aspectRatio'));
                    if (Number.isFinite(stored) && stored > 0) {
                        return stored;
                    }
                    if (bb.h > 0) {
                        return bb.w / bb.h;
                    }
                    return 1;
                })(),
                isTextNode,
                isImageNode,
                textHeightLocked: isTextNode && Boolean(evt.originalEvent && evt.originalEvent.altKey),
                prevBoxSelection,
                moveHandler: null,
                upHandler: null
            };
            node.ungrabify();
            state.moveHandler = (e) => {
                const shouldPreserveAspectRatio = state.preserveAspectRatio && state.nodePreserveAspectRatio;
                const zoom = this.cy.zoom();
                const dx = (e.clientX - state.startX) / zoom;
                const dy = (e.clientY - state.startY) / zoom;
                const minSize = 20;
                let newWidth = Math.max(minSize, state.startWidth + dx);
                let newHeight = Math.max(minSize, state.startHeight + dy);
                if (shouldPreserveAspectRatio && state.aspectRatio > 0) {
                    if (Math.abs(dx) >= Math.abs(dy)) {
                        newHeight = Math.max(minSize, newWidth / state.aspectRatio);
                    } else {
                        newWidth = Math.max(minSize, newHeight * state.aspectRatio);
                    }
                }
                state.node.data('width', newWidth);
                state.node.data('height', newHeight);
                state.node.data('size', Math.max(newWidth, newHeight));
                if (state.isTextNode) {
                    state.node.data('textWidthMode', 'fixed');
                    if (state.textHeightLocked) {
                        state.node.data('textHeightMode', 'fixed');
                    } else {
                        state.node.removeData('textHeightMode');
                    }
                    if (shouldPreserveAspectRatio && newHeight > 0) {
                        state.node.data('aspectRatio', newWidth / newHeight);
                    }
                } else if (state.isImageNode) {
                    state.node.data('imageRequestedWidth', newWidth);
                    if (shouldPreserveAspectRatio && newHeight > 0) {
                        state.node.data('aspectRatio', newWidth / newHeight);
                    }
                }
                state.node.style('width', newWidth);
                state.node.style('height', newHeight);
            };
            state.upHandler = () => {
                document.removeEventListener('mousemove', state.moveHandler);
                document.removeEventListener('mouseup', state.upHandler);
                this.debugSelection('Node resize end: restoring box selection to', state.prevBoxSelection);
                this.cy.boxSelectionEnabled(state.prevBoxSelection);
                state.node.grabify();
                state.node.unlock();
                if (state.isTextNode && window.TextCallout && typeof window.TextCallout.refresh === 'function') {
                    window.TextCallout.refresh(state.node);
                }
                if (state.isTextNode && !state.textHeightLocked) {
                    const fontFamily = state.node.data('fontFamily') || 'Arial';
                    const fontSize = parseFloat(state.node.data('fontSize')) || 14;
                    const width = parseFloat(state.node.data('width')) || state.startWidth;
                    const info = typeof state.node.data('info') === 'string' ? state.node.data('info') : '';
                    const label = typeof state.node.data('label') === 'string' ? state.node.data('label') : '';
                    const textSource = info.trim() || label || '';
                    const measured = this.calculateTextDimensions(textSource, fontFamily, fontSize, width);
                    const currentHeight = parseFloat(state.node.data('height')) || state.startHeight;
                    const minSize = 20;
                    if (measured && measured.height && measured.height < currentHeight * 0.9) {
                        const clampedHeight = Math.max(minSize, measured.height);
                        state.node.data('height', clampedHeight);
                        state.node.data('size', Math.max(width, clampedHeight));
                        state.node.style('height', clampedHeight);
                        if (state.preserveAspectRatio && state.nodePreserveAspectRatio && clampedHeight > 0) {
                            state.node.data('aspectRatio', width / clampedHeight);
                        }
                        state.node.removeData('textHeightMode');
                    }
                }
                this._persistNodeDimensionData(state.node);
                this.nodeResizeState = null;
                this.cy.container().style.cursor = this.editingMode ? 'crosshair' : 'default';
            };
            document.addEventListener('mousemove', state.moveHandler);
            document.addEventListener('mouseup', state.upHandler);
            this.nodeResizeState = state;
            node.lock();
            this.cy.container().style.cursor = 'nwse-resize';
            if (evt.originalEvent) {
                if (typeof evt.originalEvent.preventDefault === 'function') {
                    evt.originalEvent.preventDefault();
                }
                if (typeof evt.originalEvent.stopPropagation === 'function') {
                    evt.originalEvent.stopPropagation();
                }
            }
            evt.stopImmediatePropagation();
        });

        // Show resize cursor and suspend box selection when hovering near edges with Shift
        this.nodeResizeHoverPrevBoxSelection = undefined;
        this.nodeResizeHoverOnEdge = false;

        this.cy.on('mousemove', 'node.container, node[type="text"], node[type="image"]', (evt) => {
            const defaultCursor = this.editingMode ? 'crosshair' : 'default';
            if (this.nodeResizeState && this.nodeResizeState.node === evt.target) {
                this.cy.container().style.cursor = 'nwse-resize';
                return;
            }
            const node = evt.target;
            const bb = this.getNodeInteractionBoundingBox(node);
            if (!bb) {
                this.nodeResizeHoverOnEdge = false;
                this.nodeResizeHoverNode = null;
                return;
            }
            const pos = evt.position;
            const edgeThreshold = Number.isFinite(this.nodeResizeEdgeThreshold)
                ? this.nodeResizeEdgeThreshold
                : 10;
            const onEdge = this.isPositionNearNodeEdge(pos, bb, edgeThreshold);
            this.nodeResizeHoverOnEdge = onEdge;
            this.nodeResizeHoverNode = onEdge ? node : null;


            if (onEdge) {
                if (this.nodeResizeHoverPrevBoxSelection === undefined) {
                    this.nodeResizeHoverPrevBoxSelection = this.cy.boxSelectionEnabled();
                    this.cy.boxSelectionEnabled(false);
                }
                const nodeType = typeof node.data === 'function' ? node.data('type') : undefined;
                const requiresModifier = nodeType !== 'text' && nodeType !== 'image';
                const shiftKeyActive = Boolean(evt.originalEvent && evt.originalEvent.shiftKey);
                const allowResize = shiftKeyActive || !requiresModifier;
                this.cy.container().style.cursor = allowResize ? 'nwse-resize' : defaultCursor;
            } else if (!this.nodeResizeState) {
                if (this.nodeResizeHoverPrevBoxSelection !== undefined) {
                    this.cy.boxSelectionEnabled(this.nodeResizeHoverPrevBoxSelection);
                    this.nodeResizeHoverPrevBoxSelection = undefined;
                }
                this.cy.container().style.cursor = defaultCursor;
            }
        });

        this.cy.on('mouseout', 'node.container, node[type="text"], node[type="image"]', () => {
            this.nodeResizeHoverOnEdge = false;
            this.nodeResizeHoverNode = null;

            if (!this.nodeResizeState) {
                if (this.nodeResizeHoverPrevBoxSelection !== undefined) {
                    this.cy.boxSelectionEnabled(this.nodeResizeHoverPrevBoxSelection);
                    this.nodeResizeHoverPrevBoxSelection = undefined;
                }
                this.cy.container().style.cursor = this.editingMode ? 'crosshair' : 'default';
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Shift' && this.nodeResizeHoverOnEdge) {
                this.cy.container().style.cursor = 'nwse-resize';
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === 'Shift' && !this.nodeResizeState) {
                const defaultCursor = this.editingMode ? 'crosshair' : 'default';
                const requiresModifier = this.nodeResizeHoverNode
                    ? (this.nodeResizeHoverNode.data('type') !== 'text'
                        && this.nodeResizeHoverNode.data('type') !== 'image')
                    : true;
                const showResizeCursor = this.nodeResizeHoverOnEdge && !requiresModifier;
                this.cy.container().style.cursor = showResizeCursor ? 'nwse-resize' : defaultCursor;
            }
        });

        // Document-level handlers are attached during resize start

        // Toggle container collapse/expand on double-click
        this.cy.on('dbltap', 'node.container', (evt) => {
            const side = this.getDockSideFromEvent(evt.originalEvent);
            this.toggleContainerCollapse(evt.target, side);
        });

        this.cy.on('pan zoom resize', () => {
            this.updateDockedContainerPositions();
        });

        // Optimized drag handling for large datasets
        this.cy.on('drag', 'node', (evt) => {
            if (this.nodeResizeState) {
                evt.stopImmediatePropagation();
                evt.preventDefault();
                return false;
            }
            // Ensure edges remain visible during drag
            evt.target.connectedEdges().forEach(edge => {
                edge.style('opacity', 0.9);
            });

            this.enterInteractionLowDetail();

            if (window.LayoutManager) {
                window.LayoutManager.handleDragEvent(evt);
            }
        });

        this.cy.on('dragfree', 'node', (evt) => {
            if (this.nodeResizeState) {
                evt.stopImmediatePropagation();
                evt.preventDefault();
                return false;
            }
            // Restore edge opacity after drag
            evt.target.connectedEdges().forEach(edge => {
                edge.style('opacity', 0.9);
            });

            this.scheduleInteractionDetailRestore(this._interactionLowDetailRestoreDelay / 2);

            if (window.LayoutManager) {
                window.LayoutManager.handleDragEndEvent(evt);
            }
        });
        
        // Optimized selection handling
        this.cy.on('select', 'node', (evt) => {
            this.debugSelection('Node selected via event', evt.target.id());
            // Only update UI for selected nodes to improve performance
            this.updateSelectedNodeInfo(evt.target);

            // Update selection highlighting
            if (window.LayoutManager && window.LayoutManager.updateSelectionHighlighting) {
                window.LayoutManager.updateSelectionHighlighting(this.cy);
            }

        });

        // Handle node deselection
        this.cy.on('unselect', 'node', (evt) => {
            this.debugSelection('Node unselected via event', evt.target.id());
            // Update selection highlighting
            if (window.LayoutManager && window.LayoutManager.updateSelectionHighlighting) {
                window.LayoutManager.updateSelectionHighlighting(this.cy);
            }

        });

        // Handle edge selection
        this.cy.on('select', 'edge', (evt) => {
            this.debugSelection('Edge selected via event', evt.target.id());
            // Update selection highlighting
            if (window.LayoutManager && window.LayoutManager.updateSelectionHighlighting) {
                window.LayoutManager.updateSelectionHighlighting(this.cy);
            }

        });

        // Handle edge deselection
        this.cy.on('unselect', 'edge', (evt) => {
            this.debugSelection('Edge unselected via event', evt.target.id());
            // Update selection highlighting
            if (window.LayoutManager && window.LayoutManager.updateSelectionHighlighting) {
                window.LayoutManager.updateSelectionHighlighting(this.cy);
            }

        });
        
        // Node tap handling for edge creation
        this.cy.on('tap', 'node', (evt) => {
            const node = evt.target;
            const isShiftPressed = evt.originalEvent && evt.originalEvent.shiftKey;

            // If in edge creation mode, any node click completes the edge
            if (this.edgeCreationMode) {
                this.completeEdgeCreation(node);
                return;
            }

            if (isShiftPressed) {
                // Shift+click: Start edge creation
                this.handleShiftClick(node);
            }
        });
        
        // Batch updates for large datasets
        this.cy.on('add remove', (evt) => {
            this.batchUpdateStats();
        });
        
        // Block node interactions during edge creation or resizing
        this.cy.on('grab', 'node', (evt) => {
            if (this.nodeResizeState) {
                evt.stopImmediatePropagation();
                evt.preventDefault();
                return false;
            }
            if (this.edgeCreationMode) {
                evt.stopImmediatePropagation();
                evt.preventDefault();
                return false;
            }
        });

        this.cy.on('mousedown', 'node', (evt) => {
            if (this.nodeResizeState) {
                evt.stopImmediatePropagation();
                evt.preventDefault();
                return false;
            }
            if (this.edgeCreationMode) {
                evt.stopImmediatePropagation();
                evt.preventDefault();
                return false;
            }
        });

        this.cy.on('dragstart', 'node', (evt) => {
            if (this.nodeResizeState) {
                evt.stopImmediatePropagation();
                evt.preventDefault();
                return false;
            }
            if (this.edgeCreationMode) {
                evt.stopImmediatePropagation();
                evt.preventDefault();
                return false;
            }

            // Normal dragstart behavior - ensure smooth animations during drag
            // Enable animations during drag
            this.cy.animate({
                duration: 0 // Instant for drag start
            });

            this.enterInteractionLowDetail();
        });

        this.cy.on('dragend', 'node', (evt) => {
            // Ensure all edges are visible after drag
            this.cy.edges().forEach(edge => {
                edge.style('opacity', 0.9);
            });

            this.scheduleInteractionDetailRestore(80);
        });

        // Enhanced LOD system with hierarchical clustering
        this.cy.on('zoom', (evt) => {
            // Skip LOD adjustment if we're in the middle of a custom zoom operation
            if (this.isCustomZooming) {
                return;
            }

            this.enterInteractionLowDetail();

            // Use LOD system if available
            if (window.LODSystem && window.LODSystem.config.enabled) {
                // LOD system handles zoom events
                return;
            }
            
            // Fallback to simple LOD adjustment
            clearTimeout(this.zoomTimeout);
            this.zoomTimeout = setTimeout(() => {
                this.adjustLODForZoom();
            }, 150);
        });
        
        // Listen for layout changes to reapply zoom settings
        this.cy.on('layoutstart', () => {
        });
        
        // Throttle zoom reapplication to prevent performance issues
        let zoomReapplyTimeout = null;
        
        this.cy.on('layoutready', () => {
            if (zoomReapplyTimeout) {
                clearTimeout(zoomReapplyTimeout);
            }
            zoomReapplyTimeout = setTimeout(() => {
                this.reapplyZoomSettings();
            }, 200);
        });
        
        this.cy.on('layoutstop', () => {
            if (zoomReapplyTimeout) {
                clearTimeout(zoomReapplyTimeout);
            }
            zoomReapplyTimeout = setTimeout(() => {
                this.reapplyZoomSettings();
            }, 200);
        });
        
        // Box selection functionality - using original Cytoscape event system
        this.setupBoxSelection();
        
        // Test basic mouse events
        this.cy.on('click', (evt) => {
            
            // Debug node visibility
            if (this.cy.nodes().length > 0) {
            }
        });
        
        // Add a function to ensure nodes are visible
        window.ensureNodesVisible = () => {
            
            if (this.cy) {
                
                if (this.cy.nodes().length > 0) {
                    
                    // Force all nodes to be visible with explicit styling
                    this.cy.nodes().forEach((node, index) => {
                        const isContainer = node.hasClass && node.hasClass('container');
                        node.style({
                            'background-color': '#ff0000', // Force red color
                            'border-width': isContainer ? 1 : 0,
                            'width': '30px',
                            'height': '30px',
                            'display': 'element',
                            'visibility': 'visible',
                            'opacity': '1'
                        });
                    });
                    
                    // Force a style update
                    this.cy.style().update();
                    
                    this.cy.fit();
                    this.cy.center();
                } else {
                }
            } else {
            }
        };
        
        // Add a simpler test function
        window.testNodeVisibility = () => {
            if (this.cy) {
                const nodes = this.cy.nodes();
                
                if (nodes.length > 0) {
                    const firstNode = nodes[0];
                    
                    // Try to make it bright red
                    firstNode.style('background-color', '#ff0000');
                    firstNode.style('width', '50px');
                    firstNode.style('height', '50px');
                }
            }
        };
        
        // Add a function to force Cytoscape to refresh
        window.forceRefresh = () => {
            if (this.cy) {
                
                // Force a resize and refresh
                this.cy.resize();
                this.cy.fit();
                this.cy.center();
                
                // Force style update
                this.cy.style().update();
                
                // Force a repaint
                this.cy.elements().forEach(elem => {
                    elem.style('background-color', elem.style('background-color'));
                });
                
            }
        };
        
        // Add a function to check Cytoscape state
        window.checkCytoscapeState = () => {
            if (this.cy) {
            }
        };
        
        // Add a function to force all nodes to be visible
        window.forceNodesVisible = () => {
            if (this.cy) {
                const nodes = this.cy.nodes();
                const nodeCount = nodes.length;
                
                if (nodeCount === 0) {
                    return;
                }
                
                nodes.forEach((node, index) => {
                    // Force explicit styling
                    const isContainer = node.hasClass && node.hasClass('container');
                    node.style({
                        'background-color': '#ff0000',
                        'border-width': isContainer ? 1 : 0,
                        'width': '50px',
                        'height': '50px',
                        'display': 'element',
                        'visibility': 'visible',
                        'opacity': '1'
                    });
                    
                    // Only log first few nodes to avoid spam
                    if (index < 5) {
                    }
                });
                
                if (nodeCount > 5) {
                }
                
                // Force style update
                this.cy.style().update();
                
                // Force fit and center
                this.cy.fit();
                this.cy.center();
                
            }
        };
        
        // Add a simpler function that just tries to make nodes visible
        window.makeNodesRed = () => {
            if (this.cy) {
                this.cy.nodes().forEach(node => {
                    node.style('background-color', '#ff0000');
                    node.style('width', '50px');
                    node.style('height', '50px');
                });
                this.cy.fit();
                return 'Nodes should be red now';
            }
            return 'No Cytoscape instance';
        };
        
        // Add a function to force complete Cytoscape refresh
        window.forceCytoscapeRefresh = () => {
            if (this.cy) {
                // Force a complete refresh
                this.cy.resize();
                this.cy.fit();
                this.cy.center();
                
                // Force style recalculation
                this.cy.elements().forEach(elem => {
                    elem.style('background-color', elem.style('background-color'));
                });
                
                // Force a repaint
                this.cy.forceRender();
                
                return 'Cytoscape refreshed';
            }
            return 'No Cytoscape instance';
        };
        
        // Add a function to test if the container can render anything
        window.testContainerRendering = () => {
            if (this.cy) {
                const container = this.cy.container();
                
                // Add a simple visible div to the container
                const testDiv = document.createElement('div');
                testDiv.style.cssText = `
                    position: absolute;
                    top: 50px;
                    left: 50px;
                    width: 100px;
                    height: 100px;
                    background-color: #00ff00;
                    border: 3px solid #000000;
                    z-index: 1000;
                    pointer-events: none;
                `;
                testDiv.textContent = 'TEST DIV';
                container.appendChild(testDiv);
                
                return 'Green test div added to container';
            }
            return 'No Cytoscape instance';
        };
        
        // Add a function to force Cytoscape to use canvas renderer
        window.forceCanvasRenderer = () => {
            if (this.cy) {
                // Force Cytoscape to use canvas renderer
                this.cy.renderer().setRenderMode('canvas');
                
                // Force a complete refresh
                this.cy.resize();
                this.cy.fit();
                this.cy.center();
                
                return 'Forced canvas renderer and refreshed';
            }
            return 'No Cytoscape instance';
        };
        
        // Add a simple test function to add a node directly to Cytoscape
        window.addTestNodeDirect = () => {
            if (this.cy) {
                const node = this.cy.add({
                    group: 'nodes',
                    data: {
                        id: 'test-node-direct',
                        label: 'Test Node Direct',
                        type: 'default',
                        color: '#ff0000',
                        size: 50
                    },
                    position: { x: 100, y: 100 }
                });
                
                
                // Force style update
                this.cy.style().update();
                
                // Force fit and center
                this.cy.fit();
                this.cy.center();
                
                // Check if node is in viewport
                const pan = this.cy.pan();
                const zoom = this.cy.zoom();
                
                return 'Test node added directly to Cytoscape';
            }
            return 'No Cytoscape instance';
        };
        
        // Add a function to check Cytoscape container state
        window.checkContainerState = () => {
            if (this.cy) {
                const container = this.cy.container();
                const computedStyle = window.getComputedStyle(container);
                
                
                return 'Container state logged to console';
            }
            return 'No Cytoscape instance';
        };
        
        // Add a function to check for overlays and background elements
        window.checkForOverlays = () => {
            if (this.cy) {
                const container = this.cy.container();
                const parent = container.parentElement;
                
                
                // Check all children of the container
                for (let i = 0; i < container.children.length; i++) {
                    const child = container.children[i];
                    const style = window.getComputedStyle(child);
                }
                
                // Check all children of the parent
                for (let i = 0; i < parent.children.length; i++) {
                    const child = parent.children[i];
                    const style = window.getComputedStyle(child);
                }
                
                return 'Overlay check complete';
            }
            return 'No Cytoscape instance';
        };
        
        // Add a function to force complete Cytoscape re-render
        window.forceCompleteRerender = () => {
            if (this.cy) {
                
                // Force style update
                this.cy.style().update();
                
                // Force resize
                this.cy.resize();
                
                // Force fit and center
                this.cy.fit();
                this.cy.center();
                
                // Force a complete refresh
                this.cy.elements().forEach(elem => {
                    // Force style recalculation
                    elem.style('background-color', elem.style('background-color'));
                    elem.style('width', elem.style('width'));
                    elem.style('height', elem.style('height'));
                });
                
                // Force renderer refresh
                this.cy.forceRender();
                
                // Check if WebGL is being used
                const renderer = this.cy.renderer();
                
                // Try switching renderer if WebGL
                if (renderer.getRenderMode() === 'webgl') {
                    renderer.setRenderMode('canvas');
                    this.cy.forceRender();
                }
                
                
                return 'Complete re-render forced';
            }
            return 'No Cytoscape instance';
        };
        
        // Add a function to force Cytoscape to redraw everything
        window.forceRedraw = () => {
            if (this.cy) {
                // Force all elements to be visible
                this.cy.elements().forEach(elem => {
                    elem.style('display', 'element');
                    elem.style('visibility', 'visible');
                    elem.style('opacity', '1');
                });
                
                // Force a complete redraw
                this.cy.elements().forEach(elem => {
                    elem.style('background-color', elem.style('background-color'));
                });
                
                // Force resize and fit
                this.cy.resize();
                this.cy.fit();
                this.cy.center();
                
                return 'Forced redraw complete';
            }
            return 'No Cytoscape instance';
        };
        
        // Also test mousedown without shift key
        this.cy.on('mousedown', (evt) => {
        });
        
        // Check if we need to add a background element for empty graphs
        if (this.cy.elements().length === 0) {
            
                            // Force Cytoscape to be ready and capture events
                this.cy.ready(() => {
                    
                    // Force Cytoscape to be interactive and capture events
                    this.cy.userPanningEnabled(true);
                    this.cy.userZoomingEnabled(false); // Keep our custom zoom
                    this.debugSelection('Initialization: disabling Cytoscape box selection');
                    this.cy.boxSelectionEnabled(false); // Keep our custom box selection
                    
                    // Try to fit the empty graph to ensure it's properly initialized
                    this.cy.fit();
                    this.cy.center();
                    
                    // Skip layout for empty graphs to prevent loops
                    
                    // Force a repaint to ensure everything is rendered
                    setTimeout(() => {
                        this.cy.resize();
                        this.cy.fit();
                    }, 100);
                });
        }
        
        // Test document-level events to see if they're being captured
        document.addEventListener('click', (evt) => {
        });
        
        // Check for JavaScript errors that might prevent event handling
        window.addEventListener('error', (evt) => {
            console.error('JavaScript error caught:', {
                message: evt.message,
                filename: evt.filename,
                lineno: evt.lineno,
                colno: evt.colno,
                error: evt.error
            });
        });
        window.addEventListener('unhandledrejection', (evt) => {
            console.error('Unhandled promise rejection:', evt.reason);
        });
        
        // Context menu functionality
        this.setupContextMenus();

        const cyContainer = this.cy ? this.cy.container() : null;
        if (cyContainer) {
            // Make the container focusable
            cyContainer.setAttribute('tabindex', '0');
            // Focus the container when clicked
            cyContainer.addEventListener('mousedown', () => cyContainer.focus());

            // Improved keyboard handler
            cyContainer.addEventListener('keydown', function(event) {
                // Skip if any modal is visible
                const modals = document.querySelectorAll('.modal');
                const isModalOpen = Array.from(modals).some(modal => 
                    window.getComputedStyle(modal).display !== 'none'
                );
                
                if (isModalOpen) {
                    return;
                }

                // Skip if focused on editable elements
                const active = document.activeElement;
                const editableTags = ['INPUT', 'TEXTAREA', 'SELECT'];
                if (editableTags.includes(active.tagName) || active.isContentEditable) {
                    return;
                }

                // Only handle graph keys when graph container is focused
                if ((event.key === 'Delete' || event.key === 'Backspace') && 
                    document.activeElement === cyContainer) {
                    event.preventDefault();
                    event.stopPropagation();
                    window.GraphRenderer?.deleteSelectedElements();
                }
            }, false);
        }

    },

    // Re-apply zoom settings after layout changes
    reapplyZoomSettings: function() {
        const bootstrap = window.GraphControlsModuleBootstrap;
        if (!bootstrap) {
            return false;
        }
        if (!bootstrap.moduleInstance && typeof bootstrap.init === 'function') {
            bootstrap.init();
        }
        if (!bootstrap.moduleInstance || typeof bootstrap.moduleInstance.reapplyZoomSettings !== 'function') {
            return false;
        }
        return bootstrap.moduleInstance.reapplyZoomSettings();

    },

    // Setup keep-alive tick to prevent browser unresponsive warnings
    setupKeepAliveTick: function() {
        const tickElement = document.getElementById('keep-alive-tick');
        const perfIndicator = document.getElementById('perfIndicator');
        const shouldTrackPerformance = Boolean(perfIndicator);
        const shouldStartTick = tickElement || shouldTrackPerformance;

        if (!shouldStartTick) {
            return;
        }

        const isPerformancePanelVisible = () => {
            if (!shouldTrackPerformance) {
                return false;
            }

            const panelElement =
                (perfIndicator && perfIndicator.closest('.performance-panel')) ||
                document.querySelector('[data-perf-panel], .performance-panel, #performance-panel');

            return Boolean(panelElement && panelElement.offsetParent !== null);
        };

        let tickCount = 0;
        let lastFPS = 60;
        let frameCount = 0;
        let lastTime = performance.now();

        const tickInterval = setInterval(() => {
            tickCount++;

            // Calculate FPS
            const currentTime = performance.now();
            frameCount++;
            if (currentTime - lastTime >= 1000) {
                lastFPS = Math.round(frameCount * 1000 / (currentTime - lastTime));
                frameCount = 0;
                lastTime = currentTime;
            }

            // Update a hidden element to keep the page "alive"
            if (tickElement) {
                tickElement.textContent = `Tick: ${tickCount} | FPS: ${lastFPS}`;
            }

            // Store FPS for other components to access
            this.lastFPS = lastFPS;

            const shouldTouchGraph = isPerformancePanelVisible();

            // Update performance indicator in UI when enabled/visible
            if (shouldTouchGraph && this.cy) {
                const nodeCount = this.cy.nodes().length;
                const edgeCount = this.cy.edges().length;
                this.updatePerformanceIndicator(lastFPS, nodeCount, edgeCount);
            }

            // Log progress for large datasets
            if (shouldTouchGraph && this.cy && tickCount % 10 === 0) {
                const nodeCount = this.cy.nodes().length;
                const edgeCount = this.cy.edges().length;
                const memoryUsage = performance.memory ? (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1) : 'N/A';

                // Auto-adjust LOD if performance is poor
                if (lastFPS < 15 && nodeCount > 2000) {
                    this.applyAggressiveLOD();
                }
            }

            // Check if we should stop the tick (when page is unloaded)
            if (!document.body) {
                clearInterval(tickInterval);
            }
        }, 1000); // Tick every second

        // Store the interval ID for cleanup
        this.keepAliveInterval = tickInterval;

        // Clean up on page unload
        window.addEventListener('beforeunload', () => {
            if (this.keepAliveInterval) {
                clearInterval(this.keepAliveInterval);
            }
        });
    },

    // Show loading progress for large datasets
    showLoadingProgress: function() {
        const loadingProgress = document.getElementById('loading-progress');

        if (loadingProgress) {
            loadingProgress.style.display = 'block';
        }
    },

    // Update loading progress
    updateLoadingProgress: function(percent, text) {
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        
        if (progressFill) {
            progressFill.style.width = percent + '%';
        }
        
        if (progressText) {
            progressText.textContent = text;
        }
    },

    // Hide loading progress
    hideLoadingProgress: function() {
        const loadingProgress = document.getElementById('loading-progress');

        if (loadingProgress) {
            loadingProgress.style.display = 'none';
        }
    },

    // Setup context menus
    setupContextMenus: function() {
        if (!this.cy) return;

        // Prevent the browser's default context menu from appearing
        const container = this.cy.container();
        if (container) {
            const suppressContextMenu = (e) => {
                const rect = container.getBoundingClientRect();
                const x = typeof e.clientX === 'number' ? e.clientX : null;
                const y = typeof e.clientY === 'number' ? e.clientY : null;
                const withinBounds =
                    x !== null && y !== null &&
                    x >= rect.left && x <= rect.right &&
                    y >= rect.top && y <= rect.bottom;

                if (withinBounds || container.contains(e.target)) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            };
            container.addEventListener('contextmenu', suppressContextMenu);
            // Capture phase on document to catch events early, especially within
            // compound/container nodes where bubbling can be inconsistent
            document.addEventListener('contextmenu', suppressContextMenu, true);
        }

        // Right-click on graph background
        this.cy.on('cxttap', (evt) => {
            if (evt.target === this.cy) {
                evt.preventDefault();
                evt.stopPropagation();
                if (evt.originalEvent) evt.originalEvent.preventDefault();

                const menuAPI = window.ContextMenuAdapter || window.ContextMenu;
                if (!menuAPI) return;

                const x = evt.originalEvent ? evt.originalEvent.clientX : 0;
                const y = evt.originalEvent ? evt.originalEvent.clientY : 0;

                menuAPI.showGraphMenu(x, y);
            }
        });

        // Right-click on nodes
        this.cy.on('cxttap', 'node', (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            if (evt.originalEvent) evt.originalEvent.preventDefault();

            const menuAPI = window.ContextMenuAdapter || window.ContextMenu;
            if (!menuAPI) return;

            const rightClickedNode = evt.target;
            const x = evt.originalEvent ? evt.originalEvent.clientX : 0;
            const y = evt.originalEvent ? evt.originalEvent.clientY : 0;

            // Ensure the right-clicked node is part of the current selection
            this.debugSelection('Programmatically selecting node via right-click', rightClickedNode.id());
            rightClickedNode.select();

            const selectedNodes = this.cy.nodes(':selected');
            menuAPI.showNodeMenu(x, y, selectedNodes, rightClickedNode);
        });

        // Right-click on edges
        this.cy.on('cxttap', 'edge', (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            if (evt.originalEvent) evt.originalEvent.preventDefault();

            const menuAPI = window.ContextMenuAdapter || window.ContextMenu;
            if (!menuAPI) return;

            const selectedEdges = this.cy.edges(':selected');
            const x = evt.originalEvent ? evt.originalEvent.clientX : 0;
            const y = evt.originalEvent ? evt.originalEvent.clientY : 0;

            menuAPI.showEdgeMenu(x, y, selectedEdges);
        });
    },

    // Update selected node information
    updateSelectedNodeInfo: function(node) {
        // Update node information display
        const nodeInfo = {
            id: node.id(),
            label: node.data('label'),
            type: node.data('type'),
            size: node.data('size')
        };

    },


    // Arrange children within their container in a grid without resizing it
    arrangeContainerNodes: function(container) {
        const isContainer = !!(container && (
            (typeof container.hasClass === 'function' && container.hasClass('container')) ||
            (typeof container.data === 'function' &&
                (container.data('type') === 'container' || container.data('isContainer')))
        ));
        if (!isContainer) return;

        const children = container.children();
        const movable = children.filter(child => !(child.data('pinned') || child.locked()));
        console.group(
            `📦 Arranging container ${container.id()} with ${children.length} child nodes`
        );
        if (movable.length === 0) {
            console.groupEnd();
            return;
        }

        // Preserve container dimensions (fallback to bounding box if unset)
        const center = container.position();
        let width = parseFloat(container.data('width'));
        let height = parseFloat(container.data('height'));

        if (!width || !height) {
            const bb = container.boundingBox();
            width = bb.w;
            height = bb.h;
        }


        container.data('width', width);
        container.data('height', height);

        children.forEach(child => {
        });

        // Temporarily unlock any locked child nodes so layout can modify them
        const previouslyLocked = [];
        movable.forEach(child => {
            if (child.locked && child.locked()) {
                previouslyLocked.push(child);
                child.unlock();
            }
        });

        // Determine maximum child dimensions to size grid cells
        let maxW = 0;
        let maxH = 0;
        movable.forEach(child => {
            const bb = child.boundingBox();
            maxW = Math.max(maxW, bb.w);
            maxH = Math.max(maxH, bb.h);
        });

        const spacing = 20; // Space between nodes
        const cellW = maxW + spacing;
        const cellH = maxH + spacing;

        // Calculate grid dimensions aiming for a square layout
        const cols = Math.ceil(Math.sqrt(movable.length));
        const rows = Math.ceil(movable.length / cols);

        // Center the grid within the container's current position
        const gridW = cols * cellW;
        const gridH = rows * cellH;
        const startX = center.x - gridW / 2 + cellW / 2;
        const startY = center.y - gridH / 2 + cellH / 2;

        // Place each child sequentially in the grid
        movable.forEach((child, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = startX + col * cellW;
            const y = startY + row * cellH;
            child.position({ x, y });
        });

        // Relock nodes that were originally locked
        previouslyLocked.forEach(node => node.lock());

        console.groupEnd();
    },

    /**
     * Arrange all top-level nodes (including container nodes) into rows whose
     * right edges never exceed the configured maximum row width. Nodes are
     * aligned along their top edges with consistent spacing so that rows stay
     * visually separated and no nodes overlap.
     *
     * @param {Object} [options]
     * @param {number} [options.maxRowWidth=7680] - Maximum width for a row
     *   before starting a new row.
     * @param {number} [options.horizontalSpacing=80] - Horizontal spacing
     *   between nodes in pixels.
     * @param {number} [options.verticalSpacing=120] - Vertical spacing between
     *   rows in pixels.
     */
    tileTopLevelNodes: function(options = {}) {
        const cy = this.cy;
        if (!cy) {
            console.warn('Tile operation skipped: Cytoscape instance not ready');
            return;
        }

        const maxRowWidth = Number.isFinite(options.maxRowWidth) ? options.maxRowWidth : 7680;
        const minSpacing = 3;
        const horizontalSpacing = Math.max(
            minSpacing,
            Number.isFinite(options.horizontalSpacing) ? options.horizontalSpacing : 80
        );
        const verticalSpacing = Math.max(
            minSpacing,
            Number.isFinite(options.verticalSpacing) ? options.verticalSpacing : 120
        );

        const allNodes = cy.nodes();
        if (!allNodes || allNodes.length === 0) {
            return;
        }

        const topLevelNodes = allNodes.filter(node => {
            if (!node) {
                return false;
            }

            if (typeof node.parent !== 'function') {
                return true;
            }

            const parent = node.parent();
            return !parent || parent.length === 0;
        });

        if (!topLevelNodes || topLevelNodes.length === 0) {
            return;
        }

        const nodesArray = typeof topLevelNodes.toArray === 'function'
            ? topLevelNodes.toArray()
            : Array.from(topLevelNodes);

        nodesArray.sort((a, b) => {
            const labelA = (typeof a.data === 'function' && a.data('label')) || '';
            const labelB = (typeof b.data === 'function' && b.data('label')) || '';
            const normalizedA = String(labelA).toLocaleLowerCase();
            const normalizedB = String(labelB).toLocaleLowerCase();

            if (normalizedA === normalizedB) {
                return a.id().localeCompare(b.id());
            }

            return normalizedA.localeCompare(normalizedB);
        });

        if (nodesArray.length === 0) {
            return;
        }

        const previouslyLocked = [];
        nodesArray.forEach(node => {
            if (typeof node.locked === 'function' && node.locked()) {
                previouslyLocked.push(node);
                node.unlock();
            }
        });

        let currentX = 0;
        let currentRowTop = 0;
        let rowMaxHeight = 0;

        try {
            cy.batch(() => {
                nodesArray.forEach(node => {
                    if (!node || typeof node.position !== 'function') {
                        return;
                    }

                    const bb = typeof node.boundingBox === 'function'
                        ? node.boundingBox({ includeLabels: true, includeOverlays: true })
                        : { w: node.width ? node.width() : 0, h: node.height ? node.height() : 0 };

                    const nodeWidth = Math.max(bb.w || 0, node.width ? node.width() : 0, minSpacing);
                    const nodeHeight = Math.max(bb.h || 0, node.height ? node.height() : 0, minSpacing);

                    if (currentX > 0 && currentX + nodeWidth > maxRowWidth) {
                        currentX = 0;
                        currentRowTop += rowMaxHeight + verticalSpacing;
                        rowMaxHeight = 0;
                    }

                    const centerX = currentX + nodeWidth / 2;
                    const centerY = currentRowTop + nodeHeight / 2;

                    node.position({ x: centerX, y: centerY });

                    currentX += nodeWidth + horizontalSpacing;
                    rowMaxHeight = Math.max(rowMaxHeight, nodeHeight);
                });
            });
        } finally {
            previouslyLocked.forEach(node => {
                if (node && typeof node.lock === 'function') {
                    node.lock();
                }
            });
        }

        if (typeof cy.fit === 'function') {
            cy.fit(topLevelNodes, Math.max(horizontalSpacing, verticalSpacing));
        }
    },

    // Lock all descendant nodes and edges of a container
    lockContainerDescendants: function(container) {
        if (!container || typeof container.descendants !== 'function') {
            return;
        }

        const descendantNodes = container.descendants();
        const descendantEdges = descendantNodes.connectedEdges();

        const previousSuppression = this._suppressContainerLockEvents === true;
        this._suppressContainerLockEvents = true;

        try {
            descendantNodes.forEach(node => {
                if (!node) {
                    return;
                }

                if (typeof node.data === 'function') {
                    node.data('pinned', true);
                }

                if (typeof node.lock === 'function') {
                    node.lock();
                }
            });

            descendantEdges.forEach(edge => {
                if (edge && typeof edge.lock === 'function') {
                    edge.lock();
                }
            });
        } finally {
            this._suppressContainerLockEvents = previousSuppression;
        }
    },

    // Restore descendant lock states for a container
    unlockContainerDescendants: function(container) {
        if (!container || typeof container.descendants !== 'function') {
            return;
        }

        const descendantNodes = container.descendants();
        const descendantEdges = descendantNodes.connectedEdges();

        const previousSuppression = this._suppressContainerLockEvents === true;
        this._suppressContainerLockEvents = true;

        try {
            descendantNodes.forEach(node => {
                if (!node) {
                    return;
                }

                if (typeof node.data === 'function') {
                    node.data('pinned', false);
                }

                if (typeof node.unlock === 'function') {
                    node.unlock();
                }
            });

            descendantEdges.forEach(edge => {
                if (edge && typeof edge.unlock === 'function') {
                    edge.unlock();
                }
            });
        } finally {
            this._suppressContainerLockEvents = previousSuppression;
        }
    },

    // Set up event listeners for container lock propagation
    setupContainerLocking: function() {
        if (!this.cy || this._containerLockingSetup) return;
        this._containerLockingSetup = true;

        this.cy.on('lock', 'node.container', (evt) => {
            if (this._suppressContainerLockEvents) return;
            this.lockContainerDescendants(evt.target);
        });

        this.cy.on('unlock', 'node.container', (evt) => {
            if (this._suppressContainerLockEvents) return;
            this.unlockContainerDescendants(evt.target);
        });
    },

    getDockSideFromEvent: function(event) {
        if (!event) {
            return 'left';
        }

        if (event.altKey && (event.ctrlKey || event.metaKey)) {
            return 'top';
        }

        if (event.altKey) {
            return 'bottom';
        }

        if (event.ctrlKey || event.metaKey) {
            return 'left';
        }

        if (event.shiftKey) {
            return 'left';
        }

        return 'left';
    },

    getDockingSpacing: function() {
        const defaults = { margin: 5, spacing: 5 };
        const config = this.dockSpacingConfig || defaults;

        const margin = Number.isFinite(config.margin) ? config.margin : defaults.margin;
        const spacing = Number.isFinite(config.spacing) ? config.spacing : defaults.spacing;

        return {
            margin: Math.max(0, margin),
            spacing: Math.max(0, spacing)
        };
    },

    getNextDockOrder: function(side) {
        if (!this._dockedOrderCounters) {
            this._dockedOrderCounters = { left: 0, right: 0, top: 0, bottom: 0 };
        }

        if (typeof this._dockedOrderCounters[side] !== 'number') {
            this._dockedOrderCounters[side] = 0;
        }

        const order = this._dockedOrderCounters[side];
        this._dockedOrderCounters[side] += 1;
        return order;
    },

    applyDockedContainerScale: function(container) {
        if (!this.cy || !container || !container.data('collapsed')) {
            return null;
        }

        const parseSize = (value, fallback) => {
            const parsed = parseFloat(value);
            return Number.isFinite(parsed) ? parsed : fallback;
        };

        const fallbackWidth = parseSize(container.data('width'), 100);
        const fallbackHeight = parseSize(container.data('height'), 30);
        const baseWidth = parseSize(container.data('collapsedBaseWidth'), fallbackWidth);
        const baseHeight = parseSize(container.data('collapsedBaseHeight'), fallbackHeight);
        const basePadding = parseSize(container.data('collapsedBasePadding'), 0);
        const baseBorderWidth = parseSize(container.data('collapsedBaseBorderWidth'), 2);
        const baseFontSize = container.data('collapsedBaseFontSize');
        const zoom = this.cy.zoom() || 1;
        const safePadding = Math.max(0, basePadding);
        const safeBorderWidth = Math.max(0, baseBorderWidth);
        const horizontalExtras = 2 * (safePadding + safeBorderWidth);
        const verticalExtras = 2 * (safePadding + safeBorderWidth);
        const contentWidth = Math.max(0, baseWidth - horizontalExtras);
        const contentHeight = Math.max(0, baseHeight - verticalExtras);
        const scaledWidth = contentWidth / zoom;
        const scaledHeight = contentHeight / zoom;
        const scaledPadding = safePadding / zoom;
        const scaledBorderWidth = safeBorderWidth / zoom;
        const scaledFontSize = (Number.isFinite(baseFontSize) ? baseFontSize : 14) / zoom;

        container.style('width', scaledWidth);
        container.style('height', scaledHeight);
        container.style('padding', scaledPadding);
        container.style('border-width', scaledBorderWidth);
        container.style('font-size', scaledFontSize);

        return {
            renderedWidth: contentWidth + horizontalExtras,
            renderedHeight: contentHeight + verticalExtras
        };
    },

    applyDockedContainerScaleToAll: function() {
        if (!this.cy) return;

        this.cy.nodes('[collapsed]').forEach(container => {
            this.applyDockedContainerScale(container);
        });
    },


    updateDockedContainerPositions: function() {
        this.applyDockedContainerScaleToAll();

    },

    // Toggle container collapse/expand state
    toggleContainerCollapse: function(container, side) {
        if (!container || !(container.hasClass && container.hasClass('container'))) return;

        // Preserve original label
        let baseLabel = container.data('baseLabel');
        if (!baseLabel) {
            baseLabel = container.data('label');
            container.data('baseLabel', baseLabel);
        }

        const collapsed = container.data('collapsed');

        if (collapsed) {
            // Expand: restore size, position, and show children
            const prevWidth = container.data('prevWidth');
            const prevHeight = container.data('prevHeight');
            const prevPosition = container.data('prevPosition');
            const dockedInfo = container.data('docked');
            const wasLockedBeforeDock = container.data('prevLockedState');
            if (dockedInfo) {
                container.removeData('docked');
                this.updateDockedContainerPositions(dockedInfo.side);
            }
            if (prevWidth !== undefined && prevHeight !== undefined) {
                container.removeStyle('width');
                container.removeStyle('height');
                container.data('width', prevWidth);
                container.data('height', prevHeight);
            }
            container.removeData('collapsedBaseWidth');
            container.removeData('collapsedBaseHeight');
            container.removeData('collapsedBasePadding');
            container.removeData('collapsedBaseBorderWidth');
            container.removeData('collapsedBaseFontSize');
            // Unlock before restoring position so programmatic moves are applied
            if (container.locked()) {
                container.unlock();
            }
            if (prevPosition) {
                container.position(prevPosition);
            }
            container.children().style('display', 'element');
            container.children().connectedEdges().style('display', 'element');
            container.removeData('collapsed');
            container.removeData('prevWidth');
            container.removeData('prevHeight');
            container.removeData('prevPosition');
            const prevBorder = container.data('prevBorderWidth');
            if (prevBorder !== undefined) {
                container.style('border-width', prevBorder);
                container.removeData('prevBorderWidth');
            } else {
                container.removeStyle('border-width');
            }
            const prevPadding = container.data('prevPadding');
            if (prevPadding !== undefined) {
                if (prevPadding) {
                    container.style('padding', prevPadding);
                } else {
                    container.removeStyle('padding');
                }
                container.removeData('prevPadding');
            } else {
                container.removeStyle('padding');
            }
            const prevBackground = container.data('prevBackgroundColor');
            if (prevBackground !== undefined) {
                if (prevBackground) {
                    container.style('background-color', prevBackground);
                } else {
                    container.removeStyle('background-color');
                }
                container.removeData('prevBackgroundColor');
            }
            const prevBackgroundOpacity = container.data('prevBackgroundOpacity');
            if (prevBackgroundOpacity !== undefined) {
                if (prevBackgroundOpacity) {
                    container.style('background-opacity', prevBackgroundOpacity);
                } else {
                    container.removeStyle('background-opacity');
                }
                container.removeData('prevBackgroundOpacity');
            } else {
                container.removeStyle('background-opacity');
            }
            const prevLabelColor = container.data('prevLabelColor');
            if (prevLabelColor !== undefined) {
                if (prevLabelColor) {
                    container.style('color', prevLabelColor);
                } else {
                    container.removeStyle('color');
                }
                container.removeData('prevLabelColor');
            }
            const prevFontSize = container.data('prevFontSize');
            if (prevFontSize !== undefined) {
                if (prevFontSize) {
                    container.style('font-size', prevFontSize);
                } else {
                    container.removeStyle('font-size');
                }
                container.removeData('prevFontSize');
            } else {
                container.removeStyle('font-size');
            }
            const prevFontWeight = container.data('prevFontWeight');
            if (prevFontWeight !== undefined) {
                if (prevFontWeight) {
                    container.style('font-weight', prevFontWeight);
                } else {
                    container.removeStyle('font-weight');
                }
                container.removeData('prevFontWeight');
            } else {
                container.removeStyle('font-weight');
            }
            const prevOpacity = container.data('prevOpacity');
            if (prevOpacity !== undefined) {
                if (prevOpacity) {
                    container.style('opacity', prevOpacity);
                } else {
                    container.removeStyle('opacity');
                }
                container.removeData('prevOpacity');
            } else {
                container.removeStyle('opacity');
            }
            const prevTextValign = container.data('prevTextValign');
            if (prevTextValign !== undefined) {
                if (prevTextValign) {
                    container.style('text-valign', prevTextValign);
                } else {
                    container.removeStyle('text-valign');
                }
                container.removeData('prevTextValign');
            } else {
                container.removeStyle('text-valign');
            }
            const prevTextHalign = container.data('prevTextHalign');
            if (prevTextHalign !== undefined) {
                if (prevTextHalign) {
                    container.style('text-halign', prevTextHalign);
                } else {
                    container.removeStyle('text-halign');
                }
                container.removeData('prevTextHalign');
            } else {
                container.removeStyle('text-halign');
            }
            container.data('label', baseLabel);
            if (wasLockedBeforeDock === true) {
                container.lock();
            } else {
                container.unlock();
            }
            container.removeData('prevLockedState');
        } else {
            // Collapse: store size and position, hide children, and shrink
            container.data('prevWidth', container.data('width'));
            container.data('prevHeight', container.data('height'));
            container.data('prevPosition', { ...container.position() });
            container.children().style('display', 'none');
            container.children().connectedEdges().style('display', 'none');
            const collapsedWidth = 100;
            const collapsedHeight = 30;
            container.data('prevLockedState', container.locked());
            container.data('prevBorderWidth', container.style('border-width'));
            const previousPadding = container.style('padding');
            container.data('prevPadding', previousPadding || null);
            const previousBackground = container.style('background-color');
            const previousBackgroundOpacity = container.style('background-opacity');
            const previousLabelColor = container.style('color');
            const previousFontSize = container.style('font-size');
            const previousFontWeight = container.style('font-weight');
            const previousTextValign = container.style('text-valign');
            const previousTextHalign = container.style('text-halign');
            const previousOpacity = container.style('opacity');
            container.data('prevBackgroundColor', previousBackground || null);
            container.data('prevBackgroundOpacity', previousBackgroundOpacity || null);
            container.data('prevLabelColor', previousLabelColor || null);
            container.data('prevFontSize', previousFontSize || null);
            container.data('prevFontWeight', previousFontWeight || null);
            container.data('prevTextValign', previousTextValign || null);
            container.data('prevTextHalign', previousTextHalign || null);
            container.data('prevOpacity', previousOpacity || null);
            container.data('collapsedBaseWidth', collapsedWidth);
            container.data('collapsedBaseHeight', collapsedHeight);
            const basePadding = parseFloat(previousPadding);
            container.data('collapsedBasePadding', Number.isFinite(basePadding) ? basePadding : 0);
            container.data('collapsedBaseBorderWidth', 2);
            container.data('collapsedBaseFontSize', 14);
            container.data('collapsed', true);
            this.applyDockedContainerScale(container);
            container.style('background-color', '#000000');
            container.style('background-opacity', 1);
            container.style('color', '#ffffff');
            container.style('font-weight', 'bold');
            container.style('text-valign', 'center');
            container.style('text-halign', 'center');
            container.style('opacity', 1);
            const dockSide = side || container.data('preferredDockSide') || 'left';
            const order = this.getNextDockOrder(dockSide);
            container.data('label', baseLabel);
            container.data('docked', { side: dockSide, order });
            this.updateDockedContainerPositions(dockSide);
            container.unlock();
        }
    },

    // Initialize collapsed containers after rendering
    initializeCollapsedContainers: function() {
        if (!this.cy) return;
        this.cy.nodes('[collapsed]').forEach(container => {
            let baseLabel = container.data('baseLabel') || container.data('label') || '';
            baseLabel = baseLabel.replace(/\s*[\u25B6\u25BC]\s*$/, '');
            container.data('baseLabel', baseLabel);
            container.data('prevWidth', container.data('width'));
            container.data('prevHeight', container.data('height'));
            container.data('prevPosition', { ...container.position() });
            container.data('prevBorderWidth', container.style('border-width'));
            const initialPadding = container.style('padding');
            container.data('prevPadding', initialPadding || null);
            const initialBackground = container.style('background-color');
            const initialBackgroundOpacity = container.style('background-opacity');
            const initialLabelColor = container.style('color');
            const initialFontSize = container.style('font-size');
            const initialFontWeight = container.style('font-weight');
            const initialTextValign = container.style('text-valign');
            const initialTextHalign = container.style('text-halign');
            container.data('prevBackgroundColor', initialBackground || null);
            container.data('prevBackgroundOpacity', initialBackgroundOpacity || null);
            container.data('prevLabelColor', initialLabelColor || null);
            container.data('prevFontSize', initialFontSize || null);
            container.data('prevFontWeight', initialFontWeight || null);
            container.data('prevTextValign', initialTextValign || null);
            container.data('prevTextHalign', initialTextHalign || null);
            container.children().style('display', 'none');
            container.children().connectedEdges().style('display', 'none');
            container.data('collapsedBaseWidth', 100);
            container.data('collapsedBaseHeight', 30);
            const basePadding = parseFloat(initialPadding);
            container.data('collapsedBasePadding', Number.isFinite(basePadding) ? basePadding : 0);
            container.data('collapsedBaseBorderWidth', 2);
            container.data('collapsedBaseFontSize', 14);
            container.data('collapsed', true);
            this.applyDockedContainerScale(container);
            container.style('background-color', '#000000');
            container.style('background-opacity', 1);
            container.style('color', '#ffffff');
            container.style('font-weight', 'bold');
            container.style('text-valign', 'center');
            container.style('text-halign', 'center');
            const initialOpacity = container.style('opacity');
            container.data('prevOpacity', initialOpacity || null);
            container.style('opacity', 1);
            container.data('label', baseLabel);
            container.unlock();
        });

        this.updateDockedContainerPositions();
    },

    // Adjust a container's dimensions so it continues to enclose its children
    // without rearranging them.
    updateContainerBounds: function(container) {
        const isContainer = !!(container && (
            (typeof container.hasClass === 'function' && container.hasClass('container')) ||
            (typeof container.data === 'function' &&
                (container.data('type') === 'container' || container.data('isContainer')))
        ));
        if (!isContainer) return;

        const children = typeof container.children === 'function' ? container.children() : null;
        if (!children || children.length === 0) {
            return;
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        children.forEach(child => {
            if (!child || typeof child.boundingBox !== 'function') {
                return;
            }

            const bb = child.boundingBox({ includeLabels: true, includeOverlays: true });
            if (!bb) {
                return;
            }

            minX = Math.min(minX, bb.x1);
            minY = Math.min(minY, bb.y1);
            maxX = Math.max(maxX, bb.x2);
            maxY = Math.max(maxY, bb.y2);
        });

        if (!Number.isFinite(minX) || !Number.isFinite(minY) ||
            !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
            return;
        }

        const paddingValue = (() => {
            if (typeof container.style === 'function') {
                const raw = container.style('padding');
                const parsed = parseFloat(raw);
                if (Number.isFinite(parsed)) {
                    return parsed;
                }
            }

            if (typeof container.data === 'function') {
                const raw = container.data('padding');
                const parsed = parseFloat(raw);
                if (Number.isFinite(parsed)) {
                    return parsed;
                }
            }

            return 40;
        })();

        const horizontalPadding = Math.max(paddingValue * 2, 0);
        const verticalPadding = Math.max(paddingValue * 2, 0);

        const newWidth = Math.max((maxX - minX) + horizontalPadding, 40);
        const newHeight = Math.max((maxY - minY) + verticalPadding, 40);
        const centerX = minX + (maxX - minX) / 2;
        const centerY = minY + (maxY - minY) / 2;

        if (typeof container.position === 'function') {
            container.position({ x: centerX, y: centerY });
        }

        if (typeof container.data === 'function') {
            container.data({
                width: newWidth,
                height: newHeight
            });
        }
    },

    // Batch update statistics
    batchUpdateStats: function() {
        if (!this.cy) return;
        
        // Debounce stats updates for better performance
        clearTimeout(this.statsUpdateTimeout);
        this.statsUpdateTimeout = setTimeout(() => {
            this.updateStats();
        }, 100);
    },

    // Update graph statistics
    updateStats: function() {
        if (!this.cy) return;
        
        const nodeCount = this.cy.nodes().length;
        const edgeCount = this.cy.edges().length;
        
        const nodeCountElement = document.getElementById('nodeCount');
        const edgeCountElement = document.getElementById('edgeCount');
        
        if (nodeCountElement) {
            nodeCountElement.textContent = nodeCount.toLocaleString();
        }
        
        if (edgeCountElement) {
            edgeCountElement.textContent = edgeCount.toLocaleString();
        }
        
        // Performance warning for large datasets
        if (nodeCount > 50000) {
        }
    },

    _normalizeRenderDelta(renderOptions = {}) {
        const delta = renderOptions && typeof renderOptions === 'object'
            ? renderOptions.delta
            : null;

        return {
            nodes: Array.isArray(delta?.nodes) ? delta.nodes.filter(Boolean) : [],
            edges: Array.isArray(delta?.edges) ? delta.edges.filter(Boolean) : []
        };
    },

    _isSmallIncrementalDelta(delta) {
        if (!delta) {
            return false;
        }

        const nodeCount = Array.isArray(delta.nodes) ? delta.nodes.length : 0;
        const edgeCount = Array.isArray(delta.edges) ? delta.edges.length : 0;

        // Only support a single node OR a single edge addition
        if (nodeCount + edgeCount !== 1) {
            return false;
        }

        return nodeCount <= 1 && edgeCount <= 1;
    },

    _applyIncrementalRender(delta) {
        if (!this.cy) {
            return false;
        }

        const nodeElements = (Array.isArray(delta.nodes) ? delta.nodes : []).map(node => {
            const nodeData = node && typeof node === 'object' && node.data ? node.data : node;
            return {
                group: 'nodes',
                data: nodeData,
                position: nodeData && nodeData.x !== undefined && nodeData.y !== undefined
                    ? { x: nodeData.x, y: nodeData.y }
                    : undefined,
                classes: node?.classes || nodeData?.classes || undefined
            };
        });

        const edgeElements = (Array.isArray(delta.edges) ? delta.edges : []).map(edge => {
            const edgeData = edge && typeof edge === 'object' && edge.data ? edge.data : edge;
            return { group: 'edges', data: edgeData };
        });

        const elementsToAdd = [...nodeElements, ...edgeElements];
        if (elementsToAdd.length === 0) {
            return false;
        }

        nodeElements.forEach(element => {
            this.normalizeNodeData(element, { preserveExplicitDimensions: true });
        });

        if (!this.currentNodeIds) {
            this.currentNodeIds = new Set();
            if (typeof this.cy.nodes === 'function') {
                this.cy.nodes().forEach(node => {
                    if (typeof node.id === 'function') {
                        this.currentNodeIds.add(node.id());
                    }
                });
            }
        }

        nodeElements.forEach(element => {
            if (element?.data?.id) {
                this.currentNodeIds.add(element.data.id);
            }
        });

        let addedElements = this.cy.collection();
        this.cy.batch(() => {
            addedElements = this.cy.add(elementsToAdd);
        });

        const addedNodes = typeof addedElements.nodes === 'function'
            ? addedElements.nodes()
            : this.cy.collection();

        this.normalizeNodeCollection(addedNodes);

        if (addedNodes && typeof addedNodes.forEach === 'function') {
            addedNodes.forEach(node => {
                this._setNodeLabelInIndex(node, this._extractNodeLabel(node));
            });
        } else {
            this._refreshLabelIndexFromCy();
        }

        if (typeof this.cy.style === 'function') {
            this.cy.style().update();
        }

        this.updateLabelVisibility();
        this.updateStats();
        this.insertGraphReturnNodeForStackTop();

        return true;
    },

    // Render graph with performance optimizations and validation
    renderGraph: function(renderOptions = {}) {
        try {

            if (!this.cy) {
                console.error('Cytoscape not initialized');
                return;
            }

            // Pause history while performing bulk render operations
            this.pauseHistory();

            const renderDelta = this._normalizeRenderDelta(renderOptions);

            if (this._isSmallIncrementalDelta(renderDelta)) {
                const applied = this._applyIncrementalRender(renderDelta);
                if (applied) {
                    this.resumeHistory();
                    this.saveState({ delta: renderDelta });
                    return applied;
                }
            }

            // Get graph data from DataManager if available, otherwise fall back
            let graphData = null;
            if (window.DataManager && typeof window.DataManager.getGraphData === 'function') {
                graphData = window.DataManager.getGraphData();
            } else if (window.GraphManager && window.GraphManager.currentGraph) {
                const gm = window.GraphManager.currentGraph;
                graphData = {
                    nodes: (gm.nodes || []).map(n => n.data ? {
                        ...n.data,
                        x: n.position && n.position.x !== undefined ? n.position.x : n.data.x,
                        y: n.position && n.position.y !== undefined ? n.position.y : n.data.y
                    } : n),
                    edges: (gm.edges || []).map(e => e.data ? { ...e.data } : e)
                };
            }

            if (!graphData || !Array.isArray(graphData.nodes) || !Array.isArray(graphData.edges)) {
                console.error('Invalid graph data');
                console.error('graphData:', graphData);
                console.error('graphData.nodes:', graphData ? graphData.nodes : 'No graphData');
                console.error('graphData.edges:', graphData ? graphData.edges : 'No graphData');
                if (window.UI && window.UI.showNotification) {
                    window.UI.showNotification('Invalid graph data structure', 'error');
                }
                return;
            }
            
            // Validate graph structure with lenient mode (temporarily disabled)
            if (window.Validation && window.Validation.validators && window.QuantickleConfig.validation.enabled) {
                const validation = window.Validation.validators.validateGraph(graphData, true); // Use lenient mode
                if (!validation.valid) {
                    console.error('Graph validation failed:', validation.errors);
                    // Continue anyway for debugging
                    // if (window.UI && window.UI.showNotification) {
                    //     window.UI.showNotification(
                    //         'Graph validation failed. Check console for details.',
                    //         'error'
                    //     );
                    // }
                    // return;
                }
            }
            
            // Apply level-of-detail rendering for large graphs
            const nodeCount = graphData.nodes.length;
            const edgeCount = graphData.edges.length;

            // Determine LOD level based on dataset size
            const lodLevel = this.determineLODLevel(nodeCount, edgeCount);

            // Apply LOD-based rendering
            let { nodesToRender, edgesToRender } = this.executeLODRendering(
                graphData,
                lodLevel,
                nodeCount,
                edgeCount
            );

            if (!nodesToRender || !edgesToRender) {
                nodesToRender = [...graphData.nodes];
                edgesToRender = [...graphData.edges];
            }
            
            // For small datasets (like pasted nodes), ensure all nodes are rendered
            if (nodeCount <= 50) {
                nodesToRender = [...graphData.nodes];
                edgesToRender = [...graphData.edges];
            }

            // Convert raw data objects into Cytoscape element format
            const nodeElements = nodesToRender.map(node => ({
                group: 'nodes',
                data: node,
                position: node.x !== undefined && node.y !== undefined
                    ? { x: node.x, y: node.y }
                    : undefined,
                classes: node.classes || undefined
            }));
            const edgeElements = edgesToRender.map(edge => ({
                group: 'edges',
                data: edge
            }));

            // Track node IDs for edge validation
            this.currentNodeIds = new Set(nodeElements.map(n => n.data.id));

            // Validate nodes and edges before rendering (temporarily disabled)
            // const renderValidation = this.validateRenderData(nodeElements, edgeElements);
            // if (!renderValidation.valid) {
            //     console.error('Render data validation failed:', renderValidation.errors);
            //     if (window.UI && window.UI.showNotification) {
            //         window.UI.showNotification(
            //             'Invalid render data. Check console for details.',
            //             'error'
            //         );
            //     }
            //     return;
            // }


            // Clear existing elements
            this.cy.elements().remove();

            // Prepare all elements in memory before rendering
            const batchSize = 500; // Increased for large datasets
            const allElements = [...nodeElements, ...edgeElements];
            const totalNodes = nodeElements.length;
            let nodesProcessed = 0;
            const showProgress = allElements.length > 1000;

            if (showProgress) {
                this.showLoadingProgress();
            }

            const preparedElements = [];
            const processBatch = (startIndex) => {
                const endIndex = Math.min(startIndex + batchSize, allElements.length);
                const batch = allElements.slice(startIndex, endIndex);

                // Validate batch before preparing
                const batchValidation = this.validateRenderBatch(batch);
                if (!batchValidation.valid) {
                    console.error('Batch validation failed:', batchValidation.errors);
                    if (window.UI && window.UI.showNotification) {
                        window.UI.showNotification(
                            'Some elements failed validation. Check console for details.',
                            'error'
                        );
                    }
                }

                batchValidation.validElements.forEach(element => {
                    if (element.group === 'nodes') {
                        this.normalizeNodeData(element, { preserveExplicitDimensions: true });
                        nodesProcessed++;
                        if (showProgress && totalNodes > 0) {
                            const progress = Math.round((nodesProcessed / totalNodes) * 100);
                            this.updateLoadingProgress(progress, `Placing nodes: ${nodesProcessed}/${totalNodes}`);
                        }
                    }
                    preparedElements.push(element);
                });

                if (endIndex < allElements.length) {
                    setTimeout(() => processBatch(endIndex), 0);
                } else {
                    if (showProgress && totalNodes > 0) {
                        this.updateLoadingProgress(100, `Placing nodes: ${totalNodes}/${totalNodes}`);
                    }

                    // Add all prepared elements to the graph at once
                    this.cy.batch(() => {
                        this.cy.add(preparedElements);
                    });

                    // Final pass to normalize all node data - CRITICAL FOR PROPER DISPLAY
                    this.normalizeAllNodeData();

                    // Ensure label cache reflects the newly rendered graph
                    this._refreshLabelIndexFromCy();

                    // Validate final graph state
                    const finalValidation = this.validateGraphState();
                    if (!finalValidation.valid) {
                        console.error('Final graph state validation failed:', finalValidation.errors);
                        if (window.UI && window.UI.showNotification) {
                            window.UI.showNotification(
                                'Graph state validation failed. Check console for details.',
                                'error'
                            );
                        }
                        return;
                    }

                    this.initializeCollapsedContainers();

                    // Apply layout with delay to ensure elements are added (skip during paste operations and position restoration)
                    setTimeout(() => {
                        if (this.suppressPostRenderLayout || (window.GraphManager && window.GraphManager._isRestoring)) {
                            return;
                        }
                        if (window.LayoutManager && !this.isPastingNodes && !this.skipNextLayoutApplication) {
                            window.LayoutManager.applyCurrentLayout();
                        } else if (this.isPastingNodes) {
                        } else if (this.skipNextLayoutApplication) {
                            // This cycle intentionally skips the automatic layout (e.g., when restoring saved positions).
                            // Clear the flag now so manual layout actions do not require an extra click later.
                            this.skipNextLayoutApplication = false;
                        }
                    }, 100);

                    // Force a refresh of the graph view (skip if positions will be restored)
                    setTimeout(() => {
                        if (this.suppressPostRenderLayout || (window.GraphManager && window.GraphManager._isRestoring)) {
                            this.hideLoadingProgress();
                            return;
                        }
                        if (!this.skipNextLayoutApplication) {
                            this.cy.fit();
                            this.cy.center();
                        } else {
                            // Skip auto-fit for restored layouts, but consume the flag for future actions
                            this.skipNextLayoutApplication = false;
                        }

                        this.hideLoadingProgress();
                    }, 200);

                    // Update statistics
                    this.updateStats();

                    // Resume history tracking and save final state
                    this.resumeHistory();
                    this.saveState();

                    // Reapply graph styling to preserve label appearance
                    if (window.GraphAreaEditor) {
                        if (typeof window.GraphAreaEditor.applySettingsDebounced === 'function') {
                            window.GraphAreaEditor.applySettingsDebounced();
                        } else if (typeof window.GraphAreaEditor.applySettings === 'function') {
                            window.GraphAreaEditor.applySettings();
                        }
                    }

                    // Ensure label visibility reflects current node count
                    this.updateLabelVisibility();

                    // Restore graph return node after rendering completes
                    this.insertGraphReturnNodeForStackTop();
                }
            };

            processBatch(0);

        } catch (error) {
            console.error('Error rendering graph:', error);
            if (window.UI && window.UI.showNotification) {
                window.UI.showNotification(
                    'Error rendering graph. Check console for details.',
                    'error'
                );
            }
        }
    },
    
    // Validate render data before processing
    validateRenderData: function(nodes, edges) {
        const errors = [];
        
        // Check data structure
        if (!Array.isArray(nodes)) {
            errors.push('Nodes must be an array');
        }
        if (!Array.isArray(edges)) {
            errors.push('Edges must be an array');
        }
        
        // Validate nodes
        nodes.forEach((node, index) => {
            if (!node.data || !node.data.id) {
                errors.push(`Node ${index}: Missing required data or ID`);
            }
        });
        
        // Validate edges
        edges.forEach((edge, index) => {
            if (!edge.data || !edge.data.source || !edge.data.target) {
                errors.push(`Edge ${index}: Missing required data, source, or target`);
            }
        });
        
        // Ensure edges reference existing nodes, adding defaults when needed
        edges.forEach((edge) => {
            const ensureNode = id => {
                const exists = nodes.some(node => node.data.id === id);
                if (!exists) {
                    const defaultNode = { group: 'nodes', data: { id, label: id, type: 'default' } };
                    nodes.push(defaultNode);
                }
            };

            ensureNode(edge.data.source);
            ensureNode(edge.data.target);
        });
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    },
    
    // Validate render batch before adding to graph
    validateRenderBatch: function(batch) {
        const validationConfig = window.QuantickleConfig && window.QuantickleConfig.validation;
        const validationEnabled = validationConfig ? validationConfig.enabled !== false : true;

        if (!this.currentNodeIds) {
            this.currentNodeIds = new Set();
        }

        if (!validationEnabled) {
            const validElements = [];

            const ensureNode = id => {
                if (!id || this.currentNodeIds.has(id)) {
                    return;
                }

                const nodeElement = {
                    group: 'nodes',
                    data: { id, label: id, type: 'default' }
                };
                this.currentNodeIds.add(id);
                validElements.push(nodeElement);
            };

            batch.forEach(element => {
                if (!element || typeof element !== 'object') {
                    return;
                }

                if (element.group === 'nodes' && element.data && element.data.id) {
                    this.currentNodeIds.add(element.data.id);
                    validElements.push(element);
                } else if (element.group === 'edges' && element.data) {
                    ensureNode(element.data.source);
                    ensureNode(element.data.target);
                    validElements.push(element);
                } else {
                    validElements.push(element);
                }
            });

            return {
                valid: true,
                errors: [],
                validElements
            };
        }

        if (!window.Validation ||
            !window.Validation.validators ||
            typeof window.Validation.validators.validateNode !== 'function' ||
            typeof window.Validation.validators.validateEdge !== 'function') {
            throw new Error('Validation module is missing. Load js/validation.js before rendering graphs.');
        }

        const errors = [];
        const validElements = [];

        const lenient = !!(validationConfig && validationConfig.lenientMode);

        batch.forEach((element, index) => {
            if (!element.data) {
                errors.push(`Element ${index}: Missing data`);
                return;
            }

            if (element.group === 'nodes') {
                const validation = window.Validation.validators.validateNode(element.data, lenient);
                if (!validation.valid) {
                    errors.push(...validation.errors.map(err => `Node ${index}: ${err}`));
                } else {
                    validElements.push(element);
                    this.currentNodeIds.add(element.data.id);
                }
            } else if (element.group === 'edges') {
                const validation = window.Validation.validators.validateEdge(element.data, lenient);
                if (!validation.valid) {
                    errors.push(...validation.errors.map(err => `Edge ${index}: ${err}`));
                    return;
                }

                const ensureNode = id => {
                    if (this.currentNodeIds && !this.currentNodeIds.has(id)) {
                        const defaultData = { id, label: id, type: 'default' };
                        const nodeValidation = window.Validation.validators.validateNode(defaultData, lenient);
                        if (!nodeValidation.valid) {
                            errors.push(...nodeValidation.errors.map(err => `Auto node ${id}: ${err}`));
                            return null;
                        }
                        const nodeElement = { group: 'nodes', data: defaultData };
                        validElements.push(nodeElement);
                        this.currentNodeIds.add(id);
                    }
                };

                ensureNode(element.data.source);
                ensureNode(element.data.target);
                validElements.push(element);
            } else {
                errors.push(`Element ${index}: Unknown group '${element.group}'`);
            }
        });

        return {
            valid: errors.length === 0,
            errors: errors,
            validElements: validElements
        };
    },
    
    // Validate final graph state
    validateGraphState: function() {
        const errors = [];
        
        // Check for orphaned edges
        this.cy.edges().forEach(edge => {
            const source = edge.source();
            const target = edge.target();
            
            if (!source || !target) {
                errors.push(`Edge ${edge.id()}: Missing source or target node`);
            }
        });
        
        // Check for duplicate IDs
        const nodeIds = new Set();
        this.cy.nodes().forEach(node => {
            if (nodeIds.has(node.id())) {
                errors.push(`Duplicate node ID: ${node.id()}`);
            }
            nodeIds.add(node.id());
        });
        
        const edgeIds = new Set();
        this.cy.edges().forEach(edge => {
            if (edgeIds.has(edge.id())) {
                errors.push(`Duplicate edge ID: ${edge.id()}`);
            }
            edgeIds.add(edge.id());
        });
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    },

    // Enable manual interaction with performance optimizations
    enableManualInteraction: function() {
        if (!this.cy) {
            return;
        }
        
        
        // Stop any running layout
        try {
            const currentLayoutInstance = this.cy.layout();
            if (currentLayoutInstance && currentLayoutInstance.running()) {
                currentLayoutInstance.stop();
            }
        } catch (error) {
        }
        
        // Enable dragging for all nodes
        this.cy.nodes().forEach(function(node) {
            node.grabbable(true);
        });
        
    },

    // Fit graph to viewport via modular adapter
    fitGraph: function(options = {}) {
        const bootstrap = window.GraphControlsModuleBootstrap;
        if (!bootstrap) {
            return false;
        }
        if (!bootstrap.moduleInstance && typeof bootstrap.init === 'function') {
            bootstrap.init();
        }
        if (!bootstrap.moduleInstance || typeof bootstrap.moduleInstance.fitGraph !== 'function') {
            return false;
        }
        return bootstrap.moduleInstance.fitGraph(options);
    },

    // Center graph via modular adapter
    centerGraph: function(options = {}) {
        const bootstrap = window.GraphControlsModuleBootstrap;
        if (!bootstrap) {
            return false;
        }
        if (!bootstrap.moduleInstance && typeof bootstrap.init === 'function') {
            bootstrap.init();
        }
        if (!bootstrap.moduleInstance || typeof bootstrap.moduleInstance.centerGraph !== 'function') {
            return false;
        }
        return bootstrap.moduleInstance.centerGraph(options);
    },

    // Zoom in via modular adapter
    zoomIn: function(options = {}) {
        const bootstrap = window.GraphControlsModuleBootstrap;
        if (!bootstrap) {
            return false;
        }
        if (!bootstrap.moduleInstance && typeof bootstrap.init === 'function') {
            bootstrap.init();
        }
        if (!bootstrap.moduleInstance || typeof bootstrap.moduleInstance.zoomIn !== 'function') {
            return false;
        }
        return bootstrap.moduleInstance.zoomIn(options);
    },

    // Zoom out via modular adapter
    zoomOut: function(options = {}) {
        const bootstrap = window.GraphControlsModuleBootstrap;
        if (!bootstrap) {
            return false;
        }
        if (!bootstrap.moduleInstance && typeof bootstrap.init === 'function') {
            bootstrap.init();
        }
        if (!bootstrap.moduleInstance || typeof bootstrap.moduleInstance.zoomOut !== 'function') {
            return false;
        }
        return bootstrap.moduleInstance.zoomOut(options);
    },

    // Level-of-Detail (LOD) functions
    executeLODRendering: function(graphData, lodLevel, nodeCount, edgeCount) {
        if (!graphData) {
            return { nodesToRender: [], edgesToRender: [] };
        }

        const lodSystemEnabled = !(window.LODSystem && window.LODSystem.config && window.LODSystem.config.enabled === false);

        if (!lodSystemEnabled) {
            this.currentLODLevel = 'full';
            this.labelsHiddenDueToLOD = false;
            this.updateLabelVisibility();

            return {
                nodesToRender: [...(graphData.nodes || [])],
                edgesToRender: [...(graphData.edges || [])]
            };
        }

        return this.applyLODRendering(graphData, lodLevel);
    },

    determineLODLevel: function(nodeCount, edgeCount) {
        // Check if LOD system is enabled
        if (window.LODSystem) {
            const configEnabled = window.LODSystem.config?.enabled !== false;
            const sizeDisabled = typeof window.LODSystem.isTemporarilyDisabledForSize === 'function'
                ? window.LODSystem.isTemporarilyDisabledForSize()
                : false;
            if (!configEnabled || sizeDisabled) {
                return 'full';
            }
        }

        // More aggressive LOD for better performance with large datasets
        if (nodeCount > 50000 || edgeCount > 100000) {
            return 'ultra-low';
        } else if (nodeCount > 15000 || edgeCount > 30000) {
            return 'very-low';
        } else if (nodeCount > 8000 || edgeCount > 15000) {
            return 'low';
        } else if (nodeCount > 4000 || edgeCount > 8000) {
            return 'medium';
        } else if (nodeCount > 2000 || edgeCount > 4000) {
            return 'high';
        } else {
            return 'full';
        }
    },

    _getElementDataObject: function(element) {
        if (!element) {
            return {};
        }

        if (typeof element.data === 'function') {
            const dataResult = element.data();
            return dataResult && typeof dataResult === 'object' ? dataResult : {};
        }

        if (element.data && typeof element.data === 'object') {
            return element.data;
        }

        return element;
    },

    _reconstructNodeWithData: function(originalNode, data) {
        const reconstructedData = data ? { ...data } : {};

        const ensureNodeField = (key, getter) => {
            if (reconstructedData[key] !== undefined) {
                return;
            }

            try {
                const value = getter();
                if (value !== undefined) {
                    reconstructedData[key] = value;
                }
            } catch (error) {
                // Ignore accessor errors and leave the field unset
            }
        };

        if (!originalNode) {
            return reconstructedData;
        }

        ensureNodeField('id', () => this.getNodeId(originalNode));
        ensureNodeField('label', () => this.getNodeLabel(originalNode));

        if (typeof originalNode.data === 'function') {
            const result = { ...reconstructedData };

            if (typeof originalNode.position === 'function') {
                const position = originalNode.position();
                if (position && typeof position === 'object') {
                    if (result.x === undefined && position.x !== undefined) {
                        result.x = position.x;
                    }
                    if (result.y === undefined && position.y !== undefined) {
                        result.y = position.y;
                    }
                }
            } else if (originalNode.position && typeof originalNode.position === 'object') {
                const position = originalNode.position;
                if (result.x === undefined && position.x !== undefined) {
                    result.x = position.x;
                }
                if (result.y === undefined && position.y !== undefined) {
                    result.y = position.y;
                }
            }

            const classes = typeof originalNode.classes === 'function'
                ? originalNode.classes()
                : originalNode.classes;
            if (classes && result.classes === undefined) {
                result.classes = classes;
            }

            return result;
        }

        if (originalNode.data && typeof originalNode.data === 'object') {
            return {
                ...originalNode,
                data: { ...reconstructedData }
            };
        }

        return {
            ...originalNode,
            ...reconstructedData
        };
    },

    _reconstructEdgeWithData: function(originalEdge, data) {
        const reconstructedData = data ? { ...data } : {};

        const ensureEdgeField = (key, getter) => {
            if (reconstructedData[key] !== undefined) {
                return;
            }

            try {
                const value = getter();
                if (value !== undefined) {
                    reconstructedData[key] = value;
                }
            } catch (error) {
                // Ignore accessor errors and leave the field unset
            }
        };


        if (!originalEdge) {
            return reconstructedData;
        }

        ensureEdgeField('id', () => (typeof originalEdge.id === 'function' ? originalEdge.id() : originalEdge.id));
        ensureEdgeField('source', () => this.getEdgeSource(originalEdge));
        ensureEdgeField('target', () => this.getEdgeTarget(originalEdge));
        ensureEdgeField('weight', () => this.getEdgeWeight(originalEdge));

        if (typeof originalEdge.data === 'function') {
            return { ...reconstructedData };
        }

        if (originalEdge.data && typeof originalEdge.data === 'object') {
            return {
                ...originalEdge,
                data: { ...reconstructedData }
            };
        }

        return {
            ...originalEdge,
            ...reconstructedData
        };
    },

    getNodeId: function(node) {
        if (!node) {
            return undefined;
        }

        if (typeof node.id === 'function') {
            return node.id();
        }

        const data = this._getElementDataObject(node);
        if (data && data.id !== undefined) {
            return data.id;
        }

        return node.id;
    },

    getNodeLabel: function(node) {
        const data = this._getElementDataObject(node);
        return data.label !== undefined ? data.label : this.getNodeId(node);
    },

    getEdgeSource: function(edge) {
        if (!edge) {
            return undefined;
        }

        if (typeof edge.source === 'function') {
            const sourceNode = edge.source();
            return sourceNode ? this.getNodeId(sourceNode) : undefined;
        }

        const data = this._getElementDataObject(edge);
        if (data && data.source !== undefined) {
            return data.source;
        }

        return edge.source;
    },

    getEdgeTarget: function(edge) {
        if (!edge) {
            return undefined;
        }

        if (typeof edge.target === 'function') {
            const targetNode = edge.target();
            return targetNode ? this.getNodeId(targetNode) : undefined;
        }

        const data = this._getElementDataObject(edge);
        if (data && data.target !== undefined) {
            return data.target;
        }

        return edge.target;
    },

    getEdgeWeight: function(edge) {
        const data = this._getElementDataObject(edge);
        if (!data) {
            return undefined;
        }

        const weight = data.weight;
        if (weight === undefined || weight === null) {
            return undefined;
        }

        const numericWeight = Number(weight);
        return Number.isNaN(numericWeight) ? undefined : numericWeight;
    },

    _updateNodeData: function(node, updates) {
        const data = { ...this._getElementDataObject(node), ...updates };
        return this._reconstructNodeWithData(node, data);
    },

    _updateEdgeData: function(edge, updates) {
        const data = { ...this._getElementDataObject(edge), ...updates };
        return this._reconstructEdgeWithData(edge, data);
    },

    _collectNodeDimensionPersistencePayload: function(node) {
        if (!node || typeof node.data !== 'function') {
            return null;
        }

        const payload = {};
        const numericFromData = key => {
            const raw = node.data(key);
            const parsed = typeof raw === 'number' ? raw : parseFloat(raw);
            return Number.isFinite(parsed) ? parsed : null;
        };

        const nodeType = typeof node.data === 'function' ? node.data('type') : undefined;

        const width = numericFromData('width');
        if (Number.isFinite(width) && width > 0) {
            payload.width = width;
        }

        const height = numericFromData('height');
        if (Number.isFinite(height) && height > 0) {
            payload.height = height;
        }

        const size = numericFromData('size');
        if (Number.isFinite(size) && size > 0) {
            payload.size = size;
        } else if (!Number.isFinite(size) && Number.isFinite(width) && Number.isFinite(height)) {
            const derivedSize = Math.max(width, height);
            if (derivedSize > 0) {
                payload.size = derivedSize;
            }
        }

        const aspectRatio = numericFromData('aspectRatio');
        if (Number.isFinite(aspectRatio) && aspectRatio > 0) {
            payload.aspectRatio = aspectRatio;
        }

        const textWidthMode = node.data('textWidthMode');
        if (typeof textWidthMode === 'string' && textWidthMode.trim()) {
            payload.textWidthMode = textWidthMode;
        }

        const textHeightMode = node.data('textHeightMode');
        if (typeof textHeightMode === 'string' && textHeightMode.trim()) {
            payload.textHeightMode = textHeightMode;
        }

        if (node.data('preserveAspectRatio') !== undefined) {
            payload.preserveAspectRatio = node.data('preserveAspectRatio');
        }

        const calloutScale = numericFromData('calloutScale');
        if (Number.isFinite(calloutScale) && calloutScale > 0) {
            payload.calloutScale = Math.max(0.1, Math.min(6, calloutScale));
        }

        const calloutDimensionZoom = numericFromData('calloutDimensionZoom');
        if (Number.isFinite(calloutDimensionZoom) && calloutDimensionZoom > 0) {
            payload.calloutDimensionZoom = calloutDimensionZoom;
        }

        const calloutDimensionSource = node.data('calloutDimensionSource');
        if (typeof calloutDimensionSource === 'string' && calloutDimensionSource.trim()) {
            payload.calloutDimensionSource = calloutDimensionSource;
        }

        if (nodeType === 'image') {
            const imageRequestedWidth = numericFromData('imageRequestedWidth');
            if (Number.isFinite(imageRequestedWidth) && imageRequestedWidth > 0) {
                payload.imageRequestedWidth = imageRequestedWidth;
            }
        }

        return Object.keys(payload).length > 0 ? payload : null;
    },

    _applyNodeDimensionUpdatesToGraphStore: function(graphData, nodeId, updates) {
        if (!graphData || !Array.isArray(graphData.nodes) || !nodeId || !updates) {
            return false;
        }

        for (let i = 0; i < graphData.nodes.length; i += 1) {
            const entry = graphData.nodes[i];
            if (!entry || typeof entry !== 'object') {
                continue;
            }

            const data = entry.data && typeof entry.data === 'object' ? entry.data : entry;
            if (!data || data.id !== nodeId) {
                continue;
            }

            Object.assign(data, updates);

            const width = typeof data.width === 'number' ? data.width : parseFloat(data.width);
            const height = typeof data.height === 'number' ? data.height : parseFloat(data.height);
            if (!Number.isFinite(data.size)) {
                const derived = Math.max(Number.isFinite(width) ? width : 0, Number.isFinite(height) ? height : 0);
                if (derived > 0) {
                    data.size = derived;
                }
            }

            return true;
        }

        return false;
    },

    _persistNodeDimensionData: function(node) {
        const nodeId = this.getNodeId(node);
        if (!nodeId) {
            return;
        }

        const payload = this._collectNodeDimensionPersistencePayload(node);
        if (!payload) {
            return;
        }

        if (window.GraphManager && window.GraphManager.currentGraph) {
            this._applyNodeDimensionUpdatesToGraphStore(window.GraphManager.currentGraph, nodeId, payload);
        }

        if (window.FileManager && window.FileManager.graphData) {
            this._applyNodeDimensionUpdatesToGraphStore(window.FileManager.graphData, nodeId, payload);
        }

        const dataManager = window.DataManager;
        const canUpdateDataManager = dataManager &&
            typeof dataManager.getGraphData === 'function' &&
            typeof dataManager.setGraphData === 'function';
        if (canUpdateDataManager) {
            let graphData = null;
            try {
                graphData = dataManager.getGraphData();
            } catch (error) {
                graphData = null;
            }
            if (graphData && this._applyNodeDimensionUpdatesToGraphStore(graphData, nodeId, payload)) {
                try {
                    dataManager.setGraphData(graphData, { skipLayout: true });
                } catch (error) {
                    console.warn('Failed to persist node dimensions to DataManager:', error);
                }
            }
        }
    },

    applyLODRendering: function(graphData, lodLevel) {
        // Skip LOD processing if LOD system is disabled or size-limited
        if (window.LODSystem) {
            const configEnabled = window.LODSystem.config?.enabled !== false;
            const sizeDisabled = typeof window.LODSystem.isTemporarilyDisabledForSize === 'function'
                ? window.LODSystem.isTemporarilyDisabledForSize()
                : false;

            if (!configEnabled || sizeDisabled) {
                return {
                    nodesToRender: [...graphData.nodes],
                    edgesToRender: [...graphData.edges]
                };
            }
        }

        this.currentLODLevel = lodLevel || this.currentLODLevel;
        this.updateLabelVisibility();

        const config = this.getLODConfig(lodLevel);
        let nodesToRender = [...graphData.nodes];
        let edgesToRender = [...graphData.edges];


        // Apply node sampling for large datasets
        if (config.nodeSampling < 1.0) {
            const sampleSize = Math.floor(graphData.nodes.length * config.nodeSampling);
            nodesToRender = this.sampleNodes(graphData.nodes, sampleSize, config.samplingStrategy, graphData.edges);
        }

        // Apply edge filtering
        if (config.edgeFiltering) {
            edgesToRender = this.filterEdges(graphData.edges, nodesToRender, config.edgeFiltering);
        }

        // Apply edge sampling for very large datasets
        if (config.edgeSampling < 1.0) {
            const edgeSampleSize = Math.floor(edgesToRender.length * config.edgeSampling);
            edgesToRender = this.sampleEdges(edgesToRender, edgeSampleSize);
        }

        // Apply visual simplifications
        nodesToRender = this.applyVisualSimplifications(nodesToRender, config);
        edgesToRender = this.applyEdgeSimplifications(edgesToRender, config);


        return { nodesToRender, edgesToRender };
    },

    getLODConfig: function(level) {
        const configs = {
            'ultra-low': {
                nodeSampling: 0.05,     // Show only 5% of nodes for ultra-large datasets
                samplingStrategy: 'degree', // Sample by node degree
                edgeFiltering: 'connected', // Only edges between visible nodes
                hideLabels: true,
                hideIcons: true,
                simplifyEdges: true,
                reduceOpacity: 0.2,
                hideEdges: true,        // Hide most edges
                edgeSampling: 0.1       // Show only 10% of edges
            },
            'very-low': {
                nodeSampling: 0.15,     // Show only 15% of nodes for very large datasets
                samplingStrategy: 'degree', // Sample by node degree
                edgeFiltering: 'connected',
                hideLabels: true,
                hideIcons: true,
                simplifyEdges: true,
                reduceOpacity: 0.3,
                hideEdges: false,
                edgeSampling: 0.3       // Show only 30% of edges
            },
            'low': {
                nodeSampling: 0.25,     // Show 25% of nodes
                samplingStrategy: 'degree',
                edgeFiltering: 'connected',
                hideLabels: true,
                hideIcons: false,
                simplifyEdges: true,
                reduceOpacity: 0.4,
                hideEdges: false,
                edgeSampling: 0.5       // Show 50% of edges
            },
            'medium': {
                nodeSampling: 0.5,      // Show 50% of nodes
                samplingStrategy: 'random',
                edgeFiltering: 'connected',
                hideLabels: false,
                hideIcons: false,
                simplifyEdges: false,
                reduceOpacity: 0.6,
                hideEdges: false,
                edgeSampling: 0.7       // Show 70% of edges
            },
            'high': {
                nodeSampling: 0.75,     // Show 75% of nodes
                samplingStrategy: 'random',
                edgeFiltering: 'connected',
                hideLabels: false,
                hideIcons: false,
                simplifyEdges: false,
                reduceOpacity: 0.8,
                hideEdges: false,
                edgeSampling: 0.9       // Show 90% of edges
            },
            'full': {
                nodeSampling: 1.0,
                samplingStrategy: 'none',
                edgeFiltering: 'none',
                hideLabels: false,
                hideIcons: false,
                simplifyEdges: false,
                reduceOpacity: 1.0,
                hideEdges: false,
                edgeSampling: 1.0
            }
        };

        return configs[level] || configs['medium'];
    },

    sampleNodes: function(nodes, sampleSize, strategy, allEdges) {
        if (strategy === 'degree') {
            // Sample nodes with highest degree (most connected)
            const nodesWithDegree = nodes.map(node => ({
                node: node,
                degree: this.calculateNodeDegree(node, nodes, allEdges)
            }));
            
            nodesWithDegree.sort((a, b) => b.degree - a.degree);
            return nodesWithDegree.slice(0, sampleSize).map(item => item.node);
        } else if (strategy === 'random') {
            // Random sampling
            const shuffled = [...nodes].sort(() => 0.5 - Math.random());
            return shuffled.slice(0, sampleSize);
        } else {
            // No sampling
            return nodes;
        }
    },

    calculateNodeDegree: function(node, allNodes, allEdges) {
        // Calculate degree based on connected edges
        const nodeId = this.getNodeId(node);
        let degree = 0;

        // Count edges connected to this node
        if (allEdges) {
            allEdges.forEach(edge => {
                const sourceId = this.getEdgeSource(edge);
                const targetId = this.getEdgeTarget(edge);
                if (sourceId === nodeId || targetId === nodeId) {
                    degree++;
                }
            });
        }

        // Fallback to random degree if no edges available
        if (degree === 0) {
            degree = Math.random() * 5;
        }
        
        return degree;
    },

    filterEdges: function(edges, visibleNodes, strategy) {
        if (strategy === 'connected') {
            const visibleNodeIds = new Set(visibleNodes.map(node => this.getNodeId(node)).filter(id => id !== undefined));
            return edges.filter(edge => {
                const sourceId = this.getEdgeSource(edge);
                const targetId = this.getEdgeTarget(edge);
                return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
            });
        } else if (strategy === 'weight') {
            // Filter by edge weight (if available)
            return edges.filter(edge => {
                const weight = this.getEdgeWeight(edge);
                const effectiveWeight = weight === undefined ? 1 : weight;
                return effectiveWeight > 0.5; // Only show edges with weight > 0.5
            });
        } else {
            return edges;
        }
    },

    applyVisualSimplifications: function(nodes, config) {
        return nodes.map(node => {
            const updates = {};

            if (config.hideLabels) {
                updates.label = '';
            }

            if (config.hideIcons) {
                updates.icon = '';
                updates.backgroundImage = 'none';
                updates.iconHiddenDueToLOD = true;
            }

            if (config.reduceOpacity < 1.0) {
                updates.opacity = config.reduceOpacity;
            }

            if (Object.keys(updates).length === 0) {
                return node;
            }

            return this._updateNodeData(node, updates);
        });
    },

    applyEdgeSimplifications: function(edges, config) {
        return edges.map(edge => {
            const updates = {};

            if (config.simplifyEdges) {
                updates.width = 1;
            }

            if (config.reduceOpacity < 1.0) {
                updates.opacity = config.reduceOpacity;
            }

            if (Object.keys(updates).length === 0) {
                return edge;
            }

            return this._updateEdgeData(edge, updates);
        });
    },

    // Sample edges for LOD rendering
    sampleEdges: function(edges, sampleSize) {
        // Sample edges by weight (if available) or randomly
        const edgesWithWeight = edges.map(edge => ({
            edge: edge,
            weight: this.getEdgeWeight(edge) ?? Math.random()
        }));
        
        // Sort by weight (highest first)
        edgesWithWeight.sort((a, b) => b.weight - a.weight);
        
        // Return top edges
        return edgesWithWeight.slice(0, sampleSize).map(item => item.edge);
    },

    // Apply aggressive LOD for poor performance
    applyAggressiveLOD: function() {
        if (!this.cy) return;
        
        
        // Hide all labels
        this.cy.nodes().forEach(node => {
            node.style('label', '');
            node.style('opacity', 0.4);

            const currentWidth = node.width();
            const currentHeight = node.height();

            node.style('width', Math.max(2, currentWidth * 0.7));
            node.style('height', Math.max(2, currentHeight * 0.7));
        });
        
        // Hide most edges
        this.cy.edges().forEach(edge => {
            edge.style('opacity', 0.2);
            edge.style('width', 0.5);
        });
        
        // Hide 80% of edges randomly
        const allEdges = this.cy.edges();
        const edgesToHide = allEdges.slice(0, Math.floor(allEdges.length * 0.8));
        edgesToHide.forEach(edge => {
            edge.style('display', 'none');
        });
        
    },

    // Update performance indicator in UI - DISABLED
    updatePerformanceIndicator: function(fps, nodeCount, edgeCount) {
        // Performance indicator disabled - do nothing
        return;
    },

    // Enhanced LOD system with hierarchical clustering
    adjustLODForZoom: function() {
        if (!this.cy) return;
        
        // Skip LOD adjustment if we're in the middle of a custom operation
        if (this.isCustomZooming) {
            return;
        }
        
        const zoom = this.cy.zoom();
        const nodeCount = this.cy.nodes().length;

        // Skip LOD adjustment entirely when under the activation threshold
        const lodTemporarilyDisabled = window.LODSystem && typeof window.LODSystem.isTemporarilyDisabledForSize === 'function'
            ? window.LODSystem.isTemporarilyDisabledForSize()
            : false;

        if (nodeCount < 10000 || lodTemporarilyDisabled) {
            return;
        }
        
        
        // Initialize hierarchical clustering if not done
        if (!this.hierarchicalClusters) {
            this.buildHierarchicalClusters();
        }
        
        // Determine LOD level based on zoom and node count
        let lodLevel = this.determineLODLevel(zoom, nodeCount);
        
        // Apply appropriate LOD level
        this.applyLODLevel(lodLevel);
        
        // Update performance indicator
        this.updatePerformanceIndicator(this.lastFPS || 60, nodeCount, this.cy.edges().length);
    },

    // Build hierarchical clusters for LOD system
    buildHierarchicalClusters: function() {
        if (!this.cy) return;
        
        
        const nodes = this.cy.nodes();
        const edges = this.cy.edges();

        const lodTemporarilyDisabled = window.LODSystem && typeof window.LODSystem.isTemporarilyDisabledForSize === 'function'
            ? window.LODSystem.isTemporarilyDisabledForSize()
            : false;

        if (nodes.length < 10000 || lodTemporarilyDisabled) {
            this.hierarchicalClusters = null;
            return;
        }
        
        // Create spatial clusters using quad-tree
        this.hierarchicalClusters = {
            levels: [],
            nodeToCluster: new Map(),
            clusterToNodes: new Map()
        };
        
        // Level 1: Spatial clustering (coarse)
        const level1Clusters = this.createSpatialClusters(nodes, 100);
        
        // Level 2: Connectivity clustering (medium)
        const level2Clusters = this.createConnectivityClusters(nodes, edges, 50);
        
        // Level 3: Type-based clustering (fine)
        const level3Clusters = this.createTypeClusters(nodes, 25);
        
        this.hierarchicalClusters.levels = [
            { name: 'coarse', clusters: level1Clusters, threshold: 0.3 },
            { name: 'medium', clusters: level2Clusters, threshold: 0.6 },
            { name: 'fine', clusters: level3Clusters, threshold: 1.0 }
        ];
        
        // Build lookup maps
        const globalDefaultColor = window.QuantickleConfig?.defaultNodeColor || '#ffffff';
        nodes.forEach(node => {
            const nodeId = node.id();
            this.hierarchicalClusters.nodeToCluster.set(nodeId, {
                level1: this.findClusterForNode(node, level1Clusters),
                level2: this.findClusterForNode(node, level2Clusters),
                level3: this.findClusterForNode(node, level3Clusters)
            });
        });
        
    },

    // Create spatial clusters using quad-tree
    createSpatialClusters: function(nodes, maxClusterSize) {
        const clusters = [];
        const positions = nodes.map(node => ({
            id: node.id(),
            x: node.position('x'),
            y: node.position('y'),
            node: node
        }));
        
        // Simple grid-based spatial clustering
        const gridSize = 200;
        const grid = new Map();
        
        positions.forEach(pos => {
            const gridX = Math.floor(pos.x / gridSize);
            const gridY = Math.floor(pos.y / gridSize);
            const key = `${gridX},${gridY}`;
            
            if (!grid.has(key)) {
                grid.set(key, []);
            }
            grid.get(key).push(pos);
        });
        
        // Convert grid cells to clusters
        grid.forEach((cellNodes, key) => {
            if (cellNodes.length > 0) {
                const cluster = {
                    id: `spatial_${key}`,
                    type: 'spatial',
                    nodes: cellNodes.map(n => n.node),
                    center: this.calculateClusterCenter(cellNodes),
                    size: cellNodes.length,
                    representative: this.selectClusterRepresentative(cellNodes)
                };
                clusters.push(cluster);
            }
        });
        
        return clusters;
    },

    // Create connectivity-based clusters
    createConnectivityClusters: function(nodes, edges, maxClusterSize) {
        const clusters = [];
        const visited = new Set();
        
        // Use connected components as clusters
        nodes.forEach(node => {
            if (visited.has(node.id())) return;
            
            const component = this.findConnectedComponent(node, visited);
            if (component.length > 0) {
                const cluster = {
                    id: `connectivity_${clusters.length}`,
                    type: 'connectivity',
                    nodes: component,
                    center: this.calculateClusterCenter(component.map(n => ({ x: n.position('x'), y: n.position('y') }))),
                    size: component.length,
                    representative: this.selectClusterRepresentative(component.map(n => ({ node: n })))
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
                    center: this.calculateClusterCenter(typeNodes.map(n => ({ x: n.position('x'), y: n.position('y') }))),
                    size: typeNodes.length,
                    representative: this.selectClusterRepresentative(typeNodes.map(n => ({ node: n })))
                };
                clusters.push(cluster);
            }
        });
        
        return clusters;
    },

    // Find connected component for a node
    findConnectedComponent: function(startNode, visited) {
        const component = [];
        const queue = [startNode];
        
        while (queue.length > 0) {
            const node = queue.shift();
            if (visited.has(node.id())) continue;
            
            visited.add(node.id());
            component.push(node);
            
            // Add connected nodes to queue
            node.connectedNodes().forEach(connectedNode => {
                if (!visited.has(connectedNode.id())) {
                    queue.push(connectedNode);
                }
            });
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

    // Find which cluster a node belongs to
    findClusterForNode: function(node, clusters) {
        for (const cluster of clusters) {
            if (cluster.nodes.some(n => n.id() === node.id())) {
                return cluster;
            }
        }
        return null;
    },

    // Determine appropriate LOD level based on zoom and node count
    determineLODLevel: function(zoom, nodeCount) {
        // High zoom = more detail, low zoom = less detail
        if (zoom < 0.3) {
            return 'coarse';
        } else if (zoom < 0.7) {
            return 'medium';
        } else {
            return 'fine';
        }
    },

    // Apply LOD level to the graph
    applyLODLevel: function(level) {
        if (!this.cy || !this.hierarchicalClusters) return;
        
        
        const levelData = this.hierarchicalClusters.levels.find(l => l.name === level);
        if (!levelData) return;

        this.currentLODLevel = level;
        this.updateLabelVisibility();

        const nodes = this.cy.nodes();
        const edges = this.cy.edges();
        
        // Apply visual simplifications based on level
        switch (level) {
            case 'coarse':
                this.applyCoarseLOD(nodes, edges, levelData);
                break;
            case 'medium':
                this.applyMediumLOD(nodes, edges, levelData);
                break;
            case 'fine':
                this.applyFineLOD(nodes, edges, levelData);
                break;
        }
    },

    // Apply coarse LOD (zoomed out)
    applyCoarseLOD: function(nodes, edges, levelData) {
        // Show only cluster representatives
        nodes.forEach(node => {
            const isRepresentative = levelData.clusters.some(cluster => 
                cluster.representative && 
                typeof cluster.representative.id === 'function' && 
                cluster.representative.id() === node.id()
            );
            
            if (isRepresentative) {
                // Show representative nodes prominently
                node.style({
                    'width': 20,
                    'height': 20,
                    'font-size': 12,
                    'opacity': 1,
                    'z-index': 1000
                });
            } else {
                // Hide non-representative nodes
                node.style({
                    'opacity': 0.1,
                    'width': 5,
                    'height': 5,
                    'text-opacity': 0,
                    'z-index': 1
                });
            }
        });
        
        // Simplify edges - show only inter-cluster connections
        edges.forEach(edge => {
            const source = edge.source();
            const target = edge.target();
            const sourceCluster = this.findClusterForNode(source, levelData.clusters);
            const targetCluster = this.findClusterForNode(target, levelData.clusters);
            
            if (sourceCluster && targetCluster && sourceCluster.id !== targetCluster.id) {
                // Show inter-cluster edges
                edge.style({
                    'opacity': 0.6,
                    'width': 2,
                    'z-index': 500
                });
            } else {
                // Hide intra-cluster edges
                edge.style({
                    'opacity': 0.1,
                    'width': 0.5,
                    'z-index': 1
                });
            }
        });
    },

    // Apply medium LOD (medium zoom)
    applyMediumLOD: function(nodes, edges, levelData) {
        // Show more nodes but with reduced detail
        nodes.forEach(node => {
            const isRepresentative = levelData.clusters.some(cluster => 
                cluster.representative && 
                typeof cluster.representative.id === 'function' && 
                cluster.representative.id() === node.id()
            );
            
            if (isRepresentative) {
                // Show representative nodes with full detail
                const nodeSize = node.data('size') || 30;
                node.style({
                    'width': nodeSize,
                    'height': nodeSize,
                    'font-size': 10,
                    'opacity': 1,
                    'z-index': 1000
                });
            } else {
                // Show other nodes with reduced detail
                node.style({
                    'opacity': 0.7,
                    'width': 8,
                    'height': 8,
                    'text-opacity': 0,
                    'z-index': 100
                });
            }
        });
        
        // Show more edges but with reduced opacity
        edges.forEach(edge => {
            edge.style({
                'opacity': 0.4,
                'width': 1,
                'z-index': 50
            });
        });
    },

    // Apply fine LOD (zoomed in)
    applyFineLOD: function(nodes, edges, levelData) {
        // Show all nodes with full detail
        nodes.forEach(node => {
            const nodeSize = node.data('size') || 30;
            node.style({
                'width': nodeSize,
                'height': nodeSize,
                'text-opacity': 1,
                'font-size': 10,
                'opacity': 1,
                'z-index': 100
            });
        });
        
        // Show all edges with full detail
        edges.forEach(edge => {
            edge.style({
                'opacity': 0.9,
                'width': 1,
                'z-index': 50
            });
        });
    },

    // Box selection functionality
    setupBoxSelection: function() {
        if (!this.cy) {
            return;
        }
        
        // Check container CSS
        const container = this.cy.container();
        if (container) {
            const computedStyle = window.getComputedStyle(container);
            
            // Check parent containers too
            let parent = container.parentElement;
            let level = 0;
            while (parent && level < 5) {
                const parentStyle = window.getComputedStyle(parent);
                parent = parent.parentElement;
                level++;
            }
        }

        let isSelecting = false;
        let startPos = null;
        let selectionBox = null;
        let hasMoved = false;
        let selectionAction = null; // 'select' or 'contain'

        // Create selection box element
        const createSelectionBox = () => {
            const box = document.createElement('div');
            box.id = 'selection-box';
            box.style.cssText = `
                position: fixed;
                border: 2px dashed #667eea;
                background: rgba(102, 126, 234, 0.1);
                pointer-events: none;
                z-index: 1000;
                display: none;
            `;
            // Append to body for fixed positioning
            document.body.appendChild(box);
            return box;
        };

        // Get selection box or create it
        const getSelectionBox = () => {
            let box = document.getElementById('selection-box');
            if (!box) {
                box = createSelectionBox();
            }
            return box;
        };

        /*
        if (!this.cy) {
            return;
        }
        
        // Check container CSS
        const container = this.cy.container();
        if (container) {
            const computedStyle = window.getComputedStyle(container);
            
            // Check parent containers too
            let parent = container.parentElement;
            let level = 0;
            while (parent && level < 5) {
                const parentStyle = window.getComputedStyle(parent);
                parent = parent.parentElement;
                level++;
            }
        }

        let isSelecting = false;
        let startPos = null;
        let selectionBox = null;
        let hasMoved = false;

        // Create selection box element
        const createSelectionBox = () => {
            const box = document.createElement('div');
            box.id = 'selection-box';
            box.style.cssText = `
                position: fixed;
                border: 2px dashed #667eea;
                background: rgba(102, 126, 234, 0.1);
                pointer-events: none;
                z-index: 1000;
                display: none;
            `;
            // Append to body for fixed positioning
            document.body.appendChild(box);
            return box;
        };

        // Get selection box or create it
        const getSelectionBox = () => {
            let box = document.getElementById('selection-box');
            if (!box) {
                box = createSelectionBox();
            }
            return box;
        };
        */

        this.cy.on('mousedown', (evt) => {
            // Skip custom selection when resizing nodes
            if (this.nodeResizeState || this.nodeResizeHoverOnEdge) {
                this.debugSelection('Skipping selection start due to ongoing resize');
                return;
            }

            // Only start selection if clicking on background and holding Shift or Alt
            if (evt.target === this.cy && (evt.originalEvent.shiftKey || evt.originalEvent.altKey)) {
                selectionAction = evt.originalEvent.altKey ? 'contain' : 'select';
                this.debugSelection('Selection start', { action: selectionAction, x: evt.originalEvent.clientX, y: evt.originalEvent.clientY });
                // Prevent default panning behavior
                evt.preventDefault();
                evt.stopPropagation();
                evt.originalEvent.preventDefault();
                evt.originalEvent.stopPropagation();

                // Temporarily disable Cytoscape panning and zooming
                this.cy.userPanningEnabled(false);
                this.cy.userZoomingEnabled(false);

                isSelecting = true;
                hasMoved = false;

                // Use fixed screen coordinates
                startPos = {
                    x: evt.originalEvent.clientX,
                    y: evt.originalEvent.clientY
                };

                const box = getSelectionBox();
                box.style.display = 'block';
                box.style.left = startPos.x + 'px';
                box.style.top = startPos.y + 'px';
                box.style.width = '0px';
                box.style.height = '0px';
            }
        });

        this.cy.on('mousemove', (evt) => {
            if (isSelecting) {
                this.debugSelection('Selection move', { x: evt.originalEvent.clientX, y: evt.originalEvent.clientY });
            }

            if (!isSelecting || !startPos) return;
            

            // Prevent panning during selection
            evt.preventDefault();
            evt.stopPropagation();
            evt.originalEvent.preventDefault();
            evt.originalEvent.stopPropagation();

            hasMoved = true;
            
            // Use fixed screen coordinates
            const currentPos = {
                x: evt.originalEvent.clientX,
                y: evt.originalEvent.clientY
            };
            
            const box = getSelectionBox();

            // Calculate box dimensions
            const left = Math.min(startPos.x, currentPos.x);
            const top = Math.min(startPos.y, currentPos.y);
            const width = Math.abs(currentPos.x - startPos.x);
            const height = Math.abs(currentPos.y - startPos.y);

            // Update box position and size
            box.style.left = left + 'px';
            box.style.top = top + 'px';
            box.style.width = width + 'px';
            box.style.height = height + 'px';
        });


        this.cy.on('mouseup', (evt) => {

            if (!isSelecting) {
                return;
            }

            this.debugSelection('Selection end', { x: evt.originalEvent.clientX, y: evt.originalEvent.clientY });

            // Prevent default behavior
            evt.preventDefault();
            evt.stopPropagation();
            evt.originalEvent.preventDefault();
            evt.originalEvent.stopPropagation();

            // Re-enable Cytoscape panning but keep custom zooming
            this.cy.userPanningEnabled(true);
            // Keep zoom disabled - we use custom zoom implementation
            this.cy.userZoomingEnabled(false);

            isSelecting = false;
            const box = getSelectionBox();
            box.style.display = 'none';

            if (!startPos || !hasMoved) {
                this.debugSelection('Selection cancelled - no movement');
                startPos = null;
                selectionAction = null;
                return;
            }

            // Use fixed screen coordinates
            const currentPos = {
                x: evt.originalEvent.clientX,
                y: evt.originalEvent.clientY
            };
            
            // Calculate selection area
            const left = Math.min(startPos.x, currentPos.x);
            const top = Math.min(startPos.y, currentPos.y);
            const right = Math.max(startPos.x, currentPos.x);
            const bottom = Math.max(startPos.y, currentPos.y);

            // Use Cytoscape's built-in coordinate conversion for accurate node selection
            const cyContainer = this.cy.container();
            const rect = cyContainer.getBoundingClientRect();
            
            // Select nodes within the box using absolute screen coordinates for both
            const selectedNodes = this.cy.nodes().filter(node => {
                // Get the node's absolute screen position using Cytoscape's renderedPosition
                const nodeRenderedPos = node.renderedPosition();

                // Convert rendered position to absolute screen coordinates
                const nodeScreenX = nodeRenderedPos.x + rect.left;
                const nodeScreenY = nodeRenderedPos.y + rect.top;

                // Determine node size tolerances in screen pixels
                const renderedWidth = typeof node.renderedWidth === 'function' ? node.renderedWidth() : null;
                const renderedHeight = typeof node.renderedHeight === 'function' ? node.renderedHeight() : null;
                const fallbackWidth = (node.width ? node.width() : 30) * this.cy.zoom();
                const fallbackHeight = (node.height ? node.height() : 30) * this.cy.zoom();
                const baseToleranceX = renderedWidth && Number.isFinite(renderedWidth) ? renderedWidth / 2 : fallbackWidth / 2;
                const baseToleranceY = renderedHeight && Number.isFinite(renderedHeight) ? renderedHeight / 2 : fallbackHeight / 2;
                const toleranceX = Math.min(20, Math.max(baseToleranceX, 6));
                const toleranceY = Math.min(20, Math.max(baseToleranceY, 6));

                // Check if the node (roughly) fits within the selection box bounds on each axis
                const withinX = (nodeScreenX - toleranceX) >= left && (nodeScreenX + toleranceX) <= right;
                const withinY = (nodeScreenY - toleranceY) >= top && (nodeScreenY + toleranceY) <= bottom;

                return withinX && withinY;
            });

            this.debugSelection('Nodes within selection box', selectedNodes.map(n => n.id()), 'action', selectionAction);

            // Act on selected nodes based on drag action
            if (selectedNodes.length > 0) {

                if (selectionAction === 'contain') {
                    const bb = selectedNodes.boundingBox();
                    const padding = 40;
                    const centerX = bb.x1 + bb.w / 2;
                    const centerY = bb.y1 + bb.h / 2;
                    const width = bb.w + padding;
                    const height = bb.h + padding;
                    const containerNode = window.GraphEditorAdapter && window.GraphEditorAdapter.addContainer
                        ? window.GraphEditorAdapter.addContainer(centerX, centerY, { width, height })
                        : null;
                    if (containerNode) {
                        this.moveNodesIntoContainer(selectedNodes, containerNode);
                        this.debugSelection('Selecting newly created container', containerNode.id());
                        containerNode.select();
                        if (window.UI && window.UI.showNotification) {
                            window.UI.showNotification(
                                `Created container with ${selectedNodes.length} nodes`,
                                'success',
                                2000
                            );
                        }
                    }
                } else {
                    this.debugSelection('Selecting nodes via selection box', selectedNodes.map(n => n.id()));
                    selectedNodes.select();
                }
            }

            startPos = null;
            hasMoved = false;
            selectionAction = null;
            this.debugSelection('Selection reset');
        });

        // Handle escape key to cancel selection
        document.addEventListener('keydown', (evt) => {
            if (evt.key === 'Escape' && isSelecting) {
                this.debugSelection('Selection cancelled via Escape key');
                // Re-enable Cytoscape panning but keep custom zooming
                this.cy.userPanningEnabled(true);
                // Keep zoom disabled - we use custom zoom implementation
                this.cy.userZoomingEnabled(false);

                isSelecting = false;
                startPos = null;
                hasMoved = false;
                selectionAction = null;
                const box = getSelectionBox();
                box.style.display = 'none';
            }
        });

        // Handle mouse leave to cancel selection
        this.cy.on('mouseleave', () => {
            if (isSelecting) {
                this.debugSelection('Selection cancelled via mouse leave');
                // Re-enable Cytoscape panning but keep custom zooming
                this.cy.userPanningEnabled(true);
                // Keep zoom disabled - we use custom zoom implementation
                this.cy.userZoomingEnabled(false);

                isSelecting = false;
                startPos = null;
                hasMoved = false;
                selectionAction = null;
                const box = getSelectionBox();
                box.style.display = 'none';
            }
        });
    },

    // Get selected nodes count
    getSelectedNodesCount: function() {
        if (!this.cy) return 0;
        return this.cy.nodes(':selected').length;
    },

    // Get selected nodes
    getSelectedNodes: function() {
        if (!this.cy) return [];
        return this.cy.nodes(':selected');
    },

    // Clear all selections
    clearSelection: function() {
        if (!this.cy) return;
        this.debugSelection('Clearing all selections');
        this.cy.elements().unselect();
    },

    // Select nodes by type
    selectNodesByType: function(type) {
        if (!this.cy) return;
        const nodes = this.cy.nodes(`[type = "${type}"]`);
        this.debugSelection(`Selecting nodes by type`, type, nodes.map(n => n.id()));
        nodes.select();
        this.focusGraphContainer('type selection');
        return nodes.length;
    },

    // Ensure the Cytoscape container gains focus for keyboard shortcuts
    focusGraphContainer: function(context = 'graph interaction') {
        const container = typeof this.cy?.container === 'function' ? this.cy.container() : null;
        if (!container) {
            return false;
        }

        if (!container.hasAttribute('tabindex')) {
            container.setAttribute('tabindex', '0');
        }

        const focusOptions = { preventScroll: true };
        const attemptFocus = () => {
            try {
                container.focus(focusOptions);
            } catch (focusError) {
                console.warn(`[GraphRenderer] Unable to focus graph container after ${context}`, focusError);
            }
        };

        attemptFocus();

        if (document.activeElement !== container) {
            requestAnimationFrame(() => {
                if (document.activeElement !== container) {
                    attemptFocus();
                }
            });
        }

        return document.activeElement === container;
    },

    // Invert selection
    invertSelection: function() {
        if (!this.cy) return;
        const selected = this.cy.nodes(':selected');
        const unselected = this.cy.nodes(':unselected');

        this.debugSelection('Inverting selection', { selected: selected.map(n => n.id()), unselected: unselected.map(n => n.id()) });
        selected.unselect();
        unselected.select();

        return unselected.length;
    },

    // Toggle selection mode
    toggleSelectionMode: function() {
        this.selectionMode = !this.selectionMode;
        this.debugSelection('Toggling selection mode', this.selectionMode);
        
        if (this.selectionMode) {
            // Disable panning when in selection mode
            this.cy.userPanningEnabled(false);
            this.cy.userZoomingEnabled(false);
        } else {
            // Re-enable panning when exiting selection mode but keep custom zooming
            this.cy.userPanningEnabled(true);
            // Keep zoom disabled - we use custom zoom implementation
            this.cy.userZoomingEnabled(false);
        }
        
        return this.selectionMode;
    },

    // Enable selection mode
    enableSelectionMode: function() {
        this.selectionMode = true;
        this.debugSelection('Enabling selection mode');
        if (this.cy) {
            this.cy.userPanningEnabled(false);
            this.cy.userZoomingEnabled(false);
        }
    },

    // Disable selection mode
    disableSelectionMode: function() {
        this.selectionMode = false;
        this.debugSelection('Disabling selection mode');
        if (this.cy) {
            this.cy.userPanningEnabled(true);
            // Keep zoom disabled - we use custom zoom implementation
            this.cy.userZoomingEnabled(false);
        }
    },

    // Glow effect management
    glowEnabled: false,

    // Toggle glow effect on all nodes
    toggleGlowEffect: function() {
        this.glowEnabled = !this.glowEnabled;
        
        if (this.glowEnabled) {
            this.applyGlowEffect();
        } else {
            this.removeGlowEffect();
        }
        
        return this.glowEnabled;
    },

    // Apply glow effect to all nodes
    applyGlowEffect: function() {
        if (!this.cy) {
            console.error('No Cytoscape instance found!');
            return;
        }
        
        const nodes = this.cy.nodes();
        
        if (nodes.length === 0) {
            return;
        }
        
        // Check if depth effects are active
        const depthEffectsActive = window.GlobeLayout3D && window.GlobeLayout3D.config && window.GlobeLayout3D.config.depthEffect;
        
        const defaultNodeColor = window.QuantickleConfig?.defaultNodeColor || '#ffffff';
        nodes.forEach((node, index) => {
            const color = node.data('color') || defaultNodeColor;
            const size = node.data('size') || 20;
            
            // Create a subtle glow effect using border and background
            let glowColor = this.adjustColorBrightness(color, 1.3); // Make glow slightly brighter
            
            // If depth effects are active, make the glow lighter to match the fogging
            if (depthEffectsActive) {
                glowColor = this.adjustColorBrightness(color, 1.8); // Make glow much brighter for depth effect
            }
            
            
            // Use border to create a glow-like effect
            node.style({
                'border-width': 3,
                'border-color': glowColor,
                'border-opacity': 0.6,
                'background-color': color,
                'width': size,
                'height': size
            });
        });
        
    },

    // Remove glow effect from all nodes
    removeGlowEffect: function() {
        if (!this.cy) return;
        
        const nodes = this.cy.nodes();
        const defaultNodeColor = window.QuantickleConfig?.defaultNodeColor || '#ffffff';
        nodes.forEach(node => {
            const color = node.data('color') || defaultNodeColor;
            const size = node.data('size') || 20;

            // Restore original styling and keep container borders
            const isContainer = node.hasClass && node.hasClass('container');
            node.style({
                'border-width': isContainer ? 1 : 0,
                'border-color': '#000000',
                'border-opacity': 1,
                'background-color': color,
                'width': size,
                'height': size
            });
        });
        
    },

    // Adjust color brightness for glow effect
    adjustColorBrightness: function(color, factor) {
        // Convert hex to RGB
        const hex = color.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        
        // Adjust brightness
        const newR = Math.min(255, Math.round(r * factor));
        const newG = Math.min(255, Math.round(g * factor));
        const newB = Math.min(255, Math.round(b * factor));
        
        // Convert back to hex
        return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
    },

    // Handle shift-click for edge creation
    handleShiftClick: function(node) {
        if (!this.edgeCreationMode) {
            // Check if we have multiple selected nodes
            const selectedNodes = this.cy.nodes(':selected');
            if (selectedNodes.length > 1 && selectedNodes.contains(node)) {
                // Start group-to-one edge creation mode (many sources to one target)
                this.startGroupEdgeCreation(selectedNodes, node);
            } else {
                // Start single edge creation mode
            this.startEdgeCreation(node);
            }
        } else {
            // Complete edge creation (works for both single and group modes)
            this.completeEdgeCreation(node);
        }
    },

    // Start edge creation mode
    startEdgeCreation: function(sourceNode) {
        this.edgeCreationMode = true;
        this.edgeSourceNode = sourceNode;
        
        // Disable node dragging but keep clicks enabled
        this.cy.autoungrabify(true);
        
        // Highlight the source node
        sourceNode.style({
            'border-width': 4,
            'border-color': '#00ff00',
            'border-opacity': 0.8
        });
        
        // Show visual feedback
        if (window.UI) {
            window.UI.showNotification(`Click another node to create edge from "${sourceNode.data('label')}" (Press ESC to cancel)`, 'info');
        }
        
        // Add visual indicator to the graph container
        this.showEdgeCreationIndicator();
        
    },

    // Start group edge creation mode
    startGroupEdgeCreation: function(sourceNodes, clickedNode) {
        this.edgeCreationMode = true;
        this.edgeSourceNodes = sourceNodes;
        this.edgeSourceNode = clickedNode; // Keep for compatibility
        
        // Disable node dragging but keep clicks enabled
        this.cy.autoungrabify(true);
        
        // Highlight all source nodes
        sourceNodes.forEach(node => {
            node.style({
                'border-width': 4,
                'border-color': '#00ff00',
                'border-opacity': 0.8
            });
        });
        
        // Show visual feedback
        if (window.UI) {
            window.UI.showNotification(`Click target node to create edges from ${sourceNodes.length} selected nodes (Press ESC to cancel)`, 'info');
        }
        
        // Add visual indicator to the graph container
        this.showGroupEdgeCreationIndicator(sourceNodes.length);
        
    },



    // Complete edge creation
    completeEdgeCreation: function(targetNode) {
        if (this.edgeSourceNodes) {
            // Group edge creation mode
            this.completeGroupEdgeCreation(targetNode);
        } else {
            // Single edge creation mode
            this.completeSingleEdgeCreation(targetNode);
        }
    },

    // Complete single edge creation
    completeSingleEdgeCreation: function(targetNode) {
        if (!this.edgeSourceNode || this.edgeSourceNode.id() === targetNode.id()) {
            // Cancel if same node or no source
            this.cancelEdgeCreation();
            return;
        }
        
        const sourceId = this.edgeSourceNode.id();
        const targetId = targetNode.id();
        const sourceLabel = this.edgeSourceNode.data('label');
        const targetLabel = targetNode.data('label');

        // Create the edge
        const edgeId = `edge_${sourceId}_${targetId}_${Date.now()}`;
        const edge = this.cy.add({
            group: 'edges',
            data: {
                id: edgeId,
                source: sourceId,
                target: targetId,
                label: `${sourceLabel} → ${targetLabel}`
            }
        });

        // Reset edge creation mode
        this.resetEdgeCreationMode();
        this.hideEdgeCreationIndicator();

        // Show success message
        if (window.UI) {
            window.UI.showNotification(`Created edge: ${sourceLabel} → ${targetLabel}`, 'success');
        }

    },

    // Complete group edge creation
    completeGroupEdgeCreation: function(targetNode) {
        if (!this.edgeSourceNodes || this.edgeSourceNodes.length === 0) {
            this.cancelEdgeCreation();
            return;
        }

        let createdEdges = 0;
        const timestamp = Date.now();
        
        // Create edges from each source node to the target
        this.edgeSourceNodes.forEach((sourceNode, index) => {
            // Skip if trying to connect node to itself
            if (sourceNode.id() === targetNode.id()) {
                return;
            }
            
            // Check if edge already exists
            const existingEdge = this.cy.edges().filter(edge => 
                edge.source().id() === sourceNode.id() && edge.target().id() === targetNode.id()
            );
            
            if (existingEdge.length === 0) {
                const edgeId = `edge_${sourceNode.id()}_${targetNode.id()}_${timestamp}_${index}`;
                this.cy.add({
                    group: 'edges',
                    data: {
                        id: edgeId,
                        source: sourceNode.id(),
                        target: targetNode.id(),
                        label: `${sourceNode.data('label')} → ${targetNode.data('label')}`
                    }
                });
                createdEdges++;
            }
        });
        
        // Reset edge creation mode
        this.resetEdgeCreationMode();
        this.hideEdgeCreationIndicator();
        
        // Show success message
        if (window.UI) {
            window.UI.showNotification(`Created ${createdEdges} edges to "${targetNode.data('label')}"`, 'success');
        }
        
    },



    // Cancel edge creation
    cancelEdgeCreation: function() {
        if (this.edgeSourceNode) {
            // Reset source node styling and keep container borders
            const isContainer = this.edgeSourceNode.hasClass && this.edgeSourceNode.hasClass('container');
            this.edgeSourceNode.style({
                'border-width': isContainer ? 1 : 0,
                'border-color': '#000000',
                'border-opacity': 1
            });
        }
        

        
        this.resetEdgeCreationMode();
        this.hideEdgeCreationIndicator();
        
        if (window.UI) {
            window.UI.showNotification('Edge creation cancelled', 'info');
        }
        
    },

    // Reset edge creation mode
    resetEdgeCreationMode: function() {
        this.edgeCreationMode = false;
        this.edgeSourceNode = null;
        this.edgeSourceNodes = null;
        
        // Re-enable node dragging
        this.cy.autoungrabify(false);
    },

    // Cancel edge creation on escape key
    cancelEdgeCreationOnEscape: function() {
        if (this.edgeCreationMode) {
            this.cancelEdgeCreation();
        }
    },

    // Show edge creation indicator
    showEdgeCreationIndicator: function() {
        const container = document.getElementById('cy');
        if (!container) return;
        
        // Remove existing indicator
        this.hideEdgeCreationIndicator();
        
        // Create indicator
        const indicator = document.createElement('div');
        indicator.id = 'edgeCreationIndicator';
        indicator.style.cssText = `
            position: absolute;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 255, 0, 0.9);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            z-index: 1000;
            pointer-events: none;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        `;
        indicator.textContent = '🔗 Edge Creation Mode - Click target node';
        
        container.appendChild(indicator);
    },

    // Show group edge creation indicator
    showGroupEdgeCreationIndicator: function(nodeCount) {
        const container = document.getElementById('cy');
        if (!container) return;
        
        // Remove existing indicator
        this.hideEdgeCreationIndicator();
        
        // Create indicator
        const indicator = document.createElement('div');
        indicator.id = 'edgeCreationIndicator';
        indicator.style.cssText = `
            position: absolute;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 255, 0, 0.9);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            z-index: 1000;
            pointer-events: none;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        `;
        indicator.textContent = `🔗 Group Edge Mode - Connect ${nodeCount} nodes to target`;
        
        container.appendChild(indicator);
    },



    // Hide edge creation indicator
    hideEdgeCreationIndicator: function() {
        const indicator = document.getElementById('edgeCreationIndicator');
        if (indicator) {
            indicator.remove();
        }
    },



    // ===== MANUAL EDITING FUNCTIONS =====

    // Toggle editing mode
    toggleEditingMode: function() {
        this.editingMode = !this.editingMode;
        
        if (window.UI) {
            window.UI.showNotification(
                this.editingMode ? 'Editing mode enabled' : 'Editing mode disabled', 
                'info'
            );
        }
        
        // Update cursor
        if (this.cy) {
            this.cy.container().style.cursor = this.editingMode ? 'crosshair' : 'default';
        }

        // When leaving editing mode, clear clipboard to avoid memory leaks
        if (!this.editingMode) {
            this.clearClipboard();
        }
        
        return this.editingMode;
    },

    _beginBulkNodeDataUpdate: function() {
        this._bulkNodeDataDepth += 1;
        if (!this._bulkNodeDataBuffer) {
            this._bulkNodeDataBuffer = [];
        }
    },

    _commitBulkNodeDataUpdate: function() {
        if (this._bulkNodeDataDepth > 0) {
            this._bulkNodeDataDepth -= 1;
            if (this._bulkNodeDataDepth > 0) {
                return;
            }
        }

        const bulkNodes = this._bulkNodeDataBuffer;
        this._bulkNodeDataBuffer = null;

        if (!window.DataManager || !Array.isArray(bulkNodes) || bulkNodes.length === 0) {
            return;
        }

        const currentData = window.DataManager.getGraphData();
        const updatedData = {
            nodes: currentData.nodes.concat(bulkNodes),
            edges: currentData.edges
        };

        window.DataManager.setGraphData(updatedData, { skipLayout: true });

        if (window.TableManager) {
            window.TableManager.updateTables();
            window.TableManager.updateTotalDataTable();
        }
    },

    // Add a new node at specified position
    addNode: function(x, y, label = 'New Node', type = 'default', color = window.QuantickleConfig?.defaultNodeColor || '#ffffff', size = 30, icon = null, shape = 'ellipse', labelColor = null, info = '', options = {}) {
        if (!this.cy) return null;

        if (window.DomainLoader && typeof window.DomainLoader.ensureDomainForType === 'function') {
            window.DomainLoader.ensureDomainForType(type);
        }

        const resolvedOptions = options && typeof options === 'object' ? options : {};
        const skipDataManagerUpdate = !!resolvedOptions.skipDataManagerUpdate;
        const returnData = !!resolvedOptions.returnData;
        const bulkUpdate = !!resolvedOptions.bulkUpdate;

        // Generate unique node ID
        let nodeId;
        do {
            nodeId = `manual_node_${this.nextNodeId++}`;
        } while (this.cy.getElementById(nodeId).length > 0);

        let textDimensions = null;

        const sanitizedIcon = typeof icon === 'string' ? icon.trim() : '';
        const backgroundImageReference = sanitizedIcon
            ? (this.resolveBackgroundImage(sanitizedIcon) || this.buildBackgroundImage(sanitizedIcon))
            : null;
        const resolvedBackgroundFit = this.resolveBackgroundFitForType(type);

        // Build node configuration
        const nodeConfig = {
            group: 'nodes',
            data: {
                id: nodeId,
                label: label,
                type: type,
                color: color,
                size: size,
                shape: shape,
                info: info,
                customColor: color,
                customGlow: false,
                customLabelColor: !!labelColor,
                backgroundImage: sanitizedIcon && backgroundImageReference ? backgroundImageReference : 'none',
                backgroundFit: resolvedBackgroundFit,
                icon: sanitizedIcon || ''
            },
            position: { x: x, y: y }
        };

        if (type === 'text') {
            const textDefaults = window.NodeTypes && window.NodeTypes.text ? window.NodeTypes.text : {};
            const textTitle = typeof label === 'string' ? label : '';
            const textBody = typeof info === 'string' ? info : '';
            nodeConfig.data.label = textTitle;
            nodeConfig.data.info = textBody;
            nodeConfig.data.labelVisible = false;
            nodeConfig.data.fontFamily = textDefaults.fontFamily || 'Arial';
            nodeConfig.data.fontSize = textDefaults.fontSize || 14;
            nodeConfig.data.fontColor = textDefaults.fontColor || '#333333';
            nodeConfig.data.bold = textDefaults.bold || false;
            nodeConfig.data.italic = textDefaults.italic || false;
            nodeConfig.data.color = 'rgba(0,0,0,0)';
            const baseFontSize = parseFloat(nodeConfig.data.fontSize) || 14;
            const textSource = textBody || textTitle || '';
            if (window.QuantickleUtils && typeof window.QuantickleUtils.approximateTextContentSize === 'function') {
                textDimensions = window.QuantickleUtils.approximateTextContentSize(textSource, baseFontSize);
            }
            const calloutUtils = window.QuantickleUtils || {};
            const fallbackHtmlBuilder = (titleValue, bodyValue) => `<div class="text-node-title">${titleValue || ''}</div><div class="text-node-body">${bodyValue || ''}</div>`;
            const htmlBuilder = calloutUtils.buildBasicCalloutHtml
                ? (titleValue, bodyValue) => calloutUtils.buildBasicCalloutHtml(titleValue, bodyValue)
                : fallbackHtmlBuilder;
            const calloutPayload = calloutUtils.normalizeCalloutPayload
                ? calloutUtils.normalizeCalloutPayload({ title: textTitle, body: textBody, format: 'text' }, { defaultFormat: 'text' })
                : { title: textTitle || '', body: textBody || '', format: 'text' };
            const calloutHtml = htmlBuilder(calloutPayload.title, calloutPayload.body);
            if (calloutUtils.syncCalloutLegacyFields) {
                calloutUtils.syncCalloutLegacyFields(nodeConfig.data, calloutPayload, {
                    defaultFormat: 'text',
                    html: calloutHtml,
                    syncTitle: true,
                    overwriteInfo: true,
                    includeDerivedFields: true
                });
            } else {
                nodeConfig.data.callout = { ...calloutPayload };
                nodeConfig.data.calloutTitle = calloutPayload.title;
                nodeConfig.data.calloutBody = calloutPayload.body;
                nodeConfig.data.calloutFormat = calloutPayload.format;
                nodeConfig.data.calloutBodyFormat = calloutPayload.format;
                nodeConfig.data.info = calloutPayload.body;
                nodeConfig.data.infoHtml = calloutHtml;
            }
            if (textDimensions) {
                nodeConfig.data.width = textDimensions.width;
                nodeConfig.data.height = textDimensions.height;
            } else {
                nodeConfig.data.width = size;
                nodeConfig.data.height = size;
            }
        }

        // Containers need a special class so downstream functions recognize them
        if (type === 'container') {
            nodeConfig.classes = 'container';
            const baseLabel = label;
            nodeConfig.data.baseLabel = baseLabel;
            nodeConfig.data.label = baseLabel;
            //nodeConfig.data.width = nodeConfig.data.width || 200;
            //nodeConfig.data.height = nodeConfig.data.height || 150;
        }

        // Add node directly to Cytoscape
        const node = this.cy.add(nodeConfig);

        if (type === 'text') {
            if (textDimensions) {
                node.data('width', textDimensions.width);
                node.data('height', textDimensions.height);
            }
            const finalWidth = parseFloat(node.data('width'));
            const finalHeight = parseFloat(node.data('height'));
            if (Number.isFinite(finalWidth) && finalWidth > 0) {
                node.style('width', finalWidth);
                node.style('text-max-width', finalWidth);
            }
            if (Number.isFinite(finalHeight) && finalHeight > 0) {
                node.style('height', finalHeight);
            }
        }

        // Apply explicit styling for shape
        if (shape) {
            node.style('shape', shape);
            node.data('shape', shape);
        }

        // Apply icon styling if provided
        if (sanitizedIcon) {
            if (window.NodeEditor && typeof window.NodeEditor.applyIconStyle === 'function') {
                window.NodeEditor.applyIconStyle(node, sanitizedIcon);
            } else {
                const backgroundImage = backgroundImageReference || this.buildBackgroundImage(sanitizedIcon) || 'none';
                const backgroundPositionX = this.resolveBackgroundPositionValue(null, '50%');
                const backgroundPositionY = this.resolveBackgroundPositionValue(null, '50%');
                node.style({
                    'background-image': backgroundImage,
                    'background-fit': resolvedBackgroundFit,
                    'background-width': '100%',
                    'background-height': '100%',
                    'background-repeat': 'no-repeat',
                    'background-position-x': backgroundPositionX,
                    'background-position-y': backgroundPositionY
                });
                node.data('backgroundImage', backgroundImage);
            }
            node.data('backgroundFit', resolvedBackgroundFit);
            node.data('icon', sanitizedIcon);
        }

        // Apply label color if provided
        if (labelColor) {
            node.style('color', labelColor);
            node.data('labelColor', labelColor);
        }

        if (node) {
            this._setNodeLabelInIndex(node, this._extractNodeLabel(node));
        }

        let newNodeData = null;
        if (returnData || (!skipDataManagerUpdate && window.DataManager)) {
            newNodeData = {
                group: 'nodes',
                data: {
                    id: nodeId,
                    label: label,
                    type: type,
                    color: color,
                    size: size,
                    shape: shape,
                    info: info,
                    customColor: color,
                    customGlow: false,
                    customLabelColor: !!labelColor,
                    labelColor: labelColor,
                    backgroundImage: sanitizedIcon && backgroundImageReference ? backgroundImageReference : 'none',
                    backgroundFit: resolvedBackgroundFit,
                    icon: sanitizedIcon || ''
                },
                position: { x: x, y: y }
            };

            if (type === 'text') {
                newNodeData.data.label = nodeConfig.data.label;
                newNodeData.data.info = nodeConfig.data.info;
                newNodeData.data.infoHtml = nodeConfig.data.infoHtml;
                newNodeData.data.labelVisible = nodeConfig.data.labelVisible;
                newNodeData.data.fontFamily = nodeConfig.data.fontFamily;
                newNodeData.data.fontSize = nodeConfig.data.fontSize;
                newNodeData.data.fontColor = nodeConfig.data.fontColor;
                newNodeData.data.bold = nodeConfig.data.bold;
                newNodeData.data.italic = nodeConfig.data.italic;
                newNodeData.data.color = nodeConfig.data.color;
                newNodeData.data.width = nodeConfig.data.width;
                newNodeData.data.height = nodeConfig.data.height;
                if (nodeConfig.data.callout) {
                    newNodeData.data.callout = { ...nodeConfig.data.callout };
                }
                ['calloutTitle', 'calloutBody', 'calloutFormat', 'calloutBodyFormat'].forEach(key => {
                    if (Object.prototype.hasOwnProperty.call(nodeConfig.data, key)) {
                        newNodeData.data[key] = nodeConfig.data[key];
                    }
                });
            }

            if (type === 'container') {
                newNodeData.classes = 'container';
                const baseLabel = label;
                newNodeData.data.baseLabel = baseLabel;
                newNodeData.data.label = baseLabel;
                //newNodeData.data.width = newNodeData.data.width || 200;
                //newNodeData.data.height = newNodeData.data.height || 150;
            }
        }

        const bulkCollector = Array.isArray(resolvedOptions.bulkCollector)
            ? resolvedOptions.bulkCollector
            : (bulkUpdate ? this._bulkNodeDataBuffer : null);

        if (newNodeData && bulkCollector) {
            bulkCollector.push(newNodeData);
        }

        // Update DataManager with the new node
        if (!skipDataManagerUpdate && window.DataManager && newNodeData && !bulkCollector) {
            const currentData = window.DataManager.getGraphData();
            const updatedData = {
                nodes: [...currentData.nodes, newNodeData],
                edges: currentData.edges
            };

            // Update DataManager with the new data
            window.DataManager.setGraphData(updatedData, { skipLayout: true });

            // Update tables
            if (window.TableManager) {
                window.TableManager.updateTables();
                window.TableManager.updateTotalDataTable();
            }
        }
            
        if (window.UI) {
            window.UI.showNotification(`Added node: ${label}`, 'success');
        }

        if (window.GraphAreaEditor) {
            if (typeof window.GraphAreaEditor.applyIncrementalNodeSettings === 'function') {
                window.GraphAreaEditor.applyIncrementalNodeSettings(node);
            } else if (typeof window.GraphAreaEditor.applySettingsDebounced === 'function') {
                window.GraphAreaEditor.applySettingsDebounced();
            } else if (typeof window.GraphAreaEditor.applySettings === 'function') {
                window.GraphAreaEditor.applySettings();
            }
        }

        if (returnData) {
            return { node, graphData: newNodeData };
        }

        return node;
    },

    // Add node at click position
    addNodeAtClick: function(event) {
        if (!this.editingMode) return;
        
        const position = event.renderedPosition || event.renderedPoint;
        if (!position) return;
        
        // Prompt for node label
        const label = prompt('Enter node label:', 'New Node');
        if (!label) return; // User cancelled
        
        // Prompt for node type
        const type = prompt('Enter node type:', 'default');
        if (!type) return; // User cancelled
        
        this.addNode(position.x, position.y, label, type);
    },

    // Add default node at specified position
    addNodeAtPosition: function(x, y) {
        if (!this.editingMode) return;

        const label = `Node ${this.nextNodeId}`;
        const type = 'default';

        this.addNode(x, y, label, type);
    },

    // Add node at center of viewport
    addNodeAtCenter: function() {
        if (!this.cy) {
            return;
        }
        
        const centerX = this.cy.width() / 2;
        const centerY = this.cy.height() / 2;
        const label = `Node ${this.nextNodeId}`;
        const type = 'default';
        
        this.addNode(centerX, centerY, label, type);
        
        if (window.UI && window.UI.showNotification) {
            window.UI.showNotification('Node added at center', 'success');
        }
    },

    _getClipboardNodes() {
        if (this.clipboard && Array.isArray(this.clipboard.nodes)) {
            return this.clipboard.nodes;
        }
        if (Array.isArray(this.clipboard)) {
            return this.clipboard;
        }
        return [];
    },

    _getClipboardEdges() {
        if (this.clipboard && Array.isArray(this.clipboard.edges)) {
            return this.clipboard.edges;
        }
        return [];
    },

    _getClipboardAnchor() {
        if (this.clipboard && this.clipboard.anchor && typeof this.clipboard.anchor === 'object') {
            return { ...this.clipboard.anchor };
        }
        return null;
    },

    // Copy selected nodes to clipboard
    copySelectedNodes: function() {
        if (!this.cy) return;

        const selectedNodes = this.cy.nodes(':selected');
        if (selectedNodes.length === 0) {
            if (window.UI) {
                window.UI.showNotification('No nodes selected to copy', 'warning');
            }
            return;
        }

        // Mark this copy as internal so the copy event doesn't switch clipboard source
        this.isInternalCopy = true;

        const defaultNodeColor = window.QuantickleConfig?.defaultNodeColor || '#ffffff';
        const nodeIdSet = new Set();

        const nodePayloads = selectedNodes.map(node => {
            const bg = node.data('backgroundImage');
            let icon = node.data('icon');
            if (!icon && bg && typeof bg === 'string') {
                const match = bg.match(/^url\("?(.*?)"?\)$/);
                if (match) icon = match[1];
            }
            const hasCustomLabelColor = node.data('customLabelColor');
            const style = node.json().style || {};
            const position = typeof node.position === 'function'
                ? node.position()
                : (node.data('position') || { x: 0, y: 0 });

            const id = typeof node.id === 'function' ? node.id() : node.data('id');
            if (id) {
                nodeIdSet.add(id);
            }

            return {
                id: id || undefined,
                label: node.data('label') || node.data('id'),
                type: node.data('type') || 'default',
                color: node.data('color') || defaultNodeColor,
                size: node.data('size') || 30,
                shape: node.data('shape') || node.style('shape') || 'ellipse',
                labelColor: hasCustomLabelColor ? node.style('color') : null,
                icon: icon || null,
                info: node.data('info') || '',
                style: style,
                position: {
                    x: position?.x || 0,
                    y: position?.y || 0
                }
            };
        });

        const anchor = nodePayloads.reduce((acc, node) => {
            acc.x += node.position.x;
            acc.y += node.position.y;
            return acc;
        }, { x: 0, y: 0 });
        anchor.x /= nodePayloads.length;
        anchor.y /= nodePayloads.length;

        const selectedEdges = this.cy.edges().filter(edge => {
            const source = edge.data('source');
            const target = edge.data('target');
            return nodeIdSet.has(source) && nodeIdSet.has(target);
        });

        const edgePayloads = selectedEdges.map(edge => {
            const data = this.safeClone(edge.data());
            if (data) {
                delete data.id;
            }
            return {
                data: {
                    ...(data || {}),
                    source: edge.data('source'),
                    target: edge.data('target')
                },
                style: edge.json().style || {}
            };
        });

        this.clipboard = {
            nodes: nodePayloads,
            edges: edgePayloads,
            anchor
        };

        // Track when internal clipboard was last updated
        this.internalClipboardTimestamp = Date.now();
        this.lastClipboardSource = 'internal';

        // Capture current external clipboard contents to detect future changes
        if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText().then(text => {
                this.lastExternalClipboardText = text;
            }).catch(() => {
                this.lastExternalClipboardText = undefined;
            });
        } else {
            this.lastExternalClipboardText = undefined;
        }

        // Schedule automatic clearing of clipboard to prevent memory leaks
        if (this.clipboardClearTimeout) {
            clearTimeout(this.clipboardClearTimeout);
        }
        this.clipboardClearTimeout = setTimeout(() => {
            this.clearClipboard();
        }, 5 * 60 * 1000); // Clear after 5 minutes
        
        
        const copiedCount = this._getClipboardNodes().length;
        if (window.UI) {
            window.UI.showNotification(`Copied ${copiedCount} nodes to clipboard`, 'success');
        }
    },

    // Copy only the labels of selected nodes to the clipboard
    copySelectedNodeLabels: function() {
        if (!this.cy) return 0;

        const selectedNodes = this.cy.nodes(':selected');

        if (!selectedNodes || selectedNodes.length === 0) {
            if (window.UI) {
                window.UI.showNotification('No nodes selected to copy labels', 'warning');
            }
            return 0;
        }

        const labels = selectedNodes.map(node =>
            node.data('label') || node.data('id') || (typeof node.id === 'function' ? node.id() : '')
        ).filter(label => typeof label === 'string' && label.trim().length > 0);

        if (labels.length === 0) {
            if (window.UI) {
                window.UI.showNotification('Selected nodes do not have labels to copy', 'warning');
            }
            return 0;
        }

        const labelText = labels.join('\n');

        const showSuccess = () => {
            if (window.UI) {
                window.UI.showNotification(`Copied ${labels.length} labels to clipboard`, 'success');
            }
        };

        const showFailure = () => {
            if (window.UI) {
                window.UI.showNotification('Unable to copy labels to clipboard', 'warning');
            }
        };

        const fallbackCopy = () => {
            const textarea = document.createElement('textarea');
            textarea.value = labelText;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'absolute';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            let success = false;

            try {
                success = document.execCommand('copy');
            } catch (error) {
                success = false;
            }

            document.body.removeChild(textarea);
            return success;
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(labelText)
                .then(showSuccess)
                .catch(() => {
                    if (fallbackCopy()) {
                        showSuccess();
                    } else {
                        showFailure();
                    }
                });
        } else {
            if (fallbackCopy()) {
                showSuccess();
            } else {
                showFailure();
            }
        }

        return labels.length;
    },

    // Paste nodes from clipboard
    pasteNodes: function(offsetX = 20, offsetY = 20, options = {}) {
        if (typeof offsetX === 'object' && offsetX !== null) {
            options = offsetX;
            offsetX = 20;
            offsetY = 20;
        } else if (typeof offsetY === 'object' && offsetY !== null) {
            options = offsetY;
            offsetY = 20;
        }

        const preserveClipboard = !!options.preserveClipboard;

        const clipboardNodes = this._getClipboardNodes();
        const clipboardEdges = this._getClipboardEdges();
        const clipboardAnchor = this._getClipboardAnchor();

        if (!this.cy || clipboardNodes.length === 0) {
            if (window.UI) {
                window.UI.showNotification('No nodes in clipboard to paste', 'warning');
            }
            return 0;
        }

        const zoom = this.cy.zoom();
        const anchor = this.getPasteAnchorPosition();
        const spacingX = offsetX / zoom;
        const spacingY = offsetY / zoom;
        const count = clipboardNodes.length;

        const startX = anchor.x - ((count - 1) * spacingX) / 2;
        const startY = anchor.y - ((count - 1) * spacingY) / 2;

        const targetAnchor = clipboardAnchor
            ? {
                x: anchor.x + spacingX,
                y: anchor.y + spacingY
            }
            : null;

        const candidateLabels = clipboardNodes
            .map(nodeData => (typeof nodeData.label === 'string' ? nodeData.label.trim() : ''))
            .filter(Boolean);
        const { allowDuplicates, duplicatesSet } = this._resolveDuplicateHandling(candidateLabels, 'paste');
        const duplicateNodes = allowDuplicates ? [] : this._findNodesByLabels(duplicatesSet);

        const addedNodes = [];
        const idMap = new Map();
        const labelMap = new Map();
        const manageHistory = !this.historyPaused && !this.isRestoring;

        if (manageHistory) {
            this.saveState();
            this.pauseHistory();
        }

        this._beginBulkNodeDataUpdate();

        try {
            clipboardNodes.forEach((nodeData, index) => {
                const trimmedLabel = typeof nodeData.label === 'string' ? nodeData.label.trim() : '';
                if (!allowDuplicates && trimmedLabel && duplicatesSet.has(trimmedLabel)) {
                    return;
                }

                let x = startX + spacingX * index;
                let y = startY + spacingY * index;

                if (nodeData.position && targetAnchor) {
                    const relativeX = nodeData.position.x - clipboardAnchor.x;
                    const relativeY = nodeData.position.y - clipboardAnchor.y;
                    x = targetAnchor.x + relativeX;
                    y = targetAnchor.y + relativeY;
                }

                const addResult = this.addNode(
                    x,
                    y,
                    nodeData.label,
                    nodeData.type,
                    nodeData.color,
                    nodeData.size,
                    nodeData.icon,
                    nodeData.shape,
                    nodeData.labelColor,
                    nodeData.info,
                    { bulkUpdate: true, returnData: true }
                );

                const node = addResult && addResult.node ? addResult.node : addResult;
                if (node) {
                    if (nodeData.style) {
                        const style = { ...nodeData.style };
                        delete style.shape;
                        node.style(style);
                    }
                    if (nodeData.shape) {
                        node.style('shape', nodeData.shape);
                        node.data('shape', nodeData.shape);
                    }

                    const newId = typeof node.id === 'function' ? node.id() : node.data('id');
                    if (nodeData.id && newId) {
                        idMap.set(nodeData.id, newId);
                    }
                    if (trimmedLabel && newId) {
                        labelMap.set(trimmedLabel, newId);
                    }

                    addedNodes.push(node);
                }
            });

            let addedEdges = 0;
            clipboardEdges.forEach((edgeData, index) => {
                const sourceId = idMap.get(edgeData.data?.source) || labelMap.get(edgeData.data?.source);
                const targetId = idMap.get(edgeData.data?.target) || labelMap.get(edgeData.data?.target);

                if (!sourceId || !targetId) {
                    return;
                }

                const data = {
                    ...edgeData.data,
                    id: `manual_edge_${Date.now()}_${index}`,
                    source: sourceId,
                    target: targetId
                };

                const added = this.cy.add({
                    group: 'edges',
                    data
                });

                if (added && added.length && edgeData.style) {
                    added.style(edgeData.style);
                }

                addedEdges += added ? added.length : 0;
            });

            if (window.GraphAreaEditor && typeof window.GraphAreaEditor.applySettingsDebounced === 'function') {
                window.GraphAreaEditor.applySettingsDebounced();
            } else if (window.GraphAreaEditor && typeof window.GraphAreaEditor.applySettings === 'function') {
                window.GraphAreaEditor.applySettings();
            }

            if (window.UI) {
                const edgeMsg = addedEdges > 0 ? ` and ${addedEdges} edge${addedEdges === 1 ? '' : 's'}` : '';
                window.UI.showNotification(`Pasted ${addedNodes.length} nodes${edgeMsg}`, 'success');
            }

            this._refreshLabelIndexFromCy();
            this._selectNodes([...addedNodes, ...duplicateNodes]);

            if (!preserveClipboard) {
                // Clear clipboard after pasting to release memory
                this.clearClipboard();
            }

            return addedNodes.length;
        } finally {
            this._commitBulkNodeDataUpdate();
            if (manageHistory) {
                this.resumeHistory();
                this.saveState();
            }
        }
    },

    // Clear internal clipboard and related timers
    clearClipboard: function() {
        const hasClipboard = this._getClipboardNodes().length > 0;
        if (hasClipboard) {
            this.clipboard = { nodes: [], edges: [], anchor: null };
            this.internalClipboardTimestamp = null;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText('').catch(() => {});
        }
        this.lastExternalClipboardText = undefined;
        this.lastExternalClipboardTimestamp = null;
        this.lastClipboardSource = null;
        if (this.clipboardClearTimeout) {
            clearTimeout(this.clipboardClearTimeout);
            this.clipboardClearTimeout = null;
        }
    },

    stashClipboardForNextGraph(options = {}) {
        const nodes = this._getClipboardNodes();
        if (!Array.isArray(nodes) || nodes.length === 0) {
            this.clipboardTransferStore = null;
            return false;
        }

        const offsetX = Number.isFinite(options.offsetX) ? options.offsetX : 20;
        const offsetY = Number.isFinite(options.offsetY) ? options.offsetY : 20;

        const clonedClipboard = this.safeClone(this.clipboard);
        const clonedNodes = clonedClipboard && Array.isArray(clonedClipboard.nodes)
            ? clonedClipboard.nodes
            : (Array.isArray(clonedClipboard) ? clonedClipboard : []);
        if (!Array.isArray(clonedNodes) || clonedNodes.length === 0) {
            this.clipboardTransferStore = null;
            return false;
        }

        this.clipboardTransferStore = {
            clipboard: clonedClipboard,
            offsetX,
            offsetY,
            notify: options.notify !== false
        };

        return true;
    },

    applyClipboardTransferToCurrentGraph(options = {}) {
        const stash = this.clipboardTransferStore;
        const clipboard = stash?.clipboard;
        const nodes = clipboard && Array.isArray(clipboard.nodes)
            ? clipboard.nodes
            : (Array.isArray(clipboard) ? clipboard : []);
        if (!stash || !Array.isArray(nodes) || nodes.length === 0) {
            return false;
        }

        this.clipboard = this.safeClone(stash.clipboard) || { nodes: [], edges: [], anchor: null };
        this.lastClipboardSource = 'internal';
        this.internalClipboardTimestamp = Date.now();

        const autoPaste = options.autoPaste === true;
        let pastedCount = 0;

        if (autoPaste) {
            const offsetX = Number.isFinite(stash.offsetX) ? stash.offsetX : 20;
            const offsetY = Number.isFinite(stash.offsetY) ? stash.offsetY : 20;
            const preserveClipboard = options.preserveClipboard !== false;

            const pasteResult = this.pasteNodes(offsetX, offsetY, { preserveClipboard });
            pastedCount = Number.isFinite(pasteResult) ? pasteResult : this._getClipboardNodes().length;
        }

        if (stash.notify !== false && window.UI && typeof window.UI.showNotification === 'function') {
            const plural = (autoPaste ? pastedCount : nodes.length) === 1 ? '' : 's';
            const count = autoPaste ? pastedCount : nodes.length;
            const message = autoPaste
                ? `Clipboard restored: pasted ${count} node${plural} into the new graph`
                : `Clipboard restored: ${count} node${plural} ready to paste into the new graph`;
            window.UI.showNotification(message, 'info');
        }

        this.clipboardTransferStore = null;

        return true;
    },

    // Create edges from selection to one node
    createEdgesFromSelectionToNode: function(targetNode) {
        if (!this.cy) return;
        
        const selectedNodes = this.cy.nodes(':selected');
        if (selectedNodes.length === 0) {
            if (window.UI) {
                window.UI.showNotification('No nodes selected', 'warning');
            }
            return;
        }
        
        if (!targetNode || !targetNode.isNode()) {
            if (window.UI) {
                window.UI.showNotification('Please select a target node', 'warning');
            }
            return;
        }
        
        let edgesCreated = 0;
        selectedNodes.forEach(sourceNode => {
            if (sourceNode.id() !== targetNode.id()) {
                const edgeId = `manual_edge_${Date.now()}_${edgesCreated++}`;
                this.cy.add({
                    group: 'edges',
                    data: {
                        id: edgeId,
                        source: sourceNode.id(),
                        target: targetNode.id(),
                        type: 'manual'
                    }
                });
            }
        });
        
        
        if (window.UI) {
            window.UI.showNotification(`Created ${edgesCreated} edges`, 'success');
        }
    },

    // Create edges from one node to selection
    createEdgesFromNodeToSelection: function(sourceNode) {
        if (!this.cy) return;
        
        const selectedNodes = this.cy.nodes(':selected');
        if (selectedNodes.length === 0) {
            if (window.UI) {
                window.UI.showNotification('No nodes selected', 'warning');
            }
            return;
        }
        
        if (!sourceNode || !sourceNode.isNode()) {
            if (window.UI) {
                window.UI.showNotification('Please select a source node', 'warning');
            }
            return;
        }
        
        let edgesCreated = 0;
        selectedNodes.forEach(targetNode => {
            if (sourceNode.id() !== targetNode.id()) {
                const edgeId = `manual_edge_${Date.now()}_${edgesCreated++}`;
                this.cy.add({
                    group: 'edges',
                    data: {
                        id: edgeId,
                        source: sourceNode.id(),
                        target: targetNode.id(),
                        type: 'manual'
                    }
                });
            }
        });
        
        
        if (window.UI) {
            window.UI.showNotification(`Created ${edgesCreated} edges`, 'success');
        }
    },

    // Setup manual editing event listeners
    setupManualEditingEvents: function() {
        if (!this.cy) return;

        // Double-click to add node (when in editing mode)
        this.cy.on('dbltap', 'node', (event) => {
            const node = event.target;

            if (node && typeof node.hasClass === 'function' && node.hasClass('container')) {
                return;
            }

            if (this.handleGraphNodeDoubleTap(node)) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            if (this.GraphPortal && typeof this.GraphPortal.supportsNode === 'function' && this.GraphPortal.supportsNode(node)) {
                event.preventDefault();
                event.stopPropagation();
                this.GraphPortal.toggle(node);
                return;
            }

            // Don't add node if double-clicking on existing node
            event.preventDefault();
            event.stopPropagation();
        });

        // Block double-tap propagation on nodes
        this.cy.on('tap', 'node', (event) => {
            if (!event.target.hasClass('container') && event.originalEvent && event.originalEvent.detail > 1) {
                event.preventDefault();
                event.stopPropagation();
            }
        });

        this.cy.on('dbltap', (event) => {
            if (this.editingMode && !event.target.isNode && !event.target.isEdge) {
                this.addNodeAtClick(event);
            }
        });
        
        // Add single click to add node when in editing mode
        this.cy.on('tap', (event) => {
            if (this.editingMode && !event.target.isNode && !event.target.isEdge && event.originalEvent && event.originalEvent.altKey) {
                this.addNodeAtClick(event);
            }
        });
        
        // Global keyboard shortcuts - highest priority
        this._deleteKeyHandler = (event) => {
            const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';

            // Handle Ctrl+Z for undo
            if (key === 'z' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                event.stopPropagation();
                this.undo();
                return;
            }
            // Handle Ctrl+Y for redo
            if (key === 'y' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                event.stopPropagation();
                this.redo();
                return;
            }
            // Handle Ctrl+V - use legacy hidden textarea to capture paste
            if (key === 'v' && (event.ctrlKey || event.metaKey)) {
                // Allow default paste action so the paste event is fired
                event.stopPropagation();
                event.stopImmediatePropagation();

                if (!this._pasteCatcher) {
                    this._pasteCatcher = document.createElement('textarea');
                    this._pasteCatcher.style.position = 'fixed';
                    this._pasteCatcher.style.opacity = '0';
                    this._pasteCatcher.style.left = '-1000px';
                    this._pasteCatcher.tabIndex = -1;
                    document.body.appendChild(this._pasteCatcher);
                }

                this._pasteCatcher.value = '';
                this._pasteCatcher.focus();

                // Remove focus after paste event is handled
                setTimeout(() => {
                    if (this.cy && this.cy.container()) {
                        this.cy.container().focus();
                    }
                }, 0);

                return;
            }
            // Handle Shift+C for copying only labels
            if (key === 'c' && event.shiftKey && !event.ctrlKey && !event.metaKey && this.editingMode) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                this.copySelectedNodeLabels();
                return;
            }
            // Handle Ctrl+C for copying nodes
            if (key === 'c' && (event.ctrlKey || event.metaKey) && this.editingMode) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                this.copySelectedNodes();
                return;
            }
            // Handle N key for quick node addition
            if (key === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
                event.preventDefault();
                event.stopPropagation();
                this.addNodeAtCenter();
                return;
            }
            // Handle Delete/Backspace for deleting elements
            if (event.key === 'Delete' || event.key === 'Backspace') {
                // If Node Editor modal is open and focus is in a field, allow normal editing
                const editor = document.getElementById('node-editor');
                if (editor && editor.style.display === 'block') {
                    const active = document.activeElement;
                    if (editor.contains(active)) {
                        const tag = active.tagName;
                        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                            // Do NOT call preventDefault/stopPropagation, just return
                            return;
                        }
                    }
                }
                // Otherwise, delete selected elements
                    event.preventDefault();
                event.stopPropagation();
                    this.deleteSelectedElements();
                return;
            }
        };
        // Instead, attach to Cytoscape container in bubbling phase:
        const cyContainer = this.cy ? this.cy.container() : null;
        if (cyContainer) {
            cyContainer.addEventListener('keydown', this._deleteKeyHandler, false);
        }

        // Global paste handler for both text and files
        this._pasteHandler = (event) => {
            if (!this.editingMode) return;

            // Allow pasting into input/textarea fields or contenteditable elements
            // except for the hidden paste catcher used for graph pastes
            const target = event.target;
            const isEditableElement = (el) => {
                if (!el) return false;
                const tag = el.tagName;
                return (
                    tag === 'INPUT' ||
                    tag === 'TEXTAREA' ||
                    tag === 'SELECT' ||
                    el.isContentEditable
                );
            };
            if (isEditableElement(target) && (!this._pasteCatcher || target !== this._pasteCatcher)) {
                return; // Let the default paste occur in editable fields
            }

            event.preventDefault();

            const clipboardData = event.clipboardData;

            let text = '';
            try {
                text = clipboardData?.getData('text/plain') || '';
                const uriList = clipboardData?.getData('text/uri-list');
            } catch (e) {
            }

            const trimmedText = typeof text === 'string' ? text.trim() : '';
            const hasTextPayload = trimmedText.length > 0;
            const internalClipboardNodes = typeof this._getClipboardNodes === 'function'
                ? this._getClipboardNodes()
                : [];
            const hasInternalClipboard = Array.isArray(internalClipboardNodes) && internalClipboardNodes.length > 0;

            let files = Array.from(clipboardData?.files || []);
            if (files.length === 0 && clipboardData?.items) {
                files = Array.from(clipboardData.items)
                    .map(item => (item.getAsFile ? item.getAsFile() : null))
                    .filter(file => file);
            }

            const validFileEntries = files.filter(file => {
                if (!file) return false;
                if (file.type) {
                    return /^(image|application|text|audio|video)\//.test(file.type);
                }
                return Boolean(file.name);
            });

            const hasGraphClipboard = hasInternalClipboard || hasTextPayload;
            const shouldPasteFiles = !hasGraphClipboard && validFileEntries.length > 0;

            if (hasGraphClipboard) {
                this.pasteNodesFromText(hasTextPayload ? text : undefined);
            } else if (shouldPasteFiles) {
                const zoom = this.cy.zoom();
                const anchor = this.getPasteAnchorPosition();
                const spacing = 100 / zoom;
                const startX = anchor.x - (validFileEntries.length - 1) * spacing / 2;

                const defaultNodeColor = window.QuantickleConfig?.defaultNodeColor || '#ffffff';
                this._beginBulkNodeDataUpdate();
                validFileEntries.forEach((file, index) => {
                    const path = file.path || URL.createObjectURL(file);
                    const label = file.name || `File ${index + 1}`;
                    const addResult = this.addNode(
                        startX + index * spacing,
                        anchor.y,
                        label,
                        'default',
                        defaultNodeColor,
                        30,
                        path,
                        null,
                        null,
                        '',
                        { bulkUpdate: true, returnData: true }
                    );
                });
                this._commitBulkNodeDataUpdate();
                if (window.UI) {
                    const msg = `Pasted ${validFileEntries.length} file node${validFileEntries.length > 1 ? 's' : ''}`;
                    window.UI.showNotification(msg, 'success');
                }
            } else {
                this.pasteNodesFromText(text);
            }

            if (this._pasteCatcher) {
                this._pasteCatcher.value = '';
                this._pasteCatcher.blur();
            }
        };
        document.addEventListener('paste', this._pasteHandler);

        // Expose enable/disable methods for completeness (no-ops now):
        window.GraphRenderer = window.GraphRenderer || this;
        window.GraphRenderer.enableDeleteKeyHandler = () => {};
        window.GraphRenderer.disableDeleteKeyHandler = () => {};
    },

    // Delete selected elements
    deleteSelectedElements: function() {
        if (!this.cy) return;
        
        const selectedNodes = this.cy.nodes(':selected');
        const selectedEdges = this.cy.edges(':selected');
        
        if (selectedNodes.length === 0 && selectedEdges.length === 0) {
            if (window.UI) {
                window.UI.showNotification('No elements selected to delete', 'warning');
            }
            return;
        }
        
        const totalElements = selectedNodes.length + selectedEdges.length;
        this.cy.remove(selectedNodes.union(selectedEdges));
        
        
        if (window.UI) {
            window.UI.showNotification(`Deleted ${totalElements} elements`, 'success');
        }
    },

    _extractNodeLabel(node) {
        if (!node) {
            return '';
        }

        if (typeof node.data === 'function') {
            const dataLabel = node.data('label');
            if (dataLabel) {
                return String(dataLabel).trim();
            }
        }

        const source = node.data && typeof node.data === 'object' ? node.data : node;
        const rawLabel = source.label || source.id || '';
        return typeof rawLabel === 'string' ? rawLabel.trim() : '';
    },

    _initializeLabelIndexStore() {
        if (!this._labelIndex) {
            this._labelIndex = {
                labelCounts: new Map(),
                nodeLabels: new Map(),
                valid: false
            };
        }
        return this._labelIndex;
    },

    _invalidateLabelIndex() {
        if (this._labelIndex) {
            this._labelIndex.valid = false;
        }
    },

    _getNodeIdFromElement(node) {
        if (!node) {
            return null;
        }

        if (typeof node.id === 'function') {
            const id = node.id();
            if (id) {
                return id;
            }
        }

        if (node.data && typeof node.data === 'function') {
            const dataId = node.data('id');
            if (dataId) {
                return dataId;
            }
        }

        if (node.data && typeof node.data === 'object') {
            return node.data.id || null;
        }

        return null;
    },

    _refreshLabelIndexFromCy() {
        if (!this.cy) {
            this._invalidateLabelIndex();
            return;
        }

        const store = this._initializeLabelIndexStore();
        const labelCounts = new Map();
        const nodeLabels = new Map();

        const nodesWithLabels = typeof this.cy.nodes === 'function'
            ? this.cy.nodes('[label]')
            : [];

        nodesWithLabels.forEach(node => {
            const label = this._extractNodeLabel(node);
            const nodeId = this._getNodeIdFromElement(node);
            if (!label || !nodeId) {
                return;
            }

            nodeLabels.set(nodeId, label);
            labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
        });

        store.labelCounts = labelCounts;
        store.nodeLabels = nodeLabels;
        store.valid = true;
    },

    _ensureLabelIndex() {
        if (!this._labelIndex || !this._labelIndex.valid) {
            this._refreshLabelIndexFromCy();
        }
        return this._labelIndex;
    },

    _setNodeLabelInIndex(node, label) {
        if (!this.cy) {
            return;
        }

        const store = this._ensureLabelIndex();
        if (!store) {
            return;
        }

        const nodeId = this._getNodeIdFromElement(node);
        if (!nodeId) {
            return;
        }

        const trimmedLabel = typeof label === 'string' ? label.trim() : '';
        const previousLabel = store.nodeLabels.get(nodeId);

        if (previousLabel && previousLabel !== trimmedLabel) {
            const prevCount = store.labelCounts.get(previousLabel) || 0;
            if (prevCount <= 1) {
                store.labelCounts.delete(previousLabel);
            } else {
                store.labelCounts.set(previousLabel, prevCount - 1);
            }
        }

        if (trimmedLabel) {
            store.labelCounts.set(trimmedLabel, (store.labelCounts.get(trimmedLabel) || 0) + 1);
            store.nodeLabels.set(nodeId, trimmedLabel);
        } else {
            store.nodeLabels.delete(nodeId);
        }

        store.valid = true;
    },

    _removeNodeFromLabelIndex(node) {
        if (!this.cy || !this._labelIndex) {
            return;
        }

        const store = this._ensureLabelIndex();
        if (!store) {
            return;
        }

        const nodeId = this._getNodeIdFromElement(node);
        const existingLabel = store.nodeLabels.get(nodeId) || this._extractNodeLabel(node);

        if (existingLabel) {
            const count = store.labelCounts.get(existingLabel) || 0;
            if (count <= 1) {
                store.labelCounts.delete(existingLabel);
            } else {
                store.labelCounts.set(existingLabel, count - 1);
            }
        }

        if (nodeId) {
            store.nodeLabels.delete(nodeId);
        }

        store.valid = true;
    },

    _setupLabelIndexTracking() {
        if (!this.cy || this._labelIndexListenersAttached) {
            return;
        }

        this._initializeLabelIndexStore();
        this._refreshLabelIndexFromCy();

        this.cy.on('add', 'node', (event) => {
            const node = event?.target;
            if (node) {
                this._setNodeLabelInIndex(node, this._extractNodeLabel(node));
            }
        });

        this.cy.on('remove', 'node', (event) => {
            const node = event?.target;
            if (node) {
                this._removeNodeFromLabelIndex(node);
            }
        });

        this.cy.on('data', 'node', (event) => {
            const node = event?.target;
            if (!node) {
                return;
            }

            const label = this._extractNodeLabel(node);
            this._setNodeLabelInIndex(node, label);
        });

        this._labelIndexListenersAttached = true;
    },

    _getCachedLabelSet() {
        const store = this._ensureLabelIndex();
        if (!store || !store.labelCounts) {
            return new Set();
        }

        return new Set(store.labelCounts.keys());
    },

    _getExistingLabelConflicts(candidateLabels = []) {
        if (!this.cy || !Array.isArray(candidateLabels) || candidateLabels.length === 0) {
            return { duplicates: [], duplicatesSet: new Set() };
        }

        const existingLabels = this._getCachedLabelSet();

        const duplicates = Array.from(new Set(candidateLabels.filter(label => existingLabels.has(label))));
        return { duplicates, duplicatesSet: new Set(duplicates) };
    },

    _buildDuplicateDialogMessage(duplicates, context = 'import') {
        const cappedList = duplicates.slice(0, 5).map(label => `"${label}"`).join(', ');
        const extraCount = duplicates.length > 5 ? ` and ${duplicates.length - 5} more` : '';
        const contextPrefix = context === 'paste' ? 'Pasted nodes' : 'Imported data';
        return `${contextPrefix} include labels already present in the graph: ${cappedList}${extraCount}.
Choose OK to duplicate these nodes or Cancel to ignore duplicates.`;
    },

    _resolveDuplicateHandling(candidateLabels, context = 'import') {
        const { duplicates, duplicatesSet } = this._getExistingLabelConflicts(candidateLabels);
        if (duplicates.length === 0) {
            return { allowDuplicates: true, duplicatesSet };
        }

        let allowDuplicates = true;
        if (typeof window.confirm === 'function') {
            allowDuplicates = window.confirm(this._buildDuplicateDialogMessage(duplicates, context));
        }

        return { allowDuplicates, duplicatesSet };
    },

    _selectNodes(nodes) {
        if (!this.cy || !Array.isArray(nodes) || nodes.length === 0) {
            return;
        }

        try {
            const selected = typeof this.cy.elements === 'function'
                ? this.cy.elements(':selected')
                : null;
            if (selected && typeof selected.unselect === 'function') {
                selected.unselect();
            }

            const seen = new Set();

            nodes
                .filter(node => node && typeof node.select === 'function')
                .forEach(node => {
                    const nodeId = typeof node.id === 'function' ? node.id() : null;
                    if (nodeId && seen.has(nodeId)) {
                        return;
                    }

                    if (nodeId) {
                        seen.add(nodeId);
                    }
                    node.select();
                });
        } catch (error) {
            console.warn('Unable to select nodes after operation:', error);
        }
    },

    _findNodesByLabels(labelsSet) {
        if (!this.cy || !labelsSet || typeof labelsSet.size !== 'number' || labelsSet.size === 0) {
            return [];
        }

        const matches = [];
        this.cy.nodes().forEach(node => {
            const label = this._extractNodeLabel(node);
            if (label && labelsSet.has(label)) {
                matches.push(node);
            }
        });
        return matches;
    },

    _getNodesByLabelsFromIndex(labelsSet) {
        if (!this.cy || !labelsSet || typeof labelsSet.size !== 'number' || labelsSet.size === 0) {
            return [];
        }

        const store = this._ensureLabelIndex();
        if (!store || !store.nodeLabels || store.nodeLabels.size === 0) {
            return [];
        }

        const matches = [];
        const seenIds = new Set();
        store.nodeLabels.forEach((label, nodeId) => {
            if (!label || !labelsSet.has(label) || !nodeId || seenIds.has(nodeId)) {
                return;
            }

            const collection = typeof this.cy.getElementById === 'function'
                ? this.cy.getElementById(nodeId)
                : (typeof this.cy.$id === 'function' ? this.cy.$id(nodeId) : null);
            const node = collection && collection.length ? collection[0] : null;
            if (node) {
                matches.push(node);
                seenIds.add(nodeId);
            }
        });

        return matches;
    },

    // Paste nodes from clipboard text
    pasteNodesFromText: async function(pastedText) {
        // Set flag to prevent automatic layout during paste
        this.isPastingNodes = true;

        try {
            // Read external clipboard text if not provided
            let externalClipboardText = pastedText || null;

            if (!externalClipboardText) {
                try {
                    if (navigator.clipboard && navigator.clipboard.readText) {
                        externalClipboardText = await navigator.clipboard.readText();
                    } else if (this._pasteCatcher && this._pasteCatcher.value) {
                        externalClipboardText = this._pasteCatcher.value;
                    } else if (window.clipboardData) {
                        externalClipboardText = window.clipboardData.getData('Text');
                    }
                } catch (e) {
                }
            }

            // Track external clipboard changes to infer last copy action
            const hasExternalClipboard = externalClipboardText && externalClipboardText.trim();
            if (hasExternalClipboard) {
                const clipboardChanged = externalClipboardText !== this.lastExternalClipboardText;

                if (clipboardChanged && this.lastClipboardSource !== 'internal') {
                    this.lastClipboardSource = 'external';
                }

                this.lastExternalClipboardText = externalClipboardText;

                if (clipboardChanged) {
                    this.lastExternalClipboardTimestamp = Date.now();
                }
            }

            // Determine which clipboard to use based on last copy action
            const clipboardNodes = this._getClipboardNodes();
            const hasInternalClipboard = clipboardNodes && clipboardNodes.length > 0;

            const internalTimestamp = hasInternalClipboard ? (this.internalClipboardTimestamp || 0) : -1;
            const externalTimestamp = hasExternalClipboard ? (this.lastExternalClipboardTimestamp || 0) : -1;

            let useInternalClipboard = false;
            let useExternalClipboard = false;

            // Prefer whichever source was explicitly used last when available
            if (hasInternalClipboard && this.lastClipboardSource === 'internal') {
                useInternalClipboard = true;
            } else if (hasExternalClipboard && this.lastClipboardSource === 'external') {
                useExternalClipboard = true;
            } else if (hasInternalClipboard && hasExternalClipboard) {
                if (internalTimestamp >= externalTimestamp) {
                    useInternalClipboard = true;
                } else {
                    useExternalClipboard = true;
                }
            } else if (hasInternalClipboard && !hasExternalClipboard) {
                useInternalClipboard = true;
            } else if (!hasInternalClipboard && hasExternalClipboard) {
                useExternalClipboard = true;
            } else {
                if (window.UI) {
                    window.UI.showNotification('No content in any clipboard', 'warning');
                }
                return;
            }
            
            // Handle internal clipboard
            if (useInternalClipboard) {
                // Reuse the primary paste path so node positions and edges are
                // restored relative to the saved anchor instead of being lined up.
                this.pasteNodes();
                return;
            }
            
            // Handle external clipboard
            if (useExternalClipboard) {
                const manageHistory = !this.historyPaused && !this.isRestoring;
                if (manageHistory) {
                    this.saveState();
                    this.pauseHistory();
                }

                try {
                    // Clear any stale internal clipboard to avoid memory leaks without
                    // affecting external clipboard contents
                    if (this._getClipboardNodes().length > 0) {
                        this.clipboard = { nodes: [], edges: [], anchor: null };
                        this.internalClipboardTimestamp = null;
                    }
                    if (this.clipboardClearTimeout) {
                        clearTimeout(this.clipboardClearTimeout);
                        this.clipboardClearTimeout = null;
                    }
                    
                    // Split text by lines and filter out empty lines
                    const lines = externalClipboardText.split('\n').filter(line => line.trim().length > 0);
                    
                    if (lines.length === 0) {
                        if (window.UI) {
                            window.UI.showNotification('No valid text found in external clipboard', 'warning');
                        }
                        return;
                    }
                    
                    const zoom = this.cy.zoom();
                    const anchor = this.getPasteAnchorPosition();
                    const existingIds = new Set(this.cy.nodes().map(node => node.id()));
                    let idCounter = 1;
                    existingIds.forEach((id) => {
                        const match = /^node(\d+)$/.exec(id);
                        if (match) {
                            const numericId = Number(match[1]);
                            if (!Number.isNaN(numericId) && numericId >= idCounter) {
                                idCounter = numericId + 1;
                            }
                        }
                    });
                    const nextNodeId = () => {
                        let nodeId = `node${idCounter}`;
                        while (existingIds.has(nodeId)) {
                            idCounter += 1;
                            nodeId = `node${idCounter}`;
                        }
                        existingIds.add(nodeId);
                        idCounter += 1;
                        return nodeId;
                    };

                    // Create nodes from each line
                    const newNodes = [];
                    const spacing = 100 / zoom; // Distance between nodes in model space
                    const startX = anchor.x - (lines.length - 1) * spacing / 2;

                    const defaultNodeColor = window.QuantickleConfig?.defaultNodeColor || '#ffffff';
                    lines.forEach((line, index) => {
                        const nodeId = nextNodeId();
                        const nodeData = {
                            data: {
                                id: nodeId,
                                label: line.trim(),
                                type: 'default',
                                size: 30,
                                shape: 'round-rectangle',
                                color: defaultNodeColor
                            },
                            position: {
                                x: startX + index * spacing,
                                y: anchor.y
                            }
                        };

                        newNodes.push(nodeData);
                    });

                    const candidateLabels = newNodes
                        .map(nodeData => (typeof nodeData.data?.label === 'string' ? nodeData.data.label.trim() : ''))
                        .filter(Boolean);
                    const { allowDuplicates, duplicatesSet } = this._resolveDuplicateHandling(candidateLabels, 'paste');
                    const existingLabelLookup = this._getCachedLabelSet();
                    const duplicateNodes = allowDuplicates ? [] : this._getNodesByLabelsFromIndex(duplicatesSet);

                    // Temporarily disable layout manager to prevent automatic layout
                    const originalLayoutManager = window.LayoutManager;
                    if (window.LayoutManager) {
                        window.LayoutManager = null;
                    }

                    // Add nodes individually using the working addNode approach

                    const addedNodes = [];

                    this._beginBulkNodeDataUpdate();

                    newNodes.forEach((nodeData) => {
                        const trimmedLabel = typeof nodeData.data?.label === 'string' ? nodeData.data.label.trim() : '';
                        const isDuplicate = trimmedLabel && existingLabelLookup.has(trimmedLabel);
                        if (!allowDuplicates && isDuplicate) {
                            return;
                        }

                        const addResult = this.addNode(
                            nodeData.position.x,
                            nodeData.position.y,
                            nodeData.data.label,
                            nodeData.data.type,
                            nodeData.data.color,
                            nodeData.data.size,
                            null,
                            null,
                            null,
                            '',
                            { bulkUpdate: true, returnData: true }
                        );

                        const node = addResult && addResult.node ? addResult.node : addResult;
                        if (node) {
                            if (trimmedLabel) {
                                existingLabelLookup.add(trimmedLabel);
                            }
                            addedNodes.push(node);
                        }
                    });

                    this._commitBulkNodeDataUpdate();

                    // Restore layout manager
                    if (originalLayoutManager) {
                        window.LayoutManager = originalLayoutManager;
                    }

                    if (window.UI) {
                        window.UI.showNotification(`Added ${addedNodes.length} nodes from external clipboard`, 'success');
                    }

                    this._refreshLabelIndexFromCy();
                    this._selectNodes([...addedNodes, ...duplicateNodes]);
                    // Clear clipboard after using external contents
                    this.clearClipboard();
                } finally {
                    if (manageHistory) {
                        this.resumeHistory();
                        this.saveState();
                    }
                }
            }

        } catch (error) {
            console.error('Error pasting nodes:', error);
            if (window.UI) {
                window.UI.showNotification('Error pasting nodes. Check console for details.', 'error');
            }
        } finally {
            // Clear the flag after paste operation
            this.isPastingNodes = false;
        }
    },

    // Generate unique node ID
    generateNodeId: function() {
        const existingIds = new Set(this.cy.nodes().map(node => node.id()));
        let counter = 1;
        let nodeId = `node${counter}`;
        
        while (existingIds.has(nodeId)) {
            counter++;
            nodeId = `node${counter}`;
        }
        
        return nodeId;
    },

    // LEGACY: 3D Rotation Functions
    // MODULARIZED: These functions are now handled by Rotation3DModule
    currentRotation: { x: 0, y: 0, z: 0 },
    autoRotationId: null,

    // Rotate the graph in 3D space
    rotate3D: function(axis, angle) {
        if (!this.cy) {
            return;
        }

        // Update current rotation
        this.currentRotation[axis] += angle;
        
        // Normalize rotation to 0-360 degrees
        this.currentRotation[axis] = this.currentRotation[axis] % 360;
        if (this.currentRotation[axis] < 0) {
            this.currentRotation[axis] += 360;
        }


        // Apply 3D transformation to the container
        const container = this.cy.container();
        if (container) {
            const transform = `rotateX(${this.currentRotation.x}deg) rotateY(${this.currentRotation.y}deg) rotateZ(${this.currentRotation.z}deg)`;
            container.style.transform = transform;
            container.style.transformStyle = 'preserve-3d';
            container.style.perspective = '1000px';
        }

        // Show notification
        if (window.UI && window.UI.showNotification) {
            window.UI.showNotification(`Rotated ${axis.toUpperCase()} by ${angle}°`, 'info');
        }
    },

    // Start auto-rotation (delegates to 3D Globe layout)
    startAutoRotation: function() {
        if (window.GlobeLayout3D && window.GlobeLayout3D.isActive) {
            window.GlobeLayout3D.startAutoRotation();
        } else {
        }
    },

    // Stop auto-rotation (delegates to 3D Globe layout)
    stopAutoRotation: function() {
        if (window.GlobeLayout3D) {
            window.GlobeLayout3D.stopAutoRotation();
        }
    },

    // Reset 3D rotation to default
    reset3DRotation: function() {
        if (!this.cy) {
            return;
        }


        // Reset rotation values
        this.currentRotation = { x: 0, y: 0, z: 0 };

        // Reset container transformation
        const container = this.cy.container();
        if (container) {
            container.style.transform = 'none';
            container.style.transformStyle = 'flat';
            container.style.perspective = 'none';
        }

        // Show notification
        if (window.UI && window.UI.showNotification) {
            window.UI.showNotification('3D rotation reset', 'info');
        }
    },

    // Get current 3D rotation
    get3DRotation: function() {
        return { ...this.currentRotation };
    },

    // ========================================
    // MODULARIZATION COMPLETE
    // ========================================
    // The following functions have been extracted to modular components:
    //
    // 1. DebugTools: debugContainer, debugNodes, debugAll, etc.
    // 2. PerformanceManager: checkMemoryUsage, setupPerformanceMonitoring, etc.
    // 3. GraphStyling: applyTheme, applyNodeStyles, etc.
    // 4. GraphControls: fitGraph, centerGraph, getCurrentZoom, etc.
    // 5. SelectionManager: selectAll, clearSelection, invertSelection, etc.
    // 6. GraphEditor: addNode, deleteSelected, copySelected, pasteNodes, etc.
    // 7. EdgeCreator: startEdgeCreation, cancelEdgeCreation, etc.
    // 8. LODManager: determineLODLevel, applyAggressiveLOD, etc.
    // 9. ProgressManager: showLoadingProgress, updateLoadingProgress, etc.
    // 10. 3DRotationManager: rotate3D, startAutoRotation, reset3DRotation, etc.
    //
    // All modular versions are enabled by default and provide enhanced functionality.
    // Legacy functions are commented out but preserved for reference.
    
    // Utility function to lighten a color for better icon visibility
    lightenColor: function(color, amount) {
        if (!color) return '#ffffff';
        
        // Convert color to RGB
        let r, g, b;
        if (color.startsWith('#')) {
            // Hex color
            const hex = color.replace('#', '');
            if (hex.length === 3) {
                r = parseInt(hex[0] + hex[0], 16);
                g = parseInt(hex[1] + hex[1], 16);
                b = parseInt(hex[2] + hex[2], 16);
            } else {
                r = parseInt(hex.substr(0, 2), 16);
                g = parseInt(hex.substr(2, 2), 16);
                b = parseInt(hex.substr(4, 2), 16);
            }
        } else if (color.startsWith('rgb')) {
            // RGB color
            const values = color.match(/\d+/g);
            r = parseInt(values[0]);
            g = parseInt(values[1]);
            b = parseInt(values[2]);
        } else {
            // Unknown format, return white
            return '#ffffff';
        }
        
        // Lighten by interpolating towards white
        r = Math.round(r + (255 - r) * amount);
        g = Math.round(g + (255 - g) * amount);
        b = Math.round(b + (255 - b) * amount);
        
        // Convert back to hex
        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    },

    // Measure text dimensions for auto-sizing text nodes
    // maxWidth represents the desired node width, including padding
    calculateTextDimensions: function(text, fontFamily, fontSize, maxWidth = 200) {
        const textMax = (maxWidth || 200) - 20; // account for padding
        const canvas = this._measureCanvas || (this._measureCanvas = document.createElement('canvas'));
        const ctx = canvas.getContext('2d');
        if (ctx && ctx.font && ctx.measureText) {
            ctx.font = `${fontSize}px ${fontFamily}`;
            const words = (text || '').split(/\s+/);
            let line = '';
            let lines = 1;
            let maxLineWidth = 0;
            words.forEach(word => {
                const testLine = line ? line + ' ' + word : word;
                const testWidth = ctx.measureText(testLine).width;
                if (testWidth > textMax && line) {
                    maxLineWidth = Math.max(maxLineWidth, ctx.measureText(line).width);
                    line = word;
                    lines++;
                } else {
                    line = testLine;
                    maxLineWidth = Math.max(maxLineWidth, testWidth);
                }
            });
            maxLineWidth = Math.max(maxLineWidth, ctx.measureText(line).width);
            const width = Math.min(textMax, maxLineWidth) + 20;
            const lineHeight = fontSize * 1.2;
            const height = lines * lineHeight + 20;
            return { width, height };
        }
        // Fallback estimation if canvas context isn't available
        const approxCharWidth = fontSize * 0.6;
        const maxCharsPerLine = Math.max(1, Math.floor(textMax / approxCharWidth));
        const words = (text || '').split(/\s+/);
        let lineChars = 0;
        let lines = 1;
        words.forEach(word => {
            const wordLen = word.length;
            if ((lineChars ? lineChars + 1 : 0) + wordLen > maxCharsPerLine && lineChars > 0) {
                lines++;
                lineChars = wordLen;
            } else {
                lineChars += (lineChars ? 1 : 0) + wordLen;
            }
        });
        const width = Math.min(textMax, maxCharsPerLine * approxCharWidth) + 20;
        const lineHeight = fontSize * 1.2;
        const height = lines * lineHeight + 20;
        return { width, height };
    },

    _sanitizeNumber(value, fallback, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
        const parsed = typeof value === 'string' ? parseFloat(value) : value;
        if (Number.isFinite(parsed)) {
            return Math.min(max, Math.max(min, parsed));
        }
        return fallback;
    },

    _getImageLegendText(nodeData) {
        if (!nodeData) {
            return '';
        }
        const info = typeof nodeData.info === 'string' ? nodeData.info.trim() : '';
        if (info) {
            return info;
        }
        const label = typeof nodeData.label === 'string' ? nodeData.label.trim() : '';
        return label;
    },

    _getRequestedImageWidth(nodeData, typeSettings = {}) {
        const candidates = [
            nodeData?.imageRequestedWidth,
            nodeData?.imageWidth,
            nodeData?.width,
            typeSettings?.imageWidth,
            typeSettings?.size
        ];
        for (const candidate of candidates) {
            const parsed = this._sanitizeNumber(candidate, null, 40, 1200);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
        return 240;
    },

    _getImagePadding(nodeData, typeSettings = {}) {
        const candidates = [
            nodeData?.imagePadding,
            nodeData?.padding,
            typeSettings?.imagePadding,
            typeSettings?.padding
        ];
        for (const candidate of candidates) {
            const parsed = this._sanitizeNumber(candidate, null, 0, 200);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
        return 16;
    },

    _getLegendFontSize(nodeData, typeSettings = {}) {
        const candidates = [
            nodeData?.legendFontSize,
            nodeData?.fontSize,
            typeSettings?.legendFontSize,
            typeSettings?.fontSize
        ];
        for (const candidate of candidates) {
            const parsed = this._sanitizeNumber(candidate, null, 8, 48);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
        return 13;
    },

    getImageAspectRatio(iconValue, fallbackRatio = 1.5) {
        const resolved = this.extractIconUrl(iconValue);
        if (!resolved) {
            return fallbackRatio;
        }

        if (this._imageDimensionCache.has(resolved)) {
            const cached = this._imageDimensionCache.get(resolved);
            if (cached && Number.isFinite(cached.width) && Number.isFinite(cached.height) && cached.height > 0) {
                return cached.width / cached.height;
            }
        }

        this._queueImageDimensionFetch(resolved);
        return fallbackRatio;
    },

    calculateImageNodeLayout(options = {}) {
        const legendText = typeof options.legendText === 'string' ? options.legendText.trim() : '';
        const legendFontFamily = typeof options.legendFontFamily === 'string'
            ? options.legendFontFamily
            : 'Inter, "Segoe UI", sans-serif';
        const legendFontSize = this._sanitizeNumber(options.legendFontSize, 13, 8, 48);
        const padding = this._sanitizeNumber(options.padding, 16, 0, 120);
        const requestedWidth = this._sanitizeNumber(options.requestedWidth, 240, 60, 1200);
        const fallbackAspectRatio = this._sanitizeNumber(options.fallbackAspectRatio, 1.5, 0.1, 5) || 1.5;
        const aspectRatio = this.getImageAspectRatio(options.iconValue, fallbackAspectRatio) || fallbackAspectRatio;
        const contentWidth = Math.max(40, requestedWidth - padding * 2);
        const imageHeight = contentWidth / (aspectRatio || 1.5);
        const legendMetrics = legendText
            ? this.calculateTextDimensions(legendText, legendFontFamily, legendFontSize, contentWidth)
            : { width: 0, height: 0 };
        const textWidth = Math.max(contentWidth, legendMetrics.width || 0);
        const textHeight = legendMetrics.height || (legendText ? legendFontSize * 1.3 : 0);
        const totalWidth = textWidth + padding * 2;
        const totalHeight = imageHeight + textHeight + padding * 2;
        const backgroundCoverage = totalHeight > 0
            ? Math.max(0.25, Math.min(1, (imageHeight + padding) / totalHeight))
            : 1;
        const legendMarginY = legendText ? Math.max(8, padding * 0.4) : 0;
        const legendBackgroundPadding = legendText
            ? Math.round(Math.max(6, padding * 0.5))
            : 0;

        return {
            legendText,
            legendFontFamily,
            legendFontSize,
            legendColor: typeof options.legendColor === 'string'
                ? options.legendColor
                : '#111827',
            legendBackgroundColor: typeof options.legendBackgroundColor === 'string'
                ? options.legendBackgroundColor
                : '#ffffff',
            legendBackgroundOpacity: this._sanitizeNumber(options.legendBackgroundOpacity, 0.85, 0, 1),
            padding,
            width: totalWidth,
            height: totalHeight,
            size: Math.max(totalWidth, totalHeight),
            textWidth,
            backgroundHeight: `${Math.round(backgroundCoverage * 100)}%`,
            aspectRatio,
            legendMarginY,
            legendBackgroundPadding,
            requestedWidth
        };
    },

    configureImageNodeData(nodeData, typeSettings = {}) {
        if (!nodeData) {
            return;
        }

        const legendText = this._getImageLegendText(nodeData);
        const backgroundColor = nodeData.backgroundColor || typeSettings.backgroundColor || nodeData.color || '#ffffff';
        nodeData.backgroundColor = backgroundColor;
        nodeData.color = backgroundColor;
        nodeData.borderColor = nodeData.borderColor || typeSettings.borderColor || '#d1d5db';
        nodeData.borderWidth = nodeData.borderWidth || typeSettings.borderWidth || 1;
        const layout = this.calculateImageNodeLayout({
            legendText,
            iconValue: nodeData.icon || typeSettings.icon || nodeData.backgroundImage,
            requestedWidth: this._getRequestedImageWidth(nodeData, typeSettings),
            padding: this._getImagePadding(nodeData, typeSettings),
            legendFontFamily: nodeData.legendFontFamily || typeSettings.legendFontFamily,
            legendFontSize: this._getLegendFontSize(nodeData, typeSettings),
            legendColor: nodeData.legendColor || nodeData.labelColor || typeSettings.legendColor,
            legendBackgroundColor: nodeData.legendBackgroundColor || typeSettings.legendBackgroundColor,
            legendBackgroundOpacity: nodeData.legendBackgroundOpacity ?? typeSettings.legendBackgroundOpacity,
            fallbackAspectRatio: nodeData.imageAspectRatio || typeSettings.defaultAspectRatio || 1.5
        });

        nodeData.imageRequestedWidth = layout.requestedWidth;
        nodeData.width = layout.width;
        nodeData.height = layout.height;
        nodeData.size = layout.size;
        nodeData.label = layout.legendText || legendText;
        nodeData.labelColor = layout.legendColor;
        nodeData.legendFontSize = layout.legendFontSize;
        nodeData.legendFontFamily = layout.legendFontFamily;
        nodeData.legendColor = layout.legendColor;
        nodeData.legendBackgroundColor = layout.legendBackgroundColor;
        nodeData.legendBackgroundOpacity = layout.legendBackgroundOpacity;
        nodeData.imagePadding = layout.padding;
        nodeData.imageTextWidth = layout.textWidth;
        nodeData.imageBackgroundHeight = layout.backgroundHeight;
        nodeData.legendMarginY = layout.legendMarginY;
        nodeData.legendBackgroundPadding = layout.legendBackgroundPadding;
        nodeData.imageAspectRatio = layout.aspectRatio;
        nodeData.labelVisible = legendText.length > 0;
    },

    configureImageNodeElement(node, typeSettings = {}) {
        if (!node || typeof node.data !== 'function') {
            return;
        }

        const nodeData = node.data();
        const legendText = this._getImageLegendText(nodeData);
        const backgroundColor = nodeData.backgroundColor || typeSettings.backgroundColor || nodeData.color || '#ffffff';
        const borderColor = nodeData.borderColor || typeSettings.borderColor || '#d1d5db';
        const borderWidth = nodeData.borderWidth || typeSettings.borderWidth || 1;
        const layout = this.calculateImageNodeLayout({
            legendText,
            iconValue: nodeData.icon || typeSettings.icon || nodeData.backgroundImage,
            requestedWidth: this._getRequestedImageWidth(nodeData, typeSettings),
            padding: this._getImagePadding(nodeData, typeSettings),
            legendFontFamily: nodeData.legendFontFamily || typeSettings.legendFontFamily,
            legendFontSize: this._getLegendFontSize(nodeData, typeSettings),
            legendColor: nodeData.legendColor || nodeData.labelColor || typeSettings.legendColor,
            legendBackgroundColor: nodeData.legendBackgroundColor || typeSettings.legendBackgroundColor,
            legendBackgroundOpacity: nodeData.legendBackgroundOpacity ?? typeSettings.legendBackgroundOpacity,
            fallbackAspectRatio: nodeData.imageAspectRatio || typeSettings.defaultAspectRatio || 1.5
        });

        const updates = {
            imageRequestedWidth: layout.requestedWidth,
            width: layout.width,
            height: layout.height,
            size: layout.size,
            label: layout.legendText || legendText,
            labelColor: layout.legendColor,
            legendFontSize: layout.legendFontSize,
            legendFontFamily: layout.legendFontFamily,
            legendColor: layout.legendColor,
            legendBackgroundColor: layout.legendBackgroundColor,
            legendBackgroundOpacity: layout.legendBackgroundOpacity,
            imagePadding: layout.padding,
            imageTextWidth: layout.textWidth,
            imageBackgroundHeight: layout.backgroundHeight,
            legendMarginY: layout.legendMarginY,
            legendBackgroundPadding: layout.legendBackgroundPadding,
            imageAspectRatio: layout.aspectRatio,
            labelVisible: legendText.length > 0,
            backgroundColor,
            color: backgroundColor,
            borderColor,
            borderWidth
        };

        Object.entries(updates).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                node.data(key, value);
            }
        });
    },

    _queueImageDimensionFetch(iconUrl) {
        if (!iconUrl || typeof Image === 'undefined') {
            return;
        }
        if (this._pendingImageDimensionRequests.has(iconUrl)) {
            return;
        }

        const promise = new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                const width = img.naturalWidth || img.width;
                const height = img.naturalHeight || img.height;
                if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
                    resolve({ width, height });
                } else {
                    resolve(null);
                }
            };
            img.onerror = () => resolve(null);
            img.src = iconUrl;
        }).then(dimensions => {
            if (dimensions) {
                this._imageDimensionCache.set(iconUrl, dimensions);
                this.refreshImageNodesForIcon(iconUrl);
            }
        }).catch(() => {
        }).finally(() => {
            this._pendingImageDimensionRequests.delete(iconUrl);
        });

        this._pendingImageDimensionRequests.set(iconUrl, promise);
    },

    refreshImageNodesForIcon(iconUrl) {
        if (!iconUrl || !this.cy || typeof this.cy.nodes !== 'function') {
            return;
        }

        const nodes = this.cy.nodes('[type = "image"]');
        if (!nodes || nodes.length === 0) {
            return;
        }

        const typeSettings = (window.NodeTypes && window.NodeTypes.image) || {};
        nodes.forEach(node => {
            if (!node || typeof node.data !== 'function') {
                return;
            }
            const iconValue = node.data('icon');
            const resolved = this.extractIconUrl(iconValue);
            if (resolved === iconUrl) {
                this.configureImageNodeElement(node, typeSettings);
            }
        });
    },

    // Normalize node data to ensure proper styling
    normalizeNodeData: function(nodeElement, options = {}) {
        const nodeData = nodeElement.data;
        const nodeType = nodeData.type || 'default';
        const defaultNodeColor = window.QuantickleConfig?.defaultNodeColor || '#ffffff';
        
        // Get type settings with robust fallback
        let typeSettings = null;
        if (window.NodeTypes && window.NodeTypes[nodeType]) {
            typeSettings = window.NodeTypes[nodeType];
        } else if (window.NodeTypes && window.NodeTypes.default) {
            typeSettings = window.NodeTypes.default;
        } else {
            // Ultimate fallback if even default doesn't exist
            typeSettings = {
                color: defaultNodeColor,
                size: 30,
                shape: 'round-rectangle',
                icon: ''
            };
        }
        
        // Ensure basic data attributes exist with defaults
        if (!nodeData.color) {
            nodeData.color = typeSettings.color || defaultNodeColor;
        }
        
        if (!nodeData.size) {
            nodeData.size = typeSettings.size || 20;
        }
        
        if (!nodeData.shape) {
            nodeData.shape = typeSettings.shape || 'round-rectangle';
        }
        
        // Handle icon/background image - preserve existing icon if present and respect LOD hiding flag
        const iconHiddenDueToLOD = nodeData.iconHiddenDueToLOD === true;
        const existingIcon = typeof nodeData.icon === 'string' ? nodeData.icon.trim() : '';
        let iconToUse = existingIcon;

        if ((!iconToUse || iconToUse === '') && !iconHiddenDueToLOD) {
            iconToUse = typeof typeSettings?.icon === 'string' ? typeSettings.icon.trim() : '';
        }

        let backgroundImageData = 'none';
        if (!iconHiddenDueToLOD && iconToUse) {
            const resolved = this.resolveBackgroundImage(iconToUse);
            if (resolved) {
                backgroundImageData = resolved;
            }
        }

        nodeData.icon = iconHiddenDueToLOD ? '' : iconToUse;
        nodeData.backgroundImage = iconHiddenDueToLOD ? 'none' : backgroundImageData;

        if (nodeType === 'container') {
            nodeData.width = nodeData.width || nodeData.size || 200;
            nodeData.height = nodeData.height || nodeData.size || 200;
            nodeData.size = Math.max(nodeData.width, nodeData.height);
        }

        if (nodeType === 'image') {
            const imageSettings = (window.NodeTypes && window.NodeTypes.image) || typeSettings || {};
            this.configureImageNodeData(nodeData, imageSettings);
        }

        if (nodeType === 'text') {
            nodeData.fontFamily = nodeData.fontFamily || typeSettings.fontFamily || 'Arial';
            nodeData.fontSize = nodeData.fontSize || typeSettings.fontSize || 14;
            nodeData.fontColor = nodeData.fontColor || typeSettings.fontColor || '#333333';
            nodeData.bold = nodeData.bold !== undefined ? nodeData.bold : (typeSettings.bold || false);
            nodeData.italic = nodeData.italic !== undefined ? nodeData.italic : (typeSettings.italic || false);
            let backgroundColor = nodeData.backgroundColor;
            const isTransparent = value => {
                if (!value) return true;
                const normalized = String(value).trim().toLowerCase();
                return !normalized || normalized === 'transparent' || normalized === 'rgba(0,0,0,0)';
            };
            if (isTransparent(backgroundColor)) {
                const colorCandidate = nodeData.color;
                if (!isTransparent(colorCandidate)) {
                    backgroundColor = colorCandidate;
                }
            }
            if (isTransparent(backgroundColor)) {
                backgroundColor = typeSettings.backgroundColor || '#ffffff';
            }
            nodeData.backgroundColor = backgroundColor;
            if (!nodeData.color || isTransparent(nodeData.color)) {
                nodeData.color = nodeData.backgroundColor;
            }
            if (nodeData.backgroundOpacity === undefined) {
                const defaultOpacity = typeSettings.backgroundOpacity;
                if (defaultOpacity !== undefined) {
                    nodeData.backgroundOpacity = defaultOpacity;
                }
            }
            if (nodeData.backgroundOpacity !== undefined) {
                const parsedOpacity = parseFloat(nodeData.backgroundOpacity);
                if (Number.isFinite(parsedOpacity)) {
                    nodeData.backgroundOpacity = Math.max(0, Math.min(1, parsedOpacity));
                } else {
                    delete nodeData.backgroundOpacity;
                }
            }
            const defaultCornerRadius = typeSettings.cornerRadius;
            if (nodeData.cornerRadius === undefined && defaultCornerRadius !== undefined) {
                nodeData.cornerRadius = defaultCornerRadius;
            }
            if (nodeData.cornerRadius !== undefined) {
                const parsedCornerRadius = parseFloat(nodeData.cornerRadius);
                if (Number.isFinite(parsedCornerRadius)) {
                    nodeData.cornerRadius = parsedCornerRadius;
                } else {
                    delete nodeData.cornerRadius;
                }
            }
            const defaultPadding = typeSettings.padding;
            if (nodeData.padding === undefined && defaultPadding !== undefined) {
                nodeData.padding = defaultPadding;
            }
            if (nodeData.padding !== undefined) {
                const parsedPadding = parseFloat(nodeData.padding);
                if (Number.isFinite(parsedPadding)) {
                    nodeData.padding = parsedPadding;
                } else {
                    delete nodeData.padding;
                }
            }
            if (nodeData.boxShadow === undefined && typeSettings.boxShadow !== undefined) {
                nodeData.boxShadow = typeSettings.boxShadow;
            }

            // Keep structured callout titles in the node label and size the node using the callout body
            const getString = (value) => (typeof value === 'string' ? value : '');
            const calloutUtils = window.QuantickleUtils || {};
            let calloutTitle = getString(nodeData.calloutTitle);
            let calloutBody = getString(nodeData.calloutBody);
            if ((!calloutTitle || !calloutBody) && typeof calloutUtils.normalizeCalloutPayload === 'function') {
                const normalizedCallout = calloutUtils.normalizeCalloutPayload(nodeData.callout, { defaultFormat: 'text' }) || {};
                if (!calloutTitle && typeof normalizedCallout.title === 'string' && normalizedCallout.title.trim()) {
                    calloutTitle = normalizedCallout.title;
                }
                if (!calloutBody && typeof normalizedCallout.body === 'string' && normalizedCallout.body) {
                    calloutBody = normalizedCallout.body;
                }
            }
            if (!nodeData.info && calloutBody) {
                nodeData.info = calloutBody;
            }
            const infoText = getString(nodeData.info);
            const existingLabel = getString(nodeData.label);
            const trimmedExistingLabel = existingLabel.trim();
            const trimmedInfo = infoText.trim();
            const trimmedCalloutTitle = calloutTitle.trim();
            if (!trimmedExistingLabel) {
                nodeData.label = trimmedCalloutTitle || infoText || '';
            } else if (trimmedCalloutTitle && trimmedInfo && trimmedExistingLabel === trimmedInfo) {
                nodeData.label = trimmedCalloutTitle;
            }
            nodeData.labelVisible = true;
            // Respect existing width or use layout-based sizing
            const preserveExplicitDimensions = options?.preserveExplicitDimensions === true;
            const layoutSizing = (window.LayoutManager &&
                typeof window.LayoutManager.calculateOptimalSizing === 'function' &&
                this.cy)
                ? window.LayoutManager.calculateOptimalSizing(this.cy)
                : null;
            const explicitWidth = nodeData.width;
            const hasExplicitWidth = explicitWidth !== undefined && explicitWidth !== null && explicitWidth !== '';
            const parsedExplicitWidth = hasExplicitWidth ? parseFloat(explicitWidth) : undefined;
            const explicitWidthIsValid = Number.isFinite(parsedExplicitWidth) && parsedExplicitWidth > 0;

            const explicitHeight = nodeData.height;
            const hasExplicitHeight = explicitHeight !== undefined && explicitHeight !== null && explicitHeight !== '';
            const parsedExplicitHeight = hasExplicitHeight ? parseFloat(explicitHeight) : undefined;
            const explicitHeightIsValid = Number.isFinite(parsedExplicitHeight) && parsedExplicitHeight > 0;

            const textWidthMode = typeof nodeData.textWidthMode === 'string' ? nodeData.textWidthMode.trim().toLowerCase() : '';
            const textHeightMode = typeof nodeData.textHeightMode === 'string' ? nodeData.textHeightMode.trim().toLowerCase() : '';
            const widthIsFixed = textWidthMode === 'fixed';
            const heightIsFixed = textHeightMode === 'fixed';

            const rawCalloutScale = parseFloat(nodeData.calloutScale);
            if (Number.isFinite(rawCalloutScale) && rawCalloutScale > 0) {
                nodeData.calloutScale = Math.max(0.1, Math.min(6, rawCalloutScale));
            } else {
                nodeData.calloutScale = 1;
            }

            const calibrationZoomRaw = parseFloat(nodeData.calloutDimensionZoom);
            const hasCalibrationZoom = Number.isFinite(calibrationZoomRaw) && calibrationZoomRaw > 0;
            const viewportZoomRaw = this.cy && typeof this.cy.zoom === 'function'
                ? this.cy.zoom()
                : 1;
            const viewportZoom = Number.isFinite(viewportZoomRaw) && viewportZoomRaw > 0 ? viewportZoomRaw : 1;
            const expectedSource = 'text-callout';
            const calibrationSource = typeof nodeData.calloutDimensionSource === 'string'
                ? nodeData.calloutDimensionSource.trim().toLowerCase()
                : '';
            const hasCalibrationSource = calibrationSource === expectedSource;
            const shouldApplyCalibration = hasCalibrationZoom && hasCalibrationSource;
            const calibrationScale = shouldApplyCalibration ? (viewportZoom / calibrationZoomRaw) : 1;

            let normalizedExplicitWidth = parsedExplicitWidth;
            let normalizedExplicitHeight = parsedExplicitHeight;
            if (shouldApplyCalibration) {
                if (explicitWidthIsValid && !widthIsFixed) {
                    normalizedExplicitWidth = parsedExplicitWidth * calibrationScale;
                }
                if (explicitHeightIsValid && !heightIsFixed) {
                    normalizedExplicitHeight = parsedExplicitHeight * calibrationScale;
                }
            }

            const normalizedWidthIsValid = Number.isFinite(normalizedExplicitWidth) && normalizedExplicitWidth > 0;
            const normalizedHeightIsValid = Number.isFinite(normalizedExplicitHeight) && normalizedExplicitHeight > 0;

            const fallbackWidth = layoutSizing?.nodeSize || 100;
            const widthForMeasurement = normalizedWidthIsValid ? normalizedExplicitWidth : fallbackWidth;
            const textSource = trimmedInfo || nodeData.label || '';
            const hasValidExplicitDimensions = normalizedWidthIsValid && normalizedHeightIsValid;
            const shouldPreserveDimensions = preserveExplicitDimensions && hasValidExplicitDimensions;
            const requiresMeasurement = !hasValidExplicitDimensions;
            const measuredDims = requiresMeasurement
                ? this.calculateTextDimensions(
                    textSource,
                    nodeData.fontFamily,
                    nodeData.fontSize,
                    widthForMeasurement
                )
                : null;
            const finalWidth = shouldPreserveDimensions || normalizedWidthIsValid
                ? normalizedExplicitWidth
                : measuredDims.width;
            const finalHeight = shouldPreserveDimensions || normalizedHeightIsValid
                ? normalizedExplicitHeight
                : measuredDims.height;
            nodeData.width = finalWidth;
            nodeData.height = finalHeight;
            nodeData.size = Math.max(finalWidth, finalHeight);
            if (nodeData.preserveAspectRatio === undefined) {
                nodeData.preserveAspectRatio = true;
            }
            if (shouldApplyCalibration
                && (!widthIsFixed || !heightIsFixed)
                && Number.isFinite(finalWidth) && finalWidth > 0
                && Number.isFinite(finalHeight) && finalHeight > 0) {
                nodeData.aspectRatio = finalWidth / finalHeight;
            } else if (!nodeData.aspectRatio && finalHeight > 0) {
                nodeData.aspectRatio = finalWidth / finalHeight;
            }
            if (shouldApplyCalibration) {
                nodeData.calloutDimensionZoom = viewportZoom;
            }
            nodeData.borderColor = nodeData.borderColor || typeSettings.borderColor || '#000000';
            nodeData.borderWidth = nodeData.borderWidth || typeSettings.borderWidth || 1;
        }

        if (nodeType === 'magnifier') {
            nodeData.zoom = nodeData.zoom || typeSettings.zoom || 2;
            nodeData.borderColor = nodeData.borderColor || typeSettings.borderColor || '#999999';
            nodeData.borderWidth = nodeData.borderWidth || typeSettings.borderWidth || 1;
            nodeData.color = 'rgba(0,0,0,0)';
        }
        
    },

    normalizeNodeCollection: function(nodeCollection, options = {}) {
        if (!nodeCollection) {
            return;
        }

        const nodes = [];
        if (Array.isArray(nodeCollection)) {
            nodeCollection.forEach(node => {
                if (node) nodes.push(node);
            });
        } else if (typeof nodeCollection.forEach === 'function') {
            nodeCollection.forEach(node => {
                if (node) nodes.push(node);
            });
        } else if (typeof nodeCollection.length === 'number') {
            for (let i = 0; i < nodeCollection.length; i++) {
                const node = nodeCollection[i];
                if (node) nodes.push(node);
            }
        }

        if (nodes.length === 0) {
            return;
        }

        nodes.forEach(node => {
            if (!node || typeof node.data !== 'function') {
                return;
            }

            const nodeType = node.data('type') || 'default';

            // Enhanced debugging for specific types
            if (nodeType === 'malware' || nodeType === 'domain' || nodeType.includes('cyber')) {
                if (window.NodeTypes?.[nodeType]) {
                }
            }

            // Get type settings with robust fallback
            let typeSettings = null;
            if (window.NodeTypes && window.NodeTypes[nodeType]) {
                typeSettings = window.NodeTypes[nodeType];
                if (nodeType === 'malware' || nodeType === 'domain') {
                }
            } else if (window.NodeTypes && window.NodeTypes.default) {
                typeSettings = window.NodeTypes.default;
            } else {
                // Ultimate fallback if even default doesn't exist
                typeSettings = {
                    color: globalDefaultColor,
                    size: 30,
                    shape: 'round-rectangle',
                    icon: ''
                };
            }

            // Set data attributes - preserve explicit values from CSV, use defaults only when missing
            const existingColor = node.data('color');
            const existingSize = node.data('size');
            const existingShape = node.data('shape');
            const existingBackgroundFit = node.data('backgroundFit');

            const defaultColor = (typeSettings && typeSettings.color) || globalDefaultColor;
            const defaultSize = (typeSettings && typeSettings.size) || 30;
            const defaultShape = (typeSettings && typeSettings.shape) || 'round-rectangle';
            const defaultBackgroundFit = this.resolveBackgroundFitForType(nodeType);

            // Only set defaults if no explicit value exists (preserve CSV colors/sizes)
            if (!existingColor) {
                node.data('color', defaultColor);
            }
            if (!existingSize) {
                node.data('size', defaultSize);
            }
            if (!existingShape) {
                node.data('shape', defaultShape);
            }
            if (!existingBackgroundFit) {
                node.data('backgroundFit', defaultBackgroundFit);
            }

            // Ensure container nodes handle collapse state
            if (typeof node.hasClass === 'function' && node.hasClass('container')) {
                let baseLabel = node.data('baseLabel') || node.data('label') || '';
                baseLabel = baseLabel.replace(/\s*[\u25B6\u25BC]\s*$/, '');
                node.data('baseLabel', baseLabel);
                const collapsed = !!node.data('collapsed');
                let displayLabel = baseLabel;
                if (collapsed) {
                    if (displayLabel.length > 40) {
                        displayLabel = displayLabel.slice(0, 40);
                    }
                } else {
                    node.removeData('collapsed');
                }
                node.data('label', displayLabel);
            }


            // Handle background image for icons - preserve existing icon if present and respect LOD hiding flag
            const iconHiddenDueToLOD = node.data('iconHiddenDueToLOD') === true;
            const existingIcon = typeof node.data('icon') === 'string' ? node.data('icon').trim() : '';
            let iconToUse = existingIcon;

            if ((!iconToUse || iconToUse === '') && !iconHiddenDueToLOD) {
                iconToUse = typeof typeSettings?.icon === 'string' ? typeSettings.icon.trim() : '';
            }

            let backgroundImageData = 'none';
            if (!iconHiddenDueToLOD && iconToUse) {
                const resolved = this.resolveBackgroundImage(iconToUse);
                if (resolved) {
                    backgroundImageData = resolved;
                }
            }

            node.data('backgroundImage', iconHiddenDueToLOD ? 'none' : backgroundImageData);
            node.data('icon', iconHiddenDueToLOD ? '' : iconToUse);

            if (nodeType === 'image') {
                const imageSettings = (window.NodeTypes && window.NodeTypes.image) || typeSettings || {};
                this.configureImageNodeElement(node, imageSettings);
            }
        });

        // Apply styles using the SAME method as the working node editor
        nodes.forEach(node => {
            if (!node || typeof node.data !== 'function') {
                return;
            }

            const parseDimension = (value) => {
                if (value === null || value === undefined || value === '') {
                    return NaN;
                }
                if (typeof value === 'number') {
                    return Number.isFinite(value) ? value : NaN;
                }
                if (typeof value === 'string') {
                    const trimmed = value.trim();
                    if (!trimmed) {
                        return NaN;
                    }
                    const parsed = parseFloat(trimmed);
                    return Number.isFinite(parsed) ? parsed : NaN;
                }
                return NaN;
            };

            let shape = node.data('shape');
            let color = node.data('color');
            let size = node.data('size');
            const nodeType = node.data('type');
            const existingLabelColor = node.data('labelColor') || node.data('fontColor');
            const isTimelineScaffolding = nodeType === 'timeline-bar' ||
                nodeType === 'timeline-anchor' ||
                nodeType === 'timeline-tick';
            const explicitWidth = parseDimension(node.data('width'));
            const explicitHeight = parseDimension(node.data('height'));
            const hasExplicitWidth = Number.isFinite(explicitWidth) && explicitWidth > 0;
            const hasExplicitHeight = Number.isFinite(explicitHeight) && explicitHeight > 0;
            const parsedSize = parseDimension(size);
            const hasParsedSize = Number.isFinite(parsedSize) && parsedSize > 0;

            const isGraphLikeNode = nodeType === 'graph' || nodeType === 'graph-return';
            if (isGraphLikeNode) {
                const parseNumeric = (value) => {
                    if (value === null || value === undefined || value === '') {
                        return NaN;
                    }

                    if (typeof value === 'number') {
                        return Number.isFinite(value) ? value : NaN;
                    }

                    const parsed = parseFloat(value);
                    return Number.isFinite(parsed) ? parsed : NaN;
                };

                const enforcedColor = '#ede9fe';
                const enforcedBorderColor = '#c4b5fd';
                const enforcedTextColor = existingLabelColor || '#312e81';
                const rawSize = parseNumeric(size);
                const enforcedSize = Number.isFinite(rawSize) ? Math.max(rawSize, 80) : 80;
                const rawWidth = parseNumeric(node.data('width'));
                const rawHeight = parseNumeric(node.data('height'));
                const rawBorderWidth = parseNumeric(node.data('borderWidth'));
                const enforcedBorderWidth = Number.isFinite(rawBorderWidth) ? Math.max(rawBorderWidth, 4) : 4;
                const enforcedWidth = Number.isFinite(rawWidth) ? Math.max(rawWidth, enforcedSize, 80) : enforcedSize;
                const enforcedHeight = Number.isFinite(rawHeight) ? Math.max(rawHeight, enforcedSize, 80) : enforcedSize;
                const isBold = node.data('bold');
                const fontWeight = isBold === false ? 'normal' : 'bold';

                const normalizeGraphBackground = (value) => {
                    if (!value || typeof value !== 'string') {
                        return null;
                    }

                    const trimmed = value.trim();
                    if (!trimmed || trimmed.toLowerCase() === 'none') {
                        return null;
                    }

                    return this.resolveBackgroundImage(trimmed) || this.buildBackgroundImage(trimmed);
                };

                let enforcedBackgroundImage = null;
                const enforcedBackgroundFit = this.resolveBackgroundFitValue(
                    node.data('backgroundFit'),
                    this.resolveBackgroundFitForType(nodeType)
                );
                const graphNodeDefaults = window.NodeTypes?.[nodeType] || window.NodeTypes?.graph || {};
                const candidateBackgrounds = [
                    node.data('backgroundImage'),
                    node.data('icon'),
                    graphNodeDefaults.icon,
                    window.NodeTypes?.graph?.icon
                ];

                for (const candidate of candidateBackgrounds) {
                    const normalized = normalizeGraphBackground(candidate);
                    if (normalized) {
                        enforcedBackgroundImage = normalized;
                        break;
                    }
                }

                const resolvedIcon = (() => {
                    const iconData = node.data('icon');
                    if (typeof iconData === 'string' && iconData.trim()) {
                        return iconData.trim();
                    }

                    if (typeof graphNodeDefaults.icon === 'string' && graphNodeDefaults.icon.trim()) {
                        return graphNodeDefaults.icon.trim();
                    }

                    if (typeof window.NodeTypes?.graph?.icon === 'string' && window.NodeTypes.graph.icon.trim()) {
                        return window.NodeTypes.graph.icon.trim();
                    }

                    return null;
                })();

                color = enforcedColor;
                size = enforcedSize;
                shape = 'round-rectangle';

                node.data('color', enforcedColor);
                node.data('backgroundColor', enforcedColor);
                node.data('borderColor', enforcedBorderColor);
                node.data('borderWidth', enforcedBorderWidth);
                node.data('size', enforcedSize);
                node.data('width', enforcedWidth);
                node.data('height', enforcedHeight);
                node.data('shape', 'round-rectangle');
                node.data('fontColor', enforcedTextColor);
                node.data('labelColor', enforcedTextColor);
                if (resolvedIcon) {
                    node.data('icon', resolvedIcon);
                }
                node.data('backgroundImage', enforcedBackgroundImage || 'none');
                node.data('backgroundFit', enforcedBackgroundFit);
                if (isBold === undefined) {
                    node.data('bold', true);
                }

                const graphStyleUpdate = {
                    'shape': 'round-rectangle',
                    'background-color': enforcedColor,
                    'width': enforcedSize,
                    'height': enforcedSize,
                    'border-color': enforcedBorderColor,
                    'border-width': enforcedBorderWidth,
                    'color': enforcedTextColor,
                    'font-weight': fontWeight,
                    'text-outline-width': 0,
                    'background-image': enforcedBackgroundImage || 'none'
                };

                if (this.supportsShadowStyles) {
                    Object.assign(graphStyleUpdate, {
                        'shadow-blur': 12,
                        'shadow-color': 'rgba(196, 181, 253, 0.45)',
                        'shadow-offset-x': 0,
                        'shadow-offset-y': 0
                    });
                }

                if (enforcedBackgroundImage) {
                    const backgroundPositionX = this.resolveBackgroundPositionValue(
                        node.data('backgroundPositionX'),
                        '50%'
                    );
                    const backgroundPositionY = this.resolveBackgroundPositionValue(
                        node.data('backgroundPositionY'),
                        '50%'
                    );
                    graphStyleUpdate['background-fit'] = enforcedBackgroundFit;
                    graphStyleUpdate['background-position-x'] = backgroundPositionX;
                    graphStyleUpdate['background-position-y'] = backgroundPositionY;
                    graphStyleUpdate['background-repeat'] = 'no-repeat';
                    graphStyleUpdate['background-width'] = '70%';
                    graphStyleUpdate['background-height'] = '70%';
                }

                node.style(graphStyleUpdate);
            }

            const isContainer = (() => {
                if (typeof node.hasClass === 'function' && node.hasClass('container')) {
                    return true;
                }

                const type = typeof node.data === 'function' ? node.data('type') : undefined;
                if (typeof type === 'string' && type.toLowerCase() === 'container') {
                    return true;
                }

                const containerFlag = typeof node.data === 'function' ? node.data('isContainer') : undefined;
                if (containerFlag === true) {
                    return true;
                }
                if (typeof containerFlag === 'string') {
                    const normalized = containerFlag.trim().toLowerCase();
                    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
                        return true;
                    }
                }

                return false;
            })();
            const isPinned = node.data('pinned') === true;
            const wasLocked = node.data('locked') === true;

            if (isContainer) {
                node.style('border-width', 1);
                node.style('border-color', '#000000');
            } else if (isPinned) {
                node.style({
                    'border-width': 6,
                    'border-color': '#1e90ff'
                });
                if (typeof node.lock === 'function') {
                    node.lock();
                }
            } else if (wasLocked) {
                node.style('border-width', 0);
                if (typeof node.lock === 'function') {
                    node.lock();
                }
            } else {
                node.style('border-width', 0);
            }

            // Use the exact same approach as the node editor: set data AND apply style
            if (shape) {
                node.style('shape', shape);  // Direct application like node editor
            }

            if (color) {
                node.style('background-color', color);  // Also apply color directly
            }

            if (nodeType === 'text') {
                const textStyles = {};

                if (hasExplicitWidth) {
                    textStyles.width = explicitWidth;
                    textStyles['text-max-width'] = explicitWidth;
                }

                if (hasExplicitHeight) {
                    textStyles.height = explicitHeight;
                }

                // Fall back to the stylesheet's data-mapped dimensions if no explicit
                // dimensions are available. Cytoscape still receives explicit
                // dimensions when present, keeping the hit box in sync with the HTML overlay.
                if (Object.keys(textStyles).length > 0) {
                    node.style(textStyles);
                }
            } else if (!isTimelineScaffolding) {
                const resolvedWidth = hasExplicitWidth
                    ? explicitWidth
                    : (hasParsedSize ? parsedSize : null);
                const resolvedHeight = hasExplicitHeight
                    ? explicitHeight
                    : (hasParsedSize ? parsedSize : null);

                if (resolvedWidth !== null || resolvedHeight !== null) {
                    const widthValue = resolvedWidth !== null
                        ? resolvedWidth
                        : (resolvedHeight !== null ? resolvedHeight : parsedSize || 0);
                    const heightValue = resolvedHeight !== null
                        ? resolvedHeight
                        : (resolvedWidth !== null ? resolvedWidth : parsedSize || 0);
                    node.style({
                        'width': widthValue,
                        'height': heightValue
                    });
                }
            }

            const nodeOpacity = node.data('opacity');
            if (nodeOpacity !== undefined) {
                node.style('opacity', nodeOpacity);
            }

            const iconOpacity = node.data('iconOpacity');
            if (iconOpacity !== undefined) {
                node.style('background-opacity', iconOpacity);
            }

            // Handle background image for icons using node editor method
            const backgroundImage = node.data('backgroundImage');
            if (backgroundImage && backgroundImage !== 'none') {
                const originalColor = node.data('color');
                const lighterColor = window.GraphRenderer.lightenColor(originalColor, 0.4);
                const resolvedBackgroundFit = this.resolveBackgroundFitValue(
                    node.data('backgroundFit'),
                    this.resolveBackgroundFitForType(nodeType)
                );
                const backgroundPositionX = this.resolveBackgroundPositionValue(
                    node.data('backgroundPositionX'),
                    '50%'
                );
                const backgroundPositionY = this.resolveBackgroundPositionValue(
                    node.data('backgroundPositionY'),
                    '50%'
                );
                const resolveBackgroundDimension = (value) => {
                    if (value === null || value === undefined) {
                        return null;
                    }
                    if (typeof value === 'string' && !value.trim()) {
                        return null;
                    }
                    return value;
                };
                const backgroundWidth = resolveBackgroundDimension(node.data('backgroundWidth'));
                const backgroundHeight = resolveBackgroundDimension(node.data('backgroundHeight'));
                node.style({
                    'background-color': lighterColor,  // Lighter background for icon visibility
                    'background-image': backgroundImage,
                    'background-fit': resolvedBackgroundFit,  // Show full icon, don't crop
                    'background-repeat': 'no-repeat',
                    'background-position-x': backgroundPositionX,
                    'background-position-y': backgroundPositionY,
                    'background-width': backgroundWidth || 'auto',
                    'background-height': backgroundHeight || 'auto',
                });
            } else {
                node.style('background-image', 'none');
            }
        });

        if (options.updateStyle !== false && this.cy && typeof this.cy.style === 'function') {
            // Force Cytoscape to refresh all styles
            this.cy.style().update();
        }

    },

    // Normalize all nodes in the current graph
    normalizeAllNodeData: function() {
        if (!this.cy) return;

        const nodes = this.cy.nodes();

        if (nodes && typeof nodes.forEach === 'function') {
            const isValidDimension = (value) => {
                if (value === null || value === undefined || value === '') {
                    return false;
                }
                const parsed = typeof value === 'number' ? value : parseFloat(value);
                return Number.isFinite(parsed) && parsed > 0;
            };

            nodes.forEach(node => {
                if (!node || typeof node.data !== 'function') {
                    return;
                }

                const width = node.data('width');
                const height = node.data('height');
                const hasValidPersistedDimensions = isValidDimension(width) && isValidDimension(height);
                this.normalizeNodeData(
                    { data: node.data() },
                    { preserveExplicitDimensions: hasValidPersistedDimensions }
                );
            });
        }

        this.normalizeNodeCollection(nodes);

    },

    // Debug function to check node data and styles
    debugNodeStyles: function() {
        if (!this.cy) {
            return;
        }
        
        const nodes = this.cy.nodes();
        
        nodes.forEach((node, index) => {
            if (index < 3) { // Only show first 3 nodes to avoid spam
                const nodeData = {
                    id: node.id(),
                    type: node.data('type'),
                    shape: node.data('shape'),
                    color: node.data('color'),
                    size: node.data('size'),
                    icon: node.data('icon'),
                    backgroundImage: node.data('backgroundImage')
                };
                
                const nodeStyles = {
                    shape: node.style('shape'),
                    backgroundColor: node.style('background-color'),
                    backgroundImage: node.style('background-image'),
                    width: node.style('width'),
                    height: node.style('height')
                };
                
                
                // Check if icon exists in IconConfigs
                if (nodeData.icon && window.IconConfigs) {
                    if (window.IconConfigs[nodeData.icon]) {
                    }
                }
            }
        });
        
        // Check available node types
    },

    initMagnifiers: function() {
        if (!this.cy) return;
        this.magnifierOverlays = new Map();
        this.cy.on('add', 'node[type="magnifier"]', evt => {
            this.updateMagnifierOverlay(evt.target);
        });
        this.cy.on('remove', 'node[type="magnifier"]', evt => {
            this.removeMagnifierOverlay(evt.target.id());
        });
        this.cy.on('position', 'node[type="magnifier"]', evt => {
            this.updateMagnifierOverlay(evt.target);
        });
        this.cy.on('zoom', () => {
            this.refreshMagnifiers();
        });
    },

    updateMagnifierOverlay: function(node) {
        if (!this.cy || !node) return;
        if (!this.magnifierOverlays) this.magnifierOverlays = new Map();

        let overlay = this.magnifierOverlays.get(node.id());
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'magnifier-overlay';
            overlay.style.position = 'absolute';
            overlay.style.pointerEvents = 'none';
            overlay.style.border = `${node.data('borderWidth') || 1}px solid ${node.data('borderColor') || '#999999'}`;
            overlay.style.borderRadius = '50%';
            overlay.style.overflow = 'hidden';
            this.cy.container().appendChild(overlay);
            this.magnifierOverlays.set(node.id(), overlay);
        }

        const zoom = node.data('zoom') || 2;
        const w = node.data('width') || node.data('size') || 120;
        const h = node.data('height') || node.data('size') || 120;
        overlay.style.width = `${w}px`;
        overlay.style.height = `${h}px`;
        const pos = node.renderedPosition();
        overlay.style.left = `${pos.x - w / 2}px`;
        overlay.style.top = `${pos.y - h / 2}px`;

        let png;
        try {
            png = this.cy.png({ scale: zoom });
        } catch (e) {
            return;
        }
        overlay.style.backgroundImage = `url(${png})`;
        overlay.style.backgroundRepeat = 'no-repeat';
        overlay.style.backgroundSize = `${this.cy.width() * zoom}px ${this.cy.height() * zoom}px`;
        overlay.style.backgroundPosition = `${-pos.x * zoom + w / 2}px ${-pos.y * zoom + h / 2}px`;
    },

    refreshMagnifiers: function() {
        if (!this.cy || !this.magnifierOverlays) return;
        this.cy.nodes('[type="magnifier"]').forEach(node => this.updateMagnifierOverlay(node));
    },

    removeMagnifierOverlay: function(id) {
        if (!this.magnifierOverlays) return;
        const overlay = this.magnifierOverlays.get(id);
        if (overlay) {
            overlay.remove();
            this.magnifierOverlays.delete(id);
        }
    },

    // Apply viewport settings to the Cytoscape instance
    applyViewportSettings: function(viewportSettings) {
        if (!this.cy || !viewportSettings) return;
        
        
        try {
            // Apply zoom if specified
            if (typeof viewportSettings.zoom === 'number' && viewportSettings.zoom > 0) {
                this.cy.zoom(viewportSettings.zoom);
            }
            
            // Apply pan if specified
            if (viewportSettings.pan && typeof viewportSettings.pan.x === 'number' && typeof viewportSettings.pan.y === 'number') {
                this.cy.pan(viewportSettings.pan);
            }
            
            // Update zoom limits if specified
            if (typeof viewportSettings.minZoom === 'number') {
                this.cy.minZoom(viewportSettings.minZoom);
            }
            
            if (typeof viewportSettings.maxZoom === 'number') {
                this.cy.maxZoom(viewportSettings.maxZoom);
            }
            
        } catch (error) {
        }
    },
    
    // Apply rendering settings to the GraphRenderer
    applyRenderingSettings: function(renderingSettings) {
        if (!renderingSettings) return;


        try {
            // Apply WebGL preference if specified
            if (typeof renderingSettings.preferWebGL === 'boolean') {
                // Note: WebGL setting can't be changed after initialization,
                // but we can store the preference for next initialization
            }

            // Apply depth effects settings if 3D layouts are available
            if (typeof renderingSettings.depthEffects === 'boolean') {
                if (window.GlobeLayout3D) {
                    window.GlobeLayout3D.config.depthEffect = renderingSettings.depthEffects;
                }

                if (window.AbsoluteLayout) {
                    window.AbsoluteLayout.config.depthEffect = renderingSettings.depthEffects;
                }
            }

            // Apply auto-rotation settings
            if (typeof renderingSettings.autoRotate === 'boolean' && window.GlobeLayout3D) {
                window.GlobeLayout3D.config.autoRotate = renderingSettings.autoRotate;
                if (renderingSettings.autoRotate) {
                    window.GlobeLayout3D.startAutoRotation();
                } else {
                    window.GlobeLayout3D.stopAutoRotation();
                }
            }

            // Apply rotation speed
            if (typeof renderingSettings.rotationSpeed === 'number' && window.GlobeLayout3D) {
                window.GlobeLayout3D.config.rotationSpeed = renderingSettings.rotationSpeed;
            }

        } catch (error) {
        }
    },

    checkNeo4jForExistingNodes: async function(labels = null) {
        if (!this.cy) return;
        const creds = window.IntegrationsManager?.getNeo4jCredentials?.();
        if (!creds?.url || !creds?.username || !creds?.password) return;
        let unique;
        if (labels != null) {
            const arr = Array.isArray(labels) ? labels : [labels];
            unique = Array.from(new Set(arr.filter(Boolean)));
        } else {
            const lbls = this.cy.nodes().map(n => n.data('label')).filter(Boolean);
            unique = Array.from(new Set(lbls));
            if (unique.length === 0) return;
        }
        const base = '';
        const headers = { 'Content-Type': 'application/json' };
        if (creds.url) headers['X-Neo4j-Url'] = creds.url;
        if (creds.username) headers['X-Neo4j-Username'] = creds.username;
        if (creds.password) headers['X-Neo4j-Password'] = creds.password;
        try {
            const resp = await fetch(`${base}/api/neo4j/node-graphs`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ labels: unique, currentGraph: window.DataManager?.currentGraphName })
            });
            if (!resp.ok) throw new Error(`Status ${resp.status}`);
            const rawMatches = await resp.json();
            const normalizedMatches = [];

            const pushEntry = (labelValue, graphsValue) => {
                const label = typeof labelValue === 'string' && labelValue.trim().length
                    ? labelValue
                    : 'Unlabeled node';
                const graphs = Array.isArray(graphsValue) ? graphsValue : [];
                if (!graphs.length) {
                    return;
                }
                normalizedMatches.push({ label, graphs });
            };

            if (Array.isArray(rawMatches)) {
                rawMatches.forEach(item => pushEntry(item?.label, item?.graphs));
            } else if (rawMatches && typeof rawMatches === 'object') {
                const results = Array.isArray(rawMatches.results) ? rawMatches.results : [];
                results.forEach(result => {
                    const dataRows = Array.isArray(result?.data) ? result.data : [];
                    dataRows.forEach(dataEntry => {
                        if (Array.isArray(dataEntry?.row)) {
                            const [labelValue, graphsValue] = dataEntry.row;
                            pushEntry(labelValue, graphsValue);
                        } else if (dataEntry && typeof dataEntry === 'object') {
                            pushEntry(dataEntry.label, dataEntry.graphs);
                        }
                    });
                });

                if (!normalizedMatches.length && Array.isArray(rawMatches.data)) {
                    rawMatches.data.forEach(item => pushEntry(item?.label, item?.graphs));
                }
            }

            const flattened = [];
            const seen = new Set();
            for (const item of normalizedMatches) {
                const { label, graphs } = item;
                for (const gName of graphs) {
                    if (typeof gName !== 'string' || !gName.trim()) continue;
                    const key = `${label}\u0000${gName}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    flattened.push({ label, graphName: gName });
                }
            }

            this.renderGraphStoreSearchModal(flattened, {
                queryLabels: unique,
                fetchOptions: { base, headers }
            });
        } catch (error) {
            console.error('Neo4j node lookup failed', error);
        }
    },

    renderGraphStoreSearchModal: function(entries, options = {}) {
        const queryLabels = Array.isArray(options.queryLabels) ? options.queryLabels : [];
        const fetchOptions = options.fetchOptions || {};

        this.hideGraphStoreSearchModal();

        const modal = document.createElement('div');
        modal.id = 'graph-store-search-modal';
        modal.className = 'modal';
        modal.style.display = 'block';

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                this.hideGraphStoreSearchModal();
            }
        });

        const content = document.createElement('div');
        content.className = 'modal-content';
        content.style.maxWidth = '420px';
        content.style.margin = '12% auto';
        content.style.padding = '20px';
        content.style.borderRadius = '12px';
        content.style.background = 'rgba(17, 24, 39, 0.95)';
        content.style.color = '#f9fafb';
        content.style.boxShadow = '0 18px 36px rgba(15, 23, 42, 0.45)';
        content.style.border = '1px solid rgba(148, 163, 184, 0.18)';

        const header = document.createElement('div');
        header.className = 'modal-header';
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.marginBottom = '12px';

        const title = document.createElement('h2');
        title.textContent = entries.length ? 'Graph store results' : 'No matches found';
        title.style.fontSize = '18px';
        title.style.fontWeight = '600';
        title.style.margin = '0';
        title.style.color = '#f1f5f9';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '×';
        closeBtn.setAttribute('aria-label', 'Close dialog');
        closeBtn.style.border = 'none';
        closeBtn.style.background = 'transparent';
        closeBtn.style.color = '#e2e8f0';
        closeBtn.style.fontSize = '22px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.lineHeight = '1';
        closeBtn.addEventListener('click', () => this.hideGraphStoreSearchModal());

        header.appendChild(title);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'modal-body';
        body.style.display = 'flex';
        body.style.flexDirection = 'column';
        body.style.gap = '12px';

        const summary = document.createElement('p');
        summary.style.fontSize = '14px';
        summary.style.margin = '0';
        summary.style.color = '#cbd5f5';

        if (entries.length) {
            const labelText = queryLabels.length ? ` for: ${queryLabels.join(', ')}` : '';
            summary.textContent = `Found ${entries.length} matching graph${entries.length === 1 ? '' : 's'}${labelText}.`;
        } else {
            const labelText = queryLabels.length ? ` for "${queryLabels.join(', ')}"` : '';
            summary.textContent = `No saved graphs contain the requested indicators${labelText}.`;
        }

        body.appendChild(summary);

        if (entries.length) {
            const list = document.createElement('div');
            list.style.display = 'flex';
            list.style.flexDirection = 'column';
            list.style.gap = '8px';
            list.style.maxHeight = '260px';
            list.style.overflowY = 'auto';

            entries.forEach((entry) => {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.justifyContent = 'space-between';
                row.style.alignItems = 'center';
                row.style.background = 'rgba(30, 41, 59, 0.85)';
                row.style.border = '1px solid rgba(148, 163, 184, 0.12)';
                row.style.borderRadius = '8px';
                row.style.padding = '10px 12px';

                const info = document.createElement('div');
                info.style.display = 'flex';
                info.style.flexDirection = 'column';

                const graphName = document.createElement('span');
                graphName.textContent = entry.graphName;
                graphName.style.fontWeight = '600';
                graphName.style.fontSize = '14px';
                graphName.style.color = '#e2e8f0';

                const label = document.createElement('span');
                label.textContent = `Node label: ${entry.label}`;
                label.style.fontSize = '12px';
                label.style.color = '#94a3b8';

                info.appendChild(graphName);
                info.appendChild(label);

                const loadBtn = document.createElement('button');
                loadBtn.type = 'button';
                loadBtn.textContent = 'Load';
                loadBtn.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.8), rgba(14, 116, 144, 0.8))';
                loadBtn.style.color = '#f8fafc';
                loadBtn.style.border = 'none';
                loadBtn.style.borderRadius = '6px';
                loadBtn.style.padding = '6px 12px';
                loadBtn.style.cursor = 'pointer';
                loadBtn.style.fontSize = '13px';
                loadBtn.style.fontWeight = '600';
                loadBtn.style.transition = 'opacity 0.2s ease';

                loadBtn.addEventListener('mouseenter', () => {
                    loadBtn.style.opacity = '0.85';
                });
                loadBtn.addEventListener('mouseleave', () => {
                    loadBtn.style.opacity = '1';
                });

                loadBtn.addEventListener('click', async () => {
                    if (loadBtn.disabled) return;
                    const originalText = loadBtn.textContent;
                    loadBtn.disabled = true;
                    loadBtn.textContent = 'Loading…';
                    try {
                        const resolver = window.GraphReferenceResolver;
                        const base = typeof fetchOptions.base === 'string' ? fetchOptions.base : '';
                        const headers = fetchOptions.headers || {};
                        const resolverOptions = { base, headers };

                        if (typeof this.fetchGraphStoreGraph === 'function') {
                            resolverOptions.fetchGraphStoreGraph = (key, loaderOptions = {}) => {
                                const merged = {
                                    base: typeof loaderOptions.base === 'string' ? loaderOptions.base : base,
                                    headers: loaderOptions.headers || headers
                                };
                                return this.fetchGraphStoreGraph(key, merged);
                            };
                        }

                        let graphResult = null;
                        if (resolver && typeof resolver.fetch === 'function') {
                            graphResult = await resolver.fetch({ source: 'store', key: entry.graphName }, resolverOptions);
                        }

                        let graphData = graphResult?.graphData || null;
                        let resolvedLink = graphResult?.link || null;

                        if (!graphData && typeof this.fetchGraphStoreGraph === 'function') {
                            const fallback = await this.fetchGraphStoreGraph(entry.graphName, { base, headers });
                            const extracted = fallback && fallback.graphData && Array.isArray(fallback.graphData.nodes)
                                ? fallback.graphData
                                : fallback;
                            if (extracted && Array.isArray(extracted.nodes)) {
                                graphData = extracted;
                                if (!resolvedLink && resolver && typeof resolver.normalize === 'function') {
                                    resolvedLink = resolver.normalize({ source: 'store', key: entry.graphName });
                                }
                            }
                        }

                        if (graphData) {
                            try {
                                if (window.DomainLoader?.autoLoadDomainsForGraph) {
                                    await window.DomainLoader.autoLoadDomainsForGraph(graphData);
                                }
                            } catch (domainLoadErr) {
                                console.error('Failed to auto-load domains for graph', domainLoadErr);
                                window.alert('Graph loaded, but some icons may be missing due to domain loading issues.');
                            }

                            const referenceString = resolver && typeof resolver.stringify === 'function' && resolvedLink
                                ? resolver.stringify(resolvedLink)
                                : entry.graphName;

                            this.injectGraphAsContainer(graphData, entry.graphName, {
                                reference: referenceString,
                                graphLink: resolvedLink
                            });
                            loadBtn.textContent = 'Loaded';
                        } else {
                            loadBtn.disabled = false;
                            loadBtn.textContent = originalText;
                            window.alert(`Unable to load graph "${entry.graphName}" from the store.`);
                        }
                    } catch (err) {
                        console.error('Failed to load graph store entry', err);
                        loadBtn.disabled = false;
                        loadBtn.textContent = originalText;
                        window.alert(`Failed to load graph "${entry.graphName}": ${err.message}`);
                    }
                });

                row.appendChild(info);
                row.appendChild(loadBtn);
                list.appendChild(row);
            });

            body.appendChild(list);
        } else {
            const footer = document.createElement('div');
            footer.style.display = 'flex';
            footer.style.justifyContent = 'flex-end';

            const okButton = document.createElement('button');
            okButton.type = 'button';
            okButton.textContent = 'OK';
            okButton.style.padding = '6px 14px';
            okButton.style.borderRadius = '6px';
            okButton.style.border = 'none';
            okButton.style.cursor = 'pointer';
            okButton.style.fontWeight = '600';
            okButton.style.background = 'rgba(59, 130, 246, 0.85)';
            okButton.style.color = '#f8fafc';
            okButton.addEventListener('click', () => this.hideGraphStoreSearchModal());

            footer.appendChild(okButton);
            body.appendChild(footer);
        }

        content.appendChild(header);
        content.appendChild(body);
        modal.appendChild(content);
        document.body.appendChild(modal);

        this._graphStoreSearchModal = modal;

        this._boundGraphStoreKeyHandler = (event) => {
            if (event.key === 'Escape') {
                this.hideGraphStoreSearchModal();
            }
        };

        document.addEventListener('keydown', this._boundGraphStoreKeyHandler);

        const focusTarget = modal.querySelector('button');
        if (focusTarget) {
            focusTarget.focus({ preventScroll: true });
        }
    },

    hideGraphStoreSearchModal: function() {
        if (this._graphStoreSearchModal && this._graphStoreSearchModal.parentNode) {
            this._graphStoreSearchModal.parentNode.removeChild(this._graphStoreSearchModal);
        }
        this._graphStoreSearchModal = null;

        if (this._boundGraphStoreKeyHandler) {
            document.removeEventListener('keydown', this._boundGraphStoreKeyHandler);
            this._boundGraphStoreKeyHandler = null;
        }
    },

    _encodeGraphPath(path) {
        if (!path || /^https?:\/\//i.test(path)) {
            return path;
        }

        const [basePath, query] = path.split('?');
        const leadingSlash = basePath.startsWith('/') ? '/' : '';
        const segments = basePath.split('/').filter(Boolean);
        const encodedPath = `${leadingSlash}${segments.map(segment => encodeURIComponent(segment)).join('/')}`;
        if (query) {
            return `${encodedPath}?${query}`;
        }
        return encodedPath;
    },

    async fetchGraphReference(reference, options = {}) {
        const resolver = window.GraphReferenceResolver;
        const base = typeof options.base === 'string' ? options.base : '';
        const headers = options.headers || {};
        const resolverOptions = {
            base,
            headers,
            signal: options.signal,
            fetchFn: options.fetchFn
        };

        if (typeof this.fetchGraphStoreGraph === 'function') {
            resolverOptions.fetchGraphStoreGraph = async (key, loaderOptions = {}) => {
                const merged = {
                    base: typeof loaderOptions.base === 'string' ? loaderOptions.base : base,
                    headers: loaderOptions.headers || headers,
                    signal: loaderOptions.signal || options.signal
                };
                return this.fetchGraphStoreGraph(key, merged);
            };
        }

        if (resolver && typeof resolver.fetch === 'function') {
            try {
                const result = await resolver.fetch(reference, resolverOptions);
                if (result && result.graphData) {
                    this._hydrateGraphDataNodeColors(result.graphData);
                    return result;
                }
            } catch (error) {
                if (error?.name === 'AbortError') {
                    throw error;
                }
                console.warn('Graph reference resolver failed', error);
            }
        }

        return this._legacyFetchGraphReference(reference, options);
    },

    async _legacyFetchGraphReference(reference, options = {}) {
        if (reference && typeof reference === 'object' && !Array.isArray(reference)) {
            const fallbackKey = reference.key || reference.id || reference.reference || reference.path || reference.graph;
            if (fallbackKey) {
                return this._legacyFetchGraphReference(String(fallbackKey), options);
            }
        }

        const trimmed = typeof reference === 'string' ? reference.trim() : '';
        if (!trimmed) {
            return null;
        }

        const base = typeof options.base === 'string' ? options.base : '';
        const headers = options.headers || {};
        const looksLikePath = /[\\/]/.test(trimmed);
        const hasProtocol = /^https?:\/\//i.test(trimmed);

        const resolveUrl = path => {
            if (!path) {
                return null;
            }
            if (/^https?:\/\//i.test(path)) {
                return path;
            }
            const encoded = this._encodeGraphPath(path);
            if (!base) {
                return encoded.startsWith('/') ? encoded : `/${encoded}`;
            }
            if (encoded.startsWith('/')) {
                return `${base}${encoded}`;
            }
            return base.endsWith('/') ? `${base}${encoded}` : `${base}/${encoded}`;
        };

        const tryFetchJson = async url => {
            if (!url) {
                return null;
            }
            try {
                const requestInit = { headers };
                if (options.signal) {
                    requestInit.signal = options.signal;
                }
                const response = await fetch(url, requestInit);
                if (!response.ok) {
                    return null;
                }
                const text = await response.text();
                if (!text) {
                    return null;
                }
                return JSON.parse(text);
            } catch (error) {
                if (error?.name !== 'AbortError') {
                    console.warn('Graph reference fetch failed', url, error);
                }
                return null;
            }
        };

        if (!looksLikePath) {
            const normalizedName = trimmed.replace(/\.qut$/i, '');
            if (typeof this.fetchGraphStoreGraph === 'function') {
                const storeResult = await this.fetchGraphStoreGraph(normalizedName, { base, headers });
                const graphData = storeResult && storeResult.graphData && Array.isArray(storeResult.graphData.nodes)
                    ? storeResult.graphData
                    : storeResult;
                if (graphData && Array.isArray(graphData.nodes)) {
                    this._hydrateGraphDataNodeColors(graphData);
                    return { graphData, link: { source: 'store', key: normalizedName } };
                }
            }
        }

        const candidates = new Set();
        if (hasProtocol) {
            candidates.add(trimmed);
        } else {
            const ensureQut = trimmed.endsWith('.qut') ? trimmed : `${trimmed}.qut`;
            candidates.add(ensureQut);
            const stripped = ensureQut.replace(/^\/+/, '');
            candidates.add(`/graphs/${stripped}`);
        }

        for (const candidate of candidates) {
            const url = resolveUrl(candidate);
            const result = await tryFetchJson(url);
            if (result && Array.isArray(result.nodes)) {
                this._hydrateGraphDataNodeColors(result);
                return {
                    graphData: result,
                    link: { source: hasProtocol ? 'url' : 'file', key: trimmed }
                };
            }
        }

        return null;
    },

    async loadGraphReferenceIntoNode(nodeId, reference, options = {}) {
        if (!this.cy) {
            return { success: false, error: 'Graph renderer unavailable.' };
        }

        const node = typeof nodeId === 'string' ? this.cy.$id(nodeId) : nodeId;
        if (!node || node.length === 0) {
            return { success: false, error: 'Graph node not found.' };
        }

        const resolver = window.GraphReferenceResolver;
        const nodeData = typeof node.data === 'function' ? node.data() : node.data || {};
        const infoHtml = nodeData.infoHtml;
        let safeInfo = nodeData.info;
        if (infoHtml && this._isHtmlLikeString(safeInfo)) {
            safeInfo = '';
        }
        const rawReference = reference !== undefined && reference !== null
            ? reference
            : (options.graphLink !== undefined ? options.graphLink : (nodeData.graphLink || nodeData.graphReference || safeInfo));

        let normalizedLink = resolver && typeof resolver.normalize === 'function'
            ? resolver.normalize(rawReference)
            : null;

        let legacyReference = '';
        if (!normalizedLink) {
            legacyReference = typeof rawReference === 'string' ? rawReference.trim() : '';
            if (!legacyReference) {
                return { success: false, error: 'Graph reference is empty.' };
            }
        }

        let graphData = options.graphData || null;
        let resolvedLink = normalizedLink || null;

        if (!graphData) {
            try {
                const fetchResult = await this.fetchGraphReference(resolvedLink || legacyReference, options.fetchOptions || {});
                if (fetchResult && fetchResult.graphData) {
                    graphData = fetchResult.graphData;
                    if (fetchResult.link) {
                        resolvedLink = fetchResult.link;
                    }
                } else if (fetchResult && Array.isArray(fetchResult.nodes)) {
                    graphData = fetchResult;
                }
            } catch (error) {
                console.error('Failed to retrieve referenced graph:', error);
                return { success: false, error: 'Failed to retrieve referenced graph.' };
            }
        }

        if (!graphData || !Array.isArray(graphData.nodes)) {
            return { success: false, error: 'Referenced graph could not be found.' };
        }

        this._hydrateGraphDataNodeColors(graphData);

        if (!resolvedLink && resolver && typeof resolver.normalize === 'function') {
            resolvedLink = resolver.normalize(legacyReference);
        }

        const label = options.label || (typeof node.data === 'function' ? node.data('label') : node.data?.label)
            || graphData.title || graphData.name
            || (resolvedLink ? resolvedLink.key : legacyReference);

        const sanitizedLink = resolvedLink && resolvedLink.key
            ? { source: resolvedLink.source || 'store', key: resolvedLink.key }
            : null;

        const infoString = (() => {
            if (resolver && typeof resolver.stringify === 'function' && sanitizedLink) {
                return resolver.stringify(sanitizedLink);
            }
            if (legacyReference) {
                return legacyReference;
            }
            if (normalizedLink) {
                return `${normalizedLink.source}:${normalizedLink.key}`;
            }
            return '';
        })();

        const savedAt = this._extractGraphSavedTimestampFromGraphData(graphData);

        try {
            const containerNode = this.injectGraphAsContainer(graphData, label, {
                reuseExistingNode: true,
                containerId: node.id(),
                position: node.position(),
                label,
                reference: infoString,
                graphLink: sanitizedLink,
                timestamp: savedAt
            });

            if (!containerNode) {
                return { success: false, error: 'Failed to render referenced graph.' };
            }

            if (typeof node.data === 'function') {
                node.data('type', 'container');
                if (sanitizedLink) {
                    node.data('graphLink', sanitizedLink);
                } else if (typeof node.removeData === 'function') {
                    node.removeData('graphLink');
                }
                if (infoString) {
                    node.data('graphReference', infoString);
                    node.data('info', infoString);
                } else if (typeof node.removeData === 'function') {
                    node.removeData('graphReference');
                }
                node.data('graphLoaded', true);
            }

            return { success: true, containerId: containerNode.id(), graphData, graphLink: sanitizedLink };
        } catch (error) {
            console.error('Error injecting referenced graph:', error);
            return { success: false, error: 'Failed to render referenced graph.' };
        }
    },

    _resolveGraphNodeValue(node, key) {
        if (!node) {
            return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(node, key)) {
            return node[key];
        }
        if (node.data && Object.prototype.hasOwnProperty.call(node.data, key)) {
            return node.data[key];
        }
        return undefined;
    },

    _extractGraphNodeColor(node) {
        const explicitColor = this._resolveGraphNodeValue(node, 'color');
        if (typeof explicitColor === 'string' && explicitColor.trim() !== '') {
            return explicitColor.trim();
        }

        const backgroundColor = this._resolveGraphNodeValue(node, 'backgroundColor');
        if (typeof backgroundColor === 'string' && backgroundColor.trim() !== '') {
            return backgroundColor.trim();
        }

        const extractColorFromStyle = style => {
            if (!style) {
                return null;
            }
            if (typeof style === 'function') {
                try {
                    return style('background-color') || style('backgroundColor') || style('color') || null;
                } catch (error) {
                    return null;
                }
            }
            if (typeof style === 'object') {
                return style['background-color'] || style['backgroundColor'] || style.color || null;
            }
            return null;
        };

        const styleSources = [
            this._resolveGraphNodeValue(node, 'style'),
            node?.style,
            node?.data?.style
        ];

        for (const styleSource of styleSources) {
            const resolvedColor = extractColorFromStyle(styleSource);
            if (resolvedColor) {
                return resolvedColor;
            }
        }

        return null;
    },

    _resolveGraphNodeColor(node) {
        return this._extractGraphNodeColor(node)
            || window.QuantickleConfig?.defaultNodeColor
            || '#ffffff';
    },

    _hydrateGraphDataNodeColors(graphData) {
        if (!graphData || !Array.isArray(graphData.nodes)) {
            return;
        }

        graphData.nodes.forEach(node => {
            if (!node || typeof node !== 'object') {
                return;
            }

            const resolvedColor = this._extractGraphNodeColor(node);
            if (!resolvedColor || typeof resolvedColor !== 'string' || !resolvedColor.trim()) {
                return;
            }

            const sanitizedColor = resolvedColor.trim();

            const applyColor = (target) => {
                if (!target || typeof target !== 'object') {
                    return;
                }
                const existing = typeof target.color === 'string' ? target.color.trim() : '';
                if (!existing) {
                    target.color = sanitizedColor;
                }
            };

            applyColor(node);
            if (node.data && node.data !== node) {
                applyColor(node.data);
            }
        });
    },

    _resolveGraphNodePosition(node, axis) {
        const key = axis === 'y' ? 'y' : 'x';
        const positionSources = [
            node?.position?.[key],
            node?.data?.position?.[key],
            node?.[key],
            node?.data?.[key]
        ];
        for (const value of positionSources) {
            if (typeof value === 'number' && Number.isFinite(value)) {
                return value;
            }
        }
        return 0;
    },

    _resolveGraphEdgeValue(edge, key) {
        if (!edge) {
            return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(edge, key)) {
            return edge[key];
        }
        if (edge.data && Object.prototype.hasOwnProperty.call(edge.data, key)) {
            return edge.data[key];
        }
        return undefined;
    },

    _computeGraphBounds(graphData) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        (graphData.nodes || []).forEach(node => {
            const x = this._resolveGraphNodePosition(node, 'x');
            const y = this._resolveGraphNodePosition(node, 'y');
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        });

        if (minX === Infinity) {
            minX = 0;
            minY = 0;
            maxX = 0;
            maxY = 0;
        }

        const width = Math.max(200, maxX - minX);
        const height = Math.max(150, maxY - minY);

        return { minX, minY, maxX, maxY, width, height };
    },

    _buildContainerNodeElement(containerId, node, bounds) {
        const originalId = this._resolveGraphNodeValue(node, 'id');
        if (!originalId) {
            return null;
        }

        const parentId = this._resolveGraphNodeValue(node, 'parent');
        const parent = parentId ? `${containerId}:${parentId}` : containerId;
        const baseData = node && node.data && typeof node.data === 'object' ? { ...node.data } : { ...node };

        if (baseData.data && typeof baseData.data === 'object') {
            Object.assign(baseData, baseData.data);
            delete baseData.data;
        }

        const sanitized = { ...baseData };
        delete sanitized.classes;
        delete sanitized.locked;
        delete sanitized.grabbed;
        delete sanitized.selected;
        delete sanitized.parent;
        delete sanitized.position;
        delete sanitized.renderedPosition;
        delete sanitized.x;
        delete sanitized.y;

        const x = this._resolveGraphNodePosition(node, 'x') - bounds.minX;
        const y = this._resolveGraphNodePosition(node, 'y') - bounds.minY;

        sanitized.id = `${containerId}:${originalId}`;
        sanitized.parent = parent;

        const element = {
            group: 'nodes',
            data: sanitized,
            position: { x, y }
        };

        if (!sanitized.color || String(sanitized.color).trim() === '') {
            const resolvedColor = this._resolveGraphNodeColor(node);
            if (resolvedColor) {
                sanitized.color = resolvedColor;
            }
        }

        const classes = this._resolveGraphNodeValue(node, 'classes');
        if (classes) {
            element.classes = classes;
        }

        const locked = this._resolveGraphNodeValue(node, 'locked');
        if (locked === true) {
            element.locked = true;
        }

        return element;
    },

    _buildContainerEdgeElement(containerId, edge) {
        const source = this._resolveGraphEdgeValue(edge, 'source');
        const target = this._resolveGraphEdgeValue(edge, 'target');
        if (!source || !target) {
            return null;
        }

        const baseData = edge && edge.data && typeof edge.data === 'object' ? { ...edge.data } : { ...edge };

        if (baseData.data && typeof baseData.data === 'object') {
            Object.assign(baseData, baseData.data);
            delete baseData.data;
        }

        const sanitized = { ...baseData };
        delete sanitized.classes;
        delete sanitized.source;
        delete sanitized.target;

        const rawId = this._resolveGraphEdgeValue(edge, 'id') || `${source}-${target}`;

        sanitized.id = `${containerId}:${rawId}`;
        sanitized.source = `${containerId}:${source}`;
        sanitized.target = `${containerId}:${target}`;

        const element = {
            group: 'edges',
            data: sanitized
        };

        const classes = this._resolveGraphEdgeValue(edge, 'classes');
        if (classes) {
            element.classes = classes;
        }

        return element;
    },
    setupGraphSearch: function() {
        if (!this.cy) {
            return;
        }

        const container = this.cy.container();
        if (!container) {
            return;
        }

        const host = container.parentElement || container;

        if (this.searchOverlay) {
            if (this.searchOverlay.parentElement !== host) {
                host.appendChild(this.searchOverlay);
            }
            this.searchMatchesCollection = this.cy.collection();
            this.searchMatches = [];
            this.searchActiveIndex = -1;
            this.updateSearchDisplay();
            return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'graph-search-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-label', 'Search graph');
        overlay.innerHTML = `
            <input type="text" class="graph-search-input" placeholder="Search nodes and edges..." aria-label="Search nodes and edges" />
            <div class="graph-search-actions">
                <span class="graph-search-count graph-search-empty" aria-live="polite">0 / 0</span>
                <button type="button" class="graph-search-button" data-action="prev" title="Previous match">Prev</button>
                <button type="button" class="graph-search-button" data-action="next" title="Next match">Next</button>
                <button type="button" class="graph-search-close" data-action="close" aria-label="Close search">Close</button>
            </div>
        `;
        overlay.style.display = 'none';

        host.appendChild(overlay);

        overlay.addEventListener('mousedown', evt => evt.stopPropagation());
        overlay.addEventListener('mouseup', evt => evt.stopPropagation());
        overlay.addEventListener('click', evt => evt.stopPropagation());
        overlay.addEventListener('wheel', evt => {
            evt.preventDefault();
            evt.stopPropagation();
        }, { passive: false });
        overlay.addEventListener('keydown', evt => {
            if (evt.key === 'Escape') {
                evt.preventDefault();
                evt.stopPropagation();
                this.closeSearch();
                container.focus({ preventScroll: true });
            }
        });

        this.searchOverlay = overlay;
        this.searchInput = overlay.querySelector('.graph-search-input');
        this.searchCountLabel = overlay.querySelector('.graph-search-count');
        this.searchPrevButton = overlay.querySelector('[data-action="prev"]');
        this.searchNextButton = overlay.querySelector('[data-action="next"]');
        this.searchCloseButton = overlay.querySelector('[data-action="close"]');
        this.searchMatchesCollection = this.cy.collection();
        this.searchMatches = [];
        this.searchActiveIndex = -1;
        this.updateSearchDisplay();

        if (this.searchInput) {
            this.searchInput.addEventListener('input', evt => {
                this.performSearch(evt.target.value);
            });
            this.searchInput.addEventListener('keydown', evt => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    this.stepSearchMatch(evt.shiftKey ? -1 : 1);
                } else if (evt.key === 'Escape') {
                    evt.preventDefault();
                    this.closeSearch();
                    container.focus({ preventScroll: true });
                }
            });
        }

        if (this.searchPrevButton) {
            this.searchPrevButton.addEventListener('click', () => this.stepSearchMatch(-1));
        }

        if (this.searchNextButton) {
            this.searchNextButton.addEventListener('click', () => this.stepSearchMatch(1));
        }

        if (this.searchCloseButton) {
            this.searchCloseButton.addEventListener('click', () => this.closeSearch());
        }
    },

    isGraphViewActive: function() {
        const currentView = window.DataManager && window.DataManager.currentView;
        if (currentView && currentView !== 'graph') {
            return false;
        }

        const graphPanel = document.getElementById('graphView');
        if (!graphPanel) {
            return true;
        }

        if (graphPanel.classList.contains('active')) {
            return true;
        }

        if (graphPanel.style && graphPanel.style.display && graphPanel.style.display !== 'none') {
            return true;
        }

        return false;
    },

    openSearch: function(initialTerm) {
        if (!this.cy) {
            return false;
        }

        if (!this.isGraphViewActive()) {
            return false;
        }

        this.setupGraphSearch();

        if (!this.searchOverlay || !this.searchInput) {
            return false;
        }

        const hasTerm = typeof initialTerm === 'string';

        if (hasTerm) {
            this.searchInput.value = initialTerm;
        } else if (!this.searchInput.value && this.searchLastTerm) {
            this.searchInput.value = this.searchLastTerm;
        }

        this.searchOverlay.style.display = 'flex';
        this.searchOverlay.classList.add('visible');

        const focusInput = () => {
            this.searchInput.focus({ preventScroll: true });
            this.searchInput.select();
        };
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(focusInput);
        } else {
            focusInput();
        }

        this.performSearch(this.searchInput.value);
        return true;
    },

    closeSearch: function() {
        if (this.searchOverlay) {
            this.searchOverlay.classList.remove('visible');
            this.searchOverlay.style.display = 'none';
        }

        if (this.searchInput) {
            this.searchLastTerm = this.searchInput.value || this.searchLastTerm;
        }

        this.clearSearchMatches();

        if (this.cy && typeof this.cy.container === 'function') {
            const container = this.cy.container();
            if (container && typeof container.focus === 'function') {
                try {
                    container.focus({ preventScroll: true });
                } catch (err) {
                    /* Ignore focus errors */
                }
            }
        }

        return true;
    },

    performSearch: function(term) {
        if (!this.cy) {
            return;
        }

        const normalized = typeof term === 'string' ? term.trim() : '';
        this.searchLastTerm = normalized;
        this.searchActiveIndex = -1;

        this.cy.elements('.search-match, .search-match-current, .search-match-related').removeClass('search-match search-match-current search-match-related');

        if (!normalized) {
            this.searchMatchesCollection = this.cy.collection();
            this.searchMatches = [];
            this.updateSearchDisplay();
            return;
        }

        const lower = normalized.toLowerCase();
        const includesTerm = value => {
            if (value === null || value === undefined) {
                return false;
            }
            return value.toString().toLowerCase().includes(lower);
        };

        const nodes = this.cy.nodes().filter(node => {
            const data = node.data() || {};
            return includesTerm(node.id()) ||
                includesTerm(data.label) ||
                includesTerm(data.name) ||
                includesTerm(data.type);
        });

        const edges = this.cy.edges().filter(edge => {
            const data = edge.data() || {};
            return includesTerm(edge.id()) ||
                includesTerm(data.label) ||
                includesTerm(data.type) ||
                includesTerm(data.source) ||
                includesTerm(data.target);
        });

        const matches = nodes.union(edges);

        if (!matches.length) {
            this.searchMatchesCollection = this.cy.collection();
            this.searchMatches = [];
            this.updateSearchDisplay();
            return;
        }

        matches.addClass('search-match');

        this.searchMatchesCollection = matches;
        this.searchMatches = matches.toArray();
        this.focusSearchMatch(0, { animate: false });
    },

    focusSearchMatch: function(index, options = {}) {
        if (!Array.isArray(this.searchMatches) || !this.searchMatches.length) {
            this.searchActiveIndex = -1;
            this.updateSearchDisplay();
            return;
        }

        const count = this.searchMatches.length;
        const rawIndex = typeof index === 'number' ? index : 0;
        const normalizedIndex = ((rawIndex % count) + count) % count;
        const match = this.searchMatches[normalizedIndex];
        if (!match) {
            return;
        }

        this.cy.elements('.search-match-current').removeClass('search-match-current');
        this.cy.elements('.search-match-related').removeClass('search-match-related');

        match.addClass('search-match-current');

        if (typeof match.isEdge === 'function' && match.isEdge()) {
            match.connectedNodes().addClass('search-match-related');
        }

        this.searchActiveIndex = normalizedIndex;
        this.updateSearchDisplay();

        const shouldAnimate = options.animate !== false;
        if (shouldAnimate) {
            try {
                const centerTarget =
                    typeof match.isEdge === 'function' && match.isEdge()
                        ? match.connectedNodes().union(match)
                        : match;
                this.cy.animate({
                    center: { eles: centerTarget },
                    duration: 250
                });
            } catch (err) {
                console.warn('Failed to center on search match', err);
            }
        }
    },

    stepSearchMatch: function(direction) {
        if (!Array.isArray(this.searchMatches) || !this.searchMatches.length) {
            return;
        }

        const step = typeof direction === 'number' && direction !== 0 ? direction : 1;
        const startIndex = this.searchActiveIndex >= 0 ? this.searchActiveIndex : 0;
        this.focusSearchMatch(startIndex + step, { animate: true });
    },

    clearSearchMatches: function() {
        if (this.cy) {
            this.cy.elements('.search-match, .search-match-current, .search-match-related').removeClass('search-match search-match-current search-match-related');
        }

        this.searchMatchesCollection = this.cy ? this.cy.collection() : null;
        this.searchMatches = [];
        this.searchActiveIndex = -1;
        this.updateSearchDisplay();
    },

    updateSearchDisplay: function() {
        if (!this.searchCountLabel) {
            return;
        }

        const total = Array.isArray(this.searchMatches) ? this.searchMatches.length : 0;

        if (!total || this.searchActiveIndex < 0) {
            this.searchCountLabel.textContent = total ? `0 / ${total}` : '0 / 0';
            this.searchCountLabel.classList.add('graph-search-empty');
            return;
        }

        this.searchCountLabel.textContent = `${this.searchActiveIndex + 1} / ${total}`;
        this.searchCountLabel.classList.remove('graph-search-empty');
    },

    fetchGraphStoreGraph: async function(graphName, options = {}) {
        const base = typeof options.base === 'string' ? options.base : '';
        const headers = options.headers || {};

        let graphData = null;

        try {
            const localResp = await fetch(`${base}/graphs/${encodeURIComponent(graphName)}.qut`);
            if (localResp.ok) {
                const text = await localResp.text();
                graphData = JSON.parse(text);
                return graphData;
            }
        } catch (err) {
            if (err?.name !== 'AbortError') {
                console.warn('Local graph fetch failed', err);
            }
        }

        try {
            const resp = await fetch(`${base}/api/neo4j/graph/${encodeURIComponent(graphName)}`, { headers });
            if (resp.ok) {
                graphData = await resp.json();
                return graphData;
            }
        } catch (err) {
            if (err?.name !== 'AbortError') {
                console.error('Neo4j graph fetch failed', err);
            }
        }

        return null;
    },

    injectGraphAsContainer: function(graphData, graphName, options = {}) {
        if (!graphData || !Array.isArray(graphData.nodes) || !this.cy) {
            return null;
        }

        const cy = this.cy;
        const bounds = this._computeGraphBounds(graphData);
        const defaultId = graphName ? `neo4j_${String(graphName).replace(/\s+/g, '_')}` : `neo4j_${Date.now()}`;
        const containerId = options.containerId || defaultId;
        const containerLabel = options.label || graphName || containerId;

        const extent = cy.extent();
        const defaultPosition = { x: extent.x2 + 100, y: extent.y1 };
        const position = options.position || defaultPosition;
        const reuseRequested = options.reuseExistingNode === true;

        let containerNode = cy.$id(containerId);
        let reuse = reuseRequested && containerNode && containerNode.length > 0;

        if (!containerNode || containerNode.length === 0) {
            cy.add({
                group: 'nodes',
                data: { id: containerId, label: containerLabel, type: 'container', width: bounds.width, height: bounds.height },
                classes: 'container',
                position
            });
            containerNode = cy.$id(containerId);
            reuse = false;
        } else {
            containerNode.data('type', 'container');
            containerNode.addClass('container');
            containerNode.data('label', containerLabel);
            if (position) {
                containerNode.position(position);
            }
        }

        if (options.reference) {
            containerNode.data('graphReference', options.reference);
            containerNode.data('info', options.reference);
        }
        if (options.graphLink) {
            containerNode.data('graphLink', options.graphLink);
        } else if (reuse && typeof containerNode.removeData === 'function') {
            containerNode.removeData('graphLink');
        }
        if (graphName) {
            containerNode.data('graphSource', graphName);
        }
        containerNode.data('graphLoaded', true);
        containerNode.data('width', bounds.width);
        containerNode.data('height', bounds.height);

        const containerTimestamp = this._normalizeGraphTimestampValue(options.timestamp)
            || this._extractGraphSavedTimestampFromGraphData(graphData);
        if (containerTimestamp) {
            this._assignTimestampToNode(containerNode, containerTimestamp);
        }

        if (reuse && containerNode.children && typeof containerNode.children === 'function') {
            const children = containerNode.children();
            if (children && children.length) {
                children.remove();
            }
        }

        const nodeElements = [];
        (graphData.nodes || []).forEach(node => {
            const element = this._buildContainerNodeElement(containerId, node, bounds);
            if (element) {
                nodeElements.push(element);
            }
        });

        const edgeElements = [];
        (graphData.edges || []).forEach(edge => {
            const element = this._buildContainerEdgeElement(containerId, edge);
            if (element) {
                edgeElements.push(element);
            }
        });

        cy.batch(() => {
            if (nodeElements.length) {
                cy.add(nodeElements);
            }
            if (edgeElements.length) {
                cy.add(edgeElements);
            }
        });

        try {
            if (typeof this.normalizeNodeCollection === 'function') {
                let nodesToNormalize = null;
                if (containerNode && typeof containerNode.union === 'function' && typeof containerNode.children === 'function') {
                    nodesToNormalize = containerNode.union(containerNode.children());
                } else if (containerNode && typeof containerNode.children === 'function') {
                    nodesToNormalize = containerNode.children();
                }

                if (nodesToNormalize && nodesToNormalize.length) {
                    this.normalizeNodeCollection(nodesToNormalize);
                } else if (typeof this.normalizeAllNodeData === 'function') {
                    this.normalizeAllNodeData();
                }
            }
        } catch (styleError) {
            console.error('Error normalizing container node styles:', styleError);
        }

        if (window.GraphAreaEditor && typeof window.GraphAreaEditor.applySettingsDebounced === 'function') {
            try {
                window.GraphAreaEditor.applySettingsDebounced();
            } catch (e) {
                console.error('Error applying GraphAreaEditor settings:', e);
            }
        } else if (window.GraphAreaEditor && typeof window.GraphAreaEditor.applySettings === 'function') {
            try {
                window.GraphAreaEditor.applySettings();
            } catch (e) {
                console.error('Error applying GraphAreaEditor settings:', e);
            }
        }

        return containerNode;
    }
};

// Track external copy actions to determine clipboard precedence
document.addEventListener('copy', (e) => {
    if (window.GraphRenderer) {
        // Ignore copy events triggered by our internal copy operation
        if (window.GraphRenderer.isInternalCopy) {
            window.GraphRenderer.isInternalCopy = false;
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        window.GraphRenderer.lastClipboardSource = 'external';
        window.GraphRenderer.lastExternalClipboardTimestamp = Date.now();
        if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText().then(text => {
                window.GraphRenderer.lastExternalClipboardText = text;
            }).catch(() => {
                /* ignore errors reading clipboard */
            });
        }
    }
});
