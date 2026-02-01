const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Setup DOM environment
const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;
global.window = window;
global.document = window.document;

let fetchCalls = [];
window.fetch = async (url, options = {}) => {
  fetchCalls.push({ url, options });
  if (url === '/api/neo4j/graphs') {
    return { ok: true, json: async () => [{ name: 'OtherGraph', savedAt: '2024-05-01T12:00:00.000Z' }] };
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
  return true;
};

const scriptPath = path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
window.eval(scriptContent);

window.DataManager = { currentGraphName: 'TestGraph' };

window.prompt = () => 'TestGraph';

window.IntegrationsManager = {
  getNeo4jCredentials: () => ({ url: 'http://db', username: 'user', password: 'pass' })
};

// Minimal cytoscape stub
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
  papaParseLib: {}
});

(async () => {
  const saved = await fm.saveGraphToNeo4j();
  assert.strictEqual(saved, true, 'Graph should be saved successfully');
  assert.strictEqual(confirmCalled, false, 'No overwrite prompt expected');
  assert.strictEqual(fetchCalls.length, 2, 'Should fetch list then save graph');
  assert.strictEqual(fetchCalls[1].url, '/api/neo4j/graph');
  assert.strictEqual(fetchCalls[1].options.method, 'POST');
  const body = JSON.parse(fetchCalls[1].options.body);
  assert.strictEqual(body.graphName, 'TestGraph');
  assert.strictEqual(body.title, 'TestGraph');
  assert.strictEqual(body.name, 'TestGraph');
  assert.strictEqual(body.metadata?.title, 'TestGraph');
  assert.strictEqual(body.metadata?.name, 'TestGraph');
  assert.ok(body.savedAt, 'Graph payload should include a savedAt timestamp');
  assert.ok(!Number.isNaN(new Date(body.savedAt).getTime()), 'savedAt timestamp should be parseable');
  assert.strictEqual(body.metadata?.savedAt, body.savedAt, 'Metadata savedAt should match the graph payload');
  assert.strictEqual(fetchCalls[1].options.headers['X-Neo4j-Url'], 'http://db');
  assert.strictEqual(fetchCalls[1].options.headers['X-Neo4j-Username'], 'user');
  assert.strictEqual(fetchCalls[1].options.headers['X-Neo4j-Password'], 'pass');
  console.log('file-manager-neo4j-save.test.js passed');
})();
