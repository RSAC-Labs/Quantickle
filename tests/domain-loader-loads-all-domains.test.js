const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  // Provide URL to enable localStorage
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost'
  });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  window.HTMLCanvasElement.prototype.getContext = () => null;

  // Stub fetch for domain files
  global.fetch = async (filePath) => {
    if (filePath === '/assets/domains/index.json') {
      return {
        ok: true,
        json: async () => ({
          files: [
            'assets/domains/programming/class.json',
            'assets/domains/biology/species.json'
          ]
        })
      };
    }
    const localPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    try {
      const fullPath = path.join(__dirname, localPath);
      const text = fs.readFileSync(fullPath, 'utf8');
      return { ok: true, json: async () => JSON.parse(text) };
    } catch (_) {
      return { ok: false, json: async () => ({}) };
    }
  };
  window.fetch = global.fetch;

  // Minimal globals required by DomainLoader
  window.NodeTypes = { default: { color: '#000', size: 30, shape: 'ellipse', icon: '' } };
  window.IconConfigs = {};

  const loaderSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain-loader.js'), 'utf8');
  window.eval(loaderSrc);

  await window.DomainLoader.init();

  assert.ok(window.DomainLoader.availableDomains.programming.loaded, 'Programming domain should load at init');
  assert.ok(window.DomainLoader.availableDomains.biology.loaded, 'Biology domain should load at init');
  assert.ok(window.DomainLoader.availableDomains.programming.types.class, 'Programming type should be parsed');
  assert.ok(window.DomainLoader.availableDomains.biology.types.species, 'Biology type should be parsed');
  assert.ok(!window.NodeTypes.class && !window.NodeTypes.species, 'Domains should not activate by default');

  console.log('domain-loader-loads-all-domains.test.js passed');
})();
