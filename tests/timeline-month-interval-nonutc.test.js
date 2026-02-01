process.env.TZ = 'America/New_York';
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
  { data: { id: 'a', timestamp: '2024-01-01T00:00:00Z' } },
  { data: { id: 'b', timestamp: '2024-03-01T00:00:00Z' } }
]);

window.CustomLayouts.timelineLayout.call(cy, {});

const ticks = cy.nodes('[type="timeline-tick"]');
if (ticks.length === 0) throw new Error('Ticks not created');
const labels = ticks.map(t => t.data('label'));
if (!labels.includes('1/2024') || !labels.includes('3/2024')) {
  throw new Error('Monthly tick labels incorrect');
}

console.log('Timeline layout uses UTC for monthly tick labels');
process.exit(0);
