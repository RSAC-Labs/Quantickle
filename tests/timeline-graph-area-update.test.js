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
require('../js/features/graph-modules/graph-styling/graph-styling-module.js');
require('../js/features/graph-area-editor/graph-area-editor-module.js');

const cy = cytoscape({ headless: true, styleEnabled: true });
cy.extent = () => ({ x1: 0, y1: 0, x2: 1000, y2: 1000, w: 1000, h: 1000 });
cy.container = () => document.getElementById('cy');

new window.GraphStylingModule({ cytoscape: cy, notifications: { show: () => {} } });
const ga = new window.GraphAreaEditorModule({ cytoscape: cy, notifications: { show: () => {} }, config: {} });

cy.add({ data: { id: 'n1', type: 'test', timestamp: 0 } });
window.CustomLayouts.timelineLayout.call(cy, {});

const bar = cy.getElementById('timeline-bar');
const initialTick = cy.nodes('[type="timeline-tick"]')[0];
const link = cy.getElementById('timeline-link-n1');

if (!bar || !initialTick || !link) {
  throw new Error('Timeline elements missing before graph area update');
}

const initialBarWidth = parseFloat(bar.style('width'));
const initialTickWidth = parseFloat(initialTick.style('width'));
const initialLinkWidth = parseFloat(link.style('width'));

// trigger graph area update

ga.applySettings({ backgroundColor: '#ffffff' }, { save: false });

const barAfter = cy.getElementById('timeline-bar');
const tickAfter = cy.nodes('[type="timeline-tick"]')[0];
const linkAfter = cy.getElementById('timeline-link-n1');

if (!barAfter) {
  throw new Error('Timeline bar missing after graph area update');
}

if (parseFloat(barAfter.style('width')) !== initialBarWidth) {
  throw new Error('Timeline bar width changed after graph area update');
}

if (!tickAfter) {
  throw new Error('Timeline tick missing after graph area update');
}

if (parseFloat(tickAfter.style('width')) !== initialTickWidth) {
  throw new Error('Timeline tick width changed after graph area update');
}

if (!linkAfter) {
  throw new Error('Timeline link missing after graph area update');
}

if (parseFloat(linkAfter.style('width')) !== initialLinkWidth) {
  throw new Error('Timeline link width changed after graph area update');
}

console.log('Timeline elements persist after graph area update');
process.exit(0);
