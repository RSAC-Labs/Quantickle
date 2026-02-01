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

const createNode = (id, label, type, size, color, position) => ({
  id: () => id,
  data: () => ({ id, label, type, size, color }),
  locked: () => false,
  position: axis => (axis === 'x' ? position.x : position.y)
});

const createEdge = (id, source, target, label, weight, type) => ({
  id: () => id,
  data: () => ({ id, source, target, label, weight, type }),
  style: () => ''
});

const nodeA = createNode('node-a', 'Node A', 'type-a', 42, '#111111', { x: 10, y: 20 });
const nodeB = createNode('node-b', 'Node B', 'type-b', 36, '#222222', { x: 30, y: 40 });
const edgeAB = createEdge('edge-ab', 'node-a', 'node-b', 'connects', 2, 'directed');

const cy = {
  nodes: () => [nodeA, nodeB],
  edges: () => [edgeAB],
  zoom: () => 1,
  pan: () => ({ x: 0, y: 0 })
};

const fm = new window.FileManagerModule({
  cytoscape: cy,
  notifications: { show: () => {} },
  papaParseLib: null,
});

const csvOutput = fm.exportToCSV();

if (!csvOutput.startsWith('node_id,node_label,node_type,node_size,node_color,node_x,node_y')) {
  throw new Error('CSV export missing node header section');
}

if (!csvOutput.includes('\nsource,target,label,weight,type')) {
  throw new Error('CSV export missing edge header section');
}

const parseCsv = csvText => {
  const lines = csvText.trim().split(/\r?\n/);
  const headerLine = lines.shift();
  const headers = headerLine.split(',');
  const rows = [];

  lines.forEach(line => {
    if (!line) {
      return;
    }
    const values = line.split(',');
    const row = {};

    headers.forEach((header, index) => {
      const value = values[index];
      if (value === undefined) {
        row[header] = '';
        return;
      }

      if (value === '') {
        row[header] = '';
        return;
      }

      const num = Number(value);
      if (!Number.isNaN(num) && value.trim() !== '') {
        row[header] = num;
      } else {
        row[header] = value;
      }
    });

    rows.push(row);
  });

  return { rows, headers };
};

const { rows, headers } = parseCsv(csvOutput);
const imported = fm.convertCSVToGraph(rows, { fields: headers });

assert.strictEqual(imported.nodes.length, 2, 'Expected two nodes after round-trip');
assert.strictEqual(imported.edges.length, 1, 'Expected one edge after round-trip');

const nodeMap = new Map(imported.nodes.map(node => [node.id, node]));

const roundTripNodeA = nodeMap.get('node-a');
const roundTripNodeB = nodeMap.get('node-b');

assert.ok(roundTripNodeA, 'Missing node-a after import');
assert.ok(roundTripNodeB, 'Missing node-b after import');

assert.strictEqual(roundTripNodeA.label, 'Node A', 'Node A label mismatch');
assert.strictEqual(roundTripNodeA.type, 'type-a', 'Node A type mismatch');
assert.strictEqual(roundTripNodeA.size, 42, 'Node A size mismatch');
assert.strictEqual(roundTripNodeA.color, '#111111', 'Node A color mismatch');
assert.strictEqual(roundTripNodeA.x, 10, 'Node A x position mismatch');
assert.strictEqual(roundTripNodeA.y, 20, 'Node A y position mismatch');

assert.strictEqual(roundTripNodeB.label, 'Node B', 'Node B label mismatch');
assert.strictEqual(roundTripNodeB.type, 'type-b', 'Node B type mismatch');
assert.strictEqual(roundTripNodeB.size, 36, 'Node B size mismatch');
assert.strictEqual(roundTripNodeB.color, '#222222', 'Node B color mismatch');
assert.strictEqual(roundTripNodeB.x, 30, 'Node B x position mismatch');
assert.strictEqual(roundTripNodeB.y, 40, 'Node B y position mismatch');

const roundTripEdge = imported.edges[0];
assert.strictEqual(roundTripEdge.source, 'node-a', 'Edge source mismatch');
assert.strictEqual(roundTripEdge.target, 'node-b', 'Edge target mismatch');
assert.strictEqual(roundTripEdge.label, 'connects', 'Edge label mismatch');
assert.strictEqual(roundTripEdge.weight, 2, 'Edge weight mismatch');
assert.strictEqual(roundTripEdge.type, 'directed', 'Edge type mismatch');

console.log('file-manager-csv-node-edge-roundtrip.test.js passed');
