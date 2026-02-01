const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

// Setup DOM and globals
const dom = new JSDOM('<!doctype html><html><body><div id="cy"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;
// Stub canvas context to avoid WebGL errors in jsdom
window.HTMLCanvasElement.prototype.getContext = () => null;

// Minimal stubs
window.UI = { showNotification: () => {} };
const sampleGraph = {
  nodes: [
    { id: 'n1', label: 'Node 1', type: 'server', color: '#ff6b6b', size: 30 }
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n1', label: 'loop' }
  ]
};
window.DataManager = { getGraphData: () => sampleGraph, setGraphData: () => {} };
window.TableManager = { updateTables: () => {}, updateTotalDataTable: () => {} };
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
window.LayoutManager = { applyCurrentLayout: () => {} };

global.cytoscape = opts => cytoscape({ ...opts, headless: true, styleEnabled: true });

require('../js/graph.js');
const GR = window.GraphRenderer;
GR.initializeCytoscape();
GR.renderGraph();

if (GR.cy.nodes().length !== sampleGraph.nodes.length) {
  throw new Error('Nodes not rendered');
}
if (GR.cy.edges().length !== sampleGraph.edges.length) {
  throw new Error('Edges not rendered');
}

console.log('renderGraph loads plain graph data into Cytoscape');
process.exit(0);
