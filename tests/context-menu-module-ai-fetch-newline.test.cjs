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

class MockPipeline {
  async retrieve() {
    return [{ content: 'context http://example.com/path1\npath2', metadata: { url: 'http://example.com', title: 'Example' } }];
  }
  buildPrompt() { return 'context http://example.com/path1\npath2'; }
  async queryOpenAI() {
    return {
      choices: [{
        message: {
          content: '```json\n{"summary":{"title":"Report","body":""},"iocs":{"urls":["http://example.com/path1\npath2"]}}\n```'
        }
      }]
    };
  }
}

window.RAGPipeline = MockPipeline;

(async () => {
  await menuModule.aiFetch(node);
  const urlNode = window.GraphManager.currentGraph.nodes.find(n => n.data.label.includes('http://example.com/path1'));
  if (!urlNode || !urlNode.data.label.includes('path2')) {
    throw new Error('URL node not added correctly');
  }
  console.log('AI fetch handles newline in JSON string and updates graph');
  process.exit(0);
})();
