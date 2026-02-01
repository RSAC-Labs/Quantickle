const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="cy" style="width:800px;height:600px"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;

const notifications = { show: () => {} };

window.GraphEditorAdapter = { addContainer: () => null };
window.GraphRenderer = { arrangeContainerNodes: () => {}, updateContainerBounds: () => {} };

window.LayoutManager = {
  applyTimeColorOverlay: () => {},
  clearTimeColorOverlay: () => {},
  calculateOptimalSizing: () => ({}),
  updateNodeStyles: () => {}
};

require('../js/features/context-menu/context-menu-module.js');
const ContextMenuModule = window.ContextMenuModule;

require('../js/features/graph-area-editor/graph-area-editor-module.js');
const GraphAreaEditorModule = window.GraphAreaEditorModule;

const cy = cytoscape({ headless: true, styleEnabled: true });

const menu = new ContextMenuModule({
  cytoscape: cy,
  notifications,
  graphOperations: {
    groupNode: (nodeId, containerId) => {
      const node = cy.getElementById(nodeId);
      const container = cy.getElementById(containerId);
      if (node && container) {
        const oldParent = node.parent();
        node.move({ parent: container.id() });
        if (oldParent && oldParent.length && oldParent.children().length === 0) {
          oldParent.remove();
        }
      }
    },
    ungroupNode: (nodeId) => {
      const node = cy.getElementById(nodeId);
      if (!node) return;
      const parent = node.parent();
      if (parent && parent.length) {
        const grandParent = parent.parent();
        node.move({ parent: grandParent.length ? grandParent.id() : null });
        if (parent.children().length === 0) parent.remove();
      }
    },
    removeContainer: (containerId) => {
      const container = cy.getElementById(containerId);
      if (!container) return;
      const parent = container.parent();
      const targetParent = parent && parent.length ? parent.id() : null;
      container.children().forEach(child => child.move({ parent: targetParent }));
      container.remove();
    }
  },
  dataManager: {},
  nodeEditor: {}
});

const graphAreaEditor = new GraphAreaEditorModule({ cytoscape: cy, notifications });

let generatedContainerCount = 0;
window.GraphEditorAdapter.addContainer = (x, y, options = {}) => {
  const id = options.id || `generated_container_${++generatedContainerCount}`;
  const data = {
    id,
    type: 'container',
    isContainer: true
  };
  if (options.width !== undefined) data.width = options.width;
  if (options.height !== undefined) data.height = options.height;

  return cy.add({
    group: 'nodes',
    data,
    position: { x: x || 0, y: y || 0 },
    classes: 'container'
  });
};

// Test 1: grouping nodes with a container
cy.add([
  { data: { id: 'c1' }, classes: 'container' },
  { data: { id: 'n1' } }
]);
menu.groupNodes(cy.nodes());
if (cy.getElementById('n1').parent().id() !== 'c1') {
  throw new Error('Node not grouped into container');
}

// Test 2: grouping two containers
cy.elements().remove();
cy.add([
  { data: { id: 'c1' }, classes: 'container' },
  { data: { id: 'c2' }, classes: 'container' }
]);
menu.groupNodes(cy.nodes());
if (cy.getElementById('c2').parent().id() !== 'c1') {
  throw new Error('Container not grouped under first container');
}

// Test 3: ungrouping node retains outer container
cy.elements().remove();
cy.add([
  { data: { id: 'outer' }, classes: 'container' },
  { data: { id: 'inner', parent: 'outer' }, classes: 'container' },
  { data: { id: 'n1', parent: 'inner' } }
]);
menu.ungroupNodes([cy.getElementById('n1')]);
if (cy.getElementById('n1').parent().id() !== 'outer') {
  throw new Error('Node not moved to outer container');
}
if (cy.$('#inner').length) {
  throw new Error('Empty container not removed');
}

