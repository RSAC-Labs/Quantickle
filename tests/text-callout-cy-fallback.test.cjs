const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body><div id="cy"></div></body></html>', { pretendToBeVisual: true });

const { window } = dom;

global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

const container = document.getElementById('cy');
Object.defineProperty(container, 'clientWidth', { value: 600 });
Object.defineProperty(container, 'clientHeight', { value: 400 });
Object.defineProperty(container, 'offsetWidth', { value: 600 });
Object.defineProperty(container, 'offsetHeight', { value: 400 });
Object.defineProperty(container, 'getBoundingClientRect', {
  value: () => ({ left: 12, top: 16, width: 600, height: 400 })

});

global.cytoscape = opts => cytoscape({ ...opts, headless: true, styleEnabled: true });

require('../js/features/graph-modules/text-callout/text-callout.js');

const cy = cytoscape({
  headless: true,
  styleEnabled: true,
  layout: { name: 'preset' },
  style: []
});
cy.container = () => null;
window.TextCallout.init(cy);

const node = cy.add({
  group: 'nodes',
  data: {
    id: 'fallback-text',
    type: 'text',
    fontSize: 16,
    infoHtml: '<div>Fallback text content</div>'
  },
  position: { x: 120, y: 80 }
});

wrapper.remove();
const originalCreateElement = document.createElement.bind(document);
document.createElement = tag => {
  if (tag.toLowerCase() === 'div') {
    throw new Error('simulate callout creation failure');
  }
  return originalCreateElement(tag);
};
const forceFallbackRefresh = targetNode => {
  const existingCallout = document.querySelector('.text-callout');
  if (existingCallout) existingCallout.remove();
  targetNode.removeScratch('_callout');
  window.TextCallout.refresh(targetNode);
};

const existingCallout = document.querySelector('.text-callout');
if (existingCallout) existingCallout.remove();
node.removeScratch('_callout');

forceFallbackRefresh(node);
document.createElement = originalCreateElement;


let scratch = node.scratch('_callout');
if (!scratch || !scratch.div) {
  throw new Error('Text callout overlay was not created when Cytoscape container was unavailable');
}

if (!scratch.div.isConnected) {
  throw new Error('Text callout overlay was created but not attached to the DOM');
}

if (!scratch.layer || scratch.layer.dataset.calloutFallback !== 'true') {
  throw new Error('Text callout did not attach to the fallback layer when Cytoscape container was missing');
}

if (node.style('label')) {
  throw new Error('Text callout should not fall back to a Cytoscape label when overlay creation succeeds');
}

const overlayText = scratch.div.textContent.trim();
if (!overlayText.includes('Fallback text content')) {
  throw new Error('Text callout overlay did not render manual HTML content');
}

const nodeOpacity = parseFloat(node.style('opacity'));
if (!Number.isFinite(nodeOpacity) || nodeOpacity <= 0.9) {
  throw new Error('Fallback node opacity was not restored to a visible value');
}

const translucentNode = cy.add({
  group: 'nodes',
  data: {
    id: 'fallback-text-translucent',
    type: 'text',
    fontSize: 16,
    infoHtml: '<div>Translucent fallback text</div>',
    opacity: 0.4
  },
  position: { x: 40, y: 40 }
});

document.createElement = tag => {
  if (tag.toLowerCase() === 'div') {
    throw new Error('simulate callout creation failure');
  }
  return originalCreateElement(tag);
};
forceFallbackRefresh(translucentNode);
document.createElement = originalCreateElement;

const translucentOpacity = parseFloat(translucentNode.style('opacity'));
if (Math.abs(translucentOpacity - 0.4) > 0.01) {
  throw new Error('Fallback node opacity did not respect configured translucency');
}

const translucentTextOpacity = parseFloat(translucentNode.style('text-opacity'));
if (Math.abs(translucentTextOpacity - 0.4) > 0.01) {
  throw new Error('Fallback text opacity did not respect configured translucency');
}

const translucentBackgroundOpacity = parseFloat(translucentNode.style('background-opacity'));
if (Math.abs(translucentBackgroundOpacity - 0.4) > 0.01) {
  throw new Error('Fallback background opacity did not respect configured translucency');
}

const nodeOpacity = parseFloat(node.style('opacity'));
if (!Number.isFinite(nodeOpacity) || nodeOpacity <= 0.9) {
  throw new Error('Fallback node opacity was not restored to a visible value');
}

const translucentNode = cy.add({
  group: 'nodes',
  data: {
    id: 'fallback-text-translucent',
    type: 'text',
    fontSize: 16,
    infoHtml: '<div>Translucent fallback text</div>',
    opacity: 0.4
  },
  position: { x: 40, y: 40 }
});

document.createElement = tag => {
  if (tag.toLowerCase() === 'div') {
    throw new Error('simulate callout creation failure');
  }
  return originalCreateElement(tag);
};
forceFallbackRefresh(translucentNode);
document.createElement = originalCreateElement;

const translucentOpacity = parseFloat(translucentNode.style('opacity'));
if (Math.abs(translucentOpacity - 0.4) > 0.01) {
  throw new Error('Fallback node opacity did not respect configured translucency');
}

const translucentTextOpacity = parseFloat(translucentNode.style('text-opacity'));
if (!Number.isFinite(translucentTextOpacity) || translucentTextOpacity <= 0.9) {
  throw new Error('Fallback text opacity did not remain fully visible under node translucency');
}

const translucentBackgroundOpacity = parseFloat(translucentNode.style('background-opacity'));
if (!Number.isFinite(translucentBackgroundOpacity) || translucentBackgroundOpacity <= 0.9) {
  throw new Error('Fallback background opacity did not remain fully visible under node translucency');
}

console.log('Text callout fallback applies node label rendering when overlay fails');


cy.destroy();
dom.window.close();
