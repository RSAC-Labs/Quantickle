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

const node1 = cy.add({ group: 'nodes', data: { id: 'pin_test1', label: 'PinTest1', type: 'generic' } });
const node2 = cy.add({ group: 'nodes', data: { id: 'pin_test2', label: 'PinTest2', type: 'generic' } });

menuModule.showNodeMenu(0, 0, [node1, node2], node1);
const pinItem = Array.from(menuModule.menu.querySelectorAll('.menu-item'))
  .find(item => item.textContent === 'Pin Node');
if (!pinItem) {
  throw new Error('Pin option missing for target node');
}
pinItem.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

if (!node1.locked() || node2.locked()) {
  throw new Error('Pin action affected incorrect nodes');
}

menuModule.showNodeMenu(0, 0, [node1, node2], node1);
const unpinItem = Array.from(menuModule.menu.querySelectorAll('.menu-item'))
  .find(item => item.textContent === 'Unpin Node');
if (!unpinItem) {
  throw new Error('Unpin option missing for pinned node');
}
unpinItem.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

if (node1.locked()) {
  throw new Error('Node was not unpinned');
}

console.log('Pin option available for hovered node and toggles to Unpin correctly');
process.exit(0);

