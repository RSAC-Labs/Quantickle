const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body><div id="cy-wrapper"><div id="cy"></div></div></body></html>', { pretendToBeVisual: true });
const { window } = dom;

global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

global.cytoscape = opts => cytoscape({ ...opts, headless: true, styleEnabled: true });

window.UI = { showNotification: () => {} };
window.DomainLoader = { autoLoadDomainsForGraph: async () => [] };
window.TableManager = { updateTables: () => {}, updateTotalDataTable: () => {}, updateNodesDataTable: () => {} };

let layoutApplyCurrentCalls = 0;
let layoutApplyCalls = 0;
let layoutFitCalls = 0;
let layoutSelectCalls = 0;
let layoutSelectArgs = [];
let adapterFitCalls = 0;
let adapterContextNodes = 0;
let adapterApplyCalls = 0;
let adapterSelectCalls = 0;
let adapterSelectArgs = [];
let windowSelectCalls = 0;
let windowSelectArgs = [];

const resetCounters = () => {
  layoutApplyCurrentCalls = 0;
  layoutApplyCalls = 0;
  layoutFitCalls = 0;
  layoutSelectCalls = 0;
  layoutSelectArgs = [];
  adapterFitCalls = 0;
  adapterContextNodes = 0;
  adapterApplyCalls = 0;
  adapterSelectCalls = 0;
  adapterSelectArgs = [];
  windowSelectCalls = 0;
  windowSelectArgs = [];
};

window.LayoutManager = {
  applyCurrentLayout: () => { layoutApplyCurrentCalls += 1; },
  applyLayout: layoutName => {
    layoutApplyCalls += 1;
    window.LayoutManager.currentLayout = layoutName || window.LayoutManager.currentLayout;
  },
  currentLayout: 'timeline',
  selectLayout: layoutName => {
    layoutSelectCalls += 1;
    layoutSelectArgs.push(layoutName);
    window.LayoutManager.currentLayout = layoutName || window.LayoutManager.currentLayout;
    window.LayoutManager.applyLayout();
  },
  updateLayoutDropdown: () => {},
  handleDragEvent: () => {},
  fitToCurrentLayout: () => { layoutFitCalls += 1; return true; }
};

window.LayoutManagerAdapter = {
  getCurrentLayout: () => 'timeline',
  applyLayout: () => { adapterApplyCalls += 1; },
  fitToCurrentLayout: (context = {}) => {
    adapterFitCalls += 1;
    const { nodes } = context || {};
    if (Array.isArray(nodes)) {
      adapterContextNodes = nodes.length;
    } else if (nodes && typeof nodes.forEach === 'function') {
      let count = 0;
      nodes.forEach(() => { count += 1; });
      adapterContextNodes = count;
    } else if (nodes && typeof nodes.length === 'number') {
      adapterContextNodes = nodes.length;
    }
    return true;
  },
  selectLayout: layoutName => {
    adapterSelectCalls += 1;
    adapterSelectArgs.push(layoutName);
    if (window.LayoutManager && typeof window.LayoutManager.selectLayout === 'function') {
      window.LayoutManager.selectLayout(layoutName);
    }
  }
};

window.selectLayout = layoutName => {
  windowSelectCalls += 1;
  windowSelectArgs.push(layoutName);
  if (window.LayoutManager && typeof window.LayoutManager.selectLayout === 'function') {
    window.LayoutManager.selectLayout(layoutName);
  }
};

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
window.Validation = { validators: { validateNode: () => ({ valid: true, errors: [] }), validateEdge: () => ({ valid: true, errors: [] }) } };
window.NodeTypes = {
  default: { color: '#ffffff', size: 30, shape: 'round-rectangle', icon: '' },
  text: {
    color: 'rgba(0,0,0,0)',
    shape: 'round-rectangle',
    fontFamily: 'Arial',
    fontSize: 14,
    fontColor: '#333333',
    bold: false,
    italic: false,
    borderColor: '#000000',
    borderWidth: 1
  }
};
window.IconConfigs = {};
window.DOMPurify = { sanitize: value => value };
global.DOMPurify = window.DOMPurify;

const container = document.getElementById('cy');
const wrapper = document.getElementById('cy-wrapper');
Object.defineProperty(container, 'clientWidth', { value: 800 });
Object.defineProperty(container, 'clientHeight', { value: 600 });
Object.defineProperty(wrapper, 'getBoundingClientRect', {
  value: () => ({ left: 0, top: 0, width: 800, height: 600 })
});
Object.defineProperty(container, 'getBoundingClientRect', {
  value: () => ({ left: 0, top: 0, width: 800, height: 600 })
});

const calloutHost = document.createElement('div');
document.body.appendChild(calloutHost);
window.TextCallout = { init: () => {}, refresh: () => {} };

global.wrapSummaryHtml = ({ title, body }) => `<div>${title}</div><p>${body}</p>`;

