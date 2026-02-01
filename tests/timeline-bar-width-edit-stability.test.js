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

const cy = cytoscape({ headless: true, styleEnabled: true });
let extentWidth = 1000;
cy.extent = () => ({ x1: 0, y1: 0, x2: extentWidth, y2: 600, w: extentWidth, h: 600 });
cy.container = () => document.getElementById('cy');

cy.add([
  { data: { id: 'event-1', type: 'event', timestamp: '2020-01-01T00:00:00Z' }, position: { x: 0, y: 0 } },
  { data: { id: 'event-2', type: 'event', timestamp: '2021-01-01T00:00:00Z' }, position: { x: 100, y: 0 } }
]);

window.CustomLayouts.timelineLayout.call(cy, {});
const barNode = cy.getElementById('timeline-bar');
if (barNode.length === 0) {
  throw new Error('Timeline bar missing after initial layout.');
}

const initialLength = barNode.data('barLength');
if (!Number.isFinite(initialLength)) {
  throw new Error('Initial timeline bar length is not finite.');
}

// Simulate the viewport being resized while editing a node.
extentWidth = 320;
const node = cy.getElementById('event-1');
node.data('label', 'Edited label');

window.CustomLayouts.timelineLayout.call(cy, {});
const updatedBar = cy.getElementById('timeline-bar');
if (updatedBar.length === 0) {
  throw new Error('Timeline bar missing after reapplying layout.');
}

const updatedLength = updatedBar.data('barLength');
if (!Number.isFinite(updatedLength)) {
  throw new Error('Updated timeline bar length is not finite.');
}

const tolerance = 1e-6;
if (Math.abs(updatedLength - initialLength) > tolerance) {
  throw new Error('Timeline bar length changed after node edit triggered layout reapply.');
}

console.log('Timeline bar length remains stable after node edits trigger layout reapply.');
process.exit(0);
