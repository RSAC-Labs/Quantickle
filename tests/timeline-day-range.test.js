const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

window.cytoscape = cytoscape;
require('../js/custom-layouts.js');
window.CustomLayouts.registerCustomLayouts();

const cy = cytoscape({ headless: true });
cy.extent = () => ({ x1: 0, y1: 0, x2: 1000, y2: 1000, w: 1000, h: 1000 });
const container = {
  style: {},
  _children: [],
  querySelector(sel) {
    const cls = sel.startsWith('.') ? sel.slice(1) : sel;
    return this._children.find(el => el.className === cls) || null;
  },
  appendChild(child) {
    child.parentNode = this;
    this._children.push(child);
  },
  removeChild(child) {
    this._children = this._children.filter(c => c !== child);
  }
};
cy.container = () => container;

cy.add([
  { data: { id: 'a', timestamp: '2023-01-01T00:00:00Z' } },
  { data: { id: 'b', timestamp: '2023-01-05T00:00:00Z' } }
]);

window.CustomLayouts.timelineLayout.call(cy, {});

const ticks = cy.nodes('[type="timeline-tick"]');
if (ticks.length === 0) throw new Error('Ticks not created');
const tickPositions = ticks.map(t => t.position('x'));
const tickLabels = ticks.map(t => t.data('label'));

const width = cy.extent().w;
if (Math.round(tickPositions[0]) !== 0 || Math.round(tickPositions[tickPositions.length - 1]) !== width) {
  throw new Error('Day ticks do not span width');
}

const diff1 = tickPositions[2] - tickPositions[1];
const diff2 = tickPositions[3] - tickPositions[2];
const diff3 = tickPositions[4] - tickPositions[3];
if (Math.abs(diff1 - diff2) > 1 || Math.abs(diff2 - diff3) > 1) {
  throw new Error('Day tick spacing incorrect');
}

if (tickLabels.slice(1).join(',') !== '1/1,1/2,1/3,1/4,1/5') {
  throw new Error('Day tick labels incorrect');
}

console.log('Timeline layout handles sub-month day ranges');
process.exit(0);
