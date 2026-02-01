const { test } = require('node:test');
const assert = require('assert');
const { JSDOM } = require('jsdom');

test('checkNeo4jForExistingNodes accepts single label string', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;

  global.window.IntegrationsManager = {
    getNeo4jCredentials: () => ({ url: 'http://db', username: 'neo', password: 'pass' })
  };

  let fetchCalled = null;
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    fetchCalled = { url, options };
    return { ok: true, json: async () => [] };
  };

  global.window.confirm = () => true;

  require('../js/graph.js');
  window.GraphRenderer.cy = { nodes: () => [] };

  await window.GraphRenderer.checkNeo4jForExistingNodes('ioc-label');

  assert.ok(fetchCalled, 'fetch should be called with string label');
  const body = JSON.parse(fetchCalled.options.body);
  assert.deepStrictEqual(body.labels, ['ioc-label']);

  global.fetch = originalFetch;
});
