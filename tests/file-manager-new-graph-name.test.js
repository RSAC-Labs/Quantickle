const assert = require('assert');
const fs = require('fs');
const path = require('path');

const noop = () => {};
const window = {
  document: {
    createElement: () => ({
      style: {},
      addEventListener: noop,
      removeEventListener: noop,
      setAttribute: noop,
      appendChild: noop,
      remove: noop,
      click: noop,
      showPicker: noop
    }),
    createTextNode: () => ({}),
    addEventListener: noop,
    removeEventListener: noop,
    querySelector: () => null,
    getElementById: () => null,
    createElementNS: () => ({}),
    body: {
      appendChild: noop,
      removeChild: noop
    }
  },
  addEventListener: noop,
  removeEventListener: noop,
  navigator: { userAgent: 'node', userActivation: { isActive: true } },
  HTMLCanvasElement: function HTMLCanvasElement() {},
  EventTarget: function EventTarget() {}
};

window.performance = { now: () => Date.now() };
window.HTMLCanvasElement.prototype.getContext = () => null;
window.eval = (code) => eval(code);

global.window = window;
global.document = window.document;
global.navigator = window.navigator;

window.QuantickleUtils = {
  generateUuid: () => 'uuid-test',
  normalizeGraphIdentity: (graph, options = {}) => {
    const title = graph.title || options.defaultTitle || 'Untitled graph';
    graph.title = title;
    graph.metadata = graph.metadata || {};
    graph.metadata.title = title;
    graph.metadata.name = title;
    return graph;
  }
};

const fileManagerScript = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js'),
  'utf8'
);
window.eval(fileManagerScript);

let recordedName = null;
window.DataManager = {
  graphIdentity: { metadata: {} },
  setGraphData: () => {},
  setGraphName(name) {
    recordedName = name;
    this.currentGraphName = name;
  },
  updateFileNameDisplay: () => {}
};

window.GraphManager = {
  currentGraph: null,
  updateGraphUI: () => {}
};

const fm = new window.FileManagerModule({
  cytoscape: null,
  notifications: { show: () => {} },
  papaParseLib: {},
});

fm.applyGraphData = function(graphData) {
  this.graphData = graphData;
  this.syncExternalManagers(graphData);
};

fm.createNewGraph();

assert.strictEqual(recordedName, 'New graph', 'DataManager should receive the New graph title');
console.log('file-manager-new-graph-name.test.js passed');
