const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously' });
const { window } = dom;
global.window = window;
global.document = window.document;

const scriptPath = path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
window.eval(scriptContent);

const fm = new window.FileManagerModule({
  cytoscape: { elements: () => ({ length: 0 }) },
  notifications: { show: () => {} },
  papaParseLib: {},
});

(async () => {
  const promise = fm.showNeo4jGraphSelection([
    { name: 'g1', savedAt: '2024-05-01T12:00:00.000Z' },
    { name: 'g2', savedAt: '2024-06-01T12:00:00.000Z' },
    { name: 'g3', savedAt: null }
  ]);

  const rows = document.querySelectorAll('#neo4j-graph-select tbody tr');
  assert.strictEqual(rows.length, 3, 'Should render a row for each graph');
  rows[1].click();
  document.getElementById('neo4j-load-confirm').click();
  const choice = await promise;
  assert.strictEqual(choice, 'g2');
  console.log('file-manager-neo4j-load-dialog.test.js passed');
})();
