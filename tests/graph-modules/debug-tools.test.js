/**
 * Debug Tools Module Unit Tests
 * 
 * Comprehensive test suite for the DebugToolsModule
 * Tests all debugging functionality and global function exposure
 */

function runDebugToolsTests() {
    const testFramework = window.GraphTestFramework;
    
    testFramework.describe('DebugToolsModule', () => {
        let module;
        let mockDependencies;
        let testContainer;
        
        // Setup before each test
        function setup() {
            // Create test container
            testContainer = document.createElement('div');
            testContainer.id = 'debug-test-container';
            testContainer.style.width = '400px';
            testContainer.style.height = '300px';
            testContainer.style.position = 'absolute';
            testContainer.style.top = '-9999px'; // Hide offscreen
            document.body.appendChild(testContainer);
            
            // Create mock dependencies with more complete Cytoscape mock
            mockDependencies = testFramework.createMockModule({
                cytoscape: {
                    ...testFramework.mockCytoscape,
                    container: () => testContainer,
                    width: () => 400,
                    height: () => 300,
                    zoom: () => 1,
                    pan: () => ({ x: 0, y: 0 }),
                    extent: () => ({ x1: 0, y1: 0, x2: 400, y2: 300 }),
                    on: () => {},
                    renderer: () => ({ name: 'canvas' }),
                    style: () => ({ update: () => {} }),
                    resize: () => {},
                    fit: () => {},
                    center: () => {},
                    elements: () => ({
                        forEach: () => {},
                        length: 0
                    }),
                    ready: (callback) => { if (callback) callback(); }
                }
            });
            
            // Create module instance
            module = new DebugToolsModule(mockDependencies);
        }
        
        // Cleanup after each test
        function cleanup() {
            if (module) {
                module.destroy();
                module = null;
            }
            
            if (testContainer && testContainer.parentNode) {
                testContainer.parentNode.removeChild(testContainer);
            }
            
            // Clean up any test elements
            const testElements = document.querySelectorAll('#debug-test-element');
            testElements.forEach(elem => {
                if (elem.parentNode) {
                    elem.parentNode.removeChild(elem);
                }
            });
        }
        
        testFramework.it('should initialize correctly', () => {
            setup();
            
            testFramework.expect(module).toBeInstanceOf(DebugToolsModule);
            testFramework.expect(module.debugMode).toBeFalsy();
            testFramework.expect(module.logLevel).toBe('info');
            testFramework.expect(module.config.enableGlobalFunctions).toBeTruthy();
            
            cleanup();
        });
        
        testFramework.it('should debug container hierarchy', () => {
            setup();
            
            const hierarchy = module.debugContainerHierarchy();
            
            testFramework.expect(hierarchy).toBeInstanceOf(Array);
            testFramework.expect(hierarchy.length).toBeGreaterThan(0);
            testFramework.expect(hierarchy[0]).toBeInstanceOf(Object);
            testFramework.expect(hierarchy[0].tagName).toBeTruthy();
            
            cleanup();
        });
        
        testFramework.it('should debug node visibility', () => {
            setup();
            
            const analysis = module.debugNodeVisibility();
            
            testFramework.expect(analysis).toBeInstanceOf(Object);
            testFramework.expect(analysis.nodeCount).toBe(0); // Mock has no nodes
            testFramework.expect(analysis.issues).toBeInstanceOf(Array);
            testFramework.expect(analysis.viewport).toBeInstanceOf(Object);
            
            cleanup();
        });
        
        testFramework.it('should debug performance metrics', () => {
            setup();
            
            const performance = module.debugPerformance();
            
            testFramework.expect(performance).toBeInstanceOf(Object);
            testFramework.expect(performance.performance).toBeInstanceOf(Object);
            testFramework.expect(performance.rendering).toBeInstanceOf(Object);
            testFramework.expect(performance.rendering.renderer).toBe('canvas');
            
            cleanup();
        });
        
        testFramework.it('should force refresh', () => {
            setup();
            
            const result = module.forceRefresh();
            
            testFramework.expect(result).toBeTruthy();
            
            cleanup();
        });
        
        testFramework.it('should force nodes visible', () => {
            setup();
            
            const result = module.forceNodesVisible();
            
            // Should succeed even with no nodes
            testFramework.expect(result).toBeFalsy(); // Returns false for no nodes
            
            cleanup();
        });
        
        testFramework.it('should test rendering capabilities', () => {
            setup();
            
            const renderTest = module.testRendering();
            
            testFramework.expect(renderTest).toBeInstanceOf(Object);
            testFramework.expect(renderTest.containerAvailable).toBeTruthy();
            testFramework.expect(renderTest.containerDimensions).toBeInstanceOf(Object);
            testFramework.expect(renderTest.containerDimensions.width).toBe(400);
            testFramework.expect(renderTest.containerDimensions.height).toBe(300);
            testFramework.expect(renderTest.cytoscapeInfo).toBeInstanceOf(Object);
            
            cleanup();
        });
        
        testFramework.it('should get comprehensive debug info', () => {
            setup();
            
            const info = module.getDebugInfo();
            
            testFramework.expect(info).toBeInstanceOf(Object);
            testFramework.expect(info.timestamp).toBeTruthy();
            testFramework.expect(info.module).toBeInstanceOf(Object);
            testFramework.expect(info.cytoscape).toBeInstanceOf(Object);
            testFramework.expect(info.cytoscape.available).toBeTruthy();
            testFramework.expect(info.performance).toBeInstanceOf(Object);
            testFramework.expect(info.container).toBeInstanceOf(Object);
            
            cleanup();
        });
        
        testFramework.it('should expose global functions', () => {
            setup();
            
            const functions = module.exposeGlobalFunctions();
            
            testFramework.expect(functions).toBeInstanceOf(Object);
            
            // Check that functions are exposed globally
            testFramework.expect(typeof window.debugContainer).toBe('function');
            testFramework.expect(typeof window.debugNodes).toBe('function');
            testFramework.expect(typeof window.forceNodesVisible).toBe('function');
            testFramework.expect(typeof window.debugPerformance).toBe('function');
            testFramework.expect(typeof window.forceRefresh).toBe('function');
            testFramework.expect(typeof window.testRendering).toBe('function');
            testFramework.expect(typeof window.debugInfo).toBe('function');
            testFramework.expect(typeof window.debugAll).toBe('function');
            
            cleanup();
        });
        
        testFramework.it('should set configuration correctly', () => {
            setup();
            
            const newConfig = {
                debugMode: true,
                logLevel: 'debug',
                enableConsoleLogging: false
            };
            
            module.setConfig(newConfig);
            
            testFramework.expect(module.debugMode).toBeTruthy();
            testFramework.expect(module.logLevel).toBe('debug');
            testFramework.expect(module.config.enableConsoleLogging).toBeFalsy();
            
            cleanup();
        });
        
        testFramework.it('should handle missing Cytoscape instance gracefully', () => {
            const mockDepsNoCy = testFramework.createMockModule({
                cytoscape: null
            });
            
            const moduleNoCy = new DebugToolsModule(mockDepsNoCy);
            
            testFramework.expect(moduleNoCy).toBeInstanceOf(DebugToolsModule);
            
            // Should not crash when calling methods
            const hierarchyResult = moduleNoCy.debugContainerHierarchy();
            testFramework.expect(hierarchyResult).toBeFalsy();
            
            const refreshResult = moduleNoCy.forceRefresh();
            testFramework.expect(refreshResult).toBeFalsy();
            
            const info = moduleNoCy.getDebugInfo();
            testFramework.expect(info.cytoscape.available).toBeFalsy();
            
            moduleNoCy.destroy();
        });
        
        testFramework.it('should maintain log history', () => {
            setup();
            
            // Enable debug mode to see debug logs
            module.setConfig({ debugMode: true, logLevel: 'debug' });
            
            // Generate some log entries
            module.debugContainerHierarchy();
            module.debugNodeVisibility();
            module.debugPerformance();
            
            const info = module.getDebugInfo();
            
            testFramework.expect(info.logHistory).toBeInstanceOf(Array);
            testFramework.expect(info.logHistory.length).toBeGreaterThan(0);
            
            // Check log entry structure
            if (info.logHistory.length > 0) {
                const logEntry = info.logHistory[0];
                testFramework.expect(logEntry.timestamp).toBeTruthy();
                testFramework.expect(logEntry.level).toBeTruthy();
                testFramework.expect(logEntry.message).toBeTruthy();
            }
            
            cleanup();
        });
        
        testFramework.it('should handle test rendering with real DOM elements', () => {
            setup();
            
            const renderTest = module.testRendering();
            
            testFramework.expect(renderTest.testElement).toBeInstanceOf(Object);
            testFramework.expect(renderTest.testElement.created).toBeTruthy();
            
            // Check if test element was actually created
            setTimeout(() => {
                const testElement = document.getElementById('debug-test-element');
                testFramework.expect(testElement).toBeTruthy();
            }, 100);
            
            cleanup();
        });
        
        testFramework.it('should clean up properly on destroy', () => {
            setup();
            
            // Expose global functions
            module.exposeGlobalFunctions();
            testFramework.expect(typeof window.debugContainer).toBe('function');
            
            // Destroy module
            module.destroy();
            
            // Check that global functions are cleaned up
            testFramework.expect(typeof window.debugContainer).toBe('undefined');
            testFramework.expect(module.cy).toBeFalsy();
            testFramework.expect(module.logHistory).toHaveLength(0);
            
            // Don't call cleanup since we've already destroyed
        });
    });
    
    // Performance tests
    testFramework.describe('DebugToolsModule Performance', () => {
        testFramework.it('should execute debug functions quickly', () => {
            const testContainer = document.createElement('div');
            testContainer.style.width = '400px';
            testContainer.style.height = '300px';
            document.body.appendChild(testContainer);
            
            const mockDeps = testFramework.createMockModule({
                cytoscape: {
                    ...testFramework.mockCytoscape,
                    container: () => testContainer
                }
            });
            
            const benchmark = testFramework.benchmarkFunction(() => {
                const module = new DebugToolsModule(mockDeps);
                module.debugContainerHierarchy();
                module.debugNodeVisibility();
                module.debugPerformance();
                module.destroy();
            }, 50);
            
            console.log('Debug tools benchmark:', benchmark);
            
            // Should execute debug functions quickly (less than 5ms average)
            testFramework.expect(benchmark.averageTime).toBeLessThan(5);
            
            document.body.removeChild(testContainer);
        });
    });
}

// Auto-run tests if framework is available
if (typeof window !== 'undefined' && window.GraphTestFramework) {
    console.log('🧪 Running Debug Tools Module Tests...');
    runDebugToolsTests();
} else {
    console.log('📋 Debug Tools tests loaded, waiting for test framework...');
    
    // Try to run when framework becomes available
    let checkCount = 0;
    const checkInterval = setInterval(() => {
        if (window.GraphTestFramework || checkCount > 50) {
            clearInterval(checkInterval);
            if (window.GraphTestFramework) {
                runDebugToolsTests();
            }
        }
        checkCount++;
    }, 100);
}
