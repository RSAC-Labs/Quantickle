const assert = require('assert');
const { JSDOM } = require('jsdom');

(async () => {
  const originalFetch = global.fetch;
  global.DOMParser = new JSDOM().window.DOMParser;
  global.fetch = async (url) => {
    if (url.startsWith('/api/serpapi')) {
      return {
        ok: true,
        json: async () => ({ organic_results: [{ link: 'http://example.com/page', title: 'Example Page' }] })
      };
    }
    if (url.startsWith('/api/proxy')) {
      return {
        ok: true,
        text: async () => '<!doctype html><html><head></head><body></body></html>'
      };
    }
    throw new Error('Unexpected URL: ' + url);
  };

  try {
    const { searchWeb, fetchPage } = require('../data_retrieval/web_search.js');
    const docs = await searchWeb('example', 'dummy', 1);
    assert.strictEqual(docs.length, 0, 'Empty pages should be skipped');
    const page = await fetchPage('http://example.com/page');
    assert.strictEqual(page, null, 'fetchPage should return null for empty content');
    console.log('Empty web pages are skipped');
  } finally {
    global.fetch = originalFetch;
  }
})();
