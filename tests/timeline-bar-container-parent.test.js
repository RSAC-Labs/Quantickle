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
  { data: { id: 'container-1', type: 'container' }, position: { x: 0, y: 0 } },
  { data: { id: 'container-2', type: 'container' }, position: { x: 0, y: 0 } },

  { data: { id: 'timeline-1', type: 'event', timestamp: 0, parent: 'container-1' }, position: { x: -50, y: 0 } },
  { data: { id: 'timeline-2', type: 'event', timestamp: 1000, parent: 'container-1' }, position: { x: 50, y: 0 } },

  // Unrelated node under a different parent should not affect scaffolding parent detection
  { data: { id: 'other-node', type: 'note', parent: 'container-2' }, position: { x: 100, y: 100 } }
]);

window.CustomLayouts.timelineLayout.call(cy, {});

const barNode = cy.getElementById('timeline-bar-container-1');
if (barNode.length === 0) {
  throw new Error('Timeline bar was not created.');
}

const barParent = barNode.parent && barNode.parent();
if (!barParent || barParent.length === 0) {
  throw new Error('Timeline bar was not assigned a parent.');
}

if (barParent.id() !== 'container-1') {
  throw new Error('Timeline bar parent was not the container node.');
}

if (typeof barNode.locked === 'function' && barNode.locked()) {
  throw new Error('Timeline bar should not be locked to allow it to follow container movement.');
}

const containerNode = cy.getElementById('container-1');
if (!containerNode || containerNode.length === 0) {
  throw new Error('Container node was not found.');
}

const grabHandler = cy._timelineContainerGrabHandler;
const freeHandler = cy._timelineContainerFreeHandler;

if (typeof grabHandler !== 'function' || typeof freeHandler !== 'function') {
  throw new Error('Timeline container handlers were not registered.');
}

window.GraphManager = { _isRestoring: true };

const barDuringRestore = cy.getElementById('timeline-bar-container-1');
const barPositionBeforeMove = { x: barDuringRestore.position('x'), y: barDuringRestore.position('y') };

if (typeof barDuringRestore.locked === 'function' && barDuringRestore.locked()) {
  throw new Error('Timeline bar should remain unlocked when restore begins.');
}
const containerPositionBeforeMove = {
  x: containerNode.position('x'),
  y: containerNode.position('y')
};

const newContainerPosition = {
  x: containerPositionBeforeMove.x + 120,
  y: containerPositionBeforeMove.y + 75
};

grabHandler({ target: containerNode });

containerNode.position(newContainerPosition);

const barPositionAfterMove = { x: barDuringRestore.position('x'), y: barDuringRestore.position('y') };
const containerPositionAfterMove = {
  x: containerNode.position('x'),
  y: containerNode.position('y')
};

const deltaX = containerPositionAfterMove.x - containerPositionBeforeMove.x;
const deltaY = containerPositionAfterMove.y - containerPositionBeforeMove.y;
const barDeltaX = barPositionAfterMove.x - barPositionBeforeMove.x;
const barDeltaY = barPositionAfterMove.y - barPositionBeforeMove.y;
const tolerance = 1e-6;

if (Math.abs(deltaX) <= tolerance && Math.abs(deltaY) <= tolerance) {
  throw new Error('Container did not move during restore simulation.');
}

if (Math.abs(barDeltaX - deltaX) > tolerance || Math.abs(barDeltaY - deltaY) > tolerance) {
  throw new Error('Timeline bar should move with the container while the graph is restoring.');
}

freeHandler({ target: containerNode });

const barPositionAfterFree = { x: barDuringRestore.position('x'), y: barDuringRestore.position('y') };

if (
  Math.abs(barPositionAfterFree.x - (barPositionBeforeMove.x + deltaX)) > tolerance ||
  Math.abs(barPositionAfterFree.y - (barPositionBeforeMove.y + deltaY)) > tolerance
) {
  throw new Error('Timeline bar should stay aligned with the container immediately after release during restore.');
}

if (typeof barDuringRestore.locked === 'function' && barDuringRestore.locked()) {
  throw new Error('Timeline bar should remain unlocked after container release during restore.');
}

window.GraphManager._isRestoring = false;

const barPositionAfterRestore = { x: barDuringRestore.position('x'), y: barDuringRestore.position('y') };

if (
  Math.abs(barPositionAfterRestore.x - (barPositionBeforeMove.x + deltaX)) > tolerance ||
  Math.abs(barPositionAfterRestore.y - (barPositionBeforeMove.y + deltaY)) > tolerance
) {
  throw new Error('Timeline bar should remain aligned with the container after restore completes.');
}

delete window.GraphManager;

const anchorNode = cy.getElementById('timeline-anchor-timeline-1');
if (anchorNode.length === 0) {
  throw new Error('Timeline anchor was not created for the child node.');
}

const anchorParent = anchorNode.parent && anchorNode.parent();
if (!anchorParent || anchorParent.length === 0 || anchorParent.id() !== 'container-1') {
  throw new Error('Timeline anchor parent was not preserved on the container node.');
}

const tickNodes = cy.nodes('[type="timeline-tick"]');
if (tickNodes.length === 0) {
  throw new Error('Timeline ticks were not created.');
}

const tickParent = tickNodes[0].parent && tickNodes[0].parent();
if (!tickParent || tickParent.length === 0 || tickParent.id() !== 'container-1') {
  throw new Error('Timeline tick parent was not preserved on the container node.');
}

const sampleTick = tickNodes[0];
if (typeof sampleTick.locked === 'function' && sampleTick.locked()) {
  throw new Error('Timeline ticks should not be locked so they follow container movement.');
}

console.log('Timeline scaffolding respects container parent.');
process.exit(0);
