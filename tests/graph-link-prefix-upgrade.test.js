const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;
global.window = window;
global.document = window.document;

const resolverSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'graph-reference-resolver.js'), 'utf8');
window.eval(resolverSrc);
const graphManagerSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'graph-manager.js'), 'utf8');
window.eval(graphManagerSrc);
const fileManagerSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js'), 'utf8');
window.eval(fileManagerSrc);

const legacyNode = {
  id: 'legacy-graph-node',
  type: 'graph',
  graphReference: 'file:Legacy Dashboard',
  info: 'file:Legacy Dashboard'
};
window.GraphManager._upgradeNodeGraphLink(legacyNode);

assert.ok(legacyNode.graphLink, 'Graph link should be populated for legacy references');
assert.strictEqual(legacyNode.graphLink.source, 'file');
assert.strictEqual(legacyNode.graphLink.key, 'Legacy Dashboard.qut');
assert.strictEqual(legacyNode.graphReference, 'Legacy Dashboard.qut');
assert.strictEqual(legacyNode.info, 'Legacy Dashboard.qut');

const notifications = { show: () => {} };
const fm = new window.FileManagerModule({
  cytoscape: null,
  notifications,
  papaParseLib: {},
});

const normalized = fm.normalizeGraphLinkPayload('file:Second Legacy');
assert.ok(normalized, 'File manager normalization should handle prefixed strings');
assert.strictEqual(normalized.source, 'file');
assert.strictEqual(normalized.key, 'Second Legacy.qut');

console.log('graph-link-prefix-upgrade.test.js passed');
