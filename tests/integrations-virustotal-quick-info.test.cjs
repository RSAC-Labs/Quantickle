const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

require('../js/integrations.js');

const cy = cytoscape({ headless: true, styleEnabled: true });

const domainNode = cy.add({ group: 'nodes', data: { id: 'n1', label: 'example.com', type: 'domain' } });
const ipNode = cy.add({ group: 'nodes', data: { id: 'n2', label: '1.1.1.1', type: 'ipaddress', info: 'present', timestamp: '2024-01-01T00:00:00.000Z' } });
const urlNode = cy.add({ group: 'nodes', data: { id: 'n3', label: 'https://example.com', type: 'url' } });
const unsupportedNode = cy.add({ group: 'nodes', data: { id: 'n4', label: 'note', type: 'text' } });

let ipFetchCalled = false;

window.IntegrationsManager.fetchVirusTotalDomainInfo = async () => ({
  info: 'domain info',
  infoHtml: 'domain info',
  creationDate: '2024-03-01T00:00:00.000Z'
});
window.IntegrationsManager.fetchVirusTotalIPInfo = async () => {
  ipFetchCalled = true;
  return { info: 'ip info', infoHtml: 'ip info', lastModDate: '2024-03-02T00:00:00.000Z' };
};
window.IntegrationsManager.fetchVirusTotalFileInfo = async () => ({
  info: 'file info',
  infoHtml: 'file info',
  firstSubmissionDate: '2024-03-03T00:00:00.000Z'
});
window.IntegrationsManager.fetchVirusTotalURLInfo = async () => ({
  info: 'url info',
  infoHtml: 'url info',
  lastAnalysisDate: '2024-03-04T00:00:00.000Z'
});

(async () => {
  const result = await window.IntegrationsManager.updateVirusTotalInfoForNodes([
    domainNode,
    ipNode,
    urlNode,
    unsupportedNode
  ]);

  if (domainNode.data('info') !== 'domain info' || domainNode.data('timestamp') !== '2024-03-01T00:00:00.000Z') {
    throw new Error('Domain node was not updated with VirusTotal info');
  }

  if (urlNode.data('info') !== 'url info' || urlNode.data('timestamp') !== '2024-03-04T00:00:00.000Z') {
    throw new Error('URL node was not updated with VirusTotal info');
  }

  if (ipFetchCalled) {
    throw new Error('IP node fetch should be skipped when info and timestamp exist');
  }

  if (result.updated !== 2 || result.skippedUnsupported !== 1 || result.skippedWithData !== 1) {
    throw new Error('VirusTotal info update statistics are incorrect');
  }

  console.log('IntegrationsManager.updateVirusTotalInfoForNodes refreshes info without adding nodes');
  process.exit(0);
})();
