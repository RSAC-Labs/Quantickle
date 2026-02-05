/**
 * Context Menu Module
 * 
 * Provides right-click context menus for graph interactions.
 * Self-contained module with clean external interfaces.
 * 
 * DEPENDENCIES:
 * - Cytoscape instance (passed via constructor)
 * - UI notification system (passed via constructor)
 * - Graph operations (passed via constructor)
 * - Data management (passed via constructor)
 * 
 * PROVIDES:
 * - showGraphMenu(x, y) - shows menu for graph background
 * - showNodeMenu(x, y, nodes) - shows menu for selected nodes
 * - showEdgeMenu(x, y, edges) - shows menu for selected edges
 * - hideMenu() - hides any open menu
 * 
 * FEATURES:
 * - Dynamic menu generation based on context
 * - Clean action delegation to appropriate handlers
 * - Proper event management and cleanup
 * - Themeable styling
 */
const SUMMARY_TEMPLATE = `<div class="summary-template">
  <style>
    .summary-template {
      --page-max: clamp(32ch, 60vw, 60ch);
      margin: 0;
      padding: 12px 16px;
      font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #fff;
      color: #000;
      display: inline-block;
      max-width: min(var(--page-max), 100%);
      width: min(var(--page-max), max-content);
      box-sizing: border-box;
    }

    .summary-template .page {
      max-width: min(var(--page-max), 100%);
      width: min(var(--page-max), max-content);
      box-sizing: border-box;
    }

    .summary-template h1 {
      font-size: clamp(1.25rem, 3vw, 1.75rem);
      line-height: 1.2;
      margin: 0 0 0.75rem;
      font-weight: 600;
    }

    .summary-template hr {
      border: none;
      border-top: 2px solid currentColor;
      margin: 0 0 0.75rem;
    }

    .summary-template .content {
      font-size: 1rem;
      line-height: 1.65;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
  <main class="page">
    <h1>{{ title }}</h1>
    <hr />
    <div class="content">
      {{ body_text }}
    </div>
  </main>
</div>`;

const defaultWrapSummaryHtml = summary => {
    const escapeHtml = str => String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    let title = '';
    let body = '';
	console.log("Context menu summary")
    if (summary && typeof summary === 'object') {
        title = escapeHtml(summary.title || '');
        body = escapeHtml(summary.body || '');
    } else {
        const [rawTitle, ...rawBody] = String(summary || '').split('\n');
        title = escapeHtml(rawTitle.trim());
        body = escapeHtml(rawBody.join('\n').trim());
    }

    return SUMMARY_TEMPLATE
        .replace('{{ title }}', title)
        .replace('{{ body_text }}', body);
};

const stripReportUrl = (text, url) => {
    if (!text || !url) return text;
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\$&');
    return text
        .replace(new RegExp('\\s*\\(' + escaped + '\\)', 'g'), ' ')
        .replace(new RegExp(escaped, 'g'), '')
        .replace(/\s{2,}/g, ' ')
        .trim();
};

class ContextMenuModule {
    constructor(dependencies) {
        // Required dependencies injected via constructor
        this.cy = dependencies.cytoscape;
        this.notifications = dependencies.notifications;
        this.graphOps = dependencies.graphOperations;
        this.dataManager = dependencies.dataManager;
        this.nodeEditor = dependencies.nodeEditor;
        this.bubbleSetsInstance = null;
        this.bubbleSetPaths = [];

        // Internal state
        this.menu = null;
        this.isVisible = false;
        this.currentContext = null; // 'graph', 'node', 'edge'
        
        // Configuration
        this.config = {
            menuId: 'context-menu-module',
            stylesId: 'context-menu-module-styles'
        };
        
        // Initialize the module
        this.init();
    }

    /**
     * Determine if the given Cytoscape element is a container node
     * @param {object} node - Cytoscape element or collection
     * @returns {boolean} Whether the element represents a container
     */
    isContainerNode(node) {
        return !!(node && (
            (node.hasClass && node.hasClass('container')) ||
            (node.data && (node.data('type') === 'container' || node.data('isContainer')))
        ));
    }

    /**
     * Determine if a container node is hosting a timeline layout
     * @param {object} node - Cytoscape element or collection
     * @returns {boolean} Whether the container is timeline-based
     */
    isTimelineContainer(node) {
        if (!this.isContainerNode(node) || !node) {
            return false;
        }

        if (typeof node.children === 'function') {
            try {
                const timelineChildren = node.children('[type^="timeline-"]');
                if (timelineChildren && typeof timelineChildren.length === 'number' && timelineChildren.length > 0) {
                    return true;
                }
            } catch (error) {
                // Fallback to manual inspection if selector query is unavailable
                const children = node.children();
                if (children && typeof children.filter === 'function') {
                    const timelineDescendants = children.filter(child => {
                        const type = typeof child.data === 'function' ? child.data('type') : undefined;
                        return typeof type === 'string' && type.startsWith('timeline-');
                    });
                    if (timelineDescendants && timelineDescendants.length > 0) {
                        return true;
                    }
                }
            }
        }

        if (typeof node.descendants === 'function') {
            const timelineDescendants = node.descendants('[type^="timeline-"]');
            if (timelineDescendants && typeof timelineDescendants.length === 'number' && timelineDescendants.length > 0) {
                return true;
            }
        }

        const data = typeof node.data === 'function' ? node.data() : null;
        if (data) {
            const timelineFlags = ['_timelineContainerized', 'timelineContainerized', '_timelineParentWasContainer'];
            if (timelineFlags.some(flag => Boolean(data[flag]))) {
                return true;
            }
        }

        return false;
    }

    /**
     * Determine if a node is eligible for integration queries
     * @param {object|null} node - Cytoscape node element
     * @returns {boolean} Whether integrations should be available
     */
    isIntegrationEligibleNode(node) {
        if (!node) {
            return false;
        }

        if (this.isContainerNode(node)) {
            return false;
        }

        const nodeType = typeof node.data === 'function' ? node.data('type') : undefined;
        if (nodeType === 'text') {
            return false;
        }

        return true;
    }

    isVirusTotalQuickQueryType(nodeType) {
        if (!nodeType) {
            return false;
        }
        const normalized = nodeType.toString().toLowerCase();
        const supportedTypes = ['domain', 'ipaddress', 'filename', 'malware', 'url'];
        return supportedTypes.includes(normalized);
    }

    getDomainForNodeType(nodeType) {
        if (!nodeType || !window.DomainLoader) {
            return null;
        }

        if (typeof window.DomainLoader.getDomainForType === 'function') {
            return window.DomainLoader.getDomainForType(nodeType) || null;
        }

        const map = window.DomainLoader.typeDomainMap || {};
        const key = nodeType.toString();
        const lower = key.toLowerCase();
        const normalized = typeof window.DomainLoader.normalizeTypeKey === 'function'
            ? window.DomainLoader.normalizeTypeKey(key)
            : lower;
        return map[key] || map[lower] || (normalized ? map[normalized] : null) || null;
    }

    isHacktivistDomainType(nodeType) {
        const domainKey = this.getDomainForNodeType(nodeType);
        return domainKey === 'hacktivist';
    }

    setNodeInfo(node, infoText) {
        if (!node) {
            return;
        }

        const info = infoText || '';
        node.data('info', info);
        if (typeof node.removeData === 'function') {
            node.removeData('infoHtml');
        } else {
            node.data('infoHtml', undefined);
        }

        const nodeId = node.id ? node.id() : node.data('id');
        const graphManager = window.GraphManager;
        if (!nodeId || !graphManager || typeof graphManager.getCurrentGraphData !== 'function') {
            return;
        }

        const graphData = graphManager.getCurrentGraphData();
        if (!graphData || !Array.isArray(graphData.nodes)) {
            return;
        }

        const entry = graphData.nodes.find(n => {
            if (!n) return false;
            const data = n.data || n;
            return data && data.id === nodeId;
        });

        if (!entry) {
            return;
        }

        const target = entry.data || entry;
        target.info = info;
        if (target.infoHtml !== undefined) {
            delete target.infoHtml;
        }

        if (window.DataManager && typeof window.DataManager.setGraphData === 'function') {
            window.DataManager.setGraphData(graphData);
        }
    }

    /**
     * Initialize the context menu module
     */
    init() {
        this.addStyles();
        this.createContextMenu();
        this.setupEventListeners();
    }
    
    /**
     * PUBLIC INTERFACE: Show context menu for graph background
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     */
    showGraphMenu(x, y) {
        this.currentContext = 'graph';
        this.lastClientPosition = { x, y };

        const menuItems = [
            { label: 'Add node', action: () => this.addNodeAtCursor() },
            { label: 'Add callout', action: () => this.addCalloutAtCursor() },
            { separator: true },
            { label: 'Select All Nodes', action: () => this.selectAll() },
            { label: 'Clear Selection', action: () => this.clearSelection() },
            { separator: true },
            { label: 'Fit to View', action: () => this.fitGraph() },
            { label: 'Center Graph', action: () => this.centerGraph() },
            { separator: true },
            { label: 'Set Background Image', action: () => this.setBackgroundImage() },
            { separator: true },
            { label: 'Containerize', action: () => this.containerizeByType() },
            { separator: true },
            { label: 'Link another graph', action: () => this.linkGraphAtCursor() }
        ];

        this.showMenu(x, y, menuItems);
    }
    
