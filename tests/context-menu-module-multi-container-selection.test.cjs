const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

const notifications = { show: () => {} };

require('../js/features/context-menu/context-menu-module.js');
const ContextMenuModule = window.ContextMenuModule;

const cy = cytoscape({ headless: true, styleEnabled: true });

const selectionsDuringEdit = [];

const nodeEditor = {
  showEditor: () => {
    const selectedIds = cy.nodes().filter(n => n.selected()).map(n => n.id()).sort();
    selectionsDuringEdit.push(selectedIds);
  }
};

const menuModule = new ContextMenuModule({
  cytoscape: cy,
  notifications,
  graphOperations: {},
  dataManager: {},
  nodeEditor
});

const containerA = cy.add({
  group: 'nodes',
  data: { id: 'containerA', label: 'Container A', type: 'container' },
  classes: 'container'
});

const containerB = cy.add({
  group: 'nodes',
  data: { id: 'containerB', label: 'Container B', type: 'container' },
  classes: 'container'
});

containerA.select();
containerB.select();

menuModule.showNodeMenu(0, 0, [containerA, containerB]);

const editItem = Array.from(menuModule.menu.querySelectorAll('.menu-item'))
  .find(item => item.textContent === 'Edit Nodes');

if (!editItem) {
  throw new Error('Edit Nodes option not available for multiple containers');
}

editItem.click();

if (selectionsDuringEdit.length === 0) {
  throw new Error('Node editor did not open');
}

const [selectedIds] = selectionsDuringEdit;

if (selectedIds.length !== 2 || !selectedIds.includes('containerA') || !selectedIds.includes('containerB')) {
  throw new Error('Expected both containers to remain selected when opening the node editor');
}

console.log('Multiple containers remain selected when editing nodes from the context menu');
process.exit(0);
