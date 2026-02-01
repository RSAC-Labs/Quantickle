/**
 * Simple Performance Manager Test
 * Console-based tests for the PerformanceManager module that can be run directly in the main application
 */

function runSimplePerformanceTest() {
    console.log('📋 Simple Performance Manager Test loaded. Run with: window.runSimplePerformanceTest()');
    console.log('🧪 Running Simple Performance Manager Test...');
    
    // Diagnostic information
    console.log('🔍 Diagnostic Info:');
    console.log('- PerformanceManagerModule type:', typeof window.PerformanceManagerModule);
    console.log('- PerformanceManagerModuleBootstrap type:', typeof window.PerformanceManagerModuleBootstrap);
    console.log('- GraphRenderer available:', !!window.GraphRenderer);
    console.log('- Cytoscape available:', typeof window.cytoscape);
    console.log('- Performance API available:', !!performance.memory);
    
    // List all scripts containing 'performance-manager'
    const scripts = Array.from(document.querySelectorAll('script')).filter(s => 
        s.src && s.src.includes('performance-manager')
    );
    console.log('- Performance Manager scripts loaded:', scripts.map(s => s.src));
    
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
    test('PerformanceManagerModule is available', () => {
        return assert(typeof window.PerformanceManagerModule === 'function', 'PerformanceManagerModule constructor available');
    });
    
    test('PerformanceManagerModuleBootstrap is available', () => {
        return assert(typeof window.PerformanceManagerModuleBootstrap === 'object', 'PerformanceManagerModuleBootstrap object available');
    });
    
    test('PerformanceManagerModuleBootstrap has required methods', () => {
        const adapter = window.PerformanceManagerModuleBootstrap;
        return assert(
            typeof adapter.init === 'function' &&
            typeof adapter.exposeGlobalFunctions === 'function',
            'Bootstrap has required methods'
        );
    });
    
    test('PerformanceManagerModuleBootstrap initialization', () => {
        const initialized = window.PerformanceManagerModuleBootstrap.init();
        console.log('📊 Bootstrap initialized:', initialized);
        return assert(typeof initialized === 'boolean', 'Initialization returned boolean');
    });
    
    test('Can create PerformanceManagerModule instance', () => {
        try {
            const mockDeps = {
                cytoscape: window.GraphRenderer ? window.GraphRenderer.cy : null,
                notifications: {
                    show: (msg) => console.log('[NOTIFICATION]', msg)
                }
            };
            
            const module = new window.PerformanceManagerModule(mockDeps);
            const success = module && typeof module.getPerformanceReport === 'function';
            
            if (module && module.destroy) {
                module.destroy();
            }
            
            return assert(success, 'PerformanceManagerModule instance created successfully');
        } catch (error) {
            console.log('❌ Module creation failed:', error.message);
            return false;
        }
    });
    
    test('WebGL detection works', () => {
        try {
            const webglSupport = window.checkWebGLSupport();
            console.log('📊 WebGL Support:', webglSupport);
            return assert(typeof webglSupport === 'boolean', 'WebGL detection returned boolean');
        } catch (error) {
            console.log('❌ WebGL test failed:', error.message);
            return false;
        }
    });
    
    test('Memory checking works', () => {
        try {
            const memoryInfo = window.checkMemoryUsage();
            console.log('📊 Memory Info:', memoryInfo);
            
            if (performance.memory) {
                return assert(memoryInfo && typeof memoryInfo === 'object', 'Memory info returned successfully');
            } else {
                return assert(memoryInfo === null, 'Memory info correctly returns null when API unavailable');
            }
        } catch (error) {
            console.log('❌ Memory test failed:', error.message);
            return false;
        }
    });
    
    test('Performance report generation', () => {
        try {
            const report = window.performanceReport();
            console.log('📊 Performance Report Sample:');
            console.log('- Status:', report.status);
            console.log('- WebGL:', report.webgl?.supported);
            console.log('- Node count:', report.metrics?.nodeCount);
            console.log('- Recommendations:', report.recommendations?.length, 'items');
            
            return assert(
                report && 
                typeof report === 'object' && 
                report.timestamp && 
                report.status,
                'Performance report generated successfully'
            );
        } catch (error) {
            console.log('❌ Performance report test failed:', error.message);
            return false;
        }
    });
    
    test('Global performance functions available', () => {
        const expectedFunctions = [
            'setupPerformanceMonitoring',
            'checkWebGLSupport',
            'updatePerformanceMetrics',
            'checkMemoryUsage',
            'optimizeMemoryUsage',
            'setupKeepAliveTick',
            'applyAggressiveLOD',
            'performanceReport'
        ];
        
        // Force function exposure before checking
        if (window.PerformanceManagerModuleBootstrap && window.PerformanceManagerModuleBootstrap.exposeGlobalFunctions) {
            window.PerformanceManagerModuleBootstrap.exposeGlobalFunctions();
        }
        
        const availableFunctions = expectedFunctions.filter(name => typeof window[name] === 'function');
        const allAvailable = availableFunctions.length === expectedFunctions.length;
        
        console.log(`📝 Global functions: ${availableFunctions.length}/${expectedFunctions.length} available`);
        console.log('Available:', availableFunctions);
        
        if (!allAvailable) {
            const missing = expectedFunctions.filter(name => typeof window[name] !== 'function');
            console.log('Missing:', missing);
        }
        
        return assert(allAvailable, 'All expected global performance functions available');
    });
    
    test('Test modular performance functionality', () => {
        try {
            if (typeof window.performanceReport === 'function') {
                const analysis = window.performanceReport();
                const hasAnalysis = analysis && typeof analysis === 'object';
                
                if (hasAnalysis) {
                    console.log('📊 Performance Analysis Sample:');
                    console.log('- Overall status:', analysis.status);
                    console.log('- Memory usage:', analysis.memory?.usagePercent + '%');
                    console.log('- Dataset size:', analysis.metrics?.nodeCount, 'nodes');
                }
                
                return assert(hasAnalysis, 'Performance analysis executed successfully');
            }
            return assert(false, 'performanceReport function not available');
        } catch (error) {
            console.log('❌ Performance functionality test failed:', error.message);
            return false;
        }
    });
    
    test('Memory optimization test', () => {
        try {
            if (typeof window.optimizeMemoryUsage === 'function') {
                const result = window.optimizeMemoryUsage();
                console.log('📊 Memory optimization result:', result);
                
                return assert(typeof result === 'boolean', 'Memory optimization returned boolean');
            } else {
                return assert(false, 'optimizeMemoryUsage function not available');
            }
        } catch (error) {
            console.log('❌ Memory optimization test failed:', error.message);
            return false;
        }
    });
    
    // Final results
    console.log(`\n📊 FINAL RESULTS: ${testsPassed}/${totalTests} tests passed`);
    
    if (testsPassed === totalTests) {
        console.log('🎉 ALL PERFORMANCE MANAGER TESTS PASSED!');
        return true;
    } else {
        console.log('⚠️ Some performance manager tests failed');
        return false;
    }
}

