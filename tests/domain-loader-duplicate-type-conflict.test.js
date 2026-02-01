const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="domainStatus"></div></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost'
  });

  const { window } = dom;
  global.window = window;
  global.document = window.document;
  window.HTMLCanvasElement.prototype.getContext = () => null;

  const notifications = [];
  window.UI = {
    showNotification: (message, type = 'status') => {
      notifications.push({ message, type });
    }
  };

  window.NodeTypes = {
    base: { color: '#000000', size: 20, shape: 'ellipse', icon: '' }
  };
  window.IconConfigs = {};

  const manifest = [
    'assets/domains/alpha/duplicate.json',
    'assets/domains/beta/duplicate.json'
  ];

  const definitions = {
    'assets/domains/alpha/duplicate.json': { color: '#111111', size: 15, shape: 'ellipse', icon: '' },
    'assets/domains/beta/duplicate.json': { color: '#222222', size: 18, shape: 'rectangle', icon: '' }
  };

  global.fetch = async (url) => {
    if (url === '/assets/domains/index.json') {
      return { ok: true, json: async () => ({ files: manifest }) };
    }
    const key = url.startsWith('/') ? url.slice(1) : url;
    if (definitions[key]) {
      return { ok: true, json: async () => definitions[key] };
    }
    return { ok: false, json: async () => ({}) };
  };

  window.fetch = global.fetch;

  const loaderSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain-loader.js'), 'utf8');
  window.eval(loaderSrc);

  await window.DomainLoader.init();

  assert.strictEqual(window.DomainLoader.typeConflicts.length, 0, 'No conflicts expected after init');

  assert.strictEqual(window.DomainLoader.activateDomain('alpha'), true, 'Alpha domain should activate');
  assert.strictEqual(window.DomainLoader.typeConflicts.length, 0, 'Single domain activation should not create conflicts');

  assert.strictEqual(window.DomainLoader.activateDomain('beta'), true, 'Beta domain should activate');
  assert.strictEqual(window.DomainLoader.typeConflicts.length, 1, 'Duplicate type should register a conflict');

  const [conflict] = window.DomainLoader.typeConflicts;
  assert.strictEqual(conflict.typeKey, 'duplicate');
  assert.strictEqual(conflict.originalDomain, 'alpha');
  assert.strictEqual(conflict.duplicateDomain, 'beta');

  assert.strictEqual(window.NodeTypes.duplicate.color, '#111111', 'Original domain definition should be preserved');

  const warning = notifications.find(note => note.type === 'warning');
  assert.ok(warning, 'User should receive a warning notification');
  assert.ok(warning.message.includes('Duplicate node types skipped'));
  assert.ok(warning.message.includes('Alpha'));
  assert.ok(warning.message.includes('Beta'));

  const statusText = window.document.getElementById('domainStatus').textContent;
  assert.ok(statusText.includes('Conflicts detected'), 'Status message should highlight conflicts');

  console.log('domain-loader-duplicate-type-conflict.test.js passed');
})();
