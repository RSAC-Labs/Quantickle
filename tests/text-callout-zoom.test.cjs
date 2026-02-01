const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

// Setup JSDOM environment with a container for cytoscape
const dom = new JSDOM('<!doctype html><html><body><div id="cy-wrapper"><div id="cy"></div></div></body></html>', { pretendToBeVisual: true });
const { window } = dom;
global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

// Provide dimensions for the container so renderedPosition works
const container = document.getElementById('cy');
const wrapper = document.getElementById('cy-wrapper');
Object.defineProperty(container, 'clientWidth', { value: 500 });
Object.defineProperty(container, 'clientHeight', { value: 500 });

// Load the text callout module
require('../js/features/graph-modules/text-callout/text-callout.js');

// Create cytoscape instance in headless mode and provide container manually
const cy = cytoscape({
  headless: true,
  style: [{ selector: 'node', style: { width: 100, height: 40 } }],
  layout: { name: 'preset' }
});
cy.container = () => container;

const waitForLayout = () => new Promise(resolve => setTimeout(resolve, 0));
const flushUpdates = async (iterations = 3) => {
  for (let i = 0; i < iterations; i += 1) {
    await waitForLayout();
  }
};

const parsePaddingValues = paddingString => {
  if (typeof paddingString !== 'string' || !paddingString.trim()) {
    return [];
  }
  return paddingString
    .trim()
    .split(/\s+/)
    .map(value => parseFloat(value))
    .filter(value => Number.isFinite(value));
};

const ratiosAreClose = (a, b, tolerance = 0.001) => Math.abs(a - b) <= tolerance;

async function run() {
  window.TextCallout.init(cy);
  await flushUpdates();

  // Add a text node after initialization so addCallout is triggered via event
  const node = cy.add({
    group: 'nodes',
    data: { id: 't1', type: 'text', info: 'hello', fontSize: 10 },
    position: { x: 100, y: 100 }
  });

  await flushUpdates();

  const calloutData = node.scratch('_callout');
  if (!calloutData || !calloutData.div) {
    throw new Error('Callout element was not created');
  }

  const { div } = calloutData;
  if (div.parentElement !== wrapper) {
    throw new Error('Callout not appended to cy wrapper');
  }

  await flushUpdates();
  window.TextCallout.refresh();
  await flushUpdates();

  const initialFontSize = div.style.fontSize;
  const initialFontSizeValue = parseFloat(initialFontSize);
  if (!Number.isFinite(initialFontSizeValue) || initialFontSizeValue <= 0) {
    throw new Error('Initial font size could not be determined');
  }

  const paddingValues = parsePaddingValues(div.style.padding);
  if (paddingValues.length === 0) {
    throw new Error('Initial padding could not be determined');
  }

  const initialBlockRatio = paddingValues[0] / initialFontSizeValue;
  const initialInlineRatio = (paddingValues[1] || paddingValues[0]) / initialFontSizeValue;

  // Zoom the graph - this should trigger TextCallout to update
  cy.zoom(2);
  await flushUpdates();

  const updatedFontSize = div.style.fontSize;
  const updatedFontSizeValue = parseFloat(updatedFontSize);
  const updatedPaddingValues = parsePaddingValues(div.style.padding);
  if (!Number.isFinite(updatedFontSizeValue) || updatedFontSizeValue <= 0) {
    throw new Error('Updated font size could not be determined');
  }

  if (parseFloat(updatedFontSize) !== parseFloat(initialFontSize) * 2) {
    throw new Error('Font size did not scale with zoom');
  }

  if (updatedPaddingValues.length === 0) {
    throw new Error('Padding did not update after zooming in');
  }

  const updatedBlockRatio = updatedPaddingValues[0] / updatedFontSizeValue;
  const updatedInlineRatio = (updatedPaddingValues[1] || updatedPaddingValues[0]) / updatedFontSizeValue;

  if (!ratiosAreClose(updatedBlockRatio, initialBlockRatio) || !ratiosAreClose(updatedInlineRatio, initialInlineRatio)) {
    throw new Error('Padding ratios changed after zooming in');
  }

  cy.zoom(0.5);
  await flushUpdates();

  const zoomedOutFontSize = div.style.fontSize;
  const zoomedOutPaddingValues = parsePaddingValues(div.style.padding);

  if (parseFloat(zoomedOutFontSize) !== parseFloat(initialFontSize) * 0.5) {
    throw new Error('Font size did not scale when zooming out');
  }

  if (zoomedOutPaddingValues.length === 0) {
    throw new Error('Padding did not update after zooming out');
  }

  const zoomedOutFontSizeValue = parseFloat(zoomedOutFontSize);
  if (!Number.isFinite(zoomedOutFontSizeValue) || zoomedOutFontSizeValue <= 0) {
    throw new Error('Zoomed out font size could not be determined');
  }
  const zoomedOutBlockRatio = zoomedOutPaddingValues[0] / zoomedOutFontSizeValue;
  const zoomedOutInlineRatio = (zoomedOutPaddingValues[1] || zoomedOutPaddingValues[0]) / zoomedOutFontSizeValue;

  if (!ratiosAreClose(zoomedOutBlockRatio, initialBlockRatio) || !ratiosAreClose(zoomedOutInlineRatio, initialInlineRatio)) {
    throw new Error('Padding ratios changed after zooming out');
  }

  console.log('Text callout repositions and scales with zoom');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
