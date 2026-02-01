const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const dom = new JSDOM('<!doctype html><html><body><div id="nodeTypeTree"></div></body></html>', {
  runScripts: 'dangerously'
});

const { window } = dom;
global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

let fetchCalls = 0;
const fakeFetch = async () => {
  fetchCalls += 1;
  return { ok: true, json: async () => ({}), text: async () => '' };
};
global.fetch = fakeFetch;
window.fetch = fakeFetch;

window.prompt = () => 'Test Domain';
global.prompt = window.prompt;
window.alert = () => {};
global.alert = window.alert;

window.NodeTypes = {};
window.IconConfigs = {};
window.globalFunctions = { normalizeColor: (color) => color };
window.DataManager = {
  getGraphData: () => ({ nodes: [], edges: [] })
};

const domainLoaderScript = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain-loader.js'), 'utf8');
window.eval(domainLoaderScript);

window.DomainLoader.availableDomains = {
  default: { name: 'Default', folder: null, loaded: true, types: {} }
};
window.DomainLoader.activeDomains = new Set(['default']);
window.DomainLoader.defaultNodeTypes = {};
window.DomainLoader.updateDomainStatus = () => {};

const notifications = [];
window.UI = {
  showNotification: (message) => notifications.push(message)
};

const tablesScript = fs.readFileSync(path.join(__dirname, '..', 'js', 'tables.js'), 'utf8');
window.eval(tablesScript);

(async () => {
  try {
    await window.TableManager.addNewDomain();

    assert.ok(window.DomainLoader.availableDomains.test_domain, 'Domain should be registered locally');
    assert.ok(window.DomainLoader.activeDomains.has('test_domain'), 'Domain should be marked active');
    assert.strictEqual(fetchCalls, 0, 'Domain creation should not trigger fetch');
    assert.ok(notifications.some((msg) => msg.includes('Test Domain')), 'User should be notified about the new domain');

    console.log('table-manager-add-domain.test.js passed');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
