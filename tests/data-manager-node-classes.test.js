const { JSDOM } = require('jsdom');
const { performance } = require('perf_hooks');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.performance = performance;

window.UI = { updateGraphFileName: () => {} };

require('../js/features/data-manager/data-manager-module.js');

const createDataManager = () => new window.DataManagerModule({
  cytoscape: null,
  notifications: { show: () => {} },
  config: {}
});

// Internal format with array classes should retain classes and append container when flagged
const dmArray = createDataManager();
dmArray.setGraphData({
  nodes: [
    { id: 'c-array', type: 'container', classes: ['alpha'] }
  ],
  edges: []
});
let processed = dmArray.getGraphData();
const arrayNode = processed.nodes.find(n => n.id === 'c-array');
if (!arrayNode) {
  throw new Error('Container node from array source missing');
}
if (arrayNode.classes !== 'alpha container') {
  throw new Error(`Container classes from array not preserved: ${arrayNode.classes}`);
}

dmArray.setGraphData({
  nodes: [
    { id: 'c-array-non', type: 'person', classes: ['beta', 'gamma'] }
  ],
  edges: []
});
processed = dmArray.getGraphData();
const nonContainer = processed.nodes.find(n => n.id === 'c-array-non');
if (!nonContainer) {
  throw new Error('Non-container node from array source missing');
}
if (nonContainer.classes !== 'beta gamma') {
  throw new Error(`Non-container classes from array not normalized: ${nonContainer.classes}`);
}

// Cytoscape format with string classes should retain classes and append container
const dmString = createDataManager();
dmString.setGraphData({
  nodes: [
    { data: { id: 'c-string', type: 'container' }, classes: 'delta' }
  ],
  edges: []
});
processed = dmString.getGraphData();
const stringNode = processed.nodes.find(n => n.id === 'c-string');
if (!stringNode) {
  throw new Error('Container node from string source missing');
}
if (stringNode.classes !== 'delta container') {
  throw new Error(`Container classes from string not preserved: ${stringNode.classes}`);
}

// Container detection via isContainer flag
const dmFlag = createDataManager();
dmFlag.setGraphData({
  nodes: [
    { id: 'c-flag', type: 'group', isContainer: true }
  ],
  edges: []
});
processed = dmFlag.getGraphData();
const flagNode = processed.nodes.find(n => n.id === 'c-flag');
if (!flagNode) {
  throw new Error('Container node from flag source missing');
}
if (flagNode.classes !== 'container') {
  throw new Error(`Container class not added from flag: ${flagNode.classes}`);
}

console.log('DataManager preserves and normalizes node classes with container support');
process.exit(0);
