// Utility functions for Quantickle
// Provides general utility functions, performance monitoring, and view management

window.QuantickleUtils = window.QuantickleUtils || {};

window.QuantickleUtils.generateUuid = function generateUuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    // Fallback RFC4122 v4 UUID implementation when Web Crypto is not available
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};

window.QuantickleUtils.buildImportSourceLabel = function buildImportSourceLabel({ integration, feedUrl } = {}) {
    const integrationName = (integration || '').trim() || 'external source';
    let hostName = '';

    if (feedUrl) {
        try {
            const parsed = new URL(feedUrl, window.location?.origin || undefined);
            if (parsed.hostname) {
                hostName = parsed.hostname.toUpperCase();
            }
        } catch (_) {
            // Ignore malformed URLs and fall back to integration name only
        }
    }

    if (hostName) {
        return `Imported from ${hostName} via ${integrationName}`;
    }

    return `Imported from ${integrationName}`;
};

window.QuantickleUtils.normalizeGraphIdentity = function normalizeGraphIdentity(graphData, options = {}) {
    if (!graphData || typeof graphData !== 'object') {
        return graphData;
    }

    const defaults = {
        defaultTitle: 'Untitled graph',
        defaultSource: 'Manually added'
    };
    const config = { ...defaults, ...options };

    const metadata = graphData.metadata && typeof graphData.metadata === 'object'
        ? { ...graphData.metadata }
        : {};

    const candidateIdFields = [
        graphData.id,
        metadata.id,
        metadata.graphId,
        metadata.uuid
    ];

    let resolvedId = null;
    for (const candidate of candidateIdFields) {
        if (typeof candidate === 'string' && candidate.trim()) {
            resolvedId = candidate.trim();
            break;
        }
    }
    if (!resolvedId) {
        resolvedId = window.QuantickleUtils.generateUuid();
    }

    const candidateTitleFields = [
        graphData.title,
        graphData.name,
        metadata.title,
        metadata.name,
        graphData.graphName,
        graphData.graphId,
        config.defaultTitle
    ];

    let resolvedTitle = null;
    for (const candidate of candidateTitleFields) {
        if (typeof candidate === 'string' && candidate.trim()) {
            resolvedTitle = candidate.trim();
            break;
        }
    }
    if (!resolvedTitle) {
        resolvedTitle = config.defaultTitle;
    }

    graphData.id = resolvedId;
    graphData.title = resolvedTitle;

    metadata.id = metadata.id || resolvedId;
    metadata.title = metadata.title || resolvedTitle;
    metadata.name = metadata.name || resolvedTitle;

    if (!metadata.source) {
        if (typeof config.defaultSource === 'function') {
            metadata.source = config.defaultSource();
        } else if (typeof config.defaultSource === 'string' && config.defaultSource.trim()) {
            metadata.source = config.defaultSource.trim();
        } else {
            metadata.source = defaults.defaultSource;
        }
    }

    graphData.metadata = metadata;

    // Maintain legacy properties for compatibility while encouraging new fields
    if (!graphData.graphId) {
        graphData.graphId = resolvedTitle;
    }
    if (!graphData.graphName) {
        graphData.graphName = resolvedTitle;
    }
    if (!graphData.name) {
        graphData.name = resolvedTitle;
    }

    return graphData;
};

window.QuantickleUtils.approximateTextContentSize = function(text, baseFontSize) {
    const normalizedText = typeof text === 'string' ? text.trim() : String(text || '').trim();

    let fontSize = parseFloat(baseFontSize);
    if (!Number.isFinite(fontSize) || fontSize <= 0) {
        fontSize = 14;
    }

    if (!normalizedText) {
        const minimum = Math.max(fontSize * 4, 24);
        return {
            width: minimum,
            height: Math.max(minimum * 0.6, fontSize * 1.6)
        };
    }

    const lines = normalizedText.split(/\n+/).length;
    const chars = Math.max(normalizedText.replace(/\s+/g, ' ').length, 1);
    const padding = Math.max(fontSize, 12);
    const width = chars * (fontSize * 0.55) + padding;
    const height = lines * (fontSize * 1.35) + padding;

    return {
        width: Math.max(width, fontSize * 4),
        height: Math.max(height, fontSize * 1.6)
    };
};

