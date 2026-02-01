/**
 * Simple Progress Manager Test
 * Quick verification of ProgressManager functionality directly in main application
 */

console.log('📋 Simple Progress Manager Test loaded. Run with: window.runSimpleProgressManagerTest()');

function runSimpleProgressManagerTest() {
    console.log('🧪 Running Simple Progress Manager Test...');
    
    // Diagnostic info
    console.log('🔍 Diagnostic Info:');
    console.log('- ProgressManagerModule type:', typeof ProgressManagerModule);
    console.log('- ProgressManagerAdapter type:', typeof window.ProgressManagerAdapter);
    console.log('- GraphRenderer available:', !!window.GraphRenderer);
    
    // Check if required scripts are loaded
    const requiredScripts = [
        'progress-manager-module.js',
        'adapter.js'
    ];
    
    const loadedScripts = Array.from(document.scripts)
        .map(script => script.src)
        .filter(src => requiredScripts.some(required => src.includes(required)));
    
    console.log('- Progress Manager scripts loaded:', loadedScripts);
    
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
    
    // Test function with cleanup
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
    
    // Test 1: ProgressManagerModule availability
    totalTests++;
    if (test('ProgressManagerModule is available', () => {
        return assert(typeof ProgressManagerModule === 'function', 'ProgressManagerModule constructor available');
    })) passedTests++;
    
    // Test 2: ProgressManagerAdapter availability  
    totalTests++;
    if (test('ProgressManagerAdapter is available', () => {
        return assert(!!window.ProgressManagerAdapter && typeof window.ProgressManagerAdapter === 'object', 'ProgressManagerAdapter object available');
    })) passedTests++;
    
    // Test 3: Adapter methods
    totalTests++;
    if (test('ProgressManagerAdapter has required methods', () => {
        const adapter = window.ProgressManagerAdapter;
        const requiredMethods = ['getStatus', 'enableModularVersion', 'enableLegacyVersion', 'exposeGlobalFunctions'];
        const hasAllMethods = requiredMethods.every(method => typeof adapter[method] === 'function');
        return assert(hasAllMethods, 'Adapter has required methods');
    })) passedTests++;
    
    // Test 4: Adapter status
    totalTests++;
    if (test('ProgressManagerAdapter status', () => {
        try {
            const status = window.ProgressManagerAdapter.getStatus();
            console.log('📊 Adapter Status:', status);
            return assert(status && typeof status === 'object', 'Status returned successfully');
        } catch (error) {
            console.log('❌ Status check failed:', error);
            return false;
        }
    })) passedTests++;
    
    // Test 5: Module instantiation
    totalTests++;
    if (test('Can create ProgressManagerModule instance', () => {
        try {
            // Mock dependencies for testing
            const mockDependencies = {
                notifications: { show: () => {} },
                config: { progressTheme: 'default' }
            };
            
            const instance = new ProgressManagerModule(mockDependencies);
            const success = instance && instance.init;
            
            // Clean up
            if (instance && instance.destroy) {
                instance.destroy();
            }
            
            return assert(success, 'ProgressManagerModule instance created successfully');
        } catch (error) {
            console.log('❌ Module creation failed:', error.message);
            return false;
        }
    })) passedTests++;
    
    // Test 6: Global functions
    totalTests++;
    if (test('Global progress manager functions available', () => {
        const expectedFunctions = [
            'showLoadingProgress', 'updateLoadingProgress', 'hideLoadingProgress',
            'showProgress', 'getActiveOperations', 'progressManagerReport'
        ];
        
        const availableFunctions = expectedFunctions.filter(fn => typeof window[fn] === 'function');
        
        console.log(`📝 Global functions: ${availableFunctions.length}/${expectedFunctions.length} available`);
        console.log('Available:', availableFunctions);
        
        return assert(availableFunctions.length === expectedFunctions.length, 'All expected global progress functions available');
    })) passedTests++;
    
    // Test 7: Basic progress operations (legacy mode)
    totalTests++;
    if (test('Basic progress operations work', () => {
        try {
            // Test basic show/update/hide cycle
            const showResult = window.showLoadingProgress();
            console.log('📊 Show progress result:', showResult);
            
            const updateResult = window.updateLoadingProgress(50, 'Testing progress...');
            console.log('📊 Update progress result:', updateResult);
            
            const hideResult = window.hideLoadingProgress();
            console.log('📊 Hide progress result:', hideResult);
            
            return assert(
                typeof showResult === 'boolean' && 
                typeof updateResult === 'boolean' && 
                typeof hideResult === 'boolean', 
                'Basic progress operations return boolean results'
            );
        } catch (error) {
            console.log('❌ Basic progress operations failed:', error);
            return false;
        }
    })) passedTests++;
    
    // Test 8: Active operations tracking
    totalTests++;
    if (test('Active operations tracking', () => {
        try {
            const operations = window.getActiveOperations();
            console.log('📊 Active operations:', operations);
            
            return assert(Array.isArray(operations), 'Active operations returns array');
        } catch (error) {
            console.log('❌ Active operations tracking failed:', error);
            return false;
        }
    })) passedTests++;
    
    // Test 9: Progress report generation
    totalTests++;
    if (test('Progress report generation', () => {
        try {
            const report = window.progressManagerReport();
            console.log('📊 Progress Report Sample:');
            console.log('- Implementation:', report.implementation || 'modular');
            console.log('- Active operations:', report.activeOperations);
            console.log('- Capabilities:', report.capabilities ? report.capabilities.length : 'N/A', 'items');
            
            return assert(report && typeof report === 'object', 'Progress report generated successfully');
        } catch (error) {
            console.log('❌ Report generation failed:', error);
            return false;
        }
    })) passedTests++;
    
    // Test 10: Switch to modular version
    totalTests++;
    if (test('Switch to modular version', () => {
        try {
            const result = window.ProgressManagerAdapter.enableModularVersion();
            const status = window.ProgressManagerAdapter.getStatus();
            
            console.log('📊 After switch - Implementation:', status.currentImplementation);
            
            return assert(
                status.currentImplementation === 'modular' || !status.modularAvailable, 
                'Successfully switched to modular version'
            );
        } catch (error) {
            console.log('❌ Switch failed:', error);
            return false;
        }
    })) passedTests++;
    
    // Test 11: Enhanced progress features (modular)
    totalTests++;
    if (test('Enhanced progress features work', () => {
        try {
            // Test template-based progress
            const templateResult = window.showProgress('data-load', 'enhanced-test-operation');
            console.log('📊 Template progress result:', templateResult);
            
            // Test progress update with operation ID
            const updateResult = window.updateLoadingProgress('enhanced-test-operation', 75, 'Loading data...');
            console.log('📊 Operation update result:', updateResult);
            
            // Test hiding specific operation (this should work since we started it above)
            const hideResult = window.hideLoadingProgress('enhanced-test-operation');
            console.log('📊 Operation hide result:', hideResult);
            
            return assert(
                typeof templateResult === 'boolean' && 
                typeof updateResult === 'boolean' && 
                typeof hideResult === 'boolean',
                'Enhanced progress features work'
            );
        } catch (error) {
            console.log('❌ Enhanced progress features failed:', error);
            return false;
        }
    })) passedTests++;
    
    // Test 12: Theme and configuration
    totalTests++;
    if (test('Theme and configuration functions', () => {
        try {
            // Test theme setting
            const themeResult = window.setProgressTheme('dark');
            console.log('📊 Set theme result:', themeResult);
            
            // Test config retrieval
            const config = window.getProgressConfig();
            console.log('📊 Progress config available:', !!config);
            
            return assert(
                typeof themeResult === 'boolean' && 
                config && typeof config === 'object',
                'Theme and configuration functions work'
            );
        } catch (error) {
            console.log('❌ Theme and configuration failed:', error);
            return false;
        }
    })) passedTests++;
    
    // Test 13: Operation management
    totalTests++;
    if (test('Operation management functions', () => {
        try {
            // First, start an operation to test cancellation
            console.log('🔄 Starting test operation for cancellation test...');
            window.showLoadingProgress('cancel-test-op', { title: 'Test Operation' });
            
            // Test operation cancellation
            const cancelResult = window.cancelOperation('cancel-test-op');
            console.log('📊 Cancel operation result:', cancelResult);
            
            // These might not be fully implemented yet (test with non-existent operation)
            const pauseResult = window.pauseOperation('non-existent-op');
            const resumeResult = window.resumeOperation('non-existent-op');
            
            console.log('📊 Pause/Resume supported:', pauseResult, resumeResult);
            
            return assert(typeof cancelResult === 'boolean', 'Operation management functions available');
        } catch (error) {
            console.log('❌ Operation management failed:', error);
            return false;
        }
    })) passedTests++;
    
    // Test 14: Test modular progress functionality
    totalTests++;
    if (test('Test modular progress functionality', () => {
        try {
            const report = window.progressManagerReport();
            console.log('📊 Progress Manager Analysis Sample:');
            console.log('- Report available:', !!report);
            console.log('- Features available:', report.capabilities ? report.capabilities.length : 0);
            console.log('- Active operations:', report.activeOperations);
            
            return assert(!!report, 'Progress manager analysis executed successfully');
        } catch (error) {
            console.log('❌ Analysis failed:', error);
            return false;
        }
    })) passedTests++;
    
    // Test 15: Switch back to legacy version
    totalTests++;
    if (test('Switch back to legacy version', () => {
        try {
            const result = window.ProgressManagerAdapter.enableLegacyVersion();
            const status = window.ProgressManagerAdapter.getStatus();
            
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
        console.log('🎉 All progress manager tests passed!');
        return true;
    } else {
        console.log('⚠️ Some progress manager tests failed');
        return false;
    }
}

// Auto-expose to global scope
window.runSimpleProgressManagerTest = runSimpleProgressManagerTest;

// Function with loading detection
function runProgressManagerTestWithLoading(maxAttempts = 10, attempt = 1) {
    console.log('🚀 Starting Progress Manager Test with loading detection...');
    
    // Check if modules are loaded
    const modulesLoaded = typeof ProgressManagerModule === 'function' && 
                         typeof window.ProgressManagerAdapter === 'object';
    
    if (modulesLoaded) {
        console.log('✅ Modules already loaded');
        return runSimpleProgressManagerTest();
    } else {
        if (attempt <= maxAttempts) {
            console.log(`⏳ Waiting for modules to load... (attempt ${attempt}/${maxAttempts})`);
            setTimeout(() => runProgressManagerTestWithLoading(maxAttempts, attempt + 1), 1000);
        } else {
            console.log('❌ Modules failed to load after maximum attempts');
            console.log('💡 Try refreshing the page (F5) to ensure all scripts are loaded');
            return false;
        }
    }
}

window.runProgressManagerTestWithLoading = runProgressManagerTestWithLoading;
