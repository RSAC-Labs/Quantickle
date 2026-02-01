const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><body></body></html>');

global.window = dom.window;
global.document = dom.window.document;

global.cytoscape = opts => cytoscape({ ...opts, headless: true, styleEnabled: true });

window.UI = { showNotification: () => {} };
window.DataManager = { getGraphData: () => ({ nodes: [], edges: [] }), setGraphData: () => {} };
window.TableManager = { updateTables: () => {}, updateTotalDataTable: () => {} };
window.LODSystem = { init: () => {}, config: { enabled: false } };
window.GraphStyling = { applyDefaultStyles: () => {} };
window.GraphControls = { init: () => {} };
window.SelectionManager = { init: () => {} };
window.GraphEditor = { init: () => {} };
window.EdgeCreator = { init: () => {} };
window.PerformanceManager = { init: () => {} };
window.DebugTools = { init: () => {} };
window.ProgressManager = { init: () => {} };
window.BackgroundGridModule = { init: () => {} };

window.QuantickleConfig = { validation: { enabled: false } };

let nodeValidationCalls = 0;
let edgeValidationCalls = 0;

window.Validation = {
  validators: {
    validateNode: () => {
      nodeValidationCalls += 1;
      return { valid: true, errors: [] };
    },
    validateEdge: () => {
      edgeValidationCalls += 1;
      return { valid: true, errors: [] };
    }
  }
};

require('../js/graph.js');

const renderer = window.GraphRenderer;
renderer.currentNodeIds = null;

const originalEdge = { group: 'edges', data: { id: 'edge-1', source: 'missing-source', target: 'missing-target' } };
const originalNode = { group: 'nodes', data: { id: 'existing-node', label: 'Existing' } };

const batch = [originalEdge, originalNode];

const result = renderer.validateRenderBatch(batch);

if (!result.valid) {
  throw new Error('Validation-disabled path should mark batch as valid');
}

if (result.errors.length !== 0) {
  throw new Error('Validation-disabled path should not return errors');
}

if (!result.validElements.includes(originalEdge)) {
  throw new Error('Original edge element should be preserved');
}

if (!result.validElements.includes(originalNode)) {
  throw new Error('Original node element should be preserved');
}

const autoNodes = result.validElements.filter(el => el.group === 'nodes' && el !== originalNode);

if (!autoNodes.some(el => el.data.id === 'missing-source')) {
  throw new Error('Missing source node should be auto-created');
}

if (!autoNodes.some(el => el.data.id === 'missing-target')) {
  throw new Error('Missing target node should be auto-created');
}

if (!renderer.currentNodeIds.has('existing-node') ||
    !renderer.currentNodeIds.has('missing-source') ||
    !renderer.currentNodeIds.has('missing-target')) {
  throw new Error('currentNodeIds should include all node identifiers');
}

if (nodeValidationCalls !== 0) {
  throw new Error('validateNode should not be called when validation is disabled');
}

if (edgeValidationCalls !== 0) {
  throw new Error('validateEdge should not be called when validation is disabled');
}

if (result.validElements.length < 3) {
  throw new Error('Expected auto-created nodes to be included with original elements');
}

console.log('validateRenderBatch bypasses validators when disabled and preserves elements');
