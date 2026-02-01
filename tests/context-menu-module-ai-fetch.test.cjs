const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

const messages = [];
const notifications = { show: (msg, type) => messages.push({ msg, type }) };

// Provide integration manager with stored keys
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

let retrieveParams;
let queryParams;
class MockPipeline {
  async retrieve(ioc, key) {
    retrieveParams = { ioc, key };
    return [{ content: 'context', metadata: { url: 'http://example.com', title: 'Example' } }];
  }
  buildPrompt() { return 'prompt'; }
  async queryOpenAI(prompt, key) {
    queryParams = { prompt, key };
    return { choices: [{ message: { content: '{}' } }] };
  }
}
window.RAGPipeline = MockPipeline;

(async () => {
  await menuModule.aiFetch(node);
  if (retrieveParams.key !== 'SERP_KEY' || queryParams.key !== 'OPENAI_KEY') {
    throw new Error('API keys not passed to pipeline');
  }
  const startMsg = messages.find(m => m.msg.includes('Fetching AI context'));
  const completeMsg = messages.find(m => m.msg.includes('AI fetch completed'));
  if (!startMsg || !completeMsg) {
    throw new Error('Missing notifications for AI fetch');
  }
  console.log('ContextMenuModule.aiFetch sends IOC and provides feedback');
  process.exit(0);
})();

