const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

const notifications = { show: () => {} };

window.GraphManager = {
  currentGraph: { nodes: [{ data: { id: 'person1', label: 'John Doe', type: 'person' } }], edges: [] },
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

const node = cy.add({ group: 'nodes', data: { id: 'person1', label: 'John Doe', type: 'person' } });

class MockPipeline {
  async retrieve() {
    return [{ content: 'context', metadata: { url: 'http://example.com', title: 'Example' } }];
  }
  buildPrompt() { return 'prompt'; }
  async queryOpenAI() {
    return {
      choices: [
        { message: { content: JSON.stringify({
          summary: { title: 'An individual', body: '' },
          companies: ['Acme Corp'],
          business_partners: ['Beta LLC'],
          organizations: ['Gamma Org'],
          political_connections: ['Jane Smith'],
          social_media_accounts: [{ handle: '@john', url: 'http://twitter.com/john' }],
          geographical_location: 'USA'
        }) } }
      ]
    };
  }
}

window.RAGPipeline = MockPipeline;

(async () => {
  await menuModule.aiOsintFetch(node);
  const addedCompany = window.GraphManager.currentGraph.nodes.find(n => n.data.label === 'Acme Corp');
  const addedPartner = window.GraphManager.currentGraph.nodes.find(n => n.data.label === 'Beta LLC');
  const addedOrg = window.GraphManager.currentGraph.nodes.find(n => n.data.label === 'Gamma Org');
  const addedPolit = window.GraphManager.currentGraph.nodes.find(n => n.data.label === 'Jane Smith');
  const addedSocial = window.GraphManager.currentGraph.nodes.find(n => n.data.label === '@john');
  const addedLoc = window.GraphManager.currentGraph.nodes.find(n => n.data.label === 'USA');
  const info = cy.getElementById('person1').data('info');
  if (!addedCompany || !addedPartner || !addedOrg || !addedPolit || !addedSocial || !addedLoc || !info.includes('An individual')) {
    throw new Error('OSINT fetch did not properly update the graph');
  }
  console.log('OpenAI OSINT fetch parses response and updates graph');
  process.exit(0);
})();
