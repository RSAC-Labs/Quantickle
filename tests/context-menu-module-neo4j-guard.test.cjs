const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

global.window.IntegrationsManager = {
  getNeo4jCredentials: () => ({ url: 'http://localhost:7474', username: 'neo4j', password: 'neo4j' })
};

let checkCalls = 0;

global.window.GraphRenderer = {
  checkNeo4jForExistingNodes: async () => {
    checkCalls += 1;
  }
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

(async () => {
  const container = cy.add({
    group: 'nodes',
    data: { id: 'container-1', type: 'container', label: 'Container' },
    classes: 'container'
  });

  await menuModule.queryNeo4j(container);

  const textNode = cy.add({
    group: 'nodes',
    data: { id: 'text-1', type: 'text', label: 'Text node' }
  });

  await menuModule.queryNeo4j(textNode);

  if (checkCalls !== 0) {
    throw new Error('Neo4j lookup should not run for container or text nodes');
  }

  const validNode = cy.add({
    group: 'nodes',
    data: { id: 'node-1', type: 'domain', label: 'example.com' }
  });

  await menuModule.queryNeo4j(validNode);

  if (checkCalls !== 1) {
    throw new Error('Neo4j lookup should run exactly once for eligible nodes');
  }

  console.log('Neo4j lookup guard works for container, text, and valid nodes');
  process.exit(0);
})();
