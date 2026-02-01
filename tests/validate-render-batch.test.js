const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');

global.window = dom.window;
global.document = dom.window.document;

// Load validation and graph modules
const Validation = require('../js/validation.js');
window.Validation = Validation;
window.cytoscape = cytoscape;
require('../js/graph.js');

// Prepare batch with one invalid element (missing id)
const batch = [
  { group: 'nodes', data: { id: 'a', type: 'test', label: 'A' } },
  { group: 'nodes', data: { type: 'test', label: 'B' } }, // invalid
  { group: 'edges', data: { id: 'ab', source: 'a', target: 'b' } }
];

const result = window.GraphRenderer.validateRenderBatch(batch);

if (result.errors.length === 0) {
  throw new Error('Expected validation errors');
}

if (result.valid) {
  throw new Error('Batch should be marked invalid');
}

if (result.validElements.length !== 3) {
  throw new Error('Valid elements were not returned correctly');
}

console.log('validateRenderBatch filters invalid elements');
process.exit(0);
