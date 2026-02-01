const { before, after, test } = require('node:test');
const assert = require('assert');
const http = require('http');

const app = require('../server.js');

let server;
let baseUrl;

before(() => {
    return new Promise(resolve => {
        server = http.createServer(app);
        server.listen(0, () => {
            const { port } = server.address();
            baseUrl = `http://localhost:${port}`;
            resolve();
        });
    });
});

after(() => {
    if (server) {
        server.close();
    }
});

test('serves the main application from the public directory', async () => {
    const response = await fetch(`${baseUrl}/`);
    assert.strictEqual(response.status, 200);
    const body = await response.text();
    assert.ok(body.includes('<!DOCTYPE html>'), 'index.html should be served from public/');
});

test('does not expose server source files through static hosting', async () => {
    const response = await fetch(`${baseUrl}/server.js`);
    assert.strictEqual(response.status, 404);
});

test('prevents directory listings and traversal outside approved static paths', async () => {
    const traversalResponse = await fetch(`${baseUrl}/..%2F.env`);
    assert.strictEqual(traversalResponse.status, 404);

    const configIndexResponse = await fetch(`${baseUrl}/config/`);
    assert.strictEqual(configIndexResponse.status, 404);
});

test('continues to serve approved static assets', async () => {
    const response = await fetch(`${baseUrl}/assets/css/text-callout.css`);
    assert.strictEqual(response.status, 200);
    const body = await response.text();
    assert.ok(body.includes('.text-callout'), 'CSS file should still be available');
});
