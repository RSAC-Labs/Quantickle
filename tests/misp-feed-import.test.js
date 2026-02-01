const { gzipSync, gunzipSync } = require('zlib');

const createElement = (tagName) => ({
  tagName: tagName.toUpperCase(),
  children: [],
  dataset: {},
  textContent: '',
  className: '',
  value: '',
  appendChild(child) {
    this.children.push(child);
    return child;
  }
});

const documentStub = {
  elements: new Map(),
  body: createElement('body'),
  createElement(tagName) {
    return createElement(tagName);
  },
  getElementById(id) {
    return this.elements.get(id) || null;
  }
};

const statusElement = createElement('span');
statusElement.id = 'circlMispStatus';
documentStub.elements.set('circlMispStatus', statusElement);

const localStorageStore = new Map();
const localStorageStub = {
  getItem(key) {
    return localStorageStore.has(key) ? localStorageStore.get(key) : null;
  },
  setItem(key, value) {
    localStorageStore.set(key, value);
  },
  removeItem(key) {
    localStorageStore.delete(key);
  },
  clear() {
    localStorageStore.clear();
  }
};

global.window = {
  document: documentStub,
  navigator: {},
  localStorage: localStorageStub
};

global.document = documentStub;
global.navigator = window.navigator;
global.localStorage = window.localStorage;

global.window.QuantickleConfig = { validation: { enabled: false } };

global.window.UI = {
  notifications: [],
  showNotification(message, type) {
    this.notifications.push({ message, type });
  }
};

global.window.SecureStorage = {
  ensurePassphrase: async () => {},
  encrypt: async value => value,
  decrypt: async value => value
};

global.window.DomainLoader = { loadAndActivateDomains: async () => {} };

global.window.pako = {
  ungzip(input) {
    const array = input instanceof Uint8Array ? input : new Uint8Array(input);
    return gunzipSync(Buffer.from(array)).toString();
  }
};

global.window.DataManager = {
  _graphs: [],
  currentGraphName: 'Unsaved graph',
  currentGraphFileName: 'Unsaved graph.qut',
  setGraphData(data) {
    const clone = JSON.parse(JSON.stringify(data));
    this._graphs.push(clone);
    this._current = clone;
  },
  getGraphData() {
    return this._current || { nodes: [], edges: [] };
  },
  setGraphName(name, options = {}) {
    const ensureExtension = options.ensureExtension === true;
    const extension = '.qut';
    let resolved = typeof name === 'string' ? name.trim() : '';
    if (resolved && ensureExtension && !resolved.toLowerCase().endsWith(extension)) {
      resolved = `${resolved}${extension}`;
    }
    if (!resolved) {
      this.currentGraphName = 'Unsaved graph';
      this.currentGraphFileName = 'Unsaved graph.qut';
      return this.currentGraphName;
    }
    this.currentGraphName = resolved;
    this.currentGraphFileName = resolved;
    return this.currentGraphName;
  }
};

global.window.GraphRenderer = {
  renderGraphCalls: 0,
  renderGraph() {
    this.renderGraphCalls += 1;
  }
};

global.window.FileManager = {
  saveGraphFileCalls: 0,
  downloads: [],
  currentFile: null,
  async saveGraphFile() {
    this.saveGraphFileCalls += 1;
  },
  exportCurrentGraph() {
    const data = window.DataManager.getGraphData();
    return JSON.parse(JSON.stringify({
      ...data,
      metadata: { ...(data.metadata || {}), name: window.DataManager.currentGraphName }
    }));
  },
  downloadFile(content, filename) {
    this.downloads.push({ content, filename });
  },
  applyGraphData(graphData) {
    window.DataManager.setGraphData(graphData);
  }
};

global.window.WorkspaceManager = { handle: null };

global.window.updateStatus = () => {};

global.__mispFetchMap = new Map();

global.fetch = async (url) => {
  const entry = global.__mispFetchMap.get(url);
  if (!entry) {
    throw new Error(`Unexpected fetch URL: ${url}`);
  }
  const headers = new Map();
  if (entry.headers) {
    Object.entries(entry.headers).forEach(([key, value]) => headers.set(key.toLowerCase(), value));
  }
  return {
    ok: true,
    status: entry.status || 200,
    headers: {
      get(name) {
        return headers.get(name.toLowerCase()) || null;
      }
    },
    async text() {
      if (typeof entry.body === 'string') {
        return entry.body;
      }
      if (Buffer.isBuffer(entry.body)) {
        return entry.body.toString();
      }
      return JSON.stringify(entry.body);
    },
    async arrayBuffer() {
      if (Buffer.isBuffer(entry.body)) {
        const buf = entry.body;
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      }
      if (entry.body instanceof Uint8Array) {
        const arr = entry.body;
        return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength);
      }
      if (typeof entry.body === 'string') {
        return new TextEncoder().encode(entry.body).buffer;
      }
      return new TextEncoder().encode(JSON.stringify(entry.body)).buffer;
    }
  };
};

