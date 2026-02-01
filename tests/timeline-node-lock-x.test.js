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
cy.container = () => ({ style: {}, querySelector: () => null, appendChild: () => {} });

cy.add({ data: { id: 'n1', type: 'test', timestamp: 0 } });
window.CustomLayouts.timelineLayout.call(cy, {});

const node = cy.getElementById('n1');
const lockedX = node.data('lockedX');
const desiredY = node.position('y') + 50;

node.position({ x: lockedX + 100, y: desiredY });
node.emit('drag');
node.emit('free');

if (node.position('x') !== lockedX) {
  throw new Error('Timeline node x-coordinate was not locked');
}
if (node.position('y') !== desiredY) {
  throw new Error('Timeline node y-coordinate did not update');
}

console.log('Timeline node locks x-coordinate while allowing vertical movement');
process.exit(0);
