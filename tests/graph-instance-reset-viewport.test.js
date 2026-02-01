const assert = require('assert');
const fs = require('fs');
const path = require('path');

let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (_) {
  JSDOM = null;
}

if (!JSDOM) {
  console.log('graph-instance-reset-viewport.test.js skipped (jsdom unavailable)');
  process.exit(0);
}

const dom = new JSDOM('<!doctype html><html><body><div id="cy"></div></body></html>', {
  pretendToBeVisual: true
});

global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

window.UI = { showNotification: () => {} };
window.DataManager = {
  setGraphData: () => {},
  setGraphName: () => {},
  updateFileNameDisplay: () => {},
  currentGraphName: '',
  currentGraphFileName: ''
};
window.GraphManager = {
  currentGraph: null,
  updateGraphUI: () => {}
};
window.TableManager = {
  updateTables: () => {},
  updateTotalDataTable: () => {}
};
window.LayoutManager = { applyCurrentLayout: () => {} };
window.NodeTypes = { default: { color: '#fff', size: 30, shape: 'round-rectangle', icon: '' } };
window.QuantickleConfig = { validation: { enabled: false } };
window.LODSystem = { init: () => {} };
window.GraphControls = { init: () => {} };
window.SelectionManager = { init: () => {} };
window.GraphEditor = { init: () => {} };
window.EdgeCreator = { init: () => {} };
window.PerformanceManager = { init: () => {} };
window.DebugTools = { init: () => {} };
window.ProgressManager = { init: () => {} };
window.BackgroundGridModule = { init: () => {} };
window.TextCallout = { syncViewport: () => {} };
window.GraphPortal = { init: () => {} };
window.Validation = { validators: { validateGraph: () => ({ valid: true }), validateNode: () => ({ valid: true }), validateEdge: () => ({ valid: true }) } };

const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'graph.js'), 'utf8');
window.eval(script);
const GraphRenderer = window.GraphRenderer;

const zoomCalls = [];
const cyStub = {
  zoom(value) {
    if (typeof value === 'number') {
      zoomCalls.push(value);
    }
    return 0.5;
  },
  pan() {},
  fit() {},
  nodes: () => ({ length: 0, filter: () => ({ length: 0 }) }),
  elements: () => ({ remove: () => {} }),
  batch: fn => { if (typeof fn === 'function') { fn(); } },
  add: () => ({ data: () => ({}) })
};

GraphRenderer.cy = cyStub;
GraphRenderer.renderGraph = () => {};
GraphRenderer.applyNodePositionsFromGraphData = () => {};
GraphRenderer.fitViewportForGraphInstance = () => {};
GraphRenderer.insertGraphReturnNodeForStackTop = () => {};
GraphRenderer.refreshGraphReturnNodePlacement = () => {};

(async () => {
  const graphData = { nodes: [], edges: [] };
  await GraphRenderer.applyGraphInstance(graphData, { title: 'Linked graph' });
  assert.ok(zoomCalls.includes(1), 'applyGraphInstance should reset zoom before loading a new graph');

  const snapshot = { graphData: { nodes: [], edges: [] } };
  await GraphRenderer.applyGraphSnapshot(snapshot);
  assert.strictEqual(zoomCalls.filter(v => v === 1).length >= 2, true, 'applyGraphSnapshot should also reset zoom');

  console.log('graph-instance-reset-viewport.test.js passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
