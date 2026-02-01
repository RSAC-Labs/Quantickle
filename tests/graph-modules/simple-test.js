/**
 * Simple Test Runner for Background Grid Module
 * 
 * This can be run directly in the main application console
 * for quick testing without the full test runner interface.
 */

function runSimpleBackgroundGridTest() {
    console.log('🧪 Running Simple Background Grid Test...');
    
    // First, let's diagnose what's actually loaded
    console.log('🔍 Diagnostic Information:');
    console.log('  BackgroundGridModule type:', typeof window.BackgroundGridModule);
    console.log('  BackgroundGridAdapter type:', typeof window.BackgroundGridAdapter);
    console.log('  GraphRenderer available:', !!window.GraphRenderer);
    console.log('  Cytoscape available:', typeof window.cytoscape);
    
    // Check what scripts are loaded
    const scripts = Array.from(document.scripts).filter(s => s.src.includes('background-grid'));
    console.log('  Background Grid scripts found:', scripts.length);
    scripts.forEach(script => {
        console.log('    Script:', script.src, 'loaded:', script.readyState || 'unknown');
    });
    
    let testsPassed = 0;
    let testsFailed = 0;
    
    function assert(condition, message) {
        if (condition) {
            console.log(`✅ PASS: ${message}`);
            testsPassed++;
        } else {
            console.error(`❌ FAIL: ${message}`);
            console.log(`   Expected: true, Actual: ${condition}`);
            testsFailed++;
        }
    }
    
    try {
        // Test 1: Module availability
        assert(typeof window.BackgroundGridModule === 'function', 'BackgroundGridModule is available');
        assert(typeof window.BackgroundGridAdapter === 'object', 'BackgroundGridAdapter is available');
        
        // Test 2: Adapter status
        const adapterStatus = window.BackgroundGridAdapter.getStatus();
        assert(adapterStatus && typeof adapterStatus === 'object', 'Adapter returns status object');
        assert(adapterStatus.implementation === 'legacy' || adapterStatus.implementation === 'modular', 'Adapter has valid implementation');
        
        // Test 3: Switch to modular version
        if (window.BackgroundGridAdapter.moduleInstance) {
            window.BackgroundGridAdapter.enableModularVersion();
            assert(window.BackgroundGridAdapter.useModularVersion === true, 'Successfully switched to modular version');
            
            // Test 4: Basic functionality
            const showResult = window.BackgroundGridAdapter.showGrid();
            assert(showResult === true, 'Show grid returns true');
            
            const isVisible = window.BackgroundGridAdapter.isGridVisible();
            assert(isVisible === true, 'Grid is visible after showing');
            
            const hideResult = window.BackgroundGridAdapter.hideGrid();
            assert(hideResult === true, 'Hide grid returns true');
            
            const isHidden = window.BackgroundGridAdapter.isGridVisible();
            assert(isHidden === false, 'Grid is hidden after hiding');
            
            // Test 5: Toggle functionality
            const toggleResult1 = window.BackgroundGridAdapter.toggleGrid();
            assert(toggleResult1 === true, 'First toggle returns true');
            
            const isVisibleAfterToggle1 = window.BackgroundGridAdapter.isGridVisible();
            assert(isVisibleAfterToggle1 === true, 'Grid is visible after first toggle');
            
            const toggleResult2 = window.BackgroundGridAdapter.toggleGrid();
            assert(toggleResult2 === true, 'Second toggle returns true');
            
            const isVisibleAfterToggle2 = window.BackgroundGridAdapter.isGridVisible();
            assert(isVisibleAfterToggle2 === false, 'Grid is hidden after second toggle');
            
            // Test 6: Configuration
            window.BackgroundGridAdapter.setConfig({
                gridSize: 25,
                gridColor: '#ff0000',
                debug: true
            });
            
            const moduleStatus = window.BackgroundGridAdapter.moduleInstance.getStatus();
            assert(moduleStatus.gridSize === 25, 'Grid size configuration updated');
            assert(moduleStatus.gridColor === '#ff0000', 'Grid color configuration updated');
            
            // Test 7: Refresh functionality
            const refreshResult = window.BackgroundGridAdapter.refreshGrid();
            assert(refreshResult === true, 'Refresh grid returns true');
            
            // Switch back to legacy for comparison
            window.BackgroundGridAdapter.enableLegacyVersion();
            assert(window.BackgroundGridAdapter.useModularVersion === false, 'Successfully switched back to legacy version');
            
        } else {
            console.warn('⚠️ Modular instance not available, skipping modular tests');
        }
        
        // Test 8: Legacy functionality (should always work)
        const legacyToggle = window.BackgroundGridAdapter.toggleGrid();
        assert(typeof legacyToggle === 'boolean', 'Legacy toggle functionality works');
        
        console.log('\n📊 Test Results:');
        console.log(`✅ Passed: ${testsPassed}`);
        console.log(`❌ Failed: ${testsFailed}`);
        console.log(`📈 Pass Rate: ${testsFailed === 0 ? '100' : ((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
        
        if (testsFailed === 0) {
            console.log('🎉 ALL TESTS PASSED! Background Grid module is working correctly.');
        } else {
            console.log('⚠️ Some tests failed. Check the failures above.');
        }
        
        return {
            passed: testsPassed,
            failed: testsFailed,
            total: testsPassed + testsFailed,
            success: testsFailed === 0
        };
        
    } catch (error) {
        console.error('❌ Test execution failed:', error);
        return {
            passed: testsPassed,
            failed: testsFailed + 1,
            total: testsPassed + testsFailed + 1,
            success: false,
            error: error.message
        };
    }
}

// Function to wait for modules to load
function waitForModulesAndTest(maxAttempts = 10, attempt = 1) {
    console.log(`🔄 Attempt ${attempt}/${maxAttempts}: Checking for modules...`);
    
    if (window.BackgroundGridModule && window.BackgroundGridAdapter) {
        console.log('✅ Modules found! Running test...');
        runSimpleBackgroundGridTest();
    } else if (attempt < maxAttempts) {
        console.log('⏳ Modules not ready yet, waiting...');
        setTimeout(() => waitForModulesAndTest(maxAttempts, attempt + 1), 1000);
    } else {
        console.error('❌ Modules failed to load after waiting. Running diagnostic test anyway...');
        runSimpleBackgroundGridTest();
    }
}

// Enhanced test runner that tries to load modules if they're missing
function runTestWithLoading() {
    console.log('🚀 Starting Background Grid Test with loading detection...');
    
    if (window.BackgroundGridModule && window.BackgroundGridAdapter) {
        console.log('✅ Modules already loaded');
        runSimpleBackgroundGridTest();
    } else {
        console.log('⚠️ Modules not detected, trying to load or wait...');
        
        // Try to manually trigger script loading if in main app
        if (!window.location.href.includes('test-runner.html')) {
            console.log('📡 Attempting to refresh page to load modules...');
            console.log('💡 TIP: Make sure you\'ve refreshed the main page after adding the modules');
            
            // Check if scripts are in DOM but not executed
            const scriptCheck = Array.from(document.scripts).filter(s => 
                s.src.includes('background-grid') || s.src.includes('graph-modules')
            );
            
            if (scriptCheck.length === 0) {
                console.log('📄 Background grid scripts not found in DOM');
                console.log('💡 Please refresh the page to load the new modules');
            } else {
                console.log('📄 Scripts found in DOM, waiting for execution...');
                waitForModulesAndTest();
            }
        } else {
            waitForModulesAndTest();
        }
    }
}

// Make functions available globally
window.runSimpleBackgroundGridTest = runSimpleBackgroundGridTest;
window.runTestWithLoading = runTestWithLoading;
window.waitForModulesAndTest = waitForModulesAndTest;

// Auto-run if in test mode
if (window.location.href.includes('test') || window.location.search.includes('test')) {
    setTimeout(() => {
        console.log('🔧 Auto-running background grid test with loading detection...');
        runTestWithLoading();
    }, 2000);
}

console.log('📋 Simple Background Grid Test loaded.');
console.log('💡 Run with: window.runTestWithLoading() (recommended)');
console.log('💡 Or direct: window.runSimpleBackgroundGridTest()');
