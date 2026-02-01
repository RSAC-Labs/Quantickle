const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

// Setup minimal DOM environment with input
const dom = new JSDOM('<!doctype html><html><body><div id="cy"></div><input id="editor-field"></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;
// Stub navigator clipboard
global.navigator = { clipboard: { readText: async () => '' } };

// Stub modules required by graph.js
window.UI = { showNotification: () => {} };
window.DataManager = { getGraphData: () => ({ nodes: [], edges: [] }), setGraphData: () => {} };
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

// Use headless Cytoscape
const cytoscapeLib = cytoscape;
global.cytoscape = (opts) => cytoscapeLib({ ...opts, headless: true, styleEnabled: true });

require('../js/graph.js');
const GR = window.GraphRenderer;
GR.initializeCytoscape();

async function run() {
  const input = document.getElementById('editor-field');
  input.focus();

  // Dispatch paste event with clipboard text that would normally create a node
  const pasteEvent = new dom.window.Event('paste', { bubbles: true, cancelable: true });
  pasteEvent.clipboardData = { getData: () => 'New Node', types: ['text/plain'], files: [] };
  input.dispatchEvent(pasteEvent);

  // Allow any async handlers to run
  await new Promise(r => setTimeout(r, 0));

  if (GR.cy.nodes().length !== 0) {
    throw new Error('Graph paste handler ran when input was focused');
  }

  console.log('Pasting into focused input does not paste nodes to graph');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
