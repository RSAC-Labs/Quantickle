const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;
global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js'), 'utf8');
window.eval(script);

const edgesText = `A B\nB C\n`;

const fm = new window.FileManagerModule({
  cytoscape: null,
  notifications: { show: () => {} },
  papaParseLib: null
});

fm.applyGraphData = function(graphData) { this.graphData = graphData; };
fm.validateFile = () => true;
fm.readFileAsText = async () => edgesText;

(async () => {
  await fm.loadEdgesFile({ name: 'test.edges', size: edgesText.length, lastModified: Date.now() });
  assert.strictEqual(fm.graphData.nodes.length, 3, 'Should create three nodes');
  assert.strictEqual(fm.graphData.edges.length, 2, 'Should create two edges');
  console.log('file-manager-edge-list-import.test.js passed');
})();
