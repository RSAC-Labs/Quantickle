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

// Load GraphRenderer script
const graphScript = fs.readFileSync(path.join(__dirname, '..', 'js', 'graph.js'), 'utf8');
window.eval(graphScript);

// Stub GraphAreaEditor to track calls
let applyCalled = false;
window.GraphAreaEditor = { applySettings: () => { applyCalled = true; } };

// Initialize Cytoscape instance
const cy = cytoscape({ headless: true, styleEnabled: true });
window.GraphRenderer.cy = cy;

// Graph data with positions (using Neo4j-style position objects)
const graphData = {
  nodes: [
    { id: 'a', label: 'A', position: { x: 10, y: 20 } },
    { id: 'b', label: 'B', position: { x: 50, y: 60 } }
  ],
  edges: []
};

window.GraphRenderer.injectGraphAsContainer(graphData, 'TestGraph');

const idA = 'neo4j_TestGraph:a';
const idB = 'neo4j_TestGraph:b';
const posA = cy.getElementById(idA).position();
const posB = cy.getElementById(idB).position();

assert.notStrictEqual(posA.x, posB.x, 'Nodes should have distinct x positions');
assert.notStrictEqual(posA.y, posB.y, 'Nodes should have distinct y positions');
assert.strictEqual(posA.x, 0, 'Node A should be at offset origin');
assert.strictEqual(posA.y, 0, 'Node A should be at offset origin');
assert.strictEqual(posB.x, 40, 'Node B x offset should be preserved');
assert.strictEqual(posB.y, 40, 'Node B y offset should be preserved');
assert.ok(applyCalled, 'GraphAreaEditor.applySettings should be called');

console.log('neo4j-container-placement.test.js passed');
