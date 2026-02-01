const { test } = require('node:test');
const assert = require('assert');
const { JSDOM } = require('jsdom');

test('node editor proxies remote icon URLs through DomainLoader', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously' });
  const { window } = dom;

  global.window = window;
  global.document = window.document;

  window.IconConfigs = {};
  window.GraphRenderer = {
    lightenColor: () => '#ffffff'
  };

  let resolvedWith = null;
  window.DomainLoader = {
    resolveIcon: async (url) => {
      resolvedWith = url;
      return `/api/proxy?url=${encodeURIComponent(url)}`;
    }
  };

  window.Image = undefined;

  require('../js/features/node-editor/node-editor-module.js');

  const applyIconStyle = window.NodeEditorModule.prototype.applyIconStyle;

  const node = {
    _data: { color: '#222222' },
    _style: {},
    data(key, value) {
      if (value === undefined) {
        return this._data[key];
      }
      this._data[key] = value;
      return this;
    },
    style(prop, value) {
      if (typeof prop === 'string') {
        if (value === undefined) {
          return this._style[prop];
        }
        this._style[prop] = value;
        return this;
      }
      if (prop && typeof prop === 'object') {
        Object.assign(this._style, prop);
      }
      return this;
    }
  };

  const notifications = { show() {} };

  applyIconStyle.call({ notifications }, node, 'https://example.com/profile.png');

  await new Promise(resolve => setTimeout(resolve, 0));

  assert.strictEqual(resolvedWith, 'https://example.com/profile.png');
  const proxied = `/api/proxy?url=${encodeURIComponent('https://example.com/profile.png')}`;
  assert.strictEqual(node.data('icon'), 'https://example.com/profile.png');
  assert.strictEqual(node.data('backgroundImage'), `url("${proxied}")`);
  assert.strictEqual(node.style('background-image'), `url("${proxied}")`);
  assert.strictEqual(window.IconConfigs['https://example.com/profile.png'], proxied);
});
