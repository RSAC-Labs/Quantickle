const { test } = require('node:test');
const assert = require('assert');
const http = require('http');

const app = require('../server.js');
const DEFAULT_BROWSER_HEADERS = app._internals.DEFAULT_BROWSER_HEADERS;

function startServer(instance) {
  return new Promise(resolve => {
    const server = instance.listen(0, () => resolve(server));
  });
}

async function configureAllowlist(entries) {
  await app._internals.setProxyAllowlist(entries, { persist: false });
}

test('proxy rejects requests until allowlist is configured', async () => {
  const upstream = await startServer(http.createServer((req, res) => {
    res.end('ok');
  }));
  const proxy = await startServer(app);
  const target = `http://localhost:${upstream.address().port}/`;

  const defaultState = app._internals.getProxyAllowlist();
  assert.deepStrictEqual(defaultState, []);
  assert.strictEqual(app._internals.isAllowedHost('localhost'), false);

  let response = await fetch(`http://localhost:${proxy.address().port}/api/proxy?url=${encodeURIComponent(target)}`);
  assert.strictEqual(response.status, 403);

  await configureAllowlist(['localhost']);

  response = await fetch(`http://localhost:${proxy.address().port}/api/proxy?url=${encodeURIComponent(target)}`);
  assert.strictEqual(response.status, 200);

  upstream.close();
  proxy.close();
});

test('proxy enforces host allowlist and permits configured hosts', async () => {
  const upstream = await startServer(http.createServer((req, res) => {
    res.end('ok');
  }));
  const proxy = await startServer(app);
  const target = `http://localhost:${upstream.address().port}/`;

  await configureAllowlist(['localhost']);

  const allowedResp = await fetch(`http://localhost:${proxy.address().port}/api/proxy?url=${encodeURIComponent(target)}`);
  const allowedText = await allowedResp.text();
  assert.strictEqual(allowedResp.status, 200);
  assert.strictEqual(allowedText, 'ok');

  await configureAllowlist(['example.com']);

  const blockedResp = await fetch(`http://localhost:${proxy.address().port}/api/proxy?url=${encodeURIComponent(target)}`);
  assert.strictEqual(blockedResp.status, 403);

  upstream.close();
  proxy.close();
});

test('proxy allowlist admin endpoint is removed', async () => {
  const proxy = await startServer(app);
  const baseUrl = `http://localhost:${proxy.address().port}/api/proxy-allowlist`;

  let response = await fetch(baseUrl);
  assert.strictEqual(response.status, 404);

  response = await fetch(baseUrl, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ allowlist: ['localhost'] })
  });
  assert.strictEqual(response.status, 404);

  proxy.close();
});

test('proxy honors wildcard allowlist entries', async () => {
  const upstream = await startServer(http.createServer((req, res) => {
    res.end('ok');
  }));
  const proxy = await startServer(app);
  const target = `http://localhost:${upstream.address().port}/`;

  await configureAllowlist(['*']);
  let response = await fetch(`http://localhost:${proxy.address().port}/api/proxy?url=${encodeURIComponent(target)}`);
  assert.strictEqual(response.status, 200);

  await configureAllowlist(['local*']);
  response = await fetch(`http://localhost:${proxy.address().port}/api/proxy?url=${encodeURIComponent(target)}`);
  assert.strictEqual(response.status, 200);

  await configureAllowlist(['*host']);
  response = await fetch(`http://localhost:${proxy.address().port}/api/proxy?url=${encodeURIComponent(target)}`);
  assert.strictEqual(response.status, 200);

  await configureAllowlist(['example.*']);
  response = await fetch(`http://localhost:${proxy.address().port}/api/proxy?url=${encodeURIComponent(target)}`);
  assert.strictEqual(response.status, 403);

  upstream.close();
  proxy.close();
});

test('proxy blocks unsupported protocols', async () => {
  const proxy = await startServer(app);
  await configureAllowlist(['localhost']);
  const resp = await fetch(`http://localhost:${proxy.address().port}/api/proxy?url=${encodeURIComponent('file:///etc/passwd')}`);
  assert.strictEqual(resp.status, 400);
  proxy.close();
});

test('proxy forwards authorization header when requested', async () => {
  let receivedHeaders = {};
  const upstream = await startServer(http.createServer((req, res) => {
    receivedHeaders = req.headers;
    res.end(req.headers['authorization'] || '');
  }));
  const proxy = await startServer(app);
  const target = `http://localhost:${upstream.address().port}/protected`;
  const expectedHeader = 'Basic Zm9vOmJhcg==';
  const customAgent = 'QuantickleTest/1.0';
  const customLanguage = 'fr-FR';
  const customFetchSite = 'same-origin';

  await configureAllowlist(['localhost']);

  const resp = await fetch(`http://localhost:${proxy.address().port}/api/proxy?url=${encodeURIComponent(target)}`, {
    headers: {
      'x-proxy-authorization': expectedHeader,
      'x-proxy-user-agent': customAgent,
      'x-proxy-accept-language': customLanguage,
      'x-proxy-sec-fetch-site': customFetchSite
    }
  });
  const text = await resp.text();

  assert.strictEqual(text, expectedHeader);
  assert.strictEqual(receivedHeaders['user-agent'], customAgent);
  assert.strictEqual(receivedHeaders['accept-language'], customLanguage);
  assert.strictEqual(receivedHeaders['sec-fetch-site'], customFetchSite);

  upstream.close();
  proxy.close();
});

