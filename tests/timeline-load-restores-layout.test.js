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

global.localStorage = { getItem: () => null, setItem: () => {} };

window.QuantickleConfig = {
  availableExtensions: {},
  layoutOptions: {
    grid: { name: 'grid', fit: true },
    preset: { name: 'preset', fit: true },
    cose: { name: 'cose', fit: true }
  },
  extensionLayouts: {}
};

window.reset3DRotation = () => {};
window.GlobeLayout3D = {
  stopAutoRotation: () => {},
  resetRotation: () => {},
  resetVisualEffects: () => {},
  captureAbsolutePositions: () => {},
  config: {}
};

window.DomainLoader = {
  autoLoadDomainsForGraph: async () => []
};

window.UI = {
  showNotification: () => {}
};

window.DataManager = {
  _graphData: null,
  setGraphData(data) {
    this._graphData = data;
  },
  getGraphData() {
    return this._graphData;
  }
};

window.cytoscape = cytoscape;
require('../js/utils.js');
require('../js/config.js');
require('../js/custom-layouts.js');
window.CustomLayouts.registerCustomLayouts();
require('../js/layouts.js');
require('../js/graph.js');

const cy = cytoscape({ headless: true, styleEnabled: true });
cy.extent = () => ({ x1: 0, y1: 0, x2: 1000, y2: 1000, w: 1000, h: 1000 });
cy.container = () => ({
  style: {},
  querySelector: () => null,
  appendChild: () => {},
  classList: { add: () => {}, remove: () => {} }
});

const realGraphRenderer = window.GraphRenderer;
const testingGraphRenderer = Object.assign({}, realGraphRenderer);

Object.assign(testingGraphRenderer, {
  cy,
  skipNextLayoutApplication: false,
  suppressPostRenderLayout: false,
  isPastingNodes: false,
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
  validateGraphState() { return { valid: true, errors: [] }; }
});

testingGraphRenderer.renderGraph = function() {
  const data = window.DataManager.getGraphData() || window.GraphManager.currentGraph || { nodes: [], edges: [] };

  const nodeElements = (data.nodes || []).map(node => {
    const entry = node && node.data ? { ...node.data } : { ...node };
    const hasTopLevelCoords = node && node.x !== undefined && node.y !== undefined;
    const position = node?.position || entry.position ||
      (hasTopLevelCoords ? { x: node.x, y: node.y }
        : entry.x !== undefined && entry.y !== undefined
          ? { x: entry.x, y: entry.y }
          : undefined);
    const element = { group: 'nodes', data: entry };
    if (position) {
      element.position = position;
    }
    ['locked', 'grabbable', 'selectable'].forEach(prop => {
      if (node && Object.prototype.hasOwnProperty.call(node, prop)) {
        element[prop] = node[prop];
      }
    });
    if (node && node.classes) {
      element.classes = node.classes;
    }
    return element;
  });

  const edgeElements = (data.edges || []).map(edge => {
    const entry = edge && edge.data ? { ...edge.data } : { ...edge };
    return { group: 'edges', data: entry };
  });

  cy.batch(() => {
    cy.elements().remove();
    cy.add([...nodeElements, ...edgeElements]);
  });

  const timelineBarId = data.timelineBarId || 'timeline-bar';
  const timelineBarNode = cy.getElementById(timelineBarId);
  if (timelineBarNode.length > 0) {
    const savedLength = Number(timelineBarNode.data('barLength') ?? timelineBarNode.data('width'));
    if (Number.isFinite(savedLength)) {
      timelineBarNode.style('width', savedLength);
    }
    const savedThickness = Number(timelineBarNode.data('size'));
    if (Number.isFinite(savedThickness)) {
      timelineBarNode.style('height', savedThickness);
    }
  }

  this.normalizeAllNodeData();

  setTimeout(() => {
    if (this.suppressPostRenderLayout || (window.GraphManager && window.GraphManager._isRestoring)) {
      return;
    }
    if (window.LayoutManager && !this.isPastingNodes && !this.skipNextLayoutApplication) {
      window.LayoutManager.applyCurrentLayout();
    }
  }, 0);

  setTimeout(() => {
    if (this.suppressPostRenderLayout || (window.GraphManager && window.GraphManager._isRestoring)) {
      this.hideLoadingProgress();
      return;
    }
    if (!this.skipNextLayoutApplication) {
      try {
        this.cy.fit();
        this.cy.center();
      } catch (error) {
        // Headless fit/center may throw in some environments; ignore
      }
    }
    this.hideLoadingProgress();
  }, 20);
};

