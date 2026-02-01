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

function drainRafQueue() {
  let guard = 0;
  while (rafQueue.length && guard < 50) {
    const cb = rafQueue.shift();
    cb();
    guard += 1;
  }
}

const structuredNode = cy.add({
  group: 'nodes',
  data: {
    id: 'structured-1',
    type: 'text',
    callout: {
      title: 'Structured Title',
      body: 'Paragraph one.\n\n- Bullet one\n- Bullet two',
      format: 'text'
    }
  },
  position: { x: 100, y: 100 }
});

window.TextCallout.refresh(structuredNode);
drainRafQueue();
drainRafQueue();

const structuredScratch = structuredNode.scratch('_callout');
if (!structuredScratch || !structuredScratch.div) {
  throw new Error('Structured callout did not create a callout div');
}

if (structuredScratch.div.dataset.calloutMode !== 'structured') {
  throw new Error('Structured callout did not mark callout mode as structured');
}

const article = structuredScratch.div.querySelector('.text-callout__article');
if (!article) {
  throw new Error('Structured callout template did not render article wrapper');
}

if (article.getAttribute('role') !== 'note') {
  throw new Error('Structured callout article is missing note role');
}

const titleEl = article.querySelector('.text-callout__title');
if (!titleEl || titleEl.textContent.trim() !== 'Structured Title') {
  throw new Error('Structured callout title was not rendered');
}

const listItems = article.querySelectorAll('li');
if (listItems.length !== 2) {
  throw new Error(`Structured callout list formatting failed; expected 2 items but found ${listItems.length}`);
}

const htmlNode = cy.add({
  group: 'nodes',
  data: {
    id: 'structured-html',
    type: 'text',
    callout: {
      title: 'HTML Title',
      body: '<p>Allowed paragraph</p><script>alert(1)</script><a href="javascript:alert(1)" target="_self">Unsafe</a>',
      format: 'html'
    }
  },
  position: { x: 200, y: 200 }
});

window.TextCallout.refresh(htmlNode);
drainRafQueue();
drainRafQueue();

const htmlScratch = htmlNode.scratch('_callout');
if (!htmlScratch || !htmlScratch.div) {
  throw new Error('HTML structured callout did not create a callout div');
}

const htmlArticle = htmlScratch.div.querySelector('.text-callout__article');
if (!htmlArticle) {
  throw new Error('HTML structured callout did not render article wrapper');
}

if (htmlArticle.querySelector('script')) {
  throw new Error('Structured callout sanitizer did not remove script tag');
}

const link = htmlArticle.querySelector('a');
if (!link) {
  throw new Error('Structured callout sanitizer removed allowed anchor tag');
}

if (link.getAttribute('href')) {
  throw new Error('Structured callout sanitizer did not remove unsafe href attribute');
}

if (link.hasAttribute('target')) {
  throw new Error('Structured callout sanitizer did not strip non-blank target attribute');
}

console.log('Structured callout template renders title/body and sanitizes HTML');
