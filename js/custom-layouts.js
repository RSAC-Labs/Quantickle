// Custom layout implementations for Quantickle
// These layouts can be registered with Cytoscape.js

// Optimized Spiral Layout - O(n) complexity
function spiralLayout(options = {}) {
    const cy = this;
    const nodes = (options.eles || cy.nodes()).filter(n => !(n.data('pinned') || n.locked()));
    const bb = options.boundingBox;
    const center = bb ? { x: bb.x1 + bb.w / 2, y: bb.y1 + bb.h / 2 } : { x: cy.width() / 2, y: cy.height() / 2 };
    const spacing = options.spacing || 50;
    
    // Use batch processing for large datasets
    const batchSize = 100;
    const processBatch = (startIndex) => {
        const endIndex = Math.min(startIndex + batchSize, nodes.length);
        
        for (let i = startIndex; i < endIndex; i++) {
            const node = nodes[i];
            const angle = (i * 2 * Math.PI) / nodes.length;
            const distance = (i * spacing) / (2 * Math.PI);
            const x = center.x + (distance * Math.cos(angle));
            const y = center.y + (distance * Math.sin(angle));
            
            node.position({ x, y });
        }
        
        if (endIndex < nodes.length) {
            // Process next batch asynchronously to prevent UI blocking
            setTimeout(() => processBatch(endIndex), 0);
        } else {
        }
    };
    
    processBatch(0);
}

// Optimized Hexagonal Grid Layout - O(n) complexity
function hexagonalLayout(options = {}) {
    const cy = this;
    const nodes = (options.eles || cy.nodes()).filter(n => !(n.data('pinned') || n.locked()));
    const bb = options.boundingBox;
    const center = bb ? { x: bb.x1 + bb.w / 2, y: bb.y1 + bb.h / 2 } : { x: cy.width() / 2, y: cy.height() / 2 };
    const size = options.size || 60;
    const cols = Math.ceil(Math.sqrt(nodes.length));
    const rows = Math.ceil(nodes.length / cols);
    
    // Batch processing for large datasets
    const batchSize = 100;
    let nodeIndex = 0;
    
    const processBatch = (startIndex) => {
        const endIndex = Math.min(startIndex + batchSize, nodes.length);
        
        for (let i = startIndex; i < endIndex; i++) {
            if (nodeIndex >= nodes.length) break;
            
            const row = Math.floor(nodeIndex / cols);
            const col = nodeIndex % cols;
            
            const x = center.x + (col - cols/2) * size * 1.5;
            const y = center.y + (row - rows/2) * size * Math.sqrt(3);
            
            // Offset every other row
            const offsetX = row % 2 === 0 ? 0 : size * 0.75;
            
            nodes[nodeIndex].position({ 
                x: x + offsetX, 
                y: y 
            });
            nodeIndex++;
        }
        
        if (nodeIndex < nodes.length) {
            setTimeout(() => processBatch(nodeIndex), 0);
        } else {
        }
    };
    
    processBatch(0);
}

// Bulbous Layout - clustered layout with newest nodes near the center
function bulbousLayout(options = {}) {
    const cy = this;

    // Capture current viewport and interaction settings so they can be restored
    cy._bulbousSavedState = {
        zoom: cy.zoom(),
        pan: cy.pan(),
        userZoomingEnabled: cy.userZoomingEnabled(),
        panningEnabled: cy.panningEnabled()
    };

    // Ensure the graph remains interactive when using the bulbous layout
    cy.panningEnabled(true);
    // Keep native zoom disabled to prevent compounded zooming with custom controls
    cy.userZoomingEnabled(false);
    const nodes = (options.eles || cy.nodes()).filter(n => !(n.data('pinned') || n.locked()));
    const bb = options.boundingBox;
    const center = bb ? { x: bb.x1 + bb.w / 2, y: bb.y1 + bb.h / 2 } : { x: cy.width() / 2, y: cy.height() / 2 };
    const maxSize = options.maxNodeSize || 40;
    const minSize = options.minNodeSize || 5;
    const margin = options.nodeSpacing || 20;

    const nodeArr = Array.from(nodes);

    // Sort newest first so they are placed closest to the center
    nodeArr.sort((a, b) => {
        const ta = new Date(a.data('timestamp') || a.data('time') || 0).getTime();
        const tb = new Date(b.data('timestamp') || b.data('time') || 0).getTime();
        return tb - ta;
    });

    const n = nodeArr.length;
    const secondSize = maxSize / 1.3;
    const placed = [];

    nodeArr.forEach((node, i) => {
        // Determine node size with newest nodes being largest
        let size;
        if (n === 1 || i === 0) {
            size = maxSize;
        } else if (i === 1) {
            size = secondSize;
        } else {
            const s = secondSize - ((i - 1) / (n - 2)) * (secondSize - minSize);
            size = Math.max(minSize, s);
        }
        // Preserve existing sizing so it can be restored when switching layouts
        if (node.data('originalSize') === undefined) {
            node.data('originalSize', node.data('size'));
        }
        if (node.data('originalFontSize') === undefined) {
            node.data('originalFontSize', node.data('fontSize'));
        }
        node.data('size', size);
        // Scale label size with node size to improve readability
        node.data('fontSize', Math.max(8, size * 0.4));
        node.unlock();

        let x, y;
        if (i === 0) {
            // Place the newest node at the center
            x = center.x;
            y = center.y;
            node.position({ x, y });
            placed.push({ x, y, size });
            return;
        }

        // Find a position with at least `margin` spacing from all existing nodes
        const angleStep = Math.PI / 6; // 30 degrees
        let angle = 0;
        let radius = size / 2 + margin;
        let placedPos = false;

        while (!placedPos) {
            x = center.x + radius * Math.cos(angle);
            y = center.y + radius * Math.sin(angle);

            const collision = placed.some(p => {
                const dx = x - p.x;
                const dy = y - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                return dist < (size / 2 + p.size / 2 + margin);
            });

            if (!collision) {
                placedPos = true;
                node.position({ x, y });
                placed.push({ x, y, size });
            } else {
                angle += angleStep;
                if (angle >= 2 * Math.PI) {
                    angle = 0;
                    radius += margin;
                }
            }
        }
    });
}

// Remove existing timeline tick overlays or nodes
const ROOT_TIMELINE_SCOPE = '__root__';

function resolveTimelineScopeKey(scopeId) {
    if (typeof scopeId === 'string' && scopeId.length > 0) {
        return scopeId;
    }
    return ROOT_TIMELINE_SCOPE;
}

function buildTimelineScratchKey(baseKey, scopeId) {
    const scopeKey = resolveTimelineScopeKey(scopeId);
    return `${baseKey}:${scopeKey}`;
}

function ensureTimelineScopeRegistry(cy, registerName) {
    if (!cy) {
        return null;
    }

    const existing = cy[registerName];
    if (existing && typeof existing.forEach === 'function' && typeof existing.add === 'function') {
        return existing;
    }

    const registry = new Set();
    cy[registerName] = registry;
    return registry;
}

function rememberTimelineScope(cy, registerName, scopeId) {
    if (!cy) {
        return;
    }

    const scopeKey = resolveTimelineScopeKey(scopeId);
    const registry = ensureTimelineScopeRegistry(cy, registerName);
    if (registry) {
        registry.add(scopeKey);
    }
}

function forgetTimelineScope(cy, registerName, scopeId) {
    if (!cy) {
        return;
    }

    const scopeKey = resolveTimelineScopeKey(scopeId);
    const registry = cy[registerName];
    if (registry && typeof registry.delete === 'function') {
        registry.delete(scopeKey);
        if (registry.size === 0) {
            delete cy[registerName];
        }
    }
}

function clearAllTimelineBaselineInfo(cy) {
    if (!cy || typeof cy.scratch !== 'function') {
        return;
    }

    if (typeof cy.removeScratch === 'function') {
        cy.removeScratch('_timelineBaselineInfo');
    } else {
        cy.scratch('_timelineBaselineInfo', null);
    }

    const registry = cy._timelineBaselineScopes;
    if (registry && typeof registry.forEach === 'function') {
        registry.forEach(scopeKey => {
            const scopedKey = buildTimelineScratchKey('_timelineBaselineInfo', scopeKey);
            if (typeof cy.removeScratch === 'function') {
                cy.removeScratch(scopedKey);
            } else {
                cy.scratch(scopedKey, null);
            }
        });
        registry.clear();
        delete cy._timelineBaselineScopes;
    }
}

function clearAllTimelineLayoutApplied(cy) {
    if (!cy || typeof cy.scratch !== 'function') {
        return;
    }

    if (typeof cy.removeScratch === 'function') {
        cy.removeScratch('_timelineLayoutApplied');
    } else {
        cy.scratch('_timelineLayoutApplied', false);
    }

    const registry = cy._timelineAppliedScopes;
    if (registry && typeof registry.forEach === 'function') {
        registry.forEach(scopeKey => {
            const scopedKey = buildTimelineScratchKey('_timelineLayoutApplied', scopeKey);
            if (typeof cy.removeScratch === 'function') {
                cy.removeScratch(scopedKey);
            } else {
                cy.scratch(scopedKey, null);
            }
        });
        registry.clear();
        delete cy._timelineAppliedScopes;
    }
}

function setTimelineBaselineInfo(cy, scopeId, baseline) {
    if (!cy || typeof cy.scratch !== 'function' || !baseline) {
        return;
    }

    const scopeKey = resolveTimelineScopeKey(scopeId);
    const scopedKey = buildTimelineScratchKey('_timelineBaselineInfo', scopeKey);
    cy.scratch(scopedKey, baseline);
    rememberTimelineScope(cy, '_timelineBaselineScopes', scopeKey);

    if (scopeKey === ROOT_TIMELINE_SCOPE) {
        cy.scratch('_timelineBaselineInfo', baseline);
    }
}

function clearTimelineBaselineInfo(cy, scopeId) {
    if (!cy || typeof cy.scratch !== 'function') {
        return;
    }

    const scopeKey = resolveTimelineScopeKey(scopeId);
    const scopedKey = buildTimelineScratchKey('_timelineBaselineInfo', scopeKey);

    if (typeof cy.removeScratch === 'function') {
        cy.removeScratch(scopedKey);
    } else {
        cy.scratch(scopedKey, null);
    }

    forgetTimelineScope(cy, '_timelineBaselineScopes', scopeKey);

    if (scopeKey === ROOT_TIMELINE_SCOPE) {
        if (typeof cy.removeScratch === 'function') {
            cy.removeScratch('_timelineBaselineInfo');
        } else {
            cy.scratch('_timelineBaselineInfo', null);
        }
    }
}

function isTimelineLayoutApplied(cy, scopeId) {
    if (!cy || typeof cy.scratch !== 'function') {
        return false;
    }

    const scopeKey = resolveTimelineScopeKey(scopeId);
    const scopedKey = buildTimelineScratchKey('_timelineLayoutApplied', scopeKey);
    let value = cy.scratch(scopedKey);

    if (value === undefined && scopeKey === ROOT_TIMELINE_SCOPE) {
        value = cy.scratch('_timelineLayoutApplied');
    }

    return value === true;
}

function setTimelineLayoutApplied(cy, scopeId, applied) {
    if (!cy || typeof cy.scratch !== 'function') {
        return;
    }

    const scopeKey = resolveTimelineScopeKey(scopeId);
    const scopedKey = buildTimelineScratchKey('_timelineLayoutApplied', scopeKey);

    if (applied) {
        cy.scratch(scopedKey, true);
        rememberTimelineScope(cy, '_timelineAppliedScopes', scopeKey);
        cy.scratch('_timelineLayoutApplied', true);
    } else {
        if (typeof cy.removeScratch === 'function') {
            cy.removeScratch(scopedKey);
        } else {
            cy.scratch(scopedKey, null);
        }
        forgetTimelineScope(cy, '_timelineAppliedScopes', scopeKey);

        const registry = cy._timelineAppliedScopes;
        if (!registry || registry.size === 0) {
            cy.scratch('_timelineLayoutApplied', false);
        }
    }
}

function normalizeTimelineNodeList(nodes) {
    const list = [];
    if (!nodes) {
        return list;
    }

    const pushNode = node => {
        if (!node) {
            return;
        }
        if (typeof node.isNode === 'function') {
            if (!node.isNode()) {
                return;
            }
        }
        list.push(node);
    };

    if (Array.isArray(nodes)) {
        nodes.forEach(pushNode);
        return list;
    }

    if (typeof nodes.forEach === 'function') {
        nodes.forEach(pushNode);
        return list;
    }

    pushNode(nodes);
    return list;
}

function nodeParticipatesInTimeline(node) {
    if (!node || typeof node.data !== 'function') {
        return false;
    }

    const raw = node.data('timestamp') ?? node.data('time');
    if (raw === undefined || raw === null || raw === '') {
        return false;
    }

    const parsed = parseTimelineTimestamp(raw);
    return !Number.isNaN(parsed);
}

function findSharedTimelineParentId(nodes) {
    const nodeList = normalizeTimelineNodeList(nodes);
    if (nodeList.length === 0) {
        return undefined;
    }

    const timelineNodes = nodeList.filter(nodeParticipatesInTimeline);
    const relevantNodes = timelineNodes.length > 0 ? timelineNodes : nodeList;

    let sharedParentId;
    let sawParent = false;
    let mismatch = false;

    relevantNodes.forEach(node => {
        if (!node || mismatch) {
            return;
        }

        let parentId;
        if (typeof node.parent === 'function') {
            const parent = node.parent();
            if (parent && parent.length > 0) {
                parentId = parent.id();
            }
        }

        if (typeof parentId !== 'string') {
            const dataParent = typeof node.data === 'function'
                ? node.data('parent')
                : node?.data?.parent;
            if (typeof dataParent === 'string') {
                parentId = dataParent;
            }
        }

        if (typeof parentId !== 'string') {
            return;
        }

        if (!sawParent) {
            sharedParentId = parentId;
            sawParent = true;
            return;
        }

        if (sharedParentId !== parentId) {
            mismatch = true;
        }
    });

    if (!sawParent || mismatch) {
        return undefined;
    }

    return sharedParentId;
}

function removeTimelineTicks(cy, options = {}) {
    if (!cy) return;

    const tickSelector = '[type="timeline-tick"]';
    const removeCollection = collection => {
        if (!collection || typeof collection.remove !== 'function') {
            return;
        }
        try {
            if (typeof collection.length === 'number' ? collection.length > 0 : true) {
                collection.remove();
            }
        } catch (error) {
            console.warn('Failed to remove timeline ticks:', error);
        }
    };

    const { containers, scopeIds } = options || {};
    const resolvedScopes = new Set();
    let targetedRemoval = false;

    const addScope = scopeId => {
        if (scopeId === undefined || scopeId === null) {
            resolvedScopes.add(ROOT_TIMELINE_SCOPE);
            return;
        }
        resolvedScopes.add(resolveTimelineScopeKey(scopeId));
    };

    if (containers) {
        const ensureArray = candidate => {
            if (!candidate) {
                return [];
            }
            if (typeof candidate.toArray === 'function') {
                return candidate.toArray();
            }
            if (Array.isArray(candidate)) {
                return candidate;
            }
            const collected = [];
            if (typeof candidate.forEach === 'function') {
                candidate.forEach(item => collected.push(item));
                return collected;
            }
            return collected;
        };

        const containerArray = ensureArray(containers);
        if (containerArray.length > 0) {
            targetedRemoval = true;
        }

        containerArray.forEach(container => {
            if (!container) {
                return;
            }

            if (typeof container.children === 'function') {
                const ticks = container.children(tickSelector);
                removeCollection(ticks);
            }

            let containerId;
            if (typeof container.id === 'function') {
                containerId = container.id();
            } else if (container.data && typeof container.data === 'object') {
                containerId = container.data.id || container.data.ID;
            }

            if (containerId) {
                addScope(containerId);
            }
        });
    }

    if (scopeIds !== undefined && scopeIds !== null) {
        targetedRemoval = true;
        if (Array.isArray(scopeIds)) {
            scopeIds.forEach(addScope);
        } else {
            addScope(scopeIds);
        }
    }

    if (resolvedScopes.size > 0 && typeof cy.nodes === 'function') {
        const ticks = cy.nodes(tickSelector);
        resolvedScopes.forEach(scopeKey => {
            const scopedTicks = ticks.filter(node => {
                if (!node) {
                    return false;
                }

                let dataScope;
                if (typeof node.data === 'function') {
                    dataScope = node.data('_timelineScope');
                } else if (node.data && typeof node.data === 'object') {
                    dataScope = node.data._timelineScope;
                }

                if (dataScope !== undefined && dataScope !== null) {
                    return resolveTimelineScopeKey(dataScope) === scopeKey;
                }

                if (typeof node.parent === 'function') {
                    const parent = node.parent();
                    if (parent && parent.length > 0) {
                        const parentId = typeof parent.id === 'function' ? parent.id() : undefined;
                        return resolveTimelineScopeKey(parentId) === scopeKey;
                    }
                }

                return scopeKey === ROOT_TIMELINE_SCOPE;
            });

            removeCollection(scopedTicks);
        });
    }

    if (!targetedRemoval) {
        removeCollection(typeof cy.nodes === 'function' ? cy.nodes(tickSelector) : null);

        // Backwards compatibility: remove old DOM overlays if present
        const container = typeof cy.container === 'function' ? cy.container() : null;
        if (container) {
            const existing = container.querySelector('.timeline-ticks');
            if (existing) existing.remove();
        }
    }
}