    /**
     * PUBLIC INTERFACE: Show context menu for selected nodes
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {Array} nodes - Selected nodes
     * @param {Object|null} targetNode - Node that was right-clicked
     */
    showNodeMenu(x, y, nodes, targetNode = null) {
        this.currentContext = 'node';

        const selectedContainers = nodes.filter(n => this.isContainerNode(n));
        const target = targetNode || (nodes[0] || null);
        const hasNonContainerSelection = nodes.some(n => !this.isContainerNode(n));
        const otherSelectedContainers = selectedContainers.filter(c => !target || c.id() !== target.id());
        const preSelectedContainer = hasNonContainerSelection
            ? (otherSelectedContainers[0] || null)
            : (target && this.isContainerNode(target) ? (otherSelectedContainers[0] || null) : null);
        const targetContainerId = this.isContainerNode(target) ? target.id() : null;

        // If a container is pre-selected, operate on all other selected nodes
        const workingNodes = preSelectedContainer ? nodes.filter(n => n.id() !== preSelectedContainer.id()) : nodes;
        const nodeCount = workingNodes.length;

        const group1 = [
            { label: `Edit ${nodeCount > 1 ? 'Nodes' : 'Node'}`, action: () => this.editNodes(workingNodes) }
        ];
        if (target) {
            if (target.data('pinned')) {
                group1.push({ label: 'Unpin Node', action: () => this.unpinNodes([target]) });
            } else {
                group1.push({ label: 'Pin Node', action: () => this.pinNodes([target]) });
            }
        }

        const portalGroup = [];
        if (nodeCount === 1) {
            const node = workingNodes[0];
            const portalHelper = window.GraphRenderer?.GraphPortal;
            const supportsPortal = portalHelper && typeof portalHelper.supportsNode === 'function'
                ? portalHelper.supportsNode(node)
                : false;

            if (supportsPortal) {
                const isExpanded = typeof portalHelper.isExpanded === 'function' && portalHelper.isExpanded(node);
                if (isExpanded) {
                    portalGroup.push({
                        label: 'Return from portal',
                        action: () => portalHelper.collapse({ focusGraph: true })
                    });
                } else {
                    portalGroup.push({
                        label: 'Expand in portal',
                        action: () => portalHelper.expand(node)
                    });
                }
            }
        }

        const group2 = [];
        if (nodeCount === 1) {
            const node = workingNodes[0];
            const nodeType = node.data('type');
            const isIntegrationEligible = this.isIntegrationEligibleNode(node);
            const isHacktivistType = this.isHacktivistDomainType(nodeType);
            const standardOpenAiTypes = ['domain', 'ipaddress', 'filename', 'url', 'malware', 'report'];
            const isStandardOpenAiType = standardOpenAiTypes.includes(nodeType);

            if (nodeType === 'graph') {
                group2.push({ label: 'Fetch referenced graph', action: () => this.fetchGraphNode(node) });
            }

            if (isIntegrationEligible) {
                if (isStandardOpenAiType || isHacktivistType) {
                    group2.push({ label: 'Query OpenAI', action: () => this.aiFetch(node) });
                }
                if (isStandardOpenAiType) {
                    group2.push({ label: 'Query VirusTotal', action: () => this.queryVirusTotal(node, nodeType) });
                    if (nodeType === 'domain') {
                        group2.push({ label: 'Add to VT blocklist', action: () => this.addDomainToVTBlocklist(node) });
                    }
                }
                if (['person', 'company', 'user'].includes(nodeType)) {
                    group2.push({ label: 'OpenAI OSINT', action: () => this.aiOsintFetch(node) });
                }
                const neoCreds = window.IntegrationsManager?.getNeo4jCredentials?.();
                if (neoCreds?.url && neoCreds?.username && neoCreds?.password && node.data('label')) {
                    group2.push({ label: 'Query Neo4j DB', action: () => this.queryNeo4j(node) });
                }
            }
        }

        const quickVTTargets = workingNodes.filter(n => this.isVirusTotalQuickQueryType(n?.data?.('type')));
        if (quickVTTargets.length > 0 && window.IntegrationsManager?.updateVirusTotalInfoForNodes) {
            const label = quickVTTargets.length > 1
                ? 'Quick VirusTotal info (selection)'
                : 'Quick VirusTotal info';
            group2.push({ label, action: () => this.quickVirusTotalInfo(quickVTTargets) });
        }

        const group3 = [];

        if (preSelectedContainer && nodeCount > 0) {
            const containerId = preSelectedContainer.id();
            group3.push({ label: 'Send to container', action: () => this.groupNodes(workingNodes, containerId) });
        } else if (!preSelectedContainer) {
            group3.push({ label: 'Send to container', action: () => this.groupNodes(workingNodes, targetContainerId) });
        }

        if (nodeCount === 1) {
            const node = workingNodes[0];
            const parent = node.parent();
            if (this.isContainerNode(parent)) {
                group3.push({ label: 'Move out of container', action: () => this.ungroupNode(node) });
            }
            if (this.isContainerNode(node)) {
                if (!this.isTimelineContainer(node)) {
                    group3.push({ label: 'Arrange Nodes', action: () => this.arrangeContainer(node) });
                }
                group3.push({ label: 'Remove container', action: () => this.removeContainer(node) });
            }
        } else {
            const nodesInContainers = nodes.filter(n => this.isContainerNode(n.parent()));
            if (nodesInContainers.length > 0) {
                group3.push({ label: 'Move out of container', action: () => this.ungroupNodes(nodesInContainers) });
            }
        }

        const bubbleGroup = [];
        if (nodeCount > 0) {
            bubbleGroup.push({ label: 'Create Bubble Set from Selection', action: () => this.createBubbleSetFromSelection(workingNodes) });
            bubbleGroup.push({ label: 'Clear Bubble Sets', action: () => this.clearBubbleSets() });
        }

        const group4 = [
            { label: 'Select Children', action: () => this.selectChildren(workingNodes) },
            { label: 'Select Parents', action: () => this.selectParents(workingNodes) },
            { label: 'Select Type', action: () => this.selectByType(workingNodes) },
            { label: 'Invert Selection', action: () => this.invertSelection() }
        ];

        const group5 = [
            { label: 'Create Edges to Selection', action: () => this.createEdgesToSelection(workingNodes) },
            { label: 'Create Edges from Selection', action: () => this.createEdgesFromSelection(workingNodes) }
        ];

        const group6 = [
            { label: `Copy ${nodeCount > 1 ? 'Nodes' : 'Node'}`, action: () => this.copyNodes(workingNodes) },
            { label: `Delete ${nodeCount > 1 ? 'Nodes' : 'Node'}`, action: () => this.deleteNodes(workingNodes) }
        ];

        const menuItems = [];
        const appendGroup = items => {
            if (items.length > 0) {
                if (menuItems.length > 0) menuItems.push({ separator: true });
                menuItems.push(...items);
            }
        };

        appendGroup(group1);
        appendGroup(portalGroup);
        appendGroup(group2);
        appendGroup(group3);
        appendGroup(bubbleGroup);
        appendGroup(group4);
        appendGroup(group5);
        appendGroup(group6);

        this.showMenu(x, y, menuItems);
    }
    
    /**
     * PUBLIC INTERFACE: Show context menu for selected edges
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {Array} edges - Selected edges
     */
    showEdgeMenu(x, y, edges) {
        this.currentContext = 'edge';
        const edgeCount = edges.length;
        
        const menuItems = [
            { label: `Edit ${edgeCount > 1 ? 'Edges' : 'Edge'}`, action: () => this.editEdges(edges) },
            { separator: true },
            { label: 'Select Connected Nodes', action: () => this.selectConnectedNodes(edges) }
        ];
        
        this.showMenu(x, y, menuItems);
    }
    
    /**
     * PUBLIC INTERFACE: Hide the context menu
     */
    hideMenu() {
        if (this.menu) {
            this.menu.style.display = 'none';
        }
        this.isVisible = false;
        this.currentContext = null;
    }
    
    /**
     * PUBLIC INTERFACE: Check if menu is currently visible
     */
    isMenuVisible() {
        return this.isVisible;
    }
    
    // === PRIVATE METHODS BELOW ===
    
    /**
     * Add CSS styles for the context menu
     */
    addStyles() {
        if (document.getElementById(this.config.stylesId)) return;
        
        const style = document.createElement('style');
        style.id = this.config.stylesId;
        style.textContent = `
            .context-menu-module {
                position: fixed;
                background: #2d3748;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 1000;
                display: none;
                font-family: Arial, sans-serif;
                font-size: 14px;
                min-width: 180px;
                color: #ffffff;
                user-select: none;
            }
            
            .context-menu-module .menu-item {
                padding: 8px 16px;
                cursor: pointer;
                transition: background-color 0.2s;
                border-bottom: 1px solid transparent;
            }
            
            .context-menu-module .menu-item:hover {
                background-color: rgba(255, 255, 255, 0.1);
            }
            
            .context-menu-module .menu-item:active {
                background-color: rgba(255, 255, 255, 0.2);
            }
            
            .context-menu-module .menu-separator {
                height: 1px;
                background-color: rgba(255, 255, 255, 0.1);
                margin: 4px 0;
            }
            
            .context-menu-module .menu-item:first-child {
                border-radius: 8px 8px 0 0;
            }
            
            .context-menu-module .menu-item:last-child {
                border-radius: 0 0 8px 8px;
            }
        `;
        
        document.head.appendChild(style);
    }
    
