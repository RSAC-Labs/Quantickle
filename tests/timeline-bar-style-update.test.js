const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;
global.localStorage = { getItem: () => null, setItem: () => {} };

const notifications = { show: () => {} };
const keyboardManager = { disable: () => {}, enable: () => {} };

const cy = cytoscape({ headless: true, styleEnabled: true });

require('../js/features/node-editor/node-editor-module.js');
const editor = new window.NodeEditorModule({ cytoscape: cy, notifications, keyboardManager });

cy.add({ data: { id: 't1', type: 'timeline-bar', color: '#ff0000', barLength: 100, size: 10 }, position: { x: 50, y: 75 } });
const node = cy.getElementById('t1');
editor.applyNodeStyles(node);

const initialWidth = node.style('width');
const initialPosition = { ...node.position() };

editor.selectedNode = node;
editor.updateNode({ color: '#00ff00', size: 20 });

if (node.data('color') !== '#00ff00') {
  throw new Error('Color not updated');
}
if (node.style('width') !== initialWidth) {
  throw new Error('Timeline bar width changed');
}
if (parseFloat(node.style('height')) !== 20) {
  throw new Error('Timeline bar thickness not updated');
}
const pos = node.position();
if (pos.x !== initialPosition.x || pos.y !== initialPosition.y) {
  throw new Error('Timeline bar position changed');
}

console.log('Timeline bar color and thickness update preserve width and position');
process.exit(0);
