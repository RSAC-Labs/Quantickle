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

(function testNodeEdgeLineStyle() {
    const csv = [
        'node_id,node_label',
        'a,Alice',
        ',,',
        'source_id,target_id,edge_type',
        'a,b,dotted'
    ].join('\n');

    const parsed = GraphManager.parseCSVData(csv);

    assert.strictEqual(parsed.edges.length, 1, 'Expected one edge from node/edge CSV');
    const edge = parsed.edges[0].data;
    assert.strictEqual(edge.type, 'dotted');
    assert.strictEqual(edge.lineStyle, 'dotted');
    assert.strictEqual(edge.customStyleOverrides.lineStyle, true, 'Line style should be marked as customized');
})();

(function testEdgeOnlyLineStyle() {
    const csv = [
        'source,target,edge_type',
        'x,y,dashed'
    ].join('\n');

    const parsed = GraphManager.parseCSVData(csv);

    assert.strictEqual(parsed.edges.length, 1, 'Expected one edge from edge-only CSV');
    const edge = parsed.edges[0].data;
    assert.strictEqual(edge.type, 'dashed');
    assert.strictEqual(edge.lineStyle, 'dashed');
    assert.strictEqual(edge.customStyleOverrides.lineStyle, true, 'Line style should be marked as customized');
})();

console.log('parse-csv-edge-style.test.js passed');
