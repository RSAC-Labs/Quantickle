const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

const notifications = { show: () => {} };

require('../js/features/context-menu/context-menu-module.js');
const ContextMenuModule = window.ContextMenuModule;
const cy = cytoscape({ headless: true, styleEnabled: true });

const menuModule = new ContextMenuModule({
  cytoscape: cy,
  notifications,
  graphOperations: {},
  dataManager: {},
  nodeEditor: {}
});

const reportNode = cy.add({ group: 'nodes', data: { id: 'report1', label: 'Report 1', type: 'report' } });

menuModule.showNodeMenu(0, 0, [reportNode]);
const items = menuModule.menu.querySelectorAll('.menu-item');
if (![...items].some(i => i.textContent === 'Query OpenAI')) {
  throw new Error('Query OpenAI option not available for report nodes');
}
console.log('Report nodes allow Query OpenAI');
process.exit(0);
