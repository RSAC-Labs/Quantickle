const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'dangerously' });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  window.require = undefined;
  window.DOMAIN_DIR = '/assets/domains';
  window.NodeTypes = { default: { color: '#000', size: 30, shape: 'ellipse', icon: '' } };
  window.IconConfigs = {};

  global.fetch = async (url) => {
    if (url === '/assets/domains/index.json') {
      return { ok: true, json: async () => ({ files: ['assets/domains/test-domain/nested/nested-type.json'] }) };
    }
    if (url === '/assets/domains/test-domain/nested/nested-type.json') {
      const data = { color: '#123456', size: 10, shape: 'ellipse', icon: '' };
      return { ok: true, json: async () => data };
    }
    return { ok: false };
  };
  window.fetch = global.fetch;

  const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain-loader.js'), 'utf8');
  window.eval(script);

  await window.DomainLoader.fetchAvailableDomains();
  if (!window.DomainLoader.availableDomains.test_domain) {
    throw new Error('Domain not discovered');
  }
  await window.DomainLoader.loadDomain('test_domain');
  if (!window.DomainLoader.availableDomains.test_domain.types['nested-type']) {
    throw new Error('Nested type not loaded in browser environment');
  }
  console.log('node-type-browser-subfolder-load.test.js passed');
})();
