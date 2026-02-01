const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

const messages = [];
const errors = [];
const notifications = { show: (msg, type) => messages.push({ msg, type }) };

const originalError = console.error;
console.error = (...args) => { errors.push(args.join(' ')); };

window.IntegrationsManager = {
  getSerpApiKey: () => 'SERP_KEY',
  getOpenAIApiKey: () => 'OPENAI_KEY'
};

window.DomainLoader = {
  loadAndActivateDomains: async () => { throw new Error('domain fail'); }
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
  async retrieve() { return [{ content: 'context', metadata: { url: 'http://example.com', title: 'Example' } }]; }
  buildPrompt() { return 'prompt'; }
  async queryOpenAI() { return { choices: [{ message: { content: '{}' } }] }; }
}
window.RAGPipeline = MockPipeline;

(async () => {
  await menuModule.aiFetch(node);
  const warning = messages.find(m => m.type === 'warning' && m.msg.includes('Failed to load cybersecurity domain'));
  if (!warning) {
    throw new Error('No notification for failed domain load');
  }
  const errorLogged = errors.some(e => e.includes('Failed to load cybersecurity domain'));
  if (!errorLogged) {
    throw new Error('Domain load failure not logged');
  }
  console.log('Domain load failures are reported during AI fetch');
  process.exit(0);
})().catch(err => { originalError(err); process.exit(1); });
