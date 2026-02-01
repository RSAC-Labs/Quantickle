const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body><div id="cy"></div></body></html>', { pretendToBeVisual: true });
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
cy.extent = () => ({ x1: 0, y1: 0, x2: 800, y2: 600, w: 800, h: 600 });
cy.container = () => document.getElementById('cy');

cy.add([
  { data: { id: 'container-1', type: 'container', width: 400, height: 200 }, position: { x: 300, y: 200 } },
  { data: { id: 'event-1', type: 'event', timestamp: 0, parent: 'container-1' }, position: { x: 0, y: 0 } },
  { data: { id: 'event-2', type: 'event', timestamp: 1000, parent: 'container-1' }, position: { x: 0, y: 0 } }
]);

const container = cy.getElementById('container-1');
if (!container || container.length === 0) {
  throw new Error('Failed to create container node.');
}
container.data('width', 400);
container.data('height', 200);

const initialBounds = container.boundingBox({ includeLabels: false, includeOverlays: false });
window.CustomLayouts.timelineLayout.call(cy, {
  eles: container.children(),
  boundingBox: initialBounds
});

const baseline = window.CustomLayouts.getTimelineBaselineInfo(cy, 'container-1');
if (!baseline) {
  throw new Error('Timeline baseline missing after layout.');
}

const event1 = cy.getElementById('event-1');
const event2 = cy.getElementById('event-2');
if (!event1 || !event2) {
  throw new Error('Failed to retrieve timeline events.');
}

const event1Pos = event1.position();
if (!Number.isFinite(event1Pos.x) || !Number.isFinite(event1Pos.y)) {
  throw new Error('Event node missing initial position after layout.');
}

const event2Signature = event2.data('_timelineTimestampSignature');
if (!Number.isFinite(event2Signature)) {
  throw new Error('Expected timeline layout to store timestamp signature for untouched node.');
}

const manualX = event1Pos.x + 37;
const manualY = event1Pos.y + 22;
const tolerance = 1e-6;

event1.position({ x: manualX, y: manualY });
event1.data('_timelineEditorTouched', true);

const initialSignature = event1.data('_timelineTimestampSignature');
if (!Number.isFinite(initialSignature)) {
  throw new Error('Expected timeline layout to store timestamp signature before fitting.');
}

window.CustomLayouts.fitNodesToTimeline(cy, [event1]);

const afterManualFit = event1.position();
if (Math.abs(afterManualFit.x - manualX) > tolerance) {
  throw new Error('Node x-position changed after manual adjustment fit.');
}
if (Math.abs(afterManualFit.y - manualY) > tolerance) {
  throw new Error('Node y-position changed after manual adjustment fit.');
}

const lockedX = event1.data('lockedX');
if (!Number.isFinite(lockedX) || Math.abs(lockedX - manualX) > tolerance) {
  throw new Error('lockedX was not updated to reflect manual node position.');
}

const signatureAfterManualFit = event1.data('_timelineTimestampSignature');
if (signatureAfterManualFit !== initialSignature) {
  throw new Error('Timestamp signature should remain unchanged when node position is preserved.');
}

const newTimestamp = 500;
event1.data('timestamp', newTimestamp);
window.CustomLayouts.fitNodesToTimeline(cy, [event1]);

const expectedSignature = newTimestamp * 1000;
const signatureAfterChange = event1.data('_timelineTimestampSignature');
if (signatureAfterChange !== expectedSignature) {
  throw new Error('Timestamp signature was not updated after timestamp change.');
}

const finalPos = event1.position();
const ratio = (expectedSignature - baseline.minTime) / baseline.range;
const clampedRatio = Math.min(1, Math.max(0, ratio));
const expectedX = baseline.startX + clampedRatio * baseline.width;

if (Math.abs(finalPos.x - expectedX) > 1e-3) {
  throw new Error(`Node x-position did not follow timeline after timestamp change (expected ${expectedX}, received ${finalPos.x}).`);
}

if (Number.isFinite(baseline.centerY) && Math.abs(finalPos.y - baseline.centerY) > 1e-3) {
  throw new Error('Node y-position did not align with baseline center after timestamp change.');
}

console.log('Timeline node editor fit preserves manual positions and repositions after timestamp change.');
process.exit(0);