function captureTimelineScaffoldingState(cy) {
    if (!cy) return null;

    const state = {
        bar: null,
        anchors: {},
        links: {},
        ticks: {},
        dataNodes: {}
    };

    const barCollection = cy.nodes('[type="timeline-bar"]');
    if (barCollection && barCollection.length > 0) {
        const bar = barCollection[0];
        const getData = key => (typeof bar.data === 'function' ? bar.data(key) : undefined);
        const styledColor = typeof bar.style === 'function'
            ? bar.style('background-color')
            : undefined;
        state.bar = {
            size: getData('size'),
            color: getData('color') ?? styledColor,
            styledColor,
            className: getData('className'),
            classes: typeof bar.classes === 'function' ? bar.classes() : undefined
        };
    }

    cy.nodes('[type="timeline-anchor"]').forEach(anchor => {
        if (!anchor || typeof anchor.id !== 'function') {
            return;
        }
        const id = anchor.id();
        if (!id) {
            return;
        }
        state.anchors[id] = {
            classes: typeof anchor.classes === 'function' ? anchor.classes() : undefined,
            color: typeof anchor.style === 'function' ? anchor.style('background-color') : undefined
        };
    });

    cy.edges('[type="timeline-link"]').forEach(edge => {
        if (!edge || typeof edge.id !== 'function') {
            return;
        }
        const id = edge.id();
        if (!id) {
            return;
        }
        const getData = key => (typeof edge.data === 'function' ? edge.data(key) : undefined);
        state.links[id] = {
            color: getData('color'),
            classes: typeof edge.classes === 'function' ? edge.classes() : undefined
        };
    });

    cy.nodes('[type="timeline-tick"]').forEach(tick => {
        if (!tick || typeof tick.id !== 'function') {
            return;
        }
        const id = tick.id();
        if (!id) {
            return;
        }

        const tickColor = typeof tick.style === 'function'
            ? tick.style('background-color')
            : undefined;
        const labelColor = typeof tick.style === 'function'
            ? tick.style('color')
            : undefined;

        state.ticks[id] = {
            classes: typeof tick.classes === 'function' ? tick.classes() : undefined,
            color: tickColor,
            labelColor
        };
    });

    cy.nodes().forEach(node => {
        if (!node || typeof node.id !== 'function') {
            return;
        }

        if (typeof nodeParticipatesInTimeline === 'function' && !nodeParticipatesInTimeline(node)) {
            return;
        }

        const id = node.id();
        if (!id || typeof node.data !== 'function') {
            return;
        }

        const type = node.data('type');
        if (type === 'timeline-bar' || type === 'timeline-anchor' || type === 'timeline-tick') {
            return;
        }

        const styledColor = typeof node.style === 'function'
            ? node.style('background-color')
            : undefined;
        const dataColor = node.data('color');
        const labelColor = typeof node.style === 'function'
            ? node.style('color')
            : undefined;
        const classes = typeof node.classes === 'function' ? node.classes() : undefined;
        const touched = hasTimelineEditorTouch(node);

        if (!touched && !styledColor && !dataColor && !classes && !labelColor) {
            return;
        }

        state.dataNodes[id] = {
            dataColor,
            styledColor,
            labelColor,
            classes,
            touched
        };
    });

    return state;
}

function teardownTimelineScaffolding(cy) {
    if (!cy) return;

    cy.nodes('[type="timeline-anchor"], [type="timeline-bar"], [type="timeline-tick"]').remove();
    cy.edges('[type="timeline-link"]').remove();
    removeTimelineTicks(cy);
}

function applyTimelineScaffoldingSnapshot(cy, snapshot) {
    if (!cy || !snapshot) {
        return;
    }

    const applyClasses = (element, classes) => {
        if (!element || !classes || typeof element.addClass !== 'function') {
            return;
        }
        const uniqueClasses = Array.from(new Set(String(classes).split(/\s+/).filter(Boolean)));
        uniqueClasses.forEach(cls => {
            if (!element.hasClass || !element.hasClass(cls)) {
                element.addClass(cls);
            }
        });
    };

    if (snapshot.bar) {
        const barCollection = cy.nodes('[type="timeline-bar"]');
        if (barCollection && barCollection.length > 0) {
            const bar = barCollection[0];
            if (snapshot.bar.color && typeof bar.style === 'function') {
                bar.style('background-color', snapshot.bar.color);
            }
            applyClasses(bar, snapshot.bar.classes);
        }
    }

    Object.entries(snapshot.anchors || {}).forEach(([id, info]) => {
        if (!id || !info) {
            return;
        }
        const anchorCollection = cy.getElementById(id);
        if (!anchorCollection || anchorCollection.length === 0) {
            return;
        }
        const anchor = anchorCollection[0];
        if (info.color && typeof anchor.style === 'function') {
            anchor.style('background-color', info.color);
        }
        applyClasses(anchor, info.classes);
    });

    Object.entries(snapshot.links || {}).forEach(([id, info]) => {
        if (!id || !info) {
            return;
        }
        const linkCollection = cy.getElementById(id);
        if (!linkCollection || linkCollection.length === 0) {
            return;
        }
        const link = linkCollection[0];
        if (info.color && typeof link.data === 'function') {
            link.data('color', info.color);
        }
        if (info.color && typeof link.style === 'function') {
            link.style({
                'line-color': info.color,
                'target-arrow-color': info.color
            });
        }
        applyClasses(link, info.classes);
    });

    Object.entries(snapshot.ticks || {}).forEach(([id, info]) => {
        if (!id || !info) {
            return;
        }
        const tickCollection = cy.getElementById(id);
        if (!tickCollection || tickCollection.length === 0) {
            return;
        }
        const tick = tickCollection[0];

        if (info.color && typeof tick.style === 'function') {
            tick.style('background-color', info.color);
        }
        if (info.labelColor && typeof tick.style === 'function') {
            tick.style('color', info.labelColor);
        }
        applyClasses(tick, info.classes);
    });

    Object.entries(snapshot.dataNodes || {}).forEach(([id, info]) => {
        if (!id || !info) {
            return;
        }

        const nodeCollection = cy.getElementById(id);
        if (!nodeCollection || nodeCollection.length === 0) {
            return;
        }

        const node = nodeCollection[0];
        if (typeof node.data !== 'function' || typeof nodeParticipatesInTimeline !== 'function') {
            return;
        }

        if (!nodeParticipatesInTimeline(node)) {
            return;
        }

        if (info.dataColor) {
            node.data('color', info.dataColor);
        }
        if (info.styledColor && typeof node.style === 'function') {
            node.style('background-color', info.styledColor);
        }
        if (info.labelColor && typeof node.style === 'function') {
            node.style('color', info.labelColor);
        }
        if (info.touched && typeof node.data === 'function') {
            node.data('_timelineEditorTouched', true);
        }
        applyClasses(node, info.classes);
    });
}

function resolveTimelineCenterY(cy, nodes, explicitCenterY, context = {}) {
    if (Number.isFinite(explicitCenterY)) {
        return explicitCenterY;
    }

    if (!cy) {
        return 0;
    }

    const { scaffoldingParentId, timelineScopeId, barId } = context;
    const scopeId = timelineScopeId !== undefined
        ? timelineScopeId
        : (typeof scaffoldingParentId === 'string' ? scaffoldingParentId : '__root__');

    const matchesScope = element => {
        if (!element) {
            return false;
        }

        let dataScope;
        if (typeof element.data === 'function') {
            dataScope = element.data('_timelineScope');
        } else if (element.data && typeof element.data === 'object') {
            dataScope = element.data._timelineScope;
        }

        if (dataScope !== undefined && dataScope !== null) {
            return dataScope === scopeId;
        }

        if (typeof scaffoldingParentId === 'string') {
            if (typeof element.parent === 'function') {
                const parent = element.parent();
                if (parent && parent.length > 0) {
                    return parent.id() === scaffoldingParentId;
                }
            }

            const parentFromData = typeof element.data === 'function'
                ? element.data('parent')
                : element.data && element.data.parent;
            if (typeof parentFromData === 'string') {
                return parentFromData === scaffoldingParentId;
            }
            return false;
        }

        if (typeof element.parent === 'function') {
            const parent = element.parent();
            return !parent || parent.length === 0;
        }

        return true;
    };

    if (typeof cy.getElementById === 'function') {
        if (typeof barId === 'string') {
            const barById = cy.getElementById(barId);
            if (barById && barById.length > 0) {
                const scopedBar = barById[0];
                if (scopedBar && typeof scopedBar.position === 'function') {
                    const barPosition = scopedBar.position();
                    const barY = Number(barPosition && barPosition.y);
                    if (Number.isFinite(barY)) {
                        return barY;
                    }
                }

                if (typeof scopedBar.data === 'function') {
                    const lockedY = Number(scopedBar.data('lockedY'));
                    if (Number.isFinite(lockedY)) {
                        return lockedY;
                    }
                }
            }
        }

        if (typeof cy.nodes === 'function') {
            const barCollection = cy.nodes('[type="timeline-bar"]').filter(matchesScope);
            if (barCollection && barCollection.length > 0) {
                const bar = barCollection[0];
                if (bar && typeof bar.position === 'function') {
                    const barPosition = bar.position();
                    const barY = Number(barPosition && barPosition.y);
                    if (Number.isFinite(barY)) {
                        return barY;
                    }
                }

                if (typeof bar.data === 'function') {
                    const lockedY = Number(bar.data('lockedY'));
                    if (Number.isFinite(lockedY)) {
                        return lockedY;
                    }
                }
            }
        }
    }

    if (typeof cy.nodes === 'function') {
        const anchorCollection = cy.nodes('[type="timeline-anchor"]').filter(matchesScope);
        if (anchorCollection && anchorCollection.length > 0) {
            const anchor = anchorCollection[0];
            if (anchor && typeof anchor.position === 'function') {
                const anchorPos = anchor.position();
                const anchorY = Number(anchorPos && anchorPos.y);
                if (Number.isFinite(anchorY)) {
                    return anchorY;
                }
            }
        }
    }

    if (nodes && typeof nodes.forEach === 'function') {
        let sum = 0;
        let count = 0;
        nodes.forEach(node => {
            if (!node || typeof node.position !== 'function') {
                return;
            }
            const nodeY = Number(node.position('y'));
            if (Number.isFinite(nodeY)) {
                sum += nodeY;
                count += 1;
            }
        });
        if (count > 0) {
            return sum / count;
        }
    }

    if (typeof cy.extent === 'function') {
        const ext = cy.extent();
        if (ext) {
            if (Number.isFinite(ext.y1) && Number.isFinite(ext.y2)) {
                return ext.y1 + (ext.y2 - ext.y1) / 2;
            }
            if (Number.isFinite(ext.y1) && Number.isFinite(ext.h)) {
                return ext.y1 + ext.h / 2;
            }
        }
    }

    if (typeof cy.height === 'function') {
        const height = Number(cy.height());
        if (Number.isFinite(height)) {
            return height / 2;
        }
    }

    return 0;
}

function parseTimelineTimestamp(value) {
    if (value == null || value === '') return NaN;
    if (typeof value === 'number') {
        if (value >= 1000 && value <= 9999) {
            return Date.UTC(value, 0, 1);
        }
        return value < 1e12 ? value * 1000 : value;
    }
    if (typeof value === 'string') {
        if (/^\d+$/.test(value)) {
            const num = Number(value);
            if (num >= 1000 && num <= 9999) {
                return Date.UTC(num, 0, 1);
            }
            return num < 1e12 ? num * 1000 : num;
        }
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? NaN : parsed;
    }
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? NaN : t;
}