window.QuantickleUtils.pickFilePath = async function pickFilePath(options = {}) {
    const {
        accept,
        types,
        preferWorkspace = true,
        workspaceSubdir
    } = options;

    const workspaceManager = window.WorkspaceManager;
    const hasWorkspace = preferWorkspace && workspaceManager && workspaceManager.handle;

    const resolveWorkspacePath = async (handle, fallbackName) => {
        const fallback = typeof fallbackName === 'string' ? fallbackName.trim() : '';
        if (!handle || !workspaceManager || !workspaceManager.handle) {
            return fallback || null;
        }
        const rootHandle = workspaceManager.handle;
        if (typeof rootHandle.resolve === 'function') {
            try {
                const parts = await rootHandle.resolve(handle);
                if (Array.isArray(parts) && parts.length) {
                    return parts.join('/');
                }
            } catch (error) {
                console.debug('Unable to resolve selected file path relative to workspace', error);
            }
        }
        return fallback || null;
    };

    if (window.showOpenFilePicker) {
        try {
            let startIn;
            if (hasWorkspace && workspaceSubdir && typeof workspaceManager.getSubDirHandle === 'function') {
                try {
                    startIn = await workspaceManager.getSubDirHandle(workspaceSubdir);
                } catch (error) {
                    console.debug('Unable to resolve workspace subdir for file picker', error);
                }
            }
            if (!startIn && hasWorkspace) {
                startIn = workspaceManager.handle;
            }

            const pickerOptions = {
                multiple: false
            };
            if (Array.isArray(types) && types.length) {
                pickerOptions.types = types;
                pickerOptions.excludeAcceptAllOption = true;
            }
            if (startIn) {
                pickerOptions.startIn = startIn;
            }

            const [handle] = await window.showOpenFilePicker(pickerOptions);
            if (!handle) {
                return null;
            }
            const fallbackName = handle.name && typeof handle.name === 'string' ? handle.name : '';
            return await resolveWorkspacePath(handle, fallbackName);
        } catch (error) {
            if (error && error.name === 'AbortError') {
                return null;
            }
            console.warn('File picker failed, falling back to legacy input', error);
        }
    }

    return await new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        if (accept) {
            input.accept = accept;
        }
        input.style.display = 'none';

        const cleanup = () => {
            input.removeEventListener('change', changeHandler);
            input.removeEventListener('blur', cleanup);
            if (input.parentNode) {
                input.parentNode.removeChild(input);
            }
        };

        const changeHandler = (event) => {
            const file = event.target && event.target.files ? event.target.files[0] : null;
            const name = file && typeof file.name === 'string' ? file.name.trim() : '';
            cleanup();
            resolve(name || null);
        };

        input.addEventListener('change', changeHandler);
        input.addEventListener('blur', cleanup);
        document.body.appendChild(input);
        input.click();
    });
};

window.QuantickleUtils.pickImageFilePath = async function pickImageFilePath(options = {}) {
    const extensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
    const accept = extensions.join(',');
    const types = [{
        description: 'Images',
        accept: {
            'image/*': extensions
        }
    }];
    return await window.QuantickleUtils.pickFilePath({
        ...options,
        accept,
        types
    });
};

window.QuantickleUtils.normalizeCalloutFormat = function normalizeCalloutFormat(format, fallback = 'text') {
    const defaultFormat = typeof fallback === 'string' && fallback.trim() ? fallback.trim().toLowerCase() : 'text';
    if (typeof format !== 'string') {
        return defaultFormat;
    }
    const normalized = format.trim().toLowerCase();
    switch (normalized) {
        case 'html':
        case 'text':
        case 'markdown':
            return normalized;
        case 'md':
        case 'mkd':
            return 'markdown';
        case 'plaintext':
        case 'plain':
            return 'text';
        default:
            return defaultFormat;
    }
};

window.QuantickleUtils.normalizeCalloutPayload = function normalizeCalloutPayload(payload, options = {}) {
    const defaultFormat = window.QuantickleUtils.normalizeCalloutFormat(options.defaultFormat, 'text');
    let title = '';
    let body = '';
    let format = defaultFormat;

    if (payload && typeof payload === 'object') {
        if (typeof payload.title === 'string') {
            title = payload.title.trim();
        } else if (typeof payload.heading === 'string') {
            title = payload.heading.trim();
        }

        if (typeof payload.body === 'string') {
            body = payload.body;
        } else if (typeof payload.html === 'string') {
            body = payload.html;
            format = 'html';
        } else if (typeof payload.text === 'string') {
            body = payload.text;
        } else if (typeof payload.content === 'string' && typeof payload.type === 'string') {
            body = payload.content;
            format = payload.type.trim().toLowerCase() === 'html' ? 'html' : format;
        }

        if (typeof payload.format === 'string') {
            format = window.QuantickleUtils.normalizeCalloutFormat(payload.format, format);
        } else if (typeof payload.bodyFormat === 'string') {
            format = window.QuantickleUtils.normalizeCalloutFormat(payload.bodyFormat, format);
        }
    } else if (typeof payload === 'string') {
        body = payload;
    } else if (payload != null) {
        body = String(payload);
    }

    return {
        title: typeof title === 'string' ? title : '',
        body: typeof body === 'string' ? body : '',
        format: window.QuantickleUtils.normalizeCalloutFormat(format, defaultFormat)
    };
};

window.QuantickleUtils.calloutHasContent = function calloutHasContent(payload) {
    if (!payload || typeof payload !== 'object') {
        return false;
    }
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    const body = typeof payload.body === 'string' ? payload.body.trim() : '';
    return Boolean(title || body);
};

window.QuantickleUtils.buildBasicCalloutHtml = function buildBasicCalloutHtml(title, body) {
    const safeTitle = title == null ? '' : String(title);
    const safeBody = body == null ? '' : String(body);
    return `<div class="text-node-title">${safeTitle}</div><div class="text-node-body">${safeBody}</div>`;
};

