const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;
global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js'), 'utf8');
window.eval(script);

window.NodeTypes = { default: { color: '#333333', size: 18, shape: 'ellipse' } };

const fm = new window.FileManagerModule({
  cytoscape: null,
  notifications: { show: () => {} },
  papaParseLib: null,
});

const rawGraph = {
  metadata: {
    nodeTypeStyles: {
      foo: { color: '#ff0000', size: 30, shape: 'hexagon' },
      baz: { color: '#abcdef', size: 42, shape: 'round-rectangle' },
      alias: {
        'background-color': '#112233',
        'font-size': 18,
        'text-wrap': 'wrap'
      }
    }
  },
  nodes: [
    { id: 'a', type: 'foo', label: 'A' },
    { id: 'b', type: 'foo', label: 'B', color: '#123456' },
    { id: 'c', type: 'baz', label: 'C' },
    { id: 'd', type: 'alias', label: 'D' },
    { id: 'e', type: 'alias', label: 'E', 'background-color': '#445566', 'text-wrap': 'ellipsis' }
  ],
  edges: []
};

const processed = fm.prepareGraphData(rawGraph);

const nodeA = processed.nodes.find(n => n.id === 'a');
const nodeB = processed.nodes.find(n => n.id === 'b');
const nodeC = processed.nodes.find(n => n.id === 'c');
const nodeD = processed.nodes.find(n => n.id === 'd');
const nodeE = processed.nodes.find(n => n.id === 'e');

assert.strictEqual(nodeA.color, '#ff0000', 'Node A should receive default color');
assert.strictEqual(nodeA.size, 30, 'Node A should receive default size');
assert.strictEqual(nodeA.shape, 'hexagon', 'Node A should receive default shape');
assert.strictEqual(nodeB.color, '#123456', 'Node B override should be preserved');
assert.strictEqual(nodeB.size, 30, 'Node B should fill missing size from defaults');
assert.strictEqual(nodeC.color, '#abcdef', 'Node C should receive derived color');
assert.strictEqual(nodeC.size, 42, 'Node C should receive derived size');
assert.strictEqual(nodeC.shape, 'round-rectangle', 'Node C should receive derived shape');
assert.strictEqual(nodeD.backgroundColor, '#112233', 'Node D should receive alias default background color');
assert.strictEqual(nodeD.fontSize, 18, 'Node D should receive alias default font size');
assert.strictEqual(nodeD.textWrap, 'wrap', 'Node D should receive alias default text wrap');
assert.strictEqual(nodeE['background-color'], '#445566', 'Node E alias override should be preserved');
assert.ok(!('backgroundColor' in nodeE), 'Node E should not duplicate canonical key when alias override exists');
assert.strictEqual(nodeE['text-wrap'], 'ellipsis', 'Node E alias text wrap override should be preserved');

assert.deepStrictEqual(processed.metadata.nodeTypeStyles.foo, { color: '#ff0000', shape: 'hexagon', size: 30 }, 'Metadata foo defaults should be normalized');
assert.deepStrictEqual(window.NodeTypes.foo, { color: '#ff0000', shape: 'hexagon', size: 30 }, 'Global NodeTypes should receive foo defaults');
assert.deepStrictEqual(window.NodeTypes.baz, { color: '#abcdef', shape: 'round-rectangle', size: 42 }, 'Global NodeTypes should include baz defaults');
assert.deepStrictEqual(processed.metadata.nodeTypeStyles.alias, { backgroundColor: '#112233', fontSize: 18, textWrap: 'wrap' }, 'Metadata alias defaults should normalize to canonical keys');
assert.deepStrictEqual(window.NodeTypes.alias, { backgroundColor: '#112233', fontSize: 18, textWrap: 'wrap' }, 'Global NodeTypes should normalize alias defaults');

console.log('file-manager-import-node-type-styles.test.js passed');
