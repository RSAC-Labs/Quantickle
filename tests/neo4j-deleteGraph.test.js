const { test } = require('node:test');
const assert = require('assert');
const { deleteGraph } = require('../utils/neo4j');

test('deleteGraph removes nodes by membership and purges legacy ids', async () => {
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

  try {
    await deleteGraph('LegacyGraph');
  } finally {
    global.fetch = originalFetch;
  }

  assert.ok(captured, 'fetch should be called during deletion');

  const [wipeOwnedEdges, deleteMembers, deleteGraphNode, purgeLegacyNodes] = captured.statements;

  assert.strictEqual(
    wipeOwnedEdges.statement,
    'MATCH (g:QuantickleGraph {name: $graphName}) OPTIONAL MATCH (n:QuantickleNode)-[:IN_GRAPH]->(g) ' +
      'WITH g, n WHERE n IS NOT NULL AND NOT EXISTS { (n)-[:IN_GRAPH]->(other:QuantickleGraph) WHERE other.name <> $graphName } ' +
      'OPTIONAL MATCH (n)-[r:RELATIONSHIP]-() DELETE r'
  );
  assert.deepStrictEqual(wipeOwnedEdges.parameters, { graphName: 'LegacyGraph' });

  assert.strictEqual(
    deleteMembers.statement,
    'MATCH (g:QuantickleGraph {name: $graphName}) OPTIONAL MATCH (n:QuantickleNode)-[:IN_GRAPH]->(g) ' +
      'WITH g, n WHERE n IS NOT NULL AND NOT EXISTS { (n)-[:IN_GRAPH]->(other:QuantickleGraph) WHERE other.name <> $graphName } ' +
      'DETACH DELETE n'
  );
  assert.deepStrictEqual(deleteMembers.parameters, { graphName: 'LegacyGraph' });

  assert.strictEqual(
    deleteGraphNode.statement,
    'MATCH (g:QuantickleGraph {name: $graphName}) DETACH DELETE g'
  );
  assert.deepStrictEqual(deleteGraphNode.parameters, { graphName: 'LegacyGraph' });

  assert.strictEqual(
    purgeLegacyNodes.statement,
    'MATCH (n:QuantickleNode) WHERE n.id STARTS WITH $graphPrefix ' +
      'AND NOT (n)-[:IN_GRAPH]->(:QuantickleGraph) DETACH DELETE n'
  );
  assert.deepStrictEqual(purgeLegacyNodes.parameters, { graphPrefix: 'LegacyGraph:' });
});
