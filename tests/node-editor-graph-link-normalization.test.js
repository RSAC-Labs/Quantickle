const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const { window } = dom;

global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

global.localStorage = { getItem: () => null, setItem: () => {} };

const notifications = { show: () => {} };
const keyboardManager = { disable: () => {}, enable: () => {} };

const cy = cytoscape({ headless: true, styleEnabled: true });

require('../js/features/node-editor/node-editor-module.js');
const editor = new window.NodeEditorModule({ cytoscape: cy, notifications, keyboardManager });

const stringPayload = editor.normalizeGraphLinkPayload('   sample-graph   ');
if (!stringPayload || stringPayload.value !== 'sample-graph') {
  throw new Error('String payload was not normalized correctly');
}
if (stringPayload.source !== 'store') {
  throw new Error('Plain graph identifiers should default to the store source');
}

const filePayload = editor.normalizeGraphLinkPayload('graphs/sample-graph.qut');
if (!filePayload || filePayload.source !== 'file') {
  throw new Error('File-like graph references should be treated as file sources');
}

const objectPayload = editor.normalizeGraphLinkPayload({
  type: 'url',
  url: ' https://example.com/graph ',
  label: 'Example',
  metadata: { foo: 'bar' }
});

if (!objectPayload || objectPayload.type !== 'url' || objectPayload.value !== 'https://example.com/graph') {
  throw new Error('Object payload was not normalized correctly');
}

if (!objectPayload.metadata || objectPayload.metadata.foo !== 'bar') {
  throw new Error('Metadata was not preserved');
}

if (objectPayload.source !== 'url') {
  throw new Error('Explicit URL payloads should preserve the url source');
}

console.log('NodeEditor normalizes graph link payloads');
process.exit(0);
