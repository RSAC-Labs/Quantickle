const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createTestEnvironment() {
    const sandbox = {
        window: {},
        document: {
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: () => ({
                style: {},
                className: '',
                innerHTML: '',
                appendChild: () => {},
                setAttribute: () => {},
                addEventListener: () => {}
            }),
            getElementById: () => ({ addEventListener: () => {} }),
            addEventListener: () => {},
            body: { appendChild: () => {} }
        },
        console,
        setTimeout,
        clearTimeout,
        Map,
        Math
    };

    sandbox.window.window = sandbox.window;
    sandbox.window.document = sandbox.document;
    sandbox.window.console = console;
    sandbox.window.setTimeout = setTimeout;
    sandbox.window.clearTimeout = clearTimeout;
    sandbox.window.Map = Map;
    sandbox.window.Math = Math;
    sandbox.window.requestAnimationFrame = (fn) => setTimeout(fn, 0);
    sandbox.window.cancelAnimationFrame = (id) => clearTimeout(id);
    sandbox.window.HTMLCanvasElement = function() {};
    sandbox.window.HTMLCanvasElement.prototype = { getContext: () => null };
    sandbox.window.addEventListener = () => {};

    vm.createContext(sandbox);
    const gmScript = fs.readFileSync(path.join(__dirname, '..', 'js', 'graph-manager.js'), 'utf8');
    const script = new vm.Script(gmScript);
    script.runInContext(sandbox);

    return sandbox.window.GraphManager;
}

const GraphManager = createTestEnvironment();

// Edge-only CSV with header
const csv = 'source_id,target_id,edge_type,edge_label\n' +
            'n1,n2,friend,knows\n' +
            'n2,n3,friend,knows\n';

const parsed = GraphManager.parseCSVData(csv);

assert.strictEqual(parsed.nodes.length, 3, 'Nodes should be derived from edges');
assert.strictEqual(parsed.edges.length, 2, 'Edges should be parsed');
assert.strictEqual(parsed.edges[0].data.source, 'n1');
assert.strictEqual(parsed.edges[0].data.target, 'n2');
assert.strictEqual(parsed.edges[0].data.showArrows, true, 'Edges should default to showing arrows');

console.log('parse-edge-only-csv.test.js passed');
