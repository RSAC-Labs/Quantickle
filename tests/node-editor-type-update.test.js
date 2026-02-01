const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;
global.localStorage = { getItem: () => null, setItem: () => {} };

window.NodeTypes = {
  default: { color: '#000000', size: 20, shape: 'ellipse', icon: '', labelColor: '#111111' },
  custom: { color: '#123456', size: 40, shape: 'star', icon: 'icon1', labelColor: '#654321', labelPlacement: 'bottom' }
};

window.IconConfigs = { icon1: 'icon1.png' };

const notifications = { show: () => {} };
const keyboardManager = { disable: () => {}, enable: () => {} };

const cy = cytoscape({ headless: true, styleEnabled: true });

require('../js/features/node-editor/node-editor-module.js');
const editor = new window.NodeEditorModule({ cytoscape: cy, notifications, keyboardManager });

cy.add({ data: { id: 'n1', label: 'N1', type: 'default', color: '#000000', size: 20, shape: 'ellipse' } });
const node = cy.getElementById('n1');
editor.showEditor(node);

const typeSelect = document.getElementById('node-type');
typeSelect.value = 'custom';
typeSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

if (node.data('type') !== 'custom') {
  throw new Error('Type not updated');
}
if (node.data('color') !== '#123456') {
  throw new Error('Color not applied from new type');
}
if (node.data('size') !== 40) {
  throw new Error('Size not applied from new type');
}
if (node.data('shape') !== 'star') {
  throw new Error('Shape not applied from new type');
}
if (node.data('icon') !== 'icon1') {
  throw new Error('Icon not applied from new type');
}
if (node.data('labelColor') !== '#654321') {
  throw new Error('Label color not applied from new type');
}
if (node.data('labelPlacement') !== 'bottom') {
  throw new Error('Label placement not applied from new type');
}

console.log('NodeEditor applies node type defaults on type change');
process.exit(0);
