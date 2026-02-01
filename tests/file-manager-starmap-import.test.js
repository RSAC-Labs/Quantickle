const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;
global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

// Stub fetch to handle API request and JSON config retrieval
global.fetch = async (filePath) => {
  if (filePath === '/assets/domains/index.json') {
    return { ok: true, json: async () => ({ files: ['assets/domains/star/G2V.json'] }) };
  }
  const normalized = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  const fullPath = path.join(__dirname, '..', normalized);
  const text = fs.readFileSync(fullPath, 'utf8');
  return {
    ok: true,
    text: async () => text,
    json: async () => JSON.parse(text)
  };
};
window.fetch = global.fetch;

// Minimal globals required by DomainLoader
window.NodeTypes = { default: { color: '#000', size: 30, shape: 'ellipse', icon: '' } };
window.IconConfigs = {};

// Minimal QuantickleConfig stub for graph area settings
let appliedSettings;
window.QuantickleConfig = {
  graphAreaSettings: {
    mergeWithDefaults: (s) => s,
    applySettings: (s) => { appliedSettings = s; }
  }
};

// Load DomainLoader and initialize
const domainLoaderScript = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain-loader.js'), 'utf8');
window.eval(domainLoaderScript);

// Load FileManagerModule
const fileManagerScript = fs.readFileSync(path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js'), 'utf8');
window.eval(fileManagerScript);

const fm = new window.FileManagerModule({
  cytoscape: null,
  notifications: { show: () => {} },
  papaParseLib: {}
});

fm.applyGraphData = function(graphData) { this.graphData = graphData; };
fm.validateFile = () => true;
fm.readFileAsText = async () => fs.readFileSync(path.join(__dirname, '..', 'examples', 'stars.qut'), 'utf8');
fm.containsExternalResources = () => false;
fm.showExternalResourcePrompt = async () => true;
fm.validateGraphData = () => true;
fm.hasExternalReferences = () => false;

(async () => {
  await window.DomainLoader.init();
  await fm.loadGraphFile({ name: 'stars.qut', size: 0, lastModified: Date.now() });
  assert.ok(Array.isArray(fm.graphData.nodes) && fm.graphData.nodes.length > 0, 'Nodes should load');
  assert.ok(appliedSettings, 'Graph area settings should be applied');
  assert.ok(window.NodeTypes.G2V, 'Star node types should load');
  console.log('file-manager-starmap-import.test.js passed');
})();
