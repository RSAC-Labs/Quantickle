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

const reportUrl = 'http://example.com/report';
const reportNode = cy.add({ group: 'nodes', data: { id: 'report1', label: 'Report 1', type: 'report', url: reportUrl } });

class MockPipeline {
  async retrieve() { throw new Error('retrieve should not be called'); }
  async retrieveReport(url) {
    return [{ content: 'context', metadata: { url, title: 'Example Report' } }];
  }
  buildPrompt() { return 'prompt'; }
  async queryOpenAI() {
    return { choices: [{ message: { content: '```json\n{"summary":{"title":"Summary","body":"Example summary with link ' + reportUrl + ' inside"}}\n```' } }] };
  }
}
window.RAGPipeline = MockPipeline;

(async () => {
  await menuModule.aiFetch(reportNode);
  const summaryNode = cy.nodes().filter(n => n.data('type') === 'text').first();
  const label = summaryNode.data('label') || '';
  const info = summaryNode.data('info') || '';
  if (label.includes(reportUrl) || info.includes(reportUrl)) {
    throw new Error('Report link included in summary');
  }
  const callout = summaryNode.data('callout') || {};
  if (!callout.body || callout.body.includes(reportUrl)) {
    throw new Error('Callout body leaked report link');
  }
  if (callout.body.trim() !== info.trim()) {
    throw new Error('Callout body not stored in info field');
  }
  if (callout.title && callout.title.trim() === callout.body.trim()) {
    throw new Error('Callout title duplicates body text');
  }
  if (callout.title !== label) {
    throw new Error('Callout title not synced with node label');
  }
  console.log('Summary does not include report link');
  process.exit(0);
})();
