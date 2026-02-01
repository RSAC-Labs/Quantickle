const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body><div id="cy"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.navigator = { clipboard: { readText: () => Promise.resolve('') } };

global.DOMPurify = { sanitize: (value) => value };

require('../js/graph.js');

const cy = cytoscape({ headless: true, styleEnabled: true });
window.GraphRenderer.cy = cy;
window.GraphRenderer.setupContainerLocking();

cy.add([
  { data: { id: 'outerA' }, classes: 'container', position: { x: 0, y: 0 } },
  { data: { id: 'innerA', parent: 'outerA' }, classes: 'container', position: { x: 10, y: 10 } },
  { data: { id: 'leafA', parent: 'innerA' }, position: { x: 20, y: 20 } },
  { data: { id: 'outerB' }, classes: 'container', position: { x: 200, y: 0 } },
  { data: { id: 'innerB', parent: 'outerB' }, classes: 'container', position: { x: 210, y: 10 } }
]);

const outerA = cy.getElementById('outerA');
const innerA = cy.getElementById('innerA');

if (innerA.locked()) {
  throw new Error('Inner container should start unlocked');
}

outerA.data('pinned', true);
outerA.lock();

if (!innerA.locked()) {
  throw new Error('Inner container should lock when ancestor is pinned');
}

// Simulate a regression where the ancestor pin adds a pinned flag to the child
innerA.data('pinned', true);
innerA.lock();

outerA.data('pinned', false);
outerA.unlock();

if (innerA.locked()) {
  throw new Error('Inner container should unlock when ancestor is unpinned');
}

if (innerA.data('pinned')) {
  throw new Error('Inner container pinned flag should reset after ancestor unpin');
}

const outerB = cy.getElementById('outerB');
const innerB = cy.getElementById('innerB');

innerB.data('pinned', true);
innerB.lock();

outerB.data('pinned', true);
outerB.lock();

outerB.data('pinned', false);
outerB.unlock();

if (innerB.locked()) {
  throw new Error('Previously pinned inner container should unlock when ancestor is unpinned');
}

if (innerB.data('pinned')) {
  throw new Error('Previously pinned inner container should reset pinned flag after ancestor unpin');
}

console.log('Nested container pin states restore correctly after ancestor unpin');
process.exit(0);
