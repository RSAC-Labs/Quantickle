const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM(`<!doctype html><html><body>
  <div class="sidebar"><div class="control-group"></div></div>
  <div id="graphName"></div>
  <div id="nodeCount"></div>
  <div id="edgeCount"></div>
</body></html>`, { pretendToBeVisual: true });

global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;
window.location = { origin: 'http://localhost' };

global.localStorage = {
  getItem: () => null,
  setItem: () => {}
};

window.QuantickleUtils = {
  normalizeGraphIdentity(data) {
    return data;
  },
  generateUuid() {
    return 'test-uuid';
  }
};

window.reset3DRotation = () => {};
window.GlobeLayout3D = {
  stopAutoRotation: () => {},
  resetRotation: () => {},
  resetVisualEffects: () => {},
  config: {}
};

const layoutManager = {
  defaultLayout: 'grid',
  currentLayout: 'grid',
  ensureGridCalls: 0,
  updateDropdownCalls: 0,
  applyCalls: 0,
  ensureGridLayoutDefault() {
    this.ensureGridCalls += 1;
    this.currentLayout = 'grid';
  },
  updateLayoutDropdown() {
    this.updateDropdownCalls += 1;
  },
  applyCurrentLayout() {
    this.applyCalls += 1;
  }
};
window.LayoutManager = layoutManager;

window.TableManager = {
  updateTables() {},
  updateTotalDataTable() {}
};

window.GraphManager = {
  currentGraph: null,
  updateGraphUI() {}
};

window.DomainLoader = null;
window.UI = { showNotification() {} };

window.DataManager = {
  _graphData: null,
  setGraphData(data) {
    this._graphData = data;
  },
  getGraphData() {
    return this._graphData;
  }
};

const cy = cytoscape({ headless: true, styleEnabled: true });
cy.extent = () => ({ x1: 0, y1: 0, x2: 1000, y2: 1000, w: 1000, h: 1000 });
cy.container = () => ({
  style: {},
  querySelector: () => null,
  appendChild: () => {},
  classList: { add: () => {}, remove: () => {} }
});

const renderCalls = [];
window.GraphRenderer = {
  cy,
  skipNextLayoutApplication: false,
  suppressPostRenderLayout: false,
  isPastingNodes: false,
  renderGraph() {
    const skipAtCall = !!this.skipNextLayoutApplication;
    renderCalls.push({ skipAtCall });

    const graph = window.DataManager.getGraphData() || window.GraphManager.currentGraph || { nodes: [], edges: [] };

    const nodeElements = (graph.nodes || []).map(node => {
      const baseData = node && node.data ? node.data : node || {};
      const element = {
        group: 'nodes',
        data: { ...baseData }
      };

      if (node && node.classes) {
        element.classes = node.classes;
      }

      if (node && Object.prototype.hasOwnProperty.call(node, 'locked')) {
        element.locked = node.locked;
      }

      let position = null;
      if (node && node.position) {
        position = node.position;
      } else if (baseData && baseData.position) {
        position = baseData.position;
      } else if (node && node.x !== undefined && node.y !== undefined) {
        position = { x: node.x, y: node.y };
      } else if (baseData && baseData.x !== undefined && baseData.y !== undefined) {
        position = { x: baseData.x, y: baseData.y };
      }

      if (position) {
        element.position = { x: Number(position.x), y: Number(position.y) };
      }

      return element;
    });

    const edgeElements = (graph.edges || []).map(edge => ({
      group: 'edges',
      data: edge && edge.data ? { ...edge.data } : { ...edge }
    }));

    cy.batch(() => {
      cy.elements().remove();
      cy.add([...nodeElements, ...edgeElements]);
    });

    if (!this.skipNextLayoutApplication && typeof window.LayoutManager.applyCurrentLayout === 'function') {
      window.LayoutManager.applyCurrentLayout();
    }

    this.skipNextLayoutApplication = false;
  },
  pauseHistory() {},
  resumeHistory() {},
  saveState() {},
  updateStats() {},
  showLoadingProgress() {},
  hideLoadingProgress() {},
  updateLabelVisibility() {},
  initializeCollapsedContainers() {},
  determineLODLevel() { return 0; },
  applyLODRendering(data) {
    return { nodesToRender: data.nodes || [], edgesToRender: data.edges || [] };
  },
  validateRenderBatch() { return { valid: true, errors: [] }; },
  normalizeAllNodeData() {},
  validateGraphState() { return { valid: true, errors: [] }; }
};

window.cytoscape = cytoscape;

require('../js/features/file-manager/file-manager-module.js');
require('../js/api.js');
window.QuantickleAPI.init();

const fileManager = new window.FileManagerModule({
  cytoscape: cy,
  notifications: { show() {} },
  papaParseLib: null,
});

window.FileManager = fileManager;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function createSavedGraph() {
  return {
    id: 'saved-graph',
    title: 'Saved Layout Graph',
    layoutSettings: {
      currentLayout: 'cose',
      zoom: 1.2,
      pan: { x: 12, y: -6 }
    },
    metadata: { version: '2.0.0' },
    nodes: [
      {
        data: { id: 'alpha', label: 'Alpha', type: 'entity' },
        position: { x: 120, y: 180 },
        locked: true
      },
      {
        data: { id: 'beta', label: 'Beta', type: 'entity' },
        position: { x: 360, y: 320 }
      }
    ],
    edges: [
      { data: { id: 'alpha-beta', source: 'alpha', target: 'beta', label: 'connects' } }
    ]
  };
}

