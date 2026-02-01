const { test } = require('node:test');
const assert = require('assert');
const { saveGraph } = require('../utils/neo4j');

test('saveGraph persists savedAt timestamp on graphs', async () => {
  let captured = null;
  const originalFetch = global.fetch;

  global.fetch = async (_url, options) => {
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
    graphName: 'TimestampedGraph',
    metadata: { description: 'Example graph' }
  };

  try {
    await saveGraph(graph);
  } finally {
    global.fetch = originalFetch;
  }

  assert.ok(captured, 'fetch should be called when saving');
  const graphStmt = captured.statements.find(stmt =>
    stmt.statement.includes('MERGE (g:QuantickleGraph')
  );
  assert.ok(graphStmt, 'Graph merge statement should be included');

  const { props, savedAt } = graphStmt.parameters;
  assert.ok(savedAt, 'savedAt parameter should be sent');

  assert.match(savedAt, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/, 'savedAt should be an ISO timestamp');
  assert.strictEqual(props.savedAt, savedAt, 'Graph props should include savedAt');

  const metadataJson = props.metadata;
  assert.ok(metadataJson, 'Graph metadata should be serialized');
  const parsedMetadata = JSON.parse(metadataJson);
  assert.strictEqual(parsedMetadata.savedAt, savedAt, 'Saved metadata should contain the savedAt timestamp');
});
