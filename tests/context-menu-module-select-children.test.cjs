const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Stub notifications
const notifications = { show: () => {} };

// Build Cytoscape instance
const cy = cytoscape({ headless: true, styleEnabled: true });

// Load module
require('../js/features/context-menu/context-menu-module.js');
const ContextMenuModule = window.ContextMenuModule;

const menuModule = new ContextMenuModule({
  cytoscape: cy,
  notifications,
  graphOperations: {},
  dataManager: {},
  nodeEditor: {}
});

// Build graph a->b, a->c
cy.add([
  { group: 'nodes', data: { id: 'a' } },
  { group: 'nodes', data: { id: 'b' } },
  { group: 'nodes', data: { id: 'c' } },
  { group: 'edges', data: { id: 'ab', source: 'a', target: 'b' } },
  { group: 'edges', data: { id: 'ac', source: 'a', target: 'c' } }
]);

cy.$('#a').select();

menuModule.selectChildren([cy.$('#a')]);

const selectedIds = cy.nodes(':selected').map(n => n.id());
if (!(selectedIds.includes('b') && selectedIds.includes('c'))) {
  throw new Error('Child nodes not selected by module');
}

if (selectedIds.length !== 3) {
  throw new Error('Unexpected number of selected nodes');
}

console.log('ContextMenuModule.selectChildren selects child nodes correctly');
process.exit(0);
