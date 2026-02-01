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

// Add a container node
const node = cy.add({ group: 'nodes', data: { id: 'container1', type: 'container' }, classes: 'container' });

// Show node menu for container node
menuModule.showNodeMenu(0, 0, [node]);

// Verify menu contains Remove container option
const hasRemove = Array.from(menuModule.menu.querySelectorAll('.menu-item'))
  .some(item => item.textContent === 'Remove container');

if (!hasRemove) {
  throw new Error('Remove container option missing for container nodes');
}

console.log('Remove container option available for container nodes');
process.exit(0);
