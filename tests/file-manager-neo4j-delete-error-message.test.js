const { test } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('deleteGraphFromNeo4j surfaces helpful guidance on 404 responses', async () => {
  const originalWindow = global.window;
  const originalDocument = global.document;
  const originalFetch = global.fetch;

  const window = {
    document: {},
    navigator: { userAgent: 'node' },
    location: { origin: 'http://localhost', href: 'http://localhost/' },
    console,
  };
  window.window = window;

  global.window = window;
  global.document = window.document;

  const scriptPath = path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js');
  const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
  const loadModule = new Function('window', 'document', scriptContent);
  loadModule(window, window.document);

  window.IntegrationsManager = { getNeo4jCredentials: () => ({}) };

  let requestedUrl;
  let requestedOptions;

  window.fetch = async (url, options) => {
    requestedUrl = url;
    requestedOptions = options;
    return {
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ error: 'Route not found' })
    };
  };
  global.fetch = window.fetch;

  const fm = new window.FileManagerModule({
    cytoscape: { nodes: () => [], edges: () => [] },
    notifications: { show: () => {} },
    papaParseLib: {},
  });

  try {
    await assert.rejects(
      fm.deleteGraphFromNeo4j('MissingGraph'),
      err => {
        assert.match(err.message, /404/, 'error should mention HTTP status');
        assert.match(err.message, /API base path/, 'error should guide the user to check API routing');
        assert.match(err.message, /Route not found/, 'error should surface server response details');
        assert.ok(requestedUrl.endsWith('/neo4j/graph?name=MissingGraph'), 'delete should use query parameter for graph name');
        assert.strictEqual(requestedOptions?.method, 'DELETE', 'request method should remain DELETE');
        return true;
      }
    );
  } finally {
    global.window = originalWindow;
    global.document = originalDocument;
    global.fetch = originalFetch;
  }
});

test('deleteGraphFromNeo4j trims HTML responses to the meaningful message', async () => {
  const originalWindow = global.window;
  const originalDocument = global.document;
  const originalFetch = global.fetch;

  const window = {
    document: {},
    navigator: { userAgent: 'node' },
    location: { origin: 'http://localhost', href: 'http://localhost/' },
    console,
  };
  window.window = window;

  global.window = window;
  global.document = window.document;

  const scriptPath = path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js');
  const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
  const loadModule = new Function('window', 'document', scriptContent);
  loadModule(window, window.document);

  window.IntegrationsManager = { getNeo4jCredentials: () => ({}) };

  const htmlResponse = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head><title>Error</title></head>',
    '<body>',
    '<pre>Cannot DELETE /api/neo4j/graph/example</pre>',
    '</body>',
    '</html>'
  ].join('');

  let requestedUrl;
  let requestedOptions;

  window.fetch = async (url, options) => {
    requestedUrl = url;
    requestedOptions = options;
    return {
      ok: false,
      status: 404,
      text: async () => htmlResponse,
    };
  };
  global.fetch = window.fetch;

  const fm = new window.FileManagerModule({
    cytoscape: { nodes: () => [], edges: () => [] },
    notifications: { show: () => {} },
    papaParseLib: {},
  });

  try {
    await assert.rejects(
      fm.deleteGraphFromNeo4j('example'),
      err => {
        assert.match(err.message, /404/, 'error should mention HTTP status');
        assert.match(err.message, /Cannot DELETE \/api\/neo4j\/graph\/example/, 'error should highlight the server detail');
        assert.ok(!/<!DOCTYPE/.test(err.message), 'error should not echo raw HTML markup');
        assert.ok(requestedUrl.endsWith('/neo4j/graph?name=example'), 'graph name should be passed as a query parameter');
        assert.strictEqual(requestedOptions?.method, 'DELETE', 'request should remain a DELETE');
        return true;
      }
    );
  } finally {
    global.window = originalWindow;
    global.document = originalDocument;
    global.fetch = originalFetch;
  }
});

test('deleteGraphFromNeo4j encodes complex graph names in the query string', async () => {
  const originalWindow = global.window;
  const originalDocument = global.document;
  const originalFetch = global.fetch;

  const window = {
    document: {},
    navigator: { userAgent: 'node' },
    location: { origin: 'http://localhost', href: 'http://localhost/' },
    console,
  };
  window.window = window;

  global.window = window;
  global.document = window.document;

  const scriptPath = path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js');
  const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
  const loadModule = new Function('window', 'document', scriptContent);
  loadModule(window, window.document);

  window.IntegrationsManager = { getNeo4jCredentials: () => ({}) };

  let capturedUrl;

  window.fetch = async (url) => {
    capturedUrl = url;
    return { ok: true, status: 200, text: async () => '' };
  };
  global.fetch = window.fetch;

  const fm = new window.FileManagerModule({
    cytoscape: { nodes: () => [], edges: () => [] },
    notifications: { show: () => {} },
    papaParseLib: {},
  });

  const graphName = 'CASE - BlackTech ELF backdoors against Taiwanese companies-2025-10-04T18-0:1';

  try {
    const result = await fm.deleteGraphFromNeo4j(graphName);
    assert.strictEqual(result, true, 'successful deletion should resolve to true');
    assert.ok(
      capturedUrl.endsWith('/neo4j/graph?name=CASE%20-%20BlackTech%20ELF%20backdoors%20against%20Taiwanese%20companies-2025-10-04T18-0%3A1'),
      'graph name should be URL encoded within the query parameter'
    );
  } finally {
    global.window = originalWindow;
    global.document = originalDocument;
    global.fetch = originalFetch;
  }
});
