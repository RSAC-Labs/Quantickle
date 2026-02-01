const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');
const fs = require('fs');
const path = require('path');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;
global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

const graphScript = fs.readFileSync(path.join(__dirname, '..', 'js', 'graph.js'), 'utf8');
window.eval(graphScript);

const fileManagerScript = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js'),
  'utf8'
);
window.eval(fileManagerScript);

const cy = cytoscape({ headless: true, styleEnabled: true });
window.GraphRenderer.cy = cy;
window.GraphRenderer.setupContainerLocking();

const fm = new window.FileManagerModule({
  cytoscape: cy,
  notifications: { show: () => {} },
  papaParseLib: {}
});

const container = cy.add({
  group: 'nodes',
  data: { id: 'container', label: 'Container' },
  classes: 'container',
  position: { x: 0, y: 0 }
});

const descendant = cy.add({
  group: 'nodes',
  data: { id: 'descendant', label: 'Descendant', parent: 'container' },
  position: { x: 75, y: 0 }
});

const pinnedDescendant = cy.add({
  group: 'nodes',
  data: { id: 'pinned-descendant', label: 'Pinned Descendant', parent: 'container', pinned: true },
  position: { x: 150, y: 0 }
});
pinnedDescendant.lock();

container.data('pinned', true);
container.lock();

if (!descendant.locked()) {
  throw new Error('Container descendants should lock when the container is pinned');
}

const exported = fm.exportCurrentGraph();

const exportedDescendant = exported.nodes.find(n => n.id === 'descendant');
if (!exportedDescendant) {
  throw new Error('Unpinned descendant missing from export');
}
if (exportedDescendant.locked) {
  throw new Error('Lock state for container-locked descendant should not persist in exports');
}

const exportedPinned = exported.nodes.find(n => n.id === 'pinned-descendant');
if (!exportedPinned) {
  throw new Error('Pinned descendant missing from export');
}
if (!exportedPinned.locked) {
  throw new Error('Explicitly pinned descendants should remain locked in exports');
}
if (exportedPinned.pinned !== true) {
  throw new Error('Pinned descendant should preserve pinned flag in exports');
}

cy.elements().remove();
exported.nodes.forEach(nodeData => {
  cy.add({
    group: 'nodes',
    data: nodeData,
    position: { x: nodeData.x, y: nodeData.y }
  });
});
window.GraphRenderer.normalizeAllNodeData();

const reloadedDescendant = cy.getElementById('descendant');
if (reloadedDescendant.data('pinned') === true) {
  throw new Error('Unpinned container descendants should not reload as pinned');
}
if (!reloadedDescendant.locked()) {
  throw new Error('Container should still lock its descendants after reload');
}

const reloadedPinned = cy.getElementById('pinned-descendant');
if (reloadedPinned.data('pinned') !== true) {
  throw new Error('Pinned descendant should remain pinned after reload');
}

const reloadedContainer = cy.getElementById('container');
reloadedContainer.data('pinned', false);
reloadedContainer.unlock();

if (reloadedDescendant.data('pinned') === true) {
  throw new Error('Descendant nodes should be unpinned when their container is unpinned');
}
if (reloadedDescendant.locked()) {
  throw new Error('Descendant nodes should unlock when their container is unpinned');
}

if (reloadedPinned.data('pinned') === true) {
  throw new Error('Explicitly pinned descendants should be unpinned when their container is unpinned');
}
if (reloadedPinned.locked()) {
  throw new Error('Explicitly pinned descendants should unlock when their container is unpinned');
}

console.log('file-manager-pinned-container-children.test.cjs passed');
