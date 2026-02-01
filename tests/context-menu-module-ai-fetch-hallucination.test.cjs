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

class MockPipeline {
  async retrieve() {
    return [{ content: 'no relevant ioc here', metadata: { url: 'http://example.com', title: 'Example' } }];
  }
  buildPrompt() {
    return 'context mentioning valid.com only';
  }
  async queryOpenAI() {
    return {
      choices: [
        { message: { content: '{"summary":{"title":"","body":""},"iocs":{"domains":["valid.com","invalid.com"]}}' } }
      ]
    };
  }
}

window.RAGPipeline = MockPipeline;

(async () => {
  const data = await menuModule.aiFetch(node);
  const domains = data.reports[0].iocs.domains;
  if (domains.length !== 1 || domains[0] !== 'valid.com') {
    throw new Error('Hallucinated IOC was not filtered');
  }
  console.log('AI fetch filters hallucinated IOC using OpenAI input');
  process.exit(0);
})();
