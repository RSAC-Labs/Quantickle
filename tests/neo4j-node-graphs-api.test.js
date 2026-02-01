const { test } = require('node:test');
const assert = require('assert');

const mock = {
  calledLabels: null,
  calledGraphName: null,
  async saveGraph() {},
  async findGraphsByNodeLabels(labels, creds) {
    mock.calledLabels = { labels, creds };
    return [
      { label: 'A', graphs: ['G1', 'Current'] },
      { label: 'B', graphs: ['G2'] }
    ];
  },
  async getGraph(name, creds) {
    mock.calledGraphName = { name, creds };
    return { metadata: { name }, nodes: [{ id: '1' }], edges: [] };
  }
};
require.cache[require.resolve('../utils/neo4j')] = { exports: mock };
const app = require('../server.js');

function startServer(instance) {
  return new Promise(resolve => {
    const server = instance.listen(0, () => resolve(server));
  });
}

test('returns graphs for node labels excluding current graph', async () => {
  const server = await startServer(app);
  const resp = await fetch(`http://localhost:${server.address().port}/api/neo4j/node-graphs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Neo4j-Url': 'http://db',
      'X-Neo4j-Username': 'user',
      'X-Neo4j-Password': 'pass'
    },
    body: JSON.stringify({ labels: ['A', 'B'], currentGraph: 'Current' })
  });
  assert.strictEqual(resp.status, 200);
  const json = await resp.json();
  assert.deepStrictEqual(json, [
    { label: 'A', graphs: ['G1'] },
    { label: 'B', graphs: ['G2'] }
  ]);
  assert.deepStrictEqual(mock.calledLabels, {
    labels: ['A', 'B'],
    creds: { url: 'http://db', username: 'user', password: 'pass' }
  });
  server.close();
});

test('fetches graph by name from neo4j', async () => {
  const server = await startServer(app);
  const resp = await fetch(`http://localhost:${server.address().port}/api/neo4j/graph/TestGraph`, {
    headers: {
      'X-Neo4j-Url': 'http://db',
      'X-Neo4j-Username': 'user',
      'X-Neo4j-Password': 'pass'
    }
  });
  assert.strictEqual(resp.status, 200);
  const json = await resp.json();
  assert.deepStrictEqual(json, { metadata: { name: 'TestGraph' }, nodes: [{ id: '1' }], edges: [] });
  assert.deepStrictEqual(mock.calledGraphName, {
    name: 'TestGraph',
    creds: { url: 'http://db', username: 'user', password: 'pass' }
  });
  server.close();
});