function assertPositionsMatch(savedGraph, description) {
  const nodes = Array.isArray(savedGraph.nodes) ? savedGraph.nodes : [];

  nodes.forEach(node => {
    const reference = node && (node.data || node);
    if (!reference || reference.id == null) {
      return;
    }

    const id = String(reference.id);
    const cyNode = cy.getElementById(id);
    if (cyNode.empty()) {
      throw new Error(`Node ${id} missing after ${description}`);
    }

    const savedPosition = node.position || reference.position ||
      (reference.x !== undefined && reference.y !== undefined
        ? { x: reference.x, y: reference.y }
        : null);

    if (savedPosition) {
      const actual = cyNode.position();
      if (Math.abs(actual.x - savedPosition.x) > 0.001 || Math.abs(actual.y - savedPosition.y) > 0.001) {
        throw new Error(`Node ${id} position changed during ${description}`);
      }
    }
  });
}

async function assertFileManagerRestoresLayout(savedGraph) {
  layoutManager.currentLayout = 'grid';
  layoutManager.ensureGridCalls = 0;
  layoutManager.updateDropdownCalls = 0;
  layoutManager.applyCalls = 0;
  renderCalls.length = 0;
  window.GraphRenderer.skipNextLayoutApplication = false;

  fileManager.applyGraphData(JSON.parse(JSON.stringify(savedGraph)));
  await wait(20);

  if (layoutManager.currentLayout !== savedGraph.layoutSettings.currentLayout) {
    throw new Error('FileManager did not restore saved layout before rendering');
  }

  if (layoutManager.ensureGridCalls !== 0) {
    throw new Error('FileManager should not trigger grid layout when saved layout exists');
  }

  if (layoutManager.applyCalls !== 0) {
    throw new Error('Automatic layout application should be skipped for saved layout restores');
  }

  if (!renderCalls.length || !renderCalls[0].skipAtCall) {
    throw new Error('GraphRenderer should skip automatic layout when FileManager restores saved layout');
  }

  if (layoutManager.updateDropdownCalls === 0) {
    throw new Error('Layout dropdown should update to reflect restored layout before rendering');
  }

  assertPositionsMatch(savedGraph, 'FileManager restore');
}

async function assertAPILoadAndUpdatePreserveLayout(savedGraph) {
  const storedGraph = JSON.parse(JSON.stringify(savedGraph));
  storedGraph.nodeMap = new Map();
  storedGraph.edgeMap = new Map();

  window.QuantickleAPI.graphData.set('api-graph', storedGraph);

  layoutManager.currentLayout = 'grid';
  layoutManager.applyCalls = 0;
  const initialEnsureCalls = layoutManager.ensureGridCalls;
  const initialDropdownCalls = layoutManager.updateDropdownCalls;
  renderCalls.length = 0;
  window.GraphRenderer.skipNextLayoutApplication = false;

  const loadResult = window.QuantickleAPI.loadGraph('api-graph');
  if (!loadResult) {
    throw new Error('QuantickleAPI.loadGraph should return true when data exists');
  }
  await wait(20);

  if (layoutManager.currentLayout !== savedGraph.layoutSettings.currentLayout) {
    throw new Error('QuantickleAPI.loadGraph did not restore saved layout before rendering');
  }

  if (layoutManager.ensureGridCalls !== initialEnsureCalls) {
    throw new Error('QuantickleAPI.loadGraph should not trigger grid layout when saved layout exists');
  }

  if (!renderCalls.length || !renderCalls[0].skipAtCall) {
    throw new Error('GraphRenderer should skip automatic layout when QuantickleAPI.loadGraph restores a saved layout');
  }

  if (layoutManager.applyCalls !== 0) {
    throw new Error('QuantickleAPI.loadGraph should not apply a layout pass when saved layouts are restored');
  }

  if (layoutManager.updateDropdownCalls <= initialDropdownCalls) {
    throw new Error('Layout dropdown should update when QuantickleAPI.loadGraph restores a saved layout');
  }

  assertPositionsMatch(savedGraph, 'QuantickleAPI.loadGraph restore');

  const ensureCallsBeforeUpdate = layoutManager.ensureGridCalls;
  const dropdownCallsBeforeUpdate = layoutManager.updateDropdownCalls;
  layoutManager.currentLayout = 'grid';
  layoutManager.applyCalls = 0;
  renderCalls.length = 0;
  window.GraphRenderer.skipNextLayoutApplication = false;

  window.QuantickleAPI.updateGraph('api-graph');
  await wait(20);

  if (layoutManager.currentLayout !== savedGraph.layoutSettings.currentLayout) {
    throw new Error('QuantickleAPI.updateGraph did not preserve saved layout before rendering');
  }

  if (layoutManager.ensureGridCalls !== ensureCallsBeforeUpdate) {
    throw new Error('QuantickleAPI.updateGraph should not force grid layout when saved layout exists');
  }

  if (!renderCalls.length || !renderCalls[0].skipAtCall) {
    throw new Error('GraphRenderer should skip automatic layout when QuantickleAPI.updateGraph preserves a saved layout');
  }

  if (layoutManager.applyCalls !== 0) {
    throw new Error('QuantickleAPI.updateGraph should not apply layout automatically when saved layout is present');
  }

  if (layoutManager.updateDropdownCalls <= dropdownCallsBeforeUpdate) {
    throw new Error('Layout dropdown should update when QuantickleAPI.updateGraph preserves a saved layout');
  }

  assertPositionsMatch(savedGraph, 'QuantickleAPI.updateGraph restore');
}

async function run() {
  const savedGraph = createSavedGraph();

  await assertFileManagerRestoresLayout(savedGraph);
  await assertAPILoadAndUpdatePreserveLayout(savedGraph);

  console.log('FileManager and API restores keep saved layouts and positions intact without forcing grid.');
  process.exit(0);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
