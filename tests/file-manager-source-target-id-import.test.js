const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const createTestWindow = () => {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    Math,
    performance: { now: () => 0 }
  };

  context.window = {};
  context.document = {
    createElement: () => ({ getContext: () => null }),
    body: {},
    documentElement: { style: {} }
  };

  Object.assign(context.window, {
    window: context.window,
    document: context.document,
    console,
    Math,
    performance: context.performance,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: cb => setTimeout(cb, 16),
    cancelAnimationFrame: id => clearTimeout(id),
    navigator: { userAgent: 'node.js' },
    location: { origin: 'http://localhost' },
    addEventListener: () => {},
    removeEventListener: () => {},
    Image: function () {},
    Blob: function () {},
    URL: {
      createObjectURL: () => '',
      revokeObjectURL: () => {}
    }
  });

  context.window.HTMLCanvasElement = function () {};
  context.window.HTMLCanvasElement.prototype = { getContext: () => null };

  context.global = context.window;
  context.globalThis = context.window;

  const vmContext = vm.createContext(context);

  const scriptSource = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js'),
    'utf8'
  );

  const script = new vm.Script(scriptSource);
  script.runInContext(vmContext);

  return context.window;
};

const window = createTestWindow();
global.window = window;
global.document = window.document;

const fm = new window.FileManagerModule({
  cytoscape: null,
  notifications: { show: () => {} },
  papaParseLib: null,
});

const csvData = [
  { source_id: 'A', target_id: 'B' },
  { source_id: 'B', target_id: 'C' }
];

const result = fm.convertCSVToGraph(csvData, { fields: ['source_id', 'target_id'] });

assert.strictEqual(result.nodes.length, 3, 'Should create three nodes');
assert.strictEqual(result.edges.length, 2, 'Should create two edges');
result.nodes.forEach(node => {
  assert.strictEqual(typeof node.x, 'number', 'Node should have a numeric x position');
  assert(!Number.isNaN(node.x), 'Node x position should not be NaN');
  assert.strictEqual(typeof node.y, 'number', 'Node should have a numeric y position');
  assert(!Number.isNaN(node.y), 'Node y position should not be NaN');
});

const canonicalRows = [
  {
    source_id: 'A',
    source_label: 'Alpha',
    source_type: 'person',
    source_color: '#ff0000',
    source_size: '25',
    target_id: 'B',
    target_label: 'Beta',
    target_type: 'company',
    target_color: '#00ff00',
    target_size: '40',
    relationship_type: 'works_at',
    relationship_label: 'Works At',
    relationship_weight: '2'
  }
];

const canonicalFields = [
  'source_id',
  'source_label',
  'source_type',
  'source_color',
  'source_size',
  'target_id',
  'target_label',
  'target_type',
  'target_color',
  'target_size',
  'relationship_type',
  'relationship_label',
  'relationship_weight'
];

const canonicalResult = fm.convertCSVToGraph(canonicalRows, { fields: canonicalFields });

assert.strictEqual(canonicalResult.nodes.length, 2, 'Canonical rows should create two nodes');
assert.strictEqual(canonicalResult.edges.length, 1, 'Canonical rows should create one edge');

const sourceNode = canonicalResult.nodes.find(node => node.id === 'A');
const targetNode = canonicalResult.nodes.find(node => node.id === 'B');

assert(sourceNode, 'Source node should exist');
assert(targetNode, 'Target node should exist');

assert.strictEqual(sourceNode.label, 'Alpha', 'Source node label should use source_label');
assert.strictEqual(sourceNode.type, 'person', 'Source node type should use source_type');
assert.strictEqual(sourceNode.color, '#ff0000', 'Source node color should use source_color');
assert.strictEqual(sourceNode.size, 25, 'Source node size should use source_size');

assert.strictEqual(targetNode.label, 'Beta', 'Target node label should use target_label');
assert.strictEqual(targetNode.type, 'company', 'Target node type should use target_type');
assert.strictEqual(targetNode.color, '#00ff00', 'Target node color should use target_color');
assert.strictEqual(targetNode.size, 40, 'Target node size should use target_size');