require('../js/graph.js');
require('../js/features/node-editor/node-editor-module.js');

const notifications = { show: () => {} };
const keyboardManager = { disable: () => {}, enable: () => {} };
const cy = cytoscape();
cy.container = () => container;
const editor = new window.NodeEditorModule({ cytoscape: cy, notifications, keyboardManager });

cy.add({ data: { id: 'n1', type: 'default', label: 'Node with time', timestamp: '2020-01-01T00:00:00Z' }, position: { x: 0, y: 0 } });
const node = cy.getElementById('n1');

editor.showEditor(node);
editor.hideEditor();

if (adapterFitCalls !== 1) {
  throw new Error(`Expected adapter fit to be called once, received ${adapterFitCalls}`);
}
if (adapterContextNodes !== 1) {
  throw new Error(`Expected adapter to receive one node, received ${adapterContextNodes}`);
}
if (layoutFitCalls !== 0) {
  throw new Error(`LayoutManager.fitToCurrentLayout should not be called when adapter succeeds (saw ${layoutFitCalls})`);
}
if (layoutApplyCurrentCalls !== 0) {
  throw new Error(`applyCurrentLayout should not run when fitToCurrentLayout succeeds (saw ${layoutApplyCurrentCalls})`);
}
if (layoutApplyCalls !== 0) {
  throw new Error(`applyLayout should not run when fitToCurrentLayout succeeds (saw ${layoutApplyCalls})`);
}
if (adapterApplyCalls !== 0) {
  throw new Error(`Adapter applyLayout should not run when fitToCurrentLayout succeeds (saw ${adapterApplyCalls})`);
}
if (adapterSelectCalls !== 0) {
  throw new Error(`Adapter selectLayout should not run when fitToCurrentLayout succeeds (saw ${adapterSelectCalls})`);
}
if (layoutSelectCalls !== 0) {
  throw new Error(`LayoutManager.selectLayout should not run when fitToCurrentLayout succeeds (saw ${layoutSelectCalls})`);
}
if (windowSelectCalls !== 0) {
  throw new Error(`window.selectLayout should not run when fitToCurrentLayout succeeds (saw ${windowSelectCalls})`);
}

// Reset counters for timestamp change scenario
resetCounters();

// Simulate a timestamp modification which should trigger a full re-layout
editor.showEditor(node);
node.data('timestamp', '2021-01-01T00:00:00Z');
editor.hideEditor();

if (adapterFitCalls !== 0) {
  throw new Error(`Adapter fit should not run when forcing a full timeline re-layout (received ${adapterFitCalls})`);
}
if (adapterContextNodes !== 0) {
  throw new Error(`Adapter fit context should be empty when forcing a full timeline re-layout (received ${adapterContextNodes})`);
}
if (adapterSelectCalls !== 1) {
  throw new Error(`Adapter selectLayout should run exactly once when forcing a full timeline re-layout (received ${adapterSelectCalls})`);
}
if (adapterSelectArgs[0] !== 'timeline') {
  throw new Error(`Adapter selectLayout should target the timeline layout (received ${adapterSelectArgs[0]})`);
}
if (layoutSelectCalls !== 1) {
  throw new Error(`LayoutManager.selectLayout should run exactly once when forcing a full timeline re-layout (received ${layoutSelectCalls})`);
}
if (layoutSelectArgs[0] !== 'timeline') {
  throw new Error(`LayoutManager.selectLayout should target the timeline layout (received ${layoutSelectArgs[0]})`);
}
if (layoutApplyCalls !== 1) {
  throw new Error(`LayoutManager.applyLayout should be invoked exactly once when reapplying the timeline layout (received ${layoutApplyCalls})`);
}
if (windowSelectCalls !== 0) {
  throw new Error(`window.selectLayout should not be invoked when the adapter handles selection (received ${windowSelectCalls})`);
}

// Reset counters for timestamp removal scenario
resetCounters();

// Simulate removing a timestamp entirely
editor.showEditor(node);
node.removeData('timestamp');
editor.hideEditor();

if (adapterFitCalls !== 0) {
  throw new Error('Adapter fit should not run when the node no longer has a timestamp');
}
if (layoutFitCalls !== 0) {
  throw new Error('LayoutManager.fitToCurrentLayout should not run when adapter fit is skipped');
}
if (adapterSelectCalls !== 1) {
  throw new Error(`Adapter selectLayout should run exactly once when removing a timestamp (received ${adapterSelectCalls})`);
}
if (layoutSelectCalls !== 1) {
  throw new Error(`LayoutManager.selectLayout should run exactly once when removing a timestamp (received ${layoutSelectCalls})`);
}
if (layoutApplyCalls !== 1) {
  throw new Error(`LayoutManager.applyLayout should be invoked exactly once when removing a timestamp (received ${layoutApplyCalls})`);
}