window.GraphRenderer = testingGraphRenderer;

require('../js/graph-manager.js');
require('../js/features/file-manager/file-manager-module.js');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const fileManagerNotifications = {
  show() {}
};

const fileManager = new window.FileManagerModule({
  cytoscape: cy,
  notifications: fileManagerNotifications,
  papaParseLib: null,
});

window.FileManager = fileManager;

function createTimelineGraph({ usePositionObjects, wrapInContainer = false }) {
  const node1Timestamp = Date.UTC(2020, 0, 1);
  const node2Timestamp = Date.UTC(2021, 0, 1);

  const containerId = wrapInContainer ? 'timeline-container' : null;
  const barId = containerId ? `timeline-bar-${containerId}` : 'timeline-bar';
  const tickIdFor = value => containerId ? `timeline-tick-${containerId}-${value}` : `timeline-tick-${value}`;

  const applyPosition = (node, coords) => {
    if (usePositionObjects) {
      node.position = coords;
    } else {
      node.x = coords.x;
      node.y = coords.y;
    }
    const data = node.data || (node.data = {});
    if (data && (data.id === 'n1' || data.id === 'n2')) {
      data.lockedX = coords.x;
    }
    return node;
  };

  const nodes = [
    applyPosition({
      data: { id: 'n1', type: 'entity', label: 'Node 1', timestamp: node1Timestamp }
    }, { x: 200, y: 150 }),
    applyPosition({
      data: { id: 'n2', type: 'entity', label: 'Node 2', timestamp: node2Timestamp }
    }, { x: 420, y: 260 }),
    applyPosition({
      data: { id: barId, type: 'timeline-bar', size: 12, barLength: 260, width: 260 },
      locked: true,
      grabbable: false,
      selectable: false
    }, { x: 310, y: 380 }),
    applyPosition({
      data: { id: 'timeline-anchor-n1', type: 'timeline-anchor', label: '' },
      grabbable: false,
      selectable: false
    }, { x: 200, y: 400 }),
    applyPosition({
      data: { id: 'timeline-anchor-n2', type: 'timeline-anchor', label: '' },
      grabbable: false,
      selectable: false
    }, { x: 420, y: 400 }),
    applyPosition({
      data: { id: tickIdFor(node1Timestamp), type: 'timeline-tick', label: '2020' },
      grabbable: false,
      selectable: false,
      locked: true
    }, { x: 200, y: 380 }),
    applyPosition({
      data: { id: tickIdFor(node2Timestamp), type: 'timeline-tick', label: '2021' },
      grabbable: false,
      selectable: false,
      locked: true
    }, { x: 420, y: 380 })
  ];

  const edges = [
    {
      data: {
        id: 'timeline-link-n1',
        source: 'timeline-anchor-n1',
        target: 'n1',
        type: 'timeline-link'
      }
    },
    {
      data: {
        id: 'timeline-link-n2',
        source: 'timeline-anchor-n2',
        target: 'n2',
        type: 'timeline-link'
      }
    }
  ];

  if (wrapInContainer) {
    nodes.unshift({
      data: {
        id: containerId,
        type: 'container',
        label: 'Timeline Container',
        width: 700,
        height: 520,
        isContainer: true
      },
      position: { x: 320, y: 320 },
      classes: 'container'
    });

    nodes.forEach(node => {
      const data = node && (node.data || node);
      if (!data || data.id === 'timeline-container') {
        return;
      }
      data.parent = 'timeline-container';
    });
  }

  const title = `Timeline Restore ${usePositionObjects ? 'Position' : 'XY'}${wrapInContainer ? ' Container' : ''}`;
  return {
    id: window.QuantickleUtils?.generateUuid?.() || `timeline-restore-${Date.now()}`,
    title,
    metadata: { version: 1, nodeCount: 2, edgeCount: 2, source: 'Manually added', title },
    layoutSettings: {
      currentLayout: 'timeline',
      zoom: 1,
      pan: { x: 0, y: 0 }
    },
    timelineBarId: barId,
    timelineContainerId: containerId,
    nodes,
    edges
  };
}

