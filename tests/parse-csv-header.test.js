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

// CSV with header row that should be ignored and correctly mapped
const csv = 'node_id,node_label,node_type\n' +
            'n1,Alice,Person\n' +
            '\n' +
            'source_id,target_id,edge_type,edge_label\n';

const parsed = GraphManager.parseCSVData(csv);

assert.strictEqual(parsed.nodes.length, 1, 'Header row should be ignored for nodes');
assert.strictEqual(parsed.nodes[0].data.id, 'n1');
assert.strictEqual(parsed.nodes[0].data.label, 'Alice', 'Node label should match header column');
assert.strictEqual(parsed.nodes[0].data.type, 'Person', 'Node type should match header column');
assert.strictEqual(parsed.edges.length, 0, 'No edges should be parsed');

console.log('parse-csv-header.test.js passed');
