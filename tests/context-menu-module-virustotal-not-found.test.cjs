const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

const messages = [];
const notifications = { show: (msg, type) => messages.push({ msg, type }) };

require('../js/features/context-menu/context-menu-module.js');
const ContextMenuModule = window.ContextMenuModule;
const cy = cytoscape({ headless: true, styleEnabled: true });

const menuModule = new ContextMenuModule({
  cytoscape: cy,
  notifications,
  graphOperations: {},
  dataManager: {},
  nodeEditor: {}
});

const node = cy.add({ group: 'nodes', data: { id: 'domain_test', label: 'test.com', type: 'domain' } });

window.IntegrationsManager = {
  importVirusTotalData: () => Promise.reject(new Error('Not found in VirusTotal'))
};

(async () => {
  menuModule.queryVirusTotal(node, 'domain');
  await new Promise(r => setTimeout(r, 0));

  const errorMsg = messages.find(m => m.msg === 'Not found in VirusTotal');
  if (!errorMsg) {
    throw new Error('Expected Not found in VirusTotal notification');
  }

  console.log('Displays Not found in VirusTotal when data missing');
  process.exit(0);
})();
