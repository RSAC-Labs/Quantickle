const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body><div id="cy"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

// Stub dependencies required by graph.js
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

global.cytoscape = opts => cytoscape({ ...opts, headless: true, styleEnabled: true });

require('../js/graph.js');
const GR = window.GraphRenderer;
GR.initializeCytoscape();

const cy = GR.cy;

cy.add([
  { data: { id: 'c1', type: 'container', width: 200, height: 200 }, position: { x: 0, y: 0 } },
  { data: { id: 'n1', parent: 'c1' }, position: { x: -300, y: -300 } },
  { data: { id: 'n2', parent: 'c1' }, position: { x: 300, y: 300 } }
]);

const n1Before = { ...cy.getElementById('n1').position() };
const n2Before = { ...cy.getElementById('n2').position() };

GR.arrangeContainerNodes(cy.getElementById('c1'));

const n1After = cy.getElementById('n1').position();
const n2After = cy.getElementById('n2').position();

const within = pos => Math.abs(pos.x) <= 100 && Math.abs(pos.y) <= 100;

if (!within(n1After) || !within(n2After)) {
  throw new Error('Container nodes not arranged within bounds');
}

if ((n1Before.x === n1After.x && n1Before.y === n1After.y) ||
    (n2Before.x === n2After.x && n2Before.y === n2After.y)) {
  throw new Error('Node positions unchanged after arrangeContainerNodes');
}

console.log('Container nodes arranged when identified by data.type');
process.exit(0);
