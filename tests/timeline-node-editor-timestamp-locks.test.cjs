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

const graphData = {
  nodes: [{ data: { id: 'event-1', type: 'event' } }],
  edges: [],
  metadata: { nodeCount: 1, edgeCount: 0 }
};

let connectorSyncs = 0;
let storedPositions = [];
window.GraphManager = {
  currentGraph: graphData,
  getCurrentGraphData() {
    return this.currentGraph;
  },
  syncTimelineConnectors(anchors = [], links = [], bars = []) {
    connectorSyncs += 1;
    const asEntry = payload => ({ data: payload });

    anchors.forEach(anchor => {
      this.currentGraph.nodes.push(asEntry({
        id: anchor.id,
        type: 'timeline-anchor',
        position: anchor.position,
        ...anchor.data
      }));
    });

    bars.forEach(bar => {
      this.currentGraph.nodes.push(asEntry({
        id: bar.id,
        type: 'timeline-bar',
        position: bar.position,
        ...bar.data
      }));
    });

    links.forEach(link => {
      this.currentGraph.edges.push(asEntry({
        id: link.id,
        source: link.source,
        target: link.target,
        type: 'timeline-link',
        ...link.data
      }));
    });
  },
  storeTimelineAbsolutePositions(records = []) {
    storedPositions = [...records];
    records.forEach(record => {
      let entry = this.currentGraph.nodes.find(node => (node.data || node).id === record.id);
      if (!entry) {
        entry = { data: { id: record.id } };
        this.currentGraph.nodes.push(entry);
      }
      const data = entry.data || entry;
      if (record.lockedX !== undefined) {
        data.lockedX = record.lockedX;
      }
      if (record.position) {
        data.position = { ...record.position };
      }
    });
  }
};

let lastGraphData = null;
window.DataManager = {
  setGraphData(data) {
    lastGraphData = data;
  },
  getGraphData() {
    return lastGraphData || graphData;
  }
};

window.cytoscape = cytoscape;
require('../js/features/node-editor/node-editor-module.js');

const cy = cytoscape({ headless: true, styleEnabled: true });
const editor = new window.NodeEditorModule({ cytoscape: cy, notifications, keyboardManager });

cy.add([
  { group: 'nodes', data: { id: 'event-1', type: 'event', timestamp: '2024-01-01', lockedX: 120 } },
  { group: 'nodes', data: { id: 'anchor-1', type: 'timeline-anchor' }, position: { x: 10, y: 0 } },
  { group: 'nodes', data: { id: 'bar-1', type: 'timeline-bar' }, position: { x: 0, y: 0 } },
  { group: 'edges', data: { id: 'anchor-1-event-1', source: 'anchor-1', target: 'event-1', type: 'timeline-link' } }
]);

const node = cy.getElementById('event-1');
node.data('timestamp', '2024-02-02');

editor.synchronizeGraphData();

const hasTimelineBar = Array.isArray(lastGraphData?.nodes)
  && lastGraphData.nodes.some(entry => (entry.data || entry).type === 'timeline-bar');
if (!hasTimelineBar) {
  throw new Error('Timeline bar missing after synchronizing timestamp edit.');
}

const eventRecord = storedPositions.find(record => record.id === 'event-1');
if (!eventRecord || eventRecord.lockedX === undefined) {
  throw new Error('Locked X position was not preserved for timeline-managed node.');
}

if (connectorSyncs === 0) {
  throw new Error('Timeline connectors were not synchronized back into graph data.');
}

console.log('Timeline timestamp edits preserve bars and locked X positions for loaded graphs.');
