const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Setup DOM and globals
const dom = new JSDOM('<!doctype html><html><body><div id="cy"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;
// Stub canvas context to avoid WebGL errors in jsdom
window.HTMLCanvasElement.prototype.getContext = () => null;
global.requestAnimationFrame = callback => callback();

// Minimal stubs
window.UI = { showNotification: () => {} };
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

window.NodeTypes = {
  default: { color: '#ffffff', size: 30, shape: 'round-rectangle', icon: '' },
  iconType: { color: '#ffffff', size: 30, shape: 'round-rectangle', icon: 'star' }
};
window.IconConfigs = { star: 'star.png' };
window.LayoutManager = { applyCurrentLayout: () => {} };

// Build graph with 501 nodes for label visibility regression
const largeGraphNodes = [];
for (let i = 0; i < 501; i++) {
  largeGraphNodes.push({ id: `n${i}`, label: `Node ${i}`, type: 'default', color: '#ffffff', size: 30 });
}
const largeGraph = { nodes: largeGraphNodes, edges: [] };

// Build icon-rich graph to validate icon hiding behaviour
const iconGraphNodes = [];
for (let i = 0; i < 25; i++) {
  iconGraphNodes.push({
    id: `icon${i}`,
    label: `Icon Node ${i}`,
    type: 'iconType',
    color: '#ffffff',
    size: 30,
    icon: 'star'
  });
}
const iconGraph = { nodes: iconGraphNodes, edges: [] };

let currentGraph = largeGraph;
window.DataManager = {
  getGraphData: () => currentGraph,
  setGraphData: data => {
    currentGraph = data;
  }
};

global.cytoscape = opts => cytoscape({ ...opts, headless: true, styleEnabled: true });

require('../js/graph.js');
const GR = window.GraphRenderer;
GR.initializeCytoscape();

async function assertLabelsHiddenForLargeGraphs() {
  GR.renderGraph();
  GR.updateLabelVisibility();
  await wait(500);


  if (!GR.labelsHidden) {
    throw new Error('Labels should be hidden for graphs with more than 500 nodes');
  }

  console.log('Labels hidden for graphs with more than 500 nodes');
}

async function assertIconsHiddenAtLowLOD() {
  currentGraph = iconGraph;
  window.LODSystem.config.enabled = true;

  const originalDetermineLODLevel = GR.determineLODLevel;
  const originalGetLODConfig = GR.getLODConfig;

  GR.determineLODLevel = () => 'test-low';
  GR.getLODConfig = () => ({
    nodeSampling: 1,
    samplingStrategy: 'none',
    edgeFiltering: 'none',
    hideLabels: false,
    hideIcons: true,
    simplifyEdges: false,
    reduceOpacity: 1,
    hideEdges: false,
    edgeSampling: 1
  });

  GR.renderGraph();
  await wait(500);

  const nodes = GR.cy.nodes();
  if (nodes.length === 0) {
    throw new Error('Expected nodes to render in icon-hiding scenario');
  }

  nodes.forEach(node => {
    const styleBackground = node.style('background-image');
    const dataBackground = node.data('backgroundImage');
    if (styleBackground && styleBackground !== 'none') {
      throw new Error(`Expected node background-image style to be none, received ${styleBackground}`);
    }
    if (dataBackground && dataBackground !== 'none') {
      throw new Error(`Expected node backgroundImage data to be none, received ${dataBackground}`);
    }
  });

  console.log('Icons hidden for low LOD configuration');

  GR.determineLODLevel = originalDetermineLODLevel;
  GR.getLODConfig = originalGetLODConfig;
}

(async () => {
  try {
    await assertLabelsHiddenForLargeGraphs();
    await assertIconsHiddenAtLowLOD();
    console.log('LOD regression checks completed successfully');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
