const { test } = require('node:test');
const assert = require('assert');
const { saveGraph } = require('../utils/neo4j');

test('saveGraph links nodes to graph name', async () => {
  let captured = null;
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    captured = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      clone() {
        return { text: async () => JSON.stringify({ results: [], errors: [] }) };
      }
    };
  };

  const graph = { graphName: 'GraphFile', nodes: [{ id: 'n1' }], edges: [{ id: 'e1', source: 'n1', target: 'n1' }] };
  await saveGraph(graph);

  global.fetch = originalFetch;

  assert.ok(captured, 'fetch should be called');
  const nodeStmt = captured.statements.find(s => s.statement.includes('QuantickleNode'));
  assert.ok(nodeStmt.statement.includes('IN_GRAPH'));
  assert.strictEqual(nodeStmt.parameters.graphName, 'GraphFile');
  assert.strictEqual(nodeStmt.parameters.props.graphName, 'GraphFile');
  const edgeStmt = captured.statements.find(s => s.statement.includes('RELATIONSHIP'));
  assert.strictEqual(edgeStmt.parameters.props.graphName, 'GraphFile');
  const graphStmt = captured.statements.find(s => s.statement.includes('QuantickleGraph'));
  assert.ok(graphStmt, 'Graph node merge statement is present');
});
