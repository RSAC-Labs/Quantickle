const { test } = require('node:test');
const assert = require('assert');
const { saveGraph } = require('../utils/neo4j');

test('saveGraph filters non-primitive properties and skips invalid elements', async () => {
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

  const graph = {
    nodes: [
      { id: 'a', num: 1, obj: { foo: 'bar' }, arr: [1, 2], arrObj: [{ a: 1 }] },
      { id: 'b' },
      { edgeThickness: 1, borderColor: '#666666' }
    ],
    edges: [
      { source: 'a', target: 'b', weight: 2, meta: { foo: 'bar' } }
    ]
  };

  await saveGraph(graph);
  global.fetch = originalFetch;

  assert.ok(captured, 'fetch should be called');
  const nodeStmts = captured.statements.filter(s => s.statement.startsWith('MERGE (n:QuantickleNode'));
  assert.strictEqual(nodeStmts.length, 2);
  const aParams = nodeStmts.find(s => s.parameters.id === 'a').parameters;
  assert.deepStrictEqual(aParams.props, {
    num: 1,
    obj: '{"foo":"bar"}',
    arr: [1, 2],
    arrObj: '[{"a":1}]'
  });
  const bParams = nodeStmts.find(s => s.parameters.id === 'b').parameters;
  assert.deepStrictEqual(bParams.props, {});
  const edgeStmt = captured.statements.find(s => s.statement.includes('RELATIONSHIP'));
  assert.deepStrictEqual(edgeStmt.parameters.props, { weight: 2, meta: '{"foo":"bar"}' });
});
