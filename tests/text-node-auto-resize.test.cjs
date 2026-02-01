const noop = () => {};
const createStubElement = (tag = 'div') => {
  const element = {
    tagName: tag.toUpperCase(),
    children: [],
    style: {},
    classList: { add: noop, remove: noop, contains: () => false },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter(c => c !== child);
    },
    setAttribute: noop,
    getAttribute: noop,
    addEventListener: noop,
    removeEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
    getContext: () => null
  };
  return element;
};

const documentStub = {
  createElement: createStubElement,
  body: {
    appendChild: noop,
    removeChild: noop,
    classList: { add: noop, remove: noop }
  },
  documentElement: { clientHeight: 0 },
  addEventListener: noop,
  removeEventListener: noop
};

const windowStub = {
  document: documentStub,
  addEventListener: noop,
  removeEventListener: noop,
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  navigator: { userAgent: 'node' },
  requestAnimationFrame: (cb) => setTimeout(cb, 0)
};

global.window = windowStub;
global.document = documentStub;

function HTMLCanvasElement() {}
HTMLCanvasElement.prototype.getContext = () => null; // force fallback path
window.HTMLCanvasElement = HTMLCanvasElement;
global.HTMLCanvasElement = HTMLCanvasElement;

const cytoscapeStub = () => ({
  on: noop,
  off: noop,
  destroy: noop,
  container: () => null,
  mount: noop,
  add: noop,
  elements: () => ({ json: () => ({}) }),
  layout: () => ({ run: noop, stop: noop }),
  boxSelectionEnabled: noop,
  $: () => ({ filter: () => [] })
});
cytoscapeStub.stylesheet = () => ({ selector: () => ({ css: () => cytoscapeStub.stylesheet() }) });
global.cytoscape = cytoscapeStub;

// Minimal environment stubs
window.UI = { showNotification: () => {} };
window.DomainLoader = { autoLoadDomainsForGraph: async () => [] };
window.TableManager = { updateTables: () => {}, updateTotalDataTable: () => {} };
window.LayoutManager = { applyCurrentLayout: () => {}, currentLayout: 'preset', updateLayoutDropdown: () => {}, handleDragEvent: () => {} };
window.GraphAreaEditor = { applySettings: () => {} };
window.QuantickleConfig = { validation: { enabled: false } };
window.LODSystem = { init: () => {}, config: { enabled: false } };
window.GraphStyling = { applyDefaultStyles: () => {} };
window.GraphControls = { init: () => {} };
window.SelectionManager = { init: () => {} };
window.GraphEditor = { init: () => {} };
window.EdgeCreator = { init: () => {} };
window.PerformanceManager = { init: () => {} };
window.DebugTools = { init: () => {} };
window.ProgressManager = { init: () => {} };
window.BackgroundGridModule = { init: () => {} };
window.Validation = { validators: { validateNode: () => ({ valid: true, errors: [] }), validateEdge: () => ({ valid: true, errors: [] }) } };
window.NodeTypes = {
  default: { color: '#ffffff', size: 30, shape: 'round-rectangle', icon: '' },
  text: { fontFamily: 'Arial', fontSize: 14, fontColor: '#333333', bold: false, italic: false }
};
window.IconConfigs = {};

require('../js/graph.js');

// Prepare a text node element
const data = { id: 't1', type: 'text', info: 'short text', width: 100 };
window.GraphRenderer.normalizeNodeData({ data });
const initialHeight = data.height;

// Increase text content to trigger wrapping
const longInfo = 'This is a much longer block of text that should wrap onto multiple lines and expand the height of the node.';
data.info = longInfo;
window.GraphRenderer.normalizeNodeData({ data });

if (data.width !== 100) {
  throw new Error('Text node width should remain constant');
}
if (data.height <= initialHeight) {
  throw new Error('Text node height did not expand with content');
}

console.log('Text node auto-resizes with wrapped content');

// Ensure explicit dimensions are preserved when loading existing text nodes
const preserved = { id: 't2', type: 'text', info: 'Keep my size', width: 160, height: 120 };
window.GraphRenderer.normalizeNodeData({ data: preserved }, { preserveExplicitDimensions: true });

if (preserved.width !== 160 || preserved.height !== 120) {
  throw new Error('Explicit text node dimensions should be preserved');
}

console.log('Text node explicit dimensions are preserved');
