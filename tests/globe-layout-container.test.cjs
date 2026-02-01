const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

// Setup minimal DOM environment
const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.requestAnimationFrame = cb => setTimeout(cb, 0);
window.cancelAnimationFrame = id => clearTimeout(id);

global.Config = {};

// Load 3D globe layout script
require('../js/3d-globe-layout.js');
const Globe = window.GlobeLayout3D;

const cy = cytoscape({ headless: true, styleEnabled: true });

// Create container with two children and an outside node
cy.add([
  { data: { id: 'c1' }, classes: 'container', position: { x: 0, y: 0 } },
  { data: { id: 'n1', parent: 'c1' }, position: { x: -50, y: -50 } },
  { data: { id: 'n2', parent: 'c1' }, position: { x: 50, y: 50 } },
  { data: { id: 'n3' }, position: { x: 500, y: 500 } }
]);

Globe.init(cy);

// Apply globe layout to entire graph first
Globe.applyTrue3DGlobeLayout({ centerX: 0, centerY: 0, radius: 100 }, cy.nodes());
const outsideBefore = { ...cy.getElementById('n3').position() };

// Now apply layout to container only
const container = cy.getElementById('c1');
Globe.applyTrue3DGlobeLayout({ centerX: 0, centerY: 0, radius: 100 }, container.children());
const containerBefore = { ...container.position() };

// Rotate globe to trigger movement of active nodes
Globe.rotateGlobe({ x: 0, y: 10, z: 0 });
const outsideAfter = cy.getElementById('n3').position();
const containerAfter = container.position();

if (outsideBefore.x !== outsideAfter.x || outsideBefore.y !== outsideAfter.y) {
  throw new Error('Outside node moved during container-only 3D layout');
}

if (containerBefore.x !== containerAfter.x || containerBefore.y !== containerAfter.y) {
  throw new Error('Container moved during child rotation');
}

console.log('3D Globe layout applied to container; outside nodes and container position remain stable');
process.exit(0);
