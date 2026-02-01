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

const domainNode = cy.add({ group: 'nodes', data: { id: 'domain_test', label: 'test.com', type: 'domain' } });
const textNode = cy.add({ group: 'nodes', data: { id: 'text_test', label: 'note', type: 'text' } });

let receivedNodes = null;
window.IntegrationsManager = {
  updateVirusTotalInfoForNodes: async nodes => {
    receivedNodes = nodes;
    return { updated: nodes.length };
  }
};

(async () => {
  await menuModule.quickVirusTotalInfo([domainNode, textNode]);

  if (!receivedNodes || receivedNodes.length !== 1 || receivedNodes[0].id() !== domainNode.id()) {
    throw new Error('Quick VirusTotal info should only target supported nodes');
  }

  const startMsg = messages.find(m => m.msg.includes('Updating VirusTotal info'));
  const successMsg = messages.find(m => m.msg.includes('Updated VirusTotal info'));
  if (!startMsg || !successMsg) {
    throw new Error('User feedback for quick VirusTotal query is missing');
  }

  console.log('ContextMenuModule.quickVirusTotalInfo filters and triggers VT updates');
  process.exit(0);
})();
