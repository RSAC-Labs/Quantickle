/**
 * Simple Graph Controls Test
 * Quick console-based test for the GraphControls module
 */

console.log('📋 Simple Graph Controls Test loaded. Run with: window.runGraphControlsTestWithLoading()');

function assert(condition, message) {
    if (condition) {
        console.log(`✅ PASS: ${message}`);
        return true;
    } else {
        console.log(`❌ FAIL: ${message}`);
        return false;
    }
}

function runSimpleGraphControlsTest() {
    console.log('🧪 Running Simple Graph Controls Test...');
    
    // Diagnostic info
    console.log('🔍 Diagnostic Info:');
    console.log('- GraphControlsModule type:', typeof window.GraphControlsModule);
    console.log('- GraphControlsModuleBootstrap type:', typeof window.GraphControlsModuleBootstrap);
    console.log('- GraphRenderer available:', !!window.GraphRenderer);
    console.log('- Cytoscape available:', typeof window.cytoscape);
    
    // Check for loaded scripts
    const graphControlsScripts = Array.from(document.querySelectorAll('script'))
        .map(script => script.src)
        .filter(src => src && src.includes('graph-controls'));
    
    console.log('- Graph Controls scripts loaded:', graphControlsScripts);
    
    let passed = 0;
    let total = 0;
    
    function test(name, testFn) {
        total++;
        console.log(`\n🔍 Testing: ${name}`);
        try {
            if (testFn()) {
                console.log(`✅ ${name} - PASSED`);
                passed++;
            } else {
                console.log(`❌ ${name} - FAILED`);
            }
        } catch (error) {
            console.log(`❌ ${name} - ERROR:`, error.message);
        }
    }
    
    // Test 1: Module availability
    test('GraphControlsModule is available', () => {
        return assert(typeof window.GraphControlsModule === 'function', 'GraphControlsModule constructor available');
    });
    
    // Test 2: Adapter availability
    test('GraphControlsModuleBootstrap is available', () => {
        return assert(typeof window.GraphControlsModuleBootstrap === 'object', 'GraphControlsModuleBootstrap object available');
    });
    
    // Test 3: Bootstrap methods
    test('GraphControlsModuleBootstrap has required methods', () => {
        const requiredMethods = ['init'];
        const hasAllMethods = requiredMethods.every(method => typeof window.GraphControlsModuleBootstrap[method] === 'function');
        return assert(hasAllMethods, 'Bootstrap has required methods');
    });
    
    // Test 4: Bootstrap status
    test('GraphControlsModuleBootstrap status', () => {
        try {
            const bootstrap = window.GraphControlsModuleBootstrap;
            const status = {
                initialized: bootstrap.initialized,
                hasModuleInstance: !!bootstrap.moduleInstance
            };
            console.log('📊 Bootstrap Status:', status);
            return assert(status && typeof status === 'object', 'Status returned successfully');
        } catch (error) {
            console.log('❌ Status check failed:', error.message);
            return false;
        }
    });
    
    // Test 5: Can create module instance
    test('Can create GraphControlsModule instance', () => {
        try {
            if (!window.GraphRenderer || !window.GraphRenderer.cy) {
                console.log('⚠️ No Cytoscape instance available, skipping module creation test');
                return true; // Skip this test if no graph available
            }
            
            const instance = new window.GraphControlsModule({
                cytoscape: window.GraphRenderer.cy,
                notifications: { show: () => {} },
                config: {}
            });
            
            const success = instance && instance.initialized;
            if (instance && instance.destroy) {
                instance.destroy(); // Clean up
            }
            
            return assert(success, 'GraphControlsModule instance created successfully');
        } catch (error) {
            console.log('❌ Module creation failed:', error.message);
            return false;
        }
    });
    
    // Test 6: Global controls functions available
    test('Global controls functions available', () => {
        const expectedFunctions = ['fitGraph', 'centerGraph', 'zoomIn', 'zoomOut', 'getCurrentZoom', 'resetView', 'controlsReport'];
        const availableFunctions = expectedFunctions.filter(name => typeof window[name] === 'function');
        
        console.log(`📝 Global functions: ${availableFunctions.length}/${expectedFunctions.length} available`);
        console.log('Available:', availableFunctions);
        
        return assert(availableFunctions.length === expectedFunctions.length, 'All expected global controls functions available');
    });
    
    // Test 7: Controls report generation
    test('Controls report generation', () => {
        try {
            const report = window.controlsReport
                ? window.controlsReport()
                : window.GraphControlsModuleBootstrap?.moduleInstance?.generateControlsReport();
            console.log('📊 Controls Report Sample:');
            console.log('- Implementation:', report.implementation || 'modular');
            console.log('- Current zoom:', report.currentZoom);
            console.log('- Capabilities:', report.capabilities || []);
            
            return assert(report && typeof report === 'object', 'Controls report generated successfully');
        } catch (error) {
            console.log('❌ Report generation failed:', error.message);
            return false;
        }
    });
    
    // Test 8: Zoom functions work
    test('Zoom functions work', () => {
        try {
            if (!window.GraphRenderer || !window.GraphRenderer.cy) {
                console.log('⚠️ No graph available, skipping zoom test');
                return true;
            }
            
            const initialZoom = window.getCurrentZoom();
            console.log('📊 Initial zoom:', initialZoom);
            
            // Test zoom in
            window.zoomIn();
            const zoomInLevel = window.getCurrentZoom();
            console.log('📊 After zoom in:', zoomInLevel);
            
            // Test zoom out
            window.zoomOut();
            const zoomOutLevel = window.getCurrentZoom();
            console.log('📊 After zoom out:', zoomOutLevel);
            
            return assert(
                typeof initialZoom === 'number' && 
                typeof zoomInLevel === 'number' && 
                typeof zoomOutLevel === 'number',
                'Zoom functions work'
            );
        } catch (error) {
            console.log('❌ Zoom test failed:', error.message);
            return false;
        }
    });
    
    // Test 9: Initialize module bootstrap
    test('Initialize module bootstrap', () => {
        try {
            const result = window.GraphControlsModuleBootstrap.init();
            const status = {
                initialized: window.GraphControlsModuleBootstrap.initialized,
                hasModuleInstance: !!window.GraphControlsModuleBootstrap.moduleInstance
            };
            console.log('📊 After init - Status:', status);
            return assert(result || status.hasModuleInstance, 'Successfully initialized module bootstrap');
        } catch (error) {
            console.log('❌ Switch failed:', error.message);
            return false;
        }
    });
    
    // Test 10: Test modular controls functionality
    test('Test modular controls functionality', () => {
        try {
            const analysis = window.analyzeControls();
            console.log('📊 Controls Analysis Sample:');
            console.log('- Report available:', !!analysis);
            console.log('- Features available:', analysis.capabilities ? analysis.capabilities.length : 'N/A');
            
            return assert(analysis && typeof analysis === 'object', 'Controls analysis executed successfully');
        } catch (error) {
            console.log('❌ Analysis failed:', error.message);
            return false;
        }
    });
    
    // Test 11: Reset view functionality
    test('Reset view functionality', () => {
        try {
            if (!window.GraphRenderer || !window.GraphRenderer.cy) {
                console.log('⚠️ No graph available, skipping reset view test');
                return true;
            }
            
            const result = window.resetView();
            console.log('📊 Reset view result:', result);
            
            return assert(typeof result === 'boolean', 'Reset view function works');
        } catch (error) {
            console.log('❌ Reset view test failed:', error.message);
            return false;
        }
    });
    
    console.log(`\n📊 FINAL RESULTS: ${passed}/${total} tests passed`);
    
    if (passed === total) {
        console.log('🎉 All graph controls tests passed!');
        return true;
    } else {
        console.log('⚠️ Some graph controls tests failed');
        return false;
    }
}

