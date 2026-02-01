const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const os = require('os');

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quantickle-config-'));
  const domainDir = path.join(tmpDir, 'test-domain');
  fs.mkdirSync(domainDir);
  fs.writeFileSync(
    path.join(domainDir, 'temp_type.json'),
    JSON.stringify({ color: '#fff', size: 20, shape: 'ellipse', icon: '' })
  );

  const dom = new JSDOM('<!doctype html><html><body><div class="type-entry" data-domain="test_domain" data-type="temp_type"><input class="type-name-input" data-type="temp_type" /></div></body></html>', { runScripts: 'dangerously' });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  window.DOMAIN_DIR = tmpDir;
  window.NodeTypes = { temp_type: { color: '#fff', size: 20, shape: 'ellipse', icon: '' } };
  window.IconConfigs = {};
  window.UI = { showNotification: () => {} };

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
      if ((options.method || 'GET').toUpperCase() === 'PUT') {
        const body = JSON.parse(options.body || '{}');
        fs.writeFileSync(filePath, JSON.stringify(body, null, 2));
        return { ok: true, json: async () => ({ success: true }) };
      }
      if ((options.method || 'GET').toUpperCase() === 'DELETE') {
        try { fs.unlinkSync(filePath); } catch (_) {}
        return { ok: true, json: async () => ({ success: true }) };
      }
    }
    return { ok: false, json: async () => ({}) };
  };
  window.fetch = global.fetch;

  const domainScript = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain-loader.js'), 'utf8');
  window.eval(domainScript);
  window.DomainLoader.availableDomains.test_domain = { name: 'Test', folder: 'test-domain', loaded: true, types: { temp_type: window.NodeTypes.temp_type } };

  const tablesScript = fs.readFileSync(path.join(__dirname, '..', 'js', 'tables.js'), 'utf8');
  window.eval(tablesScript);

  const input = document.querySelector('.type-name-input');
  input.value = 'final_type';
  window.TableManager.saveNewTypeName(input);
  await new Promise(resolve => setTimeout(resolve, 50));

  const newPath = path.join(domainDir, 'final_type.json');
  const oldPath = path.join(domainDir, 'temp_type.json');
  if (!fs.existsSync(newPath)) {
    throw new Error('Node type file not created on rename');
  }
  if (fs.existsSync(oldPath)) {
    throw new Error('Temporary node type file was not removed');
  }
  console.log('node-type-table-save.test.js passed');
})();
