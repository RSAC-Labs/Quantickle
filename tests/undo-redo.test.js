const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

// Setup minimal DOM environment
const dom = new JSDOM('<!doctype html><html><body><div id="cy"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

// Stub modules required by graph.js
window.UI = { showNotification: () => {} };
window.DataManager = { getGraphData: () => ({ nodes: [], edges: [] }), setGraphData: () => {} };
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

// Use headless Cytoscape to avoid canvas requirement
const cytoscapeLib = cytoscape;
global.cytoscape = (opts) => cytoscapeLib({ ...opts, headless: true, styleEnabled: true });

require('../js/graph.js');
const GR = window.GraphRenderer;
GR.initializeCytoscape();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const initialNodes = GR.cy.nodes().length;
  const node = GR.addNode(0, 0, 'Test');

  // Apply custom styling
  node.data('shape', 'triangle');
  node.style('shape', 'triangle');
  const iconUrl = 'https://example.com/icon.png';
  node.data('backgroundImage', iconUrl);
  node.style('background-image', iconUrl);
  node.style('text-halign', 'right');
  node.style('text-valign', 'top');
  node.style('color', 'rgb(255, 0, 0)');

  // Replace auto-saved state without styles and save styled state
  GR.undoStack.pop();
  GR.saveState();

  assert(GR.cy.nodes().length === initialNodes + 1, 'Node should be added with style');

  GR.undo();
  assert(GR.cy.nodes().length === initialNodes, 'Undo should remove node');

  GR.redo();
  assert(GR.cy.nodes().length === initialNodes + 1, 'Redo should restore node');

  const restored = GR.cy.getElementById(node.id());
  assert(restored.style('shape') === 'triangle', 'Shape should be preserved');
  assert(restored.style('background-image').includes('icon.png'), 'Icon should be preserved');
  assert(restored.style('background-fit') === 'contain', 'Icon scaling preserved');
  assert(restored.style('background-width') === '100%', 'Icon width preserved');
  assert(restored.style('background-height') === '100%', 'Icon height preserved');
  assert(restored.style('text-halign') === 'right', 'Label horizontal alignment preserved');
  assert(restored.style('text-valign') === 'top', 'Label vertical alignment preserved');
  assert(restored.style('color') === 'rgb(255,0,0)', 'Label color should be preserved');

  console.log('Undo/Redo functionality preserves styles');

  // Reset graph and history for movement test
  GR.cy.elements().remove();
  GR.undoStack = [];
  GR.redoStack = [];
  GR.saveState();

  // Test node movement tracking
  const moveNode = GR.addNode(0, 0, 'Move');
  GR.saveState();
  const originalPos = { ...moveNode.position() };
  GR.pauseHistory();
  moveNode.position({ x: 100, y: 50 });
  GR.resumeHistory();
  GR.saveState();

  GR.undo();
  let pos = GR.cy.getElementById(moveNode.id()).position();
  assert(pos.x === originalPos.x && pos.y === originalPos.y, 'Undo should restore node position');

  GR.redo();
  pos = GR.cy.getElementById(moveNode.id()).position();
  assert(pos.x === 100 && pos.y === 50, 'Redo should reapply node movement');

  console.log('Undo/Redo tracks node movement');

  // Reset graph and history for edge test
  GR.cy.elements().remove();
  GR.undoStack = [];
  GR.redoStack = [];
  GR.saveState();

  // Test edge addition tracking
  const a = GR.addNode(0, 0, 'A');
  const b = GR.addNode(50, 0, 'B');
  GR.undoStack.pop();
  GR.saveState(); // baseline with two nodes

  GR.pauseHistory();
  GR.cy.add({ group: 'edges', data: { id: 'e1', source: a.id(), target: b.id() } });
  GR.resumeHistory();
  GR.saveState();

  const edgeCount = GR.cy.edges().length;
  GR.undo();
  assert(GR.cy.edges().length === edgeCount - 1, 'Undo should remove edge');

  GR.redo();
  assert(GR.cy.edges().length === edgeCount, 'Redo should restore edge');

  console.log('Undo/Redo tracks edge additions');

  // Reset graph and history for viewport test
  GR.cy.elements().remove();
  GR.undoStack = [];
  GR.redoStack = [];
  GR.saveState();

  // Establish initial viewport
  GR.cy.pan({ x: 100, y: 50 });
  GR.cy.zoom(2);
  GR.saveState();

  // Add a node and save state
  const vNode = GR.addNode(0, 0, 'Viewport');
  GR.saveState();

  // Change viewport without saving to history
  GR.cy.pan({ x: 300, y: 200 });
  GR.cy.zoom(1.5);

  // Undo should remove node but keep current viewport
  GR.undo();
  assert(GR.cy.nodes().length === 0, 'Undo should remove node');
  let pan = GR.cy.pan();
  assert(pan.x === 300 && pan.y === 200, 'Undo should maintain pan');
  assert(GR.cy.zoom() === 1.5, 'Undo should maintain zoom');

  // Redo should restore node and keep viewport
  GR.redo();
  pan = GR.cy.pan();
  assert(GR.cy.nodes().length === 1, 'Redo should restore node');
  assert(pan.x === 300 && pan.y === 200, 'Redo should maintain pan');
  assert(GR.cy.zoom() === 1.5, 'Redo should maintain zoom');

  console.log('Undo/Redo preserves viewport');

  GR.cy.destroy();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
