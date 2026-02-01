const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Setup JSDOM environment
const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;

// Load FileManagerModule script
const scriptPath = path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
window.eval(scriptContent);

// Instantiate module with minimal dependencies
const fm = new window.FileManagerModule({
  cytoscape: null,
  notifications: { show: () => {} },
  papaParseLib: {}
});
window.FileManager = fm;

// Stub out file loading to avoid FileReader usage
fm.loadGraphFile = () => {};

// Call openFileDialog and verify input is added to the DOM
fm.openFileDialog();
let input = window.document.querySelector('input[type="file"]');
assert.ok(input, 'file input should exist after opening dialog');

// Simulate change event to trigger cleanup
input.dispatchEvent(new window.Event('change'));
input = window.document.querySelector('input[type="file"]');
assert.strictEqual(input, null, 'file input should be removed after handling');

console.log('file-manager-open-dialog.test.js passed');
