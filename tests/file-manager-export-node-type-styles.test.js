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

window.NodeTypes = {
  default: { color: '#cccccc', size: 20, shape: 'ellipse' },
  foo: { color: '#ff0000', size: 30, shape: 'hexagon' },
  bar: { color: '#00ff00', size: 25, shape: 'ellipse', icon: 'star' },
  alias: {
    'background-color': '#112233',
    'font-size': 18,
    'text-wrap': 'wrap'
  }
};

const createNode = (id, data) => ({
  id: () => id,
  data: () => ({ id, ...data }),
  position: axis => (axis === 'x' ? 10 : 20)
});

const cy = {
  nodes: () => [
    createNode('n1', { type: 'foo', color: '#ff0000', size: 30, shape: 'hexagon', label: 'Foo 1' }),
    createNode('n2', { type: 'foo', color: '#123456', size: 30, shape: 'hexagon', label: 'Foo 2' }),
    createNode('n3', { type: 'bar', color: '#00ff00', size: 25, shape: 'ellipse', icon: 'star', label: 'Bar 1' }),
    createNode('n4', { type: 'baz', color: '#abcdef', size: 42, shape: 'round-rectangle', label: 'Baz 1' }),
    createNode('n5', {
      type: 'alias',
      label: 'Alias Default',
      'background-color': '#112233',
      'font-size': 18,
      'text-wrap': 'wrap'
    }),
    createNode('n6', {
      type: 'alias',
      label: 'Alias Override',
      'background-color': '#445566',
      'font-size': 22,
      'text-wrap': 'ellipsis'
    })
  ],
  edges: () => []
};

const fm = new window.FileManagerModule({
  cytoscape: cy,
  notifications: { show: () => {} },
  papaParseLib: null,
});

const exported = fm.exportCurrentGraph();

assert.strictEqual(exported.nodes.length, 6, 'All nodes should be exported');
const node1 = exported.nodes.find(n => n.id === 'n1');
const node2 = exported.nodes.find(n => n.id === 'n2');
const node3 = exported.nodes.find(n => n.id === 'n3');
const node4 = exported.nodes.find(n => n.id === 'n4');
const node5 = exported.nodes.find(n => n.id === 'n5');
const node6 = exported.nodes.find(n => n.id === 'n6');

assert.ok(!('color' in node1), 'Default color for foo should be omitted');
assert.ok(!('size' in node1), 'Default size for foo should be omitted');
assert.strictEqual(node2.color, '#123456', 'Override color should be preserved');
assert.ok(!('icon' in node3), 'Default icon for bar should be omitted');
assert.ok(!('color' in node4), 'Derived defaults should remove redundant styling for baz');
assert.ok(!('size' in node4), 'Derived defaults should remove redundant size for baz');
assert.ok(!('background-color' in node5), 'Alias default background-color should be omitted');
assert.ok(!('font-size' in node5), 'Alias default font-size should be omitted');
assert.ok(!('text-wrap' in node5), 'Alias default text-wrap should be omitted');
assert.strictEqual(node6['background-color'], '#445566', 'Alias override background-color should be preserved');
assert.strictEqual(node6['font-size'], 22, 'Alias override font-size should be preserved');
assert.strictEqual(node6['text-wrap'], 'ellipsis', 'Alias override text-wrap should be preserved');

const styles = exported.metadata.nodeTypeStyles;
assert.ok(styles, 'Metadata should include nodeTypeStyles');
assert.deepStrictEqual(styles.foo, { color: '#ff0000', shape: 'hexagon', size: 30 }, 'Foo defaults should be captured');
assert.deepStrictEqual(styles.bar, { color: '#00ff00', icon: 'star', shape: 'ellipse', size: 25 }, 'Bar defaults should be captured');
assert.deepStrictEqual(styles.baz, { color: '#abcdef', shape: 'round-rectangle', size: 42 }, 'Baz defaults should derive from node data');
assert.deepStrictEqual(
  styles.alias,
  { backgroundColor: '#112233', fontSize: 18, textWrap: 'wrap' },
  'Alias defaults should normalize to canonical keys'
);

console.log('file-manager-export-node-type-styles.test.js passed');
