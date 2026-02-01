const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

const notifications = { show: () => {} };

window.IntegrationsManager = {
  getSerpApiKey: () => 'SERP_KEY',
  getOpenAIApiKey: () => 'OPENAI_KEY'
};

window.GraphManager = {
  currentGraph: { nodes: [], edges: [] },
  addNode(nodeData) { this.currentGraph.nodes.push({ data: nodeData }); },
  addEdge(edgeData) { this.currentGraph.edges.push({ data: edgeData }); }
};

require('../js/features/context-menu/context-menu-module.js');
const ContextMenuModule = window.ContextMenuModule;
const cy = cytoscape({ headless: true, styleEnabled: true });

const menuModule = new ContextMenuModule({
  cytoscape: cy,
  notifications,
  graphOperations: {},
  dataManager: {},
  nodeEditor: {},
});

const reportNode = cy.add({ group: 'nodes', data: { id: 'report1', label: 'http://example.com', type: 'report' } });

let retrieveReportCalled = false;
class MockPipeline {
  async retrieve() { throw new Error('retrieve should not be called'); }
  async retrieveReport(url) {
    retrieveReportCalled = true;
    return [{ content: 'context', metadata: { url, title: 'Example Report' } }];
  }
  buildPrompt() { return 'prompt'; }
  async queryOpenAI() {
    return { choices: [{ message: { content: '```json\n{"summary":{"title":"s","body":""}}\n```' } }] };
  }
}
window.RAGPipeline = MockPipeline;

(async () => {
  await menuModule.aiFetch(reportNode);
  if (!retrieveReportCalled) {
    throw new Error('retrieveReport was not called');
  }
  const summaryNode = cy.nodes().filter(n => n.data('type') === 'text' && n.data('label') === 's').first();
  if (!summaryNode || summaryNode.parent().length !== 0) {
    throw new Error('Summary text node should be outside main container');
  }
  const edge = cy.edges().filter(e => e.data('source') === 'report1' && e.data('target') === summaryNode.id());
  if (edge.length === 0) {
    throw new Error('Edge from report to summary missing');
  }
  console.log('Report nodes with URL label are processed');
  process.exit(0);
})();
