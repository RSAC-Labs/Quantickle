const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.requestAnimationFrame = cb => setTimeout(cb, 0);
window.cancelAnimationFrame = id => clearTimeout(id);

global.Config = {};

require('../js/3d-globe-layout.js');
const Globe = window.GlobeLayout3D;

const cy = cytoscape({ headless: true, styleEnabled: true });

// Initial container with two children near origin
cy.add([
  { data: { id: 'c1', type: 'container' }, classes: 'container', position: { x: 0, y: 0 } },
  { data: { id: 'n1', parent: 'c1' }, position: { x: -50, y: -50 } },
  { data: { id: 'n2', parent: 'c1' }, position: { x: 50, y: 50 } }
]);

Globe.init(cy);
Globe.applyTrue3DGlobeLayout({ centerX: 0, centerY: 0, radius: 100 }, cy.nodes());

// Rotate once to activate layout
Globe.rotateGlobe({ x: 0, y: 10, z: 0 });

const container1 = cy.getElementById('c1');
const c1Distances = container1.children().map(n => distance(n.position(), container1.position()));
const c1Max = Math.max(...c1Distances);

// Add second container far from origin with children
cy.add([
  { data: { id: 'c2', type: 'container' }, classes: 'container', position: { x: 1000, y: 1000 } },
  { data: { id: 'n3', parent: 'c2' }, position: { x: 1200, y: 1000 } },
  { data: { id: 'n4', parent: 'c2' }, position: { x: 1000, y: 1200 } }
]);

// Capture positions including newly added nodes
Globe.captureAbsolutePositions();

const container2 = cy.getElementById('c2');
const c2Distances = container2.children().map(n => distance(n.position(), container2.position()));
const c2Max = Math.max(...c2Distances);

// Rotate again and ensure nodes stay near their containers
Globe.rotateGlobe({ x: 0, y: 10, z: 0 });

const c1After = container1.children().map(n => distance(n.position(), container1.position()));
const c2After = container2.children().map(n => distance(n.position(), container2.position()));

c1After.forEach(d => {
  if (d > c1Max + 1e-6) {
    throw new Error('Existing node moved outside its container bounds after rotation');
  }
});

c2After.forEach(d => {
  if (d > c2Max + 1e-6) {
    throw new Error('Newly grouped node moved outside its container bounds after rotation');
  }
});

console.log('3D Globe layout handles new container correctly');
process.exit(0);

function distance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}
