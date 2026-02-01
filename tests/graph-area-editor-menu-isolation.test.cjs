const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body style="color:#000"><div class="menu-bar">Menu</div><div id="cy" style="width:100px;height:100px"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;

require('../js/features/graph-area-editor/graph-area-editor-module.js');
const GraphAreaEditorModule = window.GraphAreaEditorModule;

const cy = cytoscape({ headless: true, styleEnabled: true, container: document.getElementById('cy') });
const notifications = { show: () => {} };
window.GraphAreaEditor = new GraphAreaEditorModule({ cytoscape: cy, notifications });

window.GraphAreaEditor.applySettings({ labelColor: '#ff0000', backgroundColor: '#00ff00' });

const menuBar = document.querySelector('.menu-bar');
const color = window.getComputedStyle(menuBar).color;
if (color !== 'rgb(0, 0, 0)') {
  throw new Error('Menu bar color should remain unaffected by graph settings');
}

console.log('Menu bar unaffected by graph settings');
process.exit(0);
