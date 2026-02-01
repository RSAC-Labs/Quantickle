const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;
global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

// Load FileManagerModule script
const fileManagerScript = fs.readFileSync(path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js'), 'utf8');
window.eval(fileManagerScript);

class CyStub {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
  }
  elements() {
    return { remove: () => {} };
  }
  add(opts) {
    if (opts.group === 'nodes') {
      const data = { ...opts.data };
      if (data.parent && !this.nodes.has(data.parent)) {
        delete data.parent; // lose parent if container not yet added
      }
      this.nodes.set(data.id, data);
      return data;
    } else if (opts.group === 'edges') {
      this.edges.set(opts.data.id, { ...opts.data });
      return opts.data;
    }
  }
  fit() {}
}

const cy = new CyStub();
const fm = new window.FileManagerModule({
  cytoscape: cy,
  notifications: { show: () => {} },
  papaParseLib: {}
});

const graphData = {
  nodes: [
    { id: 'child', label: 'child', parent: 'container' },
    { id: 'container', label: 'container', type: 'container' }
  ],
  edges: []
};

fm.applyGraphData(graphData);

assert.strictEqual(cy.nodes.get('child').parent, 'container', 'Child should retain parent reference');
console.log('file-manager-container-import.test.js passed');
