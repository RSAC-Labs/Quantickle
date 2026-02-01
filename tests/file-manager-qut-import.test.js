const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Setup DOM and globals
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;
global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

// Load FileManagerModule script
const fileManagerScript = fs.readFileSync(path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js'), 'utf8');
window.eval(fileManagerScript);

// Instantiate FileManagerModule with minimal dependencies
const fm = new window.FileManagerModule({
  cytoscape: null,
  notifications: { show: () => {} },
  papaParseLib: {}
});

// Stub methods that rely on Cytoscape or external UI
fm.applyGraphData = function(graphData) { this.graphData = graphData; };
fm.validateFile = () => true;
fm.readFileAsText = async () => fs.readFileSync(path.join(__dirname, '..', 'examples', 'rare-new.qut'), 'utf8');
fm.containsExternalResources = () => false;
fm.showExternalResourcePrompt = async () => true;
fm.validateGraphData = () => true;
fm.hasExternalReferences = () => false;

(async () => {
  await fm.loadGraphFile({ name: 'rare-new.qut', size: 0, lastModified: Date.now() });
  assert.ok(Array.isArray(fm.graphData.nodes) && fm.graphData.nodes.length > 0, 'Nodes should be loaded');
  const firstNode = fm.graphData.nodes[0];
  assert.ok(firstNode.id, 'Node id should be flattened');
  assert.ok(firstNode.label, 'Node label should be present');
  assert.ok(Array.isArray(fm.graphData.edges) && fm.graphData.edges.length > 0, 'Edges should be loaded');
  const firstEdge = fm.graphData.edges[0];
  assert.ok(firstEdge.source && firstEdge.target, 'Edge should have source and target');
  console.log('file-manager-qut-import.test.js passed');
})();
