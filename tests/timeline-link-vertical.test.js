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

cy.add({ data: { id: 'n1', type: 'test', timestamp: 0 } });
window.CustomLayouts.timelineLayout.call(cy, {});

const node = cy.getElementById('n1');
const link = cy.getElementById('timeline-link-n1');
const anchor = cy.getElementById('timeline-anchor-n1');
const bar = cy.getElementById('timeline-bar');

if (link.source().id() !== anchor.id()) {
  throw new Error('Timeline link source is not anchor');
}

const initialX = node.position('x');
if (Math.abs(anchor.position('x') - initialX) > 0.1) {
  throw new Error('Anchor not aligned horizontally with node');
}

if (Math.abs(anchor.position('y') - bar.position('y')) > 0.1) {
  throw new Error('Anchor not on timeline bar');
}

node.position({ x: initialX, y: node.position('y') - 100 });

if (Math.abs(anchor.position('x') - node.position('x')) > 0.1) {
  throw new Error('Timeline link not vertical after node move');
}

if (Math.abs(anchor.position('y') - bar.position('y')) > 0.1) {
  throw new Error('Anchor moved vertically with node');
}

console.log('Timeline link remains vertical when node is repositioned');
process.exit(0);
