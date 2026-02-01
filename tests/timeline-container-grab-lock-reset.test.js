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
require('../js/layouts.js');

const cy = cytoscape({ headless: true, styleEnabled: true });
cy.extent = () => ({ x1: 0, y1: 0, x2: 1000, y2: 1000, w: 1000, h: 1000 });
cy.container = () => document.getElementById('cy');

cy.add([
  { group: 'nodes', data: { id: 'container', type: 'container' } },
  { group: 'nodes', data: { id: 'n1', type: 'item', timestamp: 0, parent: 'container' } },
  { group: 'nodes', data: { id: 'n2', type: 'item', timestamp: 1000, parent: 'container' } }
]);

window.CustomLayouts.timelineLayout.call(cy, {});

const container = cy.getElementById('container');
const childOne = cy.getElementById('n1');
const childTwo = cy.getElementById('n2');

const grabHandler = cy._timelineContainerGrabHandler;
const freeHandler = cy._timelineContainerFreeHandler;

if (typeof grabHandler !== 'function' || typeof freeHandler !== 'function') {
  throw new Error('Timeline container handlers were not registered');
}

const initialLockedOne = childOne.data('lockedX');
const initialLockedTwo = childTwo.data('lockedX');

if (initialLockedOne === undefined || initialLockedTwo === undefined) {
  throw new Error('Timeline layout did not assign lockedX to container descendants');
}

grabHandler({ target: container });

if (childOne.data('lockedX') !== undefined || childTwo.data('lockedX') !== undefined) {
  throw new Error('Container grab should clear lockedX on descendants');
}

const shift = 120;
const newChildOneX = childOne.position('x') + shift;
const newChildTwoX = childTwo.position('x') + shift;
childOne.position({ x: newChildOneX, y: childOne.position('y') + 15 });
childTwo.position({ x: newChildTwoX, y: childTwo.position('y') - 10 });

freeHandler({ target: container });

const lockedAfterOne = childOne.data('lockedX');
const lockedAfterTwo = childTwo.data('lockedX');

if (lockedAfterOne !== newChildOneX || lockedAfterTwo !== newChildTwoX) {
  throw new Error('Container release should relock descendants to their new x positions');
}

if (childOne.position('x') !== newChildOneX || childTwo.position('x') !== newChildTwoX) {
  throw new Error('Container release should preserve descendant x positions');
}

childOne.position({ x: newChildOneX + 45, y: childOne.position('y') + 5 });
childOne.emit('drag');
childOne.emit('free');

if (childOne.position('x') !== newChildOneX) {
  throw new Error('Descendants should obey locked x after container release');
}

if (cy._timelineContainerLockedChildren && cy._timelineContainerLockedChildren.size !== 0) {
  throw new Error('Container lock bookkeeping should be cleared after release');
}

console.log('Timeline container grab temporarily releases lockedX and restores it on release');
process.exit(0);
