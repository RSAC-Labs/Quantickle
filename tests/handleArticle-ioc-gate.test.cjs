(async () => {
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
  const assertEqual = (actual, expected, msg) => {
    if (actual !== expected) {
      throw new Error(`${msg} (expected ${expected}, got ${actual})`);
    }
  };

  global.window = {};
  global.document = { getElementById: () => null };
  global.localStorage = {
    _store: {},
    getItem(key) { return Object.prototype.hasOwnProperty.call(this._store, key) ? this._store[key] : null; },
    setItem(key, value) { this._store[key] = String(value); },
    removeItem(key) { delete this._store[key]; }
  };

  const ragPipeline = await import('../js/rag-pipeline.js');
  await import('../js/integrations.js');

  const manager = window.IntegrationsManager;
  manager.enforceOpmlHostCooldown = async () => {};
  manager.updateStatus = () => {};

  let graphCalls = 0;
  manager.createGraphFromArticleDocument = async () => { graphCalls += 1; };

  const domainDoc = { content: 'malicious.example.com identified in report', metadata: { url: 'https://source.test/article' } };
  const domainResult = await manager.handleArticleForIocs(
    { link: 'https://source.test/article', title: 'Domain only' },
    'Feed Title',
    'status',
    { ragModule: ragPipeline, fetchPage: async () => domainDoc }
  );
  assert(!domainResult.hasIocs, 'Domain-only article should not have qualifying IOCs');
  assertEqual(graphCalls, 0, 'Graph should not be created for domain-only article');

  const hashDoc = { content: 'hash md5 0123456789abcdef0123456789abcdef present', metadata: { url: 'https://source.test/hash' } };
  graphCalls = 0;
  const hashResult = await manager.handleArticleForIocs(
    { link: 'https://source.test/hash', title: 'Hash article' },
    'Feed Title',
    'status',
    { ragModule: ragPipeline, fetchPage: async () => hashDoc }
  );
  assert(hashResult.hasIocs, 'Hash article should contain qualifying IOCs');
  assertEqual(graphCalls, 1, 'Graph should be created for hash-bearing article');

  const ipDoc = { content: 'Connection observed to 9.9.9.9 overnight', metadata: { url: 'https://source.test/ip' } };
  graphCalls = 0;
  const ipResult = await manager.handleArticleForIocs(
    { link: 'https://source.test/ip', title: 'IP article' },
    'Feed Title',
    'status',
    { ragModule: ragPipeline, fetchPage: async () => ipDoc }
  );
  assert(ipResult.hasIocs, 'IP article should contain qualifying IOCs');
  assertEqual(graphCalls, 1, 'Graph should be created for IP-bearing article');

  const invalidIpDoc = { content: 'Version 999.10.10.10 released today', metadata: { url: 'https://source.test/invalid-ip' } };
  graphCalls = 0;
  const invalidIpResult = await manager.handleArticleForIocs(
    { link: 'https://source.test/invalid-ip', title: 'Invalid IP article' },
    'Feed Title',
    'status',
    { ragModule: ragPipeline, fetchPage: async () => invalidIpDoc }
  );
  assert(!invalidIpResult.hasIocs, 'Invalid IP-like content should not contain qualifying IOCs');
  assertEqual(graphCalls, 0, 'Graph should not be created for invalid IP-like content');

  console.log('handleArticleForIocs respects qualifying IOC rules');
})();
