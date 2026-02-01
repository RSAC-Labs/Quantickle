const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body><div id="cy"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

// Minimal stubs
window.UI = { showNotification: () => {} };
window.DomainLoader = { autoLoadDomainsForGraph: async () => [] };
window.TableManager = { updateTables: () => {}, updateTotalDataTable: () => {} };
window.LayoutManager = { applyCurrentLayout: () => {}, currentLayout: 'preset', updateLayoutDropdown: () => {}, handleDragEvent: () => {} };
window.GraphAreaEditor = { applySettings: () => {} };
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
  text: { fontFamily: 'Arial', fontSize: 14, fontColor: '#333333', bold: false, italic: false }
};
window.IconConfigs = {};

global.cytoscape = opts => cytoscape({ ...opts, headless: true, styleEnabled: true });

require('../js/graph.js');
require('../js/features/file-manager/file-manager-module.js');

window.GraphRenderer.initializeCytoscape();
const cy = window.GraphRenderer.cy;
cy.boxSelectionEnabled(true);

const fileManager = new window.FileManagerModule({
  cytoscape: cy,
  notifications: { show: () => {} },
  papaParseLib: null,
});
window.FileManager = fileManager;

// Add nodes
const container = cy.add({ data: { id: 'c1', type: 'container', width: 100, height: 50, label: 'C' }, classes: 'container', position: { x: 0, y: 0 } });
const textNode = cy.add({ data: { id: 't1', type: 'text', width: 60, height: 30, label: 'Text', fontFamily: 'Arial', fontSize: 14, fontColor: '#333333', color: 'rgba(0,0,0,0)' }, position: { x: 200, y: 0 } });
const container2 = cy.add({ data: { id: 'c2', type: 'container', size: 80, label: 'C2' }, classes: 'container', position: { x: 0, y: 200 } });
const textNode2 = cy.add({ data: { id: 't2', type: 'text', size: 40, label: 'T2', fontFamily: 'Arial', fontSize: 14, fontColor: '#333333', color: 'rgba(0,0,0,0)' }, position: { x: 200, y: 200 } });
const imageNode = cy.add({
  data: {
    id: 'img1',
    type: 'image',
    width: 120,
    height: 80,
    label: 'Image',
    backgroundColor: '#ffffff',
    borderColor: '#999999',
    borderWidth: 1
  },
  position: { x: 400, y: 0 }
});
cy.style().update();

const captureNodePayload = node => ({
  data: { ...node.data() },
  position: { ...node.position() }
});

const buildGraphManagerNodes = () => cy.nodes().map(node => captureNodePayload(node));
const buildDataManagerNodes = () => cy.nodes().map(node => ({ ...node.data(), x: node.position('x'), y: node.position('y') }));

window.GraphManager = {
  currentGraph: { nodes: buildGraphManagerNodes(), edges: [] },
  getCurrentGraphData() {
    return this.currentGraph;
  },
  updateGraphUI: () => {}
};

let storedGraphData = { nodes: buildDataManagerNodes(), edges: [] };
window.DataManager = {
  currentGraphName: 'Unsaved graph',
  currentGraphFileName: 'Unsaved graph.qut',
  unsavedChanges: false,
  getGraphData: () => JSON.parse(JSON.stringify(storedGraphData)),
  setGraphData: data => {
    storedGraphData = JSON.parse(JSON.stringify(data));
  },
  setGraphName: () => {}
};

// Hover near edge with Shift to disable box selection
const hoverBb = container.boundingBox();
container.emit({
  type: 'mousemove',
  position: { x: hoverBb.x2, y: hoverBb.y2 },
  originalEvent: { shiftKey: true }
});
if (cy.boxSelectionEnabled()) {
  throw new Error('Box selection not disabled on edge hover');
}

// Attempt box selection while hovering edge - selection box should stay hidden
cy.emit({
  type: 'mousedown',
  target: cy,
  position: { x: 0, y: 0 },
  originalEvent: { shiftKey: true, clientX: 0, clientY: 0, preventDefault: () => {}, stopPropagation: () => {} }
});
cy.emit({
  type: 'mousemove',
  target: cy,
  position: { x: 10, y: 10 },
  originalEvent: { clientX: 10, clientY: 10, preventDefault: () => {}, stopPropagation: () => {} }
});
const selBox = document.getElementById('selection-box');
if (selBox && selBox.style.display !== 'none') {
  throw new Error('Selection box displayed during edge hover');
}
cy.emit({
  type: 'mouseup',
  target: cy,
  position: { x: 10, y: 10 },
  originalEvent: { clientX: 10, clientY: 10, preventDefault: () => {}, stopPropagation: () => {} }
});
document.dispatchEvent(new window.MouseEvent('mouseup'));

