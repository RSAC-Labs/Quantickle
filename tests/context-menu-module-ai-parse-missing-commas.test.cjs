const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

require('../js/features/context-menu/context-menu-module.js');
const ContextMenuModule = window.ContextMenuModule;
const mod = new ContextMenuModule({
  notifications: { show(){} },
  cytoscape: {},
  graphOperations: {},
  dataManager: {},
  nodeEditor: {}
});

const content = '```json\n{"iocs":{"domains":["a.com" "b.com"],"hashes":["h1" "h2"]}}\n```';
const parsed = mod.extractJsonFromCompletion({ completion: { choices: [{ message: { content } }] } });
if (!parsed || !parsed.iocs || parsed.iocs.domains.length !== 2 || parsed.iocs.hashes.length !== 2) {
  throw new Error('Failed to repair missing commas in arrays');
}
console.log('ContextMenuModule.extractJsonFromCompletion repairs missing commas in arrays');
