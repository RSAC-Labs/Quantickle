/**
 * Simple Debug Tools Test
 * Console-based tests for the DebugTools module that can be run directly in the main application
 */

function runSimpleDebugToolsTest() {
    console.log('📋 Simple Debug Tools Test loaded. Run with: window.runSimpleDebugToolsTest()');
    console.log('🧪 Running Simple Debug Tools Test...');
    
    // Diagnostic information
    console.log('🔍 Diagnostic Info:');
    console.log('- DebugToolsModule type:', typeof window.DebugToolsModule);
    console.log('- DebugToolsAdapter type:', typeof window.DebugToolsAdapter);
    console.log('- GraphRenderer available:', !!window.GraphRenderer);
    console.log('- Cytoscape available:', typeof window.cytoscape);
    
    // List all scripts containing 'debug-tools'
    const scripts = Array.from(document.querySelectorAll('script')).filter(s => 
        s.src && s.src.includes('debug-tools')
    );
    console.log('- Debug Tools scripts loaded:', scripts.map(s => s.src));
    
    function assert(condition, message) {
        if (condition) {
            console.log(`✅ PASS: ${message}`);
            return true;
        } else {
            console.log(`❌ FAIL: ${message}`);
            return false;
        }
    }
    
    let testsPassed = 0;
    let totalTests = 0;
    
    function test(testName, testFunction) {
        totalTests++;
        console.log(`\n🔍 Testing: ${testName}`);
        try {
            const result = testFunction();
            if (result) {
                testsPassed++;
                console.log(`✅ ${testName} - PASSED`);
            } else {
                console.log(`❌ ${testName} - FAILED`);
            }
        } catch (error) {
            console.log(`💥 ${testName} - ERROR:`, error.message);
        }
    }
    
    // Run tests
    test('DebugToolsModule is available', () => {
        return assert(typeof window.DebugToolsModule === 'function', 'DebugToolsModule constructor available');
    });
    
    test('DebugToolsAdapter is available', () => {
        return assert(typeof window.DebugToolsAdapter === 'object', 'DebugToolsAdapter object available');
    });
    
    test('DebugToolsAdapter has required methods', () => {
        const adapter = window.DebugToolsAdapter;
        return assert(
            typeof adapter.getStatus === 'function' &&
            typeof adapter.enableModularVersion === 'function',
            'Adapter has required methods'
        );
    });
    
    test('DebugToolsAdapter status', () => {
        const status = window.DebugToolsAdapter.getStatus();
        console.log('📊 Adapter Status:', status);
        return assert(typeof status === 'object', 'Status returned successfully');
    });
    
    test('Can create DebugToolsModule instance', () => {
        try {
            const mockDeps = {
                cytoscape: window.GraphRenderer ? window.GraphRenderer.cy : null,
                notifications: {
                    show: (msg) => console.log('[NOTIFICATION]', msg)
                }
            };
            
            const module = new window.DebugToolsModule(mockDeps);
            const success = module && typeof module.getDebugInfo === 'function';
            
            if (module && module.destroy) {
                module.destroy();
            }
            
            return assert(success, 'DebugToolsModule instance created successfully');
        } catch (error) {
            console.log('❌ Module creation failed:', error.message);
            return false;
        }
    });
    
    test('Adapter modular version test', () => {
        if (!window.DebugToolsAdapter.testModularVersion) {
            console.log('⚠️ Test method not available, skipping...');
            return true;
        }
        
        try {
            const result = window.DebugToolsAdapter.testModularVersion();
            return assert(result, 'Modular version test passed');
        } catch (error) {
            console.log('❌ Modular test failed:', error.message);
            return false;
        }
    });
    
    test('Global debug functions available', () => {
        const expectedFunctions = [
            'debugContainer', 'debugNodes', 'forceNodesVisible', 'testNodeVisibility',
            'debugPerformance', 'forceRefresh', 'forceCompleteRerender', 'testRendering',
            'debugInfo', 'debugAll'
        ];
        
        // Force function exposure before checking (timing issue fix)
        if (window.DebugToolsAdapter && window.DebugToolsAdapter.updateGlobalFunctions) {
            window.DebugToolsAdapter.updateGlobalFunctions();
        }
        
        const availableFunctions = expectedFunctions.filter(name => typeof window[name] === 'function');
        const allAvailable = availableFunctions.length === expectedFunctions.length;
        
        console.log(`📝 Global functions: ${availableFunctions.length}/${expectedFunctions.length} available`);
        console.log('Available:', availableFunctions);
        
        if (!allAvailable) {
            const missing = expectedFunctions.filter(name => typeof window[name] !== 'function');
            console.log('Missing:', missing);
            
            // Debug: check what's actually in window
            console.log('🔍 Debug - All window functions containing "debug":', 
                Object.keys(window).filter(k => k.toLowerCase().includes('debug')));
        }
        
        return assert(allAvailable, 'All expected global debug functions available');
    });
    
    test('Switch to modular version', () => {
        try {
            window.DebugToolsAdapter.enableModularVersion();
            const status = window.DebugToolsAdapter.getStatus();
            const usingModular = status.currentImplementation === 'modular';
            
            console.log('📊 After switch - Implementation:', status.currentImplementation);
            return assert(usingModular, 'Successfully switched to modular version');
        } catch (error) {
            console.log('❌ Switch failed:', error.message);
            return false;
        }
    });
    
    test('Test modular debug functionality', () => {
        try {
            if (typeof window.debugInfo === 'function') {
                const info = window.debugInfo();
                const hasInfo = info && typeof info === 'object';
                
                if (hasInfo) {
                    console.log('📊 Debug Info Sample:');
                    console.log('- Timestamp:', info.timestamp);
                    console.log('- Module version:', info.module?.version);
                    console.log('- Cytoscape available:', info.cytoscape?.available);
                }
                
                return assert(hasInfo, 'Debug info retrieved successfully');
            } else {
                return assert(false, 'debugInfo function not available');
            }
        } catch (error) {
            console.log('❌ Debug functionality test failed:', error.message);
            return false;
        }
    });
    
    // Final results
    console.log(`\n📊 FINAL RESULTS: ${testsPassed}/${totalTests} tests passed`);
    
    if (testsPassed === totalTests) {
        console.log('🎉 ALL DEBUG TOOLS TESTS PASSED!');
        return true;
    } else {
        console.log('⚠️ Some debug tools tests failed');
        return false;
    }
}

