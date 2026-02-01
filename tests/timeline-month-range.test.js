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
  { data: { id: 'a', timestamp: '2023-01-15T00:00:00Z' } },
  { data: { id: 'b', timestamp: '2023-04-15T00:00:00Z' } }
]);

window.CustomLayouts.timelineLayout.call(cy, {});

const ticks = cy.nodes('[type="timeline-tick"]');
if (ticks.length === 0) throw new Error('Ticks not created');
const tickPositions = ticks.map(t => t.position('x'));
const tickLabels = ticks.map(t => t.data('label'));

const width = cy.extent().w;
if (Math.round(tickPositions[0]) !== 0 || Math.round(tickPositions[tickPositions.length - 1]) !== width) {
  throw new Error('Month ticks do not span width');
}

const minOriginal = Date.parse('2023-01-15T00:00:00Z');
const maxOriginal = Date.parse('2023-04-15T00:00:00Z');
let minTime = minOriginal;
let maxTime = maxOriginal;
let range = maxTime - minTime || 1;
const margin = range * 0.05;
minTime -= margin;
maxTime += margin;
range = maxTime - minTime;

const feb1 = Date.UTC(2023, 1, 1);
const mar1 = Date.UTC(2023, 2, 1);
const expectedFeb = ((feb1 - minTime) / range) * width;
const expectedMar = ((mar1 - minTime) / range) * width;
if (Math.abs(tickPositions[1] - expectedFeb) > 1 || Math.abs(tickPositions[2] - expectedMar) > 1) {
  throw new Error('Month tick spacing incorrect');
}

if (tickLabels.join(',') !== '1/2023,2/2023,3/2023,4/2023') {
  throw new Error('Month tick labels incorrect');
}

console.log('Timeline layout handles sub-year month ranges');
process.exit(0);
