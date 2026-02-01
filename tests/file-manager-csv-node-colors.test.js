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
  notifications: { show: () => {} },
  papaParseLib: null,
});

const csvRows = [
  { node_id: 'manual_node_1', node_type: 'user', node_label: 'Alice', node_color: 'blue' },
  { node_id: 'manual_node_2', node_type: 'user', node_label: 'Tom', node_color: 'red' },
  { node_id: 'source_id', node_type: 'target_id', node_label: 'edge_type', node_color: 'edge_label' },
  { node_id: 'manual_node_1', node_type: 'manual_node_2', node_label: 'solid', node_color: 'talks to' }
];

const meta = { fields: ['node_id', 'node_type', 'node_label', 'node_color'] };
const imported = fm.convertCSVToGraph(csvRows, meta);

assert.strictEqual(imported.nodes.length, 2, 'Expected two nodes');
assert.strictEqual(imported.edges.length, 1, 'Expected one edge');

const nodeMap = new Map(imported.nodes.map(node => [node.id, node]));

assert.strictEqual(nodeMap.get('manual_node_1').color, 'blue', 'manual_node_1 color should stay blue');
assert.strictEqual(nodeMap.get('manual_node_2').color, 'red', 'manual_node_2 color should stay red');

const edge = imported.edges[0];
assert.strictEqual(edge.source, 'manual_node_1');
assert.strictEqual(edge.target, 'manual_node_2');
assert.strictEqual(edge.type, 'solid');
assert.strictEqual(edge.label, 'talks to');

console.log('file-manager-csv-node-colors.test.js passed');
