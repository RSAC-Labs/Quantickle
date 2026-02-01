const { JSDOM } = require('jsdom');
const Rotation3DModule = require('../../js/features/graph-modules/3d-rotation-manager/rotation-3d-module.js');

// Setup minimal DOM environment
const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

global.requestAnimationFrame = () => 1;
global.cancelAnimationFrame = () => {};

// Create two mock Cytoscape instances with separate containers
const container1 = dom.window.document.createElement('div');
container1.style.width = '100px';
container1.style.height = '100px';
const container2 = dom.window.document.createElement('div');
container2.style.width = '100px';
container2.style.height = '100px';
const cy1 = { container: () => container1 };
const cy2 = { container: () => container2 };

const mod = new Rotation3DModule({ cy: cy1 });

// Rotate containers independently
mod.rotate3D('x', 10, false, cy1);
mod.rotate3D('y', 10, false, cy2);

const rot1 = mod.get3DRotation(cy1);
const rot2 = mod.get3DRotation(cy2);
if (rot1.x !== 10 || rot1.y !== 0 || rot2.y !== 10 || rot2.x !== 0) {
  throw new Error('Rotation states not independent');
}

// Ensure transforms applied to respective layers
const layer1 = container1.firstElementChild;
const layer2 = container2.firstElementChild;
if (!layer1.style.transform.includes('rotateX(10deg)') || !layer2.style.transform.includes('rotateY(10deg)')) {
  throw new Error('Rotation layers not transformed correctly');
}

if (layer1.style.transformOrigin !== '500px 500px 500px' || layer2.style.transformOrigin !== '500px 500px 500px') {
  throw new Error('Transform origin not centered at 500px 500px 500px');
}

if (layer1.style.width !== '1000px' || layer1.style.height !== '1000px' ||
    layer2.style.width !== '1000px' || layer2.style.height !== '1000px') {
  throw new Error('Rotation layers do not maintain 1000x1000 space');
}

// Start auto-rotation for both containers
mod.startAutoRotation('x', 1, cy1);
mod.startAutoRotation('y', 1, cy2);
if (!mod.isAutoRotating(cy1) || !mod.isAutoRotating(cy2)) {
  throw new Error('Auto rotation not started for both containers');
}

// Stop auto-rotation
mod.stopAutoRotation(cy1);
mod.stopAutoRotation(cy2);
if (mod.isAutoRotating(cy1) || mod.isAutoRotating(cy2)) {
  throw new Error('Auto rotation not stopped properly');
}