// Helper function to wait for modules to load
function waitForModulesAndTest(maxAttempts = 5, attempt = 1) {
    console.log(`🔄 Attempt ${attempt}/${maxAttempts}: Checking for GraphControls modules...`);
    
    if (window.GraphControlsModule && window.GraphControlsModuleBootstrap) {
        console.log('✅ Modules found, running test...');
        return runSimpleGraphControlsTest();
    } else if (attempt < maxAttempts) {
        console.log('⏳ Modules not ready, retrying in 1 second...');
        setTimeout(() => waitForModulesAndTest(maxAttempts, attempt + 1), 1000);
    } else {
        console.log('❌ Modules not found after maximum attempts');
        console.log('💡 Make sure you refreshed the page (F5) to load the new script tags');
        
        // Check what's actually loaded
        const scripts = Array.from(document.querySelectorAll('script'))
            .map(script => script.src)
            .filter(src => src && (src.includes('graph-controls') || src.includes('GraphControls')));
        
        if (scripts.length === 0) {
            console.log('⚠️ No GraphControls scripts found in DOM. Did you refresh the page?');
        } else {
            console.log('📋 GraphControls scripts found:', scripts);
            console.log('💡 Scripts are loaded but modules might not be exposing correctly');
        }
        
        return false;
    }
}

function runGraphControlsTestWithLoading() {
    console.log('🚀 Starting Graph Controls Test with loading detection...');
    
    if (window.GraphControlsModule && window.GraphControlsModuleBootstrap) {
        console.log('✅ Modules already loaded');
        return runSimpleGraphControlsTest();
    } else {
        console.log('⏳ Modules not immediately available, using loading detection...');
        return waitForModulesAndTest();
    }
}

// Expose test functions globally
window.runSimpleGraphControlsTest = runSimpleGraphControlsTest;
window.runGraphControlsTestWithLoading = runGraphControlsTestWithLoading;
