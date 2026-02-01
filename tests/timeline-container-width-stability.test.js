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
cy.extent = () => ({ x1: 0, y1: 0, x2: 1000, y2: 1000, w: 1000, h: 1000 });
cy.container = () => document.getElementById('cy');

cy.add([
  { data: { id: 'container-1', type: 'container', width: 300, height: 200 }, position: { x: 100, y: 50 } },
  { data: { id: 'event-1', type: 'event', timestamp: 0, parent: 'container-1' }, position: { x: 50, y: 0 } },
  { data: { id: 'event-2', type: 'event', timestamp: 1000, parent: 'container-1' }, position: { x: 150, y: 0 } }
]);

const container = cy.getElementById('container-1');
container.data('width', 300);
container.data('height', 200);
container.position({ x: 100, y: 50 });

const boundingBox = {
  x1: 100 - 300 / 2,
  y1: 50 - 200 / 2,
  w: 300,
  h: 200
};

window.CustomLayouts.timelineLayout.call(cy, {
  eles: container.children(),
  boundingBox
});

const barNode = cy.getElementById('timeline-bar-container-1');
if (barNode.length === 0) {
  throw new Error('Timeline bar was not created for the containerized timeline.');
}

const initialBarLength = barNode.data('barLength');
if (!Number.isFinite(initialBarLength)) {
  throw new Error('Timeline bar length is not finite after initial layout.');
}

const initialContainerBounds = container.boundingBox({ includeLabels: false, includeOverlays: false });
if (!Number.isFinite(initialContainerBounds.w)) {
  throw new Error('Container width is not finite after initial layout.');
}

const tolerance = 1e-6;

cy.emit('pan');

const barLengthAfterPan = barNode.data('barLength');
if (!Number.isFinite(barLengthAfterPan)) {
  throw new Error('Timeline bar length is not finite after pan event.');
}

if (Math.abs(barLengthAfterPan - initialBarLength) > tolerance) {
  throw new Error('Timeline bar length changed after timeline update event within container.');
}

const containerBounds = container.boundingBox({ includeLabels: false, includeOverlays: false });
if (!Number.isFinite(containerBounds.w)) {
  throw new Error('Container width is not finite after timeline update.');
}

if (Math.abs(containerBounds.w - initialContainerBounds.w) > 1) {
  throw new Error('Container width drifted after timeline update.');
}

console.log('Timeline bar length remains stable within container after update events.');
process.exit(0);
