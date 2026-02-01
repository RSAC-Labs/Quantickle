const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

(async () => {
  const window = {
    document: {
      getElementById: () => null,
      querySelectorAll: () => [],
      querySelector: () => null,
      body: { appendChild: () => {} }
    },
    console,
    setTimeout,
    clearTimeout,
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    getComputedStyle: () => ({ getPropertyValue: () => '' })
  };
  window.window = window;
  window.globalThis = window;
  window.HTMLCanvasElement = function() {};
  window.HTMLCanvasElement.prototype.getContext = () => null;

  global.window = window;
  global.document = window.document;
  global.localStorage = window.localStorage;

  window.NodeTypes = {};
  window.IconConfigs = {};

  const loaderSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain-loader.js'), 'utf8');
  vm.runInThisContext(loaderSrc);

  window.DomainLoader.refreshUI = () => {};
  window.DomainLoader.saveState = () => {};

  window.DomainLoader.defaultNodeTypes = {};
  window.DomainLoader.defaultIconConfigs = {};
  window.DomainLoader.availableDomains = {
    default: { name: 'Default', folder: null, description: '', loaded: true, types: {} },
    mock_domain: {
      name: 'Mock Domain',
      folder: 'mock-domain',
      description: '',
      loaded: true,
      types: {
        example_type: {
          color: '#123456',
          size: 20,
          shape: 'ellipse',
          icon: '/assets/icons/example.png'
        }
      }
    }
  };
  window.DomainLoader.activeDomains = new Set(['default', 'mock_domain']);
  window.DomainLoader.typeDefinitionOrigins = {};
  window.DomainLoader.typeDomainMap = {};
  window.DomainLoader.typeNameMap = {};

  window.DomainLoader.rebuildActiveConfiguration();

  assert.strictEqual(
    window.IconConfigs.example_type,
    'assets/icons/example.png',
    'Icon should be registered under the normalized asset path'
  );
  assert.strictEqual(
    window.NodeTypes.example_type.icon,
    'example_type',
    'Node type should reference the icon by key after rebuild'
  );
  assert.strictEqual(
    window.DomainLoader.availableDomains.mock_domain.types.example_type.icon,
    'example_type',
    'Domain type definition should be rewritten to use the icon key'
  );

  const storedIconSource = window.DomainLoader.availableDomains.mock_domain.types.example_type.iconSource;
  assert.strictEqual(
    storedIconSource,
    'assets/icons/example.png',
    'Normalized icon source should be preserved on the domain type definition'
  );

  window.DomainLoader.clearActiveDomains();

  assert.strictEqual(
    window.DomainLoader.activeDomains.has('mock_domain'),
    false,
    'Clearing active domains should remove the mock domain from the active set'
  );

  window.DomainLoader.activateDomain('mock_domain');

  assert.strictEqual(
    window.IconConfigs.example_type,
    storedIconSource,
    'Reactivating the domain should restore the icon configuration from the preserved source'
  );
  assert.strictEqual(
    window.DomainLoader.availableDomains.mock_domain.types.example_type.iconSource,
    storedIconSource,
    'The preserved icon source should remain associated with the domain type after rebuild'
  );

  console.log('domain-loader-icon-path-normalization.test.js passed');
})();
