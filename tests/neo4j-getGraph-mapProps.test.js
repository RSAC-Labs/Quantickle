const { test } = require('node:test');
const assert = require('assert');
const { getGraph } = require('../utils/neo4j');

test('getGraph parses JSON-encoded properties', async () => {
  const originalFetch = global.fetch;
  const responseData = {
    results: [
      {
        data: [
          {
            row: [
              {
                metadata: { name: 'TestGraph', config: '{"edgeThickness":1}' },
                nodes: [
                  { id: '1', settings: '{"borderColor":"#fff"}' }
                ],
                edges: []
              }
            ]
          }
        ]
      }
    ],
    errors: []
  };

  global.fetch = async () => ({
    ok: true,
    status: 200,
    clone() {
      return { text: async () => JSON.stringify(responseData) };
    }
  });

  const graph = await getGraph('TestGraph');
  global.fetch = originalFetch;

  assert.deepStrictEqual(graph.metadata.config, { edgeThickness: 1 });
  assert.deepStrictEqual(graph.nodes[0].settings, { borderColor: '#fff' });
});

