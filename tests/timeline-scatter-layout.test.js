const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

window.cytoscape = cytoscape;
require('../js/custom-layouts.js');
window.CustomLayouts.registerCustomLayouts();

const cy = cytoscape({ headless: true });
cy.extent = () => ({ x1: 0, y1: 0, x2: 1000, y2: 1000, w: 1000, h: 1000 });
cy.width = () => 1000;
cy.height = () => 1000;

cy.add([
  { data: { id: 'a', timestamp: 0, similarity: 0 } },
  { data: { id: 'b', timestamp: 1, similarity: 1 } },
  { data: { id: 'c', timestamp: 2, category: 'alpha' } },
  { data: { id: 'd', timestamp: 3, category: 'beta' } },
  { data: { id: 'bar', type: 'timeline-bar', size: 5 } }
]);

window.CustomLayouts.timelineScatterLayout.call(cy, {
  xScale: 1,
  yScale: 10,
  jitter: 0,
  barStyle: { color: '#123456', height: 7 }
});

const nodeA = cy.getElementById('a');
const nodeB = cy.getElementById('b');
const nodeC = cy.getElementById('c');
const nodeD = cy.getElementById('d');
const bar = cy.getElementById('bar');

const xDiff = Math.abs(nodeB.position('x') - nodeA.position('x'));
if (xDiff !== 1000) {
  throw new Error(`Expected timestamps to map directly to x positions (got ${xDiff})`);
}

const yDiffSimilarity = Math.abs(nodeB.position('y') - nodeA.position('y'));
if (yDiffSimilarity !== 10) {
  throw new Error(`Similarity-based spread should use yScale (diff ${yDiffSimilarity})`);
}

const yDiffCategory = Math.abs(nodeD.position('y') - nodeC.position('y'));
if (yDiffCategory !== 10) {
  throw new Error(`Category lanes should be evenly spaced (diff ${yDiffCategory})`);
}

if (Math.round(bar.position('x')) !== 1500 || Math.round(bar.position('y')) !== 500) {
  throw new Error('Timeline bar should align to scatter layout center and span time range');
}

if (bar.data('size') !== 7 || bar.data('color') !== '#123456') {
  throw new Error('Bar styling options should be applied to existing timeline bars');
}

console.log('Timeline scatter layout maps timestamps with configurable scaling and styling');
process.exit(0);
