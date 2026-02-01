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
  { data: { id: 'early', type: 'test', timestamp: 0 } },
  { data: { id: 'mid', type: 'test', timestamp: 50 } },
  { data: { id: 'late', type: 'test', timestamp: 100 }, position: { x: 900, y: 100 } }
]);

const late = cy.getElementById('late');
late.lock();

window.CustomLayouts.timelineLayout.call(cy, {});

const mid = cy.getElementById('mid');
if (mid.position('x') > 800) {
  throw new Error('Timeline did not extend to include locked node timestamp');
}

const anchor = cy.getElementById('timeline-anchor-late');
const link = cy.getElementById('timeline-link-late');
const bar = cy.getElementById('timeline-bar');

if (link.source().id() !== anchor.id()) {
  throw new Error('Locked node link source is not anchor');
}
if (Math.abs(anchor.position('x') - late.position('x')) > 0.1) {
  throw new Error('Anchor not aligned horizontally with locked node');
}
if (Math.abs(anchor.position('y') - bar.position('y')) > 0.1) {
  throw new Error('Anchor not on timeline bar');
}

console.log('Locked node extends timeline and retains vertical link');
process.exit(0);
