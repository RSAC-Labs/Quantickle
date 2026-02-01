const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

// Set up minimal DOM
const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Load module under test
require('../js/features/graph-modules/graph-styling/graph-styling-module.js');
const GraphStylingModule = window.GraphStylingModule;

// Initialize Cytoscape and styling module
const cy = cytoscape({ headless: true, styleEnabled: true });
const notifications = { show: () => {} };
new GraphStylingModule({ cytoscape: cy, notifications });

// Simulate loading graph data with a container node
cy.json({
  elements: {
    nodes: [
      { data: { id: 'c1', type: 'container', width: 100, height: 100 }, classes: 'container' }
    ],
    edges: []
  }
});

// Border should be present after loading from file
const container = cy.getElementById('c1');
const borderWidth = parseFloat(container.style('border-width'));
if (Math.abs(borderWidth - 1) > 0.1) {
  throw new Error('Container border not applied after loading from file');
}

console.log('Container border applied after loading from file');
process.exit(0);
