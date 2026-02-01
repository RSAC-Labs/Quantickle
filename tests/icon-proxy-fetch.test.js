const { test } = require('node:test');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

test('resolveIcon routes remote URLs through backend proxy', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously' });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  window.NodeTypes = {};
  window.IconConfigs = {};
  window.WorkspaceManager = {};
  // Prevent DomainLoader.init from running during test
  window.document.addEventListener = () => {};

  const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain-loader.js'), 'utf8');
  window.eval(script);

  // Avoid file system branch in resolveIcon
  window.DomainLoader.ensureFsApi = () => false;

  let fetchedUrl = '';
  const mockFetch = async url => {
    fetchedUrl = url;
    return { ok: false };
  };
  global.fetch = mockFetch;
  window.fetch = mockFetch;

  const resolved = await window.DomainLoader.resolveIcon('https://example.com/icon.png');
  assert.ok(fetchedUrl.startsWith('/api/proxy?url='));
  assert.ok(fetchedUrl.includes(encodeURIComponent('https://example.com/icon.png')));
  assert.strictEqual(resolved, fetchedUrl);
});
