const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Setup DOM with localStorage
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  runScripts: 'dangerously',
  url: 'http://localhost'
});
const { window } = dom;
global.window = window;
global.document = window.document;

// Minimal globals required by DomainLoader
window.NodeTypes = { default: { color: '#000', size: 30, shape: 'ellipse', icon: '' } };
window.IconConfigs = {};

// Stub fetch to provide domain config file list and contents
const domainFile = 'assets/domains/programming/class.json';

global.fetch = async (filePath) => {
  if (filePath === '/assets/domains/index.json') {
    return { ok: true, json: async () => ({ files: [domainFile] }) };
  }
  const localPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  const fullPath = path.join(__dirname, '..', localPath);
  const text = fs.readFileSync(fullPath, 'utf8');
  return { ok: true, text: async () => text, json: async () => JSON.parse(text) };
};
window.fetch = global.fetch;

(async () => {
  // Load DomainLoader script
  const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain-loader.js'), 'utf8');
  window.eval(script);

  await window.DomainLoader.init();

  // Activate the programming domain
  await window.DomainLoader.loadAndActivateDomains(['programming']);
  assert.ok(window.NodeTypes.class, 'Programming domain should be active');

  // Calling autoLoadDomainsForGraph with an empty graph should not clear domains
  await window.DomainLoader.autoLoadDomainsForGraph({ nodes: [], edges: [] });
  assert.ok(window.NodeTypes.class, 'Programming domain should remain active after empty graph');

  // Persisted state should still include the domain
  const saved = window.localStorage.getItem('quantickle_active_domains');
  assert.ok(saved && JSON.parse(saved).activeDomains.includes('programming'), 'Persisted domains should include programming');

  console.log('domain-autoload-empty-graph-preserves-domains.test.js passed');
})();

