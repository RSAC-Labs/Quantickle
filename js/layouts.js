// Layout management for Quantickle
// Handles layout application, updates, and configuration

window.LayoutManager = {
    // Current layout state
    currentLayout: 'grid',
    autoUpdateEnabled: false,
    dragUpdateTimeout: null,
    _timelineForceRebuildNextApply: false,
    _timelinePreservedBarStyle: null,

    // Initialize layout manager
    init: function() {
        this.updateLayoutDropdown();
    },

    isDebugModeEnabled: function() {
        if (typeof window === 'undefined') {
            return false;
        }

        const debugTools = window.DebugTools;
        if (debugTools && debugTools.moduleInstance && typeof debugTools.moduleInstance.debugMode === 'boolean') {
            return debugTools.moduleInstance.debugMode;
        }

        if (debugTools && typeof debugTools.debugMode === 'boolean') {
            return debugTools.debugMode;
        }

        if (typeof window.QUANTICKLE_DEBUG_MODE === 'boolean') {
            return window.QUANTICKLE_DEBUG_MODE;
        }

        return false;
    },

    _isFinitePosition: function(position) {
        return Boolean(position && Number.isFinite(position.x) && Number.isFinite(position.y));
    },

    _resolveFiniteNodePosition: function(node, containerCenter, contextLabel) {
        const originalPosition = node && typeof node.position === 'function' ? node.position() : null;
        if (this._isFinitePosition(originalPosition)) {
            return originalPosition;
        }

        let fallbackPosition = null;
        let fallbackSource = 'position';

        if (node && typeof node.renderedPosition === 'function') {
            const renderedPosition = node.renderedPosition();
            if (this._isFinitePosition(renderedPosition)) {
                const nodeCy = typeof node.cy === 'function' ? node.cy() : null;
                if (nodeCy && typeof nodeCy.renderer === 'function') {
                    const renderer = nodeCy.renderer();
                    if (renderer && typeof renderer.projectIntoModelPosition === 'function') {
                        const modelPosition = renderer.projectIntoModelPosition(renderedPosition);
                        if (this._isFinitePosition(modelPosition)) {
                            fallbackPosition = modelPosition;
                            fallbackSource = 'renderedPosition';
                        }
                    }
                }

                if (!fallbackPosition) {
                    fallbackPosition = renderedPosition;
                    fallbackSource = 'renderedPosition';
                }
            }
        }

        if (!fallbackPosition && node && typeof node.boundingBox === 'function') {
            const bb = node.boundingBox({ includeLabels: true, includeOverlays: true });
            const bbCenter = {
                x: (bb.x1 + bb.x2) / 2,
                y: (bb.y1 + bb.y2) / 2
            };
            if (this._isFinitePosition(bbCenter)) {
                fallbackPosition = bbCenter;
                fallbackSource = 'boundingBox';
            }
        }

        if (!fallbackPosition) {
            fallbackPosition = containerCenter;
            fallbackSource = 'containerCenter';
        }

        if (this.isDebugModeEnabled()) {
            const nodeId = node && typeof node.id === 'function' ? node.id() : 'unknown';
            console.debug(
                `[LayoutManager] Non-finite position for node "${nodeId}" (${contextLabel || 'layout'}) using ${fallbackSource}.`,
                {
                    position: originalPosition,
                    fallback: fallbackPosition
                }
            );
        }

        return fallbackPosition;
    },

    // Ensure the layout selector is reset to grid before loading replacement data
    ensureGridLayoutDefault: function() {
        if (this.currentLayout === 'grid') {
            return;
        }

        // Clear any artifacts from the previous layout (e.g., timeline scaffolding)
        this.resetLayoutArtifacts(this.currentLayout);
        this.currentLayout = 'grid';

        if (typeof this.updateLayoutDropdown === 'function') {
            this.updateLayoutDropdown();
        }
    },

    // Select a layout and apply it immediately
    selectLayout: function(layoutName) {
        const previousLayout = this.currentLayout;
        this.currentLayout = layoutName;

        // Reset any lingering effects from the previous layout
        this.resetLayoutArtifacts(previousLayout);

        // Reload graph data when leaving layouts that modify core data
        const needsReload = previousLayout === 'bulbous';
        if (needsReload && window.GraphManager &&
            typeof window.GraphManager.getCurrentGraphData === 'function' &&
            typeof window.GraphManager.loadGraphData === 'function') {
            const data = window.GraphManager.getCurrentGraphData();
            if (data) {
                // Reload current graph before applying new layout
                window.GraphManager.loadGraphData(data).then(() => {
                    if (window.UI && window.UI.update3DControlsState) {
                        window.UI.update3DControlsState();
                    }
                    this.applyLayout();
                });
                return;
            }
        }

        // Update 3D controls state based on new layout
        if (window.UI && window.UI.update3DControlsState) {
            window.UI.update3DControlsState();
        }

        // Apply the layout immediately - no waiting
        this.applyLayout();
    },

    // Remove layout-specific styling or locks from the previous layout
    resetLayoutArtifacts: function(prevLayout) {
        const cy = window.GraphRenderer ? window.GraphRenderer.cy : null;
        if (!cy) return;

        if (prevLayout === 'bulbous') {
            // Restore node styling
            cy.nodes().forEach(node => {
                const originalSize = node.data('originalSize');
                const originalFont = node.data('originalFontSize');
                if (originalSize !== undefined) {
                    node.data('size', originalSize);
                } else {
                    node.removeData('size');
                }
                if (originalFont !== undefined) {
                    node.data('fontSize', originalFont);
                } else {
                    node.removeData('fontSize');
                }
                node.removeData('originalSize');
                node.removeData('originalFontSize');
            });

            // Restore saved viewport and interaction settings
            if (cy._bulbousSavedState) {
                const state = cy._bulbousSavedState;
                if (state.pan) cy.pan(state.pan);
                if (state.zoom !== undefined) cy.zoom(state.zoom);
                if (state.userZoomingEnabled !== undefined) cy.userZoomingEnabled(state.userZoomingEnabled);
                if (state.panningEnabled !== undefined) cy.panningEnabled(state.panningEnabled);
                delete cy._bulbousSavedState;
            }
        }

        if (prevLayout === 'timeline') {
            const TIMELINE_NODE_SELECTOR = '[type="timeline-bar"], [type="timeline-anchor"], [type="timeline-tick"]';
            const containerFlags = ['_timelineContainerized', 'timelineContainerized', '_timelineParentWasContainer'];
            if (cy && typeof cy.nodes === 'function') {
                const registry = cy._timelineAppliedScopes;
                const hasRootTimelineScope = Boolean(registry && typeof registry.has === 'function' && registry.has('__root__'));

                if (!hasRootTimelineScope) {
                    const isContainerNode = node => this.isContainerNode(node);
                    let containers = cy
                        .nodes()
                        .filter(node => node.selected() && isContainerNode(node));

                    const selectedNodes = cy
                        .nodes()
                        .filter(node => node.selected() && !isContainerNode(node));

                    const parentContainers = selectedNodes
                        .parents()
                        .filter(node => isContainerNode(node));

                    if (parentContainers.length > 0) {
                        containers = containers.union(parentContainers);
                    }

                    if (containers.length > 0) {
                        containers.forEach(container => {
                            if (!container || typeof container.id !== 'function') {
                                return;
                            }

                            const containerId = container.id();
                            if (!containerId) {
                                return;
                            }

                            const timelineNodes = container.children(TIMELINE_NODE_SELECTOR);
                            if (timelineNodes && timelineNodes.length > 0) {
                                timelineNodes.remove();
                            }

                            const resetNodeState = node => {
                                if (!node || typeof node.data !== 'function') {
                                    return;
                                }

                                const savedGrab = node.data('_savedGrabbable');
                                if (savedGrab !== undefined && typeof node.grabbable === 'function') {
                                    try {
                                        node.grabbable(savedGrab);
                                    } catch (_) {}
                                }

                                if (typeof node.removeData === 'function') {
                                    node.removeData('_savedGrabbable');
                                    node.removeData('lockedX');
                                    node.removeData('_savedLockedX');
                                    containerFlags.forEach(flag => {
                                        node.removeData(flag);
                                    });
                                }

                                if (typeof node.removeScratch === 'function') {
                                    node.removeScratch('_timelineSuppressResetX');
                                }
                            };

                            const childNodes = container.children();
                            if (childNodes && childNodes.length > 0) {
                                childNodes
                                    .filter(child => {
                                        if (!child || typeof child.data !== 'function') {
                                            return false;
                                        }
                                        const type = child.data('type');
                                        return !(type === 'timeline-bar' || type === 'timeline-anchor' || type === 'timeline-tick');
                                    })
                                    .forEach(resetNodeState);
                            }

                            resetNodeState(container);

                            if (cy._timelineContainerLockedChildren && typeof cy._timelineContainerLockedChildren.delete === 'function') {
                                cy._timelineContainerLockedChildren.delete(containerId);
                            }

                            if (cy._timelineContainerTimelineUnlocks && typeof cy._timelineContainerTimelineUnlocks.delete === 'function') {
                                cy._timelineContainerTimelineUnlocks.delete(containerId);
                            }

                            if (window.CustomLayouts) {
                                if (typeof window.CustomLayouts.clearTimelineBaselineInfo === 'function') {
                                    try {
                                        window.CustomLayouts.clearTimelineBaselineInfo(cy, containerId);
                                    } catch (baselineError) {
                                        console.warn('Failed to clear timeline baseline info for container:', containerId, baselineError);
                                    }
                                }

                                if (typeof window.CustomLayouts.setTimelineLayoutApplied === 'function') {
                                    try {
                                        window.CustomLayouts.setTimelineLayoutApplied(cy, containerId, false);
                                    } catch (applyError) {
                                        console.warn('Failed to clear timeline layout state for container:', containerId, applyError);
                                    }
                                }
                            }
                        });

                        const remainingScopes = cy._timelineAppliedScopes && cy._timelineAppliedScopes.size > 0;
                        if (remainingScopes) {
                            return;
                        }
                    }
                }
            }
            // Remove timeline specific nodes and event handlers
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
            if (cy._timelineContainerLockedChildren) {
                cy._timelineContainerLockedChildren.clear();
                delete cy._timelineContainerLockedChildren;
            }
            cy.off('resize.timeline pan.timeline zoom.timeline');
            if (window.CustomLayouts && typeof window.CustomLayouts.clearAllTimelineLayoutApplied === 'function') {
                window.CustomLayouts.clearAllTimelineLayoutApplied(cy);
            } else {
                cy.scratch('_timelineLayoutApplied', false);
            }
            if (window.CustomLayouts && typeof window.CustomLayouts.clearAllTimelineBaselineInfo === 'function') {
                window.CustomLayouts.clearAllTimelineBaselineInfo(cy);
            } else if (typeof cy.removeScratch === 'function') {
                cy.removeScratch('_timelineBaselineInfo');
            } else if (typeof cy.scratch === 'function') {
                cy.scratch('_timelineBaselineInfo', null);
            }
            cy.nodes().forEach(node => {
                const savedGrab = node.data('_savedGrabbable');
                if (savedGrab !== undefined) {
                    node.grabbable(savedGrab);
                    node.removeData('_savedGrabbable');
                }
                node.removeData('lockedX');
                node.removeData('_savedLockedX');
                if (typeof node.removeScratch === 'function') {
                    node.removeScratch('_timelineSuppressResetX');
                }
            });
            cy.nodes('[type="timeline-anchor"], [type="timeline-bar"], [type="timeline-tick"]').remove();
            cy.edges('[type="timeline-link"]').remove();
            if (window.GraphManager && typeof window.GraphManager.syncTimelineConnectors === 'function') {
                window.GraphManager.syncTimelineConnectors([], []);
            }
            if (window.CustomLayouts && window.CustomLayouts.removeTimelineTicks) {
                window.CustomLayouts.removeTimelineTicks(cy);
            }
        }
    },

    _captureTimelineBarStyle: function(cy) {
        if (!cy || typeof cy.nodes !== 'function') {
            return null;
        }

        let barCollection;
        try {
            barCollection = cy.nodes('[type="timeline-bar"]');
        } catch (error) {
            return null;
        }

        if (!barCollection || barCollection.length === 0) {
            return null;
        }

        const bar = barCollection[0];
        if (!bar) {
            return null;
        }

        const readData = key => {
            if (typeof bar.data === 'function') {
                return bar.data(key);
            }
            if (bar.data && Object.prototype.hasOwnProperty.call(bar.data, key)) {
                return bar.data[key];
            }
            return undefined;
        };

        const style = {};
        const rawSize = readData('size');
        const numericSize = Number(rawSize);
        if (Number.isFinite(numericSize) && numericSize > 0) {
            style.height = numericSize;
        }

        const color = readData('color');
        if (typeof color === 'string' && color.trim()) {
            style.color = color.trim();
        }

        let className;
        if (readData('className') !== undefined) {
            className = readData('className');
        } else if (readData('appliedClass') !== undefined) {
            className = readData('appliedClass');
        }

        if ((className === undefined || className === null || className === '') && typeof bar.classes === 'function') {
            try {
                const classes = bar.classes();
                if (typeof classes === 'string' && classes.trim()) {
                    className = classes.trim();
                }
            } catch (classesError) {
            }
        }

        if (className !== undefined && className !== null && String(className).trim()) {
            style.className = String(className).trim();
        }

        return Object.keys(style).length > 0 ? style : null;
    },

    // Calculate optimal node size and spacing based on node count and viewport
    calculateOptimalSizing: function(cy) {
        const nodeCount = cy.nodes().length;
        const viewportWidth = cy.width();
        const viewportHeight = cy.height();
        
        // Base calculations - much more generous approach for larger nodes
        const totalArea = viewportWidth * viewportHeight;
        const availableArea = totalArea * 0.5; // Use 50% of viewport for better node visibility
        const areaPerNode = availableArea / nodeCount;
        
        // Calculate optimal node size (square root of area per node, with more generous constraints)
        let optimalNodeSize = Math.sqrt(areaPerNode) * 0.6; // 60% of theoretical size for better visibility
        
        // Apply more generous size constraints based on node count
        if (nodeCount <= 10) {
            optimalNodeSize = Math.max(optimalNodeSize, 40); // Much larger minimum for small graphs
        } else if (nodeCount <= 50) {
            optimalNodeSize = Math.max(optimalNodeSize, 30); // Much larger minimum for medium graphs
        } else if (nodeCount <= 200) {
            optimalNodeSize = Math.max(optimalNodeSize, 20); // Much larger minimum for large graphs
        } else {
            optimalNodeSize = Math.max(optimalNodeSize, 15); // Much larger minimum for very large graphs
        }
        
        // More generous maximum size constraints
        optimalNodeSize = Math.min(optimalNodeSize, 60); // Much larger maximum size
        
        // Calculate optimal spacing to ensure nodes don't overlap
        // Use a more moderate spacing multiplier
        const spacingMultiplier = Math.max(1.8, Math.min(3.0, 40 / nodeCount)); // More moderate spacing
        const optimalSpacing = Math.max(optimalNodeSize * spacingMultiplier, optimalNodeSize * 1.5); // Minimum 1.5x node size
        
        return {
            nodeSize: optimalNodeSize,
            spacing: optimalSpacing,
            padding: Math.min(50, optimalSpacing * 0.4) // More generous padding
        };
    },

    // Check for overlapping nodes and return true if overlaps are detected
    detectOverlappingNodes: function(cy, nodeSize, nodesToCheck) {
        const nodes = nodesToCheck && typeof nodesToCheck.toArray === 'function'
            ? nodesToCheck
            : cy.nodes();
        const nodeArray = nodes.toArray();
        let overlapCount = 0;
        
        // For hierarchical layouts, use a more lenient overlap threshold
        const hierarchicalLayouts = ['breadthfirst', 'dagre', 'klay'];
        const isHierarchicalLayout = hierarchicalLayouts.includes(this.currentLayout);
        const overlapThreshold = isHierarchicalLayout ? nodeSize * 0.7 : nodeSize; // 30% more lenient for hierarchical
        
        for (let i = 0; i < nodeArray.length; i++) {
            for (let j = i + 1; j < nodeArray.length; j++) {
                const node1 = nodeArray[i];
                const node2 = nodeArray[j];
                
                const pos1 = node1.position();
                const pos2 = node2.position();
                
                // Calculate distance between node centers
                const distance = Math.sqrt(
                    Math.pow(pos1.x - pos2.x, 2) + 
                    Math.pow(pos1.y - pos2.y, 2)
                );
                
                // If distance is less than threshold, nodes are overlapping
                if (distance < overlapThreshold) {
                    overlapCount++;
                }
            }
        }
        return overlapCount > 0;
    },

    // Helper function to add zoom reapplication to layoutready handlers
    addZoomReapplication: function(layout) {
        layout.on('layoutready', () => {
            // Re-apply zoom settings after layout is ready
            if (window.GraphRenderer && window.GraphRenderer.reapplyZoomSettings) {
                window.GraphRenderer.reapplyZoomSettings();
            }
        });
    },

    // Determine if animations should be disabled based on dataset size
    shouldDisableAnimations: function(cy) {
        if (!cy) return false;
        
        const nodeCount = cy.nodes().length;
        const edgeCount = cy.edges().length;
        
        // Disable animations for large datasets to improve performance
        if (nodeCount > 1000 || edgeCount > 2000) {
            return true;
        }
        
        // Disable animations for medium datasets if performance is poor
        if (nodeCount > 500 || edgeCount > 1000) {
            // Check if we have performance data available
            if (window.GraphRenderer && window.GraphRenderer.lastFPS !== undefined) {
                if (window.GraphRenderer.lastFPS < 30) {
                    return true;
                }
            }
        }
        
        return false;
    },

    // Determine if a node represents a container (supports legacy data)
    isContainerNode: function(node) {
        return !!(
            node && (
                (typeof node.hasClass === 'function' && node.hasClass('container')) ||
                (typeof node.data === 'function' &&
                    (node.data('type') === 'container' || node.data('isContainer')))
            )
        );
    },

    // Normalize pinned values across string/boolean/number representations
    normalizePinnedValue: function(value) {
        if (typeof value === 'boolean') {
            return value;
        }

        if (typeof value === 'number') {
            return value !== 0;
        }

        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
                return true;
            }
            if (normalized === 'false' || normalized === '0' || normalized === 'no') {
                return false;
            }
        }

        return false;
    },

    // Determine if a node is pinned using normalized values
    isNodePinned: function(node) {
        if (!node || typeof node.data !== 'function') {
            return false;
        }

        return this.normalizePinnedValue(node.data('pinned'));
    },

    // Apply time-based color overlay to nodes
    applyTimeColorOverlay: function(cy, nodes) {
        cy = cy || (window.GraphRenderer ? window.GraphRenderer.cy : null);
        if (!cy) return;
        const collection = nodes || cy.nodes();
        if (!collection || collection.length === 0) return;

        const times = collection
            .map(n => this.getNodeTimestamp(n))
            .filter(t => t !== null);
        if (times.length === 0) return;

        const now = Date.now();
        const monthMs = 30 * 24 * 60 * 60 * 1000; // Approximate month in milliseconds

        const thresholds = {
            twoMonths: 2 * monthMs,
            sixMonths: 6 * monthMs,
            twelveMonths: 12 * monthMs,
            threeYears: 36 * monthMs
        };

        collection.forEach(node => {
            const ts = this.getNodeTimestamp(node);
            if (ts === null) {
                const base = node.data('color') || (window.QuantickleConfig?.defaultNodeColor || '#ffffff');
                node.style('background-color', base);
                node.style('opacity', 1);
                node.removeData('timeColored');
                return;
            }

            const age = now - ts;
            let color;

            if (age < thresholds.twoMonths) {
                color = '#00ff00'; // Bright green for newest nodes
            } else if (age < thresholds.sixMonths) {
                color = '#16a34a'; // Green for 6-2 months old
            } else if (age < thresholds.twelveMonths) {
                color = '#eab308'; // Yellow for 12-6 months old
            } else if (age < thresholds.threeYears) {
                color = '#f97316'; // Orange for 3-1 year old (1-3 years)
            } else {
                color = '#ef4444'; // Red for older than 3 years
            }

            node.style('background-color', color);
            node.style('opacity', 1);
            node.data('timeColored', true);
        });
    },

    // Parse a timestamp from supported formats (ISO string, seconds, milliseconds, Date, etc.)
    parseTimestampValue: function(value) {
        if (value === undefined || value === null || value === '') {
            return null;
        }

        const finalize = ms => {
            if (!Number.isFinite(ms)) {
                return null;
            }
            return ms;
        };

        if (typeof value === 'number') {
            if (value >= 1000 && value <= 9999) {
                return finalize(Date.UTC(value, 0, 1));
            }
            return finalize(value < 1e12 ? value * 1000 : value);
        }

        if (value instanceof Date) {
            return finalize(value.getTime());
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) {
                return null;
            }
            if (/^\d+$/.test(trimmed)) {
                const num = Number(trimmed);
                if (num >= 1000 && num <= 9999) {
                    return finalize(Date.UTC(num, 0, 1));
                }
                return finalize(num < 1e12 ? num * 1000 : num);
            }
            const parsed = Date.parse(trimmed);
            return Number.isNaN(parsed) ? null : finalize(parsed);
        }

        const parsedDate = new Date(value);
        return Number.isNaN(parsedDate.getTime()) ? null : finalize(parsedDate.getTime());
    },

    // Resolve the timestamp to use for a node, falling back to common alternate fields
    getNodeTimestamp: function(node) {
        if (!node) {
            return null;
        }

        const candidates = [
            node.data('timestamp'),
            node.data('time'),
            node.data('lastSeen'),
            node.data('firstSeen')
        ];

        for (let i = 0; i < candidates.length; i++) {
            const value = candidates[i];
            const parsed = this.parseTimestampValue(value);
            if (parsed !== null) {
                return parsed;
            }
        }

        return null;
    },

    // Blend two hex colors
    blendColors: function(c1, c2, ratio) {
        function hexToRgb(hex) {
            hex = hex.replace('#', '');
            if (hex.length === 3) {
                hex = hex.split('').map(ch => ch + ch).join('');
            }
            const num = parseInt(hex, 16);
            return [ (num >> 16) & 255, (num >> 8) & 255, num & 255 ];
        }
        const rgb1 = hexToRgb(c1);
        const rgb2 = hexToRgb(c2);
        const r = Math.round(rgb1[0] * (1 - ratio) + rgb2[0] * ratio);
        const g = Math.round(rgb1[1] * (1 - ratio) + rgb2[1] * ratio);
        const b = Math.round(rgb1[2] * (1 - ratio) + rgb2[2] * ratio);
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    },

    clearTimeColorOverlay: function(cy, nodes) {
        cy = cy || (window.GraphRenderer ? window.GraphRenderer.cy : null);
        if (!cy) return;
        const collection = nodes || cy.nodes();
        collection.forEach(node => {
            const base = node.data('color') || (window.QuantickleConfig?.defaultNodeColor || '#ffffff');
            node.style('background-color', base);
            node.style('opacity', 1);
            node.removeData('timeColored');
        });
    },

    // Reapply dynamic node styling (labels, sizing, colors) using current sizing heuristics
    requestDynamicStyleRefresh: function(cy) {
        const targetCy = cy || (window.GraphRenderer ? window.GraphRenderer.cy : null);
        if (!targetCy) {
            return false;
        }

        if (typeof this.calculateOptimalSizing !== 'function' || typeof this.updateNodeStyles !== 'function') {
            return false;
        }

        try {
            const sizing = this.calculateOptimalSizing(targetCy);
            if (sizing) {
                this.updateNodeStyles(targetCy, sizing);
                return true;
            }
        } catch (error) {
            console.warn('[LayoutManager] Failed to refresh dynamic node styles:', error);
        }

        return false;
    },

    // Update node styles based on calculated sizing
    updateNodeStyles: function(cy, sizing, targetNodes) {
        // Define hierarchical layouts once
        const hierarchicalLayouts = ['breadthfirst', 'dagre', 'klay', 'cola', 'concentric'];
        const isHierarchicalLayout = hierarchicalLayouts.includes(this.currentLayout);
        const nodesToStyle = targetNodes && targetNodes.length > 0 ? targetNodes : cy.nodes();

        // Respect global graph area settings for default node sizing
        const globalSettings = window.GraphAreaEditor?.getSettings?.();
        const sizeScale =
            globalSettings && typeof globalSettings.defaultNodeSize === 'number'
                ? globalSettings.defaultNodeSize
                : 1;

        const resolveNodeSize = (node, defaultScaledSize, defaultBaseSize) => {
            const rawSize = Number(node.data('size'));
            const hasExplicitSize = Number.isFinite(rawSize);
            const baseSize = hasExplicitSize ? rawSize : defaultBaseSize;
            const sizeLocked = Boolean(node.data('sizeLocked'));
            const scaledSize = hasExplicitSize
                ? (sizeLocked ? baseSize : baseSize * sizeScale)
                : defaultScaledSize;
            return { scaledSize, hasExplicitSize, sizeLocked };
        };
        
        // Force preservation of node sizes for hierarchical layouts
        if (isHierarchicalLayout) {
            // Store the intended node sizes in node data to prevent override
            nodesToStyle.forEach(node => {
                const nodeType = node.data('type');
                if (typeof nodeType === 'string' && nodeType.startsWith('timeline-')) {
                    return; // Skip timeline nodes from intended size adjustments
                }
                const { scaledSize } = resolveNodeSize(node, sizing.nodeSize * sizeScale, sizing.nodeSize);
                const intendedSize = Math.max(20, scaledSize);
                node.data('intendedSize', intendedSize);
            });
        }
        let nodeSize = sizing.nodeSize * sizeScale;
        
        // Check for overlapping nodes and reduce size if needed
        // Only do this for non-hierarchical layouts to prevent extreme size reduction
        
        if (!isHierarchicalLayout) {
            let attempts = 0;
            const maxAttempts = 3; // Reduced from 5 to prevent extreme size reduction
            
            while (this.detectOverlappingNodes(cy, nodeSize, nodesToStyle) && attempts < maxAttempts) {
                nodeSize = Math.max(12, nodeSize * 0.9); // Reduce size by only 10% and higher minimum
                attempts++;
            }
        } else {
        }
        
        // Update node width and height with much more conservative sizing
        const self = this;
        nodesToStyle.forEach(function(node) {
            const nodeType = node.data('type');
            if (nodeType === 'text') {
                if (window.TextCallout && typeof window.TextCallout.refresh === 'function') {
                    window.TextCallout.refresh(node);
                }
                return; // Skip generic sizing for text nodes
            }
            if (typeof nodeType === 'string' && nodeType.startsWith('timeline-')) {
                return; // Guard against global size/shape overrides for timeline scaffolding
            }
            // Get the node label to calculate optimal font size
            const label = node.data('label') || node.data('name') || node.data('id') || '';
            const labelLength = label.length;
            
            // Calculate optimal font size based on label length to prevent wrapping
            let optimalFontSize = Math.max(8, nodeSize * 0.3);
            
            // If label is long, reduce font size to fit better
            if (labelLength > 20) {
                optimalFontSize = Math.max(6, optimalFontSize * 0.8);
            }
            if (labelLength > 30) {
                optimalFontSize = Math.max(5, optimalFontSize * 0.7);
            }
            if (labelLength > 40) {
                optimalFontSize = Math.max(4, optimalFontSize * 0.6);
            }
            
            // Count incoming edges to determine label position
            const incomingEdges = node.incomers('edge').length;
            const outgoingEdges = node.outgoers('edge').length;
            
            // Position label above if fewer incoming edges, below if more incoming edges
            const labelPosition = incomingEdges <= outgoingEdges ? 'top' : 'bottom';
            const marginY = labelPosition === 'top' ? -(nodeSize * 0.1) : (nodeSize * 0.1);
            
            // Check if node is pinned or selected to apply highlighting
            const isPinned = self.isNodePinned(node);
            const isContainer = self.isContainerNode(node);
            const explicitBorderWidthRaw = node.data('borderWidth');
            const hasExplicitBorderWidth =
                explicitBorderWidthRaw !== undefined &&
                explicitBorderWidthRaw !== null &&
                explicitBorderWidthRaw !== '' &&
                !Number.isNaN(Number(explicitBorderWidthRaw));
            const explicitBorderWidth = hasExplicitBorderWidth ? Number(explicitBorderWidthRaw) : null;
            const explicitBorderColor = node.data('borderColor');
            const hasExplicitBorderColor = typeof explicitBorderColor === 'string' && explicitBorderColor.trim() !== '';

            let borderWidth;
            let borderColor;
            if (isPinned) {
                borderWidth = 6;
                borderColor = '#1e90ff';
            } else {
                const isSelected = node.selected();
                if (isSelected) {
                    borderWidth = 4;
                    borderColor = '#ff0000';
                } else {
                    if (hasExplicitBorderWidth) {
                        borderWidth = explicitBorderWidth;
                    } else {
                        borderWidth = isContainer ? 1 : 0;
                    }
                    if (hasExplicitBorderColor) {
                        borderColor = explicitBorderColor;
                    } else {
                        borderColor = '#000000';
                    }
                }
            }

            const resolvedBorderWidth = Math.max(0, Math.round(borderWidth));
            const resolvedBorderOpacity = resolvedBorderWidth > 0 ? 1 : 0;

            // Preserve global label styling from Graph Area Editor
            const globalLabelColor = globalSettings ? globalSettings.labelColor : '#666666';
            const globalLabelSize = globalSettings ? globalSettings.labelSize : Math.max(6, Math.round(optimalFontSize));
            
            // For hierarchical layouts, ensure minimum node size
            const sizeDefaults = isHierarchicalLayout
                ? resolveNodeSize(node, sizing.nodeSize * sizeScale, sizing.nodeSize)
                : resolveNodeSize(node, nodeSize, sizing.nodeSize);
            const finalNodeSize = isHierarchicalLayout
                ? Math.max(20, node.data('intendedSize') || sizeDefaults.scaledSize)
                : sizeDefaults.scaledSize;
            
            // Apply styles individually with validation to prevent e.toLowerCase errors
            const style = {
                'width': Math.max(1, Math.round(finalNodeSize)),
                'height': Math.max(1, Math.round(finalNodeSize)),
                'shape': node.data('shape') || 'round-rectangle', // PRESERVE domain shapes instead of forcing ellipse
                'background-color': node.data('color') || (window.QuantickleConfig?.defaultNodeColor || '#ffffff'), // Preserve node color from data
                'font-size': globalLabelSize,
                'text-max-width': Math.max(10, Math.round(finalNodeSize)),
                'text-wrap': 'wrap',
                'text-valign': String(labelPosition), // Position text above or below the node
                'text-halign': 'center',
                'text-margin-y': Math.round(marginY), // Move text away from the node
                'color': globalLabelColor, // Use global label color setting
                'font-weight': 'normal', // Normal weight instead of bold
                'font-family': 'Verdana, Geneva, sans-serif', // Lighter font family
                'line-height': '1.0', // Tighter line height
                'border-width': resolvedBorderWidth, // Highlight selected nodes with thicker border
                'border-color': String(borderColor), // Red border for selected nodes
                'border-opacity': resolvedBorderOpacity, // Solid border when visible
                // Override any inherited styles
                'text-outline-width': 0, // Explicitly remove any text outline
                'text-outline-color': 'transparent', // Make outline transparent
                'text-outline-opacity': 0, // Ensure no outline opacity
                // PRESERVE domain icons instead of removing them
                'background-image': node.data('backgroundImage') || 'none',
                'background-image-opacity': node.data('backgroundImage') ? 1 : 0
            };
            
            // Apply each style property individually with validation
            Object.keys(style).forEach(key => {
                if (style[key] !== null && style[key] !== undefined) {
                    try {
                        node.style(key, style[key]);
                    } catch (styleError) {
                    }
                }
            });
        });

        // Apply styling updates to timeline scaffolding without disrupting layout sizing
        const timelineNodes = cy.nodes().filter(node => {
            if (!node || typeof node.data !== 'function') {
                return false;
            }

            const type = node.data('type');
            return typeof type === 'string' && type.startsWith('timeline-');
        });

        timelineNodes.forEach(node => {
            const type = node.data('type') || '';

            const explicitBorderWidthRaw = node.data('borderWidth');
            const hasExplicitBorderWidth =
                explicitBorderWidthRaw !== undefined &&
                explicitBorderWidthRaw !== null &&
                explicitBorderWidthRaw !== '' &&
                !Number.isNaN(Number(explicitBorderWidthRaw));
            const explicitBorderWidth = hasExplicitBorderWidth ? Number(explicitBorderWidthRaw) : null;
            const explicitBorderColor = node.data('borderColor');
            const hasExplicitBorderColor = typeof explicitBorderColor === 'string' && explicitBorderColor.trim() !== '';

            const isSelected = node.selected();
            const borderWidth = isSelected ? 4 : (hasExplicitBorderWidth ? explicitBorderWidth : 0);
            const borderColor = isSelected ? '#ff0000' : (hasExplicitBorderColor ? explicitBorderColor : '#000000');

            const baseColor = node.data('color') || node.style('background-color');
            const shapeFromData = node.data('shape');
            const opacityRaw = node.data('opacity');
            const backgroundOpacityRaw = node.data('backgroundOpacity') ?? node.data('background-opacity');
            const opacityValue = Number.parseFloat(opacityRaw);
            const backgroundOpacityValue = Number.parseFloat(backgroundOpacityRaw);
            const style = {
                'background-color': baseColor,
                'border-width': Math.max(0, Math.round(borderWidth)),
                'border-color': String(borderColor),
                'border-opacity': borderWidth > 0 ? 1 : 0,
                'shape': type === 'timeline-bar' ? (shapeFromData || 'rectangle') : shapeFromData
            };

            if (Number.isFinite(opacityValue)) {
                style.opacity = Math.max(0, Math.min(1, opacityValue));
            }

            if (Number.isFinite(backgroundOpacityValue)) {
                style['background-opacity'] = Math.max(0, Math.min(1, backgroundOpacityValue));
            }

            // Preserve timeline geometry by reusing existing measurements
            const barLengthFromData = Number(node.data('barLength'));
            const sizeFromData = Number(node.data('size'));

            if (type === 'timeline-bar') {
                if (Number.isFinite(barLengthFromData)) {
                    style.width = barLengthFromData;
                } else if (Number.isFinite(sizeFromData)) {
                    style.width = sizeFromData;
                }
                if (Number.isFinite(sizeFromData)) {
                    style.height = sizeFromData;
                }

                const zIndex = node.style('z-index');
                if (zIndex !== undefined && zIndex !== null && zIndex !== '') {
                    style['z-index'] = zIndex;
                } else {
                    style['z-index'] = -1;
                }
            } else {
                // Anchors and ticks share square sizing behaviour
                if (Number.isFinite(sizeFromData)) {
                    style.width = sizeFromData;
                    style.height = sizeFromData;
                }
            }

            Object.keys(style).forEach(key => {
                if (style[key] !== null && style[key] !== undefined) {
                    try {
                        node.style(key, style[key]);
                    } catch (styleError) {
                    }
                }
            });
        });
        
        // Update edge width based on node size - much thinner edges
        const edgeWidth = Math.max(1, nodeSize * 0.03); // Much thinner edges
        const edgeCollection = targetNodes && targetNodes.length > 0 && typeof targetNodes.connectedEdges === 'function'
            ? targetNodes.connectedEdges()
            : cy.edges();
        edgeCollection.forEach(function(edge) {
            // Check if edge is selected to apply highlighting
            const isSelected = edge.selected();
            const edgeWidthFinal = isSelected ? Math.max(2, edgeWidth * 2) : edgeWidth;
            
            // Preserve global edge styling from Graph Area Editor
            const edgeSettings = window.GraphAreaEditor?.getSettings?.();
            const globalEdgeColor = edgeSettings ? edgeSettings.edgeColor : '#333333';
            const globalEdgeWidth = edgeSettings ? edgeSettings.edgeThickness : edgeWidth;
            
            const edgeColor = isSelected ? '#ff0000' : globalEdgeColor;
            
            // Apply edge styles individually with validation
            const edgeStyle = {
                'width': Math.max(1, Math.round(isSelected ? edgeWidthFinal : globalEdgeWidth)),
                'line-color': String(edgeColor),
                'target-arrow-color': String(edgeColor)
            };
            
            // Apply each style property individually with validation
            Object.keys(edgeStyle).forEach(key => {
                if (edgeStyle[key] !== null && edgeStyle[key] !== undefined) {
                    try {
                        edge.style(key, edgeStyle[key]);
                    } catch (styleError) {
                    }
                }
            });
        });

        // Apply 3D effects for any 3D-capable layout
        if (this.is3DLayout(this.currentLayout) && window.GlobeLayout3D && window.GlobeLayout3D.config.depthEffect) {
            window.GlobeLayout3D.init(cy);
            window.GlobeLayout3D.applyGlobeEffects({
                depthEffect: true,
                autoRotate: window.GlobeLayout3D.config.autoRotate
            });
        } else if (!this.is3DLayout(this.currentLayout) && window.GlobeLayout3D) {
            // Disable 3D effects for 2D layouts
            window.GlobeLayout3D.stopAutoRotation();
            window.GlobeLayout3D.resetVisualEffects();
        }

        // Apply time-based color overlay if enabled
        const timeColoredNodes = cy.nodes().filter(n => n.data('timeColored'));
        if (timeColoredNodes.length > 0) {
            this.applyTimeColorOverlay(cy, timeColoredNodes);
        }
    },

    // Ensure container descendants and containers themselves are fully rendered after position changes
    ensureContainerDescendantsRendered: function(cy, movedNodes, sizing, applyPositionUpdates, nodesForStyle) {
        if (!cy) {
            return;
        }

        const targetNodes = nodesForStyle && nodesForStyle.length > 0 ? nodesForStyle : movedNodes;

        if (typeof cy.batch === 'function' && typeof applyPositionUpdates === 'function') {
            cy.batch(() => {
                applyPositionUpdates();
            });
        } else if (typeof applyPositionUpdates === 'function') {
            applyPositionUpdates();
        }

        if (typeof cy.notify === 'function') {
            cy.notify('position');
        }

        if (typeof cy.forceRender === 'function') {
            cy.forceRender();
        } else if (typeof cy.resize === 'function') {
            cy.resize();
        }

        if (typeof this.updateNodeStyles === 'function') {
            if (targetNodes && typeof targetNodes.forEach === 'function') {
                targetNodes.forEach(node => {
                    try {
                        if (typeof node.style === 'function') {
                            node.style('display', 'element');
                            node.style('visibility', 'visible');
                        }
                    } catch (_) {}
                });
            }

            this.updateNodeStyles(cy, sizing, targetNodes);
        }
    },

    _captureCollapsedContainerState: function(container) {
        if (!container || typeof container.data !== 'function' || !container.data('collapsed')) {
            return { wasCollapsed: false };
        }

        const getData = key => {
            try {
                return container.data(key);
            } catch (_) {
                return undefined;
            }
        };

        return {
            wasCollapsed: true,
            baseLabel: getData('baseLabel') || getData('label'),
            prevWidth: getData('prevWidth'),
            prevHeight: getData('prevHeight'),
            prevPosition: getData('prevPosition'),
            prevBorderWidth: getData('prevBorderWidth'),
            prevPadding: getData('prevPadding'),
            prevBackgroundColor: getData('prevBackgroundColor'),
            prevBackgroundOpacity: getData('prevBackgroundOpacity'),
            prevLabelColor: getData('prevLabelColor'),
            prevFontSize: getData('prevFontSize'),
            prevFontWeight: getData('prevFontWeight'),
            prevTextValign: getData('prevTextValign'),
            prevTextHalign: getData('prevTextHalign'),
            prevOpacity: getData('prevOpacity'),
            collapsedBaseWidth: getData('collapsedBaseWidth'),
            collapsedBaseHeight: getData('collapsedBaseHeight'),
            collapsedBasePadding: getData('collapsedBasePadding'),
            collapsedBaseBorderWidth: getData('collapsedBaseBorderWidth'),
            collapsedBaseFontSize: getData('collapsedBaseFontSize'),
            docked: getData('docked'),
            prevLockedState: getData('prevLockedState')
        };
    },

    _manuallyExpandCollapsedContainer: function(container, snapshot) {
        if (!container || typeof container.data !== 'function') {
            return;
        }

        const baseLabel = snapshot?.baseLabel || container.data('baseLabel') || container.data('label');
        const prevWidth = snapshot?.prevWidth ?? container.data('prevWidth');
        const prevHeight = snapshot?.prevHeight ?? container.data('prevHeight');
        const prevPosition = snapshot?.prevPosition ?? container.data('prevPosition');
        const prevBorder = snapshot?.prevBorderWidth ?? container.data('prevBorderWidth');
        const prevPadding = snapshot?.prevPadding ?? container.data('prevPadding');
        const prevBackground = snapshot?.prevBackgroundColor ?? container.data('prevBackgroundColor');
        const prevBackgroundOpacity = snapshot?.prevBackgroundOpacity ?? container.data('prevBackgroundOpacity');
        const prevLabelColor = snapshot?.prevLabelColor ?? container.data('prevLabelColor');
        const prevFontSize = snapshot?.prevFontSize ?? container.data('prevFontSize');
        const prevFontWeight = snapshot?.prevFontWeight ?? container.data('prevFontWeight');
        const prevTextValign = snapshot?.prevTextValign ?? container.data('prevTextValign');
        const prevTextHalign = snapshot?.prevTextHalign ?? container.data('prevTextHalign');
        const prevOpacity = snapshot?.prevOpacity ?? container.data('prevOpacity');
        const dockedInfo = snapshot?.docked ?? container.data('docked');
        const wasLockedBeforeDock = snapshot?.prevLockedState ?? container.data('prevLockedState');

        if (dockedInfo) {
            container.removeData('docked');
            if (window.GraphRenderer && typeof window.GraphRenderer.updateDockedContainerPositions === 'function') {
                try {
                    window.GraphRenderer.updateDockedContainerPositions(dockedInfo.side);
                } catch (_) {}
            }
        }

        if (prevWidth !== undefined && prevHeight !== undefined) {
            container.removeStyle('width');
            container.removeStyle('height');
            container.data('width', prevWidth);
            container.data('height', prevHeight);
        }

        ['collapsedBaseWidth', 'collapsedBaseHeight', 'collapsedBasePadding', 'collapsedBaseBorderWidth', 'collapsedBaseFontSize']
            .forEach(key => container.removeData(key));

        if (container.locked && container.locked()) {
            container.unlock();
        }
        if (prevPosition) {
            container.position(prevPosition);
        }
        if (container.children) {
            container.children().style('display', 'element');
            container.children().connectedEdges().style('display', 'element');
        }
        container.removeData('collapsed');
        ['prevWidth', 'prevHeight', 'prevPosition', 'prevBorderWidth', 'prevPadding',
            'prevBackgroundColor', 'prevBackgroundOpacity', 'prevLabelColor', 'prevFontSize',
            'prevFontWeight', 'prevTextValign', 'prevTextHalign', 'prevOpacity']
            .forEach(key => container.removeData(key));

        if (prevBorder !== undefined) {
            container.style('border-width', prevBorder);
        } else {
            container.removeStyle('border-width');
        }
        if (prevPadding !== undefined) {
            if (prevPadding) {
                container.style('padding', prevPadding);
            } else {
                container.removeStyle('padding');
            }
        } else {
            container.removeStyle('padding');
        }
        if (prevBackground !== undefined) {
            if (prevBackground) {
                container.style('background-color', prevBackground);
            } else {
                container.removeStyle('background-color');
            }
        }
        if (prevBackgroundOpacity !== undefined) {
            if (prevBackgroundOpacity) {
                container.style('background-opacity', prevBackgroundOpacity);
            } else {
                container.removeStyle('background-opacity');
            }
        } else {
            container.removeStyle('background-opacity');
        }
        if (prevLabelColor !== undefined) {
            if (prevLabelColor) {
                container.style('color', prevLabelColor);
            } else {
                container.removeStyle('color');
            }
        }
        if (prevFontSize !== undefined) {
            if (prevFontSize) {
                container.style('font-size', prevFontSize);
            } else {
                container.removeStyle('font-size');
            }
        } else {
            container.removeStyle('font-size');
        }
        if (prevFontWeight !== undefined) {
            if (prevFontWeight) {
                container.style('font-weight', prevFontWeight);
            } else {
                container.removeStyle('font-weight');
            }
        } else {
            container.removeStyle('font-weight');
        }
        if (prevOpacity !== undefined) {
            if (prevOpacity) {
                container.style('opacity', prevOpacity);
            } else {
                container.removeStyle('opacity');
            }
        } else {
            container.removeStyle('opacity');
        }
        if (prevTextValign !== undefined) {
            if (prevTextValign) {
                container.style('text-valign', prevTextValign);
            } else {
                container.removeStyle('text-valign');
            }
        } else {
            container.removeStyle('text-valign');
        }
        if (prevTextHalign !== undefined) {
            if (prevTextHalign) {
                container.style('text-halign', prevTextHalign);
            } else {
                container.removeStyle('text-halign');
            }
        } else {
            container.removeStyle('text-halign');
        }
        if (baseLabel !== undefined) {
            container.data('label', baseLabel);
        }
        if (wasLockedBeforeDock === true && container.lock) {
            container.lock();
        } else if (container.unlock) {
            container.unlock();
        }
        container.removeData('prevLockedState');
    },

    _expandContainerForLayout: function(container) {
        if (!container || typeof container.data !== 'function') {
            return { wasCollapsed: false };
        }

        const snapshot = this._captureCollapsedContainerState(container);
        if (!snapshot.wasCollapsed) {
            return snapshot;
        }

        try {
            if (window.GraphRenderer && typeof window.GraphRenderer.toggleContainerCollapse === 'function') {
                window.GraphRenderer.toggleContainerCollapse(container);
            } else {
                this._manuallyExpandCollapsedContainer(container, snapshot);
            }
        } catch (expandError) {
            console.warn('Failed to expand collapsed container for layout:', expandError);
        }

        return snapshot;
    },

    _restoreCollapsedContainerState: function(container, snapshot) {
        if (!snapshot || !snapshot.wasCollapsed || !container || typeof container.data !== 'function') {
            return;
        }

        const setData = (key, value) => {
            if (value !== undefined) {
                container.data(key, value);
            } else {
                container.removeData(key);
            }
        };

        setData('prevWidth', snapshot.prevWidth);
        setData('prevHeight', snapshot.prevHeight);
        setData('prevPosition', snapshot.prevPosition);
        setData('prevBorderWidth', snapshot.prevBorderWidth);
        setData('prevPadding', snapshot.prevPadding);
        setData('prevBackgroundColor', snapshot.prevBackgroundColor);
        setData('prevBackgroundOpacity', snapshot.prevBackgroundOpacity);
        setData('prevLabelColor', snapshot.prevLabelColor);
        setData('prevFontSize', snapshot.prevFontSize);
        setData('prevFontWeight', snapshot.prevFontWeight);
        setData('prevTextValign', snapshot.prevTextValign);
        setData('prevTextHalign', snapshot.prevTextHalign);
        setData('prevOpacity', snapshot.prevOpacity);
        setData('collapsedBaseWidth', snapshot.collapsedBaseWidth !== undefined ? snapshot.collapsedBaseWidth : 100);
        setData('collapsedBaseHeight', snapshot.collapsedBaseHeight !== undefined ? snapshot.collapsedBaseHeight : 30);
        setData('collapsedBasePadding', snapshot.collapsedBasePadding !== undefined ? snapshot.collapsedBasePadding : 0);
        setData('collapsedBaseBorderWidth', snapshot.collapsedBaseBorderWidth !== undefined ? snapshot.collapsedBaseBorderWidth : 2);
        setData('collapsedBaseFontSize', snapshot.collapsedBaseFontSize !== undefined ? snapshot.collapsedBaseFontSize : 14);
        setData('prevLockedState', snapshot.prevLockedState);

        if (snapshot.baseLabel !== undefined) {
            container.data('baseLabel', snapshot.baseLabel);
            container.data('label', snapshot.baseLabel);
        }

        if (container.children) {
            container.children().style('display', 'none');
            container.children().connectedEdges().style('display', 'none');
        }

        container.data('collapsed', true);

        if (snapshot.docked) {
            container.data('docked', snapshot.docked);
            if (window.GraphRenderer && typeof window.GraphRenderer.updateDockedContainerPositions === 'function') {
                try {
                    window.GraphRenderer.updateDockedContainerPositions(snapshot.docked.side);
                } catch (_) {}
            }
        }

        if (container.unlock) {
            container.unlock();
        }

        container.style('background-color', '#000000');
        container.style('background-opacity', 1);
        container.style('color', '#ffffff');
        container.style('font-weight', 'bold');
        container.style('text-valign', 'center');
        container.style('text-halign', 'center');
        container.style('opacity', 1);

        if (window.GraphRenderer && typeof window.GraphRenderer.applyDockedContainerScale === 'function') {
            try {
                window.GraphRenderer.applyDockedContainerScale(container);
            } catch (_) {}
        }
    },

    // Apply a specific layout (called from menu)
    applyLayout: function(layoutName) {

        // Check if we should skip layout application (e.g., when restoring saved positions)
        if (window.GraphRenderer && window.GraphRenderer.skipNextLayoutApplication) {
            window.GraphRenderer.skipNextLayoutApplication = false; // Reset flag
            return;
        }

        if (layoutName) {
            const previousLayout = this.currentLayout;
            const reapplyingSameTimeline = layoutName === previousLayout && layoutName === 'timeline';
            if (reapplyingSameTimeline) {
                const cy = window.GraphRenderer ? window.GraphRenderer.cy : null;
                if (cy && typeof cy.scratch === 'function') {
                    try {
                        this._timelineForceRebuildNextApply = cy.scratch('_timelineLayoutApplied') === true;
                    } catch (scratchError) {
                        this._timelineForceRebuildNextApply = false;
                    }
                } else {
                    this._timelineForceRebuildNextApply = false;
                }
                this._timelinePreservedBarStyle = this._captureTimelineBarStyle(cy);
            } else {
                this._timelineForceRebuildNextApply = false;
                this._timelinePreservedBarStyle = null;
            }

            if (layoutName !== previousLayout || reapplyingSameTimeline) {
                this.resetLayoutArtifacts(previousLayout);
            }
            this.currentLayout = layoutName;
        }

        this.applyCurrentLayout();
    },

    // Fit elements into the current layout without forcing a full redraw
    fitToCurrentLayout: function(context = {}) {
        const cy = window.GraphRenderer ? window.GraphRenderer.cy : null;
        if (!cy) {
            return false;
        }

        const nodes = context && Object.prototype.hasOwnProperty.call(context, 'nodes')
            ? context.nodes
            : undefined;

        if (this.currentLayout === 'timeline' && window.CustomLayouts && typeof window.CustomLayouts.fitNodesToTimeline === 'function') {
            try {
                return window.CustomLayouts.fitNodesToTimeline(cy, nodes);
            } catch (error) {
                console.error('Timeline fit failed:', error);
                return false;
            }
        }

        return false;
    },

    // Apply the current layout
    applyCurrentLayout: function() {
        let sizing;
        try {
            // Check if we should skip layout application (e.g., when restoring saved positions)
            if (window.GraphRenderer && window.GraphRenderer.skipNextLayoutApplication) {
                window.GraphRenderer.skipNextLayoutApplication = false; // Reset flag
                return;
            }
            
            const cy = window.GraphRenderer ? window.GraphRenderer.cy : null;
            if (!cy) {
                console.error('Cytoscape instance not available');
                return;
            }

            // Ensure Cytoscape's viewport measurements are up to date
            // before calculating layout dimensions
            cy.resize();

            // Comprehensive validation of Cytoscape instance
            
            // Check if there are any elements to layout
            const nodeCount = cy.nodes().length;
            const edgeCount = cy.edges().length;
            
            if (nodeCount === 0) {
                return;
            }
            
            // Validate graph state before applying layout
            try {
                // Check if graph is in a valid state
                if (!cy.ready()) {
                    cy.ready(() => {
                        this.applyLayout();
                    });
                    return;
                }
                
                // Validate all elements have valid data
                const invalidElements = [];
                cy.elements().forEach(ele => {
                    try {
                        const data = ele.data();
                        if (!data || typeof data.id !== 'string') {
                            invalidElements.push(ele.id());
                        }
                    } catch (error) {
                        invalidElements.push(ele.id());
                    }
                });
                
                if (invalidElements.length > 0) {
                    console.error('Invalid elements found:', invalidElements);
                    // Remove invalid elements
                    invalidElements.forEach(id => {
                        const ele = cy.getElementById(id);
                        if (ele.length > 0) {
                            ele.remove();
                        }
                    });
                }
            } catch (validationError) {
                console.error('Error validating graph state:', validationError);
            }
            
            // Calculate optimal sizing for this graph
            sizing = this.calculateOptimalSizing(cy);
            
            // Check if extensions are ready for extension-based layouts
            const isExtensionLayout = ['cola', 'dagre', 'klay', 'euler', 'cose-bilkent'].includes(this.currentLayout);
            if (isExtensionLayout) {
                const extensionName = this.currentLayout === 'cose-bilkent' ? 'coseBilkent' : this.currentLayout;
                const availableExtensions = window.QuantickleConfig.availableExtensions || {};
                
                if (!availableExtensions[extensionName]) {
                    // Don't reset to grid if we're loading a saved graph
                    if (!window.GraphManager || !window.GraphManager._isLoading) {
                        this.currentLayout = 'grid';
                    } else {
                    }
                } else {
                    // Try to register the extension on-demand if it's not already registered
                }
            }
            
            // Validate that Cytoscape is ready
            if (!cy.ready()) {
                cy.ready(() => {
                    this.applyLayout();
                });
                return;
            }
            
            // Ensure nodes are grabbable, except timeline scaffolding elements
            cy.nodes().forEach(function(node) {
                const type = node.data('type');
                if (type === 'timeline-bar' || type === 'timeline-anchor') {
                    node.grabbable(false);
                    if (typeof node.lock === 'function') {
                        node.lock();
                    } else {
                        node.locked(true);
                    }
                    node.selectable(false);
                    return;
                }
                node.grabbable(true);
            });

            // Check if the requested layout is available
            const availableExtensions = window.QuantickleConfig.availableExtensions || {};
            
            if (isExtensionLayout) {
                const extensionName = this.currentLayout === 'cose-bilkent' ? 'coseBilkent' : this.currentLayout;
                
                if (!availableExtensions[extensionName]) {
                    // Don't reset to grid if we're loading a saved graph
                    if (!window.GraphManager || !window.GraphManager._isLoading) {
                        this.currentLayout = 'grid';
                    } else {
                    }
                }
            }

            // Build layout options based on available extensions
            const layoutOptions = { ...window.QuantickleConfig.layoutOptions };
            
            // Add extension-based layouts if available
            if (availableExtensions.cola) {
                layoutOptions['cola'] = window.QuantickleConfig.extensionLayouts.cola;
            }
            
            if (availableExtensions.dagre) {
                layoutOptions['dagre'] = window.QuantickleConfig.extensionLayouts.dagre;
            }
            
            if (availableExtensions.klay) {
                layoutOptions['klay'] = window.QuantickleConfig.extensionLayouts.klay;
            }
            
            if (availableExtensions.euler) {
                layoutOptions['euler'] = window.QuantickleConfig.extensionLayouts.euler;
            }

            // Add cose-bilkent if available, otherwise use built-in cose
            if (availableExtensions.coseBilkent) {
                layoutOptions['cose-bilkent'] = window.QuantickleConfig.extensionLayouts['cose-bilkent'];
            } else {
                // Use built-in cose layout as fallback
                layoutOptions['cose'] = window.QuantickleConfig.layoutOptions.cose;
            }
            
            // Handle custom layouts separately

            if (['spiral', 'hexagonal', 'circle-packing', 'weighted-force', 'temporal-attraction','radial-recency', 'bulbous', 'timeline', 'timeline-scatter', 'true-3d-globe', 'absolute'].includes(this.currentLayout)) {
                
                // Apply custom layout directly with performance optimizations
                try {
                    // Note: Cytoscape doesn't have a direct way to get current layout
                    // We'll just proceed with creating the new layout

                    // Create a simple layout configuration for custom layouts
                    const layoutDefaults = window.QuantickleConfig.layoutOptions[this.currentLayout] || {};
                    const customLayoutOptions = {
                        ...layoutDefaults,
                        animate: layoutDefaults.animate !== undefined ? layoutDefaults.animate : true,
                        animationDuration: layoutDefaults.animationDuration !== undefined ? layoutDefaults.animationDuration : 500,
                        ready: function() {
                        },
                        stop: function() {
                        }
                    };

                    if (this.currentLayout === 'timeline' && this._timelinePreservedBarStyle) {
                        customLayoutOptions.barStyle = { ...this._timelinePreservedBarStyle };
                    }

                    // Determine if layout should be applied within containers
                    let containers = cy
                        .nodes()
                        .filter(n => n.selected() && window.LayoutManager.isContainerNode(n));
                    const selectedNodes = cy
                        .nodes()
                        .filter(n => n.selected() && !window.LayoutManager.isContainerNode(n));
                    const parentContainers = selectedNodes
                        .parents()
                        .filter(n => window.LayoutManager.isContainerNode(n));
                    if (parentContainers.length > 0) {
                        containers = containers.union(parentContainers);
                    }

                    if (window.CustomLayouts && typeof window.CustomLayouts.removeTimelineTicks === 'function') {
                        try {
                            if (this.currentLayout === 'timeline' && containers.length > 0) {
                                window.CustomLayouts.removeTimelineTicks(cy, { containers });
                            } else {
                                window.CustomLayouts.removeTimelineTicks(cy);
                            }
                        } catch (tickError) {
                            console.warn('Failed to clear timeline ticks before layout:', tickError);
                        }
                    }

                    let timelineAlreadyApplied = false;
                    if (this.currentLayout === 'timeline') {
                        if (this._timelineForceRebuildNextApply) {
                            timelineAlreadyApplied = true;
                        } else if (typeof cy.scratch === 'function') {
                            timelineAlreadyApplied = cy.scratch('_timelineLayoutApplied') === true;
                        }
                        this._timelineForceRebuildNextApply = false;
                    }
                    const isTimelineRestoring = Boolean(window.GraphManager && window.GraphManager._isRestoring === true);
                    const shouldForceTimelineRebuild = this.currentLayout === 'timeline' &&
                        containers.length === 0 &&
                        timelineAlreadyApplied &&
                        !isTimelineRestoring;
                    if (shouldForceTimelineRebuild) {
                        customLayoutOptions.forceRebuild = true;
                    }

                    const applyToContainers = (layoutFunc) => {
                        containers.forEach(container => {
                            const children = container.children();
                            if (children.length === 0) {
                                return;
                            }

                            container.data('_layoutName', this.currentLayout);
                            const center = container.position();
                            let width = parseFloat(container.data('width'));
                            let height = parseFloat(container.data('height'));
                            if (!width || !height) {
                                const bb = container.boundingBox();
                                width = bb.w;
                                height = bb.h;
                                container.data('width', width);
                                container.data('height', height);
                            }

                            const boundingBox = {
                                x1: center.x - width / 2,
                                y1: center.y - height / 2,
                                w: width,
                                h: height
                            };

                            layoutFunc.call(cy, {
                                ...customLayoutOptions,
                                eles: children,
                                boundingBox,
                                scaffoldingParentId: container.id()
                            });

                            container.position(center);
                            container.data('width', width);
                            container.data('height', height);
                        });
                    };
                    
                                // Debug: Check graph elements before applying layout
            
            // Check for any invalid elements
            cy.elements().forEach(ele => {
                try {
                    ele.data();
                } catch (error) {
                    console.error('Invalid element found:', ele.id(), error);
                }
            });
            
            // Apply the appropriate custom layout function directly
            if (this.currentLayout === 'spiral' && window.CustomLayouts && window.CustomLayouts.spiralLayout) {
                if (containers.length > 0) {
                    applyToContainers(window.CustomLayouts.spiralLayout);
                } else {
                    window.CustomLayouts.spiralLayout.call(cy, customLayoutOptions);
                    cy.fit();
                }
            } else if (this.currentLayout === 'hexagonal' && window.CustomLayouts && window.CustomLayouts.hexagonalLayout) {
                if (containers.length > 0) {
                    applyToContainers(window.CustomLayouts.hexagonalLayout);
                } else {
                    window.CustomLayouts.hexagonalLayout.call(cy, customLayoutOptions);
                    cy.fit();
                }
            } else if (this.currentLayout === 'bulbous' && window.CustomLayouts && window.CustomLayouts.bulbousLayout) {
                if (containers.length > 0) {
                    applyToContainers(window.CustomLayouts.bulbousLayout);
                } else {
                    window.CustomLayouts.bulbousLayout.call(cy, customLayoutOptions);
                }
                this.updateNodeStyles(cy, sizing);
            } else if (this.currentLayout === 'timeline-scatter' && window.CustomLayouts && window.CustomLayouts.timelineScatterLayout) {
                if (containers.length > 0) {
                    applyToContainers(window.CustomLayouts.timelineScatterLayout);
                } else {
                    window.CustomLayouts.timelineScatterLayout.call(cy, customLayoutOptions);
                }
            } else if (this.currentLayout === 'timeline' && window.CustomLayouts && window.CustomLayouts.timelineLayout) {
                if (containers.length > 0) {
                    applyToContainers(window.CustomLayouts.timelineLayout);
                    if (this.currentLayout === 'timeline') {
                        this._timelinePreservedBarStyle = null;
                    }
                } else {
                    window.CustomLayouts.timelineLayout.call(cy, customLayoutOptions);
                    if (this.currentLayout === 'timeline') {
                        this._timelinePreservedBarStyle = null;
                    }
                }
            } else if (this.currentLayout === 'radial-recency' && window.CustomLayouts && window.CustomLayouts.radialRecencyLayout) {
                if (containers.length > 0) {
                    applyToContainers(window.CustomLayouts.radialRecencyLayout);
                } else {
                    window.CustomLayouts.radialRecencyLayout.call(cy, customLayoutOptions);
                    cy.fit();
                }
            } else if (this.currentLayout === 'circle-packing' && window.CustomLayouts && window.CustomLayouts.circlePackingLayout) {
                if (containers.length > 0) {
                    applyToContainers(window.CustomLayouts.circlePackingLayout);
                } else {
                    window.CustomLayouts.circlePackingLayout.call(cy, customLayoutOptions);
                    cy.fit();
                }
            } else if (this.currentLayout === 'weighted-force' && window.CustomLayouts && window.CustomLayouts.weightedForceLayout) {
                if (containers.length > 0) {
                    applyToContainers(window.CustomLayouts.weightedForceLayout);
                } else {
                    window.CustomLayouts.weightedForceLayout.call(cy, customLayoutOptions);
                    cy.fit();
                }
            } else if (this.currentLayout === 'temporal-attraction' && window.CustomLayouts && window.CustomLayouts.temporalAttractionLayout) {
                if (containers.length > 0) {
                    applyToContainers(window.CustomLayouts.temporalAttractionLayout);
                } else {
                    window.CustomLayouts.temporalAttractionLayout.call(cy, customLayoutOptions);
                    cy.fit();
                }
            } else if (this.currentLayout === 'true-3d-globe') {
                        if (!window.GlobeLayout3D) {
                            const script = document.createElement('script');
                            script.src = 'js/3d-globe-layout.js';
                            script.onload = () => {
                                this.applyLayout('true-3d-globe');
                            };
                            document.head.appendChild(script);
                            return;
                        }
                        // Initialize 3D globe layout if not already done
                        if (!window.GlobeLayout3D.cy) {
                            window.GlobeLayout3D.init(cy);
                        }

                        // Reset active nodes before applying
                        window.GlobeLayout3D.activeNodes = null;

                        const globeOptions = {
                            depthEffect: window.GlobeLayout3D.config.depthEffect,
                            autoRotate: window.GlobeLayout3D.config.autoRotate
                        };

                        if (containers.length > 0) {
                            containers.forEach(container => {
                                const children = container.children();
                                if (children.length === 0) return;

                                const center = container.position();
                                let width = parseFloat(container.data('width'));
                                let height = parseFloat(container.data('height'));
                                if (!width || !height) {
                                    const bb = container.boundingBox();
                                    width = bb.w;
                                    height = bb.h;
                                    container.data('width', width);
                                    container.data('height', height);
                                }
                                const radius = Math.min(width, height) / 2;

                                window.GlobeLayout3D.applyTrue3DGlobeLayout({
                                    ...globeOptions,
                                    centerX: center.x,
                                    centerY: center.y,
                                    radius: radius
                                }, children);
                            });
                        } else {
                            const radius = Math.min(cy.width(), cy.height()) * 0.3;
                            window.GlobeLayout3D.applyTrue3DGlobeLayout({
                                ...globeOptions,
                                centerX: cy.width() / 2,
                                centerY: cy.height() / 2,
                                radius: radius
                            }, cy.nodes());
                            // Fit the graph after positioning
                            cy.fit();
                        }
                            } else if (this.currentLayout === 'absolute' && window.AbsoluteLayout) {
            // Initialize absolute layout if not already done
            if (!window.AbsoluteLayout.cy) {
                window.AbsoluteLayout.init(cy);
            }
            
            // Initialize 3D Globe layout for depth effects
            if (window.GlobeLayout3D) {
                window.GlobeLayout3D.init(cy);
                window.GlobeLayout3D.isActive = true;
                
                // Capture 3D positions after Absolute layout is applied
                setTimeout(() => {
                    window.GlobeLayout3D.captureAbsolutePositions();
                }, 100);
            }
            
            // Apply the absolute layout
            window.AbsoluteLayout.applyAbsoluteLayout({
                            depthEffect: true
                        });
                        // Fit the graph after positioning
                        cy.fit();
                    } else {
                        // For all other layouts, ensure 3D effects are disabled
                        if (window.GlobeLayout3D) {
                            window.GlobeLayout3D.stopAutoRotation();
                            window.GlobeLayout3D.resetVisualEffects();
                        }
                        
                        console.error('Custom layout function not found:', this.currentLayout);
                        // Fallback to grid with animations
                        const layout = cy.layout({ 
                            name: 'grid', 
                            fit: true, 
                            animate: true, 
                            animationDuration: 500,
                            padding: sizing.padding
                        });
                        layout.on('layoutready', () => {
                            this.updateNodeStyles(cy, sizing);
                        });
                        layout.run();
                    }
                    return;
                } catch (customError) {
                    console.error('Error applying custom layout:', customError);
                    // Fallback to grid with animations
                    const layout = cy.layout({ 
                        name: 'grid', 
                        fit: true, 
                        animate: true, 
                        animationDuration: 500,
                        padding: sizing.padding
                    });
                    layout.on('layoutready', () => {
                        this.updateNodeStyles(cy, sizing);
                    });
                    layout.run();
                    return;
                }
            }
            
                        // Handle standard layouts
            const selectedLayout = layoutOptions[this.currentLayout] || layoutOptions['grid'];
            
            if (!selectedLayout) {
                console.error('No layout configuration found for:', this.currentLayout);
                // Fallback to grid with animations
                const layout = cy.layout({ 
                    name: 'grid', 
                    fit: true, 
                    animate: true,
                    animationDuration: 500,
                    padding: sizing.padding,
                    nodeDimensionsIncludeLabels: true
                });
                layout.on('layoutready', () => {
                    this.updateNodeStyles(cy, sizing);
                });
                layout.run();
                return;
            }
            
            // Ensure the layout has a name property
            if (!selectedLayout.name) {
                console.error('Layout configuration missing name property:', selectedLayout);
                // Fallback to grid with animations
                const layout = cy.layout({ 
                    name: 'grid', 
                    fit: true, 
                    animate: true,
                    animationDuration: 500,
                    padding: sizing.padding,
                    nodeDimensionsIncludeLabels: true
                });
                layout.on('layoutready', () => {
                    this.updateNodeStyles(cy, sizing);
                });
                layout.run();
                return;
            }
            
            // Stop any existing layout to prevent conflicts
            // Note: Cytoscape doesn't have a direct way to get current layout
            // We'll just proceed with creating the new layout
            
            // Determine if animations should be disabled for performance
            const disableAnimations = this.shouldDisableAnimations(cy);
            
            // Create a clean layout configuration with only valid Cytoscape properties
            const optimizedLayout = {
                name: selectedLayout.name,
                fit: selectedLayout.fit !== undefined ? selectedLayout.fit : true,
                animate: !disableAnimations, // Disable animations for large datasets
                animationDuration: disableAnimations ? 0 : 500, // No animation duration if disabled
                padding: sizing.padding, // Use calculated padding
                nodeDimensionsIncludeLabels: selectedLayout.nodeDimensionsIncludeLabels !== undefined ? selectedLayout.nodeDimensionsIncludeLabels : true
            };
            
            // Add layout-specific properties based on the layout type
            if (selectedLayout.name === 'circle') {
                optimizedLayout.radius = Math.max(selectedLayout.radius || 200, sizing.spacing * 2);
                optimizedLayout.startAngle = selectedLayout.startAngle || 0;
                optimizedLayout.sweep = selectedLayout.sweep || 360;
                optimizedLayout.clockwise = selectedLayout.clockwise !== undefined ? selectedLayout.clockwise : true;
            } else if (selectedLayout.name === 'breadthfirst') {
                optimizedLayout.directed = selectedLayout.directed !== undefined ? selectedLayout.directed : false;
                optimizedLayout.spacingFactor = Math.max(selectedLayout.spacingFactor || 1.5, sizing.spacing / 50);
            } else if (selectedLayout.name === 'cose') {
                optimizedLayout.randomize = selectedLayout.randomize !== undefined ? selectedLayout.randomize : false;
                optimizedLayout.refresh = selectedLayout.refresh || 20;
                optimizedLayout.tilingPaddingVertical = sizing.spacing * 0.4; // Moderate padding
                optimizedLayout.tilingPaddingHorizontal = sizing.spacing * 0.4; // Moderate padding
                optimizedLayout.initialTemp = selectedLayout.initialTemp || 100;
                optimizedLayout.coolingFactor = selectedLayout.coolingFactor || 0.98;
                optimizedLayout.minTemp = selectedLayout.minTemp || 1.0;
                optimizedLayout.nodeRepulsion = Math.max(selectedLayout.nodeRepulsion || 6000, sizing.spacing * 8); // Moderate repulsion
                optimizedLayout.nodeOverlap = sizing.nodeSize * 0.1; // Moderate overlap prevention
                optimizedLayout.idealEdgeLength = sizing.spacing * 0.8; // Moderate edge length
                optimizedLayout.edgeElasticity = selectedLayout.edgeElasticity || 0.45;
                // Only include nestingRoot when explicitly provided to avoid
                // Cytoscape warnings about null/undefined properties
                if (selectedLayout.nestingRoot != null) {
                    optimizedLayout.nestingRoot = selectedLayout.nestingRoot;
                }
                optimizedLayout.nestingFactor = selectedLayout.nestingFactor || 0.1;
                optimizedLayout.gravity = selectedLayout.gravity || 40; // Moderate gravity
                optimizedLayout.numIter = selectedLayout.numIter || 500;
                optimizedLayout.tile = selectedLayout.tile !== undefined ? selectedLayout.tile : true;
                optimizedLayout.initialEnergyOnIncremental = selectedLayout.initialEnergyOnIncremental || 0.3;
            } else if (selectedLayout.name === 'cola') {
                // Cola-specific properties with moderate dynamic sizing
                optimizedLayout.nodeSpacing = sizing.spacing * 0.8; // Moderate node spacing
                optimizedLayout.edgeLength = sizing.spacing * 0.8; // Moderate edge length
                optimizedLayout.edgeSymDiffLength = 0.2; // Moderate symmetric difference length
                optimizedLayout.edgeJaccardLength = 0.2; // Moderate Jaccard length
                optimizedLayout.gravity = 20; // Moderate gravity
                optimizedLayout.scaling = 1.1; // Moderate scaling
                optimizedLayout.padding = sizing.padding * 0.8; // Moderate padding
                optimizedLayout.avoidOverlap = true;
                optimizedLayout.handleDisconnected = true;
                optimizedLayout.animate = !disableAnimations;
                optimizedLayout.animationDuration = disableAnimations ? 0 : 500;
            } else if (selectedLayout.name === 'euler') {
                // Euler-specific properties with more aggressive dynamic sizing
                optimizedLayout.springLength = sizing.spacing * 1.2; // More aggressive spring length
                optimizedLayout.springCoeff = 0.0012; // More aggressive spring coefficient
                optimizedLayout.drag = 0.15; // Less drag for better movement
                optimizedLayout.mass = 6; // Larger mass for better spacing
                optimizedLayout.animate = !disableAnimations;
                optimizedLayout.animationDuration = disableAnimations ? 0 : 500;
            } else if (selectedLayout.name === 'dagre') {
                // Dagre-specific properties with dynamic sizing
                optimizedLayout.nodeSep = sizing.spacing * 0.8; // More conservative node separation
                optimizedLayout.edgeSep = sizing.spacing * 0.5; // More conservative edge separation
                optimizedLayout.rankSep = sizing.spacing * 1.5; // More conservative rank separation
                optimizedLayout.rankDir = selectedLayout.rankDir || 'TB';
                optimizedLayout.ranker = selectedLayout.ranker || 'network-simplex';
                optimizedLayout.animate = !disableAnimations;
                optimizedLayout.animationDuration = disableAnimations ? 0 : 500;
                
                // Force Dagre to respect our node sizes
                optimizedLayout.nodeDimensionsIncludeLabels = false; // Let us control node dimensions
                optimizedLayout.padding = sizing.padding * 2; // Extra padding for Dagre
            } else if (selectedLayout.name === 'klay') {
                // Simplified Klay configuration
                optimizedLayout.klay = {
                    nodeLayering: 'NETWORK_SIMPLEX',
                    nodePlacement: 'BRANDES_KOEPF',
                    edgeRouting: 'ORTHOGONAL',
                    direction: 'DOWN',
                    spacing: 20
                };
            } else if (selectedLayout.name === 'breadthfirst') {
                // Breadthfirst-specific properties
                optimizedLayout.directed = selectedLayout.directed !== undefined ? selectedLayout.directed : false;
                optimizedLayout.spacingFactor = Math.max(selectedLayout.spacingFactor || 1.5, sizing.spacing / 50);
                
                // Force Breadthfirst to respect our node sizes
                optimizedLayout.nodeDimensionsIncludeLabels = false; // Let us control node dimensions
                optimizedLayout.padding = sizing.padding * 1.5; // Extra padding for Breadthfirst
            } else if (selectedLayout.name === 'concentric') {
                // Concentric-specific properties
                optimizedLayout.nodeDimensionsIncludeLabels = false; // Let us control node dimensions
                optimizedLayout.padding = sizing.padding * 1.5; // Extra padding for Concentric
            } else if (selectedLayout.name === 'cola') {
                // Cola-specific properties with dynamic sizing
                optimizedLayout.nodeSpacing = sizing.spacing * 0.8; // Moderate node spacing
                optimizedLayout.edgeLength = sizing.spacing * 0.8; // Moderate edge length
                optimizedLayout.edgeSymDiffLength = 0.2; // Moderate symmetric difference length
                optimizedLayout.edgeJaccardLength = 0.2; // Moderate Jaccard length
                optimizedLayout.gravity = 20; // Moderate gravity
                optimizedLayout.scaling = 1.1; // Moderate scaling
                optimizedLayout.padding = sizing.padding * 0.8; // Moderate padding
                optimizedLayout.avoidOverlap = true;
                optimizedLayout.handleDisconnected = true;
                optimizedLayout.animate = !disableAnimations;
                optimizedLayout.animationDuration = disableAnimations ? 0 : 500;
                
                // Force Cola to respect our node sizes
                optimizedLayout.nodeDimensionsIncludeLabels = false; // Let us control node dimensions
            }
            
            // Validate all properties to ensure none are null/undefined
            Object.keys(optimizedLayout).forEach(key => {
                if (optimizedLayout[key] === null || optimizedLayout[key] === undefined) {
                    delete optimizedLayout[key];
                }
            });
            
            // Ensure we have a valid layout configuration
            if (!optimizedLayout.name) {
                console.error('Layout configuration missing name property:', optimizedLayout);
                // Fallback to grid with animations
                const fallbackLayout = cy.layout({ 
                    name: 'grid', 
                    fit: true, 
                    animate: !disableAnimations,
                    animationDuration: disableAnimations ? 0 : 500,
                    padding: sizing.padding,
                    nodeDimensionsIncludeLabels: true
                });
                fallbackLayout.on('layoutready', () => {
                    this.updateNodeStyles(cy, sizing);
                });
                fallbackLayout.run();
                return;
            }
            
            // Validate that cy is a proper Cytoscape instance
            if (!cy || typeof cy.layout !== 'function') {
                console.error('Invalid Cytoscape instance:', cy);
                return;
            }
            
            // Test if we can create a simple layout first
            try {
                const testLayout = cy.layout({ name: 'grid', fit: true, animate: !disableAnimations, animationDuration: disableAnimations ? 0 : 500 });
                testLayout.stop(); // Stop the test layout
            } catch (testError) {
                console.error('Test layout failed:', testError);
                return; // Don't proceed if even a simple layout fails
            }

            // If containers or their children are selected, apply layout within each container
            let containers = cy
                .nodes()
                .filter(n => n.selected() && this.isContainerNode(n));
            const selectedNodes = cy
                .nodes()
                .filter(n => n.selected() && !this.isContainerNode(n));
            const parentContainers = selectedNodes
                .parents()
                .filter(n => this.isContainerNode(n));
            if (parentContainers.length > 0) {
                containers = containers.union(parentContainers);
            }

            if (containers.length > 0) {

                containers.forEach(container => {
                    const collapseState = this._expandContainerForLayout(container);
                    if (cy) {
                        if (typeof cy.batch === 'function' && typeof cy.notify === 'function') {
                            cy.batch(() => {});
                            cy.notify('position');
                        } else if (typeof cy.resize === 'function') {
                            cy.resize();
                        }
                    }
                    const restoreCollapseState = () => {
                        if (collapseState && collapseState.wasCollapsed && !collapseState._restored) {
                            this._restoreCollapsedContainerState(container, collapseState);
                            collapseState._restored = true;
                        }
                    };

                    // Include all descendant nodes within the container so nested
                    // containers are handled as a single unit. Using only direct
                    // children causes some layouts (notably cola) to receive
                    // incomplete hierarchy data which triggers runtime errors
                    // when the algorithm expects the full compound tree.
                    const descendantNodes = container.descendants();
                    if (descendantNodes.length === 0) {
                        restoreCollapseState();
                        return;
                    }

                    // Only layout the container's children and their internal edges.
                    // Including the container node itself in the layout causes some
                    // algorithms (e.g. cose-bilkent, klay) to reposition the
                    // container far from its original location. By excluding the
                    // container from the elements passed to the layout engine, we
                    // ensure the container's position remains stable while its
                    // contents are arranged.
                    const movableDescendants = descendantNodes.filter(n => {
                        const isLocked = typeof n.locked === 'function' ? n.locked() : false;
                        return !isLocked && !n.data('pinned');
                    });
                    // Edges where both endpoints remain within the filtered
                    // descendant set used for the subset layout.
                    const internalEdges = descendantNodes.connectedEdges().filter(e =>
                        movableDescendants.contains(e.source()) && movableDescendants.contains(e.target())
                    );
                    if (movableDescendants.length === 0) {
                        restoreCollapseState();
                        return;
                    }

                    const center = container.position();
                    let width = parseFloat(container.data('width'));
                    let height = parseFloat(container.data('height'));
                    if (!width || !height) {
                        const bb = container.boundingBox();
                        width = bb.w;
                        height = bb.h;
                        container.data('width', width);
                        container.data('height', height);
                    }

                    const boundingBox = {
                        x1: center.x - width / 2,
                        y1: center.y - height / 2,
                        x2: center.x + width / 2,
                        y2: center.y + height / 2,
                        w: width,
                        h: height
                    };

                    // Reuse the requested layout configuration so algorithms such as
                    // klay, force-organic, and cola operate on the container contents
                    // without being silently replaced by a different layout.
                    const config = {
                        ...optimizedLayout,
                        fit: false,
                        boundingBox
                    };

                    if (!config.name) {
                        config.name = this.currentLayout;
                    }

                    const tempCy = new cy.constructor({ headless: true, styleEnabled: true });

                    const lockedOrPinned = new Set();

                    movableDescendants.forEach(node => {
                        const nodeId = node.id();
                        const originalPosition = this._resolveFiniteNodePosition(node, center, 'container-seed');
                        const relativePosition = {
                            x: originalPosition.x - center.x,
                            y: originalPosition.y - center.y
                        };

                        let nodeWidth;
                        let nodeHeight;

                        if (node && typeof node.boundingBox === 'function') {
                            const bb = node.boundingBox({ includeLabels: true, includeOverlays: true });
                            if (bb && Number.isFinite(bb.w) && Number.isFinite(bb.h) && bb.w > 0 && bb.h > 0) {
                                nodeWidth = bb.w;
                                nodeHeight = bb.h;
                            } else if (
                                bb &&
                                Number.isFinite(bb.x1) &&
                                Number.isFinite(bb.x2) &&
                                Number.isFinite(bb.y1) &&
                                Number.isFinite(bb.y2)
                            ) {
                                const widthFromBounds = bb.x2 - bb.x1;
                                const heightFromBounds = bb.y2 - bb.y1;
                                if (widthFromBounds > 0 && heightFromBounds > 0) {
                                    nodeWidth = widthFromBounds;
                                    nodeHeight = heightFromBounds;
                                }
                            }
                        }

                        if (
                            (!Number.isFinite(nodeWidth) || !Number.isFinite(nodeHeight)) &&
                            node &&
                            typeof node.outerWidth === 'function' &&
                            typeof node.outerHeight === 'function'
                        ) {
                            const outerWidth = node.outerWidth();
                            const outerHeight = node.outerHeight();
                            if (Number.isFinite(outerWidth) && Number.isFinite(outerHeight) && outerWidth > 0 && outerHeight > 0) {
                                nodeWidth = outerWidth;
                                nodeHeight = outerHeight;
                            }
                        }

                        if (
                            (!Number.isFinite(nodeWidth) || !Number.isFinite(nodeHeight)) &&
                            node &&
                            typeof node.data === 'function'
                        ) {
                            const dataWidth = parseFloat(node.data('width'));
                            const dataHeight = parseFloat(node.data('height'));
                            if (Number.isFinite(dataWidth) && Number.isFinite(dataHeight) && dataWidth > 0 && dataHeight > 0) {
                                nodeWidth = dataWidth;
                                nodeHeight = dataHeight;
                            }
                        }

                        const data = { id: nodeId };
                        if (Number.isFinite(nodeWidth)) {
                            data.width = nodeWidth;
                        }
                        if (Number.isFinite(nodeHeight)) {
                            data.height = nodeHeight;
                        }

                        const style = {};
                        if (Number.isFinite(nodeWidth)) {
                            style.width = nodeWidth;
                        }
                        if (Number.isFinite(nodeHeight)) {
                            style.height = nodeHeight;
                        }

                        const tempNode = tempCy.add({
                            group: 'nodes',
                            data,
                            position: relativePosition,
                            style: Object.keys(style).length ? style : undefined
                        });

                        if ((typeof node.locked === 'function' && node.locked()) || node.data('pinned')) {
                            if (typeof tempNode.lock === 'function') {
                                tempNode.lock();
                            }
                            lockedOrPinned.add(nodeId);
                        }
                    });

                    internalEdges.forEach(edge => {
                        const sourceId = edge.source().id();
                        const targetId = edge.target().id();

                        if (!tempCy.getElementById(sourceId).length || !tempCy.getElementById(targetId).length) {
                            return;
                        }

                        tempCy.add({
                            group: 'edges',
                            data: {
                                id: edge.id(),
                                source: sourceId,
                                target: targetId
                            }
                        });
                    });

                    const subsetConfig = {
                        ...config,
                        animate: false,
                        nodeDimensionsIncludeLabels: true,
                        boundingBox: {
                            x1: -width / 2,
                            y1: -height / 2,
                            x2: width / 2,
                            y2: height / 2,
                            w: width,
                            h: height
                        }
                    };

                    delete subsetConfig.eles;

                    const layout = tempCy.elements().layout(subsetConfig);

                    layout.once('layoutstop', () => {
                        const movableNodes = descendantNodes.filter(n => !lockedOrPinned.has(n.id()));

                        try {
                            this.ensureContainerDescendantsRendered(
                                cy,
                                movableNodes,
                                sizing,
                                () => {
                                    tempCy.nodes().forEach(tempNode => {
                                        const nodeId = tempNode.id();
                                        if (lockedOrPinned.has(nodeId)) {
                                            return;
                                        }

                                        const targetNode = movableNodes.filter(n => n.id() === nodeId);
                                        if (targetNode.length === 0) {
                                            return;
                                        }

                                        const position = tempNode.position();
                                        if (!this._isFinitePosition(position)) {
                                            if (this.isDebugModeEnabled()) {
                                                console.debug(
                                                    `[LayoutManager] Skipping non-finite layout position for node "${nodeId}".`,
                                                    { position }
                                                );
                                            }
                                            return;
                                        }
                                        targetNode.position({
                                            x: position.x + center.x,
                                            y: position.y + center.y
                                        });
                                    });

                                    container.position(center);
                                    container.data('width', width);
                                    container.data('height', height);
                                },
                                descendantNodes
                            );
                        } finally {
                            restoreCollapseState();

                            if (typeof tempCy.destroy === 'function') {
                                tempCy.destroy();
                            }
                        }
                    });

                    try {
                        layout.run();
                    } catch (subsetError) {
                        restoreCollapseState();
                        if (typeof tempCy.destroy === 'function') {
                            tempCy.destroy();
                        }
                        console.error('Container subset layout failed:', subsetError);
                    }
                });

                if (window.UI && window.UI.showNotification) {
                    window.UI.showNotification(
                        `Applied ${this.currentLayout} layout to selected container${containers.length > 1 ? 's' : ''}`,
                        'success',
                        3000
                    );
                }

                return;
            }

            try {
                const layout = cy.layout(optimizedLayout);
                
                // Add layout completion handlers to update node styles
                layout.on('layoutready', () => {
                    this.updateNodeStyles(cy, sizing);
                    
                    // For extension layouts, reapply styles after a delay to ensure they persist
                    const extensionLayouts = ['cola', 'dagre', 'klay'];
                    if (extensionLayouts.includes(this.currentLayout)) {
                        setTimeout(() => {
                            this.updateNodeStyles(cy, sizing);
                        }, 100);
                    }
                });
                
                // Add zoom reapplication after layout is ready
                this.addZoomReapplication(layout);
                
                layout.on('layoutstop', () => {
                    this.updateNodeStyles(cy, sizing);
                    
                    // REMOVED: Layout-triggered normalization that was overriding domain styling
                    // The layout system now preserves domain shapes and icons directly
                    
                    // For extension layouts, reapply styles after a delay to ensure they persist
                    const extensionLayouts = ['cola', 'dagre', 'klay'];
                    if (extensionLayouts.includes(this.currentLayout)) {
                        setTimeout(() => {
                            this.updateNodeStyles(cy, sizing);
                            
                            // REMOVED: Extension layout normalization that was overriding domain styling
                        }, 100);
                    }
                });
                
                // Special handling for extension-based layouts that might not be registered
                if (this.currentLayout === 'euler') {
                    
                    try {
                        layout.run();
                    } catch (eulerError) {
                        console.error('Euler layout failed:', eulerError);
                        
                        // Try to register the Euler extension directly
                        try {
                            if (typeof window.cytoscapeEuler !== 'undefined') {
                                cytoscape.use(window.cytoscapeEuler);
                                // Try the layout again
                                const retryLayout = cy.layout(optimizedLayout);
                                retryLayout.on('layoutready', () => {
                                    this.updateNodeStyles(cy, sizing);
                                });
                                retryLayout.run();
                            } else if (typeof window.euler !== 'undefined') {
                                cytoscape.use(window.euler);
                                // Try the layout again
                                const retryLayout = cy.layout(optimizedLayout);
                                retryLayout.on('layoutready', () => {
                                    this.updateNodeStyles(cy, sizing);
                                });
                                retryLayout.run();
                            } else {
                                console.error('Euler extension not found, falling back to cose');
                                if (window.UI && window.UI.showNotification) {
                                    window.UI.showNotification('Euler layout not available, using cose layout instead', 'warning', 3000);
                                }
                                const fallbackLayout = cy.layout({ name: 'cose', fit: true, animate: !disableAnimations, animationDuration: disableAnimations ? 0 : 500 });
                                fallbackLayout.on('layoutready', () => {
                                    this.updateNodeStyles(cy, sizing);
                                });
                                fallbackLayout.run();
                            }
                        } catch (registerError) {
                            console.error('Failed to register Euler extension on-demand:', registerError);
                            if (window.UI && window.UI.showNotification) {
                                window.UI.showNotification('Euler layout failed, using cose layout instead', 'warning', 3000);
                            }
                            const fallbackLayout = cy.layout({ name: 'cose', fit: true, animate: !disableAnimations, animationDuration: disableAnimations ? 0 : 500 });
                            fallbackLayout.on('layoutready', () => {
                                this.updateNodeStyles(cy, sizing);
                            });
                            fallbackLayout.run();
                        }
                    }
                } else if (this.currentLayout === 'klay') {
                    try {
                        
                        // Check for undefined values in klay options
                        if (optimizedLayout.klay) {
                            Object.keys(optimizedLayout.klay).forEach(key => {
                                if (optimizedLayout.klay[key] === undefined) {
                                }
                            });
                        }
                        
                        layout.run();
                        
                        // Re-apply zoom settings after layout starts
                        setTimeout(() => {
                            if (window.GraphRenderer && window.GraphRenderer.reapplyZoomSettings) {
                                window.GraphRenderer.reapplyZoomSettings();
                            }
                        }, 100);
                        
                        // For Klay layout, apply node styles more aggressively
                        setTimeout(() => {
                            this.updateNodeStyles(cy, sizing);
                        }, 100);
                        
                        // Apply styles again after a longer delay to ensure layout is complete
                        setTimeout(() => {
                            this.updateNodeStyles(cy, sizing);
                        }, 500);
                        
                        // Apply styles multiple times to override Klay's internal sizing
                        setTimeout(() => {
                            this.updateNodeStyles(cy, sizing);
                        }, 1000);
                        
                        setTimeout(() => {
                            this.updateNodeStyles(cy, sizing);
                        }, 2000);
                        
                    } catch (klayError) {
                        console.error('Klay layout failed:', klayError);
                        console.error('Klay error details:', klayError.message, klayError.stack);
                        // Fallback to cose for klay
                        if (window.UI && window.UI.showNotification) {
                            window.UI.showNotification('Klay layout failed, using cose layout instead', 'warning', 3000);
                        }
                        const fallbackLayout = cy.layout({ name: 'cose', fit: true, animate: !disableAnimations, animationDuration: disableAnimations ? 0 : 500 });
                        fallbackLayout.on('layoutready', () => {
                            this.updateNodeStyles(cy, sizing);
                        });
                        fallbackLayout.run();
                    }
                                } else if (this.currentLayout === 'dagre') {
                    try {
                        layout.run();
                        
                        // For Dagre layout, apply node styles more aggressively
                        setTimeout(() => {
                            this.updateNodeStyles(cy, sizing);
                        }, 100);
                        
                        setTimeout(() => {
                            this.updateNodeStyles(cy, sizing);
                        }, 500);
                        
                        setTimeout(() => {
                            this.updateNodeStyles(cy, sizing);
                        }, 1000);
                        
                        setTimeout(() => {
                            this.updateNodeStyles(cy, sizing);
                        }, 2000);
                        
                    } catch (dagreError) {
                        console.error('Dagre layout failed:', dagreError);
                        // Fallback to grid for dagre
                        const fallbackLayout = cy.layout({ name: 'grid', fit: true, animate: !disableAnimations, animationDuration: disableAnimations ? 0 : 500 });
                        fallbackLayout.on('layoutready', () => {
                            this.updateNodeStyles(cy, sizing);
                        });
                        fallbackLayout.run();
                    }
                } else {
                    layout.run();
                    
                    // For all layouts, update node styles immediately to ensure proper sizing
                    setTimeout(() => {
                        this.updateNodeStyles(cy, sizing);
                    }, 200); // Slightly longer delay to ensure layout is complete
                }
            } catch (layoutError) {
                console.error('Error creating layout:', layoutError);
                console.error('Layout options that failed:', optimizedLayout);
                
                // Try with minimal options
                try {
                    const minimalLayout = cy.layout({ 
                        name: 'grid', 
                        fit: true, 
                        animate: !disableAnimations,
                        animationDuration: disableAnimations ? 0 : 500,
                        padding: sizing.padding
                    });
                    minimalLayout.on('layoutready', () => {
                        this.updateNodeStyles(cy, sizing);
                    });
                    minimalLayout.run();
                } catch (minimalError) {
                    console.error('Even minimal layout failed:', minimalError);
                }
            }
        } catch (error) {
            console.error('Error applying layout:', error);
            // Fallback to grid layout with proper options
            try {
                const cy = window.GraphRenderer ? window.GraphRenderer.cy : null;
                if (cy) {
                    const fallbackSizing = sizing || this.calculateOptimalSizing(cy);
                    const disableAnimations = this.shouldDisableAnimations ? this.shouldDisableAnimations(cy) : false;

                    const layout = cy.layout({
                        name: 'grid',
                        fit: true,
                        animate: !disableAnimations,
                        animationDuration: disableAnimations ? 0 : 500,
                        padding: fallbackSizing.padding,
                        nodeDimensionsIncludeLabels: true
                    });
                    layout.on('layoutready', () => {
                        this.updateNodeStyles(cy, fallbackSizing);
                    });
                    layout.run();
                }
            } catch (fallbackError) {
                console.error('Even fallback layout failed:', fallbackError);
            }
        }
    },

    // Update layout during drag operations
    updateLayoutDuringDrag: function() {
        const cy = window.GraphRenderer ? window.GraphRenderer.cy : null;
        
        if (!cy || !(this.currentLayout === 'cose' || this.currentLayout === 'cose-bilkent' || this.currentLayout === 'cola' || this.currentLayout === 'euler')) {
            return;
        }
        
        // Note: Cytoscape doesn't have a direct way to get current layout
        // We'll just proceed with creating the new layout
        
        // Determine if animations should be disabled for drag updates
        const disableAnimations = this.shouldDisableAnimations(cy);
        
        // Create a lightweight layout update that preserves current positions
        const dragLayoutOptions = {
            'cose': {
                name: 'cose',
                fit: false, // Don't fit to avoid jarring movements
                animate: !disableAnimations,
                animationDuration: disableAnimations ? 0 : 500, // Shorter animation for responsiveness
                randomize: false, // Don't randomize to maintain relative positions
                nodeDimensionsIncludeLabels: true,
                refresh: 10, // More frequent updates
                tilingPaddingVertical: 10,
                tilingPaddingHorizontal: 10,
                initialTemp: 50, // Lower temperature for faster convergence
                coolingFactor: 0.99,
                minTemp: 1.0,
                nodeRepulsion: 4000, // Slightly reduced for smoother movement
                nodeOverlap: 10,
                idealEdgeLength: 80, // Shorter edges for tighter clustering
                edgeElasticity: 0.45,
                nestingFactor: 0.1,
                gravity: 30, // Reduced gravity for smoother movement
                numIter: 200, // Fewer iterations for faster updates
                tile: false, // Don't tile during drag updates
                initialEnergyOnIncremental: 0.1
            },
            'cola': {
                name: 'cola',
                fit: false,
                animate: !disableAnimations,
                animationDuration: disableAnimations ? 0 : 500,
                refresh: 10,
                maxSimulationTime: 1000,
                nodeDimensionsIncludeLabels: true,
                randomize: false,
                avoidOverlap: true,
                handleDisconnected: true,
                nodeSpacing: 30,
                edgeLength: 150,
                edgeSymDiffLength: 0.2,
                edgeJaccardLength: 0.2,
                nestingFactor: 0.1,
                gravity: 3,
                scaling: 1.1,
                padding: 30
            },
            'euler': {
                name: 'euler',
                fit: false,
                animate: !disableAnimations,
                animationDuration: disableAnimations ? 0 : 500,
                refresh: 10,
                maxSimulationTime: 1000,
                nodeDimensionsIncludeLabels: true,
                randomize: false,
                avoidOverlap: true,
                handleDisconnected: true,
                nodeSpacing: 30,
                edgeLength: 150,
                edgeSymDiffLength: 0.2,
                edgeJaccardLength: 0.2,
                nestingFactor: 0.1,
                gravity: 3,
                scaling: 1.1,
                padding: 30
            }
        };
        
        // Use cose-bilkent if available, otherwise fallback to cose
        if (window.QuantickleConfig.availableExtensions.coseBilkent) {
            dragLayoutOptions['cose-bilkent'] = {
                name: 'cose-bilkent',
                fit: false,
                animate: !disableAnimations,
                animationDuration: disableAnimations ? 0 : 500,
                randomize: false,
                nodeDimensionsIncludeLabels: true,
                refresh: 10,
                tilingPaddingVertical: 10,
                tilingPaddingHorizontal: 10,
                initialTemp: 50,
                coolingFactor: 0.99,
                minTemp: 1.0,
                nodeRepulsion: 4000,
                nodeOverlap: 10,
                idealEdgeLength: 80,
                edgeElasticity: 0.45,
                nestingFactor: 0.1,
                gravity: 30,
                numIter: 200,
                tile: false,
                initialEnergyOnIncremental: 0.1,
                nodeRepulsionRange: 1.5,
                gravityRange: 1.5
            };
        }
        
        const selectedLayout = dragLayoutOptions[this.currentLayout] || dragLayoutOptions['cose'];
        
        const layout = cy.layout(selectedLayout);
        layout.run();
    },

    // Enable manual interaction
    enableManualInteraction: function() {
        const cy = window.GraphRenderer ? window.GraphRenderer.cy : null;
        if (!cy) {
            return;
        }
        
        // Note: Cytoscape doesn't have a direct way to get current layout
        // We'll just proceed with enabling manual interaction
        
        // Ensure all nodes are grabbable
        cy.nodes().forEach(function(node) {
            node.grabbable(true);
        });
    },

    // Toggle auto-update
    toggleAutoUpdate: function() {
        this.autoUpdateEnabled = !this.autoUpdateEnabled;
        const btn = document.getElementById('autoUpdateBtn');
        if (btn) {
            btn.textContent = `Auto Update: ${this.autoUpdateEnabled ? 'ON' : 'OFF'}`;
            btn.style.backgroundColor = this.autoUpdateEnabled ? '#4CAF50' : '#6c757d';
        }
    },

    // Update layout manually
    updateLayout: function() {
        if (this.currentLayout === 'cose' || this.currentLayout === 'cose-bilkent' || this.currentLayout === 'cola' || this.currentLayout === 'euler') {
            this.applyLayout();
        } else {
        }
    },

    // Update layout dropdown with available layouts (now just for menu bar compatibility)
    updateLayoutDropdown: function() {
        
        // Don't change layout if we're in the middle of loading/restoring a graph
        if (window.GraphManager && window.GraphManager._isLoading) {
            return;
        }
        
        // Always available layouts
        const alwaysAvailable = [
            { value: 'grid', text: 'Grid - Structured' },
            { value: 'circle', text: 'Circle - Circular' },
            { value: 'breadthfirst', text: 'Tree - Hierarchical' },
            { value: 'concentric', text: 'Radial - Concentric' },
            { value: 'cose', text: 'Force - Organic' },
            { value: 'random', text: 'Random - Random' },
            { value: 'preset', text: 'Manual - Custom' },
            { value: 'spiral', text: 'Spiral - Spiral Pattern' },
            { value: 'hexagonal', text: 'Hexagonal - Hex Grid' },
            { value: 'bulbous', text: 'Bulbous - Bulging Radial' },
            { value: 'circle-packing', text: 'Circle Packing - Nested Circles' },
            { value: 'weighted-force', text: 'Weighted Force - Edge Weight Based' },
            { value: 'radial-recency', text: 'Radial Recency - Concentric Time Rings' },
            { value: 'temporal-attraction', text: 'Temporal Attraction - Time Weighted' },
            { value: 'timeline', text: 'Timeline - Time Axis' },
            { value: 'timeline-scatter', text: 'Timeline Scatter - Timestamp Map' },
            { value: 'true-3d-globe', text: 'True 3D Globe - Spherical 3D Layout' },
            { value: 'absolute', text: 'Absolute - Fixed 3D Coordinates' }
        ];
        
        // Extension-based layouts
        const extensionLayouts = [];
        const availableExtensions = window.QuantickleConfig.availableExtensions || {};
        if (availableExtensions.cola) {
            extensionLayouts.push({ value: 'cola', text: 'Cola - Force-directed' });
        }
        if (availableExtensions.dagre) {
            extensionLayouts.push({ value: 'dagre', text: 'Dagre - Hierarchical' });
        }
        if (availableExtensions.klay) {
            extensionLayouts.push({ value: 'klay', text: 'Klay - Layered' });
        }
        if (availableExtensions.euler) {
            extensionLayouts.push({ value: 'euler', text: 'Euler - Force-directed' });
        }
        
        // Add cose-bilkent if available
        if (availableExtensions.coseBilkent) {
            alwaysAvailable.push({ value: 'cose-bilkent', text: 'Force Organic - Clustering' });
        }
        
        // Log current layout status
        
        // Test if Absolute Layout is working
        if (window.AbsoluteLayout) {
        } else {
        }
        
        // Test if Absolute Layout is working
        if (window.AbsoluteLayout) {
        } else {
        }
    },

    // Handle drag events
    handleDragEvent: function(evt) {
        
        // If auto-update is enabled and we're using a force-directed layout, update continuously
        if (this.autoUpdateEnabled && (this.currentLayout === 'cose' || this.currentLayout === 'cose-bilkent' || this.currentLayout === 'cola' || this.currentLayout === 'euler')) {
            // Clear any pending timeout
            if (this.dragUpdateTimeout) {
                clearTimeout(this.dragUpdateTimeout);
            }
            
            // Update layout with a small delay to avoid too frequent updates
            this.dragUpdateTimeout = setTimeout(() => {
                this.updateLayoutDuringDrag();
            }, 100); // Update every 100ms during drag
        } else {
        }
    },

    // Handle drag end events
    handleDragEndEvent: function(evt) {
        
        // Clear any pending timeout
        if (this.dragUpdateTimeout) {
            clearTimeout(this.dragUpdateTimeout);
            this.dragUpdateTimeout = null;
        }
        
        // If auto-update is enabled and we're using a force-directed layout, do final update
        if (this.autoUpdateEnabled && (this.currentLayout === 'cose' || this.currentLayout === 'cose-bilkent' || this.currentLayout === 'cola' || this.currentLayout === 'euler')) {
            setTimeout(() => {
                this.updateLayoutDuringDrag();
            }, 50); // Small delay for final update
        }
    },

    // Determine if animations should be disabled based on graph size
    shouldDisableAnimations: function(cy) {
        if (!cy) return false;
        
        const nodeCount = cy.nodes().length;
        const edgeCount = cy.edges().length;
        
        // Disable animations for large graphs to improve performance
        return nodeCount > 1000 || edgeCount > 2000;
    },

    // Check if a layout supports 3D effects
    is3DLayout: function(layoutName) {
        const threeDLayouts = [
            'true-3d-globe',  // True 3D Globe layout
            'absolute'        // Absolute 3D coordinates layout
        ];
        return threeDLayouts.includes(layoutName);
    },

    // Update selection highlighting when nodes/edges are selected or deselected
    updateSelectionHighlighting: function(cy) {
        if (!cy) return;
        
        // Get current sizing for consistent styling
        const sizing = this.calculateOptimalSizing(cy);
        
        const self = this;

        // Update only the selected/deselected elements
        cy.nodes(':selected').forEach(function(node) {
            const nodeSize = sizing.nodeSize;
            const label = node.data('label') || node.data('name') || node.data('id') || '';
            const labelLength = label.length;
            let optimalFontSize = Math.max(8, nodeSize * 0.3);

            if (labelLength > 20) optimalFontSize = Math.max(6, optimalFontSize * 0.8);
            if (labelLength > 30) optimalFontSize = Math.max(5, optimalFontSize * 0.7);
            if (labelLength > 40) optimalFontSize = Math.max(4, optimalFontSize * 0.6);

            const incomingEdges = node.incomers('edge').length;
            const outgoingEdges = node.outgoers('edge').length;
            const labelPosition = incomingEdges <= outgoingEdges ? 'top' : 'bottom';
            const marginY = labelPosition === 'top' ? -(nodeSize * 0.6) : (nodeSize * 0.6);

            const isPinned = self.isNodePinned(node);

            if (isPinned) {
                node.style({
                    'border-width': 6,
                    'border-color': '#ff0000',
                    'border-opacity': 1
                });
            } else {
                node.style({
                    'border-width': 4,
                    'border-color': '#ff0000',
                    'border-opacity': 1
                });
            }
        });
        
        cy.nodes(':unselected').forEach(function(node) {
            const isPinned = self.isNodePinned(node);

            if (isPinned) {
                node.style({
                    'border-width': 6,
                    'border-color': '#1e90ff',
                    'border-opacity': 1
                });
            } else {
                const isContainer = self.isContainerNode(node);
                node.style({
                    'border-width': isContainer ? 1 : 0,
                    'border-color': '#000000',
                    'border-opacity': isContainer ? 1 : 0
                });
            }
        });
        
        // Update edge highlighting
        const edgeWidth = Math.max(1, sizing.nodeSize * 0.03);
        
        cy.edges(':selected').forEach(function(edge) {
            edge.style({
                'width': Math.max(2, edgeWidth * 2),
                'line-color': '#ff0000',
                'target-arrow-color': '#ff0000'
            });
        });
        
        cy.edges(':unselected').forEach(function(edge) {
            // Preserve global edge styling from Graph Area Editor
            const settings = window.GraphAreaEditor?.getSettings?.();
            const globalEdgeColor = settings ? settings.edgeColor : '#333333';
            const globalEdgeWidth = settings ? settings.edgeThickness : edgeWidth;
            const globalLineStyle = settings ? settings.edgeFormat : 'solid';
            const globalCurveStyle = settings ? settings.edgeShape : 'bezier';
            const globalShowArrows = settings ? settings.showArrows : false;
            const globalArrowSize = settings ? settings.arrowSize : 6;

            const color = edge.data('color') || globalEdgeColor;
            const width = edge.data('width') || globalEdgeWidth;
            const lineStyle = edge.data('lineStyle') || globalLineStyle;
            const curveStyle = edge.data('curveStyle') || globalCurveStyle;
            const showArrowsData = edge.data('showArrows');
            const showArrows = typeof showArrowsData === 'boolean'
                ? showArrowsData
                : globalShowArrows;
            const arrowSizeData = edge.data('arrowSize');
            const arrowSize = (typeof arrowSizeData === 'number' && !isNaN(arrowSizeData))
                ? arrowSizeData
                : globalArrowSize;

            edge.style({
                'width': width,
                'line-color': color,
                'target-arrow-color': color,
                'line-style': lineStyle,
                'curve-style': curveStyle,
                'target-arrow-shape': showArrows ? 'triangle' : 'none',
                'arrow-scale': arrowSize / 6
            });
        });
    }
}; 
