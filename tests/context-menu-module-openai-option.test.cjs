const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Stub notifications
const notifications = { show: () => {} };

// Build Cytoscape instance
const cy = cytoscape({ headless: true, styleEnabled: true });

// Load context menu module
require('../js/features/context-menu/context-menu-module.js');
const ContextMenuModule = window.ContextMenuModule;

const menuModule = new ContextMenuModule({
  cytoscape: cy,
  notifications,
  graphOperations: {},
  dataManager: {},
  nodeEditor: {}
});

// Add a domain node
const node = cy.add({ group: 'nodes', data: { id: 'domain_test', label: 'test.com', type: 'domain' } });

// Show node menu for domain node
menuModule.showNodeMenu(0, 0, [node]);

// Verify menu contains Query OpenAI option
const hasOpenAI = Array.from(menuModule.menu.querySelectorAll('.menu-item'))
  .some(item => item.textContent === 'Query OpenAI');

if (!hasOpenAI) {
  throw new Error('Query OpenAI option missing for domain nodes');
}

console.log('Query OpenAI option available for domain nodes');
process.exit(0);
