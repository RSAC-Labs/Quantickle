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
cy.width = () => 800;
cy.height = () => 600;

// Build sample graph with a container and a child node
cy.add([
  { data: { id: 'c1', label: 'Container', width: 200, height: 200 }, classes: 'container' },
  { data: { id: 'n1', parent: 'c1' } },
  { data: { id: 'n2' } },
  { data: { id: 'e1', source: 'n1', target: 'n2' } }
]);

const container = cy.getElementById('c1');
const child = cy.getElementById('n1');
const edge = cy.getElementById('e1');

const initialPosition = { ...container.position() };

// Zoom graph before collapsing to ensure size is not zoom-compensated
cy.zoom(2);

// Collapse container
GraphRenderer.toggleContainerCollapse(container);
if (child.style('display') !== 'none') {
  throw new Error('Child should be hidden when container is collapsed');
}
if (edge.style('display') !== 'none') {
  throw new Error('Edge should be hidden when container is collapsed');
}
const zoom = cy.zoom();
const modelWidth = parseFloat(container.style('width'));
const modelHeight = parseFloat(container.style('height'));
if (Math.abs(modelWidth - (100 / zoom)) > 0.1 || Math.abs(modelHeight - (30 / zoom)) > 0.1) {
  throw new Error('Collapsed container should scale dimensions based on zoom to maintain a 100x30 screen size');
}
const renderedWidth = container.renderedWidth();
const renderedHeight = container.renderedHeight();
if (Math.abs(renderedWidth - 100) > 0.1 || Math.abs(renderedHeight - 30) > 0.1) {
  throw new Error('Collapsed container should render at 100x30 pixels');
}
if (container.data('label') !== 'Container') {
  throw new Error('Collapsed container should display the container label');
}
const renderedBorderWidth = parseFloat(container.renderedStyle('border-width'));
if (Math.abs(renderedBorderWidth - 2) > 0.1) {
  throw new Error('Collapsed container should render with a 2px border');
}
const backgroundColor = (container.style('background-color') || '').toLowerCase().replace(/\s+/g, '');
if (backgroundColor !== '#000000' && backgroundColor !== 'rgb(0,0,0)') {
  throw new Error('Collapsed container should use the docked background color');
}
const labelColor = (container.style('color') || '').toLowerCase().replace(/\s+/g, '');
if (labelColor !== '#ffffff' && labelColor !== 'rgb(255,255,255)') {
  throw new Error('Collapsed container label should be white');
}
const renderedFontSize = parseFloat(container.renderedStyle('font-size'));
if (Math.abs(renderedFontSize - 14) > 0.1) {
  throw new Error('Collapsed container label font size should remain 14px regardless of zoom');
}
const fontWeight = (container.renderedStyle('font-weight') || '').toLowerCase();
if (fontWeight !== 'bold' && fontWeight !== '700') {
  throw new Error('Collapsed container label should be bold');
}
if (container.locked()) {
  throw new Error('Collapsed container should be draggable when docked');
}
const collapsedPosition = container.position();
if (Math.abs(collapsedPosition.x - initialPosition.x) > 0.1 || Math.abs(collapsedPosition.y - initialPosition.y) > 0.1) {
  throw new Error('Collapsed container should remain at its previous coordinates');
}


// Expand container
GraphRenderer.toggleContainerCollapse(container);
if (child.style('display') !== 'element') {
  throw new Error('Child should be visible when container is expanded');
}
if (edge.style('display') !== 'element') {
  throw new Error('Edge should be visible when container is expanded');
}

console.log('Container collapse/expand toggles correctly');
process.exit(0);
