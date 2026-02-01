const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body><div class="sidebar"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;
window.location = { origin: 'http://localhost' };

global.localStorage = { getItem: () => null, setItem: () => {} };

window.cytoscape = cytoscape;
require('../js/utils.js');
require('../js/custom-layouts.js');
window.CustomLayouts.registerCustomLayouts();
require('../js/graph-manager.js');

const cy = cytoscape({ headless: true, styleEnabled: true });
cy.extent = () => ({ x1: 0, y1: 0, x2: 1000, y2: 1000, w: 1000, h: 1000 });
cy.container = () => ({ style: {}, querySelector: () => null, appendChild: () => {} });
cy.destroyed = () => false;

window.GraphRenderer = { cy };

const baseGraph = {
  id: '66666666-6666-4666-8666-666666666666',
  title: 'Timeline Reset Test',
  description: 'Graph prior to reset',
  nodes: [{ data: { id: 'n1', type: 'entity', label: 'Node 1' } }],
  edges: [],
  metadata: { nodeCount: 1, edgeCount: 0, source: 'Manually added', title: 'Timeline Reset Test' }
};

window.GraphManager.currentGraph = JSON.parse(JSON.stringify(baseGraph));

window.DataManager = {
  getGraphData() {
    return {
      nodes: [
        { id: 'n1', type: 'entity', label: 'Node 1' },
        { id: 'timeline-anchor-n1', type: 'timeline-anchor' }
      ],
      edges: [
        { id: 'timeline-link-n1', source: 'timeline-anchor-n1', target: 'n1', type: 'timeline-link' }
      ],
      metadata: { nodeCount: 2, edgeCount: 1 }
    };
  },
  setGraphData(data) {
  }
};

window.FileManager = {
  graphData: {
    nodes: [
      { data: { id: 'n1', type: 'entity', label: 'Node 1' } },
      { data: { id: 'timeline-anchor-n1', type: 'timeline-anchor' } }
    ],
    edges: [
      { data: { id: 'timeline-link-n1', source: 'timeline-anchor-n1', target: 'n1', type: 'timeline-link' } }
    ],
    metadata: { nodeCount: 2, edgeCount: 1 }
  }
};

cy.add({ data: { id: 'n1', type: 'entity', label: 'Node 1' }, position: { x: 50, y: 75 } });

window.CustomLayouts.rebuildTimelineConnectors(cy);

const graphBeforeReset = window.GraphManager.getCurrentGraphData();
const hasTimelineNodes = graphBeforeReset.nodes.some(entry => {
  const data = entry && (entry.data || entry);
  return data && typeof data.type === 'string' && data.type.startsWith('timeline-');
});
const hasTimelineEdges = graphBeforeReset.edges.some(entry => {
  const data = entry && (entry.data || entry);
  return data && data.type === 'timeline-link';
});

if (!hasTimelineNodes || !hasTimelineEdges) {
  throw new Error('Timeline scaffolding was not registered before reset');
}

const originalClearTimeout = global.clearTimeout;
const clearedTimeouts = [];
global.clearTimeout = (timeoutId) => {
  clearedTimeouts.push(timeoutId);
};

window.GraphManager._timelineRebuildTimers = new Set(['mock-timeout-1', 'mock-timeout-2']);

window.GraphManager.resetGraphContext();

global.clearTimeout = originalClearTimeout;


const timelineAnchorAfter = cy.getElementById('timeline-anchor-n1');
if (timelineAnchorAfter && timelineAnchorAfter.length > 0) {
  throw new Error('Timeline anchor still present in Cytoscape after reset');
}

const timelineLinkAfter = cy.getElementById('timeline-link-n1');
if (timelineLinkAfter && timelineLinkAfter.length > 0) {
  throw new Error('Timeline link still present in Cytoscape after reset');
}

const graphAfterReset = window.GraphManager.getCurrentGraphData();
const dataHasTimelineNodes = graphAfterReset.nodes.some(entry => {
  const data = entry && (entry.data || entry);
  return data && typeof data.type === 'string' && data.type.startsWith('timeline-');
});
if (!dataHasTimelineNodes) {
  throw new Error('Timeline nodes were removed from GraphManager currentGraph after reset');
}

const dataHasTimelineEdges = graphAfterReset.edges.some(entry => {
  const data = entry && (entry.data || entry);
  return data && data.type === 'timeline-link';
});
if (!dataHasTimelineEdges) {
  throw new Error('Timeline edges were removed from GraphManager currentGraph after reset');
}

if (graphAfterReset.metadata.nodeCount !== graphAfterReset.nodes.length) {
  throw new Error('GraphManager metadata nodeCount not updated after timeline cleanup');
}

if (graphAfterReset.metadata.edgeCount !== graphAfterReset.edges.length) {
  throw new Error('GraphManager metadata edgeCount not updated after timeline cleanup');
}

if (clearedTimeouts.length !== 2) {
  throw new Error('Pending timeline rebuild timers were not cleared during reset');
}

if (window.GraphManager._timelineRebuildTimers !== null) {
  throw new Error('Timeline rebuild timer registry was not released after reset');
}


console.log('Resetting the graph context clears rendered timeline scaffolding while preserving stored data');
process.exit(0);