// Test 4: ungrouping container retains its content
cy.elements().remove();
cy.add([
  { data: { id: 'outer' }, classes: 'container' },
  { data: { id: 'inner', parent: 'outer' }, classes: 'container' },
  { data: { id: 'n1', parent: 'inner' } }
]);
menu.ungroupNodes([cy.getElementById('inner')]);
if (cy.getElementById('inner').parent().length) {
  throw new Error('Container did not escape parent');
}
if (cy.getElementById('n1').parent().id() !== 'inner') {
  throw new Error('Container lost its content');
}

// Test 5: moving node between containers removes empty source container
cy.elements().remove();
cy.add([
  { data: { id: 'c1' }, classes: 'container' },
  { data: { id: 'c2' }, classes: 'container' },
  { data: { id: 'n1', parent: 'c1' } }
]);
menu.groupNode(cy.getElementById('n1'), 'c2');
if (cy.getElementById('n1').parent().id() !== 'c2') {
  throw new Error('Node not moved to new container');
}
if (cy.$('#c1').length) {
  throw new Error('Empty source container not removed');
}

// Test 6: wrapping a populated container preserves its contents
cy.elements().remove();
cy.add([
  { data: { id: 'inner' }, classes: 'container' },
  { data: { id: 'child', parent: 'inner' } },
  { data: { id: 'wrapper' }, classes: 'container' }
]);
menu.groupNodes(cy.$('#inner, #wrapper, #child'));
if (cy.getElementById('inner').parent().id() !== 'wrapper') {
  throw new Error('Inner container not wrapped by outer container');
}
if (cy.getElementById('child').parent().id() !== 'inner') {
  throw new Error('Inner container lost its child when wrapped');
}

// Test 7: removing a container extracts its nodes
cy.elements().remove();
cy.add([
  { data: { id: 'outer' }, classes: 'container' },
  { data: { id: 'c1', parent: 'outer' }, classes: 'container' },
  { data: { id: 'n1', parent: 'c1' } },
  { data: { id: 'n2', parent: 'c1' } }
]);
menu.removeContainer(cy.getElementById('c1'));
if (cy.$('#c1').length) {
  throw new Error('Container not removed');
}
if (cy.getElementById('n1').parent().id() !== 'outer' ||
    cy.getElementById('n2').parent().id() !== 'outer') {
  throw new Error('Child nodes not moved to outer container');
}

console.log('Container group/ungroup operations work as expected');

// Regression Test 8: containers snap to grid when snap-to-grid is applied
cy.elements().remove();

const gridSize = 100;
const container = window.GraphEditorAdapter.addContainer(175, 235, {
  id: 'snap_container',
  width: 240,
  height: 180
});

container.style({ width: 240, height: 180 });

cy.add([
  { data: { id: 'child1', parent: 'snap_container' }, position: { x: 200, y: 260 } },
  { data: { id: 'child2', parent: 'snap_container' }, position: { x: 220, y: 290 } }
]);

const beforePos = container.position();
const beforeLeft = beforePos.x - container.width() / 2;
const beforeTop = beforePos.y - container.height() / 2;

if (Math.abs(beforeLeft / gridSize - Math.round(beforeLeft / gridSize)) < 1e-6 &&
    Math.abs(beforeTop / gridSize - Math.round(beforeTop / gridSize)) < 1e-6) {
  throw new Error('Precondition failed: container already aligned to grid');
}

graphAreaEditor.applySettings({ snapToGrid: true, gridSize });

const afterPos = container.position();
const afterLeft = afterPos.x - container.width() / 2;
const afterTop = afterPos.y - container.height() / 2;

const leftDelta = Math.abs(afterLeft - Math.round(afterLeft / gridSize) * gridSize);
const topDelta = Math.abs(afterTop - Math.round(afterTop / gridSize) * gridSize);

if (leftDelta > 1e-3 || topDelta > 1e-3) {
  throw new Error('Container did not snap to grid');
}

console.log('Container snap-to-grid aligns containers to grid');
process.exit(0);
