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
  { group: 'nodes', data: { id: 'a', type: 'item', timestamp: 0, parent: 'container' } },
  { group: 'nodes', data: { id: 'b', type: 'item', timestamp: 1000, parent: 'container' } }
]);

window.CustomLayouts.timelineLayout.call(cy, {});

const container = cy.getElementById('container');
const bar = cy.nodes('[type="timeline-bar"]').first();

if (!bar || bar.length === 0) {
  throw new Error('Timeline bar was not created for the container scope');
}

bar.move({ parent: null });
bar.data('_timelineScope', container.id());
if (typeof bar.lock === 'function') {
  bar.lock();
}

const originalMove = bar.move.bind(bar);
bar.move = args => {
  if (typeof bar.locked === 'function' && bar.locked()) {
    throw new Error('Timeline scaffolding move attempted while locked');
  }
  return originalMove(args);
};

const grabHandler = cy._timelineContainerGrabHandler;
if (typeof grabHandler !== 'function') {
  throw new Error('Timeline container grab handler is missing');
}

grabHandler({ target: container });

const barParent = typeof bar.parent === 'function' ? bar.parent() : null;
if (!barParent || barParent.id() !== container.id()) {
  throw new Error('Container grab should reparent scoped timeline bars to the container');
}

if (typeof bar.locked === 'function' && bar.locked()) {
  throw new Error('Container grab should unlock timeline bars before moving them');
}

const unlocks = cy._timelineContainerTimelineUnlocks;
if (!unlocks || !unlocks.has(container.id())) {
  throw new Error('Container grab should track timeline scaffolding unlocks for the container');
}

console.log('Container grab unlocks timeline scaffolding before moving it back under the container');
process.exit(0);