const edge = canonicalResult.edges[0];
assert.strictEqual(edge.label, 'Works At', 'Edge label should use relationship_label');
assert.strictEqual(edge.type, 'works_at', 'Edge type should use relationship_type');
assert.strictEqual(edge.weight, 2, 'Edge weight should use relationship_weight');

const invalidColorRows = [
  {
    source_id: 'Alpha',
    source_label: 'Alpha',
    source_color: 'red',
    target_id: 'Beta',
    target_label: 'Beta',
    target_color: 'not-a-hex'
  }
];

const invalidColorFields = [
  'source_id',
  'source_label',
  'source_color',
  'target_id',
  'target_label',
  'target_color'
];

const invalidColorResult = fm.convertCSVToGraph(invalidColorRows, { fields: invalidColorFields });

assert.strictEqual(
  invalidColorResult.nodes.length,
  2,
  'Rows with invalid colors should still produce both nodes'
);

const invalidSourceNode = invalidColorResult.nodes.find(node => node.id === 'Alpha');
const invalidTargetNode = invalidColorResult.nodes.find(node => node.id === 'Beta');

assert(invalidSourceNode, 'Source node should exist even when color is invalid');
assert(invalidTargetNode, 'Target node should exist even when color is invalid');

assert.strictEqual(
  invalidSourceNode.color,
  '#ffffff',
  'Invalid source color values should fall back to the default color'
);

assert.strictEqual(
  invalidTargetNode.color,
  '#ffffff',
  'Invalid target color values should fall back to the default color'
);

let renderGraphCalls = 0;
const createStubNode = (id, type) => ({
  id: () => id,
  data: key => {
    if (key === 'type') return type;
    if (key === 'pinned') return false;
    if (key === 'locked') return false;
    if (key === 'lockedX') return undefined;
    return { id, type };
  },
  position: () => ({ x: 0, y: 0 }),
  lock: () => {},
  unlock: () => {},
  locked: () => false,
  grabbable: () => true,
  selectable: () => true,
  removeData: () => {},
  scratch: () => undefined,
  removeScratch: () => {}
});

const createStubEdge = id => ({
  id: () => id,
  data: () => ({ id })
});

const stubNodes = [createStubNode('node1', 'alpha'), createStubNode('node2', 'beta')];
const stubEdges = [createStubEdge('edge1')];

const stubCy = {
  elements: () => ({ remove: () => {} }),
  nodes: () => stubNodes,
  edges: () => stubEdges,
  zoom: () => {},
  pan: () => {},
  fit: () => {}
};

window.DataManager = {
  _graphData: null,
  setGraphData(graph) {
    this._graphData = graph;
  },
  getGraphData() {
    return this._graphData;
  }
};

window.GraphManager = {
  currentGraph: null,
  updateGraphUI: () => {}
};

window.GraphRenderer = {
  cy: stubCy,
  renderGraph: () => {
    renderGraphCalls += 1;
  }
};

const fmWithCy = new window.FileManagerModule({
  cytoscape: stubCy,
  notifications: { show: () => {} },
  papaParseLib: null,
});

const importedGraphData = {
  nodes: [
    { id: 'node1', type: 'alpha' },
    { id: 'node2', type: 'beta' }
  ],
  edges: [
    { id: 'edge1', source: 'node1', target: 'node2' }
  ],
  layoutSettings: {
    zoom: 1,
    pan: { x: 0, y: 0 },
    currentLayout: 'grid'
  }
};

fmWithCy.applyGraphData(importedGraphData);

assert.strictEqual(renderGraphCalls, 1, 'GraphRenderer should be invoked when available');
assert.strictEqual(fmWithCy.nodeIndex.get('node1'), stubNodes[0], 'Node index should reference GraphRenderer nodes');
assert.strictEqual(fmWithCy.edgeIndex.get('edge1'), stubEdges[0], 'Edge index should reference GraphRenderer edges');

const alphaEntries = fmWithCy.typeIndex.get('alpha');
assert(alphaEntries && alphaEntries.includes(stubNodes[0]), 'Type index should include nodes grouped by type');

console.log('file-manager-source-target-id-import.test.js passed');
