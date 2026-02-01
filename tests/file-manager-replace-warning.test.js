const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Setup DOM environment
const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;

global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

// Load FileManagerModule script
const scriptPath = path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf8');
window.eval(scriptContent);

// Instantiate FileManagerModule with a stub cytoscape instance that already has elements
const cyStub = {
  elements: () => ({ length: 1 }),
};

const fm = new window.FileManagerModule({
  cytoscape: null,
  notifications: { show: () => {} },
  papaParseLib: {},
});

fm.cy = cyStub;

// Stub methods to avoid full processing
fm.applyGraphData = () => {};
fm.validateFile = () => true;
fm.readFileAsText = async () => JSON.stringify({ nodes: [], edges: [] });
fm.containsExternalResources = () => false;
fm.showExternalResourcePrompt = async () => true;
fm.validateGraphData = () => true;
fm.hasExternalReferences = () => false;

let confirmCalled = false;
window.confirm = () => { confirmCalled = true; return true; };

(async () => {
  await fm.loadGraphFile({ name: 'test.qut', size: 0, lastModified: Date.now() });
  assert.ok(confirmCalled, 'Confirmation prompt should appear when graph exists');
  console.log('file-manager-replace-warning.test.js passed');
})();
