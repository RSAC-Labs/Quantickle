const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

require('../js/features/context-menu/context-menu-module.js');
const ContextMenuModule = window.ContextMenuModule;
const mod = new ContextMenuModule({});

const parsed = {
  iocs: {
    urls: ['http://example.com', 'http://fake.test']
  },
  relationships: {
    indicators: [
      { hash: '1527ef7ac7f79bb1a61747652fd6015942a6c5b18b4d7ac0829dd39842ad735d', url: 'http://example.com' },
      { hash: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', url: 'http://fake.test' }
    ]
  }
};
const text = 'Hash 1527ef7ac7f79bb1a61747652fd6015942a6c5b18b4d7ac0829dd39842ad735d appears alongside http://example.com in this report.';

mod.mergeRelationshipIndicators(parsed);
mod.filterHallucinatedIocs(parsed, text);

if (!parsed.iocs.urls || parsed.iocs.urls.length !== 1 || parsed.iocs.urls[0] !== 'http://example.com') {
  throw new Error('URL filtering failed');
}
if (!parsed.iocs.hashes || parsed.iocs.hashes.length !== 1 || parsed.iocs.hashes[0] !== '1527ef7ac7f79bb1a61747652fd6015942a6c5b18b4d7ac0829dd39842ad735d') {
  throw new Error('Hash filtering failed');
}
if (!parsed.relationships.indicators || parsed.relationships.indicators.length !== 1) {
  throw new Error('Indicator filtering failed');
}
console.log('Relationship indicators are merged and hallucinated IOCs are filtered');
