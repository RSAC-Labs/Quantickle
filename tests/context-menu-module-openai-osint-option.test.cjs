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

const node = cy.add({ group: 'nodes', data: { id: 'person_test', label: 'John Doe', type: 'person' } });

menuModule.showNodeMenu(0, 0, [node]);

const hasOsint = Array.from(menuModule.menu.querySelectorAll('.menu-item'))
  .some(item => item.textContent === 'OpenAI OSINT');

if (!hasOsint) {
  throw new Error('OpenAI OSINT option missing for person nodes');
}

console.log('OpenAI OSINT option available for person nodes');
process.exit(0);
