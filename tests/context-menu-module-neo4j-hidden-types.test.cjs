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

const container = cy.add({
  group: 'nodes',
  data: { id: 'container-1', type: 'container', label: 'Container' },
  classes: 'container'
});

menuModule.showNodeMenu(0, 0, [container]);

const containerHasNeo4j = Array.from(menuModule.menu.querySelectorAll('.menu-item'))
  .some(item => item.textContent === 'Query Neo4j DB');

if (containerHasNeo4j) {
  throw new Error('Query Neo4j DB option should be hidden for container nodes');
}

const textNode = cy.add({
  group: 'nodes',
  data: { id: 'text-1', type: 'text', label: 'Text node' }
});

menuModule.showNodeMenu(0, 0, [textNode]);

const textHasNeo4j = Array.from(menuModule.menu.querySelectorAll('.menu-item'))
  .some(item => item.textContent === 'Query Neo4j DB');

if (textHasNeo4j) {
  throw new Error('Query Neo4j DB option should be hidden for text nodes');
}

console.log('Query Neo4j DB option hidden for container and text nodes');
process.exit(0);
