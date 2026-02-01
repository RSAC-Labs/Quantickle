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
        text: async () => '<!doctype html><html><head></head><body><p>hello world</p></body></html>'
      };
    }
    throw new Error('Unexpected URL: ' + url);
  };

  try {
    const { searchWeb } = require('../data_retrieval/web_search.js');
    const docs = await searchWeb('example', 'dummy', 1);
    assert.strictEqual(docs.length, 1);
    assert.ok(docs[0].content.includes('hello world'));
    console.log('Web search content fetch passes');
  } finally {
    global.fetch = originalFetch;
  }
})();
