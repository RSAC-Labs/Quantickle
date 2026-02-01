const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost'
  });

  const { window } = dom;
  global.window = window;
  global.document = window.document;

  window.NodeTypes = {
    default: { color: '#000', size: 30, shape: 'ellipse', icon: '' }
  };
  window.IconConfigs = {};

  let manifest = ['assets/domains/sample/sample-type.json'];

  const definitions = {
    'assets/domains/sample/sample-type.json': { color: '#123', size: 10, shape: 'ellipse', icon: '' },
    'assets/domains/fresh/fresh-type.json': { color: '#abc', size: 15, shape: 'ellipse', icon: '' }
  };

  global.fetch = async (url) => {
    if (url === '/assets/domains/index.json') {
      return { ok: true, json: async () => ({ files: manifest }) };
    }
    if (url === '/assets/domains/sample/sample-type.json') {
      return { ok: true, json: async () => definitions['assets/domains/sample/sample-type.json'] };
    }
    if (url === '/assets/domains/fresh/fresh-type.json') {
      return { ok: true, json: async () => definitions['assets/domains/fresh/fresh-type.json'] };
    }
    return { ok: false, json: async () => ({}) };
  };

  window.fetch = global.fetch;

  const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain-loader.js'), 'utf8');
  window.eval(script);

  await window.DomainLoader.init();

  assert(!window.DomainLoader.availableDomains.fresh);

  manifest = ['assets/domains/sample/sample-type.json', 'assets/domains/fresh/fresh-type.json'];

  await window.DomainLoader.forceReloadAllDomains();

  const freshDomain = window.DomainLoader.availableDomains.fresh;
  assert(freshDomain, 'fresh domain should be discovered after reload all');
  assert(freshDomain.loaded, 'fresh domain should be loaded after reload all');
  assert.strictEqual(freshDomain.types['fresh-type'].color, '#abc');
  assert.strictEqual(window.DomainLoader.typeDomainMap['fresh-type'], 'fresh');

  console.log('domain-loader-reload-all-refreshes.test.js passed');
})();

