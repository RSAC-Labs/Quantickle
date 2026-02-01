const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost' });
global.window = dom.window;
global.document = dom.window.document;

window.NodeTypes = { default: { color: '#ccc', size: 20, shape: 'ellipse' }, container: { color: '#aaa', size: 30, shape: 'round-rectangle' } };
window.GraphRenderer = { normalizeNodeData: () => {} };
window.localStorage = { getItem: () => null, setItem: () => {} };
global.localStorage = window.localStorage;
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
cy.add({ data: { id: 'source' } });

window.GraphEditorAdapter = {
  addContainer: (x, y, opts) => {
    // Simulate legacy addNode ignoring provided id
    return cy.add({
      group: 'nodes',
      data: { id: `manual_node_${Math.random()}`, label: opts.label, type: 'container', isContainer: true },
      position: { x, y },
      classes: 'container'
    });
  }
};

(async () => {
  const { id: newNodeId } = await IntegrationsManager.getOrCreateNode(cy, 'child', { label: 'child' });
  IntegrationsManager.positionNodesNearSource(cy, 'source', [newNodeId], 'VirusTotal');

  const containers = cy.nodes('.container');
  if (containers.length !== 1) {
    throw new Error(`Expected 1 container, found ${containers.length}`);
  }
  const container = containers[0];
  if (container.id() !== 'virustotal_container_source') {
    throw new Error(`Container id mismatch: ${container.id()}`);
  }
  if (cy.getElementById(newNodeId).parent().id() !== container.id()) {
    throw new Error('Node not moved into VirusTotal container');
  }

  console.log('VirusTotal integration does not create duplicate container');
  process.exit(0);
})();
