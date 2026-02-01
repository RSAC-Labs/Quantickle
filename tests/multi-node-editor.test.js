const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

// Setup DOM environment
const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;
global.localStorage = { getItem: () => null, setItem: () => {} };

// Stub dependencies
const notifications = { show: () => {} };
const keyboardManager = { disable: () => {}, enable: () => {} };

// Cytoscape setup
const createCy = opts => cytoscape({ ...opts, headless: true, styleEnabled: true });
const cy = createCy({ elements: [], container: document.createElement('div') });

// Load module under test
require('../js/features/node-editor/node-editor-module.js');
const editor = new window.NodeEditorModule({ cytoscape: cy, notifications, keyboardManager });

// Add two nodes and select them
cy.add([
  { data: { id: 'a', label: 'A', color: '#ff0000', size: 30, timestamp: '2024-01-01T00:00:00.000Z' } },
  { data: { id: 'b', label: 'B', color: '#00ff00', size: 30, timestamp: '2024-02-01T00:00:00.000Z' } }
]);
cy.nodes().select();
editor.showEditor();

const bulkColorInput = document.getElementById('bulk-node-color');
bulkColorInput.value = '#0000ff';
bulkColorInput.dataset.userChanged = 'true';

// Spy on batch operations
let startCalls = 0;
let endCalls = 0;
const origStart = cy.startBatch.bind(cy);
const origEnd = cy.endBatch.bind(cy);
cy.startBatch = () => { startCalls++; return origStart(); };
cy.endBatch = () => { endCalls++; return origEnd(); };

editor.saveChanges();

if (startCalls === 0 || endCalls === 0) {
  throw new Error('saveChanges did not use cytoscape batch operations');
}

if (!cy.nodes().every(n => n.data('color') === '#0000ff')) {
  throw new Error('Not all nodes were updated');
}

if (cy.getElementById('a').data('label') !== 'A' || cy.getElementById('b').data('label') !== 'B') {
  throw new Error('Labels should not change during bulk edit');
}

if (cy.getElementById('a').data('timestamp') !== '2024-01-01T00:00:00.000Z' ||
    cy.getElementById('b').data('timestamp') !== '2024-02-01T00:00:00.000Z') {
  throw new Error('Timestamps should not change during bulk edit');
}

console.log('Bulk node editor updates multiple nodes without changing labels');
process.exit(0);
