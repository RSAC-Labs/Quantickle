const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;

if (window.HTMLCanvasElement && window.HTMLCanvasElement.prototype) {
  window.HTMLCanvasElement.prototype.getContext = () => null;
}

global.localStorage = { getItem: () => null, setItem: () => {} };

const notifications = { show: () => {} };
const keyboardManager = { disable: () => {}, enable: () => {} };

window.LayoutManager = {
  currentLayout: 'timeline',
  getCurrentLayout() {
    return this.currentLayout;
  },
  applyLayout: () => {}
};

let rebuildCalls = 0;
window.CustomLayouts = {
  rebuildTimelineConnectors: () => { rebuildCalls += 1; }
};

window.cytoscape = cytoscape;
require('../js/features/node-editor/node-editor-module.js');

const cy = cytoscape({ headless: true, styleEnabled: true });
const editor = new window.NodeEditorModule({ cytoscape: cy, notifications, keyboardManager });

cy.add({ data: { id: 'event-1', type: 'event', timestamp: '2024-01-01' } });
const node = cy.getElementById('event-1');

editor.showEditor(node);

// Simulate timeline scaffolding missing after loading a saved graph
if (cy.nodes('[type^="timeline-"]').length !== 0 || cy.edges('[type="timeline-link"]').length !== 0) {
  throw new Error('Test setup expects no timeline scaffolding.');
}

editor.hideEditor();

if (rebuildCalls === 0) {
  throw new Error('NodeEditor did not restore timeline scaffolding when missing.');
}

console.log('NodeEditor restores missing timeline scaffolding after edits on timeline layouts.');
process.exit(0);