/**
 * Enhanced test function that handles module loading gracefully
 */
function waitForDebugToolsAndTest(maxAttempts = 30, attempt = 1) {
    console.log(`🔄 Attempt ${attempt}/${maxAttempts}: Checking for Debug Tools modules...`);
    
    if (window.DebugToolsModule && window.DebugToolsAdapter) {
        console.log('✅ Debug Tools modules found! Running tests...');
        return runSimpleDebugToolsTest();
    } else {
        console.log('⏳ Debug Tools modules not ready yet...');
        
        if (attempt >= maxAttempts) {
            console.log('❌ Max attempts reached. Debug Tools modules may not be loaded.');
            console.log('💡 Try refreshing the page (F5/Ctrl+R) to ensure all scripts are loaded.');
            return false;
        }
        
        setTimeout(() => {
            waitForDebugToolsAndTest(maxAttempts, attempt + 1);
        }, 500);
    }
}

/**
 * Main entry point with loading detection
 */
function runTestWithLoading() {
    console.log('🚀 Starting Debug Tools Test with loading detection...');
    
    // First, check if modules are already loaded
    if (window.DebugToolsModule && window.DebugToolsAdapter) {
        console.log('✅ Modules already loaded');
        return runSimpleDebugToolsTest();
    }
    
    // Check if scripts are in the DOM but not executed
    const moduleScript = Array.from(document.querySelectorAll('script')).find(s => 
        s.src && s.src.includes('debug-tools-module.js')
    );
    const adapterScript = Array.from(document.querySelectorAll('script')).find(s => 
        s.src && s.src.includes('debug-tools') && s.src.includes('adapter.js')
    );
    
    if (moduleScript && adapterScript) {
        console.log('📜 Scripts found in DOM, but modules not in global scope');
        console.log('💡 You may need to refresh the page (F5/Ctrl+R) for the scripts to execute');
        
        // Still try to wait
        return waitForDebugToolsAndTest();
    } else {
        console.log('❌ Debug Tools scripts not found in DOM');
        console.log('💡 Make sure the main application page includes the Debug Tools module scripts');
        return false;
    }
}

// Expose globally for easy console access
window.runSimpleDebugToolsTest = runSimpleDebugToolsTest;
window.runTestWithLoading = runTestWithLoading;

// Also expose the waiting function for manual use
window.waitForDebugToolsAndTest = waitForDebugToolsAndTest;

console.log('📋 Simple Debug Tools Test loaded.');
console.log('🔧 Available commands:');
console.log('   window.runSimpleDebugToolsTest() - Run tests directly');
console.log('   window.runTestWithLoading() - Run tests with loading detection (recommended)');
console.log('   window.waitForDebugToolsAndTest() - Wait for modules then test');
