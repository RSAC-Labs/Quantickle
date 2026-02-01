const { JSDOM } = require('jsdom');
const Rotation3DModule = require('../../js/features/graph-modules/3d-rotation-manager/rotation-3d-module.js');

// Setup minimal DOM environment
const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

global.requestAnimationFrame = () => 1;
global.cancelAnimationFrame = () => {};

// Create mock Cytoscape instance with a DOM container
const container = dom.window.document.createElement('div');
container.style.width = '400px';
container.style.height = '300px';

const cy = { container: () => container };

const mod = new Rotation3DModule({ cy });

// Record initial size
const widthBefore = container.style.width;
const heightBefore = container.style.height;

// Rotate the container
mod.rotate3D('y', 10, false, cy);

// Rotation should be applied to the inner layer, not the container itself
const rotationLayer = container.firstElementChild;
const containerTransform = container.style.transform || '';
const transform = rotationLayer.style.transform || '';
const origin = rotationLayer.style.transformOrigin || '';
const layerWidth = rotationLayer.style.width;
const layerHeight = rotationLayer.style.height;

if (containerTransform) {
  throw new Error('Container should not be transformed directly');
}

if (transform.includes('translate')) {
  throw new Error('Rotation layer transform includes translation');
}

if (!transform.includes('rotateY(10deg)')) {
  throw new Error('Expected rotation not applied to layer');
}

if (origin !== '500px 500px 500px') {
  throw new Error('Transform origin not centered at 500px 500px 500px');
}

if (layerWidth !== '1000px' || layerHeight !== '1000px') {
  throw new Error('Rotation layer does not maintain 1000x1000 space');
}

if (container.style.width !== widthBefore || container.style.height !== heightBefore) {
  throw new Error('Container size changed during rotation');
}

console.log('Rotation applied without affecting container size or position');

process.exit(0);

