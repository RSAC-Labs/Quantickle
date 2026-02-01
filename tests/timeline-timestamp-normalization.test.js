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

// one node with seconds, one with milliseconds
cy.add([
  { data: { id: 's', timestamp: 1700000000 } },
  { data: { id: 'ms', timestamp: 1700003600000 } }
]);

window.CustomLayouts.timelineLayout.call(cy, {});

const nodeS = cy.getElementById('s');
const nodeMs = cy.getElementById('ms');
const bar = cy.getElementById('timeline-bar');
const ticks = cy.nodes('[type="timeline-tick"]');
if (ticks.length === 0) throw new Error('Ticks not created');
const tickPositions = ticks.map(t => t.position('x'));

const width = cy.extent().w;
if (Math.round(bar.data('barLength')) !== width) {
  throw new Error('Bar length does not match width');
}
if (Math.round(tickPositions[0]) !== 0 || Math.round(tickPositions[tickPositions.length - 1]) !== width) {
  throw new Error('Ticks do not span width');
}

const parseTimestamp = v => (v < 1e12 ? v * 1000 : v);
const times = [parseTimestamp(1700000000), parseTimestamp(1700003600000)];
let minTime = Math.min(...times);
let maxTime = Math.max(...times);
let range = maxTime - minTime || 1;
const margin = range * 0.05;
minTime -= margin;
maxTime += margin;
range = maxTime - minTime;

const expectedS = ((parseTimestamp(1700000000) - minTime) / range) * width;
const expectedMs = ((parseTimestamp(1700003600000) - minTime) / range) * width;

if (Math.abs(nodeS.position('x') - expectedS) > 1 || Math.abs(nodeMs.position('x') - expectedMs) > 1) {
  throw new Error('Node positions do not align with normalized timestamps');
}

console.log('Timeline layout normalizes second and millisecond timestamps');
process.exit(0);
