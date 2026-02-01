const { test } = require('node:test');
const assert = require('assert');
const { saveGraph } = require('../utils/neo4j');

test('saveGraph schedules removal of stale nodes and relationships', async () => {
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
    await saveGraph({
      graphName: 'CleanupGraph',
      nodes: [
        { id: 'n1' },
        { id: 'n2' }
      ],
      edges: [
        { source: 'n1', target: 'n2' }
      ]
    });
  } finally {
    global.fetch = originalFetch;
  }

  assert.ok(captured, 'fetch should be called during save');

  const wipeEdgesStmt = captured.statements[0];
  assert.ok(wipeEdgesStmt.statement.startsWith('MATCH (g:QuantickleGraph {name: $graphName})<-[:IN_GRAPH]-(n:QuantickleNode)'), 'wipe edges statement should be first');
  assert.strictEqual(
    wipeEdgesStmt.statement,
    'MATCH (g:QuantickleGraph {name: $graphName})<-[:IN_GRAPH]-(n:QuantickleNode) MATCH (n)-[r:RELATIONSHIP]-(:QuantickleNode) WITH DISTINCT r DELETE r'
  );
  assert.deepStrictEqual(wipeEdgesStmt.parameters, { graphName: 'CleanupGraph' });

  const wipeMembershipStmt = captured.statements[1];
  assert.strictEqual(
    wipeMembershipStmt.statement,
    'MATCH (g:QuantickleGraph {name: $graphName})<-[rel:IN_GRAPH]-(n:QuantickleNode) DELETE rel'
  );
  assert.deepStrictEqual(wipeMembershipStmt.parameters, { graphName: 'CleanupGraph' });

  const deleteOrphansStmt = captured.statements[2];
  assert.strictEqual(
    deleteOrphansStmt.statement,
    'MATCH (n:QuantickleNode) WHERE NOT (n)-[:IN_GRAPH]->(:QuantickleGraph) OPTIONAL MATCH (n)-[r]-() DELETE r, n'
  );

  const pruneEdgesStmt = captured.statements.findLast(({ statement }) =>
    statement.startsWith('MATCH (g:QuantickleGraph {name: $graphName})<-[:IN_GRAPH]-(a:QuantickleNode)-[r:RELATIONSHIP]->(b:QuantickleNode)-[:IN_GRAPH]->(g)')
  );
  assert.ok(pruneEdgesStmt, 'edge pruning statement should be present');
  assert.deepStrictEqual(pruneEdgesStmt.parameters, {
    graphName: 'CleanupGraph',
    edgeIds: ['CleanupGraph:n1-CleanupGraph:n2']
  });

  const pruneNodesStmt = captured.statements.findLast(({ statement }) =>
    statement.startsWith('MATCH (g:QuantickleGraph {name: $graphName})<-[rel:IN_GRAPH]-(n:QuantickleNode)')
  );
  assert.ok(pruneNodesStmt, 'node pruning statement should be present');
  assert.deepStrictEqual(pruneNodesStmt.parameters, {
    graphName: 'CleanupGraph',
    nodeIds: ['CleanupGraph:n1', 'CleanupGraph:n2']
  });
});
