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

cy.add({ data: { id: 'n1', type: 'entity', label: 'Node 1', timestamp: 0 }, position: { x: 50, y: 75 } });

window.GraphManager.currentGraph = {
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Timeline Test',
  description: 'Graph with timeline layout',
  nodes: [{ data: { id: 'n1', type: 'entity', label: 'Node 1' } }],
  edges: [],
  metadata: { source: 'Manually added', title: 'Timeline Test' }
};

window.CustomLayouts.timelineLayout.call(cy, {});

const graphData = window.GraphManager.getCurrentGraphData();
const findById = (collection, id) => collection.find(item => {
  const data = item && (item.data || item);
  return data && data.id === id;
});

const anchor = findById(graphData.nodes, 'timeline-anchor-n1');
if (!anchor) {
  throw new Error('Timeline anchor node was not registered in GraphManager');
}

const link = findById(graphData.edges, 'timeline-link-n1');
if (!link) {
  throw new Error('Timeline link edge was not registered in GraphManager');
}

const linkData = link.data || link;
if (linkData.source !== 'timeline-anchor-n1' || linkData.target !== 'n1') {
  throw new Error('Timeline link edge has incorrect endpoints in GraphManager');
}

console.log('Timeline connectors synchronized with GraphManager data');
process.exit(0);
