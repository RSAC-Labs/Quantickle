const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

global.localStorage = { getItem: () => null, setItem: () => {} };

window.cytoscape = cytoscape;
require('../js/custom-layouts.js');
window.CustomLayouts.registerCustomLayouts();
require('../js/features/graph-modules/graph-styling/graph-styling-module.js');

const cy = cytoscape({ headless: true, styleEnabled: true });
cy.extent = () => ({ x1: 0, y1: 0, x2: 1000, y2: 1000, w: 1000, h: 1000 });
cy.container = () => ({ style: {}, querySelector: () => null, appendChild: () => {} });

const stylingModule = new window.GraphStylingModule({ cytoscape: cy, notifications: { show: () => {} } });

cy.add({ data: { id: 'n1', type: 'timeline-event', timestamp: 0 } });

window.CustomLayouts.timelineLayout.call(cy, {});

if (cy.edges('[type="timeline-link"]').length === 0) {
  throw new Error('Timeline link edges missing immediately after activating timeline layout');
}

const link = cy.getElementById('timeline-link-n1');
if (link.length === 0) throw new Error('Timeline link missing…');
const bar = cy.getElementById('timeline-bar');

if (
  link.style('display') === 'none' ||
  link.style('visibility') === 'hidden' ||
  parseFloat(link.style('line-opacity')) === 0
) {
  throw new Error('Timeline link not visible after layout');
}

if (Number(link.style('z-index')) <= Number(bar.style('z-index'))) {
  throw new Error('Timeline link z-index not above bar');
}

if (parseFloat(link.style('line-opacity')) !== 1) {
  throw new Error('Timeline link not fully opaque');
}

link.style('display', 'none');
link.style('line-opacity', 0);
link.style('opacity', 0);

window.CustomLayouts.timelineLayout.call(cy, {});

const rerunLink = cy.getElementById('timeline-link-n1');
if (rerunLink.length === 0) throw new Error('Timeline link missing…');

if (rerunLink.style('display') !== 'element') {
  throw new Error('Timeline link display not restored after rerunning layout');
}

if (rerunLink.style('visibility') === 'hidden') {
  throw new Error('Timeline link visibility not restored after rerunning layout');
}

if (parseFloat(rerunLink.style('line-opacity')) !== 1) {
  throw new Error('Timeline link line-opacity not restored after rerunning layout');
}

if (parseFloat(rerunLink.style('opacity')) !== 1) {
  throw new Error('Timeline link opacity not restored after rerunning layout');
}

const originalColor = rerunLink.style('line-color');
const originalLineOpacity = parseFloat(rerunLink.style('line-opacity'));

cy.edges('[type="timeline-link"]').remove();
cy.nodes('[type="timeline-anchor"]').remove();

window.CustomLayouts.timelineLayout.call(cy, {});

const rebuiltLink = cy.getElementById('timeline-link-n1');
const rebuiltAnchor = cy.getElementById('timeline-anchor-n1');

if (rebuiltLink.length === 0 || rebuiltAnchor.length === 0) {
  throw new Error('Timeline connectors were not rebuilt after being pruned');
}

if (rebuiltLink.style('display') !== 'element' || rebuiltLink.style('visibility') === 'hidden') {
  throw new Error('Rebuilt timeline link not visible after pruning restoration');
}

if (parseFloat(rebuiltLink.style('z-index')) !== 1) {
  throw new Error('Rebuilt timeline link z-index incorrect before theming');
}

if (rebuiltLink.style('curve-style') !== 'straight') {
  throw new Error('Rebuilt timeline link curve-style incorrect before theming');
}

stylingModule.applyTheme('pastel');

const themedLink = cy.getElementById('timeline-link-n1');
if (themedLink.length === 0) throw new Error('Timeline link missing…');

if (themedLink.style('line-color') !== originalColor) {
  throw new Error('Timeline link color changed after applying theme');
}

if (parseFloat(themedLink.style('line-opacity')) !== originalLineOpacity) {
  throw new Error('Timeline link line-opacity changed after applying theme');
}

if (parseFloat(themedLink.style('z-index')) !== 1) {
  throw new Error('Timeline link z-index changed after applying theme');
}

if (themedLink.style('curve-style') !== 'straight') {
  throw new Error('Timeline link curve-style changed after applying theme');
}

console.log('Timeline link remains visible after layout');
process.exit(0);
