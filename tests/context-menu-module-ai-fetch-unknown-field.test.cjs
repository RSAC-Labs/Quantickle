const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

const notifications = { show: () => {} };

window.GraphManager = {
  currentGraph: { nodes: [], edges: [] },
  addNode(nodeData) {
    this.currentGraph.nodes.push({ data: nodeData });
  },
  addEdge(edgeData) {
    this.currentGraph.edges.push({ data: { id: `${edgeData.source}-${edgeData.target}`, ...edgeData } });
  }
};

require('../js/features/context-menu/context-menu-module.js');
const ContextMenuModule = window.ContextMenuModule;
const cy = cytoscape({ headless: true, styleEnabled: true });

const menuModule = new ContextMenuModule({
  cytoscape: cy,
  notifications,
  graphOperations: {},
  dataManager: {},
  nodeEditor: {}
});

const node = cy.add({ group: 'nodes', data: { id: 'domain_test', label: 'test.com', type: 'domain' } });

class MockPipeline {
  async retrieve() {
    return [{ content: 'context foo.rdp', metadata: { url: 'http://example.com', title: 'Example' } }];
  }
  buildPrompt() { return 'prompt'; }
  async queryOpenAI() {
    return {
      choices: [{ message: { content: '```json\n{"summary":{"title":"Report","body":""},"iocs":{"rdp_file_names":["foo.rdp"]}}\n```' } }]
    };
  }
}
window.RAGPipeline = MockPipeline;

(async () => {
  await menuModule.aiFetch(node);
  const report = window.GraphManager.currentGraph.nodes.find(n => n.data.type === 'report');
  if (!report) throw new Error('Report node missing');
  const containerId = `rdp_file_names_${report.data.id}`;
  const containerCy = cy.getElementById(containerId);
  if (!containerCy || containerCy.length === 0) throw new Error('Unknown field container missing');
  if (containerCy.parent().id()) throw new Error('Container should not be nested under a report node');
  const childCy = cy.nodes().filter(n => n.data('label') === 'foo.rdp').first();
  if (!childCy || childCy.data('type') !== 'default' || childCy.parent().id() !== containerId) throw new Error('Default node for unknown field not created');
  const edge = window.GraphManager.currentGraph.edges.find(e => e.data.source === report.data.id && e.data.target === childCy.id() && e.data.type === 'rdp_file_names');
  if (!edge) throw new Error('Edge from report to default node missing');
  console.log('Unknown fields create default nodes inside field containers');
  process.exit(0);
})();
