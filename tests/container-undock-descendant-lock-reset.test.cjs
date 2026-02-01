const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

require('../js/graph.js');
const GraphRenderer = window.GraphRenderer;

const cy = cytoscape({ headless: true, styleEnabled: true });
GraphRenderer.cy = cy;
GraphRenderer.setupContainerLocking();

cy.add([
  { data: { id: 'outer', label: 'Outer', width: 200, height: 200 }, position: { x: 0, y: 0 }, classes: 'container' },
  { data: { id: 'inner', label: 'Inner', parent: 'outer', width: 100, height: 100 }, position: { x: 0, y: 0 }, classes: 'container' },
  { data: { id: 'n1', parent: 'inner' }, position: { x: -50, y: -50 } },
  { data: { id: 'n2', parent: 'outer' }, position: { x: 50, y: 50 } }
]);

const outer = cy.getElementById('outer');
const inner = cy.getElementById('inner');
const n1 = cy.getElementById('n1');
const n2 = cy.getElementById('n2');

// Pre-lock state: mark one node as locked to ensure it stays locked
n2.lock();

const before = {
  outer: outer.locked(),
  inner: inner.locked(),
  n1: n1.locked(),
  n2: n2.locked()
};

GraphRenderer.toggleContainerCollapse(outer);
GraphRenderer.toggleContainerCollapse(outer);

if (outer.locked() !== before.outer) {
  throw new Error('Outer container did not restore its locked state after undocking');
}

if (inner.locked() !== before.inner) {
  throw new Error('Inner container did not restore its locked state after parent undocking');
}

if (n1.locked() !== before.n1) {
  throw new Error('Nested child node remained locked after container undocking');
}

if (n2.locked() !== before.n2) {
  throw new Error('Previously locked node did not retain its locked state after undocking');
}

if (outer.data('_descendantLockState')) {
  throw new Error('Outer container should clear descendant lock state after undocking');
}

console.log('container-undock-descendant-lock-reset.test.cjs passed');
process.exit(0);
