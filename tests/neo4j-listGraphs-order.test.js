const { test } = require('node:test');
const assert = require('assert');
const { listGraphs } = require('../utils/neo4j');

test('listGraphs returns graph metadata sorted by latest save time', async () => {

  const originalFetch = global.fetch;
  let capturedBody = null;

  global.fetch = async (_url, options = {}) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      clone() {
        return {
          text: async () => JSON.stringify({
            results: [
              {
                data: [
                  { row: ['NewestGraph', '2024-06-01T12:00:00.000Z', 5, null, []] },
                  { row: ['OlderGraph', '2024-05-01T12:00:00.000Z', 3, null, []] }
                ]
              }
            ],
            errors: []
          })
        };
      }
    };
  };

  try {
    const graphs = await listGraphs({});

    assert.ok(capturedBody, 'Should send a request to Neo4j');
    const statement = capturedBody.statements?.[0]?.statement || '';
    assert.ok(
      statement.includes('OPTIONAL MATCH (g)<-[:IN_GRAPH]-(root:QuantickleNode)'),
      'Query should include optional root node lookup'
    );
    assert.ok(
      statement.includes('g.metadata AS metadata'),
      'Query should select graph metadata for fallback resolution'
    );
    assert.ok(
      statement.includes('ORDER BY g.savedAt DESC, g.saveSequence DESC, g.name ASC'),
      'Query should order results primarily by savedAt then sequence and name'
    );
    assert.deepStrictEqual(graphs, [
      { name: 'NewestGraph', savedAt: '2024-06-01T12:00:00.000Z', sequence: 5 },
      { name: 'OlderGraph', savedAt: '2024-05-01T12:00:00.000Z', sequence: 3 }
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});
