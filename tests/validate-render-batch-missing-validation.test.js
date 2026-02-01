const { JSDOM } = require('jsdom');

// Setup minimal DOM environment
const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Stub modules required by graph.js but intentionally omit Validation
window.UI = { showNotification: () => {} };
window.DataManager = { getGraphData: () => ({ nodes: [], edges: [] }), setGraphData: () => {} };
window.TableManager = { updateTables: () => {}, updateTotalDataTable: () => {} };
window.QuantickleConfig = { validation: { enabled: true } };
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

// Headless cytoscape stub
const cytoscape = require('cytoscape');
global.cytoscape = opts => cytoscape({ ...opts, headless: true, styleEnabled: true });

require('../js/graph.js');
const GR = window.GraphRenderer;

const batch = [
  { group: 'nodes', data: { id: 'n1' } }
];

let threw = false;
try {
  GR.validateRenderBatch(batch);
} catch (err) {
  threw = true;
  if (!/Validation module is missing/.test(err.message)) {
    throw new Error('Unexpected error message: ' + err.message);
  }
}

if (!threw) {
  throw new Error('Expected validateRenderBatch to throw when Validation module is missing');
}

console.log('validateRenderBatch throws when Validation module is missing');
