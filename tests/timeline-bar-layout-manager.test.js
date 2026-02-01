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
require('../js/features/graph-modules/graph-styling/graph-styling-module.js');
require('../js/features/graph-area-editor/graph-area-editor-module.js');

const cy = cytoscape({ headless: true, styleEnabled: true });
cy.extent = () => ({ x1: 0, y1: 0, x2: 1000, y2: 1000, w: 1000, h: 1000 });
cy.container = () => document.getElementById('cy');

new window.GraphStylingModule({ cytoscape: cy, notifications: { show: () => {} } });
const ga = new window.GraphAreaEditorModule({ cytoscape: cy, notifications: { show: () => {} }, config: {} });

window.LayoutManager.currentLayout = 'timeline';

cy.add({ data: { id: 'n1', type: 'test', timestamp: 0 } });
window.CustomLayouts.timelineLayout.call(cy, {});

const bar = cy.getElementById('timeline-bar');
if (!bar) {
  throw new Error('Timeline bar missing before update');
}
const initialWidth = parseFloat(bar.style('width'));

ga.applySettings({ backgroundColor: '#ffffff' }, { save: false });

const barAfter = cy.getElementById('timeline-bar');
if (!barAfter) {
  throw new Error('Timeline bar missing after update');
}
const updatedWidth = parseFloat(barAfter.style('width'));
if (updatedWidth !== initialWidth) {
  throw new Error('Timeline bar width changed after updateNodeStyles');
}

console.log('Timeline bar width unchanged after LayoutManager.updateNodeStyles');
process.exit(0);
