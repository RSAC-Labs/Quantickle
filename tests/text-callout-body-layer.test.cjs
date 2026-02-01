const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body><div id="cy"></div></body></html>', { pretendToBeVisual: true });
const { window } = dom;

global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

global.cytoscape = opts => cytoscape({ ...opts, headless: true, styleEnabled: true });

const container = document.getElementById('cy');
Object.defineProperty(container, 'clientWidth', { value: 640 });
Object.defineProperty(container, 'clientHeight', { value: 480 });
Object.defineProperty(container, 'offsetWidth', { value: 640 });
Object.defineProperty(container, 'offsetHeight', { value: 480 });
Object.defineProperty(container, 'getBoundingClientRect', {
  value: () => ({ left: 32, top: 48, width: 640, height: 480 })
});

require('../js/features/graph-modules/text-callout/text-callout.js');

const cy = cytoscape({ headless: true, styleEnabled: true, layout: { name: 'preset' }, style: [] });
cy.container = () => container;

const manualHtml = '<div class="summary-template"><main class="page"><h1>Manual</h1><div class="content">Visible text</div></main></div>';

const node = cy.add({
  group: 'nodes',
  data: {
    id: 'text-body-layer',
    type: 'text',
    fontSize: 16,
    infoHtml: manualHtml
  },
  position: { x: 150, y: 160 }
});

const element = node[0];

element.style({
  label: 'Original Label',
  'background-color': '#f5d742',
  'background-opacity': 0.85,
  'border-width': 3,
  'border-opacity': 0.5,
  'text-opacity': 1,
  opacity: 0.8
});

const originalStyleSnapshot = {
  label: element.style('label'),
  backgroundColor: String(element.style('background-color')).replace(/\s+/g, ''),
  backgroundOpacity: parseFloat(element.style('background-opacity')),
  borderWidth: parseFloat(element.style('border-width')),
  borderOpacity: parseFloat(element.style('border-opacity')),
  textOpacity: parseFloat(element.style('text-opacity')),
  opacity: parseFloat(element.style('opacity'))
};

if (Number.isNaN(originalStyleSnapshot.backgroundOpacity)) {
  throw new Error('Precondition failed: original background opacity could not be read');
}

window.TextCallout.init(cy);

window.TextCallout.refresh(element);

const scratch = element.scratch('_callout');
if (!scratch || !scratch.div) {
  throw new Error('Callout div was not created when falling back to the body layer');
}

const layer = scratch.layer;
if (!layer || !layer.classList.contains('text-callout-layer')) {
  throw new Error('Callout layer was not created next to the Cytoscape container');
}
if (layer.dataset.calloutFallback === 'true') {
  throw new Error('Callout unexpectedly attached to the fallback layer when a container was available');
}
if (layer.parentElement !== container.parentElement) {
  throw new Error('Callout layer did not mount alongside the Cytoscape container');
}

const cachedStyle = element.scratch('_calloutPrevStyle');
if (!cachedStyle) {
  throw new Error('Callout did not capture the previous style when initializing');
}

const cachedBackgroundOpacity = parseFloat(cachedStyle['background-opacity']);
if (Number.isNaN(cachedBackgroundOpacity) || Math.abs(cachedBackgroundOpacity - originalStyleSnapshot.backgroundOpacity) > 1e-6) {
  throw new Error(`Cached background opacity did not match the original value; expected ${originalStyleSnapshot.backgroundOpacity} but found ${cachedStyle['background-opacity']}`);
}

const main = scratch.div.querySelector('main.page');
if (!main) {
  throw new Error('Manual HTML template was not rendered into the callout div');
}

const contentText = scratch.div.textContent.trim();
if (!contentText.includes('Visible text')) {
  throw new Error('Rendered callout did not contain the manual text content');
}

if (!scratch.div.style.left || !scratch.div.style.top) {
  throw new Error('Callout div was not positioned after attaching to the body layer');
}

