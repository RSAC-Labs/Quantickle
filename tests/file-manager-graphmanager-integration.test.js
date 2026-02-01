const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Set up DOM environment
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;
global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

// Load required scripts
const graphManagerSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'graph-manager.js'), 'utf8');
window.eval(graphManagerSrc);
const fileManagerSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js'), 'utf8');
window.eval(fileManagerSrc);

// Stub GraphRenderer
const cyStub = {
  nodes: new Map(),
  edges: new Map(),
  elements() {
    return { remove: () => {} };
  },
  add(opts) {
    if (opts.group === 'nodes') {
      this.nodes.set(opts.data.id, { ...opts.data });
    } else if (opts.group === 'edges') {
      this.edges.set(opts.data.id, { ...opts.data });
    }
    return opts.data;
  },
  fit() {}
};
window.GraphRenderer = { cy: cyStub, renderGraph: () => {} };

// Minimal DataManager
let graphStore = { nodes: [], edges: [] };
window.DataManager = {
  setGraphData: data => { graphStore = data; },
  getGraphData: () => graphStore
};

// Initialize FileManager
const fm = new window.FileManagerModule({
  cytoscape: cyStub,
  notifications: { show: () => {} },
  papaParseLib: {}
});

// Load initial graph via FileManager
const initialGraph = { nodes: [{ id: 'n1', label: 'n1' }], edges: [] };
fm.applyGraphData(initialGraph);

// Ensure GraphManager picked up data
assert.strictEqual(window.GraphManager.currentGraph.nodes.length, 1);

// Add node and edge through GraphManager
const nodeAdded = window.GraphManager.addNode({ id: 'n2' });
assert.strictEqual(nodeAdded, true);
assert.strictEqual(window.DataManager.getGraphData().nodes.length, 2);

const edgeAdded = window.GraphManager.addEdge({ source: 'n1', target: 'n2' });
assert.strictEqual(edgeAdded, true);
assert.strictEqual(window.DataManager.getGraphData().edges.length, 1);

console.log('file-manager-graphmanager-integration.test.js passed');
