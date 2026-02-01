const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const app = require('../server');
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const originalFetch = global.fetch;
  global.fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/')) {
      return originalFetch(`${baseUrl}${input}`, init);
    }
    return originalFetch(input, init);
  };

  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'dangerously',
    url: baseUrl
  });

  const { window } = dom;
  global.window = window;
  global.document = window.document;
  window.fetch = global.fetch;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.NodeTypes = { default: { color: '#000', size: 30, shape: 'ellipse', icon: '' } };
  window.IconConfigs = {};

  const loaderSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain-loader.js'), 'utf8');
  window.eval(loaderSrc);
  window.DomainLoader.defaultNodeTypes = { ...window.NodeTypes };

  const domainKey = 'integration_test';
  const typeKey = 'transient_type';
  const domainDir = path.join(__dirname, '..', 'config', domainKey);

  await fs.promises.rm(domainDir, { recursive: true, force: true });

  try {
    await window.DomainLoader.fetchAvailableDomains();
    assert.ok(!window.DomainLoader.availableDomains[domainKey], 'Domain should not exist before creation');

    const payload = {
      name: 'Transient Type',
      description: 'Created via REST integration test',
      properties: []
    };

    const putRes = await originalFetch(`${baseUrl}/api/node-types/${domainKey}/${typeKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.ok(putRes.ok, 'Failed to create node type via REST endpoint');

    await window.DomainLoader.fetchAvailableDomains();

    const domain = window.DomainLoader.availableDomains[domainKey];
    assert.ok(domain, 'Domain should be discoverable after REST creation');
    assert.ok(
      domain.files && domain.files.some(rel => rel.endsWith(`${typeKey}.json`)),
      'Domain manifest should include the newly created node type'
    );

    console.log('domain-loader-rest-refreshes-config-index.test.js passed');
  } finally {
    try {
      await originalFetch(`${baseUrl}/api/node-types/${domainKey}/${typeKey}`, { method: 'DELETE' });
    } catch (_) {}
    await fs.promises.rm(domainDir, { recursive: true, force: true });
    await new Promise(resolve => server.close(resolve));
    global.fetch = originalFetch;
    delete global.window;
    delete global.document;
  }
})();
