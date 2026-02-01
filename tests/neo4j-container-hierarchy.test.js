const assert = require('assert');
const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');
const fs = require('fs');
const path = require('path');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const { window } = dom;
global.window = window;
global.document = window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

const graphScript = fs.readFileSync(path.join(__dirname, '..', 'js', 'graph.js'), 'utf8');
window.eval(graphScript);

window.GraphAreaEditor = { applySettings: () => {} };

const cy = cytoscape({ headless: true, styleEnabled: true });
window.GraphRenderer.cy = cy;

const graphData = {
  nodes: [
    { id: 'c', type: 'container', width: 400, height: 300, position: { x: 0, y: 0 } },
    { id: 'n1', parent: 'c', position: { x: 10, y: 20 }, locked: true }
  ],
  edges: []
};

window.GraphRenderer.injectGraphAsContainer(graphData, 'TestGraph');

const containerId = 'neo4j_TestGraph:c';
const nodeId = 'neo4j_TestGraph:n1';

const node = cy.getElementById(nodeId);
const container = cy.getElementById(containerId);

assert.strictEqual(node.data('parent'), containerId, 'Node parent should be container');
assert.strictEqual(container.children().length, 1, 'Container should have one child');
assert.strictEqual(container.data('width'), 400, 'Container width should be preserved');

console.log('neo4j-container-hierarchy.test.js passed');
