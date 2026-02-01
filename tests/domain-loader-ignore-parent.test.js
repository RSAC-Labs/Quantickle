const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Setup DOM and globals
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;
global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

// Stub fetch to simulate API response listing config files
global.fetch = async (filePath) => {
  if (filePath === '/assets/domains/index.json') {
    return { ok: true, json: async () => ({ files: ['assets/domains/domain1/type.json'] }) };
  }
  const localPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  try {
    const fullPath = path.join(__dirname, localPath);
    const text = fs.readFileSync(fullPath, 'utf8');
    return {
      ok: true,
      text: async () => text,
      json: async () => JSON.parse(text)
    };
  } catch (err) {
    return { ok: false, text: async () => '', json: async () => { throw err; } };
  }
};
window.fetch = global.fetch;

// Minimal globals required by DomainLoader
window.NodeTypes = { default: { color: '#000', size: 30, shape: 'ellipse', icon: '' } };
window.IconConfigs = {};

(async () => {
  const domainLoaderScript = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain-loader.js'), 'utf8');
  window.eval(domainLoaderScript);
  await window.DomainLoader.init();

  assert.ok(!window.DomainLoader.availableDomains['..'], 'Parent directory should be ignored');
  assert.ok(window.DomainLoader.availableDomains.domain1, 'Valid domain should be detected');
  console.log('domain-loader-ignore-parent.test.js passed');
})();
