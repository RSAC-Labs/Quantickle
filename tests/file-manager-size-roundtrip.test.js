const assert = require('assert');
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

const uniformSize = 36;

const createNode = (id, overrides = {}) => {
  const baseData = {
    id,
    label: `Node ${id}`,
    size: uniformSize,
    ...overrides
  };

  const nodePosition = overrides.position || { x: 10, y: 20 };

  return {
    id: () => id,
    data: (key) => {
      if (key === undefined) {
        return baseData;
      }
      return baseData[key];
    },
    position: axis => nodePosition[axis],
    hasClass: className => className === 'container' ? Boolean(baseData.isContainer) : false,
    boundingBox: () => ({ w: 80, h: 40, width: 80, height: 40 }),
    width: () => 80,
    height: () => 40,
    style: () => null
  };
};

const cy = {
  nodes: () => [
    createNode('n1'),
    createNode('n2', { size: uniformSize }),
    createNode('n3', { size: uniformSize })
  ],
  edges: () => []
};

const fm = new window.FileManagerModule({
  cytoscape: cy,
  notifications: { show: () => {} },
  papaParseLib: null,
});

fm.applyGraphData = function(graphData) {
  this.graphData = graphData;
};
fm.prepareDomainsForGraph = async () => [];
window.DataManager = { setGraphData: () => {}, setGraphName: () => {}, isLoading: false };

const exported = fm.exportCurrentGraph();
assert.strictEqual(exported.nodes.length, 3, 'All nodes should be exported');

exported.nodes.forEach(node => {
  assert.strictEqual(node.size, uniformSize, `Node ${node.id} should retain its assigned size during export`);
});

(async () => {
  await fm.importGraphData(JSON.stringify(exported), 'json');
  const reloaded = fm.graphData.nodes;
  assert.strictEqual(reloaded.length, 3, 'Round-trip should keep the same number of nodes');
  reloaded.forEach(node => {
    assert.strictEqual(node.size, uniformSize, `Node ${node.id} should retain size after import`);
  });
  console.log('file-manager-size-roundtrip.test.js passed');
})();
