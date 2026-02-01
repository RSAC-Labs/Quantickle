const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;
global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;
const script = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js'),
  'utf8'
);
window.eval(script);

const fm = new window.FileManagerModule({
  cytoscape: null,
  notifications: { show: () => {} },
  papaParseLib: null,
});

const rows = [
  {
    NodeID: 'node-a',
    NodeLabel: 'Node A',
    NodeType: 'type-a',
    NodeSize: 21,
    NodeColor: '#111111',
    NodeX: 12,
    NodeY: 34
  },
  {
    NodeID: 'node-b',
    NodeLabel: 'Node B',
    NodeType: 'type-b',
    NodeSize: 33,
    NodeColor: '#222222',
    NodeX: 56,
    NodeY: 78
  },
  {
    NodeID: 'source',
    NodeLabel: 'target',
    NodeType: 'label',
    NodeSize: 'weight',
    NodeColor: 'type'
  },
  {
    NodeID: 'node-a',
    NodeLabel: 'node-b',
    NodeType: 'connects',
    NodeSize: 2,
    NodeColor: 'directed'
  }
];

const meta = {
  fields: ['NodeID', 'NodeLabel', 'NodeType', 'NodeSize', 'NodeColor', 'NodeX', 'NodeY']
};

const { nodes, edges } = fm.convertCSVToGraph(rows, meta);

assert.strictEqual(nodes.length, 2, 'Expected two nodes from normalized headers');
assert.strictEqual(edges.length, 1, 'Expected one edge from normalized headers');

const nodeA = nodes.find(node => node.id === 'node-a');
const nodeB = nodes.find(node => node.id === 'node-b');

assert.ok(nodeA, 'node-a should exist');
assert.ok(nodeB, 'node-b should exist');

assert.strictEqual(nodeA.label, 'Node A', 'node-a label should match normalized column');
assert.strictEqual(nodeA.type, 'type-a', 'node-a type should match normalized column');
assert.strictEqual(nodeB.label, 'Node B', 'node-b label should match normalized column');
assert.strictEqual(nodeB.type, 'type-b', 'node-b type should match normalized column');

assert.strictEqual(nodeA.size, 21, 'node-a size should match normalized column');
assert.strictEqual(nodeA.color, '#111111', 'node-a color should match normalized column');
assert.strictEqual(nodeA.x, 12, 'node-a x should match normalized column');
assert.strictEqual(nodeA.y, 34, 'node-a y should match normalized column');

assert.strictEqual(nodeB.size, 33, 'node-b size should match normalized column');
assert.strictEqual(nodeB.color, '#222222', 'node-b color should match normalized column');
assert.strictEqual(nodeB.x, 56, 'node-b x should match normalized column');
assert.strictEqual(nodeB.y, 78, 'node-b y should match normalized column');

const edge = edges[0];
assert.strictEqual(edge.source, 'node-a', 'Edge source should match normalized value');
assert.strictEqual(edge.target, 'node-b', 'Edge target should match normalized value');
assert.strictEqual(edge.label, 'connects', 'Edge label should match normalized column');
assert.strictEqual(edge.weight, 2, 'Edge weight should match normalized column');
assert.strictEqual(edge.type, 'directed', 'Edge type should match normalized column');

console.log('file-manager-csv-node-section-normalization.test.js passed');