require('../js/integrations.js');

const baseFeedUrl = 'https://feed.example/';
const manifestUrl = '/api/proxy?url=' + encodeURIComponent(`${baseFeedUrl}manifest.json`);
const eventOneUrl = '/api/proxy?url=' + encodeURIComponent(`${baseFeedUrl}events/event-1.json`);
const eventTwoUrl = '/api/proxy?url=' + encodeURIComponent(`${baseFeedUrl}events/event-2.json.gz`);

const defaultFeedUrl = window.IntegrationsManager.CIRCL_MISP_DEFAULT_FEED_URL;
const defaultManifestUrl = '/api/proxy?url=' + encodeURIComponent(`${defaultFeedUrl}manifest.json`);
const defaultEventOneUrl = '/api/proxy?url=' + encodeURIComponent(`${defaultFeedUrl}events/event-1.json`);
const defaultEventTwoUrl = '/api/proxy?url=' + encodeURIComponent(`${defaultFeedUrl}events/event-2.json.gz`);


global.__mispFetchMap.set(manifestUrl, {
  body: {
    events: [
      { uuid: 'event-1', info: 'Incident One', path: 'events/event-1.json', published: '2024-01-01' },
      { uuid: 'event-2', info: 'Incident Two', path: 'events/event-2.json.gz', published: '2024-01-02' }
    ]
  },
  headers: { 'content-type': 'application/json' }
});

global.__mispFetchMap.set(defaultManifestUrl, {
  body: {
    events: [
      { uuid: 'event-1', info: 'Incident One', path: 'events/event-1.json', published: '2024-01-01' },
      { uuid: 'event-2', info: 'Incident Two', path: 'events/event-2.json.gz', published: '2024-01-02' }
    ]
  },
  headers: { 'content-type': 'application/json' }
});

global.__mispFetchMap.set(eventOneUrl, {
  body: {
    Event: {
      uuid: 'event-1',
      info: 'Incident One',
      Attribute: [
        { uuid: 'attr-1', type: 'domain', value: 'malicious.example', category: 'Network activity', timestamp: '1704067200' },
        { uuid: 'attr-2', type: 'attachment', value: 'VGhpcyBpcyBiYXNlNjQ=', category: 'Payload delivery' }
      ]
    }
  },
  headers: { 'content-type': 'application/json' }
});

global.__mispFetchMap.set(defaultEventOneUrl, {
  body: {
    Event: {
      uuid: 'event-1',
      info: 'Incident One',
      Attribute: [
        { uuid: 'attr-1', type: 'domain', value: 'malicious.example', category: 'Network activity' },
        { uuid: 'attr-2', type: 'attachment', value: 'VGhpcyBpcyBiYXNlNjQ=', category: 'Payload delivery' }
      ]
    }
  },
  headers: { 'content-type': 'application/json' }
});

global.__mispFetchMap.set(eventTwoUrl, {
  body: gzipSync(JSON.stringify({
    Event: {
      uuid: 'event-2',
      info: 'Incident Two',
      Attribute: [
        { uuid: 'attr-3', type: 'ip-src', value: '203.0.113.77', category: 'Network activity' },
        { uuid: 'attr-4', type: 'content', value: 'BASE64PAYLOAD', category: 'Payload delivery' }
      ]
    }
  })),
  headers: { 'content-type': 'application/gzip' }
});

global.__mispFetchMap.set(defaultEventTwoUrl, {
  body: gzipSync(JSON.stringify({
    Event: {
      uuid: 'event-2',
      info: 'Incident Two',
      Attribute: [
        { uuid: 'attr-3', type: 'ip-src', value: '203.0.113.77', category: 'Network activity' },
        { uuid: 'attr-4', type: 'content', value: 'BASE64PAYLOAD', category: 'Payload delivery' }
      ]
    }
  })),
  headers: { 'content-type': 'application/gzip' }
});


async function assertLegacyCompatibility() {
  const manifest = await window.makeCirclLuRequest('manifest.json');
  if (!manifest.events || manifest.events.length !== 2) {
    throw new Error('Legacy manifest fetch should return all events');
  }

  const legacyEvent = await window.makeCirclLuRequest({ path: 'events/event-1.json', uuid: 'event-1' });
  if (!legacyEvent.Event || legacyEvent.Event.uuid !== 'event-1') {
    throw new Error('Legacy event fetch should unwrap the payload');
  }

  const legacyGzip = await window.makeCirclLuRequest({ path: 'events/event-2.json.gz', uuid: 'event-2' });
  if (!legacyGzip.Event || legacyGzip.Event.uuid !== 'event-2') {
    throw new Error('Legacy request should handle gzipped payloads');
  }
}

