const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

require('../js/config.js');

const containerType = window.NodeTypes && window.NodeTypes.container;
if (!containerType) {
  throw new Error('Container node type missing');
}
const space = containerType.coordinateSpace || {};
if (space.x !== 1000 || space.y !== 1000 || space.z !== 1000) {
  throw new Error('Container coordinate space should be 1000 on all axes');
}
if (!space.origin || space.origin.x !== 500 || space.origin.y !== 500 || space.origin.z !== 500) {
  throw new Error('Container origin should be 500,500,500');
}
console.log('Container node type defines 1000x1000x1000 coordinate space with origin at 500,500,500');
