const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');
const fs = require('fs');
const path = require('path');

// Setup DOM and globals
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;
global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

// Load core scripts
const graphScript = fs.readFileSync(path.join(__dirname, '..', 'js', 'graph.js'), 'utf8');
window.eval(graphScript);

// Load FileManagerModule script
const fmScript = fs.readFileSync(path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js'), 'utf8');
window.eval(fmScript);

// Create Cytoscape instance and set on GraphRenderer
const cy = cytoscape({ headless: true, styleEnabled: true });
window.GraphRenderer.cy = cy;

// Create FileManagerModule
const fm = new window.FileManagerModule({
  cytoscape: cy,
  notifications: { show: () => {} },
  papaParseLib: {}
});

// Create graph with a pinned node and an unpinned node
const pinned = cy.add({ group: 'nodes', data: { id: 'p1', label: 'Pinned' }, position: { x: 0, y: 0 } });
pinned.lock();
pinned.style({ 'border-width': 6, 'border-color': '#1e90ff' });
cy.add({ group: 'nodes', data: { id: 'n1', label: 'Normal' }, position: { x: 100, y: 0 } });

// Export and manually reapply graph data
const data = fm.exportCurrentGraph();
cy.elements().remove();
data.nodes.forEach(n => {
  cy.add({ group: 'nodes', data: n, position: { x: n.x, y: n.y } });
});
window.GraphRenderer.normalizeAllNodeData();

const reloadedPinned = cy.getElementById('p1');
if (!reloadedPinned.locked()) {
  throw new Error('Pinned node is movable after reload');
}
if (cy.getElementById('n1').locked()) {
  throw new Error('Unpinned node should remain unlocked');
}

console.log('file-manager-pinned-node-reload.test.cjs passed');
