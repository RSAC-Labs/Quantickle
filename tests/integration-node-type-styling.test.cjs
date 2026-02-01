const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Prevent IntegrationsManager.init from running automatically
Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
document.addEventListener = () => {};

window.NodeTypes = {
  default: { color: '#999999', size: 20, shape: 'round-rectangle', icon: 'default.png' },
  custom: { color: '#123456', size: 40, shape: 'star', icon: 'custom-icon.png' }
};

// Minimal GraphRenderer stub to process icons
window.GraphRenderer = {
  normalizeNodeData: ({ data }) => {
    data.backgroundImage = data.icon ? `url("${data.icon}")` : 'none';
  }
};

// Stubs to satisfy getOrCreateNode dependencies
window.DataManager = {
  getGraphData: () => ({ nodes: [], edges: [] }),
  setGraphData: () => {}
};

window.TableManager = { updateNodeTypesTable: () => {} };
window.GraphAreaEditor = { getSettings: () => ({ labelColor: '#333333' }) };
window.LayoutManager = {
  calculateOptimalSizing: () => ({}),
  updateNodeStyles: () => {}
};

require('../js/integrations.js');
const IntegrationsManager = window.IntegrationsManager;

const cy = cytoscape({ headless: true, styleEnabled: true });

(async () => {
  const { id, created } = await IntegrationsManager.getOrCreateNode(cy, 'n1', { type: 'custom', label: 'Test Node' });
  if (!created) {
    throw new Error('Node was not created');
  }

  const node = cy.getElementById(id);
  if (node.data('color') !== '#123456') {
    throw new Error('Color not applied from node type');
  }
  if (node.data('size') !== 40) {
    throw new Error('Size not applied from node type');
  }
  if (node.data('shape') !== 'star') {
    throw new Error('Shape not applied from node type');
  }
  if (node.data('icon') !== 'custom-icon.png') {
    throw new Error('Icon not applied from node type');
  }
  if (node.data('backgroundImage') !== 'url("custom-icon.png")') {
    throw new Error('Background image not set from icon');
  }

  console.log('IntegrationsManager applied node type styling with icons successfully');

  // Clean up Cytoscape instance to allow Node process to exit
  cy.destroy();
})();
