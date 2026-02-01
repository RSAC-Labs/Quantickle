const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body><div id="cy-wrapper"><div id="cy"></div></div></body></html>', { pretendToBeVisual: true });
const { window } = dom;
global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

const container = document.getElementById('cy');
const wrapper = document.getElementById('cy-wrapper');
Object.defineProperty(container, 'clientWidth', { value: 600 });
Object.defineProperty(container, 'clientHeight', { value: 400 });

require('../js/features/graph-modules/text-callout/text-callout.js');

const cy = cytoscape({
  headless: true,
  style: [{ selector: 'node', style: { width: 120, height: 50 } }],
  layout: { name: 'preset' }
});
cy.container = () => container;

const node = cy.add({
  group: 'nodes',
  data: { id: 'n1', type: 'default', info: 'Converted text' },
  position: { x: 160, y: 180 }
});

window.TextCallout.init(cy);

if (node.scratch('_callout')) {
  throw new Error('Callout should not exist before node becomes text');
}

node.data('type', 'text');

const calloutData = node.scratch('_callout');
if (!calloutData || !calloutData.div) {
  throw new Error('Callout not created after converting node to text');
}

const div = calloutData.div;
if (div.parentElement !== wrapper) {
  throw new Error('Callout not appended to wrapper after conversion');
}

if (!div.textContent.includes('Converted text')) {
  throw new Error('Callout did not update content after conversion');
}

const left = parseFloat(div.style.left);
const top = parseFloat(div.style.top);
if (!Number.isFinite(left) || !Number.isFinite(top)) {
  throw new Error('Callout position was not set after conversion');
}

console.log('Callout created and positioned after converting node to text');
