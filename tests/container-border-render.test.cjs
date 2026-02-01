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

// Add a container node without explicit dimensions
const container = cy.add({ data: { id: 'c1', type: 'container' }, classes: 'container' });

// Border should be applied immediately on render
const borderWidth = parseFloat(container.style('border-width'));
if (Math.abs(borderWidth - 1) > 0.1) {
  throw new Error('Container border not applied on render');
}

console.log('Container border applied on render');
process.exit(0);
