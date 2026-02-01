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

// Stub methods
fm.applyGraphData = function(graphData) { this.graphData = graphData; };
fm.validateFile = () => true;
fm.readFileAsText = async () => JSON.stringify({
  nodes: [{ data: { id: 'n1', label: 'N1', x: null, y: null }, position: { x: 10, y: 20 } }],
  edges: []
});
fm.containsExternalResources = () => false;
fm.showExternalResourcePrompt = async () => true;
fm.validateGraphData = () => true;
fm.hasExternalReferences = () => false;

(async () => {
  await fm.loadGraphFile({ name: 'test.qut', size: 0, lastModified: Date.now() });
  assert.strictEqual(fm.graphData.nodes[0].x, 10);
  assert.strictEqual(fm.graphData.nodes[0].y, 20);
  console.log('file-manager-null-position.test.js passed');
})();
