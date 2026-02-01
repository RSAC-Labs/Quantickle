const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

global.window.DomainLoader = {
  getDomainForType: type => (type === 'ANONM0S' ? 'hacktivist' : null)
};

global.window.IntegrationsManager = {
  getSerpApiKey: () => 'serp-key',
  getOpenAIApiKey: () => 'openai-key'
};

global.window.DataManager = {
  setGraphData: () => {}
};

const graphData = {
  nodes: [{ data: { id: 'hack_node', info: '' } }],
  edges: []
};

global.window.GraphManager = {
  currentGraph: graphData,
  getCurrentGraphData: () => graphData
};

let capturedPromptType = null;

global.window.RAGPipeline = class {
  async retrieve() {
    return [{ content: 'Sample context about the hacktivist group.', metadata: { title: 'Sample' } }];
  }

  buildPrompt(query, docs, type) {
    capturedPromptType = type;
    return 'PROMPT';
  }

  async queryOpenAI() {
    return {
      choices: [
        {
          message: {
            content: '{"description":"Known hacktivist collective with notable operations."}'
          }
        }
      ]
    };
  }
};

global.window.wrapSummaryHtml = () => '';

const notifications = { show: () => {} };
const cy = cytoscape({ headless: true, styleEnabled: true });

require('../js/features/context-menu/context-menu-module.js');
const ContextMenuModule = window.ContextMenuModule;

const menuModule = new ContextMenuModule({
  cytoscape: cy,
  notifications,
  graphOperations: {},
  dataManager: {},
  nodeEditor: {}
});

(async () => {
  const node = cy.add({ group: 'nodes', data: { id: 'hack_node', label: 'Anon', type: 'ANONM0S' } });
  await menuModule.aiFetch(node);

  if (capturedPromptType !== 'hacktivist') {
    throw new Error('Hacktivist prompt type not used');
  }

  const info = node.data('info');
  if (info !== 'Known hacktivist collective with notable operations.') {
    throw new Error('Hacktivist description not applied to node');
  }

  if (cy.nodes().length !== 1) {
    throw new Error('Unexpected nodes created during hacktivist fetch');
  }

  const graphInfo = graphData.nodes[0].data.info;
  if (graphInfo !== info) {
    throw new Error('Graph data not updated with hacktivist description');
  }

  console.log('Hacktivist AI fetch updated node info without adding nodes');
  process.exit(0);
})();