// Move away from edge to restore
container.emit({
  type: 'mousemove',
  position: { x: hoverBb.x2 + 20, y: hoverBb.y2 + 20 },
  originalEvent: { shiftKey: false }
});
if (!cy.boxSelectionEnabled()) {
  throw new Error('Box selection not restored after hover');
}


// Resize container node
const cPos = { ...container.position() };
const cbb = container.boundingBox();
// Hover over edge to enable resize state detection
container.emit({
  type: 'mousemove',
  position: { x: cbb.x2, y: cbb.y2 },
  originalEvent: { shiftKey: true }
});
container.emit({
  type: 'mousedown',
  position: { x: cbb.x2, y: cbb.y2 },
  originalEvent: { shiftKey: true, clientX: 0, clientY: 0, preventDefault: () => {}, stopPropagation: () => {} }
});
if (cy.boxSelectionEnabled()) {
  throw new Error('Box selection not disabled during resize');
}
document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 20, clientY: 10 }));
document.dispatchEvent(new window.MouseEvent('mouseup'));
if (!cy.boxSelectionEnabled()) {
  throw new Error('Box selection not restored after resize');
}
if (container.data('width') !== 120 || container.data('height') !== 60 || container.data('size') !== 120 ||
    container.position().x !== cPos.x || container.position().y !== cPos.y) {
  throw new Error('Container resize failed');
}

// Resize text node
const tPos = { ...textNode.position() };
const tbb = textNode.boundingBox();
textNode.emit({
  type: 'mousemove',
  position: { x: tbb.x2, y: tbb.y2 },
  originalEvent: { shiftKey: true }
});
textNode.emit({
  type: 'mousedown',
  position: { x: tbb.x2, y: tbb.y2 },
  originalEvent: { shiftKey: true, clientX: 0, clientY: 0, preventDefault: () => {}, stopPropagation: () => {} }
});
document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 10, clientY: 15 }));
document.dispatchEvent(new window.MouseEvent('mouseup'));
if (textNode.data('width') !== 70 || textNode.data('height') !== 45 || textNode.data('size') !== 70 ||
    textNode.position().x !== tPos.x || textNode.position().y !== tPos.y) {
  throw new Error('Text node resize failed');
}

// Resize image node without modifiers
const iPos = { ...imageNode.position() };
const ibb = imageNode.boundingBox();
imageNode.emit({
  type: 'mousemove',
  position: { x: ibb.x2, y: ibb.y2 },
  originalEvent: { shiftKey: false }
});
imageNode.emit({
  type: 'mousedown',
  position: { x: ibb.x2, y: ibb.y2 },
  originalEvent: { shiftKey: false, clientX: 0, clientY: 0, preventDefault: () => {}, stopPropagation: () => {} }
});
document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 25, clientY: 15 }));
document.dispatchEvent(new window.MouseEvent('mouseup'));
if (imageNode.data('width') !== 145 || imageNode.data('height') !== 95 || imageNode.data('size') !== 145 ||
    imageNode.position().x !== iPos.x || imageNode.position().y !== iPos.y) {
  throw new Error('Image node resize failed');
}
imageNode.removeStyle();
cy.style().update();
const restoredImageBox = imageNode.boundingBox();
if (Math.abs(restoredImageBox.w - 145) > 0.1 || Math.abs(restoredImageBox.h - 95) > 0.1) {
  throw new Error('Image node dimensions not persisted after style reset');
}

const gmImageData = window.GraphManager.currentGraph.nodes.find(n => n.data.id === 'img1').data;
if (gmImageData.width !== 145 || gmImageData.height !== 95) {
  throw new Error('GraphManager node dimensions not updated after resize');
}

const dmGraphAfterResize = window.DataManager.getGraphData();
const dmImageData = dmGraphAfterResize.nodes.find(n => n.id === 'img1');
if (!dmImageData || dmImageData.width !== 145 || dmImageData.height !== 95) {
  throw new Error('DataManager node dimensions not updated after resize');
}

const dmTextData = dmGraphAfterResize.nodes.find(n => n.id === 't1');
if (!dmTextData || dmTextData.width !== 70 || dmTextData.height !== 45 ||
    dmTextData.textWidthMode !== 'fixed' || dmTextData.textHeightMode !== 'fixed') {
  throw new Error('Text node dimension metadata not persisted to DataManager');
}