window.QuantickleUtils.deriveCalloutFromLegacy = function deriveCalloutFromLegacy(source = {}, options = {}) {
    const defaultFormat = options.defaultFormat || 'text';
    const direct = window.QuantickleUtils.normalizeCalloutPayload(source.callout, { defaultFormat });
    if (window.QuantickleUtils.calloutHasContent(direct)) {
        return direct;
    }

    const normalizeWhitespace = (value) => {
        if (typeof value !== 'string') return '';
        return value.replace(/\s+/g, ' ').trim();
    };

    const stripHtml = (value) => normalizeWhitespace(String(value || '').replace(/<[^>]*>/g, ' '));

    const hasExplicitTitle = typeof source.calloutTitle === 'string';
    const fallbackLabel = hasExplicitTitle ? '' : (typeof source.label === 'string' ? source.label : '');
    let directTitle = hasExplicitTitle ? source.calloutTitle : fallbackLabel;
    const directBody = typeof source.calloutBody === 'string' ? source.calloutBody : undefined;
    let directFormat = source.calloutFormat || source.calloutBodyFormat;

    if (!hasExplicitTitle && typeof fallbackLabel === 'string') {
        const labelText = normalizeWhitespace(fallbackLabel);
        const infoText = normalizeWhitespace(source.info);
        const infoHtmlText = stripHtml(source.infoHtml);
        const shouldDiscardLabel = Boolean(labelText)
            && ((infoText && labelText === infoText) || (infoHtmlText && labelText === infoHtmlText));
        if (shouldDiscardLabel) {
            directTitle = '';
        }
    }

    if (typeof directBody === 'string') {
        return window.QuantickleUtils.normalizeCalloutPayload({
            title: directTitle,
            body: directBody,
            format: directFormat
        }, { defaultFormat });
    }

    const infoHtml = typeof source.infoHtml === 'string' ? source.infoHtml : '';
    if (infoHtml && infoHtml.trim()) {
        return window.QuantickleUtils.normalizeCalloutPayload({
            title: directTitle,
            body: infoHtml,
            format: 'html'
        }, { defaultFormat });
    }

    const info = typeof source.info === 'string' ? source.info : '';
    if (info && info.trim()) {
        return window.QuantickleUtils.normalizeCalloutPayload({
            title: directTitle,
            body: info,
            format: directFormat
        }, { defaultFormat });
    }

    return window.QuantickleUtils.normalizeCalloutPayload({
        title: directTitle,
        body: '',
        format: directFormat
    }, { defaultFormat });
};

window.QuantickleUtils.syncCalloutLegacyFields = function syncCalloutLegacyFields(target, payload, options = {}) {
    if (!target || typeof target !== 'object') {
        return window.QuantickleUtils.normalizeCalloutPayload(payload, options);
    }

    const defaultFormat = options.defaultFormat || 'text';
    const normalized = window.QuantickleUtils.normalizeCalloutPayload(payload, { defaultFormat });
    const format = window.QuantickleUtils.normalizeCalloutFormat(normalized.format, defaultFormat);
    const title = typeof normalized.title === 'string' ? normalized.title : '';
    const body = typeof normalized.body === 'string' ? normalized.body : '';
    const callout = { title, body, format };

    target.callout = { ...callout };

    if (options.includeDerivedFields !== false) {
        target.calloutTitle = title;
        target.calloutBody = body;
        target.calloutFormat = format;
        target.calloutBodyFormat = format;
    }

    if (options.syncTitle !== false) {
        target.label = title;
    }

    if (format === 'html') {
        if (options.overwriteInfo !== false) {
            target.info = options.preserveText ? target.info : '';
        }
        target.infoHtml = body;
    } else {
        if (options.overwriteInfo !== false) {
            target.info = body;
        }
        if (Object.prototype.hasOwnProperty.call(options, 'html')) {
            target.infoHtml = options.html;
        } else if (typeof options.htmlBuilder === 'function') {
            target.infoHtml = options.htmlBuilder(callout);
        } else if (options.clearLegacyHtml) {
            target.infoHtml = '';
        }
    }

    return callout;
};

window.QuantickleUtils.ensureNodeCallout = function ensureNodeCallout(target, options = {}) {
    if (!target || typeof target !== 'object') {
        return window.QuantickleUtils.normalizeCalloutPayload(null, options);
    }

    const defaultFormat = options.defaultFormat || 'text';
    const existing = window.QuantickleUtils.normalizeCalloutPayload(target.callout, { defaultFormat });
    let payload = existing;

    if (!window.QuantickleUtils.calloutHasContent(existing)) {
        payload = window.QuantickleUtils.deriveCalloutFromLegacy(target, { defaultFormat });
    }

    target.callout = { ...payload };

    if (options.syncLegacy) {
        const syncOptions = { defaultFormat, ...(options.syncOptions || {}) };
        window.QuantickleUtils.syncCalloutLegacyFields(target, payload, syncOptions);
    }

    return { ...payload };
};

