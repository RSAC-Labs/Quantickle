const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Environment stubs
window.UI = { showNotification: () => {} };
window.DomainLoader = { autoLoadDomainsForGraph: async () => [] };
window.TableManager = { updateTables: () => {}, updateTotalDataTable: () => {} };
window.LayoutManager = { applyCurrentLayout: () => {}, currentLayout: 'preset', updateLayoutDropdown: () => {}, handleDragEvent: () => {} };
window.GraphAreaEditor = { applySettings: () => {} };
window.QuantickleConfig = { validation: { enabled: false } };
window.LODSystem = { init: () => {}, config: { enabled: false } };
window.GraphStyling = { applyDefaultStyles: () => {} };
window.GraphControls = { init: () => {} };
window.SelectionManager = { init: () => {} };
window.GraphEditor = { init: () => {} };
window.EdgeCreator = { init: () => {} };
window.PerformanceManager = { init: () => {} };
window.DebugTools = { init: () => {} };
window.ProgressManager = { init: () => {} };
window.BackgroundGridModule = { init: () => {} };
window.Validation = { validators: { validateNode: () => ({ valid: true, errors: [] }), validateEdge: () => ({ valid: true, errors: [] }) } };
window.NodeTypes = {
  default: { color: '#ffffff', size: 30, shape: 'round-rectangle', icon: '' },
  text: { fontFamily: 'Arial', fontSize: 14, fontColor: '#333333', bold: false, italic: false }
};
window.IconConfigs = {};
window.HTMLCanvasElement.prototype.getContext = () => null; // force fallback path

// GraphManager stub
window.GraphManager = {
  currentGraph: { nodes: [{ data: { id: 'rep1', label: 'Report 1', type: 'report', url: 'http://example.com' } }], edges: [] },
  addNode(nodeData) { this.currentGraph.nodes.push({ data: nodeData }); },
  addEdge(edgeData) { this.currentGraph.edges.push({ data: { id: `${edgeData.source}-${edgeData.target}`, ...edgeData } }); }
};

// Cytoscape headless setup
const cy = cytoscape({ headless: true, styleEnabled: true });

global.cytoscape = opts => cytoscape({ ...opts, headless: true, styleEnabled: true });

// Load modules under test
require('../js/graph.js');
require('../js/features/context-menu/context-menu-module.js');
const ContextMenuModule = window.ContextMenuModule;

const menuModule = new ContextMenuModule({
  cytoscape: cy,
  notifications: { show: () => {} },
  graphOperations: {},
  dataManager: {},
  nodeEditor: {}
});

// Add a report node to cy
const reportNode = cy.add({ group: 'nodes', data: { id: 'rep1', label: 'Report 1', type: 'report', url: 'http://example.com' } });

// Mock RAG pipeline to return long summary
const longSummary = 'a'.repeat(1000);
class MockPipeline {
  async retrieveReport() { return [{ content: 'context', metadata: { url: 'http://example.com', title: 'Example Report' } }]; }
  async retrieve() { return []; }
  buildPrompt() { return 'prompt'; }
  async queryOpenAI() {
    return { choices: [{ message: { content: '```json\n{"summary":{"title":"t","body":"' + longSummary + '"}}\n```' } }] };
  }
}
window.RAGPipeline = MockPipeline;

(async () => {
  await menuModule.aiFetch(reportNode);
  const summaryNode = cy.nodes().filter(n => n.data('type') === 'text').first();
  const width = summaryNode.data('width');
  const height = summaryNode.data('height');
  if (width !== 400 || height !== 300) {
    throw new Error('Summary node dimensions not clamped to max');
  }
  const gmNode = window.GraphManager.currentGraph.nodes.find(n => n.data.id === summaryNode.id());
  if (!gmNode || gmNode.data.width !== width || gmNode.data.height !== height) {
    throw new Error('GraphManager did not store summary node dimensions');
  }
  console.log('Summary node dimensions constrained and stored');
  process.exit(0);
})();
