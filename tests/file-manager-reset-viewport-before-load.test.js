const assert = require('assert');
let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (_) {
  JSDOM = null;
}

const fs = require('fs');
const path = require('path');

let window;
if (JSDOM) {
  ({ window } = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'dangerously' }));
} else {
  window = {
    document: {
      body: {},
      createElement: () => ({ style: {} })
    }
  };
}

if (typeof window.eval !== 'function') {
  window.eval = (code) => {
    const fn = new Function('window', 'document', code);
    return fn(window, window.document);
  };
}

global.window = window;
global.document = window.document;

window.QuantickleUtils = {
  normalizeGraphIdentity: () => {}
};

window.LayoutManager = {
  currentLayout: 'grid',
  ensureGridLayoutDefault: () => {}
};

window.GraphAreaEditor = null;
window.GraphRenderer = null;
window.DataManager = { setGraphData: () => {} };
window.GraphManager = { updateGraphUI: () => {} };

const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js'), 'utf8');
window.eval(script);

const zoomCalls = [];
const cyStub = {
  zoom(value) {
    if (typeof value === 'number') {
      zoomCalls.push(value);
    }
    return 0.5;
  },
  pan: () => {},
  fit: () => {},
  elements: () => ({ remove: () => {} }),
  batch: fn => { if (typeof fn === 'function') { fn(); } },
  add: () => ({ data: () => ({}) }),
  nodes: () => ({ forEach: () => {} }),
  edges: () => [],
  remove: () => {}
};

const fm = new window.FileManagerModule({
  cytoscape: cyStub,
  notifications: { show: () => {} },
  papaParseLib: null,
});

fm.applyGraphData({ nodes: [], edges: [] });

assert.strictEqual(zoomCalls[0], 1, 'Graph loads should reset zoom before adding nodes');

console.log('file-manager-reset-viewport-before-load.test.js passed');
