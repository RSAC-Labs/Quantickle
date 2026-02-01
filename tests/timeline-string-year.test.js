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
  { data: { id: 'a', timestamp: '1987' } },
  { data: { id: 'b', timestamp: '2021' } }
]);

window.CustomLayouts.timelineLayout.call(cy, {});

const nodeA = cy.getElementById('a');
const nodeB = cy.getElementById('b');
const bar = cy.getElementById('timeline-bar');
const ticks = cy.nodes('[type="timeline-tick"]');
if (ticks.length === 0) throw new Error('Ticks not created');
const tickPositions = ticks.map(t => t.position('x'));
const tickLabels = ticks.map(t => t.data('label'));

const width = cy.extent().w;
if (Math.round(bar.data('barLength')) !== width) {
  throw new Error('Bar length does not match width');
}
if (Math.round(tickPositions[0]) !== 0 || Math.round(tickPositions[tickPositions.length - 1]) !== width) {
  throw new Error('Ticks do not span width');
}

const times = [Date.UTC(1987, 0, 1), Date.UTC(2021, 0, 1)];
let minTime = Math.min(...times);
let maxTime = Math.max(...times);
let range = maxTime - minTime || 1;
const margin = range * 0.05;
minTime -= margin;
maxTime += margin;
range = maxTime - minTime;

const expectedA = ((Date.UTC(1987, 0, 1) - minTime) / range) * width;
const expectedB = ((Date.UTC(2021, 0, 1) - minTime) / range) * width;
if (Math.abs(nodeA.position('x') - expectedA) > 1 || Math.abs(nodeB.position('x') - expectedB) > 1) {
  throw new Error('Node positions do not align with string year timestamps');
}

const firstYear = new Date(minTime).getFullYear();
const lastYear = new Date(maxTime).getFullYear();
if (tickLabels[0] !== String(firstYear) || tickLabels[tickLabels.length - 1] !== String(lastYear)) {
  throw new Error('Tick labels do not span full year range');
}

console.log('Timeline layout handles string year timestamps');
process.exit(0);
