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
  nodeEditor: {}
});

const node = cy.add({ group: 'nodes', data: { id: 'domain_test', label: 'test.com', type: 'domain' } });
node.position({ x: 200, y: 200 });

class MockPipeline {
  async retrieve() {
    return [{ content: 'context play-mock.test', metadata: { url: 'http://example.com', title: 'Example' } }];
  }
  buildPrompt() { return 'context play-mock.test'; }
  async queryOpenAI() {
    return {
      choices: [{
        message: {
          content: '```json\n{"summary":{"title":"Report 1","body":""},"iocs":{"domains":["play-mock.test"]}}\n```'
        }
      }]
    };
  }
}

window.RAGPipeline = MockPipeline;

(async () => {
  await menuModule.aiFetch(node);
  const absolutePosition = (el) => {
    let x = 0, y = 0;
    let current = el;
    while (current && current.length) {
      const p = current.position();
      x += p.x;
      y += p.y;
      current = current.parent();
    }
    return { x, y };
  };
  const basePos = absolutePosition(node);
  const report = window.GraphManager.currentGraph.nodes.find(n => n.data.type === 'report');
  if (!report) {
    throw new Error('Report node not added');
  }
  const reportCy = cy.nodes().filter(n => n.data('type') === 'report').first();
  const reportPos = absolutePosition(reportCy);
  if (reportPos.x === 0 && reportPos.y === 0) {
    throw new Error('Report node was not positioned');
  }
  const domain = window.GraphManager.currentGraph.nodes.find(n => n.data.label === 'play-mock.test');
  if (!domain) {
    throw new Error('Domain node not added');
  }
  const domainCy = cy.nodes().filter(n => n.data('label') === 'play-mock.test').first();
  if (domainCy.data('domain') !== 'cybersecurity') {
    throw new Error('Domain node missing domain definition');
  }
  const domainContainerId = `domain_${report.data.id}`;
  const domainContainer = cy.getElementById(domainContainerId);
  if (!domainContainer || domainContainer.length === 0) {
    throw new Error('Domain type container missing');
  }
  if (domainContainer.parent().id()) {
    throw new Error('Domain container should not be nested under report node');
  }
  if (domainCy.parent().id() !== domainContainerId) {
    throw new Error('Domain node not inside domain container');
  }
  const edgeReportDomain = window.GraphManager.currentGraph.edges.find(e => e.data.source === report.data.id && e.data.target === domain.data.id);
  if (!edgeReportDomain) {
    throw new Error('Edge from report to domain missing');
  }
  if (!report.data.info || !report.data.info.includes('http://example.com')) {
    throw new Error('Report URL missing from report node');
  }
  const summaryNode = cy.nodes().filter(n => n.data('type') === 'text' && n.data('label') === 'Report 1').first();
  if (!summaryNode || summaryNode.parent().id()) {
    throw new Error('Summary text node missing or not top-level');
  }
  const edgeSummary = window.GraphManager.currentGraph.edges.find(
    e => e.data.source === 'domain_test' && e.data.target === summaryNode.id()
  );
  if (!edgeSummary) {
    throw new Error('Edge from source to summary missing');
  }
  console.log('AI fetch organizes results into containers and positions nodes near source');
  process.exit(0);
})();
