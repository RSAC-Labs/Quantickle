const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  // Provide a URL so localStorage is available
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost'
  });
  const { window } = dom;
  global.window = window;
  global.document = window.document;

  // Minimal globals for DomainLoader
  window.NodeTypes = {
    default: { color: '#000', size: 30, shape: 'ellipse', icon: '' }
  };
  window.IconConfigs = {};

  // Stub fetch to return a sample domain file
  let typeDef = { color: '#123', size: 10, shape: 'ellipse', icon: '' };
  global.fetch = async (url) => {
    if (url === '/assets/domains/index.json') {
      return { ok: true, json: async () => ({ files: ['assets/domains/sample/sample-type.json'] }) };
    }
    if (url === '/assets/domains/sample/sample-type.json') {
      return { ok: true, json: async () => typeDef };
    }
    return { ok: false, json: async () => ({}) };
  };
  window.fetch = global.fetch;

  // Load DomainLoader script
  const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain-loader.js'), 'utf8');
  window.eval(script);

  // Initialize and verify initial load
  await window.DomainLoader.init();
  let domain = window.DomainLoader.availableDomains.sample;
  assert.strictEqual(domain.types['sample-type'].color, '#123');

  // Change definition and force reload
  typeDef = { color: '#456', size: 20, shape: 'ellipse', icon: '' };
  await window.DomainLoader.forceReloadDomain('sample');
  domain = window.DomainLoader.availableDomains.sample;
  assert.strictEqual(domain.types['sample-type'].color, '#456');

  console.log('domain-loader-force-reload.test.js passed');
})();

