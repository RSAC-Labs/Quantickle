const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body><div id="nodeTypeTree"></div></body></html>');

global.window = dom.window;
global.document = dom.window.document;
window.IconConfigs = {};

window.NodeTypes = {
  default: { color: '#000000', size: 20, shape: 'ellipse', icon: '' }
};

window.DomainLoader = {
  availableDomains: {
    default: { name: 'Default', types: window.NodeTypes, loaded: true }
  },
  defaultNodeTypes: window.NodeTypes,
  activeDomains: new Set(['default'])
};

require('../js/tables.js');

// Initial render
window.TableManager.updateNodeTypesTable('');

// Open the default domain branch
const domainNode = document.querySelector('li[data-domain="default"] > .node');
if (!domainNode) {
  throw new Error('Domain node not found');
}
domainNode.dataset.open = 'true';
domainNode.querySelector('.twisty').textContent = '▼';
domainNode.nextElementSibling.style.display = 'block';

// Re-render and ensure branch stays open
window.TableManager.updateNodeTypesTable('');
const domainNodeAfter = document.querySelector('li[data-domain="default"] > .node');
if (domainNodeAfter.dataset.open !== 'true') {
  throw new Error('Branch did not stay open after update');
}

console.log('Node type branch remains open after update');
