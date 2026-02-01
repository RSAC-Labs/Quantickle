const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

global.localStorage = { getItem: () => null, setItem: () => {} };

window.cytoscape = cytoscape;
require('../js/custom-layouts.js');
window.CustomLayouts.registerCustomLayouts();
require('../js/features/graph-modules/graph-styling/graph-styling-module.js');

const cy = cytoscape({ headless: true, styleEnabled: true });
cy.extent = () => ({ x1: 0, y1: 0, x2: 1000, y2: 1000, w: 1000, h: 1000 });
cy.container = () => ({ style: {}, querySelector: () => null, appendChild: () => {} });

new window.GraphStylingModule({ cytoscape: cy, notifications: { show: () => {} } });

cy.add([
  { data: { id: 'n1', type: 'test', timestamp: 0 } },
  { data: { id: 'n2', type: 'test', timestamp: 1000 } }
]);

window.CustomLayouts.timelineLayout.call(cy, {});

const node = cy.getElementById('n1');
if (node.length === 0) {
  throw new Error('Primary node missing after initial timeline layout');
}

const originalY = node.position('y');
const manualY = originalY + 120;
const lockedXBefore = node.data('lockedX');

node.position({ x: node.position('x'), y: manualY });

window.CustomLayouts.timelineLayout.call(cy, {});

const finalY = node.position('y');
if (Math.abs(finalY - manualY) > 0.001) {
  throw new Error('Timeline layout did not preserve manual Y offset');
}

const lockedXAfter = node.data('lockedX');
if (typeof lockedXAfter !== 'number') {
  throw new Error('Timeline node lost lockedX after preserving Y');
}

if (typeof lockedXBefore === 'number' && Math.abs(lockedXAfter - lockedXBefore) > 0.001) {
  throw new Error('Timeline node lockedX changed unexpectedly when preserving Y');
}

const finalX = node.position('x');
if (Math.abs(finalX - lockedXAfter) > 0.001) {
  throw new Error('Timeline node X position drifted from lockedX when preserving Y');
}

const link = cy.getElementById('timeline-link-n1');
if (link.length === 0) {
  throw new Error('Timeline link missing after preserving Y');
}

console.log('Timeline layout preserves manual Y positions when requested');
process.exit(0);
