const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body><div id="cy-wrapper"><div id="cy"></div></div></body></html>', { pretendToBeVisual: true });
const { window } = dom;
global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

const container = document.getElementById('cy');
Object.defineProperty(container, 'clientWidth', { value: 500 });
Object.defineProperty(container, 'clientHeight', { value: 500 });

require('../js/features/graph-modules/text-callout/text-callout.js');

const cy = cytoscape({
  headless: true,
  layout: { name: 'preset' },
  style: [{ selector: 'node', style: { width: 100, height: 40 } }]
});
cy.container = () => container;
window.TextCallout.init(cy);

const node = cy.add({ group: 'nodes', data: { id: 't1', type: 'text', info: 'hello', fontSize: 10, width: 100, height: 40 }, position: { x: 100, y: 100 } });
window.TextCallout.refresh(node);
const div = node.scratch('_callout').div;
const initialFont = parseFloat(div.style.fontSize);

node.data('width', 200);
node.data('height', 80);
window.TextCallout.refresh(node);

const scaledFont = parseFloat(div.style.fontSize);
if (scaledFont !== initialFont * 2) {
  throw new Error('Font size did not scale with node rectangle');
}

console.log('Text node font scales with node rectangle');
