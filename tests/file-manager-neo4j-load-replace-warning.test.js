const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;
global.window = window;
global.document = window.document;

let fetchCalls = [];
window.fetch = async (url, options = {}) => {
  fetchCalls.push({ url, options });
  if (url === '/api/neo4j/graphs') {
    return { ok: true, json: async () => [{ name: 'g1', savedAt: '2024-06-01T12:00:00.000Z' }] };
  }
  if (url === '/api/neo4j/graph/g1') {
    return { ok: true, json: async () => ({ nodes: [], edges: [] }) };
  }
  return { ok: false, status: 404 };
};
global.fetch = window.fetch;

let confirmCalled = false;
window.confirm = () => {
  confirmCalled = true;
  return false; // user cancels
};

const scriptPath = path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
window.eval(scriptContent);

window.IntegrationsManager = { getNeo4jCredentials: () => ({}) };

const cyStub = { elements: () => ({ length: 1 }) };

const fm = new window.FileManagerModule({
  cytoscape: cyStub,
  notifications: { show: () => {} },
  papaParseLib: {}
});

fm.showNeo4jGraphSelection = async () => 'g1';
fm.applyGraphData = () => {};

(async () => {
  await fm.loadGraphFromNeo4j();
  assert.ok(confirmCalled, 'Confirmation prompt should appear when replacing graph');
  assert.strictEqual(fetchCalls.length, 0, 'fetch should not be called when cancelled');
  console.log('file-manager-neo4j-load-replace-warning.test.js passed');
})();
