const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;
global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

// Stub fetch for domain discovery
global.fetch = async (filePath) => {
  if (filePath === '/assets/domains/index.json') {
    return { ok: true, json: async () => ({ files: ['assets/domains/cybersecurity/threat_actor.json'] }) };
  }
  const normalized = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  const fullPath = path.join(__dirname, '..', normalized);
  const text = fs.readFileSync(fullPath, 'utf8');
  return { ok: true, text: async () => text, json: async () => JSON.parse(text) };
};
window.fetch = global.fetch;

window.NodeTypes = { default: { color: '#000', size: 30, shape: 'ellipse', icon: '' } };
window.IconConfigs = {};
window.GraphRenderer = { normalizeNodeData: () => {}, cy: cytoscape({ headless: true, styleEnabled: true }) };
window.DataManager = { getGraphData: () => ({ nodes: [], edges: [] }), setGraphData: () => {} };
window.TableManager = { updateNodeTypesTable: () => {} };
window.GraphAreaEditor = { getSettings: () => ({ labelColor: '#333333' }) };
window.LayoutManager = { calculateOptimalSizing: () => ({}), updateNodeStyles: () => {} };

const domainLoaderScript = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain-loader.js'), 'utf8');
window.eval(domainLoaderScript);

(async () => {
  try {
    await window.DomainLoader.init();

    const integrationsScript = fs.readFileSync(path.join(__dirname, '..', 'js', 'integrations.js'), 'utf8');
    window.eval(integrationsScript);
    const IntegrationsManager = window.IntegrationsManager;
    const cy = window.GraphRenderer.cy;

    await IntegrationsManager.getOrCreateNode(cy, 'n1', { type: 'threat_actor', label: 'TA' });

    assert.ok(window.NodeTypes.threat_actor, 'Cybersecurity domain should load when node created');
    console.log('integration-domain-autoload-on-create.test.js passed');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
