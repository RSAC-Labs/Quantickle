const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const os = require('os');

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quantickle-config-'));
  const domainDir = path.join(tmpDir, 'chem');
  fs.mkdirSync(domainDir);
  fs.writeFileSync(
    path.join(domainDir, 'acid.json'),
    JSON.stringify({ color: '#fff', size: 20, shape: 'triangle', icon: '' }, null, 2)
  );

  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously' });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  window.DOMAIN_DIR = tmpDir;
  window.NodeTypes = { acid: { color: '#fff', size: 20, shape: 'triangle', icon: '' } };
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
      if ((options.method || 'GET').toUpperCase() === 'PUT') {
        const body = JSON.parse(options.body || '{}');
        fs.writeFileSync(filePath, JSON.stringify(body, null, 2));
        return { ok: true, json: async () => ({ success: true }) };
      }
    }
    return { ok: false, json: async () => ({}) };
  };
  window.fetch = global.fetch;

  const domainScript = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain-loader.js'), 'utf8');
  window.eval(domainScript);
  window.DomainLoader.availableDomains.chem = { name: 'Chem', folder: 'chem', loaded: true, types: { acid: window.NodeTypes.acid } };

  // Add new icon and save node type
  window.NodeTypes.acid.icon = 'acid.png';
  await window.DomainLoader.saveNodeType('chem', 'acid');

  const saved = JSON.parse(fs.readFileSync(path.join(domainDir, 'acid.json'), 'utf8'));
  if (saved.icon !== 'acid.png') {
    throw new Error('Icon not saved to JSON file');
  }
  console.log('node-type-json-rewrite.test.js passed');
})();
