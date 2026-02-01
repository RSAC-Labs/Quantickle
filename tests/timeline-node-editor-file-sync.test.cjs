const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;

global.localStorage = { getItem: () => null, setItem: () => {} };

if (window.HTMLCanvasElement && window.HTMLCanvasElement.prototype) {
  window.HTMLCanvasElement.prototype.getContext = () => null;
}

const notifications = { show: () => {} };
const keyboardManager = { disable: () => {}, enable: () => {} };

window.LayoutManager = {
  currentLayout: 'timeline',
  getCurrentLayout() {
    return this.currentLayout;
  },
  applyLayout: () => {}
};

const fileGraph = {
  nodes: [
    { group: 'nodes', data: { id: 'event-1', type: 'event', timestamp: '2024-01-01', lockedX: 120 } },
    { group: 'nodes', data: { id: 'timeline-anchor-event-1', type: 'timeline-anchor' }, position: { x: 5, y: 0 } },
    { group: 'nodes', data: { id: 'timeline-bar', type: 'timeline-bar' }, position: { x: 0, y: 0 } }
  ],
  edges: [
    { group: 'edges', data: { id: 'timeline-anchor-event-1-event-1', source: 'timeline-anchor-event-1', target: 'event-1', type: 'timeline-link' } }
  ],
  metadata: { nodeCount: 3, edgeCount: 1 }
};

let connectorSyncs = 0;
let storedPositions = [];
window.GraphManager = {
  currentGraph: { ...fileGraph, nodes: [...fileGraph.nodes], edges: [...fileGraph.edges] },
  getCurrentGraphData() {
    return this.currentGraph;
  },
  syncTimelineConnectors(anchors = [], links = [], bars = []) {
    connectorSyncs += 1;
    const nodes = this.currentGraph.nodes;
    const edges = this.currentGraph.edges;

    anchors.forEach(anchor => {
      nodes.push({ group: 'nodes', data: { id: anchor.id, type: 'timeline-anchor', ...anchor.data }, position: anchor.position });
    });

    bars.forEach(bar => {
      nodes.push({ group: 'nodes', data: { id: bar.id, type: 'timeline-bar', ...bar.data }, position: bar.position });
    });

    links.forEach(link => {
      edges.push({ group: 'edges', data: { id: link.id, source: link.source, target: link.target, type: 'timeline-link', ...link.data } });
    });
  },
  storeTimelineAbsolutePositions(records = []) {
    storedPositions = [...records];
    records.forEach(record => {
      const entry = this.currentGraph.nodes.find(node => (node.data || node).id === record.id);
      const data = entry.data || entry;
      if (record.lockedX !== undefined) {
        data.lockedX = record.lockedX;
      }
    });
  }
};

const stripTimelineArtifacts = (graph) => {
  const nodes = graph.nodes
    .map(node => ({ ...(node.data || node) }))
    .filter(data => !(typeof data.type === 'string' && data.type.startsWith('timeline-')))
    .map(data => {
      const clone = { ...data };
      delete clone.lockedX;
      return { data: clone };
    });

  const edges = graph.edges
    .map(edge => ({ ...(edge.data || edge) }))
    .filter(data => data.type !== 'timeline-link')
    .map(data => ({ data: data }));

  return { ...graph, nodes, edges };
};

let lastGraphData = null;
let sanitizedGraph = null;
window.DataManager = {
  setGraphData(data) {
    lastGraphData = data;
  },
  getGraphData() {
    if (!sanitizedGraph) {
      sanitizedGraph = stripTimelineArtifacts(window.GraphManager.currentGraph);
    }
    return sanitizedGraph;
  }
};

window.cytoscape = cytoscape;
require('../js/features/node-editor/node-editor-module.js');

const cy = cytoscape({ headless: true, styleEnabled: true });
const editor = new window.NodeEditorModule({ cytoscape: cy, notifications, keyboardManager });

cy.add(fileGraph.nodes.concat(fileGraph.edges));

const node = cy.getElementById('event-1');
node.data('timestamp', '2024-02-02');

editor.synchronizeGraphData();

const hasTimelineBar = Array.isArray(lastGraphData?.nodes)
  && lastGraphData.nodes.some(entry => (entry.data || entry).type === 'timeline-bar');
if (!hasTimelineBar) {
  throw new Error('Timeline bar missing after synchronizing file-based timestamp edit.');
}

const eventRecord = storedPositions.find(record => record.id === 'event-1');
if (!eventRecord || eventRecord.lockedX === undefined) {
  throw new Error('Locked X position was not preserved for file-loaded timeline node.');
}

if (connectorSyncs === 0) {
  throw new Error('Timeline connectors were not synchronized back into graph data for file-based graph.');
}

console.log('File-loaded timeline graphs retain timeline bars and locked X positions after timestamp edits.');
