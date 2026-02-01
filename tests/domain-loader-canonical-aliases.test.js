const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><div id="domainStatus"></div></body></html>',
    {
      runScripts: 'dangerously',
      url: 'http://localhost'
    }
  );

  const { window } = dom;
  global.window = window;
  global.document = window.document;

  window.HTMLCanvasElement.prototype.getContext = () => null;

  window.NodeTypes = {
    default: { color: '#000000', size: 20, shape: 'ellipse', icon: '' },
    server: { color: '#ffffff', size: 28, shape: 'rectangle', icon: '' }
  };
  window.IconConfigs = {};

  window.UI = { showNotification: () => {} };
  window.TableManager = { updateNodeTypesTable: () => {} };

  const manifest = ['assets/domains/cybersecurity/antivirus.json'];
  const definitions = {
    '/assets/domains/cybersecurity/antivirus.json': {
      color: '#123456',
      size: 26,
      shape: 'diamond',
      icon: 'data:image/png;base64,iVBORw0KGgo='
    }
  };

  global.fetch = async (url) => {
    if (url === '/assets/domains/index.json') {
      return { ok: true, json: async () => ({ files: manifest }) };
    }
    if (definitions[url]) {
      return { ok: true, json: async () => definitions[url] };
    }
    return { ok: false, json: async () => ({}) };
  };
  window.fetch = global.fetch;

  const loaderSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain-loader.js'), 'utf8');
  window.eval(loaderSrc);

  await window.DomainLoader.init();

  assert.strictEqual(
    window.NodeTypes['default.server'],
    window.NodeTypes.server,
    'Default domain canonical alias should resolve to the legacy entry'
  );
  assert.ok(
    !Object.keys(window.NodeTypes).includes('default.server'),
    'Canonical aliases should not be enumerable on NodeTypes'
  );
  assert.strictEqual(
    window.DomainLoader.getCanonicalTypeKey('server'),
    'default.server',
    'Canonical lookup should map legacy default types'
  );
  assert.strictEqual(
    window.DomainLoader.getCanonicalTypeKey('default.server'),
    'default.server',
    'Canonical lookup should be idempotent for canonical keys'
  );

  await window.DomainLoader.loadDomain('cybersecurity');
  assert.strictEqual(
    window.DomainLoader.activateDomain('cybersecurity'),
    true,
    'Cybersecurity domain should activate successfully'
  );

  const antivirus = window.NodeTypes.antivirus;
  assert.ok(antivirus, 'Legacy node type key should remain available');

  const canonicalAntivirus = window.NodeTypes['cybersecurity.antivirus'];
  assert.strictEqual(
    canonicalAntivirus,
    antivirus,
    'Canonical alias should reference the same type definition'
  );
  assert.ok(
    !Object.keys(window.NodeTypes).includes('cybersecurity.antivirus'),
    'Domain-prefixed aliases should remain non-enumerable'
  );
  assert.strictEqual(
    window.DomainLoader.getCanonicalTypeKey('antivirus'),
    'cybersecurity.antivirus',
    'Canonical lookup should resolve domain-prefixed names for legacy keys'
  );
  assert.strictEqual(
    window.DomainLoader.getCanonicalTypeKey('cybersecurity.antivirus'),
    'cybersecurity.antivirus',
    'Canonical lookup should support canonical inputs'
  );
  assert.strictEqual(
    window.DomainLoader.getDomainForType('cybersecurity.antivirus'),
    'cybersecurity',
    'Domain lookup should succeed for canonical type names'
  );

  console.log('domain-loader-canonical-aliases.test.js passed');
})();
