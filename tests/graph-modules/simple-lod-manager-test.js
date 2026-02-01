/**
 * Simple LOD Manager Test
 * Quick verification of LODManager functionality directly in main application
 */

console.log('📋 Simple LOD Manager Test loaded. Run with: window.runSimpleLODManagerTest()');

function runSimpleLODManagerTest() {
    console.log('🧪 Running Simple LOD Manager Test...');
    
    // Diagnostic info
    console.log('🔍 Diagnostic Info:');
    console.log('- LODManagerAdapter type:', typeof window.LODManagerAdapter);
    console.log('- GraphRenderer available:', !!window.GraphRenderer);
    console.log('- Cytoscape available:', typeof cytoscape);
    
    // Check if required scripts are loaded
    const requiredScripts = [
        'adapter.js'
    ];
    
    const loadedScripts = Array.from(document.scripts)
        .map(script => script.src)
        .filter(src => requiredScripts.some(required => src.includes(required)));
    
    console.log('- LOD Manager scripts loaded:', loadedScripts);
    
    // Simple assertion function
    function assert(condition, message) {
        if (condition) {
            console.log('✅ PASS:', message);
            return true;
        } else {
            console.log('❌ FAIL:', message);
            return false;
        }
    }
    
    // Test function
    function test(name, testFn) {
        console.log(`🔍 Testing: ${name}`);
        try {
            const result = testFn();
            if (result) {
                console.log(`✅ ${name} - PASSED`);
            } else {
                console.log(`❌ ${name} - FAILED`);
            }
            return result;
        } catch (error) {
            console.log(`❌ ${name} - ERROR:`, error.message);
            return false;
        }
    }
    
    let passedTests = 0;
    let totalTests = 0;
    
    // Test 1: LODManagerAdapter availability  
    totalTests++;
    if (test('LODManagerAdapter is available', () => {
        return assert(!!window.LODManagerAdapter && typeof window.LODManagerAdapter === 'object', 'LODManagerAdapter object available');
    })) passedTests++;
    
    // Test 2: Adapter methods
    totalTests++;
    if (test('LODManagerAdapter has required methods', () => {
        const adapter = window.LODManagerAdapter;
        const requiredMethods = ['getStatus', 'enableLegacyVersion', 'exposeGlobalFunctions'];
        const hasAllMethods = requiredMethods.every(method => typeof adapter[method] === 'function');
        return assert(hasAllMethods, 'Adapter has required methods');
    })) passedTests++;
    
    // Test 3: Adapter status
    totalTests++;
    if (test('LODManagerAdapter status', () => {
        try {
            const status = window.LODManagerAdapter.getStatus();
            console.log('📊 Adapter Status:', status);
            return assert(status && typeof status === 'object', 'Status returned successfully');
        } catch (error) {
            console.log('❌ Status check failed:', error);
            return false;
        }
    })) passedTests++;
    
    // Test 4: Global functions
    totalTests++;
    if (test('Global LOD manager functions available', () => {
        const expectedFunctions = [
            'determineLODLevel', 'applyLODRendering', 'getLODConfig',
            'sampleNodes', 'buildHierarchicalClusters', 'applyAggressiveLOD',
            'lodManagerReport'
        ];
        
        const availableFunctions = expectedFunctions.filter(fn => typeof window[fn] === 'function');
        
        console.log(`📝 Global functions: ${availableFunctions.length}/${expectedFunctions.length} available`);
        console.log('Available:', availableFunctions);
        
        return assert(availableFunctions.length === expectedFunctions.length, 'All expected global LOD functions available');
    })) passedTests++;
    
    // Test 5: LOD level determination
    totalTests++;
    if (test('LOD level determination works', () => {
        try {
            const level1 = window.determineLODLevel(100, 200);
            const level2 = window.determineLODLevel(10000, 20000);
            const level3 = window.determineLODLevel(100000, 200000);
            
            console.log('📊 LOD Levels:');
            console.log('- Small dataset (100n, 200e):', level1);
            console.log('- Medium dataset (10Kn, 20Ke):', level2);
            console.log('- Large dataset (100Kn, 200Ke):', level3);
            
            return assert(
                typeof level1 === 'string' && 
                typeof level2 === 'string' && 
                typeof level3 === 'string', 
                'LOD level determination returns valid levels'
            );
        } catch (error) {
            console.log('❌ LOD determination failed:', error);
            return false;
        }
    })) passedTests++;
    
    // Test 6: LOD configuration
    totalTests++;
    if (test('LOD configuration retrieval', () => {
        try {
            const config1 = window.getLODConfig('full');
            const config2 = window.getLODConfig('medium');
            const config3 = window.getLODConfig('ultra-low');
            
            console.log('📊 LOD Configs:');
            console.log('- Full config sampling:', config1.nodeSampling);
            console.log('- Medium config sampling:', config2.nodeSampling);
            console.log('- Ultra-low config sampling:', config3.nodeSampling);
            
            return assert(
                config1 && config2 && config3 &&
                config1.nodeSampling >= config2.nodeSampling &&
                config2.nodeSampling >= config3.nodeSampling,
                'LOD configurations retrieved and properly scaled'
            );
        } catch (error) {
            console.log('❌ LOD config failed:', error);
            return false;
        }
    })) passedTests++;
    
    // Test 7: Node sampling
    totalTests++;
    if (test('Node sampling functionality', () => {
        try {
            // Create mock nodes
            const mockNodes = Array.from({length: 100}, (_, i) => ({
                id: () => `node_${i}`,
                data: () => ({ id: `node_${i}`, type: 'default' }),
                position: () => ({ x: Math.random() * 1000, y: Math.random() * 1000 })
            }));
            
            const mockEdges = [];
            
            const sampled25 = window.sampleNodes(mockNodes, 25, 'random', mockEdges);
            const sampled50 = window.sampleNodes(mockNodes, 50, 'degree', mockEdges);
            
            console.log('📊 Sampling Results:');
            console.log('- Random sampling (25):', sampled25.length);
            console.log('- Degree sampling (50):', sampled50.length);
            
            return assert(
                sampled25.length === 25 && 
                sampled50.length === 50,
                'Node sampling returns correct sample sizes'
            );
        } catch (error) {
            console.log('❌ Node sampling failed:', error);
            return false;
        }
    })) passedTests++;
    
    // Test 8: LOD rendering application
    totalTests++;
    if (test('LOD rendering application', () => {
        try {
            // Create mock graph data
            const mockGraphData = {
                nodes: Array.from({length: 1000}, (_, i) => ({
                    id: `node_${i}`,
                    data: { id: `node_${i}`, type: 'default' }
                })),
                edges: Array.from({length: 500}, (_, i) => ({
                    id: `edge_${i}`,
                    data: { id: `edge_${i}`, source: `node_${i}`, target: `node_${i + 1}` }
                }))
            };
            
            const result = window.applyLODRendering(mockGraphData, 'medium');
            
            console.log('📊 LOD Rendering:');
            console.log('- Original nodes:', mockGraphData.nodes.length);
            console.log('- Rendered nodes:', result.nodesToRender.length);
            console.log('- Original edges:', mockGraphData.edges.length);
            console.log('- Rendered edges:', result.edgesToRender.length);
            
            return assert(
                result && 
                result.nodesToRender && 
                result.edgesToRender &&
                Array.isArray(result.nodesToRender) &&
                Array.isArray(result.edgesToRender),
                'LOD rendering returns valid node and edge arrays'
            );
        } catch (error) {
            console.log('❌ LOD rendering failed:', error);
            return false;
        }
    })) passedTests++;

    // Test 9: Clustering functions
    totalTests++;
    if (test('Clustering functions available', () => {
        try {
            // Test clustering function availability
            const spatialResult = window.createSpatialClusters ? 'available' : 'not available';
            const connectivityResult = window.createConnectivityClusters ? 'available' : 'not available';
            const typeResult = window.createTypeClusters ? 'available' : 'not available';
            
            console.log('📊 Clustering Functions:');
            console.log('- Spatial clustering:', spatialResult);
            console.log('- Connectivity clustering:', connectivityResult);
            console.log('- Type clustering:', typeResult);
            
            return assert(
                typeof window.createSpatialClusters === 'function' &&
                typeof window.createConnectivityClusters === 'function' &&
                typeof window.createTypeClusters === 'function',
                'All clustering functions available'
            );
        } catch (error) {
            console.log('❌ Clustering test failed:', error);
            return false;
        }
    })) passedTests++;
    
    // Results
    console.log(`📊 FINAL RESULTS: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
        console.log('🎉 All LOD manager tests passed!');
        return true;
    } else {
        console.log('⚠️ Some LOD manager tests failed');
        return false;
    }
}

// Auto-expose to global scope
window.runSimpleLODManagerTest = runSimpleLODManagerTest;

// Function with loading detection
function runLODManagerTestWithLoading(maxAttempts = 10, attempt = 1) {
    console.log('🚀 Starting LOD Manager Test with loading detection...');
    
    // Check if modules are loaded
    const modulesLoaded = typeof window.LODManagerAdapter === 'object';
    
    if (modulesLoaded) {
        console.log('✅ Modules already loaded');
        return runSimpleLODManagerTest();
    } else {
        if (attempt <= maxAttempts) {
            console.log(`⏳ Waiting for modules to load... (attempt ${attempt}/${maxAttempts})`);
            setTimeout(() => runLODManagerTestWithLoading(maxAttempts, attempt + 1), 1000);
        } else {
            console.log('❌ Modules failed to load after maximum attempts');
            console.log('💡 Try refreshing the page (F5) to ensure all scripts are loaded');
            return false;
        }
    }
}

window.runLODManagerTestWithLoading = runLODManagerTestWithLoading;
