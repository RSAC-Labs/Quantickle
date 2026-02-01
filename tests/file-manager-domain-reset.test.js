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

// Stub fetch to handle API request and JSON config retrieval
global.fetch = async (filePath) => {
  if (filePath === '/assets/domains/index.json') {
    return {
      ok: true,
      json: async () => ({ files: ['assets/domains/programming/class.json', 'assets/domains/cybersecurity/threat_actor.json'] })
    };
  }
  const localPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  const fullPath = path.join(__dirname, '..', localPath);
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
    papaParseLib: {},
  });

  fm.applyGraphData = function(graphData) { this.graphData = graphData; };
  fm.validateFile = () => true;

  const graphs = [
    { nodes: [{ data: { id: 'n1', type: 'class' } }], edges: [] },
    { nodes: [{ data: { id: 'n2', type: 'threat_actor' } }], edges: [] }
  ];
  let loadCount = 0;
  fm.readFileAsText = async () => JSON.stringify(graphs[loadCount++]);
  fm.containsExternalResources = () => false;
  fm.showExternalResourcePrompt = async () => true;
  fm.validateGraphData = () => true;
  fm.hasExternalReferences = () => false;

  await fm.loadGraphFile({ name: 'first.qut', size: 0, lastModified: Date.now() });
  assert.ok(window.NodeTypes.class, 'Programming domain should be active after first load');
  assert.ok(!window.NodeTypes.threat_actor, 'Cybersecurity domain should not be active after first load');

  await fm.loadGraphFile({ name: 'second.qut', size: 0, lastModified: Date.now() });
  assert.ok(window.NodeTypes.threat_actor, 'Cybersecurity domain should be active after second load');
  assert.ok(!window.NodeTypes.class, 'Programming domain should be cleared before second load');

  console.log('file-manager-domain-reset.test.js passed');
})();
