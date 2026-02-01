const { test } = require('node:test');
const assert = require('assert');
const { listGraphs } = require('../utils/neo4j');

test('listGraphs persists fallback savedAt from metadata', async () => {
  const originalFetch = global.fetch;
  const requests = [];

  global.fetch = async (_url, options = {}) => {
    const body = JSON.parse(options.body || '{}');
    requests.push(body);

    if (requests.length === 1) {
      return {
        ok: true,
        status: 200,
        clone() {
          return {
            text: async () => JSON.stringify({
              results: [
                {
                  data: [
                    {
                      row: [
                        'FallbackGraph',
                        null,
                        null,
                        JSON.stringify({ metadata: { published: '2021-02-15' } }),
                        []
                      ]
                    }
                  ]
                }
              ],
              errors: []
            })
          };
        }
      };
    }

    return {
      ok: true,
      status: 200,
      clone() {
        return {
          text: async () => JSON.stringify({ results: [], errors: [] })
        };
      }
    };
  };

  try {
    const graphs = await listGraphs({});
    assert.strictEqual(requests.length, 2, 'Should issue persistence update when fallback is used');

    const fallbackGraph = graphs.find(item => item.name === 'FallbackGraph');
    assert.ok(fallbackGraph, 'Fallback graph should be returned');
    assert.strictEqual(
      fallbackGraph.savedAt,
      '2021-02-15T00:00:00.000Z',
      'Fallback should populate savedAt using published metadata'
    );

    assert.deepStrictEqual(
      fallbackGraph.metadata,
      { metadata: { published: '2021-02-15' } },
      'Metadata JSON should be parsed into objects'
    );

    const updateStatements = requests[1]?.statements || [];
    assert.strictEqual(updateStatements.length, 1, 'Should send one persistence statement');
    assert.ok(
      updateStatements[0].statement.includes('SET g.savedAt = $fallback'),
      'Persistence statement should update savedAt'
    );
    assert.deepStrictEqual(
      updateStatements[0].parameters,
      { graphName: 'FallbackGraph', fallback: '2021-02-15T00:00:00.000Z' },
      'Persistence parameters should match fallback date'
    );
  } finally {
    global.fetch = originalFetch;
  }
});
