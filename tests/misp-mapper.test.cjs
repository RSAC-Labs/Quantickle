const assert = require('assert');
let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (err) {
  JSDOM = null;
}
const fs = require('fs');
const path = require('path');

(async () => {
  function createMinimalDom() {
    const document = {
      readyState: 'loading',
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      createElement: () => ({ style: {} }),
      body: {},
      documentElement: {}
    };
    const window = {
      document,
      navigator: { userAgent: 'node' },
      addEventListener: () => {},
      removeEventListener: () => {}
    };
    document.defaultView = window;
    window.HTMLCanvasElement = function() {};
    window.HTMLCanvasElement.prototype = { getContext: () => null };
    return { window, document };
  }

  let windowRef;
  let documentRef;
  if (JSDOM) {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
    windowRef = dom.window;
    documentRef = dom.window.document;
    if (!windowRef.HTMLCanvasElement) {
      windowRef.HTMLCanvasElement = function() {};
    }
    if (!windowRef.HTMLCanvasElement.prototype) {
      windowRef.HTMLCanvasElement.prototype = {};
    }
    windowRef.HTMLCanvasElement.prototype.getContext = () => null;
  } else {
    const minimal = createMinimalDom();
    windowRef = minimal.window;
    documentRef = minimal.document;
  }

  global.window = windowRef;
  global.document = documentRef;

  if (!document.readyState) {
    Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
  }
  if (!document.addEventListener) {
    document.addEventListener = () => {};
  }
  if (!window.eval) {
    window.eval = (code) => {
      const fn = new Function('window', 'document', `with(window){ ${code} }`);
      return fn(window, document);
    };
  }

  window.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  };

  window.SecureStorage = {
    ensurePassphrase: async () => {},
    encrypt: async value => value,
    decrypt: async value => value
  };

  const ensuredTypes = [];
  window.DomainLoader = {
    ensureDomainForType: async (type) => {
      ensuredTypes.push(type);
    }
  };

  window.NodeTypes = { default: { color: '#999', size: 20, shape: 'round-rectangle', icon: '' } };
  window.IconConfigs = {};
  window.TableManager = { updateNodeTypesTable: () => {} };
  window.GraphRenderer = { normalizeNodeData: () => {} };
  window.DataManager = { getGraphData: () => ({ nodes: [], edges: [] }), setGraphData: () => {} };
  window.GraphAreaEditor = { getSettings: () => ({}) };

  const mispMapperPath = path.join(__dirname, '..', 'js', 'integrations', 'misp-mapper.js');
  const mispMapperModule = require(mispMapperPath);
  window.MispMapper = mispMapperModule;

  const integrationsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'integrations.js'), 'utf8');
  window.eval(integrationsSrc);

  const IntegrationsManager = window.IntegrationsManager;
  const mispMapper = IntegrationsManager.getNodeDescriptorMapper('misp');
  assert.ok(mispMapper, 'MISP mapper should register with IntegrationsManager');

  ensuredTypes.length = 0;
  const domainAttr = { type: 'domain', category: 'Network activity', value: 'malicious.example', uuid: 'attr-1' };
  const domainDescriptor = await IntegrationsManager.mapMispAttribute(domainAttr);
  assert.ok(domainDescriptor, 'Domain attribute should map to a descriptor');

  assert.equal(domainDescriptor.type, 'domain');
  assert.equal(domainDescriptor.label, 'malicious.example');
  assert.equal(domainDescriptor.domain, 'computing');
  assert.equal(domainDescriptor.metadata.mispType, 'domain');
  assert.equal(domainDescriptor.metadata.category, 'Network activity');
  assert.equal(domainDescriptor.metadata.kind, 'attribute');
  assert.equal(domainDescriptor.metadata.domain, 'malicious.example');
  assert.ok(ensuredTypes.includes('domain'), 'DomainLoader.ensureDomainForType should be called for domain type');

  ensuredTypes.length = 0;
  const urlAttr = { type: 'url', category: 'Network activity', value: 'https://malicious.example/login', uuid: 'attr-2' };
  const urlDescriptor = await IntegrationsManager.mapMispAttribute(urlAttr);
  assert.ok(urlDescriptor, 'URL attribute should map to a descriptor');
  assert.equal(urlDescriptor.type, 'url');
  assert.equal(urlDescriptor.domain, 'computing');
  assert.equal(urlDescriptor.metadata.url, 'https://malicious.example/login');
  assert.ok(ensuredTypes.includes('url'), 'DomainLoader.ensureDomainForType should be called for url type');

  ensuredTypes.length = 0;
  const ipAttr = { type: 'ip-src', category: 'Network activity', value: '198.51.100.10', uuid: 'attr-3' };

  const ipDescriptor = await IntegrationsManager.mapMispAttribute(ipAttr);
  assert.ok(ipDescriptor, 'IP attribute should map to a descriptor');
  assert.equal(ipDescriptor.type, 'ipaddress');
  assert.equal(ipDescriptor.metadata.ipAddress, '198.51.100.10');
  assert.equal(ipDescriptor.metadata.kind, 'attribute');
  assert.ok(ensuredTypes.includes('ipaddress'), 'DomainLoader should load the ipaddress type');

  ensuredTypes.length = 0;
  const rawSha256 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const hashAttr = { type: 'sha256', category: 'Payload delivery', value: `sha256: ${rawSha256}`, uuid: 'attr-4' };
  const hashDescriptor = await IntegrationsManager.mapMispAttribute(hashAttr);
  assert.ok(hashDescriptor, 'Hash attribute should map to a descriptor');
  assert.equal(hashDescriptor.type, 'malware');
  assert.equal(hashDescriptor.label, rawSha256);
  assert.equal(hashDescriptor.metadata.sha256, rawSha256);

  assert.equal(hashDescriptor.metadata.hashType, 'sha256');
  assert.equal(hashDescriptor.metadata.kind, 'attribute');
  assert.ok(ensuredTypes.includes('malware'), 'DomainLoader should load the malware type');

  ensuredTypes.length = 0;

  const md5Attr = { type: 'md5', category: 'Payload delivery', value: '0123abcd', uuid: 'attr-5' };
  const md5Descriptor = await IntegrationsManager.mapMispAttribute(md5Attr);
  assert.ok(md5Descriptor, 'MD5 attributes should map to malware descriptors');
  assert.equal(md5Descriptor.type, 'malware');
  assert.equal(md5Descriptor.metadata.hashType, 'md5');
  assert.equal(md5Descriptor.metadata.hash, '0123abcd');
  assert.equal(md5Descriptor.metadata.md5, '0123abcd');
  assert.ok(ensuredTypes.includes('malware'), 'DomainLoader should load the malware type for MD5');

  ensuredTypes.length = 0;
  const sha1Attr = { type: 'sha1', category: 'Payload delivery', value: 'sha1: deadbeef', uuid: 'attr-6' };
  const sha1Descriptor = await IntegrationsManager.mapMispAttribute(sha1Attr);
  assert.ok(sha1Descriptor, 'SHA1 attributes should map to malware descriptors');
  assert.equal(sha1Descriptor.type, 'malware');
  assert.equal(sha1Descriptor.metadata.hashType, 'sha1');
  assert.equal(sha1Descriptor.metadata.hash.toLowerCase(), 'deadbeef');
  assert.equal(sha1Descriptor.metadata.sha1, 'deadbeef');
  assert.ok(ensuredTypes.includes('malware'), 'DomainLoader should load the malware type for SHA1');

  ensuredTypes.length = 0;
  const vtExternalAttr = {
    type: 'link',
    category: 'External analysis',
    value: 'https://www.virustotal.com/gui/file/0123abcd',
    uuid: 'attr-6b'
  };
  const vtExternalDescriptor = await IntegrationsManager.mapMispAttribute(vtExternalAttr);
  assert.equal(vtExternalDescriptor, null, 'VirusTotal external analysis links should be ignored');
  assert.equal(ensuredTypes.length, 0, 'Skipping VirusTotal links should not request node types');

  ensuredTypes.length = 0;
  const externalReportAttr = {
    type: 'link',
    category: 'External analysis',
    value: 'https://analysis.example/report.pdf',
    comment: 'Detailed analyst write-up',
    uuid: 'attr-6c'
  };
  const externalReportDescriptor = await IntegrationsManager.mapMispAttribute(externalReportAttr);
  assert.ok(externalReportDescriptor, 'External analysis entries with non-VirusTotal links should be imported');
  assert.equal(externalReportDescriptor.type, 'report');
  assert.equal(externalReportDescriptor.label, 'https://analysis.example/report.pdf');
  assert.ok(ensuredTypes.includes('report'), 'DomainLoader should load the report type for external analysis');

  ensuredTypes.length = 0;

  const targetAttr = { type: 'target-org', category: 'Targeting data', value: 'Example Corp', uuid: 'attr-7' };
  const targetDescriptor = await IntegrationsManager.mapMispAttribute(targetAttr);
  assert.ok(targetDescriptor, 'Target organisation attributes should map to a descriptor');
  assert.equal(targetDescriptor.type, 'target');
  assert.equal(targetDescriptor.metadata.targetType, 'target-org');
  assert.equal(targetDescriptor.metadata.value, 'Example Corp');
  assert.ok(ensuredTypes.includes('target'), 'DomainLoader should load the target type');

  ensuredTypes.length = 0;
  const accountAttr = { type: 'telegram-username', category: 'Social network', value: 'evildev', uuid: 'attr-8' };
  const accountDescriptor = await IntegrationsManager.mapMispAttribute(accountAttr);
  assert.ok(accountDescriptor, 'Social account attributes should map to a descriptor');
  assert.equal(accountDescriptor.type, 'telegram');
  assert.equal(accountDescriptor.metadata.platform, 'telegram');
  assert.equal(accountDescriptor.metadata.handle, 'evildev');
  assert.equal(accountDescriptor.metadata.accountType, 'telegram-username');
  assert.equal(accountDescriptor.metadata.value, 'evildev');
  assert.ok(ensuredTypes.includes('telegram'), 'DomainLoader should load the telegram type');

  ensuredTypes.length = 0;
  const phoneAttr = { type: 'phone-number', category: 'Person', value: '+1-555-0100', uuid: 'attr-8a' };
  const phoneDescriptor = await IntegrationsManager.mapMispAttribute(phoneAttr);
  assert.ok(phoneDescriptor, 'Phone attributes should map to personal contact descriptors');
  assert.equal(phoneDescriptor.type, 'phone_number');
  assert.equal(phoneDescriptor.metadata.contactType, 'phone-number');
  assert.equal(phoneDescriptor.metadata.phoneNumber, '+1-555-0100');
  assert.equal(phoneDescriptor.metadata.number, '+1-555-0100');
  assert.ok(ensuredTypes.includes('phone_number'), 'DomainLoader should load the phone number type');

  ensuredTypes.length = 0;
  const bitcoinAttr = { type: 'bitcoin-address', category: 'Financial fraud', value: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT', uuid: 'attr-8b' };
  const bitcoinDescriptor = await IntegrationsManager.mapMispAttribute(bitcoinAttr);
  assert.ok(bitcoinDescriptor, 'Financial attributes should map to finance descriptors');
  assert.equal(bitcoinDescriptor.type, 'bitcoin');
  assert.equal(bitcoinDescriptor.metadata.address, '1BoatSLRHtKNngkdXEeobR76b53LETtpyT');
  assert.equal(bitcoinDescriptor.metadata.currency, 'BTC');
  assert.equal(bitcoinDescriptor.metadata.network, 'bitcoin');
  assert.ok(ensuredTypes.includes('bitcoin'), 'DomainLoader should load the bitcoin type');

  ensuredTypes.length = 0;
  const unknownAttr = { type: 'new-custom-type', category: 'Other', value: 'custom-indicator', uuid: 'attr-9' };
  const unknownDescriptor = await IntegrationsManager.mapMispAttribute(unknownAttr);
  assert.ok(unknownDescriptor, 'Unknown attribute types should map to a generic IOC descriptor');
  assert.equal(unknownDescriptor.type, 'ioc');
  assert.equal(unknownDescriptor.metadata.value, 'custom-indicator');
  assert.ok(ensuredTypes.includes('ioc'), 'DomainLoader should load the IOC type for generic indicators');

  ensuredTypes.length = 0;

  const sha1Hash = '82448eb23ea9eb3939b6f24df46789bf7f2d43e3';
  const compoundAttr = {
    type: 'filename|sha1',
    category: 'Payload delivery',
    value: 'malicious.docm|' + sha1Hash,
    uuid: 'attr-7'
  };
  const compoundDescriptor = await IntegrationsManager.mapMispAttribute(compoundAttr);
  assert.ok(compoundDescriptor, 'Compound filename/hash attribute should map to a descriptor');
  assert.equal(compoundDescriptor.type, 'malware');
  assert.equal(compoundDescriptor.label, sha1Hash);
  assert.equal(compoundDescriptor.metadata.hashType, 'sha1');
  assert.equal(compoundDescriptor.metadata.sha1, sha1Hash);
  assert.equal(compoundDescriptor.metadata.hash, sha1Hash);
  assert.equal(compoundDescriptor.metadata.filename, 'malicious.docm');
  assert.ok(Array.isArray(compoundDescriptor.relatedDescriptors), 'Compound descriptor should expose related descriptors');
  assert.ok(compoundDescriptor.relatedDescriptors.length > 0, 'Compound descriptor should include filename descriptor');
  const relatedEntry = compoundDescriptor.relatedDescriptors[0];
  const relatedDescriptor = relatedEntry.descriptor || relatedEntry;
  assert.equal(relatedDescriptor.type, 'filename');
  assert.equal(relatedDescriptor.label, 'malicious.docm');
  assert.equal((relatedEntry.relationship || {}).label, 'filename');
  assert.ok(ensuredTypes.includes('malware'), 'DomainLoader should load malware type for compound attributes');
  assert.ok(ensuredTypes.includes('filename'), 'DomainLoader should load filename type for compound attributes');

  ensuredTypes.length = 0;
  const compoundMapping = IntegrationsManager.mapMispAttributes([compoundAttr], 'report-node');
  assert.ok(compoundMapping, 'Compound attribute should map to nodes and edges');
  const malwareNode = compoundMapping.nodes.find(node => node.type === 'malware');
  const filenameNode = compoundMapping.nodes.find(node => node.type === 'filename');
  assert.ok(malwareNode, 'Compound mapping should include a malware node');
  assert.ok(filenameNode, 'Compound mapping should include a filename node');
  const malwareToFilenameEdge = compoundMapping.edges.find(edge => edge.source === malwareNode.id && edge.target === filenameNode.id);
  assert.ok(malwareToFilenameEdge, 'Malware node should connect to filename node');
  assert.equal(malwareToFilenameEdge.label, 'filename');
  const reportToFilenameEdge = compoundMapping.edges.find(edge => edge.source === 'report-node' && edge.target === filenameNode.id);
  assert.ok(reportToFilenameEdge, 'Report node should connect to filename node');
  const reportToMalwareEdge = compoundMapping.edges.find(edge => edge.source === 'report-node' && edge.target === malwareNode.id);
  assert.ok(reportToMalwareEdge, 'Report node should connect to malware node');

  ensuredTypes.length = 0;

  const malwareCluster = {
    type: 'malware',
    value: 'ExampleMalware',
    uuid: 'cluster-1',
    meta: { family: 'Example', synonyms: ['ExampleMalware'] }
  };
  const malwareDescriptor = await IntegrationsManager.mapMispGalaxyCluster(malwareCluster);
  assert.ok(malwareDescriptor, 'Malware cluster should map to a descriptor');
  assert.equal(malwareDescriptor.type, 'malware');
  assert.equal(malwareDescriptor.label, 'ExampleMalware');
  assert.equal(malwareDescriptor.metadata.galaxyType, 'malware');
  assert.equal(malwareDescriptor.metadata.kind, 'galaxy_cluster');
  assert.deepStrictEqual(malwareDescriptor.metadata.synonyms, ['ExampleMalware']);
  assert.equal(malwareDescriptor.metadata.malwareFamily, 'Example');
  assert.ok(ensuredTypes.includes('malware'), 'DomainLoader should be invoked for malware galaxy clusters');

  ensuredTypes.length = 0;

  const malwareFamilyCluster = { type: 'malware-family', value: 'ExampleFamily', uuid: 'cluster-1b' };
  const malwareFamilyDescriptor = await IntegrationsManager.mapMispGalaxyCluster(malwareFamilyCluster);
  assert.ok(malwareFamilyDescriptor, 'Malware family cluster should map to a descriptor');
  assert.equal(malwareFamilyDescriptor.type, 'malware_family');
  assert.equal(malwareFamilyDescriptor.metadata.family, 'ExampleFamily');
  assert.ok(ensuredTypes.includes('malware_family'), 'DomainLoader should load the malware family type');

  ensuredTypes.length = 0;

  const actorCluster = { type: 'threat-actor', value: 'APT Example', uuid: 'cluster-2' };
  const actorDescriptor = await IntegrationsManager.mapMispGalaxyCluster(actorCluster);
  assert.ok(actorDescriptor, 'Threat actor cluster should map to a descriptor');
  assert.equal(actorDescriptor.type, 'threat_actor');
  assert.equal(actorDescriptor.metadata.galaxyType, 'threat-actor');
  assert.equal(actorDescriptor.metadata.kind, 'galaxy_cluster');
  assert.ok(ensuredTypes.includes('threat_actor'), 'DomainLoader should be invoked for threat actor clusters');

  ensuredTypes.length = 0;
  const sighting = {
    source: 'SOC',
    uuid: 'sighting-1',
    timestamp: 1700000000,
    attribute_uuid: 'attr-1',
    value: 'malicious.example observed',
    count: 1
  };
  const sightingDescriptor = await IntegrationsManager.mapMispSighting(sighting);
  assert.ok(sightingDescriptor, 'Sighting should map to a descriptor');
  assert.equal(sightingDescriptor.type, 'forensic_evidence');

  assert.ok(sightingDescriptor.label.startsWith('Sighting: SOC'));
  assert.equal(sightingDescriptor.metadata.source, 'SOC');
  assert.equal(sightingDescriptor.metadata.attributeUuid, 'attr-1');
  assert.equal(sightingDescriptor.metadata.kind, 'sighting');
  assert.ok(ensuredTypes.includes('forensic_evidence'), 'DomainLoader should be invoked for forensic evidence type');


  console.log('misp-mapper.test.cjs passed');
})();
