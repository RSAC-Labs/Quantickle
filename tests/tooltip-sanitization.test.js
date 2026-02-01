const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body><div id="cy"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

window.UI = { showNotification: () => {} };
window.DOMPurify = undefined;
const sampleGraph = {
  nodes: [
    {
      id: 'n1',
      label: 'Node 1',
      type: 'server',
      color: '#ff6b6b',
      size: 30,
      info: '<img src="x" onerror="window.__xss = true">Injected'
    }
  ],
  edges: []
};
window.DataManager = { getGraphData: () => sampleGraph, setGraphData: () => {} };
window.TableManager = { updateTables: () => {}, updateTotalDataTable: () => {} };
window.QuantickleConfig = { validation: { enabled: false } };
window.LODSystem = { init: () => {}, config: { enabled: false } };
window.GraphStyling = { applyDefaultStyles: () => {} };
window.GraphControls = { init: () => {} };
window.SelectionManager = { init: () => {} };
window.GraphEditor = { init: () => {} };
window.EdgeCreator = { init: () => {} };
window.PerformanceManager = { init: () => {} };
window.DebugTools = { init: () => {} };
window.ProgressManager = { init: () => {} };
window.BackgroundGridModule = { init: () => {} };
window.Validation = {
  validators: {
    validateNode: () => ({ valid: true, errors: [] }),
    validateEdge: () => ({ valid: true, errors: [] })
  }
};
window.NodeTypes = { default: { color: '#ffffff', size: 30, shape: 'round-rectangle', icon: '' } };
window.IconConfigs = {};
window.LayoutManager = { applyCurrentLayout: () => {} };

global.cytoscape = opts => cytoscape({ ...opts, headless: true, styleEnabled: true });

require('../js/graph.js');
const GR = window.GraphRenderer;
GR.initializeCytoscape();
GR.renderGraph();

const node = GR.cy.getElementById('n1');
node.emit('mouseover', {
  target: node,
  originalEvent: { pageX: 10, pageY: 10 }
});

const hoverInfo = document.getElementById('node-hover-info');
if (!hoverInfo) {
  throw new Error('Tooltip container not created');
}
if (hoverInfo.querySelector('[onerror]')) {
  throw new Error('Tooltip should not include inline event handlers');
}

console.log('Tooltip HTML is sanitized for inline event handlers');
process.exit(0);
