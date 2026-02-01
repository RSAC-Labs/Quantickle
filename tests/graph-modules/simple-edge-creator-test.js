/**
 * Simple Edge Creator Test
 * Quick verification of EdgeCreator functionality directly in main application
 */

console.log('📋 Simple Edge Creator Test loaded. Run with: window.runSimpleEdgeCreatorTest()');

function runSimpleEdgeCreatorTest() {
    console.log('🧪 Running Simple Edge Creator Test...');
    
    // Diagnostic info
    console.log('🔍 Diagnostic Info:');
    console.log('- EdgeCreatorModule type:', typeof EdgeCreatorModule);
    console.log('- EdgeCreatorAdapter type:', typeof window.EdgeCreatorAdapter);
    console.log('- GraphRenderer available:', !!window.GraphRenderer);
    console.log('- Cytoscape available:', typeof cytoscape);
    
    // Check if required scripts are loaded
    const requiredScripts = [
        'edge-creator-module.js',
        'adapter.js'
    ];
    
    const loadedScripts = Array.from(document.scripts)
        .map(script => script.src)
        .filter(src => requiredScripts.some(required => src.includes(required)));
    
    console.log('- Edge Creator scripts loaded:', loadedScripts);
    
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
    
    // Test 1: EdgeCreatorModule availability
    totalTests++;
    if (test('EdgeCreatorModule is available', () => {
        return assert(typeof EdgeCreatorModule === 'function', 'EdgeCreatorModule constructor available');
    })) passedTests++;
    
    // Test 2: EdgeCreatorAdapter availability  
    totalTests++;
    if (test('EdgeCreatorAdapter is available', () => {
        return assert(!!window.EdgeCreatorAdapter && typeof window.EdgeCreatorAdapter === 'object', 'EdgeCreatorAdapter object available');
    })) passedTests++;
    
    // Test 3: Adapter methods
    totalTests++;
    if (test('EdgeCreatorAdapter has required methods', () => {
        const adapter = window.EdgeCreatorAdapter;
        const requiredMethods = ['getStatus', 'enableModularVersion', 'enableLegacyVersion', 'exposeGlobalFunctions'];
        const hasAllMethods = requiredMethods.every(method => typeof adapter[method] === 'function');
        return assert(hasAllMethods, 'Adapter has required methods');
    })) passedTests++;
    
    // Test 4: Adapter status
    totalTests++;
    if (test('EdgeCreatorAdapter status', () => {
        try {
            const status = window.EdgeCreatorAdapter.getStatus();
            console.log('📊 Adapter Status:', status);
            return assert(status && typeof status === 'object', 'Status returned successfully');
        } catch (error) {
            console.log('❌ Status check failed:', error);
            return false;
        }
    })) passedTests++;
    
    // Test 5: Module instantiation
    totalTests++;
    if (test('Can create EdgeCreatorModule instance', () => {
        try {
            // Mock dependencies for testing
            const mockDependencies = {
                cytoscape: window.cy || {
                    autoungrabify: () => {},
                    nodes: () => ({ length: 0, forEach: () => {}, contains: () => false }),
                    getElementById: () => ({ length: 0 }),
                    add: () => ({ id: () => 'test' })
                },
                notifications: { show: () => {} },
                config: {}
            };
            
            const instance = new EdgeCreatorModule(mockDependencies);
            const success = instance && instance.init;
            
            // Clean up
            if (instance && instance.destroy) {
                instance.destroy();
            }
            
            return assert(success, 'EdgeCreatorModule instance created successfully');
        } catch (error) {
            console.log('❌ Module creation failed:', error.message);
            return false;
        }
    })) passedTests++;
    
    // Test 6: Global functions
    totalTests++;
    if (test('Global edge creator functions available', () => {
        const expectedFunctions = [
            'handleShiftClick', 'startEdgeCreation', 'completeEdgeCreation', 
            'cancelEdgeCreation', 'startGroupEdgeCreation', 'completeGroupEdgeCreation',
            'isEdgeCreationMode', 'edgeCreatorReport'
        ];
        
        const availableFunctions = expectedFunctions.filter(fn => typeof window[fn] === 'function');
        
        console.log(`📝 Global functions: ${availableFunctions.length}/${expectedFunctions.length} available`);
        console.log('Available:', availableFunctions);
        
        return assert(availableFunctions.length === expectedFunctions.length, 'All expected global edge creator functions available');
    })) passedTests++;
    
    // Test 7: Edge creator report
    totalTests++;
    if (test('Edge creator report generation', () => {
        try {
            const report = window.edgeCreatorReport();
            console.log('📊 Edge Creator Report Sample:');
            console.log('- Implementation:', report.implementation || 'modular');
            console.log('- Edge creation active:', report.edgeCreationActive);
            console.log('- Capabilities:', report.capabilities ? report.capabilities.length : 'N/A', 'items');
            
            return assert(report && typeof report === 'object', 'Edge creator report generated successfully');
        } catch (error) {
            console.log('❌ Report generation failed:', error);
            return false;
        }
    })) passedTests++;
    
    // Test 8: Edge creation mode functions
    totalTests++;
    if (test('Edge creation mode functions work', () => {
        try {
            // Test mode checking
            const initialMode = window.isEdgeCreationMode();
            console.log('📊 Initial edge creation mode:', initialMode);
            
            // Test status checking
            const status = window.getEdgeCreationStatus();
            console.log('📊 Edge creation status:', status);
            
            return assert(typeof initialMode === 'boolean' && status && typeof status === 'object', 'Edge creation mode functions work');
        } catch (error) {
            console.log('❌ Mode functions failed:', error);
            return false;
        }
    })) passedTests++;
    
    // Test 9: Switch to modular version
    totalTests++;
    if (test('Switch to modular version', () => {
        try {
            const result = window.EdgeCreatorAdapter.enableModularVersion();
            const status = window.EdgeCreatorAdapter.getStatus();
            
            console.log('📊 After switch - Implementation:', status.currentImplementation);
            
            return assert(status.currentImplementation === 'modular' || !status.modularAvailable, 'Successfully switched to modular version');
        } catch (error) {
            console.log('❌ Switch failed:', error);
            return false;
        }
    })) passedTests++;
    
    // Test 10: Test modular edge creator functionality
    totalTests++;
    if (test('Test modular edge creator functionality', () => {
        try {
            const report = window.edgeCreatorReport();
            console.log('📊 Edge Creator Analysis Sample:');
            console.log('- Report available:', !!report);
            console.log('- Features available:', report.capabilities ? report.capabilities.length : 0);
            
            return assert(!!report, 'Edge creator analysis executed successfully');
        } catch (error) {
            console.log('❌ Analysis failed:', error);
            return false;
        }
    })) passedTests++;
    
    // Test 11: Visual indicator functions
    totalTests++;
    if (test('Visual indicator functions', () => {
        try {
            // Test indicator functions (should not throw errors)
            window.showEdgeCreationIndicator(1);
            setTimeout(() => window.hideEdgeCreationIndicator(), 100);
            
            window.showGroupEdgeCreationIndicator(5);
            setTimeout(() => window.hideEdgeCreationIndicator(), 100);
            
            console.log('📊 Indicator functions executed successfully');
            
            return assert(true, 'Visual indicator functions work');
        } catch (error) {
            console.log('❌ Indicator functions failed:', error);
            return false;
        }
    })) passedTests++;
    
    // Test 12: Edge creation cancellation
    totalTests++;
    if (test('Edge creation cancellation', () => {
        try {
            // Test cancellation function
            const result = window.cancelEdgeCreation();
            const status = window.getEdgeCreationStatus();
            
            console.log('📊 Cancel result:', result);
            console.log('📊 Status after cancel:', status);
            
            return assert(true, 'Edge creation cancellation works');
        } catch (error) {
            console.log('❌ Cancellation failed:', error);
            return false;
        }
    })) passedTests++;
    
    // Test 13: Switch back to legacy version
    totalTests++;
    if (test('Switch back to legacy version', () => {
        try {
            const result = window.EdgeCreatorAdapter.enableLegacyVersion();
            const status = window.EdgeCreatorAdapter.getStatus();
            
            console.log('📊 After switch back - Implementation:', status.currentImplementation);
            
            return assert(status.currentImplementation === 'legacy', 'Successfully switched back to legacy version');
        } catch (error) {
            console.log('❌ Switch back failed:', error);
            return false;
        }
    })) passedTests++;
    
    // Results
    console.log(`📊 FINAL RESULTS: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
        console.log('🎉 All edge creator tests passed!');
        return true;
    } else {
        console.log('⚠️ Some edge creator tests failed');
        return false;
    }
}

// Auto-expose to global scope
window.runSimpleEdgeCreatorTest = runSimpleEdgeCreatorTest;

// Function with loading detection
function runEdgeCreatorTestWithLoading(maxAttempts = 10, attempt = 1) {
    console.log('🚀 Starting Edge Creator Test with loading detection...');
    
    // Check if modules are loaded
    const modulesLoaded = typeof EdgeCreatorModule === 'function' && 
                         typeof window.EdgeCreatorAdapter === 'object';
    
    if (modulesLoaded) {
        console.log('✅ Modules already loaded');
        return runSimpleEdgeCreatorTest();
    } else {
        if (attempt <= maxAttempts) {
            console.log(`⏳ Waiting for modules to load... (attempt ${attempt}/${maxAttempts})`);
            setTimeout(() => runEdgeCreatorTestWithLoading(maxAttempts, attempt + 1), 1000);
        } else {
            console.log('❌ Modules failed to load after maximum attempts');
            console.log('💡 Try refreshing the page (F5) to ensure all scripts are loaded');
            return false;
        }
    }
}

window.runEdgeCreatorTestWithLoading = runEdgeCreatorTestWithLoading;