async function assertImporterCreatesGraph() {

  const result = await window.IntegrationsManager.importCirclMispFeed({
    feedUrl: baseFeedUrl,
    selectedEventUuids: ['event-1', 'event-2'],
    statusId: 'circlMispStatus'
  });

  if (!result.events || result.events.length !== 2) {
    throw new Error('Expected both selected events to be imported');
  }

  const meaningfulGraphs = window.DataManager._graphs.filter(graph => (graph.nodes || []).length);
  if (meaningfulGraphs.length !== 2) {
    throw new Error('Expected two imported graphs');
  }

  const [graphOne, graphTwo] = meaningfulGraphs;
  const reportOne = graphOne.nodes.find(node => node.type === 'report');
  const reportTwo = graphTwo.nodes.find(node => node.type === 'report');

  if (!reportOne) {
    throw new Error('Missing report node anchor for event');
  }

  if (!reportTwo) {
    throw new Error('Missing report node anchor for second event');
  }

  const expectedFirstSaveName = 'Incident One.qut';

  if (graphOne.title !== expectedFirstSaveName) {
    throw new Error('Graph title should match the saved graph identifier for first event');
  }

  if (graphOne.metadata?.title !== expectedFirstSaveName || graphOne.metadata?.name !== expectedFirstSaveName) {
    throw new Error('Graph metadata should preserve the saved graph identifier for first event');
  }

  const expectedSecondSaveName = 'Incident Two.qut';

  if (graphTwo.title !== expectedSecondSaveName) {
    throw new Error('Graph title should match the saved graph identifier for second event');
  }

  if (graphTwo.metadata?.title !== expectedSecondSaveName || graphTwo.metadata?.name !== expectedSecondSaveName) {
    throw new Error('Graph metadata should preserve the saved graph identifier for second event');
  }

  const domainNode = graphOne.nodes.find(node => node.label === 'malicious.example');
  if (!domainNode) {
    throw new Error('Expected IOC node for domain attribute');
  }

  if (domainNode.timestamp !== '2024-01-01T00:00:00.000Z') {
    throw new Error('Expected IOC node to retain attribute timestamp');
  }

  if (!domainNode.metadata || domainNode.metadata.timestamp !== '2024-01-01T00:00:00.000Z') {
    throw new Error('Expected IOC metadata to retain normalized timestamp');
  }

  const graphOneEdge = graphOne.edges.find(edge => edge.source === reportOne.id && edge.target === domainNode.id);

  if (!graphOneEdge) {
    throw new Error('IOC nodes should be linked to report anchor');
  }

  if (graphOne.nodes.some(node => node.label.includes('VGhpcyBpcyBiYXNlNjQ=')) ||
      graphOne.nodes.some(node => node.label.includes('BASE64PAYLOAD'))) {
    throw new Error('Base64 attachment/content attributes should be ignored');
  }

  const ipNode = graphTwo.nodes.find(node => node.label === '203.0.113.77');
  if (!ipNode) {
    throw new Error('Expected IP IOC node in second event');
  }

  if (window.GraphRenderer.renderGraphCalls !== 2) {
    throw new Error('GraphRenderer should render once per imported event');
  }

  if (window.DataManager.currentGraphName !== expectedSecondSaveName) {
    throw new Error('Active graph name should reflect the saved graph identifier of the last imported event');
  }

  if (window.DataManager.currentGraphFileName !== expectedSecondSaveName) {
    throw new Error('Active graph file name should retain the event info title for saving');
  }

}

async function assertLegacySyncShortcut() {
  window.DataManager._graphs = [];
  window.GraphRenderer.renderGraphCalls = 0;
  window.FileManager.saveGraphFileCalls = 0;
  window.UI.notifications = [];

  const result = await window.syncCirclLuLatestEvent();

  if (!result || !result.events || !result.events.length) {
    throw new Error('Legacy sync should yield imported events');
  }

  if (window.DataManager._graphs.length !== 1) {
    throw new Error('Legacy sync should rebuild the graph');
  }

  const successNotice = window.UI.notifications.find(note => note.type === 'success');
  if (!successNotice) {
    throw new Error('Legacy sync should surface a success notification');
  }
}

async function assertWholeFeedBatchSync() {
  window.DataManager._graphs = [];
  window.GraphRenderer.renderGraphCalls = 0;
  window.FileManager.downloads = [];
  window.FileManager.currentFile = null;

  const result = await window.syncCirclMispWholeFeed();

  if (!result || !result.events || result.events.length !== 2) {
    throw new Error('Whole feed sync should process every manifest entry');
  }

  if (window.FileManager.downloads.length !== 2) {
    throw new Error('Whole feed sync should save each graph locally when Neo4j is unavailable');
  }

  const filenames = window.FileManager.downloads.map(entry => entry.filename).sort();
  if (filenames[0] !== 'Incident One.qut' || filenames[1] !== 'Incident Two.qut') {
    throw new Error('Whole feed sync should name saved graphs by their info/title');
  }
}

(async () => {
  await assertLegacyCompatibility();
  await assertImporterCreatesGraph();
  await assertLegacySyncShortcut();
  await assertWholeFeedBatchSync();
  console.log('CIRCL MISP feed import covers importer, legacy helpers, and sync shortcut');

  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
