const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');
const fs = require('fs');
const path = require('path');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.HTMLCanvasElement.prototype.getContext = () => null;

global.Config = {};

require('../js/features/file-manager/file-manager-module.js');
const FileManagerModule = window.FileManagerModule;

const cy = cytoscape({ headless: true, styleEnabled: true });
const fm = new FileManagerModule({
  cytoscape: cy,
  notifications: { show: () => {} },
  papaParseLib: {}
});

const raw = fs.readFileSync(path.join(__dirname, '..', 'examples', 'donot_team.qut'), 'utf8');
const rawData = JSON.parse(raw);
const graphData = fm.normalizeQutData(rawData);
fm.applyGraphData(graphData);

if (cy.nodes().length !== 70 || cy.edges().length !== 106) {
  throw new Error('Unexpected element counts after importing donot_team.qut');
}

console.log('donot_team.qut imported successfully');
process.exit(0);