const calloutBackgroundOpacityRaw = element.style('background-opacity');
const calloutBackgroundOpacity = parseFloat(calloutBackgroundOpacityRaw);
if (Number.isNaN(calloutBackgroundOpacity) || calloutBackgroundOpacity !== 0) {
  throw new Error(`Callout background opacity was not hidden, found ${String(calloutBackgroundOpacityRaw)}`);
}

const calloutBorderWidth = parseFloat(element.style('border-width'));
if (calloutBorderWidth !== 0) {
  throw new Error(`Callout border width was not reset, found ${calloutBorderWidth}`);
}

const calloutBorderOpacity = parseFloat(element.style('border-opacity'));
if (calloutBorderOpacity !== 0) {
  throw new Error(`Callout border opacity was not hidden, found ${calloutBorderOpacity}`);
}

const calloutTextOpacity = parseFloat(element.style('text-opacity'));
if (calloutTextOpacity !== 0) {
  throw new Error(`Callout text opacity was not hidden, found ${calloutTextOpacity}`);
}

const calloutOpacity = parseFloat(element.style('opacity'));
if (calloutOpacity !== 0) {
  throw new Error(`Callout opacity was not hidden, found ${calloutOpacity}`);
}

const calloutBackgroundColor = String(element.style('background-color')).replace(/\s+/g, '').toLowerCase();
const transparentColorOptions = new Set(['rgba(0,0,0,0)', 'rgb(0,0,0)', 'transparent']);
if (!transparentColorOptions.has(calloutBackgroundColor)) {
  throw new Error(`Callout background color was not transparent, found ${calloutBackgroundColor}`);
}

if (element.style('label') !== '') {
  throw new Error('Callout label was not cleared while overlay was active');
}

element.emit('remove');

const restoredBackgroundOpacity = parseFloat(element.style('background-opacity'));
if (Math.abs(restoredBackgroundOpacity - originalStyleSnapshot.backgroundOpacity) > 1e-6) {
  throw new Error(`Background opacity was not restored after callout removal; expected ${originalStyleSnapshot.backgroundOpacity} but found ${restoredBackgroundOpacity}`);
}

const restoredBorderWidth = parseFloat(element.style('border-width'));
if (Math.abs(restoredBorderWidth - originalStyleSnapshot.borderWidth) > 1e-6) {
  throw new Error(`Border width was not restored after callout removal; expected ${originalStyleSnapshot.borderWidth} but found ${restoredBorderWidth}`);
}

const restoredBorderOpacity = parseFloat(element.style('border-opacity'));
if (Math.abs(restoredBorderOpacity - originalStyleSnapshot.borderOpacity) > 1e-6) {
  throw new Error(`Border opacity was not restored after callout removal; expected ${originalStyleSnapshot.borderOpacity} but found ${restoredBorderOpacity}`);
}

const restoredTextOpacity = parseFloat(element.style('text-opacity'));
if (Math.abs(restoredTextOpacity - originalStyleSnapshot.textOpacity) > 1e-6) {
  throw new Error(`Text opacity was not restored after callout removal; expected ${originalStyleSnapshot.textOpacity} but found ${restoredTextOpacity}`);
}

const restoredOpacity = parseFloat(element.style('opacity'));
if (Math.abs(restoredOpacity - originalStyleSnapshot.opacity) > 1e-6) {
  throw new Error(`Node opacity was not restored after callout removal; expected ${originalStyleSnapshot.opacity} but found ${restoredOpacity}`);
}

const restoredBackgroundColor = String(element.style('background-color')).replace(/\s+/g, '');
if (restoredBackgroundColor.toLowerCase() !== originalStyleSnapshot.backgroundColor.toLowerCase()) {
  throw new Error(`Background color was not restored after callout removal; expected ${originalStyleSnapshot.backgroundColor} but found ${restoredBackgroundColor}`);
}

if (element.style('label') !== originalStyleSnapshot.label) {
  throw new Error('Node label was not restored after callout removal');
}

if (element.scratch('_callout')) {
  throw new Error('Callout scratch data persisted after removal');
}

console.log('Text callout renders manual HTML using fallback body layer');

cy.destroy();
dom.window.close();