    /**
     * Create the context menu DOM element
     */
    createContextMenu() {
        this.menu = document.createElement('div');
        this.menu.id = this.config.menuId;
        this.menu.className = 'context-menu-module';
        document.body.appendChild(this.menu);
    }
    
    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Hide menu when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (!this.menu.contains(e.target)) {
                this.hideMenu();
            }
        });
        
        // Hide menu on scroll or resize
        window.addEventListener('scroll', () => this.hideMenu());
        window.addEventListener('resize', () => this.hideMenu());
        
        // Hide menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideMenu();
            }
        });
    }
    
    /**
     * Show the menu with given items at specified position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {Array} items - Menu items
     */
    showMenu(x, y, items) {
        // Generate menu HTML
        let html = '';
        items.forEach(item => {
            if (item.separator) {
                html += '<div class="menu-separator"></div>';
            } else {
                html += `<div class="menu-item">${item.label}</div>`;
            }
        });
        
        this.menu.innerHTML = html;
        
        // Add click handlers
        const menuItems = this.menu.querySelectorAll('.menu-item');
        let itemIndex = 0;
        items.forEach(item => {
            if (!item.separator) {
                menuItems[itemIndex].addEventListener('click', () => {
                    this.hideMenu();
                    item.action();
                });
                itemIndex++;
            }
        });
        
        // Position menu
        this.menu.style.left = x + 'px';
        this.menu.style.top = y + 'px';
        this.menu.style.display = 'block';
        
        // Adjust position if menu goes off screen
        this.adjustMenuPosition();
        
        this.isVisible = true;
    }
    
    /**
     * Adjust menu position to stay within viewport
     */
    adjustMenuPosition() {
        const rect = this.menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Adjust horizontal position
        if (rect.right > viewportWidth) {
            this.menu.style.left = (viewportWidth - rect.width - 10) + 'px';
        }
        
        // Adjust vertical position
        if (rect.bottom > viewportHeight) {
            this.menu.style.top = (viewportHeight - rect.height - 10) + 'px';
        }
    }
    
    // === ACTION METHODS ===
    
    loadSampleData() {
        if (window.QuantickleApp && window.QuantickleApp.loadSampleData) {
            window.QuantickleApp.loadSampleData();
        } else {
            this.notifications.show('Data manager not available', 'warning');
        }
    }
    
    loadCSV() {
        if (this.dataManager.loadCSV) {
            this.dataManager.loadCSV();
        } else {
            this.notifications.show('File loading not available', 'warning');
        }
    }
    
    loadAPI() {
        if (this.dataManager.loadAPI) {
            this.dataManager.loadAPI();
        } else {
            this.notifications.show('API loading not available', 'warning');
        }
    }
    
    selectAll() {
        if (this.cy) {
            this.cy.nodes().select();
            this.notifications.show(`Selected ${this.cy.nodes().length} nodes`, 'info');
        }
    }
    
    clearSelection() {
        if (this.cy) {
            this.cy.elements().unselect();
            this.notifications.show('Selection cleared', 'info');
        }
    }
    
    fitGraph() {
        if (this.cy) {
            this.cy.fit();
            this.notifications.show('Graph fitted to view', 'info');
        }
    }
    
    centerGraph() {
        if (this.cy) {
            this.cy.center();
            this.notifications.show('Graph centered', 'info');
        }
    }

    setBackgroundImage() {
        if (window.GraphAreaEditor && typeof window.GraphAreaEditor.showEditor === 'function') {
            window.GraphAreaEditor.showEditor();
            const input = document.getElementById('backgroundImage');
            if (input) {
                setTimeout(() => input.focus(), 0);
            }
        } else {
            this.notifications.show('Graph area editor not available', 'warning');
        }
    }

    addNodeAtCursor() {
        if (this.graphOps.addNodeAtPosition && this.cy && this.lastClientPosition) {
            const rect = this.cy.container().getBoundingClientRect();
            const pan = this.cy.pan();
            const zoom = this.cy.zoom();
            const x = (this.lastClientPosition.x - rect.left - pan.x) / zoom;
            const y = (this.lastClientPosition.y - rect.top - pan.y) / zoom;
            this.graphOps.addNodeAtPosition(x, y);
        } else {
            this.notifications.show('Add node function not available', 'warning');
        }
    }

    addCalloutAtCursor() {
        if (this.graphOps.addCalloutAtPosition && this.cy && this.lastClientPosition) {
            const rect = this.cy.container().getBoundingClientRect();
            const pan = this.cy.pan();
            const zoom = this.cy.zoom();
            const x = (this.lastClientPosition.x - rect.left - pan.x) / zoom;
            const y = (this.lastClientPosition.y - rect.top - pan.y) / zoom;
            const result = this.graphOps.addCalloutAtPosition(
                x,
                y,
                'Title',
                'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'
            );
            if (result && result.success === false) {
                const message = result.error || 'Add callout failed';
                this.notifications.show(message, 'warning');
            }
        } else {
            this.notifications.show('Add callout function not available', 'warning');
        }
    }

    async linkGraphAtCursor() {
        if (!this.cy || typeof this.cy.container !== 'function') {
            this.notifications.show('Graph area is not available', 'warning');
            return;
        }

        if (!this.lastClientPosition) {
            this.notifications.show('Cursor position unavailable for linking', 'warning');
            return;
        }

        if (!this.graphOps || typeof this.graphOps.createGraphLinkNodeAtPosition !== 'function') {
            this.notifications.show('Graph linking is not available in this environment', 'warning');
            return;
        }

        const container = this.cy.container();
        if (!container || typeof container.getBoundingClientRect !== 'function') {
            this.notifications.show('Unable to determine graph position', 'warning');
            return;
        }

        const rect = container.getBoundingClientRect();
        const pan = typeof this.cy.pan === 'function' ? this.cy.pan() : { x: 0, y: 0 };
        const zoom = typeof this.cy.zoom === 'function' ? this.cy.zoom() : 1;
        const x = (this.lastClientPosition.x - rect.left - pan.x) / zoom;
        const y = (this.lastClientPosition.y - rect.top - pan.y) / zoom;

        try {
            const result = await this.graphOps.createGraphLinkNodeAtPosition(x, y);
            if (!result || result.success === false) {
                const message = result && result.error
                    ? result.error
                    : 'Unable to link another graph at this location.';
                this.notifications.show(message, 'warning');
            } else if (result.warning) {
                this.notifications.show(result.warning, 'warning');
            }
        } catch (error) {
            console.error('Failed to create linked graph node from context menu', error);
            this.notifications.show('Failed to create linked graph node.', 'error');
        }
    }
    
    clearGraph() {
        if (this.cy) {
            const nodeCount = this.cy.nodes().length;
            const edgeCount = this.cy.edges().length;
            
            if (nodeCount > 0 || edgeCount > 0) {
                if (confirm(`Clear entire graph? This will remove ${nodeCount} nodes and ${edgeCount} edges.`)) {
                    this.cy.elements().remove();
                    this.notifications.show('Graph cleared', 'info');
                }
            } else {
                this.notifications.show('Graph is already empty', 'info');
            }
        }
    }
    
    editNodes(nodes) {
        if (!this.nodeEditor.showEditor) {
            this.notifications.show('Node editor not available', 'warning');
            return;
        }

        // Ensure the provided nodes are selected so the editor can
        // treat them as a group for bulk updates
        this.cy.elements().unselect();
        nodes.forEach(node => node.select());

        // Open the editor without specifying a node - it will use the
        // current selection and handle single or multiple nodes
        this.nodeEditor.showEditor();
    }
    
    copyNodes(nodes) {
        if (this.graphOps.copyNodes) {
            this.graphOps.copyNodes(nodes);
            this.notifications.show(`Copied ${nodes.length} node(s)`, 'success');
        } else {
            this.notifications.show('Copy function not available', 'warning');
        }
    }
    
    createEdgesFromSelection(nodes) {
        this.notifications.show(`Click on the target node to create edges FROM ${nodes.length} selected nodes`, 'info');
        
        // Set up one-time click handler for target selection
        const handleTargetClick = (event) => {
            const targetNode = event.target;
            
            // Create edges from all selected nodes to target
            let createdEdges = 0;
            nodes.forEach(sourceNode => {
                if (sourceNode.id() !== targetNode.id()) {
                    const edgeId = `edge_${sourceNode.id()}_${targetNode.id()}_${Date.now()}`;
                    this.cy.add({
                        group: 'edges',
                        data: {
                            id: edgeId,
                            source: sourceNode.id(),
                            target: targetNode.id()
                        }
                    });
                    createdEdges++;
                }
            });
            
            this.cy.off('tap', 'node', handleTargetClick);
            this.notifications.show(`Created ${createdEdges} edges`, 'success');
        };
        
        this.cy.one('tap', 'node', handleTargetClick);
        
        // Cancel on escape
        const cancelHandler = (e) => {
            if (e.key === 'Escape') {
                this.cy.off('tap', 'node', handleTargetClick);
                this.notifications.show('Edge creation cancelled', 'info');
                document.removeEventListener('keydown', cancelHandler);
            }
        };
        document.addEventListener('keydown', cancelHandler);
    }
    
    createEdgesToSelection(nodes) {
        this.notifications.show(`Click on the source node to create edges TO ${nodes.length} selected nodes`, 'info');
        
        // Set up one-time click handler for source selection
        const handleSourceClick = (event) => {
            const sourceNode = event.target;
            
            // Create edges from source to all selected nodes
            let createdEdges = 0;
            nodes.forEach(targetNode => {
                if (sourceNode.id() !== targetNode.id()) {
                    const edgeId = `edge_${sourceNode.id()}_${targetNode.id()}_${Date.now()}`;
                    this.cy.add({
                        group: 'edges',
                        data: {
                            id: edgeId,
                            source: sourceNode.id(),
                            target: targetNode.id()
                        }
                    });
                    createdEdges++;
                }
            });
            
            this.cy.off('tap', 'node', handleSourceClick);
            this.notifications.show(`Created ${createdEdges} edges`, 'success');
        };
        
        this.cy.one('tap', 'node', handleSourceClick);
        
        // Cancel on escape
        const cancelHandler = (e) => {
            if (e.key === 'Escape') {
                this.cy.off('tap', 'node', handleSourceClick);
                this.notifications.show('Edge creation cancelled', 'info');
                document.removeEventListener('keydown', cancelHandler);
            }
        };
        document.addEventListener('keydown', cancelHandler);
    }

    focusCyContainer() {
        if (!this.cy || typeof this.cy.container !== 'function') {
            return;
        }

        const container = this.cy.container();
        if (container && typeof container.focus === 'function') {
            container.focus();
        }
    }

    selectChildren(nodes) {
        if (nodes.length === 1) {
            const node = nodes[0];
            let children;

            if (this.isContainerNode(node)) {
                children = node.children('node');
            } else {
                children = node.outgoers('node');
            }

            if (children && children.length > 0) {
                children.select();
                this.focusCyContainer();
                this.notifications.show(
                    `Selected ${children.length} child node${children.length === 1 ? '' : 's'}`,
                    'info'
                );
            } else {
                this.notifications.show('No child nodes found', 'info');
            }
        } else {
            this.notifications.show('Select children works with single node selection only', 'warning');
        }
    }

    selectParents(nodes) {
        if (!nodes || nodes.length === 0) {
            this.notifications.show('No nodes selected', 'warning');
            return;
        }

        if (nodes.length !== 1) {
            this.notifications.show('Select parents works with single node selection only', 'warning');
            return;
        }

        const node = nodes[0];
        if (!this.cy || !node) {
            this.notifications.show('Unable to locate parent nodes', 'warning');
            return;
        }

        let parentNodes = this.cy.collection();

        if (typeof node.parents === 'function') {
            parentNodes = parentNodes.union(node.parents());
        } else if (typeof node.parent === 'function') {
            const parent = node.parent();
            if (parent && parent.length) {
                parentNodes = parentNodes.union(parent);
            }
        }

        if (typeof node.incomers === 'function') {
            const incomerNodes = node.incomers('node');
            if (incomerNodes && incomerNodes.length) {
                parentNodes = parentNodes.union(incomerNodes);
            }
        }

        if (parentNodes.length > 0) {
            parentNodes.select();
            this.focusCyContainer();
            this.notifications.show(
                `Selected ${parentNodes.length} parent node${parentNodes.length === 1 ? '' : 's'}`,
                'info'
            );
        } else {
            this.notifications.show('No parent nodes found', 'info');
        }
    }

    selectByType(nodes) {
        if (!nodes || nodes.length === 0) {
            this.notifications.show('No nodes selected', 'warning');
            return;
        }

        if (!this.cy || typeof this.cy.nodes !== 'function') {
            this.notifications.show('Unable to locate nodes by type', 'warning');
            return;
        }

        const selectedTypes = new Set();
        nodes.forEach(node => {
            if (!node) return;
            const data = typeof node.data === 'function' ? node.data() : node.data;
            if (data && typeof data.type === 'string' && data.type.trim().length > 0) {
                selectedTypes.add(data.type);
            }
        });

        if (selectedTypes.size === 0) {
            this.notifications.show('Selected nodes do not have a type', 'info');
            return;
        }

        const matchingNodes = this.cy.nodes().filter(node => {
            if (typeof node.data !== 'function') {
                return false;
            }
            const nodeType = node.data('type');
            return typeof nodeType === 'string' && selectedTypes.has(nodeType);
        });

        if (matchingNodes.length === 0) {
            this.notifications.show('No nodes of the selected type were found', 'info');
            return;
        }

        matchingNodes.select();
        this.focusCyContainer();
        const typeList = Array.from(selectedTypes).join(', ');
        const typeLabel = selectedTypes.size === 1 ? 'type' : 'types';
        this.notifications.show(
            `Selected ${matchingNodes.length} node${matchingNodes.length === 1 ? '' : 's'} of ${typeLabel} ${typeList}`,
            'info'
        );
    }

    invertSelection() {
        if (this.cy) {
            const selected = this.cy.nodes(':selected');
            const unselected = this.cy.nodes(':unselected');

            selected.unselect();
            unselected.select();

            this.notifications.show(`Inverted selection: ${unselected.length} nodes selected`, 'info');
        }
    }
	
	
	ensureBubbleSets(showWarnings = true) {
		if (this.bubbleSetsInstance) {
			return this.bubbleSetsInstance;
		}

		if (!this.cy || typeof this.cy.bubbleSets !== 'function') {
			if (showWarnings) {
				this.notifications.show(
					'Bubble sets extension is not available; ensure cytoscape-bubblesets is loaded before creating the graph.',
					'warning'
				);
			}
			return null;
		}

		this.bubbleSetsInstance = this.cy.bubbleSets({
			style: {
				fill: 'rgba(102, 126, 234, 0.18)',
				stroke: '#667eea',
				strokeWidth: 2
			}
		});

		this.bubbleSetPaths = [];
		return this.bubbleSetsInstance;
}


	createBubbleSetFromSelection(nodes) {
		if (!this.cy) {
			this.notifications.show('Cytoscape instance unavailable.', 'error');
			return;
		}

		const selection = Array.isArray(nodes) && nodes.length > 0
			? this.cy.collection(nodes)
			: this.cy.$(':selected');

		if (!selection || selection.length === 0) {
			this.notifications.show('No nodes selected for bubble set creation', 'warning');
			return;
		}

		const bubbleSets = this.ensureBubbleSets();
		if (!bubbleSets) {
			return;
		}

		const edgeCollection = typeof selection.connectedEdges === 'function'
			? selection.connectedEdges()
			: this.cy.collection();

		try {
			let path = null;

			if (typeof bubbleSets.addPath === 'function') {
				// v4 signature: (nodes, edges?, avoidNodes?, options?)
				const avoidNodes = this.cy.collection(); // or something meaningful
				path = bubbleSets.addPath(
					selection,
					edgeCollection,
					avoidNodes,
					{
						padding: 12,
						virtualEdges: true
					}
				);
			} else if (typeof bubbleSets.addBubbleset === 'function') {
				// Legacy fallback, if you *really* want to keep it
				path = bubbleSets.addBubbleset(selection, edgeCollection);
			}

			if (path) {
				this.bubbleSetPaths.push(path);
			}

			if (typeof bubbleSets.update === 'function') {
				bubbleSets.update();
			} else if (typeof bubbleSets.redraw === 'function') {
				bubbleSets.redraw();
			}

			this.notifications.show('Created bubble set for selection', 'success');
		} catch (error) {
			console.error('Failed to create bubble set for selection', error);
			this.notifications.show('Unable to create bubble set for selection', 'error');
		}
	}

   clearBubbleSets(options = {}) {
		const { notify = true } = options;
		const bubbleSets = this.ensureBubbleSets(false);
		if (!bubbleSets) {
			return;
		}

		try {
			// Prefer the plugin’s own registry
			if (typeof bubbleSets.getPaths === 'function' &&
				typeof bubbleSets.removePath === 'function') {

				const paths = bubbleSets.getPaths() || [];

				paths.forEach(path => {
					if (!path) return;
					try {
						bubbleSets.removePath(path);
					} catch (error) {
						console.warn('Failed to remove bubble set path', error);
					}
				});

			} else if (Array.isArray(this.bubbleSetPaths) &&
					   this.bubbleSetPaths.length > 0 &&
					   typeof bubbleSets.removePath === 'function') {
				// Fallback: use our own tracking array
				this.bubbleSetPaths.forEach(path => {
					if (!path) return;
					try {
						bubbleSets.removePath(path);
					} catch (error) {
						console.warn('Failed to remove bubble set path (fallback)', error);
					}
				});
			}

			// Reset our own tracking regardless
			this.bubbleSetPaths = [];

			if (typeof bubbleSets.update === 'function') {
				bubbleSets.update();
			} else if (typeof bubbleSets.redraw === 'function') {
				bubbleSets.redraw();
			}

			if (notify) {
				this.notifications.show('Cleared bubble set highlights', 'success');
			}
		} catch (error) {
			console.error('Failed to clear bubble sets', error);
			if (notify) {
				this.notifications.show('Unable to clear bubble sets', 'error');
			}
		}
	}

    deleteNodes(nodes) {
        if (nodes.length > 0) {
            const message = nodes.length === 1 ?
                `Delete node "${nodes[0].data('label')}"?` :
                `Delete ${nodes.length} selected nodes?`;
                
            if (confirm(message)) {
                nodes.forEach(node => node.remove());
                this.notifications.show(`Deleted ${nodes.length} node(s)`, 'success');
            }
        }
    }

    pinNodes(nodes) {
        if (nodes.length === 0) return;
        nodes.forEach(node => {
            node.data('pinned', true);
            node.lock();
            node.style({
                'border-width': 6,
                'border-color': '#1e90ff',
                'border-opacity': 1
            });
        });
        this.notifications.show(`Pinned ${nodes.length} node${nodes.length === 1 ? '' : 's'}`, 'success');
    }

    unpinNodes(nodes) {
        if (!nodes || nodes.length === 0) return;

        const seen = new Set();
        const nodesToUnpin = [];

        const collectNode = (node) => {
            if (!node || typeof node.id !== 'function') {
                return;
            }

            const id = node.id();
            if (seen.has(id)) {
                return;
            }

            seen.add(id);
            nodesToUnpin.push(node);

            if (typeof node.isParent === 'function' ? node.isParent() : false) {
                const descendants = typeof node.descendants === 'function' ? node.descendants() : null;
                if (descendants && typeof descendants.forEach === 'function') {
                    descendants.forEach(collectNode);
                }
            }
        };

        if (typeof nodes.forEach === 'function') {
            nodes.forEach(collectNode);
        } else if (Array.isArray(nodes)) {
            nodes.forEach(collectNode);
        }

        if (nodesToUnpin.length === 0) return;

        nodesToUnpin.forEach(node => {
            if (typeof node.data === 'function') {
                node.data('pinned', false);
            }
            if (typeof node.unlock === 'function') {
                node.unlock();
            }
            if (typeof node.style === 'function') {
                node.style({
                    'border-width': 0,
                    'border-color': '#000000'
                });
            }
        });

        this.notifications.show(
            `Unpinned ${nodesToUnpin.length} node${nodesToUnpin.length === 1 ? '' : 's'}`,
            'success'
        );
    }

    /**
     * Group a node into a container
     * @param {Object} node - Cytoscape node
     * @param {string} containerId - Container node ID
     */
    groupNode(node, containerId) {
        if (this.graphOps.groupNode) {
            this.graphOps.groupNode(node.id(), containerId);
            this.notifications.show(`Grouped node "${node.data('label')}"`, 'success');
        } else {
            this.notifications.show('Group operation not available', 'warning');
        }
    }

    /**
     * Remove a node from its container
     * @param {Object} node - Cytoscape node
     */
    ungroupNode(node) {
        if (this.graphOps.ungroupNode) {
            this.graphOps.ungroupNode(node.id());
            this.notifications.show(`Expelled node "${node.data('label')}"`, 'success');
        } else {
            this.notifications.show('Ungroup operation not available', 'warning');
        }
    }

    /**
     * Group multiple nodes into a new container
     * @param {Object} nodes - Cytoscape collection of nodes
     */
    groupNodes(nodes, preferredContainerId = null) {
        if (!window.GraphEditorAdapter || !window.GraphEditorAdapter.addContainer) {
            this.notifications.show('Group operation not available', 'warning');
            return;
        }

        const topLevelNodes = nodes.filter(node => !nodes.anySame(node.ancestors()));
        if (topLevelNodes.length === 0) {
            nodes.unselect();
            return;
        }

        const containers = topLevelNodes.filter(n => n.hasClass && n.hasClass('container'));
        let preferredContainer = null;
        if (preferredContainerId) {
            const containerArray = containers.toArray ? containers.toArray() : containers;
            preferredContainer = containerArray.find(container => container.id() === preferredContainerId) || null;
            if (!preferredContainer && this.cy) {
                const candidate = this.cy.getElementById(preferredContainerId);
                if (candidate && this.isContainerNode(candidate)) {
                    preferredContainer = candidate;
                }
            }
        }

        if (containers.length > 0 || preferredContainer) {
            const containerArray = containers.toArray ? containers.toArray() : containers;
            let parentContainer = preferredContainer || null;
            if (!parentContainer) {
                if (containerArray.length > 1) {
                    containerArray.sort((a, b) => {
                        const childDiff = a.children().length - b.children().length;
                        if (childDiff !== 0) {
                            return childDiff;
                        }
                        const aBox = a.boundingBox();
                        const bBox = b.boundingBox();
                        const aArea = (aBox.w || 0) * (aBox.h || 0);
                        const bArea = (bBox.w || 0) * (bBox.h || 0);
                        if (aArea === bArea) {
                            return 0;
                        }
                        return bArea - aArea;
                    });
                }
                parentContainer = containerArray[0];
            }
            topLevelNodes.forEach(node => {
                if (node.id() === parentContainer.id()) return;
                if (this.graphOps.groupNode) {
                    this.graphOps.groupNode(node.id(), parentContainer.id());
                } else {
                    node.move({ parent: parentContainer.id() });
                }
            });
            nodes.unselect();
            parentContainer.select();
            if (window.GraphRenderer) {
                if (window.GraphRenderer.arrangeContainerNodes) {
                    window.GraphRenderer.arrangeContainerNodes(parentContainer);
                } else if (window.GraphRenderer.updateContainerBounds) {
                    window.GraphRenderer.updateContainerBounds(parentContainer);
                }
            }
            this.notifications.show(`Grouped ${nodes.length - 1} node(s)`, 'success');
            return;
        }

        const bb = topLevelNodes.boundingBox();
        const padding = 40;
        const centerX = bb.x1 + bb.w / 2;
        const centerY = bb.y1 + bb.h / 2;
        const width = bb.w + padding;
        const height = bb.h + padding;
        const containerNode = window.GraphEditorAdapter.addContainer(centerX, centerY, { width, height });
        if (containerNode) {
            topLevelNodes.forEach(node => {
                if (this.graphOps.groupNode) {
                    this.graphOps.groupNode(node.id(), containerNode.id());
                } else {
                    node.move({ parent: containerNode.id() });
                }
            });
            nodes.unselect();
            containerNode.select();
            if (window.GraphRenderer) {
                if (window.GraphRenderer.arrangeContainerNodes) {
                    window.GraphRenderer.arrangeContainerNodes(containerNode);
                } else if (window.GraphRenderer.updateContainerBounds) {
                    window.GraphRenderer.updateContainerBounds(containerNode);
                }
            }
            this.notifications.show(`Grouped ${nodes.length} node(s)`, 'success');
        } else {
            this.notifications.show('Failed to create container', 'error');
        }
    }

    /**
     * Group nodes into containers based on their type
     */
    containerizeByType() {
        if (!this.cy) {
            return;
        }
        if (!window.GraphEditorAdapter || !window.GraphEditorAdapter.addContainer) {
            this.notifications.show('Group operation not available', 'warning');
            return;
        }

        const nodes = this.cy.nodes().filter(n => !this.isContainerNode(n) && !this.isContainerNode(n.parent()));
        if (nodes.length === 0) {
            this.notifications.show('No nodes to containerize', 'info');
            return;
        }

        const typeMap = {};
        nodes.forEach(node => {
            const type = node.data('type') || 'default';
            if (!typeMap[type]) {
                typeMap[type] = [];
            }
            typeMap[type].push(node);
        });

        Object.entries(typeMap).forEach(([type, nodeArray]) => {
            if (nodeArray.length === 0) return;
            const label = `${type} container`;
            let container = this.cy.nodes().filter(n => this.isContainerNode(n) && n.data('label') === label).first();
            if (!container || container.length === 0) {
                const collection = this.cy.collection(nodeArray);
                const bb = collection.boundingBox();
                const padding = 40;
                const centerX = bb.x1 + bb.w / 2;
                const centerY = bb.y1 + bb.h / 2;
                const width = bb.w + padding;
                const height = bb.h + padding;
                container = window.GraphEditorAdapter.addContainer(centerX, centerY, { width, height, label });
                if (!container) return;
            }
            nodeArray.forEach(node => {
                if (this.graphOps.groupNode) {
                    this.graphOps.groupNode(node.id(), container.id());
                } else {
                    node.move({ parent: container.id() });
                }
                node.unselect();
            });
            if (window.GraphRenderer) {
                if (window.GraphRenderer.arrangeContainerNodes) {
                    window.GraphRenderer.arrangeContainerNodes(container);
                } else if (window.GraphRenderer.updateContainerBounds) {
                    window.GraphRenderer.updateContainerBounds(container);
                }
            }
        });

        this.notifications.show('Nodes containerized by type', 'success');
    }

    /**
     * Ungroup multiple nodes from their container
     * @param {Object} nodes - Cytoscape collection of nodes
     */
    ungroupNodes(nodes) {
        nodes.forEach(node => {
            if (this.graphOps.ungroupNode) {
                this.graphOps.ungroupNode(node.id());
            } else {
                node.move({ parent: null });
            }
        });
        this.notifications.show(`Expelled ${nodes.length} node(s)`, 'success');
    }

    /**
     * Extract all nodes from a container and remove it
     * @param {Object} node - Container node to remove
     */
    removeContainer(node) {
        if (this.graphOps && typeof this.graphOps.removeContainer === 'function') {
            const label = node && node.data ? (node.data('label') || node.id()) : node.id();
            this.graphOps.removeContainer(node.id());
            this.notifications.show(`Removed container "${label}"`, 'success');
        } else if (node && typeof node.children === 'function') {
            const parent = node.parent();
            const targetParent = parent && parent.length ? parent.id() : null;
            const parentCenter = parent && parent.length ? { ...parent.position() } : null;
            const parentWidth = parent && parent.length ? parseFloat(parent.data('width')) : undefined;
            const parentHeight = parent && parent.length ? parseFloat(parent.data('height')) : undefined;

            node.children().forEach(child => child.move({ parent: targetParent }));
            node.remove();

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
            this.notifications.show('Removed container', 'success');
        } else {
            this.notifications.show('Remove container operation not available', 'warning');
        }
    }

    /**
     * Arrange child nodes within a container
     * @param {Object} node - Container node
     */
    arrangeContainer(node) {
        if (this.graphOps && typeof this.graphOps.arrangeContainerNodes === 'function') {
            const label = node && node.data ? (node.data('label') || node.id()) : node;
            this.graphOps.arrangeContainerNodes(node);
            this.notifications.show(`Arranged nodes in "${label}"`, 'info');
        } else {
        }
    }

    /**
     * Query VirusTotal based on node type
     * @param {Object} node - Selected node
     * @param {string} nodeType - Node type
     */
    queryVirusTotal(node, nodeType) {
        if (!window.IntegrationsManager ||
            typeof window.IntegrationsManager.importVirusTotalData !== 'function') {
            this.notifications.show('VirusTotal integration not available', 'error');
            return;
        }

        const identifier = node.data('label') || node.id();
        let queryType;
        switch (nodeType) {
            case 'domain':
                queryType = 'domain';
                break;
            case 'ipaddress':
                queryType = 'ip';
                break;
            case 'filename':
                queryType = 'file';
                break;
            case 'malware':
                queryType = 'file';
                break;
            case 'url':
                queryType = 'url';
                break;
            default:
                queryType = null;
        }

        if (!queryType) {
            this.notifications.show('Unsupported node type for VirusTotal query', 'warning');
            return;
        }

        this.notifications.show(`Querying VirusTotal for ${identifier}`, 'info');
        window.IntegrationsManager.importVirusTotalData(identifier, queryType)
            .then(() => this.notifications.show('VirusTotal query completed', 'success'))
            .catch(err => {
                const isNotFound = err && err.message && err.message.toLowerCase().includes('not found in virustotal');
                if (isNotFound) {
                    console.info('VirusTotal resource not found:', identifier);
                    this.notifications.show('Not found in VirusTotal', 'warning');
                } else {
                    console.error('VirusTotal query failed:', err);
                    this.notifications.show('VirusTotal query failed', 'error');
                }
            });
    }

    /**
     * Quickly refresh VirusTotal information on existing nodes without adding new nodes
     * @param {Object[]} nodes - Cytoscape node collection
     */
    async quickVirusTotalInfo(nodes) {
        if (!window.IntegrationsManager ||
            typeof window.IntegrationsManager.updateVirusTotalInfoForNodes !== 'function') {
            this.notifications.show('VirusTotal integration not available', 'error');
            return;
        }

        const validNodes = (nodes || []).filter(n => this.isIntegrationEligibleNode(n)
            && this.isVirusTotalQuickQueryType(n?.data?.('type')));

        if (validNodes.length === 0) {
            this.notifications.show('No eligible nodes for VirusTotal quick query', 'info');
            return;
        }

        this.notifications.show(`Updating VirusTotal info for ${validNodes.length} node(s)`, 'info');

        try {
            const result = await window.IntegrationsManager.updateVirusTotalInfoForNodes(validNodes);
            const updated = result?.updated || 0;
            const skipped = (result?.skippedUnsupported || 0) + (result?.skippedWithData || 0);
            if (updated > 0) {
                this.notifications.show(`Updated VirusTotal info for ${updated} node(s)`, 'success');
            } else {
                this.notifications.show('No nodes updated from VirusTotal', 'info');
            }

            if (result?.errors) {
                this.notifications.show('Some VirusTotal lookups failed', 'warning');
            } else if (skipped > 0 && updated === 0) {
                this.notifications.show('VirusTotal quick query skipped existing or unsupported nodes', 'info');
            }
        } catch (error) {
            console.error('VirusTotal quick query failed:', error);
            this.notifications.show('VirusTotal quick query failed', 'error');
        }
    }

    addDomainToVTBlocklist(node) {
        if (!window.IntegrationsManager ||
            typeof window.IntegrationsManager.addToVTBlocklist !== 'function') {
            this.notifications.show('VirusTotal integration not available', 'error');
            return;
        }
        const identifier = node.data('label') || node.id();
        const result = window.IntegrationsManager.addToVTBlocklist(identifier);
        if (result.added) {
            this.notifications.show(`Added ${result.domain} to VirusTotal blocklist`, 'success');
        } else {
            this.notifications.show(`${result.domain} already in VirusTotal blocklist`, 'info');
        }
    }

    async queryNeo4j(node) {
        if (!this.isIntegrationEligibleNode(node)) {
            return;
        }
        const label = node?.data('label');
        const creds = window.IntegrationsManager?.getNeo4jCredentials?.();
        if (!creds?.url || !creds?.username || !creds?.password) {
            this.notifications.show('Neo4j credentials not configured', 'error');
            return;
        }
        if (!label) {
            this.notifications.show('Node label not found', 'error');
            return;
        }
        if (window.GraphRenderer && typeof window.GraphRenderer.checkNeo4jForExistingNodes === 'function') {
            await window.GraphRenderer.checkNeo4jForExistingNodes([label]);
        } else {
            this.notifications.show('Neo4j integration not available', 'error');
        }
    }

    async fetchGraphNode(node) {
        if (!node) {
            return;
        }

        const getDataValue = key => {
            if (typeof node.data === 'function') {
                return node.data(key);
            }
            return node?.data?.[key];
        };

        const graphLinkData = getDataValue('graphLink');
        const rawReferenceValue = getDataValue('graphReference');
        const rawInfoValue = getDataValue('info');
        const resolver = window.GraphReferenceResolver;

        const normalizedLink = resolver && typeof resolver.normalize === 'function'
            ? resolver.normalize(graphLinkData || rawReferenceValue || rawInfoValue)
            : null;

        const legacyReference = (() => {
            const firstString = [rawReferenceValue, rawInfoValue]
                .find(value => typeof value === 'string' && value.trim());
            return firstString ? firstString.trim() : '';
        })();

        if (!normalizedLink && !legacyReference) {
            this.notifications.show('This node does not contain a graph reference.', 'warning');
            return;
        }

        if (!this.graphOps || typeof this.graphOps.explodeGraphNode !== 'function') {
            this.notifications.show('Graph fetch operation is not available.', 'warning');
            return;
        }

        const label = getDataValue('label') || node.id();

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

        const explodeOptions = { label };
        if (normalizedLink) {
            explodeOptions.graphLink = normalizedLink;
        }
        if (Object.keys(fetchOptions).length) {
            explodeOptions.fetchOptions = fetchOptions;
        }

        try {
            const targetLabel = normalizedLink && resolver && typeof resolver.describe === 'function'
                ? resolver.describe(normalizedLink)
                : (legacyReference || 'linked graph');
            this.notifications.show(`Fetching ${targetLabel} for ${label}`, 'info');
            const referencePayload = normalizedLink || legacyReference;
            const result = await this.graphOps.explodeGraphNode(node.id(), referencePayload, explodeOptions);
            if (result && result.success) {
                this.notifications.show('Graph loaded into container.', 'success');
            } else {
                const message = result && result.error ? result.error : 'Unable to load referenced graph.';
                this.notifications.show(message, 'error');
            }
        } catch (error) {
            console.error('Failed to load referenced graph:', error);
            this.notifications.show('Failed to load referenced graph.', 'error');
        }
    }

    async aiFetch(node) {
        const identifier = node.data('label') || node.id();
        const serpApiKey = window.IntegrationsManager?.getSerpApiKey?.();
        const openaiApiKey = window.IntegrationsManager?.getOpenAIApiKey?.();
        const nodeType = node.data('type');
        const isHacktivistType = this.isHacktivistDomainType(nodeType);
        if (!window.RAGPipeline) {
            try {
                const mod = await import('/js/rag-pipeline.js');
                window.RAGPipeline = mod.RAGPipeline;
            } catch (err) {
                console.error('Failed to load RAG pipeline:', err);
                this.notifications.show('RAG pipeline not available', 'error');
                throw err;
            }
        }
        const fetchLabel = isHacktivistType ? 'hacktivist profile' : 'AI context';
        const activityId = window.UI?.beginGraphActivity?.('rag-pipeline', `Running ${fetchLabel} for ${identifier}...`);
        this.notifications.show(`Fetching ${fetchLabel} for ${identifier}`, 'info');
        try {
            window.UI?.updateGraphActivity?.(activityId, `Collecting ${fetchLabel} for ${identifier}...`);
            const pipeline = new window.RAGPipeline();
            let docs;
            if (nodeType === 'report') {
                let url = node.data('url');
                if (!url) {
                    const label = node.data('label');
                    try {
                        if (label) {
                            new URL(label);
                            url = label;
                        }
                    } catch {
                        const info = node.data('info') || '';
                        const match = info.match(/https?:\/\/[^\s<>'"]+/);
                        url = match ? match[0] : null;
                    }
                }
                window.UI?.updateGraphActivity?.(activityId, 'Retrieving report content and indicators...');
                docs = url ? await pipeline.retrieveReport(url) : [];
            } else {
                window.UI?.updateGraphActivity?.(activityId, `Searching for ${fetchLabel} sources...`);
                docs = await pipeline.retrieve(identifier, serpApiKey);
            }
            if (!docs || docs.length === 0) {
                this.notifications.show('No results were returned', 'warning');
                return { prompt: null, documents: [], completion: null };
            }

            if (isHacktivistType) {
                const prompt = pipeline.buildPrompt(identifier, docs, 'hacktivist');
                window.UI?.updateGraphActivity?.(activityId, 'Generating hacktivist profile with OpenAI...');
                const completion = await pipeline.queryOpenAI(prompt, openaiApiKey);
                const parsed = this.extractJsonFromCompletion({ completion });
                const description = parsed?.description;
                if (description) {
                    this.setNodeInfo(node, description);
                    this.notifications.show('Hacktivist description added to node info', 'success');
                } else {
                    this.notifications.show('No description was returned', 'warning');
                }
                return { prompt, documents: docs, completion, description };
            }

            const wrapSummaryHtml = window.wrapSummaryHtml || defaultWrapSummaryHtml;
            const reports = [];
            if (nodeType === 'report') {
                const doc = docs[0];
                const prompt = pipeline.buildPrompt(identifier, [doc]);
                window.UI?.updateGraphActivity?.(activityId, 'Summarizing report content with OpenAI...');
                const completion = await pipeline.queryOpenAI(prompt, openaiApiKey);
                const parsed = this.extractJsonFromCompletion({ completion });
                if (parsed) {
                    this.mergeRelationshipIndicators(parsed);
                    this.filterHallucinatedIocs(parsed, `${doc.content}\n${prompt}`);
                    if (doc.iocs) {
                        parsed.iocs = this.mergeIocLists(doc.iocs, parsed.iocs);
                    }
                    if (parsed.summary) {
                        let summaryObj = parsed.summary;
                        let summaryText;
                        if (typeof summaryObj === 'object') {
                            if (summaryObj.title) summaryObj.title = stripReportUrl(summaryObj.title, doc.metadata?.url);
                            if (summaryObj.body) summaryObj.body = stripReportUrl(summaryObj.body, doc.metadata?.url);
                            summaryText = [summaryObj.title, summaryObj.body].filter(Boolean).join('\n');
                        } else {
                            const text = stripReportUrl(summaryObj, doc.metadata?.url);
                            summaryObj = { title: text, body: '' };
                            summaryText = text;
                        }
                        parsed.summaryHtml = wrapSummaryHtml(summaryObj);
                        parsed.summary = summaryText;
                        parsed.summaryStructured = summaryObj;
                    }
                    reports.push({
                        title: doc.metadata?.title || doc.metadata?.url || 'Report',
                        url: doc.metadata?.url,
                        summary: parsed.summary,
                        summaryHtml: parsed.summaryHtml,
                        summaryStructured: parsed.summaryStructured,
                        iocs: parsed.iocs,
                        relationships: parsed.relationships,
                        targets: parsed.targets,
                        nation_states: parsed.nation_states,
                        threat_actors: parsed.threat_actors
                    });
                }
            } else {
                for (const doc of docs) {
                    const prompt = pipeline.buildPrompt(identifier, [doc]);
                    const docLabel = doc?.metadata?.title || doc?.metadata?.url || identifier;
                    window.UI?.updateGraphActivity?.(activityId, `Summarizing ${docLabel} with OpenAI...`);
                    const completion = await pipeline.queryOpenAI(prompt, openaiApiKey);
                    const parsed = this.extractJsonFromCompletion({ completion });
                    if (!parsed) continue;
                    this.mergeRelationshipIndicators(parsed);
                    this.filterHallucinatedIocs(parsed, `${doc.content}\n${prompt}`);
                    if (doc.iocs) {
                        parsed.iocs = this.mergeIocLists(doc.iocs, parsed.iocs);
                    }
                    if (parsed.summary) {
                        let summaryObj = parsed.summary;
                        let summaryText;
                        if (typeof summaryObj === 'object') {
                            if (summaryObj.title) summaryObj.title = stripReportUrl(summaryObj.title, doc.metadata?.url);
                            if (summaryObj.body) summaryObj.body = stripReportUrl(summaryObj.body, doc.metadata?.url);
                            summaryText = [summaryObj.title, summaryObj.body].filter(Boolean).join('\n');
                        } else {
                            const text = stripReportUrl(summaryObj, doc.metadata?.url);
                            summaryObj = { title: text, body: '' };
                            summaryText = text;
                        }
                        parsed.summaryHtml = wrapSummaryHtml(summaryObj);
                        parsed.summary = summaryText;
                        parsed.summaryStructured = summaryObj;
                    }
                    reports.push({
                        title: doc.metadata?.title || doc.metadata?.url || 'Report',
                        url: doc.metadata?.url,
                        summary: parsed.summary,
                        summaryHtml: parsed.summaryHtml,
                        summaryStructured: parsed.summaryStructured,
                        iocs: parsed.iocs,
                        relationships: parsed.relationships,
                        targets: parsed.targets,
                        nation_states: parsed.nation_states,
                        threat_actors: parsed.threat_actors
                    });
                }
            }

            if (reports.length === 0) {
                this.notifications.show('No results were returned', 'warning');
                return { prompt: null, documents: docs, completion: null, reports: [] };
            }

            const data = { documents: docs, reports };
            await this.parseRagResponse(data, node);
            for (const rep of reports) {
                delete rep.summary;
                delete rep.summaryStructured;
            }
            if (data.summary) delete data.summary;
            console.log('AI fetch result:', data);
            this.notifications.show('AI fetch completed', 'success');
            return data;
        } catch (err) {
            console.error('AI fetch failed:', err);
            this.notifications.show('AI fetch failed', 'error');
            throw err;
        } finally {
            if (activityId) {
                window.UI?.endGraphActivity?.(activityId);
            }
        }
    }

    async aiOsintFetch(node) {
        const identifier = node.data('label') || node.id();
        const serpApiKey = window.IntegrationsManager?.getSerpApiKey?.();
        const openaiApiKey = window.IntegrationsManager?.getOpenAIApiKey?.();
        if (!window.RAGPipeline) {
            try {
                const mod = await import('/js/rag-pipeline.js');
                window.RAGPipeline = mod.RAGPipeline;
            } catch (err) {
                this.notifications.show('RAG pipeline not available', 'error');
                throw new Error('RAG pipeline not available');
            }
        }
        const activityId = window.UI?.beginGraphActivity?.('rag-osint', `Running OSINT pipeline for ${identifier}...`);
        this.notifications.show(`Fetching OSINT for ${identifier}`, 'info');
        try {
            const pipeline = new window.RAGPipeline();
            window.UI?.updateGraphActivity?.(activityId, `Retrieving OSINT context for ${identifier}...`);
            const docs = await pipeline.retrieve(identifier, serpApiKey);
            if (!docs || docs.length === 0) {
                this.notifications.show('No results were returned', 'warning');
                return { prompt: null, documents: [], completion: null };
            }
            const prompt = pipeline.buildPrompt(identifier, docs, 'osint');
            window.UI?.updateGraphActivity?.(activityId, 'Summarizing OSINT context with OpenAI...');
            const completion = await pipeline.queryOpenAI(prompt, openaiApiKey);
            const data = { prompt, documents: docs, completion };
            console.log('AI OSINT fetch result:', data);
            const parsed = this.extractJsonFromCompletion(data);
            await this.parseOsintResponse(parsed, node);
            this.notifications.show('OSINT fetch completed', 'success');
            return data;
        } catch (err) {
            console.error('OSINT fetch failed:', err);
            this.notifications.show('OSINT fetch failed', 'error');
            throw err;
        } finally {
            if (activityId) {
                window.UI?.endGraphActivity?.(activityId);
            }
        }
    }

    mergeRelationshipIndicators(parsed) {
        if (!parsed || !parsed.relationships || !Array.isArray(parsed.relationships.indicators)) {
            return;
        }
        parsed.iocs = parsed.iocs || {};
        for (const ind of parsed.relationships.indicators) {
            if (ind.hash) {
                if (/^[a-fA-F0-9]{32}$/.test(ind.hash)) {
                    parsed.iocs.md5_hashes = parsed.iocs.md5_hashes || [];
                    parsed.iocs.md5_hashes.push(ind.hash);
                } else {
                    parsed.iocs.hashes = parsed.iocs.hashes || [];
                    parsed.iocs.hashes.push(ind.hash);
                }
            }
            if (ind.url) {
                parsed.iocs.urls = parsed.iocs.urls || [];
                parsed.iocs.urls.push(ind.url);
            }
            if (ind.domain) {
                parsed.iocs.domains = parsed.iocs.domains || [];
                parsed.iocs.domains.push(ind.domain);
            }
            if (ind.ip) {
                parsed.iocs.ip_addresses = parsed.iocs.ip_addresses || [];
                parsed.iocs.ip_addresses.push(ind.ip);
            }
        }
    }

    filterHallucinatedIocs(parsed, text) {
        if (!parsed || !text) {
            return;
        }
        const lcText = text.toLowerCase();
        const contains = val => lcText.includes(String(val).toLowerCase());

        if (parsed.iocs) {
            for (const [key, arr] of Object.entries(parsed.iocs)) {
                if (Array.isArray(arr)) {
                    const filtered = arr.filter(contains);
                    const unique = [...new Set(filtered)];
                    if (unique.length > 0) {
                        parsed.iocs[key] = unique;
                    } else {
                        delete parsed.iocs[key];
                    }
                }
            }
        }

        if (parsed.relationships && Array.isArray(parsed.relationships.indicators)) {
            parsed.relationships.indicators = parsed.relationships.indicators.filter(ind => {
                if (ind.hash && !contains(ind.hash)) return false;
                if (ind.url && !contains(ind.url)) return false;
                if (ind.domain && !contains(ind.domain)) return false;
                if (ind.ip && !contains(ind.ip)) return false;
                return true;
            });
            if (parsed.relationships.indicators.length === 0) {
                delete parsed.relationships.indicators;
            }
        }
    }

    mergeIocLists(base = {}, extra = {}) {
        const normalize = src => {
            const out = {};
            if (!src || typeof src !== 'object') {
                return out;
            }
            for (const [key, vals] of Object.entries(src)) {
                if (Array.isArray(vals)) {
                    out[key] = Array.from(new Set(vals));
                }
            }
            return out;
        };

        const result = normalize(extra);
        const baseLists = normalize(base);

        for (const [key, vals] of Object.entries(baseLists)) {
            const existing = Array.isArray(result[key]) ? result[key] : [];
            result[key] = Array.from(new Set([...existing, ...vals]));
        }
        return result;
    }

    extractJsonFromCompletion(response) {
        const content = response?.completion?.choices?.[0]?.message?.content;
        if (!content) {
            return null;
        }

        const match = content.match(/```json\s*([\s\S]*?)```/i);
        let jsonStr = match ? match[1] : content;

        const stripComments = str => {
            let inString = false;
            let inSingle = false;
            let inMulti = false;
            let result = '';
            for (let i = 0; i < str.length; i++) {
                const current = str[i];
                const next = str[i + 1];
                if (inSingle) {
                    if (current === '\n') {
                        inSingle = false;
                        result += current;
                    }
                } else if (inMulti) {
                    if (current === '*' && next === '/') {
                        inMulti = false;
                        i++;
                    }
                } else if (inString) {
                    if (current === '\\' && next) {
                        result += current + next;
                        i++;
                    } else {
                        if (current === '"') {
                            inString = false;
                        }
                        result += current;
                    }
                } else {
                    if (current === '"') {
                        inString = true;
                        result += current;
                    } else if (current === '/' && next === '/') {
                        inSingle = true;
                        i++;
                    } else if (current === '/' && next === '*') {
                        inMulti = true;
                        i++;
                    } else {
                        result += current;
                    }
                }
            }
            return result;
        };
        jsonStr = stripComments(jsonStr);

        const tryParse = str => {
            try {
                return { result: JSON.parse(str) };
            } catch (e) {
                return { error: e };
            }
        };

        let { result, error } = tryParse(jsonStr);
        if (result) return result;

        const sanitized = jsonStr.replace(/"(?:[^"\\]|\\.)*"/g, str =>
            str
                .replace(/\r/g, '\\r')
                .replace(/\n/g, '\\n')
                .replace(/\t/g, '\\t')
        );
        ({ result, error } = tryParse(sanitized));
        if (result) return result;

        const commaFixed = sanitized.replace(/(?<=[}\]"0-9])\s*(?=[{\["0-9-])/g, ',');
        ({ result, error } = tryParse(commaFixed));
        if (result) return result;

        const repaired = commaFixed.replace(/("[^"]+"\s*:\s*)\[((?:\s*"[^"]+"\s*:\s*\[[^\]]*\]\s*,?)+)\]/gs,
            (m, prefix, inner) => `${prefix}{${inner}}`
        );
        ({ result, error } = tryParse(repaired));
        if (result) return result;

        console.error('Failed to parse AI response:', error);
        return null;
    }

    async parseRagResponse(response, baseNode) {
        const parsed = response?.reports ? response : this.extractJsonFromCompletion(response);
        if (!parsed) {
            return;
        }

        // Clear report info only when new content is about to be inserted
        let baseInfoCleared = false;
        const clearBaseInfo = () => {
            if (!baseInfoCleared && baseNode?.data && baseNode.data('type') === 'report') {
                baseNode.data('info', '');
                baseInfoCleared = true;
            }
        };

        if (window.DomainLoader && typeof window.DomainLoader.loadAndActivateDomains === 'function') {
            try {
                await window.DomainLoader.loadAndActivateDomains(['cybersecurity']);
            } catch (e) {
                console.error('Failed to load cybersecurity domain:', e);
                if (this.notifications && typeof this.notifications.show === 'function') {
                    this.notifications.show('Failed to load cybersecurity domain; icons or styles may be missing', 'warning');
                }
            }
        }

        let cy = this.cy || window.GraphRenderer?.cy;
        if (!cy) {
            return;
        }

        cy.startBatch();

        const baseId = baseNode.id();
        const baseIsReport = baseNode.data('type') === 'report';

        let graphData = null;
        let dataUpdated = false;
        if (window.DataManager && typeof window.DataManager.getGraphData === 'function') {
            graphData = window.DataManager.getGraphData();
        }

        const removeNodesFromGraphData = (ids) => {
            if (!graphData) return;
            graphData.nodes = graphData.nodes.filter(n => !ids.includes(n.data ? n.data.id : n.id));
            graphData.edges = graphData.edges.filter(e => {
                const src = e.data ? e.data.source : e.source;
                const tgt = e.data ? e.data.target : e.target;
                return !ids.includes(src) && !ids.includes(tgt);
            });
            dataUpdated = true;
        };

        const removeNodesFromGraphManager = (ids) => {
            if (!window.GraphManager || !window.GraphManager.currentGraph) return;
            window.GraphManager.currentGraph.nodes = window.GraphManager.currentGraph.nodes.filter(n => !ids.includes(n.data ? n.data.id : n.id));
            window.GraphManager.currentGraph.edges = window.GraphManager.currentGraph.edges.filter(e => {
                const src = e.data ? e.data.source : e.source;
                const tgt = e.data ? e.data.target : e.target;
                return !ids.includes(src) && !ids.includes(tgt);
            });
        };

        const pendingNodes = [];
        const pendingEdges = [];
        const placementTasks = [];
        const nodeDataMap = new Map();
        const createdContainers = new Set();

        const normalizeParentOnNode = (node, parentId) => {
            const data = nodeDataMap.get(node.id()) || node.data();
            if (parentId) {
                data.parent = parentId;
            } else {
                delete data.parent;
            }
            nodeDataMap.set(node.id(), data);
            if (graphData) {
                const record = graphData.nodes.find(n => (n.data ? n.data.id : n.id) === node.id());
                if (record) {
                    if (parentId) {
                        (record.data || record).parent = parentId;
                    } else {
                        delete (record.data || record).parent;
                    }
                    dataUpdated = true;
                }
            }
        };

        const removeOpenAiAndSummaryContainers = () => {
            const containers = cy.nodes().filter(n => n.data('type') === 'container');
            const toRemove = [];
            containers.forEach(container => {
                const id = container.id();
                const label = container.data('label');
                const isOpenAi = label === 'OpenAI' || /^openai_container_/i.test(id);
                const isSummaryStructured = /summaryStructured/i.test(label) || /summaryStructured/i.test(id);
                if (!isOpenAi && !isSummaryStructured) return;

                if (isOpenAi) {
                    container.children().forEach(child => {
                        child.move({ parent: null });
                        normalizeParentOnNode(child, null);
                    });
                } else if (isSummaryStructured) {
                    container.descendants().forEach(desc => {
                        toRemove.push(desc.id());
                    });
                }
                container.connectedEdges().remove();
                toRemove.push(id);
            });
            if (toRemove.length) {
                cy.remove(cy.nodes().filter(n => toRemove.includes(n.id())));
                removeNodesFromGraphData(toRemove);
                removeNodesFromGraphManager(toRemove);
            }
        };

        removeOpenAiAndSummaryContainers();

        const isValidIpv4 = value => {
            const parts = String(value || '').split('.');
            if (parts.length !== 4) return false;
            return parts.every(part => {
                if (!/^\d{1,3}$/.test(part)) return false;
                const num = Number(part);
                return num >= 0 && num <= 255;
            });
        };

        const normalizeNodeType = (type, label) => {
            if (type === 'container') return type;
            const value = (typeof label === 'string' || typeof label === 'number')
                ? String(label).trim()
                : '';
            if (!value) return type;

            if (/^[a-f0-9]{32}$/i.test(value) || /^[a-f0-9]{40}$/i.test(value) || /^[a-f0-9]{64}$/i.test(value)) {
                return 'malware';
            }
            if (/^(?:\d{1,3}\.){3}\d{1,3}$/i.test(value) && isValidIpv4(value)) {
                return 'ipaddress';
            }
            if (type === 'domain' && /\.(?:exe|dll|html|php|bat|vbs|js|zip|rar)$/i.test(value)) {
                return 'filename';
            }
            return type;
        };

        const addNode = (id, type, label, parent = null) => {
            const normalizedType = normalizeNodeType(type, label);
            const safeId = normalizedType === 'container'
                ? id
                : `${normalizedType}_${id}`.replace(/[^a-zA-Z0-9_]/g, '_');

            const cyNode = cy.getElementById(safeId);
            if (nodeDataMap.has(safeId) || cyNode.length) {
                const existing = nodeDataMap.get(safeId);
                if (existing) {
                    existing.label = label || existing.label;
                    if (parent) existing.parent = parent;
                    if (normalizedType && existing.type !== normalizedType) {
                        existing.type = normalizedType;
                        if (graphData) {
                            const record = graphData.nodes.find(n => (n.data ? n.data.id : n.id) === safeId);
                            if (record) {
                                const dataRef = record.data || record;
                                dataRef.type = normalizedType;
                                dataUpdated = true;
                            }
                        }
                        if (window.GraphManager && window.GraphManager.currentGraph) {
                            const gmNode = window.GraphManager.currentGraph.nodes.find(n => (n.data ? n.data.id : n.id) === safeId);
                            if (gmNode) {
                                (gmNode.data || gmNode).type = normalizedType;
                            }
                        }
                        if (cyNode && cyNode.length) {
                            cyNode.data('type', normalizedType);
                            if (window.GraphRenderer && typeof window.GraphRenderer.normalizeNodeData === 'function') {
                                window.GraphRenderer.normalizeNodeData(cyNode);
                            }
                        }
                    }
                }
                return safeId;
            }

            const data = { id: safeId, label: label || id, type: normalizedType, domain: 'cybersecurity' };
            if (parent) data.parent = parent;

            const typeSettings = (window.NodeTypes && window.NodeTypes[normalizedType]) ||
                (window.NodeTypes && window.NodeTypes.default) || {};
            if (!data.labelColor && typeSettings.labelColor) data.labelColor = typeSettings.labelColor;
            if (!data.labelPlacement && typeSettings.labelPlacement) data.labelPlacement = typeSettings.labelPlacement;
            if (normalizedType === 'container') {
                createdContainers.add(safeId);
            }

            if (window.GraphRenderer && typeof window.GraphRenderer.normalizeNodeData === 'function') {
                window.GraphRenderer.normalizeNodeData({ data });
            }
            const classes = normalizedType === 'container' ? 'container' : undefined;

            pendingNodes.push({ group: 'nodes', data, classes });
            nodeDataMap.set(safeId, data);

            if (graphData && !graphData.nodes.some(n => (n.data ? n.data.id : n.id) === safeId)) {
                const nodeRecord = { data };
                if (classes) nodeRecord.classes = classes;
                graphData.nodes.push(nodeRecord);
                dataUpdated = true;
            } else if (window.GraphManager && typeof window.GraphManager.addNode === 'function') {
                window.GraphManager.addNode(data);
            }

            return safeId;
        };

        const addEdge = (source, target, rel) => {
            const edgeId = `${source}-${rel}-${target}`;
            if (cy.getElementById(edgeId).length || pendingEdges.some(e => e.data.id === edgeId)) {
                return;
            }
            const data = { id: edgeId, source, target, label: rel, type: rel };
            pendingEdges.push({ group: 'edges', data });

            if (graphData && !graphData.edges.some(e => (e.data ? e.data.id : e.id) === edgeId)) {
                graphData.edges.push({ data });
                dataUpdated = true;
            } else if (window.GraphManager && typeof window.GraphManager.addEdge === 'function') {
                window.GraphManager.addEdge(data);
            }
        };

        const tileContainers = (containerIds) => {
            if (!containerIds || containerIds.size === 0) return;
            const targets = Array.from(containerIds)
                .map(id => cy.getElementById(id))
                .filter(node => node && node.length && (!node.parent || node.parent().length === 0));
            if (!targets.length) return;

            targets.forEach(node => {
                if (window.GraphRenderer && typeof window.GraphRenderer.arrangeContainerNodes === 'function') {
                    window.GraphRenderer.arrangeContainerNodes(node);
                } else if (window.GraphRenderer && typeof window.GraphRenderer.updateContainerBounds === 'function') {
                    window.GraphRenderer.updateContainerBounds(node);
                }
            });

            const anchorPos = typeof baseNode.position === 'function'
                ? baseNode.position()
                : (baseNode && baseNode.position) ? baseNode.position : { x: 0, y: 0 };

            const dimensions = targets.map(node => {
                const bb = typeof node.boundingBox === 'function'
                    ? node.boundingBox({ includeLabels: true, includeOverlays: true })
                    : { w: 0, h: 0 };
                const width = Math.max(bb.w || 0, node.width ? node.width() : 0);
                const height = Math.max(bb.h || 0, node.height ? node.height() : 0);
                return { node, width, height };
            });

            const maxWidth = dimensions.reduce((max, { width }) => Math.max(max, width), 0);
            const maxHeight = dimensions.reduce((max, { height }) => Math.max(max, height), 0);
            const spacing = 60;
            const cellW = Math.max(20, maxWidth + spacing);
            const cellH = Math.max(20, maxHeight + spacing);
            const cols = Math.ceil(Math.sqrt(dimensions.length));
            const rows = Math.ceil(dimensions.length / cols);
            const gridW = cols * cellW;
            const gridH = rows * cellH;
            const startX = anchorPos.x - gridW / 2 + cellW / 2;
            const startY = anchorPos.y - gridH / 2 + cellH / 2;

            const relock = [];
            dimensions.forEach(({ node }) => {
                if (typeof node.locked === 'function' && node.locked()) {
                    relock.push(node);
                    node.unlock();
                }
            });

            cy.batch(() => {
                dimensions.forEach(({ node }, index) => {
                    const col = index % cols;
                    const row = Math.floor(index / cols);
                    node.position({
                        x: startX + col * cellW,
                        y: startY + row * cellH
                    });
                });
            });

            relock.forEach(node => {
                if (node && typeof node.lock === 'function') {
                    node.lock();
                }
            });
        };

        const wrapSummaryHtml = window.wrapSummaryHtml || defaultWrapSummaryHtml;

        const splitSummaryFields = (summaryText, structured) => {
            if (structured && typeof structured === 'object') {
                const structuredTitle = typeof structured.title === 'string' ? structured.title.trim() : '';
                const structuredBody = typeof structured.body === 'string' ? structured.body.trim() : '';
                return {
                    title: structuredTitle,
                    body: structuredBody
                };
            }
            const text = typeof summaryText === 'string' ? summaryText : '';
            if (!text) {
                return { title: '', body: '' };
            }
            const parts = text.split(/\n+/);
            if (parts.length > 1) {
                const possibleTitle = parts.shift().trim();
                return { title: possibleTitle, body: parts.join('\n').trim() };
            }
            return { title: '', body: text.trim() };
        };

        const addSummaryNode = (reportId, summary, parent, summaryHtml, structuredSummary) => {
            if (!summary && !structuredSummary) return;
            const baseId = `summary_${reportId}`.replace(/[^a-zA-Z0-9_]/g, '_');
            const nodeId = addNode(baseId, 'text', summary, parent);
            const html = summaryHtml || wrapSummaryHtml(summary);
            const { title: summaryTitle, body: summaryBody } = splitSummaryFields(summary, structuredSummary);
            const calloutUtils = window.QuantickleUtils || {};
            const calloutPayload = calloutUtils.normalizeCalloutPayload
                ? calloutUtils.normalizeCalloutPayload({ title: summaryTitle, body: summaryBody, format: 'text' }, { defaultFormat: 'text' })
                : { title: summaryTitle || '', body: summaryBody || '', format: 'text' };

            // Estimate dimensions based on content length with configurable limits
            const maxWidth = window.QuantickleConfig?.summaryNodeMaxWidth || 400;
            const maxHeight = window.QuantickleConfig?.summaryNodeMaxHeight || 300;
            const charWidth = 7; // approx width per character in px
            const lineHeight = 20; // px per line
            const padding = 20; // internal padding

            const lines = summary.split(/\n/);
            const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
            let width = Math.min(longest * charWidth + padding, maxWidth);
            const charsPerLine = Math.max(Math.floor((width - padding) / charWidth), 1);
            const totalLines = lines.reduce((s, l) => s + Math.ceil(l.length / charsPerLine), 0);
            let height = Math.min(totalLines * lineHeight + padding, maxHeight);

            const data = nodeDataMap.get(nodeId);
            if (data) {
                data.info = summary;
                data.infoHtml = html;
                data.width = width;
                data.height = height;
                if (calloutUtils.syncCalloutLegacyFields) {
                    calloutUtils.syncCalloutLegacyFields(data, calloutPayload, {
                        defaultFormat: 'text',
                        html,
                        syncTitle: true,
                        overwriteInfo: true,
                        includeDerivedFields: true
                    });
                } else {
                    data.callout = { ...calloutPayload };
                    data.calloutTitle = calloutPayload.title;
                    data.calloutBody = calloutPayload.body;
                    data.calloutFormat = calloutPayload.format;
                    data.calloutBodyFormat = calloutPayload.format;
                }
            }
            const cyNode = cy.getElementById(nodeId);
            if (cyNode && cyNode.length) {
                cyNode.data('info', summary);
                cyNode.data('infoHtml', html);
                cyNode.data('width', width);
                cyNode.data('height', height);
                cyNode.style({
                    width,
                    height,
                    'text-max-width': width,
                    'text-wrap': 'wrap'
                });
                cyNode.data('label', calloutPayload.title || '');
                cyNode.data('callout', data && data.callout ? { ...data.callout } : { ...calloutPayload });
                ['calloutTitle', 'calloutBody', 'calloutFormat', 'calloutBodyFormat'].forEach(key => {
                    if (data && Object.prototype.hasOwnProperty.call(data, key)) {
                        cyNode.data(key, data[key]);
                    }
                });
            }

            if (window.GraphManager && window.GraphManager.currentGraph) {
                const gmNode = window.GraphManager.currentGraph.nodes.find(n => {
                    const d = n.data || n;
                    return d.id === nodeId;
                });
                if (gmNode) {
                    const gmData = gmNode.data || gmNode;
                    gmData.width = width;
                    gmData.height = height;
                }
            }
            addEdge(reportId, nodeId, 'summary');
            return nodeId;
        };

        const reports = parsed.reports || [];
        let baseSummaryId = null;
        const summaryText = parsed.summary || reports[0]?.summary;
        const summaryHtml = parsed.summaryHtml || reports[0]?.summaryHtml;
        const summaryStructured = parsed.summaryStructured || reports[0]?.summaryStructured;
        if (summaryText) {
            clearBaseInfo();
            baseSummaryId = addSummaryNode(baseId, summaryText, undefined, summaryHtml, summaryStructured);
        }

        const reportNodeIds = [];
        if (baseSummaryId) {
            reportNodeIds.push(baseSummaryId);
            placementTasks.push({ source: baseId, nodes: [baseSummaryId], service: null, useServiceContainer: false });
        }

        const processReport = async (rep, isBase = false, seedChildren = []) => {
            const title = rep?.title || rep?.url || rep;
            if (!title && !isBase) return;
            let reportId;
            const childIds = [...seedChildren];

            if (isBase) {
                reportId = baseId;
                if (rep?.url) {
                    const existingBase = baseNode.data('info');
                    baseNode.data('info', existingBase ? `${existingBase}<p>${rep.url}</p>` : rep.url);
                }
            } else {
                reportId = addNode(title, 'report', title);
                reportNodeIds.push(reportId);
                const nodeData = nodeDataMap.get(reportId);
                if (rep?.url && nodeData) {
                    nodeData.url = rep.url;
                    const existing = nodeData.info;
                    nodeData.info = existing ? `${existing}<p>${rep.url}</p>` : rep.url;
                }
            }

            // Summary nodes are only created at the top level; skip per-report summaries

            // Create a container per node type (e.g. domains, malware) so that
            // all nodes are grouped by their data type. This previously only
            // happened for unknown data types.
            const typeContainers = {};
            const ensureTypeContainer = (type) => {
                // Skip containerisation for special node types
                const skip = ['container', 'report', 'text', 'default'];
                if (skip.includes(type)) return null;
                if (!typeContainers[type]) {
                    const id = addNode(`${type}_${reportId}`, 'container', type, null);
                    typeContainers[type] = id;
                    childIds.push(id);
                }
                return typeContainers[type];
            };

            const addReportNode = (id, type, label) => {
                const parentId = ensureTypeContainer(type);
                const nid = addNode(id, type, label, parentId);
                childIds.push(nid);
                return nid;
            };

            const iocs = rep.iocs || {};
            for (const hash of iocs.md5_hashes || []) {
                const id = addReportNode(hash, 'malware', hash);
                addEdge(reportId, id, 'related');
            }
            for (const hash of iocs.hashes || []) {
                const id = addReportNode(hash, 'malware', hash);
                addEdge(reportId, id, 'related');
            }
            for (const domain of iocs.domains || []) {
                const id = addReportNode(domain, 'domain', domain);
                addEdge(reportId, id, 'related');
            }
            for (const email of iocs.emails || []) {
                const id = addReportNode(email, 'email_address', email);
                addEdge(reportId, id, 'related');
            }
            for (const url of iocs.urls || []) {
                const id = addReportNode(url, 'url', url);
                addEdge(reportId, id, 'related');
            }

            const knownIocKeys = ['md5_hashes', 'hashes', 'domains', 'emails', 'urls'];
            for (const [key, values] of Object.entries(iocs)) {
                if (knownIocKeys.includes(key) || !Array.isArray(values)) continue;
                const containerId = addNode(`${key}_${reportId}`, 'container', key, null);
                childIds.push(containerId);
                for (const val of values) {
                    const nodeId = addNode(val, 'default', val, containerId);
                    childIds.push(nodeId);
                    addEdge(reportId, nodeId, key);
                }
            }

            const rel = rep.relationships || {};
            for (const mal of rel.associated_malware || []) {
                const id = addReportNode(mal.name, 'malware', mal.name);
                addEdge(reportId, id, 'associated_malware');
            }
            for (const item of rel.c2_infrastructure || []) {
                if (item.domain) {
                    const id = addReportNode(item.domain, 'domain', item.domain);
                    addEdge(reportId, id, 'c2_infrastructure');
                }
            }
            for (const item of rel.shared_domains || []) {
                if (item.domain) {
                    const id = addReportNode(item.domain, 'domain', item.domain);
                    addEdge(reportId, id, 'shared_domain');
                }
            }

            for (const t of rep.targets || []) {
                const name = t?.name || t;
                if (!name) continue;
                const id = addReportNode(name, 'target', name);
                addEdge(reportId, id, 'target');
            }

            for (const n of rep.nation_states || []) {
                const name = n?.name || n;
                if (!name) continue;
                const id = addReportNode(name, 'nation_state', name);
                addEdge(reportId, id, 'nation_state');
            }

            for (const a of rep.threat_actors || []) {
                const name = a?.name || a;
                if (!name) continue;
                const id = addReportNode(name, 'threat_actor', name);
                addEdge(reportId, id, 'threat_actor');
            }

            const handledKeys = new Set(['title', 'url', 'summary', 'summaryHtml', 'summaryStructured', 'iocs', 'relationships', 'targets', 'nation_states', 'threat_actors']);
            for (const [key, value] of Object.entries(rep)) {
                if (handledKeys.has(key) || value == null) continue;
                const values = Array.isArray(value) ? value : [value];
                const containerId = addNode(`${key}_${reportId}`, 'container', key, null);
                childIds.push(containerId);
                for (const val of values) {
                    const label = typeof val === 'string' ? val : val?.name || val?.id || val?.label || JSON.stringify(val);
                    const nodeId = addNode(label, 'default', label, containerId);
                    childIds.push(nodeId);
                    addEdge(reportId, nodeId, key);
                }
            }

            placementTasks.push({ source: reportId, nodes: childIds, service: null, useServiceContainer: false });
        };

        if (baseIsReport && reports.length > 0) {
            await processReport(reports[0], true);
            for (const rep of reports.slice(1)) {
                await processReport(rep);
            }
        } else {
            for (const rep of reports) {
                await processReport(rep);
            }
        }

        if (pendingNodes.length) {
            cy.add(pendingNodes);
            const newNodes = pendingNodes.map(n => cy.getElementById(n.data.id)).filter(n => n && n.length);
            if (window.GraphAreaEditor) {
                if (typeof window.GraphAreaEditor.applyNodeSettings === 'function') {
                    window.GraphAreaEditor.applyNodeSettings(newNodes);
                } else if (typeof window.GraphAreaEditor.applySettings === 'function') {
                    window.GraphAreaEditor.applySettings();
                }
            }
            const defaultLabelColor = window.GraphAreaEditor?.getSettings?.()?.labelColor;
            newNodes.forEach(node => {
                const data = node.data();
                const labelColor = data.labelColor || defaultLabelColor;
                if (labelColor !== undefined && labelColor !== null) {
                    node.style('color', String(labelColor));
                }
                if (data.labelPlacement && data.labelPlacement !== 'dynamic') {
                    let textHalign = 'center';
                    let textValign = 'center';
                    switch (data.labelPlacement) {
                        case 'top':
                            textValign = 'top';
                            break;
                        case 'bottom':
                            textValign = 'bottom';
                            break;
                        case 'left':
                            textHalign = 'left';
                            break;
                        case 'right':
                            textHalign = 'right';
                            break;
                        default:
                            break;
                    }
                    node.style({ 'text-halign': textHalign, 'text-valign': textValign });
                }
            });
        }
        if (pendingEdges.length) cy.add(pendingEdges);

        if (graphData && dataUpdated && typeof window.DataManager.setGraphData === 'function') {
            window.DataManager.setGraphData(graphData, { skipLayout: true });
        }

        // Final cleanup to ensure no OpenAI or summaryStructured containers remain
        removeOpenAiAndSummaryContainers();

        if (window.IntegrationsManager && typeof window.IntegrationsManager.positionNodesNearSource === 'function') {
            for (const task of placementTasks) {
                window.IntegrationsManager.positionNodesNearSource(cy, task.source, task.nodes, {
                    serviceName: task.service,
                    useServiceContainer: false,
                    reparent: false
                });
            }
            if (!baseIsReport) {
                const containerIds = reportNodeIds.filter(id => id !== baseSummaryId);
                if (containerIds.length) {
                    window.IntegrationsManager.positionNodesNearSource(cy, baseId, containerIds, {
                        serviceName: null,
                        useServiceContainer: false,
                        reparent: false
                    });
                }
            }
        } else {
            const origin = cy.getElementById(baseId)?.position() || { x: 0, y: 0 };
            const radius = 80;
            if (!baseIsReport) {
                reportNodeIds.forEach((id, index) => {
                    const nodeEl = cy.getElementById(id);
                    if (!nodeEl || nodeEl.length === 0) return;
                    const angle = (2 * Math.PI * index) / reportNodeIds.length;
                    const relPos = { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
                    nodeEl.position(relPos);

                    const task = placementTasks.find(t => t.source === id);
                    const children = task ? task.nodes : [];
                    const childRadius = 80;
                    children.forEach((cid, cIndex) => {
                        const childEl = cy.getElementById(cid);
                        if (!childEl || childEl.length === 0) return;
                        const childAngle = (2 * Math.PI * cIndex) / children.length;
                        childEl.position({
                            x: childRadius * Math.cos(childAngle),
                            y: childRadius * Math.sin(childAngle)
                        });
                    });
                });
            } else {
                const task = placementTasks.find(t => t.source === baseId);
                const children = task ? task.nodes : [];
                const childRadius = 80;
                children.forEach((cid, cIndex) => {
                    const childEl = cy.getElementById(cid);
                    if (!childEl || childEl.length === 0) return;
                    const childAngle = (2 * Math.PI * cIndex) / children.length;
                    childEl.position({
                        x: childRadius * Math.cos(childAngle),
                        y: childRadius * Math.sin(childAngle)
                    });
                });
            }
        }

        if (baseIsReport && createdContainers.size) {
            tileContainers(createdContainers);
        }

        cy.endBatch();
    }

    async parseOsintResponse(parsed, baseNode) {
        if (!parsed) {
            return;
        }

        const cy = this.cy || window.GraphRenderer?.cy;
        if (!cy) {
            return;
        }

        const baseId = baseNode.id();
        if (parsed.summary) {
            let summaryText;
            if (typeof parsed.summary === 'object') {
                summaryText = [parsed.summary.title, parsed.summary.body].filter(Boolean).join('\n');
            } else {
                summaryText = parsed.summary;
            }
            const existingInfo = baseNode.data('info');
            baseNode.data('info', existingInfo ? `${existingInfo}<p>${summaryText}</p>` : summaryText);
        }

        const addedNodeIds = [];
        const addNode = async (id, type, label) => {
            const safeId = `${type}_${id}`.replace(/[^a-zA-Z0-9_]/g, '_');
            if (window.IntegrationsManager && typeof window.IntegrationsManager.getOrCreateNode === 'function') {
                const nodeData = { label: label || id, type, domain: 'cybersecurity' };
                const { id: nodeId, created } = await window.IntegrationsManager.getOrCreateNode(cy, safeId, nodeData);
                let added = false;
                if (cy.getElementById(nodeId).length === 0) {
                    cy.add({ group: 'nodes', data: { ...nodeData, id: nodeId } });
                    added = true;
                }
                if (created || added) {
                    addedNodeIds.push(nodeId);
                }
                return nodeId;
            }
            if (window.GraphManager && typeof window.GraphManager.addNode === 'function') {
                window.GraphManager.addNode({ id: safeId, label: label || id, type, domain: 'cybersecurity' });
                addedNodeIds.push(safeId);
                return safeId;
            }
            const exists = cy.getElementById(safeId).length > 0;
            if (!exists) {
                cy.add({ group: 'nodes', data: { id: safeId, label: label || id, type, domain: 'cybersecurity' } });
                addedNodeIds.push(safeId);
            }
            return safeId;
        };

        const addEdge = (source, target, rel) => {
            if (window.IntegrationsManager && typeof window.IntegrationsManager.addEdgeIfNotExists === 'function') {
                window.IntegrationsManager.addEdgeIfNotExists(cy, { id: `${source}-${rel}-${target}`, source, target, label: rel, type: rel });
            } else if (window.GraphManager && typeof window.GraphManager.addEdge === 'function') {
                window.GraphManager.addEdge({ source, target, label: rel, type: rel });
            } else {
                cy.add({ group: 'edges', data: { id: `${source}-${target}`, source, target, label: rel, type: rel } });
            }
        };

        for (const name of parsed.companies || []) {
            const id = await addNode(name, 'company', name);
            addEdge(baseId, id, 'company');
        }

        for (const name of parsed.business_partners || []) {
            const id = await addNode(name, 'company', name);
            addEdge(baseId, id, 'business_partner');
        }

        for (const name of parsed.organizations || []) {
            const id = await addNode(name, 'company', name);
            addEdge(baseId, id, 'organization');
        }

        for (const name of parsed.political_connections || []) {
            const id = await addNode(name, 'politician', name);
            addEdge(baseId, id, 'political_connection');
        }

        for (const acc of parsed.social_media_accounts || []) {
            const handle = acc?.handle || acc?.name || acc?.url || acc;
            if (!handle) continue;
            const id = await addNode(handle, 'user', handle);
            if (acc?.url) {
                const nodeEl = cy.getElementById(id);
                if (nodeEl && nodeEl.length) {
                    nodeEl.data('url', acc.url);
                }
            }
            addEdge(baseId, id, 'social_media');
        }

        const locations = Array.isArray(parsed.geographical_location)
            ? parsed.geographical_location
            : parsed.geographical_location ? [parsed.geographical_location] : [];
        for (const loc of locations) {
            const id = await addNode(loc, 'nation_state', loc);
            addEdge(baseId, id, 'geographical_location');
        }

        if (addedNodeIds.length) {
            if (window.IntegrationsManager && typeof window.IntegrationsManager.positionNodesNearSource === 'function') {
                window.IntegrationsManager.positionNodesNearSource(cy, baseId, addedNodeIds, {
                    serviceName: 'OpenAI OSINT',
                    useServiceContainer: false,
                    reparent: false
                });
            } else {
                const origin = cy.getElementById(baseId)?.position() || { x: 0, y: 0 };
                const radius = 80;
                addedNodeIds.forEach((id, index) => {
                    const nodeEl = cy.getElementById(id);
                    if (!nodeEl || nodeEl.length === 0) return;
                    const angle = (2 * Math.PI * index) / addedNodeIds.length;
                    nodeEl.position({
                        x: origin.x + radius * Math.cos(angle),
                        y: origin.y + radius * Math.sin(angle)
                    });
                });
            }
        }
    }

    editEdges(edges) {
        if (window.EdgeEditor) {
            window.EdgeEditor.showEditor(edges);
        } else {
            this.notifications.show('Edge editor not available', 'error');
        }
    }

    selectConnectedNodes(edges) {
        const connectedNodes = edges.connectedNodes();
        connectedNodes.select();
        this.notifications.show(`Selected ${connectedNodes.length} connected nodes`, 'info');
    }
    
    /**
     * Cleanup method for module destruction
     */
    destroy() {
        // Remove DOM elements
        if (this.menu) {
            this.menu.remove();
            this.menu = null;
        }

        // Clear bubble set overlays
        if (this.bubbleSetsInstance) {
            try {
                if (Array.isArray(this.bubbleSetPaths) && typeof this.bubbleSetsInstance.removePath === 'function') {
                    this.bubbleSetPaths.forEach(path => {
                        try {
                            this.bubbleSetsInstance.removePath(path);
                        } catch (error) {
                            console.warn('Failed to remove bubble set during cleanup', error);
                        }
                    });
                } else if (typeof this.bubbleSetsInstance.clearPaths === 'function') {
                    this.bubbleSetsInstance.clearPaths();
                }
            } catch (error) {
                console.warn('Error while cleaning up bubble sets', error);
            }
        }

        // Remove styles
        const styles = document.getElementById(this.config.stylesId);
        if (styles) {
            styles.remove();
        }

        // Clear references
        this.bubbleSetsInstance = null;
        this.bubbleSetPaths = [];
        this.cy = null;
        this.notifications = null;
        this.graphOps = null;
        this.dataManager = null;
        this.nodeEditor = null;
    }
}

// Export for use
window.ContextMenuModule = ContextMenuModule;
