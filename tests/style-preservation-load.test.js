const { JSDOM } = require('jsdom');

// Setup minimal DOM
const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

// Load DataManager module
require('../js/features/data-manager/data-manager-module.js');
const dm = new window.DataManagerModule({ cytoscape: null, notifications: { show: () => {} }, config: {} });

// Graph data where style holds properties
const graph = {
  nodes: [
    { data: { id: 'n1' }, style: { 'background-opacity': 0.5 } }
  ],
  edges: [
    { data: { id: 'e1', source: 'n1', target: 'n1' }, style: { 'line-color': '#00ff00' } }
  ]
};

dm.setGraphData(graph);
const processed = dm.getGraphData();

if (processed.nodes[0].iconOpacity !== 0.5) {
  throw new Error('Icon opacity not preserved');
}
if (processed.edges[0].color !== '#00ff00') {
  throw new Error('Edge color not preserved');
}

console.log('DataManager preserves icon opacity and edge color');
process.exit(0);
