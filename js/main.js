// Main initialization for Quantickle
// Sets up all modules and handles the DOMContentLoaded event

(() => {
    if (!window.DomainLoader) {
        const currentScript = document.currentScript;
        console.error('[Quantickle] DomainLoader missing before main.js bootstrap.', {
            currentScript: currentScript?.src || 'unknown',
            location: window.location.href
        });
    }
})();

const buildDependencies = (options = {}) => {
    const graphRenderer = options.graphRenderer ?? window.GraphRenderer;
    const ui = options.ui ?? window.UI;
    const dependencies = {
        cytoscape: graphRenderer.cy,
        notifications: {
            show: (message, type = 'info') => {
                ui.showNotification(message, type);
            }
        }
    };

    if (options.includeSupportsShadowStyles) {
        dependencies.supportsShadowStyles = graphRenderer.supportsShadowStyles;
    }

    if (options.includeKeyboardManager) {
        dependencies.keyboardManager = {
            disable: () => {
                graphRenderer.disableDeleteKeyHandler();
            },
            enable: () => {
                graphRenderer.enableDeleteKeyHandler();
            }
        };
    }

    if (options.includePapaParse) {
        dependencies.papaParseLib = window.Papa;
    }

    return dependencies;
};

window.QuantickleApp = {
    bootstrap: async function() {
        await window.WorkspaceManager.ready;
        this.ensureDomPurifyLoaded();
        if (!window.DomainLoader || typeof window.DomainLoader.init !== 'function') {
            const message = '[Quantickle] DomainLoader is missing. Ensure js/domain-loader.js loads before main.js.';
            console.error(message, {
                location: window.location.href
            });
            if (window.UI && typeof window.UI.showNotification === 'function') {
                window.UI.showNotification('Domain loader failed to load. Please refresh or check server configuration.', 'error');
            }
            throw new Error(message);
        }
        await window.DomainLoader.init();

        this.initializeCoreDependencies();

        this.initializeManagers();

        this.setupEventListeners();

        this.initializeFeatures();

        await this.initializeExtensions();

        window.CustomLayouts.registerCustomLayouts();

        this.setupCustomDropdown();
    },

    initializeCoreDependencies: function() {
        const graphRenderer = window.GraphRenderer;
        const dataManagerAdapter = window.DataManagerAdapter;

        dataManagerAdapter.init();
        graphRenderer.initializeCytoscape();
    },

    ensureDomPurifyLoaded: function() {
        if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
            return;
        }
        const message = '[Quantickle] DOMPurify is required for sanitized HTML tooltips. Ensure it is loaded before main.js.';
        console.error(message, {
            location: window.location.href
        });
        if (window.UI && typeof window.UI.showNotification === 'function') {
            window.UI.showNotification('Security sanitizer failed to load. Please refresh or check server configuration.', 'error');
        }
        throw new Error(message);
    },

    // Initialize the application
    init: async function() {
        await this.bootstrap();
    },

    // Set up menu bar event handlers
    setupMenuBarHandlers: function() {
        // File menu handlers are already inline in HTML
        // Edit menu handlers are already inline in HTML
        // View menu handlers are already inline in HTML
        // Layout menu handlers are already inline in HTML
        // Tools menu handlers are already inline in HTML
        // Help menu handlers are already inline in HTML
    },

    // Initialize all managers
    initializeManagers: function() {
        const graphRenderer = window.GraphRenderer;
        const ui = window.UI;
        const tableManager = window.TableManager;
        const layoutManager = window.LayoutManager;
        const integrationsManager = window.IntegrationsManager;

        // Phase 1: core
        tableManager.init();
        layoutManager.init();
        integrationsManager.init();
        window.globalFunctions.exposeNodeAppearanceManager();
        window.globalFunctions.exposeDataAnalyzer();

        // Phase 2: managers
        const graphAreaEditorModule = window.GraphAreaEditorModule;
        const graphAreaDependencies = buildDependencies({ graphRenderer, ui });
        window.GraphAreaEditor = new graphAreaEditorModule(graphAreaDependencies);

        const aiInputManager = window.AIInputManager;
        aiInputManager.init();
        aiInputManager.exposeGlobally();

        const nodeEditorModule = window.NodeEditorModule;
        const nodeEditorDependencies = buildDependencies({
            graphRenderer,
            ui,
            includeSupportsShadowStyles: true,
            includeKeyboardManager: true
        });
        window.NodeEditor = new nodeEditorModule(nodeEditorDependencies);
        nodeEditorModule.hideEditor = () => window.NodeEditor.hideEditor();

        const edgeEditor = window.EdgeEditor;
        edgeEditor.init();
        
        const contextMenuModule = window.ContextMenuModule;
        const dependencies = {
            ...buildDependencies({ graphRenderer, ui }),
            graphOperations: {
                addNodeAtPosition: (x, y) => {
                    graphRenderer.addNodeAtPosition(x, y);
                },
                addCalloutAtPosition: (x, y, title, body) => {
                    if (graphRenderer.editingMode === false) {
                        return { success: false, error: 'Graph editing is currently disabled.' };
                    }

                    const node = graphRenderer.addNode(
                        x,
                        y,
                        title,
                        'text',
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        body
                    );
                    node.data('backgroundColor', '#ffffff');
                    return { success: Boolean(node) };
                },
                createGraphLinkNodeAtPosition: async (x, y) => {
                    if (graphRenderer.editingMode === false) {
                        return { success: false, error: 'Graph editing is currently disabled.' };
                    }

                    const nodeTypeDefaults = window.NodeTypes.graph
                        || window.NodeTypes.default
                        || {};

                    const color = typeof nodeTypeDefaults.color === 'string'
                        ? nodeTypeDefaults.color
                        : '#ede9fe';
                    const size = Number.isFinite(nodeTypeDefaults.size)
                        ? nodeTypeDefaults.size
                        : 110;
                    const shape = typeof nodeTypeDefaults.shape === 'string'
                        ? nodeTypeDefaults.shape
                        : 'round-rectangle';
                    const fallbackGraphIcon = '/assets/domains/symbols/graph.png';
                    const icon = typeof nodeTypeDefaults.icon === 'string'
                        ? (nodeTypeDefaults.icon.trim() || fallbackGraphIcon)
                        : fallbackGraphIcon;
                    const labelColor = typeof nodeTypeDefaults.labelColor === 'string'
                        ? nodeTypeDefaults.labelColor
                        : (typeof nodeTypeDefaults.fontColor === 'string' ? nodeTypeDefaults.fontColor : '#312e81');

                    const node = graphRenderer.addNode(
                        x,
                        y,
                        'Linked graph',
                        'graph',
                        color,
                        size,
                        icon || null,
                        shape,
                        labelColor || null,
                        ''
                    );

                    const cy = graphRenderer.cy;
                    cy.batch(() => {
                        cy.elements(':selected').unselect();
                        node.select();
                    });

                    window.NodeEditor.showEditor(node);

                    setTimeout(() => {
                        try {
                            window.NodeEditor.openGraphLinkPicker('');
                        } catch (error) {
                            console.error('Failed to open graph link picker', error);
                        }
                    }, 120);

                    return { success: true, node };
                },
                copyNodes: (nodes) => {
                    graphRenderer.copySelectedNodes();
                },
                arrangeContainerNodes: (container) => {
                    let target = typeof container === 'string'
                        ? graphRenderer.cy.getElementById(container)
                        : container;
                    if (!target) return;
                    // If passed a collection ensure it's not empty
                    if (typeof target.length === 'number' && target.length === 0) {
                        return;
                    }
                    graphRenderer.arrangeContainerNodes(target);
                },
                explodeGraphNode: async (nodeId, reference, options = {}) => {
                    return graphRenderer.loadGraphReferenceIntoNode(nodeId, reference, options);
                },
                groupNode: (nodeId, containerId) => {
                    const node = graphRenderer.cy.getElementById(nodeId);
                    const container = graphRenderer.cy.getElementById(containerId);
                    if (node && container) {
                        const previousParent = node.parent();
                        const center = { ...container.position() };
                        const width = container.data('width');
                        const height = container.data('height');

                        node.move({ parent: container.id() });

                        container.position(center);
                        container.data({ width, height });

                        if (previousParent && previousParent.length) {
                            const pCenter = { ...previousParent.position() };
                            const pWidth = previousParent.data('width');
                            const pHeight = previousParent.data('height');

                            previousParent.position(pCenter);
                            previousParent.data({ width: pWidth, height: pHeight });

                            if (previousParent.children().length === 0) {
                                previousParent.remove();
                            }
                        }
                    }
                },
                ungroupNode: (nodeId) => {
                    const node = graphRenderer.cy.getElementById(nodeId);
                    if (node) {
                        const parent = node.parent();
                        if (parent && parent.length) {
                            const grandParent = parent.parent();
                            const center = { ...parent.position() };
                            const width = parent.data('width');
                            const height = parent.data('height');

                            node.move({ parent: grandParent && grandParent.length ? grandParent.id() : null });

                            parent.position(center);
                            parent.data({ width, height });

                            if (parent.children().length === 0) {
                                parent.remove();
                            }
                        }
                    }
                },
                removeContainer: (containerId) => {
                    const container = graphRenderer.cy.getElementById(containerId);
                    if (container) {
                        const parent = container.parent();
                        const targetParent = parent && parent.length ? parent.id() : null;
                        const parentCenter = parent && parent.length ? { ...parent.position() } : null;
                        const parentWidth = parent && parent.length ? parseFloat(parent.data('width')) : undefined;
                        const parentHeight = parent && parent.length ? parseFloat(parent.data('height')) : undefined;

                        container.children().forEach(child => child.move({ parent: targetParent }));
                        container.remove();

                        if (parent && parent.length) {
                            if (parentCenter) {
                                parent.position(parentCenter);
                            }

                            const dimensionUpdate = {};
                            if (Number.isFinite(parentWidth)) {
                                dimensionUpdate.width = parentWidth;
                            }
                            if (Number.isFinite(parentHeight)) {
                                dimensionUpdate.height = parentHeight;
                            }

                            if (Object.keys(dimensionUpdate).length > 0) {
                                parent.data(dimensionUpdate);
                            }
                        }
                    }
                }
            },
            dataManager: {
                loadSampleData: () => {
                    window.QuantickleApp.loadSampleData();
                },
                loadCSV: () => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.csv';
                    input.onchange = (e) => {
                        const file = e.target.files[0];
                        const fileManager = window.FileManager;
                        if (file) {
                            fileManager.loadCSVFile(file);
                        }
                    };
                    input.click();
                },
                loadAPI: () => {
                    const api = window.API;
                    api.showLoadDialog();
                }
            },
            nodeEditor: {
                showEditor: (node) => {
                    window.NodeEditor.showEditor(node);
                }
            },
            layoutManager: {
                selectLayout: (layout) => {
                    layoutManager.selectLayout(layout);
                },
                applyLayout: () => {
                    layoutManager.applyLayout();
                },
                getAvailableLayouts: () => {
                    return layoutManager.getAvailableLayouts();
                }
            }
        };

        window.ContextMenu = new contextMenuModule(dependencies);
        
        const fileManagerModule = window.FileManagerModule;
        const fileManagerDependencies = buildDependencies({
            graphRenderer,
            ui,
            includePapaParse: true
        });
        window.FileManager = new fileManagerModule(fileManagerDependencies);
        
    },

    // Initialize features and adapters
    initializeFeatures: function() {
        const graphRenderer = window.GraphRenderer;
        const ui = window.UI;

        window.DebugTools.init();
        window.PerformanceManagerModuleBootstrap.init();

        const dependencies = buildDependencies({
            graphRenderer,
            ui,
            includeSupportsShadowStyles: true
        });
        window.initGraphStylingModule(dependencies);
        window.GraphControlsModuleBootstrap.init();
        window.SelectionManagerAdapter.init();
        window.GraphEditorAdapter.init();
        window.EdgeCreatorAdapter.init();
        window.LODManagerAdapter.init();
        window.ProgressManagerAdapter.init();
        window.Rotation3DModuleBootstrap.init();
    },

    // Set up event listeners
    setupEventListeners: function() {
        // Set up menu bar event handlers
        this.setupMenuBarHandlers();


        // Node appearance controls - apply instantly
        const nodeTypeSelect = document.getElementById('nodeTypeSelect');
        if (nodeTypeSelect) {
            nodeTypeSelect.addEventListener('change', function() {
                window.NodeAppearanceManager.updateNodeType(this.value);
            });
        }

        const nodeSizeSlider = document.getElementById('nodeSizeSlider');
        if (nodeSizeSlider) {
            nodeSizeSlider.addEventListener('input', function() {
                const sizeValue = document.getElementById('nodeSizeValue');
                if (sizeValue) {
                    sizeValue.textContent = this.value;
                }
                window.NodeAppearanceManager.updateNodeSize(parseInt(this.value));
            });
        }

        const nodeColorPicker = document.getElementById('nodeColorPicker');
        if (nodeColorPicker) {
            nodeColorPicker.addEventListener('change', function() {
                window.NodeAppearanceManager.updateNodeColor(this.value);
            });
        }

        const nodeShapeSelect = document.getElementById('nodeShapeSelect');
        if (nodeShapeSelect) {
            nodeShapeSelect.addEventListener('change', function() {
                window.NodeAppearanceManager.updateNodeShape(this.value);
            });
        }

        const nodeIconSelect = document.getElementById('nodeIconSelect');
        if (nodeIconSelect) {
            nodeIconSelect.addEventListener('change', function() {
                window.NodeAppearanceManager.updateNodeIcon(this.value);
            });
        }

        // Performance controls - apply instantly
        const nodeLimitSlider = document.getElementById('nodeLimit');
        if (nodeLimitSlider) {
            nodeLimitSlider.addEventListener('input', function() {
                const nodeLimitValue = document.getElementById('nodeLimitValue');
                if (nodeLimitValue) {
                    nodeLimitValue.textContent = parseInt(this.value).toLocaleString();
                }
                window.GraphRenderer.updateNodeLimit(parseInt(this.value));
            });
        }

        const enableClusteringCheckbox = document.getElementById('enableClustering');
        if (enableClusteringCheckbox) {
            enableClusteringCheckbox.addEventListener('change', function() {
                window.GraphRenderer.toggleClustering(this.checked);
            });
        }

        // Graph Area Editor moved to tab - no longer needs button event listener

        // Graph control buttons
        const fitGraphBtn = document.getElementById('fitGraphBtn');
        if (fitGraphBtn) {
            fitGraphBtn.addEventListener('click', function() {
                const bootstrap = window.GraphControlsModuleBootstrap;
                if (!bootstrap.moduleInstance) {
                    bootstrap.init();
                }
                bootstrap.moduleInstance.fitGraph();
            });
        }

        const centerGraphBtn = document.getElementById('centerGraphBtn');
        if (centerGraphBtn) {
            centerGraphBtn.addEventListener('click', function() {
                const bootstrap = window.GraphControlsModuleBootstrap;
                if (!bootstrap.moduleInstance) {
                    bootstrap.init();
                }
                bootstrap.moduleInstance.centerGraph();
            });
        }

        const clearSelectionBtn = document.getElementById('clearSelectionBtn');
        if (clearSelectionBtn) {
            clearSelectionBtn.addEventListener('click', function() {
                window.QuantickleApp.clearSelection();
            });
        }

        const zoomInBtn = document.getElementById('zoomInBtn');
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', function() {
                const bootstrap = window.GraphControlsModuleBootstrap;
                if (!bootstrap.moduleInstance) {
                    bootstrap.init();
                }
                bootstrap.moduleInstance.zoomIn();
            });
        }

        const zoomOutBtn = document.getElementById('zoomOutBtn');
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', function() {
                const bootstrap = window.GraphControlsModuleBootstrap;
                if (!bootstrap.moduleInstance) {
                    bootstrap.init();
                }
                bootstrap.moduleInstance.zoomOut();
            });
        }

        // Manual editing controls
        const toggleEditingBtn = document.getElementById('toggleEditingBtn');
        if (toggleEditingBtn) {
            toggleEditingBtn.addEventListener('click', function() {
                const isEditing = window.GraphRenderer.toggleEditingMode();
                this.textContent = isEditing ? '✏️ Edit Mode ON' : '✏️ Toggle Edit Mode';
            });
        }

        const addNodeBtn = document.getElementById('addNodeBtn');
        if (addNodeBtn) {
            addNodeBtn.addEventListener('click', function() {
                if (window.GraphRenderer.editingMode) {
                    // Prompt for node position and details
                    const x = prompt('Enter X coordinate (or press OK for center):', '');
                    const y = prompt('Enter Y coordinate (or press OK for center):', '');
                    const label = prompt('Enter node label:', 'New Node');
                    const type = prompt('Enter node type:', 'default');
                    
                    if (label && type) {
                        const centerX = window.GraphRenderer.cy ? window.GraphRenderer.cy.width() / 2 : 400;
                        const centerY = window.GraphRenderer.cy ? window.GraphRenderer.cy.height() / 2 : 300;
                        
                        const posX = x ? parseFloat(x) : centerX;
                        const posY = y ? parseFloat(y) : centerY;
                        
                        window.GraphRenderer.addNode(posX, posY, label, type);
                    }
                } else {
                    window.UI.showNotification('Enable edit mode first', 'warning');
                }
            });
        }

        const copyNodesBtn = document.getElementById('copyNodesBtn');
        if (copyNodesBtn) {
            copyNodesBtn.addEventListener('click', function() {
                window.GraphRenderer.copySelectedNodes();
            });
        }

        const pasteNodesBtn = document.getElementById('pasteNodesBtn');
        if (pasteNodesBtn) {
            pasteNodesBtn.addEventListener('click', function() {
                window.GraphRenderer.pasteNodes();
            });
        }

        const deleteElementsBtn = document.getElementById('deleteElementsBtn');
        if (deleteElementsBtn) {
            deleteElementsBtn.addEventListener('click', function() {
                window.GraphRenderer.deleteSelectedElements();
            });
        }







        // Table search
        const tableSearch = document.getElementById('tableSearch');
        if (tableSearch) {
            tableSearch.addEventListener('input', function() {
                window.TableManager.updateTableContent(window.DataManager.currentTable);
            });
        }

        // Total data search
        const totalDataSearch = document.getElementById('totalDataSearch');
        if (totalDataSearch) {
            totalDataSearch.addEventListener('input', function() {
                window.TableManager.updateTotalDataTable();
            });
        }

        // Node limit slider (removed from sidebar, keeping for potential future use)
        // const nodeLimit = document.getElementById('nodeLimit');
        // if (nodeLimit) {
        //     nodeLimit.addEventListener('input', function() {
        //         const nodeLimitValue = document.getElementById('nodeLimitValue');
        //         if (nodeLimitValue) {
        //             nodeLimitValue.textContent = parseInt(this.value).toLocaleString();
        //         }
        //     });
        // }

        // Performance monitoring disabled
        // setInterval(function() {
        //     if (window.globalFunctions) {
        //         window.globalFunctions.updatePerformanceIndicator('FPS', '60');
        //     }
        // }, 1000);

        // Keyboard shortcuts
        document.addEventListener('keydown', function(evt) {
            const target = evt.target;
            const shouldSkipShortcuts = (element) => {
                if (!element) return false;
                if (element.isContentEditable) return true;

                const tag = element.tagName;
                if (!tag) return false;

                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') {
                    return true;
                }

                if (element.closest('[contenteditable="true"]')) {
                    return true;
                }

                if (element.closest('button, [role="button"], [role="textbox"]')) {
                    return true;
                }

                return false;
            };

            const menuAPI = window.ContextMenuAdapter || window.ContextMenu;
            const editingActive = shouldSkipShortcuts(target);

            // Escape to clear selection
            if (evt.key === 'Escape') {
                window.QuantickleApp.clearSelection();
                return;
            }

            // Ctrl/Cmd + A should select all nodes when not editing text
            const isSelectAllShortcut =
                (evt.key === 'a' || evt.key === 'A') && (evt.ctrlKey || evt.metaKey);
            if (isSelectAllShortcut && !editingActive) {
                evt.preventDefault();

                menuAPI.selectAll();
                return;
            }

            const isFindShortcut =
                (evt.key === 'f' || evt.key === 'F') && (evt.ctrlKey || evt.metaKey);
            if (isFindShortcut && !editingActive) {
                const handled = window.GraphRenderer.openSearch();
                if (handled) {
                    evt.preventDefault();
                    evt.stopPropagation();
                    return;
                }
            }

            // Alt + F5 to redraw the current graph without reloading the page
            const isRedrawShortcut = evt.key === 'F5' && evt.altKey && !evt.ctrlKey && !evt.metaKey;
            if (isRedrawShortcut && !editingActive) {
                evt.preventDefault();
                evt.stopPropagation();

                window.GraphRenderer.renderGraph();
                window.UI.showNotification('Graph re-rendered with current styling.', 'success');

                return;
            }

            // Space bar should fit the graph to view when not editing text
            const isSpaceKey = evt.key === ' ' || evt.key === 'Spacebar';
            const modifierPressed = evt.ctrlKey || evt.metaKey || evt.altKey || evt.shiftKey;
            if (isSpaceKey && !modifierPressed && !editingActive) {
                evt.preventDefault();

                menuAPI.fitGraph();
            }
        });
    },

    // Initialize extensions
    initializeExtensions: async function() {
        try {
            // Initialize extensions manager
            const extensionsManager = window.ExtensionsManager;
            extensionsManager.initExtensions();

            // Update layout dropdown after extensions are loaded
            const layoutManager = window.LayoutManager;
            layoutManager.updateLayoutDropdown();

            // Debug extensions to see what's actually working
            extensionsManager.debugExtensions();
        } catch (error) {
            console.error('Error initializing extensions:', error);
        }
    },

    // Load sample data
    loadSampleData: function() {
        window.FileManager.loadSampleData();
        window.TableManager.updateTables();
        window.TableManager.updateTotalDataTable();

        // Force a delay and update again to ensure tables are populated
        setTimeout(() => {
            window.TableManager.updateTables();
            window.TableManager.updateTotalDataTable();
        }, 500);
    },

    // Node editor functions
    openNodeEditor: function() {
        const cy = window.GraphRenderer.cy;
        if (!cy) {
            this.showError('Graph not initialized');
            return;
        }

        const selectedNodes = cy.nodes(':selected');
        
        if (selectedNodes.length === 0) {
            this.showError('Please select a node first');
            return;
        }

        // Use the first selected node for editing
        window.NodeEditor.showEditor(selectedNodes[0]);
    },

    // Global utility functions
    showError: function(message) {
        console.error('Error:', message);
        window.UI.showNotification(message, 'error');
    },

    showSuccess: function(message) {
        window.UI.showNotification(message, 'success');
    },



    // Selection control functions
    clearSelection: function() {
        window.GraphRenderer.clearSelection();
        this.showSuccess('Selection cleared');
    },

    selectAllNodes: function() {
        const nodes = window.GraphRenderer.cy.nodes();
        nodes.select();
        this.showSuccess(`Selected all ${nodes.length} nodes`);
    },

    invertSelection: function() {
        const count = window.GraphRenderer.invertSelection();
        this.showSuccess(`Inverted selection: ${count} nodes now selected`);
    },

    // Setup custom dropdown functionality
    setupCustomDropdown: function() {
        const toggle = document.getElementById('layoutDropdownToggle');
        const menu = document.getElementById('layoutDropdownMenu');
        const text = document.getElementById('layoutDropdownText');
        
        if (!toggle || !menu || !text) return;

        // Toggle dropdown
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            toggle.classList.toggle('active');
            menu.classList.toggle('show');
        });

        // Handle item selection
        menu.addEventListener('click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (item) {
                const value = item.dataset.value;
                const label = item.textContent;
                
                // Update display
                text.textContent = label;
                
                // Remove selected class from all items
                menu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
                
                // Add selected class to clicked item
                item.classList.add('selected');
                
                // Close dropdown
                toggle.classList.remove('active');
                menu.classList.remove('show');
                
                // Trigger layout change
                window.selectLayout(value);
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!toggle.contains(e.target) && !menu.contains(e.target)) {
                toggle.classList.remove('active');
                menu.classList.remove('show');
            }
        });

        // Set initial selection
        const initialItem = menu.querySelector('[data-value="cose"]');
        if (initialItem) {
            initialItem.classList.add('selected');
        }
    },


};

    // Initialize the application when DOM is loaded
    document.addEventListener('DOMContentLoaded', async function() {
        await window.QuantickleApp.bootstrap();
    });

// Intercept reloads and warn if there is unsaved data
window.addEventListener('beforeunload', function (e) {
    let hasUnsaved = false;

    try {
        hasUnsaved = !!window.GraphRenderer.hasUnsavedGraphChanges();
    } catch (error) {
        console.warn('Failed to evaluate unsaved graph state before unload', error);
    }

    if (hasUnsaved) {
        // Standard message is ignored by most browsers, but returning a string triggers the dialog
        e.preventDefault();
        e.returnValue = '';
        return '';
    }
});