/**
 * Enhanced test function that handles module loading gracefully
 */
function waitForPerformanceManagerAndTest(maxAttempts = 30, attempt = 1) {
    console.log(`🔄 Attempt ${attempt}/${maxAttempts}: Checking for Performance Manager modules...`);
    
    if (window.PerformanceManagerModule && window.PerformanceManagerModuleBootstrap) {
        console.log('✅ Performance Manager modules found! Running tests...');
        return runSimplePerformanceTest();
    } else {
        console.log('⏳ Performance Manager modules not ready yet...');
        
        if (attempt >= maxAttempts) {
            console.log('❌ Max attempts reached. Performance Manager modules may not be loaded.');
            console.log('💡 Try refreshing the page (F5/Ctrl+R) to ensure all scripts are loaded.');
            return false;
        }
        
        setTimeout(() => {
            waitForPerformanceManagerAndTest(maxAttempts, attempt + 1);
        }, 500);
    }
}

/**
 * Main entry point with loading detection
 */
function runPerformanceTestWithLoading() {
    console.log('🚀 Starting Performance Manager Test with loading detection...');
    
    // First, check if modules are already loaded
    if (window.PerformanceManagerModule && window.PerformanceManagerModuleBootstrap) {
        console.log('✅ Modules already loaded');
        return runSimplePerformanceTest();
    }
    
    // Check if scripts are in the DOM but not executed
    const moduleScript = Array.from(document.querySelectorAll('script')).find(s => 
        s.src && s.src.includes('performance-manager-module.js')
    );
    const adapterScript = Array.from(document.querySelectorAll('script')).find(s => 
        s.src && s.src.includes('performance-manager') && s.src.includes('bootstrap.js')
    );
    
    if (moduleScript && adapterScript) {
        console.log('📜 Scripts found in DOM, but modules not in global scope');
        console.log('💡 You may need to refresh the page (F5/Ctrl+R) for the scripts to execute');
        
        // Still try to wait
        return waitForPerformanceManagerAndTest();
    } else {
        console.log('❌ Performance Manager scripts not found in DOM');
        console.log('💡 Make sure the main application page includes the Performance Manager module scripts');
        return false;
    }
}

// Expose globally for easy console access
window.runSimplePerformanceTest = runSimplePerformanceTest;
window.runPerformanceTestWithLoading = runPerformanceTestWithLoading;
window.waitForPerformanceManagerAndTest = waitForPerformanceManagerAndTest;

console.log('📋 Simple Performance Manager Test loaded.');
console.log('🔧 Available commands:');
console.log('   window.runSimplePerformanceTest() - Run tests directly');
console.log('   window.runPerformanceTestWithLoading() - Run tests with loading detection (recommended)');
console.log('   window.waitForPerformanceManagerAndTest() - Wait for modules then test');
