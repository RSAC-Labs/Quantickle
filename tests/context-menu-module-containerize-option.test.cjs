const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

const notifications = { show: () => {} };

const cy = cytoscape({ headless: true, styleEnabled: true });

window.GraphEditorAdapter = {
  addContainer(x, y, options = {}) {
    return cy.add({
      group: 'nodes',
      data: {
        id: `container_${options.label.replace(/\s+/g, '_')}`,
        label: options.label,
        type: 'container',
        width: options.width,
        height: options.height
      },
      position: { x, y }
    });
  }
};

window.GraphRenderer = { arrangeContainerNodes: () => {}, updateContainerBounds: () => {} };

require('../js/features/context-menu/context-menu-module.js');
const ContextMenuModule = window.ContextMenuModule;

const menuModule = new ContextMenuModule({
  cytoscape: cy,
  notifications,
  graphOperations: {},
  dataManager: {},
  nodeEditor: {}
});

const domainNode = cy.add({ group: 'nodes', data: { id: 'd1', label: 'example.com', type: 'domain' } });
const malwareNode = cy.add({ group: 'nodes', data: { id: 'm1', label: 'evil', type: 'malware' } });

menuModule.showGraphMenu(0, 0);
const hasContainerize = Array.from(menuModule.menu.querySelectorAll('.menu-item'))
  .some(item => item.textContent === 'Containerize');

if (!hasContainerize) {
  throw new Error('Containerize option missing in graph context menu');
}

menuModule.containerizeByType();

const domainContainer = cy.nodes().filter(n => n.data('label') === 'domain container').first();
if (!domainContainer || domainContainer.length === 0) {
  throw new Error('Domain container missing');
}
if (domainNode.parent().id() !== domainContainer.id()) {
  throw new Error('Domain node not in domain container');
}

const malwareContainer = cy.nodes().filter(n => n.data('label') === 'malware container').first();
if (!malwareContainer || malwareContainer.length === 0) {
  throw new Error('Malware container missing');
}
if (malwareNode.parent().id() !== malwareContainer.id()) {
  throw new Error('Malware node not in malware container');
}

console.log('Containerize option adds nodes to type-based containers');
process.exit(0);
