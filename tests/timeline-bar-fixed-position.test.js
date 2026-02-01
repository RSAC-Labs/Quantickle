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
cy.container = () => document.getElementById('cy');

cy.extent = () => ({ x1: 0, y1: 0, x2: 1200, y2: 800, w: 1200, h: 800 });

cy.add({ data: { id: 'n1', type: 'event', timestamp: 0 } });
cy.add({ data: { id: 'n2', type: 'event', timestamp: 1000 } });

window.CustomLayouts.timelineLayout.call(cy, {});

const bar = cy.getElementById('timeline-bar');
const anchor = cy.getElementById('timeline-anchor-n1');

if (!bar || !anchor) {
  throw new Error('Timeline scaffolding missing after layout');
}

const initialBarPosition = { ...bar.position() };
const initialAnchorPosition = { ...anchor.position() };

cy.extent = () => ({ x1: 300, y1: 0, x2: 1500, y2: 800, w: 1200, h: 800 });
cy.emit('pan');

const barAfter = cy.getElementById('timeline-bar');
const anchorAfter = cy.getElementById('timeline-anchor-n1');

const deltaBarX = Math.abs(barAfter.position('x') - initialBarPosition.x);
const deltaBarY = Math.abs(barAfter.position('y') - initialBarPosition.y);
const deltaAnchorX = Math.abs(anchorAfter.position('x') - initialAnchorPosition.x);

if (deltaBarX > 0.001) {
  throw new Error('Timeline bar shifted horizontally after pan event');
}

if (deltaBarY > 0.001) {
  throw new Error('Timeline bar shifted vertically after pan event');
}

if (deltaAnchorX > 0.001) {
  throw new Error('Timeline anchor moved horizontally with pan event');
}

console.log('Timeline bar remains fixed after pan updates');
process.exit(0);