function resolveNodeTimelineTimestamp(node) {
    if (!node || typeof node.data !== 'function') {
        return undefined;
    }

    const raw = node.data('timestamp') ?? node.data('time');
    const parsed = parseTimelineTimestamp(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function getStoredTimelineTimestampSignature(node) {
    if (!node || typeof node.data !== 'function') {
        return undefined;
    }

    const raw = node.data('_timelineTimestampSignature');
    const numeric = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(numeric) ? numeric : undefined;
}

function storeTimelineTimestampSignature(node, timestamp) {
    if (!node || typeof node.data !== 'function') {
        return;
    }

    if (!Number.isFinite(timestamp)) {
        if (typeof node.removeData === 'function') {
            node.removeData('_timelineTimestampSignature');
        } else {
            node.data('_timelineTimestampSignature', undefined);
        }
        return;
    }

    node.data('_timelineTimestampSignature', timestamp);
}

function clearTimelineEditorTouch(node) {
    if (!node) {
        return;
    }

    if (typeof node.removeData === 'function') {
        node.removeData('_timelineEditorTouched');
        return;
    }

    if (typeof node.data === 'function') {
        node.data('_timelineEditorTouched', undefined);
    }
}

function hasTimelineEditorTouch(node) {
    if (!node || typeof node.data !== 'function') {
        return false;
    }

    return Boolean(node.data('_timelineEditorTouched'));
}

function getTimelineBaselineInfo(cy, scopeId) {
    if (!cy || typeof cy.scratch !== 'function') {
        return null;
    }

    const scopeKey = resolveTimelineScopeKey(scopeId);
    const scopedKey = buildTimelineScratchKey('_timelineBaselineInfo', scopeKey);
    let info = cy.scratch(scopedKey);

    if ((!info || typeof info !== 'object') && scopeKey === ROOT_TIMELINE_SCOPE) {
        info = cy.scratch('_timelineBaselineInfo');
    }

    if (!info || typeof info !== 'object') {
        return null;
    }

    const {
        startX,
        width,
        minTime,
        maxTime,
        range,
        centerY,
        rawMinTime,
        rawMaxTime,
        margin,
        maxOffset,
        barLength,
        barStart,
        containerX1,
        containerY1,
        containerWidth,
        containerHeight
    } = info;

    if (!Number.isFinite(startX) || !Number.isFinite(width)) {
        return null;
    }

    const computedRange = Number.isFinite(range) && range !== 0
        ? range
        : (Number.isFinite(maxTime) && Number.isFinite(minTime)
            ? maxTime - minTime
            : NaN);

    const safeRange = Number.isFinite(computedRange) && computedRange !== 0
        ? computedRange
        : 1;

    return {
        startX,
        width,
        minTime: Number.isFinite(minTime) ? minTime : 0,
        maxTime: Number.isFinite(maxTime) ? maxTime : 1,
        rawMinTime: Number.isFinite(rawMinTime) ? rawMinTime : undefined,
        rawMaxTime: Number.isFinite(rawMaxTime) ? rawMaxTime : undefined,
        margin: Number.isFinite(margin) ? margin : undefined,
        range: safeRange,
        centerY: Number.isFinite(centerY) ? centerY : undefined,
        maxOffset: Number.isFinite(maxOffset) ? maxOffset : undefined,
        barLength: Number.isFinite(barLength) ? barLength : undefined,
        barStart: Number.isFinite(barStart) ? barStart : undefined,
        containerX1: Number.isFinite(containerX1) ? containerX1 : undefined,
        containerY1: Number.isFinite(containerY1) ? containerY1 : undefined,
        containerWidth: Number.isFinite(containerWidth) ? containerWidth : undefined,
        containerHeight: Number.isFinite(containerHeight) ? containerHeight : undefined
    };
}

function rebuildTimelineConnectors(cy, context = {}) {
    if (!cy || typeof cy.nodes !== 'function') {
        return { anchors: 0, links: 0 };
    }

    const {
        nodes: providedNodes,
        centerY: explicitCenterY,
        scaffoldingParentId,
        timelineScopeId,
        barId,
        skipGraphSync
    } = context;

    const scopeId = timelineScopeId !== undefined
        ? timelineScopeId
        : (typeof scaffoldingParentId === 'string' ? scaffoldingParentId : '__root__');

    const matchesScope = element => {
        if (!element) {
            return false;
        }

        let dataScope;
        if (typeof element.data === 'function') {
            dataScope = element.data('_timelineScope');
        } else if (element.data && typeof element.data === 'object') {
            dataScope = element.data._timelineScope;
        }

        if (dataScope !== undefined && dataScope !== null) {
            return dataScope === scopeId;
        }

        if (typeof scaffoldingParentId === 'string') {
            if (typeof element.parent === 'function') {
                const parent = element.parent();
                if (parent && parent.length > 0) {
                    return parent.id() === scaffoldingParentId;
                }
            }

            const parentFromData = typeof element.data === 'function'
                ? element.data('parent')
                : element.data && element.data.parent;
            if (typeof parentFromData === 'string') {
                return parentFromData === scaffoldingParentId;
            }
            return false;
        }

        if (typeof element.parent === 'function') {
            const parent = element.parent();
            return !parent || parent.length === 0;
        }

        return true;
    };

    const isTimelineScaffoldingType = type => {
        if (typeof type !== 'string') {
            return false;
        }
        return type === 'timeline-bar' || type === 'timeline-anchor' || type === 'timeline-tick';
    };

    const filterNonTimeline = node => {
        if (!node || typeof node.data !== 'function') {
            return true;
        }
        const type = node.data('type');
        return !isTimelineScaffoldingType(type);

    };

    let nodesSource;
    if (providedNodes) {
        nodesSource = providedNodes;
    } else {
        nodesSource = cy.nodes().filter(filterNonTimeline);
    }

    const shouldIncludeNode = node => {
        if (!node || !filterNonTimeline(node)) {
            return false;
        }

        if (!matchesScope(node)) {
            return false;
        }

        if (!nodeParticipatesInTimeline(node)) {
            return false;
        }

        return true;
    };

    const nodeList = [];
    const pushIfEligible = node => {
        if (shouldIncludeNode(node)) {
            nodeList.push(node);
        }
    };

    if (nodesSource && typeof nodesSource.forEach === 'function') {
        nodesSource.forEach(pushIfEligible);
    } else if (Array.isArray(nodesSource)) {
        nodesSource.forEach(pushIfEligible);
    }

    const nodeIds = new Set();
    nodeList.forEach(node => {
        if (node && typeof node.id === 'function') {
            nodeIds.add(node.id());
        }
    });

    const centerY = resolveTimelineCenterY(cy, nodeList, explicitCenterY, {
        scaffoldingParentId,
        timelineScopeId: scopeId,
        barId
    });
    const deriveAnchorY = node => {
        if (Number.isFinite(centerY)) {
            return centerY;
        }
        if (node && typeof node.position === 'function') {
            const nodeY = Number(node.position('y'));
            if (Number.isFinite(nodeY)) {
                return nodeY;
            }
        }
        return 0;
    };

    const anchorsForGraphManager = [];
    const linksForGraphManager = [];

    cy.batch(() => {
        cy.nodes('[type="timeline-anchor"]').forEach(anchor => {
            if (!matchesScope(anchor)) {
                return;
            }
            const targetId = anchor.id().replace('timeline-anchor-', '');
            if (!nodeIds.has(targetId)) {
                anchor.remove();
            }
        });

        cy.edges('[type="timeline-link"]').forEach(edge => {
            if (!matchesScope(edge)) {
                return;
            }
            const targetId = edge.data('target') || (typeof edge.target === 'function' ? edge.target().id() : undefined);
            if (!targetId || !nodeIds.has(targetId)) {
                edge.remove();
            }
        });

        nodeList.forEach(node => {
            if (!node || typeof node.id !== 'function') {
                return;
            }

            const nodeId = node.id();
            if (!nodeId) {
                return;
            }

            const type = typeof node.data === 'function' ? node.data('type') : undefined;
            if (isTimelineScaffoldingType(type)) {
                return;
            }

            const anchorId = `timeline-anchor-${nodeId}`;
            let anchorCollection = cy.getElementById(anchorId);
            if (!anchorCollection || anchorCollection.length === 0) {
                const anchorData = {
                    id: anchorId,
                    type: 'timeline-anchor',
                    _timelineScope: scopeId
                };
                if (typeof node.parent === 'function') {
                    const parent = node.parent();
                    const parentId = parent && parent.length > 0 ? parent.id() : undefined;
                    if (typeof parentId === 'string') {
                        anchorData.parent = parentId;
                    }
                }
                anchorCollection = cy.add({
                    group: 'nodes',
                    data: anchorData,
                    position: { x: node.position('x'), y: deriveAnchorY(node) },
                    selectable: false,
                    grabbable: false
                });
            }

            const anchor = anchorCollection && anchorCollection[0];
            if (!anchor) {
                return;
            }

            if (typeof anchor.removed === 'function' && anchor.removed()) {
                anchor.restore();
            }

            if (typeof anchor.data === 'function') {
                anchor.data('type', 'timeline-anchor');
                anchor.data('_timelineScope', scopeId);
            }

            if (typeof node.parent === 'function') {
                const parent = node.parent();
                const parentId = parent && parent.length > 0 ? parent.id() : undefined;
                if (typeof parentId === 'string') {
                    anchor.move({ parent: parentId });
                } else if (anchor.parent && anchor.parent().length > 0) {
                    anchor.move({ parent: null });
                }
            }

            const anchorX = typeof node.position === 'function' ? node.position('x') : undefined;
            const anchorY = deriveAnchorY(node);
            if (typeof anchor.position === 'function') {
                anchor.position({ x: anchorX, y: anchorY });
            }

            if (typeof anchor.selectable === 'function') {
                anchor.selectable(false);
            }
            if (typeof anchor.grabbable === 'function') {
                anchor.grabbable(false);
            }
            if (typeof anchor.style === 'function') {
                anchor.style({
                    'display': 'element',
                    'visibility': 'visible',
                    'opacity': 0,
                    'width': 1,
                    'height': 1
                });
            }

            if (typeof anchor.position === 'function') {
                anchorsForGraphManager.push({
                    id: anchorId,
                    position: { x: anchor.position('x'), y: anchor.position('y') }
                });
            }

            const linkId = `timeline-link-${nodeId}`;
            let linkCollection = cy.getElementById(linkId);
            if (!linkCollection || linkCollection.length === 0) {
                linkCollection = cy.add({
                    group: 'edges',
                    data: { id: linkId, source: anchorId, target: nodeId, type: 'timeline-link', _timelineScope: scopeId }
                });
            }

            const link = linkCollection && linkCollection[0];
            if (!link) {
                return;
            }

            if (typeof link.removed === 'function' && link.removed()) {
                link.restore();
            }

            const linkColor = '#000000';
            if (typeof link.data === 'function') {
                link.data('source', anchorId);
                link.data('target', nodeId);
                link.data('type', 'timeline-link');
                link.data('color', linkColor);
                link.data('_timelineScope', scopeId);
            }
            if (typeof link.style === 'function') {
                link.style({
                    'line-color': linkColor,
                    'target-arrow-color': linkColor,
                    'target-arrow-shape': 'triangle',
                    'width': 1,
                    'line-opacity': 1,
                    'display': 'element',
                    'visibility': 'visible',
                    'opacity': 1,
                    'z-index': 1
                });
            }

            linksForGraphManager.push({
                id: linkId,
                source: anchorId,
                target: nodeId,
                type: 'timeline-link',
                data: { color: linkColor, _timelineScope: scopeId }
            });
        });
    });

    if (!skipGraphSync && window.GraphManager && typeof window.GraphManager.syncTimelineConnectors === 'function') {
        const barsForGraphManager = [];
        const scopedBars = barId
            ? cy.nodes(`#${barId}`)
            : cy.nodes('[type="timeline-bar"]').filter(matchesScope);

        if (scopedBars && typeof scopedBars.forEach === 'function') {
            scopedBars.forEach(bar => {
                if (!bar || typeof bar.id !== 'function') {
                    return;
                }

                const id = bar.id();
                if (!id) {
                    return;
                }

                const position = typeof bar.position === 'function' ? bar.position() : null;
                const data = typeof bar.data === 'function' ? { ...bar.data() } : {};

                barsForGraphManager.push({
                    id,
                    position: position ? { x: position.x, y: position.y } : undefined,
                    data
                });
            });
        }

        window.GraphManager.syncTimelineConnectors(anchorsForGraphManager, linksForGraphManager, barsForGraphManager);
    }

    return {
        anchors: anchorsForGraphManager.length,
        links: linksForGraphManager.length
    };
}

// Helper to determine tick interval based on range
function getTickInterval(range) {
    const oneDay = 86400000;
    const oneMonth = 30 * oneDay;
    const oneYear = 365 * oneDay;

    // Support fine-grained ranges
    if (range <= 10 * oneDay) {
        return { unit: 'day', value: oneDay }; // daily
    }
    if (range <= 12 * oneMonth) {
        return { unit: 'month', value: oneMonth }; // monthly for up to a year
    }

    const rangeYears = range / oneYear;
    if (rangeYears <= 20) {
        return { unit: 'year', value: oneYear, step: 1 }; // yearly
    }
    if (rangeYears <= 50) {
        return { unit: 'year', value: 5 * oneYear, step: 5 }; // 5-year intervals
    }
    if (rangeYears <= 100) {
        return { unit: 'year', value: 10 * oneYear, step: 10 }; // decades
    }
    if (rangeYears <= 500) {
        return { unit: 'year', value: 50 * oneYear, step: 50 }; // 50-year intervals
    }
    return { unit: 'year', value: 100 * oneYear, step: 100 }; // centuries and beyond
}

// Helper to format tick labels based on range and interval
function formatTickLabel(date, range, interval) {
    const oneDay = 86400000;
    const oneMonth = 30 * oneDay;
    const oneYear = 365 * oneDay;

    if (interval >= 100 * oneYear) {
        const century = Math.floor(date.getUTCFullYear() / 100) * 100;
        return `${century}`;
    } else if (interval >= 10 * oneYear) {
        const decade = Math.floor(date.getUTCFullYear() / 10) * 10;
        return `${decade}`;
    } else if (interval >= oneYear) {
        return `${date.getUTCFullYear()}`;
    } else if (interval >= oneMonth) {
        return `${date.getUTCMonth() + 1}/${date.getUTCFullYear()}`;
    } else {
        return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
    }
}

// Timeline Layout - positions nodes along a central time axis with a visual bar
function timelineLayout(options = {}) {
    const cy = this;
    const isScopedLayout = Boolean(options.eles);

    const forceRebuildRequested = options.forceRebuild === true;
    let preservedScaffoldingState = null;

    const normalizeNodeLockedX = node => {
        if (!node || typeof node.data !== 'function') {
            return undefined;
        }

        const rawLockedX = node.data('lockedX');
        if (rawLockedX === undefined || rawLockedX === null) {
            return undefined;
        }

        if (typeof rawLockedX === 'string' && rawLockedX.trim() === '') {
            if (typeof node.removeData === 'function') {
                node.removeData('lockedX');
            }
            return undefined;
        }

        const coerced = Number(rawLockedX);
        if (!Number.isFinite(coerced)) {
            if (typeof node.removeData === 'function') {
                node.removeData('lockedX');
            }
            return undefined;
        }

        if (rawLockedX !== coerced) {
            node.data('lockedX', coerced);
        }

        return coerced;
    };

    function parseTimestamp(value) {
        return parseTimelineTimestamp(value);
    }
    const allNodes = (options.eles || cy.nodes()).filter(node => {
        const type = node.data('type');
        return type !== 'timeline-bar' &&
            type !== 'timeline-anchor' &&
            type !== 'timeline-tick';
    });
    const movableNodes = allNodes.filter(n => !(n.data('pinned') || n.locked()));
    const explicitScopeId = typeof options.scaffoldingParentId === 'string'
        ? options.scaffoldingParentId
        : (typeof options.timelineScopeId === 'string' ? options.timelineScopeId : undefined);
    const scaffoldingParentId = typeof explicitScopeId === 'string'
        ? explicitScopeId
        : findSharedTimelineParentId(allNodes);
    const timelineScopeId = typeof scaffoldingParentId === 'string'
        ? scaffoldingParentId
        : ROOT_TIMELINE_SCOPE;

    const isForcedRebuild = forceRebuildRequested;
    const nodesForLayout = isForcedRebuild
        ? allNodes
        : movableNodes;
    const forcedUnlocks = isForcedRebuild ? new Set() : null;

    if (isForcedRebuild) {
        preservedScaffoldingState = captureTimelineScaffoldingState(cy);
        cy.batch(() => {
            const matchesScope = element => {
                if (!element) {
                    return false;
                }

                let dataScope;
                if (typeof element.data === 'function') {
                    dataScope = element.data('_timelineScope');
                } else if (element.data && typeof element.data === 'object') {
                    dataScope = element.data._timelineScope;
                }

                if (dataScope !== undefined && dataScope !== null) {
                    return resolveTimelineScopeKey(dataScope) === resolveTimelineScopeKey(timelineScopeId);
                }

                if (typeof scaffoldingParentId === 'string') {
                    if (typeof element.parent === 'function') {
                        const parent = element.parent();
                        if (parent && parent.length > 0) {
                            return parent.id() === scaffoldingParentId;
                        }
                    }

                    const parentFromData = typeof element.data === 'function'
                        ? element.data('parent')
                        : element.data && element.data.parent;
                    return parentFromData === scaffoldingParentId;
                }

                return resolveTimelineScopeKey(timelineScopeId) === ROOT_TIMELINE_SCOPE;
            };

            if (isScopedLayout) {
                cy.nodes('[type="timeline-anchor"], [type="timeline-bar"], [type="timeline-tick"]').filter(matchesScope).remove();
                cy.edges('[type="timeline-link"]').filter(matchesScope).remove();
                removeTimelineTicks(cy, { scopeIds: [timelineScopeId] });
                clearTimelineBaselineInfo(cy, timelineScopeId);
                clearTimelineLayoutApplied(cy, timelineScopeId);
            } else {
                teardownTimelineScaffolding(cy);
                clearAllTimelineBaselineInfo(cy);
                clearAllTimelineLayoutApplied(cy);
            }

            nodesForLayout.forEach(node => {
                if (!node || typeof node.data !== 'function') {
                    return;
                }

                const type = node.data('type');
                if (type === 'timeline-bar' || type === 'timeline-anchor' || type === 'timeline-tick') {
                    return;
                }
                if (typeof node.removeData === 'function') {
                    node.removeData('lockedX');
                    node.removeData('_savedLockedX');
                }
            });
        });
    }

    if (isForcedRebuild) {
        nodesForLayout.forEach(node => {
            if (!node) {
                return;
            }

            const wasLocked = typeof node.locked === 'function' ? node.locked() : false;
            if (wasLocked) {
                const id = typeof node.id === 'function' ? node.id() : null;
                if (id) {
                    forcedUnlocks.add(id);
                }

                if (typeof node.unlock === 'function') {
                    node.unlock();
                } else if (typeof node.locked === 'function') {
                    node.locked(false);
                }
            }
        });
    }
    const isRestoringTimeline = options.isRestoring === true ||
        (window.GraphManager && window.GraphManager._isRestoring === true);

    allNodes.forEach(node => {
        normalizeNodeLockedX(node);
    });
    const participatesInTimeline = nodeParticipatesInTimeline;

    const timelineHasExistingLayout =
        !isForcedRebuild && (
            isTimelineLayoutApplied(cy, timelineScopeId) ||
            allNodes.some(node => node.data('lockedX') !== undefined) ||
            isRestoringTimeline
        );

    // Preserve any ad-hoc styling on existing scaffolding (like node-editor color
    // changes) before the layout rebuilds bar/anchor/tick nodes. Previously we only
    // captured this during forced rebuilds, so routine layout passes would still
    // drop those edits when scaffolding was regenerated.
    if (!preservedScaffoldingState && timelineHasExistingLayout) {
        preservedScaffoldingState = captureTimelineScaffoldingState(cy);
    }

    const buildScopedId = base => (typeof scaffoldingParentId === 'string'
        ? `${base}-${scaffoldingParentId}`
        : base);

    const elementMatchesScope = element => {
        if (!element) {
            return false;
        }

        let dataScope;
        if (typeof element.data === 'function') {
            dataScope = element.data('_timelineScope');
        } else if (element.data && typeof element.data === 'object') {
            dataScope = element.data._timelineScope;
        }

        if (dataScope !== undefined && dataScope !== null) {
            return dataScope === timelineScopeId;
        }

        if (typeof scaffoldingParentId === 'string') {
            if (typeof element.parent === 'function') {
                const parent = element.parent();
                if (parent && parent.length > 0) {
                    return parent.id() === scaffoldingParentId;
                }
            }

            const parentFromData = typeof element.data === 'function'
                ? element.data('parent')
                : element.data && element.data.parent;
            if (typeof parentFromData === 'string') {
                return parentFromData === scaffoldingParentId;
            }
            return false;
        }

        if (typeof element.parent === 'function') {
            const parent = element.parent();
            return !parent || parent.length === 0;
        }

        return true;
    };

    const getScopedBarNode = () => {
        const barId = buildScopedId('timeline-bar');
        if (typeof cy.getElementById === 'function') {
            const byId = cy.getElementById(barId);
            if (byId && byId.length > 0) {
                return byId[0];
            }
        }

        if (typeof cy.nodes === 'function') {
            const fallback = cy.nodes('[type="timeline-bar"]').filter(elementMatchesScope);
            if (fallback && fallback.length > 0) {
                return fallback[0];
            }
        }

        return null;
    };

    const previousYPositions = new Map();
    allNodes.forEach(node => {
        const pos = node.position();
        if (pos && typeof pos.y === 'number' && !Number.isNaN(pos.y)) {
            previousYPositions.set(node.id(), pos.y);
        }
    });
    // Preserve interaction state before applying timeline constraints
    allNodes.forEach(node => {
        if (node.data('_savedGrabbable') === undefined) {
            node.data('_savedGrabbable', node.grabbable());
        }
        if (node.data('lockedX') !== undefined && node.data('_savedLockedX') === undefined) {
            node.data('_savedLockedX', node.data('lockedX'));
        }
    });
    if (allNodes.length === 0) {
        clearTimelineBaselineInfo(cy, timelineScopeId);
        setTimelineLayoutApplied(cy, timelineScopeId, false);
        return;
    }

    const bb = options.boundingBox;
    const padding = options.padding || 0;

    const extent = cy.extent();
    const left = bb ? bb.x1 : extent.x1;
    const safeWidthForLayout = bb ? bb.w : extent.w;
    const viewportWidth = typeof cy.width === 'function' ? cy.width() : 0;
    const minimumBarWidth = Number.isFinite(options.minBarWidth) ? options.minBarWidth : 300;
    const fallbackWidth = Math.max(minimumBarWidth, (viewportWidth || safeWidthForLayout) - padding * 2);
    const sanitizeBarWidth = candidate => {
        if (!Number.isFinite(candidate) || candidate <= 0) {
            return fallbackWidth > 0 ? fallbackWidth : minimumBarWidth;
        }

        if (candidate < minimumBarWidth) {
            return Math.max(fallbackWidth, minimumBarWidth);
        }

        return candidate;
    };

    let width = sanitizeBarWidth(safeWidthForLayout - padding * 2);
    let centerY = bb ? bb.y1 + bb.h / 2 : extent.y1 + extent.h / 2;
    let centerYOverride;

    const existingBarNode = getScopedBarNode();
    if (isRestoringTimeline && existingBarNode && typeof existingBarNode.position === 'function') {
        const existingY = existingBarNode.position('y');
        if (Number.isFinite(existingY)) {
            centerY = existingY;
            centerYOverride = existingY;
        }
    }
    let storedBaseline;
    let baselineStartX = left + padding;

    if (!isRestoringTimeline && timelineHasExistingLayout) {
        storedBaseline = getTimelineBaselineInfo(cy, timelineScopeId);

        if (storedBaseline) {
            if (Number.isFinite(storedBaseline.startX)) {
                baselineStartX = storedBaseline.startX;
            }
            if (Number.isFinite(storedBaseline.width)) {
                width = sanitizeBarWidth(storedBaseline.width);
            }
            if (Number.isFinite(storedBaseline.centerY)) {
                centerY = storedBaseline.centerY;
                centerYOverride = storedBaseline.centerY;
            }
        }
    }

    const cloneBounds = bounds => {
        if (!bounds) {
            return null;
        }
        const { x1, x2, y1, y2, w, h } = bounds;
        if ([x1, x2, y1, y2, w, h].some(v => !Number.isFinite(v))) {
            return null;
        }
        return { x1, x2, y1, y2, w, h };
    };

    const boundsMeaningfullyChanged = (previous, next) => {
        if (!previous || !next) {
            return false;
        }

        const diffExceeded = (a, b, tolerance = 0.5) => {
            if (!Number.isFinite(a) || !Number.isFinite(b)) {
                return false;
            }
            return Math.abs(a - b) > tolerance;
        };

        return diffExceeded(previous.x1, next.x1) ||
            diffExceeded(previous.y1, next.y1) ||
            diffExceeded(previous.w, next.w) ||
            diffExceeded(previous.h, next.h);
    };

    const buildBoundsFromCenter = (center, width, height) => {
        if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y)) {
            return null;
        }
        if (!Number.isFinite(width) || !Number.isFinite(height)) {
            return null;
        }

        return {
            x1: center.x - width / 2,
            x2: center.x + width / 2,
            y1: center.y - height / 2,
            y2: center.y + height / 2,
            w: width,
            h: height
        };
    };

    const getNodeCenter = node => {
        if (!node || typeof node.position !== 'function') {
            return null;
        }
        const pos = node.position();
        if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
            return null;
        }
        return { x: pos.x, y: pos.y };
    };

    const layoutState = {
        baseLeft: left,
        baseSafeWidth: safeWidthForLayout,
        baseCenterY: centerY,
        padding
    };

    if (Number.isFinite(centerYOverride)) {
        layoutState.centerYOverride = centerYOverride;
    }

    if (typeof scaffoldingParentId === 'string') {
        const parentCollection = cy.getElementById(scaffoldingParentId);
        if (parentCollection && parentCollection.length) {
            const storedWidth = Number(parentCollection.data('width'));
            const storedHeight = Number(parentCollection.data('height'));
            const center = getNodeCenter(parentCollection);
            let initialBounds = buildBoundsFromCenter(center, storedWidth, storedHeight);

            if (!initialBounds && typeof parentCollection.boundingBox === 'function') {
                const bb = parentCollection.boundingBox({ includeLabels: false, includeOverlays: false });
                if (bb && [bb.x1, bb.x2, bb.y1, bb.y2, bb.w, bb.h].every(v => Number.isFinite(v))) {
                    initialBounds = {
                        x1: bb.x1,
                        x2: bb.x2,
                        y1: bb.y1,
                        y2: bb.y2,
                        w: bb.w,
                        h: bb.h
                    };
                }
            }

            if (initialBounds) {
                layoutState.containerBoundsSnapshot = cloneBounds(initialBounds);
            }
        }
    }


    // Collect timestamps and determine range
    let minTime = Infinity;
    let maxTime = -Infinity;
    allNodes.forEach(n => {
        const raw = n.data('timestamp') ?? n.data('time');
        let t = NaN;
        if (typeof raw === 'string') {
            const parsed = Date.parse(raw);
            t = isNaN(parsed) ? parseTimestamp(raw) : parsed;
        } else {
            t = raw != null ? parseTimestamp(raw) : NaN;
        }
        if (!isNaN(t)) {
            if (t < minTime) minTime = t;
            if (t > maxTime) maxTime = t;
        }
    });
    let rawMinTime = minTime === Infinity ? 0 : minTime;
    let rawMaxTime = maxTime === -Infinity ? 1 : maxTime;
    let range = rawMaxTime - rawMinTime || 1;
    const margin = range * 0.05;
    minTime = rawMinTime - margin;
    maxTime = rawMaxTime + margin;
    range = maxTime - minTime;
    console.log('Timeline span calculation:', { minTime: rawMinTime, maxTime: rawMaxTime, margin, span: range });

    const computeTimestamp = node => {
        const raw = node.data('timestamp') ?? node.data('time');
        let t = raw != null ? parseTimestamp(raw) : NaN;
        if (Number.isNaN(t)) {
            t = minTime;
        }
        return t;
    };

    let baselineDerivedFromRestore = false;

    if (isRestoringTimeline) {
        const timelineNodes = allNodes.filter(participatesInTimeline);
        const samples = [];

        timelineNodes.forEach(node => {
            const t = computeTimestamp(node);
            const ratio = (t - minTime) / range;
            const lockedX = normalizeNodeLockedX(node);
            const posX = node.position('x');
            const existingX = Number.isFinite(lockedX) ? lockedX : posX;

            if (Number.isFinite(existingX) && Number.isFinite(ratio)) {
                samples.push({ ratio, x: existingX });
            }
        });

        if (samples.length >= 2) {
            const n = samples.length;
            let sumR = 0;
            let sumX = 0;
            let sumRR = 0;
            let sumRX = 0;

            samples.forEach(sample => {
                sumR += sample.ratio;
                sumX += sample.x;
                sumRR += sample.ratio * sample.ratio;
                sumRX += sample.ratio * sample.x;
            });

            const denominator = n * sumRR - sumR * sumR;
            if (Math.abs(denominator) > 1e-6) {
                const slope = (n * sumRX - sumR * sumX) / denominator;
                const intercept = (sumX - slope * sumR) / n;

                if (Number.isFinite(slope) && Number.isFinite(intercept) && slope > 0) {
                    baselineStartX = intercept;
                    width = slope;
                    baselineDerivedFromRestore = true;
                }
            }
        } else if (samples.length === 1) {
            const fallbackWidth = width > 0 ? width : 1;
            const sample = samples[0];
            const inferredStart = sample.x - sample.ratio * fallbackWidth;

            if (Number.isFinite(inferredStart)) {
                baselineStartX = inferredStart;
                width = fallbackWidth;
                baselineDerivedFromRestore = true;
            }
        }
    }

    if (!baselineDerivedFromRestore) {
        width = Math.max(width, 0);
    }

    width = sanitizeBarWidth(width);

    if (!Number.isFinite(baselineStartX)) {
        baselineStartX = left + padding;
    }

    if (!Number.isFinite(baselineStartX)) {
        baselineStartX = 0;
    }

    const previousBaseline = layoutState.timelineBaseline || {};
    layoutState.timelineBaseline = {
        startX: baselineStartX,
        width,
        maxOffset: previousBaseline.maxOffset,
        barLength: previousBaseline.barLength,
        barStart: previousBaseline.barStart
    };
    layoutState.baselineDerivedFromRestore = baselineDerivedFromRestore;

    storedBaseline = layoutState.timelineBaseline || {};

    const shouldLockBarGeometry = !isRestoringTimeline &&
        timelineHasExistingLayout &&
        Number.isFinite(previousBaseline.maxOffset) &&
        Number.isFinite(previousBaseline.barLength) &&
        previousBaseline.barLength >= minimumBarWidth &&
        Number.isFinite(previousBaseline.barStart);

    // Track horizontal offsets for nodes sharing the same x position
    const buckets = new Map();
    let maxOffset = shouldLockBarGeometry ? previousBaseline.maxOffset : 0;
    const nodeOffset = options.nodeOffset || 60;

    nodesForLayout.forEach((node, i) => {
        const t = computeTimestamp(node);
        const ratio = (t - minTime) / range;
        const baseX = baselineStartX + ratio * width;

        let x;
        let offset = 0;

        if (isRestoringTimeline) {
            const lockedX = normalizeNodeLockedX(node);
            const posX = node.position('x');
            const existingX = Number.isFinite(lockedX) ? lockedX : posX;
            if (Number.isFinite(existingX)) {
                x = existingX;
                offset = existingX - baseX;
            } else {
                x = baseX;
            }
        } else {
            const bucketKey = Math.round(baseX);
            const count = buckets.get(bucketKey) || 0;
            offset = (count % 2 === 0 ? 1 : -1) * Math.ceil(count / 2) * 10;
            x = baseX + offset;
            buckets.set(bucketKey, count + 1);
        }

        if (!shouldLockBarGeometry && Number.isFinite(offset)) {
            maxOffset = Math.max(maxOffset, Math.abs(offset));
        }

        let y;
        const prevY = previousYPositions.get(node.id());
        if (timelineHasExistingLayout && typeof prevY === 'number' && !Number.isNaN(prevY)) {
            y = prevY;
        }
        if (y === undefined) {
            y = centerY + (i % 2 === 0 ? -nodeOffset : nodeOffset);
        }
        node.data('lockedX', x);
        node.position({ x, y });
        node.grabbable(true);
        const timestampSignature = resolveNodeTimelineTimestamp(node);
        storeTimelineTimestampSignature(node, timestampSignature);
        clearTimelineEditorTouch(node);
    });

    // Ensure pinned/locked nodes maintain their lockedX for drag handler
    allNodes.difference(nodesForLayout).forEach(node => {
        const x = node.position('x');
        if (Number.isFinite(x)) {
            node.data('lockedX', x);
            if (isRestoringTimeline) {
                const t = computeTimestamp(node);
                const ratio = (t - minTime) / range;
                const baseX = baselineStartX + ratio * width;
                const offset = x - baseX;
                if (!shouldLockBarGeometry && Number.isFinite(offset)) {
                    maxOffset = Math.max(maxOffset, Math.abs(offset));
                }
            }
        }
        const timestampSignature = resolveNodeTimelineTimestamp(node);
        storeTimelineTimestampSignature(node, timestampSignature);
        clearTimelineEditorTouch(node);
    });

    if (isForcedRebuild && forcedUnlocks && forcedUnlocks.size > 0) {
        nodesForLayout.forEach(node => {
            if (!node || typeof node.id !== 'function') {
                return;
            }

            const id = node.id();
            if (!id || !forcedUnlocks.has(id)) {
                return;
            }

            if (typeof node.lock === 'function') {
                node.lock();
            } else if (typeof node.locked === 'function') {
                node.locked(true);
            }
        });
    }

    // Create or update central timeline bar node
    const barId = buildScopedId('timeline-bar');
    let barNode = getScopedBarNode();
    const readExistingBarState = (node) => {
        if (!node || typeof node.data !== 'function') {
            return {};
        }

        const data = node.data();
        const className = data.className ?? data.appliedClass;
        const styledColor = typeof node.style === 'function'
            ? node.style('background-color')
            : undefined;

        return {
            size: data.size,
            color: styledColor || data.color,
            className: typeof className === 'string' ? className : undefined
        };
    };

    const barStyle = options.barStyle || {};
    const preservedBarState = preservedScaffoldingState
        ? preservedScaffoldingState.bar || {}
        : readExistingBarState(barNode);
    const preservedBarColor = preservedBarState.color ?? preservedBarState.styledColor;
    const explicitBarSize = (barStyle.height ?? options.barSize);
    const barSize = explicitBarSize !== undefined
        ? explicitBarSize
        : (preservedBarState.size !== undefined ? preservedBarState.size : 10);
    const barColor = (barStyle.color ?? options.barColor ?? preservedBarColor ?? '#999');
    const barClass = barStyle.className !== undefined ? barStyle.className : preservedBarState.className;
    let barLength = shouldLockBarGeometry && Number.isFinite(storedBaseline.barLength)
        ? sanitizeBarWidth(storedBaseline.barLength)
        : sanitizeBarWidth(width + maxOffset * 2);
    let barStart = shouldLockBarGeometry && Number.isFinite(storedBaseline.barStart)
        ? storedBaseline.barStart
        : baselineStartX - maxOffset;

    if (!shouldLockBarGeometry && !isRestoringTimeline && timelineHasExistingLayout && storedBaseline) {

        if (Number.isFinite(storedBaseline.maxOffset)) {
            maxOffset = Math.max(maxOffset, storedBaseline.maxOffset);
        }

        const currentStart = barStart;
        const currentEnd = barStart + barLength;

        const storedOffset = Number.isFinite(storedBaseline.maxOffset)
            ? storedBaseline.maxOffset
            : maxOffset;
        const storedStart = Number.isFinite(storedBaseline.barStart)
            ? storedBaseline.barStart
            : baselineStartX - storedOffset;
        const storedLength = Number.isFinite(storedBaseline.barLength)
            ? sanitizeBarWidth(storedBaseline.barLength)
            : sanitizeBarWidth(width + storedOffset * 2);
        const storedEnd = storedStart + storedLength;

        barStart = Math.min(currentStart, storedStart);
        const unifiedEnd = Math.max(currentEnd, storedEnd);
        barLength = sanitizeBarWidth(unifiedEnd - barStart);

        const leftOffset = baselineStartX - barStart;
        const rightOffset = (barStart + barLength) - (baselineStartX + width);
        const widestOffset = Math.max(leftOffset, rightOffset, maxOffset);
        if (Number.isFinite(widestOffset)) {
            maxOffset = widestOffset;
        }
    }

    const unifyWithExistingBar = () => {
        if (!barNode || typeof barNode.position !== 'function') {
            return;
        }

        const existingLength = Number(barNode.data && barNode.data('barLength'));
        const existingCenterX = barNode.position('x');
        if (!Number.isFinite(existingLength) || !Number.isFinite(existingCenterX)) {
            return;
        }

        const existingStart = existingCenterX - existingLength / 2;
        const existingEnd = existingCenterX + existingLength / 2;
        const unifiedStart = Math.min(barStart, existingStart);
        const unifiedEnd = Math.max(barStart + barLength, existingEnd);

        barStart = unifiedStart;
        barLength = sanitizeBarWidth(unifiedEnd - unifiedStart);

        const leftOffset = baselineStartX - barStart;
        const rightOffset = (barStart + barLength) - (baselineStartX + width);
        const widestOffset = Math.max(leftOffset, rightOffset, maxOffset);
        if (Number.isFinite(widestOffset)) {
            maxOffset = widestOffset;
        }
    };

    unifyWithExistingBar();
    const ensureBarInteractionState = node => {

        if (!node) return;

        if (typeof node.ungrabify === 'function') {
            node.ungrabify();
        } else if (typeof node.grabbable === 'function') {
            node.grabbable(false);
        }

        const type = typeof node.data === 'function' ? node.data('type') : undefined;
        const shouldEnableSelection = type === 'timeline-bar';

        if (typeof node.selectable === 'function') {
            node.selectable(shouldEnableSelection);
        }
        if (shouldEnableSelection && typeof node.selectify === 'function') {
            node.selectify();
        } else if (!shouldEnableSelection && typeof node.unselectify === 'function') {
            node.unselectify();
        }
    };

    const isContainerNode = node => {
        if (!node) return false;
        if (typeof node.hasClass === 'function' && node.hasClass('container')) {
            return true;
        }
        const type = typeof node.data === 'function' ? node.data('type') : undefined;
        if (type === 'container') {
            return true;
        }
        const isContainerFlag = typeof node.data === 'function' ? node.data('isContainer') : undefined;
        return Boolean(isContainerFlag);
    };

    const resolvePotentialContainerParent = node => {
        if (!node) return null;

        if (typeof node.parent === 'function') {
            const parent = node.parent();
            if (parent && parent.length > 0) {
                return parent;
            }
        }

        const parentId = typeof node.data === 'function' ? node.data('parent') : node?.data?.parent;
        if (typeof parentId === 'string') {
            const parentById = cy.getElementById(parentId);
            if (parentById && parentById.length > 0) {
                return parentById;
            }
        }

        return null;
    };

    const isNodeContainerizedForRestore = node => {
        if (!node) return false;

        const parentCollection = resolvePotentialContainerParent(node);
        if (parentCollection && isContainerNode(parentCollection)) {
            return true;
        }

        const nodeData = typeof node.data === 'function' ? node.data() : node?.data;
        if (nodeData) {
            const containerFlags = [
                '_timelineContainerized',
                'timelineContainerized',
                '_timelineParentWasContainer'
            ];
            if (containerFlags.some(flag => Boolean(nodeData[flag]))) {
                return true;
            }
        }

        if (typeof scaffoldingParentId === 'string') {
            const sharedParent = cy.getElementById(scaffoldingParentId);
            if (sharedParent && sharedParent.length > 0 && isContainerNode(sharedParent)) {
                return true;
            }
        }

        return false;
    };

    const isGraphRestoring = () => Boolean(window.GraphManager && window.GraphManager._isRestoring === true);

    const shouldLockBarDuringRestore = node => {
        if (!isGraphRestoring()) {
            return false;
        }

        return !isNodeContainerizedForRestore(node);
    };

    const shouldKeepBarLockedOutsideRestore = node => !isNodeContainerizedForRestore(node);

    if (cy._timelineBarUnlockScheduler) {
        cy._timelineBarUnlockScheduler.forEach(timeoutId => clearTimeout(timeoutId));
        cy._timelineBarUnlockScheduler.clear();
    }
    if (!cy._timelineBarUnlockScheduler) {
        cy._timelineBarUnlockScheduler = new Map();
    }
    const barUnlockScheduler = cy._timelineBarUnlockScheduler;

    const maintainBarLockDuringRestore = node => {
        if (!node) return;

        if (shouldKeepBarLockedOutsideRestore(node)) {
            if (typeof node.lock === 'function') {
                node.lock();
            } else if (typeof node.locked === 'function') {
                node.locked(true);
            }
            return;
        }

        if (shouldLockBarDuringRestore(node)) {
            if (typeof node.lock === 'function') {
                node.lock();
            } else if (typeof node.locked === 'function') {
                node.locked(true);
            }
        } else if (typeof node.unlock === 'function') {
            node.unlock();
        } else if (typeof node.locked === 'function') {
            node.locked(false);
        }
    };

    const scheduleBarUnlockAfterRestore = node => {
        if (!node) return;

        const id = typeof node.id === 'function' ? node.id() : node?.data?.id;
        if (!id) {
            return;
        }

        const existing = barUnlockScheduler.get(id);
        if (existing) {
            clearTimeout(existing);
        }

        const attemptUnlock = () => {
            if (shouldLockBarDuringRestore(node)) {
                const retryId = setTimeout(attemptUnlock, 50);
                barUnlockScheduler.set(id, retryId);
                return;
            }

            barUnlockScheduler.delete(id);

            if (!shouldKeepBarLockedOutsideRestore(node)) {
                if (typeof node.unlock === 'function') {
                    node.unlock();
                } else if (typeof node.locked === 'function') {
                    node.locked(false);
                }
            } else {
                maintainBarLockDuringRestore(node);
            }
            ensureBarInteractionState(node);
        };

        const timeoutId = setTimeout(attemptUnlock, 50);
        barUnlockScheduler.set(id, timeoutId);

    };

    const positionBarNode = (node, position) => {
        if (!node) return;

        const isLocked = typeof node.locked === 'function' ? node.locked() : false;

        if (isLocked && typeof node.unlock === 'function') {
            node.unlock();
        }

        node.position(position);

        maintainBarLockDuringRestore(node);
        ensureBarInteractionState(node);
        if (shouldLockBarDuringRestore(node)) {
            scheduleBarUnlockAfterRestore(node);
        }
    };

    // Timeline scaffolding (bar, anchors, ticks) is recreated on each layout run
    // from the stored timeline state. Any ad-hoc style edits (like manual color
    // changes made through generic editors) will be overwritten by this rebuild
    // step so that the scaffolding stays consistent with the recorded bar color
    // and class. User-editable styling should be applied to the data nodes that
    // are tethered to the anchors instead of the scaffolding itself.
    if (!barNode) {
        const barData = {
            id: barId,
            type: 'timeline-bar',
            size: barSize,
            barLength: barLength,
            color: barColor,
            className: barClass,
            _timelineScope: timelineScopeId
        };
        if (typeof scaffoldingParentId === 'string') {
            barData.parent = scaffoldingParentId;
        }
        barNode = cy.add({
            group: 'nodes',
            data: barData,

            position: { x: barStart + barLength / 2, y: centerY },
            selectable: true,
            grabbable: false
        });
        positionBarNode(barNode, { x: barStart + barLength / 2, y: centerY });
    } else {
        barNode.data('barLength', barLength);
        barNode.data('size', barSize);
        barNode.data('color', barColor);
        barNode.data('className', barClass);
        if (typeof barNode.data === 'function') {
            barNode.data('_timelineScope', timelineScopeId);
        }
        if (typeof scaffoldingParentId === 'string') {
            barNode.move({ parent: scaffoldingParentId });
        } else if (barNode.parent && barNode.parent().length > 0) {
            barNode.move({ parent: null });
        }
        positionBarNode(barNode, { x: barStart + barLength / 2, y: centerY });
    }

    // Apply styling or class to the timeline bar
    const prevClass = barNode.data('appliedClass');
    if (prevClass && prevClass !== barClass) {
        barNode.removeClass(prevClass);
    }
    if (barClass) {
        barNode.addClass(barClass);
        barNode.data('appliedClass', barClass);
        barNode.style({
            'width': barNode.data('barLength'),
            'height': barNode.data('size'),
            'shape': 'rectangle',
            'z-index': -1
        });
        barNode.removeStyle('background-color');
        maintainBarLockDuringRestore(barNode);
        ensureBarInteractionState(barNode);
        if (shouldLockBarDuringRestore(barNode)) {
            scheduleBarUnlockAfterRestore(barNode);
        }
    } else {
        barNode.data('appliedClass', null);
        barNode.style({
            'width': barNode.data('barLength'),
            'height': barNode.data('size'),
            'shape': 'rectangle',
            'background-color': barNode.data('color'),
            'z-index': -1
        });
        maintainBarLockDuringRestore(barNode);
        ensureBarInteractionState(barNode);
        if (shouldLockBarDuringRestore(barNode)) {
            scheduleBarUnlockAfterRestore(barNode);
        }
    }

    layoutState.timelineBaseline = layoutState.timelineBaseline || {};
    layoutState.timelineBaseline.maxOffset = maxOffset;
    layoutState.timelineBaseline.barLength = barLength;
    layoutState.timelineBaseline.barStart = barStart;

    rebuildTimelineConnectors(cy, {
        nodes: allNodes,
        centerY,
        scaffoldingParentId,
        timelineScopeId,
        barId,
        skipGraphSync: isScopedLayout
    });

    if (preservedScaffoldingState) {
        applyTimelineScaffoldingSnapshot(cy, preservedScaffoldingState);
    }

    const persistTimelineAbsolutePositions = () => {
        if (!window.GraphManager || typeof window.GraphManager.storeTimelineAbsolutePositions !== 'function') {
            return;
        }

        const records = [];

        const addRecord = node => {
            if (!node || typeof node.id !== 'function' || typeof node.position !== 'function') {
                return;
            }

            const id = node.id();
            if (!id) {
                return;
            }

            const nodePosition = node.position();
            if (!nodePosition || nodePosition.x === undefined || nodePosition.y === undefined) {
                return;
            }

            const data = typeof node.data === 'function' ? node.data() : {};
            const type = data ? data.type : undefined;
            const lockedXRaw = data && Object.prototype.hasOwnProperty.call(data, 'lockedX') ? data.lockedX : undefined;
            const lockedX = Number(lockedXRaw);

            const participatesInTimeline =
                (typeof type === 'string' && type.startsWith('timeline-')) ||
                Number.isFinite(lockedX);

            if (!participatesInTimeline) {
                return;
            }

            const record = {
                id,
                position: { x: nodePosition.x, y: nodePosition.y },
                data: {}
            };

            if (typeof type === 'string') {
                record.data.type = type;
            }

            if (Number.isFinite(lockedX)) {
                record.lockedX = lockedX;
                record.data.lockedX = lockedX;
            }

            if (data && typeof data === 'object') {
                if (Object.prototype.hasOwnProperty.call(data, 'label') && data.label !== undefined) {
                    record.data.label = data.label;
                }
                if (type === 'timeline-bar') {
                    if (data.size !== undefined) record.data.size = data.size;
                    if (data.barLength !== undefined) record.data.barLength = data.barLength;
                    if (data.color !== undefined) record.data.color = data.color;
                    if (data.className !== undefined) record.data.className = data.className;
                }
                if (data.parent !== undefined) {
                    record.data.parent = data.parent;
                }
            }

            if (typeof node.parent === 'function') {
                const parent = node.parent();
                if (parent && parent.length > 0) {
                    record.parent = parent.id();
                    record.data.parent = parent.id();
                }
            }

            if (typeof node.classes === 'function') {
                const classString = node.classes();
                if (classString) {
                    record.classes = classString;
                }
            }

            records.push(record);
        };

        cy.nodes().forEach(addRecord);

        if (records.length > 0) {
            window.GraphManager.storeTimelineAbsolutePositions(records);
        }
    };

    persistTimelineAbsolutePositions();

    // Constrain dragging to vertical movement by fixing the x-coordinate
    // Remove any existing handlers from previous timeline layouts
    if (cy._timelineResetX) {
        cy.off('grab drag position free', 'node[type!="timeline-bar"]', cy._timelineResetX);
    }

    const resetX = evt => {
        const node = evt.target;
        if (!node || typeof node.position !== 'function') {
            return;
        }
        if (typeof node.scratch === 'function' && node.scratch('_timelineSuppressResetX')) {
            return;
        }
        const lockedX = normalizeNodeLockedX(node);
        if (!Number.isFinite(lockedX)) {
            return;
        }
        const currentX = node.position('x');
        if (currentX !== lockedX) {
            const y = node.position('y');
            // Only lock the x-coordinate; preserve the current y-position
            node.position({ x: lockedX, y });
        }
    };

    // Store the handler so it can be removed on subsequent layout runs
    cy._timelineResetX = resetX;

    // Constrain dragging to vertical movement by fixing the x-coordinate
    cy.on('grab drag position free', 'node[type!="timeline-bar"]', resetX);

    if (cy._timelineContainerGrabHandler) {
        cy.off('grab', 'node', cy._timelineContainerGrabHandler);
    }
    if (cy._timelineContainerFreeHandler) {
        cy.off('free dragfree', 'node', cy._timelineContainerFreeHandler);
    }

    const containerLockedChildren = new Map();
    cy._timelineContainerLockedChildren = containerLockedChildren;
    const containerTimelineUnlocks = new Map();
    cy._timelineContainerTimelineUnlocks = containerTimelineUnlocks;
    const containerDragSnapshots = new Map();
    cy._timelineContainerDragSnapshots = containerDragSnapshots;

    const containerGrabHandler = evt => {
        const container = evt.target;
        if (!container || container.length === 0 || !isContainerNode(container) || typeof container.descendants !== 'function') {
            return;
        }

        containerLockedChildren.delete(container.id());

        const recorded = [];
        const timelineRecords = [];
        const descendants = container.descendants('node');
        const containerCenterAtGrab = getNodeCenter(container);
        let containerBoundsAtGrab = null;
        if (typeof container.boundingBox === 'function') {
            const bb = container.boundingBox({ includeLabels: false, includeOverlays: false });
            if (bb && [bb.x1, bb.x2, bb.y1, bb.y2, bb.w, bb.h].every(v => Number.isFinite(v))) {
                containerBoundsAtGrab = { x1: bb.x1, x2: bb.x2, y1: bb.y1, y2: bb.y2, w: bb.w, h: bb.h };
            }
        }

        const scaffoldingSnapshots = [];

        const addTimelineRecord = node => {
            const nodeType = typeof node.data === 'function' ? node.data('type') : undefined;
            if (typeof nodeType === 'string' && nodeType.startsWith('timeline-')) {
                const wasLocked = typeof node.locked === 'function' ? node.locked() : undefined;
                timelineRecords.push({ id: node.id(), type: nodeType, wasLocked });
                if (wasLocked && typeof node.unlock === 'function') {
                    node.unlock();
                }
            }
        };

        descendants.forEach(child => {
            if (!child || child.id() === container.id()) {
                return;
            }
            addTimelineRecord(child);
            const lockedX = child.data('lockedX');
            if (lockedX !== undefined) {
                if (typeof child.scratch === 'function') {
                    child.scratch('_timelineSuppressResetX', true);
                }
                child.removeData('lockedX');
                recorded.push(child.id());
            }
        });

        const descendantTimelineScopes = new Set();
        descendants.forEach(child => {
        let dataScope = child && typeof child.data === 'function' ? child.data('_timelineScope') : undefined;
        if (dataScope === undefined && child && child.data && typeof child.data === 'object') {
            dataScope = child.data._timelineScope;
        }

            let resolvedScope;
            if (dataScope !== undefined) {
                resolvedScope = resolveTimelineScopeKey(dataScope);
            } else if (typeof nodeParticipatesInTimeline === 'function' && nodeParticipatesInTimeline(child)) {
                // Nodes participating in the root timeline should pull the root-scoped scaffolding along
                resolvedScope = ROOT_TIMELINE_SCOPE;
            }

            if (resolvedScope) {
                descendantTimelineScopes.add(resolvedScope);
            }
        });

        const scopedScaffolding = cy.nodes('[type="timeline-bar"], [type="timeline-anchor"], [type="timeline-tick"]').filter(scaffold => {
            if (!scaffold || typeof scaffold.data !== 'function') {
                return false;
            }

            const containerScopeKey = resolveTimelineScopeKey(container.id());
            const scopeKey = resolveTimelineScopeKey(scaffold.data('_timelineScope'));

            if (scopeKey === containerScopeKey) {
                return true;
            }

            if (descendantTimelineScopes.has(scopeKey)) {
                return true;
            }

            const parent = typeof scaffold.parent === 'function' ? scaffold.parent() : null;
            if (parent && parent.length > 0 && parent.id && parent.id() === container.id()) {
                return true;
            }

            const parentId = scaffold.data('parent');
            return parentId === container.id();
        });

        scopedScaffolding.forEach(scaffold => {
            addTimelineRecord(scaffold);

            const wasLocked = typeof scaffold.locked === 'function' ? scaffold.locked() : false;
            if (wasLocked && typeof scaffold.unlock === 'function') {
                scaffold.unlock();
            }

            if (typeof scaffold.position === 'function') {
                const pos = scaffold.position();
                if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
                    scaffoldingSnapshots.push({ id: scaffold.id(), x: pos.x, y: pos.y });
                }
            }

            const parent = typeof scaffold.parent === 'function' ? scaffold.parent() : null;
            if (!parent || parent.length === 0 || parent.id() !== container.id()) {
                scaffold.move({ parent: container.id() });
            }
        });

        if (recorded.length > 0) {
            containerLockedChildren.set(container.id(), recorded);
        }
        if (timelineRecords.length > 0) {
            containerTimelineUnlocks.set(container.id(), timelineRecords);
        } else {
            containerTimelineUnlocks.delete(container.id());
        }

        const hasGrabSnapshot = containerCenterAtGrab || containerBoundsAtGrab || scaffoldingSnapshots.length > 0;
        if (hasGrabSnapshot) {
            containerDragSnapshots.set(container.id(), {
                center: containerCenterAtGrab,
                bounds: containerBoundsAtGrab,
                scaffolding: scaffoldingSnapshots
            });
        } else {
            containerDragSnapshots.delete(container.id());
        }
    };

    const containerFreeHandler = evt => {
        const container = evt.target;
        if (!container || container.length === 0 || !isContainerNode(container)) {
            return;
        }

        const recorded = containerLockedChildren.get(container.id());
        if (!recorded) {
            return;
        }

        const dragSnapshot = containerDragSnapshots.get(container.id());
        let dragOffset = null;

        if (dragSnapshot && dragSnapshot.center) {
            const currentCenter = getNodeCenter(container);
            if (currentCenter && Number.isFinite(currentCenter.x) && Number.isFinite(currentCenter.y)) {
                dragOffset = {
                    x: currentCenter.x - dragSnapshot.center.x,
                    y: currentCenter.y - dragSnapshot.center.y
                };

                if (!dragOffset.x && !dragOffset.y) {
                    dragOffset = null;
                }
            }
        }

        const boundsChangedMeaningfully = (() => {
            if (!dragSnapshot || !dragSnapshot.bounds || typeof container.boundingBox !== 'function') {
                return false;
            }
            const latestBb = container.boundingBox({ includeLabels: false, includeOverlays: false });
            const currentBounds = latestBb && [latestBb.x1, latestBb.x2, latestBb.y1, latestBb.y2, latestBb.w, latestBb.h].every(v => Number.isFinite(v))
                ? { x1: latestBb.x1, x2: latestBb.x2, y1: latestBb.y1, y2: latestBb.y2, w: latestBb.w, h: latestBb.h }
                : null;

            if (!currentBounds) {
                return false;
            }

            return boundsMeaningfullyChanged(dragSnapshot.bounds, currentBounds);
        })();

        if (dragOffset && dragSnapshot && Array.isArray(dragSnapshot.scaffolding)) {
            dragSnapshot.scaffolding.forEach(snapshot => {
                const node = cy.getElementById(snapshot.id);
                if (!node || node.length === 0 || typeof node.position !== 'function') {
                    return;
                }
                node.position({ x: snapshot.x + dragOffset.x, y: snapshot.y + dragOffset.y });
            });
        }

        recorded.forEach(childId => {
            const child = cy.getElementById(childId);
            if (!child || child.length === 0) {
                return;
            }
            const x = child.position('x');
            child.data('lockedX', x);
            if (typeof child.removeScratch === 'function') {
                child.removeScratch('_timelineSuppressResetX');
            }
        });

        containerLockedChildren.delete(container.id());
        containerDragSnapshots.delete(container.id());

        const timelineRecords = containerTimelineUnlocks.get(container.id());
        if (timelineRecords && timelineRecords.length > 0) {
            timelineRecords.forEach(record => {
                const node = cy.getElementById(record.id);
                if (!node || node.length === 0) {
                    return;
                }
                if (record.wasLocked && typeof node.lock === 'function') {
                    node.lock();
                } else if (record.wasLocked === false && typeof node.locked === 'function') {
                    node.locked(false);
                }
                if (record.type === 'timeline-bar') {
                    maintainBarLockDuringRestore(node);
                    ensureBarInteractionState(node);
                    if (shouldLockBarDuringRestore(node)) {
                        scheduleBarUnlockAfterRestore(node);
                    }
                }
            });
            containerTimelineUnlocks.delete(container.id());
        }

        const shouldRefreshLayout = boundsChangedMeaningfully || Boolean(dragOffset) || !dragSnapshot;

        try {
            if (shouldRefreshLayout) {
                updateBarAndTicks({ dragOffset });
            }
        } catch (error) {
            console.warn('Failed to refresh timeline scaffolding after container interaction:', error);
        }
    };

    cy._timelineContainerGrabHandler = containerGrabHandler;
    cy._timelineContainerFreeHandler = containerFreeHandler;

    cy.on('grab', 'node', containerGrabHandler);
    cy.on('free dragfree', 'node', containerFreeHandler);

    // Ensure panning and zooming are available for timeline navigation
    cy.panningEnabled(true);

    const updateBarAndTicks = (options = {}) => {
        const dragOffset = options.dragOffset || null;
        const dragOffsetX = Number.isFinite(dragOffset?.x) ? dragOffset.x : 0;
        const dragOffsetY = Number.isFinite(dragOffset?.y) ? dragOffset.y : 0;
        const hasDragOffset = dragOffset && (dragOffsetX !== 0 || dragOffsetY !== 0);

        const ext = cy.extent();
        const fallbackLeft = Number.isFinite(layoutState.baseLeft)
            ? layoutState.baseLeft
            : (bb ? bb.x1 : ext.x1);
        const fallbackWidth = Number.isFinite(layoutState.baseSafeWidth)
            ? layoutState.baseSafeWidth
            : (bb ? bb.w : ext.w);
        const hasCenterOverride = Number.isFinite(layoutState.centerYOverride);
        const storedCenterY = hasCenterOverride
            ? layoutState.centerYOverride
            : layoutState.baseCenterY;
        const fallbackCenterY = Number.isFinite(storedCenterY)
            ? storedCenterY
            : (bb ? bb.y1 + bb.h / 2 : ext.y1 + ext.h / 2);

        let containerBounds = null;
        const snapshot = layoutState.containerBoundsSnapshot ? cloneBounds(layoutState.containerBoundsSnapshot) : null;

        if (typeof scaffoldingParentId === 'string') {
            const parentCollection = cy.getElementById(scaffoldingParentId);
            if (parentCollection && parentCollection.length) {
                const parentCenter = getNodeCenter(parentCollection);
                const storedWidth = Number(parentCollection.data('width'));
                const storedHeight = Number(parentCollection.data('height'));

                const boundsFromData = buildBoundsFromCenter(parentCenter, storedWidth, storedHeight);
                if (boundsFromData) {
                    containerBounds = boundsFromData;
                    layoutState.containerBoundsSnapshot = cloneBounds(boundsFromData);
                } else if (snapshot && parentCenter) {
                    containerBounds = buildBoundsFromCenter(parentCenter, snapshot.w, snapshot.h) || null;
                }

                if (!containerBounds && typeof parentCollection.boundingBox === 'function') {
                    const latestBb = parentCollection.boundingBox({ includeLabels: false, includeOverlays: false });
                    if (latestBb && [latestBb.x1, latestBb.x2, latestBb.y1, latestBb.y2, latestBb.w, latestBb.h].every(v => Number.isFinite(v))) {
                        if (!snapshot) {
                            containerBounds = {
                                x1: latestBb.x1,
                                x2: latestBb.x2,
                                y1: latestBb.y1,
                                y2: latestBb.y2,
                                w: latestBb.w,
                                h: latestBb.h
                            };
                            layoutState.containerBoundsSnapshot = cloneBounds(containerBounds);
                        } else if (parentCenter) {
                            containerBounds = buildBoundsFromCenter(parentCenter, snapshot.w, snapshot.h) || null;
                        }
                        if (!containerBounds) {
                            containerBounds = {
                                x1: latestBb.x1,
                                x2: latestBb.x2,
                                y1: latestBb.y1,
                                y2: latestBb.y2,
                                w: latestBb.w,
                                h: latestBb.h
                            };
                        }
                    }
                }
            }
        }

        if (!containerBounds && snapshot) {
            containerBounds = cloneBounds(snapshot);
        }

        const containerBoundsChanged = containerBounds && snapshot
            ? boundsMeaningfullyChanged(snapshot, containerBounds)
            : false;

        const effectiveLeft = containerBounds ? containerBounds.x1 : fallbackLeft;
        const effectiveWidth = containerBounds ? containerBounds.w : fallbackWidth;
        const effectiveCenterY = containerBounds ? containerBounds.y1 + containerBounds.h / 2 : fallbackCenterY;

        if (containerBounds) {
            layoutState.baseLeft = containerBounds.x1;
            layoutState.baseSafeWidth = containerBounds.w;
            if (!hasCenterOverride) {
                layoutState.baseCenterY = containerBounds.y1 + containerBounds.h / 2;
            }
        }

        const safeLeft = Number.isFinite(effectiveLeft) ? effectiveLeft : fallbackLeft;
        const safeWidth = Number.isFinite(effectiveWidth) ? effectiveWidth : fallbackWidth;
        const safeCenterYBase = hasCenterOverride
            ? layoutState.centerYOverride
            : (Number.isFinite(effectiveCenterY) ? effectiveCenterY : fallbackCenterY);
        const safeCenterY = safeCenterYBase + dragOffsetY;

        // Persist the latest center so subsequent interactions (even without a drag offset)
        // reuse the current y-position instead of reverting to an outdated override.
        if (Number.isFinite(safeCenterY)) {
            layoutState.centerYOverride = safeCenterY;
        }

        const fallbackStart = safeLeft + layoutState.padding;
        const fallbackWidthForBar = Math.max(0, safeWidth - layoutState.padding * 2);
        storedBaseline = layoutState.timelineBaseline || {};
        const hasStoredBaseline = Number.isFinite(storedBaseline.startX) && Number.isFinite(storedBaseline.width);

        let baselineForBarStart;
        let baselineForBarWidth;

        if (containerBoundsChanged) {
            baselineForBarStart = fallbackStart;
            baselineForBarWidth = fallbackWidthForBar;
            layoutState.baselineDerivedFromRestore = false;
        } else if (hasDragOffset && hasStoredBaseline) {
            baselineForBarStart = storedBaseline.startX + dragOffsetX;
            baselineForBarWidth = storedBaseline.width;
            layoutState.baselineDerivedFromRestore = true;
        } else if (layoutState.baselineDerivedFromRestore && hasStoredBaseline) {
            baselineForBarStart = storedBaseline.startX;
            baselineForBarWidth = storedBaseline.width;
        } else {
            baselineForBarStart = hasStoredBaseline ? storedBaseline.startX : fallbackStart;
            baselineForBarWidth = hasStoredBaseline ? storedBaseline.width : fallbackWidthForBar;

            if (!Number.isFinite(baselineForBarStart)) {
                baselineForBarStart = fallbackStart;
            }
            if (!Number.isFinite(baselineForBarWidth)) {
                baselineForBarWidth = fallbackWidthForBar;
            }

            const previousBaseline = layoutState.timelineBaseline || {};
            layoutState.timelineBaseline = {
                startX: baselineForBarStart,
                width: baselineForBarWidth,
                maxOffset: previousBaseline.maxOffset,
                barLength: previousBaseline.barLength,
                barStart: previousBaseline.barStart
            };
            layoutState.baselineDerivedFromRestore = false;
        }

        baselineStartX = baselineForBarStart;
        width = Math.max(0, baselineForBarWidth);
        layoutState.timelineBaseline = layoutState.timelineBaseline || {};
        layoutState.timelineBaseline.startX = baselineStartX;
        layoutState.timelineBaseline.width = width;
        centerY = safeCenterY;

        const refreshContainerLockedX = () => {
            const shouldRefresh = containerBoundsChanged || hasDragOffset;
            if (!shouldRefresh) {
                return;
            }

            allNodes.forEach(node => {
                if (!node || typeof node.position !== 'function') {
                    return;
                }

                const parentCollection = resolvePotentialContainerParent(node);
                const isContainerized = parentCollection && isContainerNode(parentCollection);
                if (!isContainerized) {
                    return;
                }

                const pos = node.position();
                if (!pos || !Number.isFinite(pos.x)) {
                    return;
                }

                const lockedX = normalizeNodeLockedX(node);
                if (!Number.isFinite(lockedX) || Math.abs(lockedX - pos.x) > 0.5) {
                    node.data('lockedX', pos.x);
                }
            });
        };

        refreshContainerLockedX();

        let barLength = width + maxOffset * 2;
        let barStart = baselineStartX - maxOffset;

        if (timelineHasExistingLayout && storedBaseline) {
            const storedBarStart = Number.isFinite(storedBaseline.barStart)
                ? storedBaseline.barStart + (hasDragOffset ? dragOffsetX : 0)
                : undefined;
            const storedBarLength = Number.isFinite(storedBaseline.barLength)
                ? sanitizeBarWidth(storedBaseline.barLength)
                : undefined;

            if (Number.isFinite(storedBarStart) && Number.isFinite(storedBarLength)) {
                const storedBarEnd = storedBarStart + storedBarLength;
                const currentBarEnd = barStart + barLength;

                const unifiedStart = Math.min(barStart, storedBarStart);
                const unifiedEnd = Math.max(currentBarEnd, storedBarEnd);

                barStart = unifiedStart;
                barLength = sanitizeBarWidth(unifiedEnd - unifiedStart);

                const leftOffset = baselineStartX - barStart;
                const rightOffset = (barStart + barLength) - (baselineStartX + width);
                const widestOffset = Math.max(leftOffset, rightOffset, maxOffset, Number(storedBaseline.maxOffset));
                if (Number.isFinite(widestOffset)) {
                    maxOffset = widestOffset;
                }
            }
        }

        if (barNode && typeof barNode.position === 'function') {
            const existingLength = Number(barNode.data && barNode.data('barLength'));
            const existingCenterX = barNode.position('x');
            if (Number.isFinite(existingLength) && Number.isFinite(existingCenterX)) {
                const existingStart = existingCenterX - existingLength / 2;
                const existingEnd = existingCenterX + existingLength / 2;
                const currentEnd = barStart + barLength;

                const unifiedStart = Math.min(barStart, existingStart);
                const unifiedEnd = Math.max(currentEnd, existingEnd);

                barStart = unifiedStart;
                barLength = sanitizeBarWidth(unifiedEnd - unifiedStart);

                const leftOffset = baselineStartX - barStart;
                const rightOffset = (barStart + barLength) - (baselineStartX + width);
                const widestOffset = Math.max(leftOffset, rightOffset, maxOffset);
                if (Number.isFinite(widestOffset)) {
                    maxOffset = widestOffset;
                }
            }
        }

        const baselineRecord = {
            startX: baselineStartX,
            width,
            minTime,
            maxTime,
            rawMinTime,
            rawMaxTime,
            range,
            margin,
            centerY,
            maxOffset,
            barLength,
            barStart,
            containerX1: containerBounds ? containerBounds.x1 : undefined,
            containerY1: containerBounds ? containerBounds.y1 : undefined,
            containerWidth: containerBounds ? containerBounds.w : undefined,
            containerHeight: containerBounds ? containerBounds.h : undefined
        };
        setTimelineBaselineInfo(cy, timelineScopeId, baselineRecord);

        barNode.data('barLength', barLength);
        positionBarNode(barNode, { x: barStart + barLength / 2, y: centerY });
        layoutState.timelineBaseline.maxOffset = maxOffset;
        layoutState.timelineBaseline.barLength = barLength;
        layoutState.timelineBaseline.barStart = barStart;
        barNode.style({
            'width': barNode.data('barLength'),
            'height': barNode.data('size'),
            'shape': 'rectangle',
            'background-color': barNode.data('color'),
            'z-index': 0
        });
        ensureBarInteractionState(barNode);

        const barLeft = barNode.position('x') - barNode.data('barLength') / 2;

        allNodes.forEach(node => {
            const anchor = cy.getElementById(`timeline-anchor-${node.id()}`);
            if (anchor.length) {
                anchor.position({ x: node.position('x'), y: centerY });
            }
        });

        // Remove existing tick nodes before adding new ones
        const scopedTicks = typeof cy.nodes === 'function'
            ? cy.nodes('[type="timeline-tick"]').filter(elementMatchesScope)
            : null;
        if (scopedTicks && typeof scopedTicks.remove === 'function') {
            scopedTicks.remove();
        }

        const tickInterval = getTickInterval(range);

        const tickTimes = [minTime];
        if (tickInterval.unit === 'month') {
            let current = new Date(minTime);
            current.setUTCDate(1);
            current.setUTCHours(0, 0, 0, 0);
            current.setUTCMonth(current.getUTCMonth() + 1);
            while (current.getTime() < maxTime) {
                tickTimes.push(current.getTime());
                current.setUTCMonth(current.getUTCMonth() + 1);
            }
            if (tickTimes.length > 1) {
                const lastLabel = formatTickLabel(new Date(tickTimes[tickTimes.length - 1]), range, tickInterval.value);
                const maxLabel = formatTickLabel(new Date(maxTime), range, tickInterval.value);
                if (lastLabel === maxLabel) {
                    tickTimes.pop();
                }
            }
        } else if (tickInterval.unit === 'day') {
            let current = new Date(minTime);
            current.setUTCHours(0, 0, 0, 0);
            current.setUTCDate(current.getUTCDate() + 1);
            while (current.getTime() < maxTime) {
                tickTimes.push(current.getTime());
                current.setUTCDate(current.getUTCDate() + 1);
            }
            if (tickTimes.length > 1) {
                const lastLabel = formatTickLabel(new Date(tickTimes[tickTimes.length - 1]), range, tickInterval.value);
                const maxLabel = formatTickLabel(new Date(maxTime), range, tickInterval.value);
                if (lastLabel === maxLabel) {
                    tickTimes.pop();
                }
            }
        } else if (tickInterval.unit === 'year') {
            const step = tickInterval.step || Math.max(1, Math.round(tickInterval.value / (365 * 86400000)));
            const startYear = Math.ceil(new Date(minTime).getUTCFullYear() / step) * step;
            const endYear = Math.floor(new Date(maxTime).getUTCFullYear() / step) * step;
            for (let y = startYear; y <= endYear; y += step) {
                const t = Date.UTC(y, 0, 1);
                if (t > minTime && t < maxTime) {
                    tickTimes.push(t);
                }
            }
            if (tickTimes.length > 1) {
                const lastLabel = formatTickLabel(new Date(tickTimes[tickTimes.length - 1]), range, tickInterval.value);
                const maxLabel = formatTickLabel(new Date(maxTime), range, tickInterval.value);
                if (lastLabel === maxLabel) {
                    tickTimes.pop();
                }
            }
        } else {
            const interval = tickInterval.value;
            const firstTick = Math.ceil(minTime / interval) * interval;
            for (let t = firstTick; t <= maxTime; t += interval) {
                if (t !== minTime && t !== maxTime) {
                    tickTimes.push(t);
                }
            }
        }
        tickTimes.push(maxTime);
        console.log('tick times and labels:', tickTimes, tickTimes.map(t => formatTickLabel(new Date(t), range, tickInterval.value)));

        const coerceColor = candidate => {
            if (!candidate) return null;
            if (typeof candidate === 'string') return candidate;
            if (Array.isArray(candidate?.value)) {
                const [r, g, b] = candidate.value;
                if ([r, g, b].every(v => Number.isFinite(v))) {
                    return `rgb(${r}, ${g}, ${b})`;
                }
            }
            return candidate?.strValue || candidate?.value || null;
        };

        const resolveTickColor = () => {
            if (typeof barNode?.renderedStyle === 'function') {
                const renderedColor = coerceColor(barNode.renderedStyle('background-color'));
                if (renderedColor) return renderedColor;
            }

            if (typeof barNode?.pstyle === 'function') {
                const parsedStyle = coerceColor(barNode.pstyle('background-color'));
                if (parsedStyle) return parsedStyle;
            }

            if (typeof barNode?.style === 'function') {
                const styledColor = coerceColor(barNode.style('background-color'));
                if (styledColor) return styledColor;
            }

            if (typeof barNode?.data === 'function') {
                const dataColor = coerceColor(barNode.data('color'));
                if (dataColor) return dataColor;
            }

            const explicitColor = coerceColor(barColor);
            if (explicitColor) return explicitColor;

            return '#666';
        };

        const tickColor = resolveTickColor();

        tickTimes.forEach(t => {
            const ratio = (t - minTime) / range;
            const x = barLeft + ratio * barNode.data('barLength');
            const pos = { x, y: centerY + barNode.data('size') / 2 + 4 };
            const id = buildScopedId(`timeline-tick-${t}`);
            const label = formatTickLabel(new Date(t), range, tickInterval.value);
            let tickNode = cy.getElementById(id);
            if (tickNode.length === 0) {
                const tickData = { id, type: 'timeline-tick', label, _timelineScope: timelineScopeId };
                if (typeof scaffoldingParentId === 'string') {
                    tickData.parent = scaffoldingParentId;
                }
                tickNode = cy.add({
                    group: 'nodes',
                    data: tickData,
                    position: pos,
                    selectable: false,
                    grabbable: false
                });
            } else {
                tickNode.data({ type: 'timeline-tick', label, _timelineScope: timelineScopeId });
                if (typeof scaffoldingParentId === 'string') {
                    tickNode.move({ parent: scaffoldingParentId });
                } else if (tickNode.parent && tickNode.parent().length > 0) {
                    tickNode.move({ parent: null });
                }
                tickNode.position(pos);
            }

            tickNode.grabbable(false);
            if (typeof tickNode.unlock === 'function') {
                tickNode.unlock();
            } else if (typeof tickNode.locked === 'function') {
                tickNode.locked(false);
            }
            tickNode.style({
                'shape': 'rectangle',
                'width': 2,
                'height': 8,
                'background-color': tickColor,
                'label': label,
                'font-size': 10,
                'color': tickColor,
                'text-halign': 'center',
                'text-valign': 'bottom',
                'text-margin-y': 2
            });
        });
    };

    updateBarAndTicks();
    // Capture scaffolding positions again now that ticks and anchors are finalized.
    persistTimelineAbsolutePositions();
    setTimelineLayoutApplied(cy, timelineScopeId, true);
    if (!isScopedLayout) {
        cy.off('resize.timeline zoom.timeline');
        cy.on('resize.timeline zoom.timeline', updateBarAndTicks);
    }
}

