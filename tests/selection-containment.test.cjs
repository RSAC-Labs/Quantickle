const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

// Minimal DOM required for graph.js initialisation
const dom = new JSDOM('<!doctype html><html><body><div id="graph"></div></body></html>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;

// Stub configuration and dependencies expected by graph.js
window.QuantickleConfig = {};
window.UI = window.UI || {};
window.UI.showNotification = () => {};
window.GraphRenderer = undefined;
window.GraphEditorAdapter = window.GraphEditorAdapter || {};
window.GraphEditorAdapter.addContainer = () => null;

// Provide a very small Cytoscape stub for graph.js initialisation.
window.cytoscape = () => ({
  on: () => {},
  off: () => {},
  destroy: () => {},
  container: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }) })
});

// Load graph.js which defines GraphRenderer.moveNodesIntoContainer
require('../js/graph.js');

const GraphRenderer = window.GraphRenderer;

// Use a real Cytoscape instance for hierarchy assertions
const cy = cytoscape({ headless: true, styleEnabled: true });
GraphRenderer.cy = cy;

// Create nested container structure
cy.add([
  { data: { id: 'inner' }, classes: 'container' },
  { data: { id: 'child', parent: 'inner' } },
  { data: { id: 'sibling' } }
]);

// Newly created wrapper container
const wrapper = cy.add({ data: { id: 'wrapper' }, classes: 'container' });

// Simulate a box selection that includes the inner container and its child node
const selection = cy.$('#inner, #child, #sibling');
GraphRenderer.moveNodesIntoContainer(selection, wrapper);

if (cy.getElementById('inner').parent().id() !== 'wrapper') {
  throw new Error('Inner container was not moved into the wrapper');
}

if (cy.getElementById('child').parent().id() !== 'inner') {
  throw new Error('Child node should remain inside the inner container');
}

if (cy.getElementById('sibling').parent().id() !== 'wrapper') {
  throw new Error('Sibling node should move directly into the wrapper container');
}

console.log('Selection containment preserves nested containers');
process.exit(0);