function createTimelineGraphWithoutConnectors(options) {
  const graph = createTimelineGraph(options);

  graph.nodes = (graph.nodes || []).filter(node => {
    const data = node && (node.data || node);
    return data?.type !== 'timeline-anchor';
  });

  graph.edges = (graph.edges || []).filter(edge => {
    const data = edge && (edge.data || edge);
    return data?.type !== 'timeline-link';
  });

  return graph;
}

function getSavedPosition(node) {
  if (!node) return null;
  if (node.position && node.position.x !== undefined && node.position.y !== undefined) {
    return node.position;
  }
  if (node.x !== undefined && node.y !== undefined) {
    return { x: node.x, y: node.y };
  }
  const data = node.data || {};
  if (data.x !== undefined && data.y !== undefined) {
    return { x: data.x, y: data.y };
  }
  return null;
}

function convertGraphToFileManagerFormat(graph) {
  const clone = JSON.parse(JSON.stringify(graph));

  const extractPosition = entry => {
    if (!entry) return null;
    if (entry.position && entry.position.x !== undefined && entry.position.y !== undefined) {
      return entry.position;
    }
    if (entry.x !== undefined && entry.y !== undefined) {
      return { x: entry.x, y: entry.y };
    }
    return null;
  };

  clone.nodes = (clone.nodes || []).map(node => {
    const source = node && node.data ? { ...node.data } : { ...node };
    const base = { ...source };

    const position = extractPosition(node) || extractPosition(source);
    if (position) {
      base.x = position.x;
      base.y = position.y;
      if (!base.position) {
        base.position = { ...position };
      }
    }

    ['locked', 'grabbable', 'selectable', 'classes', 'parent'].forEach(prop => {
      if (node && Object.prototype.hasOwnProperty.call(node, prop) && base[prop] === undefined) {
        base[prop] = node[prop];
      } else if (source && Object.prototype.hasOwnProperty.call(source, prop) && base[prop] === undefined) {
        base[prop] = source[prop];
      }
    });

    return base;
  });

  clone.edges = (clone.edges || []).map(edge => {
    const source = edge && edge.data ? { ...edge.data } : { ...edge };
    return { ...source };
  });

  return clone;
}


