const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body><div id="cy-wrapper"><div id="cy"></div></div></body></html>', { pretendToBeVisual: true });
const { window } = dom;
global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

// Minimal environment stubs
window.UI = { showNotification: () => {} };
window.DomainLoader = { autoLoadDomainsForGraph: async () => [] };
window.TableManager = { updateTables: () => {}, updateTotalDataTable: () => {}, updateNodesDataTable: () => {} };
window.LayoutManager = { applyCurrentLayout: () => {}, currentLayout: 'preset', updateLayoutDropdown: () => {}, handleDragEvent: () => {} };
window.GraphAreaEditor = { applySettings: () => {} };
window.QuantickleConfig = { validation: { enabled: false } };
window.LODSystem = { init: () => {}, config: { enabled: false } };
window.GraphStyling = { applyDefaultStyles: () => {} };
window.GraphControls = { init: () => {} };
window.SelectionManager = { init: () => {} };
window.GraphEditor = { init: () => {} };
window.EdgeCreator = { init: () => {} };
window.PerformanceManager = { init: () => {} };
window.DebugTools = { init: () => {} };
window.ProgressManager = { init: () => {} };
window.BackgroundGridModule = { init: () => {} };
window.Validation = { validators: { validateNode: () => ({ valid: true, errors: [] }), validateEdge: () => ({ valid: true, errors: [] }) } };
window.NodeTypes = {
  default: { color: '#ffffff', size: 30, shape: 'round-rectangle', icon: '' },
  text: { fontFamily: 'Arial', fontSize: 14, fontColor: '#333333', bold: false, italic: false }
};
window.IconConfigs = {};

// Provide container dimensions for TextCallout
const container = document.getElementById('cy');
const wrapper = document.getElementById('cy-wrapper');
Object.defineProperty(container, 'clientWidth', { value: 500 });
Object.defineProperty(container, 'clientHeight', { value: 500 });

global.cytoscape = opts => cytoscape({ ...opts, headless: true, styleEnabled: true });

require('../js/graph.js');
require('../js/features/node-editor/node-editor-module.js');
require('../js/features/graph-modules/text-callout/text-callout.js');

const notifications = { show: () => {} };
const keyboardManager = { disable: () => {}, enable: () => {} };
const cy = cytoscape();
cy.container = () => container;
const editor = new window.NodeEditorModule({ cytoscape: cy, notifications, keyboardManager });
window.TextCallout.init(cy);

// Create text node
cy.add({ data: { id: 't1', type: 'text', info: 'hello' }, position: { x: 0, y: 0 } });
const node = cy.getElementById('t1');

(async () => {
  editor.showEditor(node);

  document.getElementById('text-node-width').value = '150';
  document.getElementById('text-node-height').value = '80';
  await editor.saveTextNodeChanges();
  await new Promise(resolve => setTimeout(resolve, 0));
  if (node.data('width') !== 150 || node.data('height') !== 80) {
    throw new Error('Text node dimensions not updated');
  }
  if (node.data('textWidthMode') !== 'fixed' || node.data('textHeightMode') !== 'fixed') {
    throw new Error('Text node dimension modes not fixed after resize');
  }

  const div = node.scratch('_callout').div;
  if (parseFloat(div.style.width) !== 150 || parseFloat(div.style.height) !== 80) {
    throw new Error('Callout dimensions not applied');
  }

  window.TextCallout.refresh(node);
  const baseFontSize = parseFloat(div.style.fontSize);
  if (!Number.isFinite(baseFontSize) || baseFontSize <= 0) {
    throw new Error('Base font size not established');
  }

  editor.showEditor(node);
  document.getElementById('text-node-width').value = '120';
  document.getElementById('text-node-height').value = '60';
  await editor.saveTextNodeChanges();
  await new Promise(resolve => setTimeout(resolve, 0));
  if (node.data('width') !== 120 || node.data('height') !== 60) {
    throw new Error('Text node dimensions not updated after resize');
  }
  if (node.data('textWidthMode') !== 'fixed' || node.data('textHeightMode') !== 'fixed') {
    throw new Error('Text node dimension modes not fixed after second resize');
  }

  window.TextCallout.refresh(node);
  const resizedFont = parseFloat(div.style.fontSize);
  if (Math.abs(resizedFont - baseFontSize) > 0.01) {
    throw new Error('Font size changed after editor resize');
  }

  console.log('Text node editor resizes node and callout');
  console.log('Text node editor keeps callout font stable after resize');
})();
