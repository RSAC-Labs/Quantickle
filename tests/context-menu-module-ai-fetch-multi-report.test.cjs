const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

const notifications = { show: () => {} };

window.GraphManager = {
  currentGraph: { nodes: [{ data: { id: 'domain_test', label: 'test.com', type: 'domain' } }], edges: [] },
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
  nodeEditor: {},
});

const node = cy.add({ group: 'nodes', data: { id: 'domain_test', label: 'test.com', type: 'domain' } });

class MockPipeline {
  async retrieve() {
    return [
      { content: 'context1', metadata: { url: 'http://one.com', title: 'One' } },
      { content: 'context2', metadata: { url: 'http://two.com', title: 'Two' } }
    ];
  }
  buildPrompt() { return 'prompt'; }
  async queryOpenAI() {
    return { choices: [{ message: { content: '```json\n{"summary":{"title":"s","body":""}}\n```' } }] };
  }
}

window.RAGPipeline = MockPipeline;

(async () => {
  await menuModule.aiFetch(node);
  const reports = window.GraphManager.currentGraph.nodes.filter(n => n.data.type === 'report');
  if (reports.length !== 2) {
    throw new Error('Incorrect number of report nodes');
  }
  const urls = reports.map(r => r.data.info || '').join(' ');
  if (!urls.includes('http://one.com') || !urls.includes('http://two.com')) {
    throw new Error('Report nodes missing URLs');
  }
  const summaryNodes = cy.nodes().filter(n => n.data('type') === 'text');
  if (summaryNodes.length !== 1 || summaryNodes.first().parent().id()) {
    throw new Error('Expected one top-level summary text node');
  }
  for (const rep of reports) {
    const childSummary = cy.nodes().filter(
      n => n.data('type') === 'text' && n.parent().id()
    );
    if (childSummary.length !== 0) {
      throw new Error('Report should not contain a summary text node');
    }
  }
  console.log('AI fetch creates report per search result');
  process.exit(0);
})();
