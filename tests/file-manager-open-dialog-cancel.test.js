const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;

// Simulate user canceling the file picker
window.showOpenFilePicker = () => Promise.reject(new window.DOMException('User cancelled', 'AbortError'));

const scriptPath = path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
window.eval(scriptContent);

const fm = new window.FileManagerModule({
  cytoscape: null,
  notifications: { show: () => {} },
  papaParseLib: {}
});
window.FileManager = fm;

(async () => {
  await fm.openGraphDialog();
  const input = window.document.querySelector('input[type="file"]');
  assert.strictEqual(input, null, 'file input should not exist after cancelling file picker');
  console.log('file-manager-open-dialog-cancel.test.js passed');
})();