test('proxy adjusts sec-fetch headers based on referer relationship', async () => {
  let capturedHeaders = {};
  const upstream = await startServer(http.createServer((req, res) => {
    capturedHeaders = req.headers;
    res.end('ok');
  }));
  const proxy = await startServer(app);
  const target = `http://localhost:${upstream.address().port}/referer-check`;

  await configureAllowlist(['localhost']);

  const crossSiteReferer = 'https://example.com/source';
  let response = await fetch(`http://localhost:${proxy.address().port}/api/proxy?url=${encodeURIComponent(target)}`, {
    headers: {
      'x-proxy-referer': crossSiteReferer
    }
  });
  await response.text();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(capturedHeaders['sec-fetch-site'], 'cross-site');
  assert.strictEqual(capturedHeaders['sec-fetch-mode'], 'navigate');
  assert.strictEqual(capturedHeaders['sec-fetch-user'], '?1');
  assert.strictEqual(capturedHeaders['referer'], crossSiteReferer);

  response = await fetch(`http://localhost:${proxy.address().port}/api/proxy?url=${encodeURIComponent(target)}`, {
    headers: {
      'x-proxy-referer': crossSiteReferer,
      'x-proxy-sec-fetch-dest': 'empty'
    }
  });
  await response.text();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(capturedHeaders['sec-fetch-site'], 'cross-site');
  assert.strictEqual(capturedHeaders['sec-fetch-mode'], 'cors');
  assert.strictEqual(capturedHeaders['sec-fetch-user'], undefined);
  assert.strictEqual(capturedHeaders['sec-fetch-dest'], 'empty');

  const invalidReferer = 'http://';
  response = await fetch(`http://localhost:${proxy.address().port}/api/proxy?url=${encodeURIComponent(target)}`, {
    headers: {
      'x-proxy-referer': invalidReferer
    }
  });
  await response.text();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(capturedHeaders['sec-fetch-site'], DEFAULT_BROWSER_HEADERS['sec-fetch-site']);
  assert.strictEqual(capturedHeaders['sec-fetch-mode'], DEFAULT_BROWSER_HEADERS['sec-fetch-mode']);
  assert.strictEqual(capturedHeaders['sec-fetch-user'], DEFAULT_BROWSER_HEADERS['sec-fetch-user']);
  assert.strictEqual(capturedHeaders['referer'], undefined);

  upstream.close();
  proxy.close();
});

test('proxy applies browser-like defaults when caller omits headers', async () => {
  let capturedHeaders = {};
  const upstream = await startServer(http.createServer((req, res) => {
    capturedHeaders = req.headers;
    res.end('ok');
  }));
  const proxy = await startServer(app);
  const target = `http://localhost:${upstream.address().port}/default-headers`;

  await configureAllowlist(['localhost']);

  const resp = await fetch(`http://localhost:${proxy.address().port}/api/proxy?url=${encodeURIComponent(target)}`);
  await resp.text();

  assert.strictEqual(resp.status, 200);
  assert.strictEqual(capturedHeaders['user-agent'], DEFAULT_BROWSER_HEADERS['user-agent']);
  assert.strictEqual(capturedHeaders['accept'], DEFAULT_BROWSER_HEADERS['accept']);
  assert.strictEqual(capturedHeaders['accept-language'], DEFAULT_BROWSER_HEADERS['accept-language']);
  assert.strictEqual(capturedHeaders['accept-encoding'], DEFAULT_BROWSER_HEADERS['accept-encoding']);
  assert.strictEqual(capturedHeaders['sec-fetch-mode'], DEFAULT_BROWSER_HEADERS['sec-fetch-mode']);
  assert.strictEqual(capturedHeaders['sec-fetch-site'], DEFAULT_BROWSER_HEADERS['sec-fetch-site']);
  assert.strictEqual(capturedHeaders['sec-fetch-dest'], DEFAULT_BROWSER_HEADERS['sec-fetch-dest']);
  assert.strictEqual(capturedHeaders['upgrade-insecure-requests'], DEFAULT_BROWSER_HEADERS['upgrade-insecure-requests']);

  upstream.close();
  proxy.close();
});

test('proxy keeps defaults unless explicitly overridden and strips conflicting headers', async () => {
  let capturedHeaders = {};
  const upstream = await startServer(http.createServer((req, res) => {
    capturedHeaders = req.headers;
    res.end('ok');
  }));
  const proxy = await startServer(app);
  const target = `http://localhost:${upstream.address().port}/header-override`;

  await configureAllowlist(['localhost']);

  const baseUrl = `http://localhost:${proxy.address().port}/api/proxy?url=${encodeURIComponent(target)}`;

  let resp = await fetch(baseUrl, {
    headers: {
      'accept': '*/*',
      'cookie': 'session=abc123',
      'sec-fetch-user': '?1',
      'x-proxy-sec-fetch-mode': 'cors'
    }
  });
  await resp.text();

  assert.strictEqual(resp.status, 200);
  assert.strictEqual(capturedHeaders['accept'], DEFAULT_BROWSER_HEADERS['accept']);
  assert.strictEqual(capturedHeaders['cookie'], undefined);
  assert.strictEqual(capturedHeaders['sec-fetch-mode'], 'cors');
  assert.strictEqual(capturedHeaders['sec-fetch-user'], undefined);

  resp = await fetch(baseUrl, {
    headers: {
      'x-proxy-cookie': 'session=override'
    }
  });
  await resp.text();

  assert.strictEqual(resp.status, 200);
  assert.strictEqual(capturedHeaders['cookie'], 'session=override');

  upstream.close();
  proxy.close();
});
