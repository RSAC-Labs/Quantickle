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

let calls = [];
window.IntegrationsManager = {
  importVirusTotalData: (identifier, queryType) => {
    calls.push({ identifier, queryType });
    return Promise.resolve();
  }
};

(async () => {
  menuModule.queryVirusTotal(node, 'domain');
  await new Promise(r => setTimeout(r, 0));

  if (calls.length !== 1) {
    throw new Error('VirusTotal query not triggered');
  }
  const startMsg = messages.find(m => m.msg.includes('Querying VirusTotal'));
  const completeMsg = messages.find(m => m.msg.includes('VirusTotal query completed'));
  if (!startMsg || !completeMsg) {
    throw new Error('VirusTotal query feedback missing');
  }

  messages.length = 0;
  delete window.IntegrationsManager;
  menuModule.queryVirusTotal(node, 'domain');
  const errorMsg = messages.find(m => m.msg.includes('VirusTotal integration not available'));
  if (!errorMsg) {
    throw new Error('Missing notification for unavailable integration');
  }

  console.log('ContextMenuModule.queryVirusTotal provides user feedback');
  process.exit(0);
})();
