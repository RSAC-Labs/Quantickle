const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

// Set up DOM environment
const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Prevent IntegrationsManager.init from running automatically
Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
document.addEventListener = () => {};

// Minimal stubs required by getOrCreateNode
window.NodeTypes = { default: { color: '#999999', size: 20, shape: 'round-rectangle', icon: '' } };
window.GraphRenderer = { normalizeNodeData: () => {} };
window.DataManager = { getGraphData: () => ({ nodes: [], edges: [] }), setGraphData: () => {} };
window.TableManager = { updateNodeTypesTable: () => {} };
window.GraphAreaEditor = { getSettings: () => ({ labelColor: '#333333' }) };
window.LayoutManager = { calculateOptimalSizing: () => ({}), updateNodeStyles: () => {} };

// Load IntegrationsManager
require('../js/integrations.js');
const IntegrationsManager = window.IntegrationsManager;

// Headless Cytoscape instance
const cy = cytoscape({ headless: true, styleEnabled: true });

(async () => {
  // Create first node
  const first = await IntegrationsManager.getOrCreateNode(cy, 'id1', { label: 'Legacy Node', type: 'default' });
  if (!first.created) {
    throw new Error('First node was not created');
  }

  // Attempt to create duplicate node with different id but same label
  const duplicate = await IntegrationsManager.getOrCreateNode(cy, 'id2', { label: 'Legacy Node', type: 'default' });
  if (duplicate.created) {
    throw new Error('Duplicate node was created based on label');
  }
  if (duplicate.id !== first.id) {
    throw new Error('Existing node id not returned for duplicate label');
  }

  console.log('IntegrationsManager avoids duplicate nodes by label');

  // Clean up Cytoscape instance to ensure Node process can exit
  cy.destroy();
})();
