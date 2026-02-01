const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;
window.location = { origin: 'http://localhost' };

global.localStorage = { getItem: () => null, setItem: () => {} };

window.cytoscape = cytoscape;
require('../js/utils.js');
require('../js/custom-layouts.js');
window.CustomLayouts.registerCustomLayouts();
require('../js/graph-manager.js');
require('../js/features/node-editor/node-editor-module.js');

const cy = cytoscape({ headless: true, styleEnabled: true });
cy.extent = () => ({ x1: 0, y1: 0, x2: 1000, y2: 1000, w: 1000, h: 1000 });
cy.container = () => ({ style: {}, querySelector: () => null, appendChild: () => {} });
cy.destroyed = () => false;

window.GraphRenderer = { cy, supportsShadowStyles: false };

const baseGraph = {
  id: 'timeline-graph-1',
  title: 'Loaded Timeline Graph',
  nodes: [
    { data: { id: 'n1', type: 'entity', label: 'Event 1', lockedX: 42, timestamp: '2023-01-01' } },
    { data: { id: 'timeline-anchor-n1', type: 'timeline-anchor' } },
    { data: { id: 'timeline-bar-n1', type: 'timeline-bar', parent: 'timeline-anchor-n1' } }
  ],
  edges: [
    { data: { id: 'timeline-link-n1', source: 'timeline-anchor-n1', target: 'n1', type: 'timeline-link' } }
  ],
  metadata: { nodeCount: 3, edgeCount: 1 }
};

let persistedGraph = JSON.parse(JSON.stringify(baseGraph));

window.DataManager = {
  getGraphData() {
    return JSON.parse(JSON.stringify(persistedGraph));
  },
  setGraphData(data) {
    persistedGraph = JSON.parse(JSON.stringify(data));
  }
};

window.LayoutManager = {
  currentLayout: 'timeline',
  getCurrentLayout: () => 'timeline',
  updateLayoutDropdown: () => {}
};

window.LayoutManagerAdapter = null;

window.GraphManager.currentGraph = JSON.parse(JSON.stringify(baseGraph));

cy.add({ data: { id: 'n1', type: 'entity', label: 'Event 1', lockedX: 42, timestamp: '2023-01-01' }, position: { x: 10, y: 20 } });

const notifications = { show: () => {}, info: () => {}, warn: () => {}, error: () => {}, addMessage: () => {} };
const keyboardManager = { enable: () => {}, disable: () => {} };

const nodeEditor = new window.NodeEditorModule({ cytoscape: cy, notifications, keyboardManager, supportsShadowStyles: false });

cy.getElementById('n1').data('timestamp', '2024-05-01');

nodeEditor.synchronizeGraphData();

const latestGraph = window.DataManager.getGraphData();

if (!latestGraph.nodes.some(entry => {
  const data = entry && (entry.data || entry);
  return data && data.id === 'timeline-bar-n1' && data.type === 'timeline-bar';
})) {
  throw new Error('Timeline bar was stripped after synchronizing node edits');
}

if (!latestGraph.edges.some(entry => {
  const data = entry && (entry.data || entry);
  return data && data.id === 'timeline-link-n1' && data.type === 'timeline-link';
})) {
  throw new Error('Timeline link was stripped after synchronizing node edits');
}

const updatedNode = latestGraph.nodes.find(entry => {
  const data = entry && (entry.data || entry);
  return data && data.id === 'n1';
});

if (!updatedNode) {
  throw new Error('Primary node missing after synchronization');
}

const updatedData = updatedNode.data || updatedNode;

if (updatedData.lockedX !== 42) {
  throw new Error('lockedX metadata was removed during synchronization');
}

if (updatedData.timestamp !== '2024-05-01') {
  throw new Error('Timestamp edit was not persisted for primary node');
}

console.log('Timeline scaffolding and locks remain intact after node editor sync');
process.exit(0);
