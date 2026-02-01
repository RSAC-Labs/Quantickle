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
    return { ok: true, json: async () => [{ name: 'TestGraph', savedAt: '2024-06-01T12:00:00.000Z' }] };
  }
  if (url === '/api/neo4j/graph') {
    return { ok: true, json: async () => ({ success: true }) };
  }
  return { ok: false };
};
global.fetch = window.fetch;

let confirmCalled = false;
window.confirm = () => {
  confirmCalled = true;
  return false; // user cancels overwrite
};

const scriptPath = path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
window.eval(scriptContent);

window.DataManager = { currentGraphName: 'TestGraph' };
window.prompt = () => 'TestGraph';
window.IntegrationsManager = { getNeo4jCredentials: () => ({}) };

const cyStub = {
  nodes: () => [{
    id: () => 'n1',
    data: () => ({ label: 'n1' }),
    position: () => 0,
    locked: () => false
  }],
  edges: () => [{
    id: () => 'e1',
    data: () => ({ source: 'n1', target: 'n1' })
  }]
};

const fm = new window.FileManagerModule({
  cytoscape: cyStub,
  notifications: { show: () => {} },
  papaParseLib: {},
});

(async () => {
  const saved = await fm.saveGraphToNeo4j();
  assert.strictEqual(saved, false, 'Save should be cancelled when overwrite is rejected');
  assert.ok(confirmCalled, 'Overwrite confirmation should appear');
  assert.strictEqual(fetchCalls.length, 1, 'POST should not be called when cancelled');
  console.log('file-manager-neo4j-save-overwrite-warning.test.js passed');
})();
