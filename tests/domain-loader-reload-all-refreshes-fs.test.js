const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { Blob } = require('buffer');

(async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost'
  });

  const { window } = dom;
  global.window = window;
  global.document = window.document;
  global.Blob = global.Blob || Blob;
  window.Blob = global.Blob;

  window.NodeTypes = {
    default: { color: '#000', size: 30, shape: 'ellipse', icon: '' }
  };
  window.IconConfigs = {};

  // Enable File System Access API path
  window.showDirectoryPicker = async () => ({});

  const sampleInitial = { color: '#123', size: 10, shape: 'ellipse', icon: '' };
  const localFiles = new Map([
    ['assets/domains/sample/sample-type.json', JSON.stringify(sampleInitial)]
  ]);

  const workspace = {
    handle: {},
    async listFiles(subdir, extension) {
      return Array.from(localFiles.keys()).filter(rel => {
        return rel.startsWith(subdir + '/') && (!extension || rel.endsWith(extension));
      });
    },
    async readFile(rel) {
      const content = localFiles.get(rel);
      if (!content) return null;
      return {
        async text() {
          return content;
        }
      };
    },
    async saveFile(rel, content) {
      let text;
      if (content && typeof content.text === 'function') {
        text = await content.text();
      } else if (typeof content === 'string') {
        text = content;
      } else {
        text = String(content);
      }
      localFiles.set(rel, text);
    },

    async removeFile(rel) {
      localFiles.delete(rel);
    },

    async getSubDirHandle() {
      return {};
    }
  };

  window.WorkspaceManager = workspace;

  let manifest = ['assets/domains/sample/sample-type.json'];

  const definitions = {
    'assets/domains/sample/sample-type.json': sampleInitial,
    'assets/domains/fresh/fresh-type.json': { color: '#abc', size: 15, shape: 'ellipse', icon: '' }
  };

  const jsonResponse = (data) => {
    const text = JSON.stringify(data);
    return {
      ok: true,
      json: async () => data,
      text: async () => text,
      blob: async () => new Blob([text], { type: 'application/json' })
    };
  };

  global.fetch = async (url) => {
    if (url === '/assets/domains/index.json') {
      return jsonResponse({ files: manifest });
    }
    if (url.startsWith('/assets/domains/')) {
      const key = url.startsWith('/') ? url.slice(1) : url;
      const def = definitions[key];
      if (!def) {
        return { ok: false, json: async () => ({}) };
      }
      return jsonResponse(def);
    }
    return { ok: false, json: async () => ({}) };
  };
  window.fetch = global.fetch;

  const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain-loader.js'), 'utf8');
  window.eval(script);

  await window.DomainLoader.init();

  const setCalls = [];
  const storageProto = Object.getPrototypeOf(window.localStorage);
  const originalSetItem = storageProto.setItem;
  storageProto.setItem = function(key, value) {
    setCalls.push({ key, value: String(value) });
    return originalSetItem.call(this, key, value);
  };

  window.localStorage.setItem('domain_sample_json', JSON.stringify({ stale: true }));
  window.localStorage.setItem('domain_unknown_json', JSON.stringify({ other: true }));

  assert(window.DomainLoader.availableDomains.sample, 'sample domain should be detected initially');
  assert(!window.DomainLoader.availableDomains.fresh, 'fresh domain should not exist before reload');

  // Update server definitions and manifest to simulate new domain and updated file
  definitions['assets/domains/sample/sample-type.json'] = { color: '#456', size: 20, shape: 'ellipse', icon: '' };
  manifest = ['assets/domains/sample/sample-type.json', 'assets/domains/fresh/fresh-type.json'];

  await window.DomainLoader.forceReloadAllDomains();

  storageProto.setItem = originalSetItem;


  const freshDomain = window.DomainLoader.availableDomains.fresh;
  assert(freshDomain, 'fresh domain should be discovered after reload');
  assert(freshDomain.loaded, 'fresh domain should be loaded after reload');
  assert.strictEqual(freshDomain.types['fresh-type'].color, '#abc');
  assert.strictEqual(window.DomainLoader.typeDomainMap['fresh-type'], 'fresh');

  const sampleDomain = window.DomainLoader.availableDomains.sample;
  assert(sampleDomain, 'sample domain should still exist');
  assert.strictEqual(sampleDomain.types['sample-type'].color, '#456');

  assert.strictEqual(JSON.parse(localFiles.get('assets/domains/sample/sample-type.json')).color, '#456', 'local sample file should refresh');
  assert(localFiles.has('assets/domains/fresh/fresh-type.json'), 'local store should include new fresh file');
  assert.strictEqual(JSON.parse(localFiles.get('tmp/assets/domains/sample/sample-type.json')).color, '#123', 'original sample file should be moved to tmp');

  const nullified = setCalls.filter(call => call.key === 'domain_sample_json' && call.value === 'null');
  assert(nullified.length >= 1, 'domain_sample_json cache should be nulled during reload');
  const dirtyMarked = setCalls.filter(call => call.key === 'domain_sample_dirty' && call.value === '1');
  assert(dirtyMarked.length >= 1, 'domain_sample_dirty should be marked during reload');
  const unknownNullified = setCalls.filter(call => call.key === 'domain_unknown_json' && call.value === 'null');
  assert(unknownNullified.length >= 1, 'unknown domain cache should also be nulled');
  const unknownDirty = setCalls.filter(call => call.key === 'domain_unknown_dirty' && call.value === '1');
  assert(unknownDirty.length >= 1, 'unknown domain cache should be marked dirty');

  const cachedSample = JSON.parse(window.localStorage.getItem('domain_sample_json'));
  assert.strictEqual(cachedSample['sample-type'].color, '#456', 'cache should update with new server data');
  assert(!window.localStorage.getItem('domain_sample_dirty'), 'dirty flag should be cleared after reload');
  assert.strictEqual(window.localStorage.getItem('domain_unknown_json'), 'null', 'unknown cache should remain nulled');
  assert.strictEqual(window.localStorage.getItem('domain_unknown_dirty'), '1', 'unknown cache should stay marked dirty');


  console.log('domain-loader-reload-all-refreshes-fs.test.js passed');
})();

