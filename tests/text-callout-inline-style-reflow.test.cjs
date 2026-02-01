const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body><div id="cy-wrapper"><div id="cy"></div></div></body></html>', { pretendToBeVisual: true });
const { window } = dom;

global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

const container = document.getElementById('cy');
const wrapper = document.getElementById('cy-wrapper');
Object.defineProperty(container, 'clientWidth', { value: 800 });
Object.defineProperty(container, 'clientHeight', { value: 600 });
Object.defineProperty(wrapper, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 800, height: 600 }) });
Object.defineProperty(container, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 800, height: 600 }) });

const rafQueue = [];
window.requestAnimationFrame = cb => {
  rafQueue.push(cb);
  return rafQueue.length;
};

global.requestAnimationFrame = window.requestAnimationFrame;

global.cytoscape = opts => cytoscape({ ...opts, headless: true, styleEnabled: true });

require('../js/features/graph-modules/text-callout/text-callout.js');

const cy = cytoscape({ headless: true, layout: { name: 'preset' }, style: [] });
cy.container = () => container;
cy.zoom(1);
window.TextCallout.init(cy);

const inlineStyledHtml = `
  <div class="summary-template">
    <style>
      .summary-template { width: 320px; box-sizing: border-box; padding: 16px; }
      .summary-template .content { font-size: 16px; }
    </style>
    <div class="content">Deferred style content</div>
  </div>
`;

const node = cy.add({
  group: 'nodes',
  data: {
    id: 'styled-text',
    type: 'text',
    infoHtml: inlineStyledHtml
  },
  position: { x: 100, y: 100 }
});

window.TextCallout.refresh(node);

const scratch = node.scratch('_callout');
const div = scratch.div;

if (!div) {
  throw new Error('Text callout div was not created for inline style content');
}

const expectedWidth = 320;
const expectedHeight = 160;
let stylesReady = false;

Object.defineProperty(div, 'offsetWidth', {
  get() {
    return stylesReady ? expectedWidth : 0;
  }
});
Object.defineProperty(div, 'scrollWidth', {
  get() {
    return stylesReady ? expectedWidth : 0;
  }
});
Object.defineProperty(div, 'offsetHeight', {
  get() {
    return stylesReady ? expectedHeight : 0;
  }
});
Object.defineProperty(div, 'scrollHeight', {
  get() {
    return stylesReady ? expectedHeight : 0;
  }
});
Object.defineProperty(div, 'getBoundingClientRect', {
  value: () => ({
    left: 0,
    top: 0,
    width: stylesReady ? expectedWidth : 0,
    height: stylesReady ? expectedHeight : 0,
    right: stylesReady ? expectedWidth : 0,
    bottom: stylesReady ? expectedHeight : 0
  })
});

if (scratch.baseWidth != null || scratch.baseHeight != null) {
  throw new Error('Base dimensions should not be cached before deferred measurement completes');
}

if (div.style.width && div.style.width !== 'auto') {
  throw new Error('Callout width was locked before deferred measurement');
}

if (!rafQueue.length) {
  throw new Error('Deferred measurement was not scheduled after injecting inline styles');
}

stylesReady = true;

while (rafQueue.length) {
  const callback = rafQueue.shift();
  callback();
}

while (rafQueue.length) {
  const callback = rafQueue.shift();
  callback();
}

const finalWidth = parseFloat(div.style.width);
const finalHeight = parseFloat(div.style.height);

if (Math.abs(finalWidth - expectedWidth) > 0.1) {
  throw new Error(`Deferred measurement did not apply styled width (expected ${expectedWidth}, got ${finalWidth})`);
}

if (Math.abs(finalHeight - expectedHeight) > 0.1) {
  throw new Error(`Deferred measurement did not apply styled height (expected ${expectedHeight}, got ${finalHeight})`);
}

if (scratch.baseWidth !== expectedWidth || scratch.baseHeight !== expectedHeight) {
  throw new Error('Base dimensions were not cached after successful deferred measurement');
}

console.log('Inline style callout measurements defer until styles are applied');
