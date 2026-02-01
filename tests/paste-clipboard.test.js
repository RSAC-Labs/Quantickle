const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

// Setup minimal DOM environment
const dom = new JSDOM('<!doctype html><html><body><div id="cy"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;
let externalText = 'external';
global.navigator = { clipboard: { readText: async () => externalText } };

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
  // Add and copy a node with custom properties
  const node = GR.addNode(0, 0, 'A', 'default', '#123456', 30, 'icon.png', 'triangle', '#ff00ff', 'info here');
  node.select();
  const cyContainer = GR.cy.container();

  // Trigger Ctrl+C to copy using internal logic
  const copyKeydown = new dom.window.KeyboardEvent('keydown', { key: 'c', ctrlKey: true });
  cyContainer.dispatchEvent(copyKeydown);

  // Simulate browser copy event
  const copyEvent = new dom.window.Event('copy');
  document.dispatchEvent(copyEvent);

  // Trigger Ctrl+V
  const keydown = new dom.window.KeyboardEvent('keydown', { key: 'v', ctrlKey: true });
  cyContainer.dispatchEvent(keydown);

  // Dispatch paste event with empty clipboardData to force readText()
  const pasteEvent = new dom.window.Event('paste');
  pasteEvent.clipboardData = { getData: () => '', types: [], files: [] };
  document.dispatchEvent(pasteEvent);

  // Allow async handlers to run
  await new Promise(r => setTimeout(r, 0));

  if (GR.cy.nodes().length !== 2) {
    throw new Error('Node was not pasted from internal clipboard');
  }

  // Ensure new node came from internal clipboard
  const newNode = GR.cy.nodes().filter(n => n.id() !== node.id())[0];
  if (newNode.data('label') !== 'A') {
    throw new Error('Paste used external clipboard instead of internal');
  }

  if (newNode.data('shape') !== 'triangle') {
    throw new Error('Pasted node shape was not preserved');
  }

  if (newNode.data('info') !== 'info here') {
    throw new Error('Pasted node info was not preserved');
  }

  console.log('Paste from internal clipboard adds node');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

