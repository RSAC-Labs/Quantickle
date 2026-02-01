const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

const messages = [];
const notifications = { show: (msg, type) => messages.push({ msg, type }) };

window.IntegrationsManager = {
  getSerpApiKey: () => 'SERP_KEY',
  getOpenAIApiKey: () => 'OPENAI_KEY'
};

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

let queryCalled = false;
class MockPipeline {
  async retrieve() { return []; }
  buildPrompt() { return 'prompt'; }
  async queryOpenAI() { queryCalled = true; return {}; }
}
window.RAGPipeline = MockPipeline;

(async () => {
  await menuModule.aiFetch(node);
  if (queryCalled) {
    throw new Error('OpenAI was queried despite no search results');
  }
  const msg = messages.find(m => m.msg.includes('No results were returned'));
  if (!msg) {
    throw new Error('No notification for missing results');
  }
  console.log('AI fetch aborts on empty web search results');
  process.exit(0);
})();
