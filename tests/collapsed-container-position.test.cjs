const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

// Setup DOM environment
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

// Load GraphRenderer
require('../js/graph.js');
const GraphRenderer = window.GraphRenderer;

// Create Cytoscape instance
const cy = cytoscape({ headless: true, styleEnabled: true });
GraphRenderer.cy = cy;
cy.width = () => 800;
cy.height = () => 600;

// Build sample graph with a container at a fixed position
cy.add([
  { data: { id: 'c1', label: 'Container', width: 200, height: 200 }, position: { x: 100, y: 100 }, classes: 'container' }
]);

const container = cy.getElementById('c1');
// Collapse the container
GraphRenderer.toggleContainerCollapse(container);

const dockedInfo = container.data('docked');
if (!dockedInfo || dockedInfo.side !== 'left') {
  throw new Error(`Collapsed container should dock to the left by default but got ${JSON.stringify(dockedInfo)}`);
}
if (container.locked()) {
  throw new Error('Collapsed container should remain moveable');
}

const initialPosition = { ...container.position() };

// Verify thick border, dark background, and label visibility
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

function check() {
  GraphRenderer.updateDockedContainerPositions();

  const zoom = cy.zoom();
  const width = parseFloat(container.style('width'));
  const height = parseFloat(container.style('height'));
  const position = container.position();
  const expectedBaseWidth = 100;
  const expectedBaseHeight = 30;
  if (Math.abs(width - (expectedBaseWidth / zoom)) > 0.1 || Math.abs(height - (expectedBaseHeight / zoom)) > 0.1) {
    throw new Error('Collapsed container should maintain constant rendered dimensions by scaling with zoom');
  }
  if (Math.abs(position.x - initialPosition.x) > 0.1 || Math.abs(position.y - initialPosition.y) > 0.1) {
    throw new Error(`Collapsed container should remain at its original coordinates (${initialPosition.x}, ${initialPosition.y}) but moved to (${position.x}, ${position.y})`);
  }

  const renderedWidth = container.renderedWidth();
  const renderedHeight = container.renderedHeight();
  const expectedRenderWidth = 100;
  const expectedRenderHeight = 30;
  if (Math.abs(renderedWidth - expectedRenderWidth) > 0.1 || Math.abs(renderedHeight - expectedRenderHeight) > 0.1) {
    throw new Error(`Container screen size expected ${expectedRenderWidth}x${expectedRenderHeight} got ${renderedWidth}x${renderedHeight}`);
  }
}

// Initial state at zoom 1
check();

// Pan and verify the container moves with the graph
cy.pan({ x: 50, y: 25 });
check();

// Zoom and verify size scales and position updates
cy.zoom(2);
check();

console.log('collapsed-container-position.test.cjs passed');
process.exit(0);
