const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

const notifications = { show: () => {} };
const cy = cytoscape({ headless: true, styleEnabled: true });

require('../js/features/context-menu/context-menu-module.js');
const ContextMenuModule = window.ContextMenuModule;

const menuModule = new ContextMenuModule({
  cytoscape: cy,
  notifications,
  graphOperations: {},
  dataManager: {},
  nodeEditor: {}
});

menuModule.showGraphMenu(0, 0);

const hasOption = Array.from(menuModule.menu.querySelectorAll('.menu-item'))
  .some(item => item.textContent === 'Set Background Image');

if (!hasOption) {
  throw new Error('Set Background Image option missing in graph context menu');
}

console.log('Set Background Image option available in graph context menu');
process.exit(0);
