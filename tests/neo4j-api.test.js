const { test } = require('node:test');
const assert = require('assert');

// Stub the Neo4j module before requiring the server
const mock = {
  calledWith: null,
  async saveGraph(data, creds) {
    mock.calledWith = { data, creds };
  },
  async findGraphsByNodeLabels() {},
  async getGraph() {}
};
require.cache[require.resolve('../utils/neo4j')] = { exports: mock };
const app = require('../server.js');

function startServer(instance) {
  return new Promise(resolve => {
    const server = instance.listen(0, () => resolve(server));
  });
}

test('stores graph via neo4j endpoint', async () => {
  const server = await startServer(app);
  const graph = { graphName: 'TestGraph', nodes: [{ data: { id: 'a' } }], edges: [] };
  const headers = {
    'Content-Type': 'application/json',
    'X-Neo4j-Url': 'http://db',
    'X-Neo4j-Username': 'user',
    'X-Neo4j-Password': 'pass'
  };
  const resp = await fetch(`http://localhost:${server.address().port}/api/neo4j/graph`, {
    method: 'POST',
    headers,
    body: JSON.stringify(graph)
  });
  assert.strictEqual(resp.status, 200);
  const json = await resp.json();
  assert.strictEqual(json.success, true);
  assert.deepStrictEqual(mock.calledWith, { data: graph, creds: { url: 'http://db', username: 'user', password: 'pass' } });
  server.close();
});
