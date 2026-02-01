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

const node = cy.add({ group: 'nodes', data: { id: 't1', type: 'text', info: 'hi' }, position: { x: 100, y: 100 } });
const div = node.scratch('_callout').div;

// mock measurements based on text length
Object.defineProperty(div, 'offsetWidth', {
  configurable: true,
  get() { return this.textContent.length * 5; }
});
Object.defineProperty(div, 'offsetHeight', {
  configurable: true,
  get() { return 20; }
});

window.TextCallout.refresh(node);
const initialWidth = parseFloat(div.style.width);

if (div.style.overflowY !== 'hidden') {
  throw new Error('Short text should not enable vertical scrolling');
}

node.data('info', 'A very long line of text that should wrap and expand the callout width and height accordingly.');
Object.defineProperty(div, 'offsetHeight', {
  configurable: true,
  get() { return this.textContent.length * 12; }
});
Object.defineProperty(div, 'scrollHeight', {
  configurable: true,
  get() { return this.textContent.length * 12; }
});
window.TextCallout.refresh(node);

const updatedWidth = parseFloat(div.style.width);

if (updatedWidth <= initialWidth) {
  throw new Error('Callout width did not expand after text change');
}

if (div.style.overflowY !== 'auto') {
  throw new Error('Long text should enable vertical scrolling');
}

const appliedMaxHeight = parseFloat(div.style.maxHeight);
const appliedHeight = parseFloat(div.style.height);

if (!(appliedMaxHeight > 0 && Math.abs(appliedMaxHeight - appliedHeight) < 0.5)) {
  throw new Error('Max height should match the constrained overlay height');
}

node.data('info', 'Short again');
window.TextCallout.refresh(node);

if (div.style.overflowY !== 'hidden' || div.style.maxHeight) {
  throw new Error('Short text should remove scrolling constraints');
}

console.log('Text callout width expands with content');
