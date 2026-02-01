const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body><textarea id="virustotalBlocklist"></textarea></body></html>', { url: 'http://localhost' });

global.window = dom.window;
global.document = dom.window.document;
global.localStorage = dom.window.localStorage;
window.HTMLCanvasElement.prototype.getContext = () => null;

require('../js/integrations.js');
const IntegrationsManager = window.IntegrationsManager;
IntegrationsManager.runtime.vtBlocklist = [];

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

const node = cy.add({ group: 'nodes', data: { id: 'd1', label: 'sub.example.com', type: 'domain' } });
menuModule.showNodeMenu(0, 0, [node]);

const items = Array.from(menuModule.menu.querySelectorAll('.menu-item')).map(i => i.textContent.trim());
if (!items.includes('Add to VT blocklist')) {
  throw new Error('Add to VT blocklist option missing');
}

menuModule.addDomainToVTBlocklist(node);
if (!IntegrationsManager.getVTBlocklist().includes('example.com')) {
  throw new Error('Parent domain not added to blocklist');
}
const successMsg = messages.find(m => m.msg.includes('Added example.com'));
if (!successMsg) {
  throw new Error('Success notification missing');
}

console.log('ContextMenuModule.addDomainToVTBlocklist adds parent domain to blocklist');
process.exit(0);
