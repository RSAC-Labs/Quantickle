const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

// Setup DOM and globals
const dom = new JSDOM('<!doctype html><html><body><div id="cy"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;
window.location = { origin: 'http://localhost' };

// Minimal stubs
window.UI = { showNotification: () => {} };
window.DomainLoader = { autoLoadDomainsForGraph: async () => [] };
window.TableManager = { updateTables: () => {}, updateTotalDataTable: () => {} };
window.LayoutManager = { applyCurrentLayout: () => {}, currentLayout: 'preset', updateLayoutDropdown: () => {} };
window.GraphAreaEditor = { applySettings: () => {} };
window.QuantickleConfig = { validation: { enabled: false } };
window.LODSystem = { init: () => {}, config: { enabled: false } };
window.GraphStyling = { applyDefaultStyles: () => {} };
window.GraphControls = { init: () => {} };
window.SelectionManager = { init: () => {} };
window.GraphEditor = { init: () => {} };
window.EdgeCreator = { init: () => {} };
window.PerformanceManager = { init: () => {} };
window.DebugTools = { init: () => {} };
window.ProgressManager = { init: () => {} };
window.BackgroundGridModule = { init: () => {} };
window.Validation = {
  validators: {
    validateNode: () => ({ valid: true, errors: [] }),
    validateEdge: () => ({ valid: true, errors: [] })
  }
};
window.NodeTypes = { default: { color: '#ffffff', size: 30, shape: 'round-rectangle', icon: '' } };
window.IconConfigs = {};

// Cytoscape factory
global.cytoscape = opts => cytoscape({ ...opts, headless: true, styleEnabled: true });

// Load modules
require('../js/utils.js');
require('../js/graph.js');
require('../js/graph-manager.js');

// Initialize renderer
window.GraphRenderer.initializeCytoscape();

// Sample graph data in Cytoscape format
const sampleGraph = {
  id: '33333333-3333-4333-8333-333333333333',
  title: 'Test graph',
  nodes: [
    { data: { id: 'n1', label: 'Node 1', type: 'server', color: '#ff6b6b', size: 30 } }
  ],
  edges: [],
  metadata: { source: 'Manually added', title: 'Test graph' }
};

(async () => {
  await window.GraphManager.loadGraphData(sampleGraph);
  // wait for rendering to complete
  await new Promise(res => setTimeout(res, 200));
  if (window.GraphRenderer.cy.nodes().length !== sampleGraph.nodes.length) {
    throw new Error('Nodes not rendered without DataManager');
  }
  console.log('renderGraph works without DataManager');
  process.exit(0);
})();
