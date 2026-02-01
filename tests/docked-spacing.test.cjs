const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

require('../js/graph.js');
const GraphRenderer = window.GraphRenderer;

const cy = cytoscape({ headless: true, styleEnabled: true });
GraphRenderer.cy = cy;

cy.add([
  {
    data: { id: 'c1', label: 'Container 1', width: 200, height: 200 },
    position: { x: 150, y: 120 },
    classes: 'container'
  },
  {
    data: { id: 'c2', label: 'Container 2', width: 200, height: 200 },
    position: { x: 300, y: 240 },
    classes: 'container'
  }
]);

const container1 = cy.getElementById('c1');
const container2 = cy.getElementById('c2');

GraphRenderer.toggleContainerCollapse(container1);
GraphRenderer.toggleContainerCollapse(container2);

const initialPosition1 = { ...container1.position() };
const initialPosition2 = { ...container2.position() };

GraphRenderer.updateDockedContainerPositions();

const afterCollapse1 = container1.position();
const afterCollapse2 = container2.position();

if (Math.abs(afterCollapse1.x - initialPosition1.x) > 0.1 || Math.abs(afterCollapse1.y - initialPosition1.y) > 0.1) {
  throw new Error('Collapsed container 1 should keep its original coordinates');
}

if (Math.abs(afterCollapse2.x - initialPosition2.x) > 0.1 || Math.abs(afterCollapse2.y - initialPosition2.y) > 0.1) {
  throw new Error('Collapsed container 2 should keep its original coordinates');
}

cy.pan({ x: 40, y: -30 });
GraphRenderer.updateDockedContainerPositions();

const pannedPosition1 = container1.position();
const pannedPosition2 = container2.position();

if (Math.abs(pannedPosition1.x - initialPosition1.x) > 0.1 || Math.abs(pannedPosition1.y - initialPosition1.y) > 0.1) {
  throw new Error('Panning should not change collapsed container 1 model coordinates');
}

if (Math.abs(pannedPosition2.x - initialPosition2.x) > 0.1 || Math.abs(pannedPosition2.y - initialPosition2.y) > 0.1) {
  throw new Error('Panning should not change collapsed container 2 model coordinates');
}

cy.zoom(1.5);
GraphRenderer.updateDockedContainerPositions();

const zoomedWidth = parseFloat(container1.style('width'));
const zoomedHeight = parseFloat(container1.style('height'));
const expectedWidth = 100 / cy.zoom();
const expectedHeight = 30 / cy.zoom();

if (Math.abs(zoomedWidth - expectedWidth) > 0.1 || Math.abs(zoomedHeight - expectedHeight) > 0.1) {
  throw new Error('Collapsed containers should scale their model dimensions to keep a consistent rendered size');
}

const zoomedPosition1 = container1.position();
const zoomedPosition2 = container2.position();

if (Math.abs(zoomedPosition1.x - initialPosition1.x) > 0.1 || Math.abs(zoomedPosition1.y - initialPosition1.y) > 0.1) {
  throw new Error('Zooming should not change collapsed container 1 model coordinates');
}

if (Math.abs(zoomedPosition2.x - initialPosition2.x) > 0.1 || Math.abs(zoomedPosition2.y - initialPosition2.y) > 0.1) {
  throw new Error('Zooming should not change collapsed container 2 model coordinates');
}

console.log('Collapsed containers retain their positions while remaining resizable');
process.exit(0);
