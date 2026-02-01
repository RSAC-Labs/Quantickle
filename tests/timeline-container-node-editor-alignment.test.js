let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (error) {
  JSDOM = null;
}

const cytoscape = require('cytoscape');

const createFallbackWindow = () => {
  const elements = new Map();
  const document = {
    createElement: tag => ({
      tagName: String(tag || '').toUpperCase(),
      style: {},
      children: [],
      appendChild(child) {
        this.children.push(child);
      }
    }),
    getElementById: id => elements.get(id) || null,
    body: {
      appendChild(element) {
        if (element && element.id) {
          elements.set(element.id, element);
        }
      }
    }
  };

  const canvasProto = { getContext: () => null };
  function HTMLCanvasElement() {}
  HTMLCanvasElement.prototype = canvasProto;

  const windowObj = {
    document,
    HTMLCanvasElement
  };

  const containerElement = {
    id: 'cy',
    style: {},
    children: [],
    appendChild(child) {
      this.children.push(child);
    }
  };
  elements.set('cy', containerElement);

  return windowObj;
};

const dom = JSDOM
  ? new JSDOM('<!doctype html><html><body><div id="cy"></div></body></html>')
  : { window: createFallbackWindow() };

const { window } = dom;

global.window = window;
global.document = window.document;
if (window.HTMLCanvasElement && window.HTMLCanvasElement.prototype) {
  window.HTMLCanvasElement.prototype.getContext = () => null;
} else if (window.HTMLCanvasElement) {
  window.HTMLCanvasElement.getContext = () => null;
}

global.localStorage = { getItem: () => null, setItem: () => {} };

window.cytoscape = cytoscape;
require('../js/custom-layouts.js');
window.CustomLayouts.registerCustomLayouts();

const cy = cytoscape({ headless: true, styleEnabled: true });
cy.extent = () => ({ x1: 0, y1: 0, x2: 1000, y2: 1000, w: 1000, h: 1000 });
cy.container = () => document.getElementById('cy');

cy.add([
  { data: { id: 'container-1', type: 'container', width: 300, height: 200 }, position: { x: 200, y: 200 } },
  { data: { id: 'event-1', type: 'event', timestamp: 0, parent: 'container-1' }, position: { x: 0, y: 0 } },
  { data: { id: 'event-2', type: 'event', timestamp: 1000, parent: 'container-1' }, position: { x: 0, y: 0 } }
]);

const container = cy.getElementById('container-1');
container.data('width', 300);
container.data('height', 200);

const initialBounds = {
  x1: container.position('x') - 150,
  y1: container.position('y') - 100,
  w: 300,
  h: 200
};

window.CustomLayouts.timelineLayout.call(cy, {
  eles: container.children(),
  boundingBox: initialBounds
});

const tolerance = 1e-3;

const baselineInitial = window.CustomLayouts.getTimelineBaselineInfo(cy, 'container-1');
if (!baselineInitial) {
  throw new Error('Failed to capture initial timeline baseline for container scope.');
}

const containerBoundsInitial = container.boundingBox({ includeLabels: false, includeOverlays: false });
if (Math.abs(baselineInitial.startX - containerBoundsInitial.x1) > tolerance) {
  throw new Error('Initial baseline does not align with container bounds.');
}

const eventNodes = container.children().filter(node => {
  const type = node.data('type');
  return !(typeof type === 'string' && type.startsWith('timeline-'));
});

const moveDelta = 180;
cy.emit('grab', { target: container });
const originalPosition = container.position();
container.position({ x: originalPosition.x + moveDelta, y: originalPosition.y });
cy.emit('free', { target: container });

const movedBounds = container.boundingBox({ includeLabels: false, includeOverlays: false });
const baselineAfterMove = window.CustomLayouts.getTimelineBaselineInfo(cy, 'container-1');

if (Math.abs(baselineAfterMove.startX - movedBounds.x1) > tolerance) {
  throw new Error('Timeline baseline failed to track container movement.');
}

const positionsBeforeMoveFit = eventNodes.map(node => node.position('x'));

window.CustomLayouts.fitNodesToTimeline(cy, eventNodes);

eventNodes.forEach((node, index) => {
  const pos = node.position();
  if (!Number.isFinite(pos.x)) {
    throw new Error('Node position became invalid after container move fit.');
  }
  if (Math.abs(pos.x - positionsBeforeMoveFit[index]) > tolerance) {
    throw new Error('Node x-position changed during container move fit.');
  }
  if (pos.x < movedBounds.x1 - 1 || pos.x > movedBounds.x2 + 1) {
    throw new Error('Node position drifted outside container after move fit.');
  }
});

cy.emit('grab', { target: container });
container.data('width', 600);
cy.emit('free', { target: container });

const resizedBounds = container.boundingBox({ includeLabels: false, includeOverlays: false });
const baselineAfterResize = window.CustomLayouts.getTimelineBaselineInfo(cy, 'container-1');

if (Math.abs(baselineAfterResize.startX - resizedBounds.x1) > tolerance) {
  throw new Error('Timeline baseline start did not follow container resize.');
}

if (Math.abs(baselineAfterResize.width - resizedBounds.w) > 1) {
  throw new Error('Timeline baseline width did not expand with container resize.');
}

const positionsBeforeResizeFit = eventNodes.map(node => node.position('x'));

window.CustomLayouts.fitNodesToTimeline(cy, eventNodes);

eventNodes.forEach((node, index) => {
  const pos = node.position();
  if (Math.abs(pos.x - positionsBeforeResizeFit[index]) > tolerance) {
    throw new Error('Node x-position changed during container resize fit.');
  }
  if (pos.x < resizedBounds.x1 - 1 || pos.x > resizedBounds.x2 + 1) {
    throw new Error('Node position drifted outside container after resize fit.');
  }
});

console.log('Timeline baseline tracks container transforms for node editor operations.');
process.exit(0);
