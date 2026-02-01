const assert = require('assert');

global.window = {};
global.document = {};

global.navigator = {
  clipboard: {
    readText: () => Promise.resolve(''),
    writeText: () => Promise.resolve()
  }
};

require('../js/features/graph-area-editor/graph-area-editor-module.js');
require('../js/edge-editor.js');

class TestGraphAreaEditor extends window.GraphAreaEditorModule {
  init() {
    this.settings = { ...this.defaultSettings };
  }
}

function createFakeEdge(id) {
  const dataStore = { id };
  const styleStore = {};
  return {
    id,
    data(key, value) {
      if (typeof key === 'object' && key !== null) {
        Object.assign(dataStore, key);
        return this;
      }
      if (typeof value === 'undefined') {
        return dataStore[key];
      }
      dataStore[key] = value;
      return this;
    },
    style(arg1, arg2) {
      if (typeof arg1 === 'object' && arg1 !== null) {
        Object.assign(styleStore, arg1);
        return this;
      }
      if (typeof arg2 === 'undefined') {
        return styleStore[arg1];
      }
      styleStore[arg1] = arg2;
      return this;
    }
  };
}

function makeCollection(elements) {
  return {
    forEach(callback) {
      elements.forEach(callback);
    }
  };
}

const fakeCy = {
  edges: () => makeCollection([]),
  nodes: () => makeCollection([])
};

const notifications = { show: () => {} };
const graphAreaEditor = new TestGraphAreaEditor({ cytoscape: fakeCy, notifications });

graphAreaEditor.settings = {
  ...graphAreaEditor.settings,
  edgeColor: '#123456',
  edgeThickness: 2,
  edgeFormat: 'dashed',
  edgeShape: 'straight',
  showArrows: true,
  arrowSize: 9
};

const edge = createFakeEdge('ab');
graphAreaEditor.applyEdgeSettings(makeCollection([edge]));

edge.data('color', '#ff00ff');
edge.data('width', 5);
edge.data('showArrows', false);
edge.data('arrowSize', 4);
window.EdgeEditor.markEdgeCustomization(edge, ['color', 'width', 'showArrows', 'arrowSize']);

graphAreaEditor.applyEdgeSettings(makeCollection([edge]));

assert.strictEqual(edge.data('color'), '#ff00ff', 'Custom edge color should be preserved');
assert.strictEqual(edge.data('width'), 5, 'Custom edge thickness should be preserved');
assert.strictEqual(edge.data('showArrows'), false, 'Custom arrow visibility should be preserved');
assert.strictEqual(edge.data('arrowSize'), 4, 'Custom arrow size should be preserved');
assert.strictEqual(edge.data('lineStyle'), 'dashed', 'Non-custom properties should follow GraphAreaEditor settings');
assert.strictEqual(edge.data('curveStyle'), 'straight', 'Edge shape should follow GraphAreaEditor settings when not customized');

const edge2 = createFakeEdge('bc');
graphAreaEditor.applyEdgeSettings(makeCollection([edge2]));

assert.strictEqual(edge2.data('color'), '#123456', 'Default edge color should be applied when no overrides exist');
assert.strictEqual(edge2.data('width'), 2, 'Default edge thickness should be applied when no overrides exist');

const edge3 = createFakeEdge('cd');
edge3.data('lineStyle', 'dotted');
edge3.data('customStyleOverrides', { lineStyle: true });

graphAreaEditor.applyEdgeSettings(makeCollection([edge3]));

assert.strictEqual(edge3.data('lineStyle'), 'dotted', 'Line style marked as customized should be preserved');

console.log('GraphAreaEditor preserves manual edge customizations');
