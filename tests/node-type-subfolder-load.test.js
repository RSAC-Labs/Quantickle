const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const os = require('os');

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quantickle-config-'));
  const domainDir = path.join(tmpDir, 'test-domain', 'nested');
  fs.mkdirSync(domainDir, { recursive: true });
  fs.writeFileSync(
    path.join(domainDir, 'nested-type.json'),
    JSON.stringify({ color: '#123456', size: 10, shape: 'ellipse', icon: '' })
  );

  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'dangerously' });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  window.DOMAIN_DIR = tmpDir;
  window.NodeTypes = { default: { color: '#000', size: 30, shape: 'ellipse', icon: '' } };
  window.IconConfigs = {};

  global.fetch = async (url) => {
    if (url === '/assets/domains/index.json') {
      return { ok: true, json: async () => ({ files: ['assets/domains/test-domain/nested/nested-type.json'] }) };
    }
    if (url === '/assets/domains/test-domain/nested/nested-type.json') {
      const text = fs.readFileSync(path.join(domainDir, 'nested-type.json'), 'utf8');
      return { ok: true, json: async () => JSON.parse(text) };
    }
    return { ok: false };
  };
  window.fetch = global.fetch;

  const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain-loader.js'), 'utf8');
  window.eval(script);

  await new Promise(resolve => window.document.addEventListener('DOMContentLoaded', resolve));
  await new Promise(resolve => {
    const check = () => {
      if (window.DomainLoader.availableDomains.test_domain) {
        resolve();
      } else {
        setTimeout(check, 10);
      }
    };
    check();
  });

  window.DomainLoader.availableDomains.test_domain.loaded = false;
  window.DomainLoader.availableDomains.test_domain.types = null;

  await window.DomainLoader.loadDomain('test_domain');
  if (!window.DomainLoader.availableDomains.test_domain.types['nested-type']) {
    throw new Error('Nested node type was not loaded');
  }
  console.log('node-type-subfolder-load.test.js passed');
})();
