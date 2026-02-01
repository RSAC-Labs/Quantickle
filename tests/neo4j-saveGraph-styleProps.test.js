const { test } = require('node:test');
const assert = require('assert');
const { saveGraph } = require('../utils/neo4j');

test('saveGraph preserves style, position and state properties', async () => {
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
      {
        id: 'n1',
        label: 'Node 1',
        icon: 'server',
        color: '#ffffff',
        borderWidth: 2,
        style: { foo: 'bar' },
        pinned: true,
        selected: false,
        position: { x: 1, y: 2 },
        x: 3,
        y: 4
      },
      { id: 'n2' }
    ],
    edges: [
      {
        source: 'n1',
        target: 'n2',
        icon: 'arrow',
        width: 5,
        lineColor: '#000000',
        relation: 'knows',
        selected: true,
        sx: 5,
        sy: 6,
        tx: 7,
        ty: 8
      }
    ]
  };

  await saveGraph(graph);
  global.fetch = originalFetch;

  assert.ok(captured, 'fetch should be called');
  const nodeStmt = captured.statements.find(s => s.statement.startsWith('MERGE (n:QuantickleNode') && s.parameters.id === 'n1');
  assert.deepStrictEqual(nodeStmt.parameters.props, {
    label: 'Node 1',
    icon: 'server',
    color: '#ffffff',
    borderWidth: 2,
    style: '{"foo":"bar"}',
    pinned: true,
    selected: false,
    position: '{"x":1,"y":2}',
    x: 3,
    y: 4
  });
  const edgeStmt = captured.statements.find(s => s.statement.includes('RELATIONSHIP'));
  assert.deepStrictEqual(edgeStmt.parameters.props, {
    icon: 'arrow',
    width: 5,
    lineColor: '#000000',
    relation: 'knows',
    selected: true,
    sx: 5,
    sy: 6,
    tx: 7,
    ty: 8
  });
});
