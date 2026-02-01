const assert = require('assert');
let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (err) {
  JSDOM = null;
}

const fs = require('fs');
const path = require('path');

let window;
if (JSDOM) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'dangerously' });
  ({ window } = dom);
} else {
  const noopElement = () => ({
    style: {},
    appendChild: () => {},
    remove: () => {},
    setAttribute: () => {},
    classList: { add: () => {}, remove: () => {} }
  });
  window = {
    document: {
      createElement: noopElement,
      body: { appendChild: () => {}, removeChild: () => {} },
      head: { appendChild: () => {} }
    },
    HTMLCanvasElement: function() {},
    eval: (code) => {
      const fn = new Function('window', 'document', code);
      return fn(window, window.document);
    }
  };
}

global.window = window;
global.document = window.document;
if (typeof window.eval !== 'function') {
  window.eval = (code) => {
    const fn = new Function('window', 'document', code);
    return fn(window, window.document);
  };
}
window.HTMLCanvasElement.prototype.getContext = () => null;

window.QuantickleUtils = {
  ensureNodeCallout: () => {}
};

const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js'), 'utf8');
window.eval(script);

const fm = new window.FileManagerModule({
  cytoscape: null,
  notifications: { show: () => {} },
  papaParseLib: null,
});

const rawGraph = {
  nodes: [
    {
      data: {
        id: 'legacy-data-node',
        type: 'text',
        text: {
          fontFamily: 'Georgia',
          fontSize: 22,
          fontColor: '#123456',
          bold: true,
          italic: true,
          width: 320,
          height: 180
        }
      }
    },
    {
      id: 'legacy-flat-node',
      type: 'text',
      text: {
        'font-size': 18,
        'font-family': 'Verdana',
        bold: false,
        italic: true,
        fontColor: '#654321',
        width: 280,
        height: 140
      }
    },
    {
      id: 'preserved-node',
      type: 'text',
      fontSize: 30,
      text: {
        fontSize: 12,
        fontFamily: 'Courier New'
      }
    }
  ],
  edges: []
};

const processed = fm.prepareGraphData(rawGraph);
const nodeA = processed.nodes.find(n => n.id === 'legacy-data-node');
const nodeB = processed.nodes.find(n => n.id === 'legacy-flat-node');
const nodeC = processed.nodes.find(n => n.id === 'preserved-node');

assert.strictEqual(nodeA.fontFamily, 'Georgia', 'Data node should copy font family from legacy text block');
assert.strictEqual(nodeA.fontSize, 22, 'Data node should copy font size from legacy text block');
assert.strictEqual(nodeA.fontColor, '#123456', 'Data node should copy font color from legacy text block');
assert.strictEqual(nodeA.bold, true, 'Data node should copy bold flag from legacy text block');
assert.strictEqual(nodeA.italic, true, 'Data node should copy italic flag from legacy text block');
assert.ok(nodeA.text && typeof nodeA.text === 'object', 'Legacy text block should be preserved for additional properties');
assert.strictEqual(nodeA.text.width, 320, 'Legacy text width should remain available for sizing');
assert.strictEqual(nodeA.text.height, 180, 'Legacy text height should remain available for sizing');

assert.strictEqual(nodeB.fontFamily, 'Verdana', 'Flattened node should copy aliased font family');
assert.strictEqual(nodeB.fontSize, 18, 'Flattened node should copy aliased font size');
assert.strictEqual(nodeB.fontColor, '#654321', 'Flattened node should copy font color');
assert.strictEqual(nodeB.italic, true, 'Flattened node should retain italic flag');
assert.ok(nodeB.text && typeof nodeB.text === 'object', 'Flattened node should retain legacy text block');
assert.strictEqual(nodeB.text.width, 280, 'Flattened node should retain legacy width');
assert.strictEqual(nodeB.text.height, 140, 'Flattened node should retain legacy height');

assert.strictEqual(nodeC.fontSize, 30, 'Existing font size should not be overwritten by legacy block');

console.log('file-manager-import-text-node-styles.test.js passed');
