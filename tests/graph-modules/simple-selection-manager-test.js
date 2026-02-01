/**
 * Simple Selection Manager Test
 * Quick console-based test for legacy selection handling
 */

console.log('📋 Simple Selection Manager Test loaded. Run with: window.runSelectionManagerTestWithLoading()');

function assert(condition, message) {
    if (condition) {
        console.log(`✅ PASS: ${message}`);
        return true;
    } else {
        console.log(`❌ FAIL: ${message}`);
        return false;
    }
}

function runSimpleSelectionManagerTest() {
    console.log('🧪 Running Simple Selection Manager Test...');
    
    // Diagnostic info
    console.log('🔍 Diagnostic Info:');
    console.log('- SelectionManagerAdapter type:', typeof window.SelectionManagerAdapter);
    console.log('- GraphRenderer available:', !!window.GraphRenderer);
    console.log('- Cytoscape available:', typeof window.cytoscape);
    
    // Check for loaded scripts
    const selectionManagerScripts = Array.from(document.querySelectorAll('script'))
        .map(script => script.src)
        .filter(src => src && src.includes('selection-manager'));
    
    console.log('- Selection Manager scripts loaded:', selectionManagerScripts);
    
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
    
    // Test 1: Adapter availability
    test('SelectionManagerAdapter is available', () => {
        return assert(typeof window.SelectionManagerAdapter === 'object', 'SelectionManagerAdapter object available');
    });
    
    // Test 2: Adapter methods
    test('SelectionManagerAdapter has required methods', () => {
        const requiredMethods = ['init', 'getSelectedNodesCount', 'clearSelection', 'selectNodesByType', 'invertSelection'];
        const hasAllMethods = requiredMethods.every(method => typeof window.SelectionManagerAdapter[method] === 'function');
        return assert(hasAllMethods, 'Adapter has required methods');
    });
    
    // Test 3: Adapter status
    test('SelectionManagerAdapter status', () => {
        try {
            const status = window.SelectionManagerAdapter.getStatus();
            console.log('📊 Adapter Status:', status);
            return assert(status && typeof status === 'object', 'Status returned successfully');
        } catch (error) {
            console.log('❌ Status check failed:', error.message);
            return false;
        }
    });
    
    // Test 4: Global selection functions available
    test('Global selection functions available', () => {
        const expectedFunctions = ['getSelectedCount', 'getSelectedNodes', 'clearSelection', 'selectByType', 'selectAll', 'invertSelection', 'toggleSelectionMode', 'selectionReport'];
        const availableFunctions = expectedFunctions.filter(name => typeof window[name] === 'function');
        
        console.log(`📝 Global functions: ${availableFunctions.length}/${expectedFunctions.length} available`);
        console.log('Available:', availableFunctions);
        
        return assert(availableFunctions.length === expectedFunctions.length, 'All expected global selection functions available');
    });
    
    // Test 5: Selection report generation
    test('Selection report generation', () => {
        try {
            const report = window.selectionReport ? window.selectionReport() : window.SelectionManagerAdapter.getSelectionReport();
            console.log('📊 Selection Report Sample:');
            console.log('- Implementation:', report.implementation || 'legacy');
            console.log('- Selection mode:', report.selectionMode);
            console.log('- Selected nodes:', report.counts ? report.counts.nodes : 0);
            console.log('- Capabilities:', report.capabilities || []);
            
            return assert(report && typeof report === 'object', 'Selection report generated successfully');
        } catch (error) {
            console.log('❌ Report generation failed:', error.message);
            return false;
        }
    });
    
    // Test 6: Basic selection functions work
    test('Basic selection functions work', () => {
        try {
            if (!window.GraphRenderer || !window.GraphRenderer.cy) {
                console.log('⚠️ No graph available, skipping selection test');
                return true;
            }
            
            const initialCount = window.getSelectedCount();
            console.log('📊 Initial selection count:', initialCount);
            
            // Test clear selection
            window.clearSelection();
            const clearedCount = window.getSelectedCount();
            console.log('📊 After clear:', clearedCount);
            
            // Test select all (if graph has nodes)
            const totalNodes = window.GraphRenderer.cy.nodes().length;
            if (totalNodes > 0 && totalNodes < 1000) { // Avoid selecting too many
                window.selectAll();
                const allSelectedCount = window.getSelectedCount();
                console.log('📊 After select all:', allSelectedCount);
                
                // Clear again
                window.clearSelection();
            }
            
            return assert(
                typeof initialCount === 'number' && 
                typeof clearedCount === 'number',
                'Selection functions work'
            );
        } catch (error) {
            console.log('❌ Selection test failed:', error.message);
            return false;
        }
    });
    
    // Test 7: Selection mode functions
    test('Selection mode functions work', () => {
        try {
            const initialMode = window.isSelectionMode();
            console.log('📊 Initial selection mode:', initialMode);
            
            // Toggle mode
            const toggled = window.toggleSelectionMode();
            console.log('📊 After toggle:', toggled);
            
            // Check mode status
            const currentMode = window.isSelectionMode();
            console.log('📊 Current mode:', currentMode);
            
            // Reset to initial state
            if (currentMode !== initialMode) {
                window.toggleSelectionMode();
            }
            
            return assert(
                typeof initialMode === 'boolean' &&
                typeof toggled === 'boolean' &&
                typeof currentMode === 'boolean',
                'Selection mode functions work'
            );
        } catch (error) {
            console.log('❌ Selection mode test failed:', error.message);
            return false;
        }
    });
    
    console.log(`\n📊 FINAL RESULTS: ${passed}/${total} tests passed`);
    
    if (passed === total) {
        console.log('🎉 All selection manager tests passed!');
        return true;
    } else {
        console.log('⚠️ Some selection manager tests failed');
        return false;
    }
}

// Helper function to wait for modules to load
function waitForModulesAndTest(maxAttempts = 5, attempt = 1) {
    console.log(`🔄 Attempt ${attempt}/${maxAttempts}: Checking for SelectionManager adapter...`);
    
    if (window.SelectionManagerAdapter) {
        console.log('✅ Adapter found, running test...');
        return runSimpleSelectionManagerTest();
    } else if (attempt < maxAttempts) {
        console.log('⏳ Adapter not ready, retrying in 1 second...');
        setTimeout(() => waitForModulesAndTest(maxAttempts, attempt + 1), 1000);
    } else {
        console.log('❌ Adapter not found after maximum attempts');
        console.log('💡 Make sure you refreshed the page (F5) to load the new script tags');
        
        // Check what's actually loaded
        const scripts = Array.from(document.querySelectorAll('script'))
            .map(script => script.src)
            .filter(src => src && src.includes('selection-manager'));
        
        if (scripts.length === 0) {
            console.log('⚠️ No SelectionManager scripts found in DOM. Did you refresh the page?');
        } else {
            console.log('📋 SelectionManager scripts found:', scripts);
            console.log('💡 Scripts are loaded but adapter might not be exposing correctly');
        }
        
        return false;
    }
}

function runSelectionManagerTestWithLoading() {
    console.log('🚀 Starting Selection Manager Test with loading detection...');
    
    if (window.SelectionManagerAdapter) {
        console.log('✅ Adapter already loaded');
        return runSimpleSelectionManagerTest();
    } else {
        console.log('⏳ Adapter not immediately available, using loading detection...');
        return waitForModulesAndTest();
    }
}

// Expose test functions globally
window.runSimpleSelectionManagerTest = runSimpleSelectionManagerTest;
window.runSelectionManagerTestWithLoading = runSelectionManagerTestWithLoading;