function fitNodesToTimeline(cy, nodesInput) {
    if (!cy || typeof cy.nodes !== 'function') {
        return false;
    }

    const collectNodes = () => {
        const collected = [];

        if (nodesInput !== undefined && nodesInput !== null) {
            if (typeof cy.collection === 'function') {
                try {
                    const col = cy.collection(nodesInput);
                    if (col && typeof col.forEach === 'function') {
                        col.forEach(ele => {
                            if (ele && typeof ele.isNode === 'function' && ele.isNode()) {
                                collected.push(ele);
                            }
                        });
                    }
                } catch (error) {
                }
            }

            if (collected.length === 0) {
                if (Array.isArray(nodesInput)) {
                    nodesInput.forEach(ele => {
                        if (ele && typeof ele.isNode === 'function' && ele.isNode()) {
                            collected.push(ele);
                        }
                    });
                } else if (nodesInput && typeof nodesInput.isNode === 'function' && nodesInput.isNode()) {
                    collected.push(nodesInput);
                }
            }
        } else if (typeof cy.nodes === 'function') {
            cy.nodes().forEach(node => collected.push(node));
        }

        return collected;
    };

    const candidates = collectNodes();
    if (!candidates || candidates.length === 0) {
        return false;
    }

    const scaffoldingParentId = findSharedTimelineParentId(candidates);
    const scopeId = typeof scaffoldingParentId === 'string'
        ? scaffoldingParentId
        : ROOT_TIMELINE_SCOPE;

    const baseline = getTimelineBaselineInfo(cy, scopeId);
    if (!baseline) {
        return false;
    }

    const timelineEntries = [];
    candidates.forEach(node => {
        if (!node || typeof node.data !== 'function' || typeof node.position !== 'function') {
            return;
        }
        if (typeof node.removed === 'function' && node.removed()) {
            return;
        }
        const type = node.data('type');
        if (type === 'timeline-bar' || type === 'timeline-anchor' || type === 'timeline-tick') {
            return;
        }

        const rawTimestamp = node.data('timestamp') ?? node.data('time');
        const timestamp = parseTimelineTimestamp(rawTimestamp);
        if (!Number.isFinite(timestamp)) {
            return;
        }

        timelineEntries.push({ node, timestamp });
    });

    if (timelineEntries.length === 0) {
        return false;
    }

    let startX = baseline.startX;
    let width = baseline.width;
    const minTime = baseline.minTime;
    const range = Number.isFinite(baseline.range) && baseline.range !== 0 ? baseline.range : 1;

    if (!Number.isFinite(startX) || !Number.isFinite(width) || width === 0) {
        return false;
    }

    if (typeof scaffoldingParentId === 'string') {
        const container = cy.getElementById(scaffoldingParentId);
        if (container && container.length) {
            const baselineContainerLeft = Number.isFinite(baseline.containerX1) ? baseline.containerX1 : undefined;
            const baselineContainerWidth = Number.isFinite(baseline.containerWidth) ? baseline.containerWidth : undefined;

            let currentBounds = null;
            if (typeof container.boundingBox === 'function') {
                const bb = container.boundingBox({ includeLabels: false, includeOverlays: false });
                if (bb && [bb.x1, bb.w].every(Number.isFinite)) {
                    currentBounds = bb;
                }
            }

            if (!currentBounds) {
                const center = getNodeCenter(container);
                const storedWidth = Number(container.data('width'));
                const storedHeight = Number(container.data('height'));
                const derived = buildBoundsFromCenter(center, storedWidth, storedHeight);
                if (derived) {
                    currentBounds = derived;
                }
            }

            if (currentBounds && Number.isFinite(currentBounds.x1)) {
                if (Number.isFinite(baselineContainerLeft)) {
                    const deltaLeft = currentBounds.x1 - baselineContainerLeft;
                    const ratio = (Number.isFinite(baselineContainerWidth) && Number.isFinite(currentBounds.w) && baselineContainerWidth > 0)
                        ? currentBounds.w / baselineContainerWidth
                        : 1;

                    if (Number.isFinite(ratio) && ratio > 0 && Number.isFinite(baselineContainerWidth) && baselineContainerWidth > 0) {
                        const offsetRatio = (startX - baselineContainerLeft) / baselineContainerWidth;
                        if (Number.isFinite(offsetRatio)) {
                            startX = currentBounds.x1 + offsetRatio * currentBounds.w;
                        } else if (Math.abs(deltaLeft) > 0) {
                            startX += deltaLeft;
                        }
                        if (Math.abs(ratio - 1) > 0.001) {
                            width = Math.max(0, width * ratio);
                        }
                    } else if (Math.abs(deltaLeft) > 0) {
                        startX += deltaLeft;
                    }
                }
            }
        }
    }

    const resolveY = () => {
        const nodesForCenter = timelineEntries.map(entry => entry.node);
        const resolved = resolveTimelineCenterY(cy, nodesForCenter, baseline.centerY, {
            scaffoldingParentId,
            timelineScopeId: scopeId
        });
        return Number.isFinite(resolved) ? resolved : 0;
    };

    const centerY = resolveY();
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    cy.batch(() => {
        timelineEntries.forEach(({ node, timestamp }) => {
            const ratio = (timestamp - minTime) / range;
            const safeRatio = Number.isFinite(ratio) ? clamp(ratio, 0, 1) : 0;
            const fallbackX = startX + safeRatio * width;
            const pos = typeof node.position === 'function' ? node.position() : null;
            const hasValidX = pos && Number.isFinite(pos.x);
            const hasValidY = pos && Number.isFinite(pos.y);
            const normalizedTimestamp = Number.isFinite(timestamp) ? timestamp : undefined;
            const storedSignature = getStoredTimelineTimestampSignature(node);
            const timestampChanged = normalizedTimestamp === undefined
                ? storedSignature !== undefined
                : storedSignature !== normalizedTimestamp;
            const editorAdjusted = hasTimelineEditorTouch(node);
            const currentX = hasValidX ? pos.x : fallbackX;
            const resolvedY = hasValidY ? pos.y : centerY;
            const targetY = Number.isFinite(resolvedY) ? resolvedY : centerY;
            const resolvedX = (!hasValidX || timestampChanged) ? fallbackX : currentX;

            if (typeof node.data === 'function') {
                node.data('lockedX', resolvedX);
            }

            if (editorAdjusted && !timestampChanged && hasValidX && hasValidY) {
                storeTimelineTimestampSignature(node, normalizedTimestamp);
                return;
            }

            const currentY = hasValidY ? pos.y : targetY;
            const shouldUpdateX = !hasValidX || timestampChanged;
            const shouldUpdateY = !hasValidY || Math.abs(currentY - targetY) > 0.5;

            if (shouldUpdateX || shouldUpdateY) {
                node.position({
                    x: shouldUpdateX ? resolvedX : currentX,
                    y: shouldUpdateY ? targetY : currentY
                });
            }

            storeTimelineTimestampSignature(node, normalizedTimestamp);
        });
    });

    rebuildTimelineConnectors(cy, {
        centerY,
        scaffoldingParentId,
        timelineScopeId: scopeId
    });

    return true;
}

