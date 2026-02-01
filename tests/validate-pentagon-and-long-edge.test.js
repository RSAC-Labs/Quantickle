const Validation = require('../js/validation.js');

// Node with pentagon shape should be valid
const node = { id: 'n1', type: 'test', label: 'Node 1', shape: 'pentagon' };
const nodeResult = Validation.validators.validateNode(node, true);
if (!nodeResult.valid) {
  throw new Error('Pentagon shape should be accepted');
}

// Edge with very long ID should be valid after removing length limit
const longId = 'edge_' + 'x'.repeat(150);
const edge = { id: longId, source: 'n1', target: 'n2' };
const edgeResult = Validation.validators.validateEdge(edge, true);
if (!edgeResult.valid) {
  throw new Error('Long edge ID should be accepted');
}

console.log('Validation accepts pentagon shape and long edge IDs');
process.exit(0);
