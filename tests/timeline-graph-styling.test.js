const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body><div id="cy"></div></body></html>');
const { window } = dom;

global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

global.localStorage = { getItem: () => null, setItem: () => {} };
window.cytoscape = cytoscape;
require('../js/custom-layouts.js');
window.CustomLayouts.registerCustomLayouts();
require('../js/features/graph-modules/graph-styling/graph-styling-module.js');

const cy = cytoscape({ headless: true, styleEnabled: true });
cy.extent = () => ({ x1: 0, y1: 0, x2: 1000, y2: 1000, w: 1000, h: 1000 });
cy.container = () => document.getElementById('cy');

const gs = new window.GraphStylingModule({ cytoscape: cy, notifications: { show: () => {} } });

cy.add({ data: { id: 'n1', type: 'test', timestamp: 0 } });
window.CustomLayouts.timelineLayout.call(cy, {});

const bar = cy.getElementById('timeline-bar');
if (!bar) {
  throw new Error('Timeline bar missing before styling');
}
const initialBarWidth = parseFloat(bar.style('width'));

// Apply graph styling
if (!gs.applyGlowEffect()) {
  throw new Error('Failed to apply glow effect');
}

const barAfterGlow = cy.getElementById('timeline-bar');
if (!barAfterGlow) {
  throw new Error('Timeline bar missing after glow effect');
}
if (parseFloat(barAfterGlow.style('width')) !== initialBarWidth) {
  throw new Error('Timeline bar width changed after glow effect');
}

// Remove graph styling
if (!gs.removeGlowEffect()) {
  throw new Error('Failed to remove glow effect');
}
const barAfterRemove = cy.getElementById('timeline-bar');
if (!barAfterRemove) {
  throw new Error('Timeline bar missing after removing glow effect');
}
if (parseFloat(barAfterRemove.style('width')) !== initialBarWidth) {
  throw new Error('Timeline bar width changed after removing glow effect');
}

console.log('Timeline elements persist after graph styling');
process.exit(0);
