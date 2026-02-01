const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body><div id="cy-wrapper"><div id="cy"></div></div></body></html>', { pretendToBeVisual: true });
const { window } = dom;

global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

global.cytoscape = opts => cytoscape({ ...opts, headless: true, styleEnabled: true });

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
  text: {
    color: 'rgba(0,0,0,0)',
    shape: 'round-rectangle',
    fontFamily: 'Arial',
    fontSize: 14,
    fontColor: '#333333',
    bold: false,
    italic: false,
    borderColor: '#000000',
    borderWidth: 1
  }
};
window.IconConfigs = {};
window.DOMPurify = { sanitize: value => value };
global.DOMPurify = window.DOMPurify;

const container = document.getElementById('cy');
const wrapper = document.getElementById('cy-wrapper');
Object.defineProperty(container, 'clientWidth', { value: 800 });
Object.defineProperty(container, 'clientHeight', { value: 600 });
Object.defineProperty(wrapper, 'getBoundingClientRect', {
  value: () => ({ left: 0, top: 0, width: 800, height: 600 })
});
Object.defineProperty(container, 'getBoundingClientRect', {
  value: () => ({ left: 0, top: 0, width: 800, height: 600 })
});

const calloutHost = document.createElement('div');
document.body.appendChild(calloutHost);
let refreshCalled = 0;
window.TextCallout = {
  init: () => {},
  refresh: (node) => {
    refreshCalled += 1;
    if (!node || typeof node.scratch !== 'function') return;
    let data = node.scratch('_callout');
    if (!data) {
      const div = document.createElement('div');
      calloutHost.appendChild(div);
      data = { div, lastContent: null };
      node.scratch('_callout', data);
    }
    const content = node.data('infoHtml') || node.data('info') || '';
    data.div.innerHTML = content;
    data.lastContent = content;
  }
};

global.wrapSummaryHtml = ({ title, body }) => `<div>${title}</div><p>${body}</p>`;

require('../js/graph.js');
require('../js/features/node-editor/node-editor-module.js');

const notifications = { show: () => {} };
const keyboardManager = { disable: () => {}, enable: () => {} };
const cy = cytoscape();
cy.container = () => container;
const editor = new window.NodeEditorModule({ cytoscape: cy, notifications, keyboardManager });

cy.add({ data: { id: 'n1', type: 'default', label: 'Original title', info: 'Original body' }, position: { x: 0, y: 0 } });
const node = cy.getElementById('n1');

(async () => {
  editor.showEditor(node);

  const modal = document.getElementById('node-editor-modal');
  if (!modal || modal.style.display !== 'block') {
    throw new Error('Standard node editor did not open for default node');
  }

  const typeField = document.getElementById('node-type');
  typeField.value = 'text';
  typeField.dispatchEvent(new window.Event('change', { bubbles: true }));

  const textModal = document.getElementById('text-node-editor-modal');
  if (!textModal || textModal.style.display !== 'block') {
    throw new Error('Text node editor did not open after type change');
  }

  if (node.data('type') !== 'default') {
    throw new Error('Node type changed before saving text conversion');
  }

  if (refreshCalled !== 0) {
    throw new Error('Text callout refresh should not run before saving');
  }

  document.getElementById('text-node-title').value = 'Converted title';
  document.getElementById('text-node-body').value = 'Converted body';
  document.getElementById('text-node-width').value = '240';
  document.getElementById('text-node-height').value = '120';

  await editor.saveTextNodeChanges();
  await new Promise(resolve => setTimeout(resolve, 0));

  if (refreshCalled === 0) {
    throw new Error('Text callout refresh was not triggered after saving');
  }

  if (node.data('type') !== 'text') {
    throw new Error('Node type was not set to text after saving');
  }

  if (node.data('label') !== 'Converted title' || node.data('info') !== 'Converted body') {
    throw new Error('Node text content not saved correctly');
  }

  if (node.data('shape') !== 'round-rectangle') {
    throw new Error('Text node should use a round-rectangle shape after conversion');
  }

  if (node.data('color') !== 'rgba(0,0,0,0)') {
    throw new Error('Text node should use a transparent background color after conversion');
  }

  if (node.data('fontFamily') !== 'Arial' || node.data('fontSize') !== 14) {
    throw new Error('Text node font settings were not applied correctly');
  }

  if (node.data('fontColor') !== '#333333') {
    throw new Error('Text node font color was not applied correctly');
  }

  if (node.data('borderColor') !== '#000000' || node.data('borderWidth') !== 1) {
    throw new Error('Text node border styling was not applied correctly');
  }

  if (node.data('opacity') !== 1) {
    throw new Error('Text node opacity should reset to fully opaque');
  }

  if (node.data('icon') !== '' || node.data('backgroundImage') !== 'none' || node.data('iconOpacity') !== 0) {
    throw new Error('Text node should not retain icon styling after conversion');
  }

  if (node.data('labelVisible') !== false) {
    throw new Error('Text node label visibility flag should be disabled');
  }

  const savedCallout = node.scratch('_callout');
  if (!savedCallout || !savedCallout.div.innerHTML.includes('Converted body')) {
    throw new Error('Text callout did not render updated content');
  }

  if (textModal.style.display !== 'none') {
    throw new Error('Text node editor did not close after saving');
  }

  console.log('Node editor converts nodes to text and renders callouts');
})();
