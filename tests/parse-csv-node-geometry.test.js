const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createTestEnvironment() {
    const sandbox = {
        window: {
            QuantickleConfig: {
                defaultNodeSize: 25,
                defaultNodeColor: '#e6f0fa'
            }
        },
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
    'node_id,node_label,node_type,node_size,node_color,node_x,node_y',
    'node_a,A,user,45,#123456,10.5,20.25',
    'node_b,B,user,,,',
    ',,,',
    'source,target,label',
    'node_a,node_b,connects'
].join('\n');

const parsed = GraphManager.parseCSVData(csv);

assert.strictEqual(parsed.nodes.length, 2, 'Expected two nodes');

const nodeMap = new Map(parsed.nodes.map(node => [node.data.id, node.data]));

const nodeA = nodeMap.get('node_a');
assert.strictEqual(nodeA.size, 45, 'node_a size should come from CSV');
assert.strictEqual(nodeA.color, '#123456', 'node_a color should come from CSV');
assert.strictEqual(nodeA.x, 10.5, 'node_a x coordinate should be parsed');
assert.strictEqual(nodeA.y, 20.25, 'node_a y coordinate should be parsed');
assert.ok(nodeA.position, 'node_a position should be set');
assert.strictEqual(nodeA.position.x, 10.5, 'node_a position.x should be parsed');
assert.strictEqual(nodeA.position.y, 20.25, 'node_a position.y should be parsed');

const nodeB = nodeMap.get('node_b');
assert.strictEqual(nodeB.size, 25, 'node_b size should fall back to defaultNodeSize');
assert.strictEqual(nodeB.color, '#e6f0fa', 'node_b color should fall back to defaultNodeColor');
assert.strictEqual(nodeB.x, undefined, 'node_b x should be undefined when not provided');
assert.strictEqual(nodeB.y, undefined, 'node_b y should be undefined when not provided');
assert.strictEqual(nodeB.position, undefined, 'node_b should not include a position when coordinates are missing');

const edge = parsed.edges[0].data;
assert.strictEqual(edge.source, 'node_a');
assert.strictEqual(edge.target, 'node_b');
assert.strictEqual(edge.label, 'connects');

console.log('parse-csv-node-geometry.test.js passed');
