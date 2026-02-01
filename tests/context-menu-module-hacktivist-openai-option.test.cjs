const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

global.window.DomainLoader = {
  getDomainForType: type => (type === 'ANONM0S' ? 'hacktivist' : null)
};

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

const node = cy.add({ group: 'nodes', data: { id: 'hack_node', label: 'ANONM0S', type: 'ANONM0S' } });

menuModule.showNodeMenu(0, 0, [node]);

const hasOpenAI = Array.from(menuModule.menu.querySelectorAll('.menu-item'))
  .some(item => item.textContent === 'Query OpenAI');

if (!hasOpenAI) {
  throw new Error('Query OpenAI option missing for hacktivist nodes');
}

console.log('Query OpenAI option available for hacktivist nodes');
process.exit(0);
