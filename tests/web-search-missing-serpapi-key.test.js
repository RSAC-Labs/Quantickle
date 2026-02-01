const assert = require('assert');

(async () => {
  const originalKey = process.env.SERPAPI_API_KEY;
  delete process.env.SERPAPI_API_KEY;
  const { retrieveWebContext } = require('../data_retrieval/index.js');
  try {
    await retrieveWebContext('example.com');
    throw new Error('Expected missing SerpAPI key error');
  } catch (err) {
    assert.match(
      err.message,
      /Missing SerpAPI key/,
      'Should throw a helpful message when the SerpAPI key is missing'
    );
    console.log('Missing SerpAPI key error handled correctly');
  } finally {
    process.env.SERPAPI_API_KEY = originalKey;
  }
})();
