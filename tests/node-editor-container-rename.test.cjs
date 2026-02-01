const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { pretendToBeVisual: true });
const { window } = dom;

global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

global.cytoscape = opts => cytoscape({ ...opts, headless: true, styleEnabled: true });

window.NodeTypes = {
  default: { color: '#445566', size: 30, shape: 'round-rectangle', icon: '', labelColor: '#223344' }
};
window.IconConfigs = {};

let savedGraphData = null;
window.DataManager = {
  getGraphData: () => ({ nodes: [], edges: [] }),
  setGraphData: (data, options) => {
    savedGraphData = { data, options };
  }
};
window.TableManager = { updateNodesDataTable: () => {} };

const notifications = { show: () => {} };
const keyboardManager = { disable: () => {}, enable: () => {} };

require('../js/features/node-editor/node-editor-module.js');

const cy = cytoscape();
const editor = new window.NodeEditorModule({ cytoscape: cy, notifications, keyboardManager });

cy.add({
  data: {
    id: 'container-1',
    label: 'Original Container',
    baseLabel: 'Original Container',
    type: 'default',
    color: '#445566',
    size: 30,
    borderColor: '#112233',
    opacity: 1,
    shape: 'round-rectangle',
    labelVisible: true
  },
  position: { x: 0, y: 0 },
  classes: 'container'
});

const node = cy.getElementById('container-1');

editor.showEditor(node);

const labelField = document.getElementById('node-label');
if (!labelField) {
  throw new Error('Node label field not found in editor');
}

labelField.value = 'Updated Name \u25BC';

editor.saveChanges();

const expectedLabel = 'Updated Name';

if (node.data('label') !== expectedLabel) {
  throw new Error(`Node label not trimmed correctly. Expected "${expectedLabel}", got "${node.data('label')}"`);
}

if (node.data('baseLabel') !== expectedLabel) {
  throw new Error(`Node baseLabel not synchronized. Expected "${expectedLabel}", got "${node.data('baseLabel')}"`);
}

if (!savedGraphData || !savedGraphData.data || !Array.isArray(savedGraphData.data.nodes)) {
  throw new Error('Graph data was not synchronized after saving changes');
}

const savedNode = savedGraphData.data.nodes.find(entry => entry.data && entry.data.id === 'container-1');
if (!savedNode) {
  throw new Error('Saved graph data does not include the updated container');
}

if (savedNode.data.label !== expectedLabel) {
  throw new Error(`Saved node label mismatch. Expected "${expectedLabel}", got "${savedNode.data.label}"`);
}

if (savedNode.data.baseLabel !== expectedLabel) {
  throw new Error(`Saved node baseLabel mismatch. Expected "${expectedLabel}", got "${savedNode.data.baseLabel}"`);
}

if (savedGraphData.options && savedGraphData.options.skipLayout !== true) {
  throw new Error('Graph data synchronization options missing expected skipLayout flag');
}

console.log('Node editor synchronizes container label and baseLabel on rename');
process.exit(0);
