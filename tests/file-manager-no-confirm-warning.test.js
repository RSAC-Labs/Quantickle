const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;
global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

const scriptPath = path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
window.eval(scriptContent);

const fm = new window.FileManagerModule({
  cytoscape: null,
  notifications: { show: () => {} },
  papaParseLib: {},
});

let confirmCalled = false;
window.confirm = () => { confirmCalled = true; return true; };

fm.applyGraphData = () => {};
fm.validateFile = () => true;
fm.readFileAsText = async () => JSON.stringify({
  nodes: [{ data: { id: 'n1', icon: 'https://example.com/icon.png' } }],
  edges: [],
});
fm.validateGraphData = () => true;

let promptCalled = false;
fm.showExternalResourcePrompt = async () => { promptCalled = true; return true; };

(async () => {
  await fm.loadGraphFile({ name: 'external.qut', size: 0, lastModified: Date.now() });
  assert.ok(promptCalled, 'showExternalResourcePrompt should be called');
  assert.strictEqual(confirmCalled, false, 'window.confirm should not be called');
  console.log('file-manager-no-confirm-warning.test.js passed');
})();
