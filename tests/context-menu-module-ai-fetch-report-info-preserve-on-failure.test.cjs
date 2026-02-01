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
  currentGraph: { nodes: [{ data: { id: 'rep1', label: 'Report 1', type: 'report', url: 'http://example.com' } }], edges: [] },
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

const reportNode = cy.add({ group: 'nodes', data: { id: 'rep1', label: 'Report 1', type: 'report', url: 'http://example.com' } });

class MockPipeline {
  constructor() { this.calls = 0; }
  async retrieve() { throw new Error('retrieve should not be called'); }
  async retrieveReport(url) {
    this.calls++;
    if (this.calls === 1) {
      return [{ content: 'context', metadata: { url, title: 'Example Report' } }];
    }
    return [];
  }
  buildPrompt() { return 'prompt'; }
  async queryOpenAI() {
    return { choices: [{ message: { content: '```json\n{"summary":{"title":"sum","body":""}}\n```' } }] };
  }
}
window.RAGPipeline = MockPipeline;

(async () => {
  await menuModule.aiFetch(reportNode);
  const initialInfo = reportNode.data('info');
  const summaryNode = cy.nodes().filter(n => n.data('type') === 'text' && n.data('label') === 'sum').first();
  const initialSummary = summaryNode && summaryNode.data('label');
  if (summaryNode.parent().length !== 0) {
    throw new Error('Summary node should be outside main container');
  }
  await menuModule.aiFetch(reportNode); // second call returns no docs
  const infoAfterFailure = reportNode.data('info');
  const summaryNodeAfter = cy.nodes().filter(n => n.data('type') === 'text' && n.data('label') === 'sum').first();
  const summaryAfter = summaryNodeAfter && summaryNodeAfter.data('label');
  if (infoAfterFailure !== initialInfo || summaryAfter !== initialSummary || summaryNodeAfter.parent().length !== 0) {
    throw new Error('Existing data should remain unchanged when fetch fails');
  }
  const edge = cy.edges().filter(e => e.data('source') === 'rep1' && e.data('target') === summaryNode.id());
  if (edge.length === 0) {
    throw new Error('Edge from report to summary missing');
  }
  console.log('Report info preserved when fetch fails');
  process.exit(0);
})();
