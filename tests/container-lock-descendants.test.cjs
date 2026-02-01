const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

// Basic DOM setup for Cytoscape
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Load GraphRenderer
require('../js/graph.js');
const GraphRenderer = window.GraphRenderer;

const cy = cytoscape({ headless: true, styleEnabled: true });
GraphRenderer.cy = cy;
GraphRenderer.setupContainerLocking();

// Build graph with a container, two children, and an outside node
cy.add([
  { data: { id: 'c1' }, classes: 'container' },
  { data: { id: 'n1', parent: 'c1' } },
  { data: { id: 'n2', parent: 'c1' } },
  { data: { id: 'n3' } },
  { data: { id: 'e1', source: 'n1', target: 'n2' } },
  { data: { id: 'e2', source: 'n2', target: 'n3' } }
]);

const c1 = cy.getElementById('c1');
const n1 = cy.getElementById('n1');
const n2 = cy.getElementById('n2');
const e1 = cy.getElementById('e1');
const e2 = cy.getElementById('e2');

// Pre-lock states
n2.lock();
e2.lock();

// Lock container and ensure all descendants are locked
c1.lock();
if (!n1.locked() || !n2.locked() || !e1.locked() || !e2.locked()) {
  throw new Error('Locking container did not lock all descendants');
}

// Unlock container and ensure previous states are restored
c1.unlock();
if (n1.locked()) {
  throw new Error('n1 should be unlocked after container unlock');
}
if (!n2.locked()) {
  throw new Error('n2 should remain locked after container unlock');
}
if (e1.locked()) {
  throw new Error('e1 should be unlocked after container unlock');
}
if (!e2.locked()) {
  throw new Error('e2 should remain locked after container unlock');
}

console.log('Container lock/unlock cascades to descendants');
process.exit(0);
