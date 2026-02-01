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

const csv = [
    'node_id,node_type,node_label,node_color',
    'manual_node_1,user,Alice,blue',
    'manual_node_2,user,Tom,red',
    ',,,',
    'source_id,target_id,edge_type,edge_label',
    'manual_node_1,manual_node_2,solid,talks to'
].join('\n');

const parsed = GraphManager.parseCSVData(csv);

assert.strictEqual(parsed.nodes.length, 2, 'Expected two nodes');
assert.strictEqual(parsed.edges.length, 1, 'Expected one edge');

const nodeMap = new Map(parsed.nodes.map(node => [node.data.id, node.data]));

assert.strictEqual(nodeMap.get('manual_node_1').color, 'blue', 'manual_node_1 color should be preserved');
assert.strictEqual(nodeMap.get('manual_node_2').color, 'red', 'manual_node_2 color should be preserved');

const edge = parsed.edges[0].data;
assert.strictEqual(edge.source, 'manual_node_1');
assert.strictEqual(edge.target, 'manual_node_2');
assert.strictEqual(edge.type, 'solid');
assert.strictEqual(edge.lineStyle, 'solid');
assert.strictEqual(edge.label, 'talks to');

console.log('parse-csv-node-colors.test.js passed');
