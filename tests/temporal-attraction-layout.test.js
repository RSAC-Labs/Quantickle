const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

window.cytoscape = cytoscape;
require('../js/custom-layouts.js');
window.CustomLayouts.registerCustomLayouts();

const cy = cytoscape({ headless: true, styleEnabled: true });
cy.extent = () => ({ x1: 0, y1: 0, x2: 1000, y2: 1000, w: 1000, h: 1000 });
cy.container = () => ({ style: {}, querySelector: () => null, appendChild: () => {} });
cy.width = () => 1000;
cy.height = () => 1000;

cy.add([
  { data: { id: 'recent', type: 'test', timestamp: 1_700_000_000_000 }, position: { x: 0, y: 0 } },
  { data: { id: 'near', type: 'test', timestamp: 1_700_000_500_000 }, position: { x: 200, y: 0 } },
  { data: { id: 'distant', type: 'test', timestamp: 1_700_010_000_000 }, position: { x: -200, y: 0 } },
  { data: { id: 'bridge', type: 'test', timestamp: null }, position: { x: 0, y: 200 } },
  { data: { id: 'fallback', type: 'test', time: '2024-01-01T00:00:00Z' }, position: { x: 0, y: -200 } }
]);

cy.add([
  { data: { id: 'r-n', source: 'recent', target: 'near' } },
  { data: { id: 'r-d', source: 'recent', target: 'distant' } },
  { data: { id: 'r-b', source: 'recent', target: 'bridge' } },
  { data: { id: 'b-f', source: 'bridge', target: 'fallback' } }
]);

const options = {
  iterations: 60,
  timeSigma: 60 * 60 * 1000, // one hour window for strong attraction
  repulsionStrength: 8,
  baseAttraction: 0.04
};

window.CustomLayouts.temporalAttractionLayout.call(cy, options);

const distance = (a, b) => {
  const n1 = cy.getElementById(a);
  const n2 = cy.getElementById(b);
  if (n1.empty() || n2.empty()) {
    throw new Error('Test nodes missing after layout');
  }
  const dx = n1.position('x') - n2.position('x');
  const dy = n1.position('y') - n2.position('y');
  return Math.hypot(dx, dy);
};

const recentToNear = distance('recent', 'near');
const recentToDistant = distance('recent', 'distant');

if (!(recentToNear < recentToDistant)) {
  throw new Error('Temporal attraction layout did not cluster nodes with closer timestamps');
}

const fallbackToBridge = distance('fallback', 'bridge');
if (!Number.isFinite(fallbackToBridge)) {
  throw new Error('Temporal attraction layout produced invalid positions');
}

console.log('Temporal attraction layout groups nodes by timestamp proximity while keeping movement stable.');
process.exit(0);
