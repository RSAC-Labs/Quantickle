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

const content = `\`\`\`json
{
  "relationships": {
    "malware": {
      "Love_Chat.apk": [
        "updatemind52.com",
        "quickhelpsolve.com"
      ],
      "Rafel RAT": [
        "kutcat-rat.com"
      ]
    },
    "domains": [
      "play-mock.test": [
        "Associated with phishing and malware operations",
        "Linked to unregistered entities and fraudulent activities"
      ],
      "updatemind52.com": [
        "Hosts APKs and involved in C2"
      ]
    ]
  }
}
\`\`\``;

const parsed = mod.extractJsonFromCompletion({ completion: { choices: [{ message: { content } }] } });
if (!parsed || !parsed.relationships || Array.isArray(parsed.relationships.domains) || !parsed.relationships.domains['play-mock.test']) {
  throw new Error('Failed to repair and parse invalid JSON');
}
console.log('ContextMenuModule.extractJsonFromCompletion repairs arrays with keyed items');
