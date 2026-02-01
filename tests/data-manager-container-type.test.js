const { JSDOM } = require('jsdom');
const { performance } = require('perf_hooks');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.performance = performance;

window.NodeTypes = {
  server: {},
  client: {},
  database: {},
  service: {},
  container: {}
};
window.UI = { showNotification: () => {} };

require('../js/features/data-manager/data-manager-module.js');

const dm = new window.DataManagerModule({
  cytoscape: null,
  notifications: { show: () => {} },
  config: {}
});

const data = dm.generateSampleData(5);
if (!data.nodes.some(n => n.type === 'container')) {
  throw new Error('Sample data missing container node type');
}
console.log('DataManagerModule generates container node type');
