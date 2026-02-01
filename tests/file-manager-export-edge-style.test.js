const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;
global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js'), 'utf8');
window.eval(script);

const edge = {
  id: () => 'e1',
  data: () => ({ id: 'e1', source: 'n1', target: 'n2' }),
  style: prop => {
    if (prop === 'label') return 'edge label';
    if (prop === 'line-color') return '#123456';
    return '';
  }
};

const cy = {
  nodes: () => [],
  edges: () => [edge]
};

const fm = new window.FileManagerModule({
  cytoscape: cy,
  notifications: { show: () => {} },
  papaParseLib: null,
});

const exported = fm.exportCurrentGraph();

if (exported.edges.length !== 1) {
  throw new Error('Edge not exported');
}
if (exported.edges[0].label !== 'edge label') {
  throw new Error('Edge label not preserved');
}
if (exported.edges[0].color !== '#123456') {
  throw new Error('Edge color not preserved');
}

console.log('file-manager-export-edge-style.test.js passed');
