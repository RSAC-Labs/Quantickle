const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

// Load core scripts
require('../js/graph.js');
const GraphRenderer = window.GraphRenderer;

const fs = require('fs');
const path = require('path');

// Load FileManagerModule
const fileManagerScript = fs.readFileSync(path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js'), 'utf8');
window.eval(fileManagerScript);
const FileManagerModule = window.FileManagerModule;

// Create cytoscape instance
const cy = cytoscape({ headless: true, styleEnabled: true });
GraphRenderer.cy = cy;

// Stub dependencies
window.DataManager = { setGraphData: () => {} };
window.DomainLoader = { autoLoadDomainsForGraph: async () => [] };

const fm = new FileManagerModule({
  cytoscape: cy,
  notifications: { show: () => {} },
  papaParseLib: {},
});

// Stub methods
fm.validateFile = () => true;
fm.containsExternalResources = () => false;
fm.showExternalResourcePrompt = async () => true;
fm.validateGraphData = () => true;
fm.normalizeQutData = data => data;
fm.readFileAsText = async () => JSON.stringify({
  nodes: [
    { id: 'c1', label: 'Container', type: 'container', width: 200, height: 200, x: 0, y: 0 },
    { id: 'n1', label: 'Child', parent: 'c1', x: 10, y: 10 },
    { id: 'n2', label: 'Other', x: 40, y: 40 }
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' }
  ]
});

(async () => {
  await fm.loadGraphFile({ name: 'test.qut', size: 0, lastModified: Date.now() });
  const container = cy.getElementById('c1');
  const child = cy.getElementById('n1');
  const edge = cy.getElementById('e1');

  if (!container.hasClass('container')) {
    throw new Error('Container should have class \'container\'');
  }

  GraphRenderer.toggleContainerCollapse(container);
  if (child.style('display') !== 'none') {
    throw new Error('Child should be hidden when container is collapsed');
  }
  if (edge.style('display') !== 'none') {
    throw new Error('Edge should be hidden when container is collapsed');
  }

  GraphRenderer.toggleContainerCollapse(container);
  if (child.style('display') !== 'element') {
    throw new Error('Child should be visible when container is expanded');
  }
  if (edge.style('display') !== 'element') {
    throw new Error('Edge should be visible when container is expanded');
  }

  console.log('file-manager-container-collapse.test.cjs passed');
  process.exit(0);
})();
