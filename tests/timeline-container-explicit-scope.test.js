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
  { group: 'nodes', data: { id: 'container', type: 'container', isContainer: true, width: 400, height: 200 }, position: { x: 300, y: 300 } },
  { group: 'nodes', data: { id: 'inside', type: 'item', timestamp: 0, parent: 'container' }, position: { x: 250, y: 310 } },
  { group: 'nodes', data: { id: 'outside', type: 'item', timestamp: 1000 }, position: { x: 600, y: 320 } }
]);

const scopeCollection = cy.collection([cy.getElementById('inside'), cy.getElementById('outside')]);

window.CustomLayouts.timelineLayout.call(cy, {
  eles: scopeCollection,
  boundingBox: { x1: 100, y1: 200, w: 400, h: 200 },
  scaffoldingParentId: 'container'
});

const bars = cy.nodes('[type="timeline-bar"]');
if (bars.length === 0) {
  throw new Error('Timeline layout did not create any bars');
}

const bar = bars[0];
if (!bar || bar.data('_timelineScope') !== 'container') {
  throw new Error('Timeline scope did not honor explicit scaffolding parent');
}

const parent = bar.parent();
if (!parent || parent.id() !== 'container') {
  throw new Error('Timeline bar should be parented to the provided container scope');
}

console.log('Timeline layout applies explicit container scope to scaffolding when provided');
process.exit(0);
