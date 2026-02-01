const assert = require('assert');
const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');
const fs = require('fs');
const path = require('path');

(async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  global.window = dom.window;
  global.document = dom.window.document;
  window.HTMLCanvasElement.prototype.getContext = () => null;

  // Prevent automatic DOM-related initialization in integrations
  Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
  document.addEventListener = () => {};

  // Stub fetch for config listing and domain files
  global.fetch = async (filePath) => {
    if (filePath === '/assets/domains/index.json') {
      return {
        ok: true,
        json: async () => ({ files: ['assets/domains/computing/domain.json'] })
      };
    }
    const localPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    try {
      const fullPath = path.join(__dirname, '..', localPath);
      const text = fs.readFileSync(fullPath, 'utf8');
      return { ok: true, json: async () => JSON.parse(text) };
    } catch (_) {
      return { ok: false, json: async () => ({}) };
    }
  };
  window.fetch = global.fetch;

  // Minimal globals required by DomainLoader and IntegrationsManager
  window.NodeTypes = { default: { color: '#999999', size: 20, shape: 'round-rectangle', icon: '' } };
  window.IconConfigs = {};
  window.TableManager = { updateNodeTypesTable: () => {} };
  window.GraphRenderer = {
    normalizeNodeData: ({ data }) => {
      data.backgroundImage = data.icon ? `url("${data.icon}")` : 'none';
    }
  };
  window.DataManager = { getGraphData: () => ({ nodes: [], edges: [] }), setGraphData: () => {} };
  window.GraphAreaEditor = { getSettings: () => ({ labelColor: '#333333' }) };

  const loaderSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain-loader.js'), 'utf8');
  window.eval(loaderSrc);

  const integrationsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'integrations.js'), 'utf8');
  window.eval(integrationsSrc);
  const IntegrationsManager = window.IntegrationsManager;

  await window.DomainLoader.init();
  window.DomainLoader.updateDomainStatus = () => {};
  window.DomainLoader.refreshUI = () => {};
  window.DomainLoader.saveState = () => {};
  window.DomainLoader.activateDomain('cybersecurity');

  const cy = cytoscape({ headless: true, styleEnabled: true });
  const { id, created } = await IntegrationsManager.getOrCreateNode(cy, 'n1', { type: 'domain', label: 'example.com' });
  assert.ok(created, 'Node should be created');

  const node = cy.getElementById(id);
  assert.equal(node.data('color'), '#FFFFFF', 'Domain node color should be applied');
  assert.equal(node.data('shape'), 'ellipse', 'Domain node shape should be ellipse');
  assert.equal(node.data('icon'), '/assets/domains/computing/domain.png', 'Domain node icon should be applied');

  cy.destroy();
  console.log('cybersecurity-domain-node.test.js passed');
})();
