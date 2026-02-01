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
  const initialTypes = JSON.parse(JSON.stringify(window.NodeTypes));

  // Stub fetch to return an empty config file list
  global.fetch = async (url) => {
    if (url === '/assets/domains/index.json') {
      return { ok: true, json: async () => ({ files: [] }) };
    }
    return { ok: false, json: async () => ({}) };
  };
  window.fetch = global.fetch;

  // Load DomainLoader script
  const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain-loader.js'), 'utf8');
  window.eval(script);

  // Initialize DomainLoader
  await window.DomainLoader.init();

  // Verify the default domain cache exists and matches NodeTypes
  const cached = window.localStorage.getItem('domain_default_json');
  assert.ok(cached, 'Default type definition cache missing');
  const parsed = JSON.parse(cached);
  assert.deepStrictEqual(parsed, initialTypes, 'Cached type definitions mismatch');

  console.log('domain-loader-cache-init.test.js passed');
})();
