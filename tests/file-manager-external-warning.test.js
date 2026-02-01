const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;

window.location = { origin: 'http://localhost' };

const utilsPath = path.join(__dirname, '..', 'js', 'utils.js');
const utilsContent = fs.readFileSync(utilsPath, 'utf-8');
window.eval(utilsContent);

const scriptPath = path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
window.eval(scriptContent);

const fm = new window.FileManagerModule({
  cytoscape: null,
  notifications: { show: () => {} },
  papaParseLib: {}
});

const safeGraph = {
  id: '44444444-4444-4444-8444-444444444444',
  title: 'Safe Graph',
  nodes: [{ data: { id: 'n1', url: 'https://example.com' } }],
  edges: [],
  metadata: { source: 'Manually added', title: 'Safe Graph' }
};
const externalGraph = {
  id: '55555555-5555-4555-8555-555555555555',
  title: 'External Graph',
  nodes: [{ data: { id: 'n1', icon: 'https://example.com/icon.png' } }],
  edges: [],
  metadata: { source: 'Manually added', title: 'External Graph' }
};

assert.strictEqual(fm.containsExternalResources(safeGraph), false);
assert.strictEqual(fm.containsExternalResources(externalGraph), true);

console.log('file-manager-external-warning.test.js passed');