async function assertTimelineRestore(savedGraph, description, options = {}) {
  const { expectTimelineReapply = false } = options;

  const originalSkipDescriptor = Object.getOwnPropertyDescriptor(
    window.GraphRenderer,
    'skipNextLayoutApplication'
  );
  let trackedSkipState;
  if (originalSkipDescriptor && 'value' in originalSkipDescriptor) {
    trackedSkipState = originalSkipDescriptor.value;
  } else {
    trackedSkipState = window.GraphRenderer.skipNextLayoutApplication;
  }
  const skipTransitions = [];

  const originalSuppressDescriptor = Object.getOwnPropertyDescriptor(
    window.GraphRenderer,
    'suppressPostRenderLayout'
  );
  let trackedSuppressState;
  if (originalSuppressDescriptor && 'value' in originalSuppressDescriptor) {
    trackedSuppressState = originalSuppressDescriptor.value;
  } else {
    trackedSuppressState = window.GraphRenderer.suppressPostRenderLayout;
  }
  const suppressTransitions = [];

  Object.defineProperty(window.GraphRenderer, 'skipNextLayoutApplication', {
    configurable: true,
    enumerable: true,
    get() {
      return trackedSkipState;
    },
    set(value) {
      skipTransitions.push(value);
      trackedSkipState = value;
    }
  });

  window.GraphRenderer.skipNextLayoutApplication = false;
  window.GraphManager._pendingTimelineRestore = false;

  Object.defineProperty(window.GraphRenderer, 'suppressPostRenderLayout', {
    configurable: true,
    enumerable: true,
    get() {
      return trackedSuppressState;
    },
    set(value) {
      suppressTransitions.push(value);
      trackedSuppressState = value;
    }
  });
  window.GraphRenderer.suppressPostRenderLayout = false;

  const originalRestoringDescriptor = Object.getOwnPropertyDescriptor(window.GraphManager, '_isRestoring');
  let trackedRestoringState = originalRestoringDescriptor ? originalRestoringDescriptor.value : false;
  const restoringTransitions = [];

  const originalTimelineLayout = window.CustomLayouts && window.CustomLayouts.timelineLayout;
  let timelineLayoutCallCount = 0;
  if (typeof originalTimelineLayout === 'function') {
    window.CustomLayouts.timelineLayout = function(...args) {
      timelineLayoutCallCount += 1;
      return originalTimelineLayout.apply(this, args);
    };
  }

  Object.defineProperty(window.GraphManager, '_isRestoring', {
    configurable: true,
    enumerable: true,
    get() {
      return trackedRestoringState;
    },
    set(value) {
      restoringTransitions.push(value);
      trackedRestoringState = value;
    }
  });

  try {
    window.GraphManager._isRestoring = false;

    await window.GraphManager.loadGraphData(savedGraph);

    await wait(1200);

    if (!restoringTransitions.includes(true)) {
      throw new Error(`GraphManager should enter restoring mode during ${description} restore`);
    }

    if (trackedRestoringState !== false) {
      throw new Error(`GraphManager should exit restoring mode after ${description} restore finishes`);
    }

    const getExpectedPositionFor = (nodeId) => {
      const node = savedGraph.nodes.find(n => (n.data || n).id === nodeId);
      if (!node) {
        throw new Error(`Missing saved node ${nodeId} in ${description} scenario`);
    }
    const position = getSavedPosition(node);
    if (!position) {
      throw new Error(`Missing saved position for ${nodeId} in ${description} scenario`);
    }
    return position;
  };

  const expectedPositions = {
    n1: getExpectedPositionFor('n1'),
    n2: getExpectedPositionFor('n2')
  };

  const barId = savedGraph.timelineBarId || 'timeline-bar';
  const savedTimelineBarPosition = getExpectedPositionFor(barId);

  const barNode = cy.getElementById(barId);
  if (barNode.length === 0) {
    throw new Error(`Timeline bar node failed to load during ${description} restore test`);
  }

  if (Math.abs(barNode.position('y') - savedTimelineBarPosition.y) > 0.001) {
    throw new Error(`Timeline bar Y position was not preserved during ${description} layout restore`);
  }

  const savedBarEntry = Array.isArray(savedGraph.nodes)
    ? savedGraph.nodes.find(node => (node.data || node).id === barId)
    : null;
  const savedBarData = savedBarEntry && (savedBarEntry.data || savedBarEntry);
  const expectedBarLength = savedBarData ? Number(savedBarData.barLength || savedBarData.width) : NaN;
  if (!Number.isFinite(expectedBarLength)) {
    throw new Error(`Saved timeline bar length missing for ${description} scenario`);
  }

  const actualBarWidth = parseFloat(barNode.style('width'));
  if (!Number.isFinite(actualBarWidth)) {
    throw new Error(`Timeline bar width is not a finite value after ${description} restore`);
  }

  if (Math.abs(actualBarWidth - expectedBarLength) > 0.001) {
    throw new Error(`Timeline bar width changed from saved ${expectedBarLength} during ${description} restore`);
  }

  const savedAnchors = Array.isArray(savedGraph.nodes) ? savedGraph.nodes.filter(node => {
    const data = node && (node.data || node);
    return data && data.type === 'timeline-anchor';
  }) : [];

  ['n1', 'n2'].forEach(nodeId => {
    const node = cy.getElementById(nodeId);
    if (node.length === 0) {
      throw new Error(`Timeline node ${nodeId} failed to load in ${description} scenario`);
    }

    const expected = expectedPositions[nodeId];
    if (!expected) {
      throw new Error(`Missing expected position for ${nodeId} in ${description} scenario`);
    }

    if (Math.abs(node.position('x') - expected.x) > 0.001) {
      throw new Error(`Timeline node ${nodeId} X position changed during ${description} layout refresh`);
    }

    if (Math.abs(node.position('y') - expected.y) > 0.001) {
      throw new Error(`Timeline node ${nodeId} Y position was not preserved during ${description} load`);
    }

    const lockedX = node.data('lockedX');
    if (typeof lockedX !== 'number') {
      throw new Error(`Timeline node ${nodeId} did not regain lockedX after ${description} loading`);
    }
    if (Math.abs(lockedX - node.position('x')) > 0.001) {
      throw new Error(`Timeline node ${nodeId} lockedX does not match final x position after ${description} loading`);
    }

    const link = cy.getElementById(`timeline-link-${nodeId}`);
    if (link.length === 0) {
      throw new Error(`Timeline link edge for ${nodeId} missing after ${description} saved graph load`);
    }

    if (link.style('display') === 'none' || link.style('visibility') === 'hidden') {
      throw new Error(`Timeline link edge for ${nodeId} not visible after ${description} saved graph load`);
    }

    if (parseFloat(link.style('line-opacity')) === 0 || parseFloat(link.style('opacity')) === 0) {
      throw new Error(`Timeline link edge for ${nodeId} is transparent after ${description} saved graph load`);
    }

    const anchor = cy.getElementById(`timeline-anchor-${nodeId}`);
    if (anchor.length === 0) {
      throw new Error(`Timeline anchor for ${nodeId} missing after ${description} saved graph load`);
    }

    if (anchor.style('display') === 'none' || anchor.style('visibility') === 'hidden') {
      throw new Error(`Timeline anchor for ${nodeId} remains hidden after ${description} saved graph load`);
    }
  });

  const node1Timestamp = savedGraph.nodes.find(n => (n.data || n).id === 'n1').data.timestamp;
  const tickIdForNode1 = savedGraph.timelineContainerId
    ? `timeline-tick-${savedGraph.timelineContainerId}-${node1Timestamp}`
    : `timeline-tick-${node1Timestamp}`;
  const node1 = cy.getElementById('n1');
  const tickForNode1 = cy.getElementById(tickIdForNode1);

  if (tickForNode1.length === 0) {
    throw new Error(`Expected timeline tick for node n1 timestamp was not created during ${description} restore`);
  }

  const timelineBarIdForRestore = savedGraph.timelineBarId || 'timeline-bar';
  const timelineBar = cy.getElementById(timelineBarIdForRestore);

  if (timelineBar.length === 0) {
    throw new Error(`Timeline bar node was not created during ${description} layout restoration`);
  }

  if (typeof timelineBar.grabbable === 'function' && timelineBar.grabbable()) {
    throw new Error(`Timeline bar should remain non-grabbable after ${description} layout restoration`);
  }

  if (typeof timelineBar.locked === 'function' && !timelineBar.locked()) {
    throw new Error(`Timeline bar should remain locked after ${description} layout restoration`);
  }

  const tickX = tickForNode1.position('x');
  const node1X = node1.position('x');

  if (!Number.isFinite(tickX) || !Number.isFinite(node1X)) {
    throw new Error(`Timeline tick or node position is not finite for ${description} scenario`);
  }

  if (Math.abs(tickX - node1X) > 0.001) {
    throw new Error(`Timeline tick for node n1 timestamp does not align with node position after ${description} restore`);
  }

  if (!skipTransitions.includes(true)) {
    throw new Error(`Timeline restore in ${description} scenario should request a layout skip to preserve saved positions`);
  }

  if (trackedSkipState !== false) {
    throw new Error(`Timeline restore in ${description} scenario should clear the layout skip flag after finishing`);
  }

  if (!suppressTransitions.includes(true)) {
    throw new Error(`Timeline restore in ${description} scenario should suppress post-render layout work while restoring`);
  }


  if (trackedSuppressState !== false) {
    throw new Error(`Timeline restore in ${description} scenario should release post-render layout suppression after finishing`);
  }

  const relevantTimelineNodes = cy.nodes().filter(node => {
    const type = node.data('type');
    const lockedX = node.data('lockedX');
    return (typeof type === 'string' && type.startsWith('timeline-')) || Number.isFinite(lockedX);
  });

  const normalizePosition = pos => {
    if (!pos) return null;
    const x = Number(pos.x);
    const y = Number(pos.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return { x, y };
  };

  const extractStoredPosition = entry => {
    if (!entry) return null;
    const data = entry.data || entry;
    return (
      normalizePosition(entry.position) ||
      normalizePosition(data.position) ||
      (entry.x !== undefined && entry.y !== undefined ? normalizePosition({ x: entry.x, y: entry.y }) : null) ||
      (data.x !== undefined && data.y !== undefined ? normalizePosition({ x: data.x, y: data.y }) : null)
    );
  };

  const ensureGraphCapturesPositions = (graph, label) => {
    if (!graph || !Array.isArray(graph.nodes)) {
      throw new Error(`${label} graph data is missing nodes after ${description} restore`);
    }

    const nodeMap = new Map();
    graph.nodes.forEach(entry => {
      const data = entry && (entry.data || entry);
      if (!data || data.id == null) return;
      nodeMap.set(String(data.id), { entry, data });
    });

    relevantTimelineNodes.forEach(node => {
      const nodeId = node.id();
      const stored = nodeMap.get(nodeId);
      if (!stored) {
        throw new Error(`${label} graph data did not retain timeline element ${nodeId} during ${description} restore`);
      }

      const storedPosition = extractStoredPosition(stored.entry) || extractStoredPosition(stored.data);
      if (!storedPosition) {
        throw new Error(`${label} graph data is missing a saved position for ${nodeId} during ${description} restore`);
      }

      const actual = node.position();
      if (Math.abs(storedPosition.x - actual.x) > 0.001 || Math.abs(storedPosition.y - actual.y) > 0.001) {
        throw new Error(`${label} graph data stored position for ${nodeId} does not match Cytoscape state during ${description} restore`);
      }

      const lockedX = node.data('lockedX');
      if (Number.isFinite(lockedX)) {
        const storedLockedX = Number(stored.data.lockedX);
        if (!Number.isFinite(storedLockedX)) {
          throw new Error(`${label} graph data did not persist lockedX for ${nodeId} during ${description} restore`);
        }
        if (Math.abs(storedLockedX - lockedX) > 0.001) {
          throw new Error(`${label} graph data stored lockedX for ${nodeId} diverges from Cytoscape during ${description} restore`);
        }
      }
    });
  };

  const graphData = window.GraphManager.getCurrentGraphData();
  ensureGraphCapturesPositions(graphData, 'GraphManager');

  if (window.DataManager && typeof window.DataManager.getGraphData === 'function') {
    const dmGraph = window.DataManager.getGraphData();
    if (dmGraph && dmGraph !== graphData) {
      ensureGraphCapturesPositions(dmGraph, 'DataManager');
    }
  }

  await wait(400);

  if (window.GraphManager._pendingTimelineRestore) {
    throw new Error(`GraphManager should clear pending timeline restore after ${description} scenario completes`);
  }

  if (typeof originalTimelineLayout === 'function') {
    if (expectTimelineReapply && timelineLayoutCallCount === 0) {
      throw new Error(`Timeline layout should reapply during ${description} restore scenario`);
    }
    if (!expectTimelineReapply && timelineLayoutCallCount > 0) {
      throw new Error(`Timeline layout should not reapply for containerized ${description} restore scenario`);
    }
  }
  } finally {
    Object.defineProperty(window.GraphManager, '_isRestoring', {
      value: trackedRestoringState,
      writable: true,
      enumerable: true,
      configurable: true
    });

    Object.defineProperty(window.GraphRenderer, 'skipNextLayoutApplication', {
      value: trackedSkipState,

      writable: true,
      enumerable: true,
      configurable: true
    });

    Object.defineProperty(window.GraphRenderer, 'suppressPostRenderLayout', {
      value: trackedSuppressState,
      writable: true,
      enumerable: true,
      configurable: true
    });


    if (typeof originalTimelineLayout === 'function') {
      window.CustomLayouts.timelineLayout = originalTimelineLayout;
    }

  }
}

async function assertTimelineRestoreWithDelayedConnectors(savedGraph) {
  const savedGraphClone = JSON.parse(JSON.stringify(savedGraph));
  const originalHelper = window.CustomLayouts && window.CustomLayouts.rebuildTimelineConnectors;

  if (typeof originalHelper !== 'function') {
    throw new Error('CustomLayouts.rebuildTimelineConnectors is not available for delayed connector test');
  }

  let helperCallCount = 0;

  window.CustomLayouts.rebuildTimelineConnectors = function(...args) {
    helperCallCount += 1;
    if (helperCallCount < 5) {
      return { anchors: 0, links: 0 };
    }
    return originalHelper.apply(this, args);
  };

  try {
    await assertTimelineRestore(savedGraphClone, 'delayed-connector-rebuild');

    if (helperCallCount < 5) {
      throw new Error('Timeline connector rebuild helper did not retry after repeated empty results');
    }
  } finally {
    window.CustomLayouts.rebuildTimelineConnectors = originalHelper;
  }
}

async function assertFileManagerTimelineRestore(savedGraph, description) {

  const savedGraphClone = JSON.parse(JSON.stringify(savedGraph));
  const originalHelper = window.CustomLayouts && window.CustomLayouts.rebuildTimelineConnectors;

  if (typeof originalHelper !== 'function') {
    throw new Error('CustomLayouts.rebuildTimelineConnectors is not available for delayed connector test');
  }

  let helperCallCount = 0;

  window.CustomLayouts.rebuildTimelineConnectors = function(...args) {
    helperCallCount += 1;
    if (helperCallCount < 5) {
      return { anchors: 0, links: 0 };
    }
    return originalHelper.apply(this, args);
  };

  try {
    await assertTimelineRestore(savedGraphClone, 'delayed-connector-rebuild');

    if (helperCallCount < 5) {
      throw new Error('Timeline connector rebuild helper did not retry after repeated empty results');
    }
  } finally {
    window.CustomLayouts.rebuildTimelineConnectors = originalHelper;
  }
}

async function assertFileManagerTimelineRestore(savedGraph, description) {
  const savedGraphClone = JSON.parse(JSON.stringify(savedGraph));

  window.FileManager.applyGraphData(savedGraphClone);

  await wait(400);

  const savedNodes = Array.isArray(savedGraph.nodes) ? savedGraph.nodes : [];

  savedNodes.forEach(entry => {
    const data = entry && (entry.data || entry);
    if (!data || data.id == null) {
      return;
    }

    const nodeId = String(data.id);
    const node = cy.getElementById(nodeId);
    if (node.length === 0) {
      throw new Error(`Node ${nodeId} missing after FileManager ${description} restore`);
    }

    const savedPosition = getSavedPosition(entry) || getSavedPosition(data);
    if (savedPosition) {
      const actual = node.position();
      if (Math.abs(actual.x - savedPosition.x) > 0.001 || Math.abs(actual.y - savedPosition.y) > 0.001) {
        throw new Error(`Node ${nodeId} position changed during FileManager ${description} restore`);
      }
    }

    const savedLockedState =
      entry && Object.prototype.hasOwnProperty.call(entry, 'locked')
        ? entry.locked
        : data && Object.prototype.hasOwnProperty.call(data, 'locked')
        ? data.locked
        : undefined;
    if (savedLockedState !== undefined && typeof node.locked === 'function') {
      if (node.locked() !== !!savedLockedState) {
        throw new Error(`Node ${nodeId} lock state diverged during FileManager ${description} restore`);
      }
    }

    const savedLockedX = Number(
      Object.prototype.hasOwnProperty.call(entry || {}, 'lockedX')
        ? entry.lockedX
        : Object.prototype.hasOwnProperty.call(data || {}, 'lockedX')
        ? data.lockedX
        : undefined
    );
    if (Number.isFinite(savedLockedX)) {
      const actualLockedX = node.data('lockedX');
      if (typeof actualLockedX !== 'number' || Math.abs(actualLockedX - savedLockedX) > 0.001) {
        throw new Error(`Node ${nodeId} lockedX not preserved during FileManager ${description} restore`);
      }
    }
  });

  const persistedNodeIds = ['n1', 'n2', savedGraph.timelineBarId || 'timeline-bar'];
  persistedNodeIds.forEach(nodeId => {
    const node = cy.getElementById(nodeId);
    if (node.length === 0) {
      throw new Error(`Timeline element ${nodeId} missing after FileManager ${description} restore`);
    }
  });
}

async function run() {
  const savedGraphWithPositions = createTimelineGraph({ usePositionObjects: true });
  const savedGraphWithTopLevelCoords = createTimelineGraph({ usePositionObjects: false });
  const savedGraphWithoutConnectors = createTimelineGraphWithoutConnectors({ usePositionObjects: true });
  const delayedGraphWithoutConnectors = createTimelineGraphWithoutConnectors({ usePositionObjects: true });

  const containerGraphWithPositions = createTimelineGraph({ usePositionObjects: true, wrapInContainer: true });
  const containerGraphWithTopLevelCoords = createTimelineGraph({ usePositionObjects: false, wrapInContainer: true });

  await assertTimelineRestore(savedGraphWithPositions, 'position-object');
  await assertTimelineRestore(savedGraphWithTopLevelCoords, 'top-level-x-y');
  await assertTimelineRestore(savedGraphWithoutConnectors, 'missing-connectors');
  await assertTimelineRestoreWithDelayedConnectors(delayedGraphWithoutConnectors);

  await assertTimelineRestore(containerGraphWithPositions, 'container-position-object', { expectTimelineReapply: false });
  await assertTimelineRestore(containerGraphWithTopLevelCoords, 'container-top-level-x-y', { expectTimelineReapply: false });

  const fileManagerGraphWithPositions = convertGraphToFileManagerFormat(
    createTimelineGraph({ usePositionObjects: true })
  );
  const fileManagerGraphWithTopLevelCoords = convertGraphToFileManagerFormat(
    createTimelineGraph({ usePositionObjects: false })
  );

  await assertFileManagerTimelineRestore(fileManagerGraphWithPositions, 'position-object');
  await assertFileManagerTimelineRestore(fileManagerGraphWithTopLevelCoords, 'top-level-x-y');

  console.log('Timeline layout restores without disrupting saved positions, including containerized timelines and FileManager restores');
  process.exit(0);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