// Scatter-style timeline layout that maps timestamps directly to the x-axis
// and spreads nodes vertically using similarity scores, categories, or
// community labels.
function timelineScatterLayout(options = {}) {
    const cy = this;
    const padding = Number(options.padding) || 0;
    const jitterAmplitude = Number.isFinite(options.jitter) ? options.jitter : 8;
    const yScale = Number.isFinite(options.yScale) ? options.yScale : 80;

    const rawNodes = (options.eles || cy.nodes());
    const timelineNodes = rawNodes.filter(node => {
        const type = typeof node.data === 'function' ? node.data('type') : undefined;
        return type !== 'timeline-bar' && type !== 'timeline-anchor' && type !== 'timeline-tick';
    });

    if (timelineNodes.length === 0) {
        return;
    }

    const targetNodes = timelineNodes.filter(node => !(node.data('pinned') || node.locked()));

    const timestamps = timelineNodes.map(node => ({
        node,
        time: resolveNodeTimelineTimestamp(node)
    })).filter(entry => Number.isFinite(entry.time));

    if (timestamps.length === 0) {
        return;
    }

    const minTime = Math.min(...timestamps.map(entry => entry.time));
    const maxTime = Math.max(...timestamps.map(entry => entry.time));
    const timeRange = maxTime - minTime || 1;

    const bb = options.boundingBox;
    const extent = typeof cy.extent === 'function'
        ? cy.extent()
        : { x1: 0, y1: 0, w: typeof cy.width === 'function' ? cy.width() : 1000, h: typeof cy.height === 'function' ? cy.height() : 1000 };

    const layoutWidth = Number.isFinite(bb?.w) ? bb.w : extent.w;
    const xOrigin = (Number.isFinite(bb?.x1) ? bb.x1 : extent.x1 || 0) + padding;
    const xScale = Number.isFinite(options.xScale)
        ? options.xScale
        : (layoutWidth - padding * 2) / timeRange;

    const verticalSpan = Number.isFinite(bb?.h)
        ? bb.h
        : (Number.isFinite(extent?.h)
            ? extent.h
            : (typeof cy.height === 'function' ? cy.height() : 1000));
    const verticalOrigin = Number.isFinite(bb?.y1)
        ? bb.y1
        : (Number.isFinite(extent?.y1) ? extent.y1 : 0);
    const bandHeight = verticalSpan * 0.8;
    const bandStart = verticalOrigin + (verticalSpan - bandHeight) / 2;

    const similarityKeys = ['similarity', 'similarityScore', 'similarity_score'];
    const categoryKeys = ['category', 'type', 'group', 'community', 'communityId'];

    const similarityByNode = new Map();
    timestamps.forEach(entry => {
        const value = similarityKeys.reduce((acc, key) => {
            if (acc !== undefined) return acc;
            const raw = entry.node.data(key);
            const numeric = Number(raw);
            return Number.isFinite(numeric) ? numeric : acc;
        }, undefined);
        if (Number.isFinite(value)) {
            similarityByNode.set(entry.node.id(), value);
        }
    });

    let simMin = Infinity;
    let simMax = -Infinity;
    similarityByNode.forEach(value => {
        simMin = Math.min(simMin, value);
        simMax = Math.max(simMax, value);
    });
    const simRange = simMax - simMin;
    const simMid = simRange === 0 ? simMin : (simMin + simMax) / 2;

    const laneMap = new Map();
    const resolveLaneLabel = node => {
        for (const key of categoryKeys) {
            const raw = node.data(key);
            if (raw !== undefined && raw !== null) {
                return String(raw);
            }
        }
        const label = node.data('label');
        return label ? String(label) : undefined;
    };

    timelineNodes.forEach(node => {
        const label = resolveLaneLabel(node);
        if (label !== undefined && !laneMap.has(label)) {
            laneMap.set(label, laneMap.size);
        }
    });

    const laneCount = laneMap.size;

    const computeJitter = node => {
        if (!jitterAmplitude) return 0;
        const id = typeof node.id === 'function' ? node.id() : String(node.data('id') || '');
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
        }
        const normalized = (hash % 1000) / 999; // 0..1
        return (normalized - 0.5) * 2 * jitterAmplitude;
    };

    const computeVerticalIndex = node => {
        const sim = similarityByNode.get(node.id());
        if (Number.isFinite(sim)) {
            if (simRange === 0) {
                return 0;
            }
            return (sim - simMid) / simRange;
        }

        if (laneCount > 0) {
            const label = resolveLaneLabel(node);
            if (label !== undefined) {
                const laneIndex = laneMap.get(label);
                if (Number.isFinite(laneIndex)) {
                    return laneIndex - (laneCount - 1) / 2;
                }
            }
        }

        return 0;
    };

    const randomSeed = Number.isFinite(options.randomSeed)
        ? options.randomSeed
        : (Date.now() + Math.floor(Math.random() * 0xFFFFFFFF));

    const rng = (seed => {
        let s = seed >>> 0;
        return () => {
            s = (s + 0x6D2B79F5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    })(randomSeed);

    const computeRandomBandY = () => {
        if (!(bandHeight > 0)) {
            return undefined;
        }

        const normalized = rng(); // 0..1
        return bandStart + normalized * bandHeight;
    };

    const context = {
        scaffoldingParentId: options.scaffoldingParentId,
        timelineScopeId: options.timelineScopeId,
        barId: options.barId
    };
    const defaultCenterY = Number.isFinite(options.centerY)
        ? options.centerY
        : (bandHeight > 0
            ? bandStart + bandHeight / 2
            : (Number.isFinite(bb?.y1) && Number.isFinite(bb?.h)
                ? bb.y1 + bb.h / 2
                : (Number.isFinite(extent?.y1) && Number.isFinite(extent?.h)
                    ? extent.y1 + extent.h / 2
                    : (typeof cy.height === 'function' ? cy.height() / 2 : 0))));
    const centerY = resolveTimelineCenterY(cy, timelineNodes, defaultCenterY, context);

    targetNodes.forEach(node => {
        const entry = timestamps.find(item => item.node.id() === node.id());
        const time = entry ? entry.time : minTime;
        const x = xOrigin + (time - minTime) * xScale;
        const bandY = computeRandomBandY();
        if (bandY !== undefined) {
            node.position({ x, y: bandY });
            return;
        }

        const verticalIndex = computeVerticalIndex(node);
        const jitter = computeJitter(node);
        node.position({ x, y: centerY + verticalIndex * yScale + jitter });
    });

    const barStyle = options.barStyle || {};
    const barNodes = cy.nodes('[type="timeline-bar"]');
    if (barNodes && barNodes.length > 0) {
        const barLength = timeRange * xScale;
        const barCenterX = xOrigin + barLength / 2;
        barNodes.forEach(bar => {
            bar.position({ x: barCenterX, y: centerY });
            if (barStyle.height !== undefined) {
                bar.data('size', barStyle.height);
            }
            if (barStyle.color) {
                bar.data('color', barStyle.color);
                if (typeof bar.style === 'function') {
                    bar.style('background-color', barStyle.color);
                }
            }
            if (barStyle.className !== undefined) {
                if (typeof bar.removeClass === 'function') {
                    bar.removeClass(barStyle.className);
                }
                bar.data('appliedClass', barStyle.className);
                if (typeof bar.addClass === 'function' && barStyle.className) {
                    bar.addClass(barStyle.className);
                }
            }
        });
    }
}

// Optimized Circle Packing Layout - O(n log n) complexity
function circlePackingLayout(options = {}) {
    const cy = this;
    const nodes = (options.eles || cy.nodes()).filter(n => !(n.data('pinned') || n.locked()));
    const bb = options.boundingBox;
    const center = bb ? { x: bb.x1 + bb.w / 2, y: bb.y1 + bb.h / 2 } : { x: cy.width() / 2, y: cy.height() / 2 };
    const maxRadius = (bb ? Math.min(bb.w, bb.h) : Math.min(cy.width(), cy.height())) * 0.4;
    
    // Use spatial partitioning for collision detection
    const gridSize = 50;
    const spatialGrid = new Map();
    
    const getGridKey = (x, y) => `${Math.floor(x/gridSize)},${Math.floor(y/gridSize)}`;
    
    const checkCollision = (pos, radius) => {
        const gridX = Math.floor(pos.x/gridSize);
        const gridY = Math.floor(pos.y/gridSize);
        
        // Check neighboring grid cells
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const key = `${gridX + dx},${gridY + dy}`;
                const cell = spatialGrid.get(key);
                if (cell) {
                    for (const existing of cell) {
                        const distance = Math.sqrt(
                            (pos.x - existing.x)**2 + (pos.y - existing.y)**2
                        );
                        if (distance < (radius + existing.radius)) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    };
    
    const addToGrid = (pos, radius) => {
        const key = getGridKey(pos.x, pos.y);
        if (!spatialGrid.has(key)) {
            spatialGrid.set(key, []);
        }
        spatialGrid.get(key).push({ x: pos.x, y: pos.y, radius });
    };
    
    // Batch processing
    const batchSize = 50;
    let nodeIndex = 0;
    
    const processBatch = (startIndex) => {
        const endIndex = Math.min(startIndex + batchSize, nodes.length);
        
        for (let i = startIndex; i < endIndex; i++) {
            if (nodeIndex >= nodes.length) break;
            
            const node = nodes[nodeIndex];
            const radius = 20 + Math.random() * 30;
            let attempts = 0;
            let position;
            
            do {
                const angle = Math.random() * 2 * Math.PI;
                const distance = Math.random() * maxRadius;
                position = {
                    x: center.x + distance * Math.cos(angle),
                    y: center.y + distance * Math.sin(angle)
                };
                attempts++;
            } while (checkCollision(position, radius) && attempts < 50);
            
            addToGrid(position, radius);
            node.position(position);
            nodeIndex++;
        }
        
        if (nodeIndex < nodes.length) {
            setTimeout(() => processBatch(nodeIndex), 0);
        } else {
        }
    };
    
    processBatch(0);
}

// Radial Recency Layout - maps recency to radius and attribute to angle
function radialRecencyLayout(options = {}) {
    const cy = this;
    const nodes = (options.eles || cy.nodes()).filter(n => !(n.data('pinned') || n.locked()));

    if (nodes.length === 0) {
        return;
    }

    const ringThickness = Math.max(10, Number(options.ringThickness) || 140);
    const minSeparation = Math.max(5, Number(options.minSeparation) || 80);
    const angleJitter = Number(options.angleJitter) || 0;
    const angleStrategy = options.angleStrategy || 'grouped';
    const innerRadius = Math.max(40, Number(options.innerRadius) || ringThickness * 0.6);

    const bb = options.boundingBox;
    const center = bb
        ? { x: bb.x1 + bb.w / 2, y: bb.y1 + bb.h / 2 }
        : { x: cy.width() / 2, y: cy.height() / 2 };

    const maxDimension = bb ? Math.min(bb.w, bb.h) : Math.min(cy.width(), cy.height());
    const maxRadius = Math.max(innerRadius + ringThickness, (maxDimension / 2) - ringThickness * 0.5);

    const resolveAngleKey = node => {
        const cluster = node.data('cluster');
        if (cluster) return cluster;
        const type = node.data('type');
        if (type) return type;
        const group = node.data('group');
        if (group) return group;
        return 'untyped';
    };

    const nodesWithMeta = nodes.map(node => {
        const ts = resolveNodeTimelineTimestamp(node);
        return {
            node,
            timestamp: Number.isFinite(ts) ? ts : -Infinity,
            angleKey: resolveAngleKey(node)
        };
    });

    nodesWithMeta.sort((a, b) => b.timestamp - a.timestamp);

    const groupCounts = nodesWithMeta.reduce((acc, entry) => {
        const key = entry.angleKey;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    const orderGroups = strategy => {
        const keys = Object.keys(groupCounts);
        switch (strategy) {
        case 'alphabetical':
            return keys.sort();
        case 'size':
        case 'grouped':
        default:
            return keys.sort((a, b) => {
                const delta = (groupCounts[b] || 0) - (groupCounts[a] || 0);
                return delta === 0 ? a.localeCompare(b) : delta;
            });
        }
    };

    const groupOrder = orderGroups(angleStrategy);

    const placeRing = (ringEntries, radius) => {
        const total = ringEntries.length;
        if (total === 0) return;

        const startAngle = -Math.PI / 2; // start at top
        let cursor = startAngle;

        groupOrder.forEach(groupKey => {
            const members = ringEntries.filter(entry => entry.angleKey === groupKey);
            if (members.length === 0) return;

            const span = (members.length / total) * Math.PI * 2;
            const step = members.length > 0 ? span / members.length : 0;

            members.forEach((entry, index) => {
                const jitterOffset = angleJitter ? (Math.random() - 0.5) * angleJitter : 0;
                const angle = cursor + step * (index + 0.5) + jitterOffset;
                const x = center.x + Math.cos(angle) * radius;
                const y = center.y + Math.sin(angle) * radius;
                entry.node.position({ x, y });
            });

            cursor += span;
        });
    };

    cy.batch(() => {
        let ringIndex = 0;
        let currentIndex = 0;
        let radius = innerRadius;

        while (currentIndex < nodesWithMeta.length) {
            const circumference = Math.max(1, 2 * Math.PI * radius);
            const capacity = Math.max(1, Math.floor(circumference / minSeparation));
            const slice = nodesWithMeta.slice(currentIndex, currentIndex + capacity);

            placeRing(slice, radius);

            currentIndex += slice.length;
            ringIndex += 1;
            radius = innerRadius + ringIndex * ringThickness;

            if (radius > maxRadius && slice.length < capacity) {
                radius = maxRadius + ringThickness * (ringIndex - Math.floor((maxRadius - innerRadius) / ringThickness));
            }
        }
    });

    return true;
}

// Optimized Weighted Force Layout - O(n log n) complexity
function weightedForceLayout(options = {}) {
    const cy = this;
    const nodes = (options.eles || cy.nodes()).filter(n => !(n.data('pinned') || n.locked()));
    const bb = options.boundingBox;
    const edges = options.eles ?
        cy.edges().filter(e => nodes.contains(e.source()) && nodes.contains(e.target())) :
        cy.edges().filter(e => nodes.contains(e.source()) && nodes.contains(e.target()));
    const iterations = options.iterations || 50; // Reduced for performance
    let temperature = options.temperature || 100;
    const coolingFactor = options.coolingFactor || 0.95;
    
    // Use Barnes-Hut approximation for O(n log n) complexity
    const barnesHutThreshold = 0.5;
    
    // QuadTree for spatial partitioning
    class QuadTree {
        constructor(bounds, maxObjects = 10, maxLevels = 4, level = 0) {
            this.bounds = bounds;
            this.maxObjects = maxObjects;
            this.maxLevels = maxLevels;
            this.level = level;
            this.objects = [];
            this.nodes = [];
        }
        
        split() {
            const subWidth = this.bounds.width / 2;
            const subHeight = this.bounds.height / 2;
            const x = this.bounds.x;
            const y = this.bounds.y;
            
            this.nodes[0] = new QuadTree({
                x: x + subWidth,
                y: y,
                width: subWidth,
                height: subHeight
            }, this.maxObjects, this.maxLevels, this.level + 1);
            
            this.nodes[1] = new QuadTree({
                x: x,
                y: y,
                width: subWidth,
                height: subHeight
            }, this.maxObjects, this.maxLevels, this.level + 1);
            
            this.nodes[2] = new QuadTree({
                x: x,
                y: y + subHeight,
                width: subWidth,
                height: subHeight
            }, this.maxObjects, this.maxLevels, this.level + 1);
            
            this.nodes[3] = new QuadTree({
                x: x + subWidth,
                y: y + subHeight,
                width: subWidth,
                height: subHeight
            }, this.maxObjects, this.maxLevels, this.level + 1);
        }
        
        getIndex(rect) {
            let index = -1;
            const verticalMidpoint = this.bounds.x + (this.bounds.width / 2);
            const horizontalMidpoint = this.bounds.y + (this.bounds.height / 2);
            
            const topQuadrant = (rect.y < horizontalMidpoint && rect.y + rect.height < horizontalMidpoint);
            const bottomQuadrant = (rect.y > horizontalMidpoint);
            
            if (rect.x < verticalMidpoint && rect.x + rect.width < verticalMidpoint) {
                if (topQuadrant) {
                    index = 1;
                } else if (bottomQuadrant) {
                    index = 2;
                }
            } else if (rect.x > verticalMidpoint) {
                if (topQuadrant) {
                    index = 0;
                } else if (bottomQuadrant) {
                    index = 3;
                }
            }
            
            return index;
        }
        
        insert(obj) {
            if (this.nodes.length) {
                const index = this.getIndex(obj);
                if (index !== -1) {
                    this.nodes[index].insert(obj);
                    return;
                }
            }
            
            this.objects.push(obj);
            
            if (this.objects.length > this.maxObjects && this.level < this.maxLevels) {
                if (!this.nodes.length) {
                    this.split();
                }
                
                let i = 0;
                while (i < this.objects.length) {
                    const index = this.getIndex(this.objects[i]);
                    if (index !== -1) {
                        this.nodes[index].insert(this.objects.splice(i, 1)[0]);
                    } else {
                        i++;
                    }
                }
            }
        }
        
        retrieve(rect) {
            const returnObjects = [];
            const index = this.getIndex(rect);
            
            if (this.nodes.length) {
                if (index !== -1) {
                    returnObjects.push(...this.nodes[index].retrieve(rect));
                } else {
                    for (let i = 0; i < this.nodes.length; i++) {
                        returnObjects.push(...this.nodes[i].retrieve(rect));
                    }
                }
            }
            
            returnObjects.push(...this.objects);
            return returnObjects;
        }
    }
    
    // Initialize random positions
    nodes.forEach(node => {
        if (!node.position().x && !node.position().y) {
            node.position({
                x: (bb ? bb.x1 : 0) + Math.random() * (bb ? bb.w : cy.width()),
                y: (bb ? bb.y1 : 0) + Math.random() * (bb ? bb.h : cy.height())
            });
        }
    });
    
    // Force simulation with Barnes-Hut optimization
    for (let iter = 0; iter < iterations; iter++) {
        const forces = {};
        
        // Initialize forces
        nodes.forEach(node => {
            forces[node.id()] = { x: 0, y: 0 };
        });
        
        // Build QuadTree for spatial partitioning
        const bounds = {
            x: bb ? bb.x1 : 0,
            y: bb ? bb.y1 : 0,
            width: bb ? bb.w : cy.width(),
            height: bb ? bb.h : cy.height()
        };
        const quadTree = new QuadTree(bounds);
        
        nodes.forEach(node => {
            const pos = node.position();
            quadTree.insert({
                x: pos.x, y: pos.y, width: 1, height: 1, node: node
            });
        });
        
        // Calculate repulsion forces using Barnes-Hut approximation
        nodes.forEach(node1 => {
            const pos1 = node1.position();
            const searchArea = {
                x: pos1.x - 200, y: pos1.y - 200, width: 400, height: 400
            };
            
            const nearby = quadTree.retrieve(searchArea);
            
            nearby.forEach(obj => {
                if (obj.node.id() === node1.id()) return;
                
                const pos2 = obj.node.position();
                const dx = pos2.x - pos1.x;
                const dy = pos2.y - pos1.y;
                const distance = Math.sqrt(dx*dx + dy*dy) || 1;
                
                if (distance < 200) { // Only consider nearby nodes
                    const repulsion = 1000 / (distance * distance);
                    const fx = (dx / distance) * repulsion;
                    const fy = (dy / distance) * repulsion;
                    
                    forces[node1.id()].x -= fx;
                    forces[node1.id()].y -= fy;
                }
            });
        });
        
        // Calculate attraction forces from edges (only for connected nodes)
        edges.forEach(edge => {
            const source = edge.source();
            const target = edge.target();
            const weight = edge.data('weight') || 1;
            
            const dx = target.position().x - source.position().x;
            const dy = target.position().y - source.position().y;
            const distance = Math.sqrt(dx*dx + dy*dy) || 1;
            
            const attraction = (distance - 100) * weight * 0.01;
            const fx = (dx / distance) * attraction;
            const fy = (dy / distance) * attraction;
            
            forces[source.id()].x += fx;
            forces[source.id()].y += fy;
            forces[target.id()].x -= fx;
            forces[target.id()].y -= fy;
        });
        
        // Apply forces
        nodes.forEach(node => {
            const force = forces[node.id()];
            const magnitude = Math.sqrt(force.x*force.x + force.y*force.y);
            
            if (magnitude > temperature) {
                force.x = (force.x / magnitude) * temperature;
                force.y = (force.y / magnitude) * temperature;
            }
            
            node.position({
                x: node.position().x + force.x,
                y: node.position().y + force.y
            });
        });
        
        // Cool down
        temperature *= coolingFactor;
    }
}

// Temporal attraction layout - groups nodes by timestamp similarity
function temporalAttractionLayout(options = {}) {
    const cy = this;
    const nodes = (options.eles || cy.nodes()).filter(n => !(n.data('pinned') || n.locked()));
    if (nodes.length === 0) {
        return;
    }

    const bb = options.boundingBox;
    const center = bb
        ? { x: bb.x1 + bb.w / 2, y: bb.y1 + bb.h / 2 }
        : { x: cy.width ? cy.width() / 2 : 0, y: cy.height ? cy.height() / 2 : 0 };

    const iterations = Number.isFinite(options.iterations) ? options.iterations : 40;
    const repulsionStrength = Number.isFinite(options.repulsionStrength) ? options.repulsionStrength : 15;
    const baseAttraction = Number.isFinite(options.baseAttraction) ? options.baseAttraction : 0.0001;
    const timeSigma = Number.isFinite(options.timeSigma) && options.timeSigma > 0
        ? options.timeSigma
        : 24 * 60 * 60 * 1000; // default to one day in ms
    const bucketSize = Number.isFinite(options.bucketSize) && options.bucketSize > 0
        ? options.bucketSize
        : 60 * 60 * 1000; // default to one hour in ms
    const timeMode = options.timeMode === 'bucket' ? 'bucket' : 'gaussian';

    const timestamps = nodes.map(node => {
        const rawTimestamp = node.data('timestamp');
        const fallbackTimestamp = rawTimestamp == null ? node.data('time') : rawTimestamp;
        if (fallbackTimestamp == null) {
            return null;
        }

        if (typeof fallbackTimestamp === 'number' && Number.isFinite(fallbackTimestamp)) {
            return fallbackTimestamp;
        }

        const parsed = Date.parse(fallbackTimestamp);
        return Number.isNaN(parsed) ? null : parsed;
    });

    const gaussianWeight = (diff) => {
        const ratio = diff / timeSigma;
        return Math.exp(-0.5 * ratio * ratio);
    };

    const clampToBounds = (pos) => {
        if (!bb) {
            return pos;
        }

        return {
            x: Math.min(Math.max(bb.x1, pos.x), bb.x1 + bb.w),
            y: Math.min(Math.max(bb.y1, pos.y), bb.y1 + bb.h)
        };
    };

    // Initialize missing positions on a small grid near the center
    nodes.forEach((node, idx) => {
        const pos = node.position();
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
            const col = idx % 5;
            const row = Math.floor(idx / 5);
            node.position({
                x: center.x + (col - 2) * 10,
                y: center.y + (row - 2) * 10
            });
        }
    });

    // Scale attraction so displacement is proportional to the current layout size
    // rather than an arbitrary per-iteration constant.
    const bbox = typeof nodes.boundingBox === 'function' ? nodes.boundingBox() : null;
    const bboxExtent = bbox ? Math.max(bbox.w || 0, bbox.h || 0) : 0;
    const fallbackSize = bb ? Math.max(bb.w || 0, bb.h || 0) : Math.max(cy.width ? cy.width() : 0, cy.height ? cy.height() : 0);
    const scaleFactor = Math.max(1, bboxExtent || fallbackSize || 1);
    const attractionScale = baseAttraction * scaleFactor;
    const maxStep = Math.max(1, scaleFactor * 0.05);
    const jitter = () => (Math.random() - 0.5) * Math.max(1, scaleFactor * 0.002);

    const timeSimilarity = (idxA, idxB) => {
        const tsA = timestamps[idxA];
        const tsB = timestamps[idxB];
        if (!Number.isFinite(tsA) || !Number.isFinite(tsB)) {
            return 0;
        }

        if (timeMode === 'bucket') {
            return Math.floor(tsA / bucketSize) === Math.floor(tsB / bucketSize) ? 1 : 0;
        }

        return gaussianWeight(Math.abs(tsA - tsB));
    };

    // Build time condensation anchors so each temporal bucket has a stable target
    // that preserves vertical separation instead of drifting toward the overall center.
    const bucketKeys = [];
    const bucketTimes = new Map();
    timestamps.forEach(ts => {
        if (!Number.isFinite(ts)) return;
        const key = timeMode === 'bucket' ? Math.floor(ts / bucketSize) : Math.round(ts / bucketSize);
        if (!bucketTimes.has(key)) {
            bucketKeys.push(key);
            bucketTimes.set(key, key * bucketSize);
        }
    });
    bucketKeys.sort((a, b) => (bucketTimes.get(a) || 0) - (bucketTimes.get(b) || 0));

    const verticalSpan = bb ? bb.h : (cy.height ? cy.height() : 0);
    const horizontalSpan = bb ? bb.w : (cy.width ? cy.width() : 0);
    const spanX = Math.max(300, horizontalSpan ? horizontalSpan * 0.8 : scaleFactor * 10);
    const verticalPadding = verticalSpan ? Math.min(160, verticalSpan * 0.15) : 80;
    const usableVertical = Math.max(120, verticalSpan ? Math.max(40, verticalSpan - verticalPadding * 2) : scaleFactor * 6);
    const stableRandom = (key) => {
        const str = String(key);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
        }
        const x = Math.sin(hash) * 10000;
        return x - Math.floor(x);
    };

    let minTime = null;
    let maxTime = null;
    bucketKeys.forEach((key) => {
        const t = bucketTimes.get(key);
        if (!Number.isFinite(t)) return;
        if (minTime === null || t < minTime) minTime = t;
        if (maxTime === null || t > maxTime) maxTime = t;
    });

    const bucketAnchors = new Map();
    bucketKeys.forEach((key) => {
        const t = bucketTimes.get(key);
        const normalized = minTime !== null && maxTime !== null && maxTime !== minTime
            ? (t - minTime) / (maxTime - minTime)
            : 0.5;
        const anchorX = center.x + (normalized - 0.5) * spanX;
        const rand = stableRandom(key);
        const anchorY = center.y - usableVertical / 2 + rand * usableVertical;
        bucketAnchors.set(key, { x: anchorX, y: anchorY });
    });

    for (let i = 0; i < iterations; i++) {
        const dispX = new Array(nodes.length).fill(0);
        const dispY = new Array(nodes.length).fill(0);

        const bucketAggregates = new Map();
        const weightedCentroids = new Array(nodes.length).fill(null);

        // Build temporal group summaries so we attract toward time peers instead of only toward
        // whichever nodes happen to be nearby already.
        if (timeMode === 'bucket') {
            nodes.forEach((node, idx) => {
                const ts = timestamps[idx];
                if (!Number.isFinite(ts)) return;
                const bucket = Math.floor(ts / bucketSize);
                const agg = bucketAggregates.get(bucket) || { sumX: 0, sumY: 0, count: 0 };
                const pos = node.position();
                agg.sumX += pos.x;
                agg.sumY += pos.y;
                agg.count += 1;
                bucketAggregates.set(bucket, agg);
            });
        } else {
            // Gaussian mode: compute a weighted centroid per node based on timestamp similarity.
            nodes.forEach((nodeA, idxA) => {
                const tsA = timestamps[idxA];
                if (!Number.isFinite(tsA)) return;

                let sumWeights = 0;
                let sumX = 0;
                let sumY = 0;

                nodes.forEach((nodeB, idxB) => {
                    const tsB = timestamps[idxB];
                    if (!Number.isFinite(tsB)) return;

                    const weight = gaussianWeight(Math.abs(tsA - tsB));
                    if (weight <= 0) return;

                    const posB = nodeB.position();
                    sumWeights += weight;
                    sumX += posB.x * weight;
                    sumY += posB.y * weight;
                });

                if (sumWeights > 0) {
                    weightedCentroids[idxA] = { x: sumX / sumWeights, y: sumY / sumWeights };
                }
            });
        }

        // Repulsive force between all node pairs (kept intentionally light) along with
        // timestamp-weighted attraction so time similarity pulls nodes together
        // regardless of their type.
        for (let a = 0; a < nodes.length; a++) {
            for (let b = a + 1; b < nodes.length; b++) {
                const posA = nodes[a].position();
                const posB = nodes[b].position();
                const dx = posB.x - posA.x;
                const dy = posB.y - posA.y;
                const dist = Math.max(1, Math.hypot(dx, dy));

                const normX = dx / dist;
                const normY = dy / dist;

                // Type-independent attraction: nodes pull toward one another when their
                // timestamps are similar, preventing divergent type clusters.
                const similarityWeight = timeSimilarity(a, b);

                const repulsiveForce = repulsionStrength / (dist * dist);
                const repulsionMultiplier = similarityWeight > 0
                    ? 1 - Math.min(0.65, similarityWeight * 0.65)
                    : 1;
                dispX[a] -= normX * repulsiveForce * repulsionMultiplier;
                dispY[a] -= normY * repulsiveForce * repulsionMultiplier;
                dispX[b] += normX * repulsiveForce * repulsionMultiplier;
                dispY[b] += normY * repulsiveForce * repulsionMultiplier;

                // If timestamps align, reduce repulsion so similarly timed nodes can meet.
                if (similarityWeight > 0) {
                    const peerMultiplier = timeMode === 'bucket'
                        ? 1 + Math.log1p((bucketAggregates.get(Math.floor(timestamps[a] / bucketSize)) || {}).count || 0)
                        : 1;
                    const attractionForce = attractionScale * Math.max(0.5, similarityWeight) * peerMultiplier;
                    dispX[a] += normX * attractionForce;
                    dispY[a] += normY * attractionForce;
                    dispX[b] -= normX * attractionForce;
                    dispY[b] -= normY * attractionForce;
                }
            }
        }

        // Timestamp-based attraction toward time-group centroids so similarly timed nodes
        // pull together even if they start far apart or belong to different types.
        nodes.forEach((node, idx) => {
            const ts = timestamps[idx];
            if (!Number.isFinite(ts)) return;

            const pos = node.position();
            let target = null;
            const bucketKey = timeMode === 'bucket' ? Math.floor(ts / bucketSize) : Math.round(ts / bucketSize);
            const anchor = bucketAnchors.get(bucketKey);

            if (timeMode === 'bucket') {
                const bucket = Math.floor(ts / bucketSize);
                const agg = bucketAggregates.get(bucket);
                if (agg && agg.count > 1) {
                    target = { x: agg.sumX / agg.count, y: agg.sumY / agg.count };
                }
            } else {
                target = weightedCentroids[idx];
            }

            if (!target && !anchor) return;

            const combinedTarget = target && anchor
                ? { x: anchor.x, y: (target.y * 0.35) + (anchor.y * 0.65) }
                : (target || anchor);

            const dx = combinedTarget.x - pos.x;
            const dy = combinedTarget.y - pos.y;
            // Pull harder when there are many peers in the same time group.
            const peerMultiplier = timeMode === 'bucket'
                ? Math.max(1, Math.log1p((bucketAggregates.get(Math.floor(ts / bucketSize)) || {}).count || 0))
                : 1;

            dispX[idx] += dx * attractionScale * peerMultiplier + jitter();
            dispY[idx] += dy * attractionScale * peerMultiplier + jitter();
        });

        // Apply displacements
        nodes.forEach((node, idx) => {
            const pos = node.position();
            let stepX = dispX[idx];
            let stepY = dispY[idx];
            const mag = Math.hypot(stepX, stepY);
            if (mag > maxStep) {
                stepX = (stepX / mag) * maxStep;
                stepY = (stepY / mag) * maxStep;
            }

            const next = clampToBounds({
                x: pos.x + stepX,
                y: pos.y + stepY
            });
            node.position(next);
        });
    }
}

// Register custom layouts with Cytoscape
function registerCustomLayouts() {
    if (!window.cytoscape) return;
    window.cytoscape('layout', 'spiral', spiralLayout);
    window.cytoscape('layout', 'hexagonal', hexagonalLayout);
    window.cytoscape('layout', 'timeline', timelineLayout);
    window.cytoscape('layout', 'timeline-scatter', timelineScatterLayout);
    window.cytoscape('layout', 'circle-packing', circlePackingLayout);
    window.cytoscape('layout', 'weighted-force', weightedForceLayout);
    window.cytoscape('layout', 'temporal-attraction', temporalAttractionLayout);
    window.cytoscape('layout', 'bulbous', bulbousLayout);
    window.cytoscape('layout', 'radial-recency', radialRecencyLayout);
}

// Export for use in other modules
window.CustomLayouts = {
    registerCustomLayouts,
    spiralLayout,
    hexagonalLayout,
    bulbousLayout,
    timelineLayout,
    timelineScatterLayout,
    fitNodesToTimeline,
    rebuildTimelineConnectors,
    circlePackingLayout,
    weightedForceLayout,
    temporalAttractionLayout,
    removeTimelineTicks,
    clearAllTimelineBaselineInfo,
    clearAllTimelineLayoutApplied,
    setTimelineBaselineInfo,
    clearTimelineBaselineInfo,
    setTimelineLayoutApplied,
    isTimelineLayoutApplied,
    getTimelineBaselineInfo,
    findSharedTimelineParentId,
    nodeParticipatesInTimeline,
    radialRecencyLayout
};
