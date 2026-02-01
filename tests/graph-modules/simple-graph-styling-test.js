/**
 * Simple Graph Styling Test
 * Console-based tests for the GraphStyling module that can be run directly in the main application
 */

function runSimpleGraphStylingTest() {
    console.log('📋 Simple Graph Styling Test loaded. Run with: window.runSimpleGraphStylingTest()');
    console.log('🧪 Running Simple Graph Styling Test...');
    
    // Diagnostic information
    console.log('🔍 Diagnostic Info:');
    console.log('- GraphStylingModule type:', typeof window.GraphStylingModule);
    console.log('- GraphStyling bootstrap type:', typeof window.initGraphStylingModule);
    console.log('- GraphRenderer available:', !!window.GraphRenderer);
    console.log('- Cytoscape available:', typeof window.cytoscape);
    
    // List all scripts containing 'graph-styling'
    const scripts = Array.from(document.querySelectorAll('script')).filter(s => 
        s.src && s.src.includes('graph-styling')
    );
    console.log('- Graph Styling scripts loaded:', scripts.map(s => s.src));

    if (!window.GraphStyling && typeof window.initGraphStylingModule === 'function') {
        const dependencies = {
            cytoscape: window.GraphRenderer ? window.GraphRenderer.cy : null,
            supportsShadowStyles: window.GraphRenderer
                ? window.GraphRenderer.supportsShadowStyles
                : true,
            notifications: {
                show: (msg) => console.log('[NOTIFICATION]', msg)
            }
        };
        window.initGraphStylingModule(dependencies);
    }
    
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
    test('GraphStylingModule is available', () => {
        return assert(typeof window.GraphStylingModule === 'function', 'GraphStylingModule constructor available');
    });
    
    test('GraphStyling bootstrap is available', () => {
        return assert(typeof window.initGraphStylingModule === 'function', 'initGraphStylingModule available');
    });
    
    test('Can create GraphStylingModule instance', () => {
        try {
            const mockDeps = {
                cytoscape: window.GraphRenderer ? window.GraphRenderer.cy : null,
                notifications: {
                    show: (msg) => console.log('[NOTIFICATION]', msg)
                }
            };
            
            const module = new window.GraphStylingModule(mockDeps);
            const success = module && typeof module.applyGlowEffect === 'function';
            
            if (module && module.destroy) {
                module.destroy();
            }
            
            return assert(success, 'GraphStylingModule instance created successfully');
        } catch (error) {
            console.log('❌ Module creation failed:', error.message);
            return false;
        }
    });
    
    test('Global styling functions available', () => {
        const expectedFunctions = [
            'applyGlow', 'removeGlow', 'toggleGlow', 'styleNode', 'styleEdge',
            'refreshStyles', 'styleReport', 'analyzeStyles'
        ];
        
        // Force function exposure before checking
        if (window.GraphStyling && typeof window.exposeGraphStylingGlobals === 'function') {
            window.exposeGraphStylingGlobals(window.GraphStyling);
        }
        
        const availableFunctions = expectedFunctions.filter(name => typeof window[name] === 'function');
        const allAvailable = availableFunctions.length === expectedFunctions.length;
        
        console.log(`📝 Global functions: ${availableFunctions.length}/${expectedFunctions.length} available`);
        console.log('Available:', availableFunctions);
        
        if (!allAvailable) {
            const missing = expectedFunctions.filter(name => typeof window[name] !== 'function');
            console.log('Missing:', missing);
        }
        
        return assert(allAvailable, 'All expected global styling functions available');
    });
    
    test('Style report generation', () => {
        try {
            const report = window.GraphStyling ? window.GraphStyling.getStyleReport() : null;
            console.log('📊 Style Report Sample:');
            console.log('- Current theme:', report.currentTheme);
            console.log('- Glow enabled:', report.glowEnabled);
            console.log('- Available themes:', report.availableThemes?.length || 0);
            console.log('- Available presets:', report.availablePresets?.length || 0);
            
            return assert(
                report && 
                typeof report === 'object' && 
                report.timestamp && 
                report.currentTheme,
                'Style report generated successfully'
            );
        } catch (error) {
            console.log('❌ Style report test failed:', error.message);
            return false;
        }
    });
    
    test('Glow effect functions work', () => {
        try {
            if (typeof window.toggleGlow === 'function') {
                // Test toggle functionality
                const result1 = window.toggleGlow();
                console.log('📊 First glow toggle result:', result1);
                
                const result2 = window.toggleGlow();
                console.log('📊 Second glow toggle result:', result2);
                
                return assert(typeof result1 === 'boolean' && typeof result2 === 'boolean', 'Glow toggle functions work');
            } else {
                return assert(false, 'toggleGlow function not available');
            }
        } catch (error) {
            console.log('❌ Glow effect test failed:', error.message);
            return false;
        }
    });
    
    test('Test modular styling functionality', () => {
        try {
            if (typeof window.analyzeStyles === 'function') {
                const analysis = window.analyzeStyles();
                const hasAnalysis = analysis && typeof analysis === 'object';
                
                if (hasAnalysis) {
                    console.log('📊 Style Analysis Sample:');
                    console.log('- Report available:', !!analysis.report);
                    console.log('- Presets available:', !!analysis.presets);
                    
                    if (analysis.report) {
                        console.log('- Current theme:', analysis.report.currentTheme);
                        console.log('- Available themes:', analysis.report.availableThemes?.length || 0);
                    }
                }
                
                return assert(hasAnalysis, 'Style analysis executed successfully');
            } else {
                return assert(false, 'analyzeStyles function not available');
            }
        } catch (error) {
            console.log('❌ Modular styling functionality test failed:', error.message);
            return false;
        }
    });
    
    test('Theme functionality (modular only)', () => {
        try {
            if (typeof window.applyTheme === 'function' && typeof window.getThemes === 'function') {
                const themes = window.getThemes();
                console.log('📊 Available themes:', themes);
                
                if (themes && themes.length > 0) {
                    // Test applying a theme
                    const themeResult = window.applyTheme(themes[0]);
                    console.log('📊 Theme application result:', themeResult);
                    
                    return assert(Array.isArray(themes) && themes.length > 0, 'Theme functionality works');
                } else {
                    return assert(false, 'No themes available');
                }
            } else {
                console.log('💡 Theme functions not available (legacy mode - switch to modular for themes)');
                return true; // Not a failure in legacy mode
            }
        } catch (error) {
            console.log('❌ Theme functionality test failed:', error.message);
            return false;
        }
    });
    
    test('Style node functionality', () => {
        try {
            if (typeof window.styleNode === 'function' && window.GraphRenderer && window.GraphRenderer.cy) {
                const nodes = window.GraphRenderer.cy.nodes();
                if (nodes.length > 0) {
                    const firstNodeId = nodes[0].id();
                    const result = window.styleNode(firstNodeId, {'background-color': '#ff0000'});
                    console.log('📊 Style node result:', result);
                    
                    return assert(typeof result === 'boolean', 'Style node function works');
                } else {
                    console.log('💡 No nodes available for styling test');
                    return true; // Not a failure if no nodes
                }
            } else {
                return assert(false, 'styleNode function not available');
            }
        } catch (error) {
            console.log('❌ Style node test failed:', error.message);
            return false;
        }
    });
    
    // Final results
    console.log(`\n📊 FINAL RESULTS: ${testsPassed}/${totalTests} tests passed`);
    
    if (testsPassed === totalTests) {
        console.log('🎉 ALL GRAPH STYLING TESTS PASSED!');
        console.log('\n🎨 Try these styling features:');
        console.log('- analyzeStyles() - Get comprehensive style analysis');
        console.log('- toggleGlow() - Toggle glow effects');
        console.log('- applyTheme("dark") - Apply dark theme (modular only)');
        console.log('- styleNode("nodeId", {color: "#ff0000"}) - Style individual nodes');
        return true;
    } else {
        console.log('⚠️ Some graph styling tests failed');
        return false;
    }
}

