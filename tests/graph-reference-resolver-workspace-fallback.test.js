const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const { window } = dom;

global.window = window;
global.document = window.document;

global.fetch = () => {
  throw new Error('fetch should not be invoked when workspace graph is available');
};

const requestedPaths = [];
const graphPayload = {
  nodes: [{ data: { id: 'root', label: 'Root' } }],
  edges: []
};

window.WorkspaceManager = {
  handle: {},
  async readFile(path) {
    requestedPaths.push(path);
    if (path === 'graphs/DASHBOARD Russia 2025.qut') {
      return null;
    }
    if (path === 'DASHBOARD Russia 2025.qut') {
      return {
        async text() {
          return JSON.stringify(graphPayload);
        }
      };
    }
    return null;
  }
};

require('../js/graph-reference-resolver.js');

(async () => {
  const resolver = window.GraphReferenceResolver;
  if (!resolver || typeof resolver.fetch !== 'function') {
    throw new Error('GraphReferenceResolver was not initialized');
  }

  const result = await resolver.fetch({ source: 'file', key: 'DASHBOARD Russia 2025.qut' });
  if (!result || !result.graphData) {
    throw new Error('Resolver did not return graph data from the workspace');
  }
  if (!Array.isArray(result.graphData.nodes) || result.graphData.nodes.length !== graphPayload.nodes.length) {
    throw new Error('Workspace graph data was not parsed correctly');
  }

  if (!requestedPaths.includes('DASHBOARD Russia 2025.qut')) {
    throw new Error('Resolver never attempted the legacy workspace root path');
  }

  console.log('GraphReferenceResolver loads legacy workspace graph files');
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
