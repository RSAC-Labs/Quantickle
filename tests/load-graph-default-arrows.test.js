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
            getElementById: () => ({
                addEventListener: () => {},
                style: {},
                classList: { add: () => {}, remove: () => {} },
                textContent: ''
            }),
            addEventListener: () => {},
            body: { appendChild: () => {} }
        },
        console,
        setTimeout,
        clearTimeout,
        Map,
        Math,
        performance: { now: () => 0 }
    };

    sandbox.window.window = sandbox.window;
    sandbox.window.document = sandbox.document;
    sandbox.window.console = console;
    sandbox.window.setTimeout = setTimeout;
    sandbox.window.clearTimeout = clearTimeout;
    sandbox.window.Map = Map;
    sandbox.window.Math = Math;
    sandbox.window.performance = sandbox.performance;
    sandbox.window.requestAnimationFrame = (fn) => setTimeout(fn, 0);
    sandbox.window.cancelAnimationFrame = (id) => clearTimeout(id);
    sandbox.window.HTMLCanvasElement = function() {};
    sandbox.window.HTMLCanvasElement.prototype = { getContext: () => null };
    sandbox.window.addEventListener = () => {};
    sandbox.window.confirm = () => true;
    sandbox.window.alert = () => {};
    sandbox.window.location = { origin: 'http://localhost' };

    sandbox.window.LayoutManager = {
        ensureGridLayoutDefault: () => {},
        defaultLayout: 'grid',
        currentLayout: 'grid',
        updateLayoutDropdown: () => {}
    };

    sandbox.window.reset3DRotation = () => {};
    sandbox.window.GlobeLayout3D = {
        stopAutoRotation: () => {},
        config: {},
        resetRotation: () => {},
        resetVisualEffects: () => {},
        isActive: false
    };

    sandbox.window.DomainLoader = {
        autoLoadDomainsForGraph: async () => [],
        updateActiveDomainsStatus: () => {}
    };

    sandbox.window.DataManager = {
        isLoading: false,
        setGraphData: () => {},
        getGraphData: () => ({ nodes: [], edges: [] }),
        setGraphName: () => {}
    };

    sandbox.window.GraphRenderer = {
        cy: null,
        renderGraph: () => {},
        skipNextLayoutApplication: false
    };

    sandbox.window.TableManager = {
        updateTables: () => {},
        updateTotalDataTable: () => {}
    };

    sandbox.window.GraphAreaEditor = {
        applySettings: () => {}
    };

    sandbox.window.UI = {
        showNotification: () => {}
    };

    vm.createContext(sandbox);
    const utilsScript = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');
    new vm.Script(utilsScript).runInContext(sandbox);
    const gmScript = fs.readFileSync(path.join(__dirname, '..', 'js', 'graph-manager.js'), 'utf8');
    const script = new vm.Script(gmScript);
    script.runInContext(sandbox);

    return sandbox.window.GraphManager;
}

async function runTest() {
    const GraphManager = createTestEnvironment();

    const graphData = {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Test graph',
        description: 'Test graph',
        metadata: { source: 'Manually added' },
        nodes: [
            { data: { id: 'n1', label: 'Node 1', type: 'default' } },
            { data: { id: 'n2', label: 'Node 2', type: 'default' } }
        ],
        edges: [
            { data: { id: 'n1-n2', source: 'n1', target: 'n2' } },
            { id: 'n2-n1', source: 'n2', target: 'n1', showArrows: false }
        ]
    };

    await GraphManager.loadGraphData(graphData);

    const edges = GraphManager.currentGraph.edges;
    assert.ok(edges && edges.length === 2, 'Edges should be loaded');

    const [firstEdge, secondEdge] = edges;
    const firstPayload = firstEdge.data || firstEdge;
    const secondPayload = secondEdge.data || secondEdge;

    assert.strictEqual(firstPayload.showArrows, true, 'Edges without showArrows should default to true');
    assert.strictEqual(secondPayload.showArrows, false, 'Existing showArrows values should be preserved');

    console.log('load-graph-default-arrows.test.js passed');
}

runTest().catch(error => {
    console.error(error);
    process.exit(1);
});
