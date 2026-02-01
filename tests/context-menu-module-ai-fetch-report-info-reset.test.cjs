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
  async retrieve() { throw new Error('retrieve should not be called'); }
  async retrieveReport(url) {
    return [{ content: 'context', metadata: { url, title: 'Example Report' } }];
  }
  buildPrompt() { return 'prompt'; }
  async queryOpenAI() {
    return { choices: [{ message: { content: '```json\n{"summary":{"title":"sum","body":""}}\n```' } }] };
  }
}
window.RAGPipeline = MockPipeline;

(async () => {
  await menuModule.aiFetch(reportNode);
  await menuModule.aiFetch(reportNode);
  const info = reportNode.data('info') || '';
  const urlCount = (info.match(/http:\/\/example\.com/g) || []).length;
  if (urlCount !== 1) {
    throw new Error('Info field not reset');
  }
  const textNodes = cy.nodes().filter(n => n.data('type') === 'text' && n.data('label') === 'sum');
  if (textNodes.length !== 1 || textNodes.first().parent().length !== 0) {
    throw new Error('Summary text node not handled correctly');
  }
  const edge = cy.edges().filter(e => e.data('source') === 'rep1' && e.data('target') === textNodes.first().id());
  if (edge.length === 0) {
    throw new Error('Edge from report to summary missing');
  }
  console.log('Report info field resets between runs');
  process.exit(0);
})();
