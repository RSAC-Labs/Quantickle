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
  currentGraph: { nodes: [{ data: { id: 'report1', label: 'Report 1', type: 'report', url: 'http://example.com' } }], edges: [] },
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

const reportNode = cy.add({ group: 'nodes', data: { id: 'report1', label: 'Report 1', type: 'report', url: 'http://example.com' } });

let retrieveCalled = false;
let retrieveReportCalled = false;
class MockPipeline {
  async retrieve() { retrieveCalled = true; return []; }
  async retrieveReport(url) {
    retrieveReportCalled = true;
    return [{ content: 'context a.com', metadata: { url, title: 'Example Report' } }];
  }
  buildPrompt() { return 'context a.com'; }
  async queryOpenAI() {
    return { choices: [{ message: { content: '```json\n{"summary":{"title":"s","body":""},"iocs":{"domains":["a.com"]}}\n```' } }] }; }
}
window.RAGPipeline = MockPipeline;

(async () => {
  await menuModule.aiFetch(reportNode);
  if (retrieveCalled) {
    throw new Error('retrieve should not be called for report nodes');
  }
  if (!retrieveReportCalled) {
    throw new Error('retrieveReport was not called');
  }
  const reports = window.GraphManager.currentGraph.nodes.filter(n => n.data.type === 'report');
  if (reports.length !== 1) {
    throw new Error('New report node should not be created');
  }
  const domain = window.GraphManager.currentGraph.nodes.find(n => n.data.label === 'a.com');
  if (!domain) {
    throw new Error('Domain node not added');
  }
  const edge = window.GraphManager.currentGraph.edges.find(e => e.data.source === 'report1' && e.data.target === domain.data.id);
  if (!edge) {
    throw new Error('Edge from report to domain missing');
  }
  const domainCy = cy.nodes().filter(n => n.data('label') === 'a.com').first();
  const domainContainerId = 'domain_report1';
  const domainContainer = cy.getElementById(domainContainerId);
  if (!domainContainer || domainContainer.length === 0) {
    throw new Error('Domain container missing');
  }
  if (cy.getElementById('openai_container_report1').length !== 0) {
    throw new Error('OpenAI service container should not be created');
  }
  if (domainContainer.parent().length !== 0) {
    throw new Error('Domain container should be placed on the desktop');
  }
  if (domainCy.parent().id() !== domainContainerId) {
    throw new Error('Domain node not inside domain container');
  }
  const summaryNode = cy.nodes().filter(n => n.data('type') === 'text' && n.data('label') === 's').first();
  if (!summaryNode || summaryNode.parent().length !== 0) {
    throw new Error('Summary text node should be outside main container');
  }
  const summaryEdge = window.GraphManager.currentGraph.edges.find(e => e.data.source === 'report1' && e.data.target === summaryNode.id());
  if (!summaryEdge) {
    throw new Error('Edge from report to summary missing');
  }
  console.log('Report node is processed directly without web search');
  process.exit(0);
})();
