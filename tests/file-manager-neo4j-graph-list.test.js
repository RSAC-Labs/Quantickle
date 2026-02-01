const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const context = {
  window: {},
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval
};

context.window.window = context.window;
context.document = {};
context.window.document = context.document;
context.window.console = console;
context.window.IntegrationsManager = context.window.IntegrationsManager || {
  getNeo4jCredentials: () => ({})
};

vm.createContext(context);

global.window = context.window;
global.document = context.document;

window.fetch = async () => ({ ok: true, json: async () => ({}) });

global.fetch = window.fetch;

const scriptPath = path.join(__dirname, '..', 'js', 'features', 'file-manager', 'file-manager-module.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
vm.runInContext(scriptContent, context);

const fileManager = new window.FileManagerModule({
  cytoscape: null,
  notifications: { show: () => {} },
  papaParseLib: {}
});

const graphs = [
  {
    name: 'PublishedGraph',
    graph: {
      nodes: [
        { data: { root: true, published: '2021-04-03T10:15:00Z' } },
      ]
    }
  },
  {
    name: 'SavedGraph',
    savedAt: '2024-01-02T03:04:05.000Z'
  },
  {
    name: 'RootMetadataGraph',
    graph: {
      metadata: {},
      nodes: [
        { data: { root: true, metadata: { published: '2021-05-26' } } },
      ]
    }
  },
  {
    name: 'NestedMetadataGraph',
    metadata: {
      metadata: {
        published: '2018-05-30'
      }
    },
    graph: {
      metadata: {},
      nodes: [
        {
          label: 'Report',
          metadata: {
            source: 'example',
            organisation: 'Example Org'
          }
        }
      ]
    }
  },
  {
    name: 'PropertyRootGraph',
    metadata: JSON.stringify({ meta: { published: '2019-07-04' } }),
    graph: {
      nodes: [
        {
          properties: {
            root: true,
            meta: { published: '2019-07-04' }
          }
        }
      ]
    }
  },
  {
    name: 'SequencePriorityGraph',
    savedAt: '2022-01-01T00:00:00.000Z',
    sequence: 5
  },
  {
    name: 'SequenceSecondaryGraph',
    savedAt: '2022-01-01T00:00:00.000Z',
    sequence: 1
  },
  {
    name: 'FutureCorruptedGraph',
    savedAt: '2042-05-01T12:00:00.000Z',
    sequence: 50
  },
  {
    name: 'UntimestampedGraph',
    sequence: 100
  }
];

const normalized = fileManager.normalizeNeo4jGraphList(graphs);

const publishedEntry = normalized.find(item => item.name === 'PublishedGraph');
assert.ok(publishedEntry, 'Published graph should be normalized');
assert.strictEqual(
  publishedEntry.savedAt,
  '2021-04-03T10:15:00.000Z',
  'Published date should populate savedAt when missing'
);
assert.strictEqual(
  graphs.find(item => item.name === 'PublishedGraph').savedAt,
  '2021-04-03T10:15:00.000Z',
  'Published fallback should be persisted onto the graph entry'
);
assert.strictEqual(
  graphs.find(item => item.name === 'PublishedGraph').graph.metadata.savedAt,
  '2021-04-03T10:15:00.000Z',
  'Graph metadata should receive the persisted savedAt value'
);

const rootMetadataEntry = normalized.find(item => item.name === 'RootMetadataGraph');
assert.ok(rootMetadataEntry, 'Graph with root metadata should be normalized');
assert.strictEqual(
  rootMetadataEntry.savedAt,
  '2021-05-26T00:00:00.000Z',
  'Root node metadata published date should populate savedAt'
);
const rootGraph = graphs.find(item => item.name === 'RootMetadataGraph');
assert.strictEqual(
  rootGraph.savedAt,
  '2021-05-26T00:00:00.000Z',
  'Persisted savedAt should be written back to the original entry'
);
assert.strictEqual(
  rootGraph.graph.metadata.savedAt,
  '2021-05-26T00:00:00.000Z',
  'Graph metadata savedAt should reflect persisted fallback date'
);

const savedEntry = normalized.find(item => item.name === 'SavedGraph');
assert.ok(savedEntry, 'Graph with savedAt should be present');
assert.strictEqual(savedEntry.savedAt, '2024-01-02T03:04:05.000Z');

const nestedMetadataEntry = normalized.find(item => item.name === 'NestedMetadataGraph');
assert.ok(nestedMetadataEntry, 'Graph with nested metadata should be normalized');
assert.strictEqual(
  nestedMetadataEntry.savedAt,
  '2018-05-30T00:00:00.000Z',
  'Nested metadata published date should populate savedAt'
);
const nestedOriginal = graphs.find(item => item.name === 'NestedMetadataGraph');
assert.strictEqual(
  nestedOriginal.metadata.savedAt,
  '2018-05-30T00:00:00.000Z',
  'Persisted savedAt should be written back to the entry metadata'
);

const propertyEntry = normalized.find(item => item.name === 'PropertyRootGraph');
assert.ok(propertyEntry, 'Graph with property-only root node should be normalized');
assert.strictEqual(
  propertyEntry.savedAt,
  '2019-07-04T00:00:00.000Z',
  'Property metadata should populate savedAt via fallback'
);
const propertyOriginal = graphs.find(item => item.name === 'PropertyRootGraph');
assert.strictEqual(
  propertyOriginal.savedAt,
  '2019-07-04T00:00:00.000Z',
  'Original entry should receive the persisted savedAt value'
);
assert.strictEqual(
  propertyOriginal.graph.nodes[0].properties.meta.published,
  '2019-07-04',
  'Node properties should remain accessible after normalization'
);

const futureEntry = normalized.find(item => item.name === 'FutureCorruptedGraph');
assert.ok(futureEntry, 'Graph with corrupted future timestamp should be normalized');
assert.strictEqual(
  futureEntry.savedAt,
  null,
  'Future timestamps far beyond the current date should be discarded'
);

assert.deepStrictEqual(
  normalized.map(item => item.name),
  [
    'SavedGraph',
    'SequencePriorityGraph',
    'SequenceSecondaryGraph',
    'RootMetadataGraph',
    'PublishedGraph',
    'PropertyRootGraph',
    'NestedMetadataGraph',
    'UntimestampedGraph',
    'FutureCorruptedGraph'
  ],
  'Graphs should be sorted by savedAt descending, with sequence/name fallbacks and invalid future dates pushed last'
);

console.log('file-manager-neo4j-graph-list.test.js passed');
