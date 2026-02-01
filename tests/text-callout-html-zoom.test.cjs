const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body><div id="cy-wrapper"><div id="cy"></div></div></body></html>', { pretendToBeVisual: true });
const { window } = dom;
global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

const container = document.getElementById('cy');
const wrapper = document.getElementById('cy-wrapper');
Object.defineProperty(container, 'clientWidth', { value: 500 });
Object.defineProperty(container, 'clientHeight', { value: 500 });

require('../js/features/graph-modules/text-callout/text-callout.js');

const cy = cytoscape({
  headless: true,
  style: [{ selector: 'node', style: { width: 100, height: 40 } }],
  layout: { name: 'preset' }
});
cy.container = () => container;

window.TextCallout.init(cy);

const node = cy.add({
  group: 'nodes',
  data: { id: 't1', type: 'text', infoHtml: '<span style="font-size: 10px">hello</span>' },
  position: { x: 100, y: 100 }
});
const div = node.scratch('_callout').div;
const span = div.querySelector('span');
const initialFontSize = parseFloat(span.style.fontSize);

cy.zoom(2);

const updatedFontSize = parseFloat(span.style.fontSize);

if (updatedFontSize !== initialFontSize * 2) {
  throw new Error('HTML font size did not scale with zoom');
}

console.log('HTML text callout scales with zoom');