/**
 * Enhanced test function that handles module loading gracefully
 */
function waitForGraphStylingAndTest(maxAttempts = 30, attempt = 1) {
    console.log(`🔄 Attempt ${attempt}/${maxAttempts}: Checking for Graph Styling modules...`);
    
    if (window.GraphStylingModule && window.initGraphStylingModule) {
        console.log('✅ Graph Styling modules found! Running tests...');
        return runSimpleGraphStylingTest();
    } else {
        console.log('⏳ Graph Styling modules not ready yet...');
        
        if (attempt >= maxAttempts) {
            console.log('❌ Max attempts reached. Graph Styling modules may not be loaded.');
            console.log('💡 Try refreshing the page (F5/Ctrl+R) to ensure all scripts are loaded.');
            return false;
        }
        
        setTimeout(() => {
            waitForGraphStylingAndTest(maxAttempts, attempt + 1);
        }, 500);
    }
}

/**
 * Main entry point with loading detection
 */
function runGraphStylingTestWithLoading() {
    console.log('🚀 Starting Graph Styling Test with loading detection...');
    
    // First, check if modules are already loaded
    if (window.GraphStylingModule && window.initGraphStylingModule) {
        console.log('✅ Modules already loaded');
        return runSimpleGraphStylingTest();
    }
    
    // Check if scripts are in the DOM but not executed
    const moduleScript = Array.from(document.querySelectorAll('script')).find(s => 
        s.src && s.src.includes('graph-styling-module.js')
    );
    if (moduleScript) {
        console.log('📜 Module script found in DOM, but module not in global scope');
        console.log('💡 You may need to refresh the page (F5/Ctrl+R) for the scripts to execute');
        
        // Still try to wait
        return waitForGraphStylingAndTest();
    } else {
        console.log('❌ Graph Styling scripts not found in DOM');
        console.log('💡 Make sure the main application page includes the Graph Styling module scripts');
        return false;
    }
}

// Expose globally for easy console access
window.runSimpleGraphStylingTest = runSimpleGraphStylingTest;
window.runGraphStylingTestWithLoading = runGraphStylingTestWithLoading;
window.waitForGraphStylingAndTest = waitForGraphStylingAndTest;

console.log('📋 Simple Graph Styling Test loaded.');
console.log('🔧 Available commands:');
console.log('   window.runSimpleGraphStylingTest() - Run tests directly');
console.log('   window.runGraphStylingTestWithLoading() - Run tests with loading detection (recommended)');
console.log('   window.waitForGraphStylingAndTest() - Wait for modules then test');
