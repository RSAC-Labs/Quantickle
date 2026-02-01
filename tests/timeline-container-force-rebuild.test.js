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
  { data: { id: 'container-1', type: 'container', width: 200, height: 150 }, position: { x: 100, y: 50 } },
  { data: { id: 'event-1', type: 'event', timestamp: 0, parent: 'container-1' }, position: { x: 50, y: 0 } },
  { data: { id: 'event-2', type: 'event', timestamp: 1000, parent: 'container-1' }, position: { x: 150, y: 0 } }
]);

const container = cy.getElementById('container-1');
container.data('width', 200);
container.data('height', 150);
container.position({ x: 100, y: 50 });

const boundingBox = {
  x1: 100 - 200 / 2,
  y1: 50 - 150 / 2,
  w: 200,
  h: 150
};

window.CustomLayouts.timelineLayout.call(cy, {
  eles: container.children(),
  boundingBox
});

const barNode = cy.getElementById('timeline-bar-container-1');
if (!barNode || barNode.length === 0) {
  throw new Error('Timeline bar was not created for the containerized timeline.');
}

const initialBarLength = barNode.data('barLength');
if (!Number.isFinite(initialBarLength)) {
  throw new Error('Timeline bar length is not finite after initial layout.');
}

container.data('width', 400);
const rebuildBoundingBox = {
  x1: 100 - 400 / 2,
  y1: 50 - 150 / 2,
  w: 400,
  h: 150
};

window.CustomLayouts.timelineLayout.call(cy, {
  eles: container.children(),
  boundingBox: rebuildBoundingBox,
  forceRebuild: true
});

const rebuiltBar = cy.getElementById('timeline-bar-container-1');
if (!rebuiltBar || rebuiltBar.length === 0) {
  throw new Error('Timeline bar is missing after forced rebuild.');
}

const rebuiltBarLength = rebuiltBar.data('barLength');
if (!Number.isFinite(rebuiltBarLength)) {
  throw new Error('Timeline bar length is not finite after forced rebuild.');
}

if (rebuiltBarLength <= initialBarLength) {
  throw new Error('Timeline bar length did not expand after a forced rebuild with a larger container.');
}

console.log('Container timeline rebuild recalculates bar length when forceRebuild is requested.');
process.exit(0);