const exportedGraph = window.FileManager.exportCurrentGraph();
const exportedImageNode = exportedGraph.nodes.find(n => n.id === 'img1');
if (!exportedImageNode || exportedImageNode.width !== 145 || exportedImageNode.height !== 95) {
  throw new Error('File export did not capture explicit image dimensions');
}
const exportedTextNode = exportedGraph.nodes.find(n => n.id === 't1');
if (!exportedTextNode || exportedTextNode.width !== 70 || exportedTextNode.height !== 45) {
  throw new Error('File export did not capture explicit text dimensions');
}

// Simulate a full render cycle to ensure explicit dimensions survive reloads
window.GraphRenderer.renderGraph();
const reloadedCy = window.GraphRenderer.cy;
const reloadedContainer = reloadedCy.getElementById('c1');
const reloadedText = reloadedCy.getElementById('t1');
const reloadedImage = reloadedCy.getElementById('img1');

const reloadedContainerBox = reloadedContainer.boundingBox();
if (Math.abs(reloadedContainerBox.w - 120) > 0.1 || Math.abs(reloadedContainerBox.h - 60) > 0.1) {
  throw new Error('Container dimensions lost after graph reload');
}

const reloadedTextBox = reloadedText.boundingBox();
if (Math.abs(reloadedTextBox.w - 70) > 0.1 || Math.abs(reloadedTextBox.h - 45) > 0.1) {
  throw new Error('Text node dimensions lost after graph reload');
}

const reloadedImageBox = reloadedImage.boundingBox();
if (Math.abs(reloadedImageBox.w - 145) > 0.1 || Math.abs(reloadedImageBox.h - 95) > 0.1) {
  throw new Error('Image node dimensions lost after graph reload');
}

window.FileManager.applyGraphData(JSON.parse(JSON.stringify(exportedGraph)));
const fileReloadCy = window.GraphRenderer.cy;
const fileReloadImage = fileReloadCy.getElementById('img1');
const fileReloadText = fileReloadCy.getElementById('t1');
const fileReloadImageBox = fileReloadImage.boundingBox();
if (Math.abs(fileReloadImageBox.w - 145) > 0.1 || Math.abs(fileReloadImageBox.h - 95) > 0.1) {
  throw new Error('Image node dimensions lost after file reload');
}
const fileReloadTextBox = fileReloadText.boundingBox();
if (Math.abs(fileReloadTextBox.w - 70) > 0.1 || Math.abs(fileReloadTextBox.h - 45) > 0.1) {
  throw new Error('Text node dimensions lost after file reload');
}

// Resize container without explicit dimensions
const c2Pos = { ...container2.position() };
const cbb2 = container2.boundingBox();
container2.emit({
  type: 'mousemove',
  position: { x: cbb2.x2, y: cbb2.y2 },
  originalEvent: { shiftKey: true }
});
cy.emit({

  type: 'mousedown',
  target: cy,
  position: { x: cbb2.x2, y: cbb2.y2 },
  originalEvent: { shiftKey: true, clientX: 0, clientY: 0, preventDefault: () => {}, stopPropagation: () => {} }
});
document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 30, clientY: 20 }));
document.dispatchEvent(new window.MouseEvent('mouseup'));
if (container2.data('width') <= 80 || container2.data('height') <= 80 ||
    container2.position().x !== c2Pos.x || container2.position().y !== c2Pos.y) {
  throw new Error('Container without dimensions failed to resize');
}

// Resize text node without explicit dimensions
const t2Pos = { ...textNode2.position() };
const tbb2 = textNode2.boundingBox();
textNode2.emit({
  type: 'mousemove',
  position: { x: tbb2.x2, y: tbb2.y2 },
  originalEvent: { shiftKey: true }
});
cy.emit({
  type: 'mousedown',
  target: cy,
  position: { x: tbb2.x2, y: tbb2.y2 },
  originalEvent: { shiftKey: true, clientX: 0, clientY: 0, preventDefault: () => {}, stopPropagation: () => {} }
});
document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 20, clientY: 25 }));
document.dispatchEvent(new window.MouseEvent('mouseup'));
if (textNode2.data('width') <= 40 || textNode2.data('height') <= 40 ||
    textNode2.position().x !== t2Pos.x || textNode2.position().y !== t2Pos.y) {
  throw new Error('Text node without dimensions failed to resize');
}

console.log('Resizable nodes work as expected');
process.exit(0);
