const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

const notifications = { show: () => {} };

window.GraphManager = {
  currentGraph: { nodes: [], edges: [] },
  addNode(nodeData) { this.currentGraph.nodes.push({ data: nodeData }); },
  addEdge(edgeData) { this.currentGraph.edges.push({ data: { id: `${edgeData.source}-${edgeData.target}`, ...edgeData } }); }
};

window.GraphAreaEditor = {
  getSettings: () => ({ labelColor: '#333333' }),
  applyNodeSettings: nodes => { nodes.forEach(n => n.style('color', '#333333')); }
};

window.NodeTypes = {
  default: { color: '#000', size: 30, shape: 'ellipse', icon: '', labelColor: '#333333', labelPlacement: 'bottom' }
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

const baseNode = cy.add({ group: 'nodes', data: { id: 'domain_test', label: 'test.com', type: 'domain' } });

class MockPipeline {
  async retrieve() {
    return [{ content: 'context play-mock.test', metadata: { url: 'http://example.com', title: 'Example' } }];
  }
  buildPrompt() { return 'context play-mock.test'; }
  async queryOpenAI() {
    return {
      choices: [{ message: { content: '```json\n{"summary":{"title":"s","body":""},"iocs":{"domains":["play-mock.test"]}}\n```' } }]
    };
  }
}

window.RAGPipeline = MockPipeline;

(async () => {
  await menuModule.aiFetch(baseNode);
  const added = cy.nodes().filter(n => n.data('label') === 'play-mock.test').first();
  if (!added || added.style('color') !== 'rgb(51,51,51)') {
    throw new Error('Label color not applied');
  }
  if (added.style('text-valign') !== 'bottom') {
    throw new Error('Label placement not applied');
  }
  console.log('RAG pipeline nodes apply label styling');
  process.exit(0);
})();
