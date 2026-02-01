const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const os = require('os');

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quantickle-config-'));
  const testDomain = path.join(tmpDir, 'test-domain');
  const otherDomain = path.join(tmpDir, 'other-domain');
  fs.mkdirSync(testDomain);
  fs.mkdirSync(otherDomain);

  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'dangerously' });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  window.DOMAIN_DIR = tmpDir;
  window.NodeTypes = { test: { color: '#fff', size: 20, shape: 'ellipse', icon: '' } };
  window.IconConfigs = {};

  global.fetch = async (url, options = {}) => {
    if (url === '/assets/domains/index.json') {
      return { ok: true, json: async () => ({ files: [] }) };
    }
    const match = url.match(/^\/api\/node-types\/([^/]+)\/([^/]+)$/);
    if (match) {
      const domain = match[1];
      const type = decodeURIComponent(match[2]);
      const dir = path.join(tmpDir, domain);
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, `${type}.json`);
      if ((options.method || 'GET').toUpperCase() === 'DELETE') {
        try { fs.unlinkSync(filePath); } catch (_) {}
        return { ok: true, json: async () => ({ success: true }) };
      }
      if ((options.method || 'GET').toUpperCase() === 'PUT') {
        const body = JSON.parse(options.body || '{}');
        if (body.newDomain) {
          const newDir = path.join(tmpDir, body.newDomain);
          fs.mkdirSync(newDir, { recursive: true });
          fs.writeFileSync(path.join(newDir, `${type}.json`), JSON.stringify(body, null, 2));
          try { fs.unlinkSync(filePath); } catch (_) {}
        } else {
          fs.writeFileSync(filePath, JSON.stringify(body, null, 2));
        }
        return { ok: true, json: async () => ({ success: true }) };
      }
    }
    return { ok: false, json: async () => ({}) };
  };
  window.fetch = global.fetch;

  const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain-loader.js'), 'utf8');
  window.eval(script);
  await window.DomainLoader.fetchAvailableDomains();

  window.DomainLoader.availableDomains.test_domain = { name: 'Test', folder: 'test-domain', loaded: true, types: { test: window.NodeTypes.test } };
  window.DomainLoader.availableDomains.other_domain = { name: 'Other', folder: 'other-domain', loaded: true, types: {} };

  await window.DomainLoader.saveNodeType('test_domain', 'test');
  const savedPath = path.join(testDomain, 'test.json');
  if (!fs.existsSync(savedPath)) {
    throw new Error('saveNodeType did not write file');
  }

  await window.DomainLoader.moveNodeType('test', 'test_domain', 'other_domain');
  const movedPath = path.join(otherDomain, 'test.json');
  if (fs.existsSync(savedPath) || !fs.existsSync(movedPath)) {
    throw new Error('moveNodeType did not move file');
  }

  console.log('node-type-file-save.test.js passed');
})();
