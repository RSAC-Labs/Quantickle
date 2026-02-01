const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

global.window.IntegrationsManager = {
  getNeo4jCredentials: () => ({ url: 'http://localhost:7474', username: 'neo4j', password: 'neo4j' })
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

const node = cy.add({ group: 'nodes', data: { id: 'n1', label: 'alpha', type: 'default' } });

menuModule.showNodeMenu(0, 0, [node]);

const hasNeo4j = Array.from(menuModule.menu.querySelectorAll('.menu-item'))
  .some(item => item.textContent === 'Query Neo4j DB');

if (!hasNeo4j) {
  throw new Error('Query Neo4j DB option missing for nodes');
}

console.log('Query Neo4j DB option available for nodes');
process.exit(0);
