const { test } = require('node:test');
const assert = require('assert');
const { saveGraph, getGraph } = require('../utils/neo4j');

test('saveGraph encodes IDs with graph name and getGraph decodes them', async () => {
  let captured = null;
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (!captured) {
      captured = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        clone() { return { text: async () => JSON.stringify({ results: [], errors: [] }) }; }
      };
    }
    // second call for getGraph
    return {
      ok: true,
      status: 200,
      clone() {
        return { text: async () => JSON.stringify({
          results: [{ data: [{ row: [{ metadata: {}, nodes: [{ id: 'G:n1', graphName: 'G' }], edges: [{ id: 'G:e1', source: 'G:n1', target: 'G:n1', graphName: 'G' }] }] }] }],
          errors: []
        }) }; },
    };
  };

  const graph = { graphName: 'G', nodes: [{ id: 'n1' }], edges: [{ id: 'e1', source: 'n1', target: 'n1' }] };
  await saveGraph(graph);
  const nodeStmt = captured.statements.find(s => s.statement.startsWith('MERGE (n:QuantickleNode'));
  assert.strictEqual(nodeStmt.parameters.id, 'G:n1');
  assert.strictEqual(nodeStmt.parameters.props.graphName, 'G');
  const edgeStmt = captured.statements.find(s => s.statement.includes('RELATIONSHIP'));
  assert.strictEqual(edgeStmt.parameters.source, 'G:n1');
  assert.strictEqual(edgeStmt.parameters.id, 'G:e1');
  assert.strictEqual(edgeStmt.parameters.props.graphName, 'G');

  const loaded = await getGraph('G');
  assert.deepStrictEqual(loaded.nodes, [{ id: 'n1', graphName: 'G' }]);
  assert.deepStrictEqual(loaded.edges, [{ id: 'e1', source: 'n1', target: 'n1', graphName: 'G' }]);

  global.fetch = originalFetch;
});
