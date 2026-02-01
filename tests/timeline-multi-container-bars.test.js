const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body><div id="cy"></div></body></html>');
const { window } = dom;

global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

global.localStorage = { getItem: () => null, setItem: () => {} };

window.cytoscape = cytoscape;
require('../js/custom-layouts.js');
window.CustomLayouts.registerCustomLayouts();

const cy = cytoscape({ headless: true, styleEnabled: true });
cy.extent = () => ({ x1: 0, y1: 0, x2: 1000, y2: 1000, w: 1000, h: 1000 });
cy.container = () => document.getElementById('cy');

cy.add([
  { data: { id: 'container-a', type: 'container', width: 320, height: 220 }, position: { x: -200, y: 0 } },
  { data: { id: 'container-b', type: 'container', width: 320, height: 220 }, position: { x: 200, y: 0 } },
  { data: { id: 'a1', type: 'event', timestamp: 0, parent: 'container-a' }, position: { x: -240, y: -40 } },
  { data: { id: 'a2', type: 'event', timestamp: 1000, parent: 'container-a' }, position: { x: -160, y: 40 } },
  { data: { id: 'b1', type: 'event', timestamp: 0, parent: 'container-b' }, position: { x: 160, y: -40 } },
  { data: { id: 'b2', type: 'event', timestamp: 1000, parent: 'container-b' }, position: { x: 240, y: 40 } }
]);

const applyContainerTimeline = (containerId) => {
  const container = cy.getElementById(containerId);
  if (!container || container.length === 0) {
    throw new Error(`Missing container ${containerId}`);
  }
  const width = Number(container.data('width')) || 320;
  const height = Number(container.data('height')) || 220;
  const center = container.position();
  const boundingBox = {
    x1: center.x - width / 2,
    y1: center.y - height / 2,
    w: width,
    h: height
  };
  window.CustomLayouts.timelineLayout.call(cy, {
    eles: container.children(),
    boundingBox
  });
};

applyContainerTimeline('container-a');
applyContainerTimeline('container-b');

const verifyBarForContainer = (containerId) => {
  const expectedBarId = `timeline-bar-${containerId}`;
  const bar = cy.getElementById(expectedBarId);
  if (bar.length === 0) {
    throw new Error(`Timeline bar ${expectedBarId} missing after layout.`);
  }
  const parent = bar.parent();
  if (!parent || parent.length === 0 || parent.id() !== containerId) {
    throw new Error(`Timeline bar ${expectedBarId} not assigned to container ${containerId}.`);
  }
};

verifyBarForContainer('container-a');
verifyBarForContainer('container-b');

const bars = cy.nodes('[type="timeline-bar"]');
if (bars.length !== 2) {
  throw new Error(`Expected two timeline bars for containers, found ${bars.length}.`);
}

const assertAnchorsForContainer = (containerId, nodeIds) => {
  nodeIds.forEach(nodeId => {
    const anchorId = `timeline-anchor-${nodeId}`;
    const anchor = cy.getElementById(anchorId);
    if (anchor.length === 0) {
      throw new Error(`Missing timeline anchor ${anchorId} for container ${containerId}.`);
    }
    const parent = anchor.parent();
    if (!parent || parent.length === 0 || parent.id() !== containerId) {
      throw new Error(`Timeline anchor ${anchorId} not scoped to container ${containerId}.`);
    }
  });
};

assertAnchorsForContainer('container-a', ['a1', 'a2']);
assertAnchorsForContainer('container-b', ['b1', 'b2']);

// Reapply timeline layout to one container to simulate node editor updates.
applyContainerTimeline('container-a');

verifyBarForContainer('container-a');
verifyBarForContainer('container-b');
assertAnchorsForContainer('container-a', ['a1', 'a2']);
assertAnchorsForContainer('container-b', ['b1', 'b2']);

// Reapply timeline layout to the second container and ensure both remain intact.
applyContainerTimeline('container-b');

verifyBarForContainer('container-a');
verifyBarForContainer('container-b');
assertAnchorsForContainer('container-a', ['a1', 'a2']);
assertAnchorsForContainer('container-b', ['b1', 'b2']);

console.log('Multiple container timelines maintain independent bars and anchors.');
process.exit(0);
