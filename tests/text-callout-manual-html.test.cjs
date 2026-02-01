const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body><div id="cy-wrapper"><div id="cy"></div></div></body></html>', { pretendToBeVisual: true });
const { window } = dom;

global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

global.cytoscape = opts => cytoscape({ ...opts, headless: true, styleEnabled: true });

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

global.window = window;

require('../js/features/graph-modules/text-callout/text-callout.js');

const cy = cytoscape({ headless: true, layout: { name: 'preset' }, style: [] });
cy.container = () => container;
window.TextCallout.init(cy);

const node = cy.add({
  group: 'nodes',
  data: {
    id: 'text-1',
    type: 'text',
    fontSize: '14px',
    infoHtml: '<div>Manual text content</div>'
  },
  position: { x: 100, y: 100 }
});

window.TextCallout.refresh(node);

const flushRaf = () => {
  while (rafQueue.length) {
    const cb = rafQueue.shift();
    cb();
  }
};

flushRaf();
flushRaf();

const scratch = node.scratch('_callout');
if (!scratch || !scratch.div) {
  throw new Error('Text callout div was not created for manual HTML content');
}

const child = scratch.div.querySelector('div');
if (!child) {
  throw new Error('Manual text content was not rendered inside the callout');
}

if (child.style.fontSize && child.style.fontSize.includes('NaN')) {
  throw new Error('Manual text content produced an invalid font size');
}

const containerFont = scratch.div.style.fontSize;
if (!containerFont || containerFont.includes('NaN')) {
  throw new Error('Callout container font size was not applied correctly');
}


const tinyFonts = Array.from(scratch.div.querySelectorAll('*'))
  .map(el => parseFloat(el.style.fontSize || window.getComputedStyle(el).fontSize))
  .filter(size => Number.isFinite(size))
  .some(size => size > 0 && size < 6);

if (tinyFonts) {
  throw new Error('Callout font scaling collapsed readable text');
}

const width = parseFloat(scratch.div.style.width);
const height = parseFloat(scratch.div.style.height);

if (!Number.isFinite(width) || width <= 0) {
  throw new Error('Callout width fallback did not produce a visible box for manual text');
}

if (!Number.isFinite(height) || height <= 0) {
  throw new Error('Callout height fallback did not produce a visible box for manual text');
}


console.log('Manual text node HTML renders without invalid font sizes');

const unsafeHtmlNode = cy.add({
  group: 'nodes',
  data: {
    id: 'text-unsafe-html',
    type: 'text',
    infoHtml: '<img src=x onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">Click</a>'
  },
  position: { x: 200, y: 200 }
});

window.TextCallout.refresh(unsafeHtmlNode);
flushRaf();
flushRaf();

const unsafeHtmlScratch = unsafeHtmlNode.scratch('_callout');
if (!unsafeHtmlScratch || !unsafeHtmlScratch.div) {
  throw new Error('Callout was not created for legacy HTML sanitizer test');
}

const unsafeHtmlContent = unsafeHtmlScratch.div.innerHTML;
if (/onerror\s*=|<script|javascript:/i.test(unsafeHtmlContent)) {
  throw new Error(`Legacy HTML sanitizer failed: ${unsafeHtmlContent}`);
}

const unsafeTextNode = cy.add({
  group: 'nodes',
  data: {
    id: 'text-unsafe-text',
    type: 'text',
    info: '<img src=x onerror="alert(4)">'
  },
  position: { x: 300, y: 300 }
});

window.TextCallout.refresh(unsafeTextNode);
flushRaf();
flushRaf();

const unsafeTextScratch = unsafeTextNode.scratch('_callout');
if (!unsafeTextScratch || !unsafeTextScratch.div) {
  throw new Error('Callout was not created for legacy text sanitizer test');
}

const unsafeTextContent = unsafeTextScratch.div.innerHTML;
if (/<img|onerror\s*=/i.test(unsafeTextContent)) {
  throw new Error(`Legacy text was not escaped: ${unsafeTextContent}`);
}

console.log('Legacy HTML/text sanitizer removes executable content');
