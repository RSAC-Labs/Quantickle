const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

window.NodeTypes = { default: { color: '#ccc', size: 20, shape: 'ellipse' } };
window.GraphRenderer = { normalizeNodeData: () => {} };
window.DataManager = {
  graphData: { nodes: [], edges: [] },
  getGraphData() { return this.graphData; },
  setGraphData(data) { this.graphData = data; }
};
window.TableManager = { updateNodeTypesTable: () => {} };
window.GraphAreaEditor = { getSettings: () => ({ labelColor: '#333333' }) };
window.LayoutManager = { calculateOptimalSizing: () => ({}), updateNodeStyles: () => {} };

require('../js/integrations.js');
const IntegrationsManager = window.IntegrationsManager;

const cy = cytoscape({ headless: true, styleEnabled: true });

cy.add([
  { data: { id: 'c1' }, classes: 'container' },
  { data: { id: 'n1', parent: 'c1' } }
]);

(async () => {
  const { id: newNodeId } = await IntegrationsManager.getOrCreateNode(cy, 'n2', { label: 'n2' });
  IntegrationsManager.positionNodesNearSource(cy, 'n1', [newNodeId]);

  if (cy.getElementById(newNodeId).parent().id() !== 'c1') {
    throw new Error('New node not assigned to container');
  }

  const nodeData = window.DataManager.getGraphData().nodes.find(n => n.data.id === newNodeId);
  if (!nodeData || nodeData.data.parent !== 'c1') {
    throw new Error('DataManager not updated with container parent');
  }

  console.log('Integration nodes inherit container from source');
  process.exit(0);
})();
