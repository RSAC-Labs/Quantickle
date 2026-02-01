const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;
global.window = window;
global.document = window.document;

global.fetch = window.fetch = async (url) => {
  if (url === '/api/neo4j/graph/TestGraph') {
    return {
      ok: true,
      json: async () => ({
        metadata: {
          name: 'TestGraph',
          savedAt: '2024-11-01T10:00:00.000Z',
          graphAreaSettings: {
            background: {
              backgroundColor: '#000000',
              backgroundImage: ' url(/bg.png) '
            }
          },
          metadata: {
            nodeTypeStyles: {
              server: { color: '#123456' }
            }
          }
        },
        nodes: [
          { id: 'n1', type: 'server' }
        ],
        edges: []
      })
    };
  }
  return { ok: false, status: 404 };
};

window.IntegrationsManager = {
  getNeo4jCredentials: () => ({ url: 'neo4j://localhost', username: 'neo4j', password: 'secret' })
};
window.DataManager = {};

let appliedSettings = null;
let loadCalled = false;
let applyCalled = false;
window.QuantickleConfig = {
  graphAreaSettings: {
    mergeWithDefaults: settings => ({ ...settings, merged: true }),
    applySettings: settings => { appliedSettings = settings; },
    applyBackgroundSettings: () => { throw new Error('should not call fallback background'); },
    createDefault: () => ({ background: { backgroundColor: '#111111' } })
  }
};

window.GraphAreaEditor = {
  defaultSettings: { backgroundColor: '#222222' },
  loadSettings: () => { loadCalled = true; },
  applyAllSettings: () => { applyCalled = true; }
};

const scriptPath = path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
window.eval(scriptContent);

const fm = new window.FileManagerModule({
  cytoscape: { elements: () => ({ length: 0 }) },
  notifications: { show: () => {} },
  papaParseLib: {}
});

let appliedGraph = null;
fm.prepareDomainsForGraph = async () => {};
fm.applyGraphData = graph => { appliedGraph = graph; };

(async () => {
  const success = await fm.loadGraphFromNeo4j({ graphName: 'TestGraph' });
  assert.strictEqual(success, true, 'loadGraphFromNeo4j should resolve true');
  assert.ok(appliedGraph, 'applyGraphData should be invoked with graph data');
  assert.strictEqual(appliedGraph.nodes[0].color, '#123456', 'metadata node style should be restored');
  assert.strictEqual(appliedGraph.graphName, 'TestGraph', 'graph name should be restored from metadata');
  assert.deepStrictEqual(appliedGraph.graphAreaSettings, {
    background: {
      backgroundColor: '#000000',
      backgroundImage: 'url(/bg.png)'
    }
  }, 'graph area settings should be normalized onto the graph data');
  assert.strictEqual(
    appliedGraph.metadata.nodeTypeStyles.server.color,
    '#123456',
    'flattened metadata should retain node type styles'
  );
  assert.deepStrictEqual(appliedSettings, {
    background: {
      backgroundColor: '#000000',
      backgroundImage: 'url(/bg.png)'
    },
    merged: true
  }, 'graph area settings should merge defaults and trim image value');
  assert.ok(loadCalled, 'GraphAreaEditor.loadSettings should run when restoring user settings');
  assert.ok(applyCalled, 'GraphAreaEditor.applyAllSettings should run when restoring user settings');
  console.log('file-manager-neo4j-load-styles.test.js passed');
})();
