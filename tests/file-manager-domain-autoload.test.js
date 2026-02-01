const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Setup DOM and globals
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;
global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

// Stub fetch to handle API request and JSON node type retrieval
global.fetch = async (filePath) => {
  if (filePath === '/assets/domains/index.json') {
    return { ok: true, json: async () => ({ files: ['assets/domains/programming/class.json'] }) };
  }
  const localPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  try {
    const fullPath = path.join(__dirname, localPath);
    const text = fs.readFileSync(fullPath, 'utf8');
    return {
      ok: true,
      text: async () => text,
      json: async () => JSON.parse(text)
    };
  } catch (err) {
    return { ok: false, text: async () => '', json: async () => { throw err; } };
  }
};
window.fetch = global.fetch;

// Minimal globals required by DomainLoader
window.NodeTypes = { default: { color: '#000', size: 30, shape: 'ellipse', icon: '' } };
window.IconConfigs = {};

// Load scripts and run test inside async IIFE
(async () => {
  const domainLoaderScript = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain-loader.js'), 'utf8');
  window.eval(domainLoaderScript);
  await window.DomainLoader.init();

  const fileManagerScript = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js'),
    'utf8'
  );
  window.eval(fileManagerScript);

  const fm = new window.FileManagerModule({
    cytoscape: null,
    notifications: { show: () => {} },
    papaParseLib: {}
  });

  // Stub methods that rely on Cytoscape or external UI
  fm.applyGraphData = function(graphData) { this.graphData = graphData; };
  fm.validateFile = () => true;
  fm.readFileAsText = async () => JSON.stringify({
    nodes: [{ data: { id: 'n1', type: 'class' } }],
    edges: []
  });
  fm.containsExternalResources = () => false;
  fm.showExternalResourcePrompt = async () => true;
  fm.validateGraphData = () => true;
  fm.hasExternalReferences = () => false;

  await fm.loadGraphFile({ name: 'test.qut', size: 0, lastModified: Date.now() });
  assert.ok(window.NodeTypes.class, 'Programming domain should be loaded');
  console.log('file-manager-domain-autoload.test.js passed');
})();