window.globalFunctions = {
    // View management
    switchView: function(view) {
        
        // Check if DOM is ready
        if (!document.querySelector('.view-panel')) {
            console.error('View panels not found in DOM yet');
            return;
        }
        
        // Hide all view panels
        const allPanels = document.querySelectorAll('.view-panel');
        allPanels.forEach(panel => {
            panel.style.display = 'none';
            panel.classList.remove('active');
        });
        
        // Show selected view panel
        const selectedPanel = document.getElementById(view + 'View');
        if (selectedPanel) {
            selectedPanel.style.display = 'flex';
            selectedPanel.classList.add('active');
        } else {
            console.error('Selected panel not found:', view + 'View');
        }
        
        // Update active tab
        document.querySelectorAll('.view-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Find the tab that corresponds to this view
        const activeTab = document.querySelector(`.view-tab[onclick*="${view}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }
        
        // Update current view
        if (window.DataManager) {
            window.DataManager.currentView = view;
        }
        
        // Update tables if switching to table view
        if (view === 'table' && window.TableManager) {
            window.TableManager.updateTables();
        } else if (view === 'totalData' && window.TableManager) {
            window.TableManager.updateTotalDataTable();
        } else if (view === 'aiInput' && window.AIInputManager) {
            // Initialize AI input manager when switching to AI input tab
            if (!window.AIInputManager.isInitialized) {
                window.AIInputManager.init();
            }
            // Show the AI input interface in the tab
            window.AIInputManager.showInTab();
        } else if (view === 'source' && window.SourceEditor) {
            window.SourceEditor.refresh();
        }

        if (view !== 'graph' && window.GraphRenderer && typeof window.GraphRenderer.closeSearch === 'function') {
            window.GraphRenderer.closeSearch();
        }
    },

    // Table management
    switchTable: function(tableType) {
        
        // Hide all table panels
        document.querySelectorAll('.table-panel').forEach(panel => {
            panel.style.display = 'none';
        });
        
        // Hide all table content divs
        document.querySelectorAll('.table-content').forEach(content => {
            content.classList.remove('active');
        });
        
        // Show selected table content
        const selectedContent = document.getElementById(tableType + 'Table');
        if (selectedContent) {
            selectedContent.classList.add('active');
        }
        
        // Show/hide domain selection panel based on table type
        const domainPanel = document.getElementById('domainSelectionPanel');
        if (domainPanel) {
            if (tableType === 'nodeTypes') {
                domainPanel.style.display = 'block';
            } else {
                domainPanel.style.display = 'none';
            }
        }
        
        // Update active table tab
        document.querySelectorAll('.table-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Find the button that was clicked and make it active
        const activeTab = document.querySelector(`button[onclick*="${tableType}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }
        
        // Update current table
        window.DataManager.currentTable = tableType;
        
        // Update table content
        if (window.TableManager) {
            window.TableManager.updateTableContent(tableType);
            window.TableManager.updateTableStats();
        }
    },
    
    // Data table management (for totalData view)
    switchDataTable: function(tableType) {
        
        // Hide all data table content divs
        document.querySelectorAll('#totalDataView .table-content').forEach(content => {
            content.classList.remove('active');
        });
        
        // Show selected data table content
        const selectedContent = document.getElementById(tableType + 'DataTable');
        if (selectedContent) {
            selectedContent.classList.add('active');
        }
        
        // Update active data table tab
        document.querySelectorAll('#totalDataView .table-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Find the button that was clicked and make it active
        const activeTab = document.querySelector(`#totalDataView button[onclick*="${tableType}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }
        
        // Update current data table
        if (!window.DataManager.currentDataTable) {
            window.DataManager.currentDataTable = 'nodes';
        }
        window.DataManager.currentDataTable = tableType;
        
        // Update data table content
        if (window.TableManager) {
            if (tableType === 'nodes') {
                window.TableManager.updateNodesDataTable();
            } else if (tableType === 'edges') {
                window.TableManager.updateEdgesDataTable();
            }
        }
    },

    // Layout functions
    selectLayout: function(layoutName) {
        if (window.LayoutManager) {
            window.LayoutManager.selectLayout(layoutName);
        }
    },

    applyLayout: function() {
        if (window.LayoutManager) {
            window.LayoutManager.applyLayout();
        }
    },

    tileTopLevelNodes: function(options) {
        if (window.GraphRenderer && typeof window.GraphRenderer.tileTopLevelNodes === 'function') {
            window.GraphRenderer.tileTopLevelNodes(options);
        }
    },



    // Tool functions
    setTool: function(tool) {
        // Update tool button states
        document.querySelectorAll('.toolbar-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const toolBtn = document.getElementById(tool + 'Tool');
        if (toolBtn) {
            toolBtn.classList.add('active');
        }
    },

    // Data functions
    loadFromAPI: function() {
        // This would need to be implemented based on your API requirements
        this.showNotification('API loading not implemented yet', 'warning');
    },

    saveGraph: function() {
        if (window.GraphRenderer && window.GraphRenderer.cy) {
            const cy = window.GraphRenderer.cy;
            
            // Get complete node data including positions and all attributes
            const nodes = cy.nodes().map(n => ({
                data: n.data(),
                position: n.position(),
                style: n.style(),
                classes: n.classes(),
                selected: n.selected(),
                locked: n.locked(),
                grabbable: n.grabbable(),
                pannable: n.pannable(),
                selectable: n.selectable()
            }));
            
            // Get complete edge data including all attributes
            const edges = cy.edges().map(e => ({
                data: e.data(),
                style: e.style(),
                classes: e.classes(),
                selected: e.selected(),
                locked: e.locked(),
                grabbable: e.grabbable(),
                selectable: e.selectable()
            }));
            
            // Get current graph state and settings
            const graphState = {
                pan: cy.pan(),
                zoom: cy.zoom(),
                userPanningEnabled: cy.userPanningEnabled(),
                userZoomingEnabled: cy.userZoomingEnabled(),
                boxSelectionEnabled: cy.boxSelectionEnabled(),
                autoungrabify: cy.autoungrabify(),
                autolock: cy.autolock(),
                autounselectify: cy.autounselectify()
            };
            
            // Get layout information
            const layoutInfo = {
                currentLayout: window.LayoutManager ? window.LayoutManager.currentLayout : 'grid',
                layoutOptions: window.LayoutManager ? window.LayoutManager.getCurrentLayoutOptions() : {},
                layoutRunning: window.LayoutManager ? window.LayoutManager.isLayoutRunning() : false
            };
            
            // Get node type configurations
            const nodeTypeConfigs = window.NodeTypes || {};
            
            // Get graph styling information
            const graphStyles = {
                nodeStyles: cy.nodes().map(n => ({
                    id: n.id(),
                    style: n.style()
                })),
                edgeStyles: cy.edges().map(e => ({
                    id: e.id(),
                    style: e.style()
                }))
            };
            
            // Get selection state
            const selectionState = {
                selectedNodes: cy.nodes(':selected').map(n => n.id()),
                selectedEdges: cy.edges(':selected').map(e => e.id())
            };
            
            // Get viewport information
            const viewportInfo = {
                width: cy.width(),
                height: cy.height(),
                renderedBoundingBox: cy.elements().renderedBoundingBox()
            };
            
            // Compile complete graph data
            const graphData = {
                nodes: nodes,
                edges: edges,
                graphState: graphState,
                layoutInfo: layoutInfo,
                nodeTypeConfigs: nodeTypeConfigs,
                graphStyles: graphStyles,
                selectionState: selectionState,
                viewportInfo: viewportInfo,
                metadata: {
                    name: window.DataManager.currentGraphName || 'Unsaved graph',
                    created: new Date().toISOString(),
                    lastModified: new Date().toISOString(),
                    nodeCount: cy.nodes().length,
                    edgeCount: cy.edges().length,
                    version: '1.0',
                    quantickleVersion: '1.0'
                }
            };
            
            // Generate default filename (browser will handle save dialog)
            const defaultName = window.DataManager.currentGraphName && window.DataManager.currentGraphName !== 'Unsaved graph'
                ? window.DataManager.currentGraphName
                : 'my_graph';
            const filename = defaultName.endsWith('.qut') ? defaultName : defaultName + '.qut';
            
            // Create and download the file
            const dataStr = JSON.stringify(graphData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = filename; // Browser will show save dialog with this default
            link.click();
            
            // Update the current graph name
            if (window.DataManager && typeof window.DataManager.setGraphName === 'function') {
                window.DataManager.setGraphName(filename, { source: 'file' });
            } else {
                window.DataManager.currentGraphName = filename;
                window.DataManager.currentGraphFileName = filename;
                if (window.UI && window.UI.updateGraphFileName) {
                    window.UI.updateGraphFileName(window.DataManager.currentGraphName);
                }
            }
            this.showNotification(`Graph saved as ${link.download}!`, 'success');
        } else {
            this.showNotification('No graph to save!', 'warning');
        }
    },

    exportGraph: function() {
        if (window.GraphRenderer && window.GraphRenderer.cy) {
            const exportData = {
                nodes: window.GraphRenderer.cy.nodes().map(n => n.data()),
                edges: window.GraphRenderer.cy.edges().map(e => e.data())
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                type: 'application/json'
            });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'graph-export.json';
            a.click();
            URL.revokeObjectURL(url);
            
            this.showNotification('Graph exported successfully!', 'success');
        }
    },

    // Load complete graph from saved file
    loadCompleteGraph: function(graphData) {
        
        if (!window.GraphRenderer || !window.GraphRenderer.cy) {
            console.error('GraphRenderer not available');
            return false;
        }
        
        const cy = window.GraphRenderer.cy;
        const dm = window.DataManager || null;

        try {
            if (dm) dm.isLoading = true;
            // Clear existing graph
            cy.elements().remove();
            
            // Restore node type configurations
            if (graphData.nodeTypeConfigs) {
                window.NodeTypes = { ...window.NodeTypes, ...graphData.nodeTypeConfigs };
            }
            
            // Add nodes with complete data
            if (graphData.nodes && Array.isArray(graphData.nodes)) {
                graphData.nodes.forEach(nodeInfo => {
                    const node = cy.add({
                        group: 'nodes',
                        data: nodeInfo.data,
                        position: nodeInfo.position,
                        classes: nodeInfo.classes || []
                    });
                    
                    // Restore node state
                    if (nodeInfo.selected !== undefined) {
                        if (nodeInfo.selected) node.select();
                        else node.unselect();
                    }
                    
                    if (nodeInfo.locked !== undefined) {
                        node.lock(nodeInfo.locked);
                    }
                    
                    if (nodeInfo.grabbable !== undefined) {
                        node.grabify(nodeInfo.grabbable);
                    }
                    
                    if (nodeInfo.pannable !== undefined) {
                        node.pannify(nodeInfo.pannable);
                    }
                    
                    if (nodeInfo.selectable !== undefined) {
                        node.selectify(nodeInfo.selectable);
                    }
                    
                    // Restore node styles
                    if (nodeInfo.style) {
                        node.style(nodeInfo.style);
                    }
                });
            }
            
            // Add edges with complete data
            if (graphData.edges && Array.isArray(graphData.edges)) {
                graphData.edges.forEach(edgeInfo => {
                    const edge = cy.add({
                        group: 'edges',
                        data: edgeInfo.data,
                        classes: edgeInfo.classes || []
                    });
                    
                    // Restore edge state
                    if (edgeInfo.selected !== undefined) {
                        if (edgeInfo.selected) edge.select();
                        else edge.unselect();
                    }
                    
                    if (edgeInfo.locked !== undefined) {
                        edge.lock(edgeInfo.locked);
                    }
                    
                    if (edgeInfo.grabbable !== undefined) {
                        edge.grabify(edgeInfo.grabbable);
                    }
                    
                    if (edgeInfo.selectable !== undefined) {
                        edge.selectify(edgeInfo.selectable);
                    }
                    
                    // Restore edge styles
                    if (edgeInfo.style) {
                        edge.style(edgeInfo.style);
                    }
                });
            }
            
            // Restore graph state
            if (graphData.graphState) {
                const state = graphData.graphState;
                
                if (state.pan) cy.pan(state.pan);
                if (state.zoom !== undefined) cy.zoom(state.zoom);
                if (state.userPanningEnabled !== undefined) cy.userPanningEnabled(state.userPanningEnabled);
                if (state.userZoomingEnabled !== undefined) cy.userZoomingEnabled(state.userZoomingEnabled);
                if (state.boxSelectionEnabled !== undefined) cy.boxSelectionEnabled(state.boxSelectionEnabled);
                if (state.autoungrabify !== undefined) cy.autoungrabify(state.autoungrabify);
                if (state.autolock !== undefined) cy.autolock(state.autolock);
                if (state.autounselectify !== undefined) cy.autounselectify(state.autounselectify);
            }
            
            // Restore layout information
            if (graphData.layoutInfo && window.LayoutManager) {
                window.LayoutManager.currentLayout = graphData.layoutInfo.currentLayout;
                if (graphData.layoutInfo.layoutOptions) {
                    window.LayoutManager.setLayoutOptions(graphData.layoutInfo.layoutOptions);
                }
            }
            
            // Restore selection state
            if (graphData.selectionState) {
                const selection = graphData.selectionState;
                
                // Clear current selection
                cy.elements().unselect();
                
                // Restore node selection
                if (selection.selectedNodes) {
                    selection.selectedNodes.forEach(nodeId => {
                        const node = cy.getElementById(nodeId);
                        if (node.length > 0) node.select();
                    });
                }
                
                // Restore edge selection
                if (selection.selectedEdges) {
                    selection.selectedEdges.forEach(edgeId => {
                        const edge = cy.getElementById(edgeId);
                        if (edge.length > 0) edge.select();
                    });
                }
            }
            
            // Update DataManager with the loaded data
            if (graphData && window.QuantickleUtils && typeof window.QuantickleUtils.normalizeGraphIdentity === 'function') {
                window.QuantickleUtils.normalizeGraphIdentity(graphData, {
                    defaultTitle: graphData.title || graphData.metadata?.name || 'Loaded Graph',
                    defaultSource: () => graphData.metadata?.source || 'Manually added'
                });
            }

            if (dm) {
                const title = graphData.title || graphData.metadata?.name || 'Loaded Graph';
                const saveSource = graphData.metadata?.saveSource || null;
                const dataManagerData = {
                    id: graphData.id,
                    title,
                    description: graphData.metadata ? graphData.metadata.description : 'Loaded from file',
                    metadata: graphData.metadata ? { ...graphData.metadata } : undefined,
                    nodes: graphData.nodes ? graphData.nodes.map(n => n.data) : [],
                    edges: graphData.edges ? graphData.edges.map(e => e.data) : []
                };
                dm.setGraphData(dataManagerData);
                if (typeof dm.setGraphName === 'function') {
                    dm.setGraphName(title, { source: saveSource });
                } else {
                    dm.currentGraphName = title;
                    dm.currentGraphFileName = title;
                    if (window.UI && window.UI.updateGraphFileName) {
                        window.UI.updateGraphFileName(dm.currentGraphName);
                    }
                }
            } else if (window.UI && window.UI.updateGraphFileName) {
                const name = graphData.title || graphData.metadata?.name || 'Loaded Graph';
                window.UI.updateGraphFileName(name);
            }
            
            // Update tables
            if (window.TableManager) {
                window.TableManager.updateTables();
                window.TableManager.updateTotalDataTable();
            }
            
            // Fit graph to viewport if no specific pan/zoom was restored
            if (!graphData.graphState || !graphData.graphState.pan) {
                cy.fit();
                cy.center();
            }
            this.showNotification('Graph loaded successfully!', 'success');
            
            return true;

        } catch (error) {
            console.error('Error loading complete graph:', error);
            this.showNotification('Error loading graph: ' + error.message, 'error');
            return false;
        } finally {
            if (dm) dm.isLoading = false;
        }
    },

    clearGraph: function() {
        if (confirm('Are you sure you want to clear the entire graph?')) {
            if (window.GraphRenderer && window.GraphRenderer.cy) {
                window.GraphRenderer.cy.elements().remove();
                window.DataManager.graphData = { nodes: [], edges: [] };
                this.showNotification('Graph cleared successfully!', 'success');
            }
        }
    },

    // Load complete graph with all attributes and state
    loadCompleteGraph: function(graphData) {
        // Call the loadCompleteGraph function from the utils object
        return window.globalFunctions.loadCompleteGraph(graphData);
    },

    // Node appearance management
    updateTypeAppearance: function(nodeType, property, value) {
        
        if (!window.QuantickleConfig.nodeAppearanceSettings[nodeType]) {
            window.QuantickleConfig.nodeAppearanceSettings[nodeType] = {};
        }
        
        window.QuantickleConfig.nodeAppearanceSettings[nodeType][property] = value;
        
        // Update nodes of this type in the graph
        if (window.GraphRenderer && window.GraphRenderer.cy) {
            const nodesOfType = window.GraphRenderer.cy.nodes(`[type = "${nodeType}"]`);
            
            nodesOfType.forEach(node => {
                const style = {};
                
                if (property === 'size') {
                    style.width = value + 'px';
                    style.height = value + 'px';
                } else if (property === 'color') {
                    style['background-color'] = value;
                } else if (property === 'shape') {
                    style.shape = value;
                } else if (property === 'icon') {
                    if (value && window.IconConfigs[value]) {
                        style['background-image'] = window.IconConfigs[value];
                        style['background-width'] = '60%';
                        style['background-height'] = '60%';
                    } else {
                        // Use 'none' instead of an empty string to avoid Cytoscape style errors
                        style['background-image'] = 'none';
                    }
                }
                
                node.style(style);
            });
        }
    },

    // Node Appearance Manager for instant updates
    NodeAppearanceManager: {
        // Update node type
        updateNodeType: function(nodeType) {
            // This would typically update the current node type for new nodes
            if (window.QuantickleConfig) {
                window.QuantickleConfig.defaultNodeType = nodeType;
            }
        },

        // Update node size for selected nodes or default
        updateNodeSize: function(size) {

            if (window.GraphAreaEditor && window.GraphAreaEditor.getSettings) {
                const settings = window.GraphAreaEditor.getSettings();
                if (settings.snapToGrid) {
                    const grid = settings.gridSize || 1;
                    size = Math.round(size / grid) * grid;
                }
            }

            if (window.GraphRenderer && window.GraphRenderer.cy) {
                const selected = window.GraphRenderer.cy.nodes(':selected');
                if (selected.length > 0) {
                    // Update selected nodes
                    selected.forEach(node => {
                        node.data('size', size);
                        node.style({
                            'width': size,
                            'height': size
                        });
                    });
                } else {
                    // Update default size for new nodes
                    if (window.QuantickleConfig) {
                        window.QuantickleConfig.defaultNodeSize = size;
                    }
                }
            }
        },

        // Update node color for selected nodes or default
        updateNodeColor: function(color) {
            if (window.GraphRenderer && window.GraphRenderer.cy) {
                const selected = window.GraphRenderer.cy.nodes(':selected');
                if (selected.length > 0) {
                    // Update selected nodes
                    selected.forEach(node => {
                        node.data('color', color);
                        node.style('background-color', color);
                    });
                } else {
                    // Update default color for new nodes
                    if (window.QuantickleConfig) {
                        window.QuantickleConfig.defaultNodeColor = color;
                    }
                }
            }
        },

        // Update node shape for selected nodes or default
        updateNodeShape: function(shape) {
            if (window.GraphRenderer && window.GraphRenderer.cy) {
                const selected = window.GraphRenderer.cy.nodes(':selected');
                if (selected.length > 0) {
                    // Update selected nodes
                    selected.forEach(node => {
                        node.data('shape', shape);
                        node.style('shape', shape);
                    });
                } else {
                    // Update default shape for new nodes
                    if (window.QuantickleConfig) {
                        window.QuantickleConfig.defaultNodeShape = shape;
                    }
                }
            }
        },

        // Update node icon for selected nodes or default
        updateNodeIcon: function(icon) {
            if (window.GraphRenderer && window.GraphRenderer.cy) {
                const selected = window.GraphRenderer.cy.nodes(':selected');
                if (selected.length > 0) {
                    // Update selected nodes
                    selected.forEach(node => {
                        node.data('icon', icon);
                        node.style('background-image', icon || 'none');
                    });
                } else {
                    // Update default icon for new nodes
                    if (window.QuantickleConfig) {
                        window.QuantickleConfig.defaultNodeIcon = icon;
                    }
                }
            }
        },

        // Show the node appearance manager UI
        showManager: function() {
            if (window.UI && window.UI.showNotification) {
                window.UI.showNotification('Node Appearance Manager - Use the Graph Area Editor for node styling', 'info');
            }
            // Switch to Graph Editor view for node styling
            if (typeof switchView === 'function') {
                switchView('graphEditor');
            }
        }
    },

    // Expose NodeAppearanceManager globally
    exposeNodeAppearanceManager: function() {
        window.NodeAppearanceManager = this.NodeAppearanceManager;
    },

    // Data Analyzer for graph analysis
    DataAnalyzer: {
        // Analyze the current graph
        analyzeGraph: function() {
            
            if (!window.GraphRenderer || !window.GraphRenderer.cy) {
                if (window.UI && window.UI.showNotification) {
                    window.UI.showNotification('No graph loaded for analysis', 'warning');
                }
                return;
            }

            const cy = window.GraphRenderer.cy;
            const nodes = cy.nodes();
            const edges = cy.edges();
            
            // Basic graph statistics
            const stats = {
                nodeCount: nodes.length,
                edgeCount: edges.length,
                nodeTypes: {},
                edgeTypes: {},
                averageDegree: edges.length > 0 ? (edges.length * 2) / nodes.length : 0,
                density: nodes.length > 1 ? edges.length / (nodes.length * (nodes.length - 1)) : 0
            };

            // Count node types
            nodes.forEach(node => {
                const type = node.data('type') || 'default';
                stats.nodeTypes[type] = (stats.nodeTypes[type] || 0) + 1;
            });

            // Count edge types
            edges.forEach(edge => {
                const type = edge.data('type') || 'default';
                stats.edgeTypes[type] = (stats.edgeTypes[type] || 0) + 1;
            });

            // Display results
            const message = `Graph Analysis:\n` +
                `Nodes: ${stats.nodeCount}\n` +
                `Edges: ${stats.edgeCount}\n` +
                `Average Degree: ${stats.averageDegree.toFixed(2)}\n` +
                `Density: ${stats.density.toFixed(4)}\n` +
                `Node Types: ${Object.keys(stats.nodeTypes).length}\n` +
                `Edge Types: ${Object.keys(stats.edgeTypes).length}`;
            
            if (window.UI && window.UI.showNotification) {
                window.UI.showNotification('Graph analysis complete - check console for details', 'success');
            }
            
            alert(message);
        }
    },

    // Expose DataAnalyzer globally
    exposeDataAnalyzer: function() {
        window.DataAnalyzer = this.DataAnalyzer;
    },

    applyNodeAppearance: function() {
        // This would apply the current node appearance settings
        this.showNotification('Node appearance applied!', 'success');
    },

    resetNodeAppearance: function() {
        window.QuantickleConfig.nodeAppearanceSettings = {};
        if (window.GraphRenderer) {
            window.GraphRenderer.renderGraph();
        }
        this.showNotification('Node appearance reset to default!', 'success');
    },

    // Node focus functions
    focusNodesOfType: function(nodeType) {
        
        if (window.GraphRenderer && window.GraphRenderer.cy) {
            const nodesOfType = window.GraphRenderer.cy.nodes(`[type = "${nodeType}"]`);
            
            if (nodesOfType.length > 0) {
                window.GraphRenderer.cy.elements().unselect();
                nodesOfType.select();
                window.GraphRenderer.cy.fit(nodesOfType);
            }
        }
    },

    selectNodeInGraph: function(nodeId) {
        
        // Switch to graph view if not already there
        if (window.DataManager && window.DataManager.currentView !== 'graph') {
            window.globalFunctions.switchView('graph');
        }
        
        if (window.GraphRenderer && window.GraphRenderer.cy) {
            const node = window.GraphRenderer.cy.getElementById(nodeId);
            if (node.length > 0) {
                window.GraphRenderer.cy.elements().unselect();
                node.select();
                window.GraphRenderer.cy.center(node);
                window.GraphRenderer.cy.zoom(2);
            }
        }
    },

    focusNode: function(nodeId) {
        
        // Switch to graph view if not already there
        if (window.DataManager && window.DataManager.currentView !== 'graph') {
            window.globalFunctions.switchView('graph');
        }
        
        if (window.GraphRenderer && window.GraphRenderer.cy) {
            const node = window.GraphRenderer.cy.getElementById(nodeId);
            if (node.length > 0) {
                window.GraphRenderer.cy.elements().unselect();
                node.select();
                window.GraphRenderer.cy.fit(node);
                window.GraphRenderer.cy.center(node);
            }
        }
    },

    focusEdge: function(edgeId) {
        
        if (window.GraphRenderer && window.GraphRenderer.cy) {
            const edge = window.GraphRenderer.cy.getElementById(edgeId);
            if (edge.length > 0) {
                window.GraphRenderer.cy.elements().unselect();
                edge.select();
                window.GraphRenderer.cy.fit(edge);
            }
        }
    },

    showPath: function(sourceId, targetId) {
        
        // Switch to graph view if not already there
        if (window.DataManager && window.DataManager.currentView !== 'graph') {
            window.globalFunctions.switchView('graph');
        }
        
        if (window.GraphRenderer && window.GraphRenderer.cy) {
            const source = window.GraphRenderer.cy.getElementById(sourceId);
            const target = window.GraphRenderer.cy.getElementById(targetId);
            
            if (source.length > 0 && target.length > 0) {
                window.GraphRenderer.cy.elements().unselect();
                source.select();
                target.select();
                
                // Highlight path if possible
                try {
                    const path = window.GraphRenderer.cy.elements().dijkstra({
                        root: source,
                        directed: false
                    }).pathTo(target);
                    
                    if (path && path.length > 0) {
                        path.select();
                        window.GraphRenderer.cy.fit(path);
                    }
                } catch (error) {
                }
            }
        }
    },

    // Performance monitoring
    startPerformanceMonitor: function() {
        this.performanceStartTime = performance.now();
    },

    stopPerformanceMonitor: function() {
        if (this.performanceStartTime) {
            const duration = performance.now() - this.performanceStartTime;
            this.performanceStartTime = null;
        }
    },

    updatePerformanceIndicator: function(metric, value) {
        if (metric === 'renderTime') {
            const renderTimeElement = document.getElementById('renderTime');
            if (renderTimeElement) {
                renderTimeElement.textContent = value;
            }
        } else if (metric === 'FPS') {
            const fpsElement = document.getElementById('fps');
            if (fpsElement) {
                fpsElement.textContent = value;
            }
        }
    },

    // Color utilities
    normalizeColor: function(color) {
        if (!color) return '#000000';
        if (color.startsWith('#')) {
            if (color.length === 7) return color;
            if (color.length === 9) return `#${color.slice(1,7)}`;
            if (color.length === 4) {
                return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
            }
        }
        const match = color.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (match) {
            const r = Number(match[1]).toString(16).padStart(2, '0');
            const g = Number(match[2]).toString(16).padStart(2, '0');
            const b = Number(match[3]).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
        }
        return '#000000';
    },

    // Loading management
    showLoading: function(show) {
        const loadingElement = document.getElementById('loadingIndicator');
        if (loadingElement) {
            loadingElement.style.display = show ? 'block' : 'none';
        }
    },

    // Notification system
    showNotification: function(message, type = 'info') {
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 20px;
            background: ${type === 'success' ? '#4CAF50' : type === 'warning' ? '#ff9800' : type === 'error' ? '#f44336' : '#2196F3'};
            color: white;
            border-radius: 4px;
            z-index: 1000;
            font-family: Arial, sans-serif;
        `;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }
};

// Make all global functions available globally
Object.keys(window.globalFunctions).forEach(function(key) {
    window[key] = window.globalFunctions[key];
});

// Performance monitoring utilities
window.PerformanceMonitor = {
    renderTime: 0,
    fps: 60,
    
    start: function() {
        this.startTime = performance.now();
    },
    
    stop: function() {
        if (this.startTime) {
            this.renderTime = performance.now() - this.startTime;
        }
    },
    
    updateFPS: function() {
        // FPS calculation logic
        this.fps = Math.round(1000 / this.renderTime);
    }
}; 
