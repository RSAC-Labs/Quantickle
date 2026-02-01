global.window = global.window || {};
global.document = {
  elements: new Map(),
  body: {
    appendChild() {}
  },
  getElementById(id) {
    return this.elements.get(id) || null;
  },
  createElement() {
    const element = {
      style: {},
      remove() {},
      appendChild() {},
      set id(value) {
        if (value) {
          global.document.elements.set(value, element);
        }
      }
    };
    return element;
  }
};

global.requestAnimationFrame = (fn) => setTimeout(fn, 0);

require('../js/features/graph-modules/graph-controls/graph-controls-module.js');
const GraphControlsModule = window.GraphControlsModule;

let syncCallCount = 0;
let lastSyncOptions = null;
window.TextCallout = {
  syncViewport(options = {}) {
    syncCallCount += 1;
    lastSyncOptions = options;
  }
};

let fitCalled = false;
const fakeContainer = {
  addEventListener() {},
  removeEventListener() {},
  getBoundingClientRect() {
    return { left: 0, top: 0 };
  }
};

const cy = {
  fit() {
    fitCalled = true;
  },
  zoom() {
    return 1;
  },
  container() {
    return fakeContainer;
  },
  userZoomingEnabled() {},
  minZoom() {},
  maxZoom() {},
  on() {}
};

const controls = new GraphControlsModule({
  cytoscape: cy,
  notifications: { show: () => {} }
});

controls.fitGraph();

if (!fitCalled) {
  throw new Error('GraphControlsModule.fitGraph did not call cy.fit');
}

if (syncCallCount !== 1) {
  throw new Error('TextCallout syncViewport was not triggered after fit');
}

if (!lastSyncOptions || lastSyncOptions.immediate !== true) {
  throw new Error('TextCallout syncViewport should be invoked with immediate=true');
}

console.log('GraphControls fit triggers TextCallout viewport sync');
