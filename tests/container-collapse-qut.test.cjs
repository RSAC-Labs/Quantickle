const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

// Setup DOM environment
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

// Load core scripts
require('../js/graph.js');
require('../js/graph-manager.js');

const GraphRenderer = window.GraphRenderer;
const GraphManager = window.GraphManager;

// Stub DataManager
window.DataManager = {
  setGraphData(data) { this._data = data; },
  getGraphData() { return this._data; }
};

// Disable LOD system to simplify testing
window.LODSystem = { config: { enabled: false } };

// Stub validation module
window.Validation = {
  validators: {
    validateNode: () => ({ valid: true }),
    validateEdge: () => ({ valid: true }),
    validateGraph: () => ({ valid: true }),
    validateGraphState: () => ({ valid: true }),
    validateRenderData: () => ({ valid: true })
  }
};
window.QuantickleConfig = { validation: { enabled: false } };

// Initialize Cytoscape instance
GraphRenderer.cy = cytoscape({ headless: true, styleEnabled: true });

// Minimal QUT-style graph data with a container and child
const graphData = {
  nodes: [
    { id: 'c1', label: 'Container', type: 'container', width: 200, height: 200, x: 0, y: 0 },
    { id: 'n1', label: 'Child', parent: 'c1', x: 10, y: 10 },
    { id: 'n2', label: 'Other', x: 40, y: 40 }
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' }
  ]
};

(async () => {
  await GraphManager.loadGraphData(graphData);
  await new Promise(r => setTimeout(r, 50));

  const container = GraphRenderer.cy.getElementById('c1');
  const child = GraphRenderer.cy.getElementById('n1');
  const edge = GraphRenderer.cy.getElementById('e1');

  // Ensure class assignment
  if (!container.hasClass('container')) {
    throw new Error('Container should have class \'container\'');
  }

  // Collapse container
  GraphRenderer.toggleContainerCollapse(container);
  if (child.style('display') !== 'none') {
    throw new Error('Child should be hidden when container is collapsed');
  }
  if (edge.style('display') !== 'none') {
    throw new Error('Edge should be hidden when container is collapsed');
  }

  // Expand container
  GraphRenderer.toggleContainerCollapse(container);
  if (child.style('display') !== 'element') {
    throw new Error('Child should be visible when container is expanded');
  }
  if (edge.style('display') !== 'element') {
    throw new Error('Edge should be visible when container is expanded');
  }

  console.log('container-collapse-qut.test.cjs passed');
  process.exit(0);
})();
